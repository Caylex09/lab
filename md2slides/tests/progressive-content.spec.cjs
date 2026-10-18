const { test, expect } = require('@playwright/test');

const fence = '`'.repeat(3);
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+Iy6bdQAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('m2s-markdown-content', '# Initial');
    window.mermaid = {
      initialize() {},
      render(_id, _source, callback) {
        callback('<svg xmlns="http://www.w3.org/2000/svg"><text>diagram</text></svg>');
      },
    };
    const snapshot = root => {
      const slide = root.querySelector('#currentSlide');
      return {
        headings: [...slide.querySelectorAll('h1')].map(el => el.textContent),
        code: [...slide.querySelectorAll('pre.code code')].map(el => el.textContent),
      };
    };
    window.__rasterPages = [];
    window.__savedPdf = false;
    window.html2canvas = async container => {
      window.__rasterPages.push(snapshot(container));
      return { toDataURL: () => 'data:image/jpeg;base64,dGVzdA==' };
    };
    window.jspdf = {
      jsPDF: class {
        addPage() {}
        addImage() {}
        link() {}
        save() { window.__savedPdf = true; }
      },
    };
    window.print = () => {
      window.__printPages = [...document.querySelectorAll('#print-container .print-slide-page')].map(snapshot);
      setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0);
    };
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      return route.fulfill({ status: 200, body: '', headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/tiny.png') return route.fulfill({ contentType: 'image/png', body: tinyPng });
    return route.continue();
  });
  await page.goto('/');
  await page.locator('#paginationMode').selectOption('auto');
});

async function fillSource(page, markdown) {
  await page.locator('#markdownInput').fill(markdown);
  // Let the real 180ms input debounce finish before navigating or exporting.
  await page.waitForTimeout(250);
}

async function gotoPage(page, number) {
  await page.locator('#slideInput').fill(String(number));
  await page.locator('#slideInput').blur();
  await expect(page.locator('#slideInput')).toHaveValue(String(number));
}

async function nextPage(page) {
  await page.locator('.stage-wrapper').hover();
  await page.locator('#nextBtn').click();
}

async function moveCaretTo(page, text) {
  const editor = page.locator('#markdownInput');
  await editor.focus();
  await editor.evaluate((el, target) => {
    const position = el.value.indexOf(target);
    if (position < 0) throw new Error('Missing caret target: ' + target);
    el.setSelectionRange(position, position);
  }, text);
  await editor.press('Home');
}

test('an empty fenced section replaces the previous preview and updates the HUD', async ({ page }) => {
  await fillSource(page, '# Before');
  await expect(page.locator('#currentSlide h1')).toHaveText('Before');
  await fillSource(page, [fence, fence].join('\n'));
  await expect(page.locator('#currentSlide h1')).toHaveCount(0);
  await expect(page.locator('#currentSlide pre.code code')).toHaveCount(1);
  await expect(page.locator('#currentSlide pre.code code')).toHaveText('');
  await expect(page.locator('#slideInput')).toHaveValue('1');
  await expect(page.locator('#slideTotal')).toHaveText('1');
  await expect(page.locator('#deckTitle')).toHaveText('Presentation');
});

test('an empty middle section keeps its preview caret range and both exported pages', async ({ page }) => {
  await fillSource(page, ['# A', '---', fence, fence, '---', '# B'].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('3');
  await gotoPage(page, 1);
  await expect(page.locator('#currentSlide h1')).toHaveText('A');
  await nextPage(page);
  await expect(page.locator('#slideInput')).toHaveValue('2');
  await expect(page.locator('#currentSlide h1')).toHaveCount(0);
  await expect(page.locator('#currentSlide pre.code code')).toHaveCount(1);
  await expect(page.locator('#currentSlide pre.code code')).toHaveText('');
  await nextPage(page);
  await expect(page.locator('#slideInput')).toHaveValue('3');
  await expect(page.locator('#currentSlide h1')).toHaveText('B');
  await moveCaretTo(page, fence);
  await expect(page.locator('#slideInput')).toHaveValue('2');
  await expect(page.locator('#currentSlide pre.code code')).toHaveCount(1);
  await moveCaretTo(page, '# B');
  await expect(page.locator('#slideInput')).toHaveValue('3');
  await expect(page.locator('#currentSlide h1')).toHaveText('B');

  const expectedPages = [
    { headings: ['A'], code: [] },
    { headings: [], code: [''] },
    { headings: ['B'], code: [] },
  ];
  await page.locator('#exportPdfImg').click();
  await expect.poll(() => page.evaluate(() => window.__savedPdf)).toBe(true);
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => window.__rasterPages)).toEqual(expectedPages);
  await expect(page.locator('#slideInput')).toHaveValue('3');
  await expect(page.locator('#slideTotal')).toHaveText('3');

  await page.locator('#exportPdfPrint').click();
  await expect.poll(() => page.evaluate(() => window.__printPages)).toEqual(expectedPages);
  await expect(page.locator('#export-overlay')).toHaveCount(0);
  await expect(page.locator('#print-container')).toHaveCount(0);
  await expect(page.locator('#slideInput')).toHaveValue('3');
  await expect(page.locator('#slideTotal')).toHaveText('3');
});

test('an image-only table row has its own progressive step', async ({ page }) => {
  await fillSource(page, '# Intro\n\n| Picture |\n| --- |\n| ![x](/tiny.png) |');
  await expect(page.locator('#slideTotal')).toHaveText('2');
  await gotoPage(page, 1);
  await expect(page.locator('#currentSlide h1')).toHaveText('Intro');
  await expect(page.locator('#currentSlide tbody tr')).toHaveCount(0);
  await expect(page.locator('#currentSlide img')).toHaveCount(0);
  await nextPage(page);
  await expect(page.locator('#slideInput')).toHaveValue('2');
  await expect(page.locator('#currentSlide tbody tr')).toHaveCount(1);
  await expect(page.locator('#currentSlide tbody td img')).toHaveAttribute('src', '/tiny.png');
  await expect(page.locator('#currentSlide tbody td img')).toHaveAttribute('alt', 'x');
});

for (const [language, body] of [['js', 'example'], ['mermaid', 'flowchart LR\nA --> B']]) {
  test(`an admonition reveals its nested ${language} block in the same step`, async ({ page }) => {
    const quoteBody = body.split('\n').map(line => '> ' + line);
    await fillSource(page, ['# Intro', '', '> [!NOTE]', '> ' + fence + language, ...quoteBody, '> ' + fence].join('\n'));
    await expect(page.locator('#slideTotal')).toHaveText('2');
    await gotoPage(page, 1);
    await expect(page.locator('#currentSlide h1')).toHaveText('Intro');
    await expect(page.locator('#currentSlide .admonition')).toHaveCount(0);
    await nextPage(page);
    await expect(page.locator('#slideInput')).toHaveValue('2');
    const admonition = page.locator('#currentSlide .admonition');
    await expect(admonition).toHaveCount(1);
    await expect(admonition).toContainText('NOTE');
    if (language === 'js') {
      await expect(admonition.locator('pre.code code')).toHaveText(body);
    } else {
      await expect(admonition.locator('.mermaid-render svg')).toHaveCount(1);
    }
    await nextPage(page);
    await expect(page.locator('#slideInput')).toHaveValue('2');
  });
}

test('the final progressive page preserves a trailing empty code block without an extra step', async ({ page }) => {
  await fillSource(page, ['# Intro', '', fence, fence].join('\n'));
  await expect(page.locator('#slideTotal')).toHaveText('1');
  await expect(page.locator('#slideInput')).toHaveValue('1');
  await expect(page.locator('#currentSlide h1')).toHaveText('Intro');
  await expect(page.locator('#currentSlide pre.code code')).toHaveCount(1);
  await expect(page.locator('#currentSlide pre.code code')).toHaveText('');
});
