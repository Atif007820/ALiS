import {
  numberWithDigitLength,
  phone,
  pick,
  simplePerson,
  zip,
} from '../utils/randomData.js';

const rpmCountyValues = [
  'CC', 'CH', 'CL', 'DO', 'EL', 'ES', 'EU', 'HU', 'LA',
  'LI', 'LY', 'MI', 'NY', 'PE', '00', 'ST', 'WA', 'WH',
];

export function buildHlsRunData(testData) {
  const person = simplePerson(testData);
  const city = pick(testData.cities);
  const address = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;

  return {
    createEntityFields: [
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'selectByLabel', label: 'Role', value: 'ADM' },
      { type: 'locatorFill', selector: '#txtPhone', value: phone() },
      { type: 'textbox', name: 'Contact Person', value: `${person.firstName} ${person.lastName}` },
      { type: 'textbox', name: 'Address', value: `${address}, ${city}` },
      { type: 'textbox', name: 'Suite/Apt/Unit/etc.', value: `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}` },
      { type: 'textbox', name: 'City', value: city },
      { type: 'selectByLabel', label: 'State/Province', value: pick(testData.usStates) },
      { type: 'textbox', name: 'Zip', value: zip() },
      { type: 'textbox', name: 'Primary Phone #', exact: true, value: phone() },
      { type: 'textbox', name: 'Alternate Phone #', exact: true, value: phone() },
      { type: 'textbox', name: 'Fax', value: phone() },
      { type: 'textbox', name: 'Primary E-mail', value: testData.primaryEmail },
      { type: 'textbox', name: 'Alternate E-mail', value: testData.alternateEmail },
    ],
  };
}

export function buildClRunData(testData) {
  const person = simplePerson(testData);
  const city = pick(testData.cities);
  const address = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;

  return {
    createEntityFields: [
      { type: 'textbox', name: 'Business Name (DBA)', value: `CL_${numberWithDigitLength(5)}` },
      { type: 'textbox', name: 'UBI #', value: `${numberWithDigitLength(3)}-${numberWithDigitLength(3)}-${numberWithDigitLength(3)}` },
      { type: 'textbox', name: 'Location ID', value: numberWithDigitLength(5) },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'selectByLabel', label: 'Role', value: 'PAR' },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtPhone', value: phone() },
      { type: 'textbox', name: 'Address', value: address },
      { type: 'textbox', name: 'Suite/Apt/Unit/etc.', value: `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}` },
      { type: 'textbox', name: 'City', value: city },
      { type: 'selectByLabel', label: 'State/Province', value: pick(testData.usStates) },
      { type: 'textbox', name: 'Zip', value: zip() },
      { type: 'textbox', name: 'Primary Phone #', exact: true, value: phone() },
      { type: 'textbox', name: 'Primary E-mail', value: testData.primaryEmail },
      { type: 'textbox', name: 'Alternate E-mail', value: testData.alternateEmail },
    ],
  };
}

export function buildBbRunData(testData) {
  const person = simplePerson(testData);
  const city = pick(testData.cities);
  const address = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;

  return {
    beforeCreateEntityActions: [
      { type: 'clickText', text: 'License Type', exact: true },
      { type: 'clickText', text: 'Component Preparation - RBC' },
      { type: 'clickText', text: 'COLLECTION SERVICES - DOUBLE RED CELL', exact: true },
      { type: 'clickText', text: 'INFUSION - CORD BLOOD (' },
      { type: 'clickButton', name: 'Ok' },
      { type: 'locatorFill', selector: 'textarea', value: 'Test BB' },
    ],
    createEntityFields: [
      { type: 'textbox', name: 'Facility Name (DBA Name)', value: '$ENTITY_NAME' },
      { type: 'textbox', name: 'Federal Tax ID#', value: numberWithDigitLength(6) },
      { type: 'selectByLabel', label: 'Ownership Type', value: 'IND' },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'selectByLabel', label: 'Role', value: 'ADM' },
      { type: 'locatorFill', selector: '#txtPhone', value: phone() },
      { type: 'locatorFill', selector: '#txtAddress_MLG', value: address },
      { type: 'locatorFill', selector: '#lblApt_MLG', value: `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}` },
      { type: 'locatorFill', selector: '#txtCity_MLG', value: city },
      { type: 'locatorFill', selector: '#txtZip_MLG', value: zip() },
      { type: 'locatorSelect', selector: '#ddlCounty_MLG', value: '13' },
      { type: 'locatorFill', selector: '#txtPrimaryPhone_MLG', value: phone() },
      { type: 'locatorFill', selector: '#txtPrimaryEmail_MLG', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtAlternateEmail_MLG', value: testData.alternateEmail },
      { type: 'locatorSelect', selector: '#ddlCopy_PHL', value: 'MLG', waitAfterSelectMs: 700, verifyBeforeSave: false },
      { type: 'selectAllByLabelText', label: 'County', value: '13' },
    ],
  };
}

export function buildClabRunData(testData) {
  const person = simplePerson(testData);
  const city = pick(testData.cities);
  const address = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;

  return {
    beforeCreateEntityActions: [
      { type: 'clickText', text: 'License Type', exact: true },
      { type: 'clickText', text: 'Aerobic', exact: true },
      { type: 'clickText', text: 'Erythropoietin' },
      { type: 'clickText', text: 'Prealbumin' },
      { type: 'clickText', text: 'Zinc' },
      { type: 'clickText', text: 'SCL-' },
      { type: 'clickButton', name: 'Ok' },
      { type: 'locatorFill', selector: 'textarea', value: 'Test Clinical Lab' },
    ],
    createEntityFields: [
      { type: 'textbox', name: 'Registered Legal Business Name', value: '$ENTITY_NAME' },
      { type: 'textbox', name: 'Federal Tax ID#', value: numberWithDigitLength(10) },
      { type: 'selectByLabel', label: 'Ownership Type', value: 'IND' },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'selectByLabel', label: 'Role', value: 'ADM' },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtPhone', value: phone() },
      { type: 'locatorFill', selector: '#txtAddress_MLG', value: address },
      { type: 'locatorFill', selector: '#lblApt_MLG', value: `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}` },
      { type: 'locatorFill', selector: '#txtCity_MLG', value: city },
      { type: 'locatorFill', selector: '#txtZip_MLG', value: zip() },
      { type: 'locatorSelect', selector: '#ddlCounty_MLG', value: '07' },
      { type: 'locatorFill', selector: '#txtPrimaryPhone_MLG', value: phone() },
      { type: 'locatorFill', selector: '#txtPrimaryEmail_MLG', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtAlternateEmail_MLG', value: testData.alternateEmail },
      { type: 'locatorSelect', selector: '#ddlCopy_PHL', value: 'MLG', waitAfterSelectMs: 700, verifyBeforeSave: false },
      { type: 'selectAllByLabelText', label: 'County', value: '07' },
    ],
    beforeCreateSaveActions: [
      { type: 'locatorSelect', selector: '#ddlCounty_MLG', value: '07', verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
      { type: 'selectAllByLabelText', label: 'County', value: '07' },
    ],
  };
}

export function buildEsfRunData(testData) {
  const person = simplePerson(testData);
  const city = pick(testData.cities);
  const address = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;

  return {
    beforeCreateEntityActions: [
      { type: 'clickText', text: 'License Type', exact: true },
      { type: 'clickButton', name: 'Ok' },
      { type: 'locatorFill', selector: 'textarea', value: 'Test ESF' },
    ],
    createEntityFields: [
      { type: 'textbox', name: 'Entity Name (DBA Name)', value: '$ENTITY_NAME' },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'selectByLabel', label: 'Role', value: 'ADM' },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtPhone', value: phone() },
      { type: 'locatorFill', selector: '#ContactName_MLG', value: person.firstName },
      { type: 'locatorFill', selector: '#txtAddress_MLG', value: address },
      { type: 'locatorFill', selector: '#lblApt_MLG', value: `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}` },
      { type: 'locatorFill', selector: '#txtCity_MLG', value: city },
      { type: 'locatorFill', selector: '#txtZip_MLG', value: zip() },
      { type: 'locatorFill', selector: '#txtPrimaryPhone_MLG', value: phone() },
      { type: 'locatorFill', selector: '#txtPrimaryEmail_MLG', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtAlternateEmail_MLG', value: testData.alternateEmail },
      { type: 'locatorSelect', selector: '#ddlCounty_MLG', value: '13', verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorSelect', selector: '#ddlCopy_PHL', value: 'MLG', waitAfterSelectMs: 700, verifyBeforeSave: false },
      { type: 'locatorSelect', selector: '#ddlCopy_RAA', value: 'PHL', waitAfterSelectMs: 700, verifyBeforeSave: false },
    ],
    beforeCreateSaveActions: [
      { type: 'locatorSelect', selector: '#ddlCounty_MLG', value: '13', verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
    ],
  };
}

export function buildHmbRunData(testData) {
  const person = simplePerson(testData);
  const city = pick(testData.cities);
  const address = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;

  return {
    beforeCreateEntityActions: [
      { type: 'clickTextbox', name: '-- Choose One --', exact: true },
      { type: 'clickOption', name: 'Initial Registration and Accreditation by Deemed Status (HMBANA-accredited' },
      { type: 'clickText', text: 'Certificate Type', exact: true },
      { type: 'clickText', text: 'Collection', exact: true },
      { type: 'clickButton', name: 'Ok' },
      { type: 'locatorFill', selector: 'textarea', value: 'Test HMB' },
    ],
    createEntityFields: [
      { type: 'textbox', name: 'Entity Name (DBA Name)', value: '$ENTITY_NAME' },
      { type: 'selectByLabel', label: 'Ownership Type', value: 'IND' },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'selectByLabel', label: 'Role', value: 'ADM' },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtPhone', value: phone() },
      { type: 'locatorFill', selector: '#ContactName_MLG', value: person.firstName },
      { type: 'locatorFill', selector: '#txtAddress_MLG', value: address },
      { type: 'locatorFill', selector: '#lblApt_MLG', value: `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}` },
      { type: 'locatorFill', selector: '#txtCity_MLG', value: city },
      { type: 'locatorFill', selector: '#txtZip_MLG', value: zip() },
      { type: 'locatorFill', selector: '#txtPrimaryPhone_MLG', value: phone() },
      { type: 'locatorFill', selector: '#txtPrimaryEmail_MLG', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtAlternateEmail_MLG', value: testData.alternateEmail },
      { type: 'locatorSelect', selector: '#ddlCopy_PHL', value: 'MLG', waitAfterSelectMs: 700, verifyBeforeSave: false },
      { type: 'locatorSelect', selector: '#ddlCounty_PHL', value: '13', verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorSelect', selector: '#ddlCopy_RAA', value: 'PHL', waitAfterSelectMs: 700, verifyBeforeSave: false },
    ],
    beforeCreateSaveActions: [
      { type: 'locatorSelect', selector: '#ddlCounty_PHL', value: '13', verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
    ],
  };
}

export function buildHfRunData(testData) {
  return buildDpbhFacilityRunData(testData, {
    applicationType: 'NHF',
    credentialPopupActions: [
      { type: 'radio', name: 'BUSINESS THAT PROVIDES', exact: false },
      { type: 'checkbox', name: 'CLASS - A', exact: true },
      { type: 'clickLink', name: 'OK' },
    ],
    mailingCounty: 'LA',
  });
}

export function buildMlRunData(testData) {
  return buildDpbhFacilityRunData(testData, {
    applicationType: 'MEL',
    credentialPopupActions: [
      { type: 'radio', name: 'PUBLIC HEALTH REGISTERED', exact: false },
      { type: 'clickLink', name: 'OK' },
    ],
    mailingCounty: 'MI',
  });
}

export function buildEhsRunData(testData) {
  return buildDpbhFacilityRunData(testData, {
    applicationType: 'CM',
    credentialPopupActions: [
      { type: 'checkbox', name: 'Select', exact: true },
      { type: 'clickLink', name: 'OK' },
    ],
    mailingCounty: 'HU',
    contactRole: 'OWN',
    copyPhysicalFromMailing: true,
    gateCode: `GC${numberWithDigitLength(3)}`,
  });
}

export function buildCcpRunData(testData) {
  return buildDpbhFacilityRunData(testData, {
    applicationType: 'CFL',
    credentialPopupActions: [
      { type: 'radio', name: 'CENTER', exact: true },
      { type: 'clickLink', name: 'OK' },
    ],
    mailingCounty: 'EL',
    physicalCounty: 'CH',
    contactRole: 'OWN',
    gateCode: `GC${numberWithDigitLength(3)}`,
  });
}

export function buildKpsRunData(testData) {
  return buildDpbhFacilityRunData(testData, {
    applicationType: 'KIHF',
    credentialPopupActions: [
      { type: 'radio', name: 'FOOD ESTABLISHMENT - MAIN', exact: false },
      { type: 'clickLink', name: 'OK' },
    ],
    mailingCounty: 'ST',
    physicalCounty: 'ES',
    contactRole: 'ADM',
    gateCode: `GC${numberWithDigitLength(3)}`,
    reloadBeforeApplicationType: true,
    reloadAfterApplicationType: true,
  });
}

function buildDpbhFacilityRunData(testData, {
  applicationType,
  credentialPopupActions,
  mailingCounty,
  physicalCounty = mailingCounty,
  contactRole = 'ADM',
  copyPhysicalFromMailing = false,
  gateCode = '',
  reloadBeforeApplicationType = false,
  reloadAfterApplicationType = false,
}) {
  const person = simplePerson(testData);
  const mailingCity = pick(testData.cities);
  const mailingAddress = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;
  const mailingUnit = `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}`;
  const mailingZip = zip();
  const primaryPhone = phone();
  const mailingPhone = phone();
  const mailingFax = phone();
  const nvBusinessId = `NV${numberWithDigitLength(11)}`;
  const contactFields = [
    { type: 'textbox', name: 'First Name', value: person.firstName },
    { type: 'textbox', name: 'Last Name', value: person.lastName },
    { type: 'textbox', name: 'Email', exact: true, value: testData.primaryEmail },
    { type: 'selectByLabel', label: 'Role', value: contactRole },
    { type: 'textbox', name: 'Phone', exact: true, value: primaryPhone },
  ];
  const mailingAddressFields = [
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtContactPerson', value: `${person.firstName} ${person.lastName}`, optional: true },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet1', value: mailingAddress },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet2', value: mailingUnit },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtCity', value: mailingCity },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtZip', value: mailingZip },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtPhone', value: mailingPhone },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtFax', value: mailingFax },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtEMail', value: testData.primaryEmail },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtAltEmail', value: testData.alternateEmail },
  ];
  const physicalAddressFields = [
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet1', value: mailingAddress },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet2', value: mailingUnit, optional: true },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtCity', value: mailingCity },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtZip', value: mailingZip },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtPhone', value: mailingPhone, optional: true },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtFax', value: mailingFax, optional: true },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtEMail', value: testData.primaryEmail, optional: true },
    { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtAltEmail', value: testData.alternateEmail, optional: true },
  ];
  const copyPhysicalAddressAction = copyPhysicalFromMailing
    ? [{
      type: 'locatorSelect',
      selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCopyAddressFrom',
      value: 'MLG',
      waitAfterSelectMs: 700,
      verifyBeforeSave: false,
    }]
    : [];
  const additionalPhysicalFields = gateCode
    ? [{ type: 'textbox', name: 'Gate Code', value: gateCode }]
    : [];

  return {
    beforeCreateEntityActions: [
      ...(
        reloadBeforeApplicationType
          ? [{ type: 'reloadCurrentPage', waitAfterReloadMs: 700 }]
          : []
      ),
      {
        type: 'selectByLabel',
        label: 'Application Type',
        value: applicationType,
        waitAfterSelectMs: 700,
      },
      ...(
        reloadAfterApplicationType
          ? [{ type: 'reloadCurrentPage', waitAfterReloadMs: 700 }]
          : []
      ),
      { type: 'waitForLink', name: 'Credential Type', timeoutMs: 20_000 },
      {
        type: 'popupFromLink',
        name: 'Credential Type',
        popupTimeoutMs: 15_000,
        attempts: 3,
        retryDelayMs: 1_000,
        actions: credentialPopupActions,
      },
    ],
    createEntityFields: [
      { type: 'textbox', name: 'Registered Name with', value: '$ENTITY_NAME' },
      { type: 'textbox', name: 'NV Business ID', value: nvBusinessId },
      { type: 'selectByLabel', label: 'Ownership Type', value: 'COR' },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCounty', value: physicalCounty, verifyValue: true, syncSelectedAttribute: true },
      ...contactFields,
      ...mailingAddressFields,
      ...copyPhysicalAddressAction,
      ...physicalAddressFields,
      ...additionalPhysicalFields,
    ],
    beforeCreateSaveActions: [
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCounty', value: physicalCounty, verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
      ...contactFields,
      ...mailingAddressFields,
      ...physicalAddressFields,
      ...additionalPhysicalFields,
    ],
    modifySearchFallbacks: [
      { label: 'NV Business ID', fieldNames: ['NV Business ID'], value: nvBusinessId },
      { label: 'SOS-Name', fieldNames: ['SOS-Name', 'SOS Name'], value: '$ENTITY_NAME' },
    ],
  };
}

export function buildConveyanceRunData(testData, userType) {
  const person = simplePerson(testData);
  const city = pick(testData.cities);
  const address = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;
  const licenseFields = userType.licenseFields || [];

  return {
    beforeCreateEntityActions: [
      { type: 'radio', name: userType.radioName, exact: true },
      ...licenseFields.map((field) => ({
        type: 'textbox',
        name: field.name,
        value: `${field.prefix}${numberWithDigitLength(4)}`,
      })),
    ],
    createEntityFields: [
      { type: 'textbox', name: 'UBI #', value: `${numberWithDigitLength(3)}-${numberWithDigitLength(3)}-${numberWithDigitLength(3)}` },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'selectByLabel', label: 'Role', value: 'OWN' },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#txtPhone', value: phone() },
      { type: 'textbox', name: 'Address', value: address },
      { type: 'textbox', name: 'Suite/Apt/Unit/etc.', value: `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}` },
      { type: 'textbox', name: 'City', value: city },
      { type: 'selectByLabel', label: 'State/Province', value: pick(testData.usStates) },
      { type: 'textbox', name: 'Zip', value: zip() },
      { type: 'textbox', name: 'Primary Phone #', exact: true, value: phone() },
      { type: 'textbox', name: 'Primary E-mail', value: testData.primaryEmail },
      { type: 'textbox', name: 'Alternate E-mail', value: testData.alternateEmail },
    ],
  };
}

export function buildRpmRunData(testData) {
  const person = simplePerson(testData);
  const registrationPerson = simplePerson(testData);
  const safetyPerson = simplePerson(testData);
  const mailingCity = pick(testData.cities);
  const mailingAddress = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;
  const mailingUnit = `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}`;
  const mailingCounty = pick(rpmCountyValues);
  const localLicense = `LL#${numberWithDigitLength(3)}`;
  const nvBusinessId = `NV${numberWithDigitLength(7)}`;
  const serialNo = numberWithDigitLength(6);
  const zipPlusFour = `${numberWithDigitLength(5)}-${numberWithDigitLength(4)}`;
  const contactPhone = phone();
  const mailingPhone = phone();
  const credentialDetails = requiredLicenseCredentialDetails([
    { type: 'radio', name: 'Intraoral', exact: true },
    { type: 'textbox', name: 'Serial No.', value: serialNo },
    { type: 'textbox', name: 'Number of Tubes', value: String(Number(numberWithDigitLength(2))) },
    { type: 'textbox', name: 'Manufacturer', value: `MANUFAC_${numberWithDigitLength(4)}` },
    { type: 'textbox', name: 'Model No.', value: `Mod${numberWithDigitLength(3)}` },
    { type: 'radio', name: 'No', exact: true },
    { type: 'textbox', name: 'Use Location', value: 'TestLoc' },
    { type: 'clickLink', name: 'OK' },
  ]);

  return {
    beforeCreateEntityActions: [
      { type: 'selectByLabel', label: 'Application Type', value: 'RPMLIC' },
    ],
    createEntityFields: [
      { type: 'textbox', name: 'Registered Name with', value: registrationPerson.firstName },
      { type: 'textbox', name: 'NV Business ID', value: nvBusinessId },
      { type: 'textbox', name: 'Local License #', value: localLicense },
      { type: 'selectByLabel', label: 'Facility Type', value: '63' },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'selectByLabel', label: 'Title', value: 'ADM' },
      { type: 'textbox', name: 'Person Responsible for Maintaining this Registration', value: `${person.firstName} ${person.lastName}` },
      { type: 'textbox', name: 'Person Responsible for Radiation Safety', value: `${safetyPerson.firstName} ${safetyPerson.lastName}` },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'textbox', name: 'Phone', value: contactPhone },

      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet1', value: mailingAddress },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet2', value: mailingUnit },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtCity', value: mailingCity },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtZip', value: zipPlusFour },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtPhone', value: mailingPhone },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtEMail', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtAltEmail', value: testData.alternateEmail },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCopyAddressFrom', value: 'MLG', waitAfterSelectMs: 700, verifyBeforeSave: false },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet1', value: mailingAddress },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet2', value: mailingUnit, optional: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtCity', value: mailingCity },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtZip', value: zipPlusFour },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtPhone', value: mailingPhone },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtEMail', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtAltEmail', value: testData.alternateEmail },
    ],
    beforeCreateSaveActions: [
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
    ],
    ...credentialDetails,
    modifySearchFallbacks: [
      { label: 'Serial No', fieldNames: ['Serial No', 'Serial No.'], value: serialNo },
      { label: 'Local License #', fieldNames: ['Local License #'], value: localLicense },
      { label: 'NV Business ID', fieldNames: ['NV Business ID'], value: nvBusinessId },
    ],
  };
}

export function buildRmRunData(testData) {
  const person = simplePerson(testData);
  const mailingCity = pick(testData.cities);
  const mailingAddress = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;
  const mailingUnit = `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}`;
  const mailingCounty = pick(rpmCountyValues);
  const localLicense = `LL#${numberWithDigitLength(3)}`;
  const nvBusinessId = `NV${numberWithDigitLength(5)}`;
  const zipPlusFour = `${numberWithDigitLength(5)}-${numberWithDigitLength(4)}`;
  const contactPhone = phone();
  const mailingPhone = phone();
  const alternatePhone = phone();
  const credentialDetails = requiredLicenseCredentialDetails([
    { type: 'radio', name: 'Gas chromatograph', exact: true },
    { type: 'clickLink', name: 'OK' },
  ]);

  return {
    beforeCreateEntityActions: [
      { type: 'selectByLabel', label: 'Application Type', value: 'RAMLIC', waitAfterSelectMs: 700 },
    ],
    createEntityFields: [
      { type: 'textbox', name: 'Registered Name with', value: `RM_${numberWithDigitLength(4)}` },
      { type: 'textbox', name: 'NV Business ID', value: nvBusinessId },
      { type: 'textbox', name: 'Local License #', value: localLicense },
      { type: 'selectByLabel', label: 'Facility Type', value: '15' },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'selectByLabel', label: 'Title', value: 'RSO' },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'textbox', name: 'Phone', value: contactPhone },

      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet1', value: mailingAddress },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet2', value: mailingUnit },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtCity', value: mailingCity },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtZip', value: zipPlusFour },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtPhone', value: mailingPhone },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtAltPhone', value: alternatePhone, optional: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtEMail', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtAltEmail', value: testData.alternateEmail },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCopyAddressFrom', value: 'MLG', waitAfterSelectMs: 700, verifyBeforeSave: false },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet1', value: mailingAddress },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet2', value: mailingUnit, optional: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtCity', value: mailingCity },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtZip', value: zipPlusFour },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtPhone', value: mailingPhone },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtAltPhone', value: alternatePhone, optional: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtEMail', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtAltEmail', value: testData.alternateEmail },
    ],
    beforeCreateSaveActions: [
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
    ],
    ...credentialDetails,
    modifySearchFallbacks: [
      { label: 'Local License #', fieldNames: ['Local License #'], value: localLicense },
      { label: 'NV Business ID', fieldNames: ['NV Business ID'], value: nvBusinessId },
    ],
  };
}

export function buildMammoRunData(testData) {
  const person = simplePerson(testData);
  const registrationPerson = simplePerson(testData);
  const safetyPerson = simplePerson(testData);
  const mailingCity = pick(testData.cities);
  const mailingAddress = `${numberWithDigitLength(3)} ${pick(testData.streetNames)} Street`;
  const mailingUnit = `${pick(testData.unitPrefixes)} ${numberWithDigitLength(2)}`;
  const mailingCounty = pick(rpmCountyValues);
  const localLicense = `LL#${numberWithDigitLength(3)}`;
  const nvBusinessId = `NV${numberWithDigitLength(7)}`;
  const consoleSerialNo = `CC${numberWithDigitLength(6)}`;
  const zipPlusFour = `${numberWithDigitLength(5)}-${numberWithDigitLength(4)}`;
  const contactPhone = phone();
  const mailingPhone = phone();
  const alternatePhone = phone();
  const credentialDetails = requiredLicenseCredentialDetails([
    { type: 'textbox', name: 'Control Console Serial No.', value: consoleSerialNo },
    { type: 'textbox', name: 'Number of Tubes', value: String(Number(numberWithDigitLength(2))) },
    { type: 'textbox', name: 'Manufacturer', value: `MANUFAC_${numberWithDigitLength(4)}` },
    { type: 'textbox', name: 'Model No.', value: `Mod${numberWithDigitLength(3)}` },
    { type: 'radio', name: 'No', exact: true },
    { type: 'textbox', name: 'Use Location', value: 'LocTest' },
    { type: 'checkbox', name: 'FFDM', exact: true },
    {
      type: 'popupFromLocator',
      selector: '#ctl00_ContentPlaceHolder1_ucMachineInformation_txtDateManuf_img',
      popupTimeoutMs: 10_000,
      actions: [
        { type: 'clickButton', name: 'OK' },
      ],
    },
    { type: 'checkbox', name: 'Mo', exact: true },
    { type: 'clickLink', name: 'OK' },
  ]);

  return {
    beforeCreateEntityActions: [],
    createEntityFields: [
      { type: 'textbox', name: 'Registered Name with', value: registrationPerson.firstName },
      { type: 'textbox', name: 'NV Business ID', value: nvBusinessId },
      { type: 'textbox', name: 'Local License #', value: localLicense },
      { type: 'selectByLabel', label: 'Facility Type', value: '53' },
      { type: 'textbox', name: 'First Name', value: person.firstName },
      { type: 'textbox', name: 'Last Name', value: person.lastName },
      { type: 'textbox', name: 'Person Responsible for Maintaining this Registration', value: `${person.firstName} ${person.lastName}` },
      { type: 'selectByLabel', label: 'Title', value: 'ADM' },
      { type: 'textbox', name: 'Person Responsible for Radiation Safety', value: `${safetyPerson.firstName} ${safetyPerson.lastName}` },
      { type: 'textbox', name: 'Email', value: testData.primaryEmail },
      { type: 'textbox', name: 'Phone', value: contactPhone },

      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet1', value: mailingAddress },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtStreet2', value: mailingUnit },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtCity', value: mailingCity },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtZip', value: zipPlusFour },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtPhone', value: mailingPhone },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtAltPhone', value: alternatePhone, optional: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtEMail', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_txtAltEmail', value: testData.alternateEmail },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCopyAddressFrom', value: 'MLG', waitAfterSelectMs: 700, verifyBeforeSave: false },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet1', value: mailingAddress },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtStreet2', value: mailingUnit, optional: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtCity', value: mailingCity },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtZip', value: zipPlusFour },
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, syncSelectedAttribute: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtPhone', value: mailingPhone },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtAltPhone', value: alternatePhone, optional: true },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtEMail', value: testData.primaryEmail },
      { type: 'locatorFill', selector: '#ctl00_ContentPlaceHolder2_ucPhysicalAddressAdd_txtAltEmail', value: testData.alternateEmail },
    ],
    beforeCreateSaveActions: [
      { type: 'locatorSelect', selector: '#ctl00_ContentPlaceHolder2_ucMailingAddressAdd_ddlCounty', value: mailingCounty, verifyValue: true, verifyAttempts: 5, syncSelectedAttribute: true },
    ],
    ...credentialDetails,
    modifySearchFallbacks: [
      { label: 'Serial No', fieldNames: ['Serial No', 'Serial No.'], value: consoleSerialNo },
      { label: 'Local License #', fieldNames: ['Local License #'], value: localLicense },
      { label: 'NV Business ID', fieldNames: ['NV Business ID'], value: nvBusinessId },
    ],
  };
}

function requiredLicenseCredentialDetails(popupActions) {
  const actions = [
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
      actions: popupActions,
    },
  ];

  return {
    finalCreateSaveActions: actions,
    createValidationRecoveryRules: [
      {
        messagePattern: 'License/Credential information details',
        actions,
      },
    ],
  };
}
