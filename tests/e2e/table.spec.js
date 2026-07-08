import { test, expect } from '@playwright/test';

/** 편집 영역 첫 문단 끝에 커서를 두고 저장한다(표 삽입 지점). */
async function caretAtEnd(page) {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<p>본문</p>');
    const t = ed.content.querySelector('p').firstChild;
    const r = document.createRange();
    r.setStart(t, t.length);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
    ed.selection.save();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

test('표 삽입 다이얼로그의 캡션 입력이 <caption> 으로 들어간다', async ({ page }) => {
  await caretAtEnd(page);
  await page.getByRole('button', { name: '표' }).click();
  await page.getByLabel(/캡션/).fill('분기별 매출');
  await page.getByRole('button', { name: '삽입' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<caption>분기별 매출</caption>');
  // caption 은 table 의 첫 자식이어야 한다.
  const firstChild = await page.evaluate(
    () => window.__editor.content.querySelector('table').firstElementChild.tagName,
  );
  expect(firstChild).toBe('CAPTION');
});

test('캡션은 편집 모드에선 보이고 출력(.we-content)에선 sr-only 로 감춰진다', async ({ page }) => {
  await caretAtEnd(page);
  await page.getByRole('button', { name: '표' }).click();
  await page.getByLabel(/캡션/).fill('표 제목');
  await page.getByRole('button', { name: '삽입' }).click();

  // 편집 영역: 캡션이 화면에 보인다.
  const editorCaptionHeight = await page.evaluate(() =>
    Math.round(document.querySelector('.we-editor-content caption').getBoundingClientRect().height),
  );
  expect(editorCaptionHeight).toBeGreaterThan(1);

  // 출력(.we-content): DOM 에는 있지만 시각적으로 숨김. display:none/visibility:hidden 은 아니어야
  // 스크린리더 접근성 트리에 남는다(clip 기법).
  await page.getByRole('button', { name: '출력 미리보기(.we-content)' }).click();
  const out = await page.evaluate(() => {
    const c = document.querySelector('#preview.we-content caption');
    const cs = getComputedStyle(c);
    return {
      text: c.textContent,
      height: Math.round(c.getBoundingClientRect().height),
      display: cs.display,
      visibility: cs.visibility,
    };
  });
  expect(out.text).toBe('표 제목'); // 스크린리더가 읽을 텍스트는 유지
  expect(out.height).toBeLessThanOrEqual(1); // 화면에서는 숨김
  expect(out.display).not.toBe('none');
  expect(out.visibility).not.toBe('hidden');
});

test('표 컨텍스트 툴바로 캡션 없는 표에 캡션을 추가한다', async ({ page }) => {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<table><tbody><tr><th scope="col">항목</th></tr><tr><td>매출</td></tr></tbody></table>');
    const cell = ed.content.querySelector('td');
    const r = document.createRange();
    r.selectNodeContents(cell);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
  });
  await page.locator('.we-table-toolbar').waitFor({ state: 'visible' });
  await page.locator('.we-table-toolbar [aria-label="표 제목(캡션)"]').click();
  await page.locator('.we-dialog input[type=text]').fill('실적표');
  await page.locator('.we-dialog button[type=submit]').click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<caption>실적표</caption>');
});

test('툴바 캡션 다이얼로그를 비우면 기존 캡션이 제거된다', async ({ page }) => {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<table><caption>지울제목</caption><tbody><tr><td>a</td></tr></tbody></table>');
    const cell = ed.content.querySelector('td');
    const r = document.createRange();
    r.selectNodeContents(cell);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
  });
  await page.locator('.we-table-toolbar').waitFor({ state: 'visible' });
  await page.locator('.we-table-toolbar [aria-label="표 제목(캡션)"]').click();
  await expect(page.locator('.we-dialog input[type=text]')).toHaveValue('지울제목');
  await page.locator('.we-dialog input[type=text]').fill('');
  await page.locator('.we-dialog button[type=submit]').click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).not.toContain('<caption>');
});

test('캡션을 비우면 <caption> 이 생기지 않는다', async ({ page }) => {
  await caretAtEnd(page);
  await page.getByRole('button', { name: '표' }).click();
  await page.getByRole('button', { name: '삽입' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<table>');
  expect(html).not.toContain('<caption>');
});
