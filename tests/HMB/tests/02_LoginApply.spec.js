import { runSettings, test } from '../fixtures/hmb.fixture.js';
import { addApplicationAnnotations } from '../utils/annotations.js';
import { loadRegisteredUser, registeredUserPath } from '../utils/userStore.js';

test('HMB - Login Apply', async ({ loginApplyPage }, testInfo) => {
  test.setTimeout(runSettings.testTimeout);

  let user;
  try {
    user = await loadRegisteredUser();
  } catch (error) {
    throw new Error(`No registered user found. Run "npm run hmb:register" first. Expected file: ${registeredUserPath()}. ${error.message}`);
  }

  const result = await loginApplyPage.loginAndApply(user);

  addApplicationAnnotations(testInfo, result, user);
});
