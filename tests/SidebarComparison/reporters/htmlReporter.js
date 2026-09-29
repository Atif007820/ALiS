import fs from 'node:fs/promises';
import path from 'node:path';
import { categoryGroups, DETAIL_COLUMNS, formatReportDateTime, REPORT_THEME } from './reportData.js';

export async function writeHtmlReport(report, { reportDir, excelFile = 'sidebar-comparison.xlsx' }) {
  await fs.mkdir(reportDir, { recursive: true });
  const htmlPath = path.join(reportDir, 'index.html');
  await fs.writeFile(htmlPath, buildHtml(report, excelFile), 'utf8');
  return htmlPath;
}

function buildHtml(report, excelFile) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sidebar Comparison Report</title>
<style>
:root{--report-header-bg:#${REPORT_THEME.headerBg};--report-header-accent:#${REPORT_THEME.headerAccent};font-family:Arial,sans-serif;color:#26313d;background:#fff;font-size:14px;letter-spacing:0}
*{box-sizing:border-box}body{margin:0;border-top:4px solid var(--report-header-accent)}header,main{max-width:1500px;margin:auto;padding:28px}header{background:var(--report-header-bg);border-bottom:3px solid var(--report-header-accent)}
h1{font-size:26px;margin:0 0 10px}h2{font-size:20px;margin:0 0 14px}h3{font-size:15px;margin:20px 0 10px}
p{line-height:1.5}.muted{color:#657180}a{color:#245b91;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.heading{display:flex;align-items:start;justify-content:space-between;gap:20px;flex-wrap:wrap}.download{padding:10px 0;font-weight:bold}
.metadata{display:flex;gap:12px 22px;flex-wrap:wrap;margin:10px 0 0;color:#596675}.totals{display:flex;flex-wrap:wrap;margin:24px 0 0;border-top:1px solid #e0e6e3;padding-top:18px;gap:18px 0}.total{min-width:100px;padding:0 24px;border-right:1px solid #dce1e7}.total:first-child{padding-left:0}.total:last-child{border:0}
.total strong{display:block;font-size:23px;margin-bottom:5px}.total span{font-size:12px;color:#596675}
.badge{display:inline-block;font-size:12px;font-weight:bold;padding:4px 7px;border-radius:3px;white-space:nowrap;background:#eef0f3;color:#525e6a}
.matched,.text-matched{background:#e6f2ea;color:#24633d}.icon-mismatch{background:#fff1d4;color:#805a14}.error,.missing,.text-mismatch{background:#fbe4e4;color:#9b2525}.extra{background:#e5eef9;color:#315c8c}
.table-scroll{overflow:auto;max-width:100%;border:1px solid #c6d0ce}table{width:100%;border-collapse:collapse;min-width:650px;font-size:13px}
th{text-align:left;background:#edf2f0;color:#334a42;font-size:12px}th,td{padding:12px;border:1px solid #d5ddda;vertical-align:top;overflow-wrap:anywhere}thead th{border-top:0;border-bottom:2px solid #b7c8c0}tr>:first-child{border-left:0}tr>:last-child{border-right:0}tbody tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tbody tr:nth-child(even){background:#f8faf9}tbody tr:hover{background:#edf5f2}
.filters{display:flex;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 0;border-bottom:1px solid #dce1e7;margin-bottom:24px}
label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:bold}select,input{font:inherit;font-size:14px;padding:9px 10px;min-height:38px;border:1px solid #aeb7c1;border-radius:3px;background:white;max-width:100%}
input{width:280px}.filter-count{margin-left:auto;color:#657180;padding:10px 0}.site-section{margin:30px 0 40px;scroll-margin-top:20px}.site-heading{display:flex;gap:15px;align-items:center;flex-wrap:wrap;padding:14px 16px;background:#edf2f0;border:1px solid #c6d0ce;border-left:4px solid #347157}.site-heading h2{margin:0}
.site-heading span{font-size:13px;color:#657180}.comparison{border:1px solid #c6d0ce;border-top:0;padding:0;margin:0}
summary{cursor:pointer;padding:16px;line-height:1.7;overflow-wrap:anywhere}summary:hover{background:#f4f7f6}summary:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #347157;outline-offset:3px}summary .badge{margin-left:10px}summary .run-label{margin-left:12px;font-size:12px;color:#657180}.comparison[open]>summary{border-bottom:1px solid #d5ddda;background:#f8faf9}
.comparison-body{padding:12px 18px 24px;min-width:0}.urls{display:grid;grid-template-columns:140px minmax(0,1fr);gap:8px;margin:8px 0 16px;font-size:13px}.urls dt{color:#657180;overflow-wrap:anywhere}.urls dd{margin:0;overflow-wrap:anywhere}
.counts{font-size:13px;color:#596675}.error-block{border-left:3px solid #b54646;padding:8px 14px;background:#fff7f7}.error-block pre,pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 Consolas,monospace;margin:0}
.category{margin:22px 0}.category h3{border-left:3px solid var(--category-color,#347157);padding:4px 10px}.category table{table-layout:fixed}.category td{white-space:pre-wrap}.category th:first-child{width:25%}.category th{width:25%}.category .badge{margin-top:7px}.empty{color:#657180;font-size:13px}.matched-details{margin-top:20px;border-top:1px solid #c6d0ce;border-bottom:1px solid #c6d0ce}.matched-details>summary{padding:12px 0;font-weight:bold}
.legend{font-size:12px;color:#657180;margin:14px 0 22px}.attempts{margin-top:14px;font-size:13px}.attempts summary{padding:6px 0}
[hidden]{display:none!important}@media(max-width:650px){header,main{padding:20px 14px}h1{font-size:22px}.totals{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.total,.total:first-child{padding:0;border:0;min-width:0}.urls{grid-template-columns:1fr;gap:4px}.urls dd{margin-bottom:8px}.filters label{width:100%}.filters select,.filters input{width:100%}.filter-count{margin-left:0}.heading{gap:8px}summary .run-label{display:block;margin-left:0}.comparison-body{padding:10px}.site-heading{padding:12px}summary{padding:12px}}
@media print{.filters,.download{display:none}header,main{max-width:none;padding:12px}.table-scroll{overflow:visible}table{min-width:0}details:not([open])>:not(summary){display:block}h2,h3,summary{break-after:avoid}.comparison{break-inside:auto}}
</style></head><body>
<header><div class="heading"><h1>Sidebar Comparison Report</h1><a class="download" href="${escapeHtml(encodeURIComponent(excelFile))}" download>Download Excel Report</a></div>
<div class="metadata"><span>Generated <strong>${escapeHtml(formatReportDateTime(report.generatedAt))}</strong></span><span>Execution: ${escapeHtml(displayExecutionStatus(report.executionStatus))}</span><span>Duration: ${(report.durationMs / 1000).toFixed(1)} s</span></div>
<div class="totals">${[
    ['Sites', report.sites.length], ['Comparisons', report.summary.total], ['Matched', report.summary.matched],
    ['With differences', report.summary.differences], ['Runtime errors', report.summary.errors],
    ['Skipped / not run', report.summary.skipped + report.summary.notRun],
  ].map(([label, value]) => `<div class="total"><strong>${value}</strong><span>${label}</span></div>`).join('')}</div></header>
<main><h2>Site Summary</h2><div class="table-scroll"><table id="site-summary"><thead><tr><th>Site</th><th class="num">Comparisons</th><th class="num">Matched</th><th class="num">Differences</th><th class="num">Errors</th><th class="num">Skipped / not run</th></tr></thead><tbody>
${report.sites.map((site, index) => `<tr><td><a href="#site-${index}">${escapeHtml(site.site)}</a></td>${[site.total, site.matched, site.differences, site.errors, site.skipped + site.notRun].map((n) => `<td class="num">${n}</td>`).join('')}</tr>`).join('')}
</tbody></table></div><p class="legend">Matched means text and icons match. Differences identifies menu changes. Error means the comparison encountered a runtime failure. Execution status describes the Playwright run.</p>
${report.globalErrors.length ? `<section class="error-block"><h2>Run Errors</h2>${report.globalErrors.map((error) => `<pre>${escapeHtml(error)}</pre>`).join('<hr>')}</section>` : ''}
<div class="filters"><label>Site<select id="site-filter"><option value="">All sites</option>${report.sites.map((site) => `<option>${escapeHtml(site.site)}</option>`).join('')}</select></label>
<label>Result<select id="status-filter"><option value="">All results</option>${['MATCHED', 'DIFFERENCES', 'ERROR', 'SKIPPED', 'NOT RUN'].map((status) => `<option>${status}</option>`).join('')}</select></label>
<label>Search<input id="search" type="search" placeholder="Product or menu item"></label><span class="filter-count" id="visible-count"></span></div>
${report.sites.map((site, index) => `<section class="site-section" id="site-${index}" data-site="${escapeHtml(site.site)}"><div class="site-heading"><h2>${escapeHtml(site.site)}</h2><span>${site.total} comparison${site.total === 1 ? '' : 's'}</span></div>
${report.comparisons.filter((record) => record.site === site.site).map(comparisonSection).join('')}</section>`).join('')}
<p id="no-results" class="empty" hidden>No comparisons match the current filters.</p>
</main><script>
const siteFilter = document.getElementById('site-filter');
const statusFilter = document.getElementById('status-filter');
const search = document.getElementById('search');
const comparisons = Array.from(document.querySelectorAll('.comparison'));
function updateFilters() {
  const query = search.value.trim().toLowerCase();
  let visible = 0;
  for (const section of document.querySelectorAll('.site-section')) {
    let count = 0;
    for (const item of section.querySelectorAll('.comparison')) {
      item.hidden = Boolean((siteFilter.value && section.dataset.site !== siteFilter.value)
        || (statusFilter.value && item.dataset.status !== statusFilter.value)
        || (query && !item.textContent.toLowerCase().includes(query)));
      if (!item.hidden) count++;
    }
    section.hidden = count === 0;
    visible += count;
  }
  document.getElementById('visible-count').textContent = 'Showing ' + visible + ' of ' + comparisons.length;
  document.getElementById('no-results').hidden = visible !== 0;
}
siteFilter.addEventListener('change', updateFilters);
statusFilter.addEventListener('change', updateFilters);
search.addEventListener('input', updateFilters);
updateFilters();
</script></body></html>`;
}

function comparisonSection(record) {
  const groups = categoryGroups(record);
  const textMatched = groups.find((group) => group.title === 'Matched Text').rows;
  const counts = record.comparisonComplete
    ? `Text matched: ${textMatched.length} | Missing / text mismatch: ${record.missing.length} | Icon mismatch: ${record.iconMismatch.length} | Extra: ${record.extraB.length}`
    : 'Comparison was not completed.';
  const runtimeBadge = ['ERROR', 'SKIPPED', 'NOT RUN'].includes(record.status) ? badge(record.status) : '';
  return `<details class="comparison" data-status="${record.status}"><summary><strong>${escapeHtml(record.productId)}. ${escapeHtml(record.productName)}</strong>${runtimeBadge}<span class="run-label">${(record.durationMs / 1000).toFixed(1)} s | ${record.attempts.length} attempt(s)</span></summary>
<div class="comparison-body"><dl class="urls"><dt>${escapeHtml(record.labelA)}</dt><dd>${urlLink(record.urlA)}</dd><dt>${escapeHtml(record.labelB)}</dt><dd>${urlLink(record.urlB)}</dd></dl>
<p class="counts">URL A items: ${record.capturedA ? record.itemsA.length : 'Unavailable'} | URL B items: ${record.capturedB ? record.itemsB.length : 'Unavailable'}<br>${counts}</p>
${record.error ? `<div class="error-block"><h3>Execution Error</h3><pre>${escapeHtml(record.error)}</pre></div>` : ''}
${record.comparisonComplete ? groups.map((group) => group.collapsible
    ? `<details class="matched-details"><summary>${escapeHtml(group.title)} (${group.rows.length})</summary>${categoryTable(group)}</details>`
    : categoryTable(group)).join('') : ''}
${record.attempts.length > 1 ? `<details class="attempts"><summary>Attempt History</summary>${record.attempts.map((attempt) => `<h3>Attempt ${attempt.retry + 1}: ${escapeHtml(attempt.status)}</h3>${attempt.error ? `<pre>${escapeHtml(attempt.error)}</pre>` : ''}`).join('')}</details>` : ''}
</div></details>`;
}

function categoryTable({ title, rows, color, collapsible }) {
  return `<section class="category" style="--category-color:#${color}">${collapsible ? '' : `<h3>${escapeHtml(title)} (${rows.length})</h3>`}${rows.length
    ? `<div class="table-scroll"><table aria-label="${escapeHtml(title)}"><thead><tr>${DETAIL_COLUMNS.map((column) => `<th scope="col">${column.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${DETAIL_COLUMNS.map((column) => `<td>${escapeHtml(row[column.key] || (column.key.endsWith('Icon') ? '(none)' : ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">None.</p>'}</section>`;
}

function urlLink(url) {
  if (!/^https?:\/\//i.test(url)) return escapeHtml(url || 'Unavailable');
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
}

function badge(status) {
  return `<span class="badge ${escapeHtml(status.toLowerCase().replaceAll(' ', '-'))}">${escapeHtml(status)}</span>`;
}

function displayExecutionStatus(status) {
  return status === 'passed' ? 'Passed' : status;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
