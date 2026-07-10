/**
 * 접근성 툴바.
 *
 * WAI-ARIA Toolbar 패턴을 따른다:
 * - role="toolbar", 버튼은 role="button".
 * - roving tabindex: 툴바 전체가 Tab 한 번으로 진입하고, 내부는 좌우 방향키로 이동.
 * - 토글 버튼은 aria-pressed 로 현재 서식 상태를 노출.
 * - mousedown 기본동작을 막아 편집기 선택 영역을 잃지 않는다.
 */
import { queryState } from '../core/commands.js';

export class Toolbar {
  /**
   * @param {object} opts
   * @param {Array<Array<ToolbarItem>>} opts.groups 버튼 그룹(구분선으로 분리됨)
   * @param {string} opts.label 툴바 접근성 라벨
   */
  constructor({ groups, label }) {
    this.groups = groups;
    this.el = document.createElement('div');
    this.el.className = 'we-toolbar';
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', label || '서식 도구 모음');
    this.el.setAttribute('aria-controls', ''); // Editor 가 채운다
    this._buttons = [];
    this._build();
    this.el.addEventListener('keydown', (e) => this._onKeydown(e));
  }

  /** 그룹 사이 구분선. Editor 가 셀렉트 그룹을 끼워 넣을 때도 사용한다. */
  static createSeparator() {
    const sep = document.createElement('span');
    sep.className = 'we-toolbar-sep';
    sep.setAttribute('role', 'separator');
    sep.setAttribute('aria-orientation', 'vertical');
    return sep;
  }

  _build() {
    this.groups.forEach((group, gi) => {
      if (gi > 0) this.el.appendChild(Toolbar.createSeparator());
      // 그룹 래퍼: 폭이 부족할 때 그룹 중간이 아니라 그룹 경계에서 줄바꿈되게 한다.
      const wrap = document.createElement('span');
      wrap.className = 'we-toolbar-group';
      for (const item of group) {
        const btn = this._createButton(item);
        wrap.appendChild(btn);
        this._buttons.push(btn);
      }
      this.el.appendChild(wrap);
    });
    // roving tabindex: 첫 버튼만 Tab 가능.
    this._buttons.forEach((b, i) => (b.tabIndex = i === 0 ? 0 : -1));
  }

  _createButton(item) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'we-tool-btn';
    btn.innerHTML = item.icon;
    btn.setAttribute('aria-label', item.label);
    btn.setAttribute('title', item.label);
    btn.dataset.name = item.name;
    if (item.toggle) btn.setAttribute('aria-pressed', 'false');
    if (item.menu) {
      btn.classList.add('we-tool-btn--menu');
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
    }
    // 선택 영역 유지.
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', () => item.action(btn));
    btn._item = item;
    return btn;
  }

  /** 토글 버튼들의 aria-pressed 를 현재 서식 상태로 갱신한다. */
  updateStates() {
    for (const btn of this._buttons) {
      const item = btn._item;
      if (!item.toggle || !item.queryName) continue;
      btn.setAttribute('aria-pressed', queryState(item.queryName) ? 'true' : 'false');
    }
  }

  /**
   * 버튼 전체를 활성/비활성 전환한다(소스보기 모드용).
   * @param {boolean} disabled
   * @param {string[]} [exceptNames] 비활성화에서 제외할 버튼 이름
   */
  setDisabled(disabled, exceptNames = []) {
    for (const btn of this._buttons) {
      if (exceptNames.includes(btn.dataset.name)) continue;
      btn.disabled = disabled;
    }
  }

  /** 이름으로 버튼을 찾는다. */
  getButton(name) {
    return this._buttons.find((b) => b.dataset.name === name) || null;
  }

  _onKeydown(e) {
    const idx = this._buttons.indexOf(document.activeElement);
    if (idx === -1) return;
    let next = idx;
    switch (e.key) {
      case 'ArrowRight': next = (idx + 1) % this._buttons.length; break;
      case 'ArrowLeft': next = (idx - 1 + this._buttons.length) % this._buttons.length; break;
      case 'Home': next = 0; break;
      case 'End': next = this._buttons.length - 1; break;
      default: return;
    }
    e.preventDefault();
    this._buttons[idx].tabIndex = -1;
    this._buttons[next].tabIndex = 0;
    this._buttons[next].focus();
  }
}

/**
 * @typedef {object} ToolbarItem
 * @property {string} name 고유 식별자
 * @property {string} icon SVG 마크업
 * @property {string} label 접근성 라벨(툴팁)
 * @property {(btn: HTMLElement) => void} action 클릭 동작
 * @property {boolean} [toggle] 토글 버튼 여부
 * @property {string} [queryName] execCommand 상태 조회명(굵게 등)
 * @property {boolean} [menu] 드롭다운 메뉴 버튼 여부(aria-haspopup/aria-expanded)
 */
