const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const browser = { URL, location: { origin: 'https://slides.test' } };
browser.window = browser;
vm.createContext(browser);
for (const file of ['vendor/markdown-it.min.js', 'math-plugin.js', 'markdown-renderer.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8'), browser);
}
vm.runInContext(`
  native = markdownit({ html: false, linkify: false, breaks: false });
  withMath = markdownit({ html: false, linkify: false, breaks: false });
  withMath.use(md2slidesMathPlugin, { renderInlineMath: x => withMath.utils.escapeHtml(x) });
`, browser);
const render = source => browser.md2slidesMarkdown.render(source);

test('nested math-like link labels have bounded work in the plugin and adapter', () => {
  // Before probe memoization, even 30 repetitions take seconds and doubling
  // this input prevents the editor's main thread from returning. VM timeout
  // makes a regression fail without hanging the process or relying on timing.
  browser.source = '$['.repeat(80) + 'x' + '](/url)$'.repeat(80);
  const expected = browser.native.render(browser.source);
  const plugin = vm.runInContext('withMath.render(source)', browser, { timeout: 2000 });
  const adapter = vm.runInContext('md2slidesMarkdown.render(source)', browser, { timeout: 2000 });
  assert.equal(plugin, expected);
  assert.equal(adapter.replaceAll(' target="_blank" rel="noopener"', ''), expected);
});

test('thousands of math suffixes return without growing the parser stack', () => {
  for (const source of ['$$x$$ '.repeat(5000), '$$x$$ trailing\n\n'.repeat(5000)]) {
    browser.source = source;
    const html = vm.runInContext('md2slidesMarkdown.render(source)', browser, { timeout: 2000 });
    assert.equal((html.match(/class="katex-display-wrapper"/g) || []).length, 5000);
    if (source.includes('trailing')) assert.equal((html.match(/trailing/g) || []).length, 5000);
  }
});

test('bounded probes retain native links, images and opaque formula semantics', () => {
  const fixtures = [
    ['[label $a [x](/inner) b$](/outer)', '<a href="/outer"', '$a [x](/inner) b$'],
    ['[label $a ![x](/inner.png) b$](/outer)', '<a href="/outer"', '$a ![x](/inner.png) b$'],
    [String.raw`[label $\left(0,1\right](x)$](/outer)`, '<a href="/outer"', String.raw`$\left(0,1\right](x)$`],
    ['[label $x][ref]$](/outer)', '<a href="/outer"', '$x][ref]$'],
    ['[price $[0,1)][ref] then $x$\n\n[ref]: /ref', '<a href="/ref"', '$x$'],
    ['![formula $x$ and `code`](/image.png)', '<img src="/image.png"', 'alt="formula $x$ and code"'],
  ];
  for (const [source, ...needles] of fixtures) {
    const html = render(source);
    for (const needle of needles) assert.ok(html.includes(needle), source + '\n' + html);
  }
});

test('probe caches remain separate from actual inline parsing and other ranges', () => {
  // A probe ends inside the candidate formula, before the enclosing label.
  // Sharing the real parser's skip cache changes these code-span boundaries.
  const source = '[ `$x$`\\()\na$[$`](/outer)';
  assert.equal(render(source), '<p><a href="/outer" target="_blank" rel="noopener"> `$x$`()\na$[$`</a></p>\n');
  assert.equal(render('`$x$` then [docs](/docs)'), '<p><code>$x$</code> then <a href="/docs" target="_blank" rel="noopener">docs</a></p>\n');
});

test('unclosed list math cannot consume a following root paragraph or sibling formula', () => {
  for (const [open, close] of [['$$', '$$'], ['\\[', '\\]']]) {
    const root = render('- ' + open + '\n  x\n\nOutside\n' + close + '\nAfter');
    assert.ok(root.includes('</ul>\n<p>Outside'), root);
    assert.ok(!root.includes('katex-display-wrapper'), root);

    const sibling = render('- ' + open + '\n  x\n- ' + open + 'y' + close);
    assert.equal((sibling.match(/class="katex-display-wrapper"/g) || []).length, 1, sibling);
    assert.ok(sibling.includes('>' + open + 'y' + close + '</div>'), sibling);
  }
});

test('nested list math keeps unindented blank body lines and its Markdown suffix', () => {
  for (const [open, close] of [['$$', '$$'], ['\\[', '\\]']]) {
    const source = '- parent\n  - ' + open + '\n\n    x\n\n    ' + close + ' **bold**\n  after';
    const html = render(source);
    assert.ok(html.includes('>' + open + '\n\nx\n\n' + close + '</div>'), html);
    assert.ok(html.includes('<strong>bold</strong>'), html);
    assert.ok(html.includes('<p class="list-continuation">after</p>'), html);
    assert.equal((html.match(/<ul>/g) || []).length, 2, html);
  }
});

test('math suffix retains blockquote ownership and table code pipes', () => {
  const html = render('> $$x$$ | `a|b` | c |\n> |---|---|\n> | one | two |');
  assert.ok(html.includes('<blockquote>'), html);
  assert.ok(html.includes('<div class="katex-display-wrapper">$$x$$</div>'), html);
  assert.ok(html.includes('<table class="md-table">'), html);
  assert.ok(html.includes('<code>a|b</code>'), html);
});

test('math suffix keeps setext headings and multiline reference definitions', () => {
  for (const open of ['$$x$$', '$$\nx\n$$', '\\[x\\]']) {
    assert.ok(render(open + ' Heading\n===').includes('<h1>Heading</h1>'));
    const html = render(open + ' [ref]:\n  /docs\n\n[link][ref]');
    assert.ok(html.includes('<a href="/docs"'), html);
    assert.ok(!html.includes('[ref]:'), html);
  }
});

test('blank lines after a math suffix keep list paragraphs loose', () => {
  const html = render('- before\n  $$x$$ tail\n\n  after\n- sibling');
  assert.ok(html.includes('<p>before</p>'), html);
  assert.ok(html.includes('<p class="list-continuation">tail</p>'), html);
  assert.ok(html.includes('<p class="list-continuation">after</p>'), html);
  assert.ok(html.includes('<li>\n<p>sibling</p>'), html);
  const tight = render('- $$x$$ tail\n- sibling');
  assert.ok(tight.includes('<li>sibling</li>'), tight);
});

test('unmatched backtick runs have bounded work around and inside real tables', () => {
  const runs = Array.from({ length: 600 }, (_, i) => '`'.repeat(i + 1) + 'x').join(' ');
  for (const source of [
    runs + ' | tail\n\n| A | B |\n|---|---|\n| one | two |',
    '| A | B |\n|---|---|\n| one | ' + runs + ' \\| tail |',
  ]) {
    browser.source = source;
    const expected = browser.native.render(source).replaceAll('<table>', '<table class="md-table">');
    const html = vm.runInContext('md2slidesMarkdown.render(source)', browser, { timeout: 2000 });
    assert.equal(html, expected);
    assert.ok(html.includes('<table class="md-table">'));
  }
});

test('table code probes preserve run widths, escapes and nested label ranges', () => {
  const cells = [
    ['`a|b`', '<code>a|b</code>'],
    ['``a ` | b``', '<code>a ` | b</code>'],
    ['\\``a|b`', '`<code>a|b</code>'],
    ['[label `a|b`](/docs)', '<code>a|b</code></a>'],
    ['![caption ``a|b``](/image.png)', 'alt="caption a|b"'],
    ['[![nested `a|b`](/image.png)](/docs)', 'alt="nested a|b"'],
  ];
  for (const [cell, expected] of cells) {
    const html = render('| A | B |\n|---|---|\n| ' + cell + ' | tail |');
    assert.equal((html.match(/<td>/g) || []).length, 2, html);
    assert.ok(html.includes(expected), html);
    assert.ok(html.includes('<td>tail</td>'), html);
  }
});

test('indented math-like suffixes keep native code-block priority', () => {
  const wrappers = [source => source, source => '> ' + source,
    source => '- ' + source, source => '- parent\n  - ' + source];
  for (const formula of ['$$literal$$', '\\[literal\\]']) {
    for (const wrap of wrappers) {
      const html = render(wrap('$$x$$    ' + formula));
      assert.equal((html.match(/class="katex-display-wrapper"/g) || []).length, 1, html);
      assert.ok(html.includes('<pre class="code"><code>' + formula + '</code></pre>'), html);
      const ordinary = render(wrap('$$x$$   ' + formula));
      assert.equal((ordinary.match(/class="katex-display-wrapper"/g) || []).length, 2, ordinary);
      assert.ok(!ordinary.includes('<pre'), ordinary);
    }
    for (const prefix of ['', '> ']) {
      const html = render(prefix + '$$x$$\t' + formula);
      assert.equal((html.match(/class="katex-display-wrapper"/g) || []).length, 1, html);
      assert.ok(html.includes('<pre class="code"><code>' + formula + '</code></pre>'), html);
    }
  }
  const continued = render('$$x$$    $$literal$$\n    next line');
  assert.ok(continued.includes('<pre class="code"><code>$$literal$$\nnext line</code></pre>'), continued);
});
