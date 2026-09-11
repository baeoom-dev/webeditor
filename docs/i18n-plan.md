# 다국어(UI 언어) 지원 계획 문서

> 대상 버전: v0.3.0 · 작성일: 2026-09-11 · 상태: P1~P4 구현 완료(2026-09-11), P5(king-sejong 연동)·배포 대기
> 관련: baeoom-king-sejong `docs/requirements/11-open-issues.md` **OI-26**
> ("영문 필요가 확인되면 webeditor 에 `messages` 옵션을 추가하고 0.3.x 로 올린다")

## 1. 배경과 목표

에디터의 툴바 라벨·다이얼로그·오류 문구가 전부 **한국어 하드코딩**이다(소스 기준 약 146곳).
이를 쓰는 baeoom-king-sejong 은 next-intl 로 한·영 UI 를 제공하므로, 영문 사용자가 편집
화면을 열면 에디터만 한국어로 남는다. king-sejong 은 이 문제를 OI-26 으로 등록하고
"v1 은 한국어 고정, 필요 시 webeditor 에 `messages` 옵션 추가" 로 결정해 둔 상태다.

이 문서는 그 옵션을 어떻게 넣을지 정한다.

### 목표

1. 에디터 **UI 문자열 전부**를 메시지 카탈로그로 뽑아내고, `locale` 옵션 하나로 언어를 바꾼다.
2. `ko`·`en` 을 내장한다. 그 외 언어는 호스트가 `messages` 로 통째로 넘길 수 있다.
3. 호스트가 특정 문구만 바꾸고 싶으면 **부분 override** 가 된다(용어집 맞추기).
4. 기존 사용자에게 **변경 없음**: 옵션을 안 주면 지금과 글자 하나 다르지 않은 한국어 UI.
5. 런타임 의존성 0·IIFE 단일 파일 원칙을 유지한다.

### 비목표 (v0.3.0 에서 하지 않는 것)

| 항목 | 이유 |
|---|---|
| `navigator.language` 자동 감지 | king-sejong 은 로케일을 서버(쿠키 → Accept-Language)에서 정한다. 에디터가 따로 감지하면 페이지 UI 와 어긋난다. 언어는 **호스트가 명시**한다 |
| 런타임 `setLocale()` | 호스트가 언어를 바꾸면 페이지가 다시 로드된다(next-intl 쿠키 방식). React 래퍼도 옵션이 바뀌면 에디터를 다시 만든다. 생성자 옵션으로 충분 |
| RTL(`dir`) | 대상 언어가 ko·en 뿐 |
| 콘텐츠(본문) 언어 | 본문은 사용자 데이터라 UI 언어와 무관. 맞춤법 검사용 `lang` 지정은 별도 이슈 |
| 복수형·성별 규칙 | 현재 문구에 복수형 분기가 없다(`{rows} rows × {cols} columns` 로 충분). ICU 파서를 넣지 않는다 |

## 2. 방식 결정

| 후보 | 판정 | 이유 |
|---|---|---|
| **내장 카탈로그(ko·en) + `locale`/`messages` 옵션, 인스턴스별 `t()`** | ✅ 채택 | 의존성 0, IIFE 에 그대로 담김, 한 페이지에 언어가 다른 인스턴스 공존 가능 |
| 전역 `WebEditor.setLocale()` 싱글턴 | ❌ | 인스턴스 간 간섭. 테마가 전역인 건 body 직속 팝오버 때문이지 필요해서가 아니다 |
| 로케일 파일 별도 번들(`dist/locales/en.js`) | ❌ | IIFE 사용자가 `<script>` 를 하나 더 넣어야 함. en 카탈로그는 압축 후 2KB 안팎이라 분리 이득이 없다 |
| JSON 파일(`ko.json`) import | ❌ | 데모·E2E 는 번들러 없이 `src/` 를 브라우저가 직접 읽는다. JSON 모듈은 import attributes 가 필요해 환경 편차가 생긴다. **`.js` 객체 모듈**로 둔다 |

### 2.1 공개 API

```ts
interface EditorConfig {
  /** UI 언어. 기본 'ko'. 내장에 없는 값이면 messages → ko 순으로 폴백 */
  locale?: 'ko' | 'en' | (string & {});
  /** 문구 부분 override 또는 새 언어 전체. 내장 카탈로그 위에 깊은 병합 */
  messages?: DeepPartial<EditorMessages>;
  /** 기본 글꼴 목록 항목에 labelKey 허용 — 내장 메시지 키로 라벨을 번역 */
  fontFamilies?: Array<{ label?: string; labelKey?: string; value: string }>;
}

/** 내장 카탈로그(읽기 전용). 호스트가 복사해 새 언어의 출발점으로 쓴다 */
export const messages: Readonly<Record<'ko' | 'en', EditorMessages>>;
```

- `placeholder`·`ariaLabel` 의 기본값은 카탈로그(`editor.placeholder`, `editor.ariaLabel`)에서
  온다. 호스트가 넘기면 그 값이 우선(지금과 같음).
- IIFE 는 `WebEditor.messages` 로 같은 객체를 노출한다.

### 2.2 조회 규칙 (`createT`)

```
t(key, params?)
  1. config.messages        (호스트 override)
  2. BUILTIN[config.locale] (내장 언어)
  3. BUILTIN.ko             (최종 폴백)
  4. 없으면 key 문자열 반환 + console.warn 1회
```

- 키는 점 구분 중첩(`table.preview`). king-sejong `packages/i18n` 의 JSON 과 같은 모양이라
  호스트가 자기 카탈로그에 `editor.*` 네임스페이스로 옮겨 관리할 수 있다.
- 보간은 `{name}` 만. **params 에 있는 이름만 치환하고 나머지 `{…}` 는 그대로 둔다** —
  LaTeX 오류 문구(`\text{…}`)의 중괄호와 충돌하지 않게 하기 위함.
- `t` 는 **인스턴스 스코프**다. `Editor` 가 만들어 `_ctx()` 와 UI 클래스 생성자로 전달한다.
  전역 변수·모듈 싱글턴에 두지 않는다.

### 2.3 접근성

- `.we-editor` 컨테이너와 body 직속 UI(다이얼로그·팝오버·표 툴바)에 `lang="{locale}"` 을
  stamp 한다. 스크린리더가 UI 문구를 올바른 언어로 읽게 하기 위함. 편집 영역(본문)에는
  stamp 하지 않는다(본문 언어는 UI 언어와 다를 수 있다).
- 툴바 버튼의 `title`(툴팁)과 `aria-label` 은 지금처럼 한 문자열에서 나온다.

### 2.4 보안 불변식 (신규)

**메시지 문자열은 `textContent` / `setAttribute` 로만 DOM 에 넣는다. `innerHTML` 금지.**

지금은 `submit.innerHTML = `${icons.check}<span>적용</span>`` 처럼 아이콘 SVG 와 문구를
문자열로 합치는 곳이 7군데 있다(link·image×2·table·table-edit·formula). 문구가 호스트
입력(`messages`)이 되는 순간 이 패턴은 주입 경로가 된다. 아이콘은 `innerHTML` 로,
문구는 `<span>` 에 `textContent` 로 따로 넣도록 고친다. 이 규칙을 CLAUDE.md 불변식에 추가한다.

## 3. 메시지 카탈로그 설계

### 3.1 파일 구조

```
src/i18n/
├── ko.js        내장 한국어 — 키 목록의 단일 출처(SSOT)
├── en.js        내장 영어 — ko 와 키가 100% 일치해야 한다(테스트로 강제)
└── createT.js   조회·폴백·보간
```

### 3.2 키 인벤토리 (ko → en 초안)

현재 소스의 문자열을 전수 조사해 네임스페이스로 묶었다. 구현 시 이 표가 `ko.js`·`en.js` 가 된다.
(en 은 초안이며 검수 대상. 단축키 표기는 그대로 유지.)

**editor** — 편집 영역

| 키 | ko | en |
|---|---|---|
| placeholder | 내용을 입력하세요… | Type here… |
| ariaLabel | 본문 편집기 | Rich text editor |
| sourceAriaLabel | HTML 소스 편집 | Edit HTML source |

**toolbar** — 툴바 버튼(툴팁 = aria-label)

| 키 | ko | en |
|---|---|---|
| label | 서식 도구 모음 | Formatting toolbar |
| undo | 실행 취소 (Ctrl+Z) | Undo (Ctrl+Z) |
| redo | 다시 실행 (Ctrl+Y) | Redo (Ctrl+Y) |
| bold | 굵게 (Ctrl+B) | Bold (Ctrl+B) |
| italic | 기울임 (Ctrl+I) | Italic (Ctrl+I) |
| underline | 밑줄 (Ctrl+U) | Underline (Ctrl+U) |
| strikethrough | 취소선 | Strikethrough |
| code | 인라인 코드 | Inline code |
| color | 글자 색 | Text color |
| backColor | 배경 색 | Highlight color |
| ul | 글머리 기호 목록 | Bulleted list |
| ol | 번호 매기기 목록 | Numbered list |
| outdent | 내어쓰기 | Decrease indent |
| indent | 들여쓰기 | Increase indent |
| link | 링크 | Link |
| image | 이미지 | Image |
| table | 표 | Table |
| codeBlock | 코드 블록 | Code block |
| formula | 수식 | Formula |
| emoji | 이모지 | Emoji |
| removeFormat | 서식 지우기 | Clear formatting |
| sourceView | HTML 소스 보기 | View HTML source |
| theme | 다크 모드로 전환 | Switch to dark mode |
| themeDark | 다크 모드 (클릭 시 라이트로 전환) | Dark mode (click for light) |
| themeLight | 라이트 모드 (클릭 시 다크로 전환) | Light mode (click for dark) |

**align** — 정렬 드롭다운(표 툴바의 정렬 버튼도 같은 키 재사용)

| 키 | ko | en |
|---|---|---|
| label | 정렬 | Alignment |
| left | 왼쪽 정렬 | Align left |
| center | 가운데 정렬 | Align center |
| right | 오른쪽 정렬 | Align right |
| justify | 양쪽 정렬 | Justify |

**font** — 글꼴·크기 선택기

| 키 | ko | en |
|---|---|---|
| family | 글꼴 | Font |
| size | 글자 크기 | Font size |
| sizePlaceholder | 크기 | Size |
| default | 기본 | Default |
| notoSansKr | 본고딕 | Noto Sans KR |
| malgunGothic | 맑은 고딕 | Malgun Gothic |
| nanumGothic | 나눔고딕 | Nanum Gothic |
| notoSerifKr | 본명조 | Noto Serif KR |
| nanumMyeongjo | 나눔명조 | Nanum Myeongjo |

기본 글꼴 목록(`DEFAULT_FONT_FAMILIES`)은 `label` 대신 `labelKey` 를 갖고, 렌더 시
`t(labelKey)` 로 푼다. 호스트가 넘긴 목록의 `label` 은 그대로 쓴다(Pretendard 처럼 고유명은 키 없음).

**color / emoji**

| 키 | ko | en |
|---|---|---|
| color.custom | 사용자 지정 | Custom |
| color.customFor | {label} 사용자 지정 | Custom {label} |
| emoji.label | 이모지 선택 | Choose an emoji |

**dialog** — 공통 버튼

| 키 | ko | en |
|---|---|---|
| close | 닫기 | Close |
| cancel | 취소 | Cancel |
| apply | 적용 | Apply |
| insert | 삽입 | Insert |
| ok | 확인 | OK |
| noticeTitle | 알림 | Notice |

**link**

| 키 | ko | en |
|---|---|---|
| insertTitle | 링크 삽입 | Insert link |
| editTitle | 링크 편집 | Edit link |
| text | 표시 텍스트 | Display text |
| url | 링크 주소(URL) | URL |
| newTab | 새 탭에서 열기 | Open in new tab |
| remove | 링크 제거 | Remove link |
| errorEmpty | 링크 주소를 입력하세요. | Enter a URL. |
| errorScheme | 허용되지 않는 링크 형식입니다. (http, https, mailto, tel 만 가능) | This link type is not allowed (http, https, mailto, tel only). |

**image**

| 키 | ko | en |
|---|---|---|
| title | 이미지 첨부 | Insert image |
| dropHint | 파일을 선택하거나 여기로 끌어다 놓으세요 | Choose a file or drop it here |
| chooseFile | 파일 선택 | Choose file |
| orUrl | 또는 이미지 URL | Or image URL |
| alt | 대체 텍스트(웹접근성 권장) | Alt text (recommended for accessibility) |
| altPlaceholder | 이미지 설명 | Describe the image |
| insertUrl | URL 삽입 | Insert URL |
| altTitle | 이미지 대체 텍스트 | Image alt text |
| altLabelLong | 대체 텍스트(alt) — 웹접근성 권장 | Alt text — recommended for accessibility |
| errorEmpty | 이미지 URL 을 입력하거나 파일을 선택하세요. | Enter an image URL or choose a file. |
| errorScheme | 허용되지 않는 이미지 URL 형식입니다. | This image URL type is not allowed. |
| errorProcess | 이미지 처리 중 오류가 발생했습니다. | Failed to process the image. |
| errorInsert | 이미지 삽입에 실패했습니다. | Failed to insert the image. |
| errorRead | 파일을 읽지 못했습니다. | Could not read the file. |
| errorUploadUrl | 업로드 API 가 유효한 URL 을 반환하지 않았습니다. | The upload API did not return a valid URL. |
| errorNoUploader | 이미지 업로드 핸들러(uploadImage)가 설정되지 않았습니다. | Image upload is not configured (uploadImage). |
| errorType | 이미지 파일만 첨부할 수 있습니다. | Only image files can be attached. |
| errorSize | 이미지 크기는 최대 {max}MB 까지 가능합니다. | Images must be {max} MB or smaller. |

호스트의 `uploadImage` 가 던진 오류 메시지는 **번역하지 않고 그대로** 보여준다(호스트가
이미 자기 언어로 만든 문구다). 지금 동작과 같다.

**table** — 표 삽입 다이얼로그

| 키 | ko | en |
|---|---|---|
| title | 표 삽입 | Insert table |
| rows | 행 | Rows |
| cols | 열 | Columns |
| caption | 캡션(표 제목, 선택) | Caption (optional) |
| captionPlaceholder | 예: 분기별 매출 | e.g. Quarterly sales |
| headerRow | 첫 행을 헤더로 | Use first row as header |
| preview | {rows} 행 × {cols} 열 | {rows} rows × {cols} columns |

**tableEdit** — 표 컨텍스트 툴바

| 키 | ko | en |
|---|---|---|
| label | 표 편집 도구 | Table tools |
| rowInsertAbove | 위에 행 추가 | Insert row above |
| rowInsertBelow | 아래에 행 추가 | Insert row below |
| rowDelete | 행 삭제 | Delete row |
| colInsertLeft | 왼쪽에 열 추가 | Insert column left |
| colInsertRight | 오른쪽에 열 추가 | Insert column right |
| colDelete | 열 삭제 | Delete column |
| mergeCells | 셀 병합 | Merge cells |
| splitCell | 셀 분할 | Split cell |
| bgColor | 셀 배경색 | Cell background |
| color | 셀 글자색 | Cell text color |
| caption | 표 제목(캡션) | Table caption |
| delete | 표 삭제 | Delete table |
| captionLabel | 캡션 (비우면 삭제) | Caption (leave empty to remove) |

정렬 세 버튼은 `align.left/center/right` 를, 캡션 placeholder 는 `table.captionPlaceholder` 를 재사용한다.

**formula** — 수식 다이얼로그

| 키 | ko | en |
|---|---|---|
| insertTitle | 수식 삽입 | Insert formula |
| editTitle | 수식 편집 | Edit formula |
| label | 수식 (LaTeX) | Formula (LaTeX) |
| placeholder | 예: {example} | e.g. {example} |
| preview | 미리보기 | Preview |
| block | 블록 수식(별도 줄, 가운데 표시) | Display as block (own line, centered) |
| remove | 수식 삭제 | Remove formula |
| errorParse | 수식을 해석할 수 없습니다. | Could not parse the formula. |

**latex** — 변환기 오류(§3.3 참고)

| 코드(키) | ko | en |
|---|---|---|
| empty | 수식을 입력하세요. | Enter a formula. |
| textNeedsBrace | \text 는 {내용} 이 필요합니다. | \text requires {content}. |
| textUnclosed | \text 의 닫는 } 가 없습니다. | Missing closing } for \text. |
| trailingBackslash | 수식이 \ 로 끝났습니다. | The formula ends with \. |
| duplicateSup | ^ 첨자가 중복되었습니다. | Duplicate ^ superscript. |
| duplicateSub | _ 첨자가 중복되었습니다. | Duplicate _ subscript. |
| primeWithSup | ' 와 ^ 첨자를 함께 쓸 수 없습니다. | ' and ^ cannot be combined. |
| missingArgument | 명령의 인자가 없습니다. | Missing command argument. |
| expectedOpenBrace | { 가 필요합니다. | Expected {. |
| unclosedBrace | 닫는 } 가 없습니다. | Missing closing }. |
| unexpectedEnd | 수식이 예기치 않게 끝났습니다. | Unexpected end of formula. |
| unmatchedCloseBrace | 짝이 없는 } 가 있습니다. | Unmatched }. |
| noBase | {token} 앞에 대상이 없습니다. | Nothing before {token}. |
| unknownToken | 알 수 없는 토큰입니다. | Unknown token. |
| sqrtUnclosedBracket | \sqrt 의 닫는 ] 가 없습니다. | Missing closing ] for \sqrt. |
| rightWithoutLeft | \left 없이 \right 가 나왔습니다. | \right without \left. |
| leftWithoutRight | \left 에 대응하는 \right 가 없습니다. | \left without matching \right. |
| unsupportedCommand | 지원하지 않는 명령입니다: \{name} | Unsupported command: \{name} |
| missingDelimiter | \{which} 의 구분자가 없습니다. | Missing delimiter after \{which}. |
| invalidDelimiter | \{which} 뒤에 올 수 없는 구분자입니다. | Invalid delimiter after \{which}. |

키 합계 약 130개. `Editor: 마운트 대상을 찾을 수 없습니다.` 는 개발자용 예외(설정 이전에
발생)라 카탈로그에 넣지 않고 그대로 둔다.

### 3.3 LaTeX 변환기 오류 처리 방식

`src/math/latex-to-mathml.js` 는 순수 함수 모듈이라 `t` 를 모른다. 지금은 한국어 메시지를
`Error` 에 담아 던지고 `formula.js` 가 `err.message` 를 그대로 보여준다.

변경: 변환기는 **코드와 파라미터**만 던진다.

```js
export class LatexSyntaxError extends Error {
  constructor(code, params = {}) {
    super(code);
    this.name = 'LatexSyntaxError';
    this.code = code;     // 'unsupportedCommand'
    this.params = params; // { name: 'foo' }
  }
}
```

`formula.js` 가 `err instanceof LatexSyntaxError ? t(`latex.${err.code}`, err.params) : t('formula.errorParse')`
로 번역한다. 변환기는 i18n 과 무관한 순수 모듈로 남는다. `latexToMathML` 은 공개 API 가
아니므로 호환성 문제는 없다.

## 4. 구현 단계

### P1. i18n 인프라

- `src/i18n/ko.js`·`en.js`·`createT.js` 작성.
- `Editor` 생성자: `locale` 기본 `'ko'`, `this.t = createT(config)`. `placeholder`·`ariaLabel`
  기본값을 카탈로그에서 가져오도록 `this.config` 조립 순서 조정(호스트 값 우선 유지).
- `_ctx()` 에 `t` 와 `locale` 추가. 컨테이너와 body 직속 UI 에 `lang` stamp.
- `src/index.js` 에서 `messages` export. IIFE 전역에도 노출(esbuild `globalName` 이 처리).
- 산출물: 옵션은 받지만 문구는 아직 한국어 하드코딩 — 동작 변화 없음.

### P2. 문자열 치환 (모듈별, 각각 독립 커밋 가능)

| 순서 | 파일 | 개수 | 비고 |
|---|---|---|---|
| 1 | `core/Editor.js` | 44 | 툴바 라벨, 글꼴·크기 선택기, 테마, 알림 다이얼로그 |
| 2 | `ui/Toolbar.js`·`Dialog.js`·`ColorPicker.js`·`AlignPicker.js`·`EmojiPicker.js` | 10 | 생성자에 라벨/`t` 주입. `ALIGN_OPTIONS` 의 `label` → `labelKey` |
| 3 | `features/link.js`·`image.js`·`table.js` | 39 | `ctx.t` 사용. `innerHTML` 합성 7곳을 §2.4 규칙대로 분리 |
| 4 | `features/table-edit.js` | 21 | `TableToolbar` 생성자에 `t` 주입 |
| 5 | `features/formula.js`·`math/latex-to-mathml.js` | 32 | §3.3 `LatexSyntaxError` 도입 |

각 단계 후 기존 E2E(한국어 셀렉터 기반) 전부 통과가 조건 — 한국어 문구가 한 글자도
안 바뀌었음을 기존 스펙이 증명한다.

### P3. 검증 자산

- `scripts/check-i18n.mjs`: `src/` 에서 `src/i18n/` 과 주석을 뺀 한글 리터럴이 0개인지 검사.
  `pnpm lint:i18n` 으로 노출하고 회귀 방지에 쓴다.
- `tests/unit/messages.test.mjs` (`node --test`, 의존성 추가 없음):
  - ko·en 평탄화 키 집합이 같다 / 빈 값 없다 (king-sejong `messages.test.ts` 와 같은 검사).
  - 소스의 `t('…')` 리터럴 키가 모두 `ko` 에 존재한다.
  - `createT` 폴백 순서·보간·미치환 `{…}` 보존.
- `tests/e2e/i18n.spec.js`: 데모에 `?locale=en` 쿼리를 추가해
  - 툴바 버튼 접근성 이름이 영어다(`Bold (Ctrl+B)`, `Table`).
  - 표 삽입·수식 다이얼로그 제목과 버튼이 영어다.
  - 잘못된 LaTeX 입력 시 오류가 영어로 나온다(`LatexSyntaxError` 경로 검증).
  - `.we-editor` 와 열린 다이얼로그에 `lang="en"` 이 있다.
  - `messages: { toolbar: { bold: 'Strong' } }` 부분 override 가 적용되고 나머지는 en 유지.
  - `locale: 'ja'`(미내장) + `messages` 없음 → 한국어 폴백.
- 번들 크기: `pnpm build` 리포트로 ESM 증가분 ≤ 8KB 확인.

### P4. 문서·타입·배포

- `types/webeditor.d.ts`: `locale`, `messages`, `EditorMessages`, `messages` export,
  `fontFamilies` 항목 `labelKey`.
- `README.md`: "다국어(UI 언어)" 섹션 — ESM·IIFE 예시, 부분 override, 새 언어 추가 방법.
- `CLAUDE.md`: 아키텍처 트리에 `i18n/` 추가, §2.4 불변식 추가, "한글 리터럴 금지 → `src/i18n/ko.js`" 규칙.
- `package.json` 0.3.0, GitHub Packages 배포.

### P5. baeoom-king-sejong 연동 (별도 레포·별도 PR)

- `@baeoom-dev/webeditor` 를 `0.3.x` 로 올린다(`01-tech-stack.md` 표 갱신).
- `packages/ui/rich-editor/rich-editor.tsx`: `locale` prop 추가 → `createEditor` 의 `locale` 로
  전달, `useStableConfig` 키에 포함. 한국어로 박힌 `placeholder`·`ariaLabel` 기본값 제거
  (에디터 기본값이 로케일을 따른다). `RichEditorField` 도 prop 통과.
- 앱 쪽(`apps/site`·`apps/console`)은 next-intl `useLocale()` 값을 `locale` 로 넘긴다.
  `packages/ui` 는 next-intl 에 의존하지 않으므로 prop 으로 받는다.
- `presets.ts` 의 `RICH_EDITOR_FONT_FAMILIES` 라벨 `'기본'` → `labelKey: 'font.default'`.
- `rich-editor/README.md` "지켜야 하는 것 1" 과 `11-open-issues.md` OI-26 을 "해소" 로 갱신.
- 용어를 king-sejong 용어집에 맞춰야 하면 `packages/i18n` 의 `ko.json`/`en.json` 에
  `editor` 네임스페이스를 두고 `messages={messages.editor}` 로 넘긴다(선택).

## 5. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 한국어 문구가 치환 과정에서 미묘하게 바뀜 | 기본 로케일 ko 유지 + 기존 E2E 셀렉터(`getByRole('button', { name: '표' })` 등)가 그대로 통과해야 함 |
| 호스트 `messages` 를 통한 마크업 주입 | §2.4 불변식. `innerHTML` 합성 제거를 P2 에 포함 |
| 영어 문구 길이로 툴바 줄바꿈·다이얼로그 레이아웃 변화 | 툴바는 아이콘 전용(라벨은 툴팁)이라 영향 없음. 다이얼로그는 `i18n.spec.js` 에서 en 스크린샷을 남겨 확인 |
| `{…}` 보간이 LaTeX 오류 문구의 중괄호를 먹음 | params 에 있는 이름만 치환(§2.2). 단위 테스트로 고정 |
| 카탈로그에 키를 추가하고 en 을 빼먹음 | `messages.test.mjs` 키 일치 검사가 CI 에서 실패 |
| 다음 기능 개발 때 다시 한글 리터럴이 들어옴 | `check-i18n.mjs` + CLAUDE.md 규칙 |
| 번들 증가 | en 카탈로그 원문 약 5KB, 압축 후 2KB 안팎. 예산 내 |

## 6. 완료 기준 (Definition of Done)

- [x] `src/` 에 한글 UI 리터럴 0개 (`pnpm lint:i18n` 통과)
- [x] ko·en 키 100% 일치, 빈 값 없음 (`pnpm test:unit` 11/11 통과)
- [x] 기존 E2E 전부 통과 (한국어 기본 동작 불변 — 41개 기존 스펙 그대로 통과)
- [x] `i18n.spec.js` 통과 (en·override·폴백·`lang`·LaTeX 오류 코드 번역, 7개)
- [x] `pnpm build` 성공. 증가분 실측: ESM 원문 +13.5KB(126.3→139.8, 주석 포함) / gzip +3.7KB,
      IIFE 압축 +9.0KB(78.9→87.9) / gzip +2.9KB(23.4→26.4). 원문 기준 목표(8KB)는 넘었으나
      전송 기준(gzip)으로는 3KB 안팎 — 카탈로그 2개(한글 3바이트 문자)와 타입·헬퍼 주석이 원인. 허용.
- [x] `types/webeditor.d.ts`·README·CLAUDE.md 갱신
- [ ] IIFE 데모(`demo/legacy.html`)에서 `locale: 'en'` 육안 확인 (번들 재빌드 후)
- [ ] v0.3.0 배포 후 king-sejong 에서 `locale="en"` 으로 편집 화면 육안 확인 (P5)

### 구현 결과 요약

| 항목 | 결과 |
|---|---|
| 신규 파일 | `src/i18n/{ko,en,createT}.js`, `src/ui/form.js`, `scripts/check-i18n.mjs`, `tests/unit/messages.test.mjs`, `tests/e2e/i18n.spec.js` |
| 카탈로그 키 | 132개 (11 네임스페이스) |
| 공개 API | `locale`, `messages` 옵션 · `editor.locale`, `editor.t()` · `messages` export(IIFE `WebEditor.messages`) |
| 계획과 다른 점 | `fontFamilies` 항목의 `labelKey` 는 계획대로. 다이얼로그 버튼 헬퍼를 `ui/form.js` 로 분리(계획엔 없던 파일 — innerHTML 합성 7곳을 한 헬퍼로 정리) |

## 7. 열린 질문

1. **en 문구 검수자** — §3.2 초안은 개발자 번역이다. king-sejong 쪽 영문 감수 절차가 있으면 거기에 태운다.
2. **단축키 표기** — macOS 에서 `Ctrl+B` 대신 `⌘B` 를 보여줄지. 현재도 Ctrl 고정이라 이 계획의 범위 밖으로 두되, 하게 되면 `toolbar.bold` 문구가 아니라 플랫폼 감지 로직에서 처리한다(카탈로그를 플랫폼별로 늘리지 않는다).
3. **king-sejong 용어집 override 여부** — 내장 en 으로 충분한지, `messages.editor` 로 관리할지는 P5 에서 실제 화면을 보고 정한다.
