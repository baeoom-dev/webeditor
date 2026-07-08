import { test, expect } from '@playwright/test';

/**
 * 인라인 서식(Bold 등) 회귀.
 *
 * 버그: 표/이미지 다이얼로그가 selection.save() 로 남긴 스테일 위치를
 * restore() 가 사용자의 현재 선택 위에 덮어써, 이후 Bold/Italic 이 안 먹었다.
 * restore() 는 편집기 안의 살아있는 선택을 우선해야 한다.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

test('표 다이얼로그 사용 후에도 텍스트 선택 → Bold 가 적용된다', async ({ page }) => {
  await page.evaluate(() => window.__editor.setHTML(''));
  await page.click('.we-editor-content');

  // 표 다이얼로그(selection.save 발생) → 삽입
  await page.getByRole('button', { name: '표', exact: true }).click();
  await page.locator('.we-dialog button[type=submit]').click();

  // 표 뒤 문단에 텍스트를 넣고 save() 없이(마우스 선택처럼) 선택
  await page.evaluate(() => {
    const ed = window.__editor;
    const ps = ed.content.querySelectorAll('p');
    ps[ps.length - 1].textContent = '가나다라마바사';
    const t = ps[ps.length - 1].firstChild;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 4);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
  });
  await page.getByRole('button', { name: /굵게/ }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toMatch(/<strong>|<b>|font-weight/);
});

test('다이얼로그 복귀 폴백: 링크가 저장된 선택 위치에 삽입된다', async ({ page }) => {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<p>여기에 링크</p>');
    const t = ed.content.querySelector('p').firstChild;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 3);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
  });
  await page.getByRole('button', { name: '링크', exact: true }).click();
  await page.locator('.we-dialog input[type=url]').fill('https://example.com');
  await page.locator('.we-dialog button[type=submit]').click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain('>여기에</a>');
});
