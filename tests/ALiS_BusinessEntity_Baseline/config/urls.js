import runSettings from './runSettings.json' with { type: 'json' };

export const urlProfiles = {
  LNI: {
    id: 'LNI',
    name: 'LNI',
    loginUrl: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.42.05/LoginCMS.aspx',
  },
  NVRCP: {
    id: 'NVRCP',
    name: 'NVRCP',
    loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.42.02/LoginRadiation.aspx',
  },
  NJ: {
    id: 'NJ',
    name: 'NJ',
    loginUrl: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.42.02/LoginNJ.aspx',
  },
  DPBH: {
    id: 'DPBH',
    name: 'DPBH',
    loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.42.02/Login.aspx',
  },
};

export function resolveEnvironment({ urlKey, loginUrlOverride, settings = runSettings } = {}) {
  const resolvedUrlKey = normalizeUrlKey(urlKey);
  const profile = urlProfiles[resolvedUrlKey];

  if (!profile) {
    throw new Error(
      `Unknown URL key "${resolvedUrlKey}". Available URL keys: ${availableUrlKeys().join(', ')}.`,
    );
  }

  const override = validateGlobalVersionOverride(settings.globalVersionOverride);
  const explicitUrl = loginUrlOverride !== undefined && loginUrlOverride !== '';
  const details = resolveVersionedLoginUrl(
    explicitUrl ? loginUrlOverride : profile.loginUrl,
    explicitUrl ? undefined : override,
  );
  return {
    ...profile,
    ...details,
    configuredLoginUrl: profile.loginUrl,
    ...(explicitUrl ? { versionSource: 'COMMAND LINE' } : {}),
  };
}

export function resolveVersionedLoginUrl(loginUrl, override, { location = 'Login URL' } = {}) {
  const activeOverride = validateGlobalVersionOverride(override);
  let url;
  try {
    if (typeof loginUrl !== 'string') throw new Error();
    url = new URL(loginUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch {
    throw new Error(`${location} must be an HTTP(S) URL without embedded credentials.`);
  }

  // Change only an ALiS application folder, never an IP, login filename or query value.
  const segments = url.pathname.split('/');
  const matches = segments.flatMap((segment, index) => {
    const match = /^(ALiS.*?)(\d+\.\d+\.\d+(?:\.\d+)*)$/i.exec(segment);
    return match ? [{ index, prefix: match[1], version: match[2] }] : [];
  });
  const originalVersion = matches.length === 1 ? matches[0].version : '';
  const details = {
    configuredLoginUrl: loginUrl,
    loginUrl,
    urlVersion: originalVersion,
    versionSource: matches.length ? 'ORIGINAL' : 'NOT VERSIONED',
  };
  if (!activeOverride.enabled || !matches.length) return details;
  if (matches.length !== 1) {
    throw new Error(`${location} has multiple versioned ALiS application folders; the global override cannot choose safely.`);
  }
  const match = matches[0];
  segments[match.index] = `${match.prefix}${activeOverride.version}`;
  url.pathname = segments.join('/');
  return { ...details, loginUrl: url.href, urlVersion: activeOverride.version, versionSource: 'GLOBAL OVERRIDE' };
}

export function validateGlobalVersionOverride(value) {
  const location = 'config/runSettings.json > globalVersionOverride';
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
    throw new Error(`${location}.version must be a dotted numeric version with at least three parts, such as 11.4.42 or 11.4.42.03.`);
  }
  return { enabled: true, version };
}

export function normalizeUrlKey(urlKey) {
  const normalized = String(urlKey || '').trim().toUpperCase();

  if (!normalized) {
    throw new Error('URL key is required. Provide --url=<URL_KEY> or set "defaultUrl" in config/runSettings.json.');
  }

  return normalized;
}

export function availableUrlKeys() {
  return Object.keys(urlProfiles);
}
