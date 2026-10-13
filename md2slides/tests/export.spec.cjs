const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  // Stub CDN-only libraries; these tests exercise the application's export lifecycle.
  await page.addInitScript(() => {
    window.mermaid = {
      initialize() {},
      render(_id, code, callback) {
        setTimeout(() => callback('<svg xmlns="http://www.w3.org/2000/svg"><text>rendered</text></svg>'),
          code.includes('SLOW') ? 350 : 0);
      }
    };
    window.html2canvas = async container => {
      window.__capture = {
        diagramReady: !!container.querySelector('.mermaid-render svg'),
        imagesReady: [...container.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0),
      };
      return { toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' };
    };
    window.jspdf = {
      jsPDF: class {
        addPage() {}
        addImage() {}
        link() {}
        save() { window.__savedPdf = true; }
      }
    };
    window.print = () => {
      const container = document.querySelector('#print-container');
      window.__printed = {
        exists: !!container,
        diagramReady: !!container?.querySelector('.mermaid-render svg'),
        imagesReady: [...(container?.querySelectorAll('img') || [])].every(img => img.complete && img.naturalWidth > 0),
      };
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 50);
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

test('image PDF waits for asynchronous Mermaid before capture', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('\`\`\`mermaid\nflowchart LR\nA --> B %% SLOW\n\`\`\`');
  await expect(page.locator('#currentSlide .mermaid-render svg')).toHaveCount(1);
  await page.locator('#exportPdfImg').click();
  await expect.poll(() => page.evaluate(() => !!window.__savedPdf)).toBe(true);
  expect(await page.evaluate(() => window.__capture?.diagramReady)).toBe(true);
  await expect(page.locator('#export-overlay')).toHaveCount(0);
});

test('print PDF preserves its pages until afterprint', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('## Export\n\n\`\`\`mermaid\nflowchart LR\nA --> B %% SLOW\n\`\`\`');
  await expect(page.locator('#currentSlide .mermaid-render svg')).toHaveCount(1);
  await page.locator('#exportPdfPrint').click();
  await expect.poll(() => page.evaluate(() => !!window.__printed)).toBe(true);
  expect(await page.evaluate(() => window.__printed.exists && window.__printed.diagramReady)).toBe(true);
  await expect(page.locator('#print-container')).toHaveCount(0);
  await expect(page.locator('#export-overlay')).toHaveCount(0);
});

test('print export waits for images to load', async ({ page }) => {
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Iy6bdQAAAABJRU5ErkJggg==', 'base64');
  await page.route('**/slow.png', async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.fulfill({ contentType: 'image/png', body: tinyPng });
  });
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('![image](/slow.png)');
  await expect(page.locator('#currentSlide img')).toHaveCount(1);
  await page.locator('#exportPdfPrint').click();
  await expect.poll(() => page.evaluate(() => !!window.__printed)).toBe(true);
  expect(await page.evaluate(() => window.__printed.imagesReady)).toBe(true);
});

test('failed export removes temp nodes and restores original disabled controls', async ({ page }) => {
  await page.evaluate(() => {
    window.html2canvas = async () => { throw new Error('simulated renderer failure'); };
    const control = document.createElement('input');
    control.id = 'disabled-control';
    control.disabled = true;
    document.body.appendChild(control);
  });
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('# Page');
  await expect(page.locator('#currentSlide h1')).toHaveText('Page');
  await page.locator('#exportPdfImg').click();
  await expect(page.getByRole('alert')).toContainText('simulated renderer failure');
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  await expect(page.locator('#exportPdfImg')).toBeEnabled();
  expect(await page.locator('#disabled-control').evaluate(el => el.disabled)).toBe(true);
  expect(await page.locator('#print-container').count()).toBe(0);
});
