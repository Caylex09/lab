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

test('denied browser storage leaves preview theme and watermark controls usable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage access denied', 'SecurityError'); }
    });
  });
  await page.reload();
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('# Draft without storage');
  await expect(page.locator('#currentSlide h1')).toHaveText('Draft without storage');
  await page.locator('#themeSelect').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#watermarkBtn').click();
  await page.locator('#watermarkInput').fill('Unsaved settings');
  await page.locator('#watermarkSave').click();
  await expect(page.locator('#watermarkModal')).toBeHidden();
  await page.locator('#saveContent').click();
  await expect(page.locator('#saveContent')).not.toHaveText('Saved!');
  await expect(page.locator('#storageStatus')).toBeVisible();
  await expect(page.locator('#storageStatus')).toContainText('Copy your Markdown');
  expect(errors).toEqual([]);
});

test('quota failures report manual and automatic save failures and recover after a successful write', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    window.__denyStorageWrites = true;
    window.__draftWriteAttempts = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'm2s-markdown-content') window.__draftWriteAttempts++;
      if (window.__denyStorageWrites) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    };
  });
  await page.clock.install();
  await page.reload();
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('# Unsaved draft');
  await page.clock.fastForward(250);
  await expect(page.locator('#currentSlide h1')).toHaveText('Unsaved draft');
  await page.locator('#themeSelect').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#saveContent').click();
  await expect(page.locator('#saveContent')).not.toHaveText('Saved!');
  await expect(page.locator('#storageStatus')).toContainText('Draft could not be saved');
  const attempts = await page.evaluate(() => window.__draftWriteAttempts);
  await page.clock.fastForward(10000);
  expect(await page.evaluate(() => window.__draftWriteAttempts)).toBeGreaterThan(attempts);
  await expect(page.locator('#storageStatus')).toBeVisible();
  await page.locator('#markdownInput').fill('# Recoverable draft');
  await page.clock.fastForward(250);
  await expect(page.locator('#currentSlide h1')).toHaveText('Recoverable draft');
  await page.evaluate(() => { window.__denyStorageWrites = false; });
  await page.locator('#themeSelect').selectOption('light');
  await expect(page.locator('#storageStatus')).toContainText('Draft could not be saved');
  await page.locator('#watermarkBtn').click();
  await page.locator('#watermarkInput').fill('Recovered setting');
  await page.locator('#watermarkSave').click();
  await expect(page.locator('#storageStatus')).toContainText('Draft could not be saved');
  await page.clock.fastForward(10000);
  expect(await page.evaluate(() => localStorage.getItem('m2s-markdown-content'))).toBe('# Recoverable draft');
  await expect(page.locator('#storageStatus')).toBeHidden();
  await page.locator('#saveContent').click();
  await expect(page.locator('#saveContent')).toHaveText('Saved!');
  expect(errors).toEqual([]);
});

test('successful storage saves restore the draft theme and watermark after reload', async ({ page }) => {
  await page.locator('#markdownInput').fill('# Saved draft\n\nText');
  await page.locator('#themeSelect').selectOption('dark');
  await page.locator('#watermarkBtn').click();
  await page.locator('#watermarkInput').fill('Saved watermark');
  await page.locator('#watermarkSave').click();
  await page.locator('#saveContent').click();
  await expect(page.locator('#saveContent')).toHaveText('Saved!');
  await page.reload();
  await expect(page.locator('#markdownInput')).toHaveValue('# Saved draft\n\nText');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#watermarkInput')).toHaveValue('Saved watermark');
  await expect(page.locator('#storageStatus')).toBeHidden();
});

test('an unreadable saved draft is protected until an explicit successful Save', async ({ page }) => {
  await page.locator('#markdownInput').fill('# Original saved draft');
  await page.locator('#saveContent').click();
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    window.__readStoredDraft = () => originalGetItem.call(localStorage, 'm2s-markdown-content');
    Storage.prototype.getItem = function (key) {
      if (key === 'm2s-markdown-content') throw new DOMException('Draft read denied', 'SecurityError');
      return originalGetItem.call(this, key);
    };
  });
  await page.clock.install();
  await page.reload();
  await expect(page.locator('#storageStatus')).toContainText('Automatic saving is paused');
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('# Replacement draft');
  await page.clock.fastForward(250);
  await expect(page.locator('#currentSlide h1')).toHaveText('Replacement draft');
  await page.clock.fastForward(10000);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  expect(await page.evaluate(() => window.__readStoredDraft())).toBe('# Original saved draft');
  await page.locator('#saveContent').click();
  await expect(page.locator('#saveContent')).toHaveText('Saved!');
  await expect(page.locator('#storageStatus')).toBeHidden();
  expect(await page.evaluate(() => window.__readStoredDraft())).toBe('# Replacement draft');
  await page.locator('#markdownInput').fill('# Later automatic save');
  await page.clock.fastForward(10250);
  expect(await page.evaluate(() => window.__readStoredDraft())).toBe('# Later automatic save');
  await page.locator('#markdownInput').fill('# Later unload save');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  expect(await page.evaluate(() => window.__readStoredDraft())).toBe('# Later unload save');
});
