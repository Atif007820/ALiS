// ============================================================
// BUILD REPORT
// Assembles the full plain-text comparison report.
// ============================================================

import { wrapText } from '../helpers/textHelpers.js';

const DIVIDER = '─'.repeat(56);

// ── Table border section ──────────────────────────────────

function formatTableBorderReport(tableBorders) {
    const out = [];

    out.push(`  TABLE BORDER CHECK (${tableBorders.matched.length}/${tableBorders.checked} matched)`);
    out.push(`  ${DIVIDER}`);

    if (tableBorders.checked === 0) {
        out.push('    No bordered tables found in template.');
        return out.join('\n');
    }

    if (tableBorders.matched.length > 0) {
        out.push('    Matched table borders');
        tableBorders.matched.forEach((item, i) => {
            const grid = item.component
                ? `${item.component.xLineCount} vertical × ${item.component.yLineCount} horizontal grid lines`
                : 'grid not detected';
            out.push(wrapText(
                `    ${String(i + 1).padStart(2)}.  `,
                `Template table ${item.tableNumber} → PDF page ${item.pageNumber}; ${grid}.`
            ));
        });
        out.push('');
    }

    if (tableBorders.missing.length > 0) {
        out.push('    Missing or incomplete table borders');
        tableBorders.missing.forEach((item, i) => {
            const pageText = item.pageNumber
                ? `best PDF page ${item.pageNumber}`
                : 'no matching PDF page';
            out.push(wrapText(
                `    ${String(i + 1).padStart(2)}.  `,
                `Template table ${item.tableNumber} (${item.rowCount} rows × ${item.columnCount} columns) ` +
                `has borders in the template, but ${pageText} did not have a matching bordered grid. ` +
                item.snippet
            ));
        });
    } else {
        out.push('    No missing table borders detected.');
    }

    return out.join('\n');
}

// ── Public builder ────────────────────────────────────────

/**
 * Build a complete plain-text comparison report string.
 *
 * @param {string} file1Name
 * @param {string} file2Name
 * @param {{ matchedLines, mismatchLines, missingLines, extraLines, tableBorders,
 *           templateLineCount, letterLineCount }} result
 * @returns {string}
 */
export function buildReport(file1Name, file2Name, result) {
    const { matchedLines, mismatchLines, missingLines, extraLines, tableBorders } = result;

    const LABEL_T    = 'TEMPLATE';
    const LABEL_L    = 'LETTER'.padEnd(LABEL_T.length);
    const totalIssues = mismatchLines.length + missingLines.length;
    const out         = [];

    out.push('');
    out.push('  COMPARISON RESULTS');
    out.push(`  Source    :  ${file1Name}`);
    out.push(`  Comparing :  ${file2Name}`);
    out.push('');

    // ── Section 1: Matching ───────────────────────────────
    out.push(`  ✅  MATCHING IN LETTER (${matchedLines.length})`);
    out.push(`  ${DIVIDER}`);

    if (matchedLines.length === 0) {
        out.push('    None');
    } else {
        matchedLines.forEach(({ letter }, i) =>
            out.push(wrapText(`    ${String(i + 1).padStart(2)}.  `, letter))
        );
    }
    out.push('');

    // ── Section 2: Mismatch / Missing ────────────────────
    out.push(`  ⚠️   MISMATCH / MISSING IN LETTER (${totalIssues})`);
    out.push(`  ${DIVIDER}`);

    if (totalIssues === 0) {
        out.push('    None');
    } else {
        let n = 1;

        if (mismatchLines.length > 0) {
            out.push('    — Content differs from template —');
            out.push('');
            mismatchLines.forEach(({ template, letter, details }) => {
                const num  = `${String(n++).padStart(2)}.`;
                const tPfx = `    ${num}  ${LABEL_T} :  `;
                const lPfx = `    ${' '.repeat(num.length)}  ${LABEL_L} :  `;
                out.push(wrapText(tPfx, template));
                out.push(wrapText(lPfx, letter));
                if (details) out.push(wrapText(`    ${' '.repeat(num.length)}  DETAILS :  `, details));
                out.push('');
            });
        }

        if (missingLines.length > 0) {
            out.push('    — Present in template but missing in letter —');
            out.push('');
            missingLines.forEach(row => {
                const num = `${String(n++).padStart(2)}.`;
                out.push(wrapText(`    ${num}  `, lineValue(row, 'template')));
                if (row.details) out.push(wrapText(`    ${' '.repeat(num.length)}  DETAILS :  `, row.details));
            });
            out.push('');
        }
    }

    // ── Section 3: Extra ──────────────────────────────────
    out.push(`  🔵  EXTRA IN LETTER — ${file2Name} (${extraLines.length})`);
    out.push(`  ${DIVIDER}`);

    if (extraLines.length === 0) {
        out.push('    None');
    } else {
        extraLines.forEach((row, i) => {
            const num = `${String(i + 1).padStart(2)}.`;
            out.push(wrapText(`    ${num}  `, lineValue(row, 'letter')));
            if (row.details) out.push(wrapText(`    ${' '.repeat(num.length)}  DETAILS :  `, row.details));
        });
    }
    out.push('');

    // ── Section 4: Table borders ──────────────────────────
    out.push(`  ${DIVIDER}`);
    if (tableBorders) {
        out.push(formatTableBorderReport(tableBorders));
        out.push('');
        out.push(`  ${DIVIDER}`);
    }

    // ── Footer ────────────────────────────────────────────
    out.push(`  Template lines : ${result.templateLineCount ?? matchedLines.length + mismatchLines.length + missingLines.length}`);
    out.push(`  Letter lines   : ${result.letterLineCount   ?? matchedLines.length + mismatchLines.length + extraLines.length}`);
    out.push('');
    out.push(
        `  Matched : ${matchedLines.length}   ` +
        `Mismatch : ${mismatchLines.length}   ` +
        `Missing : ${missingLines.length}   ` +
        `Extra in Letter : ${extraLines.length}`
    );
    out.push('');

    return out.join('\n');
}

function lineValue(row, key) {
    return typeof row === 'string' ? row : row?.[key] || '';
}
