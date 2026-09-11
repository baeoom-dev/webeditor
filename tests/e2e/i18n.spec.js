import { test, expect } from '@playwright/test';

/**
 * 다국어(UI 언어) 검증 — docs/i18n-plan.md P3.
 *
 * 데모(index.html)는 ?locale= 로 UI 언어를, ?override=1 로 messages 부분 override 를 켠다.
 * 한국어 기본 동작은 기존 스펙(한국어 셀렉터)이 전부 증명하므로 여기서는 en·override·폴백·lang 만 본다.
 */

test('locale=en: 툴바 버튼 접근성 이름이 영어다', async ({ page }) => {
  await page.goto('/?locale=en');
  await expect(page.locator('.we-editor-content')).toBeVisible();

  await expect(page.getByRole('toolbar', { name: 'Formatting toolbar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bold (Ctrl+B)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Formula', exact: true })).toBeVisible();
  // 글꼴 선택기 첫 항목(내장 목록의 labelKey 번역).
  await expect(page.getByRole('combobox', { name: 'Font', exact: true })).toContainText('Default');
  // 편집 영역 접근성 라벨·플레이스홀더 기본값도 카탈로그를 따른다.
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toBeVisible();
  await expect(page.locator('.we-editor-content')).toHaveAttribute('data-placeholder', 'Type here…');
});

test('locale=en: 컨테이너와 body 직속 다이얼로그·팝오버에 lang="en" 이 stamp 된다', async ({ page }) => {
  await page.goto('/?locale=en');
  await expect(page.locator('.we-editor')).toHaveAttribute('lang', 'en');

  await page.getByRole('button', { name: 'Table', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert table' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('lang', 'en');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();
  await expect(dialog.getByText('2 rows × 2 columns')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Alignment' }).click();
  const menu = page.getByRole('menu', { name: 'Alignment' });
  await expect(menu).toHaveAttribute('lang', 'en');
  await expect(menu.getByRole('menuitemradio', { name: 'Align center' })).toBeVisible();
});

test('locale=en: 잘못된 LaTeX 오류가 영어로 나온다(LatexSyntaxError 코드 → 문구)', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: 'Formula', exact: true }).click();
  const input = page.locator('.we-formula-input');
  await input.fill('\\foo{1}');
  await expect(page.getByRole('alert')).toHaveText('Unsupported command: \\foo');
  await input.fill('\\frac{1');
  await expect(page.getByRole('alert')).toHaveText('Missing closing }.');
});

test('locale=en: 표 편집 툴바가 영어이고 lang 이 stamp 된다', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.evaluate(() =>
    window.__editor.setHTML('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'),
  );
  await page.locator('.we-editor-content td').first().click();
  const tools = page.getByRole('toolbar', { name: 'Table tools' });
  await expect(tools).toBeVisible();
  await expect(tools).toHaveAttribute('lang', 'en');
  await expect(tools.getByRole('button', { name: 'Insert row above' })).toBeVisible();
});

test('messages 부분 override: 지정한 키만 바뀌고 나머지는 내장 en 유지', async ({ page }) => {
  await page.goto('/?locale=en&override=1');
  await expect(page.getByRole('button', { name: 'Strong', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Italic (Ctrl+I)' })).toBeVisible();
});

test('내장에 없는 locale 은 ko 로 폴백한다', async ({ page }) => {
  await page.goto('/?locale=ja');
  await expect(page.locator('.we-editor')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('button', { name: '굵게 (Ctrl+B)' })).toBeVisible();
});

test('IIFE 번들: WebEditor.messages 노출 + locale=en 으로 생성된다 (dist 없으면 skip)', async ({ page, request }) => {
  const built = await request.get('/dist/webeditor.iife.min.js');
  test.skip(!built.ok(), 'pnpm build 산출물(dist/)이 없어 IIFE 검증을 건너뛴다');
  await page.goto('/demo/legacy.html');
  await page.waitForFunction(() => typeof window.WebEditor !== 'undefined');
  const result = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ed = window.WebEditor.createEditor(host, { locale: 'en', features: ['bold'] });
    return {
      bold: window.WebEditor.messages.en.toolbar.bold,
      label: host.querySelector('.we-tool-btn').getAttribute('aria-label'),
      lang: ed.container.getAttribute('lang'),
    };
  });
  expect(result).toEqual({ bold: 'Bold (Ctrl+B)', label: 'Bold (Ctrl+B)', lang: 'en' });
});

test('locale=en 다이얼로그 스크린샷(레이아웃 육안 확인용)', async ({ page }) => {
  await page.goto('/?locale=en');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Insert image' })).toBeVisible();
  await page.screenshot({ path: 'test-results/i18n-en-image-dialog.png' });
});
