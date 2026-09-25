export const environments = {
  TEST: {
    key: 'TEST',
    name: 'Testing',
    urls: {
      DPBH: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.41.07/Login.aspx',
      TXOCA: 'http://172.16.3.2/ALiSTXOCA2TESTING11.4.41.07/DefaultTexas.aspx',
      NVRCP: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.41.07/LoginRadiation.aspx',
      NJ: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.41.07/LoginNJ.aspx',
      CONV: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.41.07/LoginCMS.aspx',
      CRANES: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.41.07/LoginCMS.aspx',
      SAPTA: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.4.41.07/LoginBHCEN.aspx',
      TXFSC: 'http://172.16.3.2/ALiSTXFSC2TESTING11.4.41.07/LoginTXFSC.aspx',
    },
  },

  PROD: {
    key: 'PROD',
    name: 'Production',
    urls: {
      NVRCP: 'http://172.16.3.2/ALiSNVRCP2TESTING11.3.25.03/LoginRadiation.aspx',
      TXOCA: 'http://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      DPBH: 'http://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
      NJ: 'http://172.16.3.2/ALiSNJDOH2TESTING11.3.25.03/LoginNJ.aspx',
      SAPTA: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.3.25.03/LoginBHCEN.aspx',
      CONV: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.39.08/LoginCMS.aspx',
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

export function resolveLoginUrl(environmentKey, siteKey) {
  const environment = resolveEnvironment(environmentKey);
  const normalizedSiteKey = normalizeKey(siteKey, 'Site');
  return environment.urls[normalizedSiteKey] || '';
}

export function configuredSiteKeys(environmentKey) {
  return Object.keys(resolveEnvironment(environmentKey).urls);
}

function normalizeKey(value, label) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) throw new Error(`${label} key is required.`);
  return normalized;
}
