import { runSettings, test } from '../fixtures/hmb.fixture.js';
import { addApplicationAnnotations, addRegistrationAnnotations } from '../utils/annotations.js';
import { saveRegisteredUser } from '../utils/userStore.js';

test('HMB - Register, Login, Apply and Submit', async ({ registrationPage, loginApplyPage }, testInfo) => {
  test.setTimeout(runSettings.testTimeout);

  const user = await registrationPage.register();
  await saveRegisteredUser(user, testInfo.project.name);
  addRegistrationAnnotations(testInfo, user);

  const result = await loginApplyPage.loginAndApply(user, {
    freshRegistration: true,
    step: (name, action) => test.step(name, action),
  });

  addApplicationAnnotations(testInfo, result, user);
});
