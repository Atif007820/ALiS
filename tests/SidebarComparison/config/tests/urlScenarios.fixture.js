import { test, expect } from '@playwright/test';
import { getComparisonPairs } from '../comparisonConfig.js';
import { getSidebarItems } from '../../core/scraper.js';
import { attachReport, COMPARISON_METADATA } from '../../utils/annotations.js';

const origin = process.env.SIDEBAR_SMOKE_ORIGIN;
const scenarios = ['product', 'site', 'global', 'partial', 'disabled', 'same-version'];

function buildScenario(scenario) {
  const configurations = ['ALPHA', 'BETA'].map((site) => ({
    site, configFile: 'config/sites/' + site + '.js',
    products: [1, 2].map((id) => ({
      id, name: scenario + ' product ' + id, enabled: true,
      ...Object.fromEntries(['urlA', 'urlB'].map((side) => [side, {
        loginUrl: origin + '/ALiS' + site + '2TESTING' + (side === 'urlA' ? '11.3.25.03' : '11.4.42.01')
          + '/product/' + id + '/Login.aspx',
        username: site + '-' + id + '-' + side, password: 'local-smoke-password',
      }])),
    })),
  }));
  const settings = {};
  const siteVersions = { enabled: true, versionA: '11.3.29.02', versionB: '11.4.41.09' };
  if (['site', 'global', 'partial'].includes(scenario)) configurations[0].siteVersionOverrides = siteVersions;
  if (['global', 'partial'].includes(scenario)) {
    settings.globalVersionOverrides = { enabled: true, versionA: '11.3.30.03', versionB: scenario === 'partial' ? '' : '11.4.42.03' };
  }
  if (scenario === 'disabled') {
    settings.globalVersionOverrides = { enabled: false, versionA: '91.0.0.01', versionB: '91.0.0.02' };
    configurations[0].siteVersionOverrides = { enabled: false, versionA: '92.0.0.01', versionB: '92.0.0.02' };
  }
  if (scenario === 'same-version') settings.globalVersionOverrides = { enabled: true, versionA: '11.4.42.03', versionB: '11.4.42.03' };
  return getComparisonPairs({ sites: 'ALL', products: 'ALL', configurations, settings, env: {} });
}

for (const scenario of scenarios) {
  for (const pair of buildScenario(scenario)) {
    const metadata = {
      site: pair.site, productId: scenario + '-' + pair.id, productName: pair.name,
      urlA: pair.urlA.loginUrl, urlB: pair.urlB.loginUrl,
      labelA: pair.urlA.label, labelB: pair.urlB.label,
      versionA: pair.urlA.version, versionB: pair.urlB.version,
      versionSourceA: pair.urlA.versionSource, versionSourceB: pair.urlB.versionSource,
    };
    test(scenario + ' / ' + pair.site + ' / ' + pair.id, {
      annotation: [
        { type: COMPARISON_METADATA, description: JSON.stringify(metadata) },
        { type: 'Version A', description: pair.urlA.version },
        { type: 'Version A Source', description: pair.urlA.versionSource },
        { type: 'Version B', description: pair.urlB.version },
        { type: 'Version B Source', description: pair.urlB.versionSource },
      ],
    }, async ({ browser }, testInfo) => {
      if (scenario === 'product' && pair.site === 'ALPHA' && pair.id === 1) {
        await test.step('Unavailable login pages fail fast and close their sessions', async () => {
          for (const status of [404, 500]) {
            await expect(getSidebarItems(browser, { ...pair.urlA, loginUrl: origin + '/errors/' + status }))
              .rejects.toThrow('HTTP ' + status);
          }
          await expect(getSidebarItems(browser, { ...pair.urlA, password: 'wrong-local-password' }, {
            testInfo, side: 'rejected-login',
          })).rejects.toThrow('Login failed');
          expect(browser.contexts()).toHaveLength(0);
        });
      }
      const sources = ['global', 'partial', 'same-version'].includes(scenario)
        ? ['GLOBAL', scenario !== 'partial' ? 'GLOBAL' : pair.site === 'ALPHA' ? 'SITE' : 'PRODUCT']
        : scenario === 'site' && pair.site === 'ALPHA' ? ['SITE', 'SITE'] : ['PRODUCT', 'PRODUCT'];
      expect([pair.urlA.versionSource, pair.urlB.versionSource]).toEqual(sources);
      for (const side of ['urlA', 'urlB']) {
        expect(new URL(pair[side].loginUrl).pathname).toBe(
          '/ALiS' + pair.site + '2TESTING' + pair[side].version + '/product/' + pair.id + '/Login.aspx',
        );
      }
      if (scenario === 'same-version') expect(pair.urlA.loginUrl).toBe(pair.urlB.loginUrl);
      let itemsA = [];
      let itemsB = [];
      let error;
      try {
        await test.step('Login and capture both resolved URLs with separate product accounts', async () => {
          [itemsA, itemsB] = await Promise.all([
            getSidebarItems(browser, pair.urlA, { testInfo, side: 'A' }),
            getSidebarItems(browser, pair.urlB, { testInfo, side: 'B' }),
          ]);
          const expectedA = pair.urlA.version.startsWith('11.4.') ? 'DB' : '';
          const expectedB = pair.urlB.version.startsWith('11.4.') ? 'DB' : '';
          expect(itemsA).toEqual([
            { title: 'Dashboard', text: 'Dashboard', iconCode: expectedA },
            { title: 'Reports', text: 'Reports', iconCode: expectedA ? 'RP' : '' },
          ]);
          expect(itemsB).toEqual([
            { title: 'Dashboard', text: 'Dashboard', iconCode: expectedB },
            { title: 'Reports', text: 'Reports', iconCode: expectedB ? 'RP' : '' },
          ]);
          expect(browser.contexts()).toHaveLength(0);
        });
      } catch (failure) {
        error = failure;
        throw failure;
      } finally {
        const iconMatches = itemsA[0]?.iconCode === itemsB[0]?.iconCode;
        await attachReport({
          testInfo, includeReports: true, ...metadata, itemsA, itemsB,
          matched: !error && iconMatches ? ['Dashboard', 'Reports'] : [], missing: [], extraB: [],
          iconMismatch: !error && !iconMatches ? itemsA.map((item, index) => ({
            title: item.title, iconA: item.iconCode, iconB: itemsB[index].iconCode,
          })) : [],
          comparisonComplete: !error, ...(error ? { error: error.message } : {}),
        });
      }
    });
  }
}
