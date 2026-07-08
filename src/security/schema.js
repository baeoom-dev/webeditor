/**
 * 새니타이저 화이트리스트 스키마.
 *
 * 보안 원칙: "허용된 것만 통과(allowlist)". 명시되지 않은 태그/속성/CSS 는 전부 제거한다.
 * 이 파일 한 곳에서 정책을 관리하여 감사(audit)를 쉽게 한다.
 */

// 통째로 제거(자식까지 삭제)해야 하는 위험 태그.
export const DANGEROUS_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta',
  'base', 'form', 'input', 'button', 'textarea', 'select', 'option',
  'noscript', 'template', 'svg', 'math', 'title', 'head',
]);

// 허용 태그. 여기 없는 태그는 언랩(unwrap: 태그만 벗기고 자식은 보존)한다.
export const ALLOWED_TAGS = new Set([
  'p', 'br', 'div', 'span', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark',
  'a', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img', 'figure', 'figcaption',
  'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  // 'font' 는 파싱은 허용하되 sanitizer 가 span+style 로 변환한다.
  'font',
]);

// 태그별 허용 속성. 'style' 은 CSS 화이트리스트를 다시 통과한다.
export const ALLOWED_ATTRS = {
  '*': ['style', 'dir'],
  a: ['href', 'target', 'rel', 'title'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan', 'scope'],
  col: ['span'],
  colgroup: ['span'],
  ol: ['start', 'type'],
};

// 허용 CSS 속성. 엑셀 서식 보존을 위해 색/테두리/굵기/정렬을 포함한다.
export const ALLOWED_STYLES = new Set([
  // 'background' 단축형은 엑셀이 즐겨 쓴다. url() 등 위험 값은
  // CSS_VALUE_BLOCKLIST 가 선언 단위로 폐기하므로 색상만 통과한다.
  'color', 'background-color', 'background',
  'font-weight', 'font-style', 'font-size', 'font-family',
  'text-align', 'text-decoration', 'text-decoration-line', 'text-decoration-style',
  'vertical-align', 'white-space', 'line-height',
  'width', 'height',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-width', 'border-style', 'border-color',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-collapse', 'border-spacing',
  'list-style-type', 'list-style-position',
]);

// href 에 허용되는 스킴.
export const ALLOWED_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:']);
// img src 에 허용되는 스킴.
export const ALLOWED_IMG_SCHEMES = new Set(['http:', 'https:', 'data:']);
// data: 이미지 중 허용 MIME (data:text/html 등 차단).
export const ALLOWED_DATA_MIME = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml);/i;

// CSS 값에 하나라도 포함되면 해당 선언을 폐기하는 위험 패턴.
export const CSS_VALUE_BLOCKLIST = /url\s*\(|expression\s*\(|javascript:|vbscript:|@import|<|>|\\/i;
