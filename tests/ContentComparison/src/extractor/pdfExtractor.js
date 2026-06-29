// ============================================================
// PDF EXTRACTOR
// Extracts text lines and table-border geometry from PDFs.
// ============================================================

import fs   from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
    getDocument,
    GlobalWorkerOptions,
    OPS,
    VerbosityLevel,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
    buildFormatSignature,
    buildFormatSummary,
    reassembleBlocks,
} from '../helpers/textHelpers.js';
import {
    parsePdfPathSegments,
    normalizePdfSegment,
    findPdfTableComponents,
} from '../helpers/pdfHelpers.js';

// ── ESM __dirname for this module ─────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── pdfjs worker / font paths (relative to this file's location) ──
// This file lives at  src/extractor/pdfExtractor.js
// node_modules lives at  ../../node_modules  (project root)
const workerPath = path.resolve(
    __dirname,
    '../../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
);
const fontPath = path.resolve(
    __dirname,
    '../../node_modules/pdfjs-dist/standard_fonts'
);

// ── Startup guard: fail fast with a clear message if assets are missing ──
if (!fs.existsSync(workerPath)) {
    throw new Error(
        `[pdfjs] Worker not found:\n  ${workerPath}\n` +
        `Run "npm install" in the project root.`
    );
}
if (!fs.existsSync(fontPath)) {
    throw new Error(
        `[pdfjs] Standard fonts directory not found:\n  ${fontPath}\n` +
        `Run "npm install" in the project root.`
    );
}

GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

export const standardFontDataUrl = pathToFileURL(fontPath + path.sep).href;

function pdfRunStyle(item, styles = {}) {
    const font = styles[item.fontName] || {};
    const fontLabel = `${item.fontName || ''} ${font.fontFamily || ''}`.toLowerCase();

    return {
        bold: /\b(?:bold|black|heavy|demi|semibold)\b/i.test(fontLabel),
        italic: /\b(?:italic|oblique)\b/i.test(fontLabel),
        underline: false,
        highlight: '',
    };
}

function groupPdfTextBlocks(content, pageNumber) {
    const items = content.items
        .filter(item => item.str?.trim())
        .map(item => ({
            text: item.str.trim(),
            x: item.transform[4],
            y: item.transform[5],
            style: pdfRunStyle(item, content.styles),
        }))
        .sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);

    const groups = [];

    for (const item of items) {
        const last = groups[groups.length - 1];

        if (!last || Math.abs(last.y - item.y) > 2) {
            groups.push({ y: item.y, items: [item] });
        } else {
            last.items.push(item);
            last.y = (last.y * (last.items.length - 1) + item.y) / last.items.length;
        }
    }

    return groups
        .map((group, rowIndex) => {
            const runs = group.items
                .sort((a, b) => a.x - b.x)
                .flatMap((item, itemIndex) => [
                    ...(itemIndex > 0 ? [{ text: ' ', style: {} }] : []),
                    { text: item.text, style: item.style },
                ]);
            const text = runs.map(run => run.text).join('').replace(/\s+/g, ' ').trim();

            return {
                kind: 'paragraph',
                text,
                runs,
                pageNumber,
                y: group.y,
                location: `PDF page ${pageNumber}, row ${rowIndex + 1}`,
                formatSignature: buildFormatSignature(runs),
                formatSummary: buildFormatSummary(runs),
            };
        })
        .filter(block => block.text);
}

function multiplyMatrix(a, b) {
    return [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ];
}

function extractPdfObjectBlocks(operatorList, pageNumber) {
    const imageOps = new Set([
        OPS.paintImageXObject,
        OPS.paintJpegXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageMaskXObject,
        OPS.paintXObject,
    ].filter(Boolean));

    const blocks = [];
    const stack = [];
    let ctm = [1, 0, 0, 1, 0, 0];

    for (let opIdx = 0; opIdx < operatorList.fnArray.length; opIdx += 1) {
        const op = operatorList.fnArray[opIdx];
        const args = operatorList.argsArray[opIdx] || [];

        if (op === OPS.save) {
            stack.push([...ctm]);
        } else if (op === OPS.restore) {
            ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        } else if (op === OPS.transform) {
            ctm = multiplyMatrix(ctm, args);
        } else if (imageOps.has(op)) {
            const width = Math.round(Math.hypot(ctm[0], ctm[1]));
            const height = Math.round(Math.hypot(ctm[2], ctm[3]));
            blocks.push({
                kind: 'object',
                text: '[Object: image]',
                objectType: 'image',
                pageNumber,
                y: ctm[5],
                location: `PDF page ${pageNumber}, object ${blocks.length + 1}`,
                formatSignature: 'object:image',
                formatSummary: `object:image ${width || '?'}x${height || '?'}`,
            });
        }
    }

    return blocks;
}

// ── Public extractor ──────────────────────────────────────

/**
 * Extract ordered blocks, text lines, and per-page table-component data from a PDF.
 * Returns `{ blocks, lines, tables: [], pdfPages }`.
 */
export async function extractPdfDocument(filePath) {
    const uint8Array = new Uint8Array(fs.readFileSync(filePath));
    const pdf        = await getDocument({
        data: uint8Array,
        standardFontDataUrl,
        verbosity: VerbosityLevel.ERRORS,
    }).promise;

    const rawBlocks = [];
    const pdfPages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page      = await pdf.getPage(i);
        const content   = await page.getTextContent();
        const pageTextBlocks = groupPdfTextBlocks(content, i);

        const operatorList = await page.getOperatorList();
        const pageObjectBlocks = extractPdfObjectBlocks(operatorList, i);
        const segments     = [];

        for (let opIdx = 0; opIdx < operatorList.fnArray.length; opIdx++) {
            if (operatorList.fnArray[opIdx] !== OPS.constructPath) continue;

            for (const seg of parsePdfPathSegments(operatorList.argsArray[opIdx])) {
                const norm = normalizePdfSegment(seg);
                if (norm) segments.push(norm);
            }
        }

        pdfPages.push({
            pageNumber:      i,
            text:            pageTextBlocks.map(block => block.text).join(' '),
            tableComponents: findPdfTableComponents(segments, page.view),
        });

        rawBlocks.push(
            ...[...pageTextBlocks, ...pageObjectBlocks]
                .sort((a, b) => Math.abs((b.y ?? 0) - (a.y ?? 0)) > 2
                    ? (b.y ?? 0) - (a.y ?? 0)
                    : String(a.location).localeCompare(String(b.location)))
        );
    }

    const blocks = reassembleBlocks(rawBlocks);

    return {
        blocks,
        lines:    blocks.map(block => block.text),
        tables:   [],
        pdfPages,
    };
}
