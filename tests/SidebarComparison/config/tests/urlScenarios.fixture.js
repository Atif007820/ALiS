import { test, expect } from '@playwright/test';
import { getComparisonPairs } from '../comparisonConfig.js';
import { getSidebarItems } from '../../core/scraper.js';
import { attachReport, COMPARISON_METADATA } from '../../utils/annotations.js';

const origin = process.env.SIDEBAR_SMOKE_ORIGIN;
const scenarios = ['product', 'site', 'global', 'partial', 'disabled', 'same-url'];

function buildScenario(scenario) {
  const configurations = ['ALPHA', 'BETA'].map((site) => ({
    site, configFile: `config/sites/${site}.js`,
    products: [1, 2].map((id) => ({
      id, name: `${scenario} product ${id}`, enabled: true,
      ...Object.fromEntries(['urlA', 'urlB'].map((side) => [side, {
        loginUrl: `${origin}/product/${site}/${id}/Login${side === 'urlA' ? 'A' : 'B'}`,
        username: `${site}-${id}-${side}`, password: 'local-smoke-password',
      }])),
    })),
  }));
  const settings = {};
  const siteUrls = { enabled: true, urlA: `${origin}/site/LoginA`, urlB: `${origin}/site/LoginB` };
  if (['site', 'global', 'partial'].includes(scenario)) configurations[0].siteUrlOverrides = siteUrls;
  if (['global', 'partial'].includes(scenario)) {
    settings.globalUrlOverrides = { enabled: true, urlA: `${origin}/global/LoginA`, urlB: scenario === 'partial' ? '' : `${origin}/global/LoginB` };
  }
  if (scenario === 'disabled') {
    settings.globalUrlOverrides = { enabled: false, urlA: `${origin}/unused/globalA`, urlB: `${origin}/unused/globalB` };
    configurations[0].siteUrlOverrides = { enabled: false, urlA: `${origin}/unused/siteA`, urlB: `${origin}/unused/siteB` };
  }
  if (scenario === 'same-url') settings.globalUrlOverrides = { enabled: true, urlA: `${origin}/global/LoginA`, urlB: `${origin}/global/LoginA` };
  return getComparisonPairs({ sites: 'ALL', products: 'ALL', configurations, settings, env: {} });
}

for (const scenario of scenarios) {
  for (const pair of buildScenario(scenario)) {
    const metadata = {
      site: pair.site, productId: `${scenario}-${pair.id}`, productName: pair.name,
      urlA: pair.urlA.loginUrl, urlB: pair.urlB.loginUrl,
      labelA: pair.urlA.label, labelB: pair.urlB.label,
    };
    test(`${scenario} / ${pair.site} / ${pair.id}`, {
      annotation: [
        { type: COMPARISON_METADATA, description: JSON.stringify(metadata) },
        { type: 'URL A Source', description: pair.urlA.urlSource },
        { type: 'URL B Source', description: pair.urlB.urlSource },
      ],
    }, async ({ browser }, testInfo) => {
      if (scenario === 'product' && pair.site === 'ALPHA' && pair.id === 1) {
        await test.step('Unavailable login pages fail fast and close their sessions', async () => {
          for (const status of [404, 500]) {
            await expect(getSidebarItems(browser, { ...pair.urlA, loginUrl: `${origin}/errors/${status}` }))
              .rejects.toThrow(`HTTP ${status}`);
          }
          expect(browser.contexts()).toHaveLength(0);
        });
      }
      const sources = ['global', 'partial', 'same-url'].includes(scenario)
        ? ['GLOBAL', scenario !== 'partial' ? 'GLOBAL' : pair.site === 'ALPHA' ? 'SITE' : 'PRODUCT']
        : scenario === 'site' && pair.site === 'ALPHA' ? ['SITE', 'SITE'] : ['PRODUCT', 'PRODUCT'];
      expect([pair.urlA.urlSource, pair.urlB.urlSource]).toEqual(sources);
      let itemsA = [];
      let itemsB = [];
      let error;
      try {
        await test.step('Login and capture both resolved URLs with separate product accounts', async () => {
          [itemsA, itemsB] = await Promise.all([getSidebarItems(browser, pair.urlA), getSidebarItems(browser, pair.urlB)]);
          const expectedA = pair.urlA.loginUrl.endsWith('LoginB') ? 'DB' : '';
          const expectedB = pair.urlB.loginUrl.endsWith('LoginB') ? 'DB' : '';
          expect(itemsA).toEqual([{ title: 'Dashboard', text: 'Dashboard', iconCode: expectedA }]);
          expect(itemsB).toEqual([{ title: 'Dashboard', text: 'Dashboard', iconCode: expectedB }]);
          expect(browser.contexts()).toHaveLength(0);
        });
      } catch (failure) {
        error = failure;
        throw failure;
      } finally {
        const iconMatches = itemsA[0]?.iconCode === itemsB[0]?.iconCode;
        await attachReport({
          testInfo, includeReports: true, ...metadata, itemsA, itemsB,
          matched: !error && iconMatches ? ['Dashboard'] : [], missing: [], extraB: [],
          iconMismatch: !error && !iconMatches ? [{ title: 'Dashboard', iconA: itemsA[0].iconCode, iconB: itemsB[0].iconCode }] : [],
          comparisonComplete: !error, ...(error ? { error: error.message } : {}),
        });
      }
    });
  }
}
