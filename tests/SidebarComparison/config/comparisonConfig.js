import { readdir } from 'node:fs/promises';
import runSettings from './runSettings.json' with { type: 'json' };

const siteConfigs = await loadSites();

const defaultLogin = {
  usernameField: 'Login Name',
  passwordField: 'Password',
  loginButton: 'Login',
};

export function getComparisonPairs({
  sites,
  products,
  requireCredentials = true,
  env = process.env,
  settings = runSettings,
  configurations = siteConfigs,
} = {}) {
  const selectedSites = selection(sites ?? (env.SITES || env.npm_config_site || env.npm_config_sites
    || settings.sites || ['NVRCP']), 'site');
  const selectedProducts = selection(products ?? (env.PRODUCTS || env.npm_config_product
    || env.npm_config_products || settings.products || []), 'product');
  if (!selectedSites.length) throw new Error('Select at least one site in runSettings.json or with --site.');

  const knownSites = configurations.map((config) => config.site.toLowerCase());
  const unknownSites = selectedSites.filter((site) => site !== 'all' && !knownSites.includes(site));
  if (unknownSites.length) {
    throw new Error(`Unknown site(s): ${unknownSites.join(', ')}. Available: ${configurations.map((config) => config.site).join(', ')}.`);
  }

  const pairs = [];
  for (const config of configurations) {
    if (!selectedSites.includes('all') && !selectedSites.includes(config.site.toLowerCase())) continue;
    const configuredProducts = normalizeProducts(config, settings);
    for (const selected of selectedProducts) {
      if (selected !== 'all' && !configuredProducts.some((product) => matchesProduct(product, selected))) {
        throw new Error(`${config.site}: unknown product "${selected}". Available ids: ${configuredProducts.map((product) => product.id).join(', ')}. Product selections apply to every selected site.`);
      }
    }
    const selected = configuredProducts.filter((product) => product.enabled
      && (!selectedProducts.length || selectedProducts.includes('all')
        || selectedProducts.some((value) => matchesProduct(product, value))));
    if (selected.length) {
      const global = normalizeUrlOverrides(settings.globalUrlOverrides, 'config/runSettings.json > globalUrlOverrides');
      const site = normalizeUrlOverrides(config.siteUrlOverrides, `${config.configFile} > siteUrlOverrides`);
      pairs.push(...selected.map((pair) => applyUrlOverrides(pair, { global, site })));
    }
  }

  if (!pairs.length) {
    throw new Error('No enabled products match the selected sites and products. Set enabled: true in the relevant config/sites/<SITE>.js file or change the selection.');
  }
  validateComparisons(pairs, { requireCredentials });
  return pairs;
}

function normalizeUrlOverrides(value, location) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw configurationError([`${location} must be an object with enabled, urlA and urlB`]);
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    throw configurationError([`${location}.enabled must be true or false`]);
  }
  if (value.enabled !== true) return {};

  const urls = {};
  const errors = [];
  for (const side of ['urlA', 'urlB']) {
    if (value[side] !== undefined && typeof value[side] !== 'string') {
      errors.push(`${location}.${side} must be a string (use "" to fall back)`);
      continue;
    }
    urls[side] = (value[side] ?? '').trim();
    if (urls[side] && !isLoginUrl(urls[side])) {
      errors.push(`${location}.${side} must be an HTTP(S) URL without embedded credentials`);
    }
  }
  if (!errors.length && !urls.urlA && !urls.urlB) {
    errors.push(`${location} is enabled but both URLs are blank; supply at least one URL or set enabled: false`);
  }
  if (errors.length) throw configurationError(errors);
  return urls;
}

function applyUrlOverrides(pair, { global, site }) {
  const resolveSide = (side) => {
    const urlSource = global[side] ? 'GLOBAL' : site[side] ? 'SITE' : 'PRODUCT';
    return {
      ...pair[side],
      loginUrl: global[side] || site[side] || pair[side].loginUrl,
      urlSource,
    };
  };
  return { ...pair, urlA: resolveSide('urlA'), urlB: resolveSide('urlB') };
}

function normalizeProducts(config, settings) {
  if (!Array.isArray(config.products) || !config.products.length) {
    throw new Error(`${config.configFile}: products must be a nonempty array.`);
  }
  const seen = new Set();
  return config.products.map((product) => {
    if (!Number.isSafeInteger(product?.id) || product.id < 1) {
      throw new Error(`${config.configFile}: each product needs a unique positive integer id.`);
    }
    if (seen.has(product.id)) throw new Error(`${config.configFile}: duplicate product id ${product.id}.`);
    seen.add(product.id);
    if (product.enabled !== undefined && typeof product.enabled !== 'boolean') {
      throw new Error(`${config.configFile}: product ${product.id}.enabled must be true or false.`);
    }
    const name = String(product.name || `Product ${product.id}`).trim();
    const login = { ...defaultLogin, ...config.login };
    const normalizeSide = (side) => {
      const businessUnit = settings.businessUnits?.[config.site]?.[product.id]?.[side] ?? '';
      return {
        loginUrl: String(product[side]?.loginUrl || '').trim(),
        username: product[side]?.username ?? '',
        password: product[side]?.password ?? '',
        businessUnit: typeof businessUnit === 'string' ? businessUnit.trim() : businessUnit,
        label: String(product[side]?.label || `${config.site} ${name} URL ${side === 'urlA' ? 'A' : 'B'}`),
        login: { ...login, ...product[side]?.login },
      };
    };
    return {
      site: config.site,
      configFile: config.configFile,
      id: product.id,
      name,
      key: `${config.site.toLowerCase()}-product-${product.id}`,
      enabled: product.enabled !== false,
      urlA: normalizeSide('urlA'),
      urlB: normalizeSide('urlB'),
    };
  });
}

function validateComparisons(pairs, { requireCredentials }) {
  const errors = [];
  for (const pair of pairs) {
    for (const side of ['urlA', 'urlB']) {
      const value = pair[side];
      const location = `${pair.configFile} > product ${pair.id} > ${side}`;
      if (typeof value.businessUnit !== 'string') {
        errors.push(`config/runSettings.json > businessUnits.${pair.site}.${pair.id}.${side} must be a string (use "" for automatic selection)`);
      }
      if (!isLoginUrl(value.loginUrl)) {
        errors.push(`${location}.loginUrl must be an HTTP(S) URL without embedded credentials`);
      }
      for (const field of Object.keys(defaultLogin)) {
        if (typeof value.login[field] !== 'string' || !value.login[field].trim()) {
          errors.push(`${location}.login.${field} must be a nonempty string`);
        }
      }
      if (requireCredentials) {
        for (const field of ['username', 'password']) {
          if (typeof value[field] !== 'string' || !value[field].trim()) {
            errors.push(`${location}.${field} is blank or invalid`);
          }
        }
      }
    }
  }
  if (errors.length) throw configurationError(errors);
}

function isLoginUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function configurationError(errors) {
  return new Error(`SidebarComparison configuration needs attention:\n${errors.map((error) => `- ${error}`).join('\n')}\nFill the selected configuration before running. Use --list to preview selections without logging in.`);
}

function selection(value, label) {
  const values = [...new Set((Array.isArray(value) ? value : String(value).split(','))
    .map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
  if (values.includes('all') && values.length > 1) throw new Error(`Use ALL alone for --${label}, or supply a comma-separated selection.`);
  return values;
}

function matchesProduct(product, value) {
  return String(product.id) === value || product.name.toLowerCase() === value
    || `product ${product.id}` === value;
}

// New site files are discovered in a stable order in both the runner and workers.
export async function loadSites(directory = new URL('./sites/', import.meta.url)) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js')
      && entry.name !== 'index.js' && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));
  const sites = [];
  const seen = new Set();

  for (const file of files) {
    const { CONFIG } = await import(new URL(file, directory).href);
    const site = String(CONFIG?.site || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_-]*$/.test(site) || site === 'ALL') {
      throw new Error(`config/sites/${file}: export CONFIG with a valid site code (for example NVRCP).`);
    }
    if (seen.has(site)) throw new Error(`Duplicate site code ${site} in config/sites/${file}.`);
    if (file.slice(0, -3).toUpperCase() !== site) {
      throw new Error(`config/sites/${file}: CONFIG.site must match the filename (${file.slice(0, -3)}).`);
    }
    seen.add(site);
    sites.push({ ...CONFIG, site, configFile: `config/sites/${file}` });
  }

  if (!sites.length) throw new Error('No site configurations found in config/sites/.');
  return sites;
}
