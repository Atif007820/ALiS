import { testData } from './testData.js';
import { flow2EntityNames } from './flow2EntityNames.js';
import { flow4EntityNames } from './flow4EntityNames.js';
import {
  buildIndividualProfileName,
  phone,
  randomSsn,
  zip,
} from '../utils/randomData.js';

const nvrcpIndividualTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'NVRCP individual activity log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'ASG' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'NVRCP individual payment row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'clickReceiptSearchIcon', rowName: 'Search Receipt Print Delete' },
      { type: 'clickButton', name: 'Search' },
      { type: 'clickRandomReceiptSearchResult' },
    ],
  },
};

export const editableData = {
  credentials: {
    username: 'admin',
    password: 'password',
  },

  testData,

  businessUnits: {
    MAMMO: {
      applicationTypeValue: 'MAMLIC',
      applicationTypeLabel: 'Application Type *',
      licenseCredentialType: 'RADIATION THERAPIST RRT',

      flow2ProfileName: flow2EntityNames.MAMMO,
      flow4ProfileName: flow4EntityNames.MAMMO,
      skippedTabs: ['Inspection(s)'],
      tableHeaderPreconditions: nvrcpIndividualTableHeaderPreconditions,

      createRunData: () => buildMammoProfileRunData(testData),
    },
  },
};

function buildMammoProfileRunData(sourceData) {
  const profile = buildIndividualProfileName('MAMMO', 'IND');

  return {
    ...profile,
    entityName: `${profile.firstName} ${profile.lastName}`,
    fullName: `${profile.firstName} ${profile.lastName}`,
    profileDisplayName: `${profile.firstName} ${profile.lastName}`,
    createProfileActions: [
      {
        type: 'selectByLabel',
        label: 'Application Type *',
        value: 'MAMLIC',
        waitForAspNetPostback: true,
        waitAfterSelectMs: 750,
      },
      {
        type: 'waitForLink',
        name: 'License/Credential Type',
        exact: false,
        timeoutMs: 30_000,
      },
      {
        type: 'popupFromLink',
        name: 'License/Credential Type',
        exact: false,
        popupTimeoutMs: 30_000,
        samePageFallbackTimeoutMs: 15_000,
        attempts: 5,
        retryDelayMs: 1_500,
        actions: [
          { type: 'radio', name: 'RADIATION THERAPIST RRT', exact: true },
          { type: 'clickLink', name: 'OK' },
        ],
      },
    ],
    profileFields: [
      { type: 'textbox', name: 'Last Name', value: '$LAST_NAME' },
      { type: 'textbox', name: 'First Name', value: '$FIRST_NAME' },
      { type: 'textbox', name: 'Name on Radiographer', value: '$FIRST_NAME' },
      { type: 'textbox', name: 'SSN', value: randomSsn(), verifyBeforeSave: false },
      { type: 'textbox', name: 'API#', value: `API${Date.now()}`, verifyBeforeSave: false },
      { type: 'textbox', name: 'ARRT, NMTCB, and/or CMA', value: String(Date.now()).slice(-12), verifyBeforeSave: false },

      { type: 'labelNthFill', label: 'Street One', index: 0, value: 'ADE Building' },
      { type: 'labelNthFill', label: 'City', index: 0, value: 'Newark' },
      { type: 'labelNthFill', label: 'Zip', index: 0, value: zip() },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: 'LA', verifyValue: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtPhone', value: phone(), verifyBeforeSave: false },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtEMail', value: sourceData.primaryEmail },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtAltEmail', value: sourceData.alternateEmail },

      { type: 'labelNthFill', label: 'Street One', index: 1, value: 'DEF Building, Yung Street, NY' },
      { type: 'labelNthFill', label: 'Street Two', index: 1, value: 'Apt - 3/D' },
      { type: 'labelNthFill', label: 'City', index: 1, value: 'New York' },
      { type: 'labelNthFill', label: 'Fax', index: 1, value: phone(), verifyBeforeSave: false },
      { type: 'labelNthFill', label: 'Email', index: 1, exact: true, value: sourceData.primaryEmail },
      { type: 'labelNthFill', label: 'Alt Email', index: 1, value: sourceData.alternateEmail },
    ],
  };
}
