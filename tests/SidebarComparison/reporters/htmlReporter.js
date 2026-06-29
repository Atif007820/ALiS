import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runSettings from '../config/runSettings.json' with { type: 'json' };

const frameworkRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultReportDir = path.join(frameworkRoot, runSettings.outputDir || 'test-results');
const latestHtmlFile = 'latest-report.html';
const reportTitle = 'Sidebar Comparison Report';
const reportSubtitle = 'Sidebar Menu Comparison';

export async function writeHtmlReport(payload, { reportDir = defaultReportDir } = {}) {
  await fs.mkdir(reportDir, { recursive: true });

  const htmlPath = path.join(reportDir, latestHtmlFile);
  const html = buildHtml(payload);
  await fs.writeFile(htmlPath, html, 'utf8');

  return htmlPath;
}

function buildHtml(payload) {
  const {
    labelA,
    labelB,
    urlA,
    urlB,
    itemsA,
    itemsB,
    matched,
    missing,
    iconMismatch,
    extraB,
    error,
  } = payload;

  const mapA = itemMap(itemsA);
  const mapB = itemMap(itemsB);
  const textMatched = [...matched, ...iconMismatch.map((item) => item.title)];
  const issueCount = missing.length + iconMismatch.length + extraB.length + (error ? 1 : 0);
  const generatedAt = formatReportTimestamp();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(reportTitle)}</title>
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
    <h1>${escapeHtml(reportTitle)}</h1>
    <p>${escapeHtml(reportSubtitle)} | ${escapeHtml(generatedAt)}</p>
  </header>
  <main>
    <section class="summary">
      ${metric('Status', issueCount ? 'FAILED' : 'PASSED', issueCount ? 'fail' : 'pass')}
      ${metric(`Expected (${labelA})`, itemsA.length)}
      ${metric(`Actual (${labelB})`, itemsB.length)}
      ${metric('Text Matched', textMatched.length, 'pass')}
      ${metric('Issues', issueCount, issueCount ? 'fail' : 'pass')}
    </section>

    <section class="panel">
      <h2>Run Details</h2>
      <div class="meta">
        <div>URL A</div><div>${escapeHtml(labelA)} (${escapeHtml(urlA)})</div>
        <div>URL B</div><div>${escapeHtml(labelB)} (${escapeHtml(urlB)})</div>
        <div>Generated At</div><div>${escapeHtml(generatedAt)}</div>
        ${error ? `<div>Execution Error</div><div>${escapeHtml(error)}</div>` : ''}
      </div>
    </section>

    ${textSectionTable('Text Matched', 'badge-pass', textMatched.map((title) => sidebarRow({
      status: 'PASS',
      expected: mapA.get(key(title)),
      actual: mapB.get(key(title)),
      details: `Title: ${title}. Title and text matched.`,
    })))}

    ${textSectionTable('Missing Or Text Mismatch', missing.length ? 'badge-fail' : 'badge-pass', missing.map((title) => {
      const actual = mapB.get(key(title));
      return sidebarRow({
        status: actual ? 'MISMATCH' : 'MISSING',
        expected: mapA.get(key(title)),
        actual,
        details: actual
          ? `Title: ${title}. Title exists, but text does not match.`
          : `Title: ${title}. Expected item is missing in Actual.`,
      });
    }))}

    ${iconSectionTable('Icon Mismatch', iconMismatch.length ? 'badge-warn' : 'badge-pass', iconMismatch.map((item) => iconRow(item)))}

    ${textSectionTable('Extra', extraB.length ? 'badge-warn' : 'badge-pass', extraB.map((title) => sidebarRow({
      status: 'EXTRA',
      expected: null,
      actual: mapB.get(key(title)),
      details: `Title: ${title}. Actual has this item, but Expected does not.`,
    })))}
  </main>
</body>
</html>`;
}

function metric(label, value, tone = '') {
  return `<div class="metric"><div class="label">${escapeHtml(label)}</div><div class="value ${tone}">${escapeHtml(value)}</div></div>`;
}

function textSectionTable(title, badgeClass, rows) {
  return sectionTable({
    title,
    badgeClass,
    rows,
    emptyColspan: 4,
    headers: ['Status', 'Expected Text', 'Actual Text', 'Details'],
  });
}

function iconSectionTable(title, badgeClass, rows) {
  return sectionTable({
    title,
    badgeClass,
    rows,
    emptyColspan: 4,
    headers: ['Status', 'Expected Icon', 'Actual Icon', 'Details'],
  });
}

function sectionTable({ title, badgeClass, rows, emptyColspan, headers }) {
  const body = rows.length ? rows.join('\n') : `<tr><td colspan="${emptyColspan}">No records.</td></tr>`;
  const status = rows.length ? `${rows.length}` : '0';
  const headerCells = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');

  return `<section class="panel section">
    <h2>${escapeHtml(title)} <span class="badge ${badgeClass}">${status}</span></h2>
    <table>
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function sidebarRow({ status, expected, actual, details }) {
  return `<tr>
    <td>${escapeHtml(status)}</td>
    <td>${escapeHtml(displayText(expected))}</td>
    <td>${escapeHtml(displayText(actual))}</td>
    <td>${escapeHtml(details)}</td>
  </tr>`;
}

function iconRow(item) {
  return `<tr>
    <td>MISMATCH</td>
    <td>${escapeHtml(item.iconA || '')}</td>
    <td>${escapeHtml(item.iconB || '')}</td>
    <td>${escapeHtml(`Title: ${item.title}. Title and text matched, but icon code differs.`)}</td>
  </tr>`;
}

function displayText(item) {
  return item?.text || item?.title || '';
}

function itemMap(items) {
  return new Map(items.map((item) => [key(item.title), item]));
}

function key(value) {
  return String(value || '').trim().toLowerCase();
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
