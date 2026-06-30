export function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    if ('text' in value) {
      return normalizeText(value.text);
    }

    if ('richText' in value) {
      return normalizeText(value.richText.map((item) => item.text).join(''));
    }

    if ('result' in value) {
      return normalizeText(value.result);
    }

    if ('hyperlink' in value && 'text' in value) {
      return normalizeText(value.text);
    }
  }

  return String(value)
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function uniqueBy(items, keyFactory) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = keyFactory(item);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

export function compareKey(row, keys) {
  return keys.map((key) => normalizeText(row[key])).join(' | ');
}
