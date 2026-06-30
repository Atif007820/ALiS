export default {
  id: 'TC01',
  name: 'Tab Names',
  sheetName: 'TC01_Tabs',
  compareKeys: ['Tab Name'],

  async run(page, captureEngine, context = { shared: {} }) {
    const tabs = context.shared.capturedTabs?.length
      ? context.shared.capturedTabs
      : await captureEngine.captureTabs(page);

    return {
      rows: tabs.map((tabName) => ({
        'Tab Name': tabName,
      })),
      meta: {
        count: tabs.length,
      },
    };
  },

  compare({ baselineRows, actualRows, compareEngine }) {
    return compareEngine.compareRows({
      baselineRows,
      actualRows,
      keys: this.compareKeys,
    });
  },
};
