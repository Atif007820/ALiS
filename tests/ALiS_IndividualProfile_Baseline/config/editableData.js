import { testData } from './testData.js';
import { flow2EntityNames } from './flow2EntityNames.js';
import { flow4EntityNames } from './flow4EntityNames.js';
import { buildMammoRunData } from '../data/CreateEntityData.js';

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
      { type: 'clickButton', name: 'Save' },
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

      createRunData: () => createMammoRunData(),
    },
  },
};

export function createMammoRunData() {
  return buildMammoRunData(testData);
}
