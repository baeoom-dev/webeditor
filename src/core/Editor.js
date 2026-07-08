/**
 * WYSIWYG 에디터 코어.
 *
 * contenteditable 영역을 관리하고 툴바/다이얼로그/붙여넣기/새니타이저를 연결한다.
 * 공개 API: getHTML(), getText(), setHTML(), focus(), destroy().
 */
import { SelectionManager } from './Selection.js';
import { commands } from './commands.js';
import { Toolbar } from '../ui/Toolbar.js';
import { icons } from '../ui/icons.js';
import { ColorPicker } from '../ui/ColorPicker.js';
import { EmojiPicker } from '../ui/EmojiPicker.js';
import { Dialog } from '../ui/Dialog.js';
import { openLinkDialog } from '../features/link.js';
import { openImageDialog, insertImageFile } from '../features/image.js';
import { openTableDialog } from '../features/table.js';
import { TableToolbar } from '../features/table-edit.js';
import { handlePaste } from '../clipboard/paste.js';
import { sanitizeHtml } from '../security/sanitizer.js';

const DEFAULT_FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px'];
const DEFAULT_FEATURES = [
  'bold', 'italic', 'underline', 'strikethrough', 'fontSize', 'color', 'backColor',
  'ul', 'ol', 'align', 'outdent', 'indent', 'link', 'image', 'table', 'emoji',
  'removeFormat', 'sourceView', 'undo', 'redo',
];

export class Editor {
  /**
   * @param {HTMLElement|string} target 마운트 대상(요소 또는 셀렉터)
   * @param {object} [config]
   * @param {(file: File) => Promise<string>} [config.uploadImage] 업로드 API
   * @param {boolean} [config.allowDataUrlFallback=true] 업로드 핸들러 없을 때 data URL 사용
   * @param {number} [config.maxImageSizeMB=10] 이미지 최대 크기
   * @param {string} [config.placeholder] 빈 상태 안내문
   * @param {string} [config.initialHTML] 초기 내용(새니타이즈됨)
   * @param {string} [config.ariaLabel] 편집 영역 접근성 라벨
   * @param {number} [config.minHeight=240] 최소 높이(px)
   * @param {string[]} [config.fontSizes] 폰트 크기 목록
   * @param {string[]} [config.features] 활성화할 기능 목록
   * @param {(editor: Editor) => void} [config.onChange] 변경 콜백
   */
  constructor(target, config = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error('Editor: 마운트 대상을 찾을 수 없습니다.');

    this.config = {
      allowDataUrlFallback: true,
      maxImageSizeMB: 10,
      placeholder: '내용을 입력하세요…',
      ariaLabel: '본문 편집기',
      minHeight: 240,
      fontSizes: DEFAULT_FONT_SIZES,
      features: DEFAULT_FEATURES,
      ...config,
    };

    this.container = document.createElement('div');
    this.container.className = 'we-editor';

    this.content = document.createElement('div');
    this.content.className = 'we-editor-content';
    this.content.setAttribute('contenteditable', 'true');
    this.content.setAttribute('role', 'textbox');
    this.content.setAttribute('aria-multiline', 'true');
    this.content.setAttribute('aria-label', this.config.ariaLabel);
    this.content.dataset.placeholder = this.config.placeholder;
    this.content.style.minHeight = `${this.config.minHeight}px`;
    this.content.id = `we-content-${Math.random().toString(36).slice(2, 8)}`;

    this.selection = new SelectionManager(this.content);
    this._pickers = [];
    this._sourceMode = false;

    // 소스보기용 textarea (평소엔 숨김).
    this.sourceArea = document.createElement('textarea');
    this.sourceArea.className = 'we-source-area';
    this.sourceArea.setAttribute('aria-label', 'HTML 소스 편집');
    this.sourceArea.setAttribute('spellcheck', 'false');
    this.sourceArea.hidden = true;
    this.sourceArea.style.minHeight = `${this.config.minHeight}px`;

    this._buildToolbar();
    this.container.append(this.toolbar.el, this.content, this.sourceArea);
    this.toolbar.el.setAttribute('aria-controls', this.content.id);

    root.appendChild(this.container);

    // 표 컨텍스트 툴바(표 기능이 켜져 있을 때만).
    if (this.config.features.includes('table')) {
      this._tableToolbar = new TableToolbar({
        root: this.content,
        onChange: () => this._emitChange(),
      });
    }

    if (this.config.initialHTML) this.setHTML(this.config.initialHTML);

    this._bindEvents();
  }

  /* ---------- 공개 API ---------- */

  /** 새니타이즈된 안전한 HTML 을 반환한다(소스보기 중이면 편집 중인 소스 기준). */
  getHTML() {
    const raw = this._sourceMode ? this.sourceArea.value : this.content.innerHTML;
    return sanitizeHtml(raw);
  }

  /** 순수 텍스트를 반환한다. */
  getText() {
    if (this._sourceMode) this._syncFromSource();
    return this.content.textContent || '';
  }

  /** HTML 을 새니타이즈해 내용으로 설정한다. */
  setHTML(html) {
    this.content.innerHTML = sanitizeHtml(html);
    if (this._sourceMode) this.sourceArea.value = this._formatHtml(this.content.innerHTML);
    this._emitChange();
  }

  focus() {
    if (this._sourceMode) this.sourceArea.focus();
    else this.content.focus();
  }

  /** 소스보기(HTML 직접 편집) 모드를 켜고 끈다. */
  toggleSource(force) {
    const next = typeof force === 'boolean' ? force : !this._sourceMode;
    if (next === this._sourceMode) return;
    this._sourceMode = next;

    const btn = this.toolbar.getButton('sourceView');
    if (next) {
      // WYSIWYG → 소스: 새니타이즈된 HTML 을 보기 좋게 넣는다.
      this.sourceArea.value = this._formatHtml(sanitizeHtml(this.content.innerHTML));
      this._tableToolbar?.hide();
      this.content.hidden = true;
      this.sourceArea.hidden = false;
      this.toolbar.setDisabled(true, ['sourceView']);
      if (this._fontSizeSelect) this._fontSizeSelect.disabled = true;
      if (btn) btn.setAttribute('aria-pressed', 'true');
      this.sourceArea.focus();
    } else {
      // 소스 → WYSIWYG: 반드시 새니타이저를 통과시킨다.
      this._syncFromSource();
      this.sourceArea.hidden = true;
      this.content.hidden = false;
      this.toolbar.setDisabled(false);
      if (this._fontSizeSelect) this._fontSizeSelect.disabled = false;
      if (btn) btn.setAttribute('aria-pressed', 'false');
      this.content.focus();
      this._emitChange();
    }
  }

  /** 소스 textarea 내용을 새니타이즈해 본문에 반영한다. */
  _syncFromSource() {
    this.content.innerHTML = sanitizeHtml(this.sourceArea.value);
  }

  /** 소스보기 가독성을 위한 최소한의 줄바꿈 포매팅. */
  _formatHtml(html) {
    return html
      .replace(/(<\/(?:p|div|table|thead|tbody|tfoot|tr|ul|ol|li|h[1-6]|blockquote|figure)>)/gi, '$1\n')
      .replace(/(<(?:table|thead|tbody|tfoot|tr)(?:\s[^>]*)?>)/gi, '$1\n')
      .replace(/(<br\s*\/?>)/gi, '$1\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** 편집기를 DOM 에서 제거하고 리스너를 해제한다. */
  destroy() {
    document.removeEventListener('selectionchange', this._onSelectionChange);
    for (const p of this._pickers) p.close();
    this._tableToolbar?.destroy();
    this.container.remove();
  }

  /* ---------- 내부 ---------- */

  _ctx() {
    return {
      selection: this.selection,
      config: this.config,
      onChange: () => this._emitChange(),
      insertImageFile: (file) => this._safeInsertImageFile(file),
    };
  }

  async _safeInsertImageFile(file) {
    try {
      await insertImageFile(file, this._ctx());
    } catch (err) {
      this._notify(err instanceof Error ? err.message : '이미지 삽입에 실패했습니다.');
    }
  }

  _emitChange() {
    this._updatePlaceholder();
    this._updateToolbar();
    if (typeof this.config.onChange === 'function') this.config.onChange(this);
  }

  /** 내용이 비었는지 판단해 data-empty 를 토글한다(플레이스홀더 표시용). */
  _updatePlaceholder() {
    const hasText = (this.content.textContent || '').trim().length > 0;
    const hasMedia = this.content.querySelector('img, table, hr, ul, ol') !== null;
    this.content.dataset.empty = hasText || hasMedia ? 'false' : 'true';
  }

  _updateToolbar() {
    this.toolbar.updateStates();
  }

  _run(fn) {
    this.selection.restore();
    fn();
    this._emitChange();
  }

  _buildToolbar() {
    const has = (f) => this.config.features.includes(f);
    const groups = [];

    const inline = [];
    if (has('bold')) inline.push(this._item('bold', icons.bold, '굵게 (Ctrl+B)', () => this._run(commands.bold), 'bold'));
    if (has('italic')) inline.push(this._item('italic', icons.italic, '기울임 (Ctrl+I)', () => this._run(commands.italic), 'italic'));
    if (has('underline')) inline.push(this._item('underline', icons.underline, '밑줄 (Ctrl+U)', () => this._run(commands.underline), 'underline'));
    if (has('strikethrough')) inline.push(this._item('strikethrough', icons.strike, '취소선', () => this._run(commands.strikethrough), 'strikeThrough'));
    if (inline.length) groups.push(inline);

    const fontGroup = [];
    if (has('color')) fontGroup.push(this._colorItem('color', icons.color, '글자 색', (c) => commands.foreColor(c)));
    if (has('backColor')) fontGroup.push(this._colorItem('backColor', icons.bgColor, '배경 색', (c) => commands.backColor(c)));
    if (fontGroup.length) groups.push(fontGroup);

    const listGroup = [];
    if (has('ul')) listGroup.push(this._item('ul', icons.ul, '글머리 기호 목록', () => this._run(commands.unorderedList)));
    if (has('ol')) listGroup.push(this._item('ol', icons.ol, '번호 매기기 목록', () => this._run(commands.orderedList)));
    if (has('outdent')) listGroup.push(this._item('outdent', icons.outdent, '내어쓰기', () => this._run(commands.outdent)));
    if (has('indent')) listGroup.push(this._item('indent', icons.indent, '들여쓰기', () => this._run(commands.indent)));
    if (listGroup.length) groups.push(listGroup);

    const alignGroup = [];
    if (has('align')) {
      alignGroup.push(this._item('alignLeft', icons.alignLeft, '왼쪽 정렬', () => this._run(commands.alignLeft)));
      alignGroup.push(this._item('alignCenter', icons.alignCenter, '가운데 정렬', () => this._run(commands.alignCenter)));
      alignGroup.push(this._item('alignRight', icons.alignRight, '오른쪽 정렬', () => this._run(commands.alignRight)));
      alignGroup.push(this._item('alignJustify', icons.alignJustify, '양쪽 정렬', () => this._run(commands.alignJustify)));
    }
    if (alignGroup.length) groups.push(alignGroup);

    const insertGroup = [];
    if (has('link')) insertGroup.push(this._item('link', icons.link, '링크', () => openLinkDialog(this._ctx())));
    if (has('image')) insertGroup.push(this._item('image', icons.image, '이미지', () => openImageDialog(this._ctx())));
    if (has('table')) insertGroup.push(this._item('table', icons.table, '표', () => openTableDialog(this._ctx())));
    if (has('emoji')) insertGroup.push(this._emojiItem());
    if (insertGroup.length) groups.push(insertGroup);

    const utilGroup = [];
    if (has('removeFormat')) utilGroup.push(this._item('removeFormat', icons.clear, '서식 지우기', () => this._run(commands.removeFormat)));
    if (has('sourceView')) {
      utilGroup.push({
        name: 'sourceView',
        icon: icons.code,
        label: 'HTML 소스 보기',
        toggle: true,
        action: () => this.toggleSource(),
      });
    }
    if (has('undo')) utilGroup.push(this._item('undo', icons.undo, '실행 취소 (Ctrl+Z)', () => this._run(commands.undo)));
    if (has('redo')) utilGroup.push(this._item('redo', icons.redo, '다시 실행 (Ctrl+Y)', () => this._run(commands.redo)));
    if (utilGroup.length) groups.push(utilGroup);

    this.toolbar = new Toolbar({ groups, label: '서식 도구 모음' });

    // 폰트 크기 선택기(네이티브 select — 기본 접근성 우수).
    if (has('fontSize')) {
      const wrap = this._buildFontSizeSelect();
      this._fontSizeSelect = wrap.querySelector('select');
      this.toolbar.el.insertBefore(wrap, this.toolbar.el.firstChild);
    }
  }

  _item(name, icon, label, action, queryName) {
    return { name, icon, label, action, toggle: !!queryName, queryName };
  }

  _colorItem(name, icon, label, apply) {
    const picker = new ColorPicker({
      label,
      onSelect: (color) => this._run(() => apply(color)),
    });
    this._pickers.push(picker);
    return {
      name,
      icon,
      label,
      action: (btn) => {
        this.selection.save();
        picker.open(btn);
      },
    };
  }

  _emojiItem() {
    const picker = new EmojiPicker({
      onSelect: (emoji) => {
        this.selection.restore();
        this.selection.insertNode(document.createTextNode(emoji));
        this._emitChange();
      },
    });
    this._pickers.push(picker);
    return {
      name: 'emoji',
      icon: icons.emoji,
      label: '이모지',
      action: (btn) => {
        this.selection.save();
        picker.open(btn);
      },
    };
  }

  _buildFontSizeSelect() {
    const wrap = document.createElement('label');
    wrap.className = 'we-fontsize';
    const sr = document.createElement('span');
    sr.className = 'we-visually-hidden';
    sr.textContent = '글자 크기';
    const select = document.createElement('select');
    select.className = 'we-fontsize-select';
    select.setAttribute('aria-label', '글자 크기');
    const placeholder = new Option('크기', '');
    placeholder.disabled = true;
    placeholder.selected = true;
    select.add(placeholder);
    for (const size of this.config.fontSizes) {
      select.add(new Option(size.replace('px', ''), size));
    }
    select.addEventListener('mousedown', () => this.selection.save());
    select.addEventListener('change', () => {
      const size = select.value;
      if (!size) return;
      this._run(() => commands.fontSize(this.content, size));
      select.selectedIndex = 0;
    });
    wrap.append(sr, select);
    return wrap;
  }

  _bindEvents() {
    this._onSelectionChange = () => {
      if (this.selection.getRange()) this._updateToolbar();
      if (this._tableToolbar && !this._sourceMode) this._tableToolbar.sync();
    };
    document.addEventListener('selectionchange', this._onSelectionChange);

    this.content.addEventListener('input', () => this._emitChange());

    this.content.addEventListener('paste', (e) => {
      handlePaste(e, this._ctx());
    });

    this.content.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        e.preventDefault();
        this.selection.save();
        // 드롭 지점으로 커서 이동 후 삽입.
        const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          this.selection.save();
        }
        this._safeInsertImageFile(file);
      }
    });

    // Enter 시 <div> 대신 <p> 로 문단을 나누도록 지정(마크업 일관성).
    try {
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* 미지원 브라우저 무시 */
    }
    this._updatePlaceholder();
  }

  _notify(message) {
    // 간단한 접근성 알림 다이얼로그.
    const dialog = new Dialog({
      title: '알림',
      render: (body, close) => {
        const p = document.createElement('p');
        p.textContent = message;
        const actions = document.createElement('div');
        actions.className = 'we-form-actions';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'we-btn we-btn-primary';
        ok.textContent = '확인';
        ok.addEventListener('click', close);
        actions.appendChild(ok);
        body.append(p, actions);
      },
    });
    dialog.open();
  }
}
