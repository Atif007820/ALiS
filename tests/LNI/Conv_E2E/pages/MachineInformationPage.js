import { expect } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { appConfig } from '../config/runConfig.js';
import { TEST_DATA } from '../config/editableData.js';
import {
  COUNTERWEIGHT_ROPE_TYPE_CODES,
  FEATURE_CHECKBOXES,
  GOVERNOR_TYPE_CAR_CODES,
  GOVERNOR_TYPE_COUNTERWEIGHT_CODES,
  INTERIOR_TYPE_CODES,
  MACHINE_TYPES,
  ROPE_TYPE_CODES,
} from '../config/constants.js';
import {
  checkRandomAvailableCheckboxes,
  fillIfAvailable,
  isVisible,
  selectIfAvailable,
} from '../utils/formActions.js';
import {
  num1to12,
  num1to99,
  num1to99999,
  pick,
  randomDesignation,
  randomEscModel,
  randomModelNumXXX,
  randomTraderManufacturer,
  randomUSLocation,
  randInt,
  xxxx,
  xxx,
} from '../utils/randomData.js';
import { logger } from '../utils/logger.js';

export class MachineInformationPage extends BasePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    super(page);
  }

  /**
   * Fill the entire Machine Information section.
   * Each sub-method gracefully skips fields that are not visible or disabled.
   */
  async fill() {
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Conveyance Contract Value' }),             xxxx(),                    { label: 'Conveyance Contract Value' });
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Conveyance/Escalator Manufacturer' }),     randomTraderManufacturer(), { label: 'Conveyance/Escalator Manufacturer' });
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Conveyance/Escalator Model' }),            randomEscModel(),           { label: 'Conveyance/Escalator Model' });

    await this.selectRandomMachineTypeCheckboxes();
    await this.fillPrimaryDimensions();
    await this.fillRiseInInch();
    await this.fillSecondaryDimensions();
    await this.selectRandomYesNo();
    await this.fillControllerInformation();
    await this.fillInteriorInformation();
    await this.fillGovernorCarInformation();
    await this.fillGovernorCounterweightInformation();
    await this.selectRandomFeatureCheckboxes();
  }

  // ─── Section Fill Methods ─────────────────────────────────────────────────

  async selectRandomMachineTypeCheckboxes() {
    await checkRandomAvailableCheckboxes(this.page, MACHINE_TYPES, {
      label: 'machine type',
      min: 1,
      max: 3,
      timeout: 3000,
    });
  }

  async fillPrimaryDimensions() {
    const fields = [
      [this.page.getByRole('textbox', { name: 'Conveyance Designation' }),       randomDesignation(), 'Conveyance Designation'],
      [this.page.getByRole('textbox', { name: 'Capacity (lbs)' }),               num1to99999(),       'Capacity (lbs)'],
      [this.page.getByRole('textbox', { name: 'Rated Speed (feet per minute)' }), num1to12(),         'Rated Speed'],
      [this.page.getByRole('textbox', { name: 'Up Speed (feet per minute)' }),   num1to12(),          'Up Speed'],
      [this.page.getByRole('textbox', { name: 'Down Speed (feet per minute)' }), num1to12(),          'Down Speed'],
      [this.page.getByRole('textbox', { name: '# of Landings' }),                num1to12(),          '# of Landings'],
      [this.page.locator('#txtRiseInFeet'),                                       num1to12(),          'Rise In Feet'],
    ];
    for (const [locator, value, label] of fields) {
      await fillIfAvailable(locator, value, { label });
    }
  }

  /**
   * Fill "Rise In Inch" — a notoriously stubborn Angular field.
   * Retries multiple times, then falls back to a direct DOM value-setter.
   */
  async fillRiseInInch() {
    const value = String(randInt(TEST_DATA.riseInInchMin, TEST_DATA.riseInInchMax));
    const field = this.page.locator('#txtRiseInInch:visible').first();

    try {
      await field.waitFor({ state: 'visible', timeout: appConfig.timeouts.slowField });
    } catch {
      logger.info('Skipping Rise In Inch: not visible');
      return false;
    }

    try {
      await expect(field).toBeEnabled({ timeout: appConfig.timeouts.slowField });
    } catch {
      logger.info('Skipping Rise In Inch: disabled');
      return false;
    }

    for (let attempt = 1; attempt <= TEST_DATA.slowFieldRetryCount; attempt++) {
      await field.scrollIntoViewIfNeeded().catch(() => {});
      await field.click({ timeout: 5000 });
      await field.fill('');
      await field.fill(value);
      await field.press('Tab');

      const actual = await field.inputValue().catch(() => '');
      if (actual === value) {
        logger.info(`Filled Rise In Inch: ${value}`);
        return true;
      }
      logger.warn(`Rise In Inch attempt ${attempt} did not stick (got: "${actual}")`);
      await this.page.waitForTimeout(TEST_DATA.slowFieldRetryDelayMs);
    }

    await field.evaluate((el, nextValue) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, nextValue);
      else el.value = nextValue;
      el.dispatchEvent(new Event('input',  { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur',   { bubbles: true }));
    }, value);

    await expect(field).toHaveValue(value, { timeout: 5000 });
    logger.info(`Filled Rise In Inch with fallback: ${value}`);
    return true;
  }

  async fillSecondaryDimensions() {
    const fields = [
      [this.page.getByRole('textbox', { name: 'Net Travel (inches)' }),          num1to12(), 'Net Travel'],
      [this.page.getByRole('textbox', { name: 'Car Inside Net Width (inches)' }), num1to12(), 'Car Inside Net Width'],
      [this.page.getByRole('textbox', { name: 'Car Inside Net Length (inches)' }), num1to12(), 'Car Inside Net Length'],
      [this.page.getByRole('textbox', { name: 'Car Height' }),                    num1to12(), 'Car Height'],
      [this.page.getByRole('textbox', { name: '# of Front Openings' }),           num1to12(), '# of Front Openings'],
      [this.page.getByRole('textbox', { name: '# of Rear Openings' }),            num1to12(), '# of Rear Openings'],
      [this.page.getByRole('textbox', { name: 'Blind Hoistway (feet)' }),         num1to12(), 'Blind Hoistway'],
    ];
    for (const [locator, value, label] of fields) {
      await fillIfAvailable(locator, value, { label });
    }
  }

  async selectRandomYesNo() {
    const chosen = pick(TEST_DATA.yesNoOptions);
    const primary = this.page.locator('cc-machine-information mat-radio-group').last();
    const fallback = this.page.locator(
      'xpath=/html/body/app-root/basepage/main/div/div[3]/div[2]/div/' +
      'app-routes-licensing-external-application/app-additional-information/form/' +
      'cc-machine-information/section/div[2]/div[9]/div[9]/div[2]/mat-radio-group'
    );

    let group = primary;
    if (!(await isVisible(group, 3000))) group = fallback;
    if (!(await isVisible(group, 3000))) {
      logger.info('Skipping Yes/No radio: not available');
      return false;
    }

    await group.locator('mat-radio-button', { hasText: chosen }).click();
    logger.info(`Selected Yes/No: ${chosen}`);
    return true;
  }

  async fillControllerInformation() {
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Location of the Controller' }), randomUSLocation(),        { label: 'Location of the Controller' });
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Controller Manufacturer' }),    randomTraderManufacturer(), { label: 'Controller Manufacturer' });
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Controller Model Number' }),    randomModelNumXXX(),        { label: 'Controller Model Number' });
  }

  async fillInteriorInformation() {
    const chosen   = pick(INTERIOR_TYPE_CODES);
    const selected = await selectIfAvailable(this.page.getByLabel('Interior Type'), chosen, { label: 'Interior Type' });

    if (selected && chosen === 'OTHR') {
      await fillIfAvailable(
        this.page.getByRole('textbox', { name: 'Interior Type Other Description' }),
        TEST_DATA.interiorTypeOtherDescription,
        { label: 'Interior Type Other Description' }
      );
    }

    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Interior Material Weight (lbs)' }), xxxx(), { label: 'Interior Material Weight' });
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Motor Horsepower' }),               xxx(),  { label: 'Motor Horsepower' });
    await fillIfAvailable(this.page.getByRole('textbox', { name: 'Gripper Brake Location' }),         randomUSLocation(), { label: 'Gripper Brake Location' });
  }

  async fillGovernorCarInformation() {
    const chosen   = pick(GOVERNOR_TYPE_CAR_CODES);
    const selected = await selectIfAvailable(this.page.locator('#ddlGovernorTypeCode'), chosen, { label: 'Governor Type - Car' });

    if (selected && chosen === 'OTHR') {
      await fillIfAvailable(
        this.page.getByRole('textbox', { name: 'Governor type Other Description' }),
        TEST_DATA.governorTypeOtherDescription,
        { label: 'Governor Type Other Description' }
      );
    }

    await fillIfAvailable(this.page.locator('#txtGovernorTripSpeed'),  xxxx(),    { label: 'Governor Trip Speed' });
    await fillIfAvailable(this.page.locator('#txtOverspeedTripSpeed'), num1to99(), { label: 'Overspeed Trip Speed' });
    await fillIfAvailable(this.page.locator('#txtPullThrough'),        xxxx(),    { label: 'Pull Through' });
    await fillIfAvailable(this.page.locator('#txtPullOut'),            xxxx(),    { label: 'Pull Out' });
    await selectIfAvailable(this.page.locator('#ddlGovernorRopeType'), pick(ROPE_TYPE_CODES), { label: 'Governor Rope Type' });
    await fillIfAvailable(this.page.locator('#txtRopeSize'),           num1to99(), { label: 'Rope Size' });
  }

  async fillGovernorCounterweightInformation() {
    const chosen   = pick(GOVERNOR_TYPE_COUNTERWEIGHT_CODES);
    const selected = await selectIfAvailable(this.page.locator('#ddlGovernorTypeCodeCW'), chosen, { label: 'Governor Type - Counterweight' });

    if (selected && chosen === 'OTHR') {
      await fillIfAvailable(
        this.page.locator("//input[@id='txtGovernorTypeOtherDescriptionCW']"),
        TEST_DATA.governorTypeOtherDescriptionCW,
        { label: 'Governor Type Other Description - Counterweight' }
      );
    }

    await fillIfAvailable(this.page.locator('#txtGovernorTripSpeedCW'),  xxxx(),    { label: 'Governor Trip Speed CW' });
    await fillIfAvailable(this.page.locator('#txtOverspeedTripSpeedCW'), xxxx(),    { label: 'Overspeed Trip Speed CW' });
    await fillIfAvailable(this.page.locator('#txtPullThroughCW'),        num1to99(), { label: 'Pull Through CW' });
    await fillIfAvailable(this.page.locator('input[name="txtPullOutCW"]'), num1to99(), { label: 'Pull Out CW' });
    await selectIfAvailable(this.page.locator('#ddlRopeTypeCW'), pick(COUNTERWEIGHT_ROPE_TYPE_CODES), { label: 'Counterweight Rope Type' });
    await fillIfAvailable(this.page.locator('#txtRopeSizeCW'),           num1to99(), { label: 'Rope Size CW' });
  }

  async selectRandomFeatureCheckboxes() {
    await checkRandomAvailableCheckboxes(this.page, FEATURE_CHECKBOXES, {
      label: 'feature',
      min: 1,
      max: FEATURE_CHECKBOXES.length,
      timeout: 3000,
    });
  }
}
