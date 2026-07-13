# 수식 입력 기능 설계 문서

> 대상 버전: v0.2.0 (예정) · 작성일: 2026-07-14 · 상태: 승인 후 구현

## 1. 목표

에디터에 수학 수식을 삽입·편집하는 기능을 추가한다. 사용자는 LaTeX(서브셋)로 수식을
입력하고, 에디터와 출력 페이지 양쪽에서 브라우저 네이티브 **MathML Core** 로 렌더링된다.

## 2. 방식 결정

| 후보 | 판정 | 이유 |
|---|---|---|
| **네이티브 MathML Core + 내장 LaTeX 변환기** | ✅ 채택 | 런타임 의존성 0 유지, 출력 페이지에 JS 불필요(순수 마크업), 스크린리더 접근성 최상 |
| KaTeX/MathJax 주입 옵션 | ❌ | 렌더 결과가 class 기반 → 새니타이저와 정합 불가, 출력 페이지도 라이브러리 필요 |
| 이미지 렌더(외부 서비스) | ❌ | 외부 의존·프라이버시 문제, 재편집 불가 |

MathML Core 는 Chrome 109+(2023-01), Firefox, Safari 전 버전에서 네이티브 지원된다.

### 데이터 모델

```html
<math display="inline|block" data-we-formula="\frac{1}{2}">
  <mfrac><mn>1</mn><mn>2</mn></mfrac>
</math>
```

- 렌더링은 MathML 자식 트리가 담당한다.
- **원본 LaTeX 는 `data-we-formula` 속성에 보존**한다 — 재편집의 단일 출처(source of truth).
  재편집 시 MathML 을 역파싱하지 않고 이 속성에서 LaTeX 를 복원한다.
- 편집기 안에서 수식은 **원자(atomic)** 로 취급한다: 커서가 내부로 들어가 글자 단위로
  깨뜨리는 것을 막기 위해 편집 영역 안에서만 `contenteditable="false"` 를 stamp 하고,
  이 속성은 새니타이저가 출력에서 제거한다(출력 마크업은 순수 MathML).

## 3. 보안 설계 — 새니타이저 확장 ⭐

MathML 은 대표적인 mutation-XSS(mXSS) 벡터이므로 아래 규칙을 **불변식**으로 삼는다.

### 3.1 화이트리스트 (`schema.js`)

- `DANGEROUS_TAGS` 에서 `math` 제거.
- 신규 `MATHML_TAGS`(별도 Set — `ALLOWED_TAGS` 와 분리해 감사 용이):
  `math, mrow, mi, mn, mo, mfrac, msqrt, mroot, msup, msub, msubsup,
   munder, mover, munderover, mtext, mtable, mtr, mtd, mstyle, mspace,
   ms, mpadded, mphantom, merror`
- **절대 허용하지 않는 것**: `semantics`, `annotation`, `annotation-xml`(HTML/XML 네임스페이스
  전환 벡터), `maction`(클릭 액션), `mglyph`/`malignmark`(파서 breakout 벡터),
  MathML 요소의 `href` 속성(모든 MathML 요소는 href 로 링크가 될 수 있음).
- 허용 속성: `math` 에 `display`, `data-we-formula` 만 추가(`*` 공용 `style`/`dir` 은
  기존 CSS 화이트리스트를 그대로 통과).

### 3.2 네임스페이스 격리 (`sanitizer.js`)

`sanitizeNode` 에 `math 서브트리` 모드를 추가한다:

1. `math` 서브트리 내부에서는 **MathML 네임스페이스(`http://www.w3.org/1998/Math/MathML`)
   이면서 `MATHML_TAGS` 에 있는 요소만 허용**한다.
2. 위반 요소(math 안의 HTML 요소, 미허용 MathML 요소)는 **unwrap 이 아니라 통째로 제거**한다.
   unwrap 하면 자식이 HTML 문맥으로 승격돼 mXSS 가 된다.
3. math 밖에서 나타나는 MathML 계열 태그명(`<mi>` 단독 등)은 HTML 네임스페이스로 파싱되므로
   기존 규칙(미허용 태그 unwrap)이 그대로 적용된다.

이로써 `<math><mtext><img onerror>`, `<math><annotation-xml encoding="text/html">…` 류의
알려진 mXSS 페이로드가 모두 차단된다. 직렬화 왕복(innerHTML → 재파싱) 시에도 math 내부에
텍스트와 MathML 요소만 남으므로 파서 mutation 이 발생하지 않는다.

## 4. LaTeX 서브셋 → MathML 변환기 (`src/math/latex-to-mathml.js`)

의존성 0 원칙에 따라 직접 구현한다. 재귀 하강 파서, 문자열 조립이 아닌
**`createElementNS` 로 MathML DOM 을 직접 생성**한다(이스케이프 문제 원천 차단).

### 4.1 v1 지원 문법

| 분류 | 문법 | MathML |
|---|---|---|
| 첨자 | `x^2`, `x_i`, `x_i^2` | `msup` / `msub` / `msubsup` |
| 분수 | `\frac{a}{b}` | `mfrac` |
| 루트 | `\sqrt{x}`, `\sqrt[n]{x}` | `msqrt` / `mroot` |
| 그리스 문자 | `\alpha` … `\Omega` | `mi` |
| 연산자·기호 | `\times \pm \le \ne \to \infty \in \subset \cup \forall \partial \nabla \cdots` 등 | `mo` / `mi` |
| 큰 연산자 | `\sum_{i=1}^{n}`, `\prod`, `\int_a^b`, `\oint`, `\lim_{x \to 0}` | `munderover`(limits형) / `msubsup`(int형) |
| 함수명 | `\sin \cos \tan \log \ln \exp \min \max` | `mi`(다문자 — 정립체 렌더) |
| 텍스트 | `\text{...}` | `mtext` |
| 장식 | `\hat{x} \bar{x} \vec{x}` | `mover` |
| 괄호 | `( ) [ ] \{ \}`, `\left( \right)` | `mo`(MathML Core 연산자 사전이 자동 신축) |
| 일반 | 영문자→`mi`(1자씩), 숫자(소수 포함)→`mn`, `+-*/=<>` 등→`mo` | |

- **v2 로 미루는 것**: 행렬(`\begin{matrix}`), `\overbrace`, 색상, 정렬 환경.
- 파싱 실패(미지원 명령, 괄호 불일치)는 `Error` 를 throw — 다이얼로그가 잡아 메시지 표시.

### 4.2 공개 API

```js
latexToMathML(latex, { display: false }) // → <math> MathMLElement (data-we-formula 포함)
```

## 5. UI (`src/features/formula.js`)

`link.js`/`image.js` 의 확립된 패턴을 따른다.

- 툴바 삽입 그룹에 **수식 버튼**(√x 아이콘) 추가. feature 이름: `'formula'` (기본 활성).
- 다이얼로그 구성: LaTeX 입력 textarea → **라이브 미리보기**(입력마다 변환기 실행,
  실패 시 에러 문구) → "블록 수식(별도 줄)" 체크박스 → 취소/적용.
- 삽입: `selection.save()` → 다이얼로그 → `selection.restore()` → `insertNode(mathEl)`.
- **재편집**: 편집 영역에서 수식 **더블클릭** 시 기존 다이얼로그가 `data-we-formula` 값으로
  채워져 열린다(이미지 alt 편집과 동일한 상호작용). 적용 시 `replaceWith` 로 교체.
- **삭제**: 수식은 `contenteditable=false` 원자라 브라우저 네이티브 캐럿 삭제가 동작하지
  않는 경우가 있다(특히 블록 수식). 세 경로를 제공한다:
  1. `handleFormulaDelete` 키 핸들러 — 커서 바로 앞(Backspace)/뒤(Delete)의 `<math>` 를 직접 제거.
  2. **클릭 시 수식 통째 선택**(하이라이트) → Backspace/입력으로 삭제·교체. 수식이 포함된
     범위 선택 삭제도 네이티브가 실패할 수 있어 핸들러가 `range.deleteContents()` 로 직접 처리.
  3. 편집 다이얼로그의 "수식 삭제" 버튼.
- 접근성: 기존 Dialog(포커스 트랩) 재사용, 에러는 `role="alert"`, 미리보기 영역에
  `aria-live="polite"`.

## 6. 배선·스타일

| 파일 | 변경 |
|---|---|
| `src/ui/icons.js` | `formula` 아이콘(√x 인라인 SVG, currentColor + aria-hidden) |
| `src/core/Editor.js` | `DEFAULT_FEATURES` 에 `'formula'`, 삽입 그룹 버튼, math `dblclick` → 편집 다이얼로그, `_emitChange` 에서 math 에 `contenteditable=false` stamp, 플레이스홀더 판정에 `math` 포함 |
| `src/styles/editor.css` | 콘텐츠 외형은 `.we-content` 에(math 크기·블록 여백), 에디터 크롬은 `.we-editor-content` 에(hover 하이라이트·포인터), 다이얼로그 미리보기 스타일 |
| `types/webeditor.d.ts` | features 목록에 `'formula'` 추가 |
| `CLAUDE.md` | 수식 기능 아키텍처 항목 추가(보안 불변식 포함) |

## 7. 테스트 계획 (`tests/e2e/formula.spec.js`)

1. 툴바 버튼 → 다이얼로그 → `\frac{1}{2}` 입력 → 미리보기에 `<math>` 렌더 확인.
2. 적용 → `getHTML()` 에 `<math>` + `data-we-formula` 보존(**새니타이저 왕복 검증**).
3. 재편집: 수식 더블클릭 → 입력창에 원본 LaTeX 복원 → 수정 → 반영 확인.
4. 보안: `setHTML()` 로 mXSS 페이로드 주입 시 위험 마크업이 제거되는지
   (`<math><mtext><img onerror>`, `annotation-xml`, MathML `href`).
5. 블록 수식 체크 시 `display="block"` 출력.
6. 미지원 명령 입력 시 에러 표시 + 적용 차단.

## 8. 알려진 제약

- 표와 동일하게 `insertNode` 삽입은 네이티브 execCommand undo 스택에 남지 않는다.
- Word 가 클립보드에 넣는 MathML 은 화이트리스트 통과분만 렌더되며(부수 효과),
  `data-we-formula` 가 없어 더블클릭 재편집은 불가(속성이 없으면 빈 입력으로 열림).
- LaTeX 전체 문법이 아닌 서브셋이다. 미지원 명령은 명시적 에러로 안내한다.
