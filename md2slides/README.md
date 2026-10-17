# Markdown to Slides

A static, browser-based Markdown slide editor with progressive/manual (`\\pause`) presentation modes, KaTeX, Mermaid, and PDF export.

Open [the hosted editor](https://lab.cyx2009.top/md2slides/) or serve this directory with any static HTTP server.

Slides are separated by a line containing `---`, except inside a fenced code block. Both backtick and tilde fences are supported, with matching closing markers at least as long as the opening fence. Choose **Manual** mode and insert `\\pause` to reveal content incrementally. The editor saves drafts in your browser's local storage.

## Markdown parser

Core Markdown uses the locally vendored **markdown-it 14.1.0** (MIT; license:
`assets/js/vendor/markdown-it.LICENSE`). Raw HTML is disabled. Native
Markdown links, images, reference definitions, autolinks, fenced code, tables,
and inline emphasis must be recognized by markdown-it, **not by a second
handwritten Markdown parser**.

The rendering boundary is deliberately split:

- `assets/js/math-plugin.js` is the isolated markdown-it extension for `$$`
  and `\[` display math, plus `$...$`, `\(...\)` and `\[...\]` inline math.
  Formula contents are opaque text: Markdown-like syntax inside a recognized
  formula does not become a nested link, image, or pause command. Within
  markdown-it link-label probes, the extension uses markdown-it's native
  inline rules to skip code spans, links, images, and autolinks, and never
  searches past the active inline parser range (`posMax`).
- `assets/js/markdown-renderer.js` handles output safety (escaped HTML and
  permitted URL schemes), task checkboxes, slide pause controls, Mermaid
  fences, GitHub-style admonitions and table/list legacy compatibility.
  These are presentation adapters, not another parser for standard Markdown.
- `assets/js/index.js` owns slide boundaries (`---`), progression, export
  and browser editor state.

The math plugin is tested on its own in `tests/math-plugin.spec.cjs`: when
input contains **no math delimiters**, installing it must produce the same
HTML as untouched markdown-it. The suite also asserts formula opacity and
interaction with native Markdown links. Any future extension that changes
math-free Markdown must be treated as a regression.

Compatibility preprocessing is limited to legacy two-space list indentation
and escaped/code-span pipe protection for tables. Display math is parsed
directly inside lists and quotes, not turned into temporary code fences.
External syntax rendering (KaTeX and Mermaid) remains in the slide runtime.

Compatibility transforms respect native block ranges and inline tokens:
code/math contents cannot change list state, and continuation paragraphs only
split at top-level soft breaks. Temporary table markers are reserved against
both authored characters and native entity decoding; shortcut/collapsed
references retain their identity when their labels contain protected pipes.
Math probes share range-specific skip caches and honor container boundaries.

The vendored Markdown parser and math extension are local scripts; core
Markdown preview does not require a CDN. Link/image URL protocols remain
restricted at render time. The legacy two-space-or-one-tab list presentation
convention is preserved, including continuation paragraphs.

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

`npm run test:parser` runs dependency-free Node tests before browser tests.
They compare character preservation against the vendored parser, cover every
BMP private-use entity plus supplementary fallback, and check list/table/math
interactions. Adversarial math cases run with a VM timeout to catch runaway
probing and stack growth without hanging the test process.

The browser tests also verify the markdown-it adapter, including list continuations, nested code/math blocks, task items, table cell parsing, code fence boundaries, nested `\\pause`, Markdown link parsing, Mermaid/URL HTML safety, image-only progressive steps, and empty-draft persistence, and PDF export lifecycle handling. Tests stub CDN dependencies so that they can run without external asset requests.

PDF export waits for Mermaid render callbacks, images and fonts before capturing pages. Print export keeps the printable DOM until `afterprint` (with a fallback timeout). If an export fails, an error message is shown and editor controls are restored. Rendering is still browser-dependent; verify the exported document before presenting.
