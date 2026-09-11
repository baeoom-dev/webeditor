/**
 * 공개 진입점.
 *
 * 사용 예:
 *   import { createEditor } from './src/index.js';
 *   const editor = createEditor('#editor', {
 *     uploadImage: async (file) => (await api.upload(file)).url,
 *   });
 *   editor.getHTML();
 */
export { Editor } from './core/Editor.js';
export { sanitizeHtml } from './security/sanitizer.js';
// 내장 UI 메시지 카탈로그(ko·en). 새 언어를 만들 때 복사해 출발점으로 쓰거나 부분 override 참고용.
export { messages } from './i18n/createT.js';

import { Editor } from './core/Editor.js';

/**
 * 편집기 인스턴스를 생성한다.
 * @param {HTMLElement|string} target
 * @param {object} [config]
 * @returns {Editor}
 */
export function createEditor(target, config) {
  return new Editor(target, config);
}
