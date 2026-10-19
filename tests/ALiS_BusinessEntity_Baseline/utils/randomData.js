const usedPersonNames = new Set();

export function createEntityNameGenerator({
  now = () => new Date(),
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const usedNames = new Set();

  return async (prefix = 'ENTITY') => {
    if (typeof prefix !== 'string' || !prefix.trim()) {
      throw new Error('Entity name prefix must be a non-empty string.');
    }

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const timestamp = now();
      if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) {
        throw new Error('Cannot generate an entity name from an invalid clock date.');
      }

      const name = formatEntityName(prefix, timestamp);
      if (!usedNames.has(name)) {
        // Reserve before yielding so parallel jobs in this runner cannot reuse it.
        usedNames.add(name);
        return name;
      }

      if (attempt < 59) {
        await wait(1000 - timestamp.getMilliseconds());
      }
    }

    throw new Error(`Could not allocate a unique timestamp-only entity name for "${prefix}" after 60 checks. Check the system clock or reduce parallel creates.`);
  };
}

export const buildEntityName = createEntityNameGenerator();

function formatEntityName(prefix, now) {
  const pad = (value) => String(value).padStart(2, '0');
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 || 12;
  const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
  const time = `${pad(hours12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${hours24 >= 12 ? 'PM' : 'AM'}`;
  return `${prefix}_${date}_${time}`;
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
