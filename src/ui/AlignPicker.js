/**
 * 접근성 정렬 드롭다운 메뉴.
 *
 * 정렬 버튼 4개(왼쪽/가운데/오른쪽/양쪽)를 툴바에 늘어놓는 대신
 * 하나의 메뉴 버튼으로 묶는다. WAI-ARIA Menu 패턴을 따른다:
 * - 팝오버는 role="menu", 항목은 role="menuitemradio" + aria-checked.
 * - 상하 방향키로 이동, Escape 로 닫기, 바깥 클릭으로 닫기.
 * - 편집기 선택 영역을 잃지 않도록 mousedown 기본동작을 막는다.
 */
import { icons } from './icons.js';

// labelKey 는 i18n 카탈로그(align.*) 키. 표 툴바의 정렬 버튼도 같은 키를 쓴다.
export const ALIGN_OPTIONS = [
  { name: 'alignLeft', labelKey: 'align.left', queryName: 'justifyLeft' },
  { name: 'alignCenter', labelKey: 'align.center', queryName: 'justifyCenter' },
  { name: 'alignRight', labelKey: 'align.right', queryName: 'justifyRight' },
  { name: 'alignJustify', labelKey: 'align.justify', queryName: 'justifyFull' },
];

export class AlignPicker {
  /**
   * @param {object} opts
   * @param {(key: string) => string} opts.t i18n 조회 함수
   * @param {string} [opts.locale] UI 언어 — body 직속 팝오버에 stamp
   * @param {(name: string) => void} opts.onSelect 선택 콜백(정렬 아이콘 이름 전달)
   * @param {() => string} opts.getCurrent 현재 정렬 아이콘 이름 반환(aria-checked 표시용)
   */
  constructor({ t, locale, onSelect, getCurrent }) {
    this.t = t;
    this.lang = locale;
    this.onSelect = onSelect;
    this.getCurrent = getCurrent;
    this._popover = null;
    this._anchor = null;
    this._onDocDown = this._onDocDown.bind(this);
  }

  /** 앵커 버튼 아래에 메뉴를 연다. */
  open(anchor) {
    this.close();
    this._anchor = anchor;
    const pop = document.createElement('div');
    pop.className = 'we-align-popover';
    pop.setAttribute('role', 'menu');
    pop.setAttribute('aria-label', this.t('align.label'));
    if (this.lang) pop.setAttribute('lang', this.lang);

    const current = this.getCurrent ? this.getCurrent() : '';
    const items = [];
    for (const opt of ALIGN_OPTIONS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'we-align-option';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', opt.name === current ? 'true' : 'false');
      // 아이콘(신뢰된 인라인 SVG)은 innerHTML, 문구는 textContent — 메시지 문자열을 innerHTML 에 넣지 않는다.
      item.innerHTML = icons[opt.name];
      const text = document.createElement('span');
      text.textContent = this.t(opt.labelKey);
      item.appendChild(text);
      item.tabIndex = -1;
      // 선택 유지: mousedown 기본동작(포커스 이동) 차단.
      item.addEventListener('mousedown', (e) => e.preventDefault());
      item.addEventListener('click', () => {
        this.onSelect(opt.name);
        this.close();
      });
      item.addEventListener('keydown', (e) => this._onMenuKey(e, items));
      items.push(item);
      pop.appendChild(item);
    }

    document.body.appendChild(pop);
    this._popover = pop;
    this._position(pop, anchor);
    anchor.setAttribute('aria-expanded', 'true');

    setTimeout(() => document.addEventListener('mousedown', this._onDocDown, true), 0);
    (items.find((i) => i.getAttribute('aria-checked') === 'true') || items[0]).focus();
  }

  _onMenuKey(e, items) {
    const current = items.indexOf(document.activeElement);
    let next = current;
    switch (e.key) {
      case 'ArrowDown': next = (current + 1) % items.length; break;
      case 'ArrowUp': next = (current - 1 + items.length) % items.length; break;
      case 'Home': next = 0; break;
      case 'End': next = items.length - 1; break;
      case 'Escape': this.close(); this._anchor && this._anchor.focus(); return;
      default: return;
    }
    e.preventDefault();
    items[next].focus();
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
    if (this._anchor) this._anchor.setAttribute('aria-expanded', 'false');
  }
}
