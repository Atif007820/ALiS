import {
  test,
  addApplyAnnotations,
  addUserAnnotations,
  loadLoginApplyUserData,
  logger,
} from '../framework.js';

test.describe('Login and Apply', () => {

  test('02 - Login and Apply Permit', async (
    { loginPage, dashboardPage, permitApplicationPage },
    testInfo
  ) => {

    const userData = await test.step('Load registered user data', async () => {
      const data = await loadLoginApplyUserData();
      addUserAnnotations(testInfo, data);
      return data;
    });

    logger.section('02 Login and Apply Permit');
    logger.info(`Login Name: ${userData.loginName}`);

    await test.step('Login to the application', async () => {
      await loginPage.login(userData, { force: true });
    });

    await test.step('Apply for New Permit from dashboard', async () => {
      await dashboardPage.openNewPermitApplication();
    });

    const licenseSelection = await test.step('Complete new conveyance installation permit application', async () => {
      return permitApplicationPage.completeNewConveyancePermitApplication({
        onSelection: (selection) => addApplyAnnotations(testInfo, selection),
      });
    });

    await test.step('Attach permit application result', async () => {
      addApplyAnnotations(testInfo, licenseSelection);
    });

  });

});
