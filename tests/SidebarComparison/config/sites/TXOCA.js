export const CONFIG = {
  site: 'TXOCA',
  // Change only the application version in each selected product's base URLs.
  siteVersionOverrides: {
    enabled: false,
    versionA: '11.3.25.03',
    versionB: '11.4.41.09',
  },
  products: getProductComparisons(),
  login: {
    usernameField: 'Login Name',
    passwordField: 'Password',
    loginButton: 'Login',
  },
};

// Add products with unique numeric ids. URL A and URL B have separate credentials.
function getProductComparisons() {
  return [
    {
      id: 1,
      name: 'Product 1',
      enabled: true,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
        username: 'PS_9427',
        password: 'Password@1',
        label: 'TXOCA URL A',
      },
      urlB: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.42.01/DefaultTexas.aspx',
        username: 'PS_4725',
        password: 'Password@1',
        label: 'TXOCA URL B',
      },
    },
    {
      id: 2,
      name: 'Product 2',
      enabled: true,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
        username: 'CR_899',
        password: 'Password@1',
        label: 'TXOCA URL A',
      },
      urlB: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.42.01/DefaultTexas.aspx',
        username: 'CR_5621',
        password: 'Password@1',
        label: 'TXOCA URL B',
      },
    },
    {
      id: 3,
      name: 'Product 3',
      enabled: true,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
        username: 'CI_9590',
        password: 'Password@1',
        label: 'TXOCA URL A',
      },
      urlB: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.42.01/DefaultTexas.aspx',
        username: 'CI_2220',
        password: 'Password@1',
        label: 'TXOCA URL B',
      },
    },
    {
      id: 4,
      name: 'Product 4',
      enabled: false,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
        username: '',
        password: '',
        label: 'TXOCA URL A',
      },
      urlB: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.42.01/DefaultTexas.aspx',
        username: '',
        password: '',
        label: 'TXOCA URL B',
      },
    },
    {
      id: 5,
      name: 'Product 5',
      enabled: false,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
        username: '',
        password: '',
        label: 'TXOCA URL A',
      },
      urlB: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.42.01/DefaultTexas.aspx',
        username: '',
        password: '',
        label: 'TXOCA URL B',
      },
    },
    {
      id: 6,
      name: 'Product 6',
      enabled: false,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
        username: '',
        password: '',
        label: 'TXOCA URL A',
      },
      urlB: {
        loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.42.01/DefaultTexas.aspx',
        username: '',
        password: '',
        label: 'TXOCA URL B',
      },
    },
  ];
}
