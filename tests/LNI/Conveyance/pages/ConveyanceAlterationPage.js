import { randomInt } from 'node:crypto';
import { expect } from '@playwright/test';
import { TEST_DATA } from '../config/editableData.js';
import { randomEnglishName } from '../utils/randomData.js';
import { normalizeConveyanceNumber } from '../utils/transactionStore.js';
import { ConveyanceFollowUpPage } from './ConveyanceFollowUpPage.js';

const details = TEST_DATA.alteration;
const TITLE = /^Conveyance Information(?:\s|Conveyance|$)/i;
const CONTROL = 'input, select, textarea, mat-select, [role="combobox"]:not(input):not(select)';
const OPERATION_LABEL = 'How is it operated?';
const OTHER_DESCRIPTION_LABEL = 'Operated Other Description';
const OTHER_OPTION = /^(?:Other|OTHR)$/i;
const choose = (items, random) => items[random(items.length)];

function differentValues(value) {
  const digits = value.match(/^(.*?)(\d)([^0-9]*)$/);
  if (digits) return Array.from({ length: 10 }, (_, i) => digits[1] + i + digits[3]).filter(next => next !== value);
  if (/[A-Za-z]$/.test(value)) return ['A', 'B', 'C'].map(char => value.slice(0, -1)
    + (/[a-z]$/.test(value) ? char.toLowerCase() : char)).filter(next => next !== value);
  return [];
}

export class ConveyanceAlterationPage extends ConveyanceFollowUpPage {
  async completeAlterationApplication(conveyanceNumber, { preserveInformation = false } = {}) {
    const number = normalizeConveyanceNumber(conveyanceNumber);
    await this.selectExistingConveyance(number, 'CA');
    await expect(this.page.getByRole('heading', { name: 'Entity Information', exact: true })).toBeVisible();
    await this.next();

    await this.page.locator('#ddlCopy_LMA').filter({ visible: true }).selectOption(TEST_DATA.lmaCopySource);
    await this.page.locator('#ContactName_LMA').filter({ visible: true }).fill(randomEnglishName());
    await this.page.locator('#ddlCopy_CON').filter({ visible: true }).selectOption(details.contractorCopySource);
    await this.next();

    await this.uploadSupportingDocument(details.uploadComments);
    const { min, max } = details.contractValue;
    const contractValue = String(randomInt(min, max + 1));
    await this.page.getByRole('textbox', { name: 'Conveyance Contract Value', exact: true }).fill(contractValue);
    await this.page.locator('#txtRestriction').filter({ visible: true }).fill(details.restriction);
    const changes = preserveInformation ? [] : await this.randomizeConveyanceInformation();

    await this.next();
    await this.answerReviewQuestions();
    await this.attestSubmitAndPayLater();
    await this.expectConfirmation();
    return { appType: 'CA', conveyanceNumber: number, contractValue, informationChanges: changes.length };
  }

  async randomizeConveyanceInformation(random = randomInt) {
    const title = this.page.getByText(TITLE).filter({ visible: true });
    const section = title.locator('xpath=ancestor-or-self::*[self::mat-expansion-panel or self::section or self::fieldset or @role="region" or @data-section="conveyance-information"][1]');
    await expect(section, 'Expected one identifiable Conveyance Information section').toHaveCount(1);
    const collapsed = section.locator('mat-expansion-panel-header[aria-expanded="false"], button[aria-expanded="false"]')
      .filter({ hasText: TITLE, visible: true });
    if (await collapsed.count() === 1) await collapsed.click();

    const candidates = [];
    const radioGroups = new Map();
    const controls = await section.locator(CONTROL).elementHandles();
    try {
      for (const control of controls) {
        if (!await control.isVisible() || !await control.isEnabled()) continue;
        const field = await this.informationField(control);
        if (!field) continue;
        if (field.type === 'radio') {
          if (field.name) {
            if (!radioGroups.has(field.name)) radioGroups.set(field.name, []);
            radioGroups.get(field.name).push({ control, field });
          }
        } else candidates.push({ control, field });
      }
      for (const group of radioGroups.values()) {
        const alternatives = group.filter(({ field }) => !field.checked);
        if (alternatives.length && group.some(({ field }) => field.checked)) candidates.push(choose(alternatives, random));
      }

      const changes = [];
      const count = random(candidates.length + 1);
      for (let i = 0; i < count; i += 1) {
        const [{ control, field }] = candidates.splice(random(candidates.length), 1);
        if (await this.changeInformationField(control, field, random)) changes.push(field.label);
      }
      return changes;
    } finally {
      await Promise.all(controls.map(control => control.dispose()));
    }
  }

  async informationField(control) {
    return control.evaluate((node, { operationLabel, descriptionLabel }) => {
      const role = node.getAttribute('role');
      const labelText = item => {
        const copy = item.cloneNode(true);
        copy.querySelectorAll('input, select, textarea, button').forEach(child => child.remove());
        return copy.textContent;
      };
      const labelledBy = (node.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/)
        .map(id => node.ownerDocument.getElementById(id)).filter(Boolean);
      const labels = [
        node.getAttribute('aria-label'), ...labelledBy.map(labelText), ...Array.from(node.labels ?? [], labelText),
        node.closest('mat-form-field')?.querySelector('mat-label')?.textContent,
        node.id, node.name,
      ].map(value => value?.trim()).filter(Boolean);
      const [label] = labels;
      if (!label || node.readOnly || node.closest('[aria-disabled="true"], fieldset[disabled]')) return null;
      if (labels.includes(descriptionLabel)) return null;
      const identity = [label, node.id, node.name].join(' ').replace(/[_-]+/g, ' ');
      if (/conveyance\s*(?:#|no\.?\b|number\b|id\b|contract\s*value)|serial\s*(?:#|no\b|number\b)|permit\s*(?:#|number\b)|\b(?:attest|certif\w*|signature|password)\b/i.test(identity)) return null;

      const type = node.tagName === 'SELECT' ? 'select' : node.tagName === 'TEXTAREA' ? 'text'
        : node.tagName === 'MAT-SELECT' || (role === 'combobox' && node.tagName !== 'INPUT') ? 'combo'
          : role === 'combobox' ? 'autocomplete' : node.type;
      if (!['select', 'combo', 'radio', 'checkbox', 'text', 'number'].includes(type)) return null;
      if (type === 'checkbox' && (node.required || node.getAttribute('aria-required') === 'true')) return null;
      return { label, type, name: node.name, checked: node.checked, isOperation: labels.includes(operationLabel) };
    }, { operationLabel: OPERATION_LABEL, descriptionLabel: OTHER_DESCRIPTION_LABEL });
  }

  async changeInformationField(control, field, random) {
    if (!await control.evaluate(node => node.isConnected) || !await control.isVisible() || !await control.isEnabled()) return false;
    if (field.type === 'combo') return this.changeCombo(control, field, random);
    if (field.type === 'select') {
      const options = await control.evaluate(node => Array.from(node.options)
        .filter(option => option.value && !option.selected && !option.matches(':disabled'))
        .map(option => ({ value: option.value, label: option.label })));
      if (!options.length) return false;
      const option = choose(options, random);
      await control.selectOption(option.value);
      await this.fillOtherOperationDescription(field, option);
    } else if (['radio', 'checkbox'].includes(field.type)) {
      const checked = await control.isChecked();
      if (field.type === 'radio' && checked) return false;
      if (checked) await control.uncheck();
      else await control.check();
    } else {
      const value = await control.evaluate(node => node.value);
      const options = await control.evaluate((node, values) => values.filter(value => {
        const probe = node.cloneNode();
        probe.value = value;
        return probe.value === value && (node.maxLength < 0 || value.length <= node.maxLength) && probe.checkValidity();
      }), differentValues(value));
      if (!options.length) return false;
      await control.fill(choose(options, random));
    }
    return true;
  }

  async changeCombo(control, field, random) {
    await control.click();
    const popupId = await control.getAttribute('aria-controls');
    const list = (popupId ? this.page.locator(`[id=${JSON.stringify(popupId)}]`) : this.page.getByRole('listbox'))
      .filter({ visible: true });
    await expect(list, 'Expected one list for the selected Conveyance Information field').toHaveCount(1);
    const options = list.getByRole('option', { disabled: false, selected: false }).filter({ visible: true });
    const usable = [];
    for (const option of await options.all()) {
      const label = (await option.innerText()).trim();
      if (!/^(?:\s*|(?:select|choose)(?:\s+one)?|--.*--)$/i.test(label)) usable.push({ option, label });
    }
    if (!usable.length) {
      await this.page.keyboard.press('Escape');
      return false;
    }
    const selected = choose(usable, random);
    await selected.option.click();
    await this.fillOtherOperationDescription(field, selected);
    return true;
  }

  async fillOtherOperationDescription(field, { value = '', label }) {
    if (!field.isOperation || ![value, label].some(option => OTHER_OPTION.test(option.trim()))) return;
    const description = this.page.getByRole('textbox', { name: OTHER_DESCRIPTION_LABEL, exact: true }).filter({ visible: true });
    await description.fill(details.operatedOtherDescription);
    await expect(description).toHaveValue(details.operatedOtherDescription);
  }
}
