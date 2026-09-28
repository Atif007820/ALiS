// Each product compares URL A with URL B using separate accounts.
// Keep each numeric id unique and stable when renaming or reordering products.

const productComparisons = [
  {
    id: 1,
    name: 'Product 1',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.25.03/LoginRadiation.aspx',
      username: 'RPM_7515',
      password: 'Password@1',
      label: 'NVRCP URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.41.08/LoginRadiation.aspx',
      username: 'RPM_3619',
      password: 'Password@1',
      label: 'NVRCP URL B',
    },
  },
  {
    id: 2,
    name: 'Product 2',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.25.03/LoginRadiation.aspx',
      username: 'RPM_Ins_7538',
      password: 'Password@1',
      label: 'NVRCP URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.41.08/LoginRadiation.aspx',
      username: 'RPM_Ins_127',
      password: 'Password@1',
      label: 'NVRCP URL B',
    },
  },
  {
    id: 3,
    name: 'Product 3',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.25.03/LoginRadiation.aspx',
      username: 'RM_7148',
      password: 'Password@1',
      label: 'NVRCP URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.41.08/LoginRadiation.aspx',
      username: 'RM_2014',
      password: 'Password@1',
      label: 'NVRCP URL B',
    },
  },
  {
    id: 4,
    name: 'Product 4',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.25.03/LoginRadiation.aspx',
      username: 'MQSA_5619',
      password: 'Password@1',
      label: 'NVRCP URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.41.08/LoginRadiation.aspx',
      username: 'MQSA_2834',
      password: 'Password@1',
      label: 'NVRCP URL B',
    },
  },
  {
    id: 5,
    name: 'Product 5',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.25.03/LoginRadiation.aspx',
      username: 'Mammo_2796',
      password: 'Password@1',
      label: 'NVRCP URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.41.08/LoginRadiation.aspx',
      username: 'Mammo_7095',
      password: 'Password@1',
      label: 'NVRCP URL B',
    },
  },
  {
    id: 6,
    name: 'Product 6',
    enabled: true,
    urlA: {
      loginUrl: 'https://172.16.3.2/ALiSNVRCP2TESTING11.3.25.03/LoginRadiation.aspx',
      username: 'SL_9013',
      password: 'Password@1',
      label: 'NVRCP URL A',
    },
    urlB: {
      loginUrl: 'http://172.16.3.2/ALiSNVRCP2TESTING11.4.41.08/LoginRadiation.aspx',
      username: 'SL_1372',
      password: 'Password@1',
      label: 'NVRCP URL B',
    },
  },
];

export const CONFIG = {
  site: 'NVRCP',
  products: productComparisons,

  login: {
    usernameField: 'Login Name',
    passwordField: 'Password',
    loginButton: 'Login',
  },
};
