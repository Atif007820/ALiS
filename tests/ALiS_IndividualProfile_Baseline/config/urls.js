export const urlProfiles = {
  NVRCP: {
    id: 'NVRCP',
    name: 'NVRCP',
    loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.39.01/LoginRadiation.aspx',
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
