/**
 * 링크 삽입/편집.
 *
 * 보안: href 는 삽입 전에 스킴을 검증(http/https/mailto/tel)하고,
 * 새 창 링크에는 rel="noopener noreferrer" 를 강제한다.
 */
import { Dialog } from '../ui/Dialog.js';
import { icons } from '../ui/icons.js';
import { ALLOWED_LINK_SCHEMES } from '../security/schema.js';

/** href 스킴 검증. 상대경로는 허용. */
function isSafeHref(url) {
  const trimmed = String(url).trim();
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(trimmed);
  if (!match) return true; // 상대경로/앵커
  return ALLOWED_LINK_SCHEMES.has(match[1].toLowerCase());
}

/**
 * 링크 다이얼로그를 연다.
 * @param {object} ctx
 * @param {import('../core/Selection.js').SelectionManager} ctx.selection
 * @param {() => void} ctx.onChange
 */
export function openLinkDialog(ctx) {
  ctx.selection.save();
  const existing = ctx.selection.closest('a');
  const selectedText = getSelectedText(ctx.selection);

  const dialog = new Dialog({
    title: existing ? '링크 편집' : '링크 삽입',
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      const textField = field('표시 텍스트', 'text', existing ? existing.textContent : selectedText);
      const urlField = field('링크 주소(URL)', 'url', existing ? existing.getAttribute('href') || '' : 'https://');
      urlField.input.setAttribute('placeholder', 'https://example.com');

      const newTab = document.createElement('label');
      newTab.className = 'we-checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = existing ? existing.getAttribute('target') === '_blank' : true;
      newTab.append(cb, document.createTextNode(' 새 탭에서 열기'));

      const error = document.createElement('p');
      error.className = 'we-form-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      if (existing) {
        const removeBtn = button('링크 제거', 'we-btn-ghost', () => {
          ctx.selection.restore();
          unwrapLink(existing);
          ctx.onChange();
          close();
        });
        actions.appendChild(removeBtn);
      }
      const cancel = button('취소', 'we-btn-secondary', () => close());
      const submit = button('적용', 'we-btn-primary', null, 'submit');
      submit.innerHTML = `${icons.check}<span>적용</span>`;
      actions.append(cancel, submit);

      form.append(textField.wrap, urlField.wrap, newTab, error, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = urlField.input.value.trim();
        const text = textField.input.value.trim() || url;
        if (!url) {
          showError(error, '링크 주소를 입력하세요.');
          return;
        }
        if (!isSafeHref(url)) {
          showError(error, '허용되지 않는 링크 형식입니다. (http, https, mailto, tel 만 가능)');
          return;
        }
        ctx.selection.restore();
        applyLink({ existing, url, text, newTab: cb.checked, ctx });
        ctx.onChange();
        close();
      });

      body.appendChild(form);
    },
  });
  dialog.open();
}

function applyLink({ existing, url, text, newTab, ctx }) {
  if (existing) {
    existing.setAttribute('href', url);
    existing.textContent = text;
    setTarget(existing, newTab);
    return;
  }
  const anchor = document.createElement('a');
  anchor.setAttribute('href', url);
  anchor.textContent = text;
  setTarget(anchor, newTab);
  ctx.selection.insertNode(anchor);
}

function setTarget(anchor, newTab) {
  if (newTab) {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
  } else {
    anchor.removeAttribute('target');
    anchor.removeAttribute('rel');
  }
}

function unwrapLink(anchor) {
  const parent = anchor.parentNode;
  while (anchor.firstChild) parent.insertBefore(anchor.firstChild, anchor);
  parent.removeChild(anchor);
}

function getSelectedText(selection) {
  const range = selection.getRange() || selection._saved;
  return range ? range.toString() : '';
}

/* --- 소형 폼 헬퍼 --- */
function field(labelText, type, value) {
  const wrap = document.createElement('div');
  wrap.className = 'we-field';
  const id = `we-f-${Math.random().toString(36).slice(2, 8)}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.value = value || '';
  wrap.append(label, input);
  return { wrap, input };
}

function button(text, cls, onClick, type = 'button') {
  const b = document.createElement('button');
  b.type = type;
  b.className = `we-btn ${cls}`;
  b.textContent = text;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}
