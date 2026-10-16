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
    // Block display math consumes exactly through its closing delimiter.
    // Any suffix is parsed as Markdown blocks, not escaped as TeX content.
    md.block.ruler.before('fence', 'slide_math', (state, start, end, silent) => {
        const line = n => state.src.slice(
            state.bMarks[n] + state.tShift[n], state.eMarks[n]).trim();
        const first = line(start);
        const left = first.startsWith('$$') ? '$$' : first.startsWith('\\[') ? '\\[' : null;
        if (!left) return false;
        const right = left === '$$' ? '$$' : '\\]';
        let last = start;
        let closeAt = first.indexOf(right, left.length);
        while (closeAt < 0 && ++last < end)
            closeAt = line(last).indexOf(right);
        if (closeAt < 0 || last >= end) return false;
        if (silent) return true;

        const contents = [];
        for (let n = start; n < last; n++) contents.push(line(n));
        const closingLine = line(last);
        contents.push(closingLine.slice(0, closeAt + right.length));
        const token = state.push('slide_math', 'div', 0);
        token.content = contents.join('\n');
        token.block = true;
        token.map = [start, last + 1];

        // The suffix is part of the SAME Markdown document. Re-tokenize
        // its virtual start on the closing line together with following
        // physical lines, using the current block state and nesting context.
        // A fresh block.parse(suffix) would lose setext underlines, reference
        // continuations, list ownership and blockquote indentation.
        const original = state.src.slice(
            state.bMarks[last] + state.tShift[last], state.eMarks[last]);
        const leading = original.length - original.trimStart().length;
        const suffixStart = state.bMarks[last] + state.tShift[last] +
            leading + closeAt + right.length;
        // Exact physical-source offsets are consumed by table pipe
        // protection. A closing line can contain ordinary Markdown after
        // the math delimiter; token.map alone marks that whole line.
        const firstRaw = state.src.slice(
            state.bMarks[start] + state.tShift[start], state.eMarks[start]);
        const firstContent = state.bMarks[start] + state.tShift[start] +
            (firstRaw.length - firstRaw.trimStart().length);
        const physicalColumn = at => at -
            (state.src.lastIndexOf('\n', at - 1) + 1);
        token.meta = { sourceSpan: {
            startColumn: physicalColumn(firstContent),
            endColumn: physicalColumn(suffixStart)
        } };
        const suffix = state.src.slice(suffixStart, state.eMarks[last]);
        if (suffix.trim()) {
            const saved = {
                begin: state.bMarks[last],
                shift: state.tShift[last],
                spaces: state.sCount[last],
                bs: state.bsCount[last]
            };
            try {
                state.bMarks[last] = suffixStart;
                state.tShift[last] = suffix.length - suffix.trimStart().length;
                // Tabs in a suffix retain CommonMark's four-column widths.
                let columns = state.blkIndent;
                for (let i = 0; i < state.tShift[last]; i++)
                    columns += suffix[i] === '\t' ? 4 - columns % 4 : 1;
                state.sCount[last] = columns;
                state.bsCount[last] = 0;
                state.md.block.tokenize(state, last, end);
            } finally {
                state.bMarks[last] = saved.begin;
                state.tShift[last] = saved.shift;
                state.sCount[last] = saved.spaces;
                state.bsCount[last] = saved.bs;
            }
        } else {
            state.line = last + 1;
        }
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
        // When a closed formula ends immediately before the enclosing link's
        // native ](url) or ][ref] delimiter, earlier lookalike bytes belong
        // to TeX rather than to the Markdown label boundary.
        const outerCloser = src[end + 1] === ']' &&
            (src[end + 2] === '(' || src[end + 2] === '[');
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
            if (src[i] === ']' && (src[i + 1] === '(' || src[i + 1] === '[') &&
                !outerCloser) return { valid: false, boundary: i };
            if (src[i] === '[') depth++;
            else if (src[i] === ']') {
                if (depth === 0) {
                    if (!outerCloser) return { valid: false, boundary: -1 };
                } else depth--;
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
