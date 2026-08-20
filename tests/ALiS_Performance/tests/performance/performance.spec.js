import { test, expect } from '@playwright/test';
import { runPerformanceScenario } from '../../src/runners/performanceRunner.js';
import { runConfig } from '../../config/runConfig.js';

test.describe('JMeter performance orchestration', () => {
  test('runs selected JMeter script and generates artifacts', async ({}, testInfo) => {
    test.skip(!process.env.PERF_SCRIPT, 'Set PERF_SCRIPT to a .jmx file name or relative path.');
    test.skip(process.env.RUN_JMETER !== 'true', 'Set RUN_JMETER=true to execute JMeter from Playwright.');

    const result = await runPerformanceScenario({
      script: process.env.PERF_SCRIPT,
      profile: process.env.PERF_PROFILE || undefined
    });

    if (runConfig.attachReports) {
      await testInfo.attach('performance-summary', {
        path: result.artifacts.jsonPath,
        contentType: 'application/json'
      });
      await testInfo.attach('performance-summary-csv', {
        path: result.artifacts.csvPath,
        contentType: 'text/csv'
      });
      await testInfo.attach('load-test-report-download', {
        path: result.artifacts.excelPath,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      if (result.artifacts.jmeterHtmlPath) {
        await testInfo.attach('jmeter-html-report-index', {
          path: result.artifacts.jmeterHtmlPath,
          contentType: 'text/html'
        });
      }
    }

    expect(result.summary.overall.total).toBeGreaterThan(0);
    expect(result.excelValidation.passed).toBeTruthy();
  });
});
