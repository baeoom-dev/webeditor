# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

`@baeoom/webeditor` — 런타임 의존성 0의 **Vanilla JS WYSIWYG 에디터**. 세 가지가 설계의 최우선 축이다:

1. **보안(XSS 방지)** — 신뢰할 수 없는 모든 HTML은 화이트리스트 새니타이저를 통과한다.
2. **웹접근성(WAI-ARIA)** — 툴바 roving tabindex, 다이얼로그 포커스 트랩 등.
3. **엑셀/스프레드시트 표 서식 보존** — 붙여넣기 시 색·테두리·굵기를 유지한다.

빌드 산출물은 ESM(`import`)과 IIFE(`<script>` 전역 `WebEditor`) 듀얼 번들이다. IIFE는
Classic ASP 등 레거시 페이지에 스크립트 태그로 직접 넣을 수 있게 하기 위한 것.

## 명령어

```bash
pnpm install
pnpm build     # esbuild 로 dist/ 에 esm/iife/css/d.ts 생성 (scripts/build.mjs)
pnpm dev       # python3 -m http.server 8791 — index.html 데모를 브라우저로 확인
```

- **테스트 스위트 없음.** 검증은 `index.html`(ESM 데모)과 `demo/legacy.html`(IIFE 데모)을
  `pnpm dev` 로 띄워 브라우저에서 수동 확인한다. 새 기능은 최소한 이 두 데모에서 동작을 확인할 것.
- 배포 전 `prepublishOnly` 가 `build` 를 자동 실행한다. `dist/` 는 커밋되어 있으므로
  소스 변경 후에는 `pnpm build` 로 갱신해야 한다.

## 아키텍처

진입점 `src/index.js` 가 `createEditor()` / `Editor` / `sanitizeHtml` 을 공개한다.

```
src/
├── core/
│   ├── Editor.js       오케스트레이터 — contenteditable 관리 + 모든 모듈 배선, 공개 API
│   ├── commands.js     서식 명령 엔진 (execCommand 래퍼)
│   └── Selection.js    Range 저장/복원 (툴바 클릭 시 선택 유실 방지)
├── security/
│   ├── schema.js       ⭐ 화이트리스트 정책의 단일 출처 (태그/속성/CSS/URL 스킴)
│   └── sanitizer.js    DOM 기반 새니타이저 (정규식 아님)
├── features/           link.js · image.js · table.js — 각 삽입 다이얼로그
│                       table-edit.js — 표 컨텍스트 툴바(셀 안 커서 시 표시)
│                       table-ops.js — colspan/rowspan 인지 순수 DOM 그리드 연산
├── ui/                 Toolbar · Dialog · ColorPicker · EmojiPicker · icons(인라인 SVG)
├── clipboard/paste.js  붙여넣기 처리 (이미지/엑셀 HTML/순수 텍스트 분기)
└── styles/editor.css   전체 스타일 (클래스 프리픽스 `we-`)
```

### 반드시 지켜야 할 불변식 (INVARIANTS)

이 프로젝트의 보안은 아래 규칙에 의존한다. 위반하면 XSS 취약점이 생긴다.

1. **신뢰할 수 없는 HTML은 예외 없이 `sanitizeHtml()` 을 통과한다.**
   진입 경로 — 붙여넣기(`clipboard/paste.js`), `setHTML()`, `getHTML()`, 소스 보기에서 편집기로 복귀할 때.
   소스 모드에서 `<script>` 나 `on*` 핸들러를 넣어도 저장되지 않는 이유가 이 통과 지점 때문이다.

2. **새니타이저는 `<template>` 의 inert content 에서 동작한다.** 문서에 연결되지 않으므로
   새니타이즈 도중 이미지/스크립트 등 서브리소스가 로드되지 않는다. 이 격리를 깨지 말 것
   (예: `innerHTML` 을 살아있는 노드에 직접 할당해 검사하는 방식으로 바꾸지 말 것).

3. **허용 정책 변경은 오직 `src/security/schema.js` 에서만 한다.** 태그/속성/CSS 속성/URL
   스킴을 추가·제거할 때 다른 파일에 흩뿌리지 말 것 — 감사(audit) 가능성을 위해 한 곳에 모은다.

### 서식 명령이 `execCommand` 를 쓰는 이유

`commands.js` 는 deprecated 된 `document.execCommand` 를 의도적으로 사용한다. 부분 선택의
분할·병합을 브라우저가 정확히 처리해 주기 때문. 핵심은 `styleWithCSS(true)` 로 결과를
`span[style]` 형태로 강제한다는 점 — 이렇게 해야 출력이 새니타이저의 CSS 화이트리스트와
정합한다. 새 서식 명령을 추가할 때도 이 CSS 기반 출력 원칙을 따를 것.

### 엑셀 붙여넣기 흐름

엑셀/워드는 클립보드에 "표 이미지"와 "HTML 표"를 함께 넣는다. `paste.js` 는 HTML 을
우선 사용해 **편집 가능한 표**로 붙인다(HTML 이 없는 순수 스크린샷만 이미지로 처리).
`<style>` 블록의 클래스 규칙을 각 셀의 인라인 style 로 풀어 넣은 뒤, 안전한 CSS 속성만
schema 화이트리스트로 남긴다. `align`/`bgcolor` 같은 레거시 속성은 안전한 `style` 로 변환.

### 표 편집(table-ops / table-edit)

- `table-ops.js` 의 모든 연산은 표를 **가상 그리드**(`buildGrid` → `matrix[r][c]`)로 매핑해
  colspan/rowspan 을 정확히 처리한다. 행/열 삽입·삭제·병합·분할을 추가·수정할 때는
  DOM 을 직접 다루기 전에 반드시 그리드 좌표로 사고할 것.
- 이 연산들은 DOM 을 직접 변형하므로 **네이티브 execCommand undo 스택에 남지 않는다**
  (표 삽입도 동일). 그래서 `table-edit.js` 는 매 연산 후 `onChange()` 로 상태를 반영한다.
- 셀 서식은 인라인 `style`(background-color, color, text-align)로 적용되며, 이 속성들은
  이미 schema 화이트리스트에 있으므로 getHTML() 새니타이즈를 통과한다. 새 서식 속성을
  추가하려면 먼저 `schema.js` 의 `ALLOWED_STYLES` 에 등록해야 유지된다.

### 테마(라이트/다크)

- 색상은 전부 CSS 토큰(`--we-*`)이다. 다크 팔레트는 `editor.css` 의 단일 블록에 있고,
  두 셀렉터로 활성화된다: 편집 영역 `.we-editor[data-theme="dark"]`(인스턴스별),
  body 직속 팝오버/툴바 `html[data-we-theme="dark"]`(전역).
- **왜 전역 `html` 속성인가**: 다이얼로그·색상/이모지 팝오버·표 툴바는 모두 `document.body`
  직속으로 렌더돼 `.we-editor` 스코프 밖이다. 이들에 테마를 전달하려고 `Editor._applyTheme()`
  가 `document.documentElement` 에 `data-we-theme` 를 stamp 한다. 그래서 테마는 사실상
  페이지 전역이다(다중 인스턴스 시 팝오버 테마는 마지막 설정값 공유).
- 테마는 순수 CSS 미디어쿼리가 아니라 **JS 가 명시적으로 stamp** 한다. `theme: 'auto'` 이면
  `matchMedia('(prefers-color-scheme: dark)')` 를 해석해 stamp 하고 시스템 변경을 추종한다.
  새 body-직속 UI 를 추가하면 `editor.css` 의 토큰 스코프와 다크 블록 셀렉터 목록에 반드시 추가할 것.

## 코드 규칙

- 순수 Vanilla JS(ESM). 런타임 의존성을 추가하지 말 것 — devDependency 는 esbuild 뿐.
- `console.log` 대신 필요 시 `console.warn`/`console.error` 만.
- 아이콘은 인라인 SVG(`ui/icons.js`), `currentColor` + `aria-hidden="true"` 규약을 따른다.
- 새 UI에는 접근성 속성(role/aria-*, 키보드 조작)을 처음부터 넣는다 — 기존 Toolbar/Dialog 패턴 참고.
- 공개 API를 바꾸면 `types/webeditor.d.ts` 를 함께 갱신한다(빌드가 `dist/webeditor.d.ts` 로 복사).
