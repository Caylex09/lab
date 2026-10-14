/*
 * Static-browser Markdown adapter. Parser: markdown-it 14.1.0 (MIT).
 * Keep slideshow-specific markup in extensions rather than a second parser.
 */
(function () {
    'use strict';
    const md = window.markdownit({ html: false, linkify: false, breaks: false });
    const escape = md.utils.escapeHtml;

    // Avoid raw HTML injection; markdown-it already rejects unsafe link protocols.
    const linkOpen = md.renderer.rules.link_open ||
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        tokens[idx].attrSet('target', '_blank');
        tokens[idx].attrSet('rel', 'noopener');
        return linkOpen(tokens, idx, options, env, self);
    };
    const image = md.renderer.rules.image ||
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
        const src = tokens[idx].attrGet('src') || '';
        if (!src || /^(?:data|file|javascript|vbscript):/i.test(src) ||
            /^(?!(?:https?:|\/|\.\/|\.\.\/|#))([a-z][\w+.-]*:|\/\/)/i.test(src)) return '';
        return image(tokens, idx, options, env, self);
    };

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

    md.inline.ruler.before('escape', 'slide_inline_math', (state, silent) => {
        const start = state.src.slice(state.pos);
        const left = start.startsWith('\\(') ? '\\(' : start.startsWith('\\[') ? '\\[' : null;
        if (!left) return false;
        const right = left === '\\(' ? '\\)' : '\\]';
        const end = state.src.indexOf(right, state.pos + 2);
        if (end === -1) return false;
        if (!silent) {
            const token = state.push('slide_inline_math', '', 0);
            token.content = state.src.slice(state.pos, end + 2);
        }
        state.pos = end + 2;
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
            if (token.type === 'list_item_open') items.push({ open: token, list: lists[lists.length - 1], seen: false });
            if (token.type === 'list_item_close') items.pop();

            if (token.type === 'paragraph_open' && items.length && tokens[i + 1]?.type === 'inline') {
                const item = items[items.length - 1], inline = tokens[i + 1];
                if (item.seen) {
                    token.hidden = false;
                    token.attrJoin('class', 'list-continuation');
                }
                item.seen = true;
                const task = !item.task && /^\[([ xX])\]\s+/.exec(inline.content);
                if (task) {
                    item.task = true;
                    item.open.attrJoin('class', 'task-item');
                    if (item.list?.type === 'bullet_list_open') item.list.attrJoin('class', 'task-list');
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
    function normalizeListMarkers(source) {
        let fence = null;
        return source.split('\n').map(line => {
            const marker = /^[ \t]*(\x60{3,}|~{3,})/.exec(line);
            if (fence) {
                if (marker && marker[1][0] === fence.char &&
                    marker[1].length >= fence.size &&
                    /^[ \t]*(?:\x60{3,}|~{3,})[ \t]*$/.test(line)) fence = null;
                return line;
            }
            if (marker) {
                fence = { char: marker[1][0], size: marker[1].length };
                return line;
            }
            const item = /^([ \t]*)([-+*]|\d+[.)])(\s+.*)$/.exec(line);
            if (!item) return line;
            return ' '.repeat(Math.floor(item[1].replace(/\t/g, '  ').length / 2) * 2) +
                item[2] + item[3];
        }).join('\n');
    }
    window.md2slidesMarkdown = { render: source => md.render(normalizeListMarkers(source)) };
})();
