import { expect } from '@playwright/test';
import { pick } from '../utils/randomData.js';

export class BasePage {
  constructor(page) {
    this.page = page;
  }

  async waitForReady() {
    await this.page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await this.waitForAspNetIdle();
  }

  async waitForAspNetIdle() {
    await this.page.evaluate(() => new Promise((resolve) => {
      const mgr = window.Sys?.WebForms?.PageRequestManager?.getInstance?.();
      if (!mgr || !mgr.get_isInAsyncPostBack()) {
        resolve();
        return;
      }

      const interval = setInterval(() => {
        if (!mgr.get_isInAsyncPostBack()) {
          clearInterval(interval);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 15000);
    })).catch(() => {});

    await this.page.waitForTimeout(250);
  }

  async click(locator) {
    const target = locator.first();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click({ noWaitAfter: true, timeout: 30000 });
    await this.waitForReady();
  }

  async fill(locator, value) {
    const target = locator.first();
    await expect(target).toBeVisible();
    await expect(target).toBeEnabled();
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.fill(String(value));
  }

  async fillHard(locator, value) {
    const target = locator.first();
    await expect(target).toBeVisible();
    await expect(target).toBeEnabled();
    await target.focus();
    await target.evaluate((element) => {
      if (!element.readOnly && !element.disabled) {
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }).catch(() => {});
    await target.fill('');
    await target.fill(String(value));
  }

  async firstVisibleText(text) {
    for (const locator of [
      this.page.getByText(text, { exact: true }),
      this.page.getByText(text, { exact: false }),
    ]) {
      const count = await locator.count().catch(() => 0);
      for (let index = 0; index < count; index++) {
        const candidate = locator.nth(index);
        if (await candidate.isVisible().catch(() => false)) return candidate;
      }
    }

    return this.page.getByText(text, { exact: false }).first();
  }

  async fillFirstText(names, value, { hard = false, required = false, timeout = 5000 } = {}) {
    const deadline = Date.now() + timeout;
    const labels = names.map((name) => name instanceof RegExp ? name.toString() : String(name)).join(', ');

    while (Date.now() <= deadline) {
      for (const name of names) {
        const pattern = name instanceof RegExp ? name : new RegExp(`^${escapeRegex(name)}\\s*\\*?$`, 'i');
        const candidates = [
          this.page.getByRole('textbox', { name: pattern }),
          this.page.getByLabel(pattern),
        ];

        for (const locator of candidates) {
          const target = await this.firstUsable(locator);
          if (target) {
            if (hard) await this.fillHard(target, value);
            else await this.fill(target, value);
            return true;
          }
        }
      }

      await this.page.waitForTimeout(250);
    }

    if (required) throw new Error(`Required text field was not available: ${labels}`);
    return false;
  }

  async fillByTableLabel(label, value, { hard = true, required = false } = {}) {
    const target = await this.controlAfterTableLabel(label, 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
    if (target) {
      if (hard) await this.fillHard(target, value);
      else await this.fill(target, value);
      return true;
    }

    if (required) throw new Error(`Required text field was not available near label: ${label}`);
    return false;
  }

  async selectByTableLabel(label, preferredValue, { required = false } = {}) {
    const target = await this.controlAfterTableLabel(label, 'select');
    if (!target) {
      if (required) throw new Error(`Required select field was not available near label: ${label}`);
      return false;
    }

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const selected = await this.selectOption(target, preferredValue);
      await this.waitForReady();

      if (selected && await this.hasSelectedNonPlaceholderOption(target)) return true;
    }

    if (required) throw new Error(`Required select field did not keep a value near label: ${label}`);
    return false;
  }

  async fillPrimaryEmail(value) {
    return await this.fillByTableLabel(/Primary\s+E-?mail/i, value)
      || await this.fillFirstText(['Email ID', 'Primary E-mail', 'Primary Email', 'Email', 'E-mail'], value, { hard: true });
  }

  async fillAlternateEmail(value) {
    return await this.fillByTableLabel(/Alternate\s+E-?mail/i, value)
      || await this.fillFirstText(['Alt Email', 'Alternate E-mail', 'Alternate Email'], value, { hard: true });
  }

  async selectFirst(names, preferredValue, { required = false, timeout = 5000 } = {}) {
    const deadline = Date.now() + timeout;
    const labels = names.map((name) => name instanceof RegExp ? name.toString() : String(name)).join(', ');

    while (Date.now() <= deadline) {
      for (const name of names) {
        const pattern = name instanceof RegExp ? name : new RegExp(`^${escapeRegex(name)}\\s*\\*?$`, 'i');
        const candidates = [
          this.page.getByLabel(pattern),
          this.page.getByRole('combobox', { name: pattern }),
        ];

        for (const locator of candidates) {
          const target = await this.firstUsable(locator);
          if (target) {
            const selected = await this.selectOption(target, preferredValue);
            await this.waitForReady();
            if (selected) return true;
          }
        }
      }

      await this.page.waitForTimeout(250);
    }

    if (required) throw new Error(`Required select field was not available: ${labels}`);
    return false;
  }

  async selectOption(locator, preferredValue) {
    const target = locator.first();
    await expect(target).toBeVisible();
    await expect(target).toBeEnabled();

    if (!(await this.isNativeSelect(target))) {
      return false;
    }

    await this.waitForSelectOptions(target);

    const options = await this.availableSelectOptions(target);
    if (!options.length) return false;

    const preferred = preferredValue === undefined || preferredValue === null ? '' : String(preferredValue);
    const selectedOption = preferred
      ? options.find((option) => option.value === preferred || option.label === preferred) ?? pick(options)
      : pick(options);

    if (selectedOption.value) {
      await target.selectOption(selectedOption.value);
    } else {
      await target.selectOption({ index: selectedOption.index });
    }

    await target.evaluate((select) => {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});

    return true;
  }

  async selectRandomCounty({ required = false } = {}) {
    if (await this.keepSelectedCountyIfValid()) return true;

    if (await this.selectByTableLabel(/^County\b/i)) return true;

    const county = this.page.getByLabel(/^County\s*\*?$/i)
      .or(this.page.getByRole('combobox', { name: /^County\s*\*?$/i }))
      .first();

    if (!(await county.count().catch(() => 0)) || !(await county.isVisible().catch(() => false))) {
      if (required) throw new Error('Required County dropdown was not available.');
      return false;
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await this.selectOption(county);
      await this.waitForReady();

      if (await this.hasSelectedNonPlaceholderOption(county)) return true;
    }

    if (required) throw new Error('Required County dropdown did not keep a selected value.');
    return false;
  }

  async selectCounty(preferredValue, { required = false } = {}) {
    const preferred = String(preferredValue ?? '').trim();
    if (preferred) {
      const selectedPreferred = await this.selectByTableLabel(/^County\b/i, preferred)
        || await this.selectFirst(['County'], preferred);

      if (selectedPreferred) return true;
    }

    return this.selectRandomCounty({ required });
  }

  async hasSelectedNonPlaceholderOption(locator) {
    return locator.first().evaluate((select) => {
      if (!(select instanceof HTMLSelectElement)) return false;

      const option = select.options[select.selectedIndex];
      if (!option) return false;

      const value = option.value ?? '';
      const label = option.textContent?.trim() ?? '';
      return Boolean(!option.disabled && !isPlaceholder(value, label));

      function isPlaceholder(rawValue, rawLabel) {
        const normalizedValue = String(rawValue ?? '').trim();
        const normalizedLabel = String(rawLabel ?? '').trim();
        return !normalizedValue
          || normalizedValue === '-1'
          || normalizedValue === '0'
          || /^-+$/.test(normalizedLabel)
          || /^--/.test(normalizedLabel)
          || /choose one|select|mandatory/i.test(normalizedLabel);
      }
    }).catch(() => false);
  }

  async keepSelectedCountyIfValid() {
    const county = this.page.getByLabel(/^County\s*\*?$/i)
      .or(this.page.getByRole('combobox', { name: /^County\s*\*?$/i }))
      .first();

    if (!(await county.count().catch(() => 0)) || !(await county.isVisible().catch(() => false))) {
      return false;
    }

    return this.hasSelectedNonPlaceholderOption(county);
  }

  async waitForSelectOptions(locator) {
    const target = locator.first();
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const options = await this.availableSelectOptions(target).catch(() => []);

      if (options.length > 0) return true;
      await this.page.waitForTimeout(250);
    }

    return false;
  }

  async availableSelectOptions(locator) {
    const options = await locator.first().evaluate((select) => {
      if (!(select instanceof HTMLSelectElement) || !select.options) {
        return [];
      }

      return Array.from(select.options)
        .map((option, index) => ({
          index,
          value: option.value,
          label: option.textContent?.trim() ?? '',
          disabled: option.disabled,
        }));
    }).catch(() => []);

    return options.filter((option) => !option.disabled && !isPlaceholderOption(option.value, option.label));
  }

  async isNativeSelect(locator) {
    return locator.first().evaluate((element) => element instanceof HTMLSelectElement).catch(() => false);
  }

  async fillPrimaryPhone(user) {
    const explicitPrimaryPhone = await this.firstUsable(this.page.getByRole('textbox', {
      name: /^Primary\s*Phone\s*#?\s*\*?$/i,
    }));
    const explicitPrimaryPhoneExt = await this.firstUsable(this.page.getByRole('textbox', {
      name: /^Primary\s*Phone\s*#?\s*Ext\s*\*?$/i,
    }));

    if (explicitPrimaryPhone) {
      await this.fill(explicitPrimaryPhone, user.phone);

      if (explicitPrimaryPhoneExt) {
        await this.fill(explicitPrimaryPhoneExt, user.phoneExt || '101');
      }

      return true;
    }

    const phoneWithExt = this.page.getByRole('textbox', {
      name: /^(Primary\s*)?Phone\s*#?\s*-\s*Ext\s*\*?$/i,
    });

    const phoneWithExtCount = await phoneWithExt.count().catch(() => 0);
    if (phoneWithExtCount > 0 && await phoneWithExt.first().isVisible().catch(() => false)) {
      const editablePhoneFields = [];
      for (let index = 0; index < phoneWithExtCount; index += 1) {
        const field = phoneWithExt.nth(index);
        if (await field.isVisible().catch(() => false) && await field.isEditable().catch(() => false)) {
          editablePhoneFields.push(field);
        }
      }

      if (!editablePhoneFields.length) {
        return this.fillFirstText([/^Phone(?!.*Ext)/i, /^Primary Phone\s*#?\s*\*?$/i, 'Primary Phone', 'Primary Phone #'], user.phone);
      }

      await this.fill(editablePhoneFields[0], user.phone);

      if (editablePhoneFields.length > 1) {
        await this.fill(editablePhoneFields[1], user.phoneExt || '101');
      }

      return true;
    }

    return this.fillFirstText([/^Phone(?!.*Ext)/i, /^Primary Phone\s*#?\s*\*?$/i, 'Primary Phone', 'Primary Phone #'], user.phone);
  }

  async fillAlternatePhone(user) {
    const explicitAlternatePhone = await this.firstUsable(this.page.getByRole('textbox', {
      name: /^Alternate\s*Phone\s*#?\s*$/i,
    }));
    const explicitAlternatePhoneExt = await this.firstUsable(this.page.getByRole('textbox', {
      name: /^Alternate\s*Phone\s*#?\s*Ext\s*$/i,
    }));

    if (explicitAlternatePhone) {
      await this.fill(explicitAlternatePhone, user.userPhone || user.phone);

      if (explicitAlternatePhoneExt) {
        await this.fill(explicitAlternatePhoneExt, user.phoneExt || '101');
      }

      return true;
    }

    const alternatePhoneWithExt = this.page.getByRole('textbox', {
      name: /^Alternate\s*Phone\s*#?\s*-\s*Ext\s*$/i,
    });

    const count = await alternatePhoneWithExt.count().catch(() => 0);
    if (count > 0 && await alternatePhoneWithExt.first().isVisible().catch(() => false)) {
      const editablePhoneFields = [];
      for (let index = 0; index < count; index += 1) {
        const field = alternatePhoneWithExt.nth(index);
        if (await field.isVisible().catch(() => false) && await field.isEditable().catch(() => false)) {
          editablePhoneFields.push(field);
        }
      }

      if (!editablePhoneFields.length) return false;

      await this.fill(editablePhoneFields[0], user.userPhone || user.phone);

      if (editablePhoneFields.length > 1) {
        await this.fill(editablePhoneFields[1], user.phoneExt || '101');
      }

      return true;
    }

    return false;
  }

  async clearInputs() {
    await this.page
      .locator('input[type="text"], input[type="email"], input[type="tel"], input[type="password"], textarea, select')
      .evaluateAll((elements) => {
        elements.forEach((element) => {
          if (element.readOnly || element.disabled) return;
          if (element.tagName === 'SELECT') element.selectedIndex = -1;
          element.value = '';
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
  }

  async firstUsable(locator) {
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (
        await candidate.isVisible().catch(() => false)
        && await candidate.isEnabled().catch(() => false)
      ) {
        return candidate;
      }
    }

    return null;
  }

  async controlAfterTableLabel(label, controlSelector) {
    const pattern = label instanceof RegExp ? label : new RegExp(escapeRegex(label), 'i');
    const matches = await this.page.locator('td, th, label, span').evaluateAll((elements, patternConfig) => {
      const matcher = new RegExp(patternConfig.source, patternConfig.flags);

      return elements
        .map((element, index) => ({
          index,
          text: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        }))
        .filter(({ text }) => text.length > 0 && text.length <= 80 && matcher.test(text))
        .sort((left, right) => left.text.length - right.text.length)
        .map(({ index }) => index);
    }, { source: pattern.source, flags: pattern.flags || 'i' }).catch(() => []);

    const labels = this.page.locator('td, th, label, span');
    for (const index of matches) {
      const labelLocator = labels.nth(index);
      const directTarget = labelLocator
        .locator('xpath=following::*[self::input or self::select or self::textarea][not(@type="hidden")][1]')
        .first();

      const usable = await this.firstUsable(directTarget);
      if (!usable) continue;

      const selectorMatch = await usable.evaluate((element, selector) => element.matches(selector), controlSelector).catch(() => false);
      if (selectorMatch) return usable;
    }

    return null;
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlaceholderOption(value, label) {
  const normalizedValue = String(value ?? '').trim();
  const normalizedLabel = String(label ?? '').trim();
  return !normalizedValue
    || normalizedValue === '-1'
    || /^-+$/.test(normalizedLabel)
    || /^--/.test(normalizedLabel)
    || /choose one|select/i.test(normalizedLabel);
}
