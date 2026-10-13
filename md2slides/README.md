# Markdown to Slides

A static, browser-based Markdown slide editor with progressive/manual (`\\pause`) presentation modes, KaTeX, Mermaid, and PDF export.

Open [the hosted editor](https://lab.cyx2009.top/md2slides/) or serve this directory with any static HTTP server.

Slides are separated by a line containing `---`, except inside a fenced code block. Both backtick and tilde fences are supported, with matching closing markers at least as long as the opening fence. Choose **Manual** mode and insert `\\pause` to reveal content incrementally. The editor saves drafts in your browser's local storage.

## Lists

Indented unordered and ordered lists render as properly nested list items. Consecutive task items share a single task list, and nested list items reveal independently in automatic progressive mode. Indent nested items by two or more spaces (or a tab).

## Tables

GitHub-style tables support escaped pipes (`\|`) and pipes inside inline code. Table separators must match the number of header columns. Body rows with missing cells are padded, and extra cells are ignored.

## Regression tests

From this directory:

```sh
npm install
npx playwright install chromium
npm test
```

The browser tests cover nested lists and task items, table cell parsing, code fence boundaries, nested `\\pause`, Markdown link parsing, Mermaid/URL HTML safety, image-only progressive steps, and empty-draft persistence, and PDF export lifecycle handling. Tests stub CDN dependencies so that they can run without external asset requests.

PDF export waits for Mermaid render callbacks, images and fonts before capturing pages. Print export keeps the printable DOM until `afterprint` (with a fallback timeout). If an export fails, an error message is shown and editor controls are restored. Rendering is still browser-dependent; verify the exported document before presenting.
