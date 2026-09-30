export const DETAIL_COLUMNS = [
  { label: 'URL A item', key: 'expectedText', width: 44 },
  { label: 'URL B item', key: 'actualText', width: 44 },
  { label: 'URL A icon', key: 'expectedIcon', width: 20 },
  { label: 'URL B icon', key: 'actualIcon', width: 20 },
];

export const REPORT_THEME = {
  headerBg: 'EEF5FB',
  headerAccent: '2F6F9F',
  headerText: '263D52',
  grid: 'D1DBD7',
};

export const REPORT_CATEGORIES = [
  { title: 'Missing / Text Mismatch', sheetName: 'Missing-Text Mismatch', sheetTitle: 'Missing/Text Mismatch', categories: ['MISSING', 'TEXT MISMATCH'], color: 'A53D46' },
  { title: 'Icon Mismatch', sheetName: 'Icon Mismatch', categories: ['ICON MISMATCH'], color: '996C20' },
  { title: 'Extra in URL B', sheetName: 'Extra in URL B', categories: ['EXTRA'], color: '316A96' },
  { title: 'Matched Text', sheetName: 'Matched Text', categories: ['MATCHED', 'ICON MISMATCH'], color: '347157', collapsible: true },
];

export function formatReportDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  const pad = (part) => String(part).padStart(2, '0');
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} | ${pad(hours12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${meridiem}`;
}

// Both renderers use the same columns, categories and rows.
export function categoryGroups(record) {
  const rows = menuRows(record);
  return REPORT_CATEGORIES.map((category) => ({
    ...category,
    rows: rows.filter((row) => category.categories.includes(row.category)),
  }));
}

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
