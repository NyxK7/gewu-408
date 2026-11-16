// 画板类课程（页面置换、甘特图、散列表、堆……）共用的绘图小件和 kit 模板。
// 每个图元都画在原点附近，由 scene.setBoard 平移到位；颜色走 c-xxx 类（--pc）。
import { L, T, esc } from './i18n.js';
import { box, proj } from './iso.js';
import { bindForm, formHtml } from './params.js';

const P0 = proj(0, 0);
const f1 = (v) => v.toFixed(1);

/** 立方块：底面中心在原点，w × d × h；顶面中央写字 */
export function cube(w, d, h, { tone = '', cls = '', text = '', size = 12 } = {}) {
  const b = box(P0, -w / 2, -d / 2, 0, w, d, h, 'blk');
  const [, ty] = P0(0, 0, h);
  const t = text !== '' ? `<text class="blk-t" x="0" y="${f1(ty + size * 0.36)}" text-anchor="middle" style="font-size:${size}px">${esc(text)}</text>` : '';
  return `<g class="blkg ${tone ? `c-${tone} has-tone` : ''} ${cls}">${b.svg}${t}</g>`;
}

/** 托盘（数组格子 / 内存块）：薄板加一圈沿 */
export function tray(w, d, { cls = '' } = {}) {
  const base = box(P0, -w / 2, -d / 2, 0, w, d, 3, 'tray');
  return `<g class="trayg ${cls}">${base.svg}</g>`;
}

/** 斜二测的立体条（甘特图、拥塞窗口柱）：正面 w × h，左下角在原点，向右上方挤出 d */
export function bar(w, h, { tone = '', cls = '', d = 9, text = '' } = {}) {
  const dx = d * 0.87;
  const dy = -d * 0.5;
  const front = `0,0 ${f1(w)},0 ${f1(w)},${f1(-h)} 0,${f1(-h)}`;
  const top = `0,${f1(-h)} ${f1(w)},${f1(-h)} ${f1(w + dx)},${f1(-h + dy)} ${f1(dx)},${f1(-h + dy)}`;
  const side = `${f1(w)},0 ${f1(w + dx)},${f1(dy)} ${f1(w + dx)},${f1(-h + dy)} ${f1(w)},${f1(-h)}`;
  const t = text !== '' ? `<text class="bar-t" x="${f1(w / 2)}" y="${f1(-h / 2 + 4)}" text-anchor="middle">${esc(text)}</text>` : '';
  return `<g class="barg ${tone ? `c-${tone} has-tone` : ''} ${cls}"><polygon class="f-left blk" points="${front}"/><polygon class="f-top blk" points="${top}"/><polygon class="f-right blk" points="${side}"/>${t}</g>`;
}

/** 文字 */
export const txt = (x, y, s, cls = '', anchor = 'middle') => `<text class="bt ${cls}" x="${f1(x)}" y="${f1(y)}" text-anchor="${anchor}">${esc(s)}</text>`;

/** 线 */
export const line = (x1, y1, x2, y2, cls = '') => `<line class="bl ${cls}" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`;

/** 向下的小箭头（指针） */
export const arrowUp = (cls = '') => `<path class="barrow ${cls}" d="M0,-10 L7,2 L2,2 L2,14 L-2,14 L-2,2 L-7,2 Z"/>`;

/** 画板类课程的 kit 模板：没有拓扑、没有时序图，参数用通用表单 */
export function boardKit({ spec, ...rest }) {
  return {
    topo: { nodes: {}, edges: [] },
    noSeq: true,
    wide: true,
    viewName: T('示意图', 'Diagram'),
    diagramName: T('示意图', 'Diagram'),
    overview: (lesson) => formHtml(spec, lesson),
    bindOverview: (box, lesson, ctx) => bindForm(box, spec, lesson, ctx),
    spec, // 参数表（测试里遍历各参数的边界值要用）
    ...rest,
  };
}

/** 一行文字结果标签（表格「结果」列） */
export const res = (tone, text) => `<span class="res res-${tone}">${esc(L(text))}</span>`;

/** 分数：约分后的 a/b，以及两位小数 */
export function frac(a, b) {
  const g = (x, y) => (y ? g(y, x % y) : x);
  const k = g(Math.abs(a), Math.abs(b)) || 1;
  const [p, q] = [a / k, b / k];
  const dec = +(a / b).toFixed(2);
  return q === 1 ? String(p) : `${p}/${q} ≈ ${dec}`;
}
