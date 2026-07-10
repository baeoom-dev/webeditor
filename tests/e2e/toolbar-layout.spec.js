import { test, expect } from '@playwright/test';

/**
 * 툴바 정리(재정렬 + 정렬 드롭다운) 회귀.
 *
 * - 실행 취소/다시 실행이 맨 앞, 그 다음 글꼴/크기 셀렉트.
 * - 정렬 4버튼은 드롭다운 1개로 축소되고, 버튼 아이콘이 현재 정렬 상태를 따른다.
 * - 버튼은 그룹 래퍼(.we-toolbar-group) 안에 있어 그룹 경계에서만 줄바꿈된다.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

test('실행 취소가 첫 버튼이고 글꼴 셀렉트가 그 다음 그룹에 온다', async ({ page }) => {
  const first = page.locator('.we-toolbar .we-tool-btn').first();
  await expect(first).toHaveAttribute('aria-label', /실행 취소/);

  // 그룹 순서: [실행취소/다시실행] → [글꼴/크기 셀렉트]
  const groups = page.locator('.we-toolbar .we-toolbar-group');
  await expect(groups.nth(0).locator('button[aria-label*="실행 취소"]')).toHaveCount(1);
  await expect(groups.nth(1).locator('select[aria-label="글꼴"]')).toHaveCount(1);
});

test('정렬 드롭다운에서 가운데 정렬을 선택하면 적용되고 버튼 아이콘이 바뀐다', async ({ page }) => {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<p>정렬 테스트</p>');
    const t = ed.content.querySelector('p').firstChild;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 2);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
  });

  const alignBtn = page.getByRole('button', { name: '정렬', exact: true });
  await expect(alignBtn).toHaveAttribute('aria-haspopup', 'menu');

  await alignBtn.click();
  await expect(alignBtn).toHaveAttribute('aria-expanded', 'true');

  const menu = page.locator('.we-align-popover');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio')).toHaveCount(4);

  await menu.getByRole('menuitemradio', { name: '가운데 정렬' }).click();
  await expect(menu).not.toBeVisible();
  await expect(alignBtn).toHaveAttribute('aria-expanded', 'false');

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('text-align: center');

  // 버튼 아이콘이 가운데 정렬 상태를 반영하는지: 다시 열면 가운데 정렬에 체크.
  await alignBtn.click();
  await expect(
    page.locator('.we-align-popover [role="menuitemradio"][aria-checked="true"]'),
  ).toHaveAccessibleName('가운데 정렬');
  await page.keyboard.press('Escape');
});

test('정렬 메뉴는 방향키로 이동하고 Escape 로 닫힌다', async ({ page }) => {
  await page.click('.we-editor-content');
  const alignBtn = page.getByRole('button', { name: '정렬', exact: true });
  await alignBtn.click();

  await expect(page.getByRole('menuitemradio', { name: '왼쪽 정렬' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: '가운데 정렬' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.we-align-popover')).not.toBeVisible();
  await expect(alignBtn).toBeFocused();
});
