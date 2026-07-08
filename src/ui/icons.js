/**
 * 툴바용 인라인 SVG 아이콘.
 *
 * 각 아이콘은 `currentColor` 를 사용해 CSS 로 색을 제어한다.
 * `aria-hidden="true"` 로 스크린리더에서 감춘다(버튼의 aria-label 이 의미 전달).
 */

const svg = (paths) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ` +
  `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ` +
  `focusable="false">${paths}</svg>`;

export const icons = {
  bold: svg('<path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/>'),
  italic: svg('<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>'),
  underline: svg('<path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/>'),
  strike: svg('<line x1="4" y1="12" x2="20" y2="12"/><path d="M16 6c-.7-1.3-2.2-2-4-2-2.8 0-4.5 1.4-4.5 3.3 0 1 .5 1.8 1.4 2.4"/><path d="M8.5 16c.6 1.4 2.2 2 3.9 2 2.8 0 4.6-1.3 4.6-3.4"/>'),
  fontSize: svg('<path d="M3 7V5h10v2"/><path d="M8 5v13"/><path d="M14 12v-2h7v2"/><path d="M17.5 10v8"/>'),
  color: svg('<path d="M4 20h16"/><path d="M7 16 12 4l5 12"/><path d="M8.5 12h7"/>'),
  bgColor: svg('<path d="M4 20h16v1H4z" fill="currentColor" stroke="none"/><path d="M9 3 5 11h8L9 3z"/><path d="M13 11l4-4 3 3-4 4z"/>'),
  ul: svg('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>'),
  ol: svg('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><path d="M4 6V3l-1 .7"/><path d="M3 10h2l-2 3h2"/><path d="M3 17h2v3H3"/>'),
  alignLeft: svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>'),
  alignCenter: svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="5" y1="18" x2="19" y2="18"/>'),
  alignRight: svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="6" y1="18" x2="20" y2="18"/>'),
  alignJustify: svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>'),
  indent: svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><path d="M3 10l4 2-4 2z" fill="currentColor" stroke="none"/>'),
  outdent: svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><path d="M7 10l-4 2 4 2z" fill="currentColor" stroke="none"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  unlink: svg('<path d="M17 7l3-3a4.5 4.5 0 0 0-6-6"/><path d="M7 17l-3 3"/><line x1="2" y1="2" x2="22" y2="22"/><path d="M9 15l-2 2"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M4 17l5-5 4 4 3-3 4 4"/>'),
  table: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/>'),
  emoji: svg('<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'),
  code: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  codeInline: svg('<path d="M8 4c-2 0-3 1-3 3v2c0 1-.6 2-2 2 1.4 0 2 1 2 2v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1 .6 2 2 2-1.4 0-2 1-2 2v2c0 2-1 3-3 3"/>'),
  codeBlock: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><polyline points="9 10 7 12 9 14"/><polyline points="13 10 15 12 13 14"/>'),
  clear: svg('<path d="M4 7h16"/><path d="M10 7l-.5 12"/><path d="M14 7l.5 12"/><path d="M7 4h10l-1 3H8z"/>'),
  undo: svg('<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 1 3 7"/>'),
  redo: svg('<path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 0-3 7"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  // 표 편집.
  rowInsertAbove: svg('<rect x="3" y="12" width="18" height="8" rx="1"/><line x1="3" y1="16" x2="21" y2="16"/><line x1="12" y1="3" x2="12" y2="9"/><line x1="9" y1="6" x2="15" y2="6"/>'),
  rowInsertBelow: svg('<rect x="3" y="4" width="18" height="8" rx="1"/><line x1="3" y1="8" x2="21" y2="8"/><line x1="12" y1="15" x2="12" y2="21"/><line x1="9" y1="18" x2="15" y2="18"/>'),
  rowDelete: svg('<rect x="3" y="9" width="18" height="6" rx="1"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="16" y1="3" x2="22" y2="3"/>'),
  colInsertLeft: svg('<rect x="12" y="3" width="8" height="18" rx="1"/><line x1="16" y1="3" x2="16" y2="21"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="6" y1="9" x2="6" y2="15"/>'),
  colInsertRight: svg('<rect x="4" y="3" width="8" height="18" rx="1"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="15" y1="12" x2="21" y2="12"/><line x1="18" y1="9" x2="18" y2="15"/>'),
  colDelete: svg('<rect x="9" y="3" width="6" height="18" rx="1"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="16" x2="3" y2="22"/>'),
  mergeCells: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="20"/><polyline points="8 10 10 12 8 14"/><polyline points="16 10 14 12 16 14"/>'),
  splitCell: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/><polyline points="7 9 5 12 7 15"/><polyline points="17 9 19 12 17 15"/>'),
  trash: svg('<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>'),
};
