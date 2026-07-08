/**
 * 표 삽입.
 *
 * 지정한 행/열 크기의 표를 생성한다. 편집기 CSS 가 기본 테두리를 입히고,
 * 엑셀 붙여넣기로 들어온 표는 셀의 인라인 스타일(색/테두리)을 그대로 보존한다.
 */
import { Dialog } from '../ui/Dialog.js';
import { icons } from '../ui/icons.js';

const MAX_ROWS = 20;
const MAX_COLS = 10;

/** rows x cols 표 요소를 만든다. 첫 행은 th(헤더). */
function buildTable(rows, cols, withHeader) {
  const table = document.createElement('table');
  table.className = 'we-table';

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
  ctx.selection.save();

  const dialog = new Dialog({
    title: '표 삽입',
    render: (body, close) => {
      const form = document.createElement('form');
      form.className = 'we-form';

      const state = { rows: 2, cols: 2 };

      const preview = document.createElement('div');
      preview.className = 'we-table-size';
      preview.setAttribute('aria-live', 'polite');

      const rowsField = numberField('행', 2, MAX_ROWS, (v) => {
        state.rows = v;
        updatePreview();
      });
      const colsField = numberField('열', 2, MAX_COLS, (v) => {
        state.cols = v;
        updatePreview();
      });

      const headerLabel = document.createElement('label');
      headerLabel.className = 'we-checkbox';
      const headerCb = document.createElement('input');
      headerCb.type = 'checkbox';
      headerCb.checked = true;
      headerLabel.append(headerCb, document.createTextNode(' 첫 행을 헤더로'));

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
      submit.innerHTML = `${icons.check}<span>삽입</span>`;
      actions.append(cancel, submit);

      function updatePreview() {
        preview.textContent = `${state.rows} 행 × ${state.cols} 열`;
      }
      updatePreview();

      form.append(rowsField.wrap, colsField.wrap, headerLabel, preview, actions);

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        ctx.selection.restore();
        const table = buildTable(state.rows, state.cols, headerCb.checked);
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
