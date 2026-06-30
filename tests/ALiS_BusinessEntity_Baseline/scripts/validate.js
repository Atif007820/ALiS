import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { businessUnits, resolveBusinessUnit } from '../config/BusinessUnit.js';
import { baselineConfig } from '../config/baseline.config.js';
import { ExcelManager } from '../core/ExcelManager.js';
import { CompareEngine } from '../core/CompareEngine.js';
import { testCaseRegistry } from '../test-cases/registry.js';
import { availableUrlKeys, normalizeUrlKey } from '../config/urls.js';
import { flow2EntityNames } from '../config/flow2EntityNames.js';
import { flow4EntityNames } from '../config/flow4EntityNames.js';
import { getAvailableFlows, getFlowInfo } from '../utils/flowLabels.js';

const businessUnit = resolveBusinessUnit('HLS');
const bloodBankBusinessUnit = resolveBusinessUnit('BB');
const healthFacilitiesBusinessUnit = resolveBusinessUnit('HF');
const medicalLaboratoriesBusinessUnit = resolveBusinessUnit('ML');
const environmentalHealthSectionBusinessUnit = resolveBusinessUnit('EHS');
const childCareProgramBusinessUnit = resolveBusinessUnit('CCP');
const kitchenPoolSpaBusinessUnit = resolveBusinessUnit('KPS');
const childLaborBusinessUnit = resolveBusinessUnit('CL');
const nvrcpCreateBusinessUnits = ['RPM', 'RM', 'MAMMO'].map(resolveBusinessUnit);
const runSettings = JSON.parse(await fs.readFile(new URL('../config/runSettings.json', import.meta.url), 'utf8'));
const excelManager = new ExcelManager();
const compareEngine = new CompareEngine();

assert.equal(Boolean(testCaseRegistry.TC01), true, 'TC01 should be registered');
assert.equal(Boolean(testCaseRegistry.TC02), true, 'TC02 should be registered');
assert.equal(Boolean(testCaseRegistry.TC03), true, 'TC03 should be registered');
assert.equal(Boolean(testCaseRegistry.TC04), true, 'TC04 should be registered');
assert.equal(Boolean(testCaseRegistry.TC05), true, 'TC05 should be registered');
assert.equal(
  baselineConfig.capture.ignoredInformativeTextPatterns.some((pattern) => (
    new RegExp(pattern, 'i').test(
      'You are associated with multiple business unit(s), please select Business Unit to open profile.',
    )
  )),
  true,
  'Global TC05 capture should ignore the multiple-business-unit profile banner',
);
assert.equal(
  baselineConfig.capture.ignoredSectionHeaders
    .map((header) => String(header).trim().toLowerCase())
    .includes('view business entity'),
  true,
  'TC02 capture should ignore the View Business Entity page heading for all View flows',
);
assert.deepEqual(
  getAvailableFlows().map((flow) => flow.id),
  ['1', '2', '3', '4'],
  'Baseline should register Modify and View variants for new and existing entities',
);
assert.equal(getFlowInfo('1').label, 'New Entity - Modify', 'Flow 1 label should be New Entity - Modify');
assert.equal(getFlowInfo('2').label, 'Existing Entity - Modify', 'Flow 2 label should be Existing Entity - Modify');
assert.equal(getFlowInfo('3').label, 'New Entity - View', 'Flow 3 label should be New Entity - View');
assert.equal(getFlowInfo('4').label, 'Existing Entity - View', 'Flow 4 label should be Existing Entity - View');
assert.deepEqual(
  testCaseRegistry.TC05.businessUnitIds,
  [
    'RPM',
    'RM',
    'MAMMO',
    'HMB',
    'ESF',
    'CLAB',
    'BB',
    'HLS',
    'CL',
    'CONV_CC',
    'CONV_BO',
    'CONV_PM',
    'HF',
    'ML',
    'EHS',
    'KPS',
  ],
  'TC05 should support all configured NVRCP, NJ, LNI, and DPBH informative-text baselines',
);
const defaultBusinessUnits = Array.isArray(runSettings.defaultBusinessUnit)
  ? runSettings.defaultBusinessUnit
  : String(runSettings.defaultBusinessUnit || '').split(',');
for (const businessUnitId of defaultBusinessUnits.map((item) => String(item).trim()).filter(Boolean)) {
  assert.equal(
    Boolean(businessUnits[businessUnitId.toUpperCase()]),
    true,
    `runSettings defaultBusinessUnit should reference a configured BU: ${businessUnitId}`,
  );
}
assert.equal(
  availableUrlKeys().includes(normalizeUrlKey(runSettings.defaultUrl)),
  true,
  `runSettings defaultUrl should reference a configured URL: ${runSettings.defaultUrl}`,
);
assert.equal(
  getAvailableFlows().some((flow) => flow.id === String(runSettings.defaultFlow)),
  true,
  `runSettings defaultFlow should reference a configured flow: ${runSettings.defaultFlow}`,
);
assert.equal(
  healthFacilitiesBusinessUnit.modifySearchFallbacks.some((fallback) => (
    fallback.label === 'SOS-Name' && fallback.value === '$ENTITY_NAME'
  )),
  true,
  'HF Modify search should include the dynamic SOS-Name fallback',
);
assert.equal(
  healthFacilitiesBusinessUnit.preferPostCreateEditLink,
  true,
  'HF Flow 1 should prefer the confirmed post-create Edit link before relying on search indexing',
);
assert.equal(
  healthFacilitiesBusinessUnit.skippedDetailTabs.includes('Owner(s)')
    && healthFacilitiesBusinessUnit.skippedDetailTabs.includes('Additional Information'),
  true,
  'HF should keep Owner(s) and Additional Information disabled for detailed comparison',
);
assert.deepEqual(
  healthFacilitiesBusinessUnit.requiredFieldOverrides,
  [
    {
      parentTab: 'Entity Information',
      sectionHeader: 'Physical Address of Facility',
      fieldLabel: 'County',
      required: 'No',
    },
  ],
  'HF Physical Address County should be reported as not required despite its phantom CSS marker',
);
assert.equal(
  healthFacilitiesBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
    action.type === 'clickReceiptSearchIcon'
  )),
  true,
  'HF Payment precondition should open the receipt search from the payment row',
);
assert.equal(
  healthFacilitiesBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
    action.type === 'selectRandomReceiptSearchResultAndSave'
    && action.allowNoRecords === true
  )),
  true,
  'HF Payment precondition should choose a random receipt search result when available and tolerate empty receipt searches',
);
assert.equal(
  medicalLaboratoriesBusinessUnit.skippedDetailTabs.includes('Owner(s)')
    && medicalLaboratoriesBusinessUnit.skippedDetailTabs.includes('Additional Information'),
  true,
  'ML should keep Owner(s) and Additional Information disabled for detailed comparison',
);
assert.equal(
  medicalLaboratoriesBusinessUnit.tableHeaderPreconditions['Activity Log(s)'].actions.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Action Code'
    && action.value === 'IPNT'
  )),
  true,
  'ML Activity Log precondition should use Action Code IPNT',
);
assert.equal(
  medicalLaboratoriesBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
    action.type === 'selectRandomReceiptSearchResultAndSave'
    && action.allowNoRecords === true
  )),
  true,
  'ML Payment precondition should choose a random receipt search result when available and tolerate empty receipt searches',
);
assert.equal(
  environmentalHealthSectionBusinessUnit.skippedDetailTabs.includes('Owner(s)'),
  true,
  'EHS should keep Owner(s) visible in TC01 without clicking it during detailed comparison',
);
assert.equal(
  environmentalHealthSectionBusinessUnit.beforeCreateEntityActions.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Application Type'
    && action.value === 'CM'
  )),
  true,
  'EHS Flow 1 should select Application Type CM',
);
assert.equal(
  environmentalHealthSectionBusinessUnit.createEntityFields.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Role'
    && action.value === 'OWN'
  )),
  true,
  'EHS Flow 1 should select the Owner primary-contact role',
);
assert.equal(
  environmentalHealthSectionBusinessUnit.tableHeaderPreconditions['Activity Log(s)'].actions.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Action Code'
    && action.value === 'IRQ'
  )),
  true,
  'EHS Activity Log precondition should use Action Code IRQ',
);
assert.equal(
  environmentalHealthSectionBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
    action.type === 'selectRandomReceiptSearchResultAndSave'
    && action.allowNoRecords === true
  )),
  true,
  'EHS Payment precondition should choose a random receipt search result when available and tolerate empty receipt searches',
);
assert.equal(
  childCareProgramBusinessUnit.skippedDetailTabs.includes('Owner(s)')
    && childCareProgramBusinessUnit.skippedDetailTabs.includes('Additional Information'),
  true,
  'CCP should keep Owner(s) and Additional Information disabled',
);
assert.equal(
  childCareProgramBusinessUnit.tableHeaderPreconditions['Activity Log(s)'].actions.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Action Code'
    && action.value === 'IRQ'
  )),
  true,
  'CCP Activity Log precondition should use Action Code IRQ',
);
assert.equal(
  childCareProgramBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
    action.type === 'selectRandomReceiptSearchResultAndSave'
    && action.allowNoRecords === true
  )),
  true,
  'CCP Payment precondition should choose a random receipt search result when available and tolerate empty receipt searches',
);
assert.equal(
  bloodBankBusinessUnit.tableHeaderPreconditions['Additional Information'].actions.some((action) => (
    action.type === 'clickRandomNameSearchResult'
  )),
  true,
  'BB Additional Information precondition should choose a random Name from the NJ search results grid',
);
assert.equal(
  bloodBankBusinessUnit.tableHeaderPreconditions['Additional Information'].actions.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Type'
    && action.value === 'UCD'
  )),
  true,
  'BB Additional Information precondition should select Type UCD before opening the NJ search grid',
);
assert.equal(
  kitchenPoolSpaBusinessUnit.skippedDetailTabs.includes('Owner(s)')
    && kitchenPoolSpaBusinessUnit.skippedDetailTabs.includes('Additional Information'),
  true,
  'KPS should keep Owner(s) and Additional Information disabled',
);
assert.equal(
  kitchenPoolSpaBusinessUnit.beforeCreateEntityActions.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Application Type'
    && action.value === 'KIHF'
  )),
  true,
  'KPS Flow 1 should select Application Type KIHF',
);
assert.equal(
  kitchenPoolSpaBusinessUnit.beforeCreateEntityActions.filter((action) => (
    action.type === 'reloadCurrentPage'
  )).length >= 2,
  true,
  'KPS Flow 1 should refresh the protected ASP.NET page around Application Type selection',
);
assert.equal(
  kitchenPoolSpaBusinessUnit.beforeCreateEntityActions.some((action) => (
    action.type === 'popupFromLink'
    && action.name === 'Credential Type'
    && action.actions.some((popupAction) => (
      popupAction.type === 'radio'
      && popupAction.name === 'FOOD ESTABLISHMENT - MAIN'
      && popupAction.exact === false
    ))
  )),
  true,
  'KPS Credential Type popup should use a tolerant FOOD ESTABLISHMENT - MAIN radio match',
);
assert.equal(
  kitchenPoolSpaBusinessUnit.tableHeaderPreconditions['Activity Log(s)'].actions.some((action) => (
    action.type === 'selectByLabel'
    && action.label === 'Action Code'
    && action.value === 'CIC'
  )),
  true,
  'KPS Activity Log precondition should use Action Code CIC',
);
assert.equal(
  kitchenPoolSpaBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
    action.type === 'selectRandomReceiptSearchResultAndSave'
    && action.allowNoRecords === true
  )),
  true,
  'KPS Payment precondition should choose a random receipt search result when available and tolerate empty receipt searches',
);
for (const nvrcpBusinessUnit of nvrcpCreateBusinessUnits) {
  const physicalAddressActions = nvrcpBusinessUnit.createEntityFields.filter((action) => (
    String(action.selector || '').includes('ucPhysicalAddressAdd')
  ));

  for (const requiredSelectorPart of ['txtStreet1', 'txtCity', 'txtZip']) {
    assert.equal(
      physicalAddressActions.some((action) => String(action.selector || '').includes(requiredSelectorPart)),
      true,
      `${nvrcpBusinessUnit.id} should explicitly configure Physical Address ${requiredSelectorPart}`,
    );
  }

  const copyAddressAction = physicalAddressActions.find((action) => (
    String(action.selector || '').includes('ddlCopyAddressFrom')
  ));
  assert.equal(
    copyAddressAction?.verifyBeforeSave,
    false,
    `${nvrcpBusinessUnit.id} Copy From should be treated as a transient command during pre-save verification`,
  );

  assert.equal(
    nvrcpBusinessUnit.beforeCreateEntityActions.some((action) => action.type === 'popupFromLink'),
    false,
    `${nvrcpBusinessUnit.id} should not create License/Credential details before postback-sensitive form fields`,
  );
  assert.equal(
    nvrcpBusinessUnit.finalCreateSaveActions.some((action) => (
      action.type === 'popupFromLink'
      && action.name === 'License/Credential Type'
    )),
    true,
    `${nvrcpBusinessUnit.id} should create License/Credential details immediately before Save`,
  );
  const licenseCredentialWait = nvrcpBusinessUnit.finalCreateSaveActions.find((action) => (
    action.type === 'waitForLink'
    && action.name === 'License/Credential Type'
  ));
  assert.equal(
    Number(licenseCredentialWait?.timeoutMs || 0) >= 30_000,
    true,
    `${nvrcpBusinessUnit.id} License/Credential link wait should tolerate slow ASP.NET rendering`,
  );
  const licenseCredentialPopup = nvrcpBusinessUnit.finalCreateSaveActions.find((action) => (
    action.type === 'popupFromLink'
    && action.name === 'License/Credential Type'
  ));
  assert.equal(
    Number(licenseCredentialPopup?.attempts || 0) >= 5,
    true,
    `${nvrcpBusinessUnit.id} License/Credential popup should have enough retry attempts for legacy popup timing`,
  );
  assert.equal(
    Number(licenseCredentialPopup?.popupTimeoutMs || 0) >= 30_000,
    true,
    `${nvrcpBusinessUnit.id} License/Credential popup wait should tolerate slow child-window creation`,
  );
  assert.equal(
    Number(licenseCredentialPopup?.samePageFallbackTimeoutMs || 0) >= 15_000,
    true,
    `${nvrcpBusinessUnit.id} License/Credential popup should also wait for same-page popup fallbacks`,
  );
  assert.equal(
    nvrcpBusinessUnit.createValidationRecoveryRules.some((rule) => (
      String(rule.messagePattern).includes('License/Credential information details')
      && rule.actions.some((action) => action.type === 'popupFromLink')
    )),
    true,
    `${nvrcpBusinessUnit.id} should recover from lost License/Credential details`,
  );
  assert.equal(
    nvrcpBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
      action.type === 'clickImage'
      && action.name === 'Search Receipt'
    )),
    true,
    `${nvrcpBusinessUnit.id} Payment precondition should open Search Receipt`,
  );
  assert.equal(
    nvrcpBusinessUnit.tableHeaderPreconditions['Payment(s)'].actions.some((action) => (
      action.type === 'clickRandomReceiptSearchResult'
    )),
    true,
    `${nvrcpBusinessUnit.id} Payment precondition should choose a random receipt search result`,
  );
}
assert.equal(
  childLaborBusinessUnit.ignoredInformativeTextPatterns.some((pattern) => (
    new RegExp(pattern, 'i').test(
      'You are associated with multiple business unit(s), please select Business Unit to open profile.',
    )
  )),
  true,
  'CL should ignore the global multiple-business-unit profile banner during TC05 capture',
);
assert.deepEqual(
  runSettings.defaultTestCases,
  ['TC01', 'TC02', 'TC03', 'TC04', 'TC05'],
  'runSettings defaultTestCases should include all current test cases',
);

const tabs = await excelManager.readBaselineRows({
  businessUnit,
  sheetName: testCaseRegistry.TC01.sheetName,
  flow: '1',
});
assert.equal(tabs.rows.length, 4, 'HLS TC01 baseline should contain 4 tab rows');

const tabComparison = compareEngine.compareRows({
  baselineRows: tabs.rows,
  actualRows: tabs.rows,
  keys: testCaseRegistry.TC01.compareKeys,
});
assert.equal(tabComparison.passed, true, 'Matching TC01 rows should pass');

const sections = await excelManager.readBaselineRows({
  businessUnit,
  sheetName: testCaseRegistry.TC02.sheetName,
  flow: '1',
});
assert.equal(sections.rows.length, 9, 'HLS TC02 baseline should contain 9 section rows');

const failingComparison = compareEngine.compareRows({
  baselineRows: sections.rows,
  actualRows: sections.rows.slice(1),
  keys: testCaseRegistry.TC02.compareKeys,
});
assert.equal(failingComparison.passed, false, 'Missing TC02 rows should fail');
assert.equal(failingComparison.missing.length, 1, 'Exactly one missing row should be detected');

const fieldLabels = await excelManager.readBaselineRows({
  businessUnit,
  sheetName: testCaseRegistry.TC03.sheetName,
  flow: '1',
});
assert.equal(fieldLabels.rows.length > 0, true, 'HLS TC03 baseline should contain field label rows');

const fieldLabelComparison = testCaseRegistry.TC03.compare({
  baselineRows: fieldLabels.rows.slice(0, 2),
  actualRows: fieldLabels.rows.slice(0, 2),
});
assert.equal(fieldLabelComparison.passed, true, 'Matching TC03 rows should pass');

const fieldLabelCasingComparison = testCaseRegistry.TC03.compare({
  baselineRows: [
    {
      'Field Label': 'Entity ID',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Facility Information',
      'Required Field': 'No',
    },
  ],
  actualRows: [
    {
      'Field Label': 'Entity Id',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Facility Information',
      'Required Field': 'No',
    },
  ],
});
assert.equal(fieldLabelCasingComparison.matched.length, 0, 'TC03 should not match casing/acronym key differences exactly');
assert.equal(fieldLabelCasingComparison.missing.length, 0, 'TC03 should not leave near key differences as missing rows');
assert.equal(fieldLabelCasingComparison.extra.length, 0, 'TC03 should not leave near key differences as extra rows');
assert.equal(fieldLabelCasingComparison.mismatch.length, 1, 'TC03 should report casing/acronym key differences as one mismatch');
assert.match(
  fieldLabelCasingComparison.mismatch[0].differences[0].message,
  /casing issue/,
  'TC03 Entity ID vs Entity Id should explain the casing issue',
);

const sectionWordingComparison = compareEngine.compareRows({
  baselineRows: [
    {
      'Parent Tab': 'Entity Information',
      'Section Header': 'Secondary Contact (if applicable)',
    },
  ],
  actualRows: [
    {
      'Parent Tab': 'Entity Information',
      'Section Header': 'Secondary Contact',
    },
  ],
  keys: testCaseRegistry.TC02.compareKeys,
});
assert.equal(sectionWordingComparison.matched.length, 0, 'Prefix/suffix section wording should not pass');
assert.equal(sectionWordingComparison.missing.length, 0, 'Prefix/suffix section wording should not remain missing');
assert.equal(sectionWordingComparison.extra.length, 0, 'Prefix/suffix section wording should not remain extra');
assert.equal(sectionWordingComparison.mismatch.length, 1, 'Prefix/suffix section wording should be one mismatch');
assert.match(
  sectionWordingComparison.mismatch[0].differences[0].message,
  /prefix\/suffix wording mismatch/,
  'Prefix/suffix wording mismatch should include a clear reason',
);

const unrelatedSectionFieldComparison = testCaseRegistry.TC03.compare({
  baselineRows: [
    {
      'Field Label': 'First Name',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Business Entity Information',
      'Required Field': 'No',
    },
  ],
  actualRows: [
    {
      'Field Label': 'First Name',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Facility Information',
      'Required Field': 'No',
    },
  ],
});
assert.equal(unrelatedSectionFieldComparison.matched.length, 0, 'A field in an unrelated section should not match');
assert.equal(unrelatedSectionFieldComparison.mismatch.length, 0, 'Unrelated section names should not be forced into a mismatch pair');
assert.equal(unrelatedSectionFieldComparison.missing.length, 1, 'The expected field should remain missing from its expected section');
assert.equal(unrelatedSectionFieldComparison.extra.length, 1, 'The field in the different live section should remain extra');

const requiredMismatch = testCaseRegistry.TC03.compare({
  baselineRows: [
    {
      'Field Label': 'Sample Required Field',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Entity Information',
      'Required Field': 'Yes',
    },
  ],
  actualRows: [
    {
      'Field Label': 'Sample Required Field',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Entity Information',
      'Required Field': 'No',
    },
  ],
});
assert.equal(requiredMismatch.passed, false, 'TC03 should fail when a required asterisk is missing');
assert.match(
  requiredMismatch.mismatch[0].differences[0].message,
  /required asterisk is missing/,
  'TC03 required mismatch should include a clear message',
);

const blankRequiredFieldComparison = testCaseRegistry.TC03.compare({
  baselineRows: [
    {
      'Field Label': 'Blank Required Field',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Facility Information',
      'Required Field': '',
    },
  ],
  actualRows: [
    {
      'Field Label': 'Blank Required Field',
      'Parent Tab': 'Entity Information',
      'Section Header': 'Facility Information',
      'Required Field': 'Yes',
    },
  ],
});
assert.equal(blankRequiredFieldComparison.passed, true, 'TC03 should ignore live required status when Excel Required Field is blank');
assert.equal(blankRequiredFieldComparison.matched[0].baseline['Required Field'], '', 'TC03 should preserve blank expected Required Field');
assert.equal(blankRequiredFieldComparison.matched[0].actual['Required Field'], '', 'TC03 should keep generated reports blank when Excel Required Field is blank');

const tableHeaders = await excelManager.readBaselineRows({
  businessUnit,
  sheetName: testCaseRegistry.TC04.sheetName,
  flow: '1',
});
assert.equal(Array.isArray(tableHeaders.rows), true, 'HLS TC04 baseline sheet should be readable');

const tableHeaderComparison = testCaseRegistry.TC04.compare({
  baselineRows: [
    {
      'Column Header': 'Sample Header',
      'Column Order': '1',
      'Section Header': 'Sample Section',
      'Parent Tab': 'Entity Information',
    },
  ],
  actualRows: [
    {
      'Column Header': 'Sample Header',
      'Column Order': '2',
      'Section Header': 'Sample Section',
      'Parent Tab': 'Entity Information',
    },
  ],
  compareEngine,
});
assert.equal(tableHeaderComparison.passed, false, 'TC04 should fail when the same column header is in a different position');
assert.equal(tableHeaderComparison.mismatch.length, 1, 'TC04 should report a column order mismatch');
assert.match(
  tableHeaderComparison.mismatch[0].differences[0].message,
  /Column Header is present, but Column Order is different/,
  'TC04 order mismatch should include a clear message',
);

const tableHeaderMissingExtraComparison = testCaseRegistry.TC04.compare({
  baselineRows: [
    {
      'Column Header': 'Expected Header',
      'Column Order': '1',
      'Section Header': 'Sample Section',
      'Parent Tab': 'Entity Information',
    },
  ],
  actualRows: [
    {
      'Column Header': 'Unexpected Header',
      'Column Order': '1',
      'Section Header': 'Sample Section',
      'Parent Tab': 'Entity Information',
    },
  ],
  compareEngine,
});
assert.equal(tableHeaderMissingExtraComparison.missing.length, 1, 'TC04 should report a missing header when expected text is absent');
assert.equal(tableHeaderMissingExtraComparison.extra.length, 1, 'TC04 should report an extra header when unexpected text is present');

for (const businessUnitId of testCaseRegistry.TC05.businessUnitIds) {
  const informativeTextBusinessUnit = resolveBusinessUnit(businessUnitId);
  const informativeText = await excelManager.readBaselineRows({
    businessUnit: informativeTextBusinessUnit,
    sheetName: testCaseRegistry.TC05.sheetName,
    flow: '1',
  });
  const allowsEmptyBaseline = testCaseRegistry.TC05.allowEmptyBaselineBusinessUnitIds
    ?.includes(businessUnitId);

  assert.equal(
    allowsEmptyBaseline || informativeText.rows.length > 0,
    true,
    `${businessUnitId} TC05 baseline should contain informative text rows unless explicitly configured as empty`,
  );
  assert.equal(
    informativeText.rows.every((row) => row['Parent Tab'] && row['Section Header'] && row.Text),
    true,
    `${businessUnitId} TC05 rows should contain Parent Tab, Section Header, and Text`,
  );
}

const informativeTextComparison = testCaseRegistry.TC05.compare({
  baselineRows: [
    {
      'Parent Tab': 'Additional Information',
      'Section Header': 'Interpreting Physician(s) List',
      Text: "Please click 'Add' to add a new row. Required documentation will be verified at time of inspection.",
    },
  ],
  actualRows: [
    {
      'Parent Tab': 'Additional Information',
      'Section Header': 'Interpreting Physician(s) List',
      Text: "Please click 'Add' to add a new row.\nRequired documentation will be verified at time of inspection.",
    },
  ],
  compareEngine,
});
assert.equal(informativeTextComparison.passed, true, 'TC05 should normalize multiline informative text');

for (const businessUnitId of Object.keys(businessUnits)) {
  const configuredBusinessUnit = resolveBusinessUnit(businessUnitId);

  assert.equal(
    Object.prototype.hasOwnProperty.call(flow2EntityNames, businessUnitId),
    true,
    `${businessUnitId} should have a Flow 2 entity name in config/flow2EntityNames.js`,
  );
  assert.equal(
    typeof configuredBusinessUnit.flow2EntityName === 'string' && configuredBusinessUnit.flow2EntityName.trim().length > 0,
    true,
    `${businessUnitId} flow2EntityName should be a non-empty string`,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(flow4EntityNames, businessUnitId),
    true,
    `${businessUnitId} should have a Flow 4 entity name in config/flow4EntityNames.js`,
  );
  assert.equal(
    typeof configuredBusinessUnit.flow4EntityName === 'string' && configuredBusinessUnit.flow4EntityName.trim().length > 0,
    true,
    `${businessUnitId} flow4EntityName should be a non-empty string`,
  );

  assert.equal(
    availableUrlKeys().includes(configuredBusinessUnit.urlKey),
    true,
    `${businessUnitId} urlKey should exist in config/urls.js`,
  );

  for (const testCase of Object.values(testCaseRegistry)) {
    if (!testCaseSupportsBusinessUnit(testCase, configuredBusinessUnit)) {
      continue;
    }

    const baselines = await Promise.all(['1', '3'].map((flow) => excelManager.readBaselineRows({
      businessUnit: configuredBusinessUnit,
      sheetName: testCase.sheetName,
      flow,
    })));

    for (const baseline of baselines) {
      assert.equal(
        Array.isArray(baseline.rows),
        true,
        `${businessUnitId} ${testCase.sheetName} baseline should be readable from ${baseline.baselinePath}`,
      );
    }
  }
}

console.log('Validation passed: baseline workbook, registry, and comparison engine are ready.');

function testCaseSupportsBusinessUnit(testCase, businessUnit) {
  if (!Array.isArray(testCase.businessUnitIds) || !testCase.businessUnitIds.length) {
    return true;
  }

  return testCase.businessUnitIds
    .map((id) => String(id).trim().toUpperCase())
    .includes(String(businessUnit.id).trim().toUpperCase());
}
