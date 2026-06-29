// ============================================================
// DOCX EXTRACTOR
// Extracts text lines and table metadata from .docx files.
// Falls back to mammoth if direct XML parsing fails.
// ============================================================

import fs               from 'fs';
import mammoth          from 'mammoth';
import JSZip            from 'jszip';
import { DOMParser }    from '@xmldom/xmldom';

import { BORDER_SIDES } from '../constants.js';
import {
    xmlLocalName,
    xmlChildren,
    xmlFirst,
    xmlDescendants,
    xmlAttr,
    xmlText,
}                       from '../helpers/xmlHelpers.js';
import {
    buildFormatSignature,
    buildFormatSummary,
    reassembleSentences,
} from '../helpers/textHelpers.js';

// ── Border helpers ────────────────────────────────────────

function borderState(borderNode) {
    if (!borderNode) return null;

    let defined = false;
    let visible  = false;

    for (const side of xmlChildren(borderNode)) {
        if (!BORDER_SIDES.has(xmlLocalName(side))) continue;

        defined = true;
        const value = (xmlAttr(side, 'val') || 'single').toLowerCase();
        if (value && value !== 'none' && value !== 'nil') visible = true;
    }

    return defined ? { visible } : null;
}

function collectTableStyleBorders(stylesXml) {
    const styleBorders = new Map();
    if (!stylesXml) return styleBorders;

    const stylesDoc = new DOMParser().parseFromString(stylesXml, 'application/xml');

    for (const style of xmlDescendants(stylesDoc, 'style')) {
        if (xmlAttr(style, 'type') !== 'table') continue;

        const styleId = xmlAttr(style, 'styleId');
        const tblPr   = xmlFirst(style, 'tblPr');
        const state   = borderState(xmlFirst(tblPr, 'tblBorders'));
        if (styleId && state) styleBorders.set(styleId, state.visible);
    }

    return styleBorders;
}

function tableHasVisibleBorders(tbl, styleBorders) {
    const tblPr       = xmlFirst(tbl, 'tblPr');
    const directState = borderState(xmlFirst(tblPr, 'tblBorders'));
    if (directState) return directState.visible;

    for (const tc of xmlDescendants(tbl, 'tc')) {
        const tcState = borderState(xmlFirst(xmlFirst(tc, 'tcPr'), 'tcBorders'));
        if (tcState?.visible) return true;
    }

    const styleId = xmlAttr(xmlFirst(tblPr, 'tblStyle'), 'val');
    return Boolean(styleId && styleBorders.get(styleId));
}

// ── Table summarisation ───────────────────────────────────

function summarizeDocxTable(tbl, tableNumber, styleBorders) {
    const rows = [];

    for (const tr of xmlChildren(tbl, 'tr')) {
        const cells   = xmlChildren(tr, 'tc').map(cell => xmlText(cell)).filter(Boolean);
        const rowText = cells.join(' ').replace(/\s+/g, ' ').trim();
        if (rowText && /[A-Za-z0-9$]/.test(rowText)) rows.push(rowText);
    }

    const columnCount = rows.reduce((max, _, rowIndex) => {
        const tr = xmlChildren(tbl, 'tr')[rowIndex];
        return Math.max(max, xmlChildren(tr, 'tc').length);
    }, 0);

    return {
        tableNumber,
        rows,
        text: rows.join(' '),
        rowCount: rows.length,
        columnCount,
        hasVisibleBorders: tableHasVisibleBorders(tbl, styleBorders),
    };
}

// ── Text / formatting helpers ─────────────────────────────────────────

function valIsOff(node) {
    const value = String(xmlAttr(node, 'val') || '').toLowerCase();
    return ['0', 'false', 'off', 'none', 'nil'].includes(value);
}

function hasRunFlag(rPr, name) {
    const node = xmlFirst(rPr, name);
    return Boolean(node && !valIsOff(node));
}

function runStyle(r) {
    const rPr = xmlFirst(r, 'rPr');
    if (!rPr) return {};

    const highlight = xmlAttr(xmlFirst(rPr, 'highlight'), 'val');

    return {
        bold: hasRunFlag(rPr, 'b'),
        italic: hasRunFlag(rPr, 'i'),
        underline: Boolean(xmlFirst(rPr, 'u') && !valIsOff(xmlFirst(rPr, 'u'))),
        highlight: highlight && highlight.toLowerCase() !== 'none' ? highlight : '',
    };
}

function runText(r) {
    const parts = [];

    function visit(current) {
        if (current.nodeType === 1) {
            const name = xmlLocalName(current);
            if (name === 't') parts.push(current.textContent);
            else if (name === 'tab' || name === 'br') parts.push(' ');
        }

        for (let child = current.firstChild; child; child = child.nextSibling) {
            visit(child);
        }
    }

    visit(r);
    return parts.join('').replace(/\s+/g, ' ');
}

function runHasObject(r) {
    return xmlDescendants(r, 'drawing').length > 0 ||
        xmlDescendants(r, 'pict').length > 0 ||
        xmlDescendants(r, 'object').length > 0 ||
        xmlDescendants(r, 'OLEObject').length > 0;
}

function objectType(r) {
    if (xmlDescendants(r, 'blip').length > 0) return 'image';
    if (xmlDescendants(r, 'pict').length > 0) return 'picture';
    if (xmlDescendants(r, 'OLEObject').length > 0) return 'ole-object';
    return 'drawing';
}

function makeTextBlock({ kind, runs, location, tableNumber = null, rowNumber = null }) {
    const text = runs.map(run => run.text).join('').replace(/\s+/g, ' ').trim();
    if (!text) return null;

    return {
        kind,
        text,
        runs,
        location,
        tableNumber,
        rowNumber,
        formatSignature: buildFormatSignature(runs),
        formatSummary: buildFormatSummary(runs),
    };
}

function makeObjectBlock({ type, location }) {
    return {
        kind: 'object',
        text: `[Object: ${type}]`,
        objectType: type,
        location,
        formatSignature: `object:${type}`,
        formatSummary: `object:${type}`,
    };
}

function appendRun(r, runs, blocks, location) {
    if (runHasObject(r)) {
        const pending = makeTextBlock({ kind: 'paragraph', runs, location });
        if (pending) blocks.push(pending);
        runs.length = 0;
        blocks.push(makeObjectBlock({ type: objectType(r), location }));
        return;
    }

    const text = runText(r);
    if (text.trim()) {
        runs.push({ text, style: runStyle(r) });
    }
}

function appendRunsFromContainer(container, runs, blocks, location) {
    for (const child of xmlChildren(container)) {
        const name = xmlLocalName(child);
        if (name === 'r') {
            appendRun(child, runs, blocks, location);
        } else if (name === 'hyperlink' || name === 'smartTag' || name === 'sdt') {
            appendRunsFromContainer(child, runs, blocks, location);
        }
    }
}

function extractParagraphBlocks(p, location) {
    const blocks = [];
    const runs = [];
    appendRunsFromContainer(p, runs, blocks, location);
    const pending = makeTextBlock({ kind: 'paragraph', runs, location });
    if (pending) blocks.push(pending);
    return blocks;
}

function extractRunsFromNode(node) {
    const runs = [];
    for (const r of xmlDescendants(node, 'r')) {
        if (runHasObject(r)) continue;
        const text = runText(r);
        if (text.trim()) runs.push({ text, style: runStyle(r) });
    }
    return runs;
}

function tableRowBlock(tr, tableNumber, rowNumber) {
    const cellRuns = xmlChildren(tr, 'tc').map((cell, cellIndex) => {
        const runs = extractRunsFromNode(cell);
        if (cellIndex > 0 && runs.length > 0) {
            return [{ text: ' ', style: {} }, ...runs];
        }
        return runs;
    }).flat();

    return makeTextBlock({
        kind: 'table-row',
        runs: cellRuns,
        location: `Table ${tableNumber}, row ${rowNumber}`,
        tableNumber,
        rowNumber,
    });
}

function tableObjectBlocks(tbl, tableNumber) {
    const blocks = [];
    let objectCount = 0;

    for (const r of xmlDescendants(tbl, 'r')) {
        if (!runHasObject(r)) continue;
        objectCount += 1;
        blocks.push(makeObjectBlock({
            type: objectType(r),
            location: `Table ${tableNumber}, object ${objectCount}`,
        }));
    }

    return blocks;
}

// ── Public extractor ──────────────────────────────────────

/**
 * Extract ordered blocks, text lines, and table metadata from a .docx file.
 * Returns `{ blocks, lines, tables, pdfPages: [] }`.
 */
export async function extractDocxDocument(filePath) {
    try {
        const zip         = await JSZip.loadAsync(fs.readFileSync(filePath));
        const documentXml = await zip.file('word/document.xml')?.async('text');
        if (!documentXml) throw new Error('word/document.xml not found in archive');

        const stylesXml    = await zip.file('word/styles.xml')?.async('text');
        const styleBorders = collectTableStyleBorders(stylesXml);
        const document     = new DOMParser().parseFromString(documentXml, 'application/xml');
        const body         = xmlDescendants(document, 'body')[0];

        const blocks = [];
        const tables = [];
        let paragraphNumber = 0;

        for (const child of xmlChildren(body)) {
            const name = xmlLocalName(child);

            if (name === 'p') {
                paragraphNumber += 1;
                blocks.push(...extractParagraphBlocks(child, `Paragraph ${paragraphNumber}`));
                continue;
            }

            if (name === 'tbl') {
                const table = summarizeDocxTable(child, tables.length + 1, styleBorders);
                tables.push(table);
                xmlChildren(child, 'tr').forEach((tr, rowIndex) => {
                    const block = tableRowBlock(tr, table.tableNumber, rowIndex + 1);
                    if (block) blocks.push(block);
                });
                blocks.push(...tableObjectBlocks(child, table.tableNumber));
            }
        }

        return {
            blocks,
            lines: blocks.map(block => block.text),
            tables,
            pdfPages: [],
        };

    } catch {
        // Fallback: mammoth raw-text extraction
        const result   = await mammoth.extractRawText({ path: filePath });
        const rawLines = result.value.split('\n').map(l => l.trim()).filter(Boolean);
        const lines = reassembleSentences(rawLines);
        return {
            blocks: lines.map((line, index) => ({
                kind: 'paragraph',
                text: line,
                runs: [{ text: line, style: {} }],
                location: `Fallback line ${index + 1}`,
                formatSignature: '',
                formatSummary: 'default text formatting',
            })),
            lines,
            tables: [],
            pdfPages: [],
        };
    }
}
