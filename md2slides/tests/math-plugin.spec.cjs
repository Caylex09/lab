const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route =>
    new URL(route.request().url()).hostname === '127.0.0.1' ?
      route.continue() : route.fulfill({ status: 200, body: '' }));
  await page.goto('/');
});

test('math extension does not change native Markdown syntax when math is absent', async ({ page }) => {
  const fixtures = [
    'plain **bold** and _emphasis_',
    '[link](https://example.com/a(b)) and ![alt](https://example.com/b.png)',
    '[label][ref]\n\n[ref]: https://example.com/ref',
    '[a `code` label](https://example.com) text',
    '![image `code` caption](https://example.com/img.png)',
    '<https://example.com/path> and <foo@example.com>',
    'one \\*escaped* and ~~strike~~',
    '> quoted **text**',
    '- first\n- second',
    '| a | b |\n| --- | --- |\n| a \\| b | `x|y` |',
    '```js\nconst x = 1;\n```',
    'text [with `[literal]` code](https://example.com)',
    'text [one][a] and [two][b]\n\n[a]: https://example.com/a\n[b]: https://example.com/b'
  ];
  const result = await page.evaluate(sources => {
    const original = window.markdownit({ html: false, linkify: false, breaks: false });
    const withMath = window.markdownit({ html: false, linkify: false, breaks: false });
    withMath.use(window.md2slidesMathPlugin, {
      renderInlineMath: content => withMath.utils.escapeHtml(content)
    });
    return sources.map(source => ({ source, expected: original.render(source), actual: withMath.render(source) }));
  }, fixtures);
  expect(result.filter(x => x.actual !== x.expected)).toEqual([]);
});

test('math-like links remain opaque inside an outer link label', async ({ page }) => {
  const source = '[label $a [x](/inner) b$](/outer)';
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('href="/outer"');
  expect(html).toContain('$a [x](/inner) b$');
  expect(html).not.toContain('href="/inner"');
  const rendered = await page.evaluate(src => {
    const md = window.markdownit();
    md.use(window.md2slidesMathPlugin, { renderInlineMath: x => md.utils.escapeHtml(x) });
    return md.render(src);
  }, source);
  expect(rendered).toContain('href="/outer"');
  expect(rendered).not.toContain('href="/inner"');
});

test('math-like image syntax in a link label remains formula text', async ({ page }) => {
  const source = '[label $a ![x](/inner.png) b$](/outer)';
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('href="/outer"');
  expect(html).toContain('$a ![x](/inner.png) b$');
  expect(html).not.toContain('<img');
});

test('unclosed math cannot consume a reference link and the following formula', async ({ page }) => {
  const source = '[price $[0,1)][ref] then $x$\n\n[ref]: https://example.com/ref';
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('href="https://example.com/ref"');
  expect(html).toContain('$[0,1)');
  expect(html).toContain('$x$');
});

test('single-line display math leaves trailing emphasis and links to Markdown', async ({ page }) => {
  const html = await page.evaluate(() => window.md2slidesMarkdown.render('$$x$$ **bold** [docs](/d)'));
  expect(html).toContain('<div class="katex-display-wrapper">$$x$$</div>');
  expect(html).toContain('<strong>bold</strong>');
  expect(html).toContain('<a href="/d"');
  expect(html).not.toContain('$$x$$ **bold**');
});

test('multiline display math leaves closing-line Markdown outside the formula', async ({ page }) => {
  const source = '$$\nx+1\n$$ **bold** [docs](/d)';
  const html = await page.evaluate(s => window.md2slidesMarkdown.render(s), source);
  expect(html).toContain('<div class="katex-display-wrapper">$$\nx+1\n$$</div>');
  expect(html).toContain('<strong>bold</strong>');
  expect(html).toContain('<a href="/d"');
});

test('block math suffix may start a native Markdown heading', async ({ page }) => {
  const html = await page.evaluate(() => window.md2slidesMarkdown.render('$$x$$ # Heading'));
  expect(html).toContain('<div class="katex-display-wrapper">$$x$$</div>');
  expect(html).toContain('<h1>Heading</h1>');
});

test('locally closed TeX can contain raw link delimiters inside a link label', async ({ page }) => {
  const source = String.raw`[label $\left(0,1\right](x)$](/outer)`;
  const html = await page.evaluate(s => window.md2slidesMarkdown.render(s), source);
  expect(html).toContain('<a href="/outer"');
  expect(html).toContain(String.raw`$\left(0,1\right](x)$`);
  expect(html).not.toContain('href="x"');
});

test('locally closed TeX with reference-like bytes remains in outer link', async ({ page }) => {
  const source = '[label $x][ref]$](/outer)';
  const html = await page.evaluate(s => window.md2slidesMarkdown.render(s), source);
  expect(html).toContain('<a href="/outer"');
  expect(html).toContain('$x][ref]$');
});

test('display math suffix and following underline form one setext heading', async ({ page }) => {
  const html = await page.evaluate(() => window.md2slidesMarkdown.render('$$x$$ Heading\n==='));
  expect(html).toContain('<div class="katex-display-wrapper">$$x$$</div>');
  expect(html).toContain('<h1>Heading</h1>');
  expect(html).not.toContain('<p>Heading</p>');
});

test('multiline display math suffix continues with the following setext underline', async ({ page }) => {
  const html = await page.evaluate(() => window.md2slidesMarkdown.render('$$\nx\n$$ Heading\n---'));
  expect(html).toContain('<h2>Heading</h2>');
  expect(html).toContain('<div class="katex-display-wrapper">$$\nx\n$$</div>');
});

test('reference definition after display math may continue on the next source line', async ({ page }) => {
  const source = '$$x$$ [ref]:\n  https://example.com/reference\n\n[link][ref]';
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('<a href="https://example.com/reference"');
  expect(html).toContain('>link</a>');
  expect(html).not.toContain('[ref]:');
});

test('display math suffix keeps the same blockquote and paragraph continuation', async ({ page }) => {
  const source = '> $$x$$ quoted\n> continued';
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('<blockquote>');
  expect(html).toContain('<div class="katex-display-wrapper">$$x$$</div>');
  expect(html).toMatch(/<blockquote>[\s\S]*<p>quoted\ncontinued<\/p>[\s\S]*<\/blockquote>/);
});

test('display math suffix stays inside a list with its next source line', async ({ page }) => {
  const source = '- item\n  $$x$$ trailing\n  continues';
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('<ul>');
  expect(html).toContain('<div class="katex-display-wrapper">$$x$$</div>');
  expect(html).toMatch(/<li>[\s\S]*trailing\ncontinues[\s\S]*<\/li>/);
});
