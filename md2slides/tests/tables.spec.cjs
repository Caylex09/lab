const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.mermaid = {
      initialize() {},
      render(_id, _source, callback) {
        callback('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      }
    };
  });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.locator('#paginationMode').selectOption('manual');
});

test('escaped pipes in table headers and cells do not create extra columns', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Label \\| Kind | Value |',
    '| :--- | ---: |',
    '| Alpha \\| Beta | 7 |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table).toHaveCount(1);
  await expect(table.locator('th')).toHaveCount(2);
  await expect(table.locator('th').nth(0)).toHaveText('Label | Kind');
  await expect(table.locator('td')).toHaveCount(2);
  await expect(table.locator('td').first()).toHaveText('Alpha | Beta');
  await expect(table.locator('td').last()).toHaveText('7');
});

test('inline code with literal pipes stays inside a single cell', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Name | Formula |',
    '| --- | --- |',
    '| item | `a | b` |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('td')).toHaveCount(2);
  await expect(table.locator('td').nth(1).locator('code')).toHaveText('a | b');
});

test('body rows are padded or truncated to match table headings', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| A | B | C |',
    '| :--- | :---: | ---: |',
    '| alpha | beta |',
    '| one | two | three | extra |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('thead tr th')).toHaveCount(3);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').first().locator('td')).toHaveCount(3);
  await expect(table.locator('tbody tr').first().locator('td').last()).toBeEmpty();
  await expect(table.locator('tbody tr').nth(1).locator('td')).toHaveCount(3);
  await expect(table.locator('tbody tr').nth(1).locator('td').last()).toHaveText('three');
  await expect(table).not.toContainText('extra');
  expect(await table.locator('th').evaluateAll(els => els.map(el => el.getAttribute('align'))))
    .toEqual(['left', 'center', 'right']);
});

test('mismatched divider column count does not turn paragraphs into a table', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second |',
    '| --- |',
    '| alpha | beta |'
  ].join('\n'));
  await expect(page.locator('#currentSlide table')).toHaveCount(0);
  await expect(page.locator('#currentSlide')).toContainText('First');
});

test('one-column table with an escaped pipe in its header renders correctly', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Before \\| After |',
    '| --- |',
    '| Data \\| Value |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('th')).toHaveCount(1);
  await expect(table.locator('th')).toHaveText('Before | After');
  await expect(table.locator('td')).toHaveCount(1);
  await expect(table.locator('td')).toHaveText('Data | Value');
});

test('an even number of backslashes does not escape a table column pipe', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| A | B | C |',
    '| --- | --- | --- |',
    String.raw`| first\\| second | third |`
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('td')).toHaveCount(3);
  await expect(table.locator('td').nth(1)).toHaveText('second');
  await expect(table.locator('td').nth(2)).toHaveText('third');
});


test('double-backtick code spans preserve a pipe in one table cell', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Name | Code |',
    '| --- | --- |',
    '| item | ``a | b`` |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('td')).toHaveCount(2);
  await expect(table.locator('td').nth(1).locator('code')).toHaveText('a | b');
  await expect(table.locator('td').nth(1)).toHaveText('a | b');
});

test('long backtick spans can contain shorter backticks and literal pipes', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| Name | Code |',
    '| --- | --- |',
    '| item | ```a ` | b``` |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('td')).toHaveCount(2);
  await expect(table.locator('td').nth(1).locator('code')).toHaveText('a ` | b');
});

test('inline code in tables does not interpret math or pause controls', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| A | B |',
    '| --- | --- |',
    '| item | `\\pause | $$` |'
  ].join('\n'));
  const table = page.locator('#currentSlide table.md-table');
  await expect(table.locator('td')).toHaveCount(2);
  await expect(table.locator('td').nth(1).locator('code')).toHaveText('\\pause | $$');
  await expect(table.locator('.pause-marker')).toHaveCount(0);
});


for (const scenario of [
  { name: 'heading', next: '## Next chapter | Notes', selector: ':scope > h2', text: 'Next chapter | Notes' },
  { name: 'block quote', next: '> Quoted | Aside', selector: ':scope > blockquote > p', text: 'Quoted | Aside' },
  { name: 'unordered list', next: '- Bullet | Details', selector: ':scope > ul > li', text: 'Bullet | Details' },
  { name: 'ordered list', next: '5. Numbered | Details', selector: ':scope > ol > li', text: 'Numbered | Details' },
  { name: 'task item', next: '- [x] Complete | Details', selector: ':scope > ul.task-list > li.task-item', text: 'Complete | Details' }
]) {
  test('table ends before a ' + scenario.name + ' containing a pipe', async ({ page }) => {
    await page.locator('#markdownInput').fill([
      '| Name | Status |',
      '| --- | --- |',
      '| A | Done |',
      scenario.next
    ].join('\n'));
    const slide = page.locator('#currentSlide');
    const table = slide.locator(':scope > table.md-table');
    await expect(table).toHaveCount(1);
    await expect(table.locator('tbody > tr')).toHaveCount(1);
    await expect(table.locator('tbody > tr > td').first()).toHaveText('A');
    await expect(slide.locator(scenario.selector)).toHaveText(scenario.text);
    if (scenario.name === 'ordered list') {
      await expect(slide.locator(':scope > ol')).toHaveAttribute('start', '5');
    }
  });
}

test('a table body cell starting with Markdown markers stays a table row', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '| First | Second |',
    '| --- | --- |',
    '| ## heading-shaped content | > quote-shaped content |',
    '| - list-looking text | 1. numbered-looking text |',
    '| [x] task-looking text | More content |'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > table.md-table tbody > tr')).toHaveCount(3);
  await expect(slide.locator(':scope > h2, :scope > ul, :scope > ol, :scope > blockquote')).toHaveCount(0);
  await expect(slide.locator('tbody > tr').first().locator('td').first()).toHaveText('## heading-shaped content');
});
