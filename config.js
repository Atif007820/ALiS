import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const DEMO_RUN_DIR = dirname(fileURLToPath(import.meta.url));

export const BASE_URL = 'http://172.16.3.2/ALiSWADLNI2TESTING11.4.37';
export const LOGIN_URL = `${BASE_URL}/LoginCMS.aspx`;

export const USER_DATA_PATH = join(DEMO_RUN_DIR, 'userData.json');
export const UPLOAD_FILES_DIR = join(process.cwd(), 'UploadFiles');

export const APPLY_CONFIG = {
  // Change this manually to 'RESIDENTIAL' or 'COMMERCIAL' before running.
  licenseType: 'COMMERCIAL',
};

export const TEST_DATA = {
  // Registration
  businessUnit: 'CMS',
  contractorRoleName: 'Conveyance Contractor',
  defaultPassword: 'Password@1',
  businessEmail: 'mohdatif.jamal@ops1.advancedgrc.com',
  alternateEmail: 'atif.testingengineer@gmail.com',
  entityNamePrefix: 'Test Lab',
  businessContactFirstName: 'Atif',
  businessContactLastName: 'Jamal',
  addressBuildingTypes: ['Apartments', 'Building'],
  unitPrefixes: ['Suite', 'Apt', 'Unit'],

  // Address
  lmaCopySource: 'MLG',
  slaCopySource: 'LMA',
  contractorCopySource: 'SLA',
  locationNotes: 'Testing Notes',

  // Owner
  ownerExistsOptions: ['Y', 'N'],
  ownerExistingUbi: '222-555-888',
  ownerComments: 'Testing the Comments field',

  // Documents
  uploadDocuments: [
    { fileName: 'Text1.doc', comments: 'test1' },
    { fileName: 'Text2.doc', comments: 'test2' },
  ],

  // Machine information
  slowFieldTimeoutMs: 30000,
  slowFieldRetryCount: 3,
  slowFieldRetryDelayMs: 500,
  riseInInchMin: 1,
  riseInInchMax: 11,
  yesNoOptions: ['Yes', 'No'],
  buildingNameSuffixes: ['Building', 'Apartment'],
  alphaAddressSuffixes: ['Apartments', 'Building'],
  traderManufacturerSuffixes: ['Traders', 'Manufacturer'],
  escModelDigitLengths: [1, 2, 3],
  designationPrefixes: ['DES', 'DG', 'TAG', 'CD'],
  randomLocationSuffixes: ['Road', 'Street', 'Avenue', 'Lane'],
  interiorTypeOtherDescription: 'Testing Other Material Field',
  governorTypeOtherDescription: 'Testing Governor Type field',
  governorTypeOtherDescriptionCW: 'Testing Governor Type field 2',

  // Review / attestation
  reviewAnswers: ['N/A', 'NO', 'No'],
};
