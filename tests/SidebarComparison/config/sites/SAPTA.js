export const CONFIG = {
  site: 'SAPTA',
  // Enable to use shared URLs for this site's selected products.
  siteUrlOverrides: {
    enabled: false,
    urlA: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.3.25.03/LoginBHCEN.aspx',
    urlB: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.4.41.09/LoginBHCEN.aspx',
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
        loginUrl: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.3.25.03/LoginBHCEN.aspx',
        username: 'SPC_9410',
        password: 'Password@1',
        label: 'SAPTA URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.4.42.01/LoginBHCEN.aspx',
        username: 'SPC_7225',
        password: 'Password@1',
        label: 'SAPTA URL B',
      },
    },
    {
      id: 2,
      name: 'Product 2',
      enabled: true,
      urlA: {
        loginUrl: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.3.25.03/LoginBHCEN.aspx',
        username: 'Detox_Cert_9969',
        password: 'Password@1',
        label: 'SAPTA URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.4.42.01/LoginBHCEN.aspx',
        username: 'Detox_Cert_6385',
        password: 'Password@1',
        label: 'SAPTA URL B',
      },
    },
    {
      id: 3,
      name: 'Product 3',
      enabled: false,
      urlA: {
        loginUrl: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.3.25.03/LoginBHCEN.aspx',
        username: '',
        password: '',
        label: 'SAPTA URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSNVSAPTA2TESTING11.4.42.01/LoginBHCEN.aspx',
        username: '',
        password: '',
        label: 'SAPTA URL B',
      },
    },
  ];
}
