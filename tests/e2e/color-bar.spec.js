import { test, expect } from '@playwright/test';

/**
 * 색상 버튼 아이콘의 색상 바(.we-color-bar) 동적 표시.
 *
 * 글자 색/배경 색 버튼 아이콘 하단 바가 마지막으로 선택한 색을 반영해야 한다
 * (Google Docs 관례). 선택 전에는 currentColor 를 따른다.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<p>색상 테스트</p>');
    const t = ed.content.querySelector('p').firstChild;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 2);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
  });
});

test('글자 색 선택 시 버튼 색상 바가 선택색으로 바뀐다', async ({ page }) => {
  const btn = page.getByRole('button', { name: '글자 색' });
  await btn.click();
  await page.locator('.we-color-popover [aria-label="#ff0000"]').click();

  const bar = btn.locator('.we-color-bar');
  await expect(bar).toHaveCSS('stroke', 'rgb(255, 0, 0)');

  // 서식 자체도 적용됐는지 확인
  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toMatch(/color:\s*(#ff0000|rgb\(255,\s*0,\s*0\))/);
});

test('배경 색 선택 시 버튼 색상 바가 선택색으로 바뀐다', async ({ page }) => {
  const btn = page.getByRole('button', { name: '배경 색' });
  await btn.click();
  await page.locator('.we-color-popover [aria-label="#ffff00"]').click();

  const bar = btn.locator('.we-color-bar');
  await expect(bar).toHaveCSS('stroke', 'rgb(255, 255, 0)');
});

test('셀 배경색 선택 시 표 툴바 버튼 색상 바가 선택색으로 바뀐다', async ({ page }) => {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<table><tbody><tr><td>셀</td></tr></tbody></table>');
    const td = ed.content.querySelector('td');
    const r = document.createRange();
    r.selectNodeContents(td);
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
    td.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('selectionchange'));
  });

  const btn = page.getByRole('button', { name: '셀 배경색' });
  await expect(btn).toBeVisible();
  await btn.click();
  await page.locator('.we-color-popover [aria-label="#00ff00"]').click();

  await expect(btn.locator('.we-color-bar')).toHaveCSS('stroke', 'rgb(0, 255, 0)');
});
