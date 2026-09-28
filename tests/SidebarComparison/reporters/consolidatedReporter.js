import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import runSettings from '../config/runSettings.json' with { type: 'json' };
import { COMPARISON_METADATA, COMPARISON_RESULT } from '../utils/annotations.js';
import { openGeneratedReports } from '../utils/openArtifacts.js';
import { writeExcelReport } from './excelReporter.js';
import { writeHtmlReport } from './htmlReporter.js';

const frameworkRoot = fileURLToPath(new URL('../', import.meta.url));
const collectionNames = ['itemsA', 'itemsB', 'matched', 'missing', 'iconMismatch', 'extraB'];

export default class ConsolidatedReporter {
  constructor(options = {}) {
    this.reportDir = options.reportDir || path.join(frameworkRoot, 'playwright-report');
    this.settings = options.settings || runSettings;
    this.tests = [];
    this.latest = new Map();
    this.errors = [];
    this.listOnly = process.env.SIDEBAR_LIST === 'true' || process.argv.includes('--list');
  }

  onBegin(config, suite) {
    this.tests = suite.allTests();
  }

  onTestEnd(test, result) {
    // Keep one final result per test/project/repeat, regardless of worker order.
    this.latest.set(test.id, { test, result });
  }

  onError(error) {
    this.errors.push(errorText(error));
  }

  async onEnd(result) {
    if (this.listOnly) return;
    try {
      const records = [];
      for (const test of this.tests) {
        const latest = this.latest.get(test.id);
        records.push(await buildComparisonRecord(latest?.test || test, latest?.result));
      }
      const report = buildRunReport(records, result, this.errors);
      await fs.mkdir(this.reportDir, { recursive: true });
      const excelPath = await writeExcelReport(report, { reportDir: this.reportDir });
      const htmlPath = await writeHtmlReport(report, { reportDir: this.reportDir, excelFile: path.basename(excelPath) });
      await fs.writeFile(path.join(this.reportDir, 'summary.json'), JSON.stringify(report, null, 2));
      console.log(`\nConsolidated comparison result: ${report.status}`);
      console.log(`Sites: ${report.sites.length} | Comparisons: ${report.summary.total} | Differences: ${report.summary.differences} | Errors: ${report.summary.errors}`);
      console.log(`HTML report: ${htmlPath}`);
      console.log(`Excel report: ${excelPath}`);
      console.log('Open report: npm run report');
      await openGeneratedReports({ htmlPath, excelPath }, console, {
        openHtml: shouldOpenHtml(this.settings, report.status),
        openExcel: Boolean(this.settings.openExcelReport),
      });
    } catch (error) {
      console.error(`Consolidated report generation failed: ${errorText(error)}`);
      return { status: 'failed' };
    }
  }

  printsToStdio() { return true; }
}

export async function buildComparisonRecord(test, result) {
  let metadata = {};
  const errors = [];
  try {
    metadata = JSON.parse(test.annotations.find((item) => item.type === COMPARISON_METADATA)?.description || '{}');
  } catch {
    errors.push('Could not read comparison metadata.');
  }
  let payload;
  const attachment = result?.attachments?.find((item) => item.name === COMPARISON_RESULT);
  if (attachment) {
    try {
      const data = attachment.body || await fs.readFile(attachment.path);
      payload = JSON.parse(data.toString('utf8'));
      if (!collectionNames.every((key) => Array.isArray(payload[key]))) {
        throw new Error('Comparison result attachment has missing result collections.');
      }
    } catch (error) {
      payload = undefined;
      errors.push(`Unable to read comparison result: ${errorText(error)}`);
    }
  }
  errors.push(...(result?.errors || []).map(errorText));
  if (payload?.error) errors.push(errorText(payload.error));
  const executionStatus = result?.status || 'notRun';
  const complete = payload?.comparisonComplete === true;
  if (executionStatus === 'passed' && !complete) errors.push('Test finished without a complete comparison result.');
  const differenceCount = complete ? payload.missing.length + payload.iconMismatch.length + payload.extraB.length : 0;
  const status = executionStatus === 'skipped' ? 'SKIPPED'
    : executionStatus === 'notRun' ? 'NOT RUN'
      : errors.length || executionStatus !== 'passed' ? 'ERROR'
        : differenceCount ? 'DIFFERENCES' : 'MATCHED';
  const record = {
    testId: test.id,
    site: metadata.site || 'Unspecified',
    productId: metadata.productId ?? '',
    productName: metadata.productName || test.title,
    project: test.parent?.project()?.name || '',
    repeat: (test.repeatEachIndex || 0) + 1,
    labelA: metadata.labelA || 'URL A', labelB: metadata.labelB || 'URL B',
    urlA: metadata.urlA || '', urlB: metadata.urlB || '',
    status, executionStatus, comparisonComplete: complete,
    capturedA: payload?.capturedA ?? complete,
    capturedB: payload?.capturedB ?? complete,
    durationMs: result?.duration || 0,
    attempts: (test.results || (result ? [result] : [])).map((attempt) => ({
      retry: attempt.retry || 0, status: attempt.status, durationMs: attempt.duration,
      error: (attempt.errors || []).map(errorText).join('\n'),
    })),
    error: [...new Set(errors.filter(Boolean))].join('\n\n'),
  };
  for (const name of collectionNames) record[name] = payload?.[name] || [];
  return record;
}

export function buildRunReport(records, result, errors = []) {
  const comparisons = [...records].sort((a, b) => a.site.localeCompare(b.site, 'en')
    || Number(a.productId) - Number(b.productId) || a.project.localeCompare(b.project, 'en') || a.repeat - b.repeat);
  const globalErrors = [...new Set(errors.filter(Boolean).map(errorText))];
  const summary = summarize(comparisons);
  const status = globalErrors.length || summary.errors ? 'ERROR'
    : ['failed', 'timedout', 'interrupted'].includes(result.status) || !summary.total || summary.notRun || summary.skipped ? 'INCOMPLETE'
      : summary.differences ? 'DIFFERENCES' : 'MATCHED';
  return {
    generatedAt: new Date().toISOString(),
    startedAt: result.startTime ? new Date(result.startTime).toISOString() : null,
    durationMs: result.duration || 0,
    executionStatus: result.status,
    status, summary, globalErrors,
    sites: [...new Set(comparisons.map((item) => item.site))].map((site) => ({
      site, ...summarize(comparisons.filter((item) => item.site === site)),
    })),
    comparisons,
  };
}

function summarize(records) {
  const count = (status) => records.filter((record) => record.status === status).length;
  return {
    total: records.length,
    matched: count('MATCHED'), differences: count('DIFFERENCES'), errors: count('ERROR'),
    skipped: count('SKIPPED'), notRun: count('NOT RUN'),
    missing: records.reduce((sum, record) => sum + (record.comparisonComplete ? record.missing.length : 0), 0),
    iconMismatch: records.reduce((sum, record) => sum + (record.comparisonComplete ? record.iconMismatch.length : 0), 0),
    extra: records.reduce((sum, record) => sum + (record.comparisonComplete ? record.extraB.length : 0), 0),
  };
}

function errorText(error) {
  return stripVTControlCharacters(String(error?.stack || error?.message || error || ''));
}

function shouldOpenHtml(settings, status) {
  if (process.env.CI) return false;
  const override = process.env.PLAYWRIGHT_HTML_OPEN;
  if (override === 'never') return false;
  if (override === 'always') return true;
  if (override === 'on-failure') return status !== 'MATCHED';
  return Boolean(settings.openHtmlReport);
}
