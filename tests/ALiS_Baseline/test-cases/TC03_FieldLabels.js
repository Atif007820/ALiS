import { CompareEngine } from '../core/CompareEngine.js';
import { compareKey, normalizeText } from '../core/text.js';
import { snapshotRows } from './captureSnapshot.js';

const keyColumns = ['Field Label', 'Parent Tab', 'Section Header'];
const reportColumns = ['Parent Tab', 'Section Header', 'Field Label', 'Required Field'];

export default {
  id: 'TC03',
  name: 'Field Labels',
  sheetName: 'TC03_FieldLabels',
  compareKeys: keyColumns,

  async run(page, captureEngine, context) {
    const tabs = context.shared.capturedTabs?.length
      ? context.shared.capturedTabs
      : await captureEngine.captureTabs(page);
    const rows = snapshotRows(context, 'fieldLabelRows')
      || await captureEngine.captureFieldLabelsByTab(page, tabs, {
        expectedRows: context.baselineRows || [],
        businessUnit: context.businessUnit,
      });

    return {
      rows,
      meta: {
        count: rows.length,
        tabCount: tabs.length,
      },
    };
  },

  compare({ baselineRows, actualRows }) {
    return compareFieldLabels({
      baselineRows,
      actualRows,
    });
  },
};

function compareFieldLabels({ baselineRows, actualRows }) {
  const compareEngine = new CompareEngine();
  const filteredBaselineRows = baselineRows.filter((row) => !shouldExcludeFieldRow(row));
  const filteredActualRows = actualRows.filter((row) => !shouldExcludeFieldRow(row));
  const normalizedBaselineRows = filteredBaselineRows.map((row) => normalizeFieldRow(row, {
    preserveBlankRequired: true,
  }));
  const blankRequiredBaselineRows = normalizedBaselineRows.filter((row) => !row['Required Field']);
  const normalizedActualRows = filteredActualRows.map((row) => {
    const normalizedRow = normalizeFieldRow(row);

    if (matchesAnyBlankRequiredBaselineRow(normalizedRow, blankRequiredBaselineRows)) {
      return {
        ...normalizedRow,
        'Required Field': '',
      };
    }

    return normalizedRow;
  });
  const comparison = compareEngine.compareRows({
    baselineRows: normalizedBaselineRows,
    actualRows: normalizedActualRows,
    keys: keyColumns,
  });

  for (const row of comparison.missing) {
    row.message = 'Expected field label is not present in the live UI.';
  }

  for (const row of comparison.extra) {
    row.message = 'Field label is present in the live UI but missing from the TC03 Excel baseline.';
  }

  for (const row of comparison.mismatch) {
    row.differences = row.differences
      .filter((difference) => (
        difference.column !== 'Required Field'
        || row.baseline?.['Required Field']
      ))
      .map((difference) => {
      if (difference.column !== 'Required Field') {
        return difference;
      }

      return {
        ...difference,
        message: buildRequiredMismatchMessage(row.baseline, row.actual),
      };
    });
  }
  comparison.mismatch = comparison.mismatch.filter((row) => row.differences.length > 0);
  comparison.passed = comparison.missing.length === 0
    && comparison.extra.length === 0
    && comparison.mismatch.length === 0;
  comparison.summary.mismatch = comparison.mismatch.length;
  comparison.summary.matched = comparison.summary.expected
    - comparison.summary.missing
    - comparison.summary.mismatch;

  return {
    ...comparison,
    reportColumns,
  };
}

function shouldExcludeFieldRow(row) {
  return /^User Type\s*:/i.test(normalizeFieldLabel(row['Field Label']));
}

function normalizeFieldRow(row, { preserveBlankRequired = false } = {}) {
  return {
    'Field Label': normalizeFieldLabel(row['Field Label']),
    'Parent Tab': normalizeText(row['Parent Tab']),
    'Section Header': normalizeText(row['Section Header']),
    'Required Field': normalizeRequiredField(row['Required Field'], { preserveBlank: preserveBlankRequired }),
  };
}

function normalizeFieldLabel(value) {
  return normalizeText(value).replace(/\s*:\s*$/, '').trim();
}

function normalizeRequiredField(value, { preserveBlank = false } = {}) {
  if (preserveBlank && String(value ?? '').trim() === '') {
    return '';
  }

  const rawValue = String(value ?? '').trim().toLowerCase();
  if (rawValue.includes('*')) {
    return 'Yes';
  }

  const normalized = normalizeText(value).toLowerCase();
  if (['yes', 'y', 'true', 'required', 'mandatory', '1'].includes(normalized)) {
    return 'Yes';
  }

  return 'No';
}

function matchesAnyBlankRequiredBaselineRow(actualRow, blankRequiredBaselineRows) {
  if (!blankRequiredBaselineRows.length) {
    return false;
  }

  const exactKey = compareKey(actualRow, keyColumns);

  return blankRequiredBaselineRows.some((baselineRow) => (
    compareKey(baselineRow, keyColumns) === exactKey
    || rowsHaveNearKey(baselineRow, actualRow)
  ));
}

function rowsHaveNearKey(baselineRow, actualRow) {
  return keyColumns.every((column) => (
    canonicalNearKeyText(baselineRow[column]) === canonicalNearKeyText(actualRow[column])
  ));
}

function canonicalNearKeyText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\bids\b/g, 'id')
    .replace(/[^a-z0-9]+/g, '');
}

function buildRequiredMismatchMessage(baselineRow, actualRow) {
  if (baselineRow['Required Field'] === 'Yes' && actualRow['Required Field'] === 'No') {
    return 'Field is present, but the required asterisk is missing in the live UI.';
  }

  if (baselineRow['Required Field'] === 'No' && actualRow['Required Field'] === 'Yes') {
    return 'Field is present with a required asterisk in the live UI, but Excel marks it as not required.';
  }

  return 'Field is present, but the required status does not match Excel.';
}
