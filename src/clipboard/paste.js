/**
 * 붙여넣기 처리.
 *
 * 1) 이미지 데이터가 있으면 이미지 업로드 경로로 위임.
 * 2) text/html 이 있으면 새니타이즈 후 삽입(엑셀 서식은 CSS 화이트리스트로 보존).
 * 3) 그 외에는 순수 텍스트로 삽입.
 *
 * 보안 핵심: 클립보드 HTML 은 절대 신뢰하지 않는다. 반드시 sanitizeHtml 을 통과시킨다.
 */
import { sanitizeHtml } from '../security/sanitizer.js';

/** 붙여넣기 데이터에서 이미지 파일을 추출한다(없으면 null). */
function extractImageFile(clipboardData) {
  const items = clipboardData.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile();
    }
  }
  return null;
}

/**
 * 엑셀/스프레드시트 HTML 특유의 잡음을 제거해 서식만 남긴다.
 * - MS Office 조건부 주석(<!--[if ...]-->)과 <o:p> 등은 새니타이저가 이미 제거한다.
 * - 셀 안의 불필요한 개행/공백을 정리한다.
 */
function preprocessSpreadsheetHtml(html) {
  return html
    // StartFragment/EndFragment 주석 마커 제거(주석은 새니타이저도 제거하나 명시적 정리).
    .replace(/<!--\s*StartFragment\s*-->/gi, '')
    .replace(/<!--\s*EndFragment\s*-->/gi, '')
    // 셀 사이 개행/탭을 공백 1개로 축약(레이아웃 붕괴 방지).
    .replace(/>\s+</g, '><');
}

/**
 * <style> 블록의 클래스 규칙을 각 요소의 인라인 style 로 풀어 넣는다.
 *
 * 엑셀/워드는 셀 서식(배경·글자색·테두리)을 인라인이 아니라
 * `<style>.xl65 { background:#1F4E79; color:white }</style>` + `class="xl65"`
 * 형태로 넣는다. 새니타이저가 <style> 과 class 를 제거하기 전에 여기서
 * 인라인으로 이관해야 서식이 보존된다. (이관된 값도 이후 CSS 화이트리스트를
 * 그대로 통과하므로 보안 정책은 약화되지 않는다.)
 */
function inlineStylesheetRules(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const content = template.content;

  const styleEls = content.querySelectorAll('style');
  if (!styleEls.length) return html;

  let cssText = '';
  for (const s of styleEls) cssText += `${s.textContent}\n`;

  let sheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
  } catch {
    return html; // CSS 파싱 실패 시 원본 그대로(새니타이저가 어차피 정리)
  }

  // 캐스케이드 근사: 시트 규칙은 "뒤에 나온 규칙이 앞의 규칙을 덮어쓴다".
  // 엑셀은 범용 규칙(td { color:black; … })을 먼저, 셀별 클래스(.xl67 { color:red })를
  // 뒤에 두므로 순서 덮어쓰기로 올바른 결과가 나온다. 단, 요소에 원래 있던
  // 인라인 스타일은 시트보다 우선하므로 절대 덮어쓰지 않는다.
  const sheetApplied = new WeakMap(); // el → Set<prop> (시트에서 이관된 속성)
  for (const rule of sheet.cssRules) {
    if (!(rule instanceof CSSStyleRule)) continue;
    let targets;
    try {
      targets = content.querySelectorAll(rule.selectorText);
    } catch {
      continue; // 지원 안 되는 셀렉터는 건너뜀
    }
    for (const el of targets) {
      let applied = sheetApplied.get(el);
      if (!applied) {
        applied = new Set();
        sheetApplied.set(el, applied);
      }
      for (const prop of rule.style) {
        // 원본 인라인 스타일(시트 이관분이 아님)은 보호한다.
        if (el.style.getPropertyValue(prop) && !applied.has(prop)) continue;
        const value = rule.style.getPropertyValue(prop);
        if (value && value !== 'initial') {
          el.style.setProperty(prop, value);
          applied.add(prop);
        }
      }
    }
  }

  return template.innerHTML;
}

/**
 * paste 이벤트를 처리한다.
 * @param {ClipboardEvent} event
 * @param {object} ctx
 * @param {import('../core/Selection.js').SelectionManager} ctx.selection
 * @param {(file: File) => Promise<void>} ctx.insertImageFile 이미지 파일 삽입기
 * @param {() => void} ctx.onChange 변경 콜백
 */
export function handlePaste(event, ctx) {
  const data = event.clipboardData;
  if (!data) return;

  event.preventDefault();

  // 1) HTML 서식 우선.
  //    엑셀/워드는 클립보드에 "표 스크린샷 이미지"와 "HTML 표"를 함께 넣는다.
  //    이미지를 먼저 쓰면 표가 편집 불가능한 그림으로 붙으므로, 새니타이즈 후
  //    실질 콘텐츠가 남는 HTML 이 있으면 편집 가능한 표/텍스트를 우선한다.
  const html = data.getData('text/html');
  if (html) {
    const clean = sanitizeHtml(inlineStylesheetRules(preprocessSpreadsheetHtml(html)));
    if (hasRenderableContent(clean)) {
      insertHtmlAtCursor(clean, ctx);
      ctx.onChange();
      return;
    }
  }

  // 2) 이미지 파일(스크린샷 등 HTML 이 없는 순수 이미지 붙여넣기).
  const imageFile = extractImageFile(data);
  if (imageFile) {
    ctx.insertImageFile(imageFile);
    return;
  }

  // 3) 순수 텍스트 폴백(줄바꿈을 <br> 로 변환).
  const text = data.getData('text/plain');
  if (text) {
    insertTextAtCursor(text, ctx);
    ctx.onChange();
  }
}

/**
 * 새니타이즈 결과에 실질적으로 렌더링될 내용이 있는지 검사한다.
 * (텍스트, src 있는 이미지, 표 중 하나라도 있어야 true)
 * 예: 브라우저가 blob:/file: 이미지를 감싼 HTML 은 새니타이즈 후 빈 껍데기가
 * 되므로 false → 이미지 파일 경로로 폴백한다.
 */
function hasRenderableContent(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  if ((template.content.textContent || '').trim()) return true;
  return template.content.querySelector('img[src], table') !== null;
}

/** 새니타이즈된 HTML 을 커서 위치에 삽입한다. */
function insertHtmlAtCursor(html, ctx) {
  const range = ctx.selection.getRange();
  if (!range) return;
  range.deleteContents();

  const template = document.createElement('template');
  template.innerHTML = html;
  const frag = template.content;
  const lastNode = frag.lastChild;
  range.insertNode(frag);

  // 삽입 뒤로 커서 이동.
  if (lastNode) {
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(lastNode);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }
}

/** 순수 텍스트를 안전하게(줄바꿈 유지) 삽입한다. */
function insertTextAtCursor(text, ctx) {
  const range = ctx.selection.getRange();
  if (!range) return;
  range.deleteContents();

  const lines = text.split(/\r\n|\r|\n/);
  const frag = document.createDocumentFragment();
  lines.forEach((line, i) => {
    if (i > 0) frag.appendChild(document.createElement('br'));
    frag.appendChild(document.createTextNode(line));
  });
  const last = frag.lastChild;
  range.insertNode(frag);
  if (last) {
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(last);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
  }
}
