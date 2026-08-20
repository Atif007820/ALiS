import path from 'path';
import ExcelJS from 'exceljs';
import { reportConfig } from '../../config/reportConfig.js';
import { ensureDir } from '../utils/fileUtils.js';
import { validateGeneratedWorkbook } from '../validators/reportValidator.js';

const SHEETS = ['Dashboard', 'Test Results', 'By Thread Group', 'Performance Analytics', 'SLA Breaches', 'Legend'];
const COLORS = {
  navy: 'FF203F66', blue: 'FF2D5D88', teal: 'FF18A98F', tealDark: 'FF176B65',
  headerLight: 'FFD9E8F5', rowAlt: 'FFF5F8FB', white: 'FFFFFFFF', text: 'FF243447',
  green: 'FF147A45', greenFill: 'FFD9F2E3', red: 'FFC7352B', redDark: 'FF8D261F',
  redFill: 'FFF9D9D6', amber: 'FFB66A00', amberFill: 'FFFFF0CC', blueFill: 'FFE5F1FA',
  border: 'FFD3DEE8'
};
const GROUP_COLORS = ['FFDDEFF9', 'FFDDF3EA', 'FFEDE2F4', 'FFFFEDCF', 'FFF8DEDC', 'FFE4E9F7'];
const thinBorder = {
  top: { style: 'thin', color: { argb: COLORS.border } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  bottom: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } }
};

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function formatNumber(value) {
  return Math.round(value || 0).toLocaleString('en-US');
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '0 sec';
  return seconds >= 60 ? `${round(seconds / 60)} min` : `${round(seconds)} sec`;
}

function formatGeneratedAt(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return { date: 'N/A', time: 'N/A' };
  return {
    date: new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
  };
}

function requestTime(timeStamp) {
  return Number.isFinite(timeStamp) && timeStamp > 0 ? new Date(timeStamp) : null;
}

function isWithinSla(record, slaMs) {
  return Boolean(record.success) && record.elapsed <= slaMs;
}

function resultText(record, slaMs) {
  return isWithinSla(record, slaMs) ? 'PASS' : 'FAIL';
}

function slaStatus(record, slaMs) {
  return isWithinSla(record, slaMs) ? 'Within SLA' : 'SLA Breach';
}

function failureNotes(record, slaMs) {
  if (record.failureMessage) return record.failureMessage;
  if (!record.success) return record.responseMessage || `HTTP ${record.responseCode || 'error'}`;
  if (record.elapsed > slaMs) return `${formatNumber(record.elapsed - slaMs)} ms over SLA`;
  return '';
}

function reportMetrics(records, slaMs) {
  const total = records.length;
  const passed = records.filter((record) => isWithinSla(record, slaMs)).length;
  const failed = total - passed;
  return {
    total, passed, failed,
    passRate: total ? (passed / total) * 100 : 0,
    errorRate: total ? (failed / total) * 100 : 0
  };
}

function groupRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const name = record.threadGroup || 'Thread Group';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  }
  return groups;
}

function severity(overByMs) {
  if (overByMs > 60000) return 'CRITICAL';
  if (overByMs > 10000) return 'HIGH';
  if (overByMs > 3000) return 'MEDIUM';
  return 'LOW';
}

function setSheetDefaults(worksheet, frozenRows = 5) {
  worksheet.views = [{ state: 'frozen', ySplit: frozenRows, showGridLines: false }];
  worksheet.properties.defaultRowHeight = 19;
  worksheet.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
  };
}

function addTitle(worksheet, range, text, color = COLORS.navy) {
  worksheet.mergeCells(range);
  const cell = worksheet.getCell(range.split(':')[0]);
  cell.value = text;
  cell.fill = fill(color);
  cell.font = { name: 'Aptos Display', size: 17, bold: true, color: { argb: COLORS.white } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(cell.row).height = 36;
}

function addSubtitle(worksheet, range, text, color = COLORS.blue) {
  worksheet.mergeCells(range);
  const cell = worksheet.getCell(range.split(':')[0]);
  cell.value = text;
  cell.fill = fill(color);
  cell.font = { name: 'Aptos', size: 10, color: { argb: COLORS.white } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(cell.row).height = 24;
}

function addUrlRow(worksheet, range, url) {
  worksheet.mergeCells(range);
  const cell = worksheet.getCell(range.split(':')[0]);
  cell.value = url ? { text: `Application URL: ${url}`, hyperlink: url } : 'Application URL: N/A';
  cell.fill = fill(COLORS.blueFill);
  cell.font = { name: 'Aptos', size: 10, color: { argb: 'FF0066CC' }, underline: Boolean(url) };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(cell.row).height = 22;
}

function styleHeaderRow(row, headings, color = COLORS.blue) {
  headings.forEach((heading, index) => {
    const cell = row.getCell(index + 1);
    cell.value = heading;
    cell.fill = fill(color);
    cell.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLORS.white } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
  row.height = 28;
}

function styleDataRow(row, rowIndex) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill(rowIndex % 2 === 0 ? COLORS.white : COLORS.rowAlt);
    cell.font = { name: 'Aptos', size: 9, color: { argb: COLORS.text } };
    cell.border = { bottom: { style: 'hair', color: { argb: COLORS.border } } };
    cell.alignment = { vertical: 'middle', wrapText: false };
  });
  row.height = 21;
}

function styleStatusCells(row, statusColumn, resultColumn, passed) {
  const color = passed ? COLORS.green : COLORS.red;
  const background = passed ? COLORS.greenFill : COLORS.redFill;
  for (const cell of [row.getCell(statusColumn), row.getCell(resultColumn)]) {
    cell.fill = fill(background);
    cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: color } };
  }
}

function setHyperlink(cell, url) {
  if (!url) return;
  cell.value = { text: url, hyperlink: url };
  cell.font = { name: 'Aptos', size: 9, color: { argb: 'FF0066CC' }, underline: true };
}

function scriptLabel(metadata) {
  return metadata.scriptRelativePath || metadata.script || 'JMeter Test Script';
}

function metadataText(metadata, summary, slaMs) {
  const generated = formatGeneratedAt(metadata.generatedAt);
  const load = metadata.profileApplied ? metadata.profileName || 'Custom profile' : 'JMX settings';
  return [
    `Reporter: ${reportConfig.reporter}`, `Date: ${generated.date}`, `Time: ${generated.time}`,
    `SLA: ${formatNumber(slaMs)} ms`, `Duration: ${formatDuration(summary.overall.durationSeconds)}`, `Load: ${load}`
  ].join('  |  ');
}

function buildDashboard(workbook, context) {
  const { records, summary, metadata, slaMs } = context;
  const worksheet = workbook.addWorksheet('Dashboard');
  const metrics = reportMetrics(records, slaMs);
  const generated = formatGeneratedAt(metadata.generatedAt);
  worksheet.columns = [
    { width: 22 }, { width: 16 }, { width: 22 }, { width: 16 },
    { width: 22 }, { width: 16 }, { width: 22 }, { width: 16 }
  ];
  addTitle(worksheet, 'A1:H1', `LOAD TEST RESULTS - ${scriptLabel(metadata)}`);
  addSubtitle(worksheet, 'A2:H2', metadataText(metadata, summary, slaMs));
  addUrlRow(worksheet, 'A3:H3', metadata.applicationUrl);

  const cards = [
    ['A5:B5', 'A6:B8', 'TOTAL SAMPLES', metrics.total, COLORS.blueFill, COLORS.blue],
    ['C5:D5', 'C6:D8', 'WITHIN SLA', metrics.passed, COLORS.greenFill, COLORS.green],
    ['E5:F5', 'E6:F8', 'FAILED / BREACHED', metrics.failed, COLORS.redFill, COLORS.red],
    ['G5:H5', 'G6:H8', 'SLA COMPLIANCE', `${round(metrics.passRate, 1)}%`, COLORS.amberFill, COLORS.amber]
  ];
  for (const [labelRange, valueRange, labelText, valueText, background, color] of cards) {
    worksheet.mergeCells(labelRange);
    worksheet.mergeCells(valueRange);
    const label = worksheet.getCell(labelRange.split(':')[0]);
    const value = worksheet.getCell(valueRange.split(':')[0]);
    label.value = labelText;
    value.value = valueText;
    label.fill = fill(background);
    value.fill = fill(background);
    label.font = { name: 'Aptos', size: 10, color: { argb: color } };
    value.font = { name: 'Aptos Display', size: 24, bold: true, color: { argb: color } };
    label.alignment = { horizontal: 'center', vertical: 'middle' };
    value.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  worksheet.getRow(6).height = 23;
  worksheet.getRow(7).height = 23;
  worksheet.getRow(8).height = 23;

  addTitle(worksheet, 'A10:D10', 'RESPONSE TIME METRICS', COLORS.blue);
  addTitle(worksheet, 'E10:H10', 'NETWORK AND THROUGHPUT', COLORS.tealDark);
  const responseMetrics = [
    ['Average Response', summary.overall.average], ['Median (P50)', summary.overall.median],
    ['75th Percentile', summary.overall.p75], ['90th Percentile', summary.overall.p90],
    ['95th Percentile', summary.overall.p95], ['99th Percentile', summary.overall.p99],
    ['Std Deviation', summary.overall.stdDev], ['Minimum Response', summary.overall.min],
    ['Maximum Response', summary.overall.max], ['Average Latency', summary.overall.avgLatency],
    ['Average Connect', summary.overall.avgConnect]
  ];
  const networkMetrics = [
    ['SLA Threshold', `${formatNumber(slaMs)} ms`], ['SLA Breaches', metrics.failed],
    ['SLA Compliance', `${round(metrics.passRate, 1)}%`], ['Failure Rate', `${round(metrics.errorRate, 1)}%`],
    ['Test Duration', formatDuration(summary.overall.durationSeconds)],
    ['Throughput', `${round(summary.overall.throughput, 4)} req/s`],
    ['Received Data', `${round(summary.overall.bytesReceived / 1024 / 1024)} MB`],
    ['Sent Data', `${round(summary.overall.bytesSent / 1024)} KB`],
    ['Generated Date', generated.date], ['Generated Time', generated.time], ['Thread Groups', summary.byThreadGroup.length]
  ];
  for (let index = 0; index < responseMetrics.length; index += 1) {
    const rowNumber = 11 + index;
    worksheet.mergeCells(`A${rowNumber}:B${rowNumber}`);
    worksheet.mergeCells(`C${rowNumber}:D${rowNumber}`);
    worksheet.mergeCells(`E${rowNumber}:F${rowNumber}`);
    worksheet.mergeCells(`G${rowNumber}:H${rowNumber}`);
    worksheet.getCell(`A${rowNumber}`).value = responseMetrics[index][0];
    worksheet.getCell(`C${rowNumber}`).value = `${formatNumber(responseMetrics[index][1])} ms`;
    worksheet.getCell(`E${rowNumber}`).value = networkMetrics[index][0];
    worksheet.getCell(`G${rowNumber}`).value = networkMetrics[index][1];
    for (const address of [`A${rowNumber}`, `C${rowNumber}`, `E${rowNumber}`, `G${rowNumber}`]) {
      const cell = worksheet.getCell(address);
      cell.fill = fill(index % 2 ? COLORS.white : COLORS.rowAlt);
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle' };
    }
    worksheet.getCell(`C${rowNumber}`).font = { bold: true, color: { argb: COLORS.blue } };
    worksheet.getCell(`G${rowNumber}`).font = { bold: true, color: { argb: COLORS.tealDark } };
  }

  const groupStart = 24;
  addTitle(worksheet, `A${groupStart}:H${groupStart}`, 'RESULTS BY THREAD GROUP');
  styleHeaderRow(worksheet.getRow(groupStart + 1), [
    'Thread Group', 'Total', 'Within SLA', 'Failed / Breached', 'Failure Rate', 'Average (ms)', 'P95 (ms)', 'Throughput'
  ]);
  [...groupRecords(records).entries()].forEach(([name, groupRows], index) => {
    const row = worksheet.getRow(groupStart + 2 + index);
    const stats = summary.byThreadGroup.find((item) => item.label === name) || summary.overall;
    const groupMetrics = reportMetrics(groupRows, slaMs);
    row.values = [name, groupMetrics.total, groupMetrics.passed, groupMetrics.failed, groupMetrics.errorRate / 100,
      round(stats.average), round(stats.p95), round(stats.throughput, 4)];
    styleDataRow(row, index);
    row.getCell(1).fill = fill(GROUP_COLORS[index % GROUP_COLORS.length]);
    row.getCell(1).font = { bold: true, color: { argb: COLORS.blue } };
    row.getCell(5).numFmt = '0.0%';
  });
  setSheetDefaults(worksheet, 4);
}

function buildTestResults(workbook, context) {
  const { records, summary, metadata, slaMs } = context;
  const worksheet = workbook.addWorksheet('Test Results');
  const metrics = reportMetrics(records, slaMs);
  worksheet.columns = [
    { width: 8 }, { width: 14 }, { width: 25 }, { width: 38 }, { width: 10 },
    { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }, { width: 13 },
    { width: 16 }, { width: 11 }, { width: 30 }, { width: 58 }
  ];
  addTitle(worksheet, 'A1:N1', `LOAD TEST RESULTS - ${scriptLabel(metadata)}`);
  addSubtitle(worksheet, 'A2:N2', `${metadataText(metadata, summary, slaMs)}  |  Total: ${metrics.total}  |  Within SLA: ${metrics.passed}  |  Failed/Breached: ${metrics.failed}`);
  addUrlRow(worksheet, 'A3:N3', metadata.applicationUrl);
  styleHeaderRow(worksheet.getRow(5), [
    'Seq #', 'Timestamp', 'Thread Group', 'Request / Test Case', 'HTTP', 'Elapsed (ms)', 'Latency (ms)',
    'Connect (ms)', 'Received (KB)', 'Sent (KB)', 'SLA Status', 'Result', 'Failure / Notes', 'URL'
  ]);
  const groupNames = [...groupRecords(records).keys()];
  records.forEach((record, index) => {
    const row = worksheet.getRow(6 + index);
    const passed = isWithinSla(record, slaMs);
    row.values = [index + 1, requestTime(record.timeStamp), record.threadGroup, record.label, record.responseCode,
      record.elapsed, record.latency, record.connect, round(record.bytes / 1024), round(record.sentBytes / 1024),
      slaStatus(record, slaMs), resultText(record, slaMs), failureNotes(record, slaMs), null];
    styleDataRow(row, index);
    row.getCell(1).font = { bold: true, color: { argb: COLORS.white } };
    row.getCell(1).fill = fill(COLORS.blue);
    row.getCell(2).numFmt = 'hh:mm AM/PM';
    const groupIndex = Math.max(groupNames.indexOf(record.threadGroup), 0);
    row.getCell(3).fill = fill(GROUP_COLORS[groupIndex % GROUP_COLORS.length]);
    row.getCell(3).font = { bold: true, color: { argb: COLORS.blue } };
    if (!passed) {
      row.getCell(6).fill = fill(COLORS.redFill);
      row.getCell(6).font = { bold: true, color: { argb: COLORS.red } };
    }
    styleStatusCells(row, 11, 12, passed);
    setHyperlink(row.getCell(14), record.url);
  });
  worksheet.autoFilter = { from: 'A5', to: `N${Math.max(records.length + 5, 5)}` };
  setSheetDefaults(worksheet);
}

function buildByThreadGroup(workbook, context) {
  const { records, summary, metadata, slaMs } = context;
  const worksheet = workbook.addWorksheet('By Thread Group');
  worksheet.columns = [
    { width: 8 }, { width: 14 }, { width: 38 }, { width: 10 }, { width: 15 },
    { width: 15 }, { width: 16 }, { width: 11 }, { width: 30 }, { width: 58 }
  ];
  addTitle(worksheet, 'A1:J1', `TEST RESULTS BY THREAD GROUP - ${scriptLabel(metadata)}`);
  addUrlRow(worksheet, 'A2:J2', metadata.applicationUrl);
  let rowNumber = 4;
  let sequence = 1;
  for (const [name, groupRows] of groupRecords(records).entries()) {
    const stats = summary.byThreadGroup.find((item) => item.label === name) || summary.overall;
    const metrics = reportMetrics(groupRows, slaMs);
    addTitle(worksheet, `A${rowNumber}:J${rowNumber}`,
      `${name}  |  ${metrics.passed}/${metrics.total} within SLA  |  ${metrics.failed} failed/breached  |  P95 ${formatNumber(stats.p95)} ms`, COLORS.tealDark);
    rowNumber += 1;
    styleHeaderRow(worksheet.getRow(rowNumber), [
      'Seq #', 'Timestamp', 'Request / Test Case', 'HTTP', 'Elapsed (ms)', 'Latency (ms)',
      'SLA Status', 'Result', 'Failure / Notes', 'URL'
    ]);
    rowNumber += 1;
    for (const record of groupRows) {
      const row = worksheet.getRow(rowNumber);
      const passed = isWithinSla(record, slaMs);
      row.values = [sequence, requestTime(record.timeStamp), record.label, record.responseCode, record.elapsed,
        record.latency, slaStatus(record, slaMs), resultText(record, slaMs), failureNotes(record, slaMs), null];
      styleDataRow(row, sequence);
      row.getCell(2).numFmt = 'hh:mm AM/PM';
      if (!passed) {
        row.getCell(5).fill = fill(COLORS.redFill);
        row.getCell(5).font = { bold: true, color: { argb: COLORS.red } };
      }
      styleStatusCells(row, 7, 8, passed);
      setHyperlink(row.getCell(10), record.url);
      rowNumber += 1;
      sequence += 1;
    }
    rowNumber += 1;
  }
  setSheetDefaults(worksheet, 2);
}

function buildAnalytics(workbook, context) {
  const { records, summary, metadata, slaMs } = context;
  const worksheet = workbook.addWorksheet('Performance Analytics');
  worksheet.columns = [
    { width: 27 }, { width: 10 }, { width: 13 }, { width: 10 }, { width: 14 }, { width: 18 },
    ...Array.from({ length: 12 }, () => ({ width: 14 }))
  ];
  addTitle(worksheet, 'A1:R1', `PERFORMANCE ANALYTICS - ${scriptLabel(metadata)}`);
  addSubtitle(worksheet, 'A2:R2', metadataText(metadata, summary, slaMs));
  styleHeaderRow(worksheet.getRow(4), [
    'Thread Group', 'Count', 'Within SLA', 'Failed', 'Compliance %', 'Throughput (req/s)',
    'Average (ms)', 'P50 (ms)', 'P75 (ms)', 'P90 (ms)', 'P95 (ms)', 'P99 (ms)',
    'Std Dev', 'Min (ms)', 'Max (ms)', 'Avg Latency', 'Avg Connect', 'Received (KB/s)'
  ], COLORS.tealDark);
  const groups = groupRecords(records);
  [...groups.entries()].forEach(([name, groupRows], index) => {
    const stats = summary.byThreadGroup.find((item) => item.label === name) || summary.overall;
    const metrics = reportMetrics(groupRows, slaMs);
    const row = worksheet.getRow(5 + index);
    row.values = [name, metrics.total, metrics.passed, metrics.failed, metrics.passRate / 100,
      round(stats.throughput, 4), round(stats.average), round(stats.median), round(stats.p75), round(stats.p90),
      round(stats.p95), round(stats.p99), round(stats.stdDev), round(stats.min), round(stats.max),
      round(stats.avgLatency), round(stats.avgConnect),
      round(stats.durationSeconds ? stats.bytesReceived / 1024 / stats.durationSeconds : 0)];
    styleDataRow(row, index);
    row.getCell(1).fill = fill(GROUP_COLORS[index % GROUP_COLORS.length]);
    row.getCell(1).font = { bold: true, color: { argb: COLORS.blue } };
    row.getCell(5).numFmt = '0.0%';
  });
  const totalRow = worksheet.getRow(groups.size + 6);
  const metrics = reportMetrics(records, slaMs);
  totalRow.values = ['OVERALL TOTAL', metrics.total, metrics.passed, metrics.failed, metrics.passRate / 100,
    round(summary.overall.throughput, 4), round(summary.overall.average), round(summary.overall.median),
    round(summary.overall.p75), round(summary.overall.p90), round(summary.overall.p95), round(summary.overall.p99),
    round(summary.overall.stdDev), round(summary.overall.min), round(summary.overall.max),
    round(summary.overall.avgLatency), round(summary.overall.avgConnect),
    round(summary.overall.durationSeconds ? summary.overall.bytesReceived / 1024 / summary.overall.durationSeconds : 0)];
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill(COLORS.navy);
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.border = thinBorder;
  });
  totalRow.getCell(5).numFmt = '0.0%';
  setSheetDefaults(worksheet, 4);
}

function buildBreaches(workbook, context) {
  const { records, metadata, slaMs } = context;
  const worksheet = workbook.addWorksheet('SLA Breaches');
  const breaches = records.filter((record) => !isWithinSla(record, slaMs)).sort((a, b) => b.elapsed - a.elapsed);
  const metrics = reportMetrics(records, slaMs);
  worksheet.columns = [
    { width: 8 }, { width: 14 }, { width: 25 }, { width: 38 }, { width: 16 },
    { width: 17 }, { width: 13 }, { width: 10 }, { width: 34 }, { width: 58 }
  ];
  addTitle(worksheet, 'A1:J1', `SLA BREACH ANALYSIS - ${scriptLabel(metadata)}`, COLORS.redDark);
  addSubtitle(worksheet, 'A2:J2',
    `${breaches.length} failed or breached of ${metrics.total} samples (${round(metrics.errorRate, 1)}%)  |  SLA threshold: ${formatNumber(slaMs)} ms`, COLORS.red);
  addUrlRow(worksheet, 'A3:J3', metadata.applicationUrl);
  styleHeaderRow(worksheet.getRow(5), [
    'Rank', 'Timestamp', 'Thread Group', 'Request / Test Case', 'Elapsed (ms)',
    'Over SLA (ms)', 'Severity', 'HTTP', 'Failure / Notes', 'URL'
  ], COLORS.redDark);
  breaches.forEach((record, index) => {
    const overBy = Math.max(record.elapsed - slaMs, 0);
    const level = record.success ? severity(overBy) : 'ERROR';
    const row = worksheet.getRow(6 + index);
    row.values = [index + 1, requestTime(record.timeStamp), record.threadGroup, record.label, record.elapsed,
      overBy, level, record.responseCode, failureNotes(record, slaMs), null];
    styleDataRow(row, index);
    row.getCell(2).numFmt = 'hh:mm AM/PM';
    row.getCell(5).font = { bold: true, color: { argb: COLORS.red } };
    row.getCell(6).font = { bold: true, color: { argb: COLORS.red } };
    row.getCell(7).fill = fill(level === 'LOW' ? COLORS.greenFill : level === 'MEDIUM' ? COLORS.amberFill : COLORS.redFill);
    row.getCell(7).font = { bold: true, color: { argb: level === 'LOW' ? COLORS.green : COLORS.redDark } };
    setHyperlink(row.getCell(10), record.url);
  });
  if (breaches.length === 0) {
    worksheet.mergeCells('A6:J7');
    const cell = worksheet.getCell('A6');
    cell.value = 'No failures or SLA breaches were detected.';
    cell.fill = fill(COLORS.greenFill);
    cell.font = { bold: true, color: { argb: COLORS.green } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  setSheetDefaults(worksheet);
}

function buildLegend(workbook, context) {
  const worksheet = workbook.addWorksheet('Legend');
  worksheet.columns = [{ width: 28 }, { width: 85 }];
  addTitle(worksheet, 'A1:B1', 'LEGEND - UNIVERSAL REPORT DEFINITIONS');
  const sections = [
    ['RESULT AND SLA NOTATION', [
      ['PASS', `JMeter success with elapsed time at or below ${formatNumber(context.slaMs)} ms.`],
      ['FAIL', `Request failed or exceeded the ${formatNumber(context.slaMs)} ms SLA threshold.`],
      ['Within SLA', `Elapsed time is at or below ${formatNumber(context.slaMs)} ms.`],
      ['SLA Breach', `Elapsed time exceeded ${formatNumber(context.slaMs)} ms or the request failed.`]
    ]],
    ['SLA BREACH SEVERITY', [
      ['CRITICAL', 'More than 60,000 ms over SLA.'], ['HIGH', '10,001 to 60,000 ms over SLA.'],
      ['MEDIUM', '3,001 to 10,000 ms over SLA.'], ['LOW', '1 to 3,000 ms over SLA.'],
      ['ERROR', 'JMeter marked the request as unsuccessful.']
    ]],
    ['COLUMN DEFINITIONS', [
      ['Timestamp', 'Request start time displayed as HH:MM AM/PM.'],
      ['Thread Group', 'Thread group derived dynamically from the JMeter thread name.'],
      ['Request / Test Case', 'JMeter sampler label.'], ['Elapsed', 'Total end-to-end response time in milliseconds.'],
      ['Latency', 'Time from request sent to first response byte.'], ['Connect', 'Time required to establish the connection.'],
      ['Throughput', 'Completed samples per second during execution.'], ['URL', 'Request URL captured in JTL output.']
    ]]
  ];
  let rowNumber = 3;
  for (const [title, rows] of sections) {
    worksheet.mergeCells(`A${rowNumber}:B${rowNumber}`);
    const section = worksheet.getCell(`A${rowNumber}`);
    section.value = title;
    section.fill = fill(COLORS.blue);
    section.font = { bold: true, color: { argb: COLORS.white } };
    rowNumber += 1;
    styleHeaderRow(worksheet.getRow(rowNumber), ['Value', 'Meaning']);
    rowNumber += 1;
    for (const [value, meaning] of rows) {
      const row = worksheet.getRow(rowNumber);
      row.values = [value, meaning];
      styleDataRow(row, rowNumber);
      row.getCell(1).font = { bold: true, color: { argb: COLORS.blue } };
      row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
      row.height = 26;
      rowNumber += 1;
    }
    rowNumber += 1;
  }
  setSheetDefaults(worksheet, 1);
}

export async function generateExcelReport({
  records,
  summary,
  metadata,
  outputDir,
  outputFileName = reportConfig.outputFileName,
  slaMs = reportConfig.slaMs
}) {
  ensureDir(outputDir);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ALiS Performance Framework';
  workbook.lastModifiedBy = 'ALiS Performance Framework';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const context = {
    records,
    summary,
    metadata: { ...metadata, generatedAt: metadata?.generatedAt || new Date().toISOString() },
    slaMs
  };
  buildDashboard(workbook, context);
  buildTestResults(workbook, context);
  buildByThreadGroup(workbook, context);
  buildAnalytics(workbook, context);
  buildBreaches(workbook, context);
  buildLegend(workbook, context);
  const outputPath = path.join(outputDir, outputFileName);
  await workbook.xlsx.writeFile(outputPath);
  const validation = await validateGeneratedWorkbook(outputPath, SHEETS);
  return { outputPath, validation };
}

export { formatGeneratedAt, requestTime, reportMetrics, severity };
