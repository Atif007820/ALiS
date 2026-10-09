import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openLoginPage } from '../../core/scraper.js';

const target = { loginUrl: 'https://example.test/login', label: 'Smoke URL B' };

for (const failure of ['net::ERR_NETWORK_CHANGED', 'net::ERR_NETWORK_IO_SUSPENDED', 'net::ERR_CONNECTION_RESET', 'navigation timeout']) {
  test(`initial GET retries a transient ${failure} and retains the resolved URL`, async () => {
    const calls = [];
    const response = { status: () => 200 };
    const page = {
      async goto(url, options) {
        calls.push({ url, options });
        if (calls.length === 1) {
          const error = new Error(failure);
          if (failure === 'navigation timeout') error.name = 'TimeoutError';
          throw error;
        }
        return response;
      },
    };
    assert.equal(await openLoginPage(page, target, { retries: 1, timeout: 1234 }), response);
    assert.deepEqual(calls, [1, 2].map(() => ({ url: target.loginUrl, options: { waitUntil: 'domcontentloaded', timeout: 1234 } })));
  });
}

test('retries stop at the configured limit and propagate the navigation failure', async () => {
  let calls = 0;
  const error = new Error('net::ERR_NETWORK_CHANGED');
  const page = { async goto() { calls += 1; throw error; } };
  await assert.rejects(openLoginPage(page, target, { retries: 1 }), (actual) => actual === error);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(openLoginPage(page, target, { retries: 0 }));
  assert.equal(calls, 1);
});

for (const status of [401, 403, 404, 500]) {
  test(`HTTP ${status} fails immediately without retrying`, async () => {
    let calls = 0;
    const page = {
      async goto() { calls += 1; return { status: () => status, statusText: () => 'Unavailable' }; },
      url: () => target.loginUrl,
    };
    await assert.rejects(openLoginPage(page, target, { retries: 3 }), new RegExp(`Smoke URL B: HTTP ${status}`));
    assert.equal(calls, 1);
  });
}

test('certificate and closed-page errors are not treated as transient navigation failures', async () => {
  for (const message of ['net::ERR_CERT_AUTHORITY_INVALID', 'Target page, context or browser has been closed']) {
    let calls = 0;
    const page = { async goto() { calls += 1; throw new Error(message); } };
    await assert.rejects(openLoginPage(page, target, { retries: 3 }));
    assert.equal(calls, 1);
  }
});
