// Add products with unique numeric ids. URL A and URL B have separate credentials.
const productComparisons = [
  {
    id: 1,
    name: 'Blood Bank',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNJDOH2TESTING11.3.25.03/LoginNJ.aspx',
      username: 'Angel4504',
      password: 'Password@1',
      label: 'NJ URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.41.08/LoginNJ.aspx',
      username: 'Keven7606',
      password: 'Password@1',
      label: 'NJ URL B',
    },
  },
  {
    id: 2,
    name: 'Clinical Laboratory',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNJDOH2TESTING11.3.25.03/LoginNJ.aspx',
      username: 'Willy4805',
      password: 'Password@1',
      label: 'NJ URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.41.08/LoginNJ.aspx',
      username: 'Wilfrid8045',
      password: 'Password@1',
      label: 'NJ URL B',
    },
  },
  {
    id: 3,
    name: 'Product 3',
    enabled: false,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNJDOH2TESTING11.3.25.03/LoginNJ.aspx',
      username: '',
      password: '',
      label: 'NJ URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.41.08/LoginNJ.aspx',
      username: '',
      password: '',
      label: 'NJ URL B',
    },
  },
  {
    id: 4,
    name: 'Product 4',
    enabled: false,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNJDOH2TESTING11.3.25.03/LoginNJ.aspx',
      username: '',
      password: '',
      label: 'NJ URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNJDOH2TESTING11.4.41.08/LoginNJ.aspx',
      username: '',
      password: '',
      label: 'NJ URL B',
    },
  },
];

export const CONFIG = {
  site: 'NJ',
  products: productComparisons,
  login: {
    usernameField: 'Login Name',
    passwordField: 'Password',
    loginButton: 'Login',
  },
};
