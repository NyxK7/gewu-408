// 「地址变换：分页 · 分段 · 段页式」：逻辑地址拆开 → 查表（越界检查）→ 拼出物理地址 → 访问内存。
// 右边始终画着物理内存，能直接看到页 / 段被放在了内存的哪里。
import { line, txt } from '../../core/board.js';
import { L, T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { parseNum } from '../mem/panel.js';
import { parseTables, simulate } from './addr.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'];
const MODE = { page: T('基本分页', 'Paging'), seg: T('基本分段', 'Segmentation'), segpage: T('段页式', 'Segmented paging') };

const SPEC = {
  presets: [
    { label: T('分页 · 2500', 'Paging · 2500'), set: { mode: 'page', pageSize: 1024, frames: [2, 3, 8, 5], addr: '2500', tableBase: 6000, entrySize: 4 } },
    { label: T('分页 · 0A5CH', 'Paging · 0A5CH'), set: { mode: 'page', pageSize: 1024, frames: [2, 3, 8, 5], addr: '0A5CH', tableBase: 6000, entrySize: 4 } },
    { label: T('分页 · 越界', 'Paging · out of range'), set: { mode: 'page', pageSize: 1024, frames: [2, 3, 8, 5], addr: '5000', tableBase: 6000, entrySize: 4 } },
    { label: T('分段 · (3, 400)', 'Segments · (3, 400)'), set: { mode: 'seg', bases: [219, 2300, 90, 1327, 1952], lens: [600, 14, 100, 580, 96], s: 3, w: 400, tableBase: 6000, entrySize: 8 } },
    { label: T('分段 · 越界', 'Segments · overflow'), set: { mode: 'seg', bases: [219, 2300, 90, 1327, 1952], lens: [600, 14, 100, 580, 96], s: 2, w: 500, tableBase: 6000, entrySize: 8 } },
    { label: T('段页式 · (1, 2100)', 'Seg-paging · (1, 2100)'), set: { mode: 'segpage', pageSize: 1024, tables: '3 7 | 5 2 8', s: 1, w: 2100, tableBase: 6000, entrySize: 8 } },
  ],
  groups: [
    {
      legend: T('方式', 'Scheme'),
      fields: [
        { name: 'mode', label: T('存储管理方式', 'Scheme'), type: 'select', options: Object.keys(MODE).map((m) => [m, MODE[m]]), wide: true },
        { name: 'pageSize', label: T('页大小（B）', 'Page size (B)'), type: 'select', options: [256, 512, 1024, 2048, 4096, 8192].map((v) => [v, String(v)]), show: (p) => p.mode !== 'seg' },
        { name: 'tableBase', label: T('页表 / 段表始址', 'Table base address'), type: 'int', min: 0, max: 1e7 },
        { name: 'entrySize', label: T('表项长度（B）', 'Entry size (B)'), type: 'int', min: 1, max: 16 },
      ],
    },
    {
      legend: T('表与地址', 'Tables and address'),
      fields: [
        { name: 'frames', label: T('页表：第 0、1、2… 页所在的块号', 'Page table: frame of page 0, 1, 2…'), type: 'list', min: 0, max: 63, maxLen: 16, wide: true, show: (p) => p.mode === 'page' },
        { name: 'addr', label: T('逻辑地址（十进制，或 0x… / …H 十六进制）', 'Logical address (decimal, 0x… or …H)'), type: 'text', wide: true, show: (p) => p.mode === 'page', parse: (t) => (Number.isNaN(parseNum(t)) || parseNum(t) == null ? NaN : t) },
        { name: 'bases', label: T('段表：各段基址', 'Segment bases'), type: 'list', min: 0, max: 99999, maxLen: 10, wide: true, show: (p) => p.mode === 'seg' },
        { name: 'lens', label: T('段表：各段段长', 'Segment lengths'), type: 'list', min: 1, max: 99999, maxLen: 10, wide: true, show: (p) => p.mode === 'seg' },
        { name: 'tables', label: T('各段的页表，用 | 隔开（如 3 7 | 5 2 8）', 'Page table of each segment, split by | (e.g. 3 7 | 5 2 8)'), type: 'text', wide: true, show: (p) => p.mode === 'segpage', parse: (t) => (parseTables(t) ? t : NaN) },
        { name: 's', label: T('段号 s', 'Segment s'), type: 'int', min: 0, max: 99, show: (p) => p.mode !== 'page' },
        { name: 'w', label: T('段内地址 w', 'Offset w'), type: 'int', min: 0, max: 999999, show: (p) => p.mode !== 'page' },
      ],
    },
  ],
  note: T(
    '分页：页号 = 逻辑地址 ÷ 页大小（取整），页内偏移 = 逻辑地址 mod 页大小。分段的逻辑地址直接给成（段号, 段内地址）。段页式先查段表找到该段的页表，再把段内地址拆成页号和页内偏移查页表。表项地址 = 表始址 + 号 × 表项长度。本课不考虑快表，访存次数：分页、分段 2 次，段页式 3 次。',
    'Paging: page = address ÷ page size, offset = address mod page size. A segmented address is given as (segment, offset). Segmented paging finds the segment’s page table first, then splits the offset into page and offset. Entry address = table base + number × entry size. No TLB here: paging and segmentation take 2 memory accesses, segmented paging 3.',
  ),
};

const ERR = {
  mode: T('请选择方式', 'Pick a scheme'),
  pageSize: T('页大小必须是 2 的幂', 'The page size must be a power of two'),
  entrySize: T('表项长度要在 1～16 之间', 'Entry size must be 1–16'),
  tableBase: T('表始址不能为负', 'The table base cannot be negative'),
  frames: T('页表要有 1～16 项', 'The page table needs 1–16 entries'),
  addr: T('逻辑地址不对', 'Invalid logical address'),
  bases: T('段表要有 1～10 段', 'The segment table needs 1–10 entries'),
  lens: T('基址和段长的个数要一样', 'Give as many lengths as bases'),
  s: T('段号不对', 'Invalid segment number'),
  w: T('段内地址不对', 'Invalid offset'),
  overlap: T('段 {a} 和段 {b} 在内存里重叠了', 'Segments {a} and {b} overlap in memory'),
  tables: T('每段的页表要有 1～8 项，最多 8 段', 'Each page table needs 1–8 entries, at most 8 segments'),
  dupFrame: T('同一个物理块不能分给两个页', 'A frame cannot hold two pages'),
};

// ───────────────────────── 画板 ─────────────────────────

const RH = 26;
const X_ADDR = 30;
const X_TAB = 330;
const X_MEM = 640;
const Y0 = 120;

/** 物理内存：按块画（分页、段页式） */
function memFrames(sim, owners, hotFrame, z) {
  const all = Object.keys(owners).map(Number);
  const top = Math.max(...all, hotFrame ?? 0);
  const n = Math.min(Math.max(top + 2, 8), 16);
  const start = top + 2 > 16 ? Math.max(0, top + 2 - 16) : 0;
  let s = txt(70, -14, z ? '物理内存（按块）' : 'Physical memory (frames)', 'bt-cap');
  for (let i = 0; i < n; i++) {
    const f = start + i;
    const o = owners[f];
    s += `<g transform="translate(0 ${i * RH})">${cell(140, RH - 3, o ? o.label : '', { tone: o?.tone ?? '', cls: f === hotFrame ? 'hot' : o ? '' : 'dim', size: 11 })}</g>` + txt(-8, i * RH + 16, z ? `块 ${f}` : `F${f}`, 'bt-idx', 'end');
  }
  return { html: s, y: (f) => (f - start) * RH };
}

/** 物理内存：按地址画（分段），段的高度和段长成正比 */
function memSegs(sim, hot, z) {
  const segs = sim.bases.map((b, i) => ({ i, base: b, len: sim.lens[i] }));
  const end = Math.max(...segs.map((x) => x.base + x.len));
  const H = 400;
  const sc = H / end;
  let s = txt(70, -14, z ? '物理内存（按地址）' : 'Physical memory (by address)', 'bt-cap') + `<rect class="memcol" x="0" y="0" width="140" height="${H}" rx="4"/>`;
  let lastY = -99;
  for (const g of [...segs].sort((a, b) => a.base - b.base)) {
    const y = g.base * sc;
    const h = Math.max(g.len * sc, 6);
    s += `<g transform="translate(0 ${y.toFixed(1)})">${cell(140, h, h > 15 ? (z ? `段 ${g.i}` : `seg ${g.i}`) : '', { tone: TONES[g.i % 8], cls: g.i === hot ? 'hot' : '', size: 11 })}</g>`;
    if (y - lastY > 12) {
      s += txt(-8, y + 10, String(g.base), 'bt-idx', 'end');
      lastY = y;
    }
  }
  if (H - lastY > 12) s += txt(-8, H, String(end), 'bt-idx', 'end');
  return { html: s, y: (a) => a * sc };
}

/** st：0 拆分，1 越界检查，2 查表，3 （段页式）查页表 / 拼地址 ……，用一组开关描述画到哪里 */
function board(sim, st, z) {
  const items = [];
  const hex = (v) => `0x${v.toString(16).toUpperCase()}`;
  const tone = (i) => TONES[i % 8];
  if (sim.mode === 'page') {
    // 逻辑地址
    items.push({ k: 'la-cap', x: X_ADDR, y: Y0 - 50, html: txt(0, 0, `${z ? '逻辑地址' : 'Logical address'} A = ${sim.A}${sim.A > 255 ? `（${hex(sim.A)}）` : ''}`, 'bt-cap', 'start') });
    items.push({ k: 'la', x: X_ADDR, y: Y0 - 34, html: st.split ? `<g>${cell(120, 34, `P = ${sim.P}`, { tone: 'blue', cls: st.check ? 'hot' : '' })}</g><g transform="translate(124 0)">${cell(120, 34, `W = ${sim.W}`, { tone: 'slate' })}</g>` + txt(60, 50, z ? '页号' : 'page', 'bt-dim') + txt(184, 50, z ? `页内偏移（低 ${sim.k} 位）` : `offset (low ${sim.k} bits)`, 'bt-dim') : cell(244, 34, String(sim.A), {}) });
    // 页表寄存器
    items.push({ k: 'ptr', x: X_ADDR, y: Y0 + 50, html: txt(0, -8, z ? '页表寄存器 PTR' : 'Page-table register', 'bt-cap', 'start') + cell(120, 30, `F = ${sim.base}`, { cls: st.table ? 'hot' : '' }) + `<g transform="translate(124 0)">${cell(120, 30, `M = ${sim.M}`, { cls: st.check ? (sim.fault ? 'bad' : 'ok') : '' })}</g>` + txt(184, 46, z ? '页表长度' : 'table length', 'bt-dim') + txt(60, 46, z ? '页表始址' : 'table base', 'bt-dim') });
    // 页表
    let tab = txt(70, -14, z ? '页表（在内存中）' : 'Page table (in memory)', 'bt-cap') + cell(70, RH - 3, z ? '页号' : 'page', { cls: 'head' }) + `<g transform="translate(74 0)">${cell(70, RH - 3, z ? '块号' : 'frame', { cls: 'head' })}</g>`;
    sim.table.forEach((f, i) => {
      const hot = st.table && i === sim.P;
      tab += `<g transform="translate(0 ${(i + 1) * RH})">${cell(70, RH - 3, String(i), { tone: tone(i), cls: hot ? 'hot' : '' })}<g transform="translate(74 0)">${cell(70, RH - 3, String(f), { cls: hot ? 'hot' : '' })}</g></g>`;
      tab += txt(-8, (i + 1) * RH + 16, String(sim.base + i * sim.entry), 'bt-idx', 'end');
    });
    if (st.check && sim.fault) tab += `<g transform="translate(0 ${(sim.M + 1) * RH})">${cell(144, RH - 3, z ? `页号 ${sim.P} 不存在` : `no page ${sim.P}`, { cls: 'bad', size: 11 })}</g>`;
    items.push({ k: 'tab', x: X_TAB, y: Y0 - 40, html: tab });
    // 内存
    const owners = Object.fromEntries(sim.table.map((f, i) => [f, { label: z ? `页 ${i}` : `page ${i}`, tone: tone(i) }]));
    const mem = memFrames(sim, owners, st.phys ? sim.b : null, z);
    items.push({ k: 'mem', x: X_MEM, y: Y0 - 40, html: mem.html + (st.phys ? `<line class="bl-now" x1="-4" y1="${mem.y(sim.b) + ((sim.W / sim.L) * (RH - 3)).toFixed(1)}" x2="148" y2="${mem.y(sim.b) + ((sim.W / sim.L) * (RH - 3)).toFixed(1)}"/>` : '') });
    if (st.table) items.push({ k: 'a1', x: 0, y: 0, html: arrow(X_ADDR + 60, Y0, X_TAB - 4, Y0 - 40 + (sim.P + 1) * RH + 11, 'acc') });
    if (st.phys) items.push({ k: 'a2', x: 0, y: 0, html: arrow(X_TAB + 148, Y0 - 40 + (sim.P + 1) * RH + 11, X_MEM - 6, Y0 - 40 + mem.y(sim.b) + 11, 'ok') });
    if (st.phys) items.push({ k: 'pa', x: X_ADDR, y: Y0 + 150, html: txt(0, -8, z ? '物理地址' : 'Physical address', 'bt-cap', 'start') + cell(120, 34, `b = ${sim.b}`, { tone: 'violet' }) + `<g transform="translate(124 0)">${cell(120, 34, `W = ${sim.W}`, { tone: 'slate' })}</g>` + txt(0, 56, `E = ${sim.b} × ${sim.L} + ${sim.W} = ${sim.E}`, 'bt-acc', 'start') });
  } else if (sim.mode === 'seg') {
    items.push({ k: 'la', x: X_ADDR, y: Y0 - 34, html: txt(0, -16, z ? '逻辑地址（二维）' : 'Logical address (2-D)', 'bt-cap', 'start') + cell(120, 34, `s = ${sim.s}`, { tone: 'blue', cls: st.check ? 'hot' : '' }) + `<g transform="translate(124 0)">${cell(120, 34, `w = ${sim.w}`, { tone: 'slate', cls: st.len ? 'hot' : '' })}</g>` + txt(60, 50, z ? '段号' : 'segment', 'bt-dim') + txt(184, 50, z ? '段内地址' : 'offset', 'bt-dim') });
    items.push({ k: 'ptr', x: X_ADDR, y: Y0 + 50, html: txt(0, -8, z ? '段表寄存器' : 'Segment-table register', 'bt-cap', 'start') + cell(120, 30, z ? `始址 ${sim.base}` : `base ${sim.base}`, { cls: st.table ? 'hot' : '' }) + `<g transform="translate(124 0)">${cell(120, 30, z ? `长度 ${sim.n}` : `length ${sim.n}`, { cls: st.check ? (sim.fault === 'seg' ? 'bad' : 'ok') : '' })}</g>` });
    let tab = txt(110, -14, z ? '段表' : 'Segment table', 'bt-cap') + cell(60, RH - 3, z ? '段号' : 'seg', { cls: 'head' }) + `<g transform="translate(64 0)">${cell(78, RH - 3, z ? '段长' : 'length', { cls: 'head' })}</g><g transform="translate(146 0)">${cell(78, RH - 3, z ? '基址' : 'base', { cls: 'head' })}</g>`;
    sim.bases.forEach((b, i) => {
      const hot = st.table && i === sim.s;
      tab += `<g transform="translate(0 ${(i + 1) * RH})">${cell(60, RH - 3, String(i), { tone: tone(i), cls: hot ? 'hot' : '' })}<g transform="translate(64 0)">${cell(78, RH - 3, String(sim.lens[i]), { cls: hot && st.len ? (sim.fault === 'len' ? 'bad' : 'ok') : hot ? 'hot' : '' })}</g><g transform="translate(146 0)">${cell(78, RH - 3, String(b), { cls: hot ? 'hot' : '' })}</g></g>`;
    });
    items.push({ k: 'tab', x: X_TAB - 40, y: Y0 - 40, html: tab });
    const mem = memSegs(sim, st.phys || (st.table && sim.s < sim.n) ? sim.s : null, z);
    let mm = mem.html;
    if (st.phys) mm += `<line class="bl-now" x1="-4" y1="${mem.y(sim.E).toFixed(1)}" x2="148" y2="${mem.y(sim.E).toFixed(1)}"/>` + txt(150, mem.y(sim.E) + 4, `E = ${sim.E}`, 'bt-acc', 'start');
    if (st.len && sim.fault === 'len') mm += `<line class="bl-now bad" x1="-4" y1="${mem.y(sim.segBase + sim.len).toFixed(1)}" x2="148" y2="${mem.y(sim.segBase + sim.len).toFixed(1)}"/>` + txt(150, mem.y(sim.segBase + sim.len) + 4, z ? `段尾 ${sim.segBase + sim.len}` : `end ${sim.segBase + sim.len}`, 'bt-mark bad', 'start');
    items.push({ k: 'mem', x: X_MEM, y: Y0 - 40, html: mm });
    if (st.table && sim.s < sim.n) items.push({ k: 'a1', x: 0, y: 0, html: arrow(X_ADDR + 60, Y0, X_TAB - 44, Y0 - 40 + (sim.s + 1) * RH + 11, 'acc') });
    if (st.phys) items.push({ k: 'pa', x: X_ADDR, y: Y0 + 150, html: txt(0, -8, z ? '物理地址' : 'Physical address', 'bt-cap', 'start') + txt(0, 20, `E = ${sim.segBase} + ${sim.w} = ${sim.E}`, 'bt-acc', 'start') });
  } else {
    const SX = X_TAB + 20;
    const PX = SX + 190;
    const MX = X_MEM + 130;
    items.push({ k: 'la', x: X_ADDR, y: Y0 - 34, html: txt(0, -16, z ? '逻辑地址' : 'Logical address', 'bt-cap', 'start') + cell(110, 34, `s = ${sim.s}`, { tone: 'blue', cls: st.check ? 'hot' : '' }) + `<g transform="translate(114 0)">${cell(140, 34, `w = ${sim.w}`, { tone: 'slate' })}</g>` });
    if (st.split) items.push({ k: 'split', x: X_ADDR + 114, y: Y0 + 22, html: cell(68, 30, `p = ${sim.p}`, { tone: 'teal', cls: st.pcheck ? 'hot' : '' }) + `<g transform="translate(72 0)">${cell(68, 30, `d = ${sim.d}`, { tone: 'slate' })}</g>` + txt(70, 46, `w ÷ ${sim.L}`, 'bt-dim') });
    let tab = txt(70, -14, z ? '段表' : 'Segment table', 'bt-cap') + cell(44, RH - 3, z ? '段' : 'seg', { cls: 'head' }) + `<g transform="translate(48 0)">${cell(96, RH - 3, z ? '页表长度' : 'PT length', { cls: 'head', size: 11 })}</g>`;
    sim.tables.forEach((t, i) => {
      const hot = st.table && i === sim.s;
      tab += `<g transform="translate(0 ${(i + 1) * RH})">${cell(44, RH - 3, String(i), { tone: tone(i), cls: hot ? 'hot' : '' })}<g transform="translate(48 0)">${cell(96, RH - 3, String(t.length), { cls: hot && st.pcheck ? (sim.fault === 'page' ? 'bad' : 'ok') : hot ? 'hot' : '' })}</g></g>`;
    });
    items.push({ k: 'tab', x: SX, y: Y0 - 40, html: tab });
    if (st.table && sim.s < sim.n) {
      let pt = txt(70, -14, z ? `段 ${sim.s} 的页表` : `Page table of seg ${sim.s}`, 'bt-cap') + cell(70, RH - 3, z ? '页号' : 'page', { cls: 'head' }) + `<g transform="translate(74 0)">${cell(70, RH - 3, z ? '块号' : 'frame', { cls: 'head' })}</g>`;
      sim.tables[sim.s].forEach((f, i) => {
        const hot = st.ptable && i === sim.p;
        pt += `<g transform="translate(0 ${(i + 1) * RH})">${cell(70, RH - 3, String(i), { tone: 'teal', cls: hot ? 'hot' : '' })}<g transform="translate(74 0)">${cell(70, RH - 3, String(f), { cls: hot ? 'hot' : '' })}</g></g>`;
      });
      items.push({ k: 'pt', x: PX, y: Y0 - 40, html: pt });
      items.push({ k: 'a1', x: 0, y: 0, html: arrow(SX + 148, Y0 - 40 + (sim.s + 1) * RH + 11, PX - 4, Y0 - 40 + RH + 11, 'acc') });
    }
    const owners = {};
    sim.tables.forEach((t, si) => t.forEach((f, pi) => (owners[f] = { label: z ? `段${si} 页${pi}` : `s${si} p${pi}`, tone: tone(si) })));
    const mem = memFrames(sim, owners, st.phys ? sim.b : null, z);
    items.push({ k: 'mem', x: MX, y: Y0 - 40, html: mem.html });
    if (st.phys) {
      items.push({ k: 'a2', x: 0, y: 0, html: arrow(PX + 148, Y0 - 40 + (sim.p + 1) * RH + 11, MX - 6, Y0 - 40 + mem.y(sim.b) + 11, 'ok') });
      items.push({ k: 'pa', x: X_ADDR, y: Y0 + 150, html: txt(0, -8, z ? '物理地址' : 'Physical address', 'bt-cap', 'start') + txt(0, 20, `E = ${sim.b} × ${sim.L} + ${sim.d} = ${sim.E}`, 'bt-acc', 'start') });
    }
  }
  if (st.trap) items.push({ k: 'trap', x: X_ADDR, y: Y0 + 160, html: cell(244, 40, st.trap, { cls: 'bad', size: 13 }) });
  items.push({ k: 'acc', x: X_ADDR, y: Y0 + 250, html: txt(0, 0, z ? `已访问内存 ${st.acc ?? 0} 次` : `Memory accesses so far: ${st.acc ?? 0}`, 'bt-cap', 'start') });
  void line;
  return items;
}

// ───────────────────────── 原理 ─────────────────────────

function addrFig(z, parts) {
  const W = 560;
  let x = 20;
  const total = parts.reduce((a, p) => a + p.w, 0);
  let s = '';
  for (const p of parts) {
    const w = (p.w / total) * W;
    s += `<rect class="df-${p.kind}" x="${x.toFixed(1)}" y="20" width="${w.toFixed(1)}" height="36" rx="3"/><text class="df-lab" x="${(x + w / 2).toFixed(1)}" y="43" text-anchor="middle">${z ? p.zh : p.en}</text>`;
    if (p.bits) s += `<text class="df-note" x="${(x + w / 2).toFixed(1)}" y="74" text-anchor="middle">${p.bits}</text>`;
    x += w;
  }
  return `<svg class="doc-svg" viewBox="0 0 600 84" role="img">${s}</svg>`;
}

export const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要离散分配', 'Why non-contiguous allocation'),
      blocks: [
        { p: T('连续分配要求一个进程占一整段连续的内存，用久了内存里全是装不下东西的小空闲块（外部碎片），只能靠代价很大的紧凑来整理。', 'Contiguous allocation needs one unbroken range per process; over time memory fills with small useless gaps (external fragmentation) that only expensive compaction can fix.') },
        { p: T('**离散分配**的想法是：把进程拆成小块，各块分别放进内存里任何空着的位置。拆的办法有两种：按**固定大小**拆（分页）、按**逻辑意义**拆（分段），以及两者结合的段页式。代价是：要有一张表记下每一块放在哪，每次访存都要先查表。', '**Non-contiguous allocation** cuts a process into pieces that can go anywhere free. Cut by **fixed size** (paging), by **logical meaning** (segmentation), or both (segmented paging). The price: a table recording where each piece went, consulted on every access.') },
      ],
    },
    {
      id: 'paging',
      title: T('基本分页', 'Basic paging'),
      blocks: [
        {
          list: [
            T('把**内存**分成大小相等的块，叫**页框**（物理块）；把**进程的逻辑地址空间**分成同样大小的块，叫**页**。', 'Physical memory is cut into equal **frames**; the process’s logical address space into **pages** of the same size.'),
            T('进程的每一页可以放进任何一个空闲页框，各页之间不必相邻，所以**没有外部碎片**；只有每个进程最后一页可能装不满，产生**内部碎片**（平均半页）。', 'Any page can go into any free frame, so there is **no external fragmentation**; only a process’s last page may be partly empty (**internal fragmentation**, half a page on average).'),
            T('**页表**记录「第几页放在第几块」：页表项按页号顺序存放，所以页号本身不用存，表项里存的是**块号**。每个进程一张页表，放在内存里。', 'The **page table** records which frame each page sits in. Entries are stored in page order, so the page number is implicit and each entry holds a **frame number**. One table per process, kept in memory.'),
          ],
        },
        { p: T('页大小取 2 的幂，逻辑地址就能直接按位拆开：低 k 位是页内偏移，高位是页号。', 'With a power-of-two page size the address splits by bits: the low k bits are the offset, the rest the page number.') },
        { fig: (z) => addrFig(z, [{ w: 20, kind: 'used', zh: '页号 P', en: 'page P', bits: z ? '高 (n − k) 位' : 'high n − k bits' }, { w: 12, kind: 'os', zh: '页内偏移 W', en: 'offset W', bits: z ? '低 k 位（页大小 2^k）' : 'low k bits (page size 2^k)' }]) },
        { formula: T('P = A ÷ L（取整）　　W = A mod L　　物理地址 E = b × L + W', 'P = A ÷ L (integer)    W = A mod L    physical E = b × L + W') },
        { tip: T('页内偏移在变换前后**不变**：页和页框一样大，页里的第 W 个字节，在页框里还是第 W 个字节。变的只是「第几页」换成「第几块」。', 'The offset is **unchanged**: page and frame are the same size, so byte W of the page is byte W of the frame. Only the page number becomes a frame number.') },
      ],
    },
    {
      id: 'mmu',
      title: T('分页的地址变换', 'Address translation with paging'),
      blocks: [
        { p: T('系统里有一个**页表寄存器 PTR**，存着当前进程页表的**始址 F** 和**长度 M**（进程切换时从 PCB 里装入）。每次访存，硬件自动完成：', 'A **page-table register** holds the running process’s table **base F** and **length M** (loaded from its PCB on a switch). On every access the hardware:') },
        {
          steps: [
            T('把逻辑地址 A 拆成页号 P 和页内偏移 W；', 'splits A into page P and offset W;'),
            T('比较 P 和 M：**P ≥ M 就越界中断**（页号从 0 开始，所以等于也越界）；', 'compares P with M: **P ≥ M raises an out-of-range trap** (pages start at 0, so equality also fails);'),
            T('页表项地址 = F + P × 页表项长度，到内存里读出块号 b —— **第 1 次访存**；', 'reads the entry at F + P × entry size to get frame b: **memory access 1**;'),
            T('E = b × L + W，用 E 去访问数据 —— **第 2 次访存**。', 'forms E = b × L + W and accesses the data: **memory access 2**.'),
          ],
        },
        { warn: T('每取一个数据都要访问两次内存，速度直接减半。这就是要有**快表（TLB）**的原因，见下一节课。', 'Every data access now costs two memory accesses, halving speed. That is why a **TLB** exists (next lesson).') },
      ],
    },
    {
      id: 'multi',
      title: T('页表太大：两级页表', 'Huge page tables: two levels'),
      blocks: [
        { p: T('32 位逻辑地址、4 KB 页：页号有 20 位，页表要 2^20 项，每项 4 B 就是 4 MB，而且必须**连续**存放 —— 又回到了连续分配的老问题。而进程实际只用到其中一小部分页。', 'With 32-bit addresses and 4 KB pages the page number has 20 bits: 2^20 entries × 4 B = 4 MB that must be **contiguous**, the old problem again, though a process uses only a few pages.') },
        { p: T('解决办法是**给页表再建一张页表**：把页表本身也按页拆开，再用一张**外层页表（页目录）**记录每一页页表放在哪个块。逻辑地址变成「外层页号 | 内层页号 | 页内偏移」。一页 4 KB 正好放 1024 个 4 B 的页表项，所以内层页号 10 位、外层页号 10 位。', 'The fix is **a page table for the page table**: split the table into pages and keep an **outer table (page directory)** of where each lies. The address becomes outer | inner | offset. A 4 KB page holds 1024 four-byte entries, so 10 + 10 + 12 bits.') },
        { fig: (z) => addrFig(z, [{ w: 10, kind: 'used', zh: '外层页号', en: 'outer', bits: '10' }, { w: 10, kind: 'fresh', zh: '内层页号', en: 'inner', bits: '10' }, { w: 12, kind: 'os', zh: '页内偏移', en: 'offset', bits: '12' }]) },
        { tip: T('两级页表只需把用到的那几页页表调进内存，而且页表不再要求连续。代价是不用快表时要访存 3 次。设计时让**每一级页表正好放满一页**，就能算出每级的位数。', 'Only the page-table pages in use need to be in memory, and they need not be contiguous. Without a TLB it costs 3 accesses. Make **each level fit exactly one page** to derive the bit widths.') },
      ],
    },
    {
      id: 'seg',
      title: T('基本分段', 'Basic segmentation'),
      blocks: [
        { p: T('分页是系统为了管理方便按固定大小切的，一页里可能半截是代码、半截是数据。**分段**则按程序本身的逻辑切：主程序段、子程序段、数据段、栈段……每段从 0 开始编址，**长度各不相同**。', 'Paging cuts by size for the system’s convenience; a page may mix code and data. **Segmentation** follows the program’s logic: main, functions, data, stack…, each addressed from 0 and **of different lengths**.') },
        {
          list: [
            T('逻辑地址是**二维**的：（段号 s, 段内地址 w）。程序员（编译器）知道段的存在。', 'Addresses are **two-dimensional**: (segment s, offset w). The programmer (compiler) sees segments.'),
            T('**段表**每项记录该段的**段长**和在内存里的**基址**。段内地址必须和段长比较，所以变换时有**两次越界检查**：段号 vs 段表长度、段内地址 vs 段长。', 'Each **segment-table** entry holds the **length** and **base**. Translation therefore checks **twice**: segment vs table length, offset vs segment length.'),
            T('每段在内存里是连续的一块，段和段之间不必相邻 —— 这其实是对**每一段**做动态分区分配，所以**会有外部碎片**。', 'Each segment is contiguous but segments need not be adjacent: dynamic partitioning per segment, so **external fragmentation returns**.'),
            T('按逻辑分段，**共享和保护**很方便：比如把一个纯代码段设为只读，让多个进程的段表都指向它。', 'Logical segments make **sharing and protection** easy: mark a pure-code segment read-only and point several processes’ tables at it.'),
          ],
        },
        { formula: T('s ≥ 段表长度 → 越界　　w ≥ 段长 → 越界　　E = 基址 + w', 's ≥ table length → trap    w ≥ length → trap    E = base + w') },
      ],
    },
    {
      id: 'segpage',
      title: T('段页式', 'Segmented paging'),
      blocks: [
        { p: T('把两者结合：**先按逻辑分段，每段再分页**。用户看到的是段（好共享、好保护），内存按页框分配（没有外部碎片）。', 'Combine them: **segment by logic, then page each segment**. Users see segments (sharing, protection); memory is handed out in frames (no external fragmentation).') },
        { fig: (z) => addrFig(z, [{ w: 8, kind: 'used', zh: '段号 s', en: 'segment s' }, { w: 10, kind: 'fresh', zh: '段内页号 p', en: 'page p' }, { w: 12, kind: 'os', zh: '页内偏移 d', en: 'offset d' }]) },
        {
          steps: [
            T('s 和段表长度比较，越界则中断；', 'check s against the segment-table length;'),
            T('读段表项，得到该段**页表的长度和始址** —— 第 1 次访存；', 'read the segment entry: that segment’s **page-table length and base**: access 1;'),
            T('p 和该段页表长度比较，越界则中断；读页表项得到块号 b —— 第 2 次访存；', 'check p against the page-table length; read the page entry for frame b: access 2;'),
            T('E = b × L + d，访问数据 —— 第 3 次访存。', 'E = b × L + d, access the data: access 3.'),
          ],
        },
        { tip: T('一个进程**一张段表、多张页表**（每段一张）。段页式仍有内部碎片（每段最后一页）。', 'A process has **one segment table and many page tables** (one per segment). Internal fragmentation remains in each segment’s last page.') },
      ],
    },
    {
      id: 'compare',
      title: T('三种方式对比', 'The three compared'),
      blocks: [
        {
          table: {
            head: ['', T('分页', 'Paging'), T('分段', 'Segmentation'), T('段页式', 'Seg. paging')],
            rows: [
              [T('划分依据', 'Unit'), T('固定大小的页，系统决定', 'fixed-size pages, chosen by the system'), T('逻辑上的段，长度不定，用户（编译器）决定', 'logical segments of any length, from the program'), T('先分段，段内再分页', 'segments, each paged')],
              [T('逻辑地址', 'Address'), T('一维：给一个地址就能拆出页号', 'one-dimensional'), T('二维：要同时给出段号和段内地址', 'two-dimensional (s, w)'), T('二维', 'two-dimensional')],
              [T('对用户', 'Visible'), T('透明', 'transparent'), T('可见', 'visible'), T('可见（段）', 'segments visible')],
              [T('碎片', 'Fragmentation'), T('内部碎片（最后一页）', 'internal'), T('外部碎片', 'external'), T('内部碎片', 'internal')],
              [T('共享与保护', 'Sharing'), T('不方便（一页里可能混着可共享和不可共享的内容）', 'awkward'), T('方便', 'easy'), T('方便', 'easy')],
              [T('表', 'Tables'), T('每进程一张页表', 'one page table'), T('每进程一张段表', 'one segment table'), T('一张段表 + 每段一张页表', 'one segment table + one page table per segment')],
              [T('访存次数（无快表）', 'Accesses (no TLB)'), '2', '2', '3'],
              [T('越界检查', 'Bound checks'), T('页号 vs 页表长度', 'page vs table length'), T('段号 vs 段表长度；段内地址 vs 段长', 'segment vs table length; offset vs length'), T('段号 vs 段表长度；页号 vs 页表长度', 'segment vs table; page vs page-table length')],
            ],
          },
        },
      ],
    },
    {
      id: 'protect',
      title: T('内存保护与共享', 'Protection and sharing'),
      blocks: [
        { p: T('**内存保护**：保证每个进程只访问自己的空间。', '**Protection** keeps each process inside its own space.') },
        { list: [
          T('连续分配：用**重定位寄存器**（基址）和**界地址寄存器**（长度）。逻辑地址先和界地址比较，越界就产生异常，否则加上基址得到物理地址。另一种做法是上、下限寄存器直接比较物理地址。', 'Contiguous allocation: a **relocation register** and a **limit register**; out-of-range addresses raise an exception.'),
          T('分页：页号和页表长度比较（越界中断），页表项里还可以有读 / 写 / 执行的**保护位**。', 'Paging: compare the page number with the table length; protection bits in each entry.'),
          T('分段：段号和段表长度比较、段内地址和段长比较，段表项里有存取控制。', 'Segmentation: check the segment number and the offset against the segment length; access rights per segment.'),
          T('加载重定位寄存器、界地址寄存器、页表基址寄存器都是特权指令。', 'Loading these registers is privileged.'),
        ] },
        { p: T('**内存共享**：几个进程共用一份代码，前提是代码是**可重入代码**（纯代码），执行中不修改自己。', '**Sharing** requires **reentrant (pure) code** that never modifies itself.') },
        { list: [
          T('分段共享很自然：几个进程的段表项指向同一个段，再用一张共享段表记下有几个进程在用（共享计数）。', 'Segments share naturally: entries point to one segment, with a share count.'),
          T('分页共享麻烦一些：共享的代码可能和私有数据挤在同一页里，要让几个进程的页表项指向同一批物理块。', 'Pages share by mapping the same frames, but shared code may sit with private data in one page.'),
        ] },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('页号从 0 开始：页表有 M 项时，合法页号是 0～M−1，**P = M 也越界**。', 'Pages start at 0: with M entries, valid pages are 0…M−1, so **P = M is already out of range**.'),
            T('页表项里存的是**块号**，不存页号（页号是下标）。算页表大小时只算块号（和标志位）的位数。', 'A page-table entry holds the **frame number**, not the page number (that is the index).'),
            T('分页的逻辑地址空间是一维的；「分页的地址是二维的」是错的。分段才是二维。', 'Paging addresses are one-dimensional; segmentation is the two-dimensional one.'),
            T('分段要比较**段内地址和段长**，分页不需要（页内偏移的位数决定了它不会超过页大小）。', 'Segmentation must compare **offset against length**; paging need not (the offset bits cannot exceed the page size).'),
            T('十六进制地址拆页号，直接按位拆最快：页大小 1 KB = 2^10，就取低 10 位做偏移。', 'For hex addresses split by bits: a 1 KB page means the low 10 bits are the offset.'),
            T('段页式不用快表时访存 **3 次**，分页和分段是 2 次；两级页表也是 3 次。', 'Without a TLB segmented paging takes **3** accesses; paging and segmentation 2; two-level paging also 3.'),
          ],
        },
      ],
    },
  ],
};

// ───────────────────────── 生成课程 ─────────────────────────

const kit = stepKit({ spec: SPEC, rowsName: T('变换步骤', 'Translation steps') });

export const DEFAULTS = SPEC.presets[0].set;

function normalize(p) {
  const q = { ...p };
  q.pageSize = Number(q.pageSize);
  if (q.mode === 'page') q.addr = parseNum(q.addr);
  if (q.mode === 'segpage') q.tables = parseTables(q.tables) ?? [];
  return q;
}

function build(params) {
  const sim = simulate(normalize(params));
  const lesson = {
    id: 'addr-trans',
    kit,
    where: [['os', 'memory']],
    tag: T('地址', 'Addr'),
    name: T('地址变换：分页 · 分段 · 段页式', 'Paging · segmentation · both'),
    full: T('页表 · 段表 · 越界检查 · 物理地址 · 访存次数', 'Page table · segment table · bound checks · physical address'),
    title: MODE[params.mode] ?? '',
    badge: MODE[params.mode] ?? '',
    nodes: [],
    legend: [
      ['blue', params.mode === 'page' ? T('页号', 'Page') : T('段号', 'Segment')],
      ['slate', T('偏移（不变）', 'Offset (unchanged)')],
      ['violet', T('块号', 'Frame')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '连续分配会产生外部碎片，于是把进程拆开分散存放：按固定大小拆是分页，按逻辑拆是分段，两者结合是段页式。这节课演示一个逻辑地址怎样经过查表变成物理地址，右边画着整个物理内存，能看到各页、各段到底放在哪里。',
        'Contiguous allocation fragments memory, so processes are split up: by size (paging), by meaning (segmentation), or both. This lesson follows one logical address through the tables to a physical address, with all of physical memory drawn on the right so you can see where each page or segment lives.',
      ),
      facts: [[T('方式', 'Scheme'), MODE[params.mode] ?? '']],
    },
    start: { nodes: [], frame: { rect: [0, 30, params.mode === 'segpage' ? 940 : 860, 420] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [];
  const S = {};
  const push = (st, s) => {
    Object.assign(S, st);
    list.push({ ...s, st: { ...S } });
  };
  const trap = (zh, en) => ({ zh, en });
  if (sim.mode === 'page') {
    const bits = sim.A.toString(2).padStart(sim.k + 2, '0');
    push({ split: true, acc: 0 }, {
      title: T(`拆分：页号 ${sim.P}，页内偏移 ${sim.W}`, `Split: page ${sim.P}, offset ${sim.W}`),
      desc: T(`页大小 ${sim.L} = 2^${sim.k}`, `Page size ${sim.L} = 2^${sim.k}`),
      detail: both((z) => (z ? `页大小 L = ${sim.L} B。页号 P = ${sim.A} ÷ ${sim.L} = ${sim.P}（取整），页内偏移 W = ${sim.A} mod ${sim.L} = ${sim.W}。也可以按位看：${sim.A} 的二进制是 ${bits}，低 ${sim.k} 位是偏移，其余是页号。` : `Page size L = ${sim.L} B. P = ${sim.A} ÷ ${sim.L} = ${sim.P}, W = ${sim.A} mod ${sim.L} = ${sim.W}. In bits, ${sim.A} = ${bits}: the low ${sim.k} bits are the offset.`)),
      ref: 'paging',
      facts: [['P', String(sim.P)], ['W', String(sim.W)]],
      row: { color: 'blue', what: T('拆分逻辑地址', 'Split the address'), result: `P=${sim.P}, W=${sim.W}`, tone: 'info' },
    });
    if (sim.fault) {
      push({ check: true, trap: trap(`越界中断：P = ${sim.P} ≥ M = ${sim.M}`, `Trap: P = ${sim.P} ≥ M = ${sim.M}`) }, {
        title: T('越界检查：越界中断', 'Bound check: trap'),
        desc: T(`P = ${sim.P} ≥ 页表长度 ${sim.M}`, `P = ${sim.P} ≥ length ${sim.M}`),
        detail: T(`页表只有 ${sim.M} 项，合法页号是 0～${sim.M - 1}。P = ${sim.P} ≥ ${sim.M}，产生越界中断，不再查页表。`, `The table has ${sim.M} entries (pages 0–${sim.M - 1}); P = ${sim.P} ≥ ${sim.M} traps before the table is read.`),
        ref: ['mmu', 'pitfall'],
        row: { color: 'rose', what: T('越界检查', 'Bound check'), result: T('越界中断', 'trap'), tone: 'warn' },
      });
    } else {
      push({ check: true }, {
        title: T('越界检查：通过', 'Bound check: OK'),
        desc: T(`P = ${sim.P} < M = ${sim.M}`, `P = ${sim.P} < M = ${sim.M}`),
        detail: T(`页表寄存器里的页表长度 M = ${sim.M}，P = ${sim.P} < ${sim.M}，页号合法。`, `The page-table register holds length M = ${sim.M}; P = ${sim.P} < ${sim.M}, so the page is valid.`),
        ref: 'mmu',
        row: { color: 'green', what: T('越界检查', 'Bound check'), result: T('通过', 'OK'), tone: 'ok' },
      });
      push({ table: true, acc: 1 }, {
        title: T(`查页表：页 ${sim.P} 在块 ${sim.b}`, `Page table: page ${sim.P} → frame ${sim.b}`),
        desc: T(`页表项地址 ${sim.base} + ${sim.P} × ${sim.entry} = ${sim.entryAddr}`, `Entry at ${sim.base} + ${sim.P} × ${sim.entry} = ${sim.entryAddr}`),
        detail: T(`页表放在内存里，页表项地址 = 页表始址 F + P × 页表项长度 = ${sim.base} + ${sim.P} × ${sim.entry} = ${sim.entryAddr}。读出这一项，块号 b = ${sim.b}。这是第 1 次访存。`, `The table is in memory; the entry address = F + P × entry size = ${sim.base} + ${sim.P} × ${sim.entry} = ${sim.entryAddr}. It holds frame b = ${sim.b}. Memory access 1.`),
        ref: 'mmu',
        row: { color: 'violet', what: T('查页表', 'Read page table'), result: `b=${sim.b}`, tone: 'info' },
      });
      push({ phys: true }, {
        title: T(`物理地址 E = ${sim.E}`, `Physical address E = ${sim.E}`),
        desc: T(`${sim.b} × ${sim.L} + ${sim.W}`, `${sim.b} × ${sim.L} + ${sim.W}`),
        detail: T(`块号接上原样不变的页内偏移：E = b × L + W = ${sim.b} × ${sim.L} + ${sim.W} = ${sim.E}。`, `The frame number joined with the unchanged offset: E = ${sim.b} × ${sim.L} + ${sim.W} = ${sim.E}.`),
        ref: 'paging',
        row: { color: 'green', what: T('拼物理地址', 'Physical address'), result: String(sim.E), tone: 'ok' },
      });
      push({ acc: 2 }, {
        title: T('访问内存取数据', 'Access the data'),
        desc: T('共访存 2 次', '2 memory accesses'),
        detail: T(`用 E = ${sim.E} 访问内存，这是第 2 次访存。不用快表时，分页存储每取一个数据都要访存 2 次。`, `Access E = ${sim.E}: memory access 2. Without a TLB, paging always costs two accesses per datum.`),
        ref: 'mmu',
        row: { color: 'slate', what: T('访问数据', 'Access data'), result: T('访存 2 次', '2 accesses'), tone: 'ok' },
      });
    }
  } else if (sim.mode === 'seg') {
    push({ check: true, acc: 0, ...(sim.fault === 'seg' ? { trap: trap(`越界中断：s = ${sim.s} ≥ ${sim.n}`, `Trap: s = ${sim.s} ≥ ${sim.n}`) } : {}) }, {
      title: sim.fault === 'seg' ? T('段号越界', 'Segment out of range') : T('段号检查：通过', 'Segment check: OK'),
      desc: T(`s = ${sim.s}，段表长度 ${sim.n}`, `s = ${sim.s}, table length ${sim.n}`),
      detail: sim.fault === 'seg' ? T(`段表只有 ${sim.n} 段（0～${sim.n - 1}），s = ${sim.s} 越界，产生中断。`, `The table has ${sim.n} segments; s = ${sim.s} traps.`) : T(`逻辑地址是二维的（${sim.s}, ${sim.w}），不用拆。先比较段号：${sim.s} < 段表长度 ${sim.n}，合法。`, `The address (${sim.s}, ${sim.w}) is already two-dimensional. ${sim.s} < table length ${sim.n}: valid.`),
      ref: 'seg',
      row: { color: sim.fault === 'seg' ? 'rose' : 'green', what: T('段号检查', 'Segment check'), result: sim.fault === 'seg' ? T('越界中断', 'trap') : T('通过', 'OK'), tone: sim.fault === 'seg' ? 'warn' : 'ok' },
    });
    if (sim.fault !== 'seg') {
      push({ table: true, acc: 1 }, {
        title: T(`查段表：段 ${sim.s} 基址 ${sim.segBase}，段长 ${sim.len}`, `Segment table: base ${sim.segBase}, length ${sim.len}`),
        desc: T(`段表项地址 ${sim.entryAddr}`, `Entry at ${sim.entryAddr}`),
        detail: T(`段表项地址 = ${sim.base} + ${sim.s} × ${sim.entry} = ${sim.entryAddr}，读出段长 ${sim.len}、基址 ${sim.segBase}。第 1 次访存。`, `Entry at ${sim.base} + ${sim.s} × ${sim.entry} = ${sim.entryAddr}: length ${sim.len}, base ${sim.segBase}. Access 1.`),
        ref: 'seg',
        row: { color: 'violet', what: T('查段表', 'Read segment table'), result: `${sim.segBase} / ${sim.len}`, tone: 'info' },
      });
      push({ len: true, ...(sim.fault === 'len' ? { trap: trap(`越界中断：w = ${sim.w} ≥ 段长 ${sim.len}`, `Trap: w = ${sim.w} ≥ ${sim.len}`) } : {}) }, {
        title: sim.fault === 'len' ? T('段内地址越界', 'Offset beyond the segment') : T('段内地址检查：通过', 'Offset check: OK'),
        desc: T(`w = ${sim.w}，段长 ${sim.len}`, `w = ${sim.w}, length ${sim.len}`),
        detail: sim.fault === 'len' ? T(`段 ${sim.s} 只有 ${sim.len} 个字节（0～${sim.len - 1}），w = ${sim.w} 超出，产生越界中断。分段比分页多这一次检查，因为段长各不相同。`, `Segment ${sim.s} has ${sim.len} bytes; w = ${sim.w} is beyond it: trap. Segmentation needs this extra check because lengths differ.`) : T(`w = ${sim.w} < 段长 ${sim.len}，没有越界。`, `w = ${sim.w} < ${sim.len}: inside the segment.`),
        ref: ['seg', 'pitfall'],
        row: { color: sim.fault === 'len' ? 'rose' : 'green', what: T('段长检查', 'Length check'), result: sim.fault === 'len' ? T('越界中断', 'trap') : T('通过', 'OK'), tone: sim.fault === 'len' ? 'warn' : 'ok' },
      });
      if (!sim.fault) {
        push({ phys: true, acc: 2 }, {
          title: T(`物理地址 E = ${sim.E}`, `Physical address E = ${sim.E}`),
          desc: T(`${sim.segBase} + ${sim.w}，共访存 2 次`, `${sim.segBase} + ${sim.w}; 2 accesses`),
          detail: T(`E = 基址 + 段内地址 = ${sim.segBase} + ${sim.w} = ${sim.E}，然后访问数据（第 2 次访存）。右边能看到各段长短不一、在内存里各占一段连续空间。`, `E = ${sim.segBase} + ${sim.w} = ${sim.E}, then the data access (access 2). On the right, segments of different lengths each occupy one contiguous range.`),
          ref: 'seg',
          row: { color: 'green', what: T('物理地址', 'Physical address'), result: String(sim.E), tone: 'ok' },
        });
      }
    }
  } else {
    push({ check: true, acc: 0, ...(sim.fault === 'seg' ? { trap: trap(`越界中断：s = ${sim.s} ≥ ${sim.n}`, `Trap: s = ${sim.s} ≥ ${sim.n}`) } : {}) }, {
      title: sim.fault === 'seg' ? T('段号越界', 'Segment out of range') : T('段号检查：通过', 'Segment check: OK'),
      desc: T(`s = ${sim.s}，段表长度 ${sim.n}`, `s = ${sim.s}, length ${sim.n}`),
      detail: sim.fault === 'seg' ? T(`只有 ${sim.n} 段，s = ${sim.s} 越界。`, `Only ${sim.n} segments; s = ${sim.s} traps.`) : T(`${sim.s} < 段表长度 ${sim.n}，合法。`, `${sim.s} < ${sim.n}: valid.`),
      ref: 'segpage',
      row: { color: sim.fault === 'seg' ? 'rose' : 'green', what: T('段号检查', 'Segment check'), result: sim.fault === 'seg' ? T('越界中断', 'trap') : T('通过', 'OK'), tone: sim.fault === 'seg' ? 'warn' : 'ok' },
    });
    if (sim.fault !== 'seg') {
      push({ table: true, split: true, acc: 1 }, {
        title: T(`查段表，拆出页号 ${sim.p}、偏移 ${sim.d}`, `Segment table; page ${sim.p}, offset ${sim.d}`),
        desc: T(`段 ${sim.s} 的页表有 ${sim.ptLen} 项`, `Segment ${sim.s} has ${sim.ptLen} pages`),
        detail: T(`段表项地址 = ${sim.base} + ${sim.s} × ${sim.entry} = ${sim.entryAddr}，读出段 ${sim.s} 的页表长度 ${sim.ptLen} 和页表始址（第 1 次访存）。段内地址再拆：p = ${sim.w} ÷ ${sim.L} = ${sim.p}，d = ${sim.w} mod ${sim.L} = ${sim.d}。`, `Read the segment entry at ${sim.entryAddr}: page-table length ${sim.ptLen} and base (access 1). Split the offset: p = ${sim.w} ÷ ${sim.L} = ${sim.p}, d = ${sim.d}.`),
        ref: 'segpage',
        row: { color: 'violet', what: T('查段表', 'Read segment table'), result: `p=${sim.p}, d=${sim.d}`, tone: 'info' },
      });
      push({ pcheck: true, ...(sim.fault === 'page' ? { trap: trap(`越界中断：p = ${sim.p} ≥ ${sim.ptLen}`, `Trap: p = ${sim.p} ≥ ${sim.ptLen}`) } : {}) }, {
        title: sim.fault === 'page' ? T('页号越界', 'Page out of range') : T('页号检查：通过', 'Page check: OK'),
        desc: T(`p = ${sim.p}，页表长度 ${sim.ptLen}`, `p = ${sim.p}, length ${sim.ptLen}`),
        detail: sim.fault === 'page' ? T(`段 ${sim.s} 只有 ${sim.ptLen} 页，p = ${sim.p} 越界中断。`, `Segment ${sim.s} has ${sim.ptLen} pages; p = ${sim.p} traps.`) : T(`${sim.p} < ${sim.ptLen}，合法。`, `${sim.p} < ${sim.ptLen}: valid.`),
        ref: 'segpage',
        row: { color: sim.fault === 'page' ? 'rose' : 'green', what: T('页号检查', 'Page check'), result: sim.fault === 'page' ? T('越界中断', 'trap') : T('通过', 'OK'), tone: sim.fault === 'page' ? 'warn' : 'ok' },
      });
      if (!sim.fault) {
        push({ ptable: true, acc: 2 }, {
          title: T(`查页表：块 ${sim.b}`, `Page table: frame ${sim.b}`),
          desc: T('第 2 次访存', 'Access 2'),
          detail: T(`到段 ${sim.s} 的页表里读第 ${sim.p} 项，块号 b = ${sim.b}。第 2 次访存。`, `Entry ${sim.p} of segment ${sim.s}'s page table: frame ${sim.b}. Access 2.`),
          ref: 'segpage',
          row: { color: 'violet', what: T('查页表', 'Read page table'), result: `b=${sim.b}`, tone: 'info' },
        });
        push({ phys: true, acc: 3 }, {
          title: T(`物理地址 E = ${sim.E}`, `Physical address E = ${sim.E}`),
          desc: T('共访存 3 次', '3 accesses'),
          detail: T(`E = b × L + d = ${sim.b} × ${sim.L} + ${sim.d} = ${sim.E}，访问数据（第 3 次访存）。段页式不用快表时，取一个数据要访存 3 次。`, `E = ${sim.b} × ${sim.L} + ${sim.d} = ${sim.E}; the data access is access 3. Without a TLB segmented paging needs three.`),
          ref: ['segpage', 'compare'],
          row: { color: 'green', what: T('物理地址', 'Physical address'), result: String(sim.E), tone: 'ok' },
        });
      }
    }
  }
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? { acc: 0 } : { ...list[k].st, trap: list[k].st.trap ? (z ? list[k].st.trap.zh : list[k].st.trap.en) : null }, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: sim.fault ? T('越界中断', 'Trapped') : T(`物理地址 ${sim.E}`, `Physical address ${sim.E}`),
    text: T('换一种方式再看同一个问题：分页的逻辑地址一维、按位拆；分段的地址二维、要多比较一次段长；段页式要查两张表、访存三次。原理页最后有三者的对比表。', 'Try another scheme: paging splits a 1-D address by bits; segmentation is 2-D and checks the length too; segmented paging reads two tables, three accesses. The principle page ends with a comparison table.'),
    facts: [[T('访存次数', 'Memory accesses'), String(sim.accesses)], ...(sim.E != null ? [[T('物理地址', 'Physical address'), String(sim.E)]] : [])],
  };
  return lesson;
}

export const makeAddr = () => parametric('addr-trans', DEFAULTS, build);
