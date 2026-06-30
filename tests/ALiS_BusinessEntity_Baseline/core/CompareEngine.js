import { compareKey, normalizeText } from './text.js';

export class CompareEngine {
  compareRows({ baselineRows, actualRows, keys }) {
    const baseline = this.toMap(baselineRows, keys);
    const actual = this.toMap(actualRows, keys);

    const matched = [];
    const mismatch = [];
    const missing = [];
    const extra = [];

    for (const [key, baselineRow] of baseline.rowsByKey) {
      if (actual.rowsByKey.has(key)) {
        const actualRow = actual.rowsByKey.get(key);
        const differences = this.findDifferences(baselineRow, actualRow, keys);
        const match = {
          key,
          baseline: baselineRow,
          actual: actualRow,
        };

        if (differences.length) {
          mismatch.push({
            ...match,
            differences,
          });
        } else {
          matched.push(match);
        }
      } else {
        missing.push({
          key,
          baseline: baselineRow,
          actual: null,
        });
      }
    }

    for (const [key, actualRow] of actual.rowsByKey) {
      if (!baseline.rowsByKey.has(key)) {
        extra.push({
          key,
          baseline: null,
          actual: actualRow,
        });
      }
    }

    this.moveNearKeyPairsToMismatch({ missing, extra, mismatch, keys });

    return {
      passed: missing.length === 0 && extra.length === 0 && mismatch.length === 0,
      keys,
      matched,
      mismatch,
      missing,
      extra,
      duplicateBaselineKeys: baseline.duplicates,
      duplicateActualKeys: actual.duplicates,
      summary: {
        expected: baseline.rowsByKey.size,
        actual: actual.rowsByKey.size,
        matched: matched.length,
        mismatch: mismatch.length,
        missing: missing.length,
        extra: extra.length,
      },
    };
  }

  moveNearKeyPairsToMismatch({ missing, extra, mismatch, keys }) {
    for (let missingIndex = missing.length - 1; missingIndex >= 0; missingIndex -= 1) {
      const missingRow = missing[missingIndex];
      const extraIndex = this.bestNearKeyIndex(missingRow.baseline, extra, keys);

      if (extraIndex === -1) {
        continue;
      }

      const [extraRow] = extra.splice(extraIndex, 1);
      missing.splice(missingIndex, 1);

      const keyDifferences = this.findKeyFormatDifferences(missingRow.baseline, extraRow.actual, keys);
      const valueDifferences = this.findDifferences(missingRow.baseline, extraRow.actual, keys);

      mismatch.push({
        key: missingRow.key,
        baseline: missingRow.baseline,
        actual: extraRow.actual,
        differences: [
          ...keyDifferences,
          ...valueDifferences,
        ],
      });
    }
  }

  bestNearKeyIndex(baselineRow, extraRows, keys) {
    let bestIndex = -1;
    let bestScore = -1;

    for (let index = 0; index < extraRows.length; index += 1) {
      const actualRow = extraRows[index].actual;
      if (!this.rowsHaveNearKey(baselineRow, actualRow, keys)) {
        continue;
      }

      const score = keys.reduce(
        (total, key) => total + nearKeyScore(baselineRow[key], actualRow[key]),
        0,
      );

      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }

    return bestIndex;
  }

  rowsHaveNearKey(baselineRow, actualRow, keys) {
    if (!baselineRow || !actualRow) {
      return false;
    }

    return keys.every((key) => (
      keyTextsAreNear(baselineRow[key], actualRow[key])
    ));
  }

  findKeyFormatDifferences(baselineRow, actualRow, keys) {
    return keys
      .map((column) => {
        const baselineValue = normalizeText(baselineRow[column]);
        const actualValue = normalizeText(actualRow[column]);

        if (baselineValue === actualValue) {
          return null;
        }

        return {
          column,
          baseline: baselineValue,
          actual: actualValue,
          message: `${column}: expected="${baselineValue}", live="${actualValue}" (${describeNearKeyDifference(baselineValue, actualValue)})`,
        };
      })
      .filter(Boolean);
  }

  findDifferences(baselineRow, actualRow, keys) {
    const keySet = new Set(keys);
    const columns = new Set([...Object.keys(baselineRow), ...Object.keys(actualRow)]);
    const differences = [];

    for (const column of columns) {
      if (keySet.has(column)) {
        continue;
      }

      const baselineValue = normalizeText(baselineRow[column]);
      const actualValue = normalizeText(actualRow[column]);

      if (baselineValue !== actualValue) {
        differences.push({
          column,
          baseline: baselineValue,
          actual: actualValue,
          message: `${column}: expected="${baselineValue}", live="${actualValue}" (${describeNearKeyDifference(baselineValue, actualValue)})`,
        });
      }
    }

    return differences;
  }

  toMap(rows, keys) {
    const rowsByKey = new Map();
    const duplicates = [];

    for (const row of rows) {
      const normalizedRow = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, normalizeText(value)]),
      );
      const key = compareKey(normalizedRow, keys);

      if (!key.replace(/\|/g, '').trim()) {
        continue;
      }

      if (rowsByKey.has(key)) {
        duplicates.push(key);
        continue;
      }

      rowsByKey.set(key, normalizedRow);
    }

    return {
      rowsByKey,
      duplicates,
    };
  }
}

function canonicalNearKeyText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\bids\b/g, 'id')
    .replace(/[^a-z0-9]+/g, '');
}

function keyTextsAreNear(leftValue, rightValue) {
  const left = canonicalNearKeyText(leftValue);
  const right = canonicalNearKeyText(rightValue);

  if (!left || !right) {
    return left === right;
  }

  return left === right || hasPrefixOrSuffixWordingDifference(leftValue, rightValue);
}

function nearKeyScore(leftValue, rightValue) {
  const left = canonicalNearKeyText(leftValue);
  const right = canonicalNearKeyText(rightValue);

  if (left === right) {
    return 100;
  }

  if (hasPrefixOrSuffixWordingDifference(leftValue, rightValue)) {
    return 50 + Math.min(wordTokens(leftValue).length, wordTokens(rightValue).length);
  }

  return 0;
}

function hasPrefixOrSuffixWordingDifference(leftValue, rightValue) {
  const leftTokens = wordTokens(leftValue);
  const rightTokens = wordTokens(rightValue);

  if (!leftTokens.length || !rightTokens.length || leftTokens.length === rightTokens.length) {
    return false;
  }

  const [shorter, longer] = leftTokens.length < rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];

  return tokenSequenceMatches(shorter, longer, 0)
    || tokenSequenceMatches(shorter, longer, longer.length - shorter.length);
}

function tokenSequenceMatches(shorter, longer, startIndex) {
  return shorter.every((token, index) => token === longer[startIndex + index]);
}

function wordTokens(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\bids\b/g, 'id')
    .match(/[a-z0-9]+/g) || [];
}

function describeNearKeyDifference(baselineValue, actualValue) {
  const reasons = [];
  const baseline = String(baselineValue || '');
  const actual = String(actualValue || '');
  const baselineLower = baseline.toLowerCase();
  const actualLower = actual.toLowerCase();
  const baselineCompact = baselineLower.replace(/[^a-z0-9]+/g, '');
  const actualCompact = actualLower.replace(/[^a-z0-9]+/g, '');

  if (baselineLower === actualLower && baseline !== actual) {
    reasons.push('casing issue');
  }

  if (baselineCompact === actualCompact && baselineLower !== actualLower) {
    reasons.push('spacing/punctuation issue');
  }

  if (
    baselineCompact !== actualCompact &&
    canonicalNearKeyText(baseline) === canonicalNearKeyText(actual)
  ) {
    reasons.push('extra character issue');
  }

  if (hasPrefixOrSuffixWordingDifference(baseline, actual)) {
    reasons.push('prefix/suffix wording mismatch');
  }

  if (!reasons.length) {
    reasons.push('key formatting issue');
  }

  return reasons.join(', ');
}
