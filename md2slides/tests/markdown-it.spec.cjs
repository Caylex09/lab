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
