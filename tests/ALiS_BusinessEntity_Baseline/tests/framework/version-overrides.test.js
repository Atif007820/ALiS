import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import ExcelJS from 'exceljs';
import {
  urlProfiles, resolveEnvironment, resolveVersionedLoginUrl, validateGlobalVersionOverride,
} from '../../config/urls.js';
import { businessUnits } from '../../config/BusinessUnit.js';
import runSettings from '../../config/runSettings.json' with { type: 'json' };
import { Reporter } from '../../core/Reporter.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const exec = promisify(execFile);
const override = (version = '11.4.42.03') => ({ enabled: true, version });

test('omitted and disabled global overrides retain every saved URL exactly', () => {
  for (const [urlKey, profile] of Object.entries(urlProfiles)) {
    for (const settings of [{}, { globalVersionOverride: { enabled: false, version: 'unused' } }]) {
      const environment = resolveEnvironment({ urlKey, settings });
      assert.equal(environment.loginUrl, profile.loginUrl);
      assert.equal(environment.configuredLoginUrl, profile.loginUrl);
      assert.equal(environment.versionSource, 'ORIGINAL');
    }
  }
});

for (const version of ['11.4.42', '11.4.42.03', '11.3.25.03', '12.1.5.0.2']) {
  test(`global version ${version} resolves every site and BU without changing saved profiles`, () => {
    const original = JSON.stringify(urlProfiles);
    for (const unit of Object.values(businessUnits)) {
      const environment = resolveEnvironment({ urlKey: unit.urlKey, settings: { globalVersionOverride: override(version) } });
      const saved = urlProfiles[unit.urlKey].loginUrl;
      const originalEnvironment = resolveEnvironment({ urlKey: unit.urlKey, settings: {} });
      if (!originalEnvironment.urlVersion) {
        assert.equal(environment.loginUrl, saved);
        assert.equal(environment.versionSource, 'NOT VERSIONED');
        continue;
      }
      const expected = new URL(saved);
      expected.pathname = expected.pathname.split('/').map((segment) => (
        /^ALiS/i.test(segment) && segment.endsWith(originalEnvironment.urlVersion)
          ? segment.slice(0, -originalEnvironment.urlVersion.length) + version : segment
      )).join('/');
      assert.equal(environment.loginUrl, expected.href);
      assert.equal(environment.urlVersion, version);
      assert.equal(environment.versionSource, 'GLOBAL OVERRIDE');
      assert.equal(new URL(environment.loginUrl).host, new URL(saved).host);
    }
    assert.equal(JSON.stringify(urlProfiles), original);
  });
}

test('only the application folder changes; unrelated versions and URL components survive', () => {
  const url = 'https://172.16.3.2:9443/tenant11.2.3/ALiSNJDOH2TESTING11.3.25.03/Login11.8.9.aspx?version=99.8.7#12.3.4';
  const result = resolveVersionedLoginUrl(url, override(' 11.4.42.01 '));
  assert.equal(result.loginUrl, url.replace('ALiSNJDOH2TESTING11.3.25.03', 'ALiSNJDOH2TESTING11.4.42.01'));
  assert.equal(result.urlVersion, '11.4.42.01');
});

test('non-versioned portals are not guessed or rewritten', () => {
  for (const url of ['https://portal.test/ALiSINVPROD/LoginCMS.aspx', 'http://172.16.3.2/Login.aspx?version=11.4.42']) {
    const result = resolveVersionedLoginUrl(url, override());
    assert.equal(result.loginUrl, url);
    assert.equal(result.versionSource, 'NOT VERSIONED');
    assert.equal(result.urlVersion, '');
  }
});

test('an explicit command-line URL takes precedence without applying the global version', () => {
  const loginUrlOverride = 'https://server.test/ALiSNJ11.3.25.03/LoginNJ.aspx?test=1#login';
  const result = resolveEnvironment({ urlKey: 'NJ', loginUrlOverride, settings: { globalVersionOverride: override() } });
  assert.equal(result.loginUrl, loginUrlOverride);
  assert.equal(result.configuredLoginUrl, urlProfiles.NJ.loginUrl);
  assert.equal(result.urlVersion, '11.3.25.03');
  assert.equal(result.versionSource, 'COMMAND LINE');
});

for (const [label, value] of [
  ['null', null], ['array', []], ['boolean', true],
  ['string switch', { enabled: 'true', version: '11.4.42' }],
  ['blank', override(' ')], ['number', override(11.4)], ['two parts', override('11.4')],
  ['URL', override('https://server/11.4.42')], ['suffix', override('11.4.42-beta')],
  ['path traversal', override('../11.4.42')], ['unsafe numeric part', override('99999999999999999999.4.42')],
]) {
  test(`invalid global override (${label}) fails clearly before URL use`, () => {
    assert.throws(() => resolveEnvironment({ urlKey: 'NJ', settings: { globalVersionOverride: value } }), /globalVersionOverride/);
  });
}

test('unsafe URLs and ambiguous application paths fail instead of navigating elsewhere', () => {
  for (const url of ['file:///local/ALiS11.4.42/Login', 'javascript:alert(1)', 'http://user:secret@server/ALiS11.4.42/Login', 'not a URL']) {
    assert.throws(() => resolveVersionedLoginUrl(url, override()), /HTTP\(S\) URL without embedded credentials/);
  }
  assert.throws(() => resolveVersionedLoginUrl('http://server/ALiS11.4.42/ALiSNJ11.3.25.03/Login', override()), /multiple versioned ALiS/);
  assert.throws(() => resolveEnvironment({ urlKey: 'UNKNOWN' }), /Unknown URL key/);
  assert.deepEqual(validateGlobalVersionOverride(), { enabled: false });
});

test('all-flow/all-BU/all-browser parallel preview uses the same resolved URLs without writing reports', { timeout: 60000 }, async () => {
  const summary = path.join(root, 'test-results', 'latest-run', 'latest-run-summary.json');
  const before = await fs.readFile(summary, 'utf8').catch(() => null);
  const { stdout } = await exec(process.execPath, ['scripts/run.js', '--flow=all', '--bu=all', '--url=all', '--tc=all', '--project=all', '--parallel=3', '--dry-run'], {
    cwd: root, timeout: 45000, maxBuffer: 2 * 1024 * 1024,
  });
  const rows = stdout.split('\n').filter((line) => /^- \w+ \|/.test(line));
  assert.equal(rows.length, Object.keys(businessUnits).length * 4 * 3);
  for (const row of rows) {
    const unit = row.match(/^- (\w+) \|/)[1].toUpperCase();
    const environment = resolveEnvironment({ urlKey: businessUnits[unit].urlKey, settings: runSettings });
    assert.ok(row.includes(environment.loginUrl));
    assert.ok(row.includes(`Version: ${environment.urlVersion}`));
    assert.ok(row.includes(`Source: ${environment.versionSource}`));
  }
  assert.match(stdout, /Workers: 3/);
  assert.equal(await fs.readFile(summary, 'utf8').catch(() => null), before);
});

test('raw --url and --login-url previews preserve explicit destinations', { timeout: 60000 }, async () => {
  const explicit = 'http://explicit.test/ALiSNVRCP11.3.25.03/LoginRadiation.aspx';
  for (const urlArgs of [[`--url=${explicit}`], ['--url=NVRCP', `--login-url=${explicit}`]]) {
    const { stdout } = await exec(process.execPath, ['scripts/run.js', '--flow=all', '--bu=RPM', '--tc=TC01', '--project=chromium', ...urlArgs, '--dry-run'], {
      cwd: root, timeout: 25000, maxBuffer: 1024 * 1024,
    });
    assert.equal(stdout.split('\n').filter((line) => line.startsWith('- RPM |') && line.includes(explicit) && line.includes('Source: COMMAND LINE')).length, 4);
  }
});

test('local browser smoke reaches original and globally overridden login paths for every site', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const enabled of [false, true]) {
      for (const [urlKey, profile] of Object.entries(urlProfiles)) {
        const localProfile = profile.loginUrl.replace(new URL(profile.loginUrl).origin, 'http://version.test');
        const environment = resolveVersionedLoginUrl(localProfile, { enabled, version: '12.1.5.03' });
        const page = await browser.newPage();
        try {
          let requested = '';
          await page.route('http://version.test/**', (route) => {
            requested = route.request().url();
            return route.fulfill({ contentType: 'text/html', body: `<title>${urlKey}</title><label>Login Name<input name="username"></label>` });
          });
          await page.goto(environment.loginUrl, { waitUntil: 'domcontentloaded' });
          assert.equal(requested, environment.loginUrl);
          assert.equal(page.url(), environment.loginUrl);
          await page.getByLabel('Login Name').fill('local-version-smoke');
          assert.equal(await page.getByLabel('Login Name').inputValue(), 'local-version-smoke');
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
});

test('HTML, Excel and JSON reports expose the effective deployment version and source', { timeout: 30000 }, async () => {
  const outputRoot = path.join(root, 'test-results');
  await fs.mkdir(outputRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(outputRoot, 'version-report-'));
  try {
    const environment = resolveEnvironment({ urlKey: 'NJ', settings: { globalVersionOverride: override() } });
    const report = await new Reporter({ reportDir: directory }).write({ results: [], context: {
      environment, businessUnit: { id: 'BB', name: 'Blood Bank' }, browserProject: { id: 'chromium', name: 'Chromium' },
      flow: '4', entityName: 'local fixture', timings: { totalMs: 0 },
    } });
    const html = await fs.readFile(report.htmlReportPath, 'utf8');
    assert.ok(html.includes(environment.loginUrl));
    assert.match(html, /URL Version<\/div><div>11\.4\.42\.03/);
    assert.match(html, /GLOBAL OVERRIDE/);
    const json = JSON.parse(await fs.readFile(report.jsonPath, 'utf8'));
    assert.deepEqual(json.context.environment, environment);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(report.excelPath);
    const metadata = new Map();
    workbook.worksheets[0].eachRow((row) => metadata.set(row.getCell(1).value, row.getCell(2).value));
    assert.equal(metadata.get('URL Version'), environment.urlVersion);
    assert.equal(metadata.get('Version Source'), environment.versionSource);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
