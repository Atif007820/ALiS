import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { availableEnvironmentKeys, resolveEnvironment } from '../config/urls.js';

export const frameworkRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function frameworkPath(...parts) {
  return resolve(frameworkRoot, ...parts);
}

export function csvFromEnv(name) {
  const value = process.env[name];
  if (!value) return [];
  return value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
}

export function configuredList(envName, settingsName) {
  const envList = csvFromEnv(envName);
  if (envList.length) return envList;
  const configured = listFromRunSettings(settingsName) || ['ALL'];
  return configured.map((item) => String(item).toUpperCase());
}

function listFromRunSettings(settingsName) {
  if (settingsName === 'includeEnvironments') {
    return normalizeConfiguredList(
      runSettings.defaultEnvironment
        ?? runSettings.defaultEnvironments
        ?? runSettings.includeEnvironments,
    );
  }

  if (settingsName === 'includeSites') {
    return normalizeConfiguredList(
      runSettings.defaultSite
        ?? runSettings.defaultSites
        ?? runSettings.includeSites,
    );
  }

  if (settingsName === 'includeProducts') {
    return normalizeConfiguredList(
      runSettings.defaultProduct
        ?? runSettings.defaultProducts
        ?? runSettings.includeProducts,
    );
  }

  return normalizeConfiguredList(runSettings[settingsName]);
}

function normalizeConfiguredList(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

export function isIncluded(key, wanted) {
  return wanted.includes('ALL') || wanted.includes(String(key).toUpperCase());
}

export function isProductIncluded(product, wanted) {
  const keys = [
    product.key,
    ...(product.aliases || []),
  ].map((key) => String(key).toUpperCase());

  return wanted.includes('ALL') || keys.some((key) => wanted.includes(key));
}

export function resolveRunMatrix(siteRegistry) {
  const requestedTargets = csvFromEnv('REGISTER_TARGETS');
  const wantedEnvironments = configuredList('REGISTER_ENVIRONMENTS', 'includeEnvironments');
  const wantedSites = configuredList('REGISTER_SITES', 'includeSites');
  const wantedProducts = configuredList('REGISTER_PRODUCTS', 'includeProducts');
  const targets = requestedTargets.length
    ? parseTargets(siteRegistry, requestedTargets)
    : crossProductTargets(siteRegistry, wantedEnvironments, wantedSites);
  const combinations = targets.flatMap(({ environmentKey, siteKey }) => {
    const site = siteRegistry.resolve(siteKey, environmentKey);
    if (!site) return [];

    return site.products
      .filter((product) => isProductIncluded(product, wantedProducts))
      .filter((product) => isProductAvailableForSite(product, site))
      .map((product) => ({
        environment: site.environment,
        site,
        product,
      }));
  });

  if (!combinations.length) {
    throw new Error(
      `No registration combinations matched targets [${targets
        .map(({ environmentKey, siteKey }) => `${environmentKey}:${siteKey}`)
        .join(', ')}] and products [${wantedProducts.join(', ')}].`,
    );
  }

  return combinations;
}

function crossProductTargets(siteRegistry, wantedEnvironments, wantedSites) {
  const environmentKeys = selectedEnvironmentKeys(wantedEnvironments);
  validateRequestedSites(siteRegistry, wantedSites);

  return environmentKeys.flatMap((environmentKey) => siteRegistry
    .allSites()
    .filter((site) => isIncluded(site.key, wantedSites))
    .map((site) => ({ environmentKey, siteKey: site.key })));
}

function parseTargets(siteRegistry, requestedTargets) {
  const targets = requestedTargets.flatMap((target) => {
    const [rawEnvironmentKey, rawSiteKey, ...extraParts] = target.split(':');
    if (!rawEnvironmentKey || !rawSiteKey || extraParts.length) {
      throw new Error(
        `Invalid target "${target}". Use ENV:SITE, for example TEST:NJ or PROD:NVRCP.`,
      );
    }

    const environmentKey = resolveEnvironment(rawEnvironmentKey).key;
    const siteKeys = rawSiteKey === 'ALL'
      ? siteRegistry.allSites().map((site) => site.key)
      : [siteRegistry.get(rawSiteKey).key];

    return siteKeys.map((siteKey) => ({ environmentKey, siteKey }));
  });

  return uniqueTargets(targets);
}

function uniqueTargets(targets) {
  const seen = new Set();
  return targets.filter(({ environmentKey, siteKey }) => {
    const key = `${environmentKey}:${siteKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function selectedEnvironmentKeys(wantedEnvironments) {
  if (wantedEnvironments.includes('ALL')) return availableEnvironmentKeys();
  return wantedEnvironments.map((environmentKey) => resolveEnvironment(environmentKey).key);
}

function validateRequestedSites(siteRegistry, wantedSites) {
  if (wantedSites.includes('ALL')) return;

  for (const siteKey of wantedSites) {
    siteRegistry.get(siteKey);
  }
}

export function isProductAvailableForSite(product, site) {
  if (!product.minimumVersion) return true;

  const siteVersion = versionFromUrl(site.loginUrl);
  if (!siteVersion) return true;

  return compareVersions(siteVersion, product.minimumVersion) >= 0;
}

export function versionFromUrl(url) {
  const matches = [...String(url || '').matchAll(/(\d+\.\d+\.\d+(?:\.\d+)?)/g)];
  return matches.at(-1)?.[1] || '';
}

export function compareVersions(left, right) {
  const leftParts = String(left).split('.').map(Number);
  const rightParts = String(right).split('.').map(Number);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }

  return 0;
}

export function headlessFromSettings() {
  if (process.env.HEADLESS !== undefined) {
    return !/^false|0|no$/i.test(process.env.HEADLESS);
  }
  return Boolean(runSettings.headless);
}

export function outputUserDataPath(relativePath) {
  return frameworkPath(relativePath);
}
