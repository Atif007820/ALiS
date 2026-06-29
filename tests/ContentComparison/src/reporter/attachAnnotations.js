// ============================================================
// ATTACH ANNOTATIONS
// Attaches all comparison sections to the Playwright test report.
// ============================================================

import { wrapText } from '../helpers/textHelpers.js';

const LABEL_T = 'TEMPLATE';
const LABEL_L = 'LETTER'.padEnd(LABEL_T.length);

/**
 * Attach extracted lines, full report, and categorised result sections
 * to the Playwright TestInfo object so they appear in the HTML report.
 *
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {{ matchedLines, mismatchLines, missingLines, extraLines }} result
 * @param {string[]} lines1    - Template lines
 * @param {string[]} lines2    - Letter lines
 * @param {string}   file2Name - Base name of FILE_2
 * @param {string}   report    - Pre-built full report string
 */
export async function attachAnnotations(testInfo, result, lines1, lines2, file2Name, report) {

    // ── Raw extracted lines ───────────────────────────────
    await testInfo.attach('Template lines (FILE 1)', {
        body:        lines1.map((l, i) => `${i + 1}. ${l}`).join('\n'),
        contentType: 'text/plain',
    });

    await testInfo.attach('Letter lines (FILE 2)', {
        body:        lines2.map((l, i) => `${i + 1}. ${l}`).join('\n'),
        contentType: 'text/plain',
    });

    // ── Full report ───────────────────────────────────────
    await testInfo.attach('Full Comparison Text Report', {
        body:        report,
        contentType: 'text/plain',
    });

    // ── Section 1: Matching ───────────────────────────────
    await testInfo.attach(`MATCHING IN LETTER (${result.matchedLines.length})`, {
        body: result.matchedLines.length > 0
            ? result.matchedLines.map(({ letter }, i) =>
                wrapText(`${String(i + 1).padStart(2)}.  `, letter)
              ).join('\n')
            : 'None',
        contentType: 'text/plain',
    });

    // ── Section 2: Mismatch / Missing ────────────────────
    const mismatchBody = [];
    let counter = 1;

    if (result.mismatchLines.length > 0) {
        mismatchBody.push('— Content differs from template —\n');
        result.mismatchLines.forEach(({ template, letter, details }) => {
            const num  = `${String(counter++).padStart(2)}.`;
            const tPfx = `${num}  ${LABEL_T} :  `;
            const lPfx = `${' '.repeat(num.length)}  ${LABEL_L} :  `;
            mismatchBody.push(wrapText(tPfx, template));
            mismatchBody.push(wrapText(lPfx, letter));
            if (details) mismatchBody.push(wrapText(`${' '.repeat(num.length)}  DETAILS :  `, details));
            mismatchBody.push('');
        });
    }

    if (result.missingLines.length > 0) {
        mismatchBody.push('— Present in template but missing in letter —\n');
        result.missingLines.forEach(row => {
            const num = `${String(counter++).padStart(2)}.`;
            mismatchBody.push(wrapText(`${num}  `, lineValue(row, 'template')));
            if (row.details) mismatchBody.push(wrapText(`${' '.repeat(num.length)}  DETAILS :  `, row.details));
        });
    }

    const totalIssues = result.mismatchLines.length + result.missingLines.length;
    await testInfo.attach(`MISMATCH / MISSING IN LETTER (${totalIssues})`, {
        body:        mismatchBody.length > 0 ? mismatchBody.join('\n') : 'None',
        contentType: 'text/plain',
    });

    // ── Section 3: Extra ──────────────────────────────────
    await testInfo.attach(`EXTRA IN LETTER - ${file2Name} (${result.extraLines.length})`, {
        body: result.extraLines.length > 0
            ? result.extraLines.map((row, i) => {
                const num = `${String(i + 1).padStart(2)}.`;
                const lines = [wrapText(`${num}  `, lineValue(row, 'letter'))];
                if (row.details) lines.push(wrapText(`${' '.repeat(num.length)}  DETAILS :  `, row.details));
                return lines.join('\n');
              }).join('\n')
            : 'None',
        contentType: 'text/plain',
    });
}

function lineValue(row, key) {
    return typeof row === 'string' ? row : row?.[key] || '';
}
