# Markdown to Slides

A static, browser-based Markdown slide editor with progressive/manual (`\\pause`) presentation modes, KaTeX, Mermaid, and PDF export.

Open [the hosted editor](https://lab.cyx2009.top/md2slides/) or serve this directory with any static HTTP server.

Slides are separated by a line containing `---`. Choose **Manual** mode and insert `\\pause` to reveal content incrementally. The editor saves drafts in your browser's local storage.

## Regression tests

From this directory:

```sh
npm install
npx playwright install chromium
npm test
```

The browser tests cover nested `\\pause`, Markdown link parsing, Mermaid/URL HTML safety, image-only progressive steps, and empty-draft persistence, and PDF export lifecycle handling. Tests stub CDN dependencies so that they can run without external asset requests.

PDF export waits for Mermaid render callbacks, images and fonts before capturing pages. Print export keeps the printable DOM until `afterprint` (with a fallback timeout). If an export fails, an error message is shown and editor controls are restored. Rendering is still browser-dependent; verify the exported document before presenting.
