const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise the real browser scripts without a browser, network, or npm packages.
const browser = { URL, location: { origin: 'https://slides.test' } };
browser.window = browser;
vm.createContext(browser);
for (const file of ['vendor/markdown-it.min.js', 'math-plugin.js', 'markdown-renderer.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8'), browser);
}
const native = browser.markdownit({ html: false, linkify: false, breaks: false });
const render = source => browser.md2slidesMarkdown.render(source);

test('numeric entities retain their Unicode text outside tables', () => {
  for (const point of [0xE000, 0xE021, 0xE022, 0xE023, 0xE030]) {
    for (const entity of [`&#${point};`, `&#x${point.toString(16)};`, `&#X${point.toString(16).toUpperCase()};`]) {
      const source = 'before ' + entity + ' after';
      assert.equal(render(source), native.render(source), source);
    }
  }
});

test('all BMP private-use entities survive together with literal glyphs', () => {
  const points = Array.from({ length: 0x1900 }, (_, i) => 0xE000 + i);
  const entities = points.map(point => `&#x${point.toString(16)};`).join('');
  for (const source of ['entities ' + entities, 'mixed ' + entities + String.fromCodePoint(...points)])
    assert.ok(render(source) === native.render(source), 'BMP private-use text must match native entity decoding');
});

test('supplementary private-use entities survive when BMP markers are occupied', () => {
  const bmp = Array.from({ length: 0x1900 }, (_, i) => String.fromCodePoint(0xE000 + i)).join('');
  const source = bmp + ' &#xF0000; &#983041; &#x100000; &#1048577;';
  assert.ok(render(source) === native.render(source), 'supplementary entity text must survive marker fallback');
});

test('entity decoding follows native escape parity and remains single-pass', () => {
  for (let count = 0; count < 8; count++) {
    for (const entity of ['&#xE022;', '&#57379;', '&amp;#xE000;', '&amp;amp;#xE023;']) {
      const source = 'text ' + '\\'.repeat(count) + entity;
      assert.equal(render(source), native.render(source), source);
    }
  }
});

test('entities stay literal in code and opaque TeX', () => {
  const entities = '&#xE022; &#xE023; &#xE000;';
  for (const source of ['`' + entities + '`', '$' + entities + '$', '\\(' + entities + '\\)']) {
    const html = render(source);
    assert.ok(html.includes('&amp;#xE022; &amp;#xE023; &amp;#xE000;'), html);
  }
  const source = '~~~\n' + entities + '\n~~~';
  assert.ok(render(source).includes('<code>&amp;#xE022; &amp;#xE023; &amp;#xE000;</code>'));
});

test('table entity text stays distinct from protected pipes and backslashes', () => {
  const glyphs = String.fromCodePoint(0xE022, 0xE023, 0xE000);
  const source = [
    '| text | code | escaped |',
    '| --- | --- | --- |',
    '| &#xE022;&#57379;&#xE000; | `x|y` | a\\|b |'
  ].join('\n');
  const html = render(source);
  assert.equal((html.match(/<td>/g) || []).length, 3);
  assert.ok(html.includes('<td>' + glyphs + '</td>'), html);
  assert.ok(html.includes('<td><code>x|y</code></td>'), html);
  assert.ok(html.includes('<td>a|b</td>'), html);
});

test('entity text survives image alt, link title and list boundaries', () => {
  const html = render([
    '![\uE000\uE022](./image.png "&#xE023;")',
    '',
    '[&#xE000;](./link "&#xE022;&#xE023;")',
    '',
    '- first',
    '',
    '',
    '- &#xE000;'
  ].join('\n'));
  assert.ok(html.includes('alt="\uE000\uE022"'), html);
  assert.ok(html.includes('title="\uE023"'), html);
  assert.ok(html.includes('title="\uE022\uE023"'), html);
  assert.ok(html.includes('<li>\uE000</li>'), html);
  assert.equal((html.match(/<ul>/g) || []).length, 2);
});

test('marker allocation stays isolated across repeated renders', () => {
  for (const source of ['&#xE022;', '\uE022', '&#57379;', '&#xE000;', 'plain']) {
    assert.equal(render(source), native.render(source), source);
    assert.ok(render('| A | B |\n| --- | --- |\n| a\\|b | `c|d` |').includes('<code>c|d</code>'));
  }
});

test('legacy list continuations preserve multiline inline constructs', () => {
  for (const source of [
    '- [x] **one\n  two**',
    '- [x] `one\n  two`',
    '- [label](https://example.com\n  "title")',
    '- \\(one\n  two\\)'
  ]) {
    const html = render(source);
    if (source.includes('**')) assert.ok(html.includes('<strong>one\ntwo</strong>'), html);
    if (source.includes('`')) assert.ok(html.includes('<code>one two</code>'), html);
    if (source.includes('[label]')) assert.ok(html.includes('title="title"'), html);
    if (source.includes('\\(')) assert.ok(html.includes('\\(one\ntwo\\)'), html);
  }
  const html = render('- lead\n  follow **one\n  two**\n  last');
  assert.ok(html.includes('<p class="list-continuation">follow <strong>one\ntwo</strong> last</p>'), html);
});

test('root indented code retains marker-like text and indentation', () => {
  for (const source of ['    10. literal\n      continuation', '    -   literal\n        body']) {
    assert.equal(render(source).replace('pre class="code"', 'pre'), native.render(source).replace(/\n<\/code>/, '</code>'));
  }
});

test('display math cannot open list or fence preprocessing state', () => {
  const root = render('$$\n~~~\nx\n$$\n\n10. parent\n  - child\n- sibling');
  assert.ok(root.includes('<li>parent\n<ul>\n<li>child</li>\n</ul>\n</li>'), root);
  const nested = render('- parent\n  $$\n  ~~~\n  x\n  $$\n- sibling\n  - child');
  assert.ok(nested.includes('</li>\n<li>sibling\n<ul>\n<li>child</li>'), nested);
  const formula = '$$\n1. a\n\n\n5. b\n$$';
  assert.equal(render(formula), '<div class="katex-display-wrapper">' + formula + '</div>\n');
});

test('legacy child indentation follows the native marker content column', () => {
  for (const marker of ['-   ', '10.  ', '-\t', '10.\t']) {
    const html = render(marker + 'parent\n  - child\n- sibling');
    assert.ok(html.includes('parent\n<ul>\n<li>child</li>\n</ul>'), marker + '\n' + html);
  }
  // Extra marker padding also represents code, rather than arbitrary list text.
  const code = render('-     code\n\n  next');
  assert.ok(code.includes('<pre class="code"><code>code</code></pre>'), code);
});

test('non-ASCII separators and overlong ordered markers remain native text', () => {
  for (const source of ['-\u00a0text', '-\u2003text', '1234567890. ordinary\n  - child']) {
    assert.equal(render(source), native.render(source), source);
  }
});

test('table pipe protection preserves shortcut and collapsed reference identity', () => {
  for (const label of ['a `x|y`', 'a \\| b']) {
    for (const image of ['', '!']) {
      for (const suffix of ['', '[]']) {
        const source = ['| a | b |', '| --- | --- |', '| ' + image + '[' + label + ']' + suffix + ' | last |', '', '[' + label + ']: /dest "title"'].join('\n');
        const html = render(source);
        assert.equal((html.match(/<td>/g) || []).length, 2, source);
        assert.ok(html.includes(image ? 'src="/dest"' : 'href="/dest"'), source + '\n' + html);
        assert.ok(html.includes('title="title"'), source + '\n' + html);
      }
    }
  }
  const unsafe = render('| a | b |\n| --- | --- |\n| [a `x|y`] | last |\n\n[a `x|y`]: javascript:alert(1)');
  assert.ok(!unsafe.includes('<a '), unsafe);
});

test('list-owned indented code stays opaque to marker normalization', () => {
  const fixtures = [
    '- parent\n\n      alpha\n      10. literal\n        continuation\n\n- next',
    '- outer\n  - parent\n\n        alpha\n        10. literal\n          continuation\n\n  - next',
    '100. parent\n\n         alpha\n         10. literal\n           continuation\n\n101. next',
    '> - parent\n>\n>       alpha\n>       10. literal\n>         continuation\n>\n> - next'
  ];
  const codes = html => [...html.matchAll(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g)]
    .map(match => match[1].replace(/\n$/, ''));
  for (const source of fixtures) {
    const actual = render(source);
    assert.deepEqual(codes(actual), codes(native.render(source)), source + '\n' + actual);
    assert.ok(actual.includes('next'), actual);
  }
  const legacy = render('- parent\n      10. child\n- next');
  assert.ok(legacy.includes('<ol start="10">'), legacy);
});

test('math suffix fences keep raw code and following sibling ownership', () => {
  for (const prefix of ['', '- ', '100. ']) {
    const source = prefix + '$$x$$```js\n10. literal\n  continuation\n```\n' +
      (prefix ? '- next\n  - child' : 'after');
    const html = render(source);
    assert.ok(html.includes('<code class="language-js">10. literal\n  continuation</code>'), source + '\n' + html);
    if (prefix) assert.ok(html.includes('</li>\n</' + (prefix === '- ' ? 'ul' : 'ol') + '>') || html.includes('</li>\n<li>next'), html);
    assert.ok(html.includes(prefix ? 'next\n<ul>\n<li>child</li>' : '<p>after</p>'), html);
  }
});

test('math suffix ordered lists preserve legacy nested children', () => {
  for (const source of [
    '$$x$$10. parent\n  - child\n11. next',
    '- $$x$$10. parent\n    - child\n- next',
    '$$a$$$$b$$100. parent\n  - child\n101. next',
    '- $$a$$10. $$b$$100. parent\n      - child\n- next'
  ]) {
    const html = render(source);
    assert.ok(html.includes('parent\n<ul>\n<li>child</li>\n</ul>'), source + '\n' + html);
    assert.ok(html.includes('next'), html);
  }
});

test('quoted math suffixes do not leak list or fence state outside the quote', () => {
  const source = '> $$x$$~~~js\n> 10. literal\n>   continuation\n> ~~~\n\n10. parent\n  - child\n11. next';
  const html = render(source);
  assert.ok(html.includes('<blockquote>'), html);
  assert.ok(html.includes('<code class="language-js">10. literal\n  continuation</code>'), html);
  assert.ok(html.includes('parent\n<ul>\n<li>child</li>\n</ul>'), html);
  assert.ok(html.includes('</blockquote>\n<ol start="10">'), html);
});

test('a second formula cannot expose the first formula closing line as a list', () => {
  const source = '- $$\n  10. literal$$ $$b$$';
  const html = render(source);
  assert.ok(html.includes('<div class="katex-display-wrapper">$$\n10. literal$$</div>'), html);
  assert.equal((html.match(/class="katex-display-wrapper"/g) || []).length, 2, html);
  assert.ok(!html.includes('<ol'), html);
});
