import { test, expect } from '@playwright/test';
import { TEST_DATA } from './config.js';
import { addApplyAnnotations, addUserAnnotations } from './annotations.js';
import { logger } from './logger.js';
import {
  fillField,
  fillMachineInformation,
  loadUserData,
  login,
  pick,
  randomAlphaAddress,
  randomBuildingName,
  randomEnglishName,
  randomPhone10,
  randomSuiteAptUnit,
  randomUBI,
  randomUSCity,
  randomUSState,
  randomZip5_5,
  safeSelect,
  selectConfiguredLicenseAndConveyance,
  uploadVisibleMandatoryDocuments,
} from './functions.js';

test('02 - Login and Apply Permit', async ({ page }, testInfo) => {
  test.setTimeout(10 * 60 * 1000);

  // User data
  const userData = await loadUserData();
  addUserAnnotations(testInfo, userData);

  // Login
  logger.section('02 Login and Apply Permit');
  logger.info(`Login Name: ${userData.loginName}`);

  await login(page, userData, { force: true });
  await expect(page.getByText('NPApply for New Permit')).toBeVisible({ timeout: 150000 });

  // Application type
  await page.getByText('NPApply for New Permit').click();

  // FIX: After clicking "Apply for New Permit" the app should navigate to the
  // permit application form. If the server is down or the URL is wrong, the
  // browser may land on an IIS default page instead.  Asserting that
  // "New Conveyance Installation" becomes visible catches this immediately
  // with a meaningful timeout error rather than a confusing pool-exhaustion
  // error several steps later in selectConfiguredLicenseAndConveyance.
  const newConveyance = page.getByRole('radio', { name: 'New Conveyance Installation' });
  await newConveyance.waitFor({ state: 'visible', timeout: 150000 });

  // FIX: Extra guard — if we somehow ended up on an IIS / server-error page,
  // fail immediately with a descriptive message before attempting any form steps.
  const iisIndicator = page.getByRole('link', { name: 'IIS' });
  if (await iisIndicator.isVisible().catch(() => false)) {
    throw new Error(
      `Navigation after "Apply for New Permit" landed on an IIS default/error page. ` +
      `Current URL: ${page.url()}. ` +
      `Verify the application server is running and BASE_URL in config.js is correct.`
    );
  }

  await newConveyance.check();

  // License type and conveyance type
  const licenseSelection = await selectConfiguredLicenseAndConveyance(page);
  addApplyAnnotations(testInfo, licenseSelection);
  logger.info(`Conveyance type: ${licenseSelection.conveyanceType}`);

  await page.getByRole('button', { name: 'Next' }).click();

  // Entity information
  const entityNext = page.getByRole('button', { name: 'Next' }).nth(1);
  await entityNext.waitFor({ state: 'visible', timeout: 15000 });
  await entityNext.click();

  // Address information
  await page.locator('#ddlCopy_LMA').waitFor({ state: 'visible', timeout: 150000 });
  await safeSelect(page.locator('#ddlCopy_LMA'), TEST_DATA.lmaCopySource);
  await fillField(page.locator('#ContactName_LMA'), randomEnglishName());
  await fillField(page.locator('#txtAlternatePhone_LMA'), randomPhone10());
  await fillField(page.locator('#txtFax_LMA'), randomPhone10());

  await safeSelect(page.locator('#ddlCopy_SLA'), TEST_DATA.slaCopySource);
  await fillField(page.locator('#ContactName_SLA'), randomEnglishName());

  await fillField(page.getByRole('textbox', { name: 'Building Name' }), randomBuildingName());
  await fillField(page.getByRole('textbox', { name: 'Location Notes' }), TEST_DATA.locationNotes);

  await safeSelect(page.locator('#ddlCopy_CON'), TEST_DATA.contractorCopySource);
  await fillField(page.locator('#ContactName_CON'), randomEnglishName());

  await page.getByRole('button', { name: 'Next' }).nth(1).click();

  // Owner information
  const addOwnerLink = page.getByRole('link', { name: 'Add', exact: true });
  await addOwnerLink.waitFor({ state: 'visible', timeout: 150000 });
  await addOwnerLink.click();

  const ownerExistsDropdown = page.getByLabel('Does the owner already exist');
  await ownerExistsDropdown.waitFor({ state: 'visible', timeout: 150000 });

  const ownerExistsValue = pick(TEST_DATA.ownerExistsOptions);
  logger.info(`Owner Exists: ${ownerExistsValue}`);
  await safeSelect(ownerExistsDropdown, ownerExistsValue);

  if (ownerExistsValue === 'Y') {
    await fillField(page.getByRole('textbox', { name: 'UBI #' }), TEST_DATA.ownerExistingUbi, { pressTab: false });
    await page.getByRole('button', { name: 'Search' }).click();
  } else {
    await fillField(page.locator('#txtUBI1'), randomUBI());
    await fillField(page.getByRole('textbox', { name: 'Owner Name' }), randomEnglishName());
    await fillField(page.getByRole('textbox', { name: 'Comments' }), TEST_DATA.ownerComments);
    await fillField(page.getByRole('textbox', { name: 'Contact Name' }), randomEnglishName());
    await fillField(page.getByRole('textbox', { name: 'Address' }), randomAlphaAddress());
    await fillField(page.getByRole('textbox', { name: 'City' }), randomUSCity());
    await fillField(page.getByRole('textbox', { name: 'Suite/Apt/Unit/etc.' }), randomSuiteAptUnit());
    await safeSelect(page.getByLabel('State/Province'), randomUSState());
    await fillField(page.getByRole('textbox', { name: 'Zip' }), randomZip5_5());
    await fillField(page.getByRole('textbox', { name: 'Primary Phone #', exact: true }), randomPhone10());
    await fillField(page.getByRole('textbox', { name: 'Alternate Phone #', exact: true }), randomPhone10());
    await fillField(page.getByRole('textbox', { name: 'Fax' }), randomPhone10());
    await fillField(page.getByRole('textbox', { name: 'Primary E-mail' }), TEST_DATA.businessEmail);
    await fillField(page.getByRole('textbox', { name: 'Alternate E-mail' }), TEST_DATA.alternateEmail);
  }

  const saveBtn = page.getByRole('button', { name: 'Save' });
  await saveBtn.waitFor({ state: 'visible', timeout: 10000 });
  await saveBtn.click();
  await page.waitForLoadState('networkidle').catch(() => {});

  const nextAfterSave = page.getByRole('button', { name: 'Next' }).nth(2);
  await nextAfterSave.waitFor({ state: 'visible', timeout: 150000 });
  await nextAfterSave.click();

  // Upload documents
  await uploadVisibleMandatoryDocuments(page);

  // Machine information
  await fillMachineInformation(page);

  const nextToReview = page.getByRole('button', { name: 'Next' }).nth(2);
  await nextToReview.waitFor({ state: 'visible', timeout: 100000 });
  await nextToReview.click();

  // Questions
  const firstReviewGroup = page.locator('mat-radio-group').nth(0);
  await firstReviewGroup.waitFor({ state: 'visible', timeout: 150000 });
  await firstReviewGroup.locator('mat-radio-button', { hasText: TEST_DATA.reviewAnswers[0] }).click();

  const secondReviewGroup = page.locator('mat-radio-group').nth(1);
  await secondReviewGroup.waitFor({ state: 'visible', timeout: 100000 });
  await secondReviewGroup.locator('mat-radio-button', { hasText: TEST_DATA.reviewAnswers[1] }).click();

  const thirdReviewGroup = page.locator('mat-radio-group').nth(2);
  await thirdReviewGroup.waitFor({ state: 'visible', timeout: 100000 });
  await thirdReviewGroup.locator('mat-radio-button', { hasText: TEST_DATA.reviewAnswers[2] }).click();

  // Attestation
  const nextToAttest = page.getByRole('button', { name: 'Next' }).first();
  await nextToAttest.waitFor({ state: 'visible', timeout: 100000 });
  await nextToAttest.click();

  const attestCheckbox = page.getByRole('checkbox', { name: 'I attest to all of the' });
  await attestCheckbox.waitFor({ state: 'visible', timeout: 150000 });
  await attestCheckbox.check();

  // Submit and confirm
  const submitBtn = page.getByRole('button', { name: 'Submit Application' });
  await submitBtn.waitFor({ state: 'visible', timeout: 100000 });
  await submitBtn.click();

  const payNowBtn = page.getByRole('button', { name: 'Pay Now' });
  await payNowBtn.waitFor({ state: 'visible', timeout: 200000 });
  await payNowBtn.click();

  await expect(page.getByRole('heading', { name: 'Confirmation' })).toBeVisible({ timeout: 20000 });
  logger.success('Application submitted successfully');
});
