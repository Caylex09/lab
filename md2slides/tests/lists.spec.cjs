const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.mermaid = { initialize() {}, render(_id, _source, callback) {
      callback('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    } };
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

test('nested unordered items are actual descendants of parent li', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child A',
    '    - Grandchild',
    '  - Child B',
    '- Sibling'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('ul > li')).toHaveCount(5);
  await expect(slide.locator('ul > li').first()).toContainText('Grandchild');
  await expect(slide.locator('ul > li').last()).toHaveText('Sibling');
  await expect(slide.locator('ul > li').first().locator(':scope > ul > li')).toHaveCount(2);
  await expect(slide.locator('ul > li').first().locator(':scope > ul > li').first().locator(':scope > ul > li')).toHaveText('Grandchild');
  expect(await slide.locator('ul').first().evaluate(el =>
    [...el.children].every(child => child.tagName === 'LI'))).toBe(true);
});

test('mixed nested ordered and unordered lists keep their hierarchy', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '1. First',
    '  - Nested unordered',
    '  - Second nested',
    '2. Second',
    '  5. Nested ordered',
    '3. Third'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > ol')).toHaveCount(1);
  await expect(slide.locator(':scope > ol > li')).toHaveCount(3);
  await expect(slide.locator(':scope > ol > li').first().locator(':scope > ul > li')).toHaveCount(2);
  await expect(slide.locator(':scope > ol > li').nth(1).locator(':scope > ol')).toHaveAttribute('start', '5');
  await expect(slide.locator(':scope > ol > li').last()).toHaveText('Third');
});

test('consecutive task items share a single task list and retain checkbox states', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [x] Complete',
    '- [ ] Pending',
    '- [X] Also complete'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('ul.task-list')).toHaveCount(1);
  await expect(slide.locator('ul.task-list > li.task-item')).toHaveCount(3);
  await expect(slide.locator('ul.task-list input[type=checkbox]')).toHaveCount(3);
  expect(await slide.locator('ul.task-list input[type=checkbox]').evaluateAll(els =>
    els.map(el => ({ checked: el.checked, disabled: el.disabled })))).toEqual([
    { checked: true, disabled: true },
    { checked: false, disabled: true },
    { checked: true, disabled: true }
  ]);
});

test('task list with child items remains structurally valid', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ ] Parent task',
    '  - Detail A',
    '  - Detail B',
    '- [x] Done'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator('ul.task-list')).toHaveCount(1);
  await expect(slide.locator('ul.task-list > li.task-item')).toHaveCount(2);
  await expect(slide.locator('ul.task-list > li.task-item').first().locator(':scope > ul > li')).toHaveCount(2);
  expect(await slide.locator('ul.task-list').first().evaluate(el =>
    [...el.children].every(child => child.tagName === 'LI'))).toBe(true);
});

test('progressive mode reveals nested list items step by step', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('auto');
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child A',
    '  - Child B',
    '- Sibling'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('4');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide')).toContainText('Parent');
  await expect(page.locator('#currentSlide')).not.toContainText('Child A');
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide')).toContainText('Child A');
  await expect(page.locator('#currentSlide')).not.toContainText('Child B');
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide')).toContainText('Child B');
  await expect(page.locator('#currentSlide')).not.toContainText('Sibling');
});

test('manual pauses within a nested list do not reveal later items prematurely', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child A \\pause',
    '  - Child B',
    '- Sibling'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide')).toContainText('Child A');
  await expect(page.locator('#currentSlide')).not.toContainText('Child B');
  await expect(page.locator('#currentSlide')).not.toContainText('Sibling');
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide')).toContainText('Child B');
  await expect(page.locator('#currentSlide')).toContainText('Sibling');
});

test('text after the final list is not inserted into a list item', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- First',
    '  - Child',
    '',
    'A regular paragraph'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide).toContainText('A regular paragraph');
  await expect(slide.locator(':scope > p')).toHaveText('A regular paragraph');
  await expect(slide.locator('li p')).toHaveCount(0);
});


test('one leading space does not create an unwanted nested list', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    ' - Sibling with one space',
    '  - Child with two spaces',
    '   - Same-depth child with three spaces',
    '- Last top-level'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > ul > li')).toHaveCount(3);
  await expect(slide.locator(':scope > ul > li').nth(0)).toHaveText('Parent');
  await expect(slide.locator(':scope > ul > li').nth(1).locator(':scope > ul > li')).toHaveCount(2);
  await expect(slide.locator(':scope > ul > li').nth(1).locator(':scope > ul > li').first()).toHaveText('Child with two spaces');
  await expect(slide.locator(':scope > ul > li').nth(1).locator(':scope > ul > li').last()).toHaveText('Same-depth child with three spaces');
  await expect(slide.locator(':scope > ul > li').last()).toHaveText('Last top-level');
});

test('tabs and two spaces represent the same list nesting level', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '\t- Child with tab',
    '  - Child with spaces',
    '    - Grandchild',
    '   - Another child with three spaces'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  await expect(slide.locator(':scope > ul > li')).toHaveCount(1);
  const children = slide.locator(':scope > ul > li > ul > li');
  await expect(children).toHaveCount(3);
  await expect(children.nth(0)).toHaveText('Child with tab');
  await expect(children.nth(1).locator(':scope > ul > li')).toHaveText('Grandchild');
  await expect(children.nth(2)).toHaveText('Another child with three spaces');
});

for (const markdown of [
  ['- [ ] Task', '- Plain item'],
  ['- Plain item', '- [ ] Task']
]) {
  test('mixed task and ordinary list preserves plain bullet: ' + markdown[0], async ({ page }) => {
    await page.locator('#markdownInput').fill(markdown.join('\n'));
    const list = page.locator('#currentSlide > ul').first();
    await expect(list.locator(':scope > li')).toHaveCount(2);
    await expect(list.locator('li.task-item input[type=checkbox]')).toHaveCount(1);
    const normal = list.locator(':scope > li:not(.task-item)');
    await expect(normal).toHaveText('Plain item');
    expect(await normal.evaluate(el => ({
      display: getComputedStyle(el).display,
      listStyle: getComputedStyle(el).listStyleType,
      hasMarker: !el.classList.contains('task-item'),
    }))).toEqual({
      display: 'list-item',
      listStyle: 'disc',
      hasMarker: true,
    });
    expect(await list.locator('li.task-item').evaluate(el =>
      getComputedStyle(el).listStyleType)).toBe('none');
  });
}
