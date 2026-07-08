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
