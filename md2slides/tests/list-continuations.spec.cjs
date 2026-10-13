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

test('indented continuation lines stay inside the owning list item', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  First line',
    '  Second line with **emphasis**',
    '- Sibling'
  ].join('\n'));
  const root = page.locator('#currentSlide > ul');
  await expect(root.locator(':scope > li')).toHaveCount(2);
  const first = root.locator(':scope > li').first();
  await expect(first.locator(':scope > p.list-continuation')).toHaveText('First line Second line with emphasis');
  await expect(first.locator(':scope > p strong')).toHaveText('emphasis');
  await expect(root.locator(':scope > li').last()).toHaveText('Sibling');
});

test('indented paragraphs separated by a blank line remain separate in the item', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  First paragraph',
    '',
    '  Second paragraph',
    '- Next'
  ].join('\n'));
  const first = page.locator('#currentSlide > ul > li').first();
  await expect(first.locator(':scope > p.list-continuation')).toHaveCount(2);
  await expect(first.locator(':scope > p.list-continuation').first()).toHaveText('First paragraph');
  await expect(first.locator(':scope > p.list-continuation').last()).toHaveText('Second paragraph');
});

test('nested list item owns its own continuation without attaching it to parent', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child',
    '    Child details',
    '  - Other child',
    '- Outside sibling'
  ].join('\n'));
  const first = page.locator('#currentSlide > ul > li').first();
  await expect(first.locator(':scope > p.list-continuation')).toHaveCount(0);
  const child = first.locator(':scope > ul > li').first();
  await expect(child.locator(':scope > p.list-continuation')).toHaveText('Child details');
  await expect(page.locator('#currentSlide > ul > li')).toHaveCount(2);
});

test('indented fenced code block remains inside a list and does not split slides', async ({ page }) => {
  const mark = String.fromCharCode(96).repeat(3);
  await page.locator('#markdownInput').fill([
    '- Item with code',
    '    ' + mark + 'js',
    '    const a = 1;',
    '    ---',
    '    ' + mark,
    '- Following item',
    '---',
    '## Next slide'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  const first = page.locator('#currentSlide > ul > li').first();
  await expect(first.locator(':scope > pre.code code')).toContainText('const a = 1;');
  await expect(first.locator(':scope > pre.code code')).toContainText('---');
  await expect(page.locator('#currentSlide > ul > li')).toHaveCount(2);
  await expect(page.locator('#currentSlide > pre.code')).toHaveCount(0);
});

test('indented display math remains a block inside the list item', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Formula',
    '  $$',
    '  x^2 + 1',
    '  $$',
    '- Result'
  ].join('\n'));
  const first = page.locator('#currentSlide > ul > li').first();
  await expect(first.locator(':scope > .katex-display-wrapper')).toHaveCount(1);
  await expect(first.locator(':scope > .katex-display-wrapper')).toContainText('x^2 + 1');
  await expect(page.locator('#currentSlide > ul > li')).toHaveCount(2);
});

test('task continuation is nested under its checkbox item and styled on a new row', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ ] Review',
    '  Explanation for this task',
    '- [x] Finished'
  ].join('\n'));
  const list = page.locator('#currentSlide > ul.task-list');
  await expect(list.locator(':scope > li')).toHaveCount(2);
  const first = list.locator(':scope > li').first();
  await expect(first.locator(':scope > p.list-continuation')).toHaveText('Explanation for this task');
  expect(await first.locator(':scope > p.list-continuation').evaluate(el =>
    getComputedStyle(el).flexBasis)).toBe('100%');
});

test('manual pause inside continuation hides following list items', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- First',
    '  Details \\pause',
    '- Second',
    '  More details'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide')).toContainText('Details');
  await expect(page.locator('#currentSlide')).not.toContainText('Second');
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide')).toContainText('Second');
});

test('automatic pagination keeps fenced code as a later list-item step', async ({ page }) => {
  const mark = String.fromCharCode(96).repeat(3);
  await page.locator('#paginationMode').selectOption('auto');
  await page.locator('#markdownInput').fill([
    '- Before code',
    '    ' + mark + 'js',
    '    console.log(1);',
    '    ' + mark,
    '- After code'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('3');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide')).toContainText('Before code');
  await expect(page.locator('#currentSlide pre.code')).toHaveCount(0);
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide pre.code code')).toContainText('console.log(1);');
  await expect(page.locator('#currentSlide')).not.toContainText('After code');
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide')).toContainText('After code');
});

test('unindented paragraphs after list remain outside list items', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- First',
    '  Description',
    '',
    'An independent paragraph'
  ].join('\n'));
  const slide=page.locator('#currentSlide');
  await expect(slide).toContainText('An independent paragraph');
  await expect(slide.locator(':scope > p')).toHaveText('An independent paragraph');
  await expect(slide.locator('li > p')).toHaveCount(1);
  await expect(slide.locator(':scope > ul > li')).toHaveCount(1);
});
