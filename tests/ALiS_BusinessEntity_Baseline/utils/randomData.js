import { randomUUID } from 'node:crypto';

const usedPersonNames = new Set();

export function buildEntityName(prefix = 'ENTITY', now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 || 12;
  const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const time = `${pad(hours12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${hours24 >= 12 ? 'PM' : 'AM'}`;
  return `${prefix}_${date}_${time}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

export function phone() {
  return `${randDigits(3)}-${randDigits(3)}-${randDigits(4)}`;
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
