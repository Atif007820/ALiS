export const reportConfig = {
  outputFileName: 'Load_Test_Report.xlsx',
  reporter: process.env.PERF_REPORTER || 'Mohd Atif Jamal',
  slaMs: Number(process.env.SLA_MS || 3000),
  applicationUrl: process.env.REPORT_APPLICATION_URL || ''
};
