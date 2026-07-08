/**
 * DOM 기반 화이트리스트 HTML 새니타이저.
 *
 * 정규식으로 HTML 을 파싱하지 않는다. 브라우저 파서로 비활성(inert) 문서를 만든 뒤
 * 노드를 순회하며 허용 목록에 없는 것을 제거한다. `<template>` 의 content 는
 * 문서에 연결되지 않아 이미지/스크립트 등 서브리소스를 로드하지 않는다.
 */
import {
  DANGEROUS_TAGS,
  ALLOWED_TAGS,
  ALLOWED_ATTRS,
  ALLOWED_STYLES,
  ALLOWED_LINK_SCHEMES,
  ALLOWED_IMG_SCHEMES,
  ALLOWED_DATA_MIME,
  CSS_VALUE_BLOCKLIST,
} from './schema.js';

/** 문자열에서 URL 스킴을 안전하게 추출한다. 제어문자/공백을 제거해 우회를 막는다. */
function getScheme(url) {
  // 제어문자(\t \n \r 포함, U+0000~U+0020, U+007F~U+009F)와 공백을 모두 제거.
  // "java\tscript:" 같은 우회를 차단한다.
  // eslint-disable-next-line no-control-regex
  const cleaned = String(url).replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(cleaned);
  return match ? match[1].toLowerCase() : '';
}

/** 상대경로(스킴 없음) 이거나 허용 스킴이면 통과. */
function isSafeUrl(url, allowedSchemes, dataMimeCheck) {
  const scheme = getScheme(url);
  if (!scheme) return true; // 상대경로, 앵커(#), 쿼리 등
  if (!allowedSchemes.has(scheme)) return false;
  if (scheme === 'data:') {
    return dataMimeCheck ? dataMimeCheck.test(String(url).trim()) : false;
  }
  return true;
}

// width/height 는 고정 단위만 허용(vw/vh 등 뷰포트 단위로 편집기 레이아웃을
// 뒤덮는 것을 방지). auto 및 px/pt/%/em/rem/cm/mm 만 통과.
const DIMENSION_PROPS = new Set(['width', 'height']);
const SAFE_DIMENSION = /^(auto|-?\d+(\.\d+)?(px|pt|%|em|rem|cm|mm)?)$/i;

/** style 속성 문자열을 CSS 화이트리스트로 필터링해 재작성한다. */
function sanitizeStyle(styleText) {
  const safe = [];
  for (const decl of String(styleText).split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    let value = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLES.has(prop)) continue;
    if (CSS_VALUE_BLOCKLIST.test(value)) continue;
    value = value.replace(/!\s*important/gi, '').trim();
    if (!value) continue;
    if (DIMENSION_PROPS.has(prop) && !SAFE_DIMENSION.test(value)) continue;
    safe.push(`${prop}: ${value}`);
  }
  return safe.join('; ');
}

/** deprecated 속성(align, bgcolor 등)을 안전한 style 로 이관한다. */
function migrateLegacyAttrs(el) {
  const styleParts = [];
  const align = el.getAttribute('align');
  if (align && /^(left|right|center|justify)$/i.test(align)) {
    styleParts.push(`text-align: ${align.toLowerCase()}`);
  }
  const bgcolor = el.getAttribute('bgcolor');
  if (bgcolor && /^#?[a-z0-9(),.%\s]+$/i.test(bgcolor)) {
    styleParts.push(`background-color: ${bgcolor}`);
  }
  const color = el.getAttribute('color'); // <font color>
  if (color && /^#?[a-z0-9(),.%\s]+$/i.test(color)) {
    styleParts.push(`color: ${color}`);
  }
  for (const attr of ['align', 'bgcolor', 'color', 'valign']) el.removeAttribute(attr);
  return styleParts;
}

/** 한 요소의 속성을 정리한다. */
function sanitizeAttributes(el, tag) {
  const allowed = new Set([
    ...(ALLOWED_ATTRS['*'] || []),
    ...(ALLOWED_ATTRS[tag] || []),
  ]);

  const legacyStyles = migrateLegacyAttrs(el);

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    // on* 이벤트 핸들러, xmlns, srcset 등은 무조건 제거.
    if (name.startsWith('on') || name.startsWith('xmlns') || name === 'srcset') {
      el.removeAttribute(attr.name);
      continue;
    }
    if (!allowed.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === 'href' && !isSafeUrl(attr.value, ALLOWED_LINK_SCHEMES)) {
      el.removeAttribute(attr.name);
    } else if (name === 'src' && !isSafeUrl(attr.value, ALLOWED_IMG_SCHEMES, ALLOWED_DATA_MIME)) {
      el.removeAttribute(attr.name);
    } else if (name === 'style') {
      const merged = [attr.value, ...legacyStyles].filter(Boolean).join('; ');
      const clean = sanitizeStyle(merged);
      if (clean) el.setAttribute('style', clean);
      else el.removeAttribute('style');
    } else if ((name === 'width' || name === 'height') && !/^\d+%?$/.test(attr.value)) {
      el.removeAttribute(attr.name);
    }
  }

  // style 속성이 없었지만 legacy 이관분이 있으면 새로 추가.
  if (!el.hasAttribute('style') && legacyStyles.length) {
    const clean = sanitizeStyle(legacyStyles.join('; '));
    if (clean) el.setAttribute('style', clean);
  }

  // 링크는 tabnabbing 방지 속성을 강제한다.
  if (tag === 'a' && el.hasAttribute('href')) {
    if (el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

/** <font> 를 span+style 로 변환한다. */
function normalizeFont(doc, el) {
  const span = doc.createElement('span');
  const styles = [];
  const face = el.getAttribute('face');
  if (face) styles.push(`font-family: ${face}`);
  const color = el.getAttribute('color');
  if (color) styles.push(`color: ${color}`);
  const styleAttr = el.getAttribute('style');
  if (styleAttr) styles.push(styleAttr);
  const clean = sanitizeStyle(styles.join('; '));
  if (clean) span.setAttribute('style', clean);
  while (el.firstChild) span.appendChild(el.firstChild);
  el.replaceWith(span);
  return span;
}

/** 요소를 벗겨내고 자식만 남긴다. */
function unwrap(el) {
  const parent = el.parentNode;
  if (!parent) {
    el.remove();
    return;
  }
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** 노드를 재귀적으로 정리한다. */
function sanitizeNode(doc, node) {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.remove();
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  let el = node;
  const tag = el.tagName.toLowerCase();

  if (DANGEROUS_TAGS.has(tag)) {
    el.remove();
    return;
  }

  if (tag === 'font') {
    el = normalizeFont(doc, el);
  } else if (!ALLOWED_TAGS.has(tag)) {
    // 허용 안 된 태그는 언랩: 자식을 부모로 올리고 자신은 제거.
    unwrap(el);
    return;
  }

  sanitizeAttributes(el, el.tagName.toLowerCase());

  // 자식 순회(라이브 리스트 변형 대비 스냅샷).
  for (const child of Array.from(el.childNodes)) {
    sanitizeNode(doc, child);
  }
}

/**
 * HTML 문자열을 새니타이즈한다.
 * @param {string} html 신뢰할 수 없는 HTML
 * @returns {string} 안전한 HTML
 */
export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = String(html ?? '');
  const doc = template.ownerDocument;
  for (const child of Array.from(template.content.childNodes)) {
    sanitizeNode(doc, child);
  }
  return template.innerHTML;
}

/**
 * DocumentFragment 를 새니타이즈한다(붙여넣기 경로에서 재파싱 비용 절감).
 * @param {DocumentFragment} fragment
 * @returns {DocumentFragment} 정리된 fragment (동일 참조)
 */
export function sanitizeFragment(fragment) {
  const doc = fragment.ownerDocument || document;
  for (const child of Array.from(fragment.childNodes)) {
    sanitizeNode(doc, child);
  }
  return fragment;
}

export const _internals = { getScheme, isSafeUrl, sanitizeStyle };
