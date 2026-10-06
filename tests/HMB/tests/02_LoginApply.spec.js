import { runSettings, test } from '../fixtures/hmb.fixture.js';
import { addApplicationAnnotations } from '../utils/annotations.js';
import { loadLoginApplyUser, registeredUserPath } from '../utils/userStore.js';

test('HMB - Login Apply', async ({ loginApplyPage }, testInfo) => {
  test.setTimeout(runSettings.testTimeout);

  let user;
  try {
    user = await loadLoginApplyUser(testInfo.project.name);
  } catch (error) {
    throw new Error(
      `Could not load Login/Apply credentials. Provide both values in config/standaloneLoginCredentials.js `
      + `or set LOGIN_NAME and LOGIN_PASSWORD; otherwise run "npm run hmb:register -- --project=${testInfo.project.name}" first. `
      + `Expected saved account: ${registeredUserPath(testInfo.project.name)}. ${error.message}`,
    );
  }

  const result = await loginApplyPage.loginAndApply(user, {
    step: (name, action) => test.step(name, action),
  });

  addApplicationAnnotations(testInfo, result, user);
});
