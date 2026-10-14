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
        if (language === 'md2slides-display-math') return '<div class="katex-display-wrapper">' +
            escape(token.content.trim()) + '</div>\n';
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
        state.line = last + 1;
        return true;
    });
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

    // Keep dollar-delimited TeX opaque to Markdown escapes and pause tokens.
    const closingDollar = (src, start, env) => {
        if (src[start] !== '$' || src[start + 1] === '$') return -1;
        for (let i = start + 1; i < src.length && src[i] !== '\n'; i++) {
            if (src[i] === '\\') { i++; continue; }
            if (src[i] === '\x60') {
                // Skip matched inline code: its dollar signs cannot close math.
                const begin = i;
                while (src[i] === '\x60') i++;
                const markerLength = i - begin;
                let afterClose = -1;
                for (let at = i; at < src.length && src[at] !== '\n';) {
                    if (src[at] !== '\x60') { at++; continue; }
                    let end = at;
                    while (src[end] === '\x60') end++;
                    if (end - at === markerLength) {
                        afterClose = end;
                        break;
                    }
                    at = end;
                }
                if (afterClose >= 0) i = afterClose - 1;
                else i--;
                continue;
            }
            if (src[i] === '[' || (src[i] === '!' && src[i + 1] === '[')) {
                // A '$' in a Markdown link/image destination is URL text,
                // not a possible closing math delimiter. Respect nested label
                // brackets, nested destination parentheses and escapes.
                const labelStart = src[i] === '!' ? i + 1 : i;
                let at = labelStart + 1, brackets = 1;
                while (at < src.length && src[at] !== '\n' && brackets) {
                    if (src[at] === '\\') { at += 2; continue; }
                    if (src[at] === '[') brackets++;
                    else if (src[at] === ']') brackets--;
                    at++;
                }
                if (!brackets) {
                    if (src[at] === '(') {
                        let parens = 1;
                        at++;
                        while (at < src.length && src[at] !== '\n' && parens) {
                            if (src[at] === '\\') { at += 2; continue; }
                            if (src[at] === '(') parens++;
                            else if (src[at] === ')') parens--;
                            at++;
                        }
                        if (!parens) {
                            i = at - 1;
                            continue;
                        }
                    } else {
                        // Let markdown-it resolve full, collapsed, and shortcut
                        // reference links against its own parsed definitions.
                        let end = at;
                        if (src[at] === '[') {
                            end++;
                            while (end < src.length && src[end] !== '\n') {
                                if (src[end] === '\\') { end += 2; continue; }
                                if (src[end++] === ']') break;
                            }
                        }
                        const candidate = src.slice(i, end);
                        if (candidate.includes('$')) {
                            const tokens = [];
                            md.inline.parse(candidate, md, env, tokens);
                            if (tokens.length >= 3 &&
                                (tokens[0].type === 'link_open' || tokens[0].type === 'image') &&
                                (tokens[0].type === 'image' ||
                                    tokens[tokens.length - 1].type === 'link_close')) {
                                i = end - 1;
                                continue;
                            }
                        }
                    }
                }
            }
            if (src[i] === '<') {
                // Ask markdown-it itself which angle constructs are autolinks.
                // Duplicating its URL/email regex diverges on legal addresses
                // such as <cost$offer@example> with a single-label domain.
                const end = src.indexOf('>', i + 1);
                if (end !== -1) {
                    const candidate = src.slice(i, end + 1);
                    if (candidate.includes('$')) {
                        const tokens = [];
                        md.inline.parse(candidate, md, {}, tokens);
                        if (tokens.length === 3 &&
                            tokens[0].type === 'link_open' &&
                            tokens[1].type === 'text' &&
                            tokens[2].type === 'link_close') {
                            i = end;
                            continue;
                        }
                    }
                }
            }
            if (src[i] === '$' && src[i + 1] !== '$') return i;
        }
        return -1;
    };
    md.inline.ruler.before('escape', 'slide_inline_math', (state, silent) => {
        const start = state.src.slice(state.pos);
        const left = start.startsWith('\\(') ? '\\(' :
            start.startsWith('\\[') ? '\\[' :
            start.startsWith('$') && !start.startsWith('$$') ? '$' : null;
        if (!left) return false;
        const right = left === '\\(' ? '\\)' : left === '\\[' ? '\\]' : '$';
        const end = left === '$' ? closingDollar(state.src, state.pos, state.env) :
            state.src.indexOf(right, state.pos + left.length);
        if (end < 0) return false;
        if (!silent) {
            const token = state.push('slide_inline_math', '', 0);
            token.content = state.src.slice(state.pos, end + right.length);
        }
        state.pos = end + right.length;
        return true;
    });
    md.renderer.rules.slide_inline_math = (tokens, idx) => escape(tokens[idx].content);

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
            const marker = /^[ \t]*(\x60{3,}|~{3,})/.exec(line);
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

    // Protect pipes inside inline-code spans and odd backslash-escaped pipes;
    // work around Markdown-it table splitting that otherwise sees them as
    // column delimiters. Restore the literal characters after rendering.
    const PIPE = '\uE021', BACKSLASH_PAIR = '\uE022';
    const isEscaped = (line, at) => {
        let count = 0;
        for (let i = at - 1; i >= 0 && line[i] === '\\'; i--) count++;
        return count % 2 === 1;
    };
    function protectTablePipes(source, env) {
        let fence = null;
        return source.split('\n').map(line => {
            const marker = /^[ \t]*(\x60{3,}|~{3,})/.exec(line);
            if (fence) {
                if (marker && marker[1][0] === fence.char &&
                    marker[1].length >= fence.size &&
                    /^[ \t]*(?:\x60{3,}|~{3,})[ \t]*$/.test(line)) fence = null;
                // Pipes inside actual code and synthetic display-math fences
                // are content, not table separators or Markdown escapes.
                return line;
            }
            if (marker) {
                fence = { char: marker[1][0], size: marker[1].length };
                return line;
            }
            let protectedLine = '';
            for (let i = 0; i < line.length;) {
                // Preserve parenthesized and bracket math as opaque TeX too.
                if (line[i] === '\\' && !isEscaped(line, i) &&
                    (line[i + 1] === '(' || line[i + 1] === '[')) {
                    const closer = line[i + 1] === '(' ? '\\)' : '\\]';
                    const end = line.indexOf(closer, i + 2);
                    if (end >= 0) {
                        protectedLine += line.slice(i, end + 2).replace(/\|/g, PIPE);
                        i = end + 2;
                        continue;
                    }
                }
                if (line[i] === '$' && !isEscaped(line, i)) {
                    const end = closingDollar(line, i, env);
                    if (end > i) {
                        protectedLine += line.slice(i, end + 1).replace(/\|/g, PIPE);
                        i = end + 1;
                        continue;
                    }
                }
                if (line[i] === '\x60') {
                    let start = i;
                    while (line[i] === '\x60') i++;
                    const run = i - start;
                    let closer = -1;
                    for (let j = i; j < line.length;) {
                        if (line[j] !== '\x60') { j++; continue; }
                        let end = j;
                        while (line[end] === '\x60') end++;
                        if (end - j === run) { closer = j; break; }
                        j = end;
                    }
                    if (closer !== -1) {
                        protectedLine += line.slice(start, closer + run).replace(/\|/g, PIPE);
                        i = closer + run;
                    } else protectedLine += line.slice(start, i);
                    continue;
                }
                if (line[i] === '\\') {
                    let j = i;
                    while (line[j] === '\\') j++;
                    if (line[j] === '|') {
                        protectedLine += BACKSLASH_PAIR.repeat(Math.floor((j - i) / 2));
                        protectedLine += (j - i) % 2 ? PIPE : '|';
                        i = j + 1;
                        continue;
                    }
                }
                protectedLine += line[i++];
            }
            return protectedLine;
        }).join('\n');
    }

    // Markdown-it can treat a display-math line in a tight list as paragraph
    // continuation. Encode each math block as a fenced extension block so
    // Markdown-it can attach it to the correct owning list item.
    function protectDisplayMath(source) {
        const output = [];
        const lines = source.split('\n');
        let codeFence = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const marker = /^[ \t]*(\x60{3,}|~{3,})/.exec(line);
            if (codeFence) {
                output.push(line);
                if (marker && marker[1][0] === codeFence.char &&
                    marker[1].length >= codeFence.size &&
                    /^[ \t]*(?:\x60{3,}|~{3,})[ \t]*$/.test(line)) codeFence = null;
                continue;
            }
            if (marker) {
                codeFence = { char: marker[1][0], size: marker[1].length };
                output.push(line);
                continue;
            }
            const opening = /^([ \t]*)(\$\$|\\\[)/.exec(line);
            if (!opening) { output.push(line); continue; }
            const ending = opening[2] === '$$' ? '$$' : '\\]';
            const block = [line.trim()];
            let last = i;
            if (line.indexOf(ending, opening[0].length) < 0) {
                for (last = i + 1; last < lines.length; last++) {
                    block.push(lines[last].trim());
                    if (lines[last].includes(ending)) break;
                }
                if (last >= lines.length) { output.push(line); continue; }
            }
            const pad = opening[1];
            // Choose a delimiter longer than all tilde runs in the source.
            // Literal lines of tildes inside math must never close the wrapper.
            const longest = (block.join('\n').match(/~+/g) || [])
                .reduce((max, run) => Math.max(max, run.length), 0);
            const fenceLine = '~'.repeat(Math.max(5, longest + 1));
            output.push(pad + fenceLine + 'md2slides-display-math');
            for (const piece of block) output.push(pad + piece);
            output.push(pad + fenceLine);
            i = last;
        }
        return output.join('\n');
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
            const normalized = protectDisplayMath(normalizeListMarkers(source));
            const env = {};
            // Markdown-it gathers reference definitions while parsing blocks.
            // Pass its own environment to the inline math protector and final
            // renderer instead of guessing CommonMark reference-link syntax.
            md.block.parse(normalized, md, env, []);
            return md.render(protectTablePipes(normalized, env), env)
                .replace(/\uE021/g, '|').replace(/\uE022/g, '\\');
        }
    };
})();
