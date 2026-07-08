/**
 * 접근성 모달 다이얼로그.
 *
 * - role="dialog", aria-modal="true", aria-labelledby 로 스크린리더 지원.
 * - 포커스 트랩(Tab/Shift+Tab 순환), Esc 로 닫기.
 * - 열기 전 포커스를 기억해 닫을 때 복원한다.
 */
import { icons } from './icons.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export class Dialog {
  /**
   * @param {object} opts
   * @param {string} opts.title 다이얼로그 제목
   * @param {(body: HTMLElement, close: () => void) => void} opts.render 본문 렌더러
   */
  constructor({ title, render }) {
    this.title = title;
    this.render = render;
    this._previousFocus = null;
    this._onKeydown = this._onKeydown.bind(this);
  }

  open() {
    this._previousFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'we-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'we-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');

    const titleId = `we-dialog-title-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', titleId);

    const header = document.createElement('div');
    header.className = 'we-dialog-header';
    const h = document.createElement('h2');
    h.id = titleId;
    h.className = 'we-dialog-title';
    h.textContent = this.title;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'we-dialog-close';
    closeBtn.setAttribute('aria-label', '닫기');
    closeBtn.innerHTML = icons.close;
    closeBtn.addEventListener('click', () => this.close());
    header.append(h, closeBtn);

    const body = document.createElement('div');
    body.className = 'we-dialog-body';

    dialog.append(header, body);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    this._overlay = overlay;
    this._dialog = dialog;

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.close();
    });
    document.addEventListener('keydown', this._onKeydown, true);

    this.render(body, () => this.close());

    // 첫 포커스 가능 요소로 이동.
    const first = dialog.querySelector(FOCUSABLE);
    (first || closeBtn).focus();
  }

  close() {
    if (!this._overlay) return;
    document.removeEventListener('keydown', this._onKeydown, true);
    this._overlay.remove();
    this._overlay = null;
    this._dialog = null;
    if (this._previousFocus && this._previousFocus.focus) {
      this._previousFocus.focus();
    }
  }

  _onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key !== 'Tab' || !this._dialog) return;

    const focusables = Array.from(this._dialog.querySelectorAll(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
