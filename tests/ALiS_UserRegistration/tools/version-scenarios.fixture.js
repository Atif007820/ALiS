import { test, expect } from '../fixtures/register.fixture.js';
import { siteRegistry } from '../registry/siteRegistry.js';
import { versionFromUrl } from '../config/urls.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };

// Optional live verification; never included by npm run validate or normal registration discovery.
const scenarios = JSON.parse(process.env.REGISTRATION_VERSION_SCENARIOS || '[]');

for (const scenario of scenarios) {
  const settings = {
    ...runSettings,
    environmentVersionOverrides: {
      ...runSettings.environmentVersionOverrides,
      [scenario.environment]: { enabled: scenario.enabled, version: scenario.version },
    },
  };
  const site = siteRegistry.resolve(scenario.site, scenario.environment, { settings });
  if (!site) throw new Error(`Live scenario ${scenario.name}: ${scenario.environment}:${scenario.site} has no configured URL.`);
  const product = site.products.find((item) => item.key === scenario.product);
  if (!product) throw new Error(`Live scenario ${scenario.name}: unknown product ${scenario.product}.`);
  test(`${scenario.name} - ${scenario.environment} - ${scenario.site} - ${scenario.product}`, async ({
    page, registrationPage,
  }, testInfo) => {
    const versioned = Boolean(versionFromUrl(site.configuredLoginUrl));
    expect(site.versionSource).toBe(versioned ? (scenario.enabled ? 'OVERRIDE' : 'ORIGINAL') : 'NOT VERSIONED');
    if (scenario.enabled && versioned) expect(site.urlVersion).toBe(scenario.version);
    const strategy = siteRegistry.createStrategy(site, { page, registrationPage, testInfo });
    const result = await strategy.register(product.key);
    expect(result.user.loginUrl).toBe(site.loginUrl);
    const successful = await strategy.isSuccessful();
    if (!successful) {
      await testInfo.attach('Unconfirmed registration outcome', {
        contentType: 'application/json',
        body: JSON.stringify({ url: page.url(), text: await registrationPage.bodyText() }),
      });
    }
    expect(successful).toBe(true);
  });
}
