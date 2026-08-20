import path from 'path';
import { writeFileSync } from 'fs';
import { ensureDir, writeJson } from '../utils/fileUtils.js';

function csvEscape(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function statsToCsvRow(scope, stats) {
  return [
    scope,
    stats.label,
    stats.total,
    stats.passed,
    stats.failed,
    round(stats.errorRate),
    round(stats.average),
    round(stats.median),
    round(stats.p90),
    round(stats.p95),
    round(stats.p99),
    round(stats.min),
    round(stats.max),
    round(stats.throughput),
    round(stats.durationSeconds)
  ].map(csvEscape).join(',');
}

export function buildSummaryCsv(summary) {
  const header = [
    'scope',
    'label',
    'total',
    'passed',
    'failed',
    'errorRate',
    'averageMs',
    'medianMs',
    'p90Ms',
    'p95Ms',
    'p99Ms',
    'minMs',
    'maxMs',
    'throughputPerSec',
    'durationSeconds'
  ].join(',');

  const rows = [
    statsToCsvRow('overall', summary.overall),
    ...summary.byThreadGroup.map((stats) => statsToCsvRow('threadGroup', stats)),
    ...summary.byLabel.map((stats) => statsToCsvRow('label', stats))
  ];

  return `${[header, ...rows].join('\n')}\n`;
}

export function writePerformanceSummary(runDir, payload) {
  ensureDir(runDir);

  const jsonPath = path.join(runDir, 'performance-summary.json');
  const csvPath = path.join(runDir, 'performance-summary.csv');

  writeJson(jsonPath, payload);
  writeFileSync(csvPath, buildSummaryCsv(payload.summary), 'utf-8');

  return {
    jsonPath,
    csvPath
  };
}
