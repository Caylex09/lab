/*
 * Static-browser Markdown adapter. Parser: markdown-it 14.1.0 (MIT).
 * Keep slideshow-specific markup in extensions rather than a second parser.
 */
(function () {
    'use strict';
    const md = window.markdownit({ html: false, linkify: false, breaks: false });
    const escape = md.utils.escapeHtml;
    // Let markdown-it parse links/images even when the destination scheme is
    // forbidden. The renderer below is the single URL-safety enforcement
    // point: links become plain text, images become escaped alt text. Without
    // this, markdown-it rejects unsafe URLs before we can recover image alt.
    md.validateLink = () => true;

    // Preserve the previous link-protocol allowlist, not just markdown-it's
    // default blacklist. Never emit half an anchor for a rejected link.
    const safeLink = value => {
        if (!value || /[\u0000-\u001f\u007f]/.test(value)) return false;
        if (/^(?:#|\/|\.\/|\.\.\/)/.test(value)) return true;
        try {
            return ['http:', 'https:', 'mailto:'].includes(
                new URL(value, window.location.origin).protocol
            );
        } catch { return false; }
    };
    const safeImage = value => {
        if (!value || /[\u0000-\u001f\u007f]/.test(value)) return false;
        if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return true;
        if (/^data:/i.test(value)) return false;
        if (/^(?:\/|\.\/|\.\.\/)/.test(value)) return true;
        try {
            return ['http:', 'https:'].includes(new URL(value, window.location.origin).protocol);
        } catch { return false; }
    };
    const originalLinkOpen = md.renderer.rules.link_open ||
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    const originalLinkClose = md.renderer.rules.link_close ||
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const allowed = safeLink(tokens[idx].attrGet('href'));
        (env.slideLinkStack || (env.slideLinkStack = [])).push(allowed);
        if (!allowed) return '';
        tokens[idx].attrSet('target', '_blank');
        tokens[idx].attrSet('rel', 'noopener');
        return originalLinkOpen(tokens, idx, options, env, self);
    };
    md.renderer.rules.link_close = (tokens, idx, options, env, self) =>
        (env.slideLinkStack || []).pop() === false ? '' :
            originalLinkClose(tokens, idx, options, env, self);
    const originalImage = md.renderer.rules.image ||
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
        if (!safeImage(tokens[idx].attrGet('src'))) {
            return escape(self.renderInlineAsText(tokens[idx].children || [], options, env));
        }
        return originalImage(tokens, idx, options, env, self);
    };

    // Preserve legacy strikethrough markup while using markdown-it syntax.
    md.renderer.rules.s_open = () => '<del>';
    md.renderer.rules.s_close = () => '</del>';

    md.renderer.rules.table_open = () => '<table class="md-table">\n';
    for (const name of ['th_open', 'td_open']) {
        const original = md.renderer.rules[name] ||
            ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
        md.renderer.rules[name] = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const match = /text-align:\s*(left|center|right)/.exec(token.attrGet('style') || '');
            if (match) token.attrSet('align', match[1]);
            token.attrs = (token.attrs || []).filter(attr => attr[0] !== 'style');
            return original(tokens, idx, options, env, self);
        };
    }
    md.renderer.rules.fence = (tokens, idx) => {
        const token = tokens[idx];
        const language = (token.info.trim().split(/\s+/)[0] || '').toLowerCase();
        if (language === 'mermaid') return '<div class="mermaid">' +
            escape(token.content.replace(/\n$/, '')) + '</div>\n';
        return '<pre class="code"><code' +
            (language ? ' class="language-' + escape(language) + '"' : '') + '>' +
            escape(token.content.replace(/\n$/, '')) + '</code></pre>\n';
    };
    md.renderer.rules.code_block = (tokens, idx) =>
        '<pre class="code"><code>' + escape(tokens[idx].content.replace(/\n$/, '')) + '</code></pre>\n';

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

    // Parsing inline control sequences as tokens excludes fenced and inline code.
    md.inline.ruler.before('escape', 'slide_pause', (state, silent) => {
        if (!state.src.startsWith('\\pause', state.pos) || /[a-z]/i.test(state.src[state.pos + 6] || '')) return false;
        if (!silent) state.push('slide_pause', '', 0);
        state.pos += 6;
        return true;
    });
    md.renderer.rules.slide_pause = () => '<span class="pause-marker" data-pause="true"></span>';

    // A code span is an opaque Markdown construct. Match backtick run lengths
    // once and reuse this helper for inline TeX and pipe handling.
    function codeSpanEnd(src, start) {
        if (src[start] !== '\x60' || isEscaped(src, start)) return -1;
        let at = start;
        while (src[at] === '\x60') at++;
        const width = at - start;
        while (at < src.length && src[at] !== '\n') {
            if (src[at] !== '\x60') { at++; continue; }
            let end = at;
            while (src[end] === '\x60') end++;
            if (end - at === width) return end;
            at = end;
        }
        return -1;
    }

    // Reuse markdown-it's grammar for opaque inline constructs rather than
    // reimplementing link, image, autolink or code-span parsing.
    const opaqueInlineRules = ['backticks', 'link', 'image', 'autolink'].map(name => {
        const rule = md.inline.ruler.__rules__.find(item => item.name === name);
        if (!rule) throw new Error('Missing markdown-it inline rule: ' + name);
        return rule.fn;
    });
    function closingDollar(state) {
        const src = state.src, start = state.pos;
        if (src[start] !== '$' || src[start + 1] === '$') return -1;
        const probe = new state.constructor(src, state.md, state.env, []);
        for (let i = start + 1; i < src.length && src[i] !== '\n';) {
            if (src[i] === '\\') { i += 2; continue; }
            if (src[i] === '$' && src[i + 1] !== '$') return i;
            if (src[i] === '\x60' || src[i] === '[' || src[i] === '!' || src[i] === '<') {
                let skipped = false;
                for (const rule of opaqueInlineRules) {
                    probe.pos = i;
                    if (rule(probe, true) && probe.pos > i) {
                        i = probe.pos;
                        skipped = true;
                        break;
                    }
                }
                if (skipped) continue;
            }
            i++;
        }
        return -1;
    }
    md.inline.ruler.before('escape', 'slide_inline_math', (state, silent) => {
        const start = state.src.slice(state.pos);
        const left = start.startsWith('\\(') ? '\\(' :
            start.startsWith('\\[') ? '\\[' :
            start.startsWith('$') && !start.startsWith('$$') ? '$' : null;
        if (!left) return false;
        const right = left === '\\(' ? '\\)' : left === '\\[' ? '\\]' : '$';
        const end = left === '$' ? closingDollar(state) :
            state.src.indexOf(right, state.pos + left.length);
        if (end < 0) return false;
        if (!silent) {
            const token = state.push('slide_inline_math', '', 0);
            token.content = state.src.slice(state.pos, end + right.length);
        }
        state.pos = end + right.length;
        return true;
    });
    md.renderer.rules.slide_inline_math = (tokens, idx) => escape(restoreMathPipes(tokens[idx].content));

    const parseInline = (state, src) => {
        const token = new state.Token('inline', '', 0);
        token.content = src;
        token.children = [];
        state.md.inline.parse(src, state.md, state.env, token.children);
        return token;
    };
    const htmlToken = (state, src) => {
        const token = new state.Token('html_inline', '', 0);
        token.content = src;
        return token;
    };

    md.core.ruler.after('inline', 'slide_list_extensions', state => {
        const tokens = state.tokens, output = [], lists = [], items = [];
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'bullet_list_open' || token.type === 'ordered_list_open') lists.push(token);
            if (token.type === 'bullet_list_close' || token.type === 'ordered_list_close') lists.pop();
            if (token.type === 'list_item_open') items.push({ open: token, list: lists[lists.length - 1], seen: false, leadingBlock: true });
            if (token.type === 'list_item_close') items.pop();

            // Markdown-it already identifies all block containers. If the
            // first direct child is a quote, fence, nested list, etc., a later
            // paragraph cannot become the item's task-checkbox lead.
            const currentItem = items[items.length - 1];
            if (currentItem && token.level === currentItem.open.level + 1 &&
                token.block && token.nesting >= 0 &&
                token.type !== 'paragraph_open' && token.type !== 'inline') {
                currentItem.leadingBlock = false;
            }

            // Direct child paragraphs only: a blockquote paragraph has a
            // greater token.level and must not affect the list-item state.
            if (token.type === 'paragraph_open' && currentItem &&
                token.level === currentItem.open.level + 1 &&
                tokens[i + 1]?.type === 'inline') {
                const item = currentItem, inline = tokens[i + 1];
                const taskLead = item.leadingBlock;
                item.leadingBlock = false;
                const firstParagraph = !item.seen;
                if (!firstParagraph) {
                    token.hidden = false;
                    token.attrJoin('class', 'list-continuation');
                }
                item.seen = true;
                // Checkboxes only belong in the leading paragraph of a bullet
                // item. Ordered lists and continuation text keep literal [ ].
                const task = firstParagraph && taskLead && token.map?.[0] === item.open.map?.[0] && item.list?.type === 'bullet_list_open' &&
                    /^\[([ xX])\]\s+/.exec(inline.content);
                if (task) {
                    item.task = true;
                    item.open.attrJoin('class', 'task-item');
                    if (item.list?.type === 'bullet_list_open' && !item.list.attrGet('class')?.split(/\s+/).includes('task-list'))
                        item.list.attrJoin('class', 'task-list');
                    inline.content = inline.content.replace(/^\[([ xX])\]\s+/, '');
                    inline.children = parseInline(state, inline.content).children;
                }

                // The legacy editor displays indented follow-up lines as their
                // own paragraphs; CommonMark normally soft-wraps them.
                if (inline.content.includes('\n') && !item.split) {
                    const lines = inline.content.split('\n');
                    inline.content = lines.shift();
                    inline.children = parseInline(state, inline.content).children;
                    const remainder = lines.join(' ').trim();
                    if (task) {
                        inline.children.unshift(htmlToken(state, '<input type="checkbox" ' +
                            (task[1].toLowerCase() === 'x' ? 'checked ' : '') + 'disabled><span>'));
                        inline.children.push(htmlToken(state, '</span>'));
                    }
                    if (remainder && tokens[i + 2]?.type === 'paragraph_close') {
                        output.push(token, inline, tokens[i + 2]);
                        const open = new state.Token('paragraph_open', 'p', 1);
                        open.attrSet('class', 'list-continuation');
                        output.push(open, parseInline(state, remainder), new state.Token('paragraph_close', 'p', -1));
                        item.split = true;
                        i += 2;
                        continue;
                    }
                } else if (task) {
                    inline.children.unshift(htmlToken(state, '<input type="checkbox" ' +
                        (task[1].toLowerCase() === 'x' ? 'checked ' : '') + 'disabled><span>'));
                    inline.children.push(htmlToken(state, '</span>'));
                }
            }
            output.push(token);
        }
        state.tokens = output;
    });

    md.core.ruler.after('slide_list_extensions', 'slide_admonitions', state => {
        const tokens = state.tokens, stack = [];
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token.type === 'blockquote_open') {
                const inline = tokens[i + 2];
                const match = tokens[i + 1]?.type === 'paragraph_open' &&
                    inline?.type === 'inline' && /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s+|$)/i.exec(inline.content);
                const kind = match ? match[1].toUpperCase() : null;
                stack.push(kind);
                if (kind) {
                    token.meta = { admonition: kind };
                    inline.content = inline.content.slice(match[0].length);
                    inline.children = parseInline(state, inline.content).children;
                }
            } else if (token.type === 'blockquote_close') {
                const kind = stack.pop();
                if (kind) token.meta = { admonition: kind };
            }
        }
    });
    md.renderer.rules.blockquote_open = (tokens, idx) => {
        const kind = tokens[idx].meta?.admonition;
        return kind ? '<div class="admonition ' + kind.toLowerCase() +
            '"><p class="admonition-title">' + kind + '</p><div class="admonition-content">\n' :
            '<blockquote>\n';
    };
    md.renderer.rules.blockquote_close = (tokens, idx) =>
        tokens[idx].meta?.admonition ? '</div></div>\n' : '</blockquote>\n';

    // Preserve the app's two-spaces-or-one-tab list convention. Do not alter
    // fenced code content or non-marker lines.
    // Compatible two-space list convention, including ordered-list marker
    // widths. markdown-it itself owns the resulting list structure.
    function normalizeListMarkers(source) {
        const output = [], frames = [];
        let fence = null, blankCount = 0;
        const indent = line => (line.match(/^[ \t]*/) || [''])[0].replace(/\t/g, '  ').length;
        const padLine = (line, offset) => {
            const leading = indent(line);
            return ' '.repeat(Math.max(0, leading + offset)) + line.trimStart();
        };
        const ownerFor = raw => frames.slice().reverse()
            .find(frame => raw >= frame.depth * 2 + 2);
        for (const line of source.split('\n')) {
            const fenceMatch = /^[ \t]*(\x60{3,}|~{3,})(.*)$/.exec(line);
            // Backtick fence info strings may not contain backticks (CommonMark).
            // Otherwise a normal continuation line can swallow following items.
            const marker = fenceMatch &&
                (fenceMatch[1][0] !== '\x60' || !fenceMatch[2].includes('\x60')) ?
                [fenceMatch[0], fenceMatch[1]] : null;
            if (fence) {
                const isClosing = marker && marker[1][0] === fence.char &&
                    marker[1].length >= fence.size &&
                    /^[ \t]*(?:\x60{3,}|~{3,})[ \t]*$/.test(line);
                if (isClosing) {
                    // Align the closer with the transformed opening marker,
                    // rather than indenting it like a literal code-body line.
                    output.push(fence.ownerIndent ? padLine(line, fence.offset) : line);
                    fence = null;
                } else {
                    // markdown-it removes an owning list item's entire content
                    // indentation from fenced lines. Supply that exact prefix
                    // separately, so the following raw bytes (including tabs)
                    // survive untouched inside the final <code> element.
                    output.push(fence.ownerIndent ?
                        ' '.repeat(fence.ownerIndent) + line : line);
                }
                continue;
            }
            if (!line.trim()) {
                output.push(line);
                blankCount++;
                continue;
            }
            const match = /^([ \t]*)([-+*]|\d+[.)])(\s+.*)$/.exec(line);
            if (match) {
                const depth = Math.floor(indent(match[1]) / 2);
                const before = frames[frames.length - 1];
                // Existing editor treats two blank lines as separate lists.
                if (blankCount >= 2 && depth === 0 && before)
                    output.splice(output.length - 1, 0, '\uE030');
                while (frames.length && frames[frames.length - 1].depth >= depth) frames.pop();
                const parent = frames[frames.length - 1];
                const target = parent && depth ? parent.target + parent.width : depth * 2;
                const width = match[2].length + 1;
                // A non-1 ordered sublist may not interrupt a paragraph in
                // CommonMark. A blank line ensures it is parsed as a list.
                if (parent && /^\d/.test(match[2]) &&
                    parseInt(match[2], 10) !== 1 && output[output.length - 1]?.trim())
                    output.push('');
                output.push(' '.repeat(target) + match[2] + match[3]);
                frames.push({ depth, target, width });
            } else {
                const owner = ownerFor(indent(line));
                if (owner && owner !== frames[frames.length - 1]) {
                    // A dedented continuation belongs to an ancestor after a
                    // child list. Separate the child list and parent's next
                    // paragraph instead of using CommonMark lazy continuation.
                    if (output[output.length - 1]?.trim()) output.push('');
                    frames.length = frames.indexOf(owner) + 1;
                }
                const offset = owner ? (owner.target + owner.width) - (owner.depth * 2 + 2) : 0;
                // Preserve root-level Tab indentation used by CommonMark code blocks.
                output.push(owner ? padLine(line, offset) : line);
                if (!indent(line) && !marker) frames.length = 0;
                if (marker) fence = { char: marker[1][0], size: marker[1].length,
                    offset, ownerIndent: owner ? owner.target + owner.width : 0 };
            }
            blankCount = 0;
        }
        return output.join('\n');
    }

    // markdown-it owns tables. Protect only the syntax it splits too early:
    // escaped pipes and pipes inside code spans. Do not parse dollar math,
    // links, images or autolinks here. The inline renderer restores TeX's
    // backslashes; ordinary Markdown uses the usual escape semantics.
    const PIPE = '\uE021', BACKSLASH_PAIR = '\uE022', ESCAPED_SLASH = '\uE023';
    const isEscaped = (line, at) => {
        let count = 0;
        for (let i = at - 1; i >= 0 && line[i] === '\\'; i--) count++;
        return count % 2 === 1;
    };
    const restoreMathPipes = src => src
        .replace(/\uE022/g, '\\\\').replace(/\uE023/g, '\\').replace(/\uE021/g, '|');
    function protectTablePipes(source, blockTokens) {
        // Respect markdown-it source maps, including direct blockquote math.
        const opaque = new Set();
        for (const token of blockTokens) {
            if (['fence', 'code_block', 'slide_math'].includes(token.type) && token.map) {
                for (let line = token.map[0]; line < token.map[1]; line++) opaque.add(line);
            }
        }
        return source.split('\n').map((line, index) => {
            if (opaque.has(index)) return line;
            let output = '';
            for (let i = 0; i < line.length;) {
                const spanEnd = codeSpanEnd(line, i);
                if (spanEnd >= 0) {
                    output += line.slice(i, spanEnd).replace(/\|/g, PIPE);
                    i = spanEnd;
                    continue;
                }
                if (line[i] === '\\') {
                    let end = i;
                    while (line[end] === '\\') end++;
                    if (line[end] === '|') {
                        const pairs = Math.floor((end - i) / 2);
                        output += BACKSLASH_PAIR.repeat(pairs);
                        if ((end - i) % 2) output += ESCAPED_SLASH + PIPE;
                        else output += '|'; // even escapes: ordinary table delimiter
                        i = end + 1;
                        continue;
                    }
                }
                output += line[i++];
            }
            return output;
        }).join('\n');
    }

    // This invisible synthetic boundary is created only for legacy double-
    // blank-line list breaks. A block rule interrupts CommonMark lists without
    // suppressing a user's actual thematic break (such as asterisks).
    md.block.ruler.before('paragraph', 'slide_list_boundary', (state, start, end, silent) => {
        const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
        if (line.trim() !== '\uE030') return false;
        if (!silent) {
            const token = state.push('slide_list_boundary', '', 0);
            token.block = true;
        }
        state.line = start + 1;
        return true;
    }, { alt: ['paragraph', 'list'] });
    md.renderer.rules.slide_list_boundary = () => '';

    window.md2slidesMarkdown = {
        render(source) {
            const normalized = normalizeListMarkers(source);
            // markdown-it's block rule handles ordinary, quoted and list math.
            // Parse once for opaque source ranges; then render normally.
            const env = {}, blockTokens = [];
            md.block.parse(normalized, md, env, blockTokens);
            return md.render(protectTablePipes(normalized, blockTokens), env)
                .replace(/\uE021/g, '|').replace(/\uE022/g, '\\').replace(/\uE023/g, '');
        }
    };
})();
