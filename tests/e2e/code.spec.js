import { test, expect } from '@playwright/test';

/**
 * 코드 블록 / 인라인 코드 기능의 실제 브라우저(Chrome) 동작 검증.
 *
 * 데모(index.html)는 window.__editor 로 에디터 인스턴스를 노출한다.
 * 선택 영역은 evaluate 로 정확히 지정한 뒤 툴바 버튼을 클릭한다
 * (버튼 mousedown 기본동작이 막혀 선택이 유지됨).
 */

/** 편집 영역 첫 문단의 텍스트 [start,end] 를 선택하고 저장한다. */
async function selectInFirstParagraph(page, start, end) {
  await page.evaluate(
    ({ start, end }) => {
      const ed = window.__editor;
      const t = ed.content.querySelector('p').firstChild;
      const r = document.createRange();
      r.setStart(t, start);
      r.setEnd(t, end);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      ed.selection.save();
    },
    { start, end },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

test('인라인 코드 버튼이 선택 영역을 <code> 로 감싼다', async ({ page }) => {
  await page.evaluate(() => window.__editor.setHTML('<p>hello world</p>'));
  await selectInFirstParagraph(page, 0, 5); // "hello"
  await page.getByRole('button', { name: '인라인 코드' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<code>hello</code>');
});

test('선택 없이 커서만 있을 때 인라인 코드 버튼이 현재 단어를 감싼다', async ({ page }) => {
  await page.evaluate(() => {
    const ed = window.__editor;
    ed.setHTML('<p>hello world</p>');
    const t = ed.content.querySelector('p').firstChild;
    const r = document.createRange();
    r.setStart(t, 8); // "wor|ld" — world 안 커서(선택 없음)
    r.collapse(true);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    ed.content.focus();
    ed.selection.save();
  });
  await page.getByRole('button', { name: '인라인 코드' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('<code>world</code>');
});

test('인라인 코드에 눈에 띄는 배경 스타일이 적용된다', async ({ page }) => {
  await page.evaluate(() => window.__editor.setHTML('<p>이것은 <code>코드</code> 다.</p>'));
  const bg = await page.evaluate(
    () => getComputedStyle(document.querySelector('.we-editor-content :not(pre) > code')).backgroundColor,
  );
  // 투명이면 화면에서 안 보인다 — 배경이 반드시 칠해져야 한다.
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  expect(bg).not.toBe('transparent');
});

test('코드 블록 버튼이 선택 텍스트를 <pre><code> 로 만든다', async ({ page }) => {
  await page.evaluate(() => window.__editor.setHTML('<p>const x = 1;</p>'));
  await selectInFirstParagraph(page, 0, 12);
  await page.getByRole('button', { name: '코드 블록' }).click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toMatch(/<pre><code>const x = 1;<\/code><\/pre>/);
  await expect(page.locator('.we-editor-content pre code')).toHaveText('const x = 1;');
});

test('코드 블록이 monospace 폰트와 배경으로 렌더된다', async ({ page }) => {
  const pre = page.locator('.we-editor-content pre').first();
  await expect(pre).toBeVisible();
  const font = await pre.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font.toLowerCase()).toMatch(/mono/);
  const overflowX = await pre.evaluate((el) => getComputedStyle(el).overflowX);
  expect(overflowX).toBe('auto');
});

test('출력 미리보기(.we-content)에 코드 블록이 동일 스타일로 렌더된다', async ({ page }) => {
  await page.getByRole('button', { name: '출력 미리보기(.we-content)' }).click();
  const previewPre = page.locator('#preview.we-content pre').first();
  await expect(previewPre).toBeVisible();
  const font = await previewPre.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font.toLowerCase()).toMatch(/mono/);
});

test('스크린샷: 라이트/다크 에디터 + 출력 미리보기', async ({ page }) => {
  await page.getByRole('button', { name: '출력 미리보기(.we-content)' }).click();
  await page.locator('#preview.we-content pre').first().waitFor();
  await page.screenshot({ path: 'test-results/shot-light.png', fullPage: true });

  await page.getByRole('button', { name: /다크로 전환/ }).click(); // 라이트→다크 토글
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/shot-dark.png', fullPage: true });
});
