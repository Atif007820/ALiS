import { randomInt } from 'node:crypto';

const usedPersonNames = new Set();
const usedProfileNumbers = new Map();
const usedCredentialNumbers = new Set();

export function uniqueCredentialNumber() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = String(randomInt(100_000_000_000, 1_000_000_000_000));
    if (!usedCredentialNumbers.has(value)) {
      usedCredentialNumbers.add(value);
      return value;
    }
  }
  throw new Error('Could not generate an unused 12-digit credential number.');
}

export function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function randDigits(length) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

export function numberWithDigitLength(length) {
  if (length <= 1) {
    return String(Math.floor(Math.random() * 9) + 1);
  }

  return `${Math.floor(Math.random() * 9) + 1}${randDigits(length - 1)}`;
}

export function prioritizedNumber(maxPreferred = 9999) {
  return String(Math.floor(Math.random() * maxPreferred) + 1);
}

export function buildIndividualProfileName(lastPrefix, firstPrefix) {
  const key = JSON.stringify([lastPrefix, firstPrefix]);
  const used = usedProfileNumbers.get(key) || new Set();
  const firstCandidate = Number(prioritizedNumber());
  let suffix = firstCandidate;
  while (used.has(suffix)) suffix += 1;
  used.add(suffix);
  usedProfileNumbers.set(key, used);

  return {
    lastName: `${lastPrefix}_${suffix}`,
    firstName: `${firstPrefix}_${suffix}`,
  };
}

export function phone() {
  return `${randDigits(3)}-${randDigits(3)}-${randDigits(4)}`;
}

export function randomSsn() {
  return `${randDigits(3)}-${randDigits(2)}-${randDigits(4)}`;
}

export function zip() {
  return `${numberWithDigitLength(5)}-${randDigits(4)}`;
}

export function simplePerson(sourceData) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const firstName = pick(sourceData.firstNames);
    const lastName = pick(sourceData.lastNames);
    const key = `${firstName} ${lastName}`.toUpperCase();

    if (!usedPersonNames.has(key)) {
      usedPersonNames.add(key);
      return { firstName, lastName };
    }
  }

  return {
    firstName: pick(sourceData.firstNames),
    lastName: pick(sourceData.lastNames),
  };
}
