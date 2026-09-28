// ============================================================
//  annotations.js
//  Publishes structured results to the consolidated reporter,
//  with an optional plain-text attachment for diagnostics.
// ============================================================


// ─────────────────────────────────────────────────────────────
//  attachReport
//  Builds the annotation text and attaches it to testInfo.
// ─────────────────────────────────────────────────────────────
export const COMPARISON_METADATA = 'sidebar-comparison';
export const COMPARISON_RESULT = 'sidebar-comparison-result';

export async function attachReport({ testInfo, includeText = true, ...payload }) {
  // This attachment is the per-test input to the single run-level reporter.
  await testInfo.attach(COMPARISON_RESULT, {
    body: Buffer.from(JSON.stringify(payload)),
    contentType: 'application/json',
  });
  if (!includeText) return;
  const { site, productId, productName, labelA, labelB, urlA, urlB, itemsA, itemsB, matched, missing, iconMismatch, extraB, error } = payload;

  const D = '─'.repeat(50);
  const lines = [];

  lines.push('SIDEBAR COMPARISON RESULTS');
  if (site) lines.push(`Site     : ${site}`);
  if (productId) lines.push(`Product ID: ${productId}`);
  if (productName) {
    lines.push(`Product  : ${productName}`);
  }
  lines.push(`Source   : ${labelA}  (${urlA})`);
  lines.push(`Comparing: ${labelB}  (${urlB})`);
  lines.push('');

  if (error) {
    lines.push('EXECUTION ERROR');
    lines.push(D);
    lines.push(error);
    lines.push('');
  }

  const textMatched = [...matched, ...iconMismatch.map(i => i.title)];
  lines.push(`✅ TEXT MATCHED (${textMatched.length})`);
  lines.push(D);
  textMatched.length === 0
    ? lines.push('  None')
    : textMatched.forEach(m => lines.push(`  • ${m}`));
  lines.push('');

  lines.push(`⚠️ MISSING / TEXT MISMATCH in ${labelB} (${missing.length})`);
  lines.push(D);
  missing.length === 0
    ? lines.push('  None')
    : missing.forEach(m => lines.push(`  • ${m}`));
  lines.push('');

  lines.push(`🔶 ICON MISMATCH in ${labelB} (${iconMismatch.length})  — text matched, icon differs`);
  lines.push(D);
  iconMismatch.length === 0
    ? lines.push('  None')
    : iconMismatch.forEach(({ title, iconA, iconB }) => {
        lines.push(`  • ${title}`);
        lines.push(`      ${labelA} icon: "${iconA || '(none)'}"`);
        lines.push(`      ${labelB} icon: "${iconB || '(none)'}"`);
      });
  lines.push('');

  lines.push(`🔵 EXTRA (${extraB.length})`);
  lines.push(D);
  extraB.length === 0
    ? lines.push('  None')
    : extraB.forEach(t => lines.push(`  • ${t}`));
  lines.push('');

  lines.push(D);
  lines.push(`Total in ${labelA}: ${itemsA.length}  |  Total in ${labelB}: ${itemsB.length}`);
  lines.push(`Text Matched: ${textMatched.length}  |  Missing/Text Mismatch: ${missing.length}  |  Icon Mismatch: ${iconMismatch.length}  |  Extra: ${extraB.length}`);

  await testInfo.attach('Sidebar Comparison Text Report', {
    body        : lines.join('\n'),
    contentType : 'text/plain',
  });
}
