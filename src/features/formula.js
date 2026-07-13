/**
 * 수식 삽입/편집 다이얼로그.
 *
 * LaTeX(서브셋)를 입력받아 latexToMathML 로 네이티브 MathML 을 만들어 삽입한다.
 * 원본 LaTeX 는 <math data-we-formula> 에 보존되어 더블클릭 재편집의 단일 출처가 된다.
 * 생성 마크업은 schema.js 의 MATHML_TAGS 화이트리스트와 정합해 sanitize 를 통과한다.
 * 설계: docs/formula-design.md
 */
import { Dialog } from '../ui/Dialog.js';
import { icons } from '../ui/icons.js';
import { latexToMathML } from '../math/latex-to-mathml.js';

const EXAMPLE = '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';

/**
 * Backspace/Delete 로 커서에 인접한 수식(원자)을 삭제한다.
 *
 * 수식은 contenteditable=false 라 브라우저가 캐럿 삭제 대상으로 잡지 못하는
 * 경우가 있다(특히 display=block). 커서 바로 앞/뒤가 <math> 면 직접 제거한다.
 * @param {KeyboardEvent} e
 * @param {HTMLElement} root 편집 영역
 * @returns {boolean} 수식을 삭제했으면 true (호출부가 onChange 처리)
 */
export function handleFormulaDelete(e, root) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return false;
  // 범위 선택: 수식이 포함돼 있으면 직접 삭제한다 — 브라우저가 contenteditable=false
  // 노드가 든 범위를 지우지 못하는 경우가 있다(클릭으로 수식만 선택된 경우 포함).
  if (!range.collapsed) {
    if (!range.cloneContents().querySelector('math')) return false;
    e.preventDefault();
    range.deleteContents();
    return true;
  }

  const target = e.key === 'Backspace'
    ? adjacentNode(range, root, 'prev')
    : adjacentNode(range, root, 'next');
  if (!target || target.nodeType !== Node.ELEMENT_NODE || target.localName !== 'math') {
    return false;
  }
  e.preventDefault();
  target.remove();
  return true;
}

/** 캐럿 경계 바로 앞(prev)/뒤(next)의 노드를 찾는다. 빈 텍스트 노드는 건너뛴다. */
function adjacentNode(range, root, dir) {
  let node = range.startContainer;
  const offset = range.startOffset;
  const prev = dir === 'prev';

  if (node.nodeType === Node.TEXT_NODE) {
    // 텍스트 중간이면 인접 요소가 아니다(네이티브 글자 삭제).
    if (prev ? offset > 0 : offset < node.length) return null;
  } else {
    const child = prev ? node.childNodes[offset - 1] : node.childNodes[offset];
    if (child) return skipEmptyText(child, prev);
  }
  // 컨테이너 경계 — 형제가 나올 때까지 조상으로 올라간다.
  while (node && node !== root) {
    const sibling = prev ? node.previousSibling : node.nextSibling;
    if (sibling) return skipEmptyText(sibling, prev);
    node = node.parentNode;
  }
  return null;
}

function skipEmptyText(node, prev) {
  while (node && node.nodeType === Node.TEXT_NODE && node.textContent.length === 0) {
    node = prev ? node.previousSibling : node.nextSibling;
  }
  return node;
}

/**
 * 수식 다이얼로그를 연다.
 * @param {object} ctx Editor._ctx() — selection, onChange
 * @param {Element|null} [existing] 재편집할 기존 <math> 요소(더블클릭 진입)
 */
export function openFormulaDialog(ctx, existing = null) {
  ctx.selection.save();
  const initialLatex = existing ? existing.getAttribute('data-we-formula') || '' : '';
  const initialBlock = existing ? existing.getAttribute('display') === 'block' : false;

  const dialog = new Dialog({
    title: existing ? '수식 편집' : '수식 삽입',
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      // LaTeX 입력.
      const field = document.createElement('div');
      field.className = 'we-field';
      const id = `we-f-${Math.random().toString(36).slice(2, 8)}`;
      const label = document.createElement('label');
      label.htmlFor = id;
      label.textContent = '수식 (LaTeX)';
      const input = document.createElement('textarea');
      input.id = id;
      input.className = 'we-formula-input';
      input.rows = 3;
      input.setAttribute('placeholder', `예: ${EXAMPLE}`);
      input.setAttribute('spellcheck', 'false');
      input.value = initialLatex;
      field.append(label, input);

      // 라이브 미리보기.
      const previewWrap = document.createElement('div');
      previewWrap.className = 'we-field';
      const previewLabel = document.createElement('span');
      previewLabel.className = 'we-field-caption';
      previewLabel.textContent = '미리보기';
      const preview = document.createElement('div');
      preview.className = 'we-formula-preview we-content';
      preview.setAttribute('aria-live', 'polite');
      previewWrap.append(previewLabel, preview);

      // 블록 수식 옵션.
      const blockLabel = document.createElement('label');
      blockLabel.className = 'we-checkbox';
      const blockCb = document.createElement('input');
      blockCb.type = 'checkbox';
      blockCb.checked = initialBlock;
      blockLabel.append(blockCb, document.createTextNode(' 블록 수식(별도 줄, 가운데 표시)'));

      const error = document.createElement('p');
      error.className = 'we-form-error';
      error.setAttribute('role', 'alert');
      error.hidden = true;

      const renderPreview = () => {
        error.hidden = true;
        preview.textContent = '';
        const latex = input.value.trim();
        if (!latex) {
          preview.dataset.empty = 'true';
          return;
        }
        try {
          preview.appendChild(latexToMathML(latex, { display: blockCb.checked }));
          preview.dataset.empty = 'false';
        } catch (err) {
          preview.dataset.empty = 'true';
          error.textContent = err instanceof Error ? err.message : '수식을 해석할 수 없습니다.';
          error.hidden = false;
        }
      };
      input.addEventListener('input', renderPreview);
      blockCb.addEventListener('change', renderPreview);
      renderPreview();

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      if (existing) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'we-btn we-btn-ghost';
        removeBtn.textContent = '수식 삭제';
        removeBtn.addEventListener('click', () => {
          existing.remove();
          ctx.onChange();
          close();
        });
        actions.appendChild(removeBtn);
      }
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

      form.append(field, previewWrap, blockLabel, error, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        let math;
        try {
          math = latexToMathML(input.value, { display: blockCb.checked });
        } catch (err) {
          error.textContent = err instanceof Error ? err.message : '수식을 해석할 수 없습니다.';
          error.hidden = false;
          input.focus();
          return;
        }
        if (existing) {
          existing.replaceWith(math);
        } else {
          ctx.selection.restore();
          ctx.selection.insertNode(math);
        }
        ctx.onChange();
        close();
      });

      body.appendChild(form);
      // 기존 값이 있으면 바로 수정할 수 있게 전체 선택.
      if (initialLatex) input.select();
    },
  });
  dialog.open();
}
