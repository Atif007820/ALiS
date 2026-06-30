import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { businessUnits, resolveBusinessUnit } from '../config/BusinessUnit.js';
import { baselineConfig } from '../config/baseline.config.js';
import { ExcelManager } from '../core/ExcelManager.js';
import { CompareEngine } from '../core/CompareEngine.js';
import { testCaseRegistry } from '../test-cases/registry.js';
import { availableUrlKeys, normalizeUrlKey } from '../config/urls.js';
import { getAvailableFlows, getFlowInfo } from '../utils/flowLabels.js';

const runSettings = JSON.parse(await fs.readFile(new URL('../config/runSettings.json', import.meta.url), 'utf8'));
const mammo = resolveBusinessUnit('MAMMO');
const excelManager = new ExcelManager();
const compareEngine = new CompareEngine();

for (const id of ['TC01', 'TC02', 'TC03', 'TC04', 'TC05']) {
  assert.equal(Boolean(testCaseRegistry[id]), true, `${id} should be registered`);
}

assert.deepEqual(Object.keys(businessUnits), ['MAMMO'], 'Individual Profile baseline should currently configure only MAMMO');
assert.equal(mammo.urlKey, 'NVRCP', 'MAMMO should use NVRCP URL');
assert.equal(mammo.baselineFile, 'Mammo.xlsx', 'MAMMO should use Mammo.xlsx baseline workbook');
assert.equal(mammo.applicationTypeValue, 'MAMLIC', 'MAMMO create flow should select MAMLIC application type');
assert.equal(mammo.licenseCredentialType, 'RADIATION THERAPIST RRT', 'MAMMO credential popup option should be configured');
assert.equal(Boolean(mammo.flow2ProfileName?.firstName), true, 'Flow 2 profile first name should be configured');
assert.equal(Boolean(mammo.flow2ProfileName?.lastName), true, 'Flow 2 profile last name should be configured');
assert.equal(Boolean(mammo.flow4ProfileName?.firstName), true, 'Flow 4 profile first name should be configured');
assert.equal(Boolean(mammo.flow4ProfileName?.lastName), true, 'Flow 4 profile last name should be configured');

assert.deepEqual(
  getAvailableFlows().map((flow) => flow.id),
  ['1', '2', '3', '4'],
  'Individual Profile baseline should register all four flows',
);
assert.equal(getFlowInfo('1').label, 'New Profile - Modify', 'Flow 1 label should be New Profile - Modify');
assert.equal(getFlowInfo('2').label, 'Existing Profile - Modify', 'Flow 2 label should be Existing Profile - Modify');
assert.equal(getFlowInfo('3').label, 'New Profile - View', 'Flow 3 label should be New Profile - View');
assert.equal(getFlowInfo('4').label, 'Existing Profile - View', 'Flow 4 label should be Existing Profile - View');

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

for (const flow of ['1', '3']) {
  const baseline = await excelManager.readBaselineRows({
    businessUnit: mammo,
    sheetName: testCaseRegistry.TC01.sheetName,
    flow,
  });
  assert.equal(baseline.rows.length > 0, true, `MAMMO ${getFlowInfo(flow).label} TC01 baseline should have rows`);
}

for (const testCase of Object.values(testCaseRegistry)) {
  const baseline = await excelManager.readBaselineRows({
    businessUnit: mammo,
    sheetName: testCase.sheetName,
    flow: '2',
  });
  assert.equal(Array.isArray(baseline.rows), true, `${testCase.id} should read baseline rows`);
}

assert.equal(
  baselineConfig.navigation.individualProfileMenuPaths.some((path) => path.join('>').toLowerCase() === 'licensing>individual'),
  true,
  'Navigation should default to Licensing > Individual',
);

assert.equal(
  compareEngine.constructor.name,
  'CompareEngine',
  'Compare engine should be importable',
);

console.log('Validation passed: individual profile baseline workbook, registry, and comparison engine are ready.');
