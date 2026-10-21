import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import { executeFlow } from '../flows/FlowRunner.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

test('a retry after Save searches the checkpoint profile without creating or saving another', async () => {
  const context = await browser.newContext();
  const requested = [];
  try {
    await context.route('http://recovery.test/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      requested.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      let body;
      if (url.pathname === '/login' && request.method() === 'GET') {
        body = `<form method="post"><label>Login Name<input name="username"></label>
          <label>Password<input name="password" type="password"></label><button>Login</button></form>`;
      } else if (url.pathname === '/individual/search') {
        body = `<form action="/individual/workspace"><label>Last Name<input name="lastName"></label>
          <label>First Name<input name="firstName"></label><button>Search</button></form>`;
      } else if (url.pathname === '/individual/workspace') {
        body = '<h1>Modify Individual</h1><p>Licensee ID: 123</p><a href="/individual/search">Return to Search</a>';
      } else {
        body = '<a href="#">Licensing</a><a href="#">Individual</a><a href="/individual/search">Modify</a>';
      }
      return route.fulfill({ contentType: 'text/html', body });
    });
    const page = await context.newPage();
    const result = await executeFlow(page, {
      flow: '1', environment: { loginUrl: 'http://recovery.test/login' },
      businessUnit: { id: 'MAMMO' }, credentials: { username: 'test', password: 'test' },
      createdProfile: {
        fullName: 'IND_checkpoint MAMMO_checkpoint', persistenceUnknown: true,
        profileName: { firstName: 'IND_checkpoint', lastName: 'MAMMO_checkpoint' },
      },
      onProfileCheckpoint: () => assert.fail('a recovery must not call create/Save'),
    });
    assert.equal(result.entityName, 'IND_checkpoint MAMMO_checkpoint');
    const search = requested.find(({ path }) => path === '/individual/workspace');
    assert.deepEqual(search.query, { lastName: 'MAMMO_checkpoint', firstName: 'IND_checkpoint' });
    assert.equal(requested.some(({ path }) => /new|create|save/i.test(path)), false);
  } finally { await context.close(); }
});
