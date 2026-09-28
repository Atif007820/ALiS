// ============================================================
//  CompareSidebar.spec.js
//
//  Main test entry point. It creates one Playwright test for
//  each selected site/product comparison in config/sites/.
// ============================================================

import { test } from '@playwright/test';
import { getComparisonPairs } from './config/comparisonConfig.js';
import { getSidebarItems } from './core/scraper.js';
import { printResults } from './utils/logger.js';
import { attachReport, COMPARISON_METADATA } from './utils/annotations.js';
import runSettings from './config/runSettings.json' with { type: 'json' };

const comparisonPairs = getComparisonPairs({
  requireCredentials: !(process.env.SIDEBAR_LIST === 'true' || process.argv.includes('--list')),
});

test.describe.configure({
  mode: shouldRunProductTestsInParallel() ? 'parallel' : 'default',
});

test.describe('Sidebar Comparison', () => {
  for (const comparison of comparisonPairs) {
    const basePayload = buildBasePayload(comparison);
    test(`${comparison.site} - ${String(comparison.id).padStart(2, '0')} - ${comparison.name} - Sidebar Comparison`, {
      annotation: [
        { type: COMPARISON_METADATA, description: JSON.stringify(basePayload) },
        { type: 'Site', description: comparison.site },
        { type: 'Product', description: `${comparison.id} - ${comparison.name}` },
        { type: 'URL A', description: comparison.urlA.loginUrl },
        { type: 'URL B', description: comparison.urlB.loginUrl },
      ],
    }, async ({ browser }, testInfo) => {
      let payload = {
        ...basePayload,
        itemsA: [], itemsB: [], matched: [], missing: [], iconMismatch: [], extraB: [],
        comparisonComplete: false,
      };

      try {
        // Let both isolated sessions finish cleanup before reporting a side's failure.
        const results = await Promise.allSettled([
          getSidebarItems(browser, comparison.urlA),
          getSidebarItems(browser, comparison.urlB),
        ]);
        payload.itemsA = results[0].status === 'fulfilled' ? results[0].value : [];
        payload.itemsB = results[1].status === 'fulfilled' ? results[1].value : [];
        payload.capturedA = results[0].status === 'fulfilled';
        payload.capturedB = results[1].status === 'fulfilled';
        const failures = results.flatMap((result, index) => result.status === 'rejected'
          ? [`URL ${index === 0 ? 'A' : 'B'}: ${result.reason?.message || result.reason}`] : []);
        if (failures.length) throw new Error(failures.join('\n'));
        payload = {
          ...payload,
          ...compareSidebarItems(payload.itemsA, payload.itemsB),
          comparisonComplete: true,
        };

        printResults(payload);
      } catch (error) {
        payload.error = error?.stack || error?.message || String(error);
        throw error;
      } finally {
        await attachReport({ testInfo, includeText: runSettings.attachReports, ...payload });
        console.log(`\nComparison finished for ${comparison.site} / ${comparison.name}.`);
      }
    });
  }
});

function buildBasePayload(comparison) {
  return {
    site: comparison.site,
    productId: comparison.id,
    productName: comparison.name,
    productKey: comparison.key,
    reportSlug: comparison.key,
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

function key(value) {
  return String(value || '').trim().toLowerCase();
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
