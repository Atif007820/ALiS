import { testData } from './testData.js';
import { flow2EntityNames } from './flow2EntityNames.js';
import { flow4EntityNames } from './flow4EntityNames.js';
import {
  buildBbRunData,
  buildCcpRunData,
  buildClabRunData,
  buildClRunData,
  buildConveyanceRunData,
  buildEhsRunData,
  buildEsfRunData,
  buildHmbRunData,
  buildHfRunData,
  buildHlsRunData,
  buildKpsRunData,
  buildMlRunData,
  buildMammoRunData,
  buildRmRunData,
  buildRpmRunData,
} from '../data/CreateEntityData.js';

const nvrcpTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'NVRCP Activity Log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'ASG' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'NVRCP Payment row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'clickImage', name: 'Search Receipt' },
      { type: 'clickButton', name: 'Search' },
      { type: 'clickRandomReceiptSearchResult' },
      { type: 'dismissNextDialog' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
};

const convTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'CONV activity log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'INR' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Activity Log': {
    name: 'CONV activity log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'INR' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'CONV payment row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'INR' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
};

const convActivityLogTableHeaderPreconditions = {
  'Activity Log(s)': convTableHeaderPreconditions['Activity Log(s)'],
  'Activity Log': convTableHeaderPreconditions['Activity Log'],
};

const bloodBankTableHeaderPreconditions = {
  'Owner(s)': {
    name: 'BB owner row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Last Name', value: 'Atif' },
      { type: 'textbox', name: 'First Name', value: 'Jamal' },
      { type: 'checkbox', name: 'Owner' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Personnel(s)': {
    name: 'BB personnel row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Last Name', value: 'Atif' },
      { type: 'textbox', name: 'First Name', value: 'Jamal' },
      { type: 'checkbox', name: 'Blood Bank Director' },
      { type: 'rowSelectByLabel', rowName: 'Sunday -- Choose One --', label: 'Work Hours', value: 'OCL' },
      { type: 'rowSelectByLabel', rowName: 'Monday -- Choose One --', label: 'Work Hours', value: 'OCL' },
      { type: 'rowSelectByLabel', rowName: 'Tuesday -- Choose One --', label: 'Work Hours', value: 'NAV' },
      { type: 'rowSelectByLabel', rowName: 'Wednesday -- Choose One --', label: 'Work Hours', value: 'NAV' },
      { type: 'rowSelectByLabel', rowName: 'Thursday -- Choose One --', label: 'Work Hours', value: 'OCL' },
      { type: 'rowSelectByLabel', rowName: 'Friday -- Choose One --', label: 'Work Hours', value: 'OCL' },
      { type: 'locatorSelect', selector: '#ddlEventHours_0_6', value: 'OCL' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Additional Information': {
    name: 'BB Blood Bank Information row',
    actions: [
      { type: 'clickLinkNearText', nearText: 'Blood Bank Information', name: 'Add' },
      { type: 'selectByLabel', label: 'Type', value: 'UCD' },
      { type: 'clickButton', name: 'img search', exact: false },
      { type: 'clickButton', name: 'Search' },
      { type: 'clickRandomNameSearchResult' },
      { type: 'dismissNextDialog' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Activity Log(s)': {
    name: 'BB activity log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'INR' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
};

const clinicalLabTableHeaderPreconditions = {
  'Owner(s)': {
    name: 'CLab owner row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Last Name', value: 'Jamal' },
      { type: 'textbox', name: 'First Name', value: 'Atif' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Personnel(s)': {
    name: 'CLab personnel row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Last Name', value: 'Jamal' },
      { type: 'textbox', name: 'First Name', value: 'Atif' },
      { type: 'selectByLabel', label: 'Employment Type', value: 'FT' },
      { type: 'checkbox', name: 'General Supervisor', exact: true },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Activity Log(s)': {
    name: 'CLab activity log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'INR' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
};

const embryoStorageFacilityTableHeaderPreconditions = {
  'Owner(s)': {
    name: 'ESF owner row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Applicant Last Name', value: 'Jamal' },
      { type: 'textbox', name: 'Applicant First Name', value: 'Atif' },
      { type: 'checkbox', name: 'ESF Owner' },
      { type: 'checkbox', name: 'Individual or Sole' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Personnel(s)': {
    name: 'ESF personnel row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Last Name', value: 'Jamal' },
      { type: 'textbox', name: 'First Name', value: 'Atif' },
      { type: 'checkbox', name: 'Medical Director' },
      { type: 'checkbox', name: 'Administrator' },
      { type: 'textbox', name: 'Title of Administrator', value: 'Admin' },
      { type: 'textbox', name: 'Primary Phone #', exact: true, value: '345-454-3534' },
      { type: 'textbox', name: 'Primary E-mail', value: testData.primaryEmail },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Additional Information': {
    name: 'ESF additional information row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Name', value: 'Atif' },
      { type: 'textbox', name: 'Description of Activities', value: 'ESF Services' },
      { type: 'textbox', name: 'Address', value: 'ABC' },
      { type: 'textbox', name: 'City', value: 'Newark' },
      { type: 'textbox', name: 'Primary Phone #', exact: true, value: '354-454-5654' },
      { type: 'textbox', name: 'Zip', value: '46564-5654' },
      { type: 'textbox', name: 'Primary E-mail', value: testData.primaryEmail },
      { type: 'selectByLabel', label: 'County', value: '13' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Activity Log(s)': {
    name: 'ESF activity log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'INR' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
};

const humanMilkBankTableHeaderPreconditions = {
  'Owner(s)': {
    name: 'HMB owner row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Last Name', value: 'Jamal' },
      { type: 'textbox', name: 'First Name', value: 'Atif' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Personnel(s)': {
    name: 'HMB personnel row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Last Name', value: 'Jamal' },
      { type: 'textbox', name: 'First Name', value: 'Atif' },
      { type: 'radio', name: 'HMB ADMINISTRATOR', exact: true },
      { type: 'textbox', name: 'Address', value: 'ABC' },
      { type: 'textbox', name: 'City', value: 'Newark' },
      { type: 'textbox', name: 'Zip', value: '23534-6456' },
      { type: 'textbox', name: 'Primary Phone #', exact: true, value: '465-645-6546' },
      { type: 'textbox', name: 'Primary E-mail', value: testData.primaryEmail },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Additional Information': {
    name: 'HMB additional information row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'textbox', name: 'Name', value: 'Atif' },
      { type: 'textbox', name: 'HMB Service(s) Performed', value: 'HMB service' },
      { type: 'textbox', name: 'Address', value: 'ABC' },
      { type: 'textbox', name: 'Zip', value: '34546-4564' },
      { type: 'textbox', name: 'City', value: 'N' },
      { type: 'textbox', name: 'Primary Phone #', exact: true, value: '365-465-6567' },
      { type: 'textbox', name: 'Primary E-mail', value: testData.primaryEmail },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Activity Log(s)': {
    name: 'HMB activity log row',
    actions: [
      { type: 'clickLink', name: 'Add' },
      { type: 'selectByLabel', label: 'Action Code', value: 'INR' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
};

const dpbhReceiptPaymentActions = [
  { type: 'clickLink', name: 'Add' },
  { type: 'clickReceiptSearchIcon', rowName: 'Search Receipt Print Delete' },
  { type: 'clickButton', name: 'Search' },
  { type: 'selectRandomReceiptSearchResultAndSave', allowNoRecords: true },
];

const healthFacilitiesTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'HF activity log row',
    actions: [
      {
        type: 'openFormFromLink',
        name: 'Add',
        expectedLabel: 'Action Code',
        attempts: 3,
        timeoutMs: 10_000,
      },
      { type: 'selectByLabel', label: 'Action Code', value: 'CHOWHHF' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'HF payment row',
    actions: [...dpbhReceiptPaymentActions],
  },
};

const medicalLaboratoriesTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'ML activity log row',
    actions: [
      {
        type: 'openFormFromLink',
        name: 'Add',
        expectedLabel: 'Action Code',
        attempts: 3,
        timeoutMs: 10_000,
      },
      { type: 'selectByLabel', label: 'Action Code', value: 'IPNT' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'ML payment row',
    actions: [...dpbhReceiptPaymentActions],
  },
};

const environmentalHealthSectionTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'EHS activity log row',
    actions: [
      {
        type: 'openFormFromLink',
        name: 'Add',
        expectedLabel: 'Action Code',
        attempts: 3,
        timeoutMs: 10_000,
      },
      { type: 'selectByLabel', label: 'Action Code', value: 'IRQ' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'EHS payment row',
    actions: [...dpbhReceiptPaymentActions],
  },
};

const childCareProgramTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'CCP activity log row',
    actions: [
      {
        type: 'openFormFromLink',
        name: 'Add',
        expectedLabel: 'Action Code',
        attempts: 3,
        timeoutMs: 10_000,
      },
      { type: 'selectByLabel', label: 'Action Code', value: 'IRQ' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'CCP payment row',
    actions: [...dpbhReceiptPaymentActions],
  },
};

const kitchenPoolSpaTableHeaderPreconditions = {
  'Activity Log(s)': {
    name: 'KPS activity log row',
    actions: [
      {
        type: 'openFormFromLink',
        name: 'Add',
        expectedLabel: 'Action Code',
        attempts: 3,
        timeoutMs: 10_000,
      },
      { type: 'selectByLabel', label: 'Action Code', value: 'CIC' },
      { type: 'richTextFill', selector: '.angular-editor-textarea', value: 'Test' },
      { type: 'clickButton', name: 'Save' },
    ],
  },
  'Payment(s)': {
    name: 'KPS payment row',
    actions: [...dpbhReceiptPaymentActions],
  },
};

const conveyanceUserTypes = {
  CONV_CC: {
    entityPrefix: 'CC',
    radioName: 'Conveyance Contractor',
    tableHeaderPreconditions: convTableHeaderPreconditions,
    licenseFields: [
      { name: 'Elevator Contractor License #', prefix: 'ECL' },
      { name: 'General Contractor License #', prefix: 'GCL' },
    ],
  },
  CONV_BO: {
    entityPrefix: 'BO',
    radioName: 'Building Owner',
    tableHeaderPreconditions: convTableHeaderPreconditions,
  },
  CONV_PM: {
    entityPrefix: 'PM',
    radioName: 'Property Manager',
    tableHeaderPreconditions: convActivityLogTableHeaderPreconditions,
  },
};

const conveyanceRequiredFieldOverrides = [
  {
    parentTab: 'Entity Information',
    sectionHeader: 'Entity Mailing Address',
    fieldLabel: 'County',
    required: 'Yes',
  },
];

const dpbhRequiredFieldOverrides = [
  {
    parentTab: 'Entity Information',
    sectionHeader: 'Physical Address of Facility',
    fieldLabel: 'County',
    required: 'No',
  },
];

const conveyanceBusinessUnits = Object.fromEntries(
  Object.entries(conveyanceUserTypes).map(([id, userType]) => [
    id,
    {
      createBusinessUnitValue: 'CMS',
      modifyBusinessUnitOption: 'Conveyance',
      modifyEntitySearchFieldNames: ['Entity Name'],

      entityPrefix: userType.entityPrefix,
      flow2EntityName: flow2EntityNames[id],
      flow4EntityName: flow4EntityNames[id],
      createEntityNameFieldNames: ['Entity Name'],

      tableHeaderPreconditions: userType.tableHeaderPreconditions,
      requiredFieldOverrides: conveyanceRequiredFieldOverrides,
      alwaysSearchAfterCreate: true,

      createRunData: () => buildConveyanceRunData(testData, userType),
    },
  ]),
);

export const editableData = {
  credentials: {
    username: 'admin',
    password: 'password',
  },

  testData,

  businessUnits: {
    HLS: {
      createBusinessUnitValue: 'HLS',
      modifyBusinessUnitOption: 'Health Labour Standards',

      entityPrefix: 'HLS',
      flow2EntityName: flow2EntityNames.HLS,
      flow4EntityName: flow4EntityNames.HLS,

      createRunData: () => buildHlsRunData(testData),
    },
    CL: {
      createBusinessUnitValue: 'CL',
      modifyBusinessUnitOption: 'Child Labor',
      modifyEntitySearchFieldNames: [
        'Entity Name(Legal Name)',
        'Entity Name (Legal Name)',
        'Entity Name',
      ],

      entityPrefix: 'CL',
      flow2EntityName: flow2EntityNames.CL,
      flow4EntityName: flow4EntityNames.CL,
      ignoredInformativeTextPatterns: [
        '^You are associated with multiple business unit\\(s\\), please select Business Unit to open profile\\.?$',
      ],

      createRunData: () => buildClRunData(testData),
    },
    BB: {
      createBusinessUnitValue: 'Blood Bank',
      createBusinessUnitActions: [
        { type: 'clickTextbox', name: '-- Choose One --', exact: true },
        { type: 'clickOption', name: 'Blood Bank', exact: true },
      ],
      modifyBusinessUnitOption: 'Blood Bank',
      modifyEntitySearchFieldNames: [
        'Facility Name (Legal Name)',
        'Entity Name',
        'Facility Name',
      ],

      entityPrefix: 'BB',
      flow2EntityName: flow2EntityNames.BB,
      flow4EntityName: flow4EntityNames.BB,
      createEntityNameFieldNames: ['Facility Name (Legal Name)'],

      tableHeaderPreconditions: bloodBankTableHeaderPreconditions,
      alwaysSearchAfterCreate: true,

      createRunData: () => buildBbRunData(testData),
    },
    CLAB: {
      createBusinessUnitValue: 'Clinical Laboratory',
      createBusinessUnitActions: [
        { type: 'clickTextbox', name: '-- Choose One --', exact: true },
        { type: 'clickOption', name: 'Clinical Laboratory', exact: true },
      ],
      modifyBusinessUnitOption: 'Clinical Laboratory',
      modifyEntitySearchFieldNames: [
        'Facility Name (Legal Name)',
        'Laboratory Name',
        'Entity Name',
        'Facility Name',
      ],

      entityPrefix: 'CL',
      flow2EntityName: flow2EntityNames.CLAB,
      flow4EntityName: flow4EntityNames.CLAB,
      createEntityNameFieldNames: ['Laboratory Name'],

      tableHeaderPreconditions: clinicalLabTableHeaderPreconditions,
      alwaysSearchAfterCreate: true,

      createRunData: () => buildClabRunData(testData),
    },
    ESF: {
      createBusinessUnitValue: 'Embryo Storage Facility',
      createBusinessUnitActions: [
        { type: 'clickTextbox', name: '-- Choose One --', exact: true },
        { type: 'clickOption', name: 'Embryo Storage Facility', exact: true },
      ],
      modifyBusinessUnitOption: 'Embryo Storage Facility',
      modifyEntitySearchFieldNames: [
        'Entity Name (Legal Name)',
        'Entity Name',
        'Facility Name',
      ],

      entityPrefix: 'ESF',
      flow2EntityName: flow2EntityNames.ESF,
      flow4EntityName: flow4EntityNames.ESF,
      createEntityNameFieldNames: ['Entity Name (Legal Name)'],

      tableHeaderPreconditions: embryoStorageFacilityTableHeaderPreconditions,
      alwaysSearchAfterCreate: true,

      createRunData: () => buildEsfRunData(testData),
    },
    HMB: {
      createBusinessUnitValue: 'Human Milk Bank',
      createBusinessUnitActions: [
        { type: 'clickTextbox', name: '-- Choose One --', exact: true },
        { type: 'clickOption', name: 'Human Milk Bank', exact: true },
      ],
      modifyBusinessUnitOption: 'Human Milk Bank',
      modifyEntitySearchFieldNames: [
        'Entity Name (Legal Name)',
        'Entity Name',
        'Facility Name',
      ],

      entityPrefix: 'HMB',
      flow2EntityName: flow2EntityNames.HMB,
      flow4EntityName: flow4EntityNames.HMB,
      createEntityNameFieldNames: ['Entity Name (Legal Name)'],

      tableHeaderPreconditions: humanMilkBankTableHeaderPreconditions,
      alwaysSearchAfterCreate: true,

      createRunData: () => buildHmbRunData(testData),
    },
    HF: {
      createBusinessUnitValue: 'HHF',
      modifyBusinessUnitOption: 'Health Facilities',
      modifyEntitySearchFieldNames: [
        'Facility Name',
        'Entity Name',
      ],

      entityPrefix: 'HF',
      flow2EntityName: flow2EntityNames.HF,
      flow4EntityName: flow4EntityNames.HF,
      createEntityNameFieldNames: ['Facility Name (DBA Name)'],

      tableHeaderPreconditions: healthFacilitiesTableHeaderPreconditions,
      requiredFieldOverrides: dpbhRequiredFieldOverrides,
      alwaysSearchAfterCreate: true,
      preferPostCreateEditLink: true,

      createRunData: () => buildHfRunData(testData),
    },
    ML: {
      createBusinessUnitValue: 'HML',
      modifyBusinessUnitOption: 'Medical Laboratories',
      modifyEntitySearchFieldNames: [
        'Facility Name',
        'Entity Name',
      ],

      entityPrefix: 'ML',
      flow2EntityName: flow2EntityNames.ML,
      flow4EntityName: flow4EntityNames.ML,
      createEntityNameFieldNames: ['Facility Name (DBA Name)'],

      tableHeaderPreconditions: medicalLaboratoriesTableHeaderPreconditions,
      requiredFieldOverrides: dpbhRequiredFieldOverrides,
      alwaysSearchAfterCreate: true,
      preferPostCreateEditLink: true,

      createRunData: () => buildMlRunData(testData),
    },
    EHS: {
      createBusinessUnitValue: 'EHS',
      modifyBusinessUnitOption: 'Environmental Health Section',
      modifyEntitySearchFieldNames: [
        'Facility Name',
        'Entity Name',
      ],

      entityPrefix: 'EHS',
      flow2EntityName: flow2EntityNames.EHS,
      flow4EntityName: flow4EntityNames.EHS,
      createEntityNameFieldNames: ['Facility Name (DBA Name)'],

      tableHeaderPreconditions: environmentalHealthSectionTableHeaderPreconditions,
      requiredFieldOverrides: dpbhRequiredFieldOverrides,
      alwaysSearchAfterCreate: true,

      createRunData: () => buildEhsRunData(testData),
    },
    CCP: {
      createBusinessUnitValue: 'CCP',
      modifyBusinessUnitOption: 'Child Care Program',
      modifyEntitySearchFieldNames: [
        'Facility Name',
        'Entity Name',
      ],

      entityPrefix: 'CCP',
      flow2EntityName: flow2EntityNames.CCP,
      flow4EntityName: flow4EntityNames.CCP,
      createEntityNameFieldNames: ['Facility Name (DBA Name)'],

      tableHeaderPreconditions: childCareProgramTableHeaderPreconditions,
      requiredFieldOverrides: dpbhRequiredFieldOverrides,
      alwaysSearchAfterCreate: true,
      preferPostCreateEditLink: true,

      createRunData: () => buildCcpRunData(testData),
    },
    KPS: {
      createBusinessUnitValue: 'HKP',
      modifyBusinessUnitOption: 'Kitchen Pool & Spa',
      modifyEntitySearchFieldNames: [
        'Facility Name',
        'Entity Name',
      ],

      entityPrefix: 'KPS',
      flow2EntityName: flow2EntityNames.KPS,
      flow4EntityName: flow4EntityNames.KPS,
      createEntityNameFieldNames: ['Facility Name (DBA Name)'],

      tableHeaderPreconditions: kitchenPoolSpaTableHeaderPreconditions,
      requiredFieldOverrides: dpbhRequiredFieldOverrides,
      alwaysSearchAfterCreate: true,
      preferPostCreateEditLink: true,

      createRunData: () => buildKpsRunData(testData),
    },
    ...conveyanceBusinessUnits,
    RPM: {
      createBusinessUnitValue: 'RPM',
      modifyBusinessUnitOption: 'Radiation Producing Machine',
      modifyEntityTypeOption: 'Agency',
      businessEntityActionIndexes: { Modify: [1] },
      modifyEntitySearchFieldNames: ['Entity Name', 'Facility Name'],

      entityPrefix: 'RPM',
      viewExistingEntityFallbackToPrefix: true,
      flow2EntityName: flow2EntityNames.RPM,
      flow4EntityName: flow4EntityNames.RPM,
      createEntityNameSelectors: ['#ctl00_ContentPlaceHolder2_ucBEInformationAdd_txtFacilityName'],
      createEntityNameFieldNames: ['Facility Name'],

      tableHeaderPreconditions: nvrcpTableHeaderPreconditions,

      createRunData: () => buildRpmRunData(testData),
    },
    RM: {
      createBusinessUnitValue: 'RAM',
      modifyBusinessUnitOption: 'Radioactive Material',
      modifyEntityTypeOption: 'Agency',
      businessEntityActionIndexes: { Modify: [1] },
      modifyEntitySearchFieldNames: ['Entity Name', 'Facility Name'],

      entityPrefix: 'RM',
      viewExistingEntityFallbackToPrefix: true,
      flow2EntityName: flow2EntityNames.RM,
      flow4EntityName: flow4EntityNames.RM,
      createEntityNameSelectors: ['#ctl00_ContentPlaceHolder2_ucBEInformationAdd_txtFacilityName'],
      createEntityNameFieldNames: ['Facility Name'],

      tableHeaderPreconditions: nvrcpTableHeaderPreconditions,

      createRunData: () => buildRmRunData(testData),
    },
    MAMMO: {
      createBusinessUnitValue: 'MAM',
      modifyBusinessUnitOption: 'Mammography, Licensing and Registrations',
      modifyEntityTypeOption: 'Agency',
      businessEntityActionIndexes: { Modify: [1] },
      modifyEntitySearchFieldNames: ['Entity Name', 'Facility Name'],

      entityPrefix: 'MAMMO',
      viewExistingEntityFallbackToPrefix: true,
      flow2EntityName: flow2EntityNames.MAMMO,
      flow4EntityName: flow4EntityNames.MAMMO,
      createEntityNameSelectors: ['#ctl00_ContentPlaceHolder2_ucBEInformationAdd_txtFacilityName'],
      createEntityNameFieldNames: ['Facility Name'],

      tableHeaderPreconditions: nvrcpTableHeaderPreconditions,

      createRunData: () => buildMammoRunData(testData),
    },
  },
};
