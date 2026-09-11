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
import { openFormulaDialog, handleFormulaDelete } from '../features/formula.js';
import { TableToolbar } from '../features/table-edit.js';
import { toggleInlineCode, insertCodeBlock, handleCodeBlockEnter } from '../features/code.js';
import { handlePaste } from '../clipboard/paste.js';
import { sanitizeHtml } from '../security/sanitizer.js';
import { createT } from '../i18n/createT.js';

const DEFAULT_FONT_SIZES = ['12px', '14px', '16px', '18px', '24px', '32px'];
// 기본 글꼴 목록(사용 빈도순). '기본' 은 에디터 기본 스택(한글·영문 시스템 폰트)으로 되돌린다.
// 맑은 고딕은 Windows 시스템 폰트(웹폰트 배포 불가), 나머지는 webeditor-fonts.css 로 로드.
// 본고딕/본명조 = Noto Sans/Serif KR 의 공식 한국어 이름(Adobe: Source Han Sans/Serif).
// labelKey 는 i18n 카탈로그(font.*)로 번역된다. 호스트가 넘긴 목록은 label 을 그대로 쓴다.
const DEFAULT_FONT_FAMILIES = [
  {
    labelKey: 'font.default',
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  },
  { label: 'Pretendard', value: 'Pretendard, "Pretendard Variable", sans-serif' },
  { labelKey: 'font.notoSansKr', value: '"Noto Sans KR", "Noto Sans", sans-serif' },
  { labelKey: 'font.malgunGothic', value: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  { labelKey: 'font.nanumGothic', value: '"Nanum Gothic", "나눔고딕", sans-serif' },
  { labelKey: 'font.notoSerifKr', value: '"Noto Serif KR", serif' },
  { labelKey: 'font.nanumMyeongjo', value: '"Nanum Myeongjo", "나눔명조", serif' },
];
const DEFAULT_FEATURES = [
  'bold', 'italic', 'underline', 'strikethrough', 'code', 'fontFamily', 'fontSize', 'color', 'backColor',
  'ul', 'ol', 'align', 'outdent', 'indent', 'link', 'image', 'table', 'codeBlock', 'formula', 'emoji',
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
   * @param {string} [config.locale='ko'] UI 언어('ko' | 'en' | 기타). 내장에 없으면 messages → ko 폴백
   * @param {object} [config.messages] UI 문구 부분 override 또는 새 언어 전체
   * @param {(editor: Editor) => void} [config.onChange] 변경 콜백
   */
  constructor(target, config = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    // 개발자용 예외(설정 이전 단계) — i18n 카탈로그 대상이 아니다.
    if (!root) throw new Error('Editor: 마운트 대상을 찾을 수 없습니다.');

    // UI 언어. 인스턴스 스코프 t() 를 만들어 _ctx() 와 UI 클래스로 전달한다.
    const i18n = createT({ locale: config.locale, messages: config.messages });
    this.t = i18n.t;
    this.locale = i18n.locale;

    this.config = {
      allowDataUrlFallback: true,
      maxImageSizeMB: 10,
      placeholder: this.t('editor.placeholder'),
      ariaLabel: this.t('editor.ariaLabel'),
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
    // UI 언어를 스크린리더에 알린다. 본문(content)에는 stamp 하지 않는다 — 본문 언어는 UI 와 다를 수 있다.
    this.container.setAttribute('lang', this.locale);

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
    this.sourceArea.setAttribute('aria-label', this.t('editor.sourceAriaLabel'));
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
        t: this.t,
        locale: this.locale,
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
    const label = isDark ? this.t('toolbar.themeDark') : this.t('toolbar.themeLight');
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
      t: this.t,
      locale: this.locale,
      onChange: () => this._emitChange(),
      insertImageFile: (file) => this._safeInsertImageFile(file),
    };
  }

  async _safeInsertImageFile(file) {
    try {
      await insertImageFile(file, this._ctx());
    } catch (err) {
      this._notify(err instanceof Error ? err.message : this.t('image.errorInsert'));
    }
  }

  _emitChange() {
    this._normalizeMath();
    this._updatePlaceholder();
    this._updateToolbar();
    if (typeof this.config.onChange === 'function') this.config.onChange(this);
  }

  /**
   * 편집 영역의 수식을 원자(atomic)로 유지한다: 커서가 MathML 내부로 들어가
   * 구조를 깨뜨리지 않게 contenteditable=false 를 stamp 한다.
   * 이 속성은 화이트리스트 밖이라 getHTML() 새니타이즈 때 제거된다(출력은 순수 MathML).
   */
  _normalizeMath() {
    for (const m of this.content.querySelectorAll('math:not([contenteditable])')) {
      m.setAttribute('contenteditable', 'false');
    }
  }

  /** 내용이 비었는지 판단해 data-empty 를 토글한다(플레이스홀더 표시용). */
  _updatePlaceholder() {
    const hasText = (this.content.textContent || '').trim().length > 0;
    const hasMedia = this.content.querySelector('img, table, hr, ul, ol, math') !== null;
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
    const t = this.t;
    const groups = [];

    // 관례(Google Docs 등)에 따라 실행 취소/다시 실행을 맨 앞에 둔다.
    const historyGroup = [];
    if (has('undo')) historyGroup.push(this._item('undo', icons.undo, t('toolbar.undo'), () => this._run(commands.undo)));
    if (has('redo')) historyGroup.push(this._item('redo', icons.redo, t('toolbar.redo'), () => this._run(commands.redo)));
    if (historyGroup.length) groups.push(historyGroup);

    const inline = [];
    if (has('bold')) inline.push(this._item('bold', icons.bold, t('toolbar.bold'), () => this._run(commands.bold), 'bold'));
    if (has('italic')) inline.push(this._item('italic', icons.italic, t('toolbar.italic'), () => this._run(commands.italic), 'italic'));
    if (has('underline')) inline.push(this._item('underline', icons.underline, t('toolbar.underline'), () => this._run(commands.underline), 'underline'));
    if (has('strikethrough')) inline.push(this._item('strikethrough', icons.strike, t('toolbar.strikethrough'), () => this._run(commands.strikethrough), 'strikeThrough'));
    if (has('code')) inline.push(this._item('code', icons.codeInline, t('toolbar.code'), () => this._run(() => toggleInlineCode(this.content))));
    if (inline.length) groups.push(inline);

    const fontGroup = [];
    if (has('color')) fontGroup.push(this._colorItem('color', icons.color, t('toolbar.color'), (c) => commands.foreColor(c)));
    if (has('backColor')) fontGroup.push(this._colorItem('backColor', icons.bgColor, t('toolbar.backColor'), (c) => commands.backColor(c)));
    if (fontGroup.length) groups.push(fontGroup);

    // 문단 그룹: 정렬(드롭다운 1개) + 목록/들여쓰기.
    const paragraphGroup = [];
    if (has('align')) paragraphGroup.push(this._alignItem());
    if (has('ul')) paragraphGroup.push(this._item('ul', icons.ul, t('toolbar.ul'), () => this._run(commands.unorderedList)));
    if (has('ol')) paragraphGroup.push(this._item('ol', icons.ol, t('toolbar.ol'), () => this._run(commands.orderedList)));
    if (has('outdent')) paragraphGroup.push(this._item('outdent', icons.outdent, t('toolbar.outdent'), () => this._run(commands.outdent)));
    if (has('indent')) paragraphGroup.push(this._item('indent', icons.indent, t('toolbar.indent'), () => this._run(commands.indent)));
    if (paragraphGroup.length) groups.push(paragraphGroup);

    const insertGroup = [];
    if (has('link')) insertGroup.push(this._item('link', icons.link, t('toolbar.link'), () => openLinkDialog(this._ctx())));
    if (has('image')) insertGroup.push(this._item('image', icons.image, t('toolbar.image'), () => openImageDialog(this._ctx())));
    if (has('table')) insertGroup.push(this._item('table', icons.table, t('toolbar.table'), () => openTableDialog(this._ctx())));
    if (has('codeBlock')) insertGroup.push(this._item('codeBlock', icons.codeBlock, t('toolbar.codeBlock'), () => this._run(() => insertCodeBlock(this.content))));
    if (has('formula')) insertGroup.push(this._item('formula', icons.formula, t('toolbar.formula'), () => openFormulaDialog(this._ctx())));
    if (has('emoji')) insertGroup.push(this._emojiItem());
    if (insertGroup.length) groups.push(insertGroup);

    const utilGroup = [];
    if (has('removeFormat')) utilGroup.push(this._item('removeFormat', icons.clear, t('toolbar.removeFormat'), () => this._run(commands.removeFormat)));
    if (has('sourceView')) {
      utilGroup.push({
        name: 'sourceView',
        icon: icons.code,
        label: t('toolbar.sourceView'),
        toggle: true,
        action: () => this.toggleSource(),
      });
    }
    if (has('theme')) {
      utilGroup.push({
        name: 'theme',
        icon: icons.moon,
        label: t('toolbar.theme'),
        toggle: true,
        action: () => this.setTheme(this._effectiveTheme() === 'dark' ? 'light' : 'dark'),
      });
    }
    if (utilGroup.length) groups.push(utilGroup);

    this.toolbar = new Toolbar({ groups, label: t('toolbar.label') });

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
      t: this.t,
      locale: this.locale,
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
      label: this.t('align.label'),
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
      t: this.t,
      locale: this.locale,
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
      label: this.t('emoji.label'),
      locale: this.locale,
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
      label: this.t('toolbar.emoji'),
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
    sr.textContent = this.t('font.family');
    const select = document.createElement('select');
    select.className = 'we-fontsize-select we-fontname-select';
    select.setAttribute('aria-label', this.t('font.family'));
    const placeholder = new Option(this.t('font.family'), '');
    placeholder.disabled = true;
    placeholder.selected = true;
    select.add(placeholder);
    for (const family of this.config.fontFamilies) {
      // labelKey 가 있으면 카탈로그로 번역(내장 목록), 없으면 호스트가 준 label 그대로.
      const label = family.labelKey ? this.t(family.labelKey) : family.label;
      const opt = new Option(label, family.value);
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
    sr.textContent = this.t('font.size');
    const select = document.createElement('select');
    select.className = 'we-fontsize-select';
    select.setAttribute('aria-label', this.t('font.size'));
    const placeholder = new Option(this.t('font.sizePlaceholder'), '');
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
    // Backspace/Delete 는 커서 인접 수식(contenteditable=false 원자)을 삭제한다.
    this.content.addEventListener('keydown', (e) => {
      if (handleCodeBlockEnter(e, this.content)) this._emitChange();
      else if (handleFormulaDelete(e, this.content)) this._emitChange();
    });

    // 수식 클릭 → 통째로 선택(하이라이트 + Backspace 삭제/입력 교체 가능).
    this.content.addEventListener('click', (e) => {
      const math = e.target.closest('math');
      if (math && this.content.contains(math)) {
        const range = document.createRange();
        range.selectNode(math);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });

    // 이미지 더블클릭 → 대체 텍스트(alt) 편집. 수식 더블클릭 → 수식 편집.
    this.content.addEventListener('dblclick', (e) => {
      const img = e.target.closest('img');
      if (img && this.content.contains(img)) {
        e.preventDefault();
        openImageAltDialog(img, this._ctx());
        return;
      }
      const math = e.target.closest('math');
      if (math && this.content.contains(math)) {
        e.preventDefault();
        openFormulaDialog(this._ctx(), math);
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
      title: this.t('dialog.noticeTitle'),
      closeLabel: this.t('dialog.close'),
      lang: this.locale,
      render: (body, close) => {
        const p = document.createElement('p');
        p.textContent = message;
        const actions = document.createElement('div');
        actions.className = 'we-form-actions';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'we-btn we-btn-primary';
        ok.textContent = this.t('dialog.ok');
        ok.addEventListener('click', close);
        actions.appendChild(ok);
        body.append(p, actions);
      },
    });
    dialog.open();
  }
}
