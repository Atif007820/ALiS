import {
  test,
  addApplyAnnotations,
  addUserAnnotations,
  getApplicationTarget,
  loadLoginApplyUserData,
  logger,
} from '../framework.js';
import { getFollowUpType } from '../config/applicationTypes.js';
import { loadFollowUpConveyance, saveApplicationTransaction } from '../utils/transactionStore.js';

const { appType } = getApplicationTarget();
const followUp = getFollowUpType(appType);

test(followUp ? `Conveyance - Login and Apply for ${followUp.label.slice('Conveyance '.length)}` : 'Conveyance - Login and Apply Permit', async (
  { loginPage, dashboardPage, permitApplicationPage, variancePage, alterationPage },
  testInfo
) => {
  const userData = await test.step('Load applicant account', async () => {
    const data = await loadLoginApplyUserData();
    addUserAnnotations(testInfo, data);
    return data;
  });
  const followUpContext = followUp ? await test.step('Load the target conveyance number', () => {
    const target = loadFollowUpConveyance(testInfo);
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

  let applicationPage;
  let selection;
  if (followUpContext) {
    applicationPage = appType === 'CA' ? alterationPage : variancePage;
    selection = await test.step(`Complete ${followUp.label} application`, async () => {
      const number = followUpContext.conveyanceNumber;
      const result = appType === 'CA'
        ? await alterationPage.completeAlterationApplication(number, { preserveInformation: process.env.CONVEYANCE_NO_INFORMATION_CHANGES === '1' })
        : await variancePage.completeVarianceApplication(number);
      return { ...result, ...followUpContext };
    });
  } else {
    applicationPage = permitApplicationPage;
    selection = await test.step('Complete selected installation permit application', () =>
      permitApplicationPage.completePermitApplication({ onSelection: value => addApplyAnnotations(testInfo, value) }));
  }

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
