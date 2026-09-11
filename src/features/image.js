/**
 * 이미지 첨부: URL 입력 / 파일 업로드 / 붙여넣기·드롭.
 *
 * 업로드 처리 API 는 설정으로 주입한다:
 *   config.uploadImage = async (file) => 'https://cdn/...'   // 업로드 후 URL 반환
 * 업로드 핸들러가 없으면 data URL(base64) 로 인라인한다(allowDataUrlFallback).
 *
 * 보안: URL 은 스킴 검증(http/https/data:image) 후에만 삽입한다.
 */
import { Dialog } from '../ui/Dialog.js';
import { icons } from '../ui/icons.js';
import { iconButton, textButton, showError } from '../ui/form.js';
import { ALLOWED_IMG_SCHEMES, ALLOWED_DATA_MIME } from '../security/schema.js';

/** img src 스킴 검증. */
function isSafeSrc(url) {
  const trimmed = String(url).trim();
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(trimmed);
  if (!match) return true; // 상대경로
  const scheme = match[1].toLowerCase();
  if (!ALLOWED_IMG_SCHEMES.has(scheme)) return false;
  if (scheme === 'data:') return ALLOWED_DATA_MIME.test(trimmed);
  return true;
}

/** File 을 data URL 로 읽는다(폴백). */
function readAsDataUrl(file, t) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error(t('image.errorRead')));
    reader.readAsDataURL(file);
  });
}

/** img 요소를 만들어 커서 위치에 삽입한다. */
function insertImage(src, alt, ctx) {
  if (!isSafeSrc(src)) return false;
  const img = document.createElement('img');
  img.setAttribute('src', src);
  img.setAttribute('alt', alt || '');
  img.setAttribute('loading', 'lazy');
  ctx.selection.insertNode(img);
  ctx.onChange();
  return true;
}

/**
 * File 객체를 업로드 API 로 처리한 뒤 삽입한다(붙여넣기/드롭/파일선택 공용).
 * @returns {Promise<void>}
 */
export async function insertImageFile(file, ctx) {
  const { t } = ctx;
  validateImageFile(file, ctx.config, t);
  let src;
  if (typeof ctx.config.uploadImage === 'function') {
    // 호스트 uploadImage 가 던진 오류 메시지는 번역하지 않고 그대로 전파한다(호스트 언어).
    src = await ctx.config.uploadImage(file);
    if (typeof src !== 'string' || !src) {
      throw new Error(t('image.errorUploadUrl'));
    }
  } else if (ctx.config.allowDataUrlFallback !== false) {
    src = await readAsDataUrl(file, t);
  } else {
    throw new Error(t('image.errorNoUploader'));
  }
  ctx.selection.restore();
  insertImage(src, file.name.replace(/\.[^.]+$/, ''), ctx);
}

/** 업로드 전 파일 크기/형식 검증. */
function validateImageFile(file, config, t) {
  const maxMB = config.maxImageSizeMB ?? 10;
  const maxBytes = maxMB * 1024 * 1024;
  if (!file.type.startsWith('image/')) {
    throw new Error(t('image.errorType'));
  }
  if (file.size > maxBytes) {
    throw new Error(t('image.errorSize', { max: maxMB }));
  }
}

/**
 * 이미지 다이얼로그(URL 입력 + 파일 업로드).
 * @param {object} ctx
 */
export function openImageDialog(ctx) {
  const { t } = ctx;
  ctx.selection.save();

  const dialog = new Dialog({
    title: t('image.title'),
    closeLabel: t('dialog.close'),
    lang: ctx.locale,
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      // 파일 업로드 영역. 아이콘만 innerHTML, 안내 문구는 textContent.
      const drop = document.createElement('div');
      drop.className = 'we-image-drop';
      const dropInner = document.createElement('div');
      dropInner.className = 'we-image-drop-inner';
      dropInner.innerHTML = icons.image;
      const dropHint = document.createElement('p');
      dropHint.textContent = t('image.dropHint');
      dropInner.appendChild(dropHint);
      drop.appendChild(dropInner);
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'we-visually-hidden';
      fileInput.id = `we-file-${Math.random().toString(36).slice(2, 8)}`;
      const fileLabel = document.createElement('label');
      fileLabel.className = 'we-btn we-btn-secondary';
      fileLabel.htmlFor = fileInput.id;
      fileLabel.textContent = t('image.chooseFile');

      const error = document.createElement('p');
      error.className = 'we-form-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      const handleFile = async (file) => {
        if (!file) return;
        try {
          error.hidden = true;
          await insertImageFile(file, ctx);
          close();
        } catch (err) {
          showError(error, err instanceof Error ? err.message : t('image.errorProcess'));
        }
      };

      fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
      drop.addEventListener('dragover', (e) => {
        e.preventDefault();
        drop.classList.add('is-drag');
      });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
      drop.addEventListener('drop', (e) => {
        e.preventDefault();
        drop.classList.remove('is-drag');
        handleFile(e.dataTransfer.files[0]);
      });

      // URL 입력 영역.
      const urlWrap = document.createElement('div');
      urlWrap.className = 'we-field';
      const urlId = `we-url-${Math.random().toString(36).slice(2, 8)}`;
      const urlLabel = document.createElement('label');
      urlLabel.htmlFor = urlId;
      urlLabel.textContent = t('image.orUrl');
      const urlInput = document.createElement('input');
      urlInput.id = urlId;
      urlInput.type = 'url';
      urlInput.placeholder = 'https://example.com/image.png';
      urlWrap.append(urlLabel, urlInput);

      const altWrap = document.createElement('div');
      altWrap.className = 'we-field';
      const altId = `we-alt-${Math.random().toString(36).slice(2, 8)}`;
      const altLabel = document.createElement('label');
      altLabel.htmlFor = altId;
      altLabel.textContent = t('image.alt');
      const altInput = document.createElement('input');
      altInput.id = altId;
      altInput.type = 'text';
      altInput.placeholder = t('image.altPlaceholder');
      altWrap.append(altLabel, altInput);

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      const cancel = textButton(t('dialog.cancel'), 'we-btn-secondary', () => close());
      const submit = iconButton({ icon: icons.check, text: t('image.insertUrl'), className: 'we-btn-primary', type: 'submit' });
      actions.append(cancel, submit);

      form.append(drop, fileLabel, fileInput, urlWrap, altWrap, error, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) {
          showError(error, t('image.errorEmpty'));
          return;
        }
        if (!isSafeSrc(url)) {
          showError(error, t('image.errorScheme'));
          return;
        }
        ctx.selection.restore();
        insertImage(url, altInput.value.trim(), ctx);
        close();
      });

      body.appendChild(form);
    },
  });
  dialog.open();
}

/**
 * 삽입된 이미지의 대체 텍스트(alt)를 편집하는 다이얼로그.
 * @param {HTMLImageElement} img 대상 이미지
 * @param {object} ctx onChange 등을 포함한 컨텍스트
 */
export function openImageAltDialog(img, ctx) {
  const { t } = ctx;
  const dialog = new Dialog({
    title: t('image.altTitle'),
    closeLabel: t('dialog.close'),
    lang: ctx.locale,
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      const wrap = document.createElement('div');
      wrap.className = 'we-field';
      const id = `we-editalt-${Math.random().toString(36).slice(2, 8)}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = t('image.altLabelLong');
      const input = document.createElement('input');
      input.id = id;
      input.type = 'text';
      input.value = img.getAttribute('alt') || '';
      input.placeholder = t('image.altPlaceholder');
      wrap.append(label, input);

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      const cancel = textButton(t('dialog.cancel'), 'we-btn-secondary', () => close());
      const submit = iconButton({ icon: icons.check, text: t('dialog.apply'), className: 'we-btn-primary', type: 'submit' });
      actions.append(cancel, submit);

      form.append(wrap, actions);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        img.setAttribute('alt', input.value.trim());
        ctx.onChange();
        close();
      });
      body.appendChild(form);
    },
  });
  dialog.open();
}
