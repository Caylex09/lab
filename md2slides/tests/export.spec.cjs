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
      (window.__capturedHeadings ||= []).push(container.querySelector('h1')?.textContent);
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
        headings: [...container.querySelectorAll('h1')].map(el => el.textContent),
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

for (const type of ['raster', 'print']) {
  test(`${type} PDF preserves page order when export starts during pending editor input`, async ({ page }) => {
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Iy6bdQAAAABJRU5ErkJggg==', 'base64');
    await page.route('**/pending-edit.png', async route => {
      await new Promise(resolve => setTimeout(resolve, 650));
      await route.fulfill({ contentType: 'image/png', body: tinyPng });
    });
    await page.locator('#paginationMode').selectOption('manual');
    await page.locator('#markdownInput').fill('# Existing');
    await expect(page.locator('#currentSlide h1')).toHaveText('Existing');

    // Dispatch both actions in the same task so export always starts before
    // the 180 ms editor debounce. The slow image lets that callback run mid-export.
    await page.evaluate(exportType => {
      const editor = document.querySelector('#markdownInput');
      editor.value = '# First\n\n![slow](/pending-edit.png)\n---\n# Second';
      editor.setSelectionRange(editor.value.length, editor.value.length);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector(exportType === 'raster' ? '#exportPdfImg' : '#exportPdfPrint').click();
    }, type);

    await expect.poll(() => page.evaluate(exportType =>
      exportType === 'raster' ? !!window.__savedPdf : !!window.__printed, type)).toBe(true);
    const headings = await page.evaluate(exportType =>
      exportType === 'raster' ? window.__capturedHeadings : window.__printed.headings, type);
    expect(headings).toEqual(['First', 'Second']);
    await expect(page.locator('#export-overlay')).toHaveCount(0);
    await expect(page.locator('#markdownInput')).toBeEnabled();
  });
}

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


test('PDF export restores the exact pre-export body overflow value', async ({ page }) => {
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('# A slide');
  await expect(page.locator('#currentSlide h1')).toHaveText('A slide');
  await page.evaluate(() => { document.body.style.overflow = 'auto'; });
  await page.locator('#exportPdfImg').click();
  await expect.poll(() => page.evaluate(() => !!window.__savedPdf)).toBe(true);
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('auto');
});

test('raster export rejects missing images instead of saving a broken PDF', async ({ page }) => {
  await page.route('**/broken-export.png', route => route.abort('failed'));
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('![broken](/broken-export.png)');
  await expect(page.locator('#currentSlide img')).toHaveCount(1);
  await page.evaluate(() => { document.body.style.overflow = 'scroll'; });
  await page.locator('#exportPdfImg').click();
  await expect(page.getByRole('alert')).toContainText('PDF image failed to load');
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => !!window.__savedPdf)).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('scroll');
});

test('print export rejects missing images instead of showing the print dialog', async ({ page }) => {
  await page.route('**/broken-print.png', route => route.abort('failed'));
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('![broken](/broken-print.png)');
  await expect(page.locator('#currentSlide img')).toHaveCount(1);
  await page.locator('#exportPdfPrint').click();
  await expect(page.getByRole('alert')).toContainText('PDF image failed to load');
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => !!window.__printed)).toBe(false);
});

test('image PDF export times out on a permanently pending asset', async ({ page }) => {
  // Keep the request pending beyond the export deadline.
  await page.route('**/stalled-export.png', () => new Promise(() => {}));
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill('![stalled](/stalled-export.png)');
  await expect(page.locator('#currentSlide img')).toHaveCount(1);
  await page.locator('#exportPdfImg').click();
  await expect(page.getByRole('alert')).toContainText('PDF export timed out', { timeout: 20000 });
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => !!window.__savedPdf)).toBe(false);
});
