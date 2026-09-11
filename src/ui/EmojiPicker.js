/**
 * 이모지 선택 팝오버.
 *
 * 이모지는 순수 텍스트(유니코드)라서 삽입 시 XSS 위험이 없다.
 * role="grid" + 방향키 이동으로 접근성을 확보한다.
 */
const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🙂', '🙃', '😉',
  '😊', '😇', '😍', '🥰', '😘', '😜', '🤪', '🤗', '🤔', '🤩',
  '😎', '🥳', '😏', '😢', '😭', '😤', '😠', '😡', '👍', '👎',
  '👏', '🙏', '💪', '🤝', '👌', '✌️', '🔥', '⭐', '✨', '🎉',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '💯', '✅', '❗', '❓',
];

export class EmojiPicker {
  /**
   * @param {object} opts
   * @param {string} opts.label 팝오버 접근성 라벨(i18n: emoji.label)
   * @param {string} [opts.locale] UI 언어 — body 직속 팝오버에 stamp
   * @param {(emoji: string) => void} opts.onSelect
   */
  constructor({ label, locale, onSelect }) {
    this.label = label;
    this.lang = locale;
    this.onSelect = onSelect;
    this._popover = null;
    this._onDocDown = this._onDocDown.bind(this);
  }

  open(anchor) {
    this.close();
    const pop = document.createElement('div');
    pop.className = 'we-emoji-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', this.label);
    if (this.lang) pop.setAttribute('lang', this.lang);

    const grid = document.createElement('div');
    grid.className = 'we-emoji-grid';
    grid.setAttribute('role', 'grid');

    EMOJIS.forEach((emoji, i) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'we-emoji-cell';
      cell.textContent = emoji;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', emoji);
      cell.tabIndex = i === 0 ? 0 : -1;
      cell.addEventListener('mousedown', (e) => e.preventDefault());
      cell.addEventListener('click', () => {
        this.onSelect(emoji);
        this.close();
      });
      cell.addEventListener('keydown', (e) => this._onGridKey(e, grid));
      grid.appendChild(cell);
    });

    pop.appendChild(grid);
    document.body.appendChild(pop);
    this._popover = pop;
    this._position(pop, anchor);

    setTimeout(() => document.addEventListener('mousedown', this._onDocDown, true), 0);
    grid.querySelector('.we-emoji-cell').focus();
  }

  _onGridKey(e, grid) {
    const cells = Array.from(grid.querySelectorAll('.we-emoji-cell'));
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
    const popRect = pop.getBoundingClientRect();
    if (popRect.right > window.innerWidth) {
      pop.style.left = `${window.innerWidth - popRect.width - 8 + window.scrollX}px`;
    }
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
