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

for (const workers of [4, 5]) {
  test(`${workers}-worker regression handles delayed forms, lazy menus, distinct accounts and reports`, { timeout: 180000 }, () => runBrowserScenarios(workers));
}

async function runBrowserScenarios(workers) {
  const requests = [];
  const sessions = new Map();
  let prematureLogins = 0;
  let rejectedLogins = 0;
  let modalPostbacks = 0;
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
    if (/TESTING9[12]\./.test(url.pathname)) {
      response.writeHead(500);
      response.end('An inactive override was used');
      return;
    }
    const endpoint = /^\/ALiS(ALPHA|BETA)2TESTING(\d+\.\d+\.\d+\.\d+)\/product\/([12])\/Login\.aspx(?:\/dashboard)?$/.exec(url.pathname);
    if (!endpoint) {
      response.writeHead(404);
      response.end('Wrong application or login path');
      return;
    }
    const [, site, version, productId] = endpoint;
    const angular = version.startsWith('11.4.');
    const legacyModal = !angular && site === 'ALPHA';
    const selected = url.searchParams.get('selected') === 'SMOKE';
    if (request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const fields = new URLSearchParams(body);
      const username = fields.get('username');
      if (!/^(ALPHA|BETA)-[12]-url[AB]$/.test(username || '') || fields.get('password') !== 'local-smoke-password') {
        rejectedLogins += 1;
        response.writeHead(401);
        response.end('Invalid login');
        return;
      }
      if ((angular || legacyModal) && fields.get('businessUnit') !== 'SMOKE') {
        prematureLogins += 1;
        response.writeHead(409);
        response.end('Business unit must be selected before login');
        return;
      }
      assert.match(username, new RegExp(`^${site}-${productId}-url[AB]$`), 'The resolved endpoint must use its own product account');
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
      const container = angular ? 'dashboardSidebar' : 'SecureMenu';
      const delayedItem = angular
        ? '<a title="Reports" href="#"><span class="menu-icon">RP</span><span class="menu-text">Reports</span></a>'
        : '<a class="MenuAnchor" href="#">Reports</a>';
      const sidebar = angular
        ? '<aside id="dashboardSidebar" aria-busy="true"><a title="Dashboard" href="#"><span class="menu-icon">DB</span><span class="menu-text">Dashboard</span></a></aside>'
        : '<div id="SecureMenu" aria-busy="true"><a class="MenuAnchor" href="#">Dashboard</a></div>';
      response.end(sidebar + `<script>setTimeout(() => {
        const menu = document.getElementById('${container}');
        menu.insertAdjacentHTML('beforeend', ${JSON.stringify(delayedItem)});
        menu.removeAttribute('aria-busy');
      }, 750);</script>`);
      return;
    }
    const blocked = angular || (legacyModal && !selected);
    if (legacyModal && selected) modalPostbacks += 1;
    response.end(`<form method="post" action="${url.pathname}">
      <label for="username">Login Name</label><input id="username" name="username" ${blocked ? 'disabled readonly' : ''}>
      <label for="password">Password</label><input id="password" name="password" type="password" ${blocked ? 'disabled readonly' : ''}>
      <input name="businessUnit" id="chosenBusinessUnit" type="hidden" value="${selected ? 'SMOKE' : ''}">
      <button id="login" type="submit" ${blocked ? 'disabled' : ''}>Login</button>
      <div id="myModal" style="display:${legacyModal && !selected ? 'block' : 'none'};position:fixed;inset:0;background:white">
        <p>${site === 'ALPHA' ? 'Please choose the Program' : 'Select Business Unit'}</p><select id="ddlBusinessUnits2"><option value="">Choose</option><option value="SMOKE">Smoke Unit</option></select>
        <label><input id="chkMessage" type="checkbox">Accept message</label><button id="btnOk" type="button">OK</button>
      </div>
    </form><script>
      if (${angular}) setTimeout(() => document.getElementById('myModal').style.display = 'block', 2200);
      if (${legacyModal && !selected}) document.getElementById('chkMessage').onchange = () => {
        location.href = ${JSON.stringify(url.pathname + '?selected=SMOKE')};
      };
      document.getElementById('btnOk').onclick = () => {
        if (!document.getElementById('chkMessage').checked || !document.getElementById('ddlBusinessUnits2').value) return;
        document.getElementById('chosenBusinessUnit').value = 'SMOKE';
        for (const input of document.querySelectorAll('#username,#password')) { input.disabled = false; input.readOnly = false; }
        document.getElementById('login').disabled = false;
        document.getElementById('myModal').style.display = 'none';
      };
    </script>`);
  }

  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sidebar-version-browser-'));
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
        testMatch: 'urlScenarios.fixture.js', workers: ${workers}, fullyParallel: true, retries: 0,
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
      throw new Error(`Version browser scenarios failed:\n${error.stdout || ''}\n${error.stderr || ''}`, { cause: error });
    }
    assert.match(run.stdout, /24 passed/);
    assert.match(run.stdout, new RegExp(`using ${workers} workers`));
    assert.doesNotMatch(run.stdout + run.stderr, /report generation failed|report finalization failed/);
    const report = JSON.parse(await fs.readFile(path.join(customDir, 'summary.json'), 'utf8'));
    assert.equal(report.summary.total, 24);
    assert.equal(report.summary.errors, 0);
    assert.equal(report.summary.matched, 4);
    assert.equal(report.summary.differences, 20);
    for (const scenario of ['product', 'site', 'global', 'partial', 'disabled', 'same-version']) {
      assert.equal(report.comparisons.filter((pair) => pair.productName.startsWith(`${scenario} `)).length, 4);
    }
    assert.ok(requests.includes('/ALiSALPHA2TESTING11.3.25.03/product/1/Login.aspx'));
    assert.ok(requests.includes('/ALiSBETA2TESTING11.4.42.01/product/2/Login.aspx'));
    assert.ok(requests.includes('/ALiSALPHA2TESTING11.3.29.02/product/1/Login.aspx'));
    assert.ok(requests.includes('/ALiSBETA2TESTING11.4.42.03/product/2/Login.aspx'));
    assert.ok(requests.includes('/errors/404') && requests.includes('/errors/500'));
    assert.ok(!requests.some((url) => /TESTING9[12]\./.test(url)));
    assert.equal(sessions.size, 48, 'Each of the 24 comparisons must use two separate authenticated sessions');
    assert.equal(prematureLogins, 0, 'A slow business-unit modal must never be bypassed');
    assert.ok(modalPostbacks > 0, 'Legacy modal postbacks must complete without clicking a stale OK button');
    assert.equal(rejectedLogins, 1, 'Invalid credentials must be submitted only once');
    const html = await fs.readFile(path.join(customDir, 'index.html'), 'utf8');
    assert.ok(html.includes(`${origin}/ALiSBETA2TESTING11.3.30.03/product/1/Login.aspx`));
    assert.ok(html.includes(`${origin}/ALiSALPHA2TESTING11.4.41.09/product/1/Login.aspx`));
    for (const pair of report.comparisons) {
      assert.ok(pair.versionA && pair.versionB && pair.versionSourceA && pair.versionSourceB);
      assert.ok(pair.urlA.includes('TESTING' + pair.versionA + '/'));
      assert.ok(pair.urlB.includes('TESTING' + pair.versionB + '/'));
    }
    await fs.access(path.join(customDir, 'sidebar-comparison.xlsx'));
    assert.ok((await fs.readdir(path.join(nativeDir, 'data'))).some((file) => file.endsWith('.zip')), 'A rejected login must retain its manual session trace');
    assert.match(await fs.readFile(path.join(nativeDir, 'index.html'), 'utf8'), /playwrightReportBase64/);
    console.log(`${workers}-worker browser scenarios: 24 passed with delayed business-unit modals, lazy menus, isolated logins, first-failure traces and HTML/Excel/native reports; no test retries.`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
}
