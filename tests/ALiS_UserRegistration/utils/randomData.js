import { fakerEN as faker } from '@faker-js/faker';
import { arrayConstants } from '../config/arrayConstants.js';
import { editableData } from '../config/editableData.js';

const loginNumberPools = new Map();
const usedPersonNames = new Set();
let generatedFirstNamePool;
let generatedLastNamePool;
const DEFAULT_LOGIN_PRIORITY_MAX = 9999;
const DEFAULT_LOGIN_FALLBACK_DIGITS = 5;

export const pick = (items) => faker.helpers.arrayElement(items);
export const randDigits = (length) => Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
export const randAlpha = (length) => Array.from({ length }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export function numberWithDigitLength(length) {
  if (length <= 1) return String(Math.floor(Math.random() * 9) + 1);
  if (length > 12) return `${Math.floor(Math.random() * 9) + 1}${randDigits(length - 1)}`;
  const min = 10 ** (length - 1);
  const max = (10 ** length) - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

export function numberUpTo(max) {
  return String(Math.floor(Math.random() * max) + 1);
}

function loginNumberPolicy() {
  const policy = editableData.loginNumberPolicy || {};
  const priorityMax = Number(policy.priorityMax);
  const fallbackStartDigits = Number(policy.fallbackStartDigits);

  return {
    priorityMax: Number.isInteger(priorityMax) && priorityMax > 0 ? priorityMax : DEFAULT_LOGIN_PRIORITY_MAX,
    fallbackStartDigits: Number.isInteger(fallbackStartDigits) && fallbackStartDigits > 0 ? fallbackStartDigits : DEFAULT_LOGIN_FALLBACK_DIGITS,
  };
}

export function timestampParts() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  return {
    dateForName: `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`,
    dateForField: `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`,
    timeForName: `${pad(hours12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`,
  };
}

export function entityName(prefix) {
  const { dateForName, timeForName } = timestampParts();
  return `${prefix}_${dateForName}_${timeForName}`;
}

export function simplePerson() {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const firstName = pick(firstNamePool());
    const lastName = pick(lastNamePool());
    const key = `${firstName} ${lastName}`.toUpperCase();

    if (!usedPersonNames.has(key)) {
      usedPersonNames.add(key);
      return { firstName, lastName };
    }
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const firstName = cleanSimpleName(faker.person.firstName(), 9);
    const lastName = cleanSimpleName(faker.person.lastName(), 11);
    const key = `${firstName} ${lastName}`.toUpperCase();

    if (firstName && lastName && !usedPersonNames.has(key)) {
      usedPersonNames.add(key);
      return { firstName, lastName };
    }
  }

  return {
    firstName: pick(firstNamePool()),
    lastName: pick(lastNamePool()),
  };
}

export function phone() {
  return `${randDigits(3)}-${randDigits(3)}-${randDigits(4)}`;
}

export function zip() {
  return `${numberWithDigitLength(5)}-${randDigits(4)}`;
}

export function ubi() {
  return `${randDigits(3)}-${randDigits(3)}-${randDigits(3)}`;
}

export function nvBusinessId(length = 11) {
  return `NV${numberWithDigitLength(length)}`;
}

export function ssn() {
  const area = Math.floor(Math.random() * (665 - 200 + 1)) + 200;
  const group = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
  const serial = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `${area}-${group}-${serial}`;
}

export function street(city) {
  const name = pick(arrayConstants.streetNames);
  if (city && Math.random() > 0.5) return `${numberWithDigitLength(3)} ${name} Street, ${city}`;
  return `${numberWithDigitLength(3)} ${name} Street`;
}

export function unit() {
  return `${pick(editableData.unitPrefixes)} ${numberWithDigitLength(2)}`;
}

export function city() {
  return pick(arrayConstants.cities);
}

export function usState() {
  return pick(arrayConstants.usStates);
}

function isSimpleNameLogin(product) {
  return ['simpleNameNumber', 'simpleNameProductNumber'].includes(product.loginStyle);
}

function formattedLoginName(product, number) {
  if (product.loginStyle === 'simpleNameProductNumber') {
    return `${pick(firstNamePool())}_${product.key}_${number}`;
  }

  if (product.loginStyle === 'simpleNameNumber') {
    return `${pick(firstNamePool())}${number}`;
  }

  return `${product.loginPrefix}${number}`;
}

export function loginName(product, digitLength) {
  if (Number.isInteger(Number(digitLength)) && Number(digitLength) > 0) {
    return formattedLoginName(product, numberWithDigitLength(Number(digitLength)));
  }

  const { priorityMax, fallbackStartDigits } = loginNumberPolicy();
  const poolKey = loginNumberPoolKey(product, '');
  const number = nextPriorityLoginNumber(poolKey, priorityMax) ?? numberWithDigitLength(fallbackStartDigits);

  return formattedLoginName(product, number);
}

function loginNumberPoolKey(product, previousLoginName) {
  if (isSimpleNameLogin(product)) {
    return `${product.key || product.name}:${product.loginStyle}`;
  }

  return product.loginPrefix || String(previousLoginName).replace(/\d+$/, '');
}

function usedLoginNumbers(poolKey) {
  if (!loginNumberPools.has(poolKey)) {
    loginNumberPools.set(poolKey, new Set());
  }

  return loginNumberPools.get(poolKey);
}

function rememberPreviousLoginNumber(poolKey, previousLoginName, max) {
  const match = String(previousLoginName).match(/(\d+)$/);
  if (!match) return;

  const value = Number(match[1]);
  if (Number.isInteger(value) && value >= 1 && value <= max) {
    usedLoginNumbers(poolKey).add(value);
  }
}

function nextPriorityLoginNumber(poolKey, max) {
  const used = usedLoginNumbers(poolKey);
  if (used.size >= max) return null;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = Number(numberUpTo(max));
    if (!used.has(candidate)) {
      used.add(candidate);
      return String(candidate);
    }
  }

  for (let candidate = 1; candidate <= max; candidate += 1) {
    if (!used.has(candidate)) {
      used.add(candidate);
      return String(candidate);
    }
  }

  return null;
}

export function retryLoginName(product, previousLoginName, retryCount) {
  const {
    priorityMax,
    fallbackStartDigits,
  } = loginNumberPolicy();

  const poolKey = loginNumberPoolKey(product, previousLoginName);
  rememberPreviousLoginNumber(poolKey, previousLoginName, priorityMax);

  const priorityNumber = nextPriorityLoginNumber(poolKey, priorityMax);
  const fallbackDigits = fallbackStartDigits + Math.max(0, retryCount - priorityMax - 1);
  const number = priorityNumber ?? numberWithDigitLength(fallbackDigits);

  return formattedLoginName(product, number);
}

export function nextLoginName(product, previousLoginName, retryCount) {
  const previousAlpha = String(previousLoginName).replace(/\d+$/, '');
  let candidate;

  do {
    candidate = retryLoginName(product, previousLoginName, retryCount);
  } while (
    candidate === previousLoginName
    || (product.loginStyle === 'simpleNameNumber' && candidate.replace(/\d+$/, '') === previousAlpha)
  );

  return candidate;
}

export function commonUser(product) {
  const person = simplePerson();
  const generatedCity = city();
  const prefix = product.entityPrefix || product.key;

  return {
    product: product.key,
    productName: product.name,
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: `${person.firstName} ${person.lastName}`,
    contactPerson: `${person.firstName} ${person.lastName}`,
    entityName: entityName(prefix),
    facilityName: entityName(prefix),
    date: timestampParts().dateForField,
    dob: timestampParts().dateForField,
    email: editableData.primaryEmail,
    emailId: editableData.primaryEmail,
    altEmail: editableData.alternateEmail,
    country: pick(editableData.countries),
    streetOne: street(generatedCity),
    streetTwo: unit(),
    city: generatedCity,
    state: usState(),
    zip: zip(),
    phone: phone(),
    phoneExt: numberWithDigitLength(3),
    fax: phone(),
    userPhone: phone(),
    primaryPhone: phone(),
    businessPhone: phone(),
    ubiNumber: ubi(),
    nvBusinessId: nvBusinessId(),
    nvBusinessIdShort: nvBusinessId(7),
    ssn: ssn(),
    ssnTin: ssn(),
    apiNumber: `API${numberWithDigitLength(4)}`,
    arrtNumber: numberWithDigitLength(9),
    localLicense: numberWithDigitLength(4),
    facilityType: editableData.nvrcp.facilityType,
    eclNumber: `ECL${numberWithDigitLength(3)}`,
    gclNumber: `GCL${numberWithDigitLength(4)}`,
    craneOwnerId: `CRNOWN${numberWithDigitLength(4)}`,
    loginName: loginName(product),
    password: editableData.defaultPassword,
  };
}

function firstNamePool() {
  if (!generatedFirstNamePool) {
    generatedFirstNamePool = uniqueNames([
      ...arrayConstants.firstNames,
      ...fakerNamePool(() => faker.person.firstName(), 1500, 9),
    ]);
  }

  return generatedFirstNamePool;
}

function lastNamePool() {
  if (!generatedLastNamePool) {
    generatedLastNamePool = uniqueNames([
      ...arrayConstants.lastNames,
      ...fakerNamePool(() => faker.person.lastName(), 1500, 11),
    ]);
  }

  return generatedLastNamePool;
}

function fakerNamePool(generator, targetCount, maxLength) {
  const names = [];
  for (let attempt = 0; attempt < targetCount * 4 && names.length < targetCount; attempt += 1) {
    const name = cleanSimpleName(generator(), maxLength);
    if (name) names.push(name);
  }

  return names;
}

function uniqueNames(names) {
  return [...new Set(names.map((name) => cleanSimpleName(name, 14)).filter(Boolean))];
}

function cleanSimpleName(value, maxLength) {
  const name = String(value ?? '').replace(/[^A-Za-z]/g, '');
  if (name.length < 3 || name.length > maxLength) return '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1).toLowerCase()}`;
}
