// ============================================================
// TEXT HELPERS
// Sentence reassembly and plain-text formatting utilities.
// ============================================================

import { WRAP_WIDTH } from '../constants.js';

/**
 * Merge raw lines (which may be split mid-sentence by the PDF/DOCX extractor)
 * back into logical sentences based on punctuation and capitalisation heuristics.
 */
export function reassembleSentences(rawLines) {
    const result = [];
    let   buffer = '';

    const isHardEnd   = l => /[.!?]$/.test(l.trim());
    const isSoftEnd   = l => /[,;:]$/.test(l.trim());
    const startsUpper = l => /^[A-Z0-9(]/.test(l.trim());

    for (let i = 0; i < rawLines.length; i++) {
        const line     = rawLines[i].trim();
        const nextLine = rawLines[i + 1]?.trim() ?? '';

        if (!line) continue;

        buffer = buffer ? `${buffer} ${line}` : line;

        if (isHardEnd(line)) {
            result.push(buffer.trim());
            buffer = '';
        } else if (!isSoftEnd(line) && startsUpper(nextLine) && buffer.length > 0) {
            result.push(buffer.trim());
            buffer = '';
        }
    }

    if (buffer.trim()) result.push(buffer.trim());
    return result;
}

/**
 * Same idea as `reassembleSentences`, but preserves block metadata and
 * formatting runs while merging visual PDF rows into human-readable blocks.
 */
export function reassembleBlocks(rawBlocks) {
    const result = [];
    let buffer = null;

    const isHardEnd = block => /[.!?]$/.test(String(block.text || '').trim());
    const isSoftEnd = block => /[,;:]$/.test(String(block.text || '').trim());
    const startsUpper = block => /^[A-Z0-9(]/.test(String(block?.text || '').trim());

    const flush = () => {
        if (!buffer) return;
        buffer.text = buffer.text.replace(/\s+/g, ' ').trim();
        buffer.formatSignature = buildFormatSignature(buffer.runs || []);
        buffer.formatSummary = buildFormatSummary(buffer.runs || []);
        result.push(buffer);
        buffer = null;
    };

    const mergeTextBlock = (block) => {
        if (!buffer) {
            buffer = {
                ...block,
                text: String(block.text || '').trim(),
                runs: [...(block.runs || [])],
                sourceLocations: [block.location].filter(Boolean),
            };
            return;
        }

        buffer.text = `${buffer.text} ${String(block.text || '').trim()}`.trim();
        buffer.runs.push({ text: ' ', style: {} }, ...(block.runs || []));
        if (block.location) buffer.sourceLocations.push(block.location);
        buffer.location = `${buffer.sourceLocations[0]} - ${block.location}`;
    };

    for (let i = 0; i < rawBlocks.length; i += 1) {
        const block = rawBlocks[i];
        if (!block?.text) continue;

        if (block.kind !== 'paragraph') {
            flush();
            result.push(block);
            continue;
        }

        mergeTextBlock(block);

        const next = rawBlocks[i + 1];
        if (isHardEnd(block) || (!isSoftEnd(block) && startsUpper(next))) {
            flush();
        }
    }

    flush();
    return result;
}

export function buildFormatSignature(runs = []) {
    return runs
        .map((run) => ({
            text: String(run.text || '').replace(/\s+/g, ' ').trim(),
            style: run.style || {},
        }))
        .filter((run) => run.text && hasVisibleStyle(run.style))
        .map((run) => `${run.text}{${styleKey(run.style)}}`)
        .join('|');
}

export function buildFormatSummary(runs = []) {
    const styles = new Set(
        runs
            .map((run) => run.style || {})
            .filter(hasVisibleStyle)
            .map(styleKey)
    );

    return styles.size ? [...styles].join('; ') : 'default text formatting';
}

function hasVisibleStyle(style = {}) {
    return Boolean(style.bold || style.italic || style.underline || style.highlight);
}

function styleKey(style = {}) {
    return [
        style.bold ? 'bold' : '',
        style.italic ? 'italic' : '',
        style.underline ? 'underline' : '',
        style.highlight ? `highlight:${style.highlight}` : '',
    ].filter(Boolean).join('+') || 'default';
}

/**
 * Wrap long text at `WRAP_WIDTH` columns, indenting continuation lines to
 * align with the start of the text after the prefix.
 */
export function wrapText(prefix, text) {
    const indent    = ' '.repeat(prefix.length);
    const available = WRAP_WIDTH - prefix.length;

    if (!text || text.length <= available) return `${prefix}${text}`;

    const words  = text.split(' ');
    const lines  = [];
    let   current = '';

    for (const word of words) {
        if (current && (current + ' ' + word).length > available) {
            lines.push(current);
            current = word;
        } else {
            current = current ? `${current} ${word}` : word;
        }
    }

    if (current) lines.push(current);

    return lines
        .map((l, i) => (i === 0 ? `${prefix}${l}` : `${indent}${l}`))
        .join('\n');
}
