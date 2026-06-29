import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { addRegistrationAnnotations } from '../utils/annotations.js';
import { outputUserDataPath } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { commonUser, nextLoginName, simplePerson, entityName, phone, street, unit, city, zip } from '../utils/randomData.js';

export class BaseStrategy {
  constructor({ site, page, registrationPage, testInfo }) {
    this.site = site;
    this.page = page;
    this.form = registrationPage;
    this.testInfo = testInfo;
    this.dialogMessages = [];
  }

  get retryLimit() {
    return this.site.retryLimit || runSettings.retryLimit || 40;
  }

  get profileRetryLimit() {
    return this.site.profileRetryLimit || runSettings.profileRetryLimit || 4;
  }

  get validationRetryLimit() {
    return this.site.validationRetryLimit || runSettings.validationRetryLimit || 1;
  }

  product(productKey) {
    const requested = String(productKey).toUpperCase();
    const found = this.site.products.find((item) => [
      item.key,
      ...(item.aliases || []),
    ].map((key) => String(key).toUpperCase()).includes(requested));
    if (!found) throw new Error(`Unknown product "${productKey}" for site "${this.site.key}".`);
    return found;
  }

  async register(productKey) {
    const product = this.product(productKey);
    const user = this.buildUser(product);

    this.page.on('dialog', async (dialog) => {
      this.dialogMessages.push(dialog.message());
      if (product.dialogAction === 'dismiss') {
        await dialog.dismiss().catch(() => {});
        return;
      }

      await dialog.accept().catch(() => {});
    });

    logger.section(`${this.site.environment.key}-${this.site.key}-${product.key} Registration`);
    logger.info(`Environment: ${this.site.environment.name}`);
    logger.info(`Login URL: ${this.site.loginUrl}`);
    logger.info(`Product: ${product.name}`);
    logger.info(`Initial Login Name: ${user.loginName}`);
    addRegistrationAnnotations(this.testInfo, { site: this.site, product });

    await this.openRegistration(product, user);
    this.dialogMessages.length = 0;
    await this.form.waitForReady();
    await this.fillRegistration(product, user);

    const registeredUser = await this.submitWithRetries(product, user);
    addRegistrationAnnotations(this.testInfo, { site: this.site, product, user: registeredUser });
    logger.info(`Final Login Name: ${registeredUser.loginName}`);

    const userDataPath = this.saveUserData(product, registeredUser);
    logger.info(`Credentials saved -> ${userDataPath}`);
    return { product, user: registeredUser, userDataPath };
  }

  buildUser(product) {
    return {
      ...commonUser(product),
      environment: this.site.environment.key,
      site: this.site.key,
      loginUrl: this.site.loginUrl,
    };
  }

  refreshUser(product, user) {
    const person = simplePerson();
    const nextCity = city();
    user.firstName = person.firstName;
    user.lastName = person.lastName;
    user.fullName = `${person.firstName} ${person.lastName}`;
    user.contactPerson = user.fullName;
    user.entityName = entityName(product.entityPrefix || product.key);
    user.facilityName = user.entityName;
    user.streetOne = street(nextCity);
    user.streetTwo = unit();
    user.city = nextCity;
    user.zip = zip();
    user.phone = phone();
    user.fax = phone();
    return user;
  }

  async openRegistration() {
    throw new Error(`${this.constructor.name}.openRegistration() is not implemented.`);
  }

  async fillRegistration() {
    throw new Error(`${this.constructor.name}.fillRegistration() is not implemented.`);
  }

  async fillAccount(user) {
    await this.form.fillAccount(user);
  }

  async submit() {
    await this.form.submit();
  }

  async submitWithRetries(product, user) {
    let loginRetryCount = 0;
    let profileRetryCount = 0;
    let validationRetryCount = 0;

    for (let attempt = 1; attempt <= this.retryLimit; attempt++) {
      await this.fillAccount(user);
      await this.submit(product, user);

      const dialogs = this.dialogMessages.splice(0);
      const duplicateLoginDialog = dialogs.find((message) => /login name.*(already|exists|unique|taken)|already.*login name/i.test(message));
      if (duplicateLoginDialog) {
        loginRetryCount += 1;
        user.loginName = this.nextLoginName(product, user.loginName, loginRetryCount);
        logger.warn(`Login name already taken. Retrying with ${user.loginName}`);
        continue;
      }

      const duplicateProfileDialog = dialogs.find((message) => /profile with this data already exists|another profile cannot be created|data already exists/i.test(message));
      if (duplicateProfileDialog) {
        await this.form.waitForReady();
        if (await this.isSuccessful(product, user)) return user;
        profileRetryCount = this.ensureProfileRetryAvailable(profileRetryCount, duplicateProfileDialog);
        await this.retryWithFreshProfile(product, user, duplicateProfileDialog);
        continue;
      }

      if (dialogs.length) {
        throw new Error(`Registration failed alert: ${dialogs.join(' | ')}`);
      }

      if (await this.form.isDuplicateLoginVisible()) {
        loginRetryCount += 1;
        user.loginName = this.nextLoginName(product, user.loginName, loginRetryCount);
        logger.warn(`Login name already taken. Retrying with ${user.loginName}`);
        continue;
      }

      const duplicateProfileText = await this.form.duplicateProfileText();
      if (duplicateProfileText) {
        if (await this.isSuccessful(product, user)) return user;
        profileRetryCount = this.ensureProfileRetryAvailable(profileRetryCount, duplicateProfileText);
        await this.retryWithFreshProfile(product, user, duplicateProfileText);
        continue;
      }

      const validationText = await this.form.validationText();
      if (validationText) {
        if (this.isProfileValidation(validationText)) {
          profileRetryCount = this.ensureProfileRetryAvailable(profileRetryCount, validationText);
          await this.retryWithFreshProfile(product, user, validationText);
          continue;
        }

        if (/required|must provide either|please enter|must select/i.test(validationText) && validationRetryCount < this.validationRetryLimit) {
          validationRetryCount += 1;
          logger.warn(`Validation after submit. Refilling required fields and retrying (${validationRetryCount}/${this.validationRetryLimit}): ${validationText}`);
          await this.form.waitForReady();
          await this.fillRegistration(product, user);
          continue;
        }

        throw new Error(`Registration failed validation: ${validationText}`);
      }

      if (await this.isSuccessful(product, user)) {
        return user;
      }

      if (await this.shouldRetryWhenFormStillOpen()) {
        profileRetryCount = this.ensureProfileRetryAvailable(profileRetryCount, 'Registration form stayed open after submit.');
        await this.retryWithFreshProfile(product, user, 'Registration form stayed open after submit.');
        continue;
      }

      return user;
    }

    throw new Error(`Registration failed after ${this.retryLimit} attempts.`);
  }

  ensureProfileRetryAvailable(currentCount, reason) {
    const nextCount = currentCount + 1;
    if (nextCount > this.profileRetryLimit) {
      throw new Error(`Registration profile retry limit reached (${this.profileRetryLimit}). Last reason: ${reason}`);
    }

    return nextCount;
  }

  async shouldRetryWhenFormStillOpen() {
    return this.form.isRegistrationFormOpen();
  }

  isProfileValidation(validationText) {
    return /information provided by you does not match with our record|review your personal information/i.test(validationText);
  }

  async isSuccessful() {
    return !(await this.form.isRegistrationFormOpen());
  }

  async retryWithFreshProfile(product, user, reason) {
    const previousLabel = user.entityName || user.facilityName || user.fullName;
    this.refreshUser(product, user);
    logger.warn(`Profile retry (${reason}) ${previousLabel} -> ${user.entityName || user.facilityName || user.fullName}, keeping login ${user.loginName}`);
    await this.form.waitForReady();
    await this.fillRegistration(product, user);
  }

  nextLoginName(product, previousLoginName, retryCount) {
    return nextLoginName(product, previousLoginName, retryCount);
  }

  saveUserData(product, user) {
    const filePath = outputUserDataPath(join(
      runSettings.userDataDir,
      this.site.environment.key,
      `lastRegistered${this.site.key}${product.key}User.json`,
    ));
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(user, null, 2)}\n`, 'utf-8');
    return filePath;
  }
}
