import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { reportOpenOptions, shouldOpenHtml } from '../consolidatedReporter.js';

const require = createRequire(import.meta.url);
const unzipper = createRequire(require.resolve('exceljs'))('unzipper');
const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);

for (const attachReports of [true, false]) {
  test(`native report respects attachReports=${attachReports} and retains results and steps`, async () => {
    await verifyReports(attachReports);
  });
}

async function verifyReports(attachReports) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sidebar-report-test-'));
  const nativeDir = path.join(temp, 'playwright-report');
  const customDir = path.join(temp, 'comparison-report');
  const configFile = path.join(temp, 'config.mjs');
  const config = {
    testDir: path.join(root, 'reporters', 'tests'),
    testMatch: 'reporting.fixture.js', workers: 2, fullyParallel: true, retries: 1,
    outputDir: path.join(temp, 'test-results'),
    metadata: { attachReports },
  };
  const reporterOptions = {
    reportDir: customDir, nativeReportDir: nativeDir,
    settings: { openHtmlReport: false, openExcelReport: false, attachReports },
  };
  await fs.writeFile(configFile, `
    import base from ${JSON.stringify(pathToFileURL(path.join(root, 'playwright.config.js')).href)};
    export default {
      ...base, ...${JSON.stringify(config)}, projects: [{ name: 'report-verification' }],
      reporter: base.reporter.map(([name, options]) => {
        if (name.includes('consolidatedReporter')) return [${JSON.stringify(path.join(root, 'reporters', 'consolidatedReporter.js'))}, ${JSON.stringify(reporterOptions)}];
        if (name === 'html') return [name, { ...options, outputFolder: ${JSON.stringify(nativeDir)} }];
        if (name === 'json') return [name, { outputFile: ${JSON.stringify(path.join(temp, 'results.json'))} }];
        return [name, options];
      }),
    };
  `);
  const env = { ...process.env, CI: '1', PLAYWRIGHT_HTML_OPEN: 'never' };
  delete env.SIDEBAR_LIST;
  delete env.PLAYWRIGHT_HTML_OUTPUT_DIR;
  delete env.PLAYWRIGHT_HTML_REPORT;
  delete env.PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL;
  try {
    let run;
    try {
      run = await exec(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', configFile], {
        cwd: root, env, timeout: 60000, maxBuffer: 2 * 1024 * 1024,
      });
      assert.fail('The deliberate runtime failure must fail this verification run.');
    } catch (error) {
      assert.equal(error.code, 1, error.stderr || error.message);
      run = error;
    }
    assert.doesNotMatch(run.stdout + run.stderr, /report generation failed|report finalization failed/);
    const summary = JSON.parse(await fs.readFile(path.join(customDir, 'summary.json'), 'utf8'));
    assert.deepEqual(summary.summary, {
      total: 5, matched: 2, differences: 1, errors: 1, skipped: 1, notRun: 0,
      missing: 0, iconMismatch: 1, extra: 0,
    });
    await fs.access(path.join(customDir, 'index.html'));
    await fs.access(path.join(customDir, 'sidebar-comparison.xlsx'));
    const index = await fs.readFile(path.join(nativeDir, 'index.html'), 'utf8');
    const embedded = index.match(/<template id="playwrightReportBase64">data:application\/zip;base64,([^<]+)<\/template>/);
    assert.ok(embedded, 'Expected the actual Playwright HTML report');
    const zip = await unzipper.Open.buffer(Buffer.from(embedded[1], 'base64'));
    const fileReports = await Promise.all(zip.files.filter((file) => file.path.endsWith('.json') && file.path !== 'report.json')
      .map(async (file) => JSON.parse((await file.buffer()).toString())));
    const tests = fileReports.flatMap((file) => file.tests);
    assert.equal(tests.length, 5);
    let resultCount = 0;
    for (const item of tests) {
      for (const result of item.results) {
        resultCount++;
        const html = result.attachments.find((attachment) => attachment.name === 'HTML Comparison Report');
        const excel = result.attachments.find((attachment) => attachment.name === 'Excel Comparison Report');
        if (result.status !== 'skipped') {
          assert.ok(result.steps.some((step) => step.title === 'Capture a local comparison result'));
          assert.ok(result.attachments.some((attachment) => attachment.name === 'Diagnostic note'));
          assert.equal(result.attachments.some((attachment) => attachment.name === 'Sidebar Comparison Text Report'), attachReports);
          assert.equal(result.attachments.some((attachment) => attachment.name === 'sidebar-comparison-result'), attachReports);
        }
        if (!attachReports) {
          assert.equal(html, undefined);
          assert.equal(excel, undefined);
          continue;
        }
        assert.ok(html?.path && excel?.path, `Missing report links for ${item.title}`);
        const htmlFile = path.join(nativeDir, html.path);
        const htmlContents = await fs.readFile(htmlFile, 'utf8');
        const originalHtml = await fs.readFile(path.join(customDir, 'index.html'), 'utf8');
        assert.equal(htmlContents, originalHtml);
        assert.match(htmlContents, /SITE-A/);
        assert.match(htmlContents, /SITE-B/);
        const download = htmlContents.match(/class="download" href="([^"]+)"/)[1];
        const workbook = await fs.readFile(path.join(nativeDir, excel.path));
        assert.deepEqual(await fs.readFile(path.resolve(path.dirname(htmlFile), decodeURIComponent(download))), workbook);
      }
    }
    assert.equal(resultCount, 7, 'Final and retry attempts must all respect the attachment setting');
    if (!attachReports) {
      const dataFiles = await fs.readdir(path.join(nativeDir, 'data')).catch((error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      });
      assert.ok(!dataFiles.some((name) => /\.(html|xlsx)$/.test(name)), 'Disabled reports must not be copied into native attachments');
    }

    const originalSummary = await fs.readFile(path.join(customDir, 'summary.json'), 'utf8');
    await exec(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', configFile, '--list'], {
      cwd: root, env, timeout: 30000,
    });
    assert.equal(await fs.readFile(path.join(customDir, 'summary.json'), 'utf8'), originalSummary);
    assert.ok(await fs.readFile(path.join(nativeDir, 'index.html'), 'utf8') === index, '--list must preserve the last native report');
  } finally {
    // Only the unique temporary directory created by this test is removed.
    await fs.rm(temp, { recursive: true, force: true });
  }
}

test('auto-open preference handles passed and failed local runs without duplicates', () => {
  const ci = process.env.CI;
  delete process.env.CI;
  try {
    assert.equal(shouldOpenHtml({ openHtmlReport: true }, 'passed'), true);
    assert.equal(shouldOpenHtml({ openHtmlReport: true }, 'failed'), true);
    assert.equal(shouldOpenHtml({ openHtmlReport: true }, 'passed', 'never'), false);
    assert.equal(shouldOpenHtml({ openHtmlReport: false }, 'passed', 'always'), true);
    assert.equal(shouldOpenHtml({ openHtmlReport: true }, 'passed', 'on-failure'), false);
    assert.equal(shouldOpenHtml({ openHtmlReport: true }, 'failed', 'on-failure'), true);
    for (const status of ['passed', 'failed']) {
      assert.deepEqual(reportOpenOptions({ openHtmlReport: true }, status), {
        playwright: true, comparison: true, excel: false,
      });
      assert.deepEqual(reportOpenOptions({ openHtmlReport: false }, status), {
        playwright: true, comparison: false, excel: false,
      });
      assert.deepEqual(reportOpenOptions({ openHtmlReport: true, openPlaywrightReport: false }, status), {
        playwright: false, comparison: true, excel: false,
      });
      assert.deepEqual(reportOpenOptions({ openHtmlReport: true }, status, 'never'), {
        playwright: false, comparison: false, excel: false,
      });
    }
    assert.equal(reportOpenOptions({ openHtmlReport: false }, 'passed', 'always').comparison, false);
    process.env.CI = '1';
    assert.equal(shouldOpenHtml({ openHtmlReport: true }, 'failed', 'always'), false);
    assert.deepEqual(reportOpenOptions({ openHtmlReport: true, openExcelReport: true }, 'failed', 'always'), {
      playwright: false, comparison: false, excel: false,
    });
  } finally {
    if (ci === undefined) delete process.env.CI;
    else process.env.CI = ci;
  }
});
