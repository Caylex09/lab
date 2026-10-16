const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.mermaid = {
      initialize() {},
      render(_id, _src, callback) {
        callback('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      }
    };
  });
  // Third-party CDNs are intentionally unavailable in regression tests.
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      return route.fulfill({ status: 200, body: '' });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.locator('#paginationMode').selectOption('manual');
});

test('the pinned local markdown-it parser is available without CDNs', async ({ page }) => {
  const loaded = await page.evaluate(() => ({
    library: typeof window.markdownit,
    adapter: typeof window.md2slidesMarkdown?.render
  }));
  expect(loaded).toEqual({ library: 'function', adapter: 'function' });
  await page.locator('#markdownInput').fill('**Strong** and *emphasized* with ~~strike~~');
  await expect(page.locator('#currentSlide strong')).toHaveText('Strong');
  await expect(page.locator('#currentSlide em')).toHaveText('emphasized');
  await expect(page.locator('#currentSlide del')).toHaveText('strike');
});

test('raw HTML and unsafe Markdown URLs do not execute in slides', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '<img src=x onerror="window.markdownInjected=1">',
    '<script>window.markdownInjected=1</script>',
    '[bad](javascript:alert(1))',
    '![bad](data:text/html,<svg/onload=alert(1)>)'
  ].join('\n\n'));
  await expect(page.locator('#currentSlide script, #currentSlide img')).toHaveCount(0);
  await expect(page.locator('#currentSlide')).toContainText('<img src=x');
  expect(await page.evaluate(() => !!window.markdownInjected)).toBe(false);
  await expect(page.locator('#currentSlide a[href^="javascript:"]')).toHaveCount(0);
});

test('pipes and pause controls remain literal inside Markdown table code spans', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Header | Code |',
    '| --- | --- |',
    '| safe | ' + String.fromCharCode(96).repeat(2) + 'a | \\pause' +
      String.fromCharCode(96).repeat(2) + ' |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('td')).toHaveCount(2);
  await expect(table.locator('td code')).toHaveText('a | \\pause');
  await expect(table.locator('.pause-marker')).toHaveCount(0);
});

test('admonition rendering stays structural and does not enable input HTML', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '> [!WARNING] Risk **detected**',
    '> Avoid <img src=x onerror=alert(1)>.'
  ].join('\n'));
  const card = page.locator('#currentSlide .admonition.warning');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.admonition-title')).toHaveText('WARNING');
  await expect(card.locator('.admonition-content strong')).toHaveText('detected');
  await expect(card.locator('img')).toHaveCount(0);
});

test('Math and Mermaid are distinct child blocks inside a task list', async ({ page }) => {
  const fence = String.fromCharCode(96).repeat(3);
  await page.locator('#markdownInput').fill([
    '- [ ] Evaluate',
    '  $$',
    '  a^2 + b^2',
    '  $$',
    '    ' + fence + 'mermaid',
    '    graph LR',
    '    A --> B',
    '    ' + fence,
    '- [x] Done'
  ].join('\n'));
  const tasks = page.locator('#currentSlide > ul.task-list > li.task-item');
  await expect(tasks).toHaveCount(2);
  await expect(tasks.first().locator(':scope > .katex-display-wrapper')).toHaveCount(1);
  await expect(tasks.first().locator(':scope > .mermaid-render svg')).toHaveCount(1);
  await expect(tasks.nth(1).locator('input[type="checkbox"]')).toBeChecked();
});


test('fenced code keeps escaped pipes literally rather than treating them as table syntax', async ({ page }) => {
  const fence = String.fromCharCode(96).repeat(3);
  const source = String.raw`const literal = "\|";`;
  await page.locator('#markdownInput').fill([
    fence + 'js',
    source,
    fence
  ].join('\n'));
  await expect(page.locator('#currentSlide pre.code code')).toHaveText(source);
});

test('display math preserves TeX escaped vertical bars', async ({ page }) => {
  const formula = String.raw`\|x\|`;
  await page.locator('#markdownInput').fill([
    '$$',
    formula,
    '$$'
  ].join('\n'));
  await expect(page.locator('#currentSlide .katex-display-wrapper')).toContainText(formula);
});


test('list reset boundary does not hide authored thematic breaks', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '1. First',
    '',
    '',
    '5. Restart',
    '',
    '**************'
  ].join('\n'));
  await expect(page.locator('#currentSlide > ol')).toHaveCount(2);
  await expect(page.locator('#currentSlide > ol').last()).toHaveAttribute('start', '5');
  await expect(page.locator('#currentSlide > hr')).toHaveCount(1);
});


test('dollar inline math preserves TeX escapes and never triggers pause markers', async ({ page }) => {
  const examples = [
    String.raw`$\{x\}$`,
    String.raw`$x\|y$`,
    String.raw`$x\_y$`,
    String.raw`$x\pause y$`
  ];
  await page.locator('#markdownInput').fill(examples.join(' and '));
  const slide = page.locator('#currentSlide');
  for (const formula of examples) await expect(slide).toContainText(formula);
  await expect(slide.locator('.pause-marker')).toHaveCount(0);
  await expect(page.locator('#slideTotal')).toHaveText('1');
});

test('a math expression with pipes stays in one table cell with literal TeX', async ({ page }) => {
  const formula = String.raw`$x\|y$`;
  await page.locator('#markdownInput').fill([
    '| Variable | Expression |',
    '| --- | --- |',
    '| x | ' + formula + ' |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('tbody td')).toHaveCount(2);
  await expect(table.locator('tbody td').last()).toHaveText(formula);
});

test('non-web external protocol links do not bypass the legacy allowlist', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '[intent](intent://open/settings)',
    '[smb](smb://host/path)',
    '[ftp](ftp://files.example.com/x)',
    '[web](https://example.com/)',
    '[relative](./readme.md)',
    '[email](mailto:test@example.com)'
  ].join(' '));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a')).toHaveCount(3);
  await expect(slide.locator('a[href^="https:"]')).toHaveCount(1);
  await expect(slide.locator('a[href^="mailto:"]')).toHaveCount(1);
  await expect(slide.locator('a[href^="intent:"], a[href^="ftp:"], a[href^="smb:"]')).toHaveCount(0);
  await expect(slide).toContainText('intent');
  await expect(slide).toContainText('smb');
});


test('code fences preserve actual tab indentation in their contents', async ({ page }) => {
  const fence = String.fromCharCode(96).repeat(3);
  await page.locator('#markdownInput').fill([
    fence + 'js',
    '\tfoo()',
    fence
  ].join('\n'));
  await expect(page.locator('#currentSlide pre.code code')).toHaveText('\tfoo()');
});

test('display math containing literal tilde fence lines is not cut short', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '$$',
    '~~~~~',
    '~~~~~~~',
    '$$'
  ].join('\n'));
  const formula = page.locator('#currentSlide .katex-display-wrapper');
  await expect(formula).toHaveCount(1);
  await expect(formula).toContainText('~~~~~');
  await expect(formula).toContainText('~~~~~~~');
  await expect(page.locator('#currentSlide pre.code')).toHaveCount(0);
});


test('parenthesized TeX preserves escaped pipes in paragraphs and table cells', async ({ page }) => {
  const formula = '\\(x\\|y\\)';
  await page.locator('#markdownInput').fill([
    'Formula: ' + formula,
    '',
    '| Item | Expression |',
    '| --- | --- |',
    '| One | ' + formula + ' |'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  const table = slide.locator('table.md-table');
  // Wait for the editor's asynchronous preview update before reading paragraphs.
  await expect(table.locator('tbody td')).toHaveCount(2);
  await expect(slide.locator(':scope > p')).toContainText(formula);
  await expect(table.locator('tbody td').last()).toHaveText(formula);
});

test('escaped currency dollar signs cannot swallow Markdown table columns', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Cost | Note | Label |',
    '| --- | --- | --- |',
    '| \\$5 | middle $ value | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText('$5');
  await expect(cells.nth(1)).toHaveText('middle $ value');
  await expect(cells.nth(2)).toHaveText('last');
});

test('ordinary tab-indented blocks still parse as code, not prose', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    'Intro',
    '',
    '\tconst x = 1'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  // Await the new code block so we don't inspect the initial welcome content.
  await expect(slide.locator(':scope > pre.code code')).toHaveText('const x = 1');
  await expect(slide.locator(':scope > p')).toHaveText('Intro');
  await expect(slide.locator(':scope > p')).not.toContainText('const x = 1');
});


test('an unmatched dollar cannot close inside a later inline-code table cell', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | ' + tick + 'x$y' + tick + ' | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText('$5');
  await expect(cells.nth(1).locator('code')).toHaveText('x$y');
  await expect(cells.nth(2)).toHaveText('last');
});

test('double-backtick code spans do not close earlier dollar math in tables', async ({ page }) => {
  const ticks = String.fromCharCode(96).repeat(2);
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | ' + ticks + 'x $ y' + ticks + ' | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText('$5');
  await expect(cells.nth(1).locator('code')).toHaveText('x $ y');
  await expect(cells.nth(2)).toHaveText('last');
});

test('a real math closer after code still preserves all formula content', async ({ page }) => {
  const ticks = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '| Name | Expression |',
    '| --- | --- |',
    '| x | $x' + ticks + 'y$z' + ticks + '+1$ |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(2);
  await expect(cells.nth(1)).toContainText('$x');
  await expect(cells.nth(1)).toContainText('+1$');
});


test('nested unordered fenced code retains the original leading tab', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- item',
    '  ~~~',
    '\tfoo()',
    '  ~~~',
    '- sibling'
  ].join('\n'));
  const items = page.locator('#currentSlide > ul > li');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator(':scope > pre.code code')).toHaveText('\tfoo()');
});

test('wide ordered list markers keep tabbed fences inside their list items', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '100. item',
    '  ~~~javascript',
    '\tfoo()',
    '  ~~~',
    '101. sibling'
  ].join('\n'));
  const items = page.locator('#currentSlide > ol > li');
  await expect(items).toHaveCount(2);
  await expect(page.locator('#currentSlide > ol')).toHaveAttribute('start', '100');
  await expect(items.first().locator(':scope > pre.code code')).toHaveText('\tfoo()');
});

test('deep nested fenced code retains its literal tab and list ownership', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child',
    '    ~~~',
    '\tfoo()',
    '    ~~~',
    '- Sibling'
  ].join('\n'));
  const items = page.locator('#currentSlide > ul > li');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator(':scope > ul > li > pre.code code')).toHaveText('\tfoo()');
});

test('dollar signs inside link destinations do not merge table cells', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | [price](https://example.com/$offer) | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText('$5');
  await expect(cells.nth(1).locator('a')).toHaveAttribute('href', 'https://example.com/$offer');
  await expect(cells.nth(2)).toHaveText('last');
});

test('image destinations and nested URL parentheses cannot close a preceding dollar', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| A | B | C |',
    '| --- | --- | --- |',
    '| $5 | ![price](https://example.com/asset$offer.png) | last |',
    '| $6 | [price](https://example.com/($offer)) | after |'
  ].join('\n'));
  const rows = page.locator('#currentSlide table.md-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator('td')).toHaveCount(3);
  await expect(rows.first().locator('td').nth(1).locator('img')).toHaveAttribute('alt', 'price');
  await expect(rows.nth(1).locator('td')).toHaveCount(3);
  await expect(rows.nth(1).locator('td').last()).toHaveText('after');
});


test('angle-bracket URL autolinks with dollar signs keep table columns separate', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | <https://example.com/$offer> | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText('$5');
  await expect(cells.nth(1).locator('a')).toHaveAttribute('href', 'https://example.com/$offer');
  await expect(cells.nth(2)).toHaveText('last');
});

test('email autolinks with dollars do not close unmatched inline math', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | <cost$offer@example.com> | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText('$5');
  await expect(cells.nth(1).locator('a')).toHaveAttribute('href', 'mailto:cost$offer@example.com');
  await expect(cells.nth(2)).toHaveText('last');
});

test('autolink dollars do not prevent real math from closing afterwards', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Name | Expression |',
    '| --- | --- |',
    '| x | $a <https://example.com/$offer> + b$ |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(2);
  await expect(cells.nth(1)).toContainText('$a');
  await expect(cells.nth(1)).toContainText('+ b$');
});


test('single-label email autolink does not close table math or shift cells', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | <cost$offer@example> | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.first()).toHaveText('$5');
  await expect(cells.nth(1).locator('a')).toHaveAttribute('href', 'mailto:cost$offer@example');
  await expect(cells.last()).toHaveText('last');
});

test('ordered list markers stay literal rather than becoming task checkboxes', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '1. [ ] Keep literal',
    '2. [x] Also literal'
  ].join('\n'));
  const list = page.locator('#currentSlide > ol');
  await expect(list.locator(':scope > li')).toHaveCount(2);
  await expect(list.locator(':scope > li').first()).toContainText('[ ] Keep literal');
  await expect(list.locator(':scope > li').nth(1)).toContainText('[x] Also literal');
  await expect(list.locator('input[type="checkbox"], li.task-item')).toHaveCount(0);
});

test('a bullet list continuation beginning with [ ] is not a new task', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- First',
    '',
    '  [ ] This is explanatory text',
    '- Next'
  ].join('\n'));
  const first = page.locator('#currentSlide > ul > li').first();
  await expect(first.locator(':scope > p.list-continuation')).toHaveText('[ ] This is explanatory text');
  await expect(page.locator('#currentSlide ul.task-list, #currentSlide li.task-item')).toHaveCount(0);
  await expect(page.locator('#currentSlide input[type="checkbox"]')).toHaveCount(0);
});

test('nested bullet tasks still render while ordered tasks remain literal', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - [x] Child task',
    '  - [ ] Pending child',
    '1. [ ] Ordered label'
  ].join('\n'));
  const nested = page.locator('#currentSlide > ul > li > ul.task-list');
  await expect(nested.locator(':scope > li.task-item')).toHaveCount(2);
  await expect(nested.locator('input[type="checkbox"]').first()).toBeChecked();
  const ordered = page.locator('#currentSlide > ol > li');
  await expect(ordered).toHaveText('[ ] Ordered label');
  await expect(ordered.locator('input[type="checkbox"]')).toHaveCount(0);
});


test('blockquote nested in bullet item keeps task-like text literal', async ({ page }) => {
  await page.locator('#markdownInput').fill('- > [ ] quoted text');
  const item = page.locator('#currentSlide > ul > li');
  await expect(item).toHaveCount(1);
  await expect(item.locator(':scope > blockquote')).toContainText('[ ] quoted text');
  await expect(item.locator('input[type="checkbox"], .task-item')).toHaveCount(0);
  await expect(item).not.toHaveClass(/task-item/);
});

test('quoted task marker after a leading paragraph does not convert its item', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- First',
    '',
    '  > [x] quoted continuation',
    '  > another line',
    '- Next'
  ].join('\n'));
  const item = page.locator('#currentSlide > ul > li').first();
  await expect(item.locator(':scope > blockquote')).toContainText('[x] quoted continuation');
  await expect(item.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(item).not.toHaveClass(/task-item/);
});

test('task item nested in a bullet list is still recognized from direct paragraph', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  > quoted text',
    '  - [x] Child task',
    '  - [ ] Other child'
  ].join('\n'));
  const nested = page.locator('#currentSlide > ul > li > ul.task-list');
  await expect(nested.locator(':scope > li.task-item')).toHaveCount(2);
  await expect(nested.locator('input[type="checkbox"]').first()).toBeChecked();
  await expect(page.locator('#currentSlide > ul > li').first()).not.toHaveClass(/task-item/);
});

test('blockquote paragraphs are not split into list-continuation paragraphs', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- > Quoted first line',
    '  > quoted second line',
    '- Sibling'
  ].join('\n'));
  const quote = page.locator('#currentSlide > ul > li').first().locator(':scope > blockquote');
  await expect(quote).toContainText('Quoted first line');
  await expect(quote).toContainText('quoted second line');
  await expect(quote.locator('p.list-continuation')).toHaveCount(0);
});


test('a first blockquote prevents later direct paragraphs from becoming tasks', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- > Quote comes first',
    '',
    '  [ ] This must stay text'
  ].join('\n'));
  const item = page.locator('#currentSlide > ul > li');
  await expect(item.locator(':scope > blockquote')).toContainText('Quote comes first');
  await expect(item.locator(':scope > p')).toHaveText('[ ] This must stay text');
  await expect(item.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(item).not.toHaveClass(/task-item/);
});

test('a first fenced block prevents a later paragraph from becoming a task', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- ~~~',
    '  code body',
    '  ~~~',
    '',
    '  [x] This must stay text'
  ].join('\n'));
  const item = page.locator('#currentSlide > ul > li');
  await expect(item.locator(':scope > pre.code code')).toHaveText('code body');
  await expect(item.locator(':scope > p')).toHaveText('[x] This must stay text');
  await expect(item.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(item).not.toHaveClass(/task-item/);
});


test('resolved reference-style links with dollars do not swallow table cells', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | [price][cost$offer] | last |',
    '',
    '[cost$offer]: https://example.com/pricing'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText('$5');
  await expect(cells.nth(1).locator('a')).toHaveAttribute('href', 'https://example.com/pricing');
  await expect(cells.nth(2)).toHaveText('last');
});

test('shortcut and collapsed reference links use upstream reference definitions', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| $5 | [cost$offer] | last |',
    '| $6 | [cost$offer][] | more |',
    '',
    '[cost$offer]: https://example.com/pricing'
  ].join('\n'));
  const rows = page.locator('#currentSlide table.md-table tbody tr');
  await expect(rows).toHaveCount(2);
  for (const [index, price, ending] of [[0, '$5', 'last'], [1, '$6', 'more']]) {
    await expect(rows.nth(index).locator('td')).toHaveCount(3);
    await expect(rows.nth(index).locator('td').first()).toHaveText(price);
    await expect(rows.nth(index).locator('td').nth(1).locator('a')).toHaveAttribute('href', 'https://example.com/pricing');
    await expect(rows.nth(index).locator('td').last()).toHaveText(ending);
  }
});

test('a list-item reference definition cannot turn later prose into a checkbox', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ref]: /target',
    '',
    '  [ ] later text'
  ].join('\n'));
  const item = page.locator('#currentSlide > ul > li');
  await expect(item).toContainText('[ ] later text');
  await expect(item.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(item).not.toHaveClass(/task-item/);
});

test('a real leading task checkbox still renders next to reference definitions', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [x] Task',
    '- ordinary',
    '',
    '[ref]: /target'
  ].join('\n'));
  const items = page.locator('#currentSlide > ul > li');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator('input[type="checkbox"]')).toBeChecked();
  await expect(items.last().locator('input[type="checkbox"]')).toHaveCount(0);
});

test('rejected image protocols keep escaped alt text without any img element', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '![diagram](ftp://host/image.png)',
    '',
    '![**warning**](javascript:alert(1))',
    '',
    '![<img src=x onerror=alert(1)>](ftp://host/image.png)'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  // Exact text assertions catch a rejected URL leaking literal Markdown
  // syntax: ![**warning**](javascript:...) must render as 'warning' only.
  await expect(slide.locator(':scope > p')).toHaveText([
    'diagram', 'warning', '<img src=x onerror=alert(1)>'
  ]);
  await expect(slide.locator('img, script')).toHaveCount(0);
});


test('unsafe image destinations use only safely escaped alt text', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '![**important** & <b>](javascript:alert(1))',
    '',
    '![preview](data:text/html,%3Cscript%3Ealert(1)%3C/script%3E)',
    '',
    '[unsafe link](javascript:alert(1))'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > p')).toHaveText([
    'important & <b>', 'preview', 'unsafe link'
  ]);
  await expect(slide.locator('a, img, b, script')).toHaveCount(0);
});

test('render-time safety check still allows ordinary HTTPS links and images', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '[documentation](https://example.com/manual)',
    '',
    '![diagram](https://example.com/diagram.png)'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  // Wait for the editor to replace its initial welcome slide.
  const link = slide.locator('a[href="https://example.com/manual"]');
  await expect(link).toHaveCount(1);
  const image = slide.locator('img[src="https://example.com/diagram.png"]');
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute('alt', 'diagram');
});


test('fenced code in a blockquote preserves a literal escaped pipe', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '> ~~~',
    '> \\|',
    '> ~~~'
  ].join('\n'));
  const code = page.locator('#currentSlide > blockquote pre.code code');
  await expect(code).toHaveText('\\|');
  await expect(page.locator('#currentSlide table.md-table')).toHaveCount(0);
});

test('nested blockquotes and list-owned blockquote fences keep code escapes', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Item',
    '  > > ~~~js',
    '  > > const pipe = "\\\\|";',
    '  > > ~~~',
    '- Next'
  ].join('\n'));
  const items = page.locator('#currentSlide > ul > li');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator('blockquote blockquote pre.code code'))
    .toHaveText('const pipe = "\\\\|";');
});

test('blockquote tables still preserve pipes inside inline code spans', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '> | Code | Name |',
    '> | --- | --- |',
    '> | ' + tick + 'a | b' + tick + ' | correct |'
  ].join('\n'));
  const cells = page.locator('#currentSlide > blockquote table.md-table tbody td');
  await expect(cells).toHaveCount(2);
  await expect(cells.first().locator('code')).toHaveText('a | b');
  await expect(cells.last()).toHaveText('correct');
});

test('indented code blocks retain backslash-pipe outside table preprocessing', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    'Intro',
    '',
    '    \\|',
    '    x'
  ].join('\n'));
  await expect(page.locator('#currentSlide pre.code code')).toHaveText('\\|\nx');
});


test('escaped inline backtick does not swallow following table separators', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '| First | Second | Third |',
    '| --- | --- | --- |',
    '| \\' + tick + 'a | b' + tick + ' | last |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toHaveText(tick + 'a');
  await expect(cells.nth(1)).toHaveText('b' + tick);
  await expect(cells.nth(2)).toHaveText('last');
});

test('four-space-indented dollar display delimiters stay literal code', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '    $$',
    '    x + y',
    '    $$'
  ].join('\n'));
  await expect(page.locator('#currentSlide > pre.code code')).toHaveText('$$\nx + y\n$$');
  await expect(page.locator('#currentSlide .katex-display-wrapper')).toHaveCount(0);
});

test('indented bracket math delimiters stay literal code', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '    \\[',
    '    z = 4',
    '    \\]'
  ].join('\n'));
  await expect(page.locator('#currentSlide > pre.code code')).toHaveText('\\[\nz = 4\n\\]');
  await expect(page.locator('#currentSlide .katex-display-wrapper')).toHaveCount(0);
});

test('unindented dollar display math still uses the math renderer', async ({ page }) => {
  await page.locator('#markdownInput').fill('$$\nx+y\n$$');
  await expect(page.locator('#currentSlide .katex-display-wrapper')).toContainText('x+y');
  await expect(page.locator('#currentSlide pre.code')).toHaveCount(0);
});


test('display math inside blockquotes keeps escaped TeX pipes opaque', async ({ page }) => {
  const formula = String.raw`x \| y`;
  await page.locator('#markdownInput').fill([
    '> $$',
    '> ' + formula,
    '> $$'
  ].join('\n'));
  const quoted = page.locator('#currentSlide > blockquote');
  await expect(quoted.locator('.katex-display-wrapper')).toHaveCount(1);
  await expect(quoted.locator('.katex-display-wrapper')).toContainText(formula);
});

test('admonition display math retains escaped TeX pipes', async ({ page }) => {
  const formula = String.raw`\|z\|`;
  await page.locator('#markdownInput').fill([
    '> [!NOTE] Formula',
    '>',
    '> $$',
    '> ' + formula,
    '> $$'
  ].join('\n'));
  const admonition = page.locator('#currentSlide .admonition.note');
  await expect(admonition.locator('.katex-display-wrapper')).toHaveCount(1);
  await expect(admonition.locator('.katex-display-wrapper')).toContainText(formula);
});


test('invalid backtick fence info cannot swallow a following sibling list item', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '- first',
    '  ' + tick.repeat(3) + 'foo' + tick,
    '- second'
  ].join('\n'));
  const items = page.locator('#currentSlide > ul > li');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('foo');
  await expect(items.nth(1)).toHaveText('second');
  await expect(items.first().locator('pre.code')).toHaveCount(0);
});

test('valid tilde fence info with backticks still keeps its body opaque', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '- first',
    '  ~~~lang' + tick,
    '  - not a nested item',
    '  ~~~',
    '- second'
  ].join('\n'));
  const items = page.locator('#currentSlide > ul > li');
  await expect(items).toHaveCount(2);
  await expect(items.first().locator('pre.code code')).toHaveText('- not a nested item');
  await expect(items.nth(1)).toHaveText('second');
});

test('table escaped pipes stay plain Markdown outside math, and TeX inside math', async ({ page }) => {
  const formula = String.raw`$a\|b$`;
  await page.locator('#markdownInput').fill([
    '| Plain | Math | Code |',
    '| --- | --- | --- |',
    '| a\\|b | ' + formula + ' | ' + String.fromCharCode(96) + 'c | d' + String.fromCharCode(96) + ' |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.first()).toHaveText('a|b');
  await expect(cells.nth(1)).toHaveText(formula);
  await expect(cells.last().locator('code')).toHaveText('c | d');
});

test('obsolete synthetic math fence name now renders as ordinary code', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '~~~md2slides-display-math',
    String.raw`\|x\|`,
    '~~~'
  ].join('\n'));
  await expect(page.locator('#currentSlide > pre.code code')).toHaveText(String.raw`\|x\|`);
  await expect(page.locator('#currentSlide .katex-display-wrapper')).toHaveCount(0);
});

test('unmatched price dollar does not swallow inline Markdown link destination', async ({ page }) => {
  await page.locator('#markdownInput').fill('$5 [price](https://example.com/$offer)');
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/$offer"]')).toHaveCount(1);
  await expect(slide).toContainText('$5 price');
});

test('unmatched dollar does not consume following Markdown image or autolink', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '$5 ![price](https://example.com/$offer.png)',
    '',
    '$6 <https://example.com/$offers>'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img')).toHaveAttribute('src', 'https://example.com/$offer.png');
  await expect(slide.locator('a')).toHaveAttribute('href', 'https://example.com/$offers');
  await expect(slide).toContainText('$6');
});

test('reference links containing dollars do not close preceding math', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '$5 [cost$offer][cost]',
    '',
    '[cost]: https://example.com/pricing'
  ].join('\n'));
  const link = page.locator('#currentSlide');
  await expect(link.locator('a[href="https://example.com/pricing"]')).toHaveCount(1);
  await expect(page.locator('#currentSlide')).toContainText('$5 cost$offer');
});

test('inline math may include Markdown-looking links with dollar in the destination', async ({ page }) => {
  const math = '$a [price](https://example.com/$offer) + b$';
  await page.locator('#markdownInput').fill(math);
  const slide = page.locator('#currentSlide');
  await expect(slide).toContainText(math);
  await expect(slide.locator('a')).toHaveCount(0);
});

test('unmatched dollar and linked prices preserve table cell boundaries', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Cost | URL | Last |',
    '| --- | --- | --- |',
    '| $5 | [price](https://example.com/$offer) | after |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(3);
  await expect(cells.first()).toHaveText('$5');
  await expect(cells.nth(1).locator('a')).toHaveAttribute('href', 'https://example.com/$offer');
  await expect(cells.last()).toHaveText('after');
});


test('adjacent dollar formulas keep Markdown links inside the second formula', async ({ page }) => {
  const source = '$a$$[x](https://example.com)$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  // Array form retries while the initial sample's multiple paragraphs remain.
  await expect(slide.locator(':scope > p')).toHaveText([source]);
  await expect(slide.locator('a')).toHaveCount(0);
  const html = await page.evaluate(text => window.md2slidesMarkdown.render(text), source);
  expect(html).not.toContain('<a ');
  expect(html).toContain('$a$$[x](https://example.com)$');
});

test('adjacent dollar formulas keep pause controls opaque', async ({ page }) => {
  const source = String.raw`$a$$\pause b$`;
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  // Array form retries while the initial sample's multiple paragraphs remain.
  await expect(slide.locator(':scope > p')).toHaveText([source]);
  await expect(slide.locator('.pause-marker')).toHaveCount(0);
  await expect(page.locator('#slideTotal')).toHaveText('1');
});

test('dollar formulas adjacent in table cells stay separate math tokens', async ({ page }) => {
  const source = String.raw`$a$$x\|y$`;
  await page.locator('#markdownInput').fill([
    '| A | B |',
    '| --- | --- |',
    '| one | ' + source + ' |'
  ].join('\n'));
  const cells = page.locator('#currentSlide table.md-table tbody td');
  await expect(cells).toHaveCount(2);
  await expect(cells.last()).toHaveText(source);
  await expect(page.locator('#currentSlide .pause-marker')).toHaveCount(0);
});

test('unmatched price dollar inside a link label cannot cross its inline boundary', async ({ page }) => {
  const source = '[price $5](https://example.com/shop) then $x$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  const link = slide.locator('a[href="https://example.com/shop"]');
  await expect(link).toHaveText('price $5');
  await expect(slide.locator(':scope > p')).toHaveText(['price $5 then $x$']);
  expect(await page.evaluate(src => window.md2slidesMarkdown.render(src), source))
    .toContain('href="https://example.com/shop"');
});

test('image alt dollar stays inside label while later math is rendered', async ({ page }) => {
  const source = '![price $5](https://example.com/item.png) then $x$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  const img = slide.locator('img[src="https://example.com/item.png"]');
  await expect(img).toHaveAttribute('alt', 'price $5');
  await expect(slide).toContainText('then $x$');
});

test('reference links with a literal price in label do not swallow following math', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '[cost $5][item] then $x$',
    '',
    '[item]: https://example.com/shop'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/shop"]')).toHaveText('cost $5');
  await expect(slide.locator(':scope > p')).toHaveText(['cost $5 then $x$']);
});

test('actual inline math inside link text still closes before the label boundary', async ({ page }) => {
  const source = '[formula $x$](https://example.com/formula) then $y$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/formula"]')).toHaveText('formula $x$');
  await expect(slide.locator(':scope > p')).toHaveText(['formula $x$ then $y$']);
});

test('bracketed TeX inside a link label remains a link', async ({ page }) => {
  const source = '[formula $[x]$](https://example.com/formula) then $y$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/formula"]')).toHaveText('formula $[x]$');
  await expect(slide.locator(':scope > p')).toHaveText(['formula $[x]$ then $y$']);
});

test('half-open TeX interval brackets stay inside a native link label', async ({ page }) => {
  const source = '[range $[0,1)$](https://example.com/range) then $x$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/range"]')).toHaveText('range $[0,1)$');
  await expect(slide.locator(':scope > p')).toHaveText(['range $[0,1)$ then $x$']);
});

test('unclosed parenthesized TeX in a link label does not consume later math', async ({ page }) => {
  const source = String.raw`[price \(5](https://example.com/shop) then \(x\)`;
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/shop"]')).toHaveText('price (5');
  await expect(slide.locator(':scope > p')).toHaveText([String.raw`price (5 then \(x\)`]);
});

test('unclosed bracketed TeX in an image label does not swallow later math', async ({ page }) => {
  const source = String.raw`![price \[5](https://example.com/price.png) then \[x\]`;
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img[src="https://example.com/price.png"]'))
    .toHaveAttribute('alt', 'price 5');
  await expect(slide).toContainText(String.raw`then \[x\]`);
});

test('unbalanced square bracket inside dollar math does not break an image label', async ({ page }) => {
  const source = '![range $[0,1)$](https://example.com/range.png) then $y$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img[src="https://example.com/range.png"]'))
    .toHaveAttribute('alt', 'range $[0,1)$');
  await expect(slide).toContainText('then $y$');
});

test('bracketed TeX inside a link label is still treated as opaque math', async ({ page }) => {
  const source = String.raw`[range \([0,1)\)](https://example.com/range)`;
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/range"]'))
    .toHaveText(String.raw`range \([0,1)\)`);
});

test('half-open TeX with a fake Markdown-link prefix stays math outside labels', async ({ page }) => {
  const source = '$[0,1)$ and $[x]$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > p')).toHaveText([source]);
  await expect(slide.locator('a')).toHaveCount(0);
});

test('image alt preserves inline TeX and TeX backslash escapes', async ({ page }) => {
  const formula = String.raw`$x\|y$`;
  await page.locator('#markdownInput').fill('![math ' + formula + '](https://example.com/math.png)');
  await expect(page.locator('#currentSlide img[src="https://example.com/math.png"]'))
    .toHaveAttribute('alt', 'math ' + formula);
});

test('rejected image URL still safely displays math in alt text', async ({ page }) => {
  const formula = '$[0,1)$';
  await page.locator('#markdownInput').fill('![range ' + formula + '](javascript:alert(1))');
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > p')).toHaveText(['range ' + formula]);
  await expect(slide.locator('img')).toHaveCount(0);
});

test('an unmatched TeX interval cannot swallow a link label closer', async ({ page }) => {
  const source = '[price $[0,1)](https://example.com/shop) then $x$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/shop"]')).toHaveText('price $[0,1)');
  await expect(slide.locator(':scope > p')).toHaveText(['price $[0,1) then $x$']);
});

test('an unmatched TeX interval cannot swallow an image label closer', async ({ page }) => {
  const source = '![price $[0,1)](https://example.com/price.png) then $x$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img[src="https://example.com/price.png"]'))
    .toHaveAttribute('alt', 'price $[0,1)');
  await expect(slide).toContainText('then $x$');
});

test('root tab-indented unordered list markers stay indented code', async ({ page }) => {
  await page.locator('#markdownInput').fill('Intro\n\n\t- literal');
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('pre.code code')).toHaveText('- literal');
  await expect(slide.locator('ul')).toHaveCount(0);
});

test('root tab-indented ordered list markers stay indented code', async ({ page }) => {
  await page.locator('#markdownInput').fill('Intro\n\n\t1. literal');
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('pre.code code')).toHaveText('1. literal');
  await expect(slide.locator('ol')).toHaveCount(0);
});

test('tab-indented markers inside a parent list still use legacy nesting', async ({ page }) => {
  await page.locator('#markdownInput').fill('- parent\n\t- child');
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('ul > li > ul > li')).toHaveText('child');
  await expect(slide.locator('pre.code')).toHaveCount(0);
});


test('reference labels with unmatched interval markers remain links', async ({ page }) => {
  const source = '[price $[0,1)][ref] then $x$' + '\n\n' + '[ref]: https://example.com/shop';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/shop"]')).toHaveText('price $[0,1)');
  await expect(slide.locator(':scope > p')).toHaveText(['price $[0,1) then $x$']);
});

test('reference image labels with unmatched intervals preserve alt', async ({ page }) => {
  const source = '![price $[0,1)][img] then $x$' + '\n\n' + '[img]: https://example.com/p.png';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img[src="https://example.com/p.png"]')).toHaveAttribute('alt', 'price $[0,1)');
  await expect(slide).toContainText('then $x$');
});


test('closed half-open intervals stay opaque within full reference labels', async ({ page }) => {
  const source = '[range $[0,1)$][ref] then $x$' + '\n\n' + '[ref]: https://example.com/range';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/range"]')).toHaveText('range $[0,1)$');
  await expect(slide.locator(':scope > p')).toHaveText(['range $[0,1)$ then $x$']);
});

test('balanced TeX brackets remain inside reference link labels', async ({ page }) => {
  const source = '[formula $[x]$][ref] then $y$' + '\n\n' + '[ref]: https://example.com/f';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/f"]')).toHaveText('formula $[x]$');
  await expect(slide.locator(':scope > p')).toHaveText(['formula $[x]$ then $y$']);
});

test('unclosed interval in first reference does not absorb later reference link', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '[price $[0,1)][ref] then $x$ [later][ref2]',
    '',
    '[ref]: https://example.com/price',
    '[ref2]: https://example.com/later'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/price"]')).toHaveText('price $[0,1)');
  await expect(slide.locator('a[href="https://example.com/later"]')).toHaveText('later');
  await expect(slide.locator(':scope > p')).toHaveText(['price $[0,1) then $x$ later']);
});

test('inline code containing reference delimiters cannot end a link label', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '[price $[0 ' + tick + '][fake]' + tick + ' tail][ref] then $x$',
    '',
    '[ref]: https://example.com/price'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  const link = slide.locator('a[href="https://example.com/price"]');
  await expect(link).toContainText('price $[0');
  await expect(link.locator('code')).toHaveText('][fake]');
  await expect(link).toContainText('tail');
  await expect(slide).toContainText('then $x$');
});

test('code with inline-link delimiter does not terminate image reference label', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill([
    '![price $[0 ' + tick + '](fake)' + tick + ' tail][img] then $y$',
    '',
    '[img]: https://example.com/price.png'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img[src="https://example.com/price.png"]'))
    .toHaveAttribute('alt', 'price $[0 ](fake) tail');
  await expect(slide).toContainText('then $y$');
});

test('valid half-open TeX remains opaque before later references', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '[range $[0,1)$][ref] then [later][ref2]',
    '',
    '[ref]: https://example.com/range',
    '[ref2]: https://example.com/later'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('a[href="https://example.com/range"]')).toHaveText('range $[0,1)$');
  await expect(slide.locator('a[href="https://example.com/later"]')).toHaveText('later');
});
