/**
 * 접근성 색상 선택 팝오버.
 *
 * - 스와치 그리드는 role="grid" 로 노출하고 방향키로 이동한다.
 * - 사용자 지정 색은 <input type="color"> 로 입력한다.
 * - 편집기 선택 영역을 잃지 않도록 mousedown 기본동작을 막는다.
 */
const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
];

export class ColorPicker {
  /**
   * @param {object} opts
   * @param {string} opts.label 접근성 라벨(예: "글자 색")
   * @param {(color: string) => void} opts.onSelect 선택 콜백
   */
  constructor({ label, onSelect }) {
    this.label = label;
    this.onSelect = onSelect;
    this._popover = null;
    this._anchor = null;
    this._onDocDown = this._onDocDown.bind(this);
  }

  /** 앵커 버튼 근처에 팝오버를 연다. */
  open(anchor) {
    this.close();
    this._anchor = anchor;
    const pop = document.createElement('div');
    pop.className = 'we-color-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', this.label);

    const grid = document.createElement('div');
    grid.className = 'we-color-grid';
    grid.setAttribute('role', 'grid');

    PALETTE.forEach((color, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'we-color-swatch';
      cell.style.backgroundColor = color;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', color);
      cell.tabIndex = i === 0 ? 0 : -1;
      cell.dataset.index = String(i);
      // 선택 유지: mousedown 기본동작(포커스 이동) 차단.
      cell.addEventListener('mousedown', (e) => e.preventDefault());
      cell.addEventListener('click', () => {
        this._select(color);
        this.close();
      });
      cell.addEventListener('keydown', (e) => this._onGridKey(e, grid));
      grid.appendChild(cell);
    });

    const custom = document.createElement('div');
    custom.className = 'we-color-custom';
    const input = document.createElement('input');
    input.type = 'color';
    input.setAttribute('aria-label', `${this.label} 사용자 지정`);
    input.addEventListener('mousedown', (e) => e.preventDefault());
    input.addEventListener('input', () => {
      this._select(input.value);
    });
    input.addEventListener('change', () => this.close());
    const customLabel = document.createElement('span');
    customLabel.textContent = '사용자 지정';
    custom.append(input, customLabel);

    pop.append(grid, custom);
    document.body.appendChild(pop);
    this._popover = pop;
    this._position(pop, anchor);

    setTimeout(() => document.addEventListener('mousedown', this._onDocDown, true), 0);
    grid.querySelector('.we-color-swatch').focus();
  }

  _onGridKey(e, grid) {
    const cells = Array.from(grid.querySelectorAll('.we-color-swatch'));
    const current = cells.indexOf(document.activeElement);
    const cols = 10;
    let next = current;
    switch (e.key) {
      case 'ArrowRight': next = Math.min(current + 1, cells.length - 1); break;
      case 'ArrowLeft': next = Math.max(current - 1, 0); break;
      case 'ArrowDown': next = Math.min(current + cols, cells.length - 1); break;
      case 'ArrowUp': next = Math.max(current - cols, 0); break;
      case 'Escape': this.close(); return;
      default: return;
    }
    e.preventDefault();
    cells[current].tabIndex = -1;
    cells[next].tabIndex = 0;
    cells[next].focus();
  }

  _position(pop, anchor) {
    const rect = anchor.getBoundingClientRect();
    pop.style.position = 'absolute';
    pop.style.top = `${rect.bottom + window.scrollY + 4}px`;
    pop.style.left = `${rect.left + window.scrollX}px`;
    // 화면 오른쪽 밖으로 나가면 보정.
    const popRect = pop.getBoundingClientRect();
    if (popRect.right > window.innerWidth) {
      pop.style.left = `${window.innerWidth - popRect.width - 8 + window.scrollX}px`;
    }
  }

  /** 선택 콜백 실행 + 앵커 버튼 아이콘의 색상 바(.we-color-bar)에 선택색을 반영한다. */
  _select(color) {
    this.onSelect(color);
    const bar = this._anchor && this._anchor.querySelector('.we-color-bar');
    if (bar) bar.style.stroke = color;
  }

  _onDocDown(e) {
    if (this._popover && !this._popover.contains(e.target)) this.close();
  }

  close() {
    if (!this._popover) return;
    document.removeEventListener('mousedown', this._onDocDown, true);
    this._popover.remove();
    this._popover = null;
  }
}
