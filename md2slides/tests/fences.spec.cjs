const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.mermaid = {
      initialize() {},
      render(_id, _code, callback) {
        callback('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      },
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

test('four-backtick fence keeps shorter fences and separators inside code', async ({ page }) => {
  const markdown = [
    '## First', '````js', 'console.log("safe");', '```',
    '---', '````', '---', '## Second'
  ].join('\n');
  await page.locator('#markdownInput').fill(markdown);
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide pre.code code')).toContainText('---');
  await expect(page.locator('#currentSlide pre.code code')).toContainText('```');
  await expect(page.locator('#currentSlide pre.code code')).toHaveClass(/language-js/);
  await page.locator('#slideInput').fill('2');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide h2')).toHaveText('Second');
});

test('tilde fences keep slide separators as literal code', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '~~~python', 'a = 1', '---', 'b = 2', '~~~', '---', '## Following'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide pre.code code')).toContainText('a = 1\n---\nb = 2');
  await expect(page.locator('#currentSlide pre.code code')).toHaveClass(/language-python/);
});

test('display math and pause syntax inside fenced code remain literal', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    'Before', '```text', '$$', 'x^2', '$$', '\\pause', '```', 'After'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('1');
  await expect(page.locator('#currentSlide pre.code code')).toContainText('$$\nx^2\n$$\n\\pause');
  await expect(page.locator('#currentSlide .pause-marker')).toHaveCount(0);
  await expect(page.locator('#currentSlide .katex-display-wrapper')).toHaveCount(0);
  await expect(page.locator('#currentSlide pre.code')).toHaveCount(1);
  await expect(page.locator('#currentSlide p')).toHaveCount(2);
});

test('unclosed fences consume the rest of the slide', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '## Title', '```js', 'const n = 1;', '---', 'literal'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('1');
  await expect(page.locator('#currentSlide pre.code code')).toContainText('---');
  await expect(page.locator('#currentSlide pre.code code')).toContainText('literal');
});

test('a different fence marker does not close the current code block', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    '```js', '~~~', '---', '```', '---', '# Next'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide pre.code code')).toContainText('~~~\n---');
});

test('fenced code is rendered as a sibling, not inside a paragraph', async ({ page }) => {
  await page.locator('#markdownInput').fill([
    'Before', '```js extra-info', 'console.log("hi");', '```', 'After'
  ].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('1');
  await expect(page.locator('#currentSlide p')).toHaveCount(2);
  await expect(page.locator('#currentSlide p pre')).toHaveCount(0);
  await expect(page.locator('#currentSlide pre.code')).toHaveCount(1);
});


test('caret inside tilde-fenced --- stays on the containing slide', async ({ page }) => {
  const markdown = ['~~~python', 'first', '---', 'inside fence', '~~~', '---', '## Next slide'].join('\n');
  await page.locator('#markdownInput').fill(markdown);
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#markdownInput').evaluate(el => {
    const position = el.value.indexOf('inside fence');
    el.setSelectionRange(position, position);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#slideInput')).toHaveValue('1');

  await page.locator('#markdownInput').evaluate(el => {
    const position = el.value.indexOf('## Next slide');
    el.setSelectionRange(position, position);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#slideInput')).toHaveValue('2');
});

test('caret after shorter fence within long fence does not switch slides', async ({ page }) => {
  const markdown = ['````js', '```', '---', 'still code', '````', '---', '## Next'].join('\n');
  await page.locator('#markdownInput').fill(markdown);
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#markdownInput').evaluate(el => {
    const position = el.value.indexOf('still code');
    el.setSelectionRange(position, position);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#slideInput')).toHaveValue('1');
});

test('caret on an actual separator selects the following slide', async ({ page }) => {
  const markdown = ['## First', '---', '## Second'].join('\n');
  await page.locator('#markdownInput').fill(markdown);
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#markdownInput').evaluate(el => {
    const position = el.value.indexOf('---');
    el.setSelectionRange(position, position);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(page.locator('#slideInput')).toHaveValue('2');
});
