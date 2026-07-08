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

test('캡션을 비우면 <caption> 이 생기지 않는다', async ({ page }) => {
  await caretAtEnd(page);
  await page.getByRole('button', { name: '표' }).click();
  await page.getByRole('button', { name: '삽입' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<table>');
  expect(html).not.toContain('<caption>');
});
