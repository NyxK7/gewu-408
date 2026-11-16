// 「页面置换算法」这节课：访问串一格一格往前走，页面从磁盘飞进内存块，被换出的飞回去。
import { boardKit, frac, res, txt } from '../../core/board.js';
import { L, T, esc, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { cell } from '../../core/steps.js';
import { ALGOS, simulate } from './paging.js';
import { VM_PRINCIPLE } from './vm-principle.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'];
const toneOf = (p) => TONES[((p % 8) + 8) % 8];
const CLASSIC = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

const NAME = {
  FIFO: T('FIFO 先进先出', 'FIFO'),
  LRU: T('LRU 最近最久未使用', 'LRU (least recently used)'),
  OPT: T('OPT 最佳置换', 'OPT (optimal)'),
  CLOCK: T('CLOCK 时钟（简单）', 'CLOCK (second chance)'),
};
const RULE = {
  FIFO: T('换出最早装入内存的页，像排队一样先来先走。', 'Evict the page that has been in memory the longest: first in, first out.'),
  LRU: T('换出最久没有被访问过的页：用过去预测未来。', 'Evict the page unused for the longest time: the past predicts the future.'),
  OPT: T('换出以后最长时间不会再被访问的页。它要预知未来，实际做不到，只用作衡量其他算法的标准。', 'Evict the page whose next use is farthest away. It needs to know the future, so it is only a yardstick for the others.'),
  CLOCK: T('每页一个访问位，指针绕内存块循环扫描：访问位为 1 的清 0 放过（第二次机会），遇到 0 就换出。', 'Each page has a use bit; a hand sweeps the frames, clearing 1s (a second chance) and evicting the first 0 it finds.'),
};

const SPEC = {
  presets: [
    { label: T('经典串 · FIFO', 'Classic · FIFO'), set: { algo: 'FIFO', frames: 3, refs: CLASSIC } },
    { label: T('经典串 · LRU', 'Classic · LRU'), set: { algo: 'LRU', frames: 3, refs: CLASSIC } },
    { label: T('经典串 · OPT', 'Classic · OPT'), set: { algo: 'OPT', frames: 3, refs: CLASSIC } },
    { label: T('经典串 · CLOCK', 'Classic · CLOCK'), set: { algo: 'CLOCK', frames: 3, refs: CLASSIC } },
    { label: T('Belady 异常 · 3 块', 'Belady · 3 frames'), set: { algo: 'FIFO', frames: 3, refs: BELADY } },
    { label: T('Belady 异常 · 4 块', 'Belady · 4 frames'), set: { algo: 'FIFO', frames: 4, refs: BELADY } },
  ],
  groups: [
    {
      legend: T('参数', 'Parameters'),
      fields: [
        { name: 'algo', label: T('置换算法', 'Algorithm'), type: 'select', options: ALGOS.map((a) => [a, NAME[a]]), wide: true },
        { name: 'frames', label: T('分配的内存块数', 'Frames'), type: 'int', min: 1, max: 8 },
        { name: 'refs', label: T('页面访问串', 'Reference string'), type: 'list', min: 0, max: 99, maxLen: 30, wide: true, hint: T('页号 0～99，逗号或空格分隔，最多 30 个', 'Page numbers 0–99, separated by commas or spaces, at most 30') },
      ],
    },
  ],
  note: T(
    '开始时内存块都是空的，最初装入的页也算缺页；缺页率 = 缺页次数 ÷ 访问次数。有空闲块时按块号顺序装入。OPT 若有几页以后都不再访问，换出其中最早装入的。CLOCK 指简单 CLOCK（只有访问位）：页面装入或被访问时访问位置 1，换出后指针指向下一块，命中不移动指针。',
    'Frames start empty and the first loads count as faults; fault rate = faults ÷ references. Free frames are filled in order. If several pages are never used again, OPT evicts the earliest loaded. CLOCK is the simple version with a use bit only: set on load or access; after a replacement the hand moves to the next frame; hits do not move it.',
  ),
};

const ERR = {
  algo: T('请选择算法', 'Pick an algorithm'),
  frames: T('内存块数要在 1～8 之间', 'Frames must be 1–8'),
  refs: T('访问串要有 1～30 个页号', 'The reference string needs 1–30 pages'),
};

// ───────────────────────── 画板布局 ─────────────────────────
// 平面的内存方格（课本上做置换题的画法）：
//   左边「现在的内存」：每个内存块一格，写着里面的页、算法要看的信息（装入时刻 / 最近使用 / 下次使用 / 访问位）
//   和这一步发生了什么；
//   右边是置换过程表：每一列是一次访问，行依次是访问串、各内存块、是否缺页。每走一步多填一列。
//   访问串超过 12 个时折成上下两段。

const CW = 42; // 表格列宽
const RH = 42; // 行高
const GX = 300; // 表格左边
const TOP = 120; // 第一段访问串那一行

function geo(sim) {
  const N = sim.refs.length;
  const n = sim.n;
  const per = N > 12 ? Math.ceil(N / 2) : N;
  const bandH = (n + 2) * RH + 16 + 56;
  // r = 0 访问串，1..n 内存块，n+1 缺页；b 是第几段
  const rowY = (r, b = 0) => TOP + b * bandH + r * RH + (r > 0 ? 8 : 0) + (r > n ? 8 : 0);
  const colX = (i) => GX + (i % per) * CW;
  const band = (i) => Math.floor(i / per);
  const bands = Math.ceil(N / per);
  const bottom = rowY(n + 1, bands - 1) + RH + 44;
  return { per, rowY, colX, band, bands, slotX: 84, rect: [-40, TOP - 64, GX + per * CW + 30, bottom] };
}

const cellAt = (w, h, text, opt) => cell(w, h, text === '' || text == null ? '' : String(text), opt);

/** 第 t 次访问之后画板的样子（t = -1 是开始前）；ask 是做题模式里正在问的那一次访问 */
function boardAt(sim, t, z, ask = null) {
  const g = geo(sim);
  const s = t >= 0 ? sim.steps[t] : null;
  const st = s ? s.after : { frames: Array(sim.n).fill(null), loadedAt: [], lastUse: [], use: [], ptr: 0 };
  const items = [];
  const cur = ask ?? t;

  // 左边：现在的内存
  items.push({ k: 'lab-now', x: g.slotX, y: g.rowY(0) + RH / 2 + 4, html: txt(0, 0, z ? '现在的内存' : 'Frames now', 'bt-cap', 'start') });
  for (let j = 0; j < sim.n; j++) {
    const p = st.frames[j];
    let info = z ? '空' : 'empty';
    if (p != null) {
      if (sim.algo === 'FIFO') info = z ? `装入 t=${st.loadedAt[j] + 1}` : `in at t=${st.loadedAt[j] + 1}`;
      if (sim.algo === 'LRU') info = z ? `最近 t=${st.lastUse[j] + 1}` : `used t=${st.lastUse[j] + 1}`;
      if (sim.algo === 'OPT') {
        const nu = nextUse(sim.refs, p, t);
        info = nu === Infinity ? (z ? '不再访问' : 'never again') : z ? `下次 t=${nu + 1}` : `next t=${nu + 1}`;
      }
      if (sim.algo === 'CLOCK') info = z ? `访问位 ${st.use[j]}` : `use bit ${st.use[j]}`;
    }
    const hot = ask == null && s && s.slot === j;
    const what = !hot ? '' : s.hit ? (z ? '命中' : 'hit') : s.victim == null ? (z ? `装入 ${s.page}` : `load ${s.page}`) : z ? `换出 ${s.victim}，装入 ${s.page}` : `out ${s.victim}, in ${s.page}`;
    items.push({
      k: `slot-${j}`,
      x: g.slotX,
      y: g.rowY(j + 1),
      cls: hot ? (s.hit ? 'is-hit' : 'is-new') : '',
      html:
        txt(-12, RH / 2 + 1, z ? `块 ${j + 1}` : `F${j + 1}`, 'bt-lab', 'end') +
        cellAt(52, RH - 6, p ?? '', { tone: p == null ? '' : toneOf(p), cls: `${p == null ? 'dim' : ''} ${hot ? (s.hit ? 'ok' : 'hot') : ''}`, size: 17 }) +
        txt(62, what ? 15 : RH / 2 + 1, info, 'bt-cap', 'start') +
        (what ? txt(62, 31, what, `pr-what ${s.hit ? 'ok' : 'bad'}`, 'start') : ''),
    });
  }
  if (sim.algo === 'CLOCK') items.push({ k: 'ptr', x: g.slotX - 58, y: g.rowY(st.ptr + 1) + RH / 2 + 1, html: txt(0, 0, '▶', 'bt-acc', 'end') });

  // 右边：置换过程表（每段左边写行名）
  for (let b = 0; b < g.bands; b++) {
    items.push({ k: `lab-refs-${b}`, x: GX - 12, y: g.rowY(0, b) + RH / 2 + 1, html: txt(0, 0, z ? '访问串' : 'refs', 'bt-cap', 'end') });
    items.push({ k: `lab-fault-${b}`, x: GX - 12, y: g.rowY(sim.n + 1, b) + RH / 2 + 1, html: txt(0, 0, z ? '缺页' : 'fault', 'bt-cap', 'end') });
  }
  if (cur >= 0 && cur < sim.refs.length) {
    const b = g.band(cur);
    items.push({ k: 'band', x: g.colX(cur) - 3, y: g.rowY(0, b) - 24, html: `<rect class="pr-band" x="0" y="0" width="${CW}" height="${g.rowY(sim.n + 1, b) + RH - g.rowY(0, b) + 20}" rx="8"/>` });
  }
  sim.refs.forEach((p, i) => {
    const done = i <= t;
    const now = i === cur;
    const b = g.band(i);
    const dy = (r) => g.rowY(r, b) - g.rowY(0, b);
    const step = done ? sim.steps[i] : null;
    let html = txt(CW / 2 - 3, -9, String(i + 1), 'bt-idx');
    const refCls = !done ? (now ? 'hot' : 'dim') : now ? (step.hit ? 'ok' : 'bad') : '';
    html += cellAt(CW - 6, RH - 6, p, { cls: refCls, size: 15 });
    if (done) {
      step.after.frames.forEach((q, j) => {
        if (q == null) return;
        const mine = step.slot === j;
        const cls = now && mine ? (step.hit ? 'ok' : 'hot') : !step.hit && mine ? 'pr-new' : '';
        html += `<g transform="translate(0 ${dy(j + 1)})">${cellAt(CW - 6, RH - 6, q, { tone: toneOf(q), cls, size: 15 })}</g>`;
      });
      if (!step.hit) html += txt(CW / 2 - 3, dy(sim.n + 1) + RH / 2 + 3, '√', 'pr-mark');
    } else if (now) {
      html += txt(CW / 2 - 3, dy(sim.n + 1) + RH / 2 + 3, '?', 'pr-mark ask');
    }
    items.push({ k: `ref-${i}`, x: g.colX(i), y: g.rowY(0, b), cls: now ? 'is-cur' : '', html });
  });
  if (t >= 0) {
    const f = sim.steps[t].faults;
    items.push({ k: 'sum', x: GX, y: g.rowY(sim.n + 1, g.bands - 1) + RH + 28, html: txt(0, 0, z ? `到第 ${t + 1} 次访问为止：缺页 ${f} 次` : `After ${t + 1} references: ${f} faults`, 'bt-lab', 'start') });
  }
  return items;
}

function nextUse(refs, p, t) {
  for (let j = t + 1; j < refs.length; j++) if (refs[j] === p) return j;
  return Infinity;
}

/** 做题模式作答前：停在第 t 次访问之前，把这一列标成「?」，不显示它的结果。 */
export function quizBoardAt(sim, t, z) {
  return boardAt(sim, t - 1, z, t >= 0 && t < sim.refs.length ? t : null);
}

// ───────────────────────── 文案 ─────────────────────────

const pages = (fr) => `[${fr.map((p) => (p == null ? '·' : p)).join(', ')}]`;

function why(sim, s, z) {
  const b = s.before;
  if (s.hit) {
    const extra = sim.algo === 'LRU' ? (z ? `记下它最近一次被访问是 t=${s.t + 1}。` : ` Its last use becomes t=${s.t + 1}.`) : sim.algo === 'CLOCK' ? (z ? '把它的访问位置 1，指针不动。' : ' Its use bit is set to 1; the hand stays put.') : '';
    return (z ? `页 ${s.page} 已在块 ${s.slot + 1} 中，命中，不需要置换。` : `Page ${s.page} is already in frame ${s.slot + 1}: a hit, nothing is replaced.`) + extra;
  }
  const head = z ? `页 ${s.page} 不在内存，发生缺页（累计第 ${s.faults} 次）。` : `Page ${s.page} is not in memory: page fault #${s.faults}. `;
  if (s.victim == null) return head + (z ? `还有空闲块，直接装入块 ${s.slot + 1}，不需要置换。` : `A frame is free, so it goes into frame ${s.slot + 1} with no eviction.`);
  const occ = b.frames.map((p, j) => ({ p, j }));
  if (sim.algo === 'FIFO')
    return head + (z ? `内存已满。各页装入的时刻：${occ.map((o) => `${o.p}（t=${b.loadedAt[o.j] + 1}）`).join('、')}，最早装入的是页 ${s.victim}，把它换出。` : `Memory is full. Load times: ${occ.map((o) => `${o.p} (t=${b.loadedAt[o.j] + 1})`).join(', ')}; page ${s.victim} came in first and is evicted.`);
  if (sim.algo === 'LRU')
    return head + (z ? `内存已满。各页最近一次被访问：${occ.map((o) => `${o.p}（t=${b.lastUse[o.j] + 1}）`).join('、')}，最久没用的是页 ${s.victim}，把它换出。` : `Memory is full. Last uses: ${occ.map((o) => `${o.p} (t=${b.lastUse[o.j] + 1})`).join(', ')}; page ${s.victim} has gone unused longest and is evicted.`);
  if (sim.algo === 'OPT') {
    const when = (j) => (s.next[j] === Infinity ? (z ? '不再访问' : 'never') : `t=${s.next[j] + 1}`);
    const nu = occ.map((o) => (z ? `${o.p}（${when(o.j)}）` : `${o.p} (${when(o.j)})`));
    return head + (z ? `内存已满。往后看访问串，各页下一次被访问：${nu.join('、')}，页 ${s.victim} 要等最久，把它换出。` : `Memory is full. Looking ahead, next uses are ${nu.join(', ')}; page ${s.victim} is needed last and is evicted.`);
  }
  const trace = s.scan.map((x) => (x.action === 'clear' ? (z ? `块 ${x.slot + 1} 访问位 1 → 清 0` : `frame ${x.slot + 1}: use 1 → 0`) : z ? `块 ${x.slot + 1} 访问位 0 → 换出页 ${b.frames[x.slot]}` : `frame ${x.slot + 1}: use 0 → evict page ${b.frames[x.slot]}`));
  return head + (z ? `内存已满。指针从块 ${b.ptr + 1} 开始扫描：${trace.join('；')}。新页装入后访问位置 1，指针移到块 ${s.after.ptr + 1}。` : `Memory is full. The hand starts at frame ${b.ptr + 1}: ${trace.join('; ')}. The new page gets use bit 1 and the hand moves to frame ${s.after.ptr + 1}.`);
}

// ───────────────────────── 解析、表格、部件状态 ─────────────────────────

function decode(ev) {
  const { sim, s } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  const b = s.before;
  const metric = (j) => {
    const p = b.frames[j];
    if (p == null) return T('空', 'empty');
    if (sim.algo === 'FIFO') return T(`页 ${p} · 装入 t=${b.loadedAt[j] + 1}`, `page ${p} · in at t=${b.loadedAt[j] + 1}`);
    if (sim.algo === 'LRU') return T(`页 ${p} · 最近访问 t=${b.lastUse[j] + 1}`, `page ${p} · last used t=${b.lastUse[j] + 1}`);
    if (sim.algo === 'OPT') return s.next[j] === Infinity ? T(`页 ${p} · 以后不再访问`, `page ${p} · never used again`) : T(`页 ${p} · 下次访问 t=${s.next[j] + 1}`, `page ${p} · next used at t=${s.next[j] + 1}`);
    return T(`页 ${p} · 访问位 ${b.use[j]}${b.ptr === j ? ' ← 指针' : ''}`, `page ${p} · use bit ${b.use[j]}${b.ptr === j ? ' ← hand' : ''}`);
  };
  const before = b.frames.map((_, j) => info(T(`块 ${j + 1}`, `Frame ${j + 1}`), metric(j), { tone: s.slot === j ? (s.hit ? 'green' : 'rose') : null }));
  const after = s.after.frames.map((p, j) => info(T(`块 ${j + 1}`, `Frame ${j + 1}`), p == null ? T('空', 'empty') : String(p)));
  return {
    label: T('置换解析', 'Replacement decoder'),
    tag: { color: s.hit ? 'green' : 'rose', text: s.hit ? T('命中', 'Hit') : T('缺页', 'Fault') },
    title: both((z) => (z ? `t=${s.t + 1} 访问页 ${s.page}` : `t=${s.t + 1}: page ${s.page}`)),
    meta: [
      [T('算法', 'Algorithm'), L(NAME[sim.algo])],
      [T('累计缺页', 'Faults so far'), String(s.faults)],
      [T('累计置换', 'Replacements'), String(s.replacements)],
    ],
    hint: T('左边是访问前各内存块的状态，下面是这一步的判断过程。', 'Frame state before this access, then the reasoning.'),
    view: { kind: 'none' },
    layers: [
      { name: T('访问前的内存块', 'Frames before'), summary: pages(b.frames), start: 0, end: 0, fields: before, open: true },
      { name: T('判断', 'Decision'), summary: s.hit ? T('命中', 'hit') : s.victim == null ? T('装入空闲块', 'free frame') : T(`换出页 ${s.victim}`, `evict ${s.victim}`), start: 0, end: 0, fields: [info(T('理由', 'Why'), both((z) => why(sim, s, z)), { note: true })], open: true },
      { name: T('访问后的内存块', 'Frames after'), summary: pages(s.after.frames), start: 0, end: 0, fields: after, open: true },
    ],
  };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok) return '';
  const t = snap?.t ?? -1;
  const z = lesson.z();
  const N = sim.refs.length;
  const head = ['', ...sim.refs.map((_, i) => `${i + 1}`)];
  const col = (i, v) => (i <= t ? v : '');
  const mark = (i) => (i === t ? 'is-cur' : '');
  const cells = (arr) => arr.map((v, i) => `<span class="${mark(i)}">${v}</span>`);
  const rows = [
    { cls: 'row-ref', cells: [z ? '访问' : 'ref', ...cells(sim.refs.map((p) => p))] },
    ...Array.from({ length: sim.n }, (_, j) => ({ cells: [z ? `块 ${j + 1}` : `F${j + 1}`, ...cells(sim.steps.map((s, i) => col(i, s.after.frames[j] ?? '')))] })),
    { cls: 'row-fault', cells: [z ? '缺页' : 'fault', ...cells(sim.steps.map((s, i) => col(i, s.hit ? '' : '✗')))] },
  ];
  const done = sim.steps.slice(0, t + 1);
  const f = done.filter((s) => !s.hit).length;
  const summary = card(
    T('统计', 'Tally'),
    NAME[sim.algo],
    `<dl class="ms-kv"><div><dt>${z ? '已访问' : 'Accessed'}</dt><dd>${done.length} / ${N}</dd></div><div><dt>${z ? '缺页' : 'Faults'}</dt><dd>${f}</dd></div><div><dt>${z ? '置换' : 'Replacements'}</dt><dd>${done.filter((s) => !s.hit && s.victim != null).length}</dd></div><div><dt>${z ? '缺页率' : 'Fault rate'}</dt><dd>${done.length ? esc(frac(f, done.length)) : '—'}</dd></div></dl>`,
    'ms-regs',
  );
  return `<div class="ms ms-wide">${summary}${card(T('置换过程表', 'Replacement table'), T('列 = 第几次访问，行 = 内存块', 'columns = accesses, rows = frames'), table(head, rows), 'ms-grid is-focus')}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('访问记录', 'Accesses'),
  stateName: T('置换表', 'Table'),
  emptyRows: T('按「播放」或「单步」，每次访问会记在这里。点任意一行看这一步为什么换出这一页。', 'Press Play or Step; every access is logged here. Click a row to see why a page was chosen.'),
  cols: [
    { label: T('t', 't'), cls: 'col-no' },
    { label: T('访问页', 'Page'), cls: 'col-op' },
    { label: T('结果', 'Result'), cls: 'col-res' },
    { label: T('换出', 'Evicted'), cls: 'col-op' },
    { label: T('访问后内存', 'Frames after'), cls: 'col-info' },
  ],
  cells: (ev) => {
    const s = ev.s;
    return [`<i class="dot"></i>${s.t + 1}`, String(s.page), s.hit ? res('ok', T('命中', 'Hit')) : res('warn', T('缺页', 'Fault')), s.victim == null ? '—' : String(s.victim), pages(s.after.frames)];
  },
  decode,
  renderState,
});

// ───────────────────────── 生成课程 ─────────────────────────

export const DEFAULTS = { algo: 'LRU', frames: 3, refs: CLASSIC };

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'page-replace',
    kit,
    principle: VM_PRINCIPLE,
    where: [['os', 'memory']],
    tag: T('置换', 'PR'),
    name: T('页面置换算法', 'Page replacement'),
    full: T('FIFO · LRU · OPT · CLOCK，算缺页次数和缺页率', 'FIFO · LRU · OPT · CLOCK, counting page faults'),
    title: T(`${params.algo} · ${params.frames} 个内存块`, `${params.algo} · ${params.frames} frames`),
    badge: NAME[params.algo] ?? '',
    watchEntry: T('看动画', 'Watch'),
    quizEntry: T('自己做一遍', 'Try it yourself'),
    nodes: [],
    legend: [
      ['rose', T('缺页', 'Fault')],
      ['green', T('命中', 'Hit')],
    ],
    sim,
    z: () => getLang() === 'zh',
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '进程只分到几个内存块，访问的页不在内存里就要缺页、从磁盘调入；内存满了还得先换出一页。换出哪一页，就是置换算法要回答的问题。下面可以换算法、改块数和访问串，每一步换出谁都是算出来的。',
        'A process gets only a few frames. When a page it touches is not in memory, a page fault brings it in from disk, and if memory is full another page must go first. Which one is the question a replacement algorithm answers. Change the algorithm, frame count or reference string; every eviction is computed.',
      ),
      facts: sim.ok
        ? [
            [T('算法', 'Algorithm'), NAME[sim.algo]],
            [T('规则', 'Rule'), RULE[sim.algo]],
            [T('内存块数', 'Frames'), String(sim.n)],
            [T('访问串', 'References'), both((z) => `${sim.refs.join(' ')}（${sim.refs.length} ${z ? '次' : 'refs'}）`)],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: sim.ok ? [{ type: 'board', items: boardAt(sim, -1, true) }, { type: 'snap', snap: { t: -1 } }] : [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  // 画板内容和语言有关（块号文字），每步的 board 事件里放中英两份，渲染时按当前语言取
  const boardEv = (t) => ({ type: 'board', items: boardAt(sim, t, true), itemsEn: boardAt(sim, t, false) });
  lesson.start.events[0] = boardEv(-1);
  lesson.steps = sim.steps.map((s) => {
    return {
      ref: s.hit ? 'local' : s.victim == null ? 'demand' : 'algo',
      title: s.hit ? T(`t=${s.t + 1} 访问页 ${s.page}：命中`, `t=${s.t + 1} page ${s.page}: hit`) : s.victim == null ? T(`t=${s.t + 1} 访问页 ${s.page}：缺页，装入空闲块`, `t=${s.t + 1} page ${s.page}: fault, free frame`) : T(`t=${s.t + 1} 访问页 ${s.page}：缺页，换出 ${s.victim}`, `t=${s.t + 1} page ${s.page}: fault, evict ${s.victim}`),
      desc: T(`内存 ${pages(s.after.frames)}`, `Frames ${pages(s.after.frames)}`),
      detail: both((z) => why(sim, s, z)),
      facts: [
        [T('访问页', 'Page'), String(s.page)],
        [T('结果', 'Result'), s.hit ? T('命中', 'hit') : T('缺页', 'page fault')],
        [T('换出', 'Evicted'), s.victim == null ? T('无', 'none') : String(s.victim)],
        [T('累计缺页', 'Faults so far'), `${s.faults} / ${s.t + 1}`],
      ],
      events: [
        boardEv(s.t),
        { type: 'row', color: s.hit ? 'green' : 'rose', s, sim },
        { type: 'snap', snap: { t: s.t } },
      ],
    };
  });
  lesson.outro = {
    title: T('访问串走完了', 'All references done'),
    text: both((z) =>
      z
        ? `${sim.refs.length} 次访问中缺页 ${sim.faults} 次，缺页率 ${frac(sim.faults, sim.refs.length)}。${sim.algo === 'FIFO' ? '试试「Belady 异常」两个预设：同一个访问串，FIFO 分到 4 块反而比 3 块缺页更多。' : '换成别的算法再走一遍，比比缺页次数：OPT 最少，它是其他算法的下限。'}`
        : `${sim.faults} faults in ${sim.refs.length} references, fault rate ${frac(sim.faults, sim.refs.length)}. ${sim.algo === 'FIFO' ? 'Try the two Belady presets: with the same string FIFO faults more with 4 frames than with 3.' : 'Run another algorithm on the same string and compare: OPT is the lower bound.'}`,
    ),
    facts: [
      [T('缺页次数', 'Page faults'), String(sim.faults)],
      [T('缺页率', 'Fault rate'), frac(sim.faults, sim.refs.length)],
      [T('置换次数', 'Replacements'), both((z) => (z ? `${sim.replacements}（缺页 ${sim.faults} − 装入空闲块 ${sim.faults - sim.replacements}）` : `${sim.replacements} (${sim.faults} faults − ${sim.faults - sim.replacements} free loads)`))],
      [T('命中次数', 'Hits'), String(sim.refs.length - sim.faults)],
    ],
  };
  return lesson;
}

export const makePaging = () => parametric('page-replace', DEFAULTS, build);

/** 做题模式用：按给定参数生成一节课，不读写课程表单保存的参数 */
export function buildPagingLesson(params) {
  return build(params);
}
