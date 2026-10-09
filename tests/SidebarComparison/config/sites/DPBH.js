export const CONFIG = {
  site: 'DPBH',
  // Enable to use shared URLs for this site's selected products.
  siteUrlOverrides: {
    enabled: true,
    urlA: 'https://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
    urlB: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.41.09/login.aspx',
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
      name: 'Health Facilities',
      enabled: true,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
        username: 'HCQC_HF_5699',
        password: 'Password@1',
        label: 'DPBH URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.42.01/login.aspx',
        username: 'HCQC_HF_7018',
        password: 'Password@1',
        label: 'DPBH URL B',
      },
    },
    {
      id: 2,
      name: 'Product 2',
      enabled: true,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
        username: 'Medlab_9675',
        password: 'Password@1',
        label: 'DPBH URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.42.01/login.aspx',
        username: 'Medlab_8365',
        password: 'Password@1',
        label: 'DPBH URL B',
      },
    },
    {
      id: 3,
      name: 'Product 3',
      enabled: true,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
        username: 'CCFL_4032',
        password: 'Password@1',
        label: 'DPBH URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.42.01/login.aspx',
        username: 'CCFL_3170',
        password: 'Password@1',
        label: 'DPBH URL B',
      },
    },
    {
      id: 4,
      name: 'Product 4',
      enabled: false,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
        username: '',
        password: '',
        label: 'DPBH URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.42.01/login.aspx',
        username: '',
        password: '',
        label: 'DPBH URL B',
      },
    },
    {
      id: 5,
      name: 'Product 5',
      enabled: false,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
        username: '',
        password: '',
        label: 'DPBH URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.42.01/login.aspx',
        username: '',
        password: '',
        label: 'DPBH URL B',
      },
    },
    {
      id: 6,
      name: 'Product 6',
      enabled: false,
      urlA: {
        loginUrl: 'https://172.16.3.2/ALiSDPBH2TESTING11.3.25.03/Login.aspx',
        username: '',
        password: '',
        label: 'DPBH URL A',
      },
      urlB: {
        loginUrl: 'http://172.16.3.2/ALiSDPBH2TESTING11.4.42.01/login.aspx',
        username: '',
        password: '',
        label: 'DPBH URL B',
      },
    },
  ];
}
