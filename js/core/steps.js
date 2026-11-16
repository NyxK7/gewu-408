// 「按步骤讲」类课程的通用拼装：大部分新课都是「算一步、画一步、讲一步」，
// 这里统一生成 kit（表格列、解析弹窗）和每一步的 events，课程文件只管算和画。
import { boardKit, res } from './board.js';
import { L, T, esc } from './i18n.js';

const f1 = (v) => (+v).toFixed(1);

/** 平面的格子：左上角在原点，w × h；tone 着色，text 居中 */
export function cell(w, h, text = '', { tone = '', cls = '', size = 12, anchor = 'middle' } = {}) {
  const tx = anchor === 'start' ? 8 : anchor === 'end' ? w - 8 : w / 2;
  return `<g class="cellg ${tone ? `c-${tone} has-tone` : ''} ${cls}"><rect class="cellr" x="0" y="0" width="${f1(w)}" height="${f1(h)}" rx="4"/>${text !== '' ? `<text class="cellt" x="${f1(tx)}" y="${f1(h / 2 + size * 0.36)}" text-anchor="${anchor}" style="font-size:${size}px">${esc(text)}</text>` : ''}</g>`;
}

/** 以原点为中心的平面格子（进程、请求这类会移动的小块用它） */
export function chip(w, h, text = '', opt = {}) {
  return `<g transform="translate(${f1(-w / 2)} ${f1(-h / 2)})">${cell(w, h, text, opt)}</g>`;
}

/** 平面的圆形结点（树、图的顶点），圆心在 (0, dy) */
export function node(text, { tone = '', cls = '', r = 19, dy = 0, size = 14 } = {}) {
  return `<g transform="translate(0 ${f1(dy)})"><g class="tn ${tone ? `c-${tone} has-tone` : ''} ${cls}"><circle r="${r}"/><text class="tn-t" x="0" y="${f1(size * 0.36)}" style="font-size:${size}px">${esc(text)}</text></g></g>`;
}

/** 带箭头的线（marker 用 currentColor 不可靠，直接画三角） */
export function arrow(x1, y1, x2, y2, cls = '') {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const hx = x2 - ux * 9;
  const hy = y2 - uy * 9;
  return `<g class="barw ${cls}"><line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(hx)}" y2="${f1(hy)}"/><path d="M${f1(x2)},${f1(y2)} L${f1(hx - uy * 5)},${f1(hy + ux * 5)} L${f1(hx + uy * 5)},${f1(hy - ux * 5)} Z"/></g>`;
}

/** 通用 kit：表格「序号 / 步骤 / 结果 / 说明」，解析弹窗显示这一步的讲解和数据 */
export function stepKit({ spec, rowsName = T('计算步骤', 'Steps'), cols, cells, ...rest }) {
  return boardKit({
    spec,
    rowsName,
    emptyRows: T('按「播放」或「单步」，每一步都会记在这里。点任意一行看这一步的详细说明。', 'Press Play or Step; every step is logged here. Click a row for its details.'),
    cols: cols ?? [
      { label: T('序号', 'No.'), cls: 'col-no' },
      { label: T('步骤', 'Step'), cls: 'col-op' },
      { label: T('结果', 'Result'), cls: 'col-res' },
      { label: T('说明', 'Details'), cls: 'col-info' },
    ],
    cells:
      cells ??
      ((ev, idx) => [`<i class="dot"></i>${idx + 1}`, esc(L(ev.what)), ev.result != null ? res(ev.tone ?? 'info', ev.result) : '', esc(L(ev.info ?? ev.desc ?? ''))]),
    decode: (ev) => ({
      label: T('步骤解析', 'Step details'),
      tag: { color: ev.color ?? 'slate', text: ev.tag ?? T('步骤', 'Step') },
      title: L(ev.what),
      meta: ev.meta ?? [],
      hint: '',
      view: { kind: 'none' },
      layers: [
        { name: T('说明', 'Explanation'), summary: '', start: 0, end: 0, open: true, fields: [{ label: T('过程', 'Details'), value: ev.detail, start: 0, end: 0, note: true }] },
        ...(ev.facts?.length ? [{ name: T('数据', 'Data'), summary: '', start: 0, end: 0, open: true, fields: ev.facts.map(([k, v]) => ({ label: k, value: v, start: 0, end: 0 })) }] : []),
      ],
    }),
    ...rest,
  });
}

/**
 * 把「步骤描述」变成 player 认识的 steps。
 *   list:  [{ title, desc, detail, ref, facts, row: { color, what, result, tone, info, tag }, note: { at, text, tone }, snap, ms }]
 *   board: (k, z) => 画板图元（第 k 步之后的样子；k = -1 是开始前），z 为 true 表示中文
 */
export function toSteps(list, board) {
  const boardEv = (k, ms) => ({ type: 'board', items: board(k, true), itemsEn: board(k, false), ms });
  const steps = list.map((s, k) => ({
    title: s.title,
    desc: s.desc ?? '',
    detail: s.detail,
    ref: s.ref,
    facts: s.facts ?? [],
    events: [
      ...(s.pre ?? []),
      boardEv(k, s.ms),
      ...(s.note ? [{ type: 'note', ...s.note }] : []),
      ...(s.row ? [{ type: 'row', desc: s.desc, ...s.row, detail: s.detail, facts: s.facts, what: s.row.what ?? s.title }] : []),
      ...(s.snap !== undefined ? [{ type: 'snap', snap: s.snap }] : []),
      ...(s.post ?? []),
    ],
  }));
  return { steps, start: [boardEv(-1)] };
}

/** 错误信息（带 {变量}）翻成双语 */
export const errOf = (ERR, list) =>
  list.map((e) => {
    const [k, v] = Array.isArray(e) ? e : [e, {}];
    const fill = (s) => Object.entries(v ?? {}).reduce((a, [x, y]) => a.replaceAll(`{${x}}`, y), s);
    const m = ERR[k] ?? T(k, k);
    return { zh: fill(m.zh), en: fill(m.en) };
  });
