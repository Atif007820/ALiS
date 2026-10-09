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
const shared = { enabled: true, urlA: 'https://shared.test/a', urlB: 'http://shared.test/b' };
const siteUrls = { enabled: true, urlA: 'https://alpha.test/shared-a', urlB: 'http://alpha.test/shared-b' };

function configurations() {
  return ['ALPHA', 'BETA'].map((site) => ({
    site, configFile: `config/sites/${site}.js`,
    login: { loginButton: 'Sign in' },
    products: [1, 2, 3].map((id) => ({
      id, name: `${site} product ${id}`, enabled: id !== 3,
      ...Object.fromEntries(['urlA', 'urlB'].map((side) => [side, {
        loginUrl: `https://${site.toLowerCase()}.test/${id}/${side}`,
        username: `${site}-${id}-${side}`, password: `password-${id}-${side}`,
        label: `${site} ${id} ${side}`, login: { passwordField: 'Account password' },
      }])),
    })),
  }));
}

function pairs(options = {}) {
  return getComparisonPairs({ sites: 'ALL', products: 'ALL', env: {}, settings: {}, configurations: configurations(), ...options });
}

test('product mode retains original URLs, credentials and login settings', () => {
  const original = configurations();
  const resolved = pairs({ configurations: original });
  assert.equal(resolved.length, 4);
  for (const pair of resolved) {
    const product = original.find((site) => site.site === pair.site).products.find((p) => p.id === pair.id);
    for (const side of ['urlA', 'urlB']) {
      assert.equal(pair[side].urlSource, 'PRODUCT');
      for (const key of ['loginUrl', 'username', 'password', 'label']) assert.equal(pair[side][key], product[side][key]);
      assert.equal(pair[side].login.loginButton, 'Sign in');
      assert.equal(pair[side].login.passwordField, 'Account password');
    }
  }
});

test('site overrides apply only to selected enabled products in that site', () => {
  const configs = configurations();
  configs[0].siteUrlOverrides = siteUrls;
  const resolved = pairs({ configurations: configs });
  for (const pair of resolved) {
    for (const side of ['urlA', 'urlB']) {
      assert.equal(pair[side].urlSource, pair.site === 'ALPHA' ? 'SITE' : 'PRODUCT');
      if (pair.site === 'ALPHA') assert.equal(pair[side].loginUrl, siteUrls[side]);
    }
  }
  assert.deepEqual(pairs({ configurations: configs, products: '2' }).map((p) => p.id), [2, 2]);
});

test('global overrides win across sites while preserving product identity and credentials', () => {
  const configs = configurations();
  configs[0].siteUrlOverrides = siteUrls;
  const before = structuredClone(configs);
  const settings = { globalUrlOverrides: shared, businessUnits: { ALPHA: { 1: { urlA: 'BU-1' } } } };
  const resolved = pairs({ configurations: configs, settings });
  for (const pair of resolved) {
    for (const side of ['urlA', 'urlB']) {
      assert.equal(pair[side].loginUrl, shared[side]);
      assert.equal(pair[side].urlSource, 'GLOBAL');
      assert.equal(pair[side].username, `${pair.site}-${pair.id}-${side}`);
    }
  }
  assert.equal(resolved[0].urlA.businessUnit, 'BU-1');
  assert.deepEqual(configs, before, 'URL resolution must not mutate editable configuration');
});

test('each side falls back independently through global, site and product URLs', () => {
  const configs = configurations();
  configs[0].siteUrlOverrides = { ...siteUrls, urlA: '' };
  const resolved = pairs({ configurations: configs, settings: { globalUrlOverrides: { ...shared, urlB: '  ' } } });
  for (const pair of resolved) {
    assert.equal(pair.urlA.urlSource, 'GLOBAL');
    assert.equal(pair.urlB.urlSource, pair.site === 'ALPHA' ? 'SITE' : 'PRODUCT');
    if (pair.site === 'ALPHA') assert.equal(pair.urlB.loginUrl, siteUrls.urlB);
  }
  const siteOnly = pairs({ configurations: configs });
  assert.equal(siteOnly[0].urlA.urlSource, 'PRODUCT');
  assert.equal(siteOnly[0].urlB.urlSource, 'SITE');
});

test('disabled overrides ignore retained URLs and disabling restores product mode', () => {
  const configs = configurations();
  configs[0].siteUrlOverrides = { enabled: false, urlA: 'unused', urlB: null };
  const result = pairs({ configurations: configs, settings: { globalUrlOverrides: { enabled: false, urlA: 'unused', urlB: 123 } } });
  assert.ok(result.every((pair) => pair.urlA.urlSource === 'PRODUCT' && pair.urlB.urlSource === 'PRODUCT'));
});

test('overrides supply effective URLs when original product URLs are blank or invalid', () => {
  const configs = configurations();
  for (const site of configs) for (const product of site.products) {
    product.urlA.loginUrl = '';
    product.urlB.loginUrl = 'outdated';
  }
  assert.equal(pairs({ configurations: configs, settings: { globalUrlOverrides: shared } }).length, 4);
  configs[0].siteUrlOverrides = siteUrls;
  assert.equal(pairs({ configurations: configs, sites: 'ALPHA' }).length, 2);
  assert.throws(() => pairs({ configurations: configs, sites: 'BETA' }), /product 1 > urlA.loginUrl/);
});

test('same-URL comparison and surrounding whitespace are supported', () => {
  const result = pairs({ settings: { globalUrlOverrides: { enabled: true, urlA: ' https://shared.test/login ', urlB: 'https://shared.test/login' } } });
  assert.ok(result.every((pair) => pair.urlA.loginUrl === pair.urlB.loginUrl && pair.urlA.loginUrl === 'https://shared.test/login'));
});

test('unselected sites and disabled products do not require complete URLs or credentials', () => {
  const configs = configurations();
  configs[1].siteUrlOverrides = { enabled: true, urlA: '', urlB: '' };
  configs[0].products[2].urlA = {};
  configs[0].products[2].urlB = {};
  assert.equal(pairs({ configurations: configs, sites: 'ALPHA' }).length, 2);
  configs[1].products.forEach((product) => { product.enabled = false; });
  assert.equal(pairs({ configurations: configs }).length, 2);
});

test('overrides never enable disabled products or bypass missing credentials', () => {
  const configs = configurations();
  assert.equal(pairs({ configurations: configs, settings: { globalUrlOverrides: shared } }).length, 4);
  configs[0].products[0].urlA.username = '';
  assert.throws(() => pairs({ configurations: configs, settings: { globalUrlOverrides: shared } }), /product 1 > urlA.username/);
  assert.equal(pairs({ configurations: configs, settings: { globalUrlOverrides: shared }, requireCredentials: false }).length, 4);
});

for (const [name, value, pattern] of [
  ['non-object', [], /must be an object/],
  ['invalid switch', { ...shared, enabled: 'true' }, /enabled must be true or false/],
  ['both blank', { enabled: true, urlA: ' ', urlB: '' }, /both URLs are blank/],
  ['non-string URL', { ...shared, urlA: 123 }, /urlA must be a string/],
  ['null URL', { ...shared, urlA: null }, /urlA must be a string/],
  ['relative URL', { ...shared, urlA: '/login' }, /urlA must be an HTTP/],
  ['unsupported protocol', { ...shared, urlB: 'file:///login' }, /urlB must be an HTTP/],
  ['embedded credentials', { ...shared, urlA: 'https://user:secret@shared.test/login' }, /without embedded credentials/],
]) {
  test(`invalid override: ${name} identifies its configuration location`, () => {
    assert.throws(() => pairs({ settings: { globalUrlOverrides: value } }), (error) => {
      assert.match(error.message, /config\/runSettings.json > globalUrlOverrides/);
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, /user:secret/);
      return true;
    });
    const configs = configurations();
    configs[0].siteUrlOverrides = value;
    assert.throws(() => pairs({ configurations: configs }), /config\/sites\/ALPHA.js > siteUrlOverrides/);
  });
}

test('adding a new site file automatically supports site and global overrides', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sidebar-url-discovery-'));
  try {
    const config = { ...configurations()[0], site: 'FUTURE', siteUrlOverrides: siteUrls };
    await fs.writeFile(path.join(directory, 'FUTURE.js'), `export const CONFIG = ${JSON.stringify(config)};`);
    const discovered = await loadSites(pathToFileURL(`${directory}${path.sep}`));
    assert.equal(discovered[0].site, 'FUTURE');
    assert.equal(pairs({ configurations: discovered })[0].urlA.urlSource, 'SITE');
    assert.equal(pairs({ configurations: discovered, settings: { globalUrlOverrides: shared } })[0].urlB.urlSource, 'GLOBAL');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('existing --list command previews resolved URLs and sources without altering reports', async () => {
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
    assert.ok(stdout.includes(`${pair.site} / ${pair.id} - ${pair.name}`));
    assert.ok(stdout.includes(`URL A [${pair.urlA.urlSource}]: ${pair.urlA.loginUrl}`));
    assert.ok(stdout.includes(`URL B [${pair.urlB.urlSource}]: ${pair.urlB.loginUrl}`));
  }
  assert.doesNotMatch(stdout, /Password@|Opening .* ->|Running \d+ tests/);
  assert.equal(await fs.readFile(summaryFile, 'utf8').catch(() => null), before);
});
