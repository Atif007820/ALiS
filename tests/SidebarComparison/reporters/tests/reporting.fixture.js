import { test } from '@playwright/test';
import { attachReport, COMPARISON_METADATA } from '../../utils/annotations.js';

const cases = [
  { name: 'Matched product', site: 'SITE-A', id: 1 },
  { name: 'Different product', site: 'SITE-B', id: 2, difference: true },
  { name: 'Runtime failure', site: 'SITE-A', id: 3, failure: true },
  { name: 'Retried product', site: 'SITE-B', id: 4, retry: true },
  { name: 'Skipped product', site: 'SITE-B', id: 5, skip: true },
];

for (const item of cases) {
  const metadata = { site: item.site, productId: item.id, productName: item.name };
  test(item.name, {
    annotation: [{ type: COMPARISON_METADATA, description: JSON.stringify(metadata) }],
  }, async ({}, testInfo) => {
    test.skip(Boolean(item.skip), 'Report verification: skipped case');
    const failed = item.failure || (item.retry && testInfo.retry === 0);
    await test.step('Capture a local comparison result', async () => {
      await attachReport({
        testInfo, includeReports: testInfo.config.metadata.attachReports, ...metadata,
        itemsA: [{ title: 'Menu', text: 'Menu', iconCode: 'A' }],
        itemsB: [{ title: 'Menu', text: 'Menu', iconCode: item.difference ? 'B' : 'A' }],
        matched: failed || item.difference ? [] : ['Menu'], missing: [], extraB: [],
        iconMismatch: item.difference ? [{ title: 'Menu', iconA: 'A', iconB: 'B' }] : [],
        comparisonComplete: !failed,
        ...(failed ? { error: 'Deliberate local reporting failure' } : {}),
      });
    });
    await testInfo.attach('Diagnostic note', { body: 'Keep normal Playwright diagnostics.', contentType: 'text/plain' });
    if (failed) throw new Error('Deliberate local reporting failure');
  });
}
