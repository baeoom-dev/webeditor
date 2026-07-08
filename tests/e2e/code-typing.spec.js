import { test, expect } from '@playwright/test';

/**
 * 코드 블록에 실제로 타이핑했을 때 텍스트가 <code> '안'에 들어가는지 검증(회귀).
 * 버그: 빈 코드 블록 생성 시 커서가 <pre> 레벨에 놓여 <pre>텍스트<code></code></pre> 가 됨.
 */

/** 편집 영역의 빈 문단 시작에 접힌 커서를 둔다. */
async function caretInEmptyParagraph(page) {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<p><br></p>');
    const p = ed.content.querySelector('p');
    const r = document.createRange();
    r.setStart(p, 0);
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

test('빈 코드 블록에 타이핑하면 텍스트가 <code> 안에 들어간다', async ({ page }) => {
  await caretInEmptyParagraph(page);
  await page.getByRole('button', { name: '코드 블록' }).click();
  await page.keyboard.type('hello');

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<pre><code>hello</code></pre>');
  expect(html).not.toMatch(/<pre>[^<]*hello[^<]*<code>/); // code 앞에 새면 실패
});

test('코드 블록에서 여러 줄 입력', async ({ page }) => {
  await caretInEmptyParagraph(page);
  await page.getByRole('button', { name: '코드 블록' }).click();
  await page.keyboard.type('line1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line2');

  const text = await page.evaluate(() => window.__editor.content.querySelector('pre code').textContent);
  expect(text).toContain('line1');
  expect(text).toContain('line2');
});
