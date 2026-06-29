import { environment } from './runConfig.js';

const BASE_URLS = {
  TEST: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.38.07',
  PREPROD: 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.37.04.03',
  PROD: 'https://aliswalni-uat.aithent.com/ALiSINVPROD',
};

const ENVIRONMENT_LABELS = {
  TEST: 'Testing',
  PROD: 'PROD',
  PREPROD: 'PRE PROD',
};

const resolvedBaseUrl = process.env.BASE_URL || BASE_URLS[environment] || BASE_URLS.TEST;

export const ENVIRONMENT = environment;
export const ENVIRONMENT_LABEL = ENVIRONMENT_LABELS[environment] || environment;
export const BASE_URL = resolvedBaseUrl;
export const LOGIN_URL = `${resolvedBaseUrl}/LoginCMS.aspx`;
