import { test } from '../fixtures/register.fixture.js';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { siteRegistry } from '../registry/siteRegistry.js';
import { resolveRunMatrix } from '../utils/helpers.js';

const combinations = resolveRunMatrix(siteRegistry);

if (process.argv.includes('--list')) {
  const seen = new Set();
  for (const { environment, site } of combinations) {
    const key = `${environment.key}:${site.key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`\n${key} [${site.versionSource}] Version: ${site.urlVersion || 'Not versioned'}`);
    console.log(`  Configured URL: ${site.configuredLoginUrl}`);
    console.log(`  Effective URL:  ${site.loginUrl}`);
  }
}

test.describe('AllUserRegistration', () => {
  if (isParallelRunEnabled()) {
    test.describe.configure({ mode: 'parallel' });
  }

  for (const { environment, site, product } of combinations) {
    test(`${environment.name} - ${site.displayName} - ${product.name} @${environment.key} @${site.key} @${product.key}`, async ({
      page,
      registrationPage,
    }, testInfo) => {
      const strategy = siteRegistry.createStrategy(site, { page, registrationPage, testInfo });
      await strategy.register(product.key);
    });
  }
});

function isParallelRunEnabled() {
  if (process.env.REGISTER_FULLY_PARALLEL !== undefined) {
    return !/^false|0|no$/i.test(process.env.REGISTER_FULLY_PARALLEL);
  }

  return Boolean(runSettings.fullyParallel);
}
