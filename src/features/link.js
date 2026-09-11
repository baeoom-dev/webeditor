/**
 * 링크 삽입/편집.
 *
 * 보안: href 는 삽입 전에 스킴을 검증(http/https/mailto/tel)하고,
 * 새 창 링크에는 rel="noopener noreferrer" 를 강제한다.
 */
import { Dialog } from '../ui/Dialog.js';
import { icons } from '../ui/icons.js';
import { iconButton, textButton, showError } from '../ui/form.js';
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
 * @param {(key: string, params?: object) => string} ctx.t i18n 조회
 * @param {string} ctx.locale UI 언어
 * @param {() => void} ctx.onChange
 */
export function openLinkDialog(ctx) {
  const { t } = ctx;
  ctx.selection.save();
  const existing = ctx.selection.closest('a');
  const selectedText = getSelectedText(ctx.selection);

  const dialog = new Dialog({
    title: existing ? t('link.editTitle') : t('link.insertTitle'),
    closeLabel: t('dialog.close'),
    lang: ctx.locale,
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      const textField = field(t('link.text'), 'text', existing ? existing.textContent : selectedText);
      const urlField = field(t('link.url'), 'url', existing ? existing.getAttribute('href') || '' : 'https://');
      urlField.input.setAttribute('placeholder', 'https://example.com');

      const newTab = document.createElement('label');
      newTab.className = 'we-checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = existing ? existing.getAttribute('target') === '_blank' : true;
      newTab.append(cb, document.createTextNode(` ${t('link.newTab')}`));

      const error = document.createElement('p');
      error.className = 'we-form-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      if (existing) {
        const removeBtn = textButton(t('link.remove'), 'we-btn-ghost', () => {
          ctx.selection.restore();
          unwrapLink(existing);
          ctx.onChange();
          close();
        });
        actions.appendChild(removeBtn);
      }
      const cancel = textButton(t('dialog.cancel'), 'we-btn-secondary', () => close());
      const submit = iconButton({ icon: icons.check, text: t('dialog.apply'), className: 'we-btn-primary', type: 'submit' });
      actions.append(cancel, submit);

      form.append(textField.wrap, urlField.wrap, newTab, error, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = urlField.input.value.trim();
        const text = textField.input.value.trim() || url;
        if (!url) {
          showError(error, t('link.errorEmpty'));
          return;
        }
        if (!isSafeHref(url)) {
          showError(error, t('link.errorScheme'));
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
