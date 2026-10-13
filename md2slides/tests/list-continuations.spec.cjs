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
  await expectWithinTaskBounds(first, ':scope > p.list-continuation');
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


test('continuation after a nested sublist attaches to its ancestor item', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child',
    '  Parent details',
    '- Sibling'
  ].join('\n'));
  const slide = page.locator('#currentSlide');
  const parent = slide.locator(':scope > ul > li').first();
  await expect(parent.locator(':scope > ul > li')).toHaveText('Child');
  await expect(parent.locator(':scope > p.list-continuation')).toHaveText('Parent details');
  await expect(parent.locator(':scope > ul > li > p.list-continuation')).toHaveCount(0);
  await expect(slide.locator(':scope > ul > li').last()).toHaveText('Sibling');
});

test('blank line after nested sublist still permits ancestor continuation', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child',
    '',
    '  Parent details after blank',
    '- Sibling'
  ].join('\n'));
  const parent = page.locator('#currentSlide > ul > li').first();
  await expect(parent.locator(':scope > p.list-continuation')).toHaveText('Parent details after blank');
  await expect(page.locator('#currentSlide > ul > li')).toHaveCount(2);
});

test('code block after child list is placed in the parent item', async ({ page }) => {
  const fence = String.fromCharCode(96).repeat(3);
  await page.locator('#markdownInput').fill([
    '- Parent',
    '  - Child',
    '  ' + fence + 'js',
    '  return 42;',
    '  ' + fence,
    '- Sibling'
  ].join('\n'));
  const first = page.locator('#currentSlide > ul > li').first();
  await expect(first.locator(':scope > pre.code code')).toContainText('return 42;');
  await expect(first.locator(':scope > ul > li pre.code')).toHaveCount(0);
});

test('fenced code continuation in a task item has full-width row styling', async ({ page }) => {
  const fence = String.fromCharCode(96).repeat(3);
  await page.locator('#markdownInput').fill([
    '- [ ] Task',
    '    ' + fence + 'js',
    '    1 + 1;',
    '    ' + fence
  ].join('\n'));
  const task = page.locator('#currentSlide li.task-item').first();
  const code = task.locator(':scope > pre.code');
  await expect(code).toContainText('1 + 1;');
  expect(await code.evaluate(el => ({
    onSeparateRow: el.getBoundingClientRect().top >=
      el.parentElement.querySelector(':scope > span').getBoundingClientRect().bottom - 1
  }))).toEqual({ onSeparateRow: true });
});

test('display math continuation in task item has full-width row styling', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ ] Solve',
    '  $$',
    '  y = 2',
    '  $$'
  ].join('\n'));
  const task = page.locator('#currentSlide li.task-item').first();
  const math = task.locator(':scope > .katex-display-wrapper');
  await expect(math).toHaveCount(1);
  expect(await math.evaluate(el => ({
    onSeparateRow: el.getBoundingClientRect().top >=
      el.parentElement.querySelector(':scope > span').getBoundingClientRect().bottom - 1
  }))).toEqual({ onSeparateRow: true });
});


test('bracket-delimited display math in a task item occupies a full row', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ ] Solve',
    '  \\[',
    '  z = 3',
    '  \\]',
    '- [x] Done'
  ].join('\n'));
  const task = page.locator('#currentSlide li.task-item').first();
  const math = task.locator(':scope > .katex-display-wrapper');
  await expect(math).toHaveCount(1);
  await expect(math).toContainText('z = 3');
  expect(await math.evaluate(el => ({
    onSeparateRow: el.getBoundingClientRect().top >=
      el.parentElement.querySelector(':scope > span').getBoundingClientRect().bottom - 1
  }))).toEqual({ onSeparateRow: true });
  await expect(page.locator('#currentSlide > ul.task-list > li.task-item')).toHaveCount(2);
});

test('bracket-delimited display math stays a block in a plain list item', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Formula',
    '  \\[',
    '  x^2 + y^2',
    '  \\]',
    '- Explanation'
  ].join('\n'));
  const first = page.locator('#currentSlide > ul > li').first();
  await expect(first.locator(':scope > .katex-display-wrapper')).toHaveCount(1);
  await expect(first.locator(':scope > .katex-display-wrapper')).toContainText('x^2 + y^2');
  await expect(page.locator('#currentSlide > ul > li')).toHaveCount(2);
});

test('two blank lines separate ordered lists and honor the restarted number', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '1. First',
    '',
    '',
    '5. Restart'
  ].join('\n'));
  const lists = page.locator('#currentSlide > ol');
  await expect(lists).toHaveCount(2);
  await expect(lists.first().locator(':scope > li')).toHaveCount(1);
  await expect(lists.first().locator(':scope > li')).toHaveText('First');
  await expect(lists.nth(1)).toHaveAttribute('start', '5');
  await expect(lists.nth(1).locator(':scope > li')).toHaveText('Restart');
});

test('a single blank line may still separate items within the same ordered list', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '1. First',
    '',
    '2. Second'
  ].join('\n'));
  const lists = page.locator('#currentSlide > ol');
  await expect(lists).toHaveCount(1);
  await expect(lists.first().locator(':scope > li')).toHaveCount(2);
});

test('multiple blank lines also end a task list before a new list', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ ] First task',
    '',
    '',
    '- [x] Another task'
  ].join('\n'));
  const lists = page.locator('#currentSlide > ul');
  await expect(lists).toHaveCount(2);
  await expect(lists.first().locator(':scope > li.task-item')).toHaveCount(1);
  await expect(lists.nth(1).locator(':scope > li.task-item')).toHaveCount(1);
});


for (const indentation of ['  ', '   ', '\t']) {
  test('equivalent child marker indentation keeps its own continuation: ' + JSON.stringify(indentation), async ({ page }) => {
    await page.locator('#markdownInput').fill([
      '- Parent',
      indentation + '- Child',
      '    Child details',
      '- Sibling'
    ].join('\n'));
    const slide = page.locator('#currentSlide');
    const parent = slide.locator(':scope > ul > li').first();
    const child = parent.locator(':scope > ul > li').first();
    await expect(child.locator(':scope > p.list-continuation')).toHaveText('Child details');
    await expect(parent.locator(':scope > p.list-continuation')).toHaveCount(0);
    await expect(slide.locator(':scope > ul > li')).toHaveCount(2);
  });
}

test('one-space top-level marker allows a two-space continuation', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    ' - Parent with tolerated indentation',
    '  Parent details',
    '- Sibling'
  ].join('\n'));
  const root = page.locator('#currentSlide > ul');
  await expect(root.locator(':scope > li')).toHaveCount(2);
  await expect(root.locator(':scope > li').first().locator(':scope > p.list-continuation'))
    .toHaveText('Parent details');
});

test('blank line before continuation keeps normalized three-space child ownership', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- Parent',
    '   - Child',
    '',
    '    Child details',
    '- Sibling'
  ].join('\n'));
  const parent = page.locator('#currentSlide > ul > li').first();
  await expect(parent.locator(':scope > ul > li > p.list-continuation')).toHaveText('Child details');
  await expect(parent.locator(':scope > p.list-continuation')).toHaveCount(0);
});


async function expectWithinTaskBounds(task, selector) {
  const block = task.locator(selector);
  await expect(block).toHaveCount(1);
  const metrics = await block.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const item = element.parentElement.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      itemLeft: item.left,
      itemRight: item.right,
      marginLeft: parseFloat(style.marginLeft),
      boxSizing: style.boxSizing
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(metrics.itemLeft);
  expect(metrics.right).toBeLessThanOrEqual(metrics.itemRight + 1);
  expect(metrics.marginLeft).toBeGreaterThan(0);
  expect(metrics.boxSizing).toBe('border-box');
}

test('wide fenced code stays inside the task item and slide margins', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 650 });
  const fence = String.fromCharCode(96).repeat(3);
  await page.locator('#markdownInput').fill([
    '- [ ] Check a long code block',
    '    ' + fence + 'javascript',
    '    const value = "' + 'x'.repeat(300) + '";',
    '    ' + fence
  ].join('\n'));
  const task = page.locator('#currentSlide li.task-item').first();
  await expect(task.locator(':scope > pre.code code')).toContainText('const value');
  await expectWithinTaskBounds(task, ':scope > pre.code');
});

test('display math stays within the task width', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ ] Solve',
    '  $$',
    '  x^2 + y^2 = z^2',
    '  $$'
  ].join('\n'));
  await expectWithinTaskBounds(page.locator('#currentSlide li.task-item').first(), ':scope > .katex-display-wrapper');
});

test('rendered Mermaid stays within the task width', async ({ page }) => {
  const fence = String.fromCharCode(96).repeat(3);
  await page.locator('#markdownInput').fill([
    '- [ ] Flowchart',
    '    ' + fence + 'mermaid',
    '    graph LR',
    '    A --> B',
    '    ' + fence
  ].join('\n'));
  const task = page.locator('#currentSlide li.task-item').first();
  await expect(task.locator(':scope > .mermaid-render svg')).toHaveCount(1);
  await expectWithinTaskBounds(task, ':scope > .mermaid-render');
});

test('nested task lists stay inside the parent task width', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '- [ ] Parent',
    '  - [x] Child',
    '  - [ ] Another child',
    '- [x] Sibling'
  ].join('\n'));
  const task = page.locator('#currentSlide > ul.task-list > li.task-item').first();
  await expect(task.locator(':scope > ul > li.task-item')).toHaveCount(2);
  await expectWithinTaskBounds(task, ':scope > ul');
});
