/**
 * 서식 명령 엔진.
 *
 * 인라인 서식은 브라우저의 `execCommand` 를 사용한다. deprecated 이지만 부분 선택
 * 분할·병합 로직을 브라우저가 정확히 처리해 주므로, 순수 vanilla 로 리치텍스트를
 * 직접 구현하는 것보다 안정적이다. `styleWithCSS(true)` 로 결과를 CSS 기반(span[style])
 * 으로 만들어 새니타이저 화이트리스트와 정합성을 맞춘다.
 */

let cssModeReady = false;

/** 색/폰트가 CSS 스타일로 출력되도록 강제한다(한 번만). */
function ensureCssMode() {
  if (cssModeReady) return;
  try {
    document.execCommand('styleWithCSS', false, true);
    cssModeReady = true;
  } catch {
    /* 일부 구형 브라우저는 미지원 — 무시 */
  }
}

/** execCommand 안전 래퍼. */
function exec(name, value = null) {
  ensureCssMode();
  try {
    return document.execCommand(name, false, value);
  } catch {
    return false;
  }
}

export const commands = {
  bold: () => exec('bold'),
  italic: () => exec('italic'),
  underline: () => exec('underline'),
  strikethrough: () => exec('strikeThrough'),
  foreColor: (color) => exec('foreColor', color),
  backColor: (color) => exec('hiliteColor', color) || exec('backColor', color),
  unorderedList: () => exec('insertUnorderedList'),
  orderedList: () => exec('insertOrderedList'),
  alignLeft: () => exec('justifyLeft'),
  alignCenter: () => exec('justifyCenter'),
  alignRight: () => exec('justifyRight'),
  alignJustify: () => exec('justifyFull'),
  indent: () => exec('indent'),
  outdent: () => exec('outdent'),
  removeFormat: () => {
    exec('removeFormat');
    exec('unlink');
  },
  undo: () => exec('undo'),
  redo: () => exec('redo'),

  /**
   * 임의 px 폰트 크기 적용.
   * execCommand('fontSize') 는 1~7 레거시 크기만 받으므로, 임시 크기 7 로 태깅한 뒤
   * 생성된 <font size="7"> 를 정확한 px span 으로 치환한다. 브라우저의 선택 분할
   * 로직을 재사용하면서 임의 px 을 얻는 검증된 기법이다.
   * @param {HTMLElement} root 편집기 루트
   * @param {string} size 예: "18px"
   */
  fontSize: (root, size) => {
    // styleWithCSS 가 켜져 있으면 fontSize 는 span[font-size:xxx-large] 를 만들어
    // <font size="7"> 태깅 기법이 동작하지 않는다. 잠시 꺼서 <font> 를 얻은 뒤 변환한다.
    try {
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('fontSize', false, '7');
    } catch {
      return false;
    } finally {
      try {
        document.execCommand('styleWithCSS', false, true);
      } catch {
        /* 무시 */
      }
    }
    const tagged = root.querySelectorAll('font[size="7"]');
    for (const font of tagged) {
      const span = document.createElement('span');
      span.style.fontSize = size;
      // <font> 의 다른 인라인 스타일(색 등)이 있으면 보존.
      const inherited = font.getAttribute('style');
      if (inherited) span.setAttribute('style', `${inherited}; font-size: ${size}`);
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    }
    return true;
  },
};

/** 토글 버튼 상태 조회(굵게/기울임 등이 현재 켜져 있는지). */
export function queryState(name) {
  try {
    return document.queryCommandState(name);
  } catch {
    return false;
  }
}
