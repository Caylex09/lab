(function () {
    const baseWidth = 1280, baseHeight = 720;
    const $ = sel => document.querySelector(sel);

    const dom = {
        body: document.body,
        themeSelect: $('#themeSelect'),
        paginationMode: $('#paginationMode'),
        markdown: $('#markdownInput'),
        preview: $('#preview'),
        stage: $('#stage'),
        currentSlide: $('#currentSlide'),
        indicator: $('#slideIndicator'),
        slideInput: $('#slideInput'),
        slideTotal: $('#slideTotal'),
        progressFill: $('#progressFill'),
        progressbar: $('.progressbar'),
        deckTitle: $('#deckTitle'),
        prev: $('#prevBtn'),
        next: $('#nextBtn'),
        fullscreenTop: $('#fullscreenTop'),
        saveContent: $('#saveContent'),
        exportBtnImg: $('#exportPdfImg'),
        exportBtnPrint: $('#exportPdfPrint'),
        stageWrapper: document.querySelector('.stage-wrapper'),
    };

    const SAMPLE = `# Markdown → Slides

灵感来源于：<https://github.com/openai/gpt-5-coding-examples/tree/main/apps/markdown-to-slides>

后由 [cyx](https://cyx2009.top/) 进行部分优化。

另外，如果你不希望自动分页，可以在上方选择成 Manual 模式，然后手动插入 \`\\pause\` 来分割动画。

update 2026 May 4th: 现在支持了两种导出，一种是原来笨笨的截图，一种是利用 window.print() 的方式。并添加了自定义水印。

---

# Introduction

支持了绝大多数的 Markdown 语法。

---

例如这是一个标题的例子：

# h1
## h2
### h3
#### h4
##### h5
###### h6

---

这是粗体：**test**

这是删除线：~~test~~

这是斜体：_test_

这是混搭：**~~_test_~~**

---

这是公式：$a^2+b^2=c^2$

这也是公式：

$$
\\begin{aligned}
1+1
&=2\\\\
&=3-1
\\end{aligned}
$$

---

这是链接：[cyx2009 Home](https://cyx2009.top/)

这也是链接：<https://cyx2009.top/>

这是图片：![](https://cyx2009.top/images/gravatar.png)

---

这是图片套链接：

[![](https://cyx2009.top/images/gravatar.png)](https://cyx2009.top/)

这是文字效果套链接 [**~~_点我_~~**](https://cyx2009.top/)

---

- 这是
- 无序
- 列表

1. 这是
1. 有序
1. 列表

1. 这是第一个
  - 这是描述
  - 这也是描述
    - 这还是描述
1. 这是第二个

---

这是 mermaid：

\`\`\`mermaid
stateDiagram
    S=1 --> 2
    S=1 --> 3
    S=1 --> 4
    2 --> 5
    2 --> 6
    2 --> 7
    3 --> 5
    3 --> 6
    3 --> 7
    4 --> 5
    4 --> 6
    4 --> 7
    5 --> T=8
    6 --> T=8
    7 --> T=8
\`\`\`

---

> [!NOTE]
>
> 这是提醒

> [!TIP]
>
> 这是建议

---

> [!IMPORTANT]
>
> 这是重要

> [!WARNING]
>
> 这是警告

> [!CAUTION]
>
> 这是注意

---

这是行内代码块：\`print(int(input()) + int(input()))\`

这是行间代码块：

\`\`\`cpp
#include <bits/stdc++.h>
using namespace std;
int main()
{
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
}
\`\`\`

\`\`\`python
a = int(input())
b = int(input())
print(a + b)
\`\`\`

---

> 这是引用
>
> 这是第二行引用

> 这是一级引用
>
> > 这是二级引用

---

| 第一列，居左 | 第二列，居中 | 第三列，居右 |
| :----------- | :----------: | -----------: |
| 第二行       |    第二行    |       第二行 |

- [ ] 这是任务列表
- [x] 这是已完成任务

---

最后关于导出 PDF，这段代码有点招笑了。

原理是，截图保存，然后拼成 PDF。

你问链接没法截图？我拼成 PDF 之后在对应位置加一个链接属性。

求求了，给 repo 点个 star 吧。

<https://github.com/Caylex09/lab>

`;

    // const SAMPLE = `# Markdown → Slides\nA clean, business-ready deck from plain text.\n\nPresenter: Jane Doe\nCompany: Example Corp\n\n---\n\n## Agenda\n- Why Markdown slides\n- How it works\n- Live demo\n- Tips\n- Q&A\n\n---\n\n## Why Markdown?\n- Focus on content, not formatting\n- Version control friendly\n- Quickly iterate and collaborate\n- Portable: works anywhere with a browser\n\n---\n\n## Formatting essentials\n- Emphasis with **bold** and *italic*\n- Links like [OpenAI](https://openai.com) and images below\n- Inline code: \`npm start\`\n- Code blocks:\n\n\`\`\`js\nfunction hello(name) {\n  console.log('Hello, ' + name + '!');\n}\nhello('world');\n\`\`\`\n\n---\n\n## Visuals\n![Chart](https://dummyimage.com/960x320/4b9cd3/ffffff&text=Business+Chart)\n\n- Add images to support your narrative\n- Keep slides focused and uncluttered\n\n---\n\n## Tips for great slides\n1. One idea per slide\n2. Use readable font sizes\n3. Contrast matters\n4. Keep code snippets small\n\n> Pro tip: Press F for fullscreen, use ← → to navigate.\n\n---\n\n# Thank you\n\nQuestions?\n`;

    //       const SAMPLE = `# 代码块宽度测试

    // ## 短代码
    // \`\`\`javascript
    // const x = 1;
    // const y = 2;
    // \`\`\`

    // ## 超长行代码
    // \`\`\`javascript
    // // 这是一行非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的代码行，应该会被限制在容器内这是一行非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的代码行，应该会被限制在容器内这是一行非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的代码行，应该会被限制在容器内
    // const extremelyLongVariableName = "这是一个非常长的字符串，用来测试代码块的宽度限制和滚动行为，看看它是否会超出容器边界";
    // \`\`\`

    // ---

    // 这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试这是一个测试


    // `;
    // State
    let slides = [];
    let index = 0;
    let slideLineRanges = []; // 存储每个基础幻灯片在文本中的行范围 [{start: 0, end: 10, slideIndex: 0}, ...]
    let exportingPdf = false; // 防止重复导出

    // Setup theme from preference/localStorage
    const savedTheme = localStorage.getItem('m2s-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const normalizedSaved = (savedTheme === 'corporate') ? null : savedTheme;
    const initialTheme = normalizedSaved || 'light';
    setTheme(initialTheme);
    dom.themeSelect.value = initialTheme;

    // 自动保存功能：从 localStorage 恢复内容
    const savedContent = localStorage.getItem('m2s-markdown-content');
    if (savedContent) {
        dom.markdown.value = savedContent;
    } else {
        // Fill sample by default
        dom.markdown.value = SAMPLE;
    }

    // 自动保存功能：每10秒保存一次到 localStorage
    setInterval(() => {
        const content = dom.markdown.value;
        if (content && content.trim().length > 0) {
            localStorage.setItem('m2s-markdown-content', content);
        }
    }, 10000); // 10秒

    // 页面卸载时也保存一次
    window.addEventListener('beforeunload', () => {
        const content = dom.markdown.value;
        if (content && content.trim().length > 0) {
            localStorage.setItem('m2s-markdown-content', content);
        }
    });

    // Render initial
    compileAndRender();
    layoutStage();

    // Event listeners
    window.addEventListener('resize', layoutStage);
    document.addEventListener('fullscreenchange', layoutStage);

    dom.themeSelect.addEventListener('change', (e) => setTheme(e.target.value));
    dom.paginationMode.addEventListener('change', () => compileAndRender());
    $('#loadSample').addEventListener('click', () => { dom.markdown.value = SAMPLE; compileAndRender(true); });

    // 保存按钮功能
    if (dom.saveContent) {
        dom.saveContent.addEventListener('click', () => {
            const content = dom.markdown.value;
            if (content && content.trim().length > 0) {
                localStorage.setItem('m2s-markdown-content', content);
                // 视觉反馈：临时改变按钮文本
                const originalText = dom.saveContent.textContent;
                dom.saveContent.textContent = 'Saved!';
                dom.saveContent.style.opacity = '0.7';
                setTimeout(() => {
                    dom.saveContent.textContent = originalText;
                    dom.saveContent.style.opacity = '1';
                }, 1000);
            }
        });
    }

    dom.fullscreenTop.addEventListener('click', toggleFullscreen);

    dom.prev.addEventListener('click', prevSlide);
    dom.next.addEventListener('click', nextSlide);

    // 输入框跳转功能
    if (dom.slideInput) {
        dom.slideInput.addEventListener('change', (e) => {
            if (!slides || slides.length === 0) {
                e.target.value = 0;
                return;
            }
            const targetSlide = parseInt(e.target.value);
            if (!isNaN(targetSlide) && targetSlide >= 1 && targetSlide <= slides.length) {
                gotoSlide(targetSlide - 1);
            } else {
                // 如果输入无效，恢复当前值
                e.target.value = index + 1;
            }
        });

        dom.slideInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.target.blur(); // 触发 change 事件
            }
        });
    }

    // 进度条点击跳转功能
    if (dom.progressbar) {
        dom.progressbar.addEventListener('click', (e) => {
            if (!slides || slides.length === 0) return;
            const rect = dom.progressbar.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const percentage = clickX / rect.width;
            const targetSlide = Math.max(1, Math.min(slides.length, Math.ceil(percentage * slides.length)));
            gotoSlide(targetSlide - 1);
        });
    }

    // 仅在舞台区域悬停时显示左右按钮
    if (dom.stageWrapper) {
        dom.stageWrapper.addEventListener('mouseenter', () => dom.preview.classList.add('nav-visible'));
    }
    dom.preview.addEventListener('mouseleave', () => dom.preview.classList.remove('nav-visible'));

    // dom.preview.addEventListener('dblclick', toggleFullscreen);
    // dom.preview.addEventListener('keydown', handleKey);
    document.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName || '').toLowerCase();
        if (tag === 'textarea' || tag === 'input') return; // ignore while typing
        handleKey(e);
    });

    // Debounced input handler
    let timer = null;
    dom.markdown.addEventListener('input', () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            // 重新编译幻灯片
            compileAndRender();
            // 根据当前光标位置重新对齐到对应基础幻灯片的最后一个渐进步骤
            gotoSlideByCaret();
        }, 180);
    });

    // 根据鼠标位置跳转到对应幻灯片
    function getSlideIndexFromMousePosition(e) {
        if (!dom.markdown || slideLineRanges.length === 0) return -1;

        const textarea = dom.markdown;
        const rect = textarea.getBoundingClientRect();
        const mouseY = e.clientY - rect.top;

        // 计算鼠标所在的行号
        // 使用更可靠的方法：通过 textarea 的 selectionStart 来计算行号
        // 首先计算鼠标点击位置对应的字符位置
        const styles = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(styles.lineHeight) || 20;
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const borderTop = parseFloat(styles.borderTopWidth) || 0;
        const scrollTop = textarea.scrollTop;

        // 获取文本内容
        const lines = dom.markdown.value.replace(/\r/g, '').split('\n');

        // 计算鼠标所在的行号（从 0 开始）
        // mouseY 是相对于 textarea 顶部的位置，加上 scrollTop 得到在文本中的位置
        const textY = mouseY + scrollTop - paddingTop - borderTop;
        // 使用 Math.round 而不是 Math.floor，使计算更准确
        let lineNumber = Math.max(0, Math.round(textY / lineHeight));

        // 确保行号不超过文本的实际行数
        lineNumber = Math.min(lineNumber, lines.length - 1);

        // 如果计算出的行号是空行，尝试向上查找最近的非空行
        // 这样可以避免点击在空行时匹配错误
        if (lines[lineNumber] && lines[lineNumber].trim() === '' && lineNumber > 0) {
            // 向上查找最近的非空行
            for (let i = lineNumber - 1; i >= 0; i--) {
                if (lines[i] && lines[i].trim() !== '') {
                    lineNumber = i;
                    break;
                }
            }
        }

        // 获取点击的行内容
        const clickedLine = lines[lineNumber] || '';

        // 基于分割线计数来确定属于哪个基础幻灯片
        // 从开头到当前行（包含）统计非代码块中的分割线数量
        let baseSlideIndex = 0;
        let inCode = false;
        for (let i = 0; i <= lineNumber && i < lines.length; i++) {
            const line = lines[i];
            if (/^```/.test(line.trim())) inCode = !inCode;
            if (!inCode && line.trim() === '---') {
                // 分割线之后才算下一张幻灯片
                if (i < lineNumber) baseSlideIndex++;
            }
        }

        // 防护：边界
        if (baseSlideIndex < 0) baseSlideIndex = 0;
        if (baseSlideIndex >= slideLineRanges.length) baseSlideIndex = slideLineRanges.length - 1;

        const range = slideLineRanges[baseSlideIndex];
        if (!range) return -1;

        console.log(`\n点击位置: 行 ${lineNumber}, 内容: "${clickedLine.substring(0, 50)}"`);
        console.log(`归属基础幻灯片索引: ${baseSlideIndex}, 行范围 ${range.start}-${range.end}, 渐进式索引 ${range.progressiveStartIndex}-${range.progressiveStartIndex + (range.progressiveCount || 1) - 1}`);

        if (range.progressiveStartIndex !== undefined && range.progressiveCount !== undefined) {
            return range.progressiveStartIndex + range.progressiveCount - 1;
        }
        return range.progressiveStartIndex !== undefined ? range.progressiveStartIndex : 0;
    }

    // 基于当前渐进式索引反推所属的基础幻灯片索引
    function getBaseSlideIndexBySlideIndex(slideIdx) {
        if (!slideLineRanges || !slideLineRanges.length) return -1;
        for (let i = 0; i < slideLineRanges.length; i++) {
            const r = slideLineRanges[i];
            if (r.progressiveStartIndex == null) continue;
            const start = r.progressiveStartIndex;
            const count = r.progressiveCount || 1;
            const end = start + count - 1;
            if (slideIdx >= start && slideIdx <= end) return i;
        }
        return -1;
    }

    // 基于光标位置跳转到对应幻灯片（仅在基础幻灯片发生变化时才跳转，避免同一页内“抖动”）
    function gotoSlideByCaret() {
        if (!dom.markdown || !slideLineRanges.length) return;
        const text = dom.markdown.value.replace(/\r/g, '');
        const caret = dom.markdown.selectionStart ?? 0;
        // 计算光标所在行号
        const before = text.slice(0, caret);
        const lineNumber = before.split('\n').length - 1;
        // 计算基础幻灯片索引：统计光标行之前（不含当前行）的分隔符数量（排除代码块内）
        const lines = text.split('\n');
        let baseSlideIndex = 0;
        let inCode = false;
        for (let i = 0; i < lines.length && i < lineNumber; i++) {
            const ln = lines[i];
            if (/^```/.test(ln.trim())) inCode = !inCode;
            if (!inCode && ln.trim() === '---') {
                baseSlideIndex++;
            }
        }
        // 若当前行本身是分隔符，则归属于分隔符之后
        if (lines[lineNumber] && lines[lineNumber].trim() === '---') {
            baseSlideIndex++;
        }
        // 边界保护
        if (baseSlideIndex < 0) baseSlideIndex = 0;
        if (baseSlideIndex >= slideLineRanges.length) baseSlideIndex = slideLineRanges.length - 1;

        const range = slideLineRanges[baseSlideIndex];
        if (!range) return;

        // 目标：始终预览“当前基础幻灯片”的最后一个渐进步骤
        const targetSlideIndex = (range.progressiveStartIndex ?? 0) + (range.progressiveCount ? range.progressiveCount - 1 : 0);

        // 如果当前渐进页已经属于同一张基础幻灯片，且就是最后一个渐进步骤，则不做任何跳转
        const currentBase = getBaseSlideIndexBySlideIndex(index);
        if (currentBase === baseSlideIndex && index === targetSlideIndex) {
            return;
        }

        // 如果当前不在该基础幻灯片，或者在该基础幻灯片但处于较早的渐进步骤，则跳到最后一步
        if (targetSlideIndex !== index) {
            gotoSlide(targetSlideIndex);
        }
    }

    // 监听 textarea 的点击和“光标移动”类按键（上下/翻页/Home/End），用于同步当前 PPT 页
    dom.markdown.addEventListener('click', () => gotoSlideByCaret());
    dom.markdown.addEventListener('keyup', (e) => {
        const navKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];
        if (navKeys.includes(e.key)) {
            gotoSlideByCaret();
        }
    });
    // 不在每次输入字符/删除字符时自动跳转，避免编辑时误判导致“跳页”

    // 在 setTheme 函数中添加代码高亮主题切换
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('m2s-theme', theme);

        // 切换代码高亮主题
        const highlightLight = document.getElementById('highlightLightTheme');
        const highlightDark = document.getElementById('highlightDarkTheme');

        if (theme === 'dark') {
            if (highlightLight) highlightLight.disabled = true;
            if (highlightDark) highlightDark.disabled = false;
        } else {
            if (highlightLight) highlightLight.disabled = false;
            if (highlightDark) highlightDark.disabled = true;
        }
    }

    function handleKey(e) {
        const key = e.key;
        if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') { e.preventDefault(); nextSlide(); }
        else if (key === 'ArrowLeft' || key === 'PageUp') { e.preventDefault(); prevSlide(); }
        else if (key === 'Home') { e.preventDefault(); gotoSlide(0); }
        else if (key === 'End') { e.preventDefault(); gotoSlide(slides.length - 1); }
        else if (key === 'f' || key === 'F') { e.preventDefault(); toggleFullscreen(); }
    }

    function toggleFullscreen() {
        const el = dom.preview;
        if (!document.fullscreenElement) {
            el.requestFullscreen && el.requestFullscreen();
        } else {
            document.exitFullscreen && document.exitFullscreen();
        }
    }

    function layoutStage() {
        const wrap = dom.preview.querySelector('.stage-wrapper');
        const rect = wrap.getBoundingClientRect();
        const scale = Math.min(rect.width / baseWidth, rect.height / baseHeight);
        dom.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    function prevSlide() { gotoSlide(index - 1); }
    function nextSlide() { gotoSlide(index + 1); }
    function gotoSlide(i) {
        if (!slides.length) return;
        index = Math.max(0, Math.min(slides.length - 1, i));
        dom.currentSlide.innerHTML = slides[index] || '';
        renderKaTeX();
        updateHud();
    }

    function updateHud() {
        const currentSlide = slides.length ? index + 1 : 0;
        const totalSlides = slides.length;

        // 更新输入框和总数
        if (dom.slideInput) {
            dom.slideInput.value = currentSlide;
            dom.slideInput.max = totalSlides;
        }
        if (dom.slideTotal) {
            dom.slideTotal.textContent = totalSlides;
        }

        const pct = slides.length ? ((index + 1) / slides.length) * 100 : 0;
        dom.progressFill.style.width = pct.toFixed(2) + '%';
        // Update deck title from first H1, if present
        const tmp = document.createElement('div');
        tmp.innerHTML = slides[0] || '';
        const h1 = tmp.querySelector('h1');
        dom.deckTitle.textContent = h1 ? h1.textContent : 'Presentation';
    }

    // 手动分页模式：根据 \pause 标记生成幻灯片
    function generateManualPaginationSlides(tempDiv, pauseMarkers) {
        const slides = [];

        // 按照 DOM 顺序排序 pause 标记
        const sortedPauseMarkers = Array.from(pauseMarkers).sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
            return 0;
        });

        if (sortedPauseMarkers.length === 0) {
            // 没有 pause 标记，返回单页
            const slideDiv = tempDiv.cloneNode(true);
            slideDiv.querySelectorAll('.pause-marker[data-pause="true"]').forEach(marker => marker.remove());
            slides.push(slideDiv.innerHTML);
            return slides;
        }

        // 为每个 pause 标记创建一个分页
        sortedPauseMarkers.forEach((pauseMarker, idx) => {
            const slideDiv = tempDiv.cloneNode(true);
            const allMarkers = Array.from(slideDiv.querySelectorAll('.pause-marker[data-pause="true"]'));

            // 找到当前对应的 pause 标记
            const currentMarker = allMarkers[idx];
            if (!currentMarker) return;

            // 找到包含当前 pause 标记的块级元素（P, H1-H6, LI, BLOCKQUOTE 等）
            let containerElement = currentMarker.parentElement;
            while (containerElement && containerElement !== slideDiv) {
                const tagName = containerElement.tagName;
                if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'DIV', 'UL', 'OL', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD'].includes(tagName)) {
                    break;
                }
                containerElement = containerElement.parentElement;
            }

            if (!containerElement || containerElement === slideDiv) {
                // 如果找不到合适的容器，就移除该 pause 标记之后的所有内容
                let node = currentMarker;
                while (node && node !== slideDiv) {
                    let nextSibling = node.nextSibling;
                    while (nextSibling) {
                        const toRemove = nextSibling;
                        nextSibling = nextSibling.nextSibling;
                        toRemove.remove();
                    }
                    node = node.parentElement;
                }
                currentMarker.remove();
            } else {
                // 如果 pause 标记在元素内部，需要在该元素处分割

                // 1. 移除该元素之后的所有兄弟元素
                let nextSibling = containerElement.nextSibling;
                while (nextSibling) {
                    const toRemove = nextSibling;
                    nextSibling = nextSibling.nextSibling;
                    toRemove.remove();
                }

                // 2. 如果 pause 标记在元素内部，需要移除该元素中 pause 标记之后的内容
                if (containerElement.contains(currentMarker)) {
                    // 移除 pause 标记之后的所有内容（在同一元素内）
                    let node = currentMarker.nextSibling;
                    while (node && containerElement.contains(node)) {
                        const toRemove = node;
                        node = node.nextSibling;
                        toRemove.remove();
                    }
                    // 移除 pause 标记本身
                    currentMarker.remove();
                } else {
                    // pause 标记不在容器内，直接移除它
                    currentMarker.remove();
                }
            }

            // 移除所有剩余的 pause 标记（包括当前这个，如果还没移除的话）
            slideDiv.querySelectorAll('.pause-marker[data-pause="true"]').forEach(marker => marker.remove());

            slides.push(slideDiv.innerHTML);
        });

        // 添加最后一页（包含所有剩余内容，没有 pause 标记）
        const lastSlideDiv = tempDiv.cloneNode(true);
        // 移除所有 pause 标记
        lastSlideDiv.querySelectorAll('.pause-marker[data-pause="true"]').forEach(marker => marker.remove());
        slides.push(lastSlideDiv.innerHTML);

        console.log(`手动模式：找到 ${sortedPauseMarkers.length} 个 \\pause 标记，生成了 ${slides.length} 页幻灯片`);
        return slides;
    }

    // 生成渐进式幻灯片（类似 PPT 动画效果）
    function generateProgressiveSlides(html) {
        const paginationMode = dom.paginationMode ? dom.paginationMode.value : 'auto';
        console.log(`\n========== 开始生成渐进式幻灯片 (模式: ${paginationMode}) ==========`);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // 如果是手动模式，检查是否有 \pause 标记
        if (paginationMode === 'manual') {
            const pauseMarkers = tempDiv.querySelectorAll('.pause-marker[data-pause="true"]');
            if (pauseMarkers.length === 0) {
                // 没有 \pause 标记，返回原始幻灯片（不分页）
                console.log('手动模式：未找到 \\pause 标记，返回单页幻灯片');
                return [html];
            }
            console.log(`手动模式：找到 ${pauseMarkers.length} 个 \\pause 标记`);
            return generateManualPaginationSlides(tempDiv, pauseMarkers);
        }

        // 自动模式：保持原有逻辑

        // 查找所有可渐进显示的元素，按照它们在 DOM 中的顺序处理
        const progressiveElements = [];
        let elementIndex = 0;

        // 使用 TreeWalker 按照 DOM 顺序遍历
        const walker = document.createTreeWalker(
            tempDiv,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function (node) {
                    // 跳过代码块、mermaid 和 LaTeX 公式块
                    if (node.tagName === 'PRE' && node.classList.contains('code')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (node.classList.contains('mermaid')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 跳过 LaTeX 公式块（katex-display-wrapper）
                    if (node.classList.contains('katex-display-wrapper')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 跳过 admonition 块内部的元素（admonition 块本身会被处理，但内部元素不应该被单独处理）
                    const parentAdmonition = node.closest('.admonition');
                    if (parentAdmonition && node !== parentAdmonition) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 跳过代码块内部的元素（code 标签）
                    if (node.closest('pre.code')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            let shouldProcess = false;

            // 标题（h1-h6）
            if (/^H[1-6]$/.test(node.tagName)) {
                if (!node.closest('blockquote') && !node.closest('.admonition')) {
                    shouldProcess = true;
                }
            }
            // 段落
            else if (node.tagName === 'P') {
                if (!node.closest('li') && !node.closest('blockquote') && !node.closest('.admonition')) {
                    shouldProcess = true;
                    // 检查段落后面是否紧跟着 LaTeX 公式块
                    let nextSibling = node.nextElementSibling;
                    if (nextSibling && nextSibling.classList.contains('katex-display-wrapper')) {
                        // 将 LaTeX 公式块和段落使用相同的索引，这样它们会一起显示
                        nextSibling.setAttribute('data-progressive-index', elementIndex);
                    }
                }
            }
            // 列表项（只处理顶级列表的直接子项）
            else if (node.tagName === 'LI') {
                const list = node.parentElement;
                if ((list.tagName === 'UL' || list.tagName === 'OL') && !list.closest('li')) {
                    shouldProcess = true;
                }
            }
            // 表格行（tr）
            else if (node.tagName === 'TR' && node.closest('tbody')) {
                shouldProcess = true;
            }
            // blockquote
            else if (node.tagName === 'BLOCKQUOTE') {
                shouldProcess = true;
            }
            // admonition 块
            else if (node.classList.contains('admonition')) {
                shouldProcess = true;
            }

            if (shouldProcess) {
                // 检查元素是否有实际内容，跳过空内容
                let hasContent = false;
                if (node.tagName === 'P') {
                    // 段落：检查文本内容是否为空
                    hasContent = node.textContent.trim().length > 0;
                } else if (node.tagName === 'LI') {
                    // 列表项：检查文本内容是否为空
                    hasContent = node.textContent.trim().length > 0;
                } else if (node.tagName === 'TR') {
                    // 表格行：检查是否有单元格内容
                    hasContent = Array.from(node.querySelectorAll('td')).some(td => td.textContent.trim().length > 0);
                } else {
                    // 其他元素（标题、blockquote、admonition）：检查文本内容
                    hasContent = node.textContent.trim().length > 0;
                }

                if (hasContent) {
                    node.setAttribute('data-progressive-index', elementIndex++);
                    progressiveElements.push(node);
                }
            }
        }

        console.log(`找到 ${progressiveElements.length} 个渐进式元素（不包括代码块）`);

        // 后处理：确保 admonition 块内部的元素不会被单独处理
        // 移除所有在 admonition 块内部的元素的 data-progressive-index 属性
        tempDiv.querySelectorAll('.admonition [data-progressive-index]').forEach(el => {
            if (!el.classList.contains('admonition')) {
                el.removeAttribute('data-progressive-index');
            }
        });

        // 后处理：确保代码块和 mermaid 块作为独立的渐进式元素
        // 按照 DOM 顺序处理代码块，确保每个代码块都有唯一的、递增的索引
        // 使用 TreeWalker 确保按照 DOM 顺序获取代码块
        const codeBlocks = [];
        const codeBlockWalker = document.createTreeWalker(
            tempDiv,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function (codeEl) {
                    if ((codeEl.tagName === 'PRE' && codeEl.classList.contains('code')) ||
                        codeEl.classList.contains('mermaid')) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );
        let codeBlockNode;
        while (codeBlockNode = codeBlockWalker.nextNode()) {
            codeBlocks.push(codeBlockNode);
        }

        if (codeBlocks.length > 0) {
            console.log(`\n找到 ${codeBlocks.length} 个代码块/Mermaid 块，按 DOM 顺序处理...`);
            codeBlocks.forEach((el, idx) => {
                const preview = el.textContent.substring(0, 30).replace(/\n/g, ' ');
                console.log(`  代码块 ${idx + 1} (DOM 顺序): "${preview}..."`);
            });

            // 收集所有已分配索引的元素（开始时只包括渐进式元素），按 DOM 顺序排序
            const allIndexedElements = progressiveElements.map(el => ({
                element: el,
                index: parseInt(el.getAttribute('data-progressive-index'))
            })).sort((a, b) => {
                const pos = a.element.compareDocumentPosition(b.element);
                if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
                if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
                return 0;
            });

            // 为每个代码块分配索引（按 DOM 顺序）
            codeBlocks.forEach((codeEl, codeIdx) => {
                // 找到代码块前面最后一个已分配索引的元素
                let maxIndex = -1;
                let precedingElement = null;

                // 遍历所有已分配索引的元素，找到在代码块前面的最后一个
                allIndexedElements.forEach(item => {
                    const pos = item.element.compareDocumentPosition(codeEl);
                    if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
                        if (item.index > maxIndex) {
                            maxIndex = item.index;
                            precedingElement = item.element;
                        }
                    }
                });

                // 代码块的索引 = 前面最后一个元素的索引 + 1
                // 如果前面没有元素，使用当前最大索引 + 1（确保每个代码块都有唯一索引）
                const codeIndex = maxIndex >= 0 ? maxIndex + 1 : (allIndexedElements.length > 0
                    ? Math.max(...allIndexedElements.map(item => item.index)) + 1
                    : 0);

                codeEl.setAttribute('data-progressive-index', codeIndex.toString());

                // 调试输出
                const codeType = codeEl.tagName === 'PRE' ? '代码块' : 'Mermaid 图表';
                const codePreview = codeEl.textContent.substring(0, 30).replace(/\n/g, ' ');
                const precedingInfo = precedingElement
                    ? `${precedingElement.tagName} (索引 ${maxIndex})`
                    : '无（前面没有元素）';
                console.log(`  代码块 ${codeIdx + 1}: ${codeType}, 索引=${codeIndex}, 前面元素=${precedingInfo}, 预览="${codePreview}..."`);

                // 将代码块添加到已分配索引的元素列表中（按 DOM 顺序插入）
                // 这样后续的代码块可以正确找到前面的代码块
                let insertIndex = -1;
                for (let i = 0; i < allIndexedElements.length; i++) {
                    const item = allIndexedElements[i];
                    const pos = item.element.compareDocumentPosition(codeEl);
                    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
                        insertIndex = i;
                        break;
                    }
                }
                if (insertIndex >= 0) {
                    allIndexedElements.splice(insertIndex, 0, { element: codeEl, index: codeIndex });
                } else {
                    allIndexedElements.push({ element: codeEl, index: codeIndex });
                }
            });
        }

        // 检查是否有代码块或 mermaid 块
        const hasCodeBlocks = tempDiv.querySelectorAll('pre.code, .mermaid').length > 0;

        // 获取所有带索引的元素（包括渐进式元素和代码块）
        const allIndexedElementsList = Array.from(tempDiv.querySelectorAll('[data-progressive-index]'));

        // 如果没有可渐进显示的元素（包括代码块），返回原始幻灯片
        if (allIndexedElementsList.length === 0) {
            return [html];
        }

        // 重新整理索引，确保索引是连续的（0, 1, 2, 3...）
        // 按照 DOM 顺序排序所有元素
        console.log(`\n重新整理索引前，元素顺序：`);
        allIndexedElementsList.forEach((el, idx) => {
            const oldIndex = el.getAttribute('data-progressive-index');
            let desc = '';
            if (el.tagName === 'PRE' && el.classList.contains('code')) {
                desc = `代码块: ${el.querySelector('code')?.textContent.substring(0, 30)}`;
            } else if (el.classList.contains('mermaid')) {
                desc = `Mermaid: ${el.textContent.substring(0, 30)}`;
            } else {
                desc = `${el.tagName}: ${el.textContent.substring(0, 30)}`;
            }
            console.log(`  [${idx}] 旧索引=${oldIndex}: ${desc}`);
        });

        // 按照 DOM 顺序排序：使用 TreeWalker 来确保正确的顺序
        const sortedElements = [];
        const sortWalker = document.createTreeWalker(
            tempDiv,
            NodeFilter.SHOW_ELEMENT,
            null
        );
        let sortNode;
        while (sortNode = sortWalker.nextNode()) {
            if (sortNode.hasAttribute('data-progressive-index')) {
                sortedElements.push(sortNode);
            }
        }

        // 使用排序后的元素列表替换原列表
        allIndexedElementsList.length = 0;
        allIndexedElementsList.push(...sortedElements);

        // 重新分配连续的索引
        allIndexedElementsList.forEach((el, idx) => {
            el.setAttribute('data-progressive-index', idx.toString());
        });

        console.log(`\n重新整理索引后，元素顺序（按 DOM 顺序）：`);
        allIndexedElementsList.forEach((el, idx) => {
            let desc = '';
            if (el.tagName === 'PRE' && el.classList.contains('code')) {
                desc = `代码块: ${el.querySelector('code')?.textContent.substring(0, 30)}`;
            } else if (el.classList.contains('mermaid')) {
                desc = `Mermaid: ${el.textContent.substring(0, 30)}`;
            } else {
                desc = `${el.tagName}: ${el.textContent.substring(0, 30)}`;
            }
            console.log(`  [${idx}] 新索引=${idx}: ${desc}`);
        });

        // 生成渐进式幻灯片
        const progressiveSlides = [];
        // 最大索引就是元素数量 - 1
        const maxIndex = allIndexedElementsList.length - 1;

        for (let i = 0; i <= maxIndex; i++) {
            const slideDiv = tempDiv.cloneNode(true);

            // 找出当前页新增的元素（索引为 i 的元素）
            const newElements = Array.from(tempDiv.querySelectorAll('[data-progressive-index]'))
                .filter(el => parseInt(el.getAttribute('data-progressive-index')) === i);

            // 检查是否有实际内容（由于已经过滤了空元素，这里应该总是有内容）
            const hasRealContent = newElements.length > 0 && newElements.some(el => {
                if (el.tagName === 'P' || el.tagName === 'LI') {
                    return el.textContent.trim().length > 0;
                } else if (el.tagName === 'TR') {
                    return Array.from(el.querySelectorAll('td')).some(td => td.textContent.trim().length > 0);
                } else if (el.tagName === 'PRE' && el.classList.contains('code')) {
                    return el.querySelector('code')?.textContent.trim().length > 0;
                } else if (el.classList.contains('mermaid')) {
                    return el.textContent.trim().length > 0;
                } else {
                    return el.textContent.trim().length > 0;
                }
            });

            // 如果没有实际内容，跳过这一页
            if (!hasRealContent) {
                console.log(`=== 第 ${i + 1} 页：无实际内容，跳过 ===`);
                continue;
            }

            // 调试输出：显示当前页新增的内容
            console.log(`=== 第 ${i + 1} 页新增内容 ===`);
            newElements.forEach((el, idx) => {
                let desc = '';
                if (el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3' ||
                    el.tagName === 'H4' || el.tagName === 'H5' || el.tagName === 'H6') {
                    desc = `标题: ${el.textContent.substring(0, 50)}`;
                } else if (el.tagName === 'P') {
                    desc = `段落: ${el.textContent.substring(0, 50)}`;
                } else if (el.tagName === 'LI') {
                    desc = `列表项: ${el.textContent.substring(0, 50)}`;
                } else if (el.tagName === 'TR') {
                    desc = `表格行: ${Array.from(el.querySelectorAll('td')).map(td => td.textContent).join(' | ')}`;
                } else if (el.tagName === 'BLOCKQUOTE') {
                    desc = `引用块: ${el.textContent.substring(0, 50)}`;
                } else if (el.classList.contains('admonition')) {
                    desc = `提示块: ${el.textContent.substring(0, 50)}`;
                } else if (el.tagName === 'PRE' && el.classList.contains('code')) {
                    const codeText = el.querySelector('code')?.textContent || '';
                    desc = `代码块: ${codeText.substring(0, 50)}... (${codeText.length} 字符)`;
                } else if (el.classList.contains('mermaid')) {
                    desc = `Mermaid 图表: ${el.textContent.substring(0, 50)}`;
                } else if (el.classList.contains('katex-display-wrapper')) {
                    desc = `LaTeX 公式块`;
                } else {
                    desc = `${el.tagName}: ${el.textContent.substring(0, 50)}`;
                }
                console.log(`  [${idx + 1}] ${desc}`);
            });

            // 移除所有带索引的元素
            const allProgressive = slideDiv.querySelectorAll('[data-progressive-index]');
            allProgressive.forEach(el => {
                const index = parseInt(el.getAttribute('data-progressive-index'));
                // 只保留索引 <= i 的元素
                if (index > i) {
                    el.remove();
                } else {
                    // 移除 data 属性，保持 HTML 干净
                    el.removeAttribute('data-progressive-index');
                }
            });

            progressiveSlides.push(slideDiv.innerHTML);
        }

        console.log(`\n总共生成了 ${progressiveSlides.length} 页渐进式幻灯片\n`);

        return progressiveSlides;
    }

    function compileAndRender(forceFirst = false) {
        const text = dom.markdown.value ?? '';
        const parts = splitSlides(text);
        const baseSlides = parts.map(s => mdToHtml(s.trim()));

        // 计算每个基础幻灯片在文本中的行范围
        slideLineRanges = [];
        const lines = text.replace(/\r/g, '').split('\n');
        let slideStartLine = 0;
        let inCode = false;
        let slideIndex = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^```/.test(line.trim())) inCode = !inCode;

            // 如果遇到分隔符且不在代码块中，开始新的幻灯片
            if (!inCode && line.trim() === '---' && i > slideStartLine) {
                // 当前幻灯片的结束行是分隔符的前一行（包括空行）
                // 这样确保点击在幻灯片末尾的任何位置（包括空行）都能正确匹配
                const actualEndLine = i - 1;

                // 保存当前幻灯片的行范围（包含所有行，包括末尾的空行）
                slideLineRanges.push({
                    start: slideStartLine,
                    end: actualEndLine,
                    slideIndex: slideIndex++
                });
                slideStartLine = i + 1; // 下一个幻灯片从分隔符的下一行开始
            }
        }

        // 添加最后一个幻灯片
        if (slideStartLine < lines.length) {
            // 最后一个幻灯片的结束行是文件的最后一行（包括末尾的空行）
            // 这样确保点击在幻灯片末尾的任何位置（包括空行）都能正确匹配
            const actualEndLine = lines.length - 1;

            slideLineRanges.push({
                start: slideStartLine,
                end: actualEndLine,
                slideIndex: slideIndex
            });
        }

        // 调试输出：显示每个幻灯片的行范围
        console.log('\n========== 幻灯片行范围 ==========');
        slideLineRanges.forEach((range, idx) => {
            const previewStart = lines[range.start]?.substring(0, 30) || '';
            const previewEnd = lines[range.end]?.substring(0, 30) || '';
            console.log(`幻灯片 ${idx}: 行 ${range.start} - ${range.end} (共 ${range.end - range.start + 1} 行)`);
            console.log(`  起始: "${previewStart}..."`);
            console.log(`  结束: "${previewEnd}..."`);
        });

        // 为每个幻灯片生成渐进式版本
        slides = [];
        let cumulativeSlideIndex = 0;
        baseSlides.forEach((baseSlide, baseIndex) => {
            const progressiveSlides = generateProgressiveSlides(baseSlide);
            slides.push(...progressiveSlides);
            // 更新行范围，记录该基础幻灯片对应的渐进式幻灯片索引范围
            if (slideLineRanges[baseIndex]) {
                slideLineRanges[baseIndex].progressiveStartIndex = cumulativeSlideIndex;
                slideLineRanges[baseIndex].progressiveCount = progressiveSlides.length;
            }
            cumulativeSlideIndex += progressiveSlides.length;
        });

        if (forceFirst) index = 0;
        if (index >= slides.length) index = Math.max(0, slides.length - 1);
        gotoSlide(index);
    }
    // 新增 renderKaTeX 函数
    // 修改 renderKaTeX 函数，处理块引用中的数学公式
    function renderKaTeX() {
        // 使用 requestAnimationFrame 来避免渲染闪烁
        requestAnimationFrame(() => {
            if (typeof renderMathInElement !== 'undefined') {
                renderMathInElement(dom.currentSlide, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                    ],
                    throwOnError: false,
                    errorColor: '#ff5252'
                });
            }

            // 渲染代码高亮
            if (typeof hljs !== 'undefined') {
                dom.currentSlide.querySelectorAll('pre.code code').forEach((block) => {
                    // 如果已经高亮过，跳过
                    if (!block.classList.contains('hljs')) {
                        hljs.highlightElement(block);
                    }
                });
            }

            // 渲染 Mermaid
            renderMermaid();
        });
    }

    function splitSlides(text) {
        const lines = (text || '').replace(/\r/g, '').split('\n');
        const out = [];
        let buf = [];
        let inCode = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^```/.test(line.trim())) inCode = !inCode;
            if (!inCode && line.trim() === '---') {
                out.push(buf.join('\n'));
                buf = [];
            } else {
                buf.push(line);
            }
        }
        out.push(buf.join('\n'));
        return out;
    }

    // Basic Markdown to HTML (safe, minimal, business-friendly)
    // 修改 mdToHtml 函数中的代码块处理部分
    function mdToHtml(md) {
        if (!md.trim()) return '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:18px;">(Empty slide)</div>';

        // 1. 先提取 LaTeX 公式块（在转义之前），保存原始内容
        const latexBlocks = [];
        // 先处理 \[...\] 格式
        let text = md.replace(/(^|\n)(>\s*)?(\\\[[\s\S]*?\\\])/g, (_, lead, quote, body) => {
            const i = latexBlocks.length;
            // 保存原始内容（未转义），去掉 blockquote 前缀
            const cleaned = body.replace(/(^|\n)>\s?/g, '$1');
            latexBlocks.push(cleaned);
            const placeholder = `\uE001LATEXBLOCK${i}\uE001`;
            // 保留 blockquote 前缀（如果有），稍后会被转义
            return `${lead || ''}${quote || ''}${placeholder}`;
        });
        // 再处理 $$...$$ 格式
        text = text.replace(/(^|\n)(>\s*)?(\$\$[\s\S]*?\$\$)/g, (_, lead, quote, body) => {
            const i = latexBlocks.length;
            // 保存原始内容（未转义），去掉 blockquote 前缀
            const cleaned = body.replace(/(^|\n)>\s?/g, '$1');
            latexBlocks.push(cleaned);
            const placeholder = `\uE001LATEXBLOCK${i}\uE001`;
            // 保留 blockquote 前缀（如果有），稍后会被转义
            return `${lead || ''}${quote || ''}${placeholder}`;
        });

        // 2. 提取 fenced code blocks（含 mermaid）- 在转义之前提取，保留原始内容
        const codeBlocks = [];
        text = text.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (m, lang, code) => {
            const i = codeBlocks.length;
            const lower = (lang || '').toLowerCase();
            if (lower === 'mermaid') {
                codeBlocks.push(`<div class="mermaid">${code}</div>`);
                return `\uE000CODEBLOCK${i}\uE000`;
            }
            const langClass = lang ? ` class="language-${escapeHtmlAttr(lang)}"` : '';
            // code 内容还没有被转义，需要转义
            codeBlocks.push(`<pre class="code"><code${langClass}>${escapeHtml(code)}</code></pre>`);
            return `\uE000CODEBLOCK${i}\uE000`;
        });

        // 2.3. 提取行内代码块 `...` - 在提取 \pause 之前，避免匹配代码内的 \pause
        const inlineCodeBlocks = [];
        text = text.replace(/`([^`\n]+?)`/g, (m, code) => {
            const i = inlineCodeBlocks.length;
            inlineCodeBlocks.push(code);
            return `\uE009INLINECODE${i}\uE009`;
        });

        // 2.5. 提取 \pause 标记（在转义之前，但要在代码块、LaTeX 块和行内代码之后，避免匹配代码块内的内容）
        // \pause 可以出现在行首、行尾或行中，需要保留上下文
        // 注意：代码块、LaTeX 块和行内代码已经被占位符替换，占位符中包含特殊字符，不会被匹配
        const pauseMarkers = [];
        // 使用正则表达式，确保不会匹配到任何占位符（代码块、LaTeX 块、行内代码）
        text = text.replace(/([^\uE000\uE001\uE009]*?)\\pause([^\uE000\uE001\uE009]*?)/g, (match, before, after) => {
            const i = pauseMarkers.length;
            pauseMarkers.push({ before, after });
            return `${before}\uE007PAUSE${i}\uE007${after}`;
        });

        // 3. 现在转义文本（LaTeX 块、代码块和 pause 标记已经被占位符替换，不会被转义）
        text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        // 3. 处理提示块（> [!NOTE] 这类）
        let admonitions = [];
        ({ text, admonitions } = transformAdmonitions(text));

        // 4. 块级转换
        text = blockify(text);

        // 4.5. 恢复行内代码块（在 inlineify 之前，因为 inlineify 会处理其他内联格式）
        text = text.replace(/\uE009INLINECODE(\d+)\uE009/g, (_, i) => {
            const code = inlineCodeBlocks[Number(i)];
            if (!code) return '';
            return `<code>${escapeHtml(code)}</code>`;
        });

        // 5. 内联转换
        text = inlineify(text);

        // 6. 恢复代码块
        text = text.replace(/\uE000CODEBLOCK(\d+)\uE000/g, (_, i) => codeBlocks[Number(i)] || '');

        // 7. 恢复 LaTeX 公式块 - 关键修改：确保每个公式被适当包裹
        text = text.replace(/\uE001LATEXBLOCK(\d+)\uE001/g, (_, i) => {
            const latex = latexBlocks[Number(i)];
            if (!latex) return '';

            // 对于 $$...$$ 格式的公式，确保它们被包裹在适当的元素中
            if (latex.startsWith('$$') && latex.endsWith('$$')) {
                // 保留完整的公式内容，包括换行符（对多行公式很重要）
                // 只去掉开头和结尾的 $$，保留中间的所有内容
                const content = latex.slice(2, -2);
                // 检查是否包含多个独立的公式（通过查找中间的 $$ 分隔符）
                // 但要注意：公式内容中不应该有 $$，所以如果有 $$，可能是多个公式
                const formulas = content.split(/\n\s*\$\$\s*\n/).filter(f => f.trim());

                if (formulas.length > 1) {
                    // 多个公式，每个单独渲染
                    return formulas.map(formula =>
                        `<div class="katex-display-wrapper">$$${escapeLatexForHtml(formula.trim())}$$</div>`
                    ).join('\n');
                } else {
                    // 单个公式，保留原始格式（包括换行符）
                    return `<div class="katex-display-wrapper">${escapeLatexForHtml(latex)}</div>`;
                }
            }

            // 对于 \[...\] 格式，保持原样
            return escapeLatexForHtml(latex);
        });
        // 8. 恢复提示块
        text = text.replace(/\uE003ADMON(\d+)\uE003/g, (_, i) => admonitions[Number(i)] || '');

        // 9. 恢复 \pause 标记，转换为特殊 HTML 元素
        // 注意：此时 text 已经经过了 blockify 和 inlineify 处理，所以占位符中的内容已经是处理后的 HTML
        // 但是 marker.before 和 marker.after 是原始文本，需要确保它们已经被正确处理
        text = text.replace(/\uE007PAUSE(\d+)\uE007/g, (_, i) => {
            const marker = pauseMarkers[Number(i)];
            if (!marker) return '';
            // marker.before 和 marker.after 在提取时是原始文本，但此时 text 已经经过了处理
            // 所以占位符位置的内容应该已经被正确处理了
            // 直接插入 pause 标记即可
            return `<span class="pause-marker" data-pause="true"></span>`;
        });

        return text;
    }

    function blockify(src) {
        const lines = src.split('\n');
        let out = '';
        let inUl = false, inOl = false, inTaskList = false, bqDepth = 0, para = '';
        let ulDepth = 0; // 无序列表的嵌套层级
        const ulDepths = []; // 存储每个层级的缩进
        let blankLineCount = 0; // 连续空行计数，用于普通段落中的额外换行（不影响引用等结构）

        const flushPara = () => {
            if (para.trim()) out += `<p>${inlineify(para.trim())}</p>`;
            para = '';
        };
        const closeLists = () => {
            // 关闭所有嵌套的无序列表
            while (ulDepth > 0) {
                out += '</ul>';
                ulDepth--;
            }
            ulDepths.length = 0;
            if (inUl) { out += '</ul>'; inUl = false; }
            if (inOl) { out += '</ol>'; inOl = false; }
            if (inTaskList) { out += '</ul>'; inTaskList = false; }
        };

        // 获取无序列表的样式类型（根据层级）
        const getUlStyle = (depth) => {
            if (depth === 0) return 'disc';      // 第一层：黑圆
            if (depth === 1) return 'circle';    // 第二层：白圆
            return 'square';                     // 第三层及以后：黑方框
        };
        const closeQuote = () => {
            while (bqDepth > 0) {
                out += '</blockquote>';
                bqDepth--;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const line = raw; // already escaped
            // LaTeX 占位符：区分是否在 blockquote 中
            const latexBq = /^&gt;\s*(\uE001LATEXBLOCK\d+\uE001)\s*$/.exec(line);
            if (latexBq) {
                flushPara(); closeLists();
                while (bqDepth < 1) { out += '<blockquote>'; bqDepth++; }
                while (bqDepth > 1) { out += '</blockquote>'; bqDepth--; }
                // 直接输出占位符，不要包在 <p> 标签里，让公式占据整个引用块
                out += latexBq[1] + '\n';
                continue;
            }
            if (line.includes('\uE001LATEXBLOCK')) {
                flushPara();
                closeLists();
                closeQuote();
                out += line + '\n';
                continue;
            }
            if (!line.trim()) { // blank line
                flushPara();
                // 空行关闭有序列表（有序列表遇到空行应该断开）
                if (inOl) { out += '</ol>'; inOl = false; }
                // 空行不关闭无序列表，让无序列表可以跨行继续
                closeQuote();
                // 记录连续空行数量，稍后在普通段落中统一渲染为 <br>
                blankLineCount++;
                continue;
            }
            // 非空行：后续根据不同块级结构处理 blankLineCount

            // Headings
            const h = /^(#{1,6})\s+(.*)$/.exec(line);
            if (h) {
                blankLineCount = 0;
                flushPara(); closeLists(); closeQuote();
                const level = h[1].length;
                out += `<h${level}>${inlineify(h[2].trim())}</h${level}>`;
                continue;
            }

            // Tables (GitHub style): header | header\n| --- |\nrows...
            if (looksLikeTable(lines, i)) {
                blankLineCount = 0;
                flushPara(); closeLists(); closeQuote();
                const { tableHtml, nextIndex } = parseTable(lines, i);
                out += tableHtml;
                i = nextIndex;
                continue;
            }

            // Blockquote (nested) - 支持原始 > 与转义 &gt;，允许中间空格
            const bq = /^((?:(?:>|\&gt;)\s*)+)(.*)$/.exec(line);
            if (bq) {
                blankLineCount = 0;
                flushPara(); closeLists();
                const markers = bq[1].match(/(?:>|&gt;)/g);
                const level = markers ? markers.length : 0;
                // open to target level
                while (bqDepth < level) { out += '<blockquote>'; bqDepth++; }
                // close if we stepped back
                while (bqDepth > level) { out += '</blockquote>'; bqDepth--; }
                out += `<p>${inlineify(bq[2].trim())}</p>`;
                continue;
            }

            // Task list: - [ ] or - [x]
            const task = /^\s*[-+*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
            if (task) {
                blankLineCount = 0;
                flushPara(); closeQuote();
                closeLists(); // 关闭其他列表
                if (!inTaskList) { out += '<ul class="task-list">'; inTaskList = true; }
                const checked = task[1].toLowerCase() === 'x';
                out += `<li class="task-item"><input type="checkbox" ${checked ? 'checked' : ''} disabled><span>${inlineify(task[2])}</span></li>`;
                continue;
            }

            // Unordered list
            const ul = /^(\s*)[-+*]\s+(.*)$/.exec(line);
            if (ul) {
                blankLineCount = 0;
                flushPara(); closeQuote();
                // 关闭任务列表
                if (inTaskList) { out += '</ul>'; inTaskList = false; }

                // 计算当前行的缩进层级（每2个空格或1个tab为一级）
                const indent = ul[1];
                const indentLevel = Math.floor(indent.replace(/\t/g, '  ').length / 2);

                // 顶层无序列表时，关闭有序列表
                if (indentLevel === 0 && inOl) {
                    out += '</ol>';
                    inOl = false;
                }

                // 目标打开深度 = 缩进层级 + 1（根列表算一层）
                const targetDepth = indentLevel + 1;

                // 关闭多余层级
                while (ulDepth > targetDepth) {
                    out += '</ul>';
                    ulDepth--;
                }

                // 打开缺失层级
                while (ulDepth < targetDepth) {
                    const style = getUlStyle(ulDepth); // 当前深度决定样式
                    out += `<ul style="list-style-type: ${style}">`;
                    ulDepth++;
                }

                out += `<li>${inlineify(ul[2])}</li>`;
                inUl = true;
                continue;
            }

            // Ordered list
            const ol = /^(\s*)\d+[\.)]\s+(.*)$/.exec(line);
            if (ol) {
                blankLineCount = 0;
                flushPara(); closeQuote();
                // 关闭任务列表
                if (inTaskList) { out += '</ul>'; inTaskList = false; }

                // 计算缩进层级
                const indent = ol[1];
                const indentLevel = Math.floor(indent.replace(/\t/g, '  ').length / 2);

                // 如果缩进层级为 0，关闭无序列表（但不关闭有序列表，保持连续性）
                if (indentLevel === 0) {
                    // 关闭所有嵌套的无序列表
                    while (ulDepth > 0) {
                        out += '</ul>';
                        ulDepths.pop();
                        ulDepth--;
                    }
                    if (inUl) { out += '</ul>'; inUl = false; }
                    // 顶级有序列表：如果还没有打开，就打开它
                    if (!inOl) { out += '<ol>'; inOl = true; }
                } else if (indentLevel > 0) {
                    // 嵌套的有序列表：关闭超出当前层级的所有列表
                    while (ulDepth > indentLevel) {
                        out += '</ul>';
                        ulDepths.pop();
                        ulDepth--;
                    }
                    // 如果当前层级是有序列表，需要先关闭它
                    if (inOl) { out += '</ol>'; inOl = false; }
                    // 打开新的有序列表（作为嵌套列表）
                    out += '<ol>';
                    inOl = true;
                }

                // ol[2] 是捕获的内容部分（去掉了数字和点/括号）
                const content = (ol[2] || '').trim();
                out += `<li>${inlineify(content)}</li>`;
                continue;
            }

            // Default: paragraph continuation（普通段落才使用空行产生的额外 <br>）
            if (blankLineCount > 0) {
                const brCount = Math.ceil(blankLineCount / 2);
                for (let j = 0; j < brCount; j++) {
                    out += '<br>';
                }
                blankLineCount = 0;
            }
            para += (para ? ' ' : '') + line.trim();
        }

        flushPara();
        closeLists();
        closeQuote();

        // 处理结尾处可能存在的空行
        if (blankLineCount > 0) {
            const brCount = Math.ceil(blankLineCount / 2);
            for (let j = 0; j < brCount; j++) {
                out += '<br>';
            }
        }
        return out;
    }

    function looksLikeTable(lines, idx) {
        if (idx + 1 >= lines.length) return false;
        const header = lines[idx].trim();
        const sep = lines[idx + 1].trim();
        if (!header.includes('|') || !sep.includes('|')) return false;
        const sepParts = sep.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
        if (!sepParts.length) return false;
        // all separator cells should look like --- or :--- or ---:
        const sepOk = sepParts.every(cell => /^:?-{2,}:?$/.test(cell));
        return sepOk;
    }

    function parseTable(lines, start) {
        const headerLine = lines[start].trim();
        const alignLine = lines[start + 1].trim();
        const bodyLines = [];
        let i = start + 2;
        while (i < lines.length && /\|/.test(lines[i])) {
            bodyLines.push(lines[i].trim());
            i++;
        }
        const headers = splitTableRow(headerLine);
        const aligns = splitTableRow(alignLine).map(parseAlign);
        const rows = bodyLines.map(splitTableRow);

        const thead = `<thead><tr>${headers.map((h, idx) => `<th${alignAttr(aligns[idx])}>${inlineify(h)}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${rows.map(r => `<tr>${r.map((c, idx) => `<td${alignAttr(aligns[idx])}>${inlineify(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
        return { tableHtml: `<table class="md-table">${thead}${tbody}</table>`, nextIndex: i - 1 };
    }

    function splitTableRow(line) {
        const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
        return trimmed.split('|').map(s => s.trim());
    }
    function parseAlign(cell) {
        if (/^:-+:$/.test(cell)) return 'center';
        if (/^:-+$/.test(cell)) return 'left';
        if (/^-+:$/.test(cell)) return 'right';
        return null;
    }
    function alignAttr(align) {
        return align ? ` align="${align}"` : '';
    }

    // Mermaid 渲染
    let mermaidInited = false;
    let mermaidLoading = false;
    function renderMermaid() {
        if (typeof mermaid === 'undefined') {
            if (mermaidLoading) return;
            mermaidLoading = true;
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/9.4.3/mermaid.min.js';
            s.onload = () => { mermaidLoading = false; renderMermaid(); };
            s.onerror = () => { mermaidLoading = false; console.warn('mermaid load failed'); };
            document.head.appendChild(s);
            return;
        }
        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
        if (!mermaidInited) {
            mermaid.initialize({ startOnLoad: false, theme });
            mermaidInited = true;
        } else {
            mermaid.initialize({ startOnLoad: false, theme });
        }
        const blocks = dom.currentSlide.querySelectorAll('.mermaid');
        blocks.forEach((el, idx) => {
            // 如果已经渲染过（有 mermaid-render 父元素），跳过
            if (el.parentElement && el.parentElement.classList.contains('mermaid-render')) {
                return;
            }
            const code = (el.textContent || '').trim();
            const id = `mmd-${Date.now()}-${idx}`;
            const container = document.createElement('div');
            container.className = 'mermaid-render';
            el.replaceWith(container);
            try {
                mermaid.render(id, code, (svg) => { container.innerHTML = svg; });
            } catch (e) {
                console.warn('mermaid render failed', e);
                container.innerHTML = `<pre class="code"><code>${escapeHtml(code)}</code></pre>`;
            }
        });
    }

    // 将 > [!TYPE] ... 转换为提示块占位符
    function transformAdmonitions(src) {
        const lines = src.split('\n');
        const out = [];
        const stores = [];
        const valid = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];

        for (let i = 0; i < lines.length; i++) {
            const m = /^&gt;\s*\[!(\w+)\]\s*(.*)$/.exec(lines[i]);
            if (!m) {
                out.push(lines[i]);
                continue;
            }
            const type = m[1].toUpperCase();
            if (!valid.includes(type)) {
                out.push(lines[i]);
                continue;
            }
            const firstLine = (m[2] || '').trim();
            const body = [];
            if (firstLine) body.push(firstLine);
            let j = i + 1;
            while (j < lines.length) {
                const n = /^&gt;\s?(.*)$/.exec(lines[j]);
                if (!n) break;
                body.push(n[1]);
                j++;
            }
            i = j - 1;

            // 移除首尾多余的空行，防止在开头或结尾生成多余的空段落或换行
            while (body.length > 0 && !body[0].trim()) {
                body.shift();
            }
            while (body.length > 0 && !body[body.length - 1].trim()) {
                body.pop();
            }

            const inner = blockify(body.join('\n'));
            stores.push(
                `<div class="admonition ${type.toLowerCase()}">` +
                `<p class="admonition-title">${escapeHtmlAttr(type)}</p>` +
                `<div class="admonition-content">${inner}</div>` +
                `</div>`
            );
            out.push(`\uE003ADMON${stores.length - 1}\uE003`);
        }

        return { text: out.join('\n'), admonitions: stores };
    }

    function inlineify(str) {
        const mathSpans = [];
        let s = str.replace(/\$(.+?)\$/g, (m, math) => {
            const i = mathSpans.length;
            mathSpans.push(math);
            return `\uE002MATH${i}\uE002`;
        });
        // 先提取链接和图片（使用占位符），以便先处理内联格式
        const linkPlaceholders = [];
        const imgPlaceholders = [];
        const imgLinkPlaceholders = [];

        // 1. 先提取图片嵌套在链接中的情况：[![](src)](href)
        s = s.replace(/\[!\[([^\]]*)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, (m, alt, imgSrc, imgTitle, href, linkTitle) => {
            const i = imgLinkPlaceholders.length;
            imgLinkPlaceholders.push({ alt, imgSrc, imgTitle, href, linkTitle });
            return `\uE004IMGLINK${i}\uE004`;
        });

        // 2. 提取单独的图片 ![alt](src "title")
        s = s.replace(/!\[([^\]]*)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, (m, alt, src, title) => {
            const i = imgPlaceholders.length;
            imgPlaceholders.push({ alt, src, title });
            return `\uE005IMG${i}\uE005`;
        });

        // 3. 提取单独的链接 [text](href "title")，并在提取时处理链接文本内的内联格式
        s = s.replace(/\[([^\]]+)\]\(([^\s\)]+)(?:\s+"([^"]+)")?\)/g, (m, txt, href, title) => {
            // 先处理链接文本内的内联格式
            // 使用递归函数处理嵌套格式
            const processNestedFormat = (text) => {
                // 先处理最外层的 Bold **text** or __text__
                let result = text.replace(/(\*\*|__)(.+?)\1/g, (match, marker, content) => {
                    return `<strong>${processNestedFormat(content)}</strong>`;
                });
                // 然后处理 Strikethrough ~~text~~
                result = result.replace(/~~(.+?)~~/g, (match, content) => {
                    return `<del>${processNestedFormat(content)}</del>`;
                });
                // 最后处理 Italic *text* or _text_（只处理不在 HTML 标签内的）
                result = result.replace(/(\*|_)([^*_\s<>]+?)\1/g, (match, marker, content) => {
                    // 简单检查：如果内容包含 HTML 标签，跳过（可能已经被处理过了）
                    if (content.includes('<') || content.includes('>')) {
                        return match;
                    }
                    return `<em>${content}</em>`;
                });
                return result;
            };

            const processedTxt = processNestedFormat(txt);

            const i = linkPlaceholders.length;
            linkPlaceholders.push({ txt: processedTxt, href, title });
            return `\uE006LINK${i}\uE006`;
        });

        // 4. 处理剩余的内联格式（不在链接内的）
        // Bold **text** or __text__
        s = s.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
        // Italic *text* or _text_
        s = s.replace(/(\*|_)([^*_]+?)\1/g, '<em>$2</em>');
        // Strikethrough ~~text~~
        s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // 5. 恢复图片嵌套在链接中的情况
        s = s.replace(/\uE004IMGLINK(\d+)\uE004/g, (_, i) => {
            const p = imgLinkPlaceholders[Number(i)];
            if (!p) return '';
            const safeImgSrc = sanitizeUrlForImg(unescapeMdLink(p.imgSrc));
            const safeAlt = escapeHtmlAttr(p.alt);
            const safeImgTitle = p.imgTitle ? ` title="${escapeHtmlAttr(p.imgTitle)}"` : '';
            const safeHref = sanitizeUrl(unescapeMdLink(p.href));
            const safeLinkTitle = p.linkTitle ? ` title="${escapeHtmlAttr(p.linkTitle)}"` : '';
            if (!safeImgSrc || !safeHref) return '';
            return `<a href="${safeHref}" target="_blank" rel="noopener"${safeLinkTitle}><img alt="${safeAlt}" src="${safeImgSrc}"${safeImgTitle} /></a>`;
        });

        // 6. 恢复单独的图片
        s = s.replace(/\uE005IMG(\d+)\uE005/g, (_, i) => {
            const p = imgPlaceholders[Number(i)];
            if (!p) return '';
            const safeSrc = sanitizeUrlForImg(unescapeMdLink(p.src));
            const safeAlt = escapeHtmlAttr(p.alt);
            const safeTitle = p.title ? ` title="${escapeHtmlAttr(p.title)}"` : '';
            if (!safeSrc) return p.alt ? `<em>${safeAlt}</em>` : '';
            return `<img alt="${safeAlt}" src="${safeSrc}"${safeTitle} />`;
        });

        // 7. 恢复单独的链接（链接文本中的内联格式已经在提取时处理成 HTML）
        s = s.replace(/\uE006LINK(\d+)\uE006/g, (_, i) => {
            const p = linkPlaceholders[Number(i)];
            if (!p) return '';
            const safeHref = sanitizeUrl(unescapeMdLink(p.href));
            const safeTitle = p.title ? ` title="${escapeHtmlAttr(p.title)}"` : '';
            if (!safeHref) return p.txt; // 如果链接无效，返回已处理的文本（可能已包含 HTML 标签）
            // 链接文本已经包含 HTML 标签（如 <strong>、<em>、<del>），直接使用
            return `<a href="${safeHref}" target="_blank" rel="noopener"${safeTitle}>${p.txt}</a>`;
        });

        // Autolinks <url> or <email@example.com>
        // 注意：此时 < 和 > 已经被转义为 &lt; 和 &gt;
        // 匹配 &lt;...&gt;，内容中可能包含 &amp;（转义的 &）
        s = s.replace(/&lt;((?:[^&]|&amp;)+?)&gt;/g, (m, content) => {
            // 先还原转义的 &amp; 为 &
            const decoded = content.replace(/&amp;/g, '&');
            // 检查是否是邮箱地址
            if (/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/i.test(decoded)) {
                return `<a href="mailto:${escapeHtmlAttr(decoded)}">${escapeHtml(decoded)}</a>`;
            }
            // 检查是否是 URL（http://, https://, 或协议相对 URL）
            const safeUrl = sanitizeUrl(decoded);
            if (safeUrl) {
                return `<a href="${safeUrl}" target="_blank" rel="noopener">${escapeHtml(decoded)}</a>`;
            }
            // 不是有效的链接，保持原样
            return m;
        });

        // 处理行内代码 `...`（只处理未恢复的，已恢复的 HTML 代码不会被匹配）
        s = s.replace(/`([^`<>]+?)`/g, (m, code) => {
            // 如果内容包含 HTML 标签，说明已经被处理过了，跳过
            if (code.includes('<') || code.includes('>')) {
                return m;
            }
            return `<code>${escapeHtml(code)}</code>`;
        });

        // 恢复行内公式占位符
        s = s.replace(/\uE002MATH(\d+)\uE002/g, (_, i) => `$${mathSpans[Number(i)]}$`);

        return s;
    }

    // 仅用于 LaTeX 块恢复阶段的 HTML 转义，防止 < > 等符号被当作标签导致 DOM 破坏
    function escapeLatexForHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeHtmlAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function sanitizeUrl(u) {
        try {
            if (!u) return '';
            // allow anchors and relative paths
            if (u.startsWith('#') || u.startsWith('/') || u.startsWith('./') || u.startsWith('../')) return u;
            const url = new URL(u, window.location.origin);
            return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '';
        } catch { return ''; }
    }
    function sanitizeUrlForImg(u) {
        try {
            if (!u) return '';
            if (u.startsWith('/') || u.startsWith('./') || u.startsWith('../')) return u;
            if (u.startsWith('data:image/')) return u;
            const url = new URL(u, window.location.origin);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch { return ''; }
    }
    function unescapeMdLink(s) {
        return s.replace(/\((?=.*\))/g, '%28').replace(/\)/g, '%29');
    }
    async function handleExport(type, btn) {
        if (exportingPdf) return; // 已在导出中，直接忽略
        exportingPdf = true;

        // 记录按钮状态并禁用，避免重复点击
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Exporting...';

        // 创建全屏遮罩层，禁用所有交互
        const overlay = document.createElement('div');
        overlay.id = 'export-overlay'; // 赋予 ID 以便被 @media print 隐藏
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            user-select: none;
            pointer-events: all;
        `;
        overlay.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 32px; margin-bottom: 20px;">Preparing Document...</div>
                <div id="export-msg-sub" style="font-size: 16px; opacity: 0.8; margin-bottom: 10px;">Please wait...</div>
            </div>
        `;
        document.body.appendChild(overlay);

        const handlers = {
            mouse: null,
            keyboard: null,
            touch: null,
        };

        const disableInteractions = () => {
            // 禁用所有输入框、按钮、选择框
            document.querySelectorAll('input, textarea, select, button').forEach(el => {
                el.setAttribute('data-export-disabled', 'true');
                el.disabled = true;
                el.style.pointerEvents = 'none';
                el.style.cursor = 'not-allowed';
            });
            // 禁用所有链接和可点击元素
            document.querySelectorAll('a, [onclick], [role="button"]').forEach(el => {
                el.setAttribute('data-export-disabled', 'true');
                el.style.pointerEvents = 'none';
                el.style.cursor = 'not-allowed';
            });
            // 禁用所有导航按钮
            document.querySelectorAll('.nav-btn, .control-btn, .control-input').forEach(el => {
                el.setAttribute('data-export-disabled', 'true');
                el.style.pointerEvents = 'none';
                el.style.cursor = 'not-allowed';
            });

            // 禁用鼠标事件（点击、拖拽等）
            handlers.mouse = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            };
            document.addEventListener('click', handlers.mouse, true);
            document.addEventListener('mousedown', handlers.mouse, true);
            document.addEventListener('mouseup', handlers.mouse, true);
            document.addEventListener('dblclick', handlers.mouse, true);
            document.addEventListener('contextmenu', handlers.mouse, true);
            document.addEventListener('dragstart', handlers.mouse, true);

            // 禁用键盘事件
            handlers.keyboard = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            };
            document.addEventListener('keydown', handlers.keyboard, true);
            document.addEventListener('keyup', handlers.keyboard, true);
            document.addEventListener('keypress', handlers.keyboard, true);

            // 禁用触摸事件（移动设备）
            handlers.touch = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            };
            document.addEventListener('touchstart', handlers.touch, true);
            document.addEventListener('touchmove', handlers.touch, true);
            document.addEventListener('touchend', handlers.touch, true);

            // 禁用滚动
            document.body.style.overflow = 'hidden';
        };

        // 恢复所有交互元素
        const enableInteractions = () => {
            // 恢复所有输入框 / 按钮等
            document.querySelectorAll('[data-export-disabled="true"]').forEach(el => {
                el.removeAttribute('data-export-disabled');
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.tagName === 'BUTTON') {
                    el.disabled = false;
                }
                el.style.pointerEvents = '';
                el.style.cursor = '';
            });

            // 移除鼠标事件监听
            if (handlers.mouse) {
                document.removeEventListener('click', handlers.mouse, true);
                document.removeEventListener('mousedown', handlers.mouse, true);
                document.removeEventListener('mouseup', handlers.mouse, true);
                document.removeEventListener('dblclick', handlers.mouse, true);
                document.removeEventListener('contextmenu', handlers.mouse, true);
                document.removeEventListener('dragstart', handlers.mouse, true);
                handlers.mouse = null;
            }

            // 移除键盘事件监听
            if (handlers.keyboard) {
                document.removeEventListener('keydown', handlers.keyboard, true);
                document.removeEventListener('keyup', handlers.keyboard, true);
                document.removeEventListener('keypress', handlers.keyboard, true);
                handlers.keyboard = null;
            }

            // 移除触摸事件监听
            if (handlers.touch) {
                document.removeEventListener('touchstart', handlers.touch, true);
                document.removeEventListener('touchmove', handlers.touch, true);
                document.removeEventListener('touchend', handlers.touch, true);
                handlers.touch = null;
            }

            // 恢复滚动
            document.body.style.overflow = '';
        };

        // 禁用交互
        disableInteractions();

        try {
            compileAndRender();
            const realStage = document.getElementById("stage");
            const originalHTML = realStage.querySelector("#currentSlide").innerHTML;

            const STAGE_W = 1280;
            const STAGE_H = 720;

            const watermarkText = document.getElementById('watermarkInput')?.value || "";

            if (type === 'raster') {
                document.getElementById('export-msg-sub').textContent = "Rendering image PDF... This might take a while and produce a large file.";

                const { jsPDF } = window.jspdf;
                const LEFT_MARGIN = 56;
                const RIGHT_MARGIN = 56;
                const TOP_MARGIN = 48;
                const BOTTOM_MARGIN = 48;
                const PDF_W = STAGE_W + LEFT_MARGIN + RIGHT_MARGIN;
                const PDF_H = STAGE_H + TOP_MARGIN + BOTTOM_MARGIN;

                const pdf = new jsPDF({
                    orientation: 'landscape',
                    unit: 'px',
                    format: [PDF_W, PDF_H]
                });

                for (let i = 0; i < slides.length; i++) {
                    realStage.querySelector("#currentSlide").innerHTML = slides[i];
                    renderKaTeX();
                    await new Promise(r => setTimeout(r, 120));

                    const cloneStage = realStage.cloneNode(true);

                    if (watermarkText) {
                        const wm = document.createElement("div");
                        wm.className = "export-watermark";
                        wm.textContent = watermarkText;
                        cloneStage.appendChild(wm);
                    }

                    cloneStage.style.transform = "none";
                    cloneStage.style.left = "0";
                    cloneStage.style.top = "0";
                    cloneStage.style.position = "relative";
                    cloneStage.style.width = STAGE_W + "px";
                    cloneStage.style.height = STAGE_H + "px";

                    const container = document.createElement("div");
                    container.style.position = "fixed";
                    container.style.left = "-99999px";
                    container.style.top = "0";
                    container.style.width = PDF_W + "px";
                    container.style.height = PDF_H + "px";
                    container.style.background = "white";
                    container.style.overflow = "hidden";
                    container.style.padding = `${TOP_MARGIN}px ${RIGHT_MARGIN}px ${BOTTOM_MARGIN}px ${LEFT_MARGIN}px`;

                    container.appendChild(cloneStage);
                    document.body.appendChild(container);

                    const canvas = await html2canvas(container, {
                        useCORS: true,
                        backgroundColor: "#fff",
                        scale: 3
                    });

                    const imgData = canvas.toDataURL("image/jpeg", 0.98);
                    if (i > 0) pdf.addPage([PDF_W, PDF_H], "landscape");
                    pdf.addImage(imgData, "JPEG", 0, 0, PDF_W, PDF_H);

                    const containerRect = container.getBoundingClientRect();
                    const anchors = cloneStage.querySelectorAll('a[href]');
                    anchors.forEach(a => {
                        try {
                            const href = a.getAttribute('href');
                            if (!href || /^\s*(javascript:|#)/i.test(href)) return;
                            const img = a.querySelector('img');
                            let rect = img ? img.getBoundingClientRect() : a.getBoundingClientRect();
                            const pdfX = ((rect.left - containerRect.left) / containerRect.width) * PDF_W;
                            const pdfY = ((rect.top - containerRect.top) / containerRect.height) * PDF_H;
                            const pdfW = (rect.width / containerRect.width) * PDF_W;
                            const pdfH = (rect.height / containerRect.height) * PDF_H;
                            pdf.link(pdfX, pdfY, pdfW, pdfH, { url: href });
                        } catch (e) {
                            console.warn('add link failed', e);
                        }
                    });
                    container.remove();
                }

                realStage.querySelector("#currentSlide").innerHTML = originalHTML;
                pdf.save("slides.pdf");

            } else if (type === 'vector') {
                document.getElementById('export-msg-sub').textContent = "Preparing print window... Please manually select 'Save as PDF' from the dialog.";

                const printContainer = document.createElement("div");
                printContainer.id = "print-container";
                document.body.appendChild(printContainer);

                for (let i = 0; i < slides.length; i++) {
                    realStage.querySelector("#currentSlide").innerHTML = slides[i];
                    renderKaTeX();
                    await new Promise(r => setTimeout(r, 120));

                    const cloneStage = realStage.cloneNode(true);

                    if (watermarkText) {
                        const wm = document.createElement("div");
                        wm.className = "export-watermark";
                        wm.textContent = watermarkText;
                        cloneStage.appendChild(wm);
                    }

                    // Chromium prints ignore pointer-events: none on links
                    cloneStage.querySelectorAll('a').forEach(a => {
                        a.style.pointerEvents = 'auto';
                        a.style.cursor = 'pointer';
                    });

                    cloneStage.style.transform = "none";
                    cloneStage.style.left = "0";
                    cloneStage.style.top = "0";
                    cloneStage.style.position = "relative";
                    cloneStage.style.width = STAGE_W + "px";
                    cloneStage.style.height = STAGE_H + "px";

                    const page = document.createElement("div");
                    page.className = "print-slide-page";

                    const innerWrapper = document.createElement("div");
                    innerWrapper.style.width = STAGE_W + "px";
                    innerWrapper.style.height = STAGE_H + "px";
                    innerWrapper.style.transform = "scale(1)";
                    innerWrapper.style.transformOrigin = "center center";

                    innerWrapper.appendChild(cloneStage);
                    page.appendChild(innerWrapper);
                    printContainer.appendChild(page);
                }

                realStage.querySelector("#currentSlide").innerHTML = originalHTML;
                compileAndRender();
                await new Promise(r => setTimeout(r, 500));

                const oldTitle = document.title;
                document.title = "slides";
                window.print();
                document.title = oldTitle;
                printContainer.remove();
            }

            compileAndRender();
        } catch (err) {
            console.error('导出 PDF 失败', err);
        } finally {
            enableInteractions();
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            btn.disabled = false;
            btn.textContent = originalText;
            exportingPdf = false;
        }
    }

    if (dom.exportBtnImg) {
        dom.exportBtnImg.addEventListener('click', () => handleExport('raster', dom.exportBtnImg));
    }
    if (dom.exportBtnPrint) {
        dom.exportBtnPrint.addEventListener('click', () => handleExport('vector', dom.exportBtnPrint));
    }

    // Watermark Modal logic
    const watermarkBtn = document.getElementById('watermarkBtn');
    const watermarkModal = document.getElementById('watermarkModal');
    const watermarkCancel = document.getElementById('watermarkCancel');
    const watermarkSave = document.getElementById('watermarkSave');
    const watermarkInput = document.getElementById('watermarkInput');

    if (watermarkBtn && watermarkModal) {
        watermarkBtn.addEventListener('click', () => {
            watermarkModal.style.display = 'flex';
            watermarkInput.focus();
            watermarkInput.select();
        });
        watermarkCancel.addEventListener('click', () => {
            watermarkModal.style.display = 'none';
        });
        watermarkSave.addEventListener('click', () => {
            watermarkModal.style.display = 'none';
        });
        // Click outside to close
        watermarkModal.addEventListener('click', (e) => {
            if (e.target === watermarkModal) {
                watermarkModal.style.display = 'none';
            }
        });
        // ESC/Enter to close
        watermarkInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') watermarkModal.style.display = 'none';
            if (e.key === 'Enter') watermarkModal.style.display = 'none';
        });
    }

})();