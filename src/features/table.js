/**
 * 표 삽입.
 *
 * 지정한 행/열 크기의 표를 생성한다. 편집기 CSS 가 기본 테두리를 입히고,
 * 엑셀 붙여넣기로 들어온 표는 셀의 인라인 스타일(색/테두리)을 그대로 보존한다.
 */
import { Dialog } from '../ui/Dialog.js';
import { icons } from '../ui/icons.js';
import { iconButton, textButton } from '../ui/form.js';

const MAX_ROWS = 20;
const MAX_COLS = 10;

/** rows x cols 표 요소를 만든다. 첫 행은 th(헤더). caption 이 있으면 표 제목으로 넣는다. */
function buildTable(rows, cols, withHeader, caption) {
  const table = document.createElement('table');
  table.className = 'we-table';

  // caption 은 table 의 첫 자식이어야 한다(HTML 명세). 텍스트로만 넣어 안전하게 처리.
  const captionText = (caption || '').trim();
  if (captionText) {
    const cap = document.createElement('caption');
    cap.textContent = captionText;
    table.appendChild(cap);
  }

  const tbody = document.createElement('tbody');
  for (let r = 0; r < rows; r += 1) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c += 1) {
      const isHeader = withHeader && r === 0;
      const cell = document.createElement(isHeader ? 'th' : 'td');
      if (isHeader) cell.setAttribute('scope', 'col');
      cell.innerHTML = '<br>';
      tr.appendChild(cell);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/**
 * 표 삽입 다이얼로그(행/열 그리드 선택기).
 * @param {object} ctx
 */
export function openTableDialog(ctx) {
  const { t } = ctx;
  ctx.selection.save();

  const dialog = new Dialog({
    title: t('table.title'),
    closeLabel: t('dialog.close'),
    lang: ctx.locale,
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      const state = { rows: 2, cols: 2 };

      const preview = document.createElement('div');
      preview.className = 'we-table-size';
      preview.setAttribute('aria-live', 'polite');

      const rowsField = numberField(t('table.rows'), 2, MAX_ROWS, (v) => {
        state.rows = v;
        updatePreview();
      });
      const colsField = numberField(t('table.cols'), 2, MAX_COLS, (v) => {
        state.cols = v;
        updatePreview();
      });

      const captionField = textField(t('table.caption'), t('table.captionPlaceholder'));

      const headerLabel = document.createElement('label');
      headerLabel.className = 'we-checkbox';
      const headerCb = document.createElement('input');
      headerCb.type = 'checkbox';
      headerCb.checked = true;
      headerLabel.append(headerCb, document.createTextNode(` ${t('table.headerRow')}`));

      const actions = document.createElement('div');
      actions.className = 'we-form-actions';
      const cancel = textButton(t('dialog.cancel'), 'we-btn-secondary', () => close());
      const submit = iconButton({ icon: icons.check, text: t('dialog.insert'), className: 'we-btn-primary', type: 'submit' });
      actions.append(cancel, submit);

      function updatePreview() {
        preview.textContent = t('table.preview', { rows: state.rows, cols: state.cols });
      }
      updatePreview();

      form.append(rowsField.wrap, colsField.wrap, captionField.wrap, headerLabel, preview, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        ctx.selection.restore();
        const table = buildTable(state.rows, state.cols, headerCb.checked, captionField.input.value);
        ctx.selection.insertNode(table);
        // 표 뒤에 빈 문단을 두어 커서가 표 밖으로 나올 수 있게 한다.
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        table.after(p);
        ctx.onChange();
        close();
      });

      body.appendChild(form);
    },
  });
  dialog.open();
}

function textField(labelText, placeholder) {
  const wrap = document.createElement('div');
  wrap.className = 'we-field';
  const id = `we-cap-${Math.random().toString(36).slice(2, 8)}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  if (placeholder) input.placeholder = placeholder;
  wrap.append(label, input);
  return { wrap, input };
}

function numberField(labelText, value, max, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'we-field we-field-inline';
  const id = `we-n-${Math.random().toString(36).slice(2, 8)}`;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'number';
  input.min = '1';
  input.max = String(max);
  input.value = String(value);
  input.addEventListener('input', () => {
    let v = parseInt(input.value, 10);
    if (Number.isNaN(v)) return;
    v = Math.max(1, Math.min(max, v));
    onChange(v);
  });
  wrap.append(label, input);
  return { wrap, input };
}
