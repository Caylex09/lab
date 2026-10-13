const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  // The parser/pagination tests should be deterministic and not depend on CDNs.
  await page.addInitScript(() => {
    window.mermaid = {
      initialize() {},
      render(_id, _source, callback) {
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
});

test('manual pause hides later siblings in nested lists', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('## Intro\n- First \\pause\n- Second');
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide')).toContainText('First');
  await expect(page.locator('#currentSlide')).not.toContainText('Second');
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide')).toContainText('Second');
});

test('URLs with underscores survive inline parsing', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('[link](https://example.com/a_b_c)');
  await expect(page.locator('#currentSlide a[href="https://example.com/a_b_c"]')).toHaveCount(1);
});

test('Mermaid source and relative URLs cannot inject HTML attributes', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('manual');
  const md = [
    '```mermaid',
    'flowchart LR',
    'A["<img src=x onerror=window.injected=1>"]',
    '```',
    '',
    '[link](/safe"onclick="window.injected=1)',
  ].join('\n');
  await page.locator('#markdownInput').fill(md);
  await expect(page.locator('#currentSlide a')).toHaveCount(1);
  await expect(page.locator('#currentSlide a[onclick]')).toHaveCount(0);
  await expect(page.locator('#currentSlide img')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => !!window.injected)).toBe(false);
});

test('image-only paragraphs take a progressive step', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('auto');
  await page.locator('#markdownInput').fill('## Intro\n\n![image](/missing.png)');
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await page.locator('#slideInput').fill('1');
  await page.locator('#slideInput').blur();
  await expect(page.locator('#currentSlide img')).toHaveCount(0);
  await page.locator('#nextBtn').evaluate(el => el.click());
  await expect(page.locator('#currentSlide img')).toHaveCount(1);
});

test('saving an empty markdown document persists after reload', async ({ page }) => {
  await page.locator('#markdownInput').fill('');
  await page.locator('#saveContent').click();
  await page.reload();
  await expect(page.locator('#markdownInput')).toHaveValue('');
});
