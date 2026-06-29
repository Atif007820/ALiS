/**
 * randomData.js
 *
 * Pure functions that generate random test data.
 * No side-effects — safe to call from any context.
 */

import { fakerEN_US as faker } from '@faker-js/faker';
import { TEST_DATA } from '../config/editableData.js';
import { US_STATES } from '../config/constants.js';

// ─── Primitive Generators ─────────────────────────────────────────────────────

/** Sleep for `ms` milliseconds. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pick a random element from an array. */
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Generate a string of `n` random decimal digits. */
export const randDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

/** Generate `n` digits without a leading zero. */
export const randDigitsNoLeadingZero = (n) => {
  const digitCount = Math.max(1, Number.parseInt(n, 10) || 1);
  if (digitCount === 1) return String(randInt(1, 9));
  return `${randInt(1, 9)}${randDigits(digitCount - 1)}`;
};

/** Generate a string of `n` random uppercase letters. */
export const randAlpha = (n) => Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

/** Random integer between `min` and `max` (inclusive). */
export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Return a shallow-copy of `arr` in random order. */
export const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// ─── Numeric String Generators ────────────────────────────────────────────────

export const num1to12    = () => String(randInt(1, 12));
export const num1to99    = () => String(randInt(1, 99));
export const num1to99999 = () => String(randInt(1, 99999));
export const xxxx        = () => randDigits(4);
export const xxx         = () => randDigits(3);

// ─── Formatted String Generators ─────────────────────────────────────────────

export const randomPhone10  = () => `${randDigits(3)}-${randDigits(3)}-${randDigits(4)}`;
export const randomUBI      = () => `${randDigits(3)}-${randDigits(3)}-${randDigits(3)}`;
export const randomZip      = () => `${randDigits(5)}-${randDigits(4)}`;
export const randomZip5_5   = () => `${randDigits(5)}-${randDigits(5)}`;
export const randomECL      = () => `ECL${randDigits(3)}`;
export const randomGCL      = () => `GCL${randDigits(3)}`;

// ─── Faker-backed Generators ──────────────────────────────────────────────────

export const randomEnglishName      = () => `${faker.person.firstName()} ${faker.person.lastName()}`;
export const randomBuildingName     = () => `${randAlpha(3)} ${pick(TEST_DATA.buildingNameSuffixes)}`;
export const randomUSCity           = () => faker.location.city();
export const randomUSState          = () => pick(US_STATES);
export const randomAlphaAddress     = () => `${randAlpha(3)} ${pick(TEST_DATA.alphaAddressSuffixes)}`;
export const randomTraderManufacturer = () => `${randAlpha(3)} ${pick(TEST_DATA.traderManufacturerSuffixes)}`;
export const randomModelNumXXX      = () => `ModelNum${randDigits(3)}`;
export const randomEscModel         = () => `EscMod${randDigits(pick(TEST_DATA.escModelDigitLengths))}`;
export const randomDesignation      = () => `${pick(TEST_DATA.designationPrefixes)}-${randAlpha(2)}${randDigits(2)}`;
export const randomLoginName        = (digitLength = TEST_DATA.loginNameStartDigits) => (
  `${TEST_DATA.loginNamePrefix}_${randDigitsNoLeadingZero(digitLength)}`
);
export const randomLoginNameForAttempt = (attemptIndex = 0) => (
  randomLoginName((TEST_DATA.loginNameStartDigits ?? 2) + attemptIndex)
);

// ─── Composite Generators ─────────────────────────────────────────────────────

/**
 * Build an entity name that includes a human-readable timestamp.
 * Format: `<prefix>_DD-MM-YYYY_HH:MM:SS AM/PM`
 * @returns {string}
 */
export function buildEntityName() {
  const now    = new Date();
  const pad    = (v) => String(v).padStart(2, '0');
  const date   = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const h24    = now.getHours();
  const h12    = h24 % 12 || 12;
  const ampm   = h24 >= 12 ? 'PM' : 'AM';
  const time   = `${pad(h12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${ampm}`;
  return `${TEST_DATA.entityNamePrefix}_${date}_${time}`;
}

/**
 * Build a complete user object ready for the registration form.
 * @returns {{ loginName: string, password: string, firstName: string, lastName: string, entityName: string, ubi: string }}
 */
export function buildRegistrationUser() {
  const firstName = faker.person.firstName();
  const lastName  = faker.person.lastName();
  return {
    loginName:  randomLoginNameForAttempt(0),
    password:   TEST_DATA.defaultPassword,
    firstName,
    lastName,
    entityName: buildEntityName(),
    ubi:        randomUBI(),
  };
}

/**
 * Generate a random street address, optionally including the city name.
 * @param {string} city
 * @returns {string}
 */
export function randomAddress(city) {
  const building = randDigits(3);
  const type     = pick(TEST_DATA.addressBuildingTypes);
  return Math.random() > 0.5
    ? `${building} ${type}, ${city} Street`
    : `${building} ${type}, ${city}`;
}

/**
 * Generate a random suite / apt / unit string (e.g. "Suite - 3/A").
 * @returns {string}
 */
export function randomSuiteAptUnit() {
  const prefix  = pick(TEST_DATA.unitPrefixes);
  const variant = randInt(0, 2);
  if (variant === 0) return `${prefix} - ${randDigits(1)}`;
  if (variant === 1) return `${prefix} - ${randDigits(1)}/${randAlpha(1)}`;
  return `${prefix} - ${randDigits(2)}/${randAlpha(1)}`;
}

/**
 * Generate a random unit string (slightly different pattern from `randomSuiteAptUnit`).
 * @returns {string}
 */
export function randomUnit() {
  const prefix  = pick(TEST_DATA.unitPrefixes);
  const variant = randInt(0, 2);
  if (variant === 0) return `${prefix} - ${randDigits(1)}/${randAlpha(1)}`;
  if (variant === 1) return `${prefix} - ${randDigits(2)}/${randAlpha(1)}`;
  return `${prefix} - ${randAlpha(1)}`;
}

/**
 * Generate a random US location string (street address, street colony, or street + suffix).
 * @returns {string}
 */
export function randomUSLocation() {
  const style = randInt(0, 2);
  if (style === 0) return faker.location.streetAddress();
  if (style === 1) return `${faker.location.street()} Colony`;
  return `${faker.location.street()} ${pick(TEST_DATA.randomLocationSuffixes)}`;
}
