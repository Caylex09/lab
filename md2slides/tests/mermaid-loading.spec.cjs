const { test, expect } = require('@playwright/test');

const mermaidSource = ['```mermaid', 'flowchart LR', 'A --> B', '```'].join('\n');
const mermaidLibrary = `window.mermaid = {
  initialize() {},
  render(_id, _code, callback) {
    callback('<svg xmlns="http://www.w3.org/2000/svg"><text>loaded diagram</text></svg>');
  }
};`;

async function preparePage(page, failure) {
  let requestCount = 0;
  let response = failure;
  const pending = [];
  await page.addInitScript(() => {
    localStorage.setItem('m2s-markdown-content', '# Initial');
    window.__savedPdf = false;
    window.__rasterPages = [];
    window.__printPages = [];
    window.html2canvas = async container => {
      window.__rasterPages.push({ diagramReady: !!container.querySelector('.mermaid-render svg') });
      return { toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' };
    };
    window.jspdf = { jsPDF: class {
      addPage() {}
      addImage() {}
      link() {}
      save() { window.__savedPdf = true; }
    } };
    window.print = () => {
      window.__printPages.push({ diagramReady: !!document.querySelector('#print-container .mermaid-render svg') });
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0);
    };
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.pathname.endsWith('/mermaid.min.js')) {
      requestCount += 1;
      // The head script fails first; application retries must use the real loader.
      if (requestCount === 1 || response === 'error') return route.abort('failed');
      if (response === 'pending') { pending.push(route); return; }
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: response === 'success' ? mermaidLibrary : '' });
    }
    return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(50);
  await page.locator('#paginationMode').selectOption('manual');
  await page.locator('#markdownInput').fill(mermaidSource);
  // Settle the editor debounce before export so this does not exercise its separate race.
  await page.clock.runFor(250);
  await expect.poll(() => requestCount).toBeGreaterThanOrEqual(2);
  return {
    pending,
    get requestCount() { return requestCount; },
    succeed() { response = 'success'; },
  };
}

async function expectNoOutput(page) {
  expect(await page.evaluate(() => ({ saved: window.__savedPdf, raster: window.__rasterPages.length, print: window.__printPages.length })))
    .toEqual({ saved: false, raster: 0, print: 0 });
}

async function expectRecovered(page) {
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  await expect(page.locator('#markdownInput')).toBeEnabled();
  await expect(page.locator('#exportPdfImg')).toBeEnabled();
  await expect(page.locator('#exportPdfPrint')).toBeEnabled();
}

async function expectSuccess(page, type) {
  if (type === 'raster') {
    await expect.poll(() => page.evaluate(() => window.__savedPdf)).toBe(true);
    expect(await page.evaluate(() => window.__rasterPages)).toEqual([{ diagramReady: true }]);
    expect(await page.evaluate(() => window.__printPages)).toEqual([]);
  } else {
    await expect.poll(() => page.evaluate(() => window.__printPages)).toEqual([{ diagramReady: true }]);
    expect(await page.evaluate(() => window.__savedPdf)).toBe(false);
    expect(await page.evaluate(() => window.__rasterPages)).toEqual([]);
    await page.clock.runFor(50);
  }
  await expectRecovered(page);
}

for (const [type, selector] of [['raster', '#exportPdfImg'], ['print', '#exportPdfPrint']]) {
  test(`${type} export times out a pending Mermaid load and ignores its late completion`, async ({ page }) => {
    const loader = await preparePage(page, 'pending');
    const originalRequest = loader.pending[0];
    await page.locator(selector).click();
    await page.clock.runFor(11000);
    await expect(page.getByRole('alert')).toContainText(/Mermaid/i);
    await expect(page.getByRole('alert')).toContainText(/timed out/i);
    await expectRecovered(page);
    await expectNoOutput(page);

    // A timed-out request may still arrive after its script was removed.
    await originalRequest.fulfill({ status: 200, contentType: 'text/javascript', body: mermaidLibrary });
    await page.clock.runFor(100);
    await expectNoOutput(page);
    await expectRecovered(page);

    loader.succeed();
    await page.locator(selector).click();
    // Preview restoration is allowed to have already started the next attempt.
    for (const route of loader.pending.slice(1)) {
      await route.fulfill({ status: 200, contentType: 'text/javascript', body: mermaidLibrary });
    }
    await page.clock.runFor(100);
    await expectSuccess(page, type);
  });
}

for (const [failure, description] of [['error', 'script onerror'], ['no-api', 'onload without a Mermaid API']]) {
  test(`Mermaid ${description} rejects export and permits a successful retry`, async ({ page }) => {
    const loader = await preparePage(page, failure);
    await page.locator('#exportPdfImg').click();
    await page.clock.runFor(250);
    await expect(page.getByRole('alert')).toContainText(/Mermaid/i);
    await expectRecovered(page);
    await expectNoOutput(page);

    const previousRequests = loader.requestCount;
    loader.succeed();
    await page.locator('#exportPdfImg').click();
    await page.clock.runFor(250);
    await expectSuccess(page, 'raster');
    expect(loader.requestCount).toBeGreaterThan(previousRequests);
  });
}

test('replacing a pending Mermaid slide with plain content does not wait for its obsolete job', async ({ page }) => {
  const loader = await preparePage(page, 'pending');
  await page.locator('#markdownInput').fill('# Plain');
  await page.clock.runFor(250);
  await expect(page.locator('#currentSlide h1')).toHaveText('Plain');
  await page.locator('#exportPdfImg').click();
  await page.clock.runFor(250);
  await expect.poll(() => page.evaluate(() => window.__savedPdf)).toBe(true);
  await expectRecovered(page);
  expect(await page.evaluate(() => window.__rasterPages)).toEqual([{ diagramReady: false }]);

  await page.clock.runFor(11000);
  await loader.pending[0].fulfill({ status: 200, contentType: 'text/javascript', body: mermaidLibrary });
  await page.clock.runFor(50);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('#currentSlide h1')).toHaveText('Plain');
  expect(await page.evaluate(() => window.__rasterPages)).toEqual([{ diagramReady: false }]);
});

for (const failure of ['throw', 'rejected promise']) {
  test(`an immediate Mermaid ${failure} cannot be hidden by the preview render before export`, async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await preparePage(page, 'success');
    await expect(page.locator('#currentSlide .mermaid-render svg')).toHaveCount(1);
    await page.evaluate(mode => {
      window.mermaid.render = () => {
        const error = new Error('broken diagram');
        if (mode === 'throw') throw error;
        return Promise.reject(error);
      };
    }, failure);
    await page.locator('#exportPdfImg').click();
    await page.clock.runFor(250);
    await expect(page.getByRole('alert')).toContainText('broken diagram');
    await expectRecovered(page);
    await expectNoOutput(page);
    await expect(page.locator('#currentSlide pre.code')).toContainText('flowchart LR');
    expect(pageErrors).toEqual([]);
  });
}

for (const [type, selector] of [['raster', '#exportPdfImg'], ['print', '#exportPdfPrint']]) {
  test(`${type} export rejects a timed-out diagram and ignores its late callback`, async ({ page }) => {
    await preparePage(page, 'success');
    await expect(page.locator('#currentSlide .mermaid-render svg')).toHaveCount(1);
    await page.evaluate(() => {
      window.__diagramCallbacks = [];
      window.mermaid.render = (_id, _code, callback) => window.__diagramCallbacks.push(callback);
    });
    await page.locator(selector).click();
    await page.clock.runFor(11000);
    await expect(page.getByRole('alert')).toContainText('Mermaid render timed out');
    await expectRecovered(page);
    await expectNoOutput(page);

    await page.evaluate(() => {
      window.__diagramCallbacks[0]('<svg><text>late old diagram</text></svg>');
    });
    await page.clock.runFor(50);
    await expectNoOutput(page);
    await expect(page.locator('#currentSlide')).not.toContainText('late old diagram');

    await page.evaluate(() => {
      window.mermaid.render = (_id, _code, callback) => callback('<svg><text>new diagram</text></svg>');
      // Complete any preview job started by export cleanup before retrying.
      window.__diagramCallbacks.slice(1).forEach(callback => callback('<svg><text>preview</text></svg>'));
    });
    await page.clock.runFor(50);
    await page.locator(selector).click();
    await page.clock.runFor(250);
    await expectSuccess(page, type);
  });
}
