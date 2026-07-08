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
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
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
  validateImageFile(file, ctx.config);
  let src;
  if (typeof ctx.config.uploadImage === 'function') {
    src = await ctx.config.uploadImage(file);
    if (typeof src !== 'string' || !src) {
      throw new Error('업로드 API 가 유효한 URL 을 반환하지 않았습니다.');
    }
  } else if (ctx.config.allowDataUrlFallback !== false) {
    src = await readAsDataUrl(file);
  } else {
    throw new Error('이미지 업로드 핸들러(uploadImage)가 설정되지 않았습니다.');
  }
  ctx.selection.restore();
  insertImage(src, file.name.replace(/\.[^.]+$/, ''), ctx);
}

/** 업로드 전 파일 크기/형식 검증. */
function validateImageFile(file, config) {
  const maxBytes = (config.maxImageSizeMB ?? 10) * 1024 * 1024;
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 첨부할 수 있습니다.');
  }
  if (file.size > maxBytes) {
    throw new Error(`이미지 크기는 최대 ${config.maxImageSizeMB ?? 10}MB 까지 가능합니다.`);
  }
}

/**
 * 이미지 다이얼로그(URL 입력 + 파일 업로드).
 * @param {object} ctx
 */
export function openImageDialog(ctx) {
  ctx.selection.save();

  const dialog = new Dialog({
    title: '이미지 첨부',
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      // 파일 업로드 영역.
      const drop = document.createElement('div');
      drop.className = 'we-image-drop';
      drop.innerHTML =
        `<div class="we-image-drop-inner">${icons.image}` +
        `<p>파일을 선택하거나 여기로 끌어다 놓으세요</p></div>`;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'we-visually-hidden';
      fileInput.id = `we-file-${Math.random().toString(36).slice(2, 8)}`;
      const fileLabel = document.createElement('label');
      fileLabel.className = 'we-btn we-btn-secondary';
      fileLabel.htmlFor = fileInput.id;
      fileLabel.textContent = '파일 선택';

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
          showError(error, err instanceof Error ? err.message : '이미지 처리 중 오류가 발생했습니다.');
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
      urlLabel.textContent = '또는 이미지 URL';
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
      altLabel.textContent = '대체 텍스트(웹접근성 권장)';
      const altInput = document.createElement('input');
      altInput.id = altId;
      altInput.type = 'text';
      altInput.placeholder = '이미지 설명';
      altWrap.append(altLabel, altInput);

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'we-btn we-btn-secondary';
      cancel.textContent = '취소';
      cancel.addEventListener('click', () => close());
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'we-btn we-btn-primary';
      submit.innerHTML = `${icons.check}<span>URL 삽입</span>`;
      actions.append(cancel, submit);

      form.append(drop, fileLabel, fileInput, urlWrap, altWrap, error, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        if (!url) {
          showError(error, '이미지 URL 을 입력하거나 파일을 선택하세요.');
          return;
        }
        if (!isSafeSrc(url)) {
          showError(error, '허용되지 않는 이미지 URL 형식입니다.');
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
  const dialog = new Dialog({
    title: '이미지 대체 텍스트',
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      const wrap = document.createElement('div');
      wrap.className = 'we-field';
      const id = `we-editalt-${Math.random().toString(36).slice(2, 8)}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = '대체 텍스트(alt) — 웹접근성 권장';
      const input = document.createElement('input');
      input.id = id;
      input.type = 'text';
      input.value = img.getAttribute('alt') || '';
      input.placeholder = '이미지 설명';
      wrap.append(label, input);

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'we-btn we-btn-secondary';
      cancel.textContent = '취소';
      cancel.addEventListener('click', () => close());
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'we-btn we-btn-primary';
      submit.innerHTML = `${icons.check}<span>적용</span>`;
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

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}
