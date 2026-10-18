const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m2s-markdown-content', '# First\n---\n# Second');
  });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname !== '127.0.0.1') {
      return route.fulfill({ status: 200, body: '' });
    }
    return route.continue();
  });
  await page.goto('/');
  await page.locator('#paginationMode').selectOption('manual');
  await expect(page.locator('#currentSlide h1')).toHaveText('First');
  await page.evaluate(() => {
    document.addEventListener('keydown', event => {
      window.__lastKey = { key: event.key, prevented: event.defaultPrevented };
    });
  });
  await page.locator('#preview').focus();
});

for (const shortcut of ['Control+f', 'Meta+f', 'Alt+ArrowRight', 'Control+End']) {
  test(`${shortcut} remains available while the preview is focused`, async ({ page }) => {
    await page.keyboard.press(shortcut);
    expect(await page.evaluate(() => window.__lastKey?.prevented)).toBe(false);
    expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    await expect(page.locator('#currentSlide h1')).toHaveText('First');
    await expect(page.locator('#slideInput')).toHaveValue('1');
  });
}

test('unmodified presentation navigation and fullscreen shortcuts still work', async ({ page }) => {
  for (const [key, expected] of [
    ['ArrowRight', 'Second'], ['ArrowLeft', 'First'], ['End', 'Second'],
    ['Home', 'First'], ['PageDown', 'Second'], ['PageUp', 'First'], ['Space', 'Second'],
  ]) {
    await page.keyboard.press(key);
    await expect(page.locator('#currentSlide h1')).toHaveText(expected);
    expect(await page.evaluate(() => window.__lastKey?.prevented)).toBe(true);
  }
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('preview');
  await page.keyboard.press('f');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});
