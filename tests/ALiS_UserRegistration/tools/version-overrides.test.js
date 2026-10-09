import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { chromium } from '@playwright/test';
import {
  environments, resolveLoginUrl, resolveLoginUrlDetails, resolveVersionedLoginUrl, versionFromUrl,
} from '../config/urls.js';
import { siteRegistry } from '../registry/siteRegistry.js';
import { resolveRunMatrix, isProductAvailableForSite, versionFromUrl as helperVersion } from '../utils/helpers.js';
import { addRegistrationAnnotations } from '../utils/annotations.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const override = (version) => ({ enabled: true, version });
const settingsFor = (testVersion, prodVersion) => ({
  environmentVersionOverrides: { TEST: override(testVersion), PROD: override(prodVersion) },
});

test('omitted and disabled overrides preserve every configured site URL', () => {
  for (const [environmentKey, environment] of Object.entries(environments)) {
    for (const [site, url] of Object.entries(environment.urls)) {
      assert.equal(resolveLoginUrl(environmentKey, site, { settings: {} }), url);
      const settings = { environmentVersionOverrides: { [environmentKey]: { enabled: false, version: 'unused value' } } };
      assert.equal(resolveLoginUrl(environmentKey, site, { settings }), url);
    }
  }
});

for (const [testVersion, prodVersion] of [
  ['11.4.42', '11.3.25.03'],
  ['11.4.42.01', '11.3.25.03'],
  ['11.4.41.09', '11.2.25.03'],
  ['12.1.5.0.2', '12.2.0'],
]) {
  test(`independent TEST=${testVersion} and PROD=${prodVersion} overrides apply across all sites`, () => {
    const settings = settingsFor(testVersion, prodVersion);
    const original = structuredClone(environments);
    for (const environmentKey of ['TEST', 'PROD']) {
      const version = environmentKey === 'TEST' ? testVersion : prodVersion;
      for (const [site, saved] of Object.entries(environments[environmentKey].urls)) {
        const result = resolveLoginUrlDetails(environmentKey, site, { settings });
        assert.equal(result.configuredLoginUrl, saved);
        const savedVersion = versionFromUrl(saved);
        assert.equal(result.urlVersion, savedVersion ? version : '');
        assert.equal(result.versionSource, savedVersion ? 'OVERRIDE' : 'NOT VERSIONED');
        assert.equal(result.loginUrl, savedVersion ? saved.replace(savedVersion, version) : saved);
        assert.equal(new URL(result.loginUrl).host, new URL(saved).host);
        assert.equal(new URL(result.loginUrl).protocol, new URL(saved).protocol);
      }
    }
    assert.deepEqual(environments, original, 'Version resolution must not mutate the saved URL catalog');
  });
}

test('version parsing ignores IP addresses, ports, filenames, query strings and fragments', () => {
  const url = 'https://172.16.3.2:9443/tenant/ALiSNJDOH2TESTING11.3.25.03/Login11.8.9.aspx?version=99.8.7#12.3.4';
  assert.equal(versionFromUrl(url), '11.3.25.03');
  assert.equal(helperVersion(url), '11.3.25.03');
  const result = resolveVersionedLoginUrl(url, override(' 11.4.42.01 '));
  assert.equal(result.loginUrl, 'https://172.16.3.2:9443/tenant/ALiSNJDOH2TESTING11.4.42.01/Login11.8.9.aspx?version=99.8.7#12.3.4');
  for (const input of ['http://172.16.3.2/Login.aspx?version=11.4.42', '', '11.4.42', 'not a URL']) {
    assert.equal(versionFromUrl(input), '');
  }
});

test('non-versioned portals stay unchanged and missing mappings stay unavailable', () => {
  const settings = settingsFor('11.4.42.01', '11.4.42');
  const result = resolveLoginUrlDetails('PROD', 'CONV', { settings });
  assert.equal(result.loginUrl, environments.PROD.urls.CONV);
  assert.equal(result.versionSource, 'NOT VERSIONED');
  assert.equal(siteRegistry.resolve('TXFSC', 'PROD', { settings }), null);
  assert.equal(resolveLoginUrlDetails('PROD', 'CRANES', { settings }).versionSource, 'UNCONFIGURED');
  for (const [site, url] of Object.entries(environments.UAT.urls)) {
    assert.equal(resolveLoginUrl('UAT', site, { settings }), url);
    const futureUatSettings = { environmentVersionOverrides: { UAT: override('12.1.0') } };
    assert.equal(resolveLoginUrl('UAT', site, { settings: futureUatSettings }), url);
  }
});

test('minimum-version product gating follows the effective version rather than saved URLs', () => {
  for (const [environment, version, expected] of [
    ['PROD', '11.3.25.03', ['CL', 'BB']],
    ['PROD', '11.4.42.01', ['CL', 'BB', 'HMB', 'ESF']],
    ['TEST', '11.4.37', ['CL', 'BB']],
    ['TEST', '11.4.38', ['CL', 'BB', 'HMB', 'ESF']],
  ]) {
    const settings = { environmentVersionOverrides: { [environment]: override(version) } };
    const site = siteRegistry.resolve('NJ', environment, { settings });
    assert.deepEqual(site.products.filter((p) => isProductAvailableForSite(p, site)).map((p) => p.key), expected);
  }
});

test('combined environment run matrices resolve versions independently for every generated product', () => {
  const names = ['REGISTER_ENVIRONMENTS', 'REGISTER_SITES', 'REGISTER_PRODUCTS', 'REGISTER_TARGETS'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.REGISTER_ENVIRONMENTS = 'TEST,PROD';
    process.env.REGISTER_SITES = 'ALL';
    process.env.REGISTER_PRODUCTS = 'ALL';
    delete process.env.REGISTER_TARGETS;
    const settings = settingsFor('11.4.42.01', '11.3.25.03');
    const registry = { ...siteRegistry, resolve: (site, env) => siteRegistry.resolve(site, env, { settings }) };
    const combinations = resolveRunMatrix(registry);
    assert.ok(combinations.some((c) => c.environment.key === 'TEST' && c.site.key === 'TXFSC'));
    assert.ok(!combinations.some((c) => c.environment.key === 'PROD' && ['TXFSC', 'CRANES'].includes(c.site.key)));
    for (const { environment, site } of combinations) {
      if (site.versionSource === 'NOT VERSIONED') continue;
      assert.equal(site.urlVersion, environment.key === 'TEST' ? '11.4.42.01' : '11.3.25.03');
      assert.equal(site.versionSource, 'OVERRIDE');
    }
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('resolved metadata reaches annotations and generated registration identity', () => {
  const site = siteRegistry.resolve('NJ', 'TEST', { settings: settingsFor('11.4.42.01', '11.3.25.03') });
  const product = site.products[0];
  const testInfo = { annotations: [] };
  addRegistrationAnnotations(testInfo, { site, product });
  const values = Object.fromEntries(testInfo.annotations.map((a) => [a.type, a.description]));
  assert.equal(values['Login URL'], site.loginUrl);
  assert.equal(values['Configured Login URL'], environments.TEST.urls.NJ);
  assert.equal(values['URL Version'], '11.4.42.01');
  assert.equal(values['Version Source'], 'OVERRIDE');
  assert.equal(siteRegistry.createStrategy(site, {}).buildUser(product).loginUrl, site.loginUrl);
});

for (const [name, value, pattern] of [
  ['wrong block type', [], /must be an object/],
  ['null block', null, /must be an object/],
  ['string switch', { enabled: 'true', version: '11.4.42' }, /enabled must be true or false/],
  ['blank version', override(' '), /version must be a dotted numeric/],
  ['number version', override(11.4), /version must be a dotted numeric/],
  ['two parts', override('11.4'), /version must be a dotted numeric/],
  ['URL as version', override('https://server/11.4.42'), /version must be a dotted numeric/],
  ['suffix', override('11.4.42-beta'), /version must be a dotted numeric/],
  ['path traversal', override('../11.4.42'), /version must be a dotted numeric/],
  ['unsafe number', override('99999999999999999999.4.42'), /version must be a dotted numeric/],
]) {
  test(`invalid ${name} fails with the environment setting location`, () => {
    assert.throws(() => resolveLoginUrl('TEST', 'NJ', {
      settings: { environmentVersionOverrides: { TEST: value } },
    }), (error) => {
      assert.match(error.message, /environmentVersionOverrides.TEST/);
      assert.match(error.message, pattern);
      return true;
    });
  });
}

test('unknown environment keys and ambiguous URLs produce clear errors', () => {
  assert.throws(() => resolveLoginUrl('TEST', 'NJ', {
    settings: { environmentVersionOverrides: { TEEST: override('11.4.42') } },
  }), /unknown environment key.*TEEST/);
  assert.throws(() => resolveLoginUrl('TEST', 'NJ', { settings: { environmentVersionOverrides: [] } }), /must be an object keyed by environment/);
  assert.throws(() => resolveVersionedLoginUrl('http://server/app11.4.42/other12.3.0/Login.aspx', override('11.4.43')), /multiple versioned path segments/);
  for (const url of ['/Login.aspx', 'file:///app11.4.42/Login.aspx', 'http://user:password@server/app11.4.42/Login.aspx']) {
    assert.throws(() => resolveVersionedLoginUrl(url, override('11.4.43')), /HTTP\(S\) URL without embedded credentials/);
  }
});

test('local browser smoke reaches the resolved application path for both environments and versions', async (t) => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', (route) => route.fulfill({
    contentType: 'text/html', body: '<label>Login Name<input></label><label>Password<input type="password"></label>',
  }));
  for (const version of ['11.4.42', '11.4.42.01', '11.3.25.03', '12.1.5.0.2']) {
    for (const env of ['TEST', 'PROD']) {
      const site = siteRegistry.resolve('NJ', env, {
        settings: { environmentVersionOverrides: { [env]: override(version) } },
      });
      await page.goto(site.loginUrl, { waitUntil: 'domcontentloaded' });
      assert.equal(page.url(), site.loginUrl);
      await page.getByLabel('Login Name').fill('local_version_smoke');
      assert.equal(await page.getByLabel('Login Name').inputValue(), 'local_version_smoke');
    }
  }
});

test('--list previews resolved URLs and preserves existing registration artifacts', async () => {
  const artifact = path.join(root, 'test-results', 'latest-registration-report.json');
  const before = await fs.readFile(artifact, 'utf8').catch(() => null);
  const { stdout } = await exec(process.execPath, [path.join(root, 'tools', 'register.js'), '--env', 'TEST,PROD', '--site', 'NJ,CONV', '--product', 'ALL', '--list'], {
    cwd: root, timeout: 45000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, REGISTER_TARGETS: '' },
  });
  const previewSite = siteRegistry.resolve('NJ', 'TEST');
  assert.ok(stdout.includes(`TEST:NJ [${previewSite.versionSource}] Version:`));
  assert.match(stdout, /PROD:CONV \[NOT VERSIONED\]/);
  assert.match(stdout, /Configured URL:/);
  assert.match(stdout, /Effective URL:/);
  assert.doesNotMatch(stdout, /Registration .*Login Name|Credentials saved/);
  assert.equal(await fs.readFile(artifact, 'utf8').catch(() => null), before);
});
