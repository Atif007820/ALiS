// ============================================================
// SCORER
// Similarity metrics, span building, and best-span selection.
// ============================================================

import {
    MATCH_THRESHOLD,
    PARTIAL_THRESHOLD,
    PREFIX_THRESHOLD,
    MERGE_WINDOW,
} from '../constants.js';

import {
    normalizeLoose,
    wildcardTemplateInfo,
    normalize,
} from './normalizer.js';

// ── Similarity metrics ────────────────────────────────────

/** Sørensen–Dice coefficient over character bigrams. */
export function similarity(a, b) {
    a = normalizeLoose(a);
    b = normalizeLoose(b);
    if (a === b) return 1.0;
    if (a.length < 2 || b.length < 2) return 0.0;

    const bigrams = str => {
        const s = new Set();
        for (let i = 0; i < str.length - 1; i++) s.add(str.slice(i, i + 2));
        return s;
    };

    const setA  = bigrams(a);
    const setB  = bigrams(b);
    let   inter = 0;
    for (const g of setA) if (setB.has(g)) inter++;
    return (2 * inter) / (setA.size + setB.size);
}

/** Fraction of leading words shared between template and letter lines. */
export function sharedPrefixRatio(template, letter) {
    const w1 = normalizeLoose(template).split(' ').filter(Boolean);
    const w2 = normalizeLoose(letter).split(' ').filter(Boolean);
    if (w1.length === 0) return 0;

    let shared = 0;
    const min  = Math.min(w1.length, w2.length);
    for (let i = 0; i < min; i++) {
        if (w1[i] === w2[i]) shared++;
        else break;
    }
    return shared / w1.length;
}

/** Score based on placeholder wildcard matching. */
export function wildcardMatchScore(templateLine, letterLine) {
    const info = wildcardTemplateInfo(templateLine);
    if (!info || info.staticWords.length < 2) return 0;

    const letter = normalize(letterLine);
    if (info.regex.test(letter)) return 0.98;

    const letterLoose = normalizeLoose(letterLine);
    const hits        = info.staticWords.filter(w => letterLoose.includes(w)).length;
    return hits / info.staticWords.length >= 0.90 ? 0.90 : 0;
}

/** Score based on whether one string contains the other. */
export function containmentScore(templateLine, letterLine) {
    const t = normalizeLoose(templateLine);
    const l = normalizeLoose(letterLine);

    if (t.length < 12 || l.length < 12) return 0;
    if (l.includes(t))                   return t.length >= 20 ? 0.96 : 0.90;
    if (t.includes(l) && l.length >= 20) return 0.86;
    return 0;
}

/** Combine all metrics into one score object. */
export function compareScore(templateLine, letterLine) {
    const dice        = similarity(templateLine, letterLine);
    const prefix      = sharedPrefixRatio(templateLine, letterLine);
    const wildcard    = wildcardMatchScore(templateLine, letterLine);
    const containment = containmentScore(templateLine, letterLine);

    return {
        dice,
        prefix,
        wildcard,
        containment,
        score: Math.max(dice, prefix * 0.95, wildcard, containment),
    };
}

// ── Classification ────────────────────────────────────────

/** Classify a score-object as 'match' | 'mismatch' | 'missing'. */
export function classifyScore(metrics) {
    if (
        metrics.score       >= MATCH_THRESHOLD   ||
        metrics.prefix      >= PREFIX_THRESHOLD  ||
        metrics.wildcard    >= 0.90              ||
        metrics.containment >= 0.95
    ) return 'match';

    if (metrics.score >= PARTIAL_THRESHOLD) return 'mismatch';
    return 'missing';
}

// ── Span helpers ──────────────────────────────────────────

/**
 * Build every possible contiguous merged span of letter lines
 * up to MERGE_WINDOW length, for multi-line template matching.
 */
export function buildLetterSpans(lines) {
    const spans = [];

    for (let start = 0; start < lines.length; start++) {
        let text = '';

        for (let end = start; end < lines.length && end < start + MERGE_WINDOW; end++) {
            text = text ? `${text} ${lines[end]}` : lines[end];
            spans.push({
                text: text.trim(),
                idxs: Array.from({ length: end - start + 1 }, (_, off) => start + off),
                start,
                end,
            });
        }
    }

    return spans;
}

export function spanUsesAny(span, usedIdxs) {
    return span.idxs.some(idx => usedIdxs.has(idx));
}

/**
 * Find the span from `spans` that best matches `templateLine`,
 * with optional exclusion / soft-penalty sets.
 */
export function findBestSpan(templateLine, spans, options = {}) {
    let best = null;

    for (const span of spans) {
        if (options.excludeIdxs && spanUsesAny(span, options.excludeIdxs)) continue;

        const metrics = compareScore(templateLine, span.text);
        let   rank    = metrics.score - (span.idxs.length - 1) * 0.025;

        if (options.preferUnusedIdxs && spanUsesAny(span, options.preferUnusedIdxs)) {
            rank -= 0.08;
        }

        if (
            !best ||
            rank > best.rank ||
            (rank === best.rank && span.idxs.length < best.span.idxs.length)
        ) {
            best = { span, metrics, rank };
        }
    }

    return best;
}

// ── Mismatch quality filter ───────────────────────────────

function firstMeaningfulWord(line) {
    return normalizeLoose(line)
        .split(' ')
        .find(w => w.length > 2 && !['the', 'and', 'for', 'with', 'this', 'that'].includes(w)) || '';
}

/** True when a mismatch candidate is informative enough to report. */
export function isUsefulMismatchCandidate(templateLine, letterLine, metrics) {
    if (metrics.score < PARTIAL_THRESHOLD) return false;
    if (metrics.prefix > 0.25 || metrics.containment > 0 || metrics.wildcard > 0) return true;
    return firstMeaningfulWord(templateLine) === firstMeaningfulWord(letterLine);
}
