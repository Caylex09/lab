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
        const token = tokens[idx];
        const originalChildren = token.children || [];
        // markdown-it's renderInlineAsText ignores custom token types.
        // Present opaque TeX as ordinary text when constructing image alt.
        token.children = originalChildren.map(child => {
            // Upstream's alt renderer skips code_inline as well as custom
            // math tokens; both should contribute their literal text.
            if (child.type === 'slide_inline_math')
                return { ...child, type: 'text', content: restoreMathPipes(child.content) };
            if (child.type === 'code_inline')
                return { ...child, type: 'text' };
            return child;
        });
        try {
            if (!safeImage(token.attrGet('src')))
                return escape(self.renderInlineAsText(token.children, options, env));
            return originalImage(tokens, idx, options, env, self);
        } finally {
            token.children = originalChildren;
        }
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

    // All TeX delimiter handling belongs to this markdown-it extension.
    // Other Markdown syntax, table normalization and slide controls stay here.
    md.use(window.md2slidesMathPlugin, {
        renderInlineMath: content => escape(restoreMathPipes(content))
    });

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
                    // markdown-it hides both ends of tight-list paragraphs.
                    // Exposing only the opener creates malformed nested <p>s.
                    token.hidden = false;
                    if (tokens[i + 2]?.type === 'paragraph_close')
                        tokens[i + 2].hidden = false;
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
            // A tab before a root-level marker is a four-column
            // CommonMark code indent, not a two-space legacy list marker.
            // Inside a list, preserve tab-indented child markers.
            if (match && match[1].includes('\t') && !ownerFor(indent(match[1]))) {
                output.push(line);
                frames.length = 0;
                blankCount = 0;
                continue;
            }
            if (match) {
                const depth = Math.floor(indent(match[1]) / 2);
                const before = frames[frames.length - 1];
                // Existing editor treats two blank lines as separate lists.
                if (blankCount >= 2 && depth === 0 && before)
                    output.splice(output.length - 1, 0, LIST_BOUNDARY);
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
                // A fence with no owning list is a CommonMark root block.
                // Do not let an earlier wide ordered-list marker own the
                // text that comes after this fence has closed.
                if (marker && !owner) frames.length = 0;
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
    // Every temporary syntax marker is unique and absent from authored input.
    // Fixed PUA codepoints would corrupt user-authored icon-font glyphs in
    // table text, math, code spans, and legacy list separators.
    let LIST_BOUNDARY, PIPE, BACKSLASH_PAIR, ESCAPED_SLASH;
    function reserveSyntaxMarkers(source) {
        const used = new Set(source);
        const chosen = [];
        const pick = (start, end) => {
            for (let point = start; point <= end && chosen.length < 4; point++) {
                const char = String.fromCodePoint(point);
                if (!used.has(char) && !chosen.includes(char)) chosen.push(char);
            }
        };
        pick(0xE021, 0xE023);
        pick(0xE000, 0xF8FF);
        pick(0xF0000, 0xFFFFD);
        pick(0x100000, 0x10FFFD);
        if (chosen.length < 4) throw new Error('No free Markdown syntax markers');
        [LIST_BOUNDARY, PIPE, BACKSLASH_PAIR, ESCAPED_SLASH] = chosen;
    }
    const isEscaped = (line, at) => {
        let count = 0;
        for (let i = at - 1; i >= 0 && line[i] === '\\'; i--) count++;
        return count % 2 === 1;
    };
    const restoreMathPipes = src => src
        .split(BACKSLASH_PAIR).join('\\\\')
        .split(ESCAPED_SLASH).join('\\')
        .split(PIPE).join('|');
    // Native Markdown links/images/autolinks are opaque while protecting
    // table pipes. In particular their URL attributes must never contain
    // private-use placeholders that markdown-it will percent-encode.
    const nativeDestinationRules = ['link', 'image', 'autolink'].map(name => {
        const item = md.inline.ruler.__rules__.find(rule => rule.name === name);
        if (!item) throw new Error('Missing markdown-it inline rule: ' + name);
        return item.fn;
    });
    function protectTablePipes(source, blockTokens, env) {
        // Source-map lines are too coarse for display math that closes before
        // the end of a physical line. Collect exact opaque source spans so the
        // following Markdown can still participate in table pipe escaping.
        const opaque = new Map(), tableLines = new Set();
        const addRange = (line, start, end) => {
            if (end <= start) return;
            if (!opaque.has(line)) opaque.set(line, []);
            opaque.get(line).push([start, end]);
        };
        for (const token of blockTokens) {
            if (!token.map) continue;
            if (token.type === 'table_open') {
                for (let line = token.map[0]; line < token.map[1]; line++)
                    tableLines.add(line);
            }
            if (token.type === 'fence' || token.type === 'code_block') {
                for (let line = token.map[0]; line < token.map[1]; line++)
                    addRange(line, 0, Infinity);
            } else if (token.type === 'slide_math') {
                const span = token.meta?.sourceSpan;
                for (let line = token.map[0]; line < token.map[1]; line++) {
                    const first = line === token.map[0];
                    const last = line === token.map[1] - 1;
                    addRange(line, first ? (span?.startColumn ?? 0) : 0,
                        last ? (span?.endColumn ?? Infinity) : Infinity);
                }
            }
        }
        // Descend through native link/image labels, never into destinations.
        // markdown-it owns both token boundaries and URL normalization. This
        // protects code/escaped pipes in labels without editing nested URLs.
        const protectPlain = line => {
            const probe = new md.inline.State(line, md, env, []);
            const scan = (from, limit) => {
                let output = '';
                for (let i = from; i < limit;) {
                    if (line[i] === '[' || line[i] === '!' || line[i] === '<') {
                        let matchEnd = -1;
                        for (const rule of nativeDestinationRules) {
                            probe.pos = i;
                            probe.posMax = limit;
                            if (rule(probe, true) && probe.pos > i && probe.pos <= limit) {
                                matchEnd = probe.pos;
                                break;
                            }
                        }
                        if (matchEnd >= 0) {
                            const labelStart = line[i] === '!' ? i + 1 : i;
                            // markdown-it allows links inside image labels but
                            // rejects nested links inside ordinary link labels.
                            // Mirror the native rule's parseLinkLabel argument.
                            const disableNested = rule !== nativeDestinationRules[1];
                            const labelEnd = line[labelStart] === '[' ?
                                md.helpers.parseLinkLabel(probe, labelStart, disableNested) : -1;
                            if (labelEnd >= 0 && labelEnd < matchEnd) {
                                output += line.slice(i, labelStart + 1);
                                output += scan(labelStart + 1, labelEnd);
                                output += line.slice(labelEnd, matchEnd);
                            } else {
                                output += line.slice(i, matchEnd);
                            }
                            i = matchEnd;
                            continue;
                        }
                    }
                    const spanEnd = codeSpanEnd(line, i);
                    if (spanEnd >= 0 && spanEnd <= limit) {
                        output += line.slice(i, spanEnd).replace(/\|/g, PIPE);
                        i = spanEnd;
                        continue;
                    }
                    if (line[i] === '\\') {
                        let end = i;
                        while (end < limit && line[end] === '\\') end++;
                        if (end < limit && line[end] === '|') {
                            const pairs = Math.floor((end - i) / 2);
                            output += BACKSLASH_PAIR.repeat(pairs);
                            if ((end - i) % 2) output += ESCAPED_SLASH + PIPE;
                            else output += '|';
                            i = end + 1;
                            continue;
                        }
                    }
                    output += line[i++];
                }
                return output;
            };
            return scan(0, line.length);
        };
        const protectSource = allowed => source.split('\n').map((line, index) => {
            if (!allowed(index)) return line;
            const ranges = (opaque.get(index) || []).sort((a, b) => a[0] - b[0]);
            let result = '', cursor = 0;
            for (const [from, to] of ranges) {
                const start = Math.min(line.length, Math.max(from, cursor));
                const finish = Math.min(line.length, to);
                if (finish <= cursor) continue;
                result += protectPlain(line.slice(cursor, start));
                result += line.slice(start, finish);
                cursor = finish;
            }
            return result + protectPlain(line.slice(cursor));
        }).join('\n');
        // A code pipe in a TABLE HEADER can prevent the initial native parse
        // from recognizing any table at all. Probe with a disposable protected
        // source solely to discover table token maps, then apply protection to
        // those native table ranges only. Non-table input remains unchanged.
        const probeTokens = [];
        md.block.parse(protectSource(() => true), md, {}, probeTokens);
        for (const token of probeTokens) {
            if (token.type !== 'table_open' || !token.map) continue;
            for (let line = token.map[0]; line < token.map[1]; line++)
                tableLines.add(line);
        }
        return protectSource(index => tableLines.has(index));
    }

    // This invisible synthetic boundary is created only for legacy double-
    // blank-line list breaks. A block rule interrupts CommonMark lists without
    // suppressing a user's actual thematic break (such as asterisks).
    md.block.ruler.before('paragraph', 'slide_list_boundary', (state, start, end, silent) => {
        const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]);
        if (line.trim() !== LIST_BOUNDARY) return false;
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
            reserveSyntaxMarkers(source);
            const normalized = normalizeListMarkers(source);
            // markdown-it's block rule handles ordinary, quoted and list math.
            // Parse once for opaque source ranges; then render normally.
            const env = {}, blockTokens = [];
            md.block.parse(normalized, md, env, blockTokens);
            return md.render(protectTablePipes(normalized, blockTokens, env), env)
                .split(PIPE).join('|')
                .split(BACKSLASH_PAIR).join('\\')
                .split(ESCAPED_SLASH).join('');
        }
    };
})();
