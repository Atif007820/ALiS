import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const exec = promisify(execFile);

test('browser regression covers all URL modes, distinct accounts, mixed sidebars and reports', { timeout: 180000 }, async () => {
  const requests = [];
  const sessions = new Map();
  const server = createServer((request, response) => {
    void serve(request, response).catch((error) => {
      response.writeHead(500, { 'Content-Type': 'text/plain' });
      response.end(error.message);
    });
  });
  async function serve(request, response) {
    const url = new URL(request.url, 'http://localhost');
    requests.push(url.pathname);
    if (url.pathname.startsWith('/errors/')) {
      response.writeHead(Number(url.pathname.split('/').pop()), { 'Content-Type': 'text/plain' });
      response.end('Deliberately unavailable smoke page');
      return;
    }
    if (url.pathname.includes('/unused/')) {
      response.writeHead(500);
      response.end('An inactive override was used');
      return;
    }
    if (request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const fields = new URLSearchParams(body);
      const username = fields.get('username');
      if (!/^(ALPHA|BETA)-[12]-url[AB]$/.test(username || '') || fields.get('password') !== 'local-smoke-password') {
        response.writeHead(401);
        response.end('Invalid login');
        return;
      }
      if (url.pathname.startsWith('/product/')) {
        const [, , site, id, login] = url.pathname.split('/');
        assert.equal(username, `${site}-${id}-url${login.endsWith('B') ? 'B' : 'A'}`);
      }
      const token = String(sessions.size + 1);
      sessions.set(token, username);
      response.writeHead(303, { Location: `${url.pathname}/dashboard`, 'Set-Cookie': `smoke=${token}; Path=/; HttpOnly` });
      response.end();
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    if (url.pathname.endsWith('/dashboard')) {
      const token = request.headers.cookie?.match(/smoke=(\d+)/)?.[1];
      if (!sessions.has(token)) {
        response.writeHead(401);
        response.end('Invalid login');
        return;
      }
      const angular = url.pathname.includes('LoginB/dashboard');
      response.end(angular
        ? '<aside id="dashboardSidebar"><a title="Dashboard" href="#"><span class="menu-icon">DB</span><span class="menu-text">Dashboard</span></a></aside>'
        : '<div id="SecureMenu"><a class="MenuAnchor" href="#">Dashboard</a></div>');
      return;
    }
    response.end(`<form method="post" action="${url.pathname}"><label for="username">Login Name</label><input id="username" name="username"><label for="password">Password</label><input id="password" name="password" type="password"><button type="submit">Login</button></form>`);
  }

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sidebar-url-browser-'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const configFile = path.join(temp, 'playwright.config.mjs');
  const customDir = path.join(temp, 'comparison-report');
  const nativeDir = path.join(temp, 'playwright-report');
  try {
    await fs.writeFile(configFile, `
      import base from ${JSON.stringify(pathToFileURL(path.join(root, 'playwright.config.js')).href)};
      export default {
        ...base, testDir: ${JSON.stringify(path.join(root, 'config', 'tests'))},
        testMatch: 'urlScenarios.fixture.js', workers: 3, fullyParallel: true, retries: 0,
        outputDir: ${JSON.stringify(path.join(temp, 'test-results'))},
        use: { ...base.use, headless: true, video: 'off' },
        reporter: [
          ['list'],
          [${JSON.stringify(path.join(root, 'reporters', 'consolidatedReporter.js'))}, {
            reportDir: ${JSON.stringify(customDir)}, nativeReportDir: ${JSON.stringify(nativeDir)},
            settings: { openHtmlReport: false, openPlaywrightReport: false, attachReports: true },
          }],
          ['html', { outputFolder: ${JSON.stringify(nativeDir)}, open: 'never' }],
        ],
      };
    `);
    const env = { ...process.env, CI: '1', PLAYWRIGHT_HTML_OPEN: 'never', SIDEBAR_SMOKE_ORIGIN: origin };
    delete env.SIDEBAR_LIST;
    delete env.PLAYWRIGHT_HTML_OUTPUT_DIR;
    delete env.PLAYWRIGHT_HTML_REPORT;
    delete env.PLAYWRIGHT_HTML_ATTACHMENTS_BASE_URL;
    let run;
    try {
      run = await exec(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', configFile], {
        cwd: root, env, timeout: 150000, maxBuffer: 4 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(`URL browser scenarios failed:\n${error.stdout || ''}\n${error.stderr || ''}`, { cause: error });
    }
    assert.match(run.stdout, /24 passed/);
    assert.doesNotMatch(run.stdout + run.stderr, /report generation failed|report finalization failed/);
    const report = JSON.parse(await fs.readFile(path.join(customDir, 'summary.json'), 'utf8'));
    assert.equal(report.summary.total, 24);
    assert.equal(report.summary.errors, 0);
    assert.equal(report.summary.matched, 4);
    assert.equal(report.summary.differences, 20);
    for (const scenario of ['product', 'site', 'global', 'partial', 'disabled', 'same-url']) {
      assert.equal(report.comparisons.filter((pair) => pair.productName.startsWith(`${scenario} `)).length, 4);
    }
    assert.ok(requests.some((url) => url.startsWith('/product/ALPHA/1/LoginA')));
    assert.ok(requests.some((url) => url.startsWith('/product/BETA/2/LoginB')));
    assert.ok(requests.some((url) => url.startsWith('/site/LoginA')));
    assert.ok(requests.some((url) => url.startsWith('/global/LoginB')));
    assert.ok(requests.includes('/errors/404') && requests.includes('/errors/500'));
    assert.ok(!requests.some((url) => url.includes('/unused/')));
    assert.equal(sessions.size, 48, 'Each of the 24 comparisons must use two separate authenticated sessions');
    const html = await fs.readFile(path.join(customDir, 'index.html'), 'utf8');
    assert.ok(html.includes(`${origin}/global/LoginA`));
    assert.ok(html.includes(`${origin}/site/LoginB`));
    await fs.access(path.join(customDir, 'sidebar-comparison.xlsx'));
    assert.match(await fs.readFile(path.join(nativeDir, 'index.html'), 'utf8'), /playwrightReportBase64/);
    console.log('Browser scenarios: 24 passed (product, site, global, partial, disabled, same-URL); HTTP 404/500 diagnostics verified.');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
});
