import { test, addUserAnnotations } from '../framework.js';

test.describe('User Registration', () => {

  test('01 - Register New User', async ({ registrationPage }, testInfo) => {

    const userData = await test.step('Build user data', async () => {
      return registrationPage.buildUserData();
    });

    const registeredUser = await test.step('Register New Conveyance Contractor', async () => {
      return registrationPage.registerNewContractorUser(userData);
    });

    addUserAnnotations(testInfo, registeredUser);
  });

});
