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

The browser tests cover nested `\\pause`, Markdown link parsing, Mermaid/URL HTML safety, image-only progressive steps, and empty-draft persistence. Tests stub CDN dependencies so that they can run without external asset requests.

PDF export currently has separate render and print pipelines; see future work to await images, fonts, and Mermaid completion before exporting.
