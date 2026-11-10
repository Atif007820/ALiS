import { runSettings, test } from '../fixtures/hmb.fixture.js';
import { addApplicationAnnotations } from '../utils/annotations.js';
import { registrationEntityNames, resolveEntityNames } from '../utils/entityNames.js';
import { findRegisteredEntityNames, loadLoginApplyUser } from '../utils/userStore.js';
import { saveApplicationTransaction } from '../utils/transactionStore.js';

test('HMB - Login and Apply Permit', async ({ loginApplyPage }, testInfo) => {
  test.setTimeout(runSettings.testTimeout);

  const { user, freshRegistration } = await test.step(
    'Load HMB applicant credentials',
    () => loadLoginApplyUser(testInfo),
  );

  const result = await loginApplyPage.loginAndApply(user, {
    step: (name, action) => test.step(name, action),
    freshRegistration,
  });
  const registeredNames = freshRegistration
    ? registrationEntityNames(user)
    : await findRegisteredEntityNames(testInfo.project.name, { loginName: user.loginName });
  const application = { ...result, ...resolveEntityNames(result, registeredNames) };

  addApplicationAnnotations(testInfo, application, user);
  console.log(`HMB Transaction Number: ${application.transactionNumber}`);
  saveApplicationTransaction(application, user, testInfo);
});
