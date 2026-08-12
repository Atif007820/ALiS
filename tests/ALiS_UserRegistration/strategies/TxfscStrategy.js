import { expect } from '@playwright/test';
import { BaseStrategy } from './BaseStrategy.js';
import { city, phone, simplePerson, street, timestampParts, unit, zip } from '../utils/randomData.js';

export class TxfscStrategy extends BaseStrategy {
  async openRegistration(product) {
    await this.page.goto(this.site.loginUrl, { waitUntil: 'domcontentloaded' });
    await this.form.waitForLoginShell();

    const registrationLink = this.page.locator(`#${product.registrationLinkId}`).first();
    await this.form.click(registrationLink);

    await expect(this.page.locator('body')).toContainText(/Initial User Registration|Registration|Login Name/i, {
      timeout: 30000,
    });
    await expect(this.page.getByRole('textbox', { name: /Login Name\s*\*?/i }).first()).toBeVisible({
      timeout: 30000,
    });
  }

  async fillRegistration(product, user) {
    await this.form.fillFirstText(['Last Name'], user.lastName, { hard: true, required: true });
    await this.form.fillFirstText(['First Name'], user.firstName, { hard: true, required: true });
    await this.fillDateOfBirth(user);

    await this.form.fillFirstText(['Street One', 'Street 1', 'Address Line 1'], user.streetOne, {
      hard: true,
      required: true,
    });
    await this.form.fillFirstText(['Street Two', 'Street 2', 'Address Line 2'], user.streetTwo, { hard: true });
    await this.form.fillFirstText(['City'], user.city, { hard: true, required: true });

    const zipFilled = await this.form.fillFirstText(['Zip', 'Zip Code'], user.zip, {
      hard: true,
      required: true,
    });
    if (zipFilled) {
      await this.page.keyboard.press('Tab').catch(() => {});
      await this.form.waitForReady();
    }

    await this.form.selectCounty(product.preferredCounty, { required: true });

    if (!(await this.form.fillPrimaryPhone(user))) {
      throw new Error('Required primary phone field was not available.');
    }

    if (!(await this.form.fillPrimaryEmail(user.email))) {
      throw new Error('Required primary email field was not available.');
    }
    await this.form.fillAlternateEmail(user.altEmail);
  }

  refreshUser(product, user) {
    const person = simplePerson();
    const nextCity = city();
    user.firstName = person.firstName;
    user.lastName = person.lastName;
    user.fullName = `${person.firstName} ${person.lastName}`;
    user.contactPerson = user.fullName;
    user.entityName = `${product.entityPrefix}_${user.lastName}_${timestampParts().dateForName}`;
    user.facilityName = user.entityName;
    user.streetOne = street(nextCity);
    user.streetTwo = unit();
    user.city = nextCity;
    user.zip = zip();
    user.phone = phone();
    user.userPhone = phone();
    user.primaryPhone = phone();
    user.fax = phone();
    user.date = timestampParts().dateForField;
    user.dob = user.date;
    return user;
  }

  async fillDateOfBirth(user) {
    if (await this.form.fillFirstText(['DOB', 'Date of Birth', 'Birth Date'], user.date)) {
      return true;
    }

    const calendarButton = this.page.getByRole('button', { name: /CalenderImage|Calendar/i }).first();
    if (!(await calendarButton.isVisible({ timeout: 3000 }).catch(() => false))) {
      return false;
    }

    await calendarButton.click({ noWaitAfter: true });

    const calendarFrame = this.page.frameLocator('#calendarFrame');
    await calendarFrame.getByRole('button', { name: /^OK$/i }).click({ timeout: 10000 }).catch(async () => {
      await this.page.locator('#calendarFrame').contentFrame().locator('input[type="submit"], button').last().click();
    });
    await this.form.waitForReady();
    return true;
  }

  async isSuccessful() {
    const bodyText = await this.form.bodyText();
    return /successfully registered|Welcome|Logout|Dashboard/i.test(bodyText)
      || /\/Protected\/SuccessPage\.aspx|\/Protected\//i.test(this.page.url());
  }
}
