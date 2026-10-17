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

test('inline code is retained in native image alt text', async ({ page }) => {
  const tick = String.fromCharCode(96);
  await page.locator('#markdownInput').fill('![price ' + tick + '](fake)' + tick + '](https://example.com/code.png)');
  await expect(page.locator('#currentSlide img[src="https://example.com/code.png"]'))
    .toHaveAttribute('alt', 'price ](fake)');
});

test('rejected image URL preserves inline code as escaped plain text', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = '![safe ' + tick + '<b>code</b>' + tick + '](javascript:alert(1))';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img')).toHaveCount(0);
  await expect(slide.locator(':scope > p')).toHaveText(['safe <b>code</b>']);
  await expect(slide.locator('b')).toHaveCount(0);
});

test('native autolink text cannot end a reference image label', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '![price $[0 <https://example.com/][fake]> tail][img] then $x$',
    '',
    '[img]: https://example.com/price.png'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('img[src="https://example.com/price.png"]'))
    .toHaveAttribute('alt', 'price $[0 https://example.com/][fake] tail');
  await expect(slide).toContainText('then $x$');
});

test('a native autolink cannot end a full reference link label', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '[price $[0 <https://example.com/][fake]> tail][ref] then $x$',
    '',
    '[ref]: https://example.com/shop'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  const link = slide.locator('a[href="https://example.com/shop"]');
  await expect(link).toContainText('price $[0');
  await expect(link.locator('a')).toHaveCount(0);
  await expect(slide.locator(':scope > p')).toContainText('then $x$');
});

test('math containing an autolink-like string stays in the same math span', async ({ page }) => {
  const source = '$a <https://example.com/][fake]> + b$';
  await page.locator('#markdownInput').fill(source);
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > p')).toHaveText([source]);
  await expect(slide.locator('a')).toHaveCount(0);
});

test('authored private-use glyphs survive paragraph, code, math and table rendering', async ({ page }) => {
  const glyphs = String.fromCharCode(0xE021, 0xE022, 0xE023, 0xE030);
  const tick = String.fromCharCode(96);
  const source = [
    'Literal ' + glyphs,
    '',
    tick + glyphs + tick,
    '',
    '$' + glyphs + '$',
    '',
    '| glyph | code pipe |',
    '| --- | --- |',
    '| ' + glyphs + ' | ' + tick + 'x|' + glyphs + tick + ' |'
  ].join('\n');
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('Literal ' + glyphs);
  expect(html).toContain('<code>' + glyphs + '</code>');
  expect(html).toContain('$' + glyphs + '$');
  expect(html).toContain('<table class="md-table">');
  expect(html).toContain('<code>x|' + glyphs + '</code>');
});

test('dynamic pipe markers do not collide with other authored private-use characters', async ({ page }) => {
  const glyphs = Array.from({ length: 64 }, (_, i) => String.fromCharCode(0xE000 + i)).join('');
  const tick = String.fromCharCode(96);
  const source = [
    '| text | code |',
    '| --- | --- |',
    '| ' + glyphs + ' | ' + tick + 'a|b' + tick + ' |'
  ].join('\n');
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain(glyphs);
  expect(html).toContain('<table class="md-table">');
  expect(html).toContain('<code>a|b</code>');
});

test('marker reservation is fresh across successive Markdown renders', async ({ page }) => {
  const glyphs = String.fromCharCode(0xE000, 0xE021, 0xE022, 0xE023);
  const tick = String.fromCharCode(96);
  const results = await page.evaluate(({ tick, glyphs }) => {
    const render = window.md2slidesMarkdown.render;
    return [
      render('| A | B |\n| --- | --- |\n| ' + glyphs + ' | ' + tick + 'x|y' + tick + ' |'),
      render('plain ' + glyphs),
      render('| A | B |\n| --- | --- |\n| left | ' + tick + 'z|w' + tick + ' |'),
      render('inline $' + glyphs + '$')
    ];
  }, { tick, glyphs });
  expect(results[0]).toContain(glyphs);
  expect(results[0]).toContain('<code>x|y</code>');
  expect(results[1]).toContain('plain ' + glyphs);
  expect(results[2]).toContain('<code>z|w</code>');
  expect(results[3]).toContain('$' + glyphs + '$');
});

test('authored legacy list-boundary glyph remains visible next to separate lists', async ({ page }) => {
  const glyph = String.fromCharCode(0xE030);
  const source = ['- first', '', '', '- second', '', glyph].join('\n');
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect((html.match(/<ul>/g) || []).length).toBe(2);
  expect(html).toContain('<p>' + glyph + '</p>');
});

test('isolated private-use glyph lines remain literal Markdown paragraphs', async ({ page }) => {
  const glyphs = String.fromCharCode(0xE021, 0xE022, 0xE023, 0xE030);
  const source = ['before', '', glyphs, '', 'after'].join('\n');
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('<p>' + glyphs + '</p>');
  expect(html).toContain('<p>after</p>');
});

test('escaped URL pipes are normalized natively outside tables', async ({ page }) => {
  const source = String.raw`[link](./a\|b) ![alt](./img\|icon.png)`;
  const actual = await page.evaluate(src => {
    const root = document.createElement('div');
    root.innerHTML = window.md2slidesMarkdown.render(src);
    return { href: root.querySelector('a')?.getAttribute('href'),
      src: root.querySelector('img')?.getAttribute('src') };
  }, source);
  expect(actual).toEqual({ href: './a%7Cb', src: './img%7Cicon.png' });
});

test('escaped URL pipes survive a Markdown table without placeholder leakage', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = [
    '| Link | Image | Code |',
    '| --- | --- | --- |',
    '| [link](./a\\|b) | ![alt](./img\\|icon.png) | ' + tick + 'x|y' + tick + ' |'
  ].join('\n');
  const actual = await page.evaluate(src => {
    const root = document.createElement('div');
    root.innerHTML = window.md2slidesMarkdown.render(src);
    return { cells: root.querySelectorAll('td').length,
      href: root.querySelector('a')?.getAttribute('href'),
      src: root.querySelector('img')?.getAttribute('src'),
      code: root.querySelector('td code')?.textContent };
  }, source);
  expect(actual).toEqual({ cells: 3, href: './a%7Cb',
    src: './img%7Cicon.png', code: 'x|y' });
});

test('root-level fence clears previous ordered-list indentation ownership', async ({ page }) => {
  const tick = String.fromCharCode(96).repeat(3);
  const source = ['100. item', '', tick, 'code', tick, '  after'].join('\n');
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('<pre class="code"><code>code</code></pre>');
  expect(html).toContain('<p>after</p>');
  expect(html).not.toContain('<code>after');
});

test('root-level tilde fence does not preserve stale list frames either', async ({ page }) => {
  const source = ['1000. item', '', '~~~', 'code', '~~~', '  after'].join('\n');
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  expect(html).toContain('<pre class="code"><code>code</code></pre>');
  expect(html).toContain('<p>after</p>');
});

test('normal list-owned fenced code retains its owner', async ({ page }) => {
  const tick = String.fromCharCode(96).repeat(3);
  const source = ['- parent', '  ' + tick, '  code', '  ' + tick, '  continuation'].join('\n');
  const html = await page.evaluate(src => window.md2slidesMarkdown.render(src), source);
  // Legacy slide lists intentionally retain the author's two spaces in
  // list-owned fenced code. This is covered by existing indentation tests.
  expect(html).toContain('<pre class="code"><code>  code</code></pre>');
  expect(html).toContain('continuation');
  expect(html).toContain('<ul>');
});

test('code span pipes inside a native link label keep table columns intact', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = ['| label | c |', '|---|---|',
    '| [a ' + tick + 'x|y' + tick + '](https://example.com) | last |'].join('\n');
  const html = await page.evaluate(s => window.md2slidesMarkdown.render(s), source);
  const root = await page.evaluate(s => {
    const div = document.createElement('div'); div.innerHTML = window.md2slidesMarkdown.render(s);
    return { cells: [...div.querySelectorAll('tbody td')].map(x => x.textContent),
      href: div.querySelector('tbody a')?.getAttribute('href') };
  }, source);
  expect(root).toEqual({ cells: ['a x|y', 'last'], href: 'https://example.com' });
  expect(html).toContain('<code>x|y</code>');
});

test('code span pipes in image alt text preserve native tables and URL destinations', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = ['| image | final |', '|---|---|',
    '| ![a ' + tick + 'x|y' + tick + '](./a\\|b.png) | yes |'].join('\n');
  const root = await page.evaluate(s => {
    const div = document.createElement('div'); div.innerHTML = window.md2slidesMarkdown.render(s);
    return { count: div.querySelectorAll('tbody td').length,
      alt: div.querySelector('tbody img')?.getAttribute('alt'),
      src: div.querySelector('tbody img')?.getAttribute('src') };
  }, source);
  expect(root).toEqual({ count: 2, alt: 'a x|y', src: './a%7Cb.png' });
});

test('multiline link destinations remain native and never receive pipe sentinels', async ({ page }) => {
  const source = '[x](a\\|b\n "title")';
  const root = await page.evaluate(s => {
    const div = document.createElement('div'); div.innerHTML = window.md2slidesMarkdown.render(s);
    const a = div.querySelector('a');
    return { href: a?.getAttribute('href'), title: a?.getAttribute('title') };
  }, source);
  expect(root).toEqual({ href: 'a%7Cb', title: 'title' });
});

test('multiline inline code keeps literal escaped pipes without preprocessing', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = tick + 'a\n\\| b' + tick;
  const html = await page.evaluate(s => window.md2slidesMarkdown.render(s), source);
  expect(html).toContain('a \\| b');
  expect(html).not.toContain('\\uE021');
});

test('table headers with code pipes are discovered by native table probe', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = ['| ' + tick + 'a|b' + tick + ' | c |', '| --- | --- |', '| one | two |'].join('\n');
  const result = await page.evaluate(s => {
    const root = document.createElement('div');
    root.innerHTML = window.md2slidesMarkdown.render(s);
    return { headings: [...root.querySelectorAll('th')].map(x => x.textContent),
      values: [...root.querySelectorAll('tbody td')].map(x => x.textContent) };
  }, source);
  expect(result).toEqual({ headings: ['a|b', 'c'], values: ['one', 'two'] });
});

test('nested image URL with backticks and escaped pipe remains native inside a table link', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = [
    '| label | c |',
    '|---|---|',
    '| [outer ![alt](https://example.com/a' + tick + 'x\\|y' + tick + 'b.png)](/outer) | last |'
  ].join('\n');
  const data = await page.evaluate(src => {
    const div = document.createElement('div');
    div.innerHTML = window.md2slidesMarkdown.render(src);
    return { cells: [...div.querySelectorAll('tbody td')].map(x => x.textContent),
      href: div.querySelector('tbody a')?.getAttribute('href'),
      src: div.querySelector('tbody img')?.getAttribute('src') };
  }, source);
  expect(data).toEqual({ cells: ['outer ', 'last'], href: '/outer',
    src: 'https://example.com/a%60x%7Cy%60b.png' });
});

test('nested image alt code pipe is protected without rewriting the destination', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = [
    '| label | c |',
    '|---|---|',
    '| [outer ![alt ' + tick + 'x|y' + tick + '](./a\\|b.png)](/outer) | last |'
  ].join('\n');
  const data = await page.evaluate(src => {
    const div = document.createElement('div');
    div.innerHTML = window.md2slidesMarkdown.render(src);
    return { count: div.querySelectorAll('tbody td').length,
      href: div.querySelector('tbody a')?.getAttribute('href'),
      src: div.querySelector('tbody img')?.getAttribute('src'),
      alt: div.querySelector('tbody img')?.getAttribute('alt') };
  }, source);
  expect(data).toEqual({ count: 2, href: '/outer',
    src: './a%7Cb.png', alt: 'alt x|y' });
});

test('nested image destination behavior matches unmodified markdown-it', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const body = '[outer ![alt](https://example.com/a' + tick + 'x\\|y' + tick + 'b.png)](/outer)';
  const compared = await page.evaluate(src => {
    const parser = window.markdownit({ html: false });
    const get = html => {
      const div = document.createElement('div'); div.innerHTML = html;
      return { href: div.querySelector('a')?.getAttribute('href'),
        src: div.querySelector('img')?.getAttribute('src') };
    };
    return { upstream: get(parser.render(src)), slide: get(window.md2slidesMarkdown.render(src)) };
  }, body);
  expect(compared.slide).toEqual(compared.upstream);
});

test('nested Markdown link in image alt preserves code pipe and escaped image URL', async ({ page }) => {
  const tick = String.fromCharCode(96), slash = String.fromCharCode(92);
  const image = '![alt [inner](/u) ' + tick + 'x|y' + tick + '](./a' + slash + '|b.png)';
  const table = ['| image | final |', '|---|---|', '| ' + image + ' | yes |'].join('\n');
  const result = await page.evaluate(({ image, table }) => {
    const div = document.createElement('div');
    const upstream = document.createElement('div');
    upstream.innerHTML = window.markdownit({ html: false }).render(image);
    div.innerHTML = window.md2slidesMarkdown.render(table);
    return { count: div.querySelectorAll('tbody td').length,
      last: div.querySelectorAll('tbody td')[1]?.textContent,
      src: div.querySelector('tbody img')?.getAttribute('src'),
      expectedSrc: upstream.querySelector('img')?.getAttribute('src'),
      alt: div.querySelector('tbody img')?.getAttribute('alt') };
  }, { image, table });
  expect(result.count).toBe(2);
  expect(result.last).toBe('yes');
  expect(result.src).toBe('./a%7Cb.png');
  expect(result.src).toBe(result.expectedSrc);
  // The slide renderer intentionally retains inline-code text in image alt;
  // upstream markdown-it's default alt serializer omits code_inline text.
  expect(result.alt).toBe('alt inner x|y');
});

test('reference image label containing a nested reference link keeps table columns', async ({ page }) => {
  const tick = String.fromCharCode(96), slash = String.fromCharCode(92);
  const image = '![alt [inner][ref] ' + tick + 'x|y' + tick + '][img]';
  const source = ['| image | final |', '|---|---|', '| ' + image + ' | yes |',
    '', '[ref]: /u', '[img]: ./a' + slash + '|b.png'].join('\n');
  const result = await page.evaluate(src => {
    const div = document.createElement('div');
    div.innerHTML = window.md2slidesMarkdown.render(src);
    return { count: div.querySelectorAll('tbody td').length,
      last: div.querySelectorAll('tbody td')[1]?.textContent,
      alt: div.querySelector('tbody img')?.getAttribute('alt'),
      src: div.querySelector('tbody img')?.getAttribute('src') };
  }, source);
  expect(result.count).toBe(2);
  expect(result.last).toBe('yes');
  expect(result.alt).toContain('x|y');
  expect(result.src).toBe('./a%7Cb.png');
});

test('outer link labels still reject nested native links and protect code pipes', async ({ page }) => {
  const tick = String.fromCharCode(96);
  const source = ['| label | other |', '|---|---|',
    '| [outer [inner](/u) ' + tick + 'x|y' + tick + '](/outer) | end |'].join('\n');
  const result = await page.evaluate(src => {
    const div = document.createElement('div');
    div.innerHTML = window.md2slidesMarkdown.render(src);
    return { cells: [...div.querySelectorAll('tbody td')].map(x => x.textContent),
      links: [...div.querySelectorAll('tbody a')].map(x => x.getAttribute('href')) };
  }, source);
  expect(result.cells.length).toBe(2);
  expect(result.cells[1]).toBe('end');
  expect(result.links).not.toContain('/outer');
});

test('editor preview keeps numeric entities distinct from protected table pipes', async ({ page }) => {
  const glyphs = String.fromCodePoint(0xE022, 0xE023, 0xE000);
  await page.locator('#markdownInput').fill([
    'Entities: &#xE022;&#xE023;&#xE000;',
    '',
    '| entities | code | escaped |',
    '| --- | --- | --- |',
    '| &#xE022;&#xE023;&#xE000; | `x|y` | a\\|b |'
  ].join('\n'));
  await expect(page.locator('#currentSlide > p').filter({ hasText: 'Entities:' })).toHaveText('Entities: ' + glyphs);
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('tbody td')).toHaveText([glyphs, 'x|y', 'a|b']);
  await expect(table.locator('tbody td code')).toHaveText('x|y');
  await expect(page.locator('#currentSlide .pause-marker')).toHaveCount(0);
});

test('task list keeps multiline emphasis links titles and code in their original DOM', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [x] **strong',
    '  across** [linked',
    '  label](./path "title',
    '  across") `code',
    '  across`',
    '  continuation after constructs',
    '- Sibling'
  ].join('\n'));
  const task = page.locator('#currentSlide > ul.task-list > li.task-item');
  await expect(task).toHaveCount(1);
  await expect(task.locator('input[type="checkbox"]')).toBeChecked();
  await expect(task.locator('input[type="checkbox"]')).toBeDisabled();
  await expect(task.locator('strong')).toHaveText('strong across');
  await expect(task.locator('a')).toHaveText('linked label');
  await expect(task.locator('a')).toHaveAttribute('href', './path');
  await expect(task.locator('a')).toHaveAttribute('title', 'title\nacross');
  await expect(task.locator('code')).toHaveText('code across');
  await expect(task.locator(':scope > p.list-continuation')).toHaveText('continuation after constructs');
  await expect(task.locator('p p')).toHaveCount(0);
  await expect(page.locator('#currentSlide > ul > li').last()).toHaveText('Sibling');
});

test('display math tilde lines preserve following ordered children and root indented code', async ({ page }) => {
  const source = [
    '$$',
    'x',
    '~~~',
    'y',
    '$$',
    '',
    '    root code',
    '',
    '1000. Parent',
    '  - Child',
    '    child detail',
    '1001. Sibling'
  ].join('\n');
  const result = await page.evaluate(src => {
    const root = document.createElement('div');
    root.innerHTML = window.md2slidesMarkdown.render(src);
    const items = root.querySelectorAll(':scope > ol > li');
    return {
      formula: root.querySelector('.katex-display-wrapper')?.textContent.trim(),
      rootCode: root.querySelector(':scope > pre.code > code')?.textContent,
      orderedStart: root.querySelector(':scope > ol')?.getAttribute('start'),
      items: items.length,
      child: items[0]?.querySelector(':scope > ul > li')?.textContent.trim(),
      sibling: items[1]?.textContent.trim(),
      extraFences: root.querySelectorAll('pre.code').length
    };
  }, source);
  expect(result).toEqual({
    formula: '$$\nx\n~~~\ny\n$$', rootCode: 'root code', orderedStart: '1000', items: 2,
    child: 'Childchild detail', sibling: 'Sibling', extraFences: 1
  });
});

test('list-owned indented code keeps marker-looking lines in one preview code block', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- parent',
    '',
    '      alpha',
    '      10. literal',
    '        continuation',
    '',
    '- next'
  ].join('\n'));
  const code = page.locator('#currentSlide > ul > li').first().locator(':scope > pre.code > code');
  await expect(code).toHaveText('alpha\n10. literal\n  continuation', { useInnerText: false });
  expect(await code.textContent()).toBe('alpha\n10. literal\n  continuation');
  await expect(page.locator('#currentSlide pre.code')).toHaveCount(1);
  await expect(page.locator('#currentSlide ol')).toHaveCount(0);
  await expect(page.locator('#currentSlide > ul > li')).toHaveCount(2);
  await expect(page.locator('#currentSlide > ul > li').last()).toHaveText('next');
});

test('same-line display math suffixes preserve fence text and following list ownership', async ({ page }) => {
  const fixtures = {
    rootFence: '$$x$$~~~js\n10. literal\n  continuation\n~~~\nafter',
    listFence: '- $$x$$~~~js\n10. literal\n  continuation\n~~~\n- next\n  - child',
    ordered: '$$x$$1000. parent\n  - child\n1001. next'
  };
  const result = await page.evaluate(sources => {
    const render = src => {
      const root = document.createElement('div');
      root.innerHTML = window.md2slidesMarkdown.render(src);
      return root;
    };
    const rootFence = render(sources.rootFence);
    const listFence = render(sources.listFence);
    const ordered = render(sources.ordered);
    const items = listFence.querySelectorAll(':scope > ul > li');
    const orderedItems = ordered.querySelectorAll(':scope > ol > li');
    return {
      root: {
        code: rootFence.querySelector(':scope > pre.code > code')?.textContent,
        codeCount: rootFence.querySelectorAll('pre.code').length,
        after: rootFence.querySelector(':scope > p')?.textContent
      },
      list: {
        items: items.length,
        code: items[0]?.querySelector(':scope > pre.code > code')?.textContent,
        codeCount: listFence.querySelectorAll('pre.code').length,
        next: items[1]?.firstChild?.textContent.trim(),
        child: items[1]?.querySelector(':scope > ul > li')?.textContent.trim()
      },
      ordered: {
        start: ordered.querySelector(':scope > ol')?.getAttribute('start'),
        lists: ordered.querySelectorAll(':scope > ol').length,
        items: orderedItems.length,
        child: orderedItems[0]?.querySelector(':scope > ul > li')?.textContent.trim(),
        next: orderedItems[1]?.textContent.trim()
      }
    };
  }, fixtures);
  expect(result).toEqual({
    root: { code: '10. literal\n  continuation', codeCount: 1, after: 'after' },
    list: { items: 2, code: '10. literal\n  continuation', codeCount: 1, next: 'next', child: 'child' },
    ordered: { start: '1000', lists: 1, items: 2, child: 'child', next: 'next' }
  });
});

test('editor table full reference labels keep code and escaped pipes without shifting cells', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Link | Image | Kind | Final |',
    '| --- | --- | --- | --- |',
    '| [code link][a `x|y`] | ![code image][img `i|j`] | code | final-code |',
    '| [escaped link][a \\| b] | ![escaped image][img \\| ref] | escaped | final-escaped |',
    '',
    '[a `x|y`]: ./code-docs "code link title"',
    '[img `i|j`]: ./code-image.png "code image title"',
    '[a \\| b]: ./escaped-docs "escaped link title"',
    '[img \\| ref]: ./escaped-image.png "escaped image title"'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('th')).toHaveText(['Link', 'Image', 'Kind', 'Final']);
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  for (const [index, kind] of ['code', 'escaped'].entries()) {
    const cells = rows.nth(index).locator('td');
    await expect(cells).toHaveCount(4);
    await expect(cells.nth(0).locator('a')).toHaveText(kind + ' link');
    await expect(cells.nth(0).locator('a')).toHaveAttribute('href', './' + kind + '-docs');
    await expect(cells.nth(0).locator('a')).toHaveAttribute('title', kind + ' link title');
    await expect(cells.nth(1).locator('img')).toHaveAttribute('src', './' + kind + '-image.png');
    await expect(cells.nth(1).locator('img')).toHaveAttribute('alt', kind + ' image');
    await expect(cells.nth(1).locator('img')).toHaveAttribute('title', kind + ' image title');
    await expect(cells.nth(2)).toHaveText(kind);
    await expect(cells.nth(3)).toHaveText('final-' + kind);
  }
  await page.locator('#markdownInput').fill([
    '| Value | Final |',
    '| --- | --- |',
    '| [![icon](/icon.png)][a `x|y`] | final-linked-image |',
    '| ![alt [nested](/u)][a `x|y`] | final-image-link-alt |',
    '| ![alt ![nested](/icon.png)][a `x|y`] | final-image-image-alt |',
    '',
    '[a `x|y`]: /dest'
  ].join('\n'));
  await expect(table.locator('th')).toHaveText(['Value', 'Final']);
  await expect(rows).toHaveCount(3);
  const linkedImageCells = rows.nth(0).locator('td');
  await expect(linkedImageCells).toHaveCount(2);
  await expect(linkedImageCells.nth(0).locator('a')).toHaveAttribute('href', '/dest');
  await expect(linkedImageCells.nth(0).locator('a > img')).toHaveAttribute('src', '/icon.png');
  await expect(linkedImageCells.nth(0).locator('a > img')).toHaveAttribute('alt', 'icon');
  await expect(linkedImageCells.nth(1)).toHaveText('final-linked-image');
  for (const [index, final] of ['final-image-link-alt', 'final-image-image-alt'].entries()) {
    const cells = rows.nth(index + 1).locator('td');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0).locator('img')).toHaveCount(1);
    await expect(cells.nth(0).locator('img')).toHaveAttribute('src', '/dest');
    await expect(cells.nth(0).locator('img')).toHaveAttribute('alt', 'alt nested');
    await expect(cells.nth(0).locator('a')).toHaveCount(0);
    await expect(cells.nth(1)).toHaveText(final);
  }
});
