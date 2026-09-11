/**
 * i18n 회귀 검사: src/ 의 코드에 한글 UI 리터럴이 남아 있으면 실패한다.
 *
 * - src/i18n/ 은 카탈로그 자체이므로 제외.
 * - 주석(// … , /* … *​/)은 무시한다 — 한국어 주석은 허용.
 * - 문자열 리터럴 안의 한글만 잡는다. 예외는 아래 ALLOW 에 파일:패턴으로 등록.
 *
 * 사용: node scripts/check-i18n.mjs  (pnpm lint:i18n)
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, 'src');

/** 허용 예외 — 값이 UI 문구가 아닌 경우만. */
const ALLOW = [
  // CSS font-family 스택의 한글 글꼴 별칭(브라우저가 시스템 글꼴을 찾는 데 필요, 화면에 안 보임)
  { file: 'core/Editor.js', pattern: /"(맑은 고딕|나눔고딕|나눔명조)"/ },
  // 개발자용 예외(설정 이전 단계) — 카탈로그 대상 아님
  { file: 'core/Editor.js', pattern: /마운트 대상을 찾을 수 없습니다/ },
];

const HANGUL = /[가-힣]/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

/** 주석을 제거한 뒤 남은 코드 줄을 돌려준다(줄 번호 유지). */
function stripComments(source) {
  // 블록 주석은 줄 수를 유지하도록 줄바꿈만 남긴다.
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  return noBlock.split('\n').map((line) => {
    // 문자열 안의 // 는 건드리지 않도록, 따옴표 밖의 // 만 자른다.
    let inStr = null;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inStr) {
        if (ch === '\\') i += 1;
        else if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
      } else if (ch === '/' && line[i + 1] === '/') {
        return line.slice(0, i);
      }
    }
    return line;
  });
}

const violations = [];
for await (const file of walk(srcDir)) {
  const rel = path.relative(srcDir, file);
  if (rel.startsWith('i18n' + path.sep)) continue;
  const lines = stripComments(await readFile(file, 'utf8'));
  lines.forEach((line, idx) => {
    if (!HANGUL.test(line)) return;
    const allowed = ALLOW.some((a) => rel === a.file && a.pattern.test(line));
    if (!allowed) violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
  });
}

if (violations.length) {
  process.stderr.write(
    `[check-i18n] 한글 UI 리터럴 ${violations.length}건 — src/i18n/ko.js 로 옮기고 t() 를 쓰세요.\n` +
      violations.map((v) => `  ${v}`).join('\n') +
      '\n',
  );
  process.exit(1);
}
process.stdout.write('[check-i18n] OK — src/ 에 한글 UI 리터럴 없음\n');
