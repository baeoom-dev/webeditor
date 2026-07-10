/**
 * WYSIWYG 에디터 코어.
 *
 * contenteditable 영역을 관리하고 툴바/다이얼로그/붙여넣기/새니타이저를 연결한다.
 * 공개 API: getHTML(), getText(), setHTML(), focus(), destroy().
 */
import { SelectionManager } from './Selection.js';
import { commands, queryState } from './commands.js';
import { Toolbar } from '../ui/Toolbar.js';
import { icons } from '../ui/icons.js';
import { ColorPicker } from '../ui/ColorPicker.js';
import { AlignPicker, ALIGN_OPTIONS } from '../ui/AlignPicker.js';
import { EmojiPicker } from '../ui/EmojiPicker.js';
import { Dialog } from '../ui/Dialog.js';
import { openLinkDialog } from '../features/link.js';
import { openImageDialog, openImageAltDialog, insertImageFile } from '../features/image.js';
import { openTableDialog } from '../features/table.js';
import { TableToolbar } from '../features/table-edit.js';
import { toggleInlineCode, insertCodeBlock, handleCodeBlockEnter } from '../features/code.js';
import { handlePaste } from '../clipboard/paste.js';
import { sanitizeHtml } from '../security/sanitizer.js';

const DEFAULT_FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px'];
// 기본 글꼴 목록(사용 빈도순). '기본' 은 에디터 기본 스택(한글·영문 시스템 폰트)으로 되돌린다.
// 맑은 고딕은 Windows 시스템 폰트(웹폰트 배포 불가), 나머지는 webeditor-fonts.css 로 로드.
// 본고딕/본명조 = Noto Sans/Serif KR 의 공식 한국어 이름(Adobe: Source Han Sans/Serif).
const DEFAULT_FONT_FAMILIES = [
  {
    label: '기본',
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  },
  { label: 'Pretendard', value: 'Pretendard, "Pretendard Variable", sans-serif' },
  { label: '본고딕', value: '"Noto Sans KR", "Noto Sans", sans-serif' },
  { label: '맑은 고딕', value: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  { label: '나눔고딕', value: '"Nanum Gothic", "나눔고딕", sans-serif' },
  { label: '본명조', value: '"Noto Serif KR", serif' },
  { label: '나눔명조', value: '"Nanum Myeongjo", "나눔명조", serif' },
];
const DEFAULT_FEATURES = [
  'bold', 'italic', 'underline', 'strikethrough', 'code', 'fontFamily', 'fontSize', 'color', 'backColor',
  'ul', 'ol', 'align', 'outdent', 'indent', 'link', 'image', 'table', 'codeBlock', 'emoji',
  'removeFormat', 'sourceView', 'theme', 'undo', 'redo',
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
      theme: 'auto',
      fontSizes: DEFAULT_FONT_SIZES,
      fontFamilies: DEFAULT_FONT_FAMILIES,
      features: DEFAULT_FEATURES,
      ...config,
    };

    // 시스템 테마 감지(auto 모드에서 실시간 추종).
    this._mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    this._onSystemTheme = () => {
      if (this.config.theme === 'auto') this._applyTheme();
    };
    this._mql?.addEventListener?.('change', this._onSystemTheme);

    this.container = document.createElement('div');
    this.container.className = 'we-editor';

    this.content = document.createElement('div');
    // we-content: 콘텐츠 렌더링 스타일 클래스(출력 페이지에서도 동일 클래스로 재사용).
    this.content.className = 'we-editor-content we-content';
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

    this._applyTheme();

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
      if (this._fontFamilySelect) this._fontFamilySelect.disabled = true;
      if (btn) btn.setAttribute('aria-pressed', 'true');
      this.sourceArea.focus();
    } else {
      // 소스 → WYSIWYG: 반드시 새니타이저를 통과시킨다.
      this._syncFromSource();
      this.sourceArea.hidden = true;
      this.content.hidden = false;
      this.toolbar.setDisabled(false);
      if (this._fontSizeSelect) this._fontSizeSelect.disabled = false;
      if (this._fontFamilySelect) this._fontFamilySelect.disabled = false;
      if (btn) btn.setAttribute('aria-pressed', 'false');
      this.content.focus();
      this._emitChange();
    }
  }

  /** 테마를 설정한다: 'auto' | 'light' | 'dark'. */
  setTheme(theme) {
    this.config.theme = theme === 'light' || theme === 'dark' ? theme : 'auto';
    this._applyTheme();
  }

  /** 현재 설정된 테마('auto'|'light'|'dark')를 반환한다. */
  getTheme() {
    return this.config.theme;
  }

  /** 실제 표시 테마('light'|'dark'). auto 는 시스템 설정으로 해석한다. */
  _effectiveTheme() {
    const t = this.config.theme;
    if (t === 'light' || t === 'dark') return t;
    return this._mql?.matches ? 'dark' : 'light';
  }

  /** 현재 테마를 편집 영역(인스턴스별)과 body 직속 팝오버(전역)에 stamp 한다. */
  _applyTheme() {
    const effective = this._effectiveTheme();
    this.container.setAttribute('data-theme', effective);
    // 다이얼로그·팝오버·표 툴바는 body 직속이라 전역 html 속성으로 테마를 전달한다.
    document.documentElement.setAttribute('data-we-theme', effective);
    this._updateThemeButton(effective);
  }

  /** 테마 토글 버튼을 갱신한다. 아이콘은 '현재' 모드를 표시한다(해=라이트, 달=다크). */
  _updateThemeButton(effective) {
    const btn = this.toolbar.getButton('theme');
    if (!btn) return;
    const isDark = effective === 'dark';
    btn.innerHTML = isDark ? icons.moon : icons.sun;
    // 아이콘은 현재 모드, 라벨은 클릭 시 동작을 함께 안내(접근성).
    const label = isDark ? '다크 모드 (클릭 시 라이트로 전환)' : '라이트 모드 (클릭 시 다크로 전환)';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
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
    this._mql?.removeEventListener?.('change', this._onSystemTheme);
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
    this._syncAlignIcon();
  }

  _run(fn) {
    this.selection.restore();
    fn();
    this._emitChange();
  }

  _buildToolbar() {
    const has = (f) => this.config.features.includes(f);
    const groups = [];

    // 관례(Google Docs 등)에 따라 실행 취소/다시 실행을 맨 앞에 둔다.
    const historyGroup = [];
    if (has('undo')) historyGroup.push(this._item('undo', icons.undo, '실행 취소 (Ctrl+Z)', () => this._run(commands.undo)));
    if (has('redo')) historyGroup.push(this._item('redo', icons.redo, '다시 실행 (Ctrl+Y)', () => this._run(commands.redo)));
    if (historyGroup.length) groups.push(historyGroup);

    const inline = [];
    if (has('bold')) inline.push(this._item('bold', icons.bold, '굵게 (Ctrl+B)', () => this._run(commands.bold), 'bold'));
    if (has('italic')) inline.push(this._item('italic', icons.italic, '기울임 (Ctrl+I)', () => this._run(commands.italic), 'italic'));
    if (has('underline')) inline.push(this._item('underline', icons.underline, '밑줄 (Ctrl+U)', () => this._run(commands.underline), 'underline'));
    if (has('strikethrough')) inline.push(this._item('strikethrough', icons.strike, '취소선', () => this._run(commands.strikethrough), 'strikeThrough'));
    if (has('code')) inline.push(this._item('code', icons.codeInline, '인라인 코드', () => this._run(() => toggleInlineCode(this.content))));
    if (inline.length) groups.push(inline);

    const fontGroup = [];
    if (has('color')) fontGroup.push(this._colorItem('color', icons.color, '글자 색', (c) => commands.foreColor(c)));
    if (has('backColor')) fontGroup.push(this._colorItem('backColor', icons.bgColor, '배경 색', (c) => commands.backColor(c)));
    if (fontGroup.length) groups.push(fontGroup);

    // 문단 그룹: 정렬(드롭다운 1개) + 목록/들여쓰기.
    const paragraphGroup = [];
    if (has('align')) paragraphGroup.push(this._alignItem());
    if (has('ul')) paragraphGroup.push(this._item('ul', icons.ul, '글머리 기호 목록', () => this._run(commands.unorderedList)));
    if (has('ol')) paragraphGroup.push(this._item('ol', icons.ol, '번호 매기기 목록', () => this._run(commands.orderedList)));
    if (has('outdent')) paragraphGroup.push(this._item('outdent', icons.outdent, '내어쓰기', () => this._run(commands.outdent)));
    if (has('indent')) paragraphGroup.push(this._item('indent', icons.indent, '들여쓰기', () => this._run(commands.indent)));
    if (paragraphGroup.length) groups.push(paragraphGroup);

    const insertGroup = [];
    if (has('link')) insertGroup.push(this._item('link', icons.link, '링크', () => openLinkDialog(this._ctx())));
    if (has('image')) insertGroup.push(this._item('image', icons.image, '이미지', () => openImageDialog(this._ctx())));
    if (has('table')) insertGroup.push(this._item('table', icons.table, '표', () => openTableDialog(this._ctx())));
    if (has('codeBlock')) insertGroup.push(this._item('codeBlock', icons.codeBlock, '코드 블록', () => this._run(() => insertCodeBlock(this.content))));
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
    if (has('theme')) {
      utilGroup.push({
        name: 'theme',
        icon: icons.moon,
        label: '다크 모드로 전환',
        toggle: true,
        action: () => this.setTheme(this._effectiveTheme() === 'dark' ? 'light' : 'dark'),
      });
    }
    if (utilGroup.length) groups.push(utilGroup);

    this.toolbar = new Toolbar({ groups, label: '서식 도구 모음' });

    // 폰트 글꼴/크기 선택기(네이티브 select — 기본 접근성 우수).
    // 하나의 그룹으로 묶어 실행 취소/다시 실행 그룹 바로 뒤에 끼워 넣는다.
    const selectsGroup = document.createElement('span');
    selectsGroup.className = 'we-toolbar-group';
    if (has('fontFamily')) {
      const wrap = this._buildFontFamilySelect();
      this._fontFamilySelect = wrap.querySelector('select');
      selectsGroup.appendChild(wrap);
    }
    if (has('fontSize')) {
      const wrap = this._buildFontSizeSelect();
      this._fontSizeSelect = wrap.querySelector('select');
      selectsGroup.appendChild(wrap);
    }
    if (selectsGroup.childElementCount) {
      const historyBtn = this.toolbar.getButton('redo') || this.toolbar.getButton('undo');
      if (historyBtn) {
        historyBtn.parentElement.after(Toolbar.createSeparator(), selectsGroup);
      } else {
        this.toolbar.el.prepend(selectsGroup, Toolbar.createSeparator());
      }
    }
  }

  /** 정렬 드롭다운 항목. 버튼 아이콘이 현재 정렬 상태를 따라간다. */
  _alignItem() {
    this._alignState = 'alignLeft';
    const picker = new AlignPicker({
      getCurrent: () => this._alignState,
      onSelect: (name) => {
        this._run(() => commands[name]());
        this._syncAlignIcon();
      },
    });
    this._pickers.push(picker);
    return {
      name: 'align',
      icon: icons.alignLeft + icons.caret,
      label: '정렬',
      menu: true,
      action: (btn) => {
        this.selection.save();
        picker.open(btn);
      },
    };
  }

  /** 커서 위치의 정렬 상태를 조회해 정렬 버튼 아이콘에 반영한다. */
  _syncAlignIcon() {
    const btn = this.toolbar && this.toolbar.getButton('align');
    if (!btn) return;
    const current =
      ALIGN_OPTIONS.find((o) => o.name !== 'alignLeft' && queryState(o.queryName))?.name || 'alignLeft';
    if (current === this._alignState) return;
    this._alignState = current;
    btn.innerHTML = icons[current] + icons.caret;
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

  _buildFontFamilySelect() {
    const wrap = document.createElement('label');
    wrap.className = 'we-fontsize we-fontname';
    const sr = document.createElement('span');
    sr.className = 'we-visually-hidden';
    sr.textContent = '글꼴';
    const select = document.createElement('select');
    select.className = 'we-fontsize-select we-fontname-select';
    select.setAttribute('aria-label', '글꼴');
    const placeholder = new Option('글꼴', '');
    placeholder.disabled = true;
    placeholder.selected = true;
    select.add(placeholder);
    for (const family of this.config.fontFamilies) {
      const opt = new Option(family.label, family.value);
      opt.style.fontFamily = family.value; // 목록에서 미리보기
      select.add(opt);
    }
    select.addEventListener('mousedown', () => this.selection.save());
    select.addEventListener('change', () => {
      const family = select.value;
      if (!family) return;
      this._run(() => commands.fontName(family));
      select.selectedIndex = 0;
    });
    wrap.append(sr, select);
    return wrap;
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

    // 코드 블록 안의 Enter 는 <code> 를 쪼개지 않고 줄바꿈으로 처리.
    this.content.addEventListener('keydown', (e) => {
      if (handleCodeBlockEnter(e, this.content)) this._emitChange();
    });

    // 이미지 더블클릭 → 대체 텍스트(alt) 편집.
    this.content.addEventListener('dblclick', (e) => {
      const img = e.target.closest('img');
      if (img && this.content.contains(img)) {
        e.preventDefault();
        openImageAltDialog(img, this._ctx());
      }
    });

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
