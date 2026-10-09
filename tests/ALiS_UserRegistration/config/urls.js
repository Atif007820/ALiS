import runSettings from './runSettings.json' with { type: 'json' };

export const environments = {
  TEST: {
    key: 'TEST',
    name: 'Testing',
    urls: {
      DPBH: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.41.09/Login.aspx',
      TXOCA: 'http://172.16.3.2/ALiSTXOCA2TESTING11.4.42/DefaultTexas.aspx',
      NVRCP: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.42/LoginRadiation.aspx',
      NJ: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.42/LoginNJ.aspx',
      CONV: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.42/LoginCMS.aspx',
      CRANES: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.42/LoginCMS.aspx',
      SAPTA: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.4.42/LoginBHCEN.aspx',
      TXFSC: 'http://172.16.3.2/ALiSTXFSC2TESTING11.4.42/LoginTXFSC.aspx',
    },
  },

  PROD: {
    key: 'PROD',
    name: 'Production',
    urls: {
      NVRCP: 'http://172.16.3.2/ALiSNVRCP2TESTING11.3.25.02/LoginRadiation.aspx',
      TXOCA: 'http://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      DPBH: 'http://172.16.3.2/ALiSDPBH2TESTING11.3.25.02/Login.aspx',
      NJ: 'http://172.16.3.2/ALiSNJDOH2TESTING11.3.25.03/LoginNJ.aspx',
      SAPTA: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.3.25.02/LoginBHCEN.aspx',
      CONV: 'https://aliswalni-uat.aithent.com/ALiSINVPROD/LoginCMS.aspx',
    },
  },

  UAT: {
    key: 'UAT',
    name: 'User Acceptance Testing',
    urls: {
      NVRCP: 'https://alisuat.aithent.com/NVRCP/LoginRadiation.aspx',
      NJ: 'https://alisuat.aithent.com/NJDOH_MIG/LoginNJ.aspx',
      TXOCA: 'https://alisuat.aithent.com/TXOCA/DefaultTexas.aspx',
    },
  },
};

export function availableEnvironmentKeys() {
  return Object.keys(environments);
}

export function resolveEnvironment(environmentKey) {
  const normalizedKey = normalizeKey(environmentKey, 'Environment');
  const environment = environments[normalizedKey];

  if (!environment) {
    throw new Error(
      `Unknown environment "${normalizedKey}". Available environments: ${availableEnvironmentKeys().join(', ')}.`,
    );
  }

  return environment;
}

export function resolveLoginUrl(environmentKey, siteKey, options) {
  return resolveLoginUrlDetails(environmentKey, siteKey, options).loginUrl;
}

export function resolveLoginUrlDetails(environmentKey, siteKey, { settings = runSettings } = {}) {
  const environment = resolveEnvironment(environmentKey);
  const normalizedSiteKey = normalizeKey(siteKey, 'Site');
  const location = `config/runSettings.json > environmentVersionOverrides.${environment.key}`;
  const configuredOverrides = settings.environmentVersionOverrides;
  if (configuredOverrides !== undefined
      && (!configuredOverrides || typeof configuredOverrides !== 'object' || Array.isArray(configuredOverrides))) {
    throw new Error('config/runSettings.json > environmentVersionOverrides must be an object keyed by environment.');
  }
  const unknownKeys = Object.keys(configuredOverrides || {}).filter((key) => !availableEnvironmentKeys().includes(key));
  if (unknownKeys.length) {
    throw new Error(`config/runSettings.json > environmentVersionOverrides has unknown environment key(s): ${unknownKeys.join(', ')}. Use ${availableEnvironmentKeys().join(', ')}.`);
  }
  const override = validateVersionOverride(configuredOverrides?.[environment.key], location);
  const configuredLoginUrl = environment.urls[normalizedSiteKey] ?? '';
  if (!configuredLoginUrl) {
    return { loginUrl: '', configuredLoginUrl: '', urlVersion: '', versionSource: 'UNCONFIGURED' };
  }
  return resolveVersionedLoginUrl(configuredLoginUrl, override, {
    location: `config/urls.js > ${environment.key}.urls.${normalizedSiteKey}`,
  });
}

export function resolveVersionedLoginUrl(configuredLoginUrl, override = {}, { location = 'Login URL' } = {}) {
  const activeOverride = validateVersionOverride(override, 'Version override');
  let url;
  try {
    if (typeof configuredLoginUrl !== 'string') throw new Error();
    url = new URL(configuredLoginUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch {
    throw new Error(`${location} must be an HTTP(S) URL without embedded credentials.`);
  }
  const matches = applicationVersions(url);
  const originalVersion = matches.at(-1)?.version || '';
  const details = {
    configuredLoginUrl,
    loginUrl: configuredLoginUrl,
    urlVersion: originalVersion,
    versionSource: originalVersion ? 'ORIGINAL' : 'NOT VERSIONED',
  };
  if (!activeOverride.enabled || !originalVersion) return details;
  if (matches.length !== 1) {
    throw new Error(`${location} has multiple versioned path segments; the override cannot choose an application folder safely.`);
  }
  const match = matches[0];
  const segments = url.pathname.split('/');
  segments[match.index] = `${match.prefix}${activeOverride.version}`;
  url.pathname = segments.join('/');
  return { ...details, loginUrl: url.href, urlVersion: activeOverride.version, versionSource: 'OVERRIDE' };
}

export function versionFromUrl(loginUrl) {
  try {
    return applicationVersions(new URL(loginUrl)).at(-1)?.version || '';
  } catch {
    return '';
  }
}

function applicationVersions(url) {
  // Inspect path components only; host addresses, query strings and fragments are not versions.
  return url.pathname.split('/').flatMap((segment, index) => {
    const match = /^(.*?)(\d+\.\d+\.\d+(?:\.\d+)*)$/.exec(segment);
    return match ? [{ index, prefix: match[1], version: match[2] }] : [];
  });
}

function validateVersionOverride(value, location) {
  if (value === undefined) return { enabled: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${location} must be an object with enabled and version.`);
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    throw new Error(`${location}.enabled must be true or false.`);
  }
  if (value.enabled !== true) return { enabled: false };
  const version = typeof value.version === 'string' ? value.version.trim() : '';
  if (!/^\d+\.\d+\.\d+(?:\.\d+)*$/.test(version)
      || !version.split('.').every((part) => Number.isSafeInteger(Number(part)))) {
    throw new Error(`${location}.version must be a dotted numeric version with at least three parts, for example 11.4.42 or 11.3.25.03.`);
  }
  return { enabled: true, version };
}

export function configuredSiteKeys(environmentKey) {
  return Object.keys(resolveEnvironment(environmentKey).urls);
}

function normalizeKey(value, label) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) throw new Error(`${label} key is required.`);
  return normalized;
}
