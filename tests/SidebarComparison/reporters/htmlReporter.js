import fs from 'node:fs/promises';
import path from 'node:path';
import { menuRows } from './reportData.js';

export async function writeHtmlReport(report, { reportDir, excelFile = 'sidebar-comparison.xlsx' }) {
  await fs.mkdir(reportDir, { recursive: true });
  const htmlPath = path.join(reportDir, 'index.html');
  await fs.writeFile(htmlPath, buildHtml(report, excelFile), 'utf8');
  return htmlPath;
}

function buildHtml(report, excelFile) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sidebar Comparison - Consolidated Report</title>
<style>
:root{font-family:Arial,sans-serif;color:#26313d;background:#fff;font-size:14px;letter-spacing:0}
*{box-sizing:border-box}body{margin:0}header,main{max-width:1500px;margin:auto;padding:24px 28px}header{border-bottom:1px solid #dce1e7}
h1{font-size:26px;margin:0 0 10px}h2{font-size:20px;margin:0 0 14px}h3{font-size:15px;margin:20px 0 10px}
p{line-height:1.5}.muted{color:#657180}a{color:#245b91;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.heading{display:flex;align-items:start;justify-content:space-between;gap:20px;flex-wrap:wrap}.download{padding:10px 0;font-weight:bold}
.metadata{display:flex;gap:12px 22px;flex-wrap:wrap;margin:10px 0 0;color:#596675}.totals{display:flex;gap:24px;flex-wrap:wrap;margin:20px 0 0}
.total strong{display:block;font-size:23px;margin-bottom:5px}.total span{font-size:12px;color:#596675}
.badge{display:inline-block;font-size:12px;font-weight:bold;padding:4px 7px;border-radius:3px;white-space:nowrap;background:#eef0f3;color:#525e6a}
.matched{background:#e6f2ea;color:#24633d}.differences,.icon-mismatch{background:#fff1d4;color:#805a14}.error,.missing,.text-mismatch{background:#fbe4e4;color:#9b2525}.extra{background:#e5eef9;color:#315c8c}
.table-scroll{overflow:auto;max-width:100%}table{width:100%;border-collapse:collapse;min-width:650px;font-size:13px}
th{text-align:left;background:#f0f3f6;color:#3d4b5a;font-size:12px}th,td{padding:11px 10px;border-bottom:1px solid #e1e5ea;vertical-align:top;overflow-wrap:anywhere}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}tbody tr:nth-child(even){background:#fafbfc}
.filters{display:flex;gap:14px;align-items:end;flex-wrap:wrap;padding:20px 0;border-bottom:1px solid #dce1e7;margin-bottom:24px}
label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:bold}select,input{font:inherit;font-size:14px;padding:9px 10px;min-height:38px;border:1px solid #aeb7c1;border-radius:3px;background:white;max-width:100%}
input{width:280px}.filter-count{margin-left:auto;color:#657180;padding:10px 0}.site-section{margin:30px 0 40px}.site-heading{display:flex;gap:15px;align-items:center;flex-wrap:wrap}
.site-heading span{font-size:13px;color:#657180}.comparison{border-top:1px solid #ccd3db;padding:0;margin:0}
.comparison:last-child{border-bottom:1px solid #ccd3db}summary{cursor:pointer;padding:15px 4px;line-height:1.7}summary .badge{margin-left:10px}summary .run-label{margin-left:12px;font-size:12px;color:#657180}
.comparison-body{padding:4px 4px 24px}.urls{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px;margin:8px 0 16px;font-size:13px}.urls dt{color:#657180}.urls dd{margin:0;overflow-wrap:anywhere}
.counts{font-size:13px;color:#596675}.error-block{border-left:3px solid #b54646;padding:8px 14px;background:#fff7f7}.error-block pre,pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 Consolas,monospace;margin:0}
.category table{table-layout:fixed}.category td{white-space:pre-wrap}.category th:first-child{width:24%}.category th{width:19%}.empty{color:#657180;font-size:13px}
.legend{font-size:12px;color:#657180;margin:14px 0 22px}.attempts{margin-top:14px;font-size:13px}.attempts summary{padding:6px 0}
[hidden]{display:none!important}@media(max-width:650px){header,main{padding:20px 14px}h1{font-size:22px}.totals{gap:16px}.urls{grid-template-columns:1fr;gap:4px}.urls dd{margin-bottom:8px}.filters label{width:100%}.filters select,.filters input{width:100%}.filter-count{margin-left:0}.heading{gap:8px}summary .run-label{display:block;margin-left:0}}
@media print{.filters,.download{display:none}header,main{max-width:none;padding:12px}.table-scroll{overflow:visible}table{min-width:0}details:not([open])>:not(summary){display:block}h2,h3,summary{break-after:avoid}.comparison{break-inside:auto}}
</style></head><body>
<header><div class="heading"><div><h1>Sidebar Comparison</h1>${badge(report.status)}</div><a class="download" href="${escapeHtml(encodeURIComponent(excelFile))}" download>Download Excel workbook</a></div>
<div class="metadata"><span>Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString('en-GB'))}</span><span>Execution: ${escapeHtml(report.executionStatus)}</span><span>Duration: ${(report.durationMs / 1000).toFixed(1)} s</span></div>
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
  const rows = menuRows(record);
  const textMatched = rows.filter((row) => ['MATCHED', 'ICON MISMATCH'].includes(row.category));
  const counts = record.comparisonComplete
    ? `Text matched: ${textMatched.length} | Missing / text mismatch: ${record.missing.length} | Icon mismatch: ${record.iconMismatch.length} | Extra: ${record.extraB.length}`
    : 'Comparison was not completed.';
  return `<details class="comparison" data-status="${record.status}"><summary><strong>${escapeHtml(record.productId)}. ${escapeHtml(record.productName)}</strong>${badge(record.status)}<span class="run-label">${escapeHtml(record.project)} | Repeat ${record.repeat} | ${(record.durationMs / 1000).toFixed(1)} s | ${record.attempts.length} attempt(s)</span></summary>
<div class="comparison-body"><dl class="urls"><dt>${escapeHtml(record.labelA)}</dt><dd>${urlLink(record.urlA)}</dd><dt>${escapeHtml(record.labelB)}</dt><dd>${urlLink(record.urlB)}</dd></dl>
<p class="counts">URL A items: ${record.capturedA ? record.itemsA.length : 'Unavailable'} | URL B items: ${record.capturedB ? record.itemsB.length : 'Unavailable'}<br>${counts}</p>
${record.error ? `<div class="error-block"><h3>Execution Error</h3><pre>${escapeHtml(record.error)}</pre></div>` : ''}
${record.comparisonComplete ? [
    categoryTable('Missing / Text Mismatch', rows.filter((row) => ['MISSING', 'TEXT MISMATCH'].includes(row.category))),
    categoryTable('Icon Mismatch', rows.filter((row) => row.category === 'ICON MISMATCH')),
    categoryTable('Extra in URL B', rows.filter((row) => row.category === 'EXTRA')),
    `<details><summary>Matched Text (${textMatched.length})</summary>${categoryTable('Matched Text', textMatched)}</details>`,
  ].join('') : ''}
${record.attempts.length > 1 ? `<details class="attempts"><summary>Attempt History</summary>${record.attempts.map((attempt) => `<h3>Attempt ${attempt.retry + 1}: ${escapeHtml(attempt.status)}</h3>${attempt.error ? `<pre>${escapeHtml(attempt.error)}</pre>` : ''}`).join('')}</details>` : ''}
</div></details>`;
}

function categoryTable(title, rows) {
  return `<section class="category"><h3>${escapeHtml(title)} (${rows.length})</h3>${rows.length
    ? `<div class="table-scroll"><table><thead><tr><th>Menu item / category</th><th>URL A text</th><th>URL B text</th><th>URL A icon</th><th>URL B icon</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.title)}<br>${badge(row.category)}</td><td>${escapeHtml(row.expectedText)}</td><td>${escapeHtml(row.actualText)}</td><td>${escapeHtml(row.expectedIcon || '(none)')}</td><td>${escapeHtml(row.actualIcon || '(none)')}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty">None.</p>'}</section>`;
}

function urlLink(url) {
  if (!/^https?:\/\//i.test(url)) return escapeHtml(url || 'Unavailable');
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
}

function badge(status) {
  return `<span class="badge ${escapeHtml(status.toLowerCase().replaceAll(' ', '-'))}">${escapeHtml(status)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
