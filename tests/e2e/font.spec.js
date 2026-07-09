import { test, expect } from '@playwright/test';

/** 글꼴(fontFamily) 선택 기능 검증. */

/** 첫 문단 전체를 선택하고 저장한다. */
async function selectFirstParagraph(page, html) {
  await page.evaluate((h) => {
    const ed = window.__editor;
    ed.setHTML(h);
    const p = ed.content.querySelector('p');
    const r = document.createRange();
    r.selectNodeContents(p);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
    ed.selection.save();
  }, html);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

test('글꼴 선택기에 기본 글꼴 목록이 나온다', async ({ page }) => {
  const options = await page.locator('select[aria-label="글꼴"] option').allTextContents();
  expect(options).toEqual(['글꼴', '기본', '맑은 고딕', '본고딕', '나눔고딕', 'Pretendard']);
});

test('글꼴을 선택하면 font-family 스타일이 적용되고 sanitize 를 통과한다', async ({ page }) => {
  await selectFirstParagraph(page, '<p>글꼴 테스트</p>');
  await page.locator('select[aria-label="글꼴"]').selectOption({ label: 'Pretendard' });

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toMatch(/font-family:[^"]*Pretendard/i);
});

test('선택한 웹폰트가 실제로 로드된다 (나눔고딕)', async ({ page }) => {
  await selectFirstParagraph(page, '<p>나눔고딕 로드 확인</p>');
  await page.locator('select[aria-label="글꼴"]').selectOption({ label: '나눔고딕' });

  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('16px "Nanum Gothic"');
  });
  expect(loaded).toBe(true);
});
