import { runSettings, test } from '../fixtures/hmb.fixture.js';
import { addRegistrationAnnotations } from '../utils/annotations.js';
import { saveRegisteredUser } from '../utils/userStore.js';

test('HMB - Register', async ({ registrationPage }, testInfo) => {
  test.setTimeout(runSettings.testTimeout);

  const user = await registrationPage.register();

  await saveRegisteredUser(user);
  addRegistrationAnnotations(testInfo, user);
});
