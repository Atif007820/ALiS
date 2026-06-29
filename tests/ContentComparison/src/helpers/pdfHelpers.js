// ============================================================
// PDF HELPERS
// Low-level geometry helpers for PDF operator-list parsing.
// ============================================================

import { VISIBLE_PDF_PAINT_OPS } from '../constants.js';

// ── Text grouping ─────────────────────────────────────────

/**
 * Convert a flat pdfjs text-content item array into one string per visual row,
 * sorted top-to-bottom then left-to-right by (x, y) transform coordinates.
 */
export function groupPdfTextItems(content) {
    const items = content.items
        .filter(item => item.str?.trim())
        .map(item => ({
            text: item.str.trim(),
            x:    item.transform[4],
            y:    item.transform[5],
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
        .map(group =>
            group.items
                .sort((a, b) => a.x - b.x)
                .map(item => item.text)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
        )
        .filter(Boolean);
}

// ── Path segment parsing ──────────────────────────────────

/**
 * Extract raw line segments from one pdfjs `constructPath` operator argument.
 * Only processes operators preceded by a visible paint op.
 */
export function parsePdfPathSegments(args) {
    const paintOp = args?.[0];
    if (!VISIBLE_PDF_PAINT_OPS.has(paintOp)) return [];

    const segments = [];

    for (const pathData of args[1] || []) {
        let i       = 0;
        let current = null;
        let start   = null;

        while (i < pathData.length) {
            const op = pathData[i++];

            if (op === 0) {                                              // moveTo
                current = [pathData[i++], pathData[i++]];
                start   = current;
            } else if (op === 1) {                                       // lineTo
                const next = [pathData[i++], pathData[i++]];
                if (current) {
                    segments.push({ x1: current[0], y1: current[1], x2: next[0], y2: next[1] });
                }
                current = next;
            } else if (op === 2) { i += 6;                              // curveTo (skip)
            } else if (op === 3) { i += 4;                              // quadTo  (skip)
            } else if (op === 4) {                                       // closePath
                if (current && start) {
                    segments.push({ x1: current[0], y1: current[1], x2: start[0], y2: start[1] });
                }
                current = start;
            } else {
                break;
            }
        }
    }

    return segments;
}

/**
 * Classify a raw segment as `horizontal` or `vertical`, or return `null`
 * if it is diagonal / too short to be a table border.
 */
export function normalizePdfSegment(segment) {
    const tolerance = 1.5;
    const dx = Math.abs(segment.x1 - segment.x2);
    const dy = Math.abs(segment.y1 - segment.y2);

    if (dx <= tolerance && dy >= 5) {
        return {
            ...segment,
            type: 'vertical',
            x:    (segment.x1 + segment.x2) / 2,
            yMin: Math.min(segment.y1, segment.y2),
            yMax: Math.max(segment.y1, segment.y2),
        };
    }

    if (dy <= tolerance && dx >= 5) {
        return {
            ...segment,
            type: 'horizontal',
            y:    (segment.y1 + segment.y2) / 2,
            xMin: Math.min(segment.x1, segment.x2),
            xMax: Math.max(segment.x1, segment.x2),
        };
    }

    return null;
}

/** True when two normalised segments share an endpoint or overlap. */
export function segmentsTouch(a, b) {
    const close = (x, y, tol = 3) => Math.abs(x - y) <= tol;

    if (a.type === b.type) {
        if (a.type === 'horizontal') {
            return close(a.y, b.y) &&
                Math.max(a.xMin, b.xMin) <= Math.min(a.xMax, b.xMax) + 3;
        }
        return close(a.x, b.x) &&
            Math.max(a.yMin, b.yMin) <= Math.min(a.yMax, b.yMax) + 3;
    }

    const h = a.type === 'horizontal' ? a : b;
    const v = a.type === 'vertical'   ? a : b;

    return v.x >= h.xMin - 3 && v.x <= h.xMax + 3 &&
           h.y >= v.yMin - 3 && h.y <= v.yMax + 3;
}

/** Count distinct coordinate values within a 3-unit tolerance band. */
export function uniqueCoordinateCount(values) {
    return values
        .sort((a, b) => a - b)
        .filter((v, i, arr) => i === 0 || Math.abs(v - arr[i - 1]) > 3)
        .length;
}

/** Build a bounding-box / line-count summary for a connected segment component. */
export function summarizeSegmentComponent(segments) {
    const xs = [];
    const ys = [];
    let minX = Infinity,  minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let horizontalCount = 0, verticalCount = 0;

    for (const seg of segments) {
        minX = Math.min(minX, seg.x1, seg.x2);
        minY = Math.min(minY, seg.y1, seg.y2);
        maxX = Math.max(maxX, seg.x1, seg.x2);
        maxY = Math.max(maxY, seg.y1, seg.y2);

        if (seg.type === 'horizontal') { horizontalCount++; ys.push(seg.y); }
        else                           { verticalCount++;   xs.push(seg.x); }
    }

    return {
        horizontalCount,
        verticalCount,
        xLineCount: uniqueCoordinateCount(xs),
        yLineCount: uniqueCoordinateCount(ys),
        width:  maxX - minX,
        height: maxY - minY,
        bbox:   [minX, minY, maxX, maxY],
    };
}

/**
 * Union-Find over segments: group touching segments into connected components,
 * then filter to only those that look like table grids (not page frames).
 */
export function findPdfTableComponents(segments, pageView) {
    const seen       = new Array(segments.length).fill(false);
    const components = [];

    for (let i = 0; i < segments.length; i++) {
        if (seen[i]) continue;

        const stack     = [i];
        const component = [];
        seen[i] = true;

        while (stack.length > 0) {
            const idx = stack.pop();
            component.push(segments[idx]);

            for (let j = 0; j < segments.length; j++) {
                if (!seen[j] && segmentsTouch(segments[idx], segments[j])) {
                    seen[j] = true;
                    stack.push(j);
                }
            }
        }

        const summary     = summarizeSegmentComponent(component);
        const isPageFrame =
            summary.bbox[0] < pageView[0] + 25 &&
            summary.bbox[2] > pageView[2] - 25 &&
            summary.height  > (pageView[3] - pageView[1]) * 0.75;

        if (
            !isPageFrame        &&
            summary.width      > 40 &&
            summary.height     > 8  &&
            summary.xLineCount >= 2 &&
            summary.yLineCount >= 2
        ) {
            components.push(summary);
        }
    }

    return components.sort((a, b) => (b.width * b.height) - (a.width * a.height));
}
