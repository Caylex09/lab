/*
 * md2slides mathematics extension for markdown-it 14.1.0.
 *
 * Owns only slide-specific math delimiters. Markdown links, reference links,
 * autolinks and code spans remain recognized by markdown-it native rules.
 * The existing slide pipeline remains responsible for TeX rendering/escaping.
 */
(function () {
    'use strict';
    window.md2slidesMathPlugin = function (md, options) {
        const escape = md.utils.escapeHtml;
    // Display math is a block; leave KaTeX rendering to the existing stage.
    md.block.ruler.before('fence', 'slide_math', (state, start, end, silent) => {
        const first = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim();
        const left = first.startsWith('$$') ? '$$' : first.startsWith('\\[') ? '\\[' : null;
        if (!left) return false;
        const right = left === '$$' ? '$$' : '\\]';
        const inlineEnd = first.length > left.length && first.indexOf(right, left.length) !== -1;
        let last = start;
        if (!inlineEnd) {
            for (last = start + 1; last < end; last++) {
                if (state.src.slice(state.bMarks[last] + state.tShift[last], state.eMarks[last]).includes(right)) break;
            }
            if (last === end) return false;
        }
        if (silent) return true;
        const pieces = [];
        for (let i = start; i <= last; i++)
            pieces.push(state.src.slice(state.bMarks[i] + state.tShift[i], state.eMarks[i]).trim());
        const token = state.push('slide_math', 'div', 0);
        token.content = pieces.join('\n');
        token.block = true;
        // Keep the original source range, including inside blockquotes.
        // Pipe protection must never rewrite TeX from a direct math block.
        token.map = [start, last + 1];
        state.line = last + 1;
        return true;
    }, { alt: ['paragraph', 'list'] });
    md.renderer.rules.slide_math = (tokens, idx) =>
        '<div class="katex-display-wrapper">' + escape(tokens[idx].content) + '</div>\n';

    // Reuse markdown-it's grammar for opaque inline constructs rather than
    // reimplementing link, image, autolink or code-span parsing.
    const opaqueInlineRules = ['backticks', 'link', 'image', 'autolink'].map(name => {
        const rule = md.inline.ruler.__rules__.find(item => item.name === name);
        if (!rule) throw new Error('Missing markdown-it inline rule: ' + name);
        return rule.fn;
    });
    // One adapter to markdown-it's native opaque inline rules; math scanning
    // never needs to reimplement code spans, links, images or autolinks.
    function nativeOpaqueEnd(probe, at, rules) {
        for (const rule of rules) {
            probe.pos = at;
            if (rule(probe, true) && probe.pos > at) return probe.pos;
        }
        return at;
    }
    function closingDollar(state) {
        const src = state.src, start = state.pos;
        if (src[start] !== '$' || src[start + 1] === '$') return -1;
        const probe = new state.constructor(src, state.md, state.env, []);
        // Link/image labels narrow posMax while markdown-it parses their text.
        // Never let a math closer or a probed inline rule read past that range.
        probe.posMax = state.posMax;
        for (let i = start + 1; i < state.posMax && src[i] !== '\n';) {
            if (src[i] === '\\') { i += 2; continue; }
            // Consecutive inline formulas share adjacent delimiters:
            // the first '$' closes the previous formula, the next opens a new one.
            if (src[i] === '$') return i;
            if (src[i] === '\x60' || src[i] === '[' || src[i] === '!' || src[i] === '<') {
                const skipTo = nativeOpaqueEnd(probe, i, opaqueInlineRules);
                if (skipTo > i) {
                    // A TeX closer inside a leading [formula$] comes before
                    // its apparent Markdown link; otherwise trust upstream.
                    const closer = src.indexOf('$', i + 1);
                    const labelEnd = src.indexOf(']', i + 1);
                    if (!(src[i] === '[' && i === start + 1 &&
                        closer >= 0 && labelEnd >= 0 && closer < labelEnd)) {
                        i = skipTo;
                        continue;
                    }
                }
            }
            i++;
        }
        return -1;
    }
    // Inspect one candidate math span, never the rest of the document.
    // markdown-it's own code-span and autolink rules make their contents
    // opaque; Markdown link/reference parsing still belongs to markdown-it.
    function inspectMathLabel(state, begin, end) {
        const src = state.src;
        const probe = new state.constructor(src, state.md, state.env, []);
        probe.posMax = end;
        const opaque = [opaqueInlineRules[0], opaqueInlineRules[3], opaqueInlineRules[1], opaqueInlineRules[2]];
        let depth = 0;
        for (let i = begin; i < end;) {
            if (src[i] === '\\') { i += 2; continue; }
            if (src[i] === '\x60' || src[i] === '<' || src[i] === '[' || src[i] === '!') {
                // At the very beginning of '$[...', '[' is a TeX interval
                // opener, not a nested Markdown link. Elsewhere within the
                // candidate, the upstream grammar owns native links/images.
                const leadingInterval = src[i] === '[' && i === begin &&
                    src[begin - 1] === '$';
                const skipTo = leadingInterval ? i : nativeOpaqueEnd(probe, i, opaque);
                if (skipTo > i) { i = skipTo; continue; }
            }
            // Only this formula's span is examined. A delimiter inside
            // an autolink or code span has already been skipped upstream.
            if (src[i] === ']' && (src[i + 1] === '(' || src[i + 1] === '['))
                return { valid: false, boundary: i };
            if (src[i] === '[') depth++;
            else if (src[i] === ']') {
                if (depth === 0) return { valid: false, boundary: -1 };
                depth--;
            }
            i++;
        }
        return { valid: true, boundary: -1 };
    }
    md.inline.ruler.before('escape', 'slide_inline_math', (state, silent) => {
        const start = state.src.slice(state.pos, state.posMax);
        const left = start.startsWith('\\(') ? '\\(' :
            start.startsWith('\\[') ? '\\[' :
            start.startsWith('$') && !start.startsWith('$$') ? '$' : null;
        if (!left) return false;
        const right = left === '\\(' ? '\\)' : left === '\\[' ? '\\]' : '$';
        const end = left === '$' ? closingDollar(state) :
            state.src.indexOf(right, state.pos + left.length);
        // Unlike indexOf, markdown-it's posMax is an exclusive bound while
        // parsing link/image label contents.
        if (end < 0 || end + right.length > state.posMax) return false;
        if (silent) {
            const scan = inspectMathLabel(state, state.pos + left.length, end);
            if (!scan.valid) {
                // An unmatched '$[' cannot swallow the enclosing label.
                // Let markdown-it encounter the real closing ] itself.
                if (left !== '$' || state.src[state.pos + 1] !== '[' ||
                    scan.boundary < 0) return false;
                state.pos = scan.boundary;
                return true;
            }
        }
        if (!silent) {
            const token = state.push('slide_inline_math', '', 0);
            token.content = state.src.slice(state.pos, end + right.length);
        }
        state.pos = end + right.length;
        return true;
    });
    md.renderer.rules.slide_inline_math = (tokens, idx) => options.renderInlineMath(tokens[idx].content);

    };
})();
