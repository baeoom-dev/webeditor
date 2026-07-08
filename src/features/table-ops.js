/**
 * 표 구조 편집 연산 (순수 DOM).
 *
 * colspan/rowspan 을 정확히 다루기 위해 표를 가상 그리드(matrix[r][c])로 매핑한 뒤
 * 조작한다. 모든 함수는 표 DOM 을 직접 변형한다 — 네이티브 execCommand undo 스택에는
 * 남지 않으므로, 호출부가 변경 콜백(onChange)으로 상태를 반영해야 한다.
 */

const CELL_TAGS = /^(TD|TH)$/;
const EMPTY_CELL = '<br>';

/** thead/tbody/tfoot 를 통합해 tr 을 DOM 순서로 반환한다. */
function tableRows(table) {
  return Array.from(table.querySelectorAll(':scope > tr, :scope > * > tr'));
}

/** 새 빈 셀을 만든다. */
function makeCell(tag) {
  const el = document.createElement(tag === 'th' ? 'th' : 'td');
  el.innerHTML = EMPTY_CELL;
  return el;
}

/** 행의 셀(td/th) DOM 자식만 반환한다. */
function rowCells(tr) {
  return Array.from(tr.children).filter((n) => CELL_TAGS.test(n.tagName));
}

/**
 * 표를 가상 그리드로 매핑한다.
 * @returns {{ rows: HTMLTableRowElement[], matrix: Array<Array<{cell:Element,startRow:number,startCol:number}>>, cols: number, totalRows: number }}
 */
export function buildGrid(table) {
  const rows = tableRows(table);
  const matrix = [];
  rows.forEach((tr, r) => {
    if (!matrix[r]) matrix[r] = [];
    let c = 0;
    for (const cell of rowCells(tr)) {
      while (matrix[r][c]) c += 1; // 위에서 내려온 span 이 차지한 칸 건너뜀
      const cs = cell.colSpan || 1;
      const rs = cell.rowSpan || 1;
      for (let dr = 0; dr < rs; dr += 1) {
        for (let dc = 0; dc < cs; dc += 1) {
          if (!matrix[r + dr]) matrix[r + dr] = [];
          matrix[r + dr][c + dc] = { cell, startRow: r, startCol: c };
        }
      }
      c += cs;
    }
  });
  const cols = matrix.reduce((m, row) => Math.max(m, row.length), 0);
  return { rows, matrix, cols, totalRows: rows.length };
}

/** 특정 셀의 그리드 앵커 좌표를 찾는다(없으면 null). */
export function cellCoords(grid, cell) {
  for (let r = 0; r < grid.matrix.length; r += 1) {
    const row = grid.matrix[r] || [];
    for (let c = 0; c < row.length; c += 1) {
      const e = row[c];
      if (e && e.cell === cell && e.startRow === r && e.startCol === c) return { r, c };
    }
  }
  return null;
}

/** 커서/선택에서 가장 가까운 셀을 찾는다(표 root 안). */
export function closestCell(node, root) {
  let n = node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE && CELL_TAGS.test(n.tagName)) return n;
    n = n.parentNode;
  }
  return null;
}

/* ---------- 행 ---------- */

/** 기준 셀의 위/아래에 행을 삽입한다. */
export function insertRow(table, refCell, where) {
  const grid = buildGrid(table);
  const coords = cellCoords(grid, refCell);
  if (!coords) return;
  const newIndex = where === 'above' ? coords.r : coords.r + (refCell.rowSpan || 1);
  const above = newIndex - 1;
  const below = newIndex;
  const tr = document.createElement('tr');
  const extended = new Set();

  let c = 0;
  while (c < grid.cols) {
    const aEntry = above >= 0 ? grid.matrix[above]?.[c] : null;
    const bEntry = below < grid.totalRows ? grid.matrix[below]?.[c] : null;
    if (aEntry && bEntry && aEntry.cell === bEntry.cell) {
      // 삽입선을 세로로 가로지르는 셀 → rowspan 확장(셀당 1회).
      if (!extended.has(aEntry.cell)) {
        aEntry.cell.rowSpan = (aEntry.cell.rowSpan || 1) + 1;
        extended.add(aEntry.cell);
      }
      c += aEntry.cell.colSpan || 1;
    } else {
      tr.appendChild(makeCell('td'));
      c += 1;
    }
  }

  const refRow = grid.rows[newIndex];
  if (refRow) refRow.parentNode.insertBefore(tr, refRow);
  else {
    const last = grid.rows[grid.totalRows - 1];
    last.parentNode.appendChild(tr);
  }
}

/** 기준 셀이 속한 행을 삭제한다(마지막 행이면 표 전체 삭제). */
export function deleteRow(table, refCell) {
  const grid = buildGrid(table);
  const coords = cellCoords(grid, refCell);
  if (!coords) return;
  if (grid.totalRows <= 1) return deleteTable(table);

  const r = coords.r;
  const tr = grid.rows[r];
  const nextTr = grid.rows[r + 1] || null;
  const nextOriginal = nextTr ? rowCells(nextTr) : [];
  const handled = new Set();

  for (let c = 0; c < grid.cols; c += 1) {
    const e = grid.matrix[r]?.[c];
    if (!e || handled.has(e.cell)) continue;
    handled.add(e.cell);
    const cell = e.cell;
    if (e.startRow < r) {
      // 위에서 내려온 span → rowspan 감소.
      cell.rowSpan = (cell.rowSpan || 1) - 1;
    } else if ((cell.rowSpan || 1) > 1 && nextTr) {
      // 이 행에 앵커된 다세로 셀 → 아래 행으로 밀어내고 rowspan 감소.
      cell.rowSpan = (cell.rowSpan || 1) - 1;
      const ref = nextOriginal.find((rc) => {
        const cc = cellCoords(grid, rc);
        return cc && cc.c >= e.startCol;
      });
      nextTr.insertBefore(cell, ref || null);
    }
    // rowSpan==1 이고 이 행 앵커면 tr.remove() 로 함께 사라짐.
  }
  tr.remove();
}

/* ---------- 열 ---------- */

/** 기준 셀의 왼쪽/오른쪽에 열을 삽입한다. */
export function insertColumn(table, refCell, where) {
  const grid = buildGrid(table);
  const coords = cellCoords(grid, refCell);
  if (!coords) return;
  const newCol = where === 'left' ? coords.c : coords.c + (refCell.colSpan || 1);
  const left = newCol - 1;
  const extended = new Set();

  for (let r = 0; r < grid.totalRows; r += 1) {
    const lEntry = left >= 0 ? grid.matrix[r]?.[left] : null;
    const rEntry = grid.matrix[r]?.[newCol] || null;
    if (lEntry && rEntry && lEntry.cell === rEntry.cell) {
      // 삽입선을 가로로 가로지르는 셀 → colspan 확장(셀당 1회).
      if (!extended.has(lEntry.cell)) {
        lEntry.cell.colSpan = (lEntry.cell.colSpan || 1) + 1;
        extended.add(lEntry.cell);
      }
      continue;
    }
    const tr = grid.rows[r];
    const ref = rowCells(tr).find((child) => {
      const cc = cellCoords(grid, child);
      return cc && cc.c >= newCol;
    });
    const sample = grid.matrix[r]?.[coords.c]?.cell;
    const isHeader = sample && sample.tagName === 'TH';
    const cell = makeCell(isHeader ? 'th' : 'td');
    if (isHeader) cell.setAttribute('scope', 'col');
    tr.insertBefore(cell, ref || null);
  }
}

/** 기준 셀이 속한 열을 삭제한다(마지막 열이면 표 전체 삭제). */
export function deleteColumn(table, refCell) {
  const grid = buildGrid(table);
  const coords = cellCoords(grid, refCell);
  if (!coords) return;
  if (grid.cols <= 1) return deleteTable(table);

  const col = coords.c;
  const handled = new Set();
  for (let r = 0; r < grid.totalRows; r += 1) {
    const e = grid.matrix[r]?.[col];
    if (!e || handled.has(e.cell)) continue;
    handled.add(e.cell);
    const cell = e.cell;
    if ((cell.colSpan || 1) > 1) cell.colSpan = (cell.colSpan || 1) - 1;
    else cell.remove();
  }
}

/* ---------- 사각형 영역 ---------- */

/** 경계 상자에 걸친 셀이 밖으로 삐져나오면 상자를 사각형으로 확장한다(제자리 변형). */
function stabilizeBox(grid, box) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = box.r1; r <= box.r2; r += 1) {
      for (let c = box.c1; c <= box.c2; c += 1) {
        const e = grid.matrix[r]?.[c];
        if (!e) continue;
        const er2 = e.startRow + (e.cell.rowSpan || 1) - 1;
        const ec2 = e.startCol + (e.cell.colSpan || 1) - 1;
        if (e.startRow < box.r1) { box.r1 = e.startRow; changed = true; }
        if (e.startCol < box.c1) { box.c1 = e.startCol; changed = true; }
        if (er2 > box.r2) { box.r2 = er2; changed = true; }
        if (ec2 > box.c2) { box.c2 = ec2; changed = true; }
      }
    }
  }
  return box;
}

/** 상자가 덮는 고유 셀 목록을 반환한다. */
function cellsInBox(grid, box) {
  const out = [];
  const seen = new Set();
  for (let r = box.r1; r <= box.r2; r += 1) {
    for (let c = box.c1; c <= box.c2; c += 1) {
      const cell = grid.matrix[r]?.[c]?.cell;
      if (cell && !seen.has(cell)) { seen.add(cell); out.push(cell); }
    }
  }
  return out;
}

/** 두 셀을 대각으로 하는 사각형 영역이 덮는 모든 셀을 반환한다(span 확장 포함). */
export function cellsInRect(table, cellA, cellB) {
  const grid = buildGrid(table);
  const a = cellCoords(grid, cellA);
  const b = cellCoords(grid, cellB);
  if (!a || !b) return [];
  const box = stabilizeBox(grid, {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r + (cellA.rowSpan || 1) - 1, b.r + (cellB.rowSpan || 1) - 1),
    c2: Math.max(a.c + (cellA.colSpan || 1) - 1, b.c + (cellB.colSpan || 1) - 1),
  });
  return cellsInBox(grid, box);
}

/* ---------- 병합 / 분할 ---------- */

/** 선택한 셀들을 사각형 영역으로 병합한다. */
export function mergeCells(table, cells) {
  if (cells.length < 2) return null;
  const grid = buildGrid(table);

  const box = { r1: Infinity, c1: Infinity, r2: -1, c2: -1 };
  for (const cell of cells) {
    const cc = cellCoords(grid, cell);
    if (!cc) continue;
    box.r1 = Math.min(box.r1, cc.r);
    box.c1 = Math.min(box.c1, cc.c);
    box.r2 = Math.max(box.r2, cc.r + (cell.rowSpan || 1) - 1);
    box.c2 = Math.max(box.c2, cc.c + (cell.colSpan || 1) - 1);
  }
  if (box.r2 < 0) return null;
  stabilizeBox(grid, box);
  const { r1, c1, r2, c2 } = box;

  const anchor = grid.matrix[r1]?.[c1]?.cell;
  if (!anchor) return null;

  const moved = new Set([anchor]);
  const parts = [];
  for (let r = r1; r <= r2; r += 1) {
    for (let c = c1; c <= c2; c += 1) {
      const cell = grid.matrix[r]?.[c]?.cell;
      if (!cell || moved.has(cell)) continue;
      moved.add(cell);
      if (cell.textContent.trim() || cell.querySelector('img, table')) parts.push(cell.innerHTML);
      cell.remove();
    }
  }

  const span = (r2 - r1 + 1) * (c2 - c1 + 1);
  setSpan(anchor, 'colSpan', c2 - c1 + 1);
  setSpan(anchor, 'rowSpan', r2 - r1 + 1);
  if (parts.length) {
    const anchorEmpty = anchor.textContent.trim() === '' && !anchor.querySelector('img, table');
    anchor.innerHTML = anchorEmpty ? parts.join('<br>') : `${anchor.innerHTML}<br>${parts.join('<br>')}`;
  }
  return span > 1 ? anchor : null;
}

/** 병합된 셀을 원래 칸 수만큼 되돌린다. */
export function splitCell(table, cell) {
  const cs = cell.colSpan || 1;
  const rs = cell.rowSpan || 1;
  if (cs === 1 && rs === 1) return;

  const grid = buildGrid(table);
  const coords = cellCoords(grid, cell);
  if (!coords) return;
  const { r: r1, c: c1 } = coords;
  const tag = cell.tagName === 'TH' ? 'th' : 'td';

  cell.removeAttribute('colspan');
  cell.removeAttribute('rowspan');

  // 앵커 행: 앵커 뒤에 (cs-1) 개.
  let after = cell;
  for (let i = 1; i < cs; i += 1) {
    const nc = makeCell(tag);
    grid.rows[r1].insertBefore(nc, after.nextSibling);
    after = nc;
  }
  // 이후 행들: 각 행의 c1 위치에 cs 개.
  for (let r = r1 + 1; r <= r1 + rs - 1; r += 1) {
    const tr = grid.rows[r];
    const ref = rowCells(tr).find((child) => {
      const cc = cellCoords(grid, child);
      return cc && cc.c >= c1;
    });
    for (let i = 0; i < cs; i += 1) tr.insertBefore(makeCell(tag), ref || null);
  }
}

/* ---------- 표 삭제 / 셀 서식 ---------- */

/** 표를 삭제한다. 뒤에 문단이 없으면 빈 문단을 남겨 커서 위치를 확보한다. */
export function deleteTable(table) {
  if (!table.nextElementSibling) {
    const p = document.createElement('p');
    p.innerHTML = EMPTY_CELL;
    table.after(p);
  }
  table.remove();
}

/**
 * 표 캡션을 설정/수정/삭제한다. text 가 비어 있으면 캡션을 제거한다.
 * caption 은 table 의 첫 자식이어야 한다(HTML 명세). 텍스트로만 넣어 안전하게 처리.
 * @returns {HTMLElement|null} 설정된 caption(제거 시 null)
 */
export function setCaption(table, text) {
  const trimmed = (text || '').trim();
  let cap = table.querySelector(':scope > caption');
  if (!trimmed) {
    if (cap) cap.remove();
    return null;
  }
  if (!cap) {
    cap = document.createElement('caption');
    table.insertBefore(cap, table.firstChild);
  }
  cap.textContent = trimmed;
  return cap;
}

/** 셀 목록에 인라인 스타일을 적용한다(새니타이저 화이트리스트 내 속성만). */
export function styleCells(cells, prop, value) {
  for (const cell of cells) {
    if (value) cell.style[prop] = value;
    else cell.style.removeProperty(prop);
  }
}

/** colSpan/rowSpan 을 설정하되 1 이면 속성을 제거한다. */
function setSpan(cell, prop, value) {
  if (value > 1) cell[prop] = value;
  else cell.removeAttribute(prop === 'colSpan' ? 'colspan' : 'rowspan');
}
