// ============================================================
//  CompareSidebar.spec.js
//
//  Main test entry point. It creates one Playwright test for
//  each enabled product comparison in config/url.js.
// ============================================================

import { test, chromium, expect } from '@playwright/test';
import { getComparisonPairs } from './config/url.js';
import { getSidebarItems } from './core/scraper.js';
import { printResults } from './utils/logger.js';
import { attachReport } from './utils/annotations.js';
import { openGeneratedReports } from './utils/openArtifacts.js';
import { writeExcelReport } from './reporters/excelReporter.js';
import { writeHtmlReport } from './reporters/htmlReporter.js';
import runSettings from './config/runSettings.json' with { type: 'json' };

const comparisonPairs = getComparisonPairs();

test.describe.configure({
  mode: shouldRunProductTestsInParallel() ? 'parallel' : 'serial',
});

test.describe('Sidebar Comparison', () => {
  if (comparisonPairs.length === 0) {
    test('configuration has at least one enabled product comparison', async () => {
      expect(comparisonPairs.length, 'No enabled product comparisons were found in config/url.js.').toBeGreaterThan(0);
    });
  }

  for (const comparison of comparisonPairs) {
    test(`${String(comparison.index + 1).padStart(2, '0')} - ${comparison.name} - Sidebar Comparison`, async ({}, testInfo) => {
      validateComparison(comparison);

      const basePayload = buildBasePayload(comparison);
      const generatedReports = {};
      let browser;

      async function writeAndAttachReports(payload) {
        await attachReport({ testInfo, ...payload });
        generatedReports.excelPath = await writeExcelReport(payload);
        generatedReports.htmlPath = await writeHtmlReport(payload);

        if (runSettings.attachReports) {
          await testInfo.attach(`${comparison.name} Sidebar Comparison Excel Report`, {
            path: generatedReports.excelPath,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });

          await testInfo.attach(`${comparison.name} Sidebar Comparison HTML Report`, {
            path: generatedReports.htmlPath,
            contentType: 'text/html',
          });
        }
      }

      try {
        browser = await chromium.launch({
          headless: runSettings.headless,
          slowMo: Number(runSettings.slowMo ?? 0),
          args: [
            '--ignore-certificate-errors',
            ...(runSettings.maximizeWindow ? ['--start-maximized'] : []),
          ],
        });

        const [itemsA, itemsB] = await Promise.all([
          getSidebarItems(browser, comparison.urlA),
          getSidebarItems(browser, comparison.urlB),
        ]);

        const payload = {
          ...basePayload,
          itemsA,
          itemsB,
          ...compareSidebarItems(itemsA, itemsB),
        };

        printResults(payload);
        await writeAndAttachReports(payload);
      } catch (error) {
        const errorText = error?.stack || error?.message || String(error);

        if (!generatedReports.excelPath && !generatedReports.htmlPath) {
          const failurePayload = {
            ...basePayload,
            itemsA: [],
            itemsB: [],
            matched: [],
            missing: [],
            iconMismatch: [],
            extraB: [],
            error: errorText,
          };

          try {
            await writeAndAttachReports(failurePayload);
          } catch (reportError) {
            console.error(`Unable to write SidebarComparison failure reports: ${reportError?.message || reportError}`);
          }
        }

        throw error;
      } finally {
        await browser?.close();

        const reportOpenOptions = resolveReportOpenOptions(runSettings);
        if (reportOpenOptions.openHtml || reportOpenOptions.openExcel) {
          await openGeneratedReports(generatedReports, console, reportOpenOptions);
        }

        console.log(`\nBrowser closed for ${comparison.name}.`);
      }
    });
  }
});

function buildBasePayload(comparison) {
  return {
    productName: comparison.name,
    productKey: comparison.key,
    reportSlug: `${String(comparison.index + 1).padStart(2, '0')}-${comparison.key}`,
    labelA: comparison.urlA.label,
    labelB: comparison.urlB.label,
    urlA: comparison.urlA.loginUrl,
    urlB: comparison.urlB.loginUrl,
  };
}

function compareSidebarItems(itemsA, itemsB) {
  const mapA = new Map(itemsA.map((item) => [key(item.title), item]));
  const mapB = new Map(itemsB.map((item) => [key(item.title), item]));
  const matched = [];
  const missing = [];
  const iconMismatch = [];
  const extraB = [];

  for (const a of itemsA) {
    const b = mapB.get(key(a.title));

    if (!b) {
      missing.push(a.title);
      continue;
    }

    const textMatch = a.text === b.text;
    const iconMatch = a.iconCode === b.iconCode;

    if (textMatch && iconMatch) {
      matched.push(a.title);
    } else if (textMatch && !iconMatch) {
      iconMismatch.push({ title: a.title, iconA: a.iconCode, iconB: b.iconCode });
    } else {
      missing.push(a.title);
    }
  }

  for (const b of itemsB) {
    if (!mapA.has(key(b.title))) {
      extraB.push(b.title);
    }
  }

  return { matched, missing, iconMismatch, extraB };
}

function validateComparison(comparison) {
  const missingFields = [];

  for (const side of ['urlA', 'urlB']) {
    const env = comparison[side];
    for (const field of ['loginUrl', 'username', 'password']) {
      if (!env[field]) {
        missingFields.push(`${comparison.name}.${side}.${field}`);
      }
    }
  }

  if (missingFields.length > 0) {
    throw new Error(`Missing SidebarComparison config value(s): ${missingFields.join(', ')}`);
  }
}

function key(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveReportOpenOptions(settings) {
  const legacyFallback = settings.openReports === undefined
    ? true
    : asBoolean(settings.openReports, true);

  return {
    openHtml: asBoolean(settings.openHtmlReport, legacyFallback),
    openExcel: asBoolean(settings.openExcelReport, legacyFallback),
  };
}

function asBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;

  return fallback;
}

function shouldRunProductTestsInParallel() {
  return runSettings.fullyParallel || asBoolean(process.env.SIDEBAR_PARALLEL, false);
}
