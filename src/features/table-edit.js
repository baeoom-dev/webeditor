/**
 * 표 컨텍스트 툴바.
 *
 * 편집 중 커서가 표 셀 안에 있으면 표 위에 떠오르는 도구 모음을 표시한다.
 * 행/열 추가·삭제, 셀 병합/분할, 셀 배경·글자색·정렬을 제공한다.
 *
 * 접근성: role="toolbar" + roving tabindex(방향키 이동), 각 버튼 aria-label.
 * 선택 유지: 버튼 mousedown 기본동작을 막아 편집기 셀 선택을 잃지 않는다.
 * 보안: 셀 서식은 인라인 style 로 적용되며, getHTML() 시 새니타이저 화이트리스트
 *       (background-color, color, text-align 등)를 통과한다.
 */
import { icons } from '../ui/icons.js';
import { ColorPicker } from '../ui/ColorPicker.js';
import {
  cellsInRect,
  closestCell,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  mergeCells,
  splitCell,
  deleteTable,
  styleCells,
} from './table-ops.js';

export class TableToolbar {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.root contenteditable 편집 영역
   * @param {() => void} opts.onChange 변경 콜백
   */
  constructor({ root, onChange }) {
    this.root = root;
    this.onChange = onChange;
    this.el = null;
    this._buttons = [];
    this._pickers = [];
    this._colorTargets = [];
    this._activeCell = null;
    this._activeTable = null;
    this._selectedCells = []; // 드래그로 선택한 셀들(병합/서식 대상)
    this._onReposition = () => {
      if (this.el && this._activeTable) this._position();
    };
    this._bindCellSelection();
  }

  /* ---------- 셀 드래그 선택 ---------- */

  /**
   * contenteditable 은 셀을 가로지르는 드래그를 텍스트 선택으로 처리한다.
   * 스프레드시트처럼 "셀 단위" 선택을 얻기 위해 mousedown→mousemove 로 사각형
   * 범위를 직접 계산해 하이라이트한다.
   */
  _bindCellSelection() {
    this._selAnchor = null;
    this._selecting = false;

    this._onDown = (e) => {
      if (e.button !== 0) return;
      this._clearCellSelection();
      const cell = closestCell(e.target, this.root);
      const table = cell && cell.closest('table');
      if (!cell || !table || !this.root.contains(table)) {
        this._selAnchor = null;
        return;
      }
      this._selAnchor = cell;
      this._selAnchorTable = table;
      this._selecting = true;
    };

    this._onMove = (e) => {
      if (!this._selecting || !this._selAnchor) return;
      const cell = closestCell(e.target, this.root);
      if (!cell || cell.closest('table') !== this._selAnchorTable) return;
      if (cell === this._selAnchor) {
        // 같은 셀 안이면 일반 텍스트 선택 허용.
        if (this._selectedCells.length) this._clearCellSelection();
        this._selAnchorTable.classList.remove('we-selecting');
        return;
      }
      const cells = cellsInRect(this._selAnchorTable, this._selAnchor, cell);
      if (cells.length > 1) {
        // 텍스트 선택을 끄고 셀 선택으로 전환.
        this._selAnchorTable.classList.add('we-selecting');
        window.getSelection()?.removeAllRanges();
        this._applyCellSelection(cells);
        this._activeCell = this._selAnchor;
        this._activeTable = this._selAnchorTable;
        this.show();
        this._position();
      }
    };

    this._onUp = () => {
      this._selecting = false;
      if (this._selAnchorTable) this._selAnchorTable.classList.remove('we-selecting');
    };

    // 키 입력 시 셀 선택 해제(일반 편집으로 복귀).
    this._onKeyClear = () => this._clearCellSelection();

    this.root.addEventListener('mousedown', this._onDown);
    this.root.addEventListener('mousemove', this._onMove);
    this.root.addEventListener('keydown', this._onKeyClear);
    document.addEventListener('mouseup', this._onUp);
  }

  _applyCellSelection(cells) {
    for (const c of this._selectedCells) c.classList.remove('we-cell-selected');
    this._selectedCells = cells;
    for (const c of cells) c.classList.add('we-cell-selected');
  }

  _clearCellSelection() {
    if (this._selectedCells.length) this._applyCellSelection([]);
  }

  /** 선택 변화 시 호출: 표 안이면 표시·위치, 아니면 숨김. */
  sync() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return this._maybeHide();
    const node = sel.getRangeAt(0).startContainer;
    if (!this.root.contains(node)) return this._maybeHide();
    const cell = closestCell(node, this.root);
    const table = cell && cell.closest('table');
    if (!cell || !table || !this.root.contains(table)) return this._maybeHide();

    this._activeCell = cell;
    this._activeTable = table;
    this.show();
    this._position();
  }

  /** 색상 팝오버·셀 다중선택 중이 아니면 숨긴다. */
  _maybeHide() {
    if (this._pickers.some((p) => p._popover)) return;
    if (this._selectedCells.length) return; // 셀 드래그 선택 유지
    this.hide();
  }

  show() {
    if (!this.el) this._build();
    if (!this.el.isConnected) document.body.appendChild(this.el);
    this.el.hidden = false;
    window.addEventListener('scroll', this._onReposition, true);
    window.addEventListener('resize', this._onReposition);
  }

  hide() {
    for (const p of this._pickers) p.close();
    this._clearCellSelection();
    if (this.el) this.el.hidden = true;
    this._activeCell = null;
    this._activeTable = null;
    window.removeEventListener('scroll', this._onReposition, true);
    window.removeEventListener('resize', this._onReposition);
  }

  destroy() {
    this.hide();
    this.root.removeEventListener('mousedown', this._onDown);
    this.root.removeEventListener('mousemove', this._onMove);
    this.root.removeEventListener('keydown', this._onKeyClear);
    document.removeEventListener('mouseup', this._onUp);
    if (this.el) this.el.remove();
    this.el = null;
  }

  /* ---------- 렌더 ---------- */

  _build() {
    const el = document.createElement('div');
    el.className = 'we-table-toolbar';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', '표 편집 도구');
    // 셀 선택 유지: 툴바 내부 mousedown 기본동작 차단.
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('input[type="color"]')) return;
      e.preventDefault();
    });

    const groups = [
      [
        ['rowInsertAbove', '위에 행 추가', () => this._op(insertRow, this._activeCell, 'above')],
        ['rowInsertBelow', '아래에 행 추가', () => this._op(insertRow, this._activeCell, 'below')],
        ['rowDelete', '행 삭제', () => this._op(deleteRow, this._activeCell)],
      ],
      [
        ['colInsertLeft', '왼쪽에 열 추가', () => this._op(insertColumn, this._activeCell, 'left')],
        ['colInsertRight', '오른쪽에 열 추가', () => this._op(insertColumn, this._activeCell, 'right')],
        ['colDelete', '열 삭제', () => this._op(deleteColumn, this._activeCell)],
      ],
      [
        ['mergeCells', '셀 병합', () => this._merge()],
        ['splitCell', '셀 분할', () => this._op(splitCell, this._activeCell)],
      ],
      [
        this._colorButton('bgColor', '셀 배경색', 'backgroundColor'),
        this._colorButton('color', '셀 글자색', 'color'),
        ['alignLeft', '왼쪽 정렬', () => this._align('left')],
        ['alignCenter', '가운데 정렬', () => this._align('center')],
        ['alignRight', '오른쪽 정렬', () => this._align('right')],
      ],
      [['trash', '표 삭제', () => this._deleteTable()]],
    ];

    this._buttons = [];
    groups.forEach((group, gi) => {
      if (gi > 0) {
        const sep = document.createElement('span');
        sep.className = 'we-table-toolbar-sep';
        sep.setAttribute('role', 'separator');
        el.appendChild(sep);
      }
      for (const [iconName, label, action] of group) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'we-table-tool';
        btn.setAttribute('aria-label', label);
        btn.title = label;
        btn.tabIndex = this._buttons.length === 0 ? 0 : -1;
        btn.innerHTML = icons[iconName];
        btn.addEventListener('click', () => action(btn));
        btn.addEventListener('keydown', (e) => this._onKey(e));
        el.appendChild(btn);
        this._buttons.push(btn);
      }
    });

    this.el = el;
  }

  /** 색상 버튼: [icon, label, action] 튜플을 만든다. */
  _colorButton(iconName, label, prop) {
    const picker = new ColorPicker({
      label,
      onSelect: (color) => {
        styleCells(this._colorTargets, prop, color);
        this._afterOp(this._activeCell);
      },
    });
    this._pickers.push(picker);
    return [
      iconName,
      label,
      (btn) => {
        this._colorTargets = this._targetCells();
        picker.open(btn);
      },
    ];
  }

  _onKey(e) {
    const i = this._buttons.indexOf(document.activeElement);
    if (i < 0) return;
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % this._buttons.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + this._buttons.length) % this._buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = this._buttons.length - 1;
    else return;
    e.preventDefault();
    this._buttons[i].tabIndex = -1;
    this._buttons[next].tabIndex = 0;
    this._buttons[next].focus();
  }

  /* ---------- 동작 ---------- */

  /** 서식/병합 대상 셀: 드래그로 선택한 셀들이 있으면 그것, 없으면 현재 셀. */
  _targetCells() {
    if (this._selectedCells.length) return this._selectedCells.slice();
    return this._activeCell ? [this._activeCell] : [];
  }

  _op(fn, ...args) {
    if (!this._activeTable || !this._activeCell) return;
    fn(this._activeTable, ...args);
    this._clearCellSelection(); // 구조 변경 → 이전 선택 하이라이트 무효
    this._afterOp(this._activeCell);
  }

  _merge() {
    const table = this._selAnchorTable || this._activeTable;
    const cells = this._selectedCells.slice();
    if (!table || cells.length < 2) return;
    const anchor = mergeCells(table, cells);
    this._clearCellSelection();
    this._afterOp(anchor || this._activeCell);
  }

  _align(value) {
    styleCells(this._targetCells(), 'textAlign', value);
    this._afterOp(this._activeCell);
  }

  _deleteTable() {
    if (!this._activeTable) return;
    deleteTable(this._activeTable);
    this.onChange();
    this.hide();
  }

  /** 동작 후: 변경 반영 + 커서 복원 + 위치 재계산. */
  _afterOp(focusCell) {
    this.onChange();
    if (!this._activeTable || !this.root.contains(this._activeTable)) return this.hide();
    const cell =
      focusCell && this.root.contains(focusCell)
        ? focusCell
        : this._activeTable.querySelector('td, th');
    if (cell) {
      placeCaret(cell);
      this._activeCell = cell;
    }
    this._position();
  }

  /* ---------- 위치 ---------- */

  _position() {
    if (!this.el || !this._activeTable) return;
    const table = this._activeTable.getBoundingClientRect();
    const bar = this.el.getBoundingClientRect();
    const gap = 8;
    // 기본은 표 위. 공간이 부족하면 표 아래.
    let top = table.top + window.scrollY - bar.height - gap;
    if (table.top - bar.height - gap < 0) top = table.bottom + window.scrollY + gap;
    let left = table.left + window.scrollX;
    const maxLeft = window.scrollX + window.innerWidth - bar.width - gap;
    if (left > maxLeft) left = Math.max(window.scrollX + gap, maxLeft);
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
  }
}

/** 요소 시작 지점에 접힌 커서를 둔다. */
function placeCaret(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
