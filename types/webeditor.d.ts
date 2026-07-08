/**
 * @baeoom/webeditor 타입 정의
 */

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
  /** 빈 상태 안내문 (기본 '내용을 입력하세요…') */
  placeholder?: string;
  /** 초기 내용 HTML — 새니타이즈 후 설정된다 */
  initialHTML?: string;
  /** 편집 영역 접근성 라벨 (기본 '본문 편집기') */
  ariaLabel?: string;
  /** 편집 영역 최소 높이 px (기본 240) */
  minHeight?: number;
  /** 테마 (기본 'auto' — 시스템 설정 추종) */
  theme?: 'auto' | 'light' | 'dark';
  /** 글자 크기 목록 (기본 ['12px','14px','16px','18px','24px','32px']) */
  fontSizes?: string[];
  /**
   * 활성화할 기능 목록. 기본은 전체.
   * 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'fontSize'
   * | 'color' | 'backColor' | 'ul' | 'ol' | 'align' | 'outdent' | 'indent'
   * | 'link' | 'image' | 'table' | 'codeBlock' | 'emoji' | 'removeFormat'
   * | 'sourceView' | 'theme' | 'undo' | 'redo'
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

declare global {
  interface Window {
    /** IIFE 번들(webeditor.iife.min.js) 로드 시 노출되는 전역 */
    WebEditor: {
      Editor: typeof Editor;
      createEditor: typeof createEditor;
      sanitizeHtml: typeof sanitizeHtml;
    };
  }
}
