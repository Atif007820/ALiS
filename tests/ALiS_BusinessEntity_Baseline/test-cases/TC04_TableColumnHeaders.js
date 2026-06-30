import { snapshotRows } from './captureSnapshot.js';

const keyColumns = ['Column Header', 'Section Header', 'Parent Tab'];
const reportColumns = ['Parent Tab', 'Section Header', 'Column Header', 'Column Order'];

export default {
  id: 'TC04',
  name: 'Table Column Headers',
  sheetName: 'TC04_TableColumnHeaders',
  compareKeys: keyColumns,

  async run(page, captureEngine, context) {
    const tabs = context.shared.capturedTabs?.length
      ? context.shared.capturedTabs
      : await captureEngine.captureTabs(page);
    const rows = snapshotRows(context, 'tableColumnHeaderRows')
      || await captureEngine.captureTableColumnHeadersByTab(page, tabs, {
        expectedRows: context.baselineRows || [],
        businessUnit: context.businessUnit,
        runPreconditions: !['3', '4'].includes(String(context.flow)),
      });

    return {
      rows,
      meta: {
        count: rows.length,
        tabCount: tabs.length,
      },
    };
  },

  compare({ baselineRows, actualRows, compareEngine }) {
    const comparison = compareEngine.compareRows({
      baselineRows,
      actualRows,
      keys: this.compareKeys,
    });

    comparison.mismatch = comparison.mismatch.map((row) => ({
      ...row,
      differences: row.differences.map((difference) => {
        if (difference.column !== 'Column Order') {
          return difference;
        }

        return {
          ...difference,
          message: `Column Header is present, but Column Order is different: expected="${difference.baseline}", live="${difference.actual}"`,
        };
      }),
    }));

    comparison.missing = comparison.missing.map((row) => ({
      ...row,
      message: 'Expected table column header is not present in the live UI.',
    }));

    comparison.extra = comparison.extra.map((row) => ({
      ...row,
      message: 'Table column header is present in the live UI but missing from the TC04 Excel.',
    }));

    return {
      ...comparison,
      reportColumns,
    };
  },
};
