/**
 * 메시지 조회 함수 팩토리.
 *
 * 조회 순서: 호스트 override(messages) → 내장 locale → 내장 ko → 키 문자열(+ console.warn 1회).
 * t 는 Editor 인스턴스마다 만들어 전달한다 — 전역 싱글턴에 두지 않는다(한 페이지에
 * 언어가 다른 인스턴스가 공존할 수 있다).
 */
import { ko } from './ko.js';
import { en } from './en.js';

/** 내장 카탈로그(읽기 전용). 공개 API 로도 노출된다. */
export const messages = Object.freeze({ ko, en });

export const DEFAULT_LOCALE = 'ko';

/** 점 구분 키로 중첩 객체를 조회한다. 문자열이 아니면 undefined. */
function lookup(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  let cur = obj;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, part)) {
      return undefined;
    }
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * `{name}` 보간. params 에 있는 이름만 치환하고 나머지 `{…}` 는 그대로 둔다
 * (LaTeX 오류 문구의 `\text{…}` 같은 중괄호와 충돌하지 않게).
 */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

/**
 * @param {object} [options]
 * @param {string} [options.locale='ko'] UI 언어. 내장에 없으면 messages → ko 순으로 폴백
 * @param {object} [options.messages] 부분 override 또는 새 언어 전체(중첩 객체)
 * @returns {{ t: (key: string, params?: Record<string, unknown>) => string, locale: string }}
 */
export function createT({ locale = DEFAULT_LOCALE, messages: overrides } = {}) {
  const resolvedLocale = typeof locale === 'string' && locale.trim() ? locale.trim() : DEFAULT_LOCALE;
  const builtin = Object.prototype.hasOwnProperty.call(messages, resolvedLocale)
    ? messages[resolvedLocale]
    : null;
  const chain = [overrides, builtin, messages[DEFAULT_LOCALE]].filter(Boolean);
  const warned = new Set();

  const t = (key, params) => {
    for (const source of chain) {
      const found = lookup(source, key);
      if (found !== undefined) return interpolate(found, params);
    }
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[webeditor] 메시지 키 없음: ${key}`);
    }
    return key;
  };

  return { t, locale: resolvedLocale };
}
