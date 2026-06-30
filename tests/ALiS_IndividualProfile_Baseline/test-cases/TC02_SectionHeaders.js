import { snapshotRows } from './captureSnapshot.js';

const reportColumns = ['Parent Tab', 'Section Header'];

export default {
  id: 'TC02',
  name: 'Section Headers',
  sheetName: 'TC02_SectionHeaders',
  compareKeys: ['Section Header', 'Parent Tab'],

  async run(page, captureEngine, context) {
    const tabs = context.shared.capturedTabs?.length
      ? context.shared.capturedTabs
      : await captureEngine.captureTabs(page);
    const rows = snapshotRows(context, 'sectionHeaderRows')
      || await captureEngine.captureSectionHeadersByTab(page, tabs, {
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

    return {
      ...comparison,
      reportColumns,
    };
  },
};
