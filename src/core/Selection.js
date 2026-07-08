/**
 * 선택 영역(Selection/Range) 헬퍼.
 *
 * contenteditable 편집기는 툴바 버튼을 누르는 순간 포커스가 이동하며 선택이 사라진다.
 * 이를 막기 위해 선택을 저장/복원하고, 편집기 경계 안쪽인지 검사한다.
 */
export class SelectionManager {
  /** @param {HTMLElement} root 편집 가능한 루트 요소 */
  constructor(root) {
    this.root = root;
    this._saved = null;
  }

  /** 현재 선택이 편집기 내부에 있으면 Range 를 반환한다. */
  getRange() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    return this._contains(range.commonAncestorContainer) ? range : null;
  }

  /** 현재 선택을 저장한다(툴바 상호작용 전에 호출). */
  save() {
    const range = this.getRange();
    this._saved = range ? range.cloneRange() : null;
    return this._saved;
  }

  /**
   * 선택을 복원하고 편집기에 포커스를 준다.
   *
   * 편집기 안에 살아있는 현재 선택이 있으면 그것을 우선한다 — 저장본(_saved)은
   * 다이얼로그 등에서 돌아올 때만 쓰는 폴백이다. 저장본을 무조건 덮어쓰면
   * 과거 다이얼로그 시점의 스테일 위치가 사용자의 현재 선택을 지워버린다.
   */
  restore() {
    const live = this.getRange();
    this.root.focus();
    const range = live || this._saved;
    if (!range) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  }

  /** 노드가 편집기 루트 안에 포함되는지 검사한다. */
  _contains(node) {
    return node === this.root || this.root.contains(node);
  }

  /** 저장된(또는 현재) Range 위치에 노드를 삽입하고 뒤에 커서를 둔다. */
  insertNode(node) {
    const range = this.getRange() || this._saved;
    if (!range) {
      this.root.appendChild(node);
      return;
    }
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** 선택 영역에서 가장 가까운 특정 태그 조상을 찾는다(없으면 null). */
  closest(tagName) {
    const range = this.getRange() || this._saved;
    if (!range) return null;
    let node = range.startContainer;
    const target = tagName.toUpperCase();
    while (node && node !== this.root) {
      if (node.nodeType === Node.ELEMENT_NODE && node.tagName === target) return node;
      node = node.parentNode;
    }
    return null;
  }
}
