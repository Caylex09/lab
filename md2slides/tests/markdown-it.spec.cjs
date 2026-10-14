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
  await expect(slide.locator(':scope > p')).toContainText(formula);
  const table = slide.locator('table.md-table');
  await expect(table.locator('tbody td')).toHaveCount(2);
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
  await expect(slide.locator(':scope > p')).toHaveText('Intro');
  await expect(slide.locator(':scope > pre.code code')).toHaveText('const x = 1');
  await expect(slide.locator(':scope > p')).not.toContainText('const x = 1');
});
