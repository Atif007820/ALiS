export const urlProfiles = {
  LNI: {
    id: 'LNI',
    name: 'LNI',
    loginUrl: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.38.08/LoginCMS.aspx',
  },
  NVRCP: {
    id: 'NVRCP',
    name: 'NVRCP',
    loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.38.08/LoginRadiation.aspx',
  },
  NJ: {
    id: 'NJ',
    name: 'NJ',
    loginUrl: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.38.08/LoginNJ.aspx',
  },
  DPBH: {
    id: 'DPBH',
    name: 'DPBH',
    loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.38.08/Login.aspx',
  },
};

export function resolveEnvironment({ urlKey, loginUrlOverride } = {}) {
  const resolvedUrlKey = normalizeUrlKey(urlKey);
  const profile = urlProfiles[resolvedUrlKey];

  if (!profile) {
    throw new Error(
      `Unknown URL key "${resolvedUrlKey}". Available URL keys: ${availableUrlKeys().join(', ')}.`,
    );
  }

  return {
    ...profile,
    loginUrl: loginUrlOverride || profile.loginUrl,
  };
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
