import { test, expect } from '@playwright/test';

/**
 * 수식(MathML) 기능 검증 — 삽입/미리보기/재편집/새니타이저 왕복/mXSS 차단.
 * 설계: docs/formula-design.md 7장.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

/** 수식 다이얼로그를 열고 LaTeX 를 입력한다. */
async function openAndType(page, latex) {
  await page.getByRole('button', { name: '수식', exact: true }).click();
  const input = page.locator('.we-formula-input');
  await expect(input).toBeVisible();
  await input.fill(latex);
  return input;
}

test('수식 버튼 → 다이얼로그 → 라이브 미리보기에 MathML 이 렌더된다', async ({ page }) => {
  await openAndType(page, '\\frac{1}{2}');
  const preview = page.locator('.we-formula-preview');
  await expect(preview.locator('math mfrac')).toHaveCount(1);
  await expect(preview.locator('mfrac mn').first()).toHaveText('1');
});

test('적용 시 getHTML() 에 math + data-we-formula 가 보존된다(새니타이즈 왕복)', async ({ page }) => {
  await page.evaluate(() => window.__editor.setHTML('<p>수식: </p>'));
  await openAndType(page, 'E = mc^2');
  await page.getByRole('button', { name: '적용' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<math');
  expect(html).toContain('data-we-formula="E = mc^2"');
  expect(html).toContain('<msup>');
  // 편집 크롬(contenteditable)은 출력에서 제거된다.
  expect(html).not.toContain('contenteditable');
});

test('블록 수식 체크 시 display="block" 으로 삽입된다', async ({ page }) => {
  await openAndType(page, '\\sum_{i=1}^{n} i');
  await page.locator('.we-checkbox input[type="checkbox"]').check();
  await page.getByRole('button', { name: '적용' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('display="block"');
  expect(html).toContain('<munderover>');
});

test('수식 더블클릭 → 원본 LaTeX 복원 → 수정이 반영된다', async ({ page }) => {
  await openAndType(page, 'a^2 + b^2');
  await page.getByRole('button', { name: '적용' }).click();

  await page.locator('.we-editor-content math').dblclick();
  const input = page.locator('.we-formula-input');
  await expect(input).toHaveValue('a^2 + b^2');

  await input.fill('a^2 + b^2 = c^2');
  await page.getByRole('button', { name: '적용' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('data-we-formula="a^2 + b^2 = c^2"');
  // 교체이므로 수식은 하나만 남는다.
  expect(html.match(/<math/g)).toHaveLength(1);
});

/** 커서를 편집 영역의 수식 바로 앞/뒤에 놓는다. */
async function placeCaret(page, where) {
  await page.evaluate((where) => {
    const ed = window.__editor;
    const math = ed.content.querySelector('math');
    const r = document.createRange();
    if (where === 'after') r.setStartAfter(math);
    else r.setStartBefore(math);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
  }, where);
}

test('Backspace 가 커서 바로 앞의 블록 수식을 삭제한다', async ({ page }) => {
  await openAndType(page, '\\sum_{i=1}^{n} i');
  await page.locator('.we-checkbox input[type="checkbox"]').check();
  await page.getByRole('button', { name: '적용' }).click();

  await placeCaret(page, 'after');
  await page.keyboard.press('Backspace');

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).not.toContain('<math');
});

test('Delete 가 커서 바로 뒤의 수식을 삭제한다', async ({ page }) => {
  await openAndType(page, 'x^2');
  await page.getByRole('button', { name: '적용' }).click();

  await placeCaret(page, 'before');
  await page.keyboard.press('Delete');

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).not.toContain('<math');
});

test('수식 클릭 → 선택 → Backspace 로 삭제된다', async ({ page }) => {
  await openAndType(page, '\\frac{1}{2}');
  await page.locator('.we-checkbox input[type="checkbox"]').check();
  await page.getByRole('button', { name: '적용' }).click();

  await page.locator('.we-editor-content math').click();
  await page.keyboard.press('Backspace');

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).not.toContain('<math');
});

test('수식 편집 다이얼로그에서 수식 삭제가 동작한다', async ({ page }) => {
  await openAndType(page, 'x');
  await page.getByRole('button', { name: '적용' }).click();
  await page.locator('.we-editor-content math').dblclick();
  await page.getByRole('button', { name: '수식 삭제' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).not.toContain('<math');
});

test('미지원 명령은 에러를 표시하고 적용을 차단한다', async ({ page }) => {
  await openAndType(page, '\\unknowncmd{x}');
  await expect(page.locator('.we-form-error')).toContainText('지원하지 않는 명령');
  await page.getByRole('button', { name: '적용' }).click();
  // 다이얼로그가 닫히지 않고 유지된다.
  await expect(page.locator('.we-formula-input')).toBeVisible();
});

test('보안: math 내부의 HTML 요소(mXSS 벡터)는 통째로 제거된다', async ({ page }) => {
  const out = await page.evaluate(() => {
    window.__editor.setHTML(
      '<p><math><mtext><img src="x" onerror="alert(1)"></mtext></math></p>' +
      '<p><math><semantics><annotation-xml encoding="text/html"><b>x</b></annotation-xml></semantics></math></p>',
    );
    return window.__editor.getHTML();
  });
  expect(out).not.toContain('<img');
  expect(out).not.toContain('onerror');
  expect(out).not.toContain('annotation');
  expect(out).not.toContain('semantics');
  expect(out).not.toContain('<b>');
});

test('보안: MathML 요소의 href/이벤트 속성은 제거되고 정상 MathML 은 살아남는다', async ({ page }) => {
  const out = await page.evaluate(() => {
    window.__editor.setHTML(
      '<math href="javascript:alert(1)" onclick="alert(1)"><mi href="javascript:alert(1)">x</mi></math>',
    );
    return window.__editor.getHTML();
  });
  expect(out).toContain('<math');
  expect(out).toContain('<mi>x</mi>');
  expect(out).not.toContain('href');
  expect(out).not.toContain('onclick');
});

test('보안: math 밖의 MathML 태그명은 HTML 로 파싱되어 unwrap 된다', async ({ page }) => {
  const out = await page.evaluate(() => {
    window.__editor.setHTML('<p><mi>hello</mi></p>');
    return window.__editor.getHTML();
  });
  expect(out).not.toContain('<mi>');
  expect(out).toContain('hello');
});

test('변환기: 대표 문법이 올바른 MathML 구조를 만든다', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const { latexToMathML } = await import('/src/math/latex-to-mathml.js');
    const html = (latex) => latexToMathML(latex).outerHTML;
    return {
      frac: html('\\frac{a}{b}'),
      sqrt: html('\\sqrt[3]{x}'),
      int: html('\\int_0^1 x dx'),
      greek: html('\\alpha + \\beta'),
      func: html('\\sin x'),
      fence: html('\\left( \\frac{1}{2} \\right)'),
      text: html('\\text{hello world}'),
    };
  });
  expect(results.frac).toContain('<mfrac><mi>a</mi><mi>b</mi></mfrac>');
  expect(results.sqrt).toContain('<mroot><mi>x</mi><mn>3</mn></mroot>');
  expect(results.int).toContain('<msubsup><mo>∫</mo><mn>0</mn><mn>1</mn></msubsup>');
  expect(results.greek).toContain('<mi>α</mi><mo>+</mo><mi>β</mi>');
  expect(results.func).toContain('<mi>sin</mi>');
  expect(results.fence).toContain('<mrow><mo>(</mo>');
  expect(results.text).toContain('<mtext>hello world</mtext>');
});
