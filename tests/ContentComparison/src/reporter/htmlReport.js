import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runSettings from '../../config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultReportDir = path.join(frameworkRoot, runSettings.reports.outputDir);

export async function writeHtmlReport({
  file1Name,
  file2Name,
  result,
}, { reportDir = defaultReportDir } = {}) {
  await fs.mkdir(reportDir, { recursive: true });

  const htmlPath = path.join(reportDir, runSettings.reports.latestHtmlFile);
  await fs.writeFile(htmlPath, buildHtml({ file1Name, file2Name, result }), 'utf8');

  return htmlPath;
}

function buildHtml({ file1Name, file2Name, result }) {
  const generatedAt = formatReportTimestamp();
  const tableBorders = result.tableBorders || { checked: 0, matched: [], missing: [] };
  const issueCount = result.mismatchLines.length + result.missingLines.length + result.extraLines.length + tableBorders.missing.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(runSettings.html.title)}</title>
  <style>
    :root {
      --bg: #f6f8fb;
      --panel: #ffffff;
      --text: #172033;
      --muted: #5b667a;
      --border: #d8dee9;
      --blue: #1f4e78;
      --blue-dark: #17365d;
      --pass: #137333;
      --fail: #b3261e;
      --warn: #9a6700;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: "Segoe UI", Arial, sans-serif; font-size: 14px; }
    header { background: linear-gradient(135deg, var(--blue-dark), var(--blue)); color: #fff; padding: 24px 30px; }
    header h1 { margin: 0 0 6px; font-size: 25px; font-weight: 700; }
    header p { margin: 0; color: #dbe8f4; }
    main { padding: 24px 30px 40px; }
    .summary { display: grid; grid-template-columns: repeat(5, minmax(130px, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric, .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; box-shadow: 0 1px 2px rgba(23,32,51,.04); }
    .metric .label { color: var(--muted); font-size: 12px; text-transform: uppercase; }
    .metric .value { margin-top: 4px; font-size: 24px; font-weight: 750; }
    .meta { display: grid; grid-template-columns: 150px 1fr; gap: 8px 14px; }
    .meta div:nth-child(odd) { color: var(--muted); font-weight: 650; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .section { margin-top: 16px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border-bottom: 1px solid var(--border); padding: 10px 8px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eef3f8; color: #35445c; font-size: 12px; text-transform: uppercase; }
    tbody tr:nth-child(even) { background: #fafcff; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 750; }
    .pass { color: var(--pass); }
    .fail { color: var(--fail); }
    .warn { color: var(--warn); }
    .badge-pass { background: #dff3e6; color: var(--pass); }
    .badge-fail { background: #fce8e6; color: var(--fail); }
    .badge-warn { background: #fff4ce; color: var(--warn); }
    @media (max-width: 900px) {
      .summary { grid-template-columns: repeat(2, minmax(130px, 1fr)); }
      .meta { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(runSettings.html.title)}</h1>
    <p>${escapeHtml(runSettings.html.subtitle)} | ${escapeHtml(generatedAt)}</p>
  </header>
  <main>
    <section class="summary">
      ${metric('Status', issueCount ? 'FAILED' : 'PASSED', issueCount ? 'fail' : 'pass')}
      ${metric('Matched', result.matchedLines.length, 'pass')}
      ${metric('Mismatch', result.mismatchLines.length, result.mismatchLines.length ? 'fail' : 'pass')}
      ${metric('Missing', result.missingLines.length, result.missingLines.length ? 'fail' : 'pass')}
      ${metric('Extra', result.extraLines.length, result.extraLines.length ? 'warn' : 'pass')}
    </section>

    <section class="panel">
      <h2>Run Details</h2>
      <div class="meta">
        <div>Expected File</div><div>${escapeHtml(file1Name)}</div>
        <div>Actual File</div><div>${escapeHtml(file2Name)}</div>
        <div>Expected Lines</div><div>${escapeHtml(result.templateLineCount)}</div>
        <div>Actual Lines</div><div>${escapeHtml(result.letterLineCount)}</div>
        <div>Generated At</div><div>${escapeHtml(generatedAt)}</div>
      </div>
    </section>

    ${lineSection('TC01 - Matched Lines', 'badge-pass', result.matchedLines.map((row) => ({
      status: 'PASS',
      expected: row.template,
      actual: row.letter,
      details: row.details || 'Line matched in Expected and Actual.',
    })))}

    ${lineSection('TC02 - Mismatch Lines', result.mismatchLines.length ? 'badge-fail' : 'badge-pass', result.mismatchLines.map((row) => ({
      status: 'MISMATCH',
      expected: row.template,
      actual: row.letter,
      details: row.details || 'Expected and Actual lines are similar, but not equal.',
    })))}

    ${lineSection('TC03 - Missing Lines', result.missingLines.length ? 'badge-fail' : 'badge-pass', result.missingLines.map((line) => ({
      status: 'MISSING',
      expected: lineValue(line, 'template'),
      actual: '',
      details: line.details || 'Expected line was not found in Actual.',
    })))}

    ${lineSection('TC04 - Extra Lines', result.extraLines.length ? 'badge-warn' : 'badge-pass', result.extraLines.map((line) => ({
      status: 'EXTRA',
      expected: '',
      actual: lineValue(line, 'letter'),
      details: line.details || 'Actual line was not found in Expected.',
    })))}

    ${tableBorderSection(tableBorders)}
  </main>
</body>
</html>`;
}

function metric(label, value, tone = '') {
  return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value ${tone}">${escapeHtml(value)}</div></div>`;
}

function lineSection(title, badgeClass, rows) {
  const body = rows.length ? rows.map(lineRow).join('\n') : '<tr><td colspan="4">No records.</td></tr>';

  return `<section class="panel section">
    <h2>${escapeHtml(title)} <span class="badge ${badgeClass}">${rows.length}</span></h2>
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Expected Line</th>
          <th>Actual Line</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function lineRow(row) {
  return `<tr>
    <td>${escapeHtml(row.status)}</td>
    <td>${escapeHtml(row.expected)}</td>
    <td>${escapeHtml(row.actual)}</td>
    <td>${escapeHtml(row.details)}</td>
  </tr>`;
}

function lineValue(row, key) {
  return typeof row === 'string' ? row : row?.[key] || '';
}

function tableBorderSection(tableBorders) {
  const rows = [
    ...(tableBorders.matched || []).map((row) => tableRow('PASS', row)),
    ...(tableBorders.missing || []).map((row) => tableRow('MISSING', row)),
  ];
  const badgeClass = tableBorders.missing?.length ? 'badge-fail' : 'badge-pass';
  const body = rows.length ? rows.join('\n') : '<tr><td colspan="6">No bordered tables found in Expected.</td></tr>';

  return `<section class="panel section">
    <h2>TC05 - Table Borders <span class="badge ${badgeClass}">${tableBorders.matched?.length || 0}/${tableBorders.checked || 0}</span></h2>
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Expected Table</th>
          <th>Actual Page</th>
          <th>Expected Size</th>
          <th>Actual Grid</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function tableRow(status, row) {
  const component = row.component;
  return `<tr>
    <td>${escapeHtml(status)}</td>
    <td>Table ${escapeHtml(row.tableNumber)}</td>
    <td>${escapeHtml(row.pageNumber || '')}</td>
    <td>${escapeHtml(row.rowCount)} rows x ${escapeHtml(row.columnCount)} columns</td>
    <td>${component ? `${escapeHtml(component.yLineCount)} horizontal x ${escapeHtml(component.xLineCount)} vertical` : ''}</td>
    <td>${escapeHtml(row.snippet || '')}</td>
  </tr>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatReportTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  return [
    `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`,
    `${pad(hours12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`,
  ].join(' ');
}
