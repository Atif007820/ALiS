// Both renderers use the same category rows so totals and detail agree.
export function menuRows(record) {
  if (!record.comparisonComplete) return [];
  const key = (value) => String(value || '').trim().toLowerCase();
  const mapA = new Map(record.itemsA.map((item) => [key(item.title), item]));
  const mapB = new Map(record.itemsB.map((item) => [key(item.title), item]));
  const row = (category, title) => {
    const a = mapA.get(key(title));
    const b = mapB.get(key(title));
    return {
      site: record.site, productId: record.productId, productName: record.productName,
      project: record.project, repeat: record.repeat, category, title,
      expectedText: a?.text || a?.title || '', actualText: b?.text || b?.title || '',
      expectedIcon: a?.iconCode || '', actualIcon: b?.iconCode || '',
    };
  };
  return [
    ...record.missing.map((title) => row(mapB.has(key(title)) ? 'TEXT MISMATCH' : 'MISSING', title)),
    ...record.iconMismatch.map((item) => ({ ...row('ICON MISMATCH', item.title), expectedIcon: item.iconA || '', actualIcon: item.iconB || '' })),
    ...record.extraB.map((title) => row('EXTRA', title)),
    ...record.matched.map((title) => row('MATCHED', title)),
  ];
}
