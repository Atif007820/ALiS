export const runConfig = {
  openExcelReport: true,
  openPlaywrightReport: true,
  attachReports: true,

  // Used by both GUI and non-GUI runs. The --parallel option overrides parallelWorkers.
  parallelExecution: true,
  parallelWorkers: 3,

  guiAutoStart: true,
  guiAutoStartDelayMs: 9000,
  guiAutoClose: true,
  guiWaitForExit: true,
  jmeterLookAndFeel: 'System',

  generateJMeterHtmlReport: false,
  failOnEmptyResults: true,

  playwrightOutputDir: 'test-results',
  playwrightReportDir: 'playwright-report'
};
