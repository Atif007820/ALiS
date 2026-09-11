// Live navigation and fill-only audit. Never clicks Register or saves credentials.
import { chromium } from '@playwright/test';
import { siteRegistry } from '../registry/siteRegistry.js';
import { RegistrationPage } from '../pages/RegistrationPage.js';

const args = process.argv.slice(2);
for (const arg of args) {
  if (!/^--(?:env|product)=.+$/.test(arg)) throw new Error(`Unsupported argument ${arg}; this audit does not support submission.`);
}
const environment = args.find((arg) => arg.startsWith('--env='))?.slice(6).toUpperCase() || 'TEST';
const requested = args.find((arg) => arg.startsWith('--product='))?.slice(10).toUpperCase();
const site = siteRegistry.resolve('TXOCA', environment);
const keys = requested ? requested.split(',') : ['GRD', 'CR', 'PS', 'CI', 'PROFESSIONAL_CG'];
const products = keys.map((key) => {
  const product = site.products.find((item) => item.key === key || item.aliases?.includes(key));
  if (!product) throw new Error(`Unknown TXOCA product ${key}`);
  return product;
});
const browser = await chromium.launch({ headless: true });
try {
  for (const product of products) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      page.on('dialog', async (dialog) => {
        if (product.dialogAction === 'dismiss') await dialog.dismiss();
        else await dialog.accept();
      });
      const form = new RegistrationPage(page);
      const strategy = siteRegistry.createStrategy(site, { page, registrationPage: form, testInfo: { annotations: [] } });
      const user = strategy.buildUser(product);
      await strategy.openRegistration(product);
      await strategy.fillRegistration(product, user);
      await strategy.fillAccount(user);
      await form.waitForReady();
      if (strategy.requiresIdentity) await strategy.verifyIdentity(user);
      console.log(JSON.stringify({ product: product.key, environment, status: 'PASS (not submitted)', ...strategy.registrationDiagnostics }));
    } catch (error) {
      process.exitCode = 1;
      console.error(JSON.stringify({ product: product.key, environment, status: 'FAIL', error: error.message }));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
