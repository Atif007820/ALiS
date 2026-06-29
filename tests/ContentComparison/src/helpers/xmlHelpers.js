// ============================================================
// XML HELPERS
// Thin wrappers around the DOM API used to traverse DOCX XML.
// ============================================================

import { WORD_NS } from '../constants.js';

export function xmlLocalName(node) {
    return node?.localName || node?.nodeName?.split(':').pop() || '';
}

export function xmlChildren(node, name = null) {
    const result = [];
    for (let child = node?.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1 && (!name || xmlLocalName(child) === name)) {
            result.push(child);
        }
    }
    return result;
}

export function xmlFirst(node, name) {
    return xmlChildren(node, name)[0] || null;
}

export function xmlDescendants(node, name) {
    const result = [];

    function visit(current) {
        if (current.nodeType === 1 && xmlLocalName(current) === name) {
            result.push(current);
        }
        for (let child = current.firstChild; child; child = child.nextSibling) {
            visit(child);
        }
    }

    if (node) visit(node);
    return result;
}

export function xmlAttr(node, name) {
    return node?.getAttribute?.(name) ||
        node?.getAttribute?.(`w:${name}`) ||
        node?.getAttributeNS?.(WORD_NS, name) ||
        '';
}

/** Concatenate all text runs inside a DOCX node, collapsing whitespace. */
export function xmlText(node) {
    const parts = [];

    function visit(current) {
        if (current.nodeType === 1) {
            const name = xmlLocalName(current);
            if (name === 't')              parts.push(current.textContent);
            else if (name === 'tab' || name === 'br') parts.push(' ');
        }
        for (let child = current.firstChild; child; child = child.nextSibling) {
            visit(child);
        }
    }

    visit(node);
    return parts.join('').replace(/\s+/g, ' ').trim();
}
