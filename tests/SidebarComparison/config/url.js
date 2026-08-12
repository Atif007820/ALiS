// ============================================================
//  url.js
//  Change product names, URLs, credentials, labels, and login fields here.
//
//  Each product compares URL A against URL B.
//  Each URL has its own editable username/password/businessUnit.
//
//  Example selected run:
//    npm run sidebar -- --headed --product="Product 1,Product 4" --parallel 3
// ============================================================

const productComparisons = [
  {
    name: 'Product 1',
    enabled: false,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.24.06/LoginRadiation.aspx',
      username: 'RPM_Ins_2022',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL B',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.40.07/LoginRadiation.aspx',
      username: 'RPM_Ins_9846',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL A',
    },
  },
  {
    name: 'Product 2',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.24.06/LoginRadiation.aspx',
      username: 'RPM_6926',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL B',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.40.07/LoginRadiation.aspx',
      username: 'RPM_5267',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL A',
    },
  },
  {
    name: 'Product 3',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.24.06/LoginRadiation.aspx',
      username: 'RM_9446',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL B',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.40.07/LoginRadiation.aspx',
      username: 'RM_4654',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL A',
    },
  },
  {
    name: 'Product 4',
    enabled: false,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.24.06/LoginRadiation.aspx',
      username: 'EH_TP_4686',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL B',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.40.07/LoginRadiation.aspx',
      username: 'EH_TP_6563',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL A',
    },
  },
  {
    name: 'Product 5',
    enabled: false,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.24.06/LoginRadiation.aspx',
      username: 'EH_TP_4686',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL B',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.40.07/LoginRadiation.aspx',
      username: 'EH_TP_6563',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL A',
    },
  },
  {
    name: 'Product 6',
    enabled: false,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.24.06/LoginRadiation.aspx',
      username: 'EH_TP_4686',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL B',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.40.07/LoginRadiation.aspx',
      username: 'EH_TP_6563',
      password: 'Password@1',
      businessUnit: '',
      label: 'NVRCP URL A',
    },
  },
];

export const CONFIG = {
  products: productComparisons,

  // Backward compatibility for any older local helper that imports CONFIG.urlA/urlB.
  urlA: productComparisons[0].urlA,
  urlB: productComparisons[0].urlB,

  login: {
    usernameField: 'Login Name',
    passwordField: 'Password',
    loginButton: 'Login',
  },
};

export function getComparisonPairs() {
  const configuredProducts = Array.isArray(CONFIG.products) && CONFIG.products.length > 0
    ? CONFIG.products
    : [{ name: 'Default Product', enabled: true, urlA: CONFIG.urlA, urlB: CONFIG.urlB }];

  const selectedProducts = selectedProductKeys();

  return configuredProducts
    .map((product, index) => normalizeProductComparison(product, index))
    .filter((product) => product.enabled || selectedProducts.has(product.key) || selectedProducts.has(String(product.index + 1)))
    .filter((product) => {
      if (selectedProducts.size === 0) return true;
      return selectedProducts.has(product.key) || selectedProducts.has(String(product.index + 1));
    });
}

function normalizeProductComparison(product, index) {
  const name = String(product.name || product.productName || `Product ${index + 1}`).trim();
  const key = normalizeKey(product.key || name);
  const urlAConfig = normalizeEnvironment(product.urlA, `${name} URL A`);
  const urlBConfig = normalizeEnvironment(product.urlB, `${name} URL B`);

  return {
    index,
    name,
    key,
    enabled: product.enabled !== false,
    urlA: urlAConfig,
    urlB: urlBConfig,
  };
}

function normalizeEnvironment(env, fallbackLabel) {
  return {
    loginUrl: env?.loginUrl || '',
    username: env?.username || '',
    password: env?.password || '',
    businessUnit: env?.businessUnit || '',
    label: env?.label || fallbackLabel,
  };
}

function selectedProductKeys() {
  return new Set(
    String(process.env.PRODUCTS || process.env.npm_config_product || '')
      .split(',')
      .map((value) => normalizeKey(value))
      .filter(Boolean),
  );
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
