// ============================================================
// TEST — CompareContent.spec.js
// Compares FILE_2 (letter/output) against FILE_1 (template).
// Results are attached to the Playwright HTML report.
// ============================================================

import fs                         from 'fs';
import path                       from 'path';
import { fileURLToPath }          from 'url';
import { test }                   from '@playwright/test';

import { FILE_1, FILE_2 }         from './fileConfig.js';
import { extractDocument }        from './src/extractor/index.js';
import { compareDocuments,
         compareTableBorders }    from './src/comparator/index.js';
import { buildReport,
         attachAnnotations,
         writeExcelReport,
         writeHtmlReport }        from './src/reporter/index.js';
import runSettings                from './config/runSettings.json' with { type: 'json' };
import { logger }                 from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ============================================================

test('Compare Content', async ({}, testInfo) => {

    // ── Resolve file paths ────────────────────────────────
    const file1Path = path.resolve(__dirname, 'Documents', FILE_1);
    const file2Path = path.resolve(__dirname, 'Documents', FILE_2);

    if (!fs.existsSync(file1Path))
        throw new Error(`FILE 1 not found: ${FILE_1}\nCheck FILE_1 in fileConfig.js`);
    if (!fs.existsSync(file2Path))
        throw new Error(`FILE 2 not found: ${FILE_2}\nCheck FILE_2 in fileConfig.js`);

    const file1Name = path.basename(file1Path);
    const file2Name = path.basename(file2Path);

    // ── Extract ───────────────────────────────────────────
    logger.section('Extracting documents');
    logger.info(`Template : ${file1Name}`);
    logger.info(`Letter   : ${file2Name}`);

    const [templateDoc, letterDoc] = await Promise.all([
        extractDocument(file1Path),
        extractDocument(file2Path),
    ]);

    const lines1 = templateDoc.lines;
    const lines2 = letterDoc.lines;

    logger.info(`Template lines extracted : ${lines1.length}`);
    logger.info(`Letter lines extracted   : ${lines2.length}`);

    // ── Compare ───────────────────────────────────────────
    logger.section('Comparing documents');

    const result = {
        ...compareDocuments(templateDoc, letterDoc),
        tableBorders: compareTableBorders(templateDoc, letterDoc),
    };

    logger.summary({
        matched:  result.matchedLines.length,
        mismatch: result.mismatchLines.length,
        missing:  result.missingLines.length,
        extra:    result.extraLines.length,
    });

    // ── Report ────────────────────────────────────────────
    const report = buildReport(file1Name, file2Name, result);
    await attachAnnotations(testInfo, result, lines1, lines2, file2Name, report);
    const excelPath = await writeExcelReport({ file1Name, file2Name, result, lines1, lines2 });
    const htmlPath = await writeHtmlReport({ file1Name, file2Name, result, lines1, lines2 });

    if (runSettings.reports.attachExcel) {
        await testInfo.attach('Content Comparison Excel Report', {
            path: excelPath,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
    }

    if (runSettings.reports.attachHtml) {
        await testInfo.attach('Content Comparison HTML Report', {
            path: htmlPath,
            contentType: 'text/html',
        });
    }

    // Test always passes — detailed results live in the annotations above.
});
