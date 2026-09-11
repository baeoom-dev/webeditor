/**
 * 다이얼로그 폼 공용 헬퍼.
 *
 * 보안 불변식: 메시지 문구(i18n 카탈로그·호스트 override)는 textContent 로만 넣는다.
 * 아이콘(ui/icons.js 의 신뢰된 인라인 SVG)만 innerHTML 을 쓴다 — 둘을 문자열로 합치지 않는다.
 */

/**
 * 아이콘 + 문구 버튼(예: ✓ 적용).
 * @param {object} opts
 * @param {string} opts.icon 인라인 SVG 마크업(icons.*)
 * @param {string} opts.text 버튼 문구(t() 결과)
 * @param {string} opts.className 추가 클래스(we-btn 은 자동)
 * @param {'button'|'submit'} [opts.type='button']
 * @param {() => void} [opts.onClick]
 */
export function iconButton({ icon, text, className, type = 'button', onClick }) {
  const btn = document.createElement('button');
  btn.type = type;
  btn.className = `we-btn ${className}`;
  btn.innerHTML = icon;
  const label = document.createElement('span');
  label.textContent = text;
  btn.appendChild(label);
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/**
 * 문구만 있는 버튼.
 * @param {string} text
 * @param {string} className
 * @param {(() => void)|null} [onClick]
 * @param {'button'|'submit'} [type='button']
 */
export function textButton(text, className, onClick = null, type = 'button') {
  const btn = document.createElement('button');
  btn.type = type;
  btn.className = `we-btn ${className}`;
  btn.textContent = text;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/** 오류 문구를 role="alert" 요소에 표시한다. */
export function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}
