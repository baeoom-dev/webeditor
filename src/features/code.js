/**
 * 코드 서식: 인라인 코드(`<code>`)와 코드 블록(`<pre><code>`).
 *
 * execCommand 로 표현되지 않으므로 Range 를 직접 조작한다. 두 태그 모두
 * 새니타이저 화이트리스트(schema.js)에 이미 포함돼 있어 getHTML() 을 통과한다.
 * 스타일은 .we-content 콘텐츠 스타일시트가 담당한다(에디터·출력 공용).
 */

/** node 에서 root 안쪽으로 가장 가까운 특정 태그 조상을 찾는다(없으면 null). */
function closestTag(node, tag, root) {
  let n = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && n.tagName === tag) return n;
    n = n.parentNode;
  }
  return null;
}

/** 요소를 벗기고(unwrap) 자식을 부모로 올린다. */
function unwrap(el) {
  const parent = el.parentNode;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** 요소 내용 전체를 선택한다. */
function selectContents(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 요소 시작 지점에 접힌 커서를 둔다. */
function caretAtStart(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * 인라인 코드 토글. 선택 영역을 `<code>` 로 감싸거나, 이미 인라인 코드면 해제한다.
 * (코드 블록 `<pre><code>` 안의 code 는 대상이 아니다.)
 * @param {HTMLElement} root 편집 루트
 */
export function toggleInlineCode(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  const existing = closestTag(range.startContainer, 'CODE', root);
  if (existing && !closestTag(existing, 'PRE', root)) {
    unwrap(existing);
    return;
  }
  if (range.collapsed) return; // 선택이 없으면 무시

  try {
    const code = document.createElement('code');
    code.appendChild(range.extractContents());
    range.insertNode(code);
    selectContents(code);
  } catch {
    /* 블록 경계를 넘는 복잡한 선택은 무시 */
  }
}

/**
 * 코드 블록 토글. 선택 텍스트를 `<pre><code>` 로 만들고, 이미 코드 블록 안이면
 * 일반 문단으로 되돌린다.
 * @param {HTMLElement} root 편집 루트
 */
export function insertCodeBlock(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);

  // 이미 코드 블록 안이면 문단으로 환원.
  const pre = closestTag(range.startContainer, 'PRE', root);
  if (pre) {
    const p = document.createElement('p');
    const text = pre.textContent;
    if (text) p.textContent = text;
    else p.innerHTML = '<br>';
    pre.replaceWith(p);
    caretAtStart(p);
    return;
  }

  const text = range.toString();
  const preEl = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.textContent = text; // 순수 텍스트로 보존(HTML 이스케이프는 브라우저가 처리)
  preEl.appendChild(codeEl);

  range.deleteContents();
  range.insertNode(preEl);

  // 코드 블록 뒤에 빈 문단을 두어 커서가 블록 밖으로 나올 수 있게 한다.
  if (!preEl.nextElementSibling) {
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    preEl.after(after);
  }
  caretAtStart(codeEl);
}
