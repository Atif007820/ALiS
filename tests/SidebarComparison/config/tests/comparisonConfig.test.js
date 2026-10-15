import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { getComparisonPairs, loadSites } from '../comparisonConfig.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const originalVersions = { urlA: '11.3.25.03', urlB: '11.4.42.01' };
const shared = { enabled: true, versionA: '11.3.30.03', versionB: '11.4.42.03' };
const siteVersions = { enabled: true, versionA: '11.3.29.02', versionB: '11.4.41.09' };
const versionKey = (side) => side === 'urlA' ? 'versionA' : 'versionB';
const productUrl = (site, id, side, version = originalVersions[side]) => (
  'https://' + site.toLowerCase() + '.test/ALiS' + site + '2TESTING' + version + '/product/' + id + '/' + side
);

function configurations() {
  return ['ALPHA', 'BETA'].map((site) => ({
    site, configFile: 'config/sites/' + site + '.js',
    login: { loginButton: 'Sign in' },
    products: [1, 2, 3].map((id) => ({
      id, name: site + ' product ' + id, enabled: id !== 3,
      ...Object.fromEntries(['urlA', 'urlB'].map((side) => [side, {
        loginUrl: productUrl(site, id, side),
        username: site + '-' + id + '-' + side, password: 'password-' + id + '-' + side,
        label: site + ' ' + id + ' ' + side, login: { passwordField: 'Account password' },
      }])),
    })),
  }));
}

function pairs(options = {}) {
  return getComparisonPairs({ sites: 'ALL', products: 'ALL', env: {}, settings: {}, configurations: configurations(), ...options });
}

test('product mode retains original URLs, versions, credentials and login settings', () => {
  const original = configurations();
  const resolved = pairs({ configurations: original });
  assert.equal(resolved.length, 4);
  for (const pair of resolved) {
    const product = original.find((site) => site.site === pair.site).products.find((p) => p.id === pair.id);
    for (const side of ['urlA', 'urlB']) {
      assert.equal(pair[side].versionSource, 'PRODUCT');
      assert.equal(pair[side].version, originalVersions[side]);
      for (const key of ['loginUrl', 'username', 'password', 'label']) assert.equal(pair[side][key], product[side][key]);
      assert.equal(pair[side].login.loginButton, 'Sign in');
      assert.equal(pair[side].login.passwordField, 'Account password');
    }
  }
});

test('site versions apply only to enabled selected products in that site', () => {
  const configs = configurations();
  configs[0].siteVersionOverrides = siteVersions;
  const resolved = pairs({ configurations: configs });
  for (const pair of resolved) {
    for (const side of ['urlA', 'urlB']) {
      const version = pair.site === 'ALPHA' ? siteVersions[versionKey(side)] : originalVersions[side];
      assert.equal(pair[side].versionSource, pair.site === 'ALPHA' ? 'SITE' : 'PRODUCT');
      assert.equal(pair[side].loginUrl, productUrl(pair.site, pair.id, side, version));
    }
  }
  assert.deepEqual(pairs({ configurations: configs, products: '2' }).map((p) => p.id), [2, 2]);
});

test('global versions take priority while preserving each product endpoint and credentials', () => {
  const configs = configurations();
  configs[0].siteVersionOverrides = siteVersions;
  const before = structuredClone(configs);
  const settings = { globalVersionOverrides: shared, businessUnits: { ALPHA: { 1: { urlA: 'BU-1' } } } };
  const settingsBefore = structuredClone(settings);
  for (const pair of pairs({ configurations: configs, settings })) {
    for (const side of ['urlA', 'urlB']) {
      assert.equal(pair[side].loginUrl, productUrl(pair.site, pair.id, side, shared[versionKey(side)]));
      assert.equal(pair[side].versionSource, 'GLOBAL');
      assert.equal(pair[side].version, shared[versionKey(side)]);
      assert.equal(pair[side].username, pair.site + '-' + pair.id + '-' + side);
      assert.equal(pair[side].password, 'password-' + pair.id + '-' + side);
    }
  }
  assert.equal(pairs({ configurations: configs, settings })[0].urlA.businessUnit, 'BU-1');
  assert.deepEqual(configs, before, 'Resolution must not mutate editable site configuration');
  assert.deepEqual(settings, settingsBefore, 'Resolution must not mutate run settings');
});

test('blank versions fall back independently through global, site and product levels', () => {
  const configs = configurations();
  configs[0].siteVersionOverrides = { ...siteVersions, versionA: '' };
  const resolved = pairs({ configurations: configs, settings: { globalVersionOverrides: { ...shared, versionB: '  ' } } });
  for (const pair of resolved) {
    assert.equal(pair.urlA.versionSource, 'GLOBAL');
    assert.equal(pair.urlA.version, shared.versionA);
    assert.equal(pair.urlB.versionSource, pair.site === 'ALPHA' ? 'SITE' : 'PRODUCT');
    assert.equal(pair.urlB.version, pair.site === 'ALPHA' ? siteVersions.versionB : originalVersions.urlB);
  }
  const siteOnly = pairs({ configurations: configs });
  assert.equal(siteOnly[0].urlA.versionSource, 'PRODUCT');
  assert.equal(siteOnly[0].urlB.versionSource, 'SITE');
  configs[0].siteVersionOverrides = { ...siteVersions, versionB: '' };
  const reversed = pairs({ configurations: configs, settings: { globalVersionOverrides: { versionB: shared.versionB, enabled: true } } });
  assert.equal(reversed[0].urlA.versionSource, 'SITE');
  assert.equal(reversed[0].urlB.versionSource, 'GLOBAL');
  assert.equal(reversed[2].urlA.versionSource, 'PRODUCT');
});

test('disabled overrides ignore retained values and restore original product URLs', () => {
  const configs = configurations();
  configs[0].siteVersionOverrides = { enabled: false, versionA: 'unused', versionB: null };
  const resolved = pairs({ configurations: configs, settings: { globalVersionOverrides: { enabled: false, versionA: 'unused', versionB: 123 } } });
  for (const pair of resolved) for (const side of ['urlA', 'urlB']) {
    assert.equal(pair[side].versionSource, 'PRODUCT');
    assert.equal(pair[side].loginUrl, productUrl(pair.site, pair.id, side));
  }
});

test('only the application-folder version changes, including for an IPv4 host', () => {
  const configs = configurations();
  const original = 'https://172.16.3.2:8443/proxy/ALiSNJDOH2TESTING11.4.42.01/LoginNJ11.4.42.01.aspx?next=11.4.42.01&x=a%2Fb#11.4.42.01';
  configs[0].products[0].urlA.loginUrl = original;
  const resolved = pairs({ configurations: configs, sites: 'ALPHA', products: '1', settings: {
    globalVersionOverrides: { enabled: true, versionA: ' 11.4.42.03 ', versionB: '' },
  } })[0].urlA;
  assert.equal(resolved.loginUrl, 'https://172.16.3.2:8443/proxy/ALiSNJDOH2TESTING11.4.42.03/LoginNJ11.4.42.01.aspx?next=11.4.42.01&x=a%2Fb#11.4.42.01');
  assert.equal(resolved.version, '11.4.42.03', 'Leading zeroes must be preserved');
});

test('a version override still requires valid full base URLs', () => {
  for (const invalid of ['', 'outdated', '/relative', 'file:///login', 'https://user:secret@example.test/login']) {
    const configs = configurations();
    configs[0].products[0].urlA.loginUrl = invalid;
    assert.throws(() => pairs({ configurations: configs, settings: { globalVersionOverrides: shared } }), (error) => {
      assert.match(error.message, /config\/sites\/ALPHA.js > product 1 > urlA.loginUrl/);
      assert.match(error.message, /full HTTP\(S\) URL/);
      assert.doesNotMatch(error.message, /user:secret/);
      return true;
    });
  }
});

test('active overrides reject absent or ambiguous ALiS folder versions', () => {
  for (const url of [
    'http://172.16.3.2/login',
    'https://example.test/Login11.4.42.01.aspx?v=11.4.42.01',
    'https://example.test/ALiSTest/Login.aspx',
    'https://example.test/ALiSTest11.4.42.01/ALiSOther11.4.42.02/login',
    'https://example.test/ALiSTest11.4.42.01copy11.4.42.02/login',
    'https://example.test/ALiSTest11.4.42.01-backup/login',
  ]) {
    const configs = configurations();
    configs[0].products[0].urlA.loginUrl = url;
    assert.throws(() => pairs({ configurations: configs, settings: { globalVersionOverrides: shared } }), /exactly one four-part version/);
  }
});

test('ordinary product URLs without version tokens remain usable when no override applies', () => {
  const configs = configurations();
  configs[0].products[0].urlA.loginUrl = 'https://example.test/custom/login?version=11.4.42.01';
  const target = pairs({ configurations: configs, sites: 'ALPHA', products: '1' })[0].urlA;
  assert.equal(target.version, '');
  assert.equal(target.loginUrl, configs[0].products[0].urlA.loginUrl);
});

test('same-version comparison preserves endpoint identity and permits same-URL comparisons', () => {
  const configs = configurations();
  for (const config of configs) for (const product of config.products) product.urlB.loginUrl = product.urlA.loginUrl;
  const resolved = pairs({ configurations: configs, settings: {
    globalVersionOverrides: { enabled: true, versionA: ' 11.4.42.03 ', versionB: '11.4.42.03' },
  } });
  assert.ok(resolved.every((pair) => pair.urlA.loginUrl === pair.urlB.loginUrl));
  assert.ok(resolved.every((pair) => pair.urlA.username !== pair.urlB.username));
});

test('unselected sites and disabled products do not require complete URLs or credentials', () => {
  const configs = configurations();
  configs[1].siteVersionOverrides = { enabled: true, versionA: '', versionB: '' };
  configs[0].products[2].urlA = {};
  configs[0].products[2].urlB = {};
  assert.equal(pairs({ configurations: configs, sites: 'ALPHA' }).length, 2);
  configs[1].products.forEach((product) => { product.enabled = false; });
  assert.equal(pairs({ configurations: configs }).length, 2);
});

test('version overrides never enable disabled products or bypass missing credentials', () => {
  const configs = configurations();
  assert.equal(pairs({ configurations: configs, settings: { globalVersionOverrides: shared } }).length, 4);
  configs[0].products[0].urlA.username = '';
  assert.throws(() => pairs({ configurations: configs, settings: { globalVersionOverrides: shared } }), /product 1 > urlA.username/);
  assert.equal(pairs({ configurations: configs, settings: { globalVersionOverrides: shared }, requireCredentials: false }).length, 4);
});

for (const [name, value, pattern] of [
  ['non-object', [], /must be an object/],
  ['null object', null, /must be an object/],
  ['invalid switch', { ...shared, enabled: 'true' }, /enabled must be true or false/],
  ['both blank', { enabled: true, versionA: ' ', versionB: '' }, /both versions are blank/],
  ['non-string version', { ...shared, versionA: 123 }, /versionA must be a string/],
  ['null version', { ...shared, versionA: null }, /versionA must be a string/],
  ['three-part version', { ...shared, versionA: '11.4.42' }, /four-part version/],
  ['five-part version', { ...shared, versionB: '11.4.42.03.1' }, /four-part version/],
  ['version prefix', { ...shared, versionB: 'v11.4.42.03' }, /four-part version/],
  ['negative component', { ...shared, versionB: '11.4.-42.03' }, /four-part version/],
  ['full URL', { ...shared, versionA: 'https://user:secret@site.test/ALiSTest11.4.42.03/login' }, /four-part version/],
  ['URL field names', { enabled: true, urlA: '11.4.42.03', urlB: '' }, /instead of urlA and urlB/],
]) {
  test('invalid override: ' + name + ' identifies its configuration location', () => {
    assert.throws(() => pairs({ settings: { globalVersionOverrides: value } }), (error) => {
      assert.match(error.message, /config\/runSettings.json > globalVersionOverrides/);
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, /user:secret/);
      return true;
    });
    const configs = configurations();
    configs[0].siteVersionOverrides = value;
    assert.throws(() => pairs({ configurations: configs }), /config\/sites\/ALPHA.js > siteVersionOverrides/);
  });
}

test('old URL override objects fail with migration guidance instead of being silently ignored', () => {
  assert.throws(() => pairs({ settings: { globalUrlOverrides: { enabled: false } } }), /use globalVersionOverrides with versionA and versionB/);
  const configs = configurations();
  configs[0].siteUrlOverrides = { enabled: true };
  assert.throws(() => pairs({ configurations: configs }), /use siteVersionOverrides with versionA and versionB/);
});

test('adding a new site file automatically supports site and global versions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sidebar-version-discovery-'));
  try {
    const config = { ...configurations()[0], site: 'FUTURE', siteVersionOverrides: siteVersions };
    await fs.writeFile(path.join(directory, 'FUTURE.js'), 'export const CONFIG = ' + JSON.stringify(config) + ';');
    const discovered = await loadSites(pathToFileURL(directory + path.sep));
    assert.equal(discovered[0].site, 'FUTURE');
    assert.equal(pairs({ configurations: discovered })[0].urlA.versionSource, 'SITE');
    assert.equal(pairs({ configurations: discovered, settings: { globalVersionOverrides: shared } })[0].urlB.versionSource, 'GLOBAL');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('existing --list command previews resolved URLs, versions and sources without altering reports', async () => {
  const summaryFile = path.join(root, 'comparison-report', 'summary.json');
  const before = await fs.readFile(summaryFile, 'utf8').catch(() => null);
  const env = { ...process.env, PLAYWRIGHT_HTML_OPEN: 'never' };
  delete env.SITES;
  delete env.PRODUCTS;
  const expected = getComparisonPairs({ sites: 'ALL', products: 'ALL', env: {}, requireCredentials: false });
  const { stdout } = await exec(process.execPath, [path.join(root, 'scripts', 'runSidebar.js'), '--site=ALL', '--product=ALL', '--list'], {
    cwd: root, env, timeout: 45000, maxBuffer: 2 * 1024 * 1024,
  });
  for (const pair of expected) {
    assert.ok(stdout.includes(pair.site + ' / ' + pair.id + ' - ' + pair.name));
    for (const [side, label] of [['urlA', 'A'], ['urlB', 'B']]) {
      assert.ok(stdout.includes('URL ' + label + ' [' + pair[side].versionSource + ', version=' + (pair[side].version || 'original') + ']: ' + pair[side].loginUrl));
    }
  }
  assert.doesNotMatch(stdout, /Password@|Opening .* ->|Running \d+ tests/);
  assert.equal(await fs.readFile(summaryFile, 'utf8').catch(() => null), before);
});
