// ============================================================
// CONSTANTS
// All shared constants in one place.
// ============================================================

import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

// ── Comparison thresholds ──────────────────────────────────
export const MATCH_THRESHOLD   = 0.88;
export const PARTIAL_THRESHOLD = 0.40;
export const PREFIX_THRESHOLD  = 0.65;
export const MERGE_WINDOW      = 6;
export const WRAP_WIDTH        = 100;

// ── DOCX namespace ────────────────────────────────────────
export const WORD_NS      = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const BORDER_SIDES = new Set(['top', 'left', 'bottom', 'right', 'insideH', 'insideV']);

// ── PDF paint operations that produce visible lines ───────
export const VISIBLE_PDF_PAINT_OPS = new Set([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
]);

// ── Placeholder sentinel (used during regex substitution) ─
export const PLACEHOLDER_SENTINEL = '\u0001';

// ── Dynamic field prefixes (header-like lines that vary) ──
export const DYNAMIC_FIELD_PREFIXES = [
    'date letter generated',
    'claimant first and last name',
    'claimant address',
    'city, state, zip',
    'city,',
    'case no',
    'dear',
    'subject',
    'to:',
    'from:',
    're:',
    'date:',
    'name:',
    'address:',
    'phone:',
    'email:',
];

// ── Lines that are purely placeholder text in the template ─
export const PLACEHOLDER_ONLY_PATTERNS = [
    'date letter generated',
    'company entity/dba',
    'company entity name',
    'company business name',
    'company address',
    'company address, unit',
    'company city, state zip',
    'city, state, zip',
    'city, state zip code',
    'address',
    'address )',
    'complainant first and last name',
    'complainant address, unit',
    'complainant city, state zip',
    'registered agent name',
    'registered agent company',
    'registered agent address',
    'registered agent city, state, zip',
    'company attorney name',
    'company attorney address, unit',
    'company attorney city, state zip',
    'complainant attorney name',
    'complainant attorney address, unit',
    'complainant attorney city, state zip',
];

// ── Regex patterns that identify placeholder text ─────────
export const TEMPLATE_PLACEHOLDER_REGEXES = [
    /\[[^\]]+\]/g,
    /\b(?:audit start date|audit end date|generate letter date|date letter generated)\b/g,
    /\b(?:company entity\/dba|company entity name|company business name)\b/g,
    /\b(?:company address(?:, unit)?|company city, state zip|city, state, zip(?: code)?|address)\b/g,
    /\b(?:complainant first and last name|complainant address, unit|complainant city, state zip)\b/g,
    /\b(?:registered agent name|registered agent company|registered agent address|registered agent city, state, zip)\b/g,
    /\b(?:company attorney name|company attorney address, unit|company attorney city, state zip)\b/g,
    /\b(?:complainant attorney name|complainant attorney address, unit|complainant attorney city, state zip)\b/g,
    /\b(?:agent name)\b/g,
    /\$x[\dx,.]*/g,
    /\b[a-z]*-?x{2,}(?:[- ]x{2,})*\b/g,
    /\bx{2,}(?:[ .,-]x{2,})*\b/g,
    /\b\d+\s*(?:st|nd|rd|th)?\s+of\s+[a-z]+,\s+\d{4}\b/g,
];
