/**
 * @baeoom-dev/webeditor 타입 정의
 */

/** 내장 UI 언어 */
export type EditorLocale = 'ko' | 'en';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * UI 메시지 카탈로그 모양. 키는 점 구분 중첩(`table.preview`)이고 보간은 `{name}` 만 쓴다
 * (params 에 있는 이름만 치환, 나머지 `{…}` 는 그대로).
 */
export interface EditorMessages {
  editor: { placeholder: string; ariaLabel: string; sourceAriaLabel: string };
  toolbar: {
    label: string; undo: string; redo: string; bold: string; italic: string; underline: string;
    strikethrough: string; code: string; color: string; backColor: string; ul: string; ol: string;
    outdent: string; indent: string; link: string; image: string; table: string; codeBlock: string;
    formula: string; emoji: string; removeFormat: string; sourceView: string; theme: string;
    themeDark: string; themeLight: string;
  };
  align: { label: string; left: string; center: string; right: string; justify: string };
  font: {
    family: string; size: string; sizePlaceholder: string; default: string; notoSansKr: string;
    malgunGothic: string; nanumGothic: string; notoSerifKr: string; nanumMyeongjo: string;
  };
  color: { custom: string; /** `{label}` */ customFor: string };
  emoji: { label: string };
  dialog: { close: string; cancel: string; apply: string; insert: string; ok: string; noticeTitle: string };
  link: {
    insertTitle: string; editTitle: string; text: string; url: string; newTab: string; remove: string;
    errorEmpty: string; errorScheme: string;
  };
  image: {
    title: string; dropHint: string; chooseFile: string; orUrl: string; alt: string; altPlaceholder: string;
    insertUrl: string; altTitle: string; altLabelLong: string; errorEmpty: string; errorScheme: string;
    errorProcess: string; errorInsert: string; errorRead: string; errorUploadUrl: string;
    errorNoUploader: string; errorType: string; /** `{max}` */ errorSize: string;
  };
  table: {
    title: string; rows: string; cols: string; caption: string; captionPlaceholder: string;
    headerRow: string; /** `{rows}` `{cols}` */ preview: string;
  };
  tableEdit: {
    label: string; rowInsertAbove: string; rowInsertBelow: string; rowDelete: string; colInsertLeft: string;
    colInsertRight: string; colDelete: string; mergeCells: string; splitCell: string; bgColor: string;
    color: string; caption: string; delete: string; captionLabel: string;
  };
  formula: {
    insertTitle: string; editTitle: string; label: string; /** `{example}` */ placeholder: string;
    preview: string; block: string; remove: string; errorParse: string;
  };
  /** LaTeX 변환기 오류 코드별 문구 */
  latex: {
    empty: string; textNeedsBrace: string; textUnclosed: string; trailingBackslash: string;
    duplicateSup: string; duplicateSub: string; primeWithSup: string; missingArgument: string;
    expectedOpenBrace: string; unclosedBrace: string; unexpectedEnd: string; unmatchedCloseBrace: string;
    /** `{token}` */ noBase: string; unknownToken: string; sqrtUnclosedBracket: string;
    rightWithoutLeft: string; leftWithoutRight: string; /** `{name}` */ unsupportedCommand: string;
    /** `{which}` */ missingDelimiter: string; /** `{which}` */ invalidDelimiter: string;
  };
}

/** 글꼴 목록 항목. 내장 목록은 labelKey(font.*)로 번역되고, 호스트가 넘긴 항목은 label 을 그대로 쓴다. */
export interface FontFamilyOption {
  /** 선택기에 표시할 이름(labelKey 가 없을 때) */
  label?: string;
  /** i18n 카탈로그 키(예: 'font.default'). 있으면 label 보다 우선 */
  labelKey?: string;
  /** CSS font-family 스택 */
  value: string;
}

/** 에디터 생성 설정 */
export interface EditorConfig {
  /**
   * 이미지 업로드 API. 파일을 받아 업로드 후 삽입할 이미지 URL 을 반환한다.
   * 미설정 시 data URL(base64) 로 인라인된다(allowDataUrlFallback 참고).
   */
  uploadImage?: (file: File) => Promise<string>;
  /** uploadImage 미설정 시 data URL 폴백 허용 여부 (기본 true) */
  allowDataUrlFallback?: boolean;
  /** 이미지 최대 크기 MB (기본 10) */
  maxImageSizeMB?: number;
  /** 빈 상태 안내문 (기본: 카탈로그 editor.placeholder — ko '내용을 입력하세요…') */
  placeholder?: string;
  /** 초기 내용 HTML — 새니타이즈 후 설정된다 */
  initialHTML?: string;
  /** 편집 영역 접근성 라벨 (기본: 카탈로그 editor.ariaLabel — ko '본문 편집기') */
  ariaLabel?: string;
  /**
   * UI 언어 (기본 'ko'). 내장은 ko·en. 그 외 값은 messages → ko 순으로 폴백하며,
   * 컨테이너와 다이얼로그·팝오버에 `lang` 으로 stamp 된다. 생성자 옵션이다(런타임 전환 없음).
   */
  locale?: EditorLocale | (string & {});
  /**
   * UI 문구 부분 override 또는 새 언어 전체. 내장 카탈로그 위에 깊은 병합(우선순위 최상).
   * 문구는 textContent 로만 삽입되므로 마크업을 넣어도 렌더되지 않는다.
   */
  messages?: DeepPartial<EditorMessages>;
  /** 편집 영역 최소 높이 px (기본 240) */
  minHeight?: number;
  /** 테마 (기본 'auto' — 시스템 설정 추종) */
  theme?: 'auto' | 'light' | 'dark';
  /** 글자 크기 목록 (기본 ['12px','14px','16px','18px','24px','32px']) */
  fontSizes?: string[];
  /**
   * 글꼴 목록. label 은 선택기에 표시되고 value 는 CSS font-family 스택으로 적용된다.
   * 기본(사용 빈도순): 기본(시스템), Pretendard, 본고딕, 맑은 고딕, 나눔고딕, 본명조, 나눔명조.
   * 웹폰트는 '@baeoom-dev/webeditor/fonts' (webeditor-fonts.css) 로 로드한다.
   */
  fontFamilies?: FontFamilyOption[];
  /**
   * 활성화할 기능 목록. 기본은 전체.
   * 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'fontFamily'
   * | 'fontSize' | 'color' | 'backColor' | 'ul' | 'ol' | 'align' | 'outdent'
   * | 'indent' | 'link' | 'image' | 'table' | 'codeBlock' | 'formula' | 'emoji'
   * | 'removeFormat' | 'sourceView' | 'theme' | 'undo' | 'redo'
   */
  features?: string[];
  /** 내용 변경 콜백 */
  onChange?: (editor: Editor) => void;
}

/** WYSIWYG 에디터 인스턴스 */
export class Editor {
  constructor(target: HTMLElement | string, config?: EditorConfig);

  /** 에디터 컨테이너 요소 */
  readonly container: HTMLDivElement;
  /** contenteditable 편집 영역 */
  readonly content: HTMLDivElement;
  /** 해석된 UI 언어(config.locale, 기본 'ko') */
  readonly locale: string;
  /** 이 인스턴스의 메시지 조회 함수(호스트 override → 내장 locale → ko 순) */
  readonly t: (key: string, params?: Record<string, string | number>) => string;

  /** 새니타이즈된 안전한 HTML 을 반환한다(소스보기 중이면 편집 중인 소스 기준) */
  getHTML(): string;
  /** 순수 텍스트를 반환한다 */
  getText(): string;
  /** HTML 을 새니타이즈해 내용으로 설정한다 */
  setHTML(html: string): void;
  /** 편집 영역에 포커스를 준다 */
  focus(): void;
  /** HTML 소스보기 모드를 켜고 끈다 */
  toggleSource(force?: boolean): void;
  /** 테마를 설정한다: 'auto' | 'light' | 'dark' */
  setTheme(theme: 'auto' | 'light' | 'dark'): void;
  /** 현재 설정된 테마를 반환한다 */
  getTheme(): 'auto' | 'light' | 'dark';
  /** 에디터를 DOM 에서 제거하고 리스너를 해제한다 */
  destroy(): void;
}

/** 편집기 인스턴스를 생성한다 */
export function createEditor(target: HTMLElement | string, config?: EditorConfig): Editor;

/**
 * HTML 문자열을 화이트리스트 새니타이저로 정리한다.
 * 서버 전송 전 이중 방어나 외부 HTML 정리에 단독 사용 가능.
 */
export function sanitizeHtml(html: string): string;

/** 내장 UI 메시지 카탈로그(읽기 전용). 새 언어의 출발점으로 복사하거나 override 키를 참고할 때 쓴다. */
export const messages: Readonly<Record<EditorLocale, EditorMessages>>;

declare global {
  interface Window {
    /** IIFE 번들(webeditor.iife.min.js) 로드 시 노출되는 전역 */
    WebEditor: {
      Editor: typeof Editor;
      createEditor: typeof createEditor;
      sanitizeHtml: typeof sanitizeHtml;
      messages: typeof messages;
    };
  }
}
