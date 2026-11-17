import {
  test,
  addApplyAnnotations,
  addUserAnnotations,
  getApplicationTarget,
  loadLoginApplyUserData,
  logger,
} from '../framework.js';
import { loadVarianceConveyance, saveApplicationTransaction } from '../utils/transactionStore.js';

const isVariance = getApplicationTarget().appType === 'CV';

test(isVariance ? 'Conveyance - Login and Apply for Variance' : 'Conveyance - Login and Apply Permit', async (
  { loginPage, dashboardPage, permitApplicationPage, variancePage },
  testInfo
) => {
  const userData = await test.step('Load applicant account', async () => {
    const data = await loadLoginApplyUserData();
    addUserAnnotations(testInfo, data);
    return data;
  });
  const variance = isVariance ? await test.step('Load the target conveyance number', () => {
    const target = loadVarianceConveyance(testInfo);
    addApplyAnnotations(testInfo, target);
    return target;
  }) : null;

  logger.section('02 Login and Apply Permit');
  logger.info(`Login Name: ${userData.loginName}`);

  await test.step('Login to the application', async () => {
    await loginPage.login(userData, { force: true });
  });

  await test.step('Apply for New Permit from dashboard', async () => {
    await dashboardPage.openNewPermitApplication();
  });

  const applicationPage = isVariance ? variancePage : permitApplicationPage;
  const selection = isVariance
    ? await test.step('Complete Conveyance Variance application', async () => ({
      ...await variancePage.completeVarianceApplication(variance.conveyanceNumber),
      ...variance,
    }))
    : await test.step('Complete selected installation permit application', () =>
      permitApplicationPage.completePermitApplication({ onSelection: value => addApplyAnnotations(testInfo, value) }));

  await test.step('Attach permit application result', async () => {
    addApplyAnnotations(testInfo, selection);
  });

  await test.step('Capture confirmation transaction number', async () => {
    const { transactionNumber, transactionText } = await applicationPage.getConfirmationTransaction();
    addApplyAnnotations(testInfo, { ...selection, transactionNumber });
    logger.info(`Transaction Number: ${transactionNumber}`);
    saveApplicationTransaction({ ...selection, transactionNumber, entityName: userData.entityName }, testInfo);
    await transactionText.click();
  });
});
