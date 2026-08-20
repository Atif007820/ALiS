import { test, expect } from '@playwright/test';
import path from 'path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import ExcelJS from 'exceljs';
import { parseJtl } from '../../src/parsers/jtlParser.js';
import { calculatePerformanceSummary } from '../../src/parsers/statisticsCalculator.js';
import { generateExcelReport } from '../../src/reports/excelReportGenerator.js';
import { generatePlaywrightReport } from '../../src/reports/playwrightReportGenerator.js';
import { discoverJmxScripts, resolveJmxScript } from '../../src/utils/jmxDiscovery.js';
import { buildJMeterProperties, resolveLoadSettings } from '../../src/utils/loadProfileResolver.js';
import { createGuiRuntimeJmx } from '../../src/utils/guiRuntimeJmx.js';
import { resolveParallelWorkers, scriptSelections } from '../../src/utils/argumentParser.js';
import { runWithConcurrency } from '../../src/utils/parallelRunner.js';

test('parses and de-duplicates multiple script selections', () => {
  expect(scriptSelections({
    scripts: 'LNI/Inspection_Search.jmx; LNI/Invoice Search.jmx; lni/inspection_search.jmx'
  })).toEqual([
    'LNI/Inspection_Search.jmx',
    'LNI/Invoice Search.jmx'
  ]);
  expect(scriptSelections({ script: 'LNI_PREPROD.jmx' })).toEqual(['LNI_PREPROD.jmx']);
});

test('resolves command-line parallel workers for GUI and non-GUI entry points', () => {
  const config = { parallelExecution: true, parallelWorkers: 3, scriptCount: 5 };

  expect(resolveParallelWorkers({}, config)).toBe(3);
  expect(resolveParallelWorkers({ parallel: '2' }, config)).toBe(2);
  expect(resolveParallelWorkers({ parallel: 2 }, config)).toBe(2);
  expect(resolveParallelWorkers({ parallel: 'false' }, config)).toBe(1);
  expect(resolveParallelWorkers({}, { ...config, parallelExecution: false })).toBe(1);
  expect(resolveParallelWorkers({ parallel: '4' }, { ...config, parallelExecution: false })).toBe(4);
  expect(() => resolveParallelWorkers({ parallel: '0' }, config)).toThrow('--parallel must be a positive integer');
});

test('runs work with the configured concurrency limit and preserves result order', async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await runWithConcurrency([1, 2, 3, 4], 2, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return value * 10;
  });

  expect(maximumActive).toBe(2);
  expect(results).toEqual([10, 20, 30, 40]);
});

test('resolves the same load profile properties for GUI and non-GUI runners', () => {
  const settings = resolveLoadSettings({
    profile: 'smoke',
    threads: 3,
    duration: 45
  });
  const properties = buildJMeterProperties({
    profile: settings.profile,
    extraProperties: { customFlag: 'enabled' }
  });

  expect(settings).toEqual({
    profileName: 'smoke',
    profile: {
      threads: 3,
      rampUp: 1,
      duration: 45,
      loops: 1
    },
    profileApplied: true
  });
  expect(properties).toEqual({
    threads: 3,
    rampUp: 1,
    duration: 45,
    loops: 1,
    customFlag: 'enabled'
  });
  expect(resolveLoadSettings({})).toEqual({
    profileName: null,
    profile: null,
    profileApplied: false
  });
});

test('creates a GUI runtime JMX result writer without changing the source script', async () => {
  const root = path.join(tmpdir(), `gui-runtime-jmx-${Date.now()}`);
  const sourcePath = path.join(root, 'source.jmx');
  const outputPath = path.join(root, 'runtime.jmx');
  const jtlPath = path.join(root, 'results.jtl');
  const sourceXml = '<?xml version="1.0" encoding="UTF-8"?><jmeterTestPlan><hashTree><TestPlan testname="Test"/><hashTree><ThreadGroup testname="Group"><intProp name="ThreadGroup.num_threads">1</intProp><intProp name="ThreadGroup.ramp_time">1</intProp><longProp name="ThreadGroup.duration">1</longProp><boolProp name="ThreadGroup.scheduler">false</boolProp><elementProp name="ThreadGroup.main_controller"><stringProp name="LoopController.loops">1</stringProp></elementProp></ThreadGroup><hashTree/></hashTree></hashTree></jmeterTestPlan>';
  mkdirSync(root, { recursive: true });
  writeFileSync(sourcePath, sourceXml);

  try {
    await createGuiRuntimeJmx({
      sourcePath,
      outputPath,
      jtlPath,
      profile: { threads: 3, rampUp: 4, duration: 5, loops: 6 }
    });
    const runtimeXml = readFileSync(outputPath, 'utf8');

    expect(readFileSync(sourcePath, 'utf8')).toBe(sourceXml);
    expect(runtimeXml).toContain('Framework GUI Results Writer');
    expect(runtimeXml).toContain(path.resolve(jtlPath));
    expect(runtimeXml).toContain('SampleSaveConfiguration');
    expect(runtimeXml).toContain('name="ThreadGroup.num_threads">3<');
    expect(runtimeXml).toContain('name="ThreadGroup.ramp_time">4<');
    expect(runtimeXml).toContain('name="ThreadGroup.duration">5<');
    expect(runtimeXml).toContain('name="ThreadGroup.scheduler">true<');
    expect(runtimeXml).toContain('name="LoopController.loops">6<');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('discovers JMeter scripts recursively', () => {
  const root = path.join(tmpdir(), `jmx-discovery-${Date.now()}`);
  mkdirSync(path.join(root, 'nested'), { recursive: true });
  writeFileSync(path.join(root, 'Root.jmx'), '<jmeterTestPlan />');
  writeFileSync(path.join(root, 'nested', 'Nested.jmx'), '<jmeterTestPlan />');

  try {
    const scripts = discoverJmxScripts(root).map((item) => item.relativePath);
    expect(scripts).toEqual(['nested/Nested.jmx', 'Root.jmx']);
    expect(resolveJmxScript('Nested.jmx', { scriptRoot: root }).relativePath).toBe('nested/Nested.jmx');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parses JTL results and calculates performance statistics', () => {
  const root = path.join(tmpdir(), `jtl-parse-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  const jtlPath = path.join(root, 'inline-results.jtl');
  writeFileSync(jtlPath, [
    'timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect',
    '1787079000000,540,UT - All | PT - All,200,OK,Licensee Thread Group 1-1,text,true,,18240,1320,1,1,https://example.test/login,110,0,35',
    '1787079000600,830,Search Licensee,200,OK,Licensee Thread Group 1-1,text,true,,22100,1410,1,1,https://example.test/search,205,0,41',
    '1787079001500,1260,Open Invoice,200,OK,Finance Thread Group 1-1,text,true,,18444,1501,1,1,https://example.test/invoice,310,0,50',
    '1787079002900,3480,Receipt Search,500,Internal Server Error,Finance Thread Group 1-1,text,false,HTTP 500,6100,1222,1,1,https://example.test/receipt,440,0,55',
    '1787079006500,920,Work Queue Search,200,OK,Workflow Thread Group 1-1,text,true,,19088,1180,1,1,https://example.test/wq,230,0,38'
  ].join('\n'));

  try {
    const records = parseJtl(jtlPath);
    const summary = calculatePerformanceSummary(records);

    expect(records).toHaveLength(5);
    expect(summary.overall.total).toBe(5);
    expect(summary.overall.failed).toBe(1);
    expect(summary.overall.p95).toBeGreaterThan(0);
    expect(summary.byThreadGroup.length).toBeGreaterThan(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generates universal Excel and Playwright reports without a template workbook', async () => {
  const root = path.join(tmpdir(), `universal-report-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  const records = [
    {
      seq: 1,
      timeStamp: 1787079000000,
      elapsed: 540,
      label: 'Search Licensee',
      responseCode: '200',
      responseMessage: 'OK',
      threadName: 'Dynamic Group 1-1',
      threadGroup: 'Dynamic Group',
      success: true,
      failureMessage: '',
      bytes: 18240,
      sentBytes: 1320,
      latency: 110,
      connect: 35,
      url: 'https://example.test/search'
    },
    {
      seq: 2,
      timeStamp: 1787079000600,
      elapsed: 4200,
      label: 'Open Invoice',
      responseCode: '200',
      responseMessage: 'OK',
      threadName: 'Finance Group 1-1',
      threadGroup: 'Finance Group',
      success: true,
      failureMessage: '',
      bytes: 22100,
      sentBytes: 1410,
      latency: 205,
      connect: 41,
      url: 'https://example.test/invoice'
    }
  ];

  try {
    const result = await generateExcelReport({
      records,
      summary: calculatePerformanceSummary(records),
      metadata: {
        generatedAt: '2026-08-20T10:30:00.000Z',
        scriptRelativePath: 'Any/Nested_Script.jmx',
        applicationUrl: 'https://example.test'
      },
      outputDir: root
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.outputPath);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Dashboard',
      'Test Results',
      'By Thread Group',
      'Performance Analytics',
      'SLA Breaches',
      'Legend'
    ]);
    expect(workbook.getWorksheet('Dashboard').getCell('A1').value).toContain('Any/Nested_Script.jmx');
    expect(workbook.getWorksheet('Test Results').getCell('B6').numFmt).toBe('hh:mm AM/PM');
    expect(workbook.getWorksheet('Test Results').getCell('C6').value).toBe('Dynamic Group');
    expect(workbook.getWorksheet('Test Results').getCell('N6').value.hyperlink).toBe('https://example.test/search');

    const playwrightReport = await generatePlaywrightReport({
      records,
      summary: calculatePerformanceSummary(records),
      metadata: {
        generatedAt: '2026-08-20T10:30:00.000Z',
        scriptRelativePath: 'Any/Nested_Script.jmx',
        applicationUrl: 'https://example.test'
      },
      artifacts: {
        excelPath: result.outputPath,
        jsonPath: '',
        csvPath: '',
        jmeterHtmlPath: ''
      },
      outputDir: root
    });
    const html = readFileSync(playwrightReport.outputPath, 'utf8');

    expect(html).toContain('ALiS Performance Playwright Test Report');
    expect(html).toContain('Dynamic Group');
    expect(html).toContain('Finance Group');
    expect(html).toContain('Download Excel Report');
    expect(html).toContain('href="../Load_Test_Report.xlsx"');
    expect(html).toContain('download="Load_Test_Report.xlsx"');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
