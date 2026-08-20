import { readFileSync } from 'fs';

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deriveThreadGroup(record) {
  if (record.threadName) {
    return record.threadName.replace(/\s+\d+-\d+$/, '').trim() || 'Thread Group';
  }
  return 'Thread Group';
}

export function parseJtl(jtlPath, options = {}) {
  const content = readFileSync(jtlPath, 'utf-8').trim();
  if (!content) return [];

  const lines = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  const hasHeader = headers.some((item) => item === 'timeStamp' || item === 'elapsed' || item === 'label');
  const headerRow = hasHeader ? headers : [
    'timeStamp', 'elapsed', 'label', 'responseCode', 'responseMessage', 'threadName',
    'dataType', 'success', 'failureMessage', 'bytes', 'sentBytes', 'grpThreads',
    'allThreads', 'URL', 'Latency', 'IdleTime', 'Connect'
  ];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line, index) => {
    const values = parseCsvLine(line);
    const row = {};
    headerRow.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? '';
    });

    const elapsed = toNumber(row.elapsed);
    const success = String(row.success).toLowerCase() === 'true';
    const responseCode = row.responseCode || '';

    return {
      seq: index + 1,
      timeStamp: toNumber(row.timeStamp),
      elapsed,
      label: row.label || `Sample ${index + 1}`,
      responseCode,
      responseMessage: row.responseMessage || '',
      threadName: row.threadName || '',
      threadGroup: options.threadGroupStrategy?.(row) || deriveThreadGroup(row),
      success,
      failureMessage: row.failureMessage || '',
      bytes: toNumber(row.bytes),
      sentBytes: toNumber(row.sentBytes),
      latency: toNumber(row.Latency ?? row.latency),
      connect: toNumber(row.Connect ?? row.connect),
      url: row.URL || row.url || ''
    };
  });
}
