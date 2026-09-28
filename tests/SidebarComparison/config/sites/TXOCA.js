// Add products with unique numeric ids. URL A and URL B have separate credentials.
const productComparisons = [
  {
    id: 1,
    name: 'Product 1',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL A',
    },
    urlB: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.41.08/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL B',
    },
  },
  {
    id: 2,
    name: 'Product 2',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL A',
    },
    urlB: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.41.08/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL B',
    },
  },
  {
    id: 3,
    name: 'Product 3',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL A',
    },
    urlB: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.41.08/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL B',
    },
  },
  {
    id: 4,
    name: 'Product 4',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL A',
    },
    urlB: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.41.08/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL B',
    },
  },
  {
    id: 5,
    name: 'Product 5',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL A',
    },
    urlB: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.41.08/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL B',
    },
  },
  {
    id: 6,
    name: 'Product 6',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.3.25.03/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL A',
    },
    urlB: {
      loginUrl: 'https://172.16.3.2/ALiSTXOCA2TESTING11.4.41.08/DefaultTexas.aspx',
      username: '',
      password: '',
      label: 'TXOCA URL B',
    },
  },
];

export const CONFIG = {
  site: 'TXOCA',
  products: productComparisons,
  login: {
    usernameField: 'Login Name',
    passwordField: 'Password',
    loginButton: 'Login',
  },
};
