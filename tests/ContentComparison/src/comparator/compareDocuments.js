import { normalizeForCompare, normalizeLoose } from './normalizer.js';

function strictText(value) {
    return normalizeForCompare(value);
}

function looseText(value) {
    return normalizeLoose(value);
}

function visibleText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .replace(/[\u00a0\u2000-\u200b\ufeff]/g, ' ')
        .replace(/[\u2018\u2019\u2032]/g, "'")
        .replace(/[\u201c\u201d\u2033]/g, '"')
        .replace(/[\u2010-\u2015]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function blockText(block) {
    return String(block?.text ?? '').replace(/\s+/g, ' ').trim();
}

function toBlocks(input, label) {
    if (Array.isArray(input)) {
        return input
            .map((text, index) => ({
                kind: 'paragraph',
                text,
                runs: [{ text, style: {} }],
                location: `${label} line ${index + 1}`,
                formatSignature: '',
                formatSummary: 'default text formatting',
            }))
            .filter(block => blockText(block));
    }

    const source = input?.blocks?.length ? input.blocks : input?.lines?.map((text, index) => ({
        kind: 'paragraph',
        text,
        runs: [{ text, style: {} }],
        location: `${label} line ${index + 1}`,
        formatSignature: '',
        formatSummary: 'default text formatting',
    }));

    return (source || []).filter(block => blockText(block));
}

function exactBlockMatch(expected, actual) {
    return compatibleBlockKind(expected, actual) &&
        visibleText(blockText(expected)) === visibleText(blockText(actual));
}

function comparableBlocks(expected, actual) {
    if (expected.kind === 'object' || actual.kind === 'object') {
        return expected.kind === actual.kind;
    }

    const expectedText = blockText(expected);
    const actualText = blockText(actual);
    if (!expectedText || !actualText) return false;

    if (strictText(expectedText).toLowerCase() === strictText(actualText).toLowerCase()) return true;
    if (looseText(expectedText) === looseText(actualText)) return true;

    const similarity = textSimilarity(expectedText, actualText);
    const overlap = tokenOverlap(expectedText, actualText);
    return similarity >= 0.58 || overlap >= 0.5;
}

function alignmentCost(expected, actual) {
    if (exactBlockMatch(expected, actual)) return 0;
    if (!comparableBlocks(expected, actual)) return Infinity;

    const sameText = visibleText(blockText(expected)) === visibleText(blockText(actual));
    const sameTextIgnoringCase = visibleText(blockText(expected)).toLowerCase() === visibleText(blockText(actual)).toLowerCase();
    const textIssue = classifyTextDifference(blockText(expected), blockText(actual));

    if (sameText) return 0.3;
    if (sameTextIgnoringCase) return 0.45;
    if (textIssue === 'spacing' || textIssue === 'punctuation') return 0.35;
    if (expected.kind === 'object' || actual.kind === 'object') return 0.7;
    return 0.75;
}

function alignBlocks(expectedBlocks, actualBlocks) {
    const n = expectedBlocks.length;
    const m = actualBlocks.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    const action = Array.from({ length: n + 1 }, () => Array(m + 1).fill(null));

    for (let i = n - 1; i >= 0; i -= 1) {
        dp[i][m] = dp[i + 1][m] + 1;
        action[i][m] = 'missing';
    }

    for (let j = m - 1; j >= 0; j -= 1) {
        dp[n][j] = dp[n][j + 1] + 1;
        action[n][j] = 'extra';
    }

    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            const pairCost = alignmentCost(expectedBlocks[i], actualBlocks[j]);
            const options = [
                { type: 'missing', cost: 1 + dp[i + 1][j] },
                { type: 'extra', cost: 1 + dp[i][j + 1] },
            ];

            if (Number.isFinite(pairCost)) {
                options.push({
                    type: pairCost === 0 ? 'match' : 'mismatch',
                    cost: pairCost + dp[i + 1][j + 1],
                });
            }

            options.sort((a, b) => a.cost - b.cost || actionPriority(a.type) - actionPriority(b.type));
            dp[i][j] = options[0].cost;
            action[i][j] = options[0].type;
        }
    }

    const steps = [];
    let i = 0;
    let j = 0;

    while (i < n || j < m) {
        const type = action[i][j];

        if (type === 'match' || type === 'mismatch') {
            steps.push({ type, expected: expectedBlocks[i], actual: actualBlocks[j] });
            i += 1;
            j += 1;
        } else if (type === 'missing') {
            steps.push({ type, expected: expectedBlocks[i], actual: null });
            i += 1;
        } else {
            steps.push({ type: 'extra', expected: null, actual: actualBlocks[j] });
            j += 1;
        }
    }

    return steps;
}

function actionPriority(type) {
    return { match: 0, mismatch: 1, missing: 2, extra: 3 }[type] ?? 9;
}

function textSimilarity(a, b) {
    const left = strictText(a);
    const right = strictText(b);
    if (!left && !right) return 1;
    if (!left || !right) return 0;

    const distance = levenshtein(left, right);
    return 1 - (distance / Math.max(left.length, right.length));
}

function levenshtein(a, b) {
    const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
    const curr = Array(b.length + 1).fill(0);

    for (let i = 1; i <= a.length; i += 1) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost,
            );
        }
        for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
    }

    return prev[b.length];
}

function tokenOverlap(a, b) {
    const left = new Set(significantTokens(a));
    const right = new Set(significantTokens(b));
    if (!left.size || !right.size) return 0;

    let hits = 0;
    for (const token of left) if (right.has(token)) hits += 1;
    return hits / Math.max(left.size, right.size);
}

function blockDetails(expected, actual, message) {
    const parts = [message];

    if (expected) {
        parts.push(`Expected ${blockLabel(expected)}.`);
    }

    if (actual) {
        parts.push(`Actual ${blockLabel(actual)}.`);
    }

    return parts.join(' ');
}

function blockLabel(block) {
    return `${block.kind || 'block'}${block.location ? ` (${block.location})` : ''}`;
}

function describeDifference(expected, actual) {
    const reasons = [];
    const expectedText = blockText(expected);
    const actualText = blockText(actual);
    const textIssue = classifyTextDifference(expectedText, actualText);

    if (textIssue === 'spacing') {
        reasons.push('Spacing issue: expected and actual text differ only by spacing.');
    } else if (textIssue === 'punctuation') {
        reasons.push('Punctuation issue: expected and actual text differ only by punctuation or special characters.');
    } else if (textIssue === 'text') {
        reasons.push('Text difference: expected text/content does not match actual text/content.');
    }

    if (reasons.length === 0) {
        reasons.push('Blocks aligned but are not an exact match.');
    }

    return `${reasons.join(' ')} ${blockDetails(expected, actual, '').trim()}`.trim();
}

function compatibleBlockKind(expected, actual) {
    if (expected.kind === 'object' || actual.kind === 'object') {
        return expected.kind === actual.kind;
    }

    return true;
}

function classifyTextDifference(expectedText, actualText) {
    const expected = visibleText(expectedText);
    const actual = visibleText(actualText);

    if (expected === actual) {
        return null;
    }

    if (expected.replace(/\s+/g, '') === actual.replace(/\s+/g, '')) {
        return 'spacing';
    }

    if (
        removePunctuation(expected) === removePunctuation(actual) ||
        removeSpacingAndPunctuation(expected) === removeSpacingAndPunctuation(actual)
    ) {
        return 'punctuation';
    }

    return 'text';
}

function removePunctuation(value) {
    return visibleText(value)
        .replace(/[^A-Za-z0-9\s]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function removeSpacingAndPunctuation(value) {
    return visibleText(value)
        .replace(/[^A-Za-z0-9]+/g, '');
}

function describeTextDifferenceColumn(expectedText, actualText) {
    const expected = visibleText(expectedText);
    const actual = visibleText(actualText);
    const textIssue = classifyTextDifference(expected, actual);

    if (!textIssue) {
        return '';
    }

    return actualDiffSummary(expected, actual);
}

function actualDiffSummary(expected, actual) {
    const expectedTokens = tokenizeForDiff(expected);
    const actualTokens = tokenizeForDiff(actual);
    const dp = Array.from({ length: expectedTokens.length + 1 }, () => Array(actualTokens.length + 1).fill(0));

    for (let i = expectedTokens.length - 1; i >= 0; i -= 1) {
        for (let j = actualTokens.length - 1; j >= 0; j -= 1) {
            if (expectedTokens[i] === actualTokens[j]) {
                dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    const actualDifferences = [];
    let pendingMissing = [];
    let pendingExtra = [];
    let i = 0;
    let j = 0;

    const flush = () => {
        if (pendingExtra.length) {
            actualDifferences.push(compactSegment(pendingExtra));
        }

        pendingMissing = [];
        pendingExtra = [];
    };

    while (i < expectedTokens.length || j < actualTokens.length) {
        if (i < expectedTokens.length && j < actualTokens.length && expectedTokens[i] === actualTokens[j]) {
            flush();
            i += 1;
            j += 1;
        } else if (j < actualTokens.length && (i === expectedTokens.length || dp[i][j + 1] >= dp[i + 1][j])) {
            pendingExtra.push(actualTokens[j]);
            j += 1;
        } else if (i < expectedTokens.length) {
            pendingMissing.push(expectedTokens[i]);
            i += 1;
        }
    }

    flush();

    return limitSegments(actualDifferences).join(' | ');
}

function tokenizeForDiff(value) {
    return visibleText(value).match(/\S+/g) || [];
}

function compactSegment(tokens) {
    return tokens.join(' ').replace(/\s+/g, ' ').trim();
}

function limitSegments(segments, limit = 5) {
    const clean = segments.filter(Boolean);
    if (clean.length <= limit) {
        return clean;
    }

    return [...clean.slice(0, limit), `... ${clean.length - limit} more`];
}

/**
 * Ordered human-style comparison of expected blocks against actual blocks.
 * A block is matched only when type, full text, order, and formatting/object
 * signature are exactly the same after whitespace-safe extraction cleanup.
 */
export function compareDocuments(expectedInput, actualInput) {
    const expectedBlocks = toBlocks(expectedInput, 'Expected');
    const actualBlocks = toBlocks(actualInput, 'Actual');
    const alignment = alignBlocks(expectedBlocks, actualBlocks);

    const matchedLines = [];
    const mismatchLines = [];
    const missingLines = [];
    const extraLines = [];

    for (const step of alignment) {
        if (step.type === 'match') {
            matchedLines.push({
                template: blockText(step.expected),
                letter: blockText(step.actual),
                details: blockDetails(step.expected, step.actual, 'Text and order matched.'),
            });
        } else if (step.type === 'mismatch') {
            mismatchLines.push({
                template: blockText(step.expected),
                letter: blockText(step.actual),
                textDifference: describeTextDifferenceColumn(blockText(step.expected), blockText(step.actual)),
                details: describeDifference(step.expected, step.actual),
            });
        } else if (step.type === 'missing') {
            missingLines.push({
                template: blockText(step.expected),
                letter: '',
                details: blockDetails(step.expected, null, 'Expected block is not present in the actual document.'),
            });
        } else if (step.type === 'extra') {
            extraLines.push({
                template: '',
                letter: blockText(step.actual),
                details: blockDetails(null, step.actual, 'Actual block is not present in the expected document.'),
            });
        }
    }

    return {
        matchedLines,
        mismatchLines,
        missingLines,
        extraLines,
        templateLineCount: expectedBlocks.length,
        letterLineCount: actualBlocks.length,
    };
}

function significantTokens(text) {
    const stopWords = new Set([
        'the', 'and', 'for', 'with', 'this', 'that', 'from',
        'date', 'name', 'company', 'entity', 'business', 'xxx', 'xx',
    ]);
    return looseText(text)
        .split(' ')
        .filter(token => token.length > 2 && !stopWords.has(token));
}

function tokenOverlapScore(a, b) {
    const aTokens = new Set(significantTokens(a));
    const bTokens = new Set(significantTokens(b));
    if (aTokens.size === 0 || bTokens.size === 0) return 0;

    let hits = 0;
    for (const token of aTokens) if (bTokens.has(token)) hits++;
    return hits / aTokens.size;
}

function componentLooksLikeTable(component, table) {
    const requiredX = Math.min(Math.max(table.columnCount + 1, 2), 4);
    const requiredY = Math.min(Math.max(table.rowCount + 1, 2), 4);
    return (
        component.xLineCount >= requiredX &&
        component.yLineCount >= requiredY &&
        component.width > 80 &&
        component.height > 15
    );
}

function findBestPdfPageForTable(table, pdfPages) {
    let best = null;
    for (const page of pdfPages) {
        const score = tokenOverlapScore(table.text, page.text);
        if (!best || score > best.score) best = { page, score };
    }
    return best;
}

export function compareTableBorders(templateDoc, letterDoc) {
    const expectedTables = templateDoc.tables.filter(t => t.hasVisibleBorders);
    const matched = [];
    const missing = [];

    for (const table of expectedTables) {
        const best = findBestPdfPageForTable(table, letterDoc.pdfPages);
        const page = best?.page;
        const matchingComponent = page?.tableComponents.find(c =>
            componentLooksLikeTable(c, table)
        );

        const details = {
            tableNumber: table.tableNumber,
            rowCount: table.rowCount,
            columnCount: table.columnCount,
            snippet: table.text.slice(0, 140),
            pageNumber: page?.pageNumber ?? null,
            pageScore: best?.score ?? 0,
            component: matchingComponent ?? null,
        };

        if (best && best.score >= 0.12 && matchingComponent) {
            matched.push(details);
        } else {
            missing.push(details);
        }
    }

    return { checked: expectedTables.length, matched, missing };
}
