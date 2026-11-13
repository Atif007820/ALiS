export const TEST_DATA = {
  businessUnit: 'CMS',
  contractorRoleName: 'Conveyance Contractor',
  defaultPassword: 'Password@1',
  businessEmail: 'mohdatif.jamal@ops1.advancedgrc.com',
  alternateEmail: 'mohdatif.jamal@ops1.advancedgrc.com',
  loginNamePrefix: 'Conv_CC',
  loginNameStartDigits: 2,
  entityNamePrefix: 'CONV',
  businessContactFirstName: 'Atif',
  businessContactLastName: 'Jamal',
  registrationLocations: [
    { city: 'Seattle', state: 'WA', county: 'King', zip: '98101' },
    { city: 'Tacoma', state: 'WA', county: 'Pierce', zip: '98402' },
    { city: 'Spokane', state: 'WA', county: 'Spokane', zip: '99201' },
  ],
  addressBuildingTypes: ['Apartments', 'Building'],
  unitPrefixes: ['Suite', 'Apt', 'Unit'],

  lmaCopySource: 'MLG',
  slaCopySource: 'LMA',
  contractorCopySource: 'SLA',
  locationNotes: 'Testing Notes',

  ownerExistsOptions: ['Y','N'],
  ownerExistingUbi: '222-555-888',
  ownerComments: 'Testing the Comments field',

  uploadDocuments: [
    { fileName: 'Text1.doc', comments: 'test1' },
    { fileName: 'Text2.doc', comments: 'test2' },
  ],

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

  constructionHoistOptions: {
    carGovernor: ['Centrifugal', 'Flyball', 'Horizontal'],
    signals: ['Audible', 'Visual', 'Audible and visual'],
    entranceType: ['Sliding', 'Swing', 'Roll-up'],
    driveType: ['Geared', 'Gearless', 'Direct drive'],
    brakeType: ['Disc', 'Drum', 'Spring applied'],
    cableType: ['Steel wire rope', 'Galvanized wire rope', 'Compacted wire rope'],
    operatedOther: ['Pendant control', 'Remote control', 'Platform control'],
  },

  reviewQuestionAnswerRules: [
    {
      questionIncludes: 'Is the conveyance being installed in an existing building?',
      answer: 'N/A',
    },
    {
      questionIncludes: 'Is this location on Tribal Nation Lands, Tribal Trust Lands, or on Federal Property?',
      answer: 'NO',
    },
    {
      questionIncludes: 'Test Question online application- Initial',
      answer: 'No',
    },
  ],
  reviewFallbackAnswerOrder: ['N/A', 'NO', 'No'],
  reviewAnswers: ['N/A', 'NO', 'No'],
};
