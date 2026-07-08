import { test, expect } from '@playwright/test';

/** 삽입된 이미지의 대체 텍스트(alt) 편집 검증. */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

test('이미지를 더블클릭하면 alt 편집 다이얼로그가 기존 값으로 열린다', async ({ page }) => {
  await page.evaluate(() =>
    window.__editor.setHTML('<p><img src="https://example.com/a.png" alt="옛 설명"></p>'),
  );
  await page.dblclick('.we-editor-content img');
  await expect(page.locator('.we-dialog input[type=text]')).toHaveValue('옛 설명');
});

test('alt 를 수정하면 이미지 alt 속성이 갱신된다', async ({ page }) => {
  await page.evaluate(() =>
    window.__editor.setHTML('<p><img src="https://example.com/a.png" alt="옛"></p>'),
  );
  await page.dblclick('.we-editor-content img');
  await page.locator('.we-dialog input[type=text]').fill('새 대체 텍스트');
  await page.locator('.we-dialog button[type=submit]').click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('alt="새 대체 텍스트"');
});
