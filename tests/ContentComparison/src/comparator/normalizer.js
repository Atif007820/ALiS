// ============================================================
// NORMALIZER
// Text normalisation functions used before comparison.
// ============================================================

import {
    DYNAMIC_FIELD_PREFIXES,
    PLACEHOLDER_ONLY_PATTERNS,
    TEMPLATE_PLACEHOLDER_REGEXES,
    PLACEHOLDER_SENTINEL,
} from '../constants.js';

// ── Core normalisation ────────────────────────────────────

/** Canonical Unicode + punctuation normalisation (case-preserved). */
export function normalizeForCompare(line) {
    return String(line ?? '')
        .normalize('NFKC')
        .replace(/[\u00a0\u2000-\u200b\ufeff]/g, ' ')
        .replace(/[\u2018\u2019\u2032]/g, "'")
        .replace(/[\u201c\u201d\u2033]/g, '"')
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/\u00b1/g, '-')
        .replace(/\bP\s*\.?\s*O\s*\.?\b/gi, 'PO')
        .replace(/\bW\s*A\b/gi, 'WA')
        .replace(/\s*([,:;.)])\s*/g, '$1 ')
        .replace(/\s*([(])\s*/g, ' $1')
        .replace(/\s*-\s*/g, '-')
        .replace(/\s*\/\s*/g, '/')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Lower-case canonical normalisation. */
export function normalize(line) {
    return normalizeForCompare(line).toLowerCase();
}

/** Aggressive lower-case normalisation — strips most punctuation. */
export function normalizeLoose(line) {
    return normalizeForCompare(line)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/\bpo box\b/g, 'po box')
        .replace(/[^a-z0-9$]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Placeholder / dynamic-field helpers ───────────────────

/** True when a line starts with a known dynamic header prefix. */
export function isDynamicField(line) {
    const n = line.replace(/\s+/g, ' ').trim().toLowerCase();
    return DYNAMIC_FIELD_PREFIXES.some(p => n.startsWith(p));
}

/** True when a line consists entirely of placeholder text. */
export function isPlaceholderOnly(line) {
    const value = normalize(line).replace(/[.)]+$/g, '').trim();
    return (
        PLACEHOLDER_ONLY_PATTERNS.includes(value) ||
        /^\$?x[\dx,. ]+$/.test(value)             ||
        /^[a-z]*-?x{2,}(?:[- ]x{2,})*$/.test(value)
    );
}

/**
 * Replace every placeholder in `templateLine` with PLACEHOLDER_SENTINEL,
 * returning regex + static-word info used for wildcard matching.
 * Returns `null` if no placeholders were found.
 */
export function wildcardTemplateInfo(templateLine) {
    let value         = normalize(templateLine);
    let wildcardCount = 0;

    for (const pattern of TEMPLATE_PLACEHOLDER_REGEXES) {
        value = value.replace(pattern, () => { wildcardCount++; return PLACEHOLDER_SENTINEL; });
    }

    if (wildcardCount === 0) return null;

    const staticText  = value.replaceAll(PLACEHOLDER_SENTINEL, ' ');
    const staticWords = normalizeLoose(staticText).split(' ').filter(Boolean);
    const regexText   = value.split(PLACEHOLDER_SENTINEL).map(escapeRegExp).join('.*?');

    return {
        regex: new RegExp(`^${regexText}$`, 'i'),
        staticWords,
    };
}

/**
 * Heuristic to decide whether the value found for a placeholder line
 * looks like a genuine substituted value.
 */
export function placeholderValueMatches(templateLine, letterLine) {
    const template    = normalize(templateLine);
    const letter      = normalizeForCompare(letterLine);
    const letterLower = letter.toLowerCase();

    if (/date|month|year/.test(template)) {
        return /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(letter) ||
            /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:day\s+)?of\s+[a-z]+,\s+\d{4}\b/i.test(letter);
    }

    if (/address/.test(template)) {
        return /\d/.test(letter) &&
            /\b(?:st|street|ave|avenue|road|rd|way|blvd|drive|dr|lane|ln|sw|se|nw|ne|box)\b/i.test(letter);
    }

    if (/city|state|zip/.test(template)) {
        return /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(letter) ||
            /,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(letter);
    }

    if (/entity|business|name|agent|attorney|complainant/.test(template)) {
        if (!/[a-z]/i.test(letter)) return false;
        if (/\b(?:department|employment|standards|program|notice|assessment|citation|rcw|wac|order|payment)\b/i.test(letter)) {
            return false;
        }
        return letterLower.length <= 80;
    }

    return false;
}

// ── Utility ───────────────────────────────────────────────

export function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
