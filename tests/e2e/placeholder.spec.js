import { test, expect } from '@playwright/test';

/**
 * 템플릿 치환 토큰(`#{이름}`) 보존 검증.
 * 호스트 템플릿이 style 속성 안에 넣어 둔 자리표시자가 새니타이저를 살아남아야 한다.
 */

const SAMPLE = `<p style="font-size: 12px; padding-bottom: 0px; padding-top: 0px; padding-left: 0px; line-height: 160%; padding-right: 0px; #{노출제어_중간고사}">#{학기}학기 #{차수}차 개강반 학습자들의 중간고사 기간이 #{종강일}로 마감되었습니다.<br>
이에 <span style="font-weight: bold; color: #336dd9">중간고사 주관식 채점 요청</span> 드립니다.</p>`;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.we-editor-content')).toBeVisible();
});

test('style 속성 끝의 치환 토큰이 setHTML → getHTML 왕복에서 보존된다', async ({ page }) => {
  const html = await page.evaluate((h) => {
    window.__editor.setHTML(h);
    return window.__editor.getHTML();
  }, SAMPLE);

  expect(html).toContain('#{노출제어_중간고사}');
  // 앞선 정상 선언도 그대로 남고, 토큰은 마지막 위치를 유지한다.
  expect(html).toMatch(/padding-right: 0px; #\{노출제어_중간고사\}"/);
  // 본문 텍스트의 토큰은 원래부터 텍스트 노드라 그대로다.
  expect(html).toContain('#{학기}학기 #{차수}차');
  expect(html).toContain('#{종강일}');
});

test('치환 토큰이 선언 중간에 있어도 순서와 함께 보존된다', async ({ page }) => {
  const html = await page.evaluate(() => {
    window.__editor.setHTML('<p style="#{a-b.c}; color: red; #{노출}; font-size: 12px">x</p>');
    return window.__editor.getHTML();
  });
  expect(html).toContain('style="#{a-b.c}; color: red; #{노출}; font-size: 12px"');
});

test('소스 보기 → 편집기 복귀 후에도 치환 토큰이 남는다', async ({ page }) => {
  await page.evaluate((h) => window.__editor.setHTML(h), SAMPLE);
  const toggle = page.locator('button[aria-label="HTML 소스 보기"]');
  await toggle.click();
  await expect(page.locator('.we-source-area')).toBeVisible();
  await toggle.click();

  const html = await page.evaluate(() => window.__editor.getHTML());
  expect(html).toContain('#{노출제어_중간고사}');
});

test('토큰 모양을 흉내 낸 위험 선언은 여전히 제거된다', async ({ page }) => {
  const html = await page.evaluate(() => {
    window.__editor.setHTML([
      '<p style="#{a<b}; #{x:url(evil)}; #{y\\}; #{ }; #{z}(; #{ok}">x</p>',
    ].join(''));
    return window.__editor.getHTML();
  });
  expect(html).toBe('<p style="#{ok}">x</p>');
});
