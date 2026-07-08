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

/** node 가 속한 root 직계 자식(최상위 블록) 요소를 반환한다(없으면 null). */
function topBlock(node, root) {
  let n = node;
  while (n && n.parentNode && n.parentNode !== root) n = n.parentNode;
  if (!n || n.parentNode !== root || n.nodeType !== Node.ELEMENT_NODE) return null;
  return n;
}

/** 내용이 비어 있는(공백/br 뿐인) 블록인지 판단한다. */
function isEmptyBlock(el) {
  const text = (el.textContent || '').replace(/\u200B/g, '').trim();
  return text === '' && !el.querySelector('img, table, hr, pre');
}

/**
 * 코드 요소 안에 커서를 둔다.
 *
 * 빈 code 는 contenteditable 에서 커서가 밖(뒤 문단 등)으로 새어나간다. 빈 텍스트 노드로는
 * 막히지 않아, 빈 줄 filler 로 `<br>` 를 넣고 그 앞에 커서를 둔다. 사용자가 입력하면
 * 브라우저가 filler `<br>` 를 입력 텍스트로 대체해 `<code>입력</code>` 이 된다.
 */
function placeCaretInCode(code) {
  const range = document.createRange();
  if (code.firstChild) {
    range.selectNodeContents(code);
    range.collapse(false); // 삽입한 텍스트 끝으로
  } else {
    code.appendChild(document.createElement('br'));
    range.setStart(code, 0);
    range.collapse(true);
  }
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
  const existingPre = closestTag(range.startContainer, 'PRE', root);
  if (existingPre) {
    const p = document.createElement('p');
    const text = existingPre.textContent;
    if (text) p.textContent = text;
    else p.innerHTML = '<br>';
    existingPre.replaceWith(p);
    caretAtStart(p);
    return;
  }

  const text = range.toString();
  const preEl = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.textContent = text; // 순수 텍스트로 보존(HTML 이스케이프는 브라우저가 처리)
  preEl.appendChild(codeEl);

  // 선택 내용을 제거하고, 최상위 블록 기준으로 코드 블록을 배치한다
  // (pre 가 p 등 인라인 문맥 안에 중첩되지 않도록).
  const block = topBlock(range.startContainer, root);
  range.deleteContents();

  if (block && isEmptyBlock(block)) {
    block.replaceWith(preEl); // 빈 문단이면 통째로 교체
  } else if (block) {
    block.after(preEl); // 그 외엔 블록 뒤에 삽입
  } else {
    range.insertNode(preEl); // 블록을 못 찾으면 삽입 지점에
  }

  // 코드 블록 뒤에 빈 문단을 두어 커서가 블록 밖으로 나올 수 있게 한다.
  if (!preEl.nextElementSibling) {
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    preEl.after(after);
  }
  placeCaretInCode(codeEl);
}

/**
 * 코드 블록 안에서 Enter 를 줄바꿈(<br>)으로 처리한다.
 *
 * 기본 contenteditable 동작은 `<pre>` 안에서 `<code>` 를 새 요소로 쪼개므로 가로챈다.
 * `insertLineBreak` 로 한 code 안에 줄바꿈을 넣어 여러 줄 코드를 지원한다.
 * @param {KeyboardEvent} e
 * @param {HTMLElement} root 편집 루트
 * @returns {boolean} 코드 블록 안에서 처리했으면 true
 */
export function handleCodeBlockEnter(e, root) {
  if (e.key !== 'Enter') return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  if (!closestTag(sel.getRangeAt(0).startContainer, 'PRE', root)) return false;
  e.preventDefault();
  // insertLineBreak(<br>) → 미지원 브라우저는 insertText('\n') 로 폴백.
  if (!document.execCommand('insertLineBreak')) {
    document.execCommand('insertText', false, '\n');
  }
  return true;
}
