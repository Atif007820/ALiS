import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const frameworkRoot = fileURLToPath(new URL('../../', import.meta.url));
const storeUrl = new URL('../../utils/userStore.js', import.meta.url).href;

function credentials(t, source, overrides) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'conveyance-login-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const savedPath = path.join(directory, 'user.json');
  const registered = { loginName: 'fresh-registration', password: 'LocalFixture@1' };
  fs.writeFileSync(savedPath, JSON.stringify(registered));
  const script = `const {loadLoginApplyUserData}=await import(${JSON.stringify(storeUrl)});
    console.log('CREDENTIAL_RESULT:'+JSON.stringify(await loadLoginApplyUserData()));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: frameworkRoot, encoding: 'utf8', timeout: 10000, windowsHide: true,
    env: { ...process.env, CONVEYANCE_LOGIN_SOURCE: source, USER_DATA_PATH: savedPath, ...overrides },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout.split(/\r?\n/).find(line => line.startsWith('CREDENTIAL_RESULT:'));
  assert.ok(output, result.stdout);
  return { actual: JSON.parse(output.slice('CREDENTIAL_RESULT:'.length)), registered };
}

test('E2E uses its newly registered account, not standalone login overrides', t => {
  const { actual, registered } = credentials(t, 'registered', {
    LOGIN_NAME: 'standalone-account', LOGIN_PASSWORD: 'StandaloneFixture@2',
  });
  assert.deepEqual(actual, registered);
});

test('Apply-only honors standalone login credentials', t => {
  const standalone = { LOGIN_NAME: 'standalone-account', LOGIN_PASSWORD: 'StandaloneFixture@2' };
  const { actual } = credentials(t, 'standalone', standalone);
  assert.equal(actual.loginName, standalone.LOGIN_NAME);
  assert.equal(actual.password, standalone.LOGIN_PASSWORD);
});

test('Apply-only falls back to the saved account when standalone values are blank', t => {
  const { actual, registered } = credentials(t, 'standalone', { LOGIN_NAME: ' ', LOGIN_PASSWORD: ' ' });
  assert.deepEqual(actual, registered);
});
