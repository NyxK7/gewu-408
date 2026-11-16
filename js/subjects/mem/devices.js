// 访存课的部件：CPU、TLB、页表、Cache、主存（DRAM）、磁盘。全部由等距盒子拼成。
// 页表画在主存的底板上 —— 它本来就是主存里的一块数据。
import { T } from '../../core/i18n.js';
import { box, isoCircle, pline, proj, quad, shadow } from '../../core/iso.js';

const BOARD_Z = 8;

function cpu(ax, ay) {
  const P = proj(ax, ay);
  const w = 76;
  const x0 = -w / 2;
  let s = shadow(P, x0, x0, w, w, 12);
  const sub = box(P, x0, x0, 0, w, w, 6, 'pcb');
  s += sub.svg;
  for (let i = 0; i < 9; i++) {
    s += quad(sub.left, 6 + i * 7.6, 1.4, 3.6, 3.2, 'class="pin"');
    s += quad(sub.right, 6 + i * 7.6, 1.4, 3.6, 3.2, 'class="pin"');
  }
  const die = box(P, x0 + 13, x0 + 13, 6, w - 26, w - 26, 8);
  s += die.svg;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) s += quad(die.top, 5 + i * 21.5, 5 + j * 21.5, 17.5, 17.5, `class="core${i + j === 0 ? ' core-on' : ''}"`);
  for (let k = 0; k < 4; k++) s += pline([sub.top(8 + k * 4, 6), sub.top(8 + k * 4, 10)], 'class="trace"');
  return s;
}

function tlb(ax, ay) {
  const P = proj(ax, ay);
  const w = 50;
  const d = 40;
  const h = 54;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 22);
  const b = box(P, x0, y0, 0, w, d, h);
  s += b.svg;
  for (let i = 0; i < 6; i++) {
    const v = 6 + i * 7.6;
    s += quad(b.left, 5, v, w - 10, 5.2, `class="entry" style="--i:${i}"`);
    s += quad(b.left, 7, v + 1.3, 3, 2.6, 'class="entry-v"');
  }
  for (let i = 0; i < 6; i++) s += pline([b.right(7, 8 + i * 7.6), b.right(d - 7, 8 + i * 7.6)], 'class="vent"');
  s += quad(b.top, 8, 8, w - 16, d - 16, 'class="tag tag-fast"');
  return s;
}

function pageTable(ax, ay) {
  const P = proj(ax, ay);
  const w = 60;
  const d = 46;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 10, BOARD_Z);
  let top = null;
  for (let i = 0; i < 4; i++) {
    const sh = box(P, x0 + i * 1.2, y0 - i * 1.2, BOARD_Z + i * 5, w, d, 3.6, 'sheet');
    s += sh.svg;
    top = sh.top;
  }
  for (let v = 7; v < d - 3; v += 5.2) s += pline([top(6, v), top(w - 6, v)], 'class="pt-line"');
  s += quad(top, 4, 17.6, w - 8, 5.2, 'class="pt-row"');
  s += pline([top(18, 4), top(18, d - 4)], 'class="pt-col"');
  return s;
}

function dram(ax, ay) {
  const P = proj(ax, ay);
  let s = '';
  const sock = box(P, -38, -24, BOARD_Z, 76, 48, 3, 'socket');
  s += shadow(P, -38, -24, 76, 48, 16, BOARD_Z) + sock.svg;
  for (let k = 0; k < 3; k++) {
    const y = -18 + k * 15;
    const st = box(P, -34, y, BOARD_Z + 3, 68, 3.2, 30, 'stick');
    s += st.svg;
    for (let c = 0; c < 4; c++) s += quad(st.left, 4 + c * 16, 9, 12, 14, 'class="dchip"');
    s += quad(st.left, 3, 1.2, 62, 3.4, 'class="gold"');
  }
  return s;
}

function cacheDev(ax, ay) {
  const P = proj(ax, ay);
  const w = 60;
  const d = 50;
  const h = 24;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 12);
  const b = box(P, x0, y0, 0, w, d, h);
  s += b.svg;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) s += quad(b.top, 6 + i * 12.6, 7 + j * 12.6, 10, 10, `class="cell${j === 1 ? ' cell-on' : ''}"`);
  s += quad(b.left, 4, 15, w - 8, 3.4, 'class="strip-fast"');
  for (let i = 0; i < 4; i++) s += quad(b.left, 6 + i * 6, 6, 3.4, 3.4, `class="led" style="--i:${i}"`);
  for (let i = 0; i < 3; i++) s += pline([b.right(7, 6 + i * 5.5), b.right(d - 7, 6 + i * 5.5)], 'class="vent"');
  return s;
}

function disk(ax, ay) {
  const P = proj(ax, ay);
  const w = 72;
  const d = 56;
  const h = 14;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 12);
  const b = box(P, x0, y0, 0, w, d, h);
  s += b.svg;
  const [cu, cv] = [w * 0.42, d / 2];
  s += isoCircle(b.top, cu, cv, 21, 'class="platter"', 36);
  s += isoCircle(b.top, cu, cv, 13, 'class="platter-ring"', 30);
  s += isoCircle(b.top, cu, cv, 3.6, 'class="spindle"', 14);
  s += pline([b.top(w - 8, 8), b.top(w - 12, d - 14), b.top(cu + 9, cv + 6)], 'class="arm"');
  s += isoCircle(b.top, w - 8, 8, 3.2, 'class="arm-hub"', 12);
  s += quad(b.left, w - 14, 5, 6, 3, 'class="led" style="--i:2"');
  s += quad(b.left, 6, 5, 30, 3, 'class="label-strip"');
  return s;
}

export function drawDevice(n) {
  switch (n.kind) {
    case 'cpu':
      return cpu(n.x, n.y);
    case 'tlb':
      return tlb(n.x, n.y);
    case 'pt':
      return pageTable(n.x, n.y);
    case 'dram':
      return dram(n.x, n.y);
    case 'cache':
      return cacheDev(n.x, n.y);
    case 'disk':
      return disk(n.x, n.y);
    default:
      return '';
  }
}

// ───────────────────────── 布局 ─────────────────────────
// 主存底板沿等距 y 轴摆放：页表在后（右上），DRAM 在前（左下）
const BOARD = [652, 444];
const PB = proj(...BOARD);
const [ptx, pty] = PB(0, -60);
const [mmx, mmy] = PB(0, 62);

// extent：设备（含标签、气泡）相对落地点的包围盒 [左, 上, 右, 下]，用来自动算镜头
export const NODES = {
  cpu: {
    kind: 'cpu', x: 196, y: 452, name: T('CPU', 'CPU'), sub: T('执行访存指令', 'runs the load'),
    extent: [-72, -100, 72, 92], label: { dx: 0, dy: 62, anchor: 'middle' }, note: { dx: 0, dy: -66 }, r: 40,
  },
  tlb: {
    kind: 'tlb', x: 376, y: 336, name: T('TLB', 'TLB'), sub: '',
    extent: [-150, -128, 48, 34], label: { dx: -48, dy: -34, anchor: 'end' }, note: { dx: 0, dy: -104 }, r: 30,
  },
  cache: {
    kind: 'cache', x: 396, y: 566, name: T('Cache', 'Cache'), sub: '',
    extent: [-60, -104, 60, 86], label: { dx: 0, dy: 54, anchor: 'middle' }, note: { dx: 0, dy: -70 }, r: 34,
  },
  pt: {
    kind: 'pt', x: ptx, y: pty, name: T('页表', 'Page table'), sub: '',
    extent: [-200, -112, 186, 126], label: { dx: 52, dy: -46, anchor: 'start' }, note: { dx: 0, dy: -84 }, r: 30, pulseZ: BOARD_Z,
  },
  mem: {
    kind: 'dram', x: mmx, y: mmy, name: T('主存', 'Main memory'), sub: '',
    extent: [-100, -128, 200, 124], label: { dx: 0, dy: 90, anchor: 'middle' }, note: { dx: 0, dy: -72 }, r: 34, pulseZ: BOARD_Z,
  },
  disk: {
    kind: 'disk', x: 892, y: 566, name: T('磁盘', 'Disk'), sub: T('外存 · 交换区', 'swap space'),
    extent: [-64, -96, 64, 86], label: { dx: 0, dy: 54, anchor: 'middle' }, note: { dx: 0, dy: -62 }, r: 40,
  },
};

export const EDGES = [
  ['cpu', 'tlb'],
  ['cpu', 'cache'],
  ['tlb', 'cache'],
  ['tlb', 'pt'],
  ['cache', 'mem'],
  ['mem', 'disk'],
];

/** 主存底板：页表和 DRAM 同在一块板上，说明页表就在主存里 */
export function boardSvg() {
  const [x0, y0, w, d] = [-58, -116, 116, 232];
  const b = box(PB, x0, y0, 0, w, d, BOARD_Z, 'board');
  const inner = [PB(x0 + 7, y0 + 7, BOARD_Z), PB(x0 + w - 7, y0 + 7, BOARD_Z), PB(x0 + w - 7, y0 + d - 7, BOARD_Z), PB(x0 + 7, y0 + d - 7, BOARD_Z)];
  const pts = inner.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return `<g class="decor" data-for="pt mem">${shadow(PB, x0, y0, w, d, 8)}${b.svg}<polygon class="board-line" points="${pts}"/></g>`;
}

/** 首页插图：整套存储层次，静态 */
export function artSvg() {
  const order = Object.entries(NODES).sort((a, b) => a[1].y - b[1].y);
  const link = ([a, b]) => `<line x1="${NODES[a].x}" y1="${NODES[a].y}" x2="${NODES[b].x}" y2="${NODES[b].y}"/>`;
  return `<svg class="art" viewBox="110 270 860 360" role="img" aria-hidden="true">
    <g class="art-links">${EDGES.map(link).join('')}</g>
    ${boardSvg().replace('class="decor"', 'class="decor is-on"')}
    ${order.map(([, n]) => `<g class="device">${drawDevice(n)}</g>`).join('')}
  </svg>`;
}
