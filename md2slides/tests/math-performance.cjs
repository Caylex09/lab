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

test('unclosed display-math probes have bounded block work, including dedent failures', () => {
  const lines = 1000;
  for (const source of [
    '\\[ x\n'.repeat(lines),
    '- \\[\n' + '  \\[ x\n'.repeat(lines) + '\nOutside\n\\]\n',
  ]) {
    browser.source = source;
    const result = vm.runInContext(`(() => {
      const md = markdownit({ html: false, linkify: false, breaks: false });
      md.use(md2slidesMathPlugin, { renderInlineMath: x => md.utils.escapeHtml(x) });
      const mathRule = md.block.ruler.__rules__.find(rule => rule.name === 'slide_math').fn;
      const states = new WeakSet();
      let reads = 0;
      md.block.ruler.at('slide_math', (state, ...args) => {
        if (!states.has(state)) {
          states.add(state);
          state.sCount = new Proxy(state.sCount, {
            get(target, key, receiver) {
              if (typeof key === 'string' && /^\\d+$/.test(key)) reads++;
              return Reflect.get(target, key, receiver);
            }
          });
        }
        return mathRule(state, ...args);
      }, { alt: ['paragraph', 'list'] });
      return { html: md.render(source), reads };
    })()`, browser, { timeout: 2000 });
    assert.ok(result.html === browser.native.render(source), 'unclosed math changed native output');
    assert.ok(result.reads < lines * 40, 'block indentation reads: ' + result.reads);
  }
});

test('thousands of unclosed display and inline openers retain native output without freezing', () => {
  const count = 4000;
  for (const source of [
    '\\[ x\n'.repeat(count),
    '> \\[ x\n'.repeat(count),
    '- \\[\n' + '  \\[ x\n'.repeat(count),
    '- \\[\n' + '  \\[ x\n'.repeat(count) + '\nOutside\n\\]\n',
    'text ' + '\\( x '.repeat(count),
    'text ' + '\\[ x '.repeat(count),
  ]) {
    browser.source = source;
    const expected = browser.native.render(source);
    const plugin = vm.runInContext('withMath.render(source)', browser, { timeout: 2000 });
    const adapter = vm.runInContext('md2slidesMarkdown.render(source)', browser, { timeout: 2000 });
    assert.ok(plugin === expected, 'unclosed math changed native output: ' + source.slice(0, 40));
    if (!source.startsWith('- ')) assert.ok(adapter === expected, 'unclosed math changed adapter output');
    else {
      assert.ok(!adapter.includes('katex-display-wrapper'), adapter.slice(0, 200));
      assert.equal((adapter.match(/\[ x/g) || []).length, count);
      assert.equal((adapter.match(/<ul>/g) || []).length, 1);
    }
  }
});

test('block closer facts honor the current end, container and virtual line view', () => {
  const result = vm.runInContext(`(() => {
    const md = markdownit();
    md.use(md2slidesMathPlugin, { renderInlineMath: x => md.utils.escapeHtml(x) });
    const rule = md.block.ruler.__rules__.find(item => item.name === 'slide_math').fn;
    const state = new md.block.State('  \\\\[a\\n  x\\n\\\\]\\n  \\\\]\\n', md, {}, []);
    state.blkIndent = 0;
    const shortEnd = rule(state, 0, 2, true);
    const fullEnd = rule(state, 0, 4, true);
    state.blkIndent = 2;
    const dedent = rule(state, 0, 4, true);
    state.blkIndent = 0;
    const rootView = rule(state, 0, 4, true);
    state.blkIndent = 2;
    state.bMarks[2] = state.eMarks[2];
    state.tShift[2] = 0;
    const emptyBoundaryView = rule(state, 0, 4, true);
    // A virtual opener can begin one dollar into an already-indexed run.
    const dollars = new md.block.State('$$$$$', md, {}, []);
    const firstRun = rule(dollars, 0, 1, true);
    dollars.bMarks[0] = 1;
    const overlappingRun = rule(dollars, 0, 1, true);
    return [shortEnd, fullEnd, dedent, rootView, emptyBoundaryView, firstRun, overlappingRun];
  })()`, browser);
  assert.deepEqual(Array.from(result), [false, true, false, true, true, true, true]);
});

test('closer indexes preserve suffixes and remain isolated across repeated document renders', () => {
  const fixtures = [
    ['\\[unfinished', 0, '<p>[unfinished</p>'],
    ['\\[a\\] \\[unfinished', 1, '<p>[unfinished</p>'],
    ['$$a$$\\[b\\]', 2, '>\\[b\\]</div>'],
    ['\\[a\\]$$b$$', 2, '>$$b$$</div>'],
    ['- \\[bad\n  x\n\nOutside\n\\[root\\]', 1, '</ul>\n<p>Outside</p>'],
    ['> \\[bad\n> \\[ x\n\n\\[root\\]', 1, '</blockquote>\n<div class="katex-display-wrapper">\\[root\\]</div>'],
    ['- \\[bad\n- \\[sibling\\]', 1, '>\\[sibling\\]</div>'],
    ['- parent\n  - \\[\n\n    x\n\n    \\] **tail**', 1, '<strong>tail</strong>'],
  ];
  for (let repeat = 0; repeat < 2; repeat++) {
    for (const [source, count, needle] of fixtures) {
      for (const html of [browser.withMath.render(source), render(source)]) {
        assert.equal((html.match(/class="katex-display-wrapper"/g) || []).length, count, source);
        assert.ok(html.includes(needle), source + '\n' + html);
      }
    }
  }
});

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
