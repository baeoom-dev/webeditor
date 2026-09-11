/**
 * i18n 카탈로그·createT 단위 테스트 (node --test, 의존성 없음).
 *
 * - ko·en 키 집합 100% 일치, 빈 값 없음
 * - 소스의 t('…') 리터럴 키가 모두 ko 에 존재
 * - createT 폴백 순서·보간·미치환 {…} 보존
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ko } from '../../src/i18n/ko.js';
import { en } from '../../src/i18n/en.js';
import { createT, messages } from '../../src/i18n/createT.js';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]],
  );
}

test('ko·en 메시지 키가 완전히 일치한다', () => {
  const koKeys = flatten(ko).map(([k]) => k).sort();
  const enKeys = flatten(en).map(([k]) => k).sort();
  assert.deepEqual(enKeys, koKeys);
});

test('모든 값이 비어 있지 않은 문자열이다', () => {
  for (const [locale, catalog] of Object.entries({ ko, en })) {
    for (const [key, value] of flatten(catalog)) {
      assert.equal(typeof value, 'string', `${locale}:${key} 는 문자열이어야 한다`);
      assert.ok(value.trim().length > 0, `${locale}:${key} 가 비었다`);
    }
  }
});

test('소스에서 참조하는 t() 키가 모두 ko 카탈로그에 있다', async () => {
  const known = new Set(flatten(ko).map(([k]) => k));
  const missing = [];
  async function* walk(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) yield* walk(full);
      else if (e.name.endsWith('.js')) yield full;
    }
  }
  for await (const file of walk(path.join(root, 'src'))) {
    const src = await readFile(file, 'utf8');
    // t('a.b') / this.t('a.b') / ctx.t('a.b') — 리터럴 키만 검사(동적 키는 아래 latex 테스트가 담당)
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      if (!known.has(m[1])) missing.push(`${path.relative(root, file)}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('latex-to-mathml 의 LatexSyntaxError 코드가 모두 latex.* 키에 있다', async () => {
  const src = await readFile(path.join(root, 'src/math/latex-to-mathml.js'), 'utf8');
  const codes = [...src.matchAll(/new LatexSyntaxError\('([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.ok(codes.length >= 15, '오류 코드 추출 실패');
  const missing = codes.filter((c) => typeof ko.latex[c] !== 'string');
  assert.deepEqual(missing, []);
});

test('기본 로케일은 ko 이고 내장 카탈로그를 노출한다', () => {
  const { t, locale } = createT();
  assert.equal(locale, 'ko');
  assert.equal(t('toolbar.bold'), ko.toolbar.bold);
  assert.equal(messages.ko, ko);
  assert.equal(messages.en, en);
  assert.ok(Object.isFrozen(messages));
});

test("locale: 'en' 이면 영어 문구를 돌려준다", () => {
  const { t } = createT({ locale: 'en' });
  assert.equal(t('toolbar.bold'), 'Bold (Ctrl+B)');
  assert.equal(t('table.title'), 'Insert table');
});

test('messages 부분 override 가 내장 문구보다 우선하고 나머지는 유지된다', () => {
  const { t } = createT({ locale: 'en', messages: { toolbar: { bold: 'Strong' } } });
  assert.equal(t('toolbar.bold'), 'Strong');
  assert.equal(t('toolbar.italic'), 'Italic (Ctrl+I)');
});

test('내장에 없는 locale 은 messages → ko 순으로 폴백한다', () => {
  const { t, locale } = createT({ locale: 'ja', messages: { dialog: { cancel: 'キャンセル' } } });
  assert.equal(locale, 'ja');
  assert.equal(t('dialog.cancel'), 'キャンセル');
  assert.equal(t('dialog.apply'), ko.dialog.apply);
});

test('보간은 params 에 있는 이름만 치환하고 나머지 {…} 는 보존한다', () => {
  const { t } = createT();
  assert.equal(t('table.preview', { rows: 3, cols: 4 }), '3 행 × 4 열');
  assert.equal(t('image.errorSize', { max: 5 }), '이미지 크기는 최대 5MB 까지 가능합니다.');
  // LaTeX 오류 문구의 {내용} 은 파라미터가 아니므로 그대로 남는다.
  assert.equal(t('latex.textNeedsBrace'), '\\text 는 {내용} 이 필요합니다.');
  assert.equal(t('latex.unsupportedCommand', { name: 'foo' }), '지원하지 않는 명령입니다: \\foo');
});

test('없는 키는 키 문자열을 돌려주고 console.warn 을 한 번만 낸다', () => {
  const calls = [];
  const original = console.warn;
  console.warn = (...args) => calls.push(args.join(' '));
  try {
    const { t } = createT();
    assert.equal(t('nope.missing'), 'nope.missing');
    assert.equal(t('nope.missing'), 'nope.missing');
  } finally {
    console.warn = original;
  }
  assert.equal(calls.length, 1);
});

test('키가 객체(네임스페이스)를 가리키면 문자열이 아니므로 폴백·키 반환한다', () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const { t } = createT();
    assert.equal(t('toolbar'), 'toolbar');
  } finally {
    console.warn = original;
  }
});
