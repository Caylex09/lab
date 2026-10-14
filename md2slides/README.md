# Markdown to Slides

A static, browser-based Markdown slide editor with progressive/manual (`\\pause`) presentation modes, KaTeX, Mermaid, and PDF export.

Open [the hosted editor](https://lab.cyx2009.top/md2slides/) or serve this directory with any static HTTP server.

Slides are separated by a line containing `---`, except inside a fenced code block. Both backtick and tilde fences are supported, with matching closing markers at least as long as the opening fence. Choose **Manual** mode and insert `\\pause` to reveal content incrementally. The editor saves drafts in your browser's local storage.

## Markdown parser

Markdown parsing uses a pinned, local browser build of [markdown-it 14.1.0](https://github.com/markdown-it/markdown-it) (MIT; see `assets/js/vendor/markdown-it.LICENSE`). Markdown syntax, including tables, nested lists, code fences, links, and inline formatting, is delegated to markdown-it instead of the former handwritten Markdown parser. The adapter in `assets/js/markdown-renderer.js` adds task checkboxes, slide pause markers, KaTeX display wrappers, Mermaid fences, and GitHub-style admonitions.

The vendored parser is loaded locally before the editor, so the core Markdown preview is not dependent on CDN availability. Raw HTML input remains disabled; Markdown links and image sources are still subject to URL-scheme restrictions. The editor keeps its historical two-spaces-or-one-tab list indentation convention, including the separate continuation-paragraph presentation. Slide boundaries (`---`) and export logic remain application-specific.

## Lists

Indented unordered and ordered lists render as properly nested list items. Consecutive task items share a single task list, and nested list items reveal independently in automatic progressive mode. Indent nested items by two or more spaces (or a tab). Indented continuation paragraphs, fenced code blocks, and display math remain inside their owning list items.

## Tables

GitHub-style tables support escaped pipes (`\|`) and pipes inside inline code. Table separators must match the number of header columns. Body rows with missing cells are padded, and extra cells are ignored. Headings, blockquotes, and list items following a table remain separate blocks even if they contain pipes.

## Regression tests

From this directory:

```sh
npm install
npx playwright install chromium
npm test
```

The browser tests also verify the markdown-it adapter, including list continuations, nested code/math blocks, task items, table cell parsing, code fence boundaries, nested `\\pause`, Markdown link parsing, Mermaid/URL HTML safety, image-only progressive steps, and empty-draft persistence, and PDF export lifecycle handling. Tests stub CDN dependencies so that they can run without external asset requests.

PDF export waits for Mermaid render callbacks, images and fonts before capturing pages. Print export keeps the printable DOM until `afterprint` (with a fallback timeout). If an export fails, an error message is shown and editor controls are restored. Rendering is still browser-dependent; verify the exported document before presenting.
