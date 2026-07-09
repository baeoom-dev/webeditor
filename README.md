# @baeoom/webeditor

의존성 없는 **Vanilla JS WYSIWYG 웹 에디터**. 보안(XSS 방지)과 웹접근성을 최우선으로 설계했고,
엑셀/스프레드시트 표를 붙여넣을 때 색·테두리·굵기 등 서식을 최대한 보존한다.

```
런타임 의존성 0 · ESM + IIFE 듀얼 번들 · SVG 아이콘 · 화이트리스트 새니타이저 · WAI-ARIA
```

## 설치

```bash
pnpm add @baeoom/webeditor   # 또는 npm i / yarn add
```

## 사용법

### 모던 앱 (ESM — Next.js, Vite 등)

```js
import { createEditor } from '@baeoom/webeditor';
import '@baeoom/webeditor/css';

const editor = createEditor('#editor', {
  placeholder: '내용을 입력하세요…',
  uploadImage: async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const { url } = await res.json();
    return url; // 삽입할 이미지 URL 을 반환
  },
});

// 저장 시: 항상 새니타이즈된 안전한 HTML 을 반환
const html = editor.getHTML();
```

### 레거시 페이지 (IIFE — `<script>` 태그, Classic ASP 등)

```html
<link rel="stylesheet" href="/lib/webeditor/webeditor.css" />
<div id="editor"></div>

<script src="/lib/webeditor/webeditor.iife.min.js"></script>
<script>
  var editor = WebEditor.createEditor('#editor', { placeholder: '내용을 입력하세요…' });
</script>
```

npm 배포 시 CDN 으로도 사용 가능:
`https://cdn.jsdelivr.net/npm/@baeoom/webeditor/dist/webeditor.iife.min.js`

### 빌드 (개발자)

```bash
pnpm install
pnpm build     # dist/ 에 esm/iife/css/d.ts 생성
```

| 산출물 | 용도 | 크기 |
|---|---|---|
| `dist/webeditor.esm.js` | `import` (소비자 번들러가 최적화) | ~90 KB |
| `dist/webeditor.iife.min.js` | `<script>` 태그, 전역 `WebEditor` (압축) | ~57 KB |
| `dist/webeditor.css` | 스타일시트 (압축) | ~10 KB |
| `dist/webeditor-fonts.css` | 선택형 웹폰트 로더 (옵션) | ~1 KB |
| `dist/webeditor.d.ts` | TypeScript 타입 | — |

## 기능

| 그룹 | 기능 |
|---|---|
| 인라인 서식 | 굵게, 기울임, 밑줄, 취소선, 인라인 코드 |
| 글자 | 글꼴(Pretendard·본고딕·맑은 고딕·나눔고딕·본명조·나눔명조), 글자 크기, 글자 색, 배경 색 |
| 목록 | 글머리 기호(UL), 번호(OL), 들여쓰기, 내어쓰기 |
| 정렬 | 왼쪽 / 가운데 / 오른쪽 / 양쪽 |
| 삽입 | 링크, 이미지, 표, 코드 블록, 이모지 |
| 표 편집 | 행/열 추가·삭제, 셀 병합/분할, 셀 배경·글자색·정렬 |
| 보기 | 다크 모드 토글, HTML 소스 보기 |
| 유틸 | 서식 지우기, 실행 취소/다시 실행 |

### 이미지 첨부 (3가지 경로)

1. **붙여넣기** — 클립보드의 이미지를 붙여넣으면 자동 업로드 후 삽입
2. **URL 입력** — 이미지 주소를 직접 입력 (스킴 검증)
3. **파일 업로드** — 파일 선택 또는 드래그 앤 드롭

`uploadImage` 핸들러를 설정하면 그 API 로 업로드하고, 없으면 `data:` URL(base64)로 인라인한다
(`allowDataUrlFallback: false` 로 비활성화 가능).

삽입된 이미지를 **더블클릭**하면 대체 텍스트(`alt`)를 편집하는 다이얼로그가 열린다(웹접근성).

## 설정 옵션

| 옵션 | 기본값 | 설명 |
|---|---|---|
| `uploadImage` | — | `async (file) => url` 업로드 API |
| `allowDataUrlFallback` | `true` | 업로드 핸들러 없을 때 data URL 사용 |
| `maxImageSizeMB` | `10` | 이미지 최대 크기 |
| `placeholder` | `'내용을 입력하세요…'` | 빈 상태 안내문 |
| `initialHTML` | — | 초기 내용(새니타이즈됨) |
| `ariaLabel` | `'본문 편집기'` | 편집 영역 접근성 라벨 |
| `minHeight` | `240` | 최소 높이(px) |
| `theme` | `'auto'` | 테마: `'auto'`(시스템 추종) / `'light'` / `'dark'` |
| `fontSizes` | `['12px'…'32px']` | 글자 크기 목록 |
| `fontFamilies` | 기본 7종 | 글꼴 목록 `[{ label, value }]` — value 는 CSS font-family 스택 |
| `features` | 전체 | 활성화할 기능 이름 배열 |
| `onChange` | — | `(editor) => void` 변경 콜백 |

## 공개 API

```js
editor.getHTML();          // 새니타이즈된 안전한 HTML
editor.getText();          // 순수 텍스트
editor.setHTML(html);      // 새니타이즈 후 내용 설정
editor.setTheme('dark');   // 'auto' | 'light' | 'dark'
editor.getTheme();         // 현재 설정된 테마
editor.toggleSource();     // HTML 소스보기 토글
editor.focus();
editor.destroy();          // DOM 제거 + 리스너 해제
```

## 출력 페이지에 렌더링 (중요)

`getHTML()` 은 래퍼 없는 **순수 시맨틱 HTML**(`<pre><code>`, `<blockquote>`, `<table>` 등)을 반환한다.
에디터의 콘텐츠 스타일(코드 블록·인용구·표·인라인 코드 배경 등)은 **`.we-content` 클래스에 스코프**돼
있으므로, 저장한 HTML 을 실제 페이지에 렌더할 때 **같은 클래스로 감싸고 `webeditor.css` 를 포함**하면
에디터와 동일한 외형이 나온다 — 별도 스타일을 새로 작성할 필요가 없다.

```html
<link rel="stylesheet" href="/webeditor.css" />        <!-- 또는 @baeoom/webeditor/css -->

<article class="we-content">
  <!-- 서버에 저장해 둔 editor.getHTML() 결과 -->
</article>
```

- `.we-content` 는 **글자색(`color`)만** 테마에 맞춘다. **표면 배경은 컨테이너가 책임진다** —
  다크 카드로 렌더하려면 컨테이너에 `background: var(--we-bg)`(또는 원하는 배경)를 준다.
  그렇지 않으면 다크 글자색이 밝은 페이지 배경 위에 얹혀 안 보일 수 있다.
- 다크로 렌더하려면 컨테이너에 `data-theme="dark"` 를 주거나 `<html data-we-theme="dark">` 로 지정한다.
- 색상은 CSS 토큰(`--we-*`)이므로 토큰만 재정의해 브랜드 팔레트로 바꿀 수 있다.
- **문법 하이라이팅**은 별개 관심사다. 에디터는 순수 `<pre><code>` 만 저장하고, 출력 시 highlight.js/Prism
  으로 색칠하면 된다. 언어 클래스(`class="language-js"`)를 HTML 에 저장하려면 `schema.js` 의
  `ALLOWED_ATTRS` 에서 `code`/`pre` 의 `class`(또는 `data-language`)를 명시적으로 허용해야 한다
  (기본은 XSS 방지를 위해 `class` 미허용).

## 보안

`src/security/` 의 **DOM 기반 화이트리스트 새니타이저**가 신뢰할 수 없는 모든 입력
(붙여넣기, `setHTML`, `getHTML`)을 통과시킨다. 정규식이 아니라 브라우저 파서로
비활성(inert) `<template>` 문서를 만든 뒤 노드를 순회한다 — 새니타이즈 과정에서
이미지/스크립트가 로드되지 않는다.

차단하는 대표 벡터:

- `<script>`, `<iframe>`, `<object>`, `<svg onload>` 등 위험 태그 제거
- `onerror`, `onclick` 등 모든 `on*` 이벤트 핸들러 제거
- `javascript:` / `vbscript:` / `data:text/html` URL 차단 (제어문자 우회 포함)
- CSS `url()`, `expression()`, `@import` 값 폐기
- 외부 링크(`target="_blank"`)에 `rel="noopener noreferrer"` 강제

허용 정책은 `src/security/schema.js` 한 곳에서 관리한다.

## 엑셀 표 붙여넣기

엑셀/워드는 클립보드에 "표 스크린샷 이미지"와 "HTML 표"를 **함께** 넣는다.
이 에디터는 HTML 을 우선 사용하므로 표가 그림이 아닌 **편집 가능한 표**로 붙는다
(HTML 이 없는 순수 스크린샷 붙여넣기는 이미지로 처리).

인라인 스타일 중 **안전한 CSS 속성만**
(`color`, `background(-color)`, `border*`, `font-weight`, `text-align` 등) 화이트리스트로
보존한다. `align`/`bgcolor` 같은 레거시 속성은 안전한 `style` 로 자동 변환한다.

## 표

표 삽입 다이얼로그에서 행/열 수, **캡션(표 제목, 선택)**, 첫 행 헤더 여부를 지정한다.
캡션은 `<caption>` 으로 들어간다.

- **편집 모드**에서는 캡션이 화면에 보인다(작성·수정 가능).
- **출력(`.we-content`)** 에서는 캡션을 **화면에서 감추되 스크린리더로는 읽히게** 한다(sr-only,
  clip 기법 — `display:none`/`visibility:hidden` 을 쓰지 않아 접근성 트리에 유지). 표의 이름을
  보조기기에만 제공하고 시각적으로는 노출하지 않으려는 용도.

### 표 편집

편집 중 커서를 표 셀 안에 두면 표 위에 **컨텍스트 툴바**가 떠오른다.

| 그룹 | 도구 |
|---|---|
| 행 | 위에 행 추가 / 아래에 행 추가 / 행 삭제 |
| 열 | 왼쪽에 열 추가 / 오른쪽에 열 추가 / 열 삭제 |
| 셀 | 셀 병합 / 셀 분할 |
| 서식 | 셀 배경색 / 글자색 / 왼쪽·가운데·오른쪽 정렬 |
| 표 | 표 제목(캡션) 추가·수정·삭제 / 표 삭제 |

- **셀 선택**: 한 셀에서 다른 셀로 **드래그**하면 사각형 범위가 강조 표시된다.
  (contenteditable 기본 텍스트 선택 대신 셀 단위 선택을 직접 구현 — 병합/서식 대상이 된다.)
  여러 셀을 선택한 뒤 **셀 병합**을 누르거나 배경·글자색·정렬을 적용하면 일괄 적용된다.
- `colspan`/`rowspan` 은 가상 그리드로 매핑해 정확히 처리한다 — 병합 셀을 가로지르는
  행/열 삽입은 span 을 자동 확장하고, 병합 셀이 걸친 행 삭제는 아래로 밀어낸다.
- 셀 서식은 인라인 `style`(배경·글자색·정렬)로 적용되며 새니타이저 화이트리스트를 통과한다.
- 접근성: 컨텍스트 툴바도 `role="toolbar"` + roving tabindex(방향키 이동)를 따른다.

> 구조 편집은 DOM 을 직접 변형하므로 브라우저 네이티브 `Ctrl+Z`(execCommand undo)에는
> 기록되지 않는다(표 삽입과 동일). 표 삽입 자체와 마찬가지 제약이다.

## 글꼴

툴바의 **글꼴 선택기**로 선택 영역(또는 커서가 놓인 단어 이후 입력)의 서체를 바꾼다.
기본 목록(사용 빈도순): **기본(시스템)** · **Pretendard** · **본고딕(Noto Sans KR)** · **맑은 고딕** · **나눔고딕** · **본명조(Noto Serif KR)** · **나눔명조**.
적용 결과는 `span[style="font-family: …"]` 로 저장되며 새니타이저 화이트리스트를 통과한다.

웹폰트(본고딕·나눔고딕·본명조·나눔명조·Pretendard)는 옵션 스타일시트로 로드한다:

```js
import '@baeoom/webeditor/fonts';   // 또는 <link href=".../webeditor-fonts.css">
```

- **출력 페이지에도 같은 폰트 CSS 를 포함**해야 저장된 글꼴이 동일하게 보인다.
- 맑은 고딕은 Windows 시스템 폰트라 웹폰트로 배포하지 않는다(라이선스) — Windows 외
  환경에서는 스택 폴백(sans-serif)으로 표시된다.
- 웹폰트는 Google Fonts·jsDelivr CDN 에서 로드한다. 오프라인/사내망 환경이면 이 파일 대신
  자체 호스팅 `@font-face` 를 쓰고, `fontFamilies` 옵션으로 목록을 교체하면 된다.

```js
const editor = createEditor('#editor', {
  fontFamilies: [
    { label: '본고딕', value: '"Noto Sans KR", sans-serif' },
    { label: '명조', value: '"Noto Serif KR", serif' },
  ],
});
```

## 코드 블록 / 인라인 코드

- **인라인 코드**(`{ }` 버튼): 선택 영역을 `<code>` 로 감싼다. 이미 인라인 코드면 해제(토글).
- **코드 블록**(`[<>]` 버튼): 선택 텍스트를 `<pre><code>` 로 만든다. 선택이 없으면 빈 코드 블록을
  삽입하고 커서를 그 안에 둔다. 코드 블록 안에서 다시 누르면 일반 문단으로 되돌린다(토글).
- 코드 블록 안에서 **Enter 는 줄바꿈**(`<br>`)으로 처리되어 여러 줄 코드를 자연스럽게 입력할 수 있다
  (기본 contenteditable 이 `<code>` 를 쪼개는 동작을 가로챈다).
- 인라인 코드 배경은 라이트/다크 양쪽에서 또렷하도록 반투명 회색(`--we-code-bg` 토큰)을 쓴다.
  브랜드에 맞게 바꾸려면 이 토큰만 재정의하면 된다.
- 출력 페이지 스타일은 [출력 페이지에 렌더링](#출력-페이지에-렌더링-중요) 참고. 문법 하이라이팅은
  에디터가 아니라 출력 시 highlight.js/Prism 등으로 처리한다.

## 소스 보기

툴바의 `<>` 버튼으로 HTML 소스를 직접 편집할 수 있다.
소스 → 편집기로 복귀할 때 **반드시 새니타이저를 통과**하므로 소스 모드에서
스크립트/이벤트 핸들러를 넣어도 저장되지 않는다. `editor.toggleSource(force?)` API 로도 제어 가능.

## 테마 (라이트/다크)

기본은 `theme: 'auto'` 로 **시스템 설정(`prefers-color-scheme`)을 실시간 추종**한다.
툴바의 해/달 아이콘으로 라이트↔다크를 **수동 토글**하거나, 코드로 지정할 수 있다.

```js
const editor = createEditor('#editor', { theme: 'dark' }); // 'auto'|'light'|'dark'
editor.setTheme('light');
editor.getTheme();
```

- 테마는 편집 영역엔 `.we-editor[data-theme]`, 다이얼로그·팝오버·표 툴바(모두 `body` 직속)엔
  전역 `html[data-we-theme]` 로 stamp 된다 — 팝오버까지 일관된 테마가 적용된다.
- 색상은 CSS 토큰(`--we-*`)으로 정의되므로, 소비자가 토큰만 재정의해 브랜드 팔레트로 바꿀 수 있다.
- `'theme'` 를 `features` 에서 빼면 토글 버튼을 숨길 수 있다(그래도 `setTheme` API 는 동작).

> 참고: `html[data-we-theme]` 는 페이지 전역이므로, 한 페이지에 에디터가 여러 개면
> 팝오버 테마는 마지막으로 설정한 값을 공유한다(편집 영역 색은 인스턴스별로 유지).

## 웹접근성

- 툴바: `role="toolbar"` + roving tabindex(방향키 이동), 토글 버튼 `aria-pressed`
- 편집 영역: `role="textbox"`, `aria-multiline`, `aria-label`
- 다이얼로그: `role="dialog"` + `aria-modal`, 포커스 트랩, `Esc` 닫기, 포커스 복원
- 색상/이모지 팝오버: `role="grid"` + 방향키 이동
- 이미지 대체 텍스트(alt) 입력 지원
- `prefers-reduced-motion` 대응, 포커스 링 제공

## 브라우저 지원

최신 Chrome / Firefox / Safari. 서식 명령은 `document.execCommand` 기반이다
(deprecated 이나 모든 상용 브라우저에서 안정적으로 동작하며, 순수 vanilla 로
리치텍스트 엔진을 직접 구현하는 것보다 신뢰성이 높다).

## 디렉토리 구조

```
src/
├── core/          Editor, Selection, commands
├── ui/            Toolbar, Dialog, ColorPicker, EmojiPicker, icons
├── features/      link, image, table, table-edit(컨텍스트 툴바), table-ops(그리드 연산), code
├── clipboard/     paste (엑셀 표 보존)
├── security/      sanitizer, schema
└── styles/        editor.css
```

## 데모

```bash
pnpm dev   # python3 -m http.server 8791
# http://localhost:8791            — ESM(src 직접) 데모
# http://localhost:8791/demo/legacy.html — IIFE 번들 데모 (pnpm build 선행)
```

## 테스트 (개발자)

```bash
pnpm test:e2e   # Playwright E2E — 시스템 Chrome 사용, 데모 서버 자동 기동
```

- `tests/e2e/` 의 Playwright 스펙이 데모를 **실제 Chrome**(`channel: 'chrome'`, 브라우저 다운로드
  없음)에서 구동해 코드 블록·인라인 코드·테마 등을 검증한다.
- 실패/스크린샷 산출물은 `test-results/` 에 저장된다(gitignore).
