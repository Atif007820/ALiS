import { snapshotRows } from './captureSnapshot.js';

const keyColumns = ['Text', 'Section Header', 'Parent Tab'];
const reportColumns = ['Parent Tab', 'Section Header', 'Text'];

export default {
  id: 'TC05',
  name: 'Informative Text',
  sheetName: 'TC05_InformativeText',
  compareKeys: keyColumns,
  businessUnitIds: [
    'MAMMO',
  ],
  allowEmptyBaselineBusinessUnitIds: [],

  async run(page, captureEngine, context) {
    const tabs = context.shared.capturedTabs?.length
      ? context.shared.capturedTabs
      : await captureEngine.captureTabs(page);
    const rows = snapshotRows(context, 'informativeTextRows')
      || await captureEngine.captureInformativeTextByTab(page, tabs, {
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

  compare({ baselineRows, actualRows, compareEngine }) {
    const comparison = compareEngine.compareRows({
      baselineRows,
      actualRows,
      keys: this.compareKeys,
    });

    comparison.missing = comparison.missing.map((row) => ({
      ...row,
      message: 'Expected informative text is not present in the live UI section.',
    }));

    comparison.extra = comparison.extra.map((row) => ({
      ...row,
      message: 'Informative text is present in the live UI section but missing from the TC05 Excel.',
    }));

    return {
      ...comparison,
      reportColumns,
    };
  },
};
