// ============================================================
// EXTRACTOR — Public API
// Routes extraction to the correct handler based on file type.
// ============================================================

import path from 'path';
import { extractDocxDocument } from './docxExtractor.js';
import { extractPdfDocument }  from './pdfExtractor.js';

/**
 * Extract text lines and metadata from a .docx or .pdf file.
 * @param {string} filePath - Absolute path to the document.
 * @returns {{ lines: string[], tables: object[], pdfPages: object[] }}
 */
export async function extractDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf')  return extractPdfDocument(filePath);
    if (ext === '.docx') return extractDocxDocument(filePath);
    throw new Error(`Unsupported file type: "${ext}". Expected .pdf or .docx`);
}

/**
 * Convenience wrapper — returns only the extracted lines array.
 */
export async function extractLines(filePath) {
    return (await extractDocument(filePath)).lines;
}
