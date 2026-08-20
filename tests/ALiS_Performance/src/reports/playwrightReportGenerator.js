import fs from 'fs/promises';
import path from 'path';
import { reportConfig } from '../../config/reportConfig.js';
import { runConfig } from '../../config/runConfig.js';
import { ensureDir } from '../utils/fileUtils.js';

export async function generatePlaywrightReport({
  records,
  summary,
  metadata,
  artifacts,
  outputDir
}) {
  const reportDir = path.join(outputDir, runConfig.playwrightReportDir);
  const outputPath = path.join(reportDir, 'index.html');
  ensureDir(reportDir);

  const html = buildPlaywrightReportHtml({
    records,
    summary,
    metadata,
    artifacts,
    outputPath
  });

  await fs.writeFile(outputPath, html, 'utf8');
  return { outputPath };
}

export function buildPlaywrightReportHtml({
  records,
  summary,
  metadata,
  artifacts,
  outputPath
}) {
  const slaMs = reportConfig.slaMs;
  const groups = buildThreadGroupRows(records, summary, slaMs);
  const withinSla = records.filter((record) => isWithinSla(record, slaMs)).length;
  const failedOrBreached = records.length - withinSla;
  const passedGroups = groups.filter((group) => group.status === 'PASSED').length;
  const failedGroups = groups.length - passedGroups;
  const generatedAt = formatTimestamp(metadata.generatedAt);
  const scriptName = metadata.scriptRelativePath || 'JMeter performance script';
  const excelHref = relativeHref(outputPath, artifacts.excelPath);
  const jsonHref = relativeHref(outputPath, artifacts.jsonPath);
  const csvHref = relativeHref(outputPath, artifacts.csvPath);
  const jmeterHtmlHref = relativeHref(outputPath, artifacts.jmeterHtmlPath);

  const rows = groups.map((group) => `
    <article class="test-row" data-status="${group.status}" data-search="${escapeHtml(group.searchText)}">
      <div class="status-badge ${group.status === 'PASSED' ? 'pass' : 'fail'}">${group.status === 'PASSED' ? 'PASS' : 'FAIL'}</div>
      <div class="test-main">
        <div class="test-title">${escapeHtml(group.label)}</div>
        <div class="test-meta">JMeter Thread Group | ${escapeHtml(scriptName)}</div>
        <div class="test-stats">${escapeHtml(group.statsText)}</div>
        ${group.failureText ? `<div class="test-error">${escapeHtml(group.failureText)}</div>` : ''}
      </div>
      <div class="tags">
        <span>JMeter</span>
        <span>SLA ${formatNumber(slaMs)} ms</span>
        <span>${escapeHtml(group.status)}</span>
      </div>
    </article>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ALiS Performance Playwright Test Report</title>
  <style>
    :root {
      --bg: #101114;
      --panel: #171a20;
      --panel-2: #0c0e12;
      --border: #303641;
      --text: #edf1f7;
      --muted: #9ca7b7;
      --pass: #44d477;
      --fail: #ff7068;
      --blue: #70a9ff;
      --blue-dark: #0c376f;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: "Segoe UI", Arial, sans-serif; font-size: 14px; }
    main { width: min(1240px, calc(100vw - 40px)); margin: 22px auto 42px; }
    .topline { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; margin-bottom: 18px; }
    h1 { margin: 0 0 5px; font-size: 22px; font-weight: 650; }
    .subtitle { color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; }
    .download { display: inline-block; flex: 0 0 auto; color: #fff; background: #2468c8; border: 1px solid #4284df; border-radius: 6px; padding: 10px 14px; font-weight: 700; text-decoration: none; }
    .download:hover { background: #2c75d8; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
    .metric { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 13px; }
    .metric-label { color: var(--muted); font-size: 11px; text-transform: uppercase; }
    .metric-value { margin-top: 4px; font-size: 23px; font-weight: 700; }
    .metric-value.pass-text { color: var(--pass); }
    .metric-value.fail-text { color: var(--fail); }
    .toolbar { display: grid; grid-template-columns: minmax(230px, 1fr) auto; gap: 16px; align-items: center; margin-bottom: 14px; }
    input { width: 100%; background: var(--panel-2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 11px 13px; font-size: 14px; }
    .filters { display: flex; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--panel-2); }
    .filter { border: 0; border-right: 1px solid var(--border); background: transparent; color: var(--text); padding: 10px 13px; font-weight: 650; cursor: pointer; }
    .filter:last-child { border-right: 0; }
    .filter.active { background: #252b35; }
    .count { display: inline-block; min-width: 23px; margin-left: 6px; padding: 2px 7px; border-radius: 999px; background: #374252; }
    .run-details { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 7px 12px; padding: 14px 16px; margin-bottom: 15px; background: var(--panel); border: 1px solid var(--border); border-radius: 6px; }
    .run-details dt { color: var(--muted); }
    .run-details dd { margin: 0; overflow-wrap: anywhere; }
    .suite { border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--panel); }
    .suite-header { display: flex; justify-content: space-between; gap: 12px; padding: 13px 15px; border-bottom: 1px solid var(--border); background: #1b2028; font-weight: 700; }
    .test-row { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto; gap: 12px; padding: 13px 14px; border-bottom: 1px solid var(--border); align-items: start; }
    .test-row:last-child { border-bottom: 0; }
    .status-badge { width: 48px; border-radius: 999px; padding: 4px 0; text-align: center; font-size: 11px; font-weight: 800; }
    .status-badge.pass { background: rgba(68, 212, 119, .12); color: var(--pass); border: 1px solid rgba(68, 212, 119, .45); }
    .status-badge.fail { background: rgba(255, 112, 104, .13); color: var(--fail); border: 1px solid rgba(255, 112, 104, .5); }
    .test-title { font-size: 16px; font-weight: 700; line-height: 1.35; }
    .test-meta, .test-stats { color: var(--muted); margin-top: 5px; line-height: 1.4; }
    .test-error { color: #ffc2be; margin-top: 6px; line-height: 1.4; }
    .tags { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; max-width: 330px; }
    .tags span { border: 1px solid #3478d4; color: #99c2ff; background: #09244a; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 700; }
    .links { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; color: var(--muted); }
    .links a { color: var(--blue); font-weight: 650; text-decoration: none; }
    .links a:hover { text-decoration: underline; }
    .empty { padding: 22px; color: var(--muted); }
    @media (max-width: 760px) {
      main { width: min(100% - 24px, 1240px); }
      .topline, .suite-header { flex-direction: column; }
      .download { align-self: flex-start; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .toolbar { grid-template-columns: 1fr; }
      .filters { overflow-x: auto; }
      .test-row { grid-template-columns: 64px minmax(0, 1fr); }
      .tags { grid-column: 2; justify-content: flex-start; }
      .run-details { grid-template-columns: 110px minmax(0, 1fr); }
    }
  </style>
</head>
<body>
  <main>
    <section class="topline">
      <div>
        <h1>ALiS Performance Playwright Test Report</h1>
        <div class="subtitle">${escapeHtml(scriptName)} | ${escapeHtml(generatedAt)}</div>
      </div>
      <a id="download-excel" class="download" href="${escapeHtml(excelHref)}" download="${escapeHtml(path.basename(artifacts.excelPath))}">Download Excel Report</a>
    </section>

    <section class="metrics">
      <div class="metric"><div class="metric-label">Total Samples</div><div class="metric-value">${formatNumber(records.length)}</div></div>
      <div class="metric"><div class="metric-label">Within SLA</div><div class="metric-value pass-text">${formatNumber(withinSla)}</div></div>
      <div class="metric"><div class="metric-label">Failed / Breached</div><div class="metric-value fail-text">${formatNumber(failedOrBreached)}</div></div>
      <div class="metric"><div class="metric-label">P95 Response</div><div class="metric-value">${formatNumber(Math.round(summary.overall.p95))} ms</div></div>
    </section>

    <dl class="run-details">
      <dt>Application URL</dt><dd>${escapeHtml(metadata.applicationUrl || 'Not captured')}</dd>
      <dt>Load Settings</dt><dd>${escapeHtml(loadSettingsText(metadata))}</dd>
      <dt>SLA Threshold</dt><dd>${formatNumber(slaMs)} ms</dd>
      <dt>Duration</dt><dd>${formatDuration(summary.overall.durationSeconds)}</dd>
    </dl>

    <section class="toolbar">
      <input id="search" type="search" placeholder="Search thread groups">
      <div class="filters">
        <button class="filter active" data-filter="ALL">All <span class="count">${groups.length}</span></button>
        <button class="filter" data-filter="PASSED">Passed <span class="count">${passedGroups}</span></button>
        <button class="filter" data-filter="FAILED">Failed <span class="count">${failedGroups}</span></button>
      </div>
    </section>

    <section class="suite">
      <div class="suite-header"><span>Thread Groups</span><span>${groups.length} groups</span></div>
      <div id="rows">${rows || '<div class="empty">No thread-group results were produced.</div>'}</div>
    </section>

    <div class="links">
      ${artifactLink('JMeter HTML Report', jmeterHtmlHref)}
      ${artifactLink('JSON Summary', jsonHref)}
      ${artifactLink('CSV Summary', csvHref)}
    </div>
  </main>
  <script>
    const search = document.getElementById('search');
    const filters = [...document.querySelectorAll('.filter')];
    const rows = [...document.querySelectorAll('.test-row')];
    let activeFilter = 'ALL';

    function applyFilters() {
      const query = search.value.trim().toLowerCase();
      for (const row of rows) {
        const statusMatch = activeFilter === 'ALL' || row.dataset.status === activeFilter;
        const searchMatch = !query || row.dataset.search.includes(query);
        row.style.display = statusMatch && searchMatch ? '' : 'none';
      }
    }

    search.addEventListener('input', applyFilters);
    filters.forEach((button) => {
      button.addEventListener('click', () => {
        filters.forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        activeFilter = button.dataset.filter;
        applyFilters();
      });
    });
  </script>
</body>
</html>`;
}

function buildThreadGroupRows(records, summary, slaMs) {
  const recordsByGroup = new Map();
  for (const record of records) {
    const label = record.threadGroup || 'Unknown';
    if (!recordsByGroup.has(label)) recordsByGroup.set(label, []);
    recordsByGroup.get(label).push(record);
  }

  return [...recordsByGroup.entries()].map(([label, groupRecords]) => {
    const stats = summary.byThreadGroup.find((item) => item.label === label) || {};
    const withinSla = groupRecords.filter((record) => isWithinSla(record, slaMs)).length;
    const failedRequests = groupRecords.filter((record) => !record.success).length;
    const slaBreaches = groupRecords.filter((record) => record.success && record.elapsed > slaMs).length;
    const failedOrBreached = failedRequests + slaBreaches;
    const firstFailure = groupRecords.find((record) => !record.success || record.elapsed > slaMs);
    const failureText = firstFailure
      ? firstFailure.failureMessage || firstFailure.responseMessage || `${firstFailure.label} exceeded the SLA.`
      : '';
    const statsText = [
      `samples=${groupRecords.length}`,
      `within SLA=${withinSla}`,
      `failed/breached=${failedOrBreached}`,
      `average=${formatNumber(Math.round(stats.average || 0))} ms`,
      `p95=${formatNumber(Math.round(stats.p95 || 0))} ms`,
      `throughput=${Number(stats.throughput || 0).toFixed(4)} req/s`
    ].join(', ');

    return {
      label,
      status: failedOrBreached === 0 ? 'PASSED' : 'FAILED',
      statsText,
      failureText,
      searchText: `${label} ${statsText} ${failureText}`.toLowerCase()
    };
  });
}

function isWithinSla(record, slaMs) {
  return Boolean(record.success) && Number(record.elapsed) <= slaMs;
}

function loadSettingsText(metadata) {
  if (!metadata.profileApplied || !metadata.profile) return 'JMX script settings';
  const profile = Object.entries(metadata.profile)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  return metadata.profileName ? `${metadata.profileName}: ${profile}` : profile;
}

function relativeHref(fromFilePath, targetPath) {
  if (!targetPath) return '';
  return path.relative(path.dirname(fromFilePath), targetPath)
    .split(path.sep)
    .map((part) => part === '..' ? part : encodeURIComponent(part))
    .join('/');
}

function artifactLink(label, href) {
  return href ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : '';
}

function formatTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return String(value || '');
  const datePart = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  }).format(date);
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
  return `${datePart} | ${timePart}`;
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (value < 60) return `${value.toFixed(1)} sec`;
  const minutes = Math.floor(value / 60);
  const remaining = Math.round(value % 60);
  return `${minutes} min ${String(remaining).padStart(2, '0')} sec`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
