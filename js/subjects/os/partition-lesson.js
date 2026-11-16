// 「连续分配：动态分区」这节课：一整条物理内存横着摆，进程申请时按算法逐个检查空闲分区，
// 释放时按四种情况合并；分配失败时可以紧凑。另附一份「原理」讲解（core/doc.js 渲染）。
import { bar, boardKit, line, res, txt } from '../../core/board.js';
import { L, T, esc, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { ALGOS, freeList, searchOrder, simulate } from './partition.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'];
const S = 'A+120, B+50, C+70, D+80, A-, C-, E+60, F+100, G+150';
const MERGE = 'A+100, B+100, C+100, D+100, E+100, B-, C-, E-, D-, A-';

const NAME = {
  FF: T('首次适应 FF', 'First fit (FF)'),
  BF: T('最佳适应 BF', 'Best fit (BF)'),
  WF: T('最坏适应 WF', 'Worst fit (WF)'),
  NF: T('邻近适应 NF', 'Next fit (NF)'),
};
const ORDER = {
  FF: T('按起始地址递增', 'by address'),
  BF: T('按大小递增', 'smallest first'),
  WF: T('按大小递减', 'largest first'),
  NF: T('从上次分配结束处起按地址循环', 'by address, from where the last one ended'),
};
const CASE = {
  none: T('前后都不空闲：新增一个空闲分区', 'Neither neighbour is free: a new free partition'),
  prev: T('只和前面的空闲分区相邻：并入前一块', 'Only the previous neighbour is free: merge into it'),
  next: T('只和后面的空闲分区相邻：并入后一块，起址改为回收区的起址', 'Only the next neighbour is free: merge, keeping the freed start address'),
  both: T('前后都空闲：三块合成一块，空闲分区少了一个', 'Both neighbours are free: three become one'),
};

const SPEC = {
  presets: [
    { label: T('首次适应', 'First fit'), set: { algo: 'FF', mem: 640, os: 40, ops: S, minFrag: 0, compactOnFail: false } },
    { label: T('最佳适应', 'Best fit'), set: { algo: 'BF', mem: 640, os: 40, ops: S, minFrag: 0, compactOnFail: false } },
    { label: T('最坏适应（会失败）', 'Worst fit (fails)'), set: { algo: 'WF', mem: 640, os: 40, ops: S, minFrag: 0, compactOnFail: false } },
    { label: T('邻近适应', 'Next fit'), set: { algo: 'NF', mem: 640, os: 40, ops: S, minFrag: 0, compactOnFail: false } },
    { label: T('外部碎片 + 紧凑', 'Fragmentation + compaction'), set: { algo: 'WF', mem: 640, os: 40, ops: S, minFrag: 0, compactOnFail: true } },
    { label: T('回收的四种情况', 'The four merge cases'), set: { algo: 'FF', mem: 640, os: 40, ops: MERGE, minFrag: 0, compactOnFail: false } },
  ],
  groups: [
    {
      legend: T('内存', 'Memory'),
      fields: [
        { name: 'algo', label: T('分配算法', 'Algorithm'), type: 'select', options: ALGOS.map((a) => [a, NAME[a]]), wide: true },
        { name: 'mem', label: T('内存大小（K）', 'Memory (K)'), type: 'int', min: 16, max: 8192 },
        { name: 'os', label: T('操作系统占用（K）', 'OS area (K)'), type: 'int', min: 0, max: 8191 },
      ],
    },
    {
      legend: T('操作序列', 'Requests'),
      fields: [
        { name: 'ops', label: T('A+120 表示 A 申请 120K，A- 表示 A 释放', 'A+120: A asks for 120K; A-: A frees its partition'), type: 'text', wide: true, hint: T('用逗号或空格分隔，最多 16 个操作', 'Separate with commas or spaces, up to 16 operations') },
        { name: 'minFrag', label: T('最小分割（K，0 = 不设）', 'Minimum leftover (K, 0 = none)'), type: 'int', min: 0, max: 8192 },
        { name: 'compactOnFail', label: T('分配失败但总空闲够时，先紧凑再分配', 'Compact and retry when the total free space would suffice'), type: 'check', wide: true },
      ],
    },
  ],
  note: T(
    '内存低端是操作系统，不参与分配。从选中的空闲分区的低地址端切出所需大小，剩下的仍是空闲分区；设了最小分割时，剩下的部分太小就整块分配（多出来的成为内部碎片）。邻近适应从上次分配结束的位置开始找，初始位置是用户区的起点。回收时只和地址相邻的空闲分区合并。',
    'The OS sits at the low end and is never allocated. The request is cut from the low end of the chosen free partition and the rest stays free; with a minimum leftover set, a too-small remainder is handed out too (becoming internal fragmentation). Next fit resumes where the last allocation ended, starting from the bottom of the user area. A freed partition merges only with free neighbours.',
  ),
};

const ERR = {
  mem: T('内存大小要在 16～8192K 之间', 'Memory must be 16–8192K'),
  os: T('操作系统占用要小于内存大小', 'The OS area must be smaller than memory'),
  algo: T('请选择算法', 'Pick an algorithm'),
  minFrag: T('最小分割不能为负', 'The minimum leftover cannot be negative'),
  op: T('看不懂这个操作：{op}', 'Cannot read this operation: {op}'),
  count: T('操作要有 1～16 个', 'Give 1–16 operations'),
  dupName: T('{name} 已经占着一个分区，不能再申请（先释放）', '{name} already holds a partition; free it first'),
  noProc: T('{name} 没有占用分区，不能释放', '{name} holds no partition to free'),
};

// ───────────────────────── 画板 ─────────────────────────

const K = (v) => `${v}K`;
const H = 54;
const D = 0; // 平面的内存条（不画立体厚度）

function geo(sim) {
  const x0 = 90;
  const W = 780;
  const sc = W / sim.mem;
  const y = 330;
  return { x0, W, sc, y, X: (a) => x0 + a * sc, hover: y - 128, rect: [x0 - 80, y - 210, x0 + W + 50, y + 92] };
}

function toneMap(sim) {
  const m = {};
  let i = 0;
  for (const op of sim.ops) if (op.type === 'alloc' && !(op.name in m)) m[op.name] = TONES[i++ % TONES.length];
  return m;
}

const HATCH = `<defs><pattern id="hatch-free" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="7" class="hatch-line"/></pattern><pattern id="hatch-waste" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5" class="df-wline"/></pattern></defs>`;

/**
 * 画出一组分区。opts：
 *   order     空闲分区的查找顺序（画编号）
 *   mark      { start: 'check' | 'fit' | 'nofit' | 'chosen' | 'fresh' | 'merged' }
 *   req       { name, size, at: 地址 | null（左侧）, state: 'fit' | 'nofit' | 'bad' }
 *   ptr       邻近适应的指针
 *   lift      刚被释放、正在离开的进程名
 */
function boardOf(sim, blocks, z, opts = {}) {
  const g = geo(sim);
  const tone = toneMap(sim);
  const items = [{ k: 'defs', x: 0, y: 0, html: HATCH }];
  const order = opts.order ?? [];
  for (const b of blocks) {
    const w = b.size * g.sc;
    const x = g.X(b.start);
    const narrow = w < 40;
    if (b.owner === 'OS') {
      items.push({ k: 'os', x, y: g.y, html: bar(w, H, { tone: 'slate', d: D, text: narrow ? '' : 'OS' }) });
      continue;
    }
    if (b.owner) {
      const label = narrow ? '' : `${b.owner} ${K(b.size)}`;
      items.push({ k: `p-${b.owner}`, x, y: g.y, html: bar(w, H, { tone: tone[b.owner], d: D, text: label }) + (b.need && b.need < b.size ? `<rect class="waste" x="${(b.need * g.sc).toFixed(1)}" y="${-H}" width="${((b.size - b.need) * g.sc).toFixed(1)}" height="${H}"/>` : '') });
      continue;
    }
    const m = opts.mark?.[b.start];
    const no = order.findIndex((o) => o.start === b.start);
    const badge = no >= 0 && opts.showOrder !== false ? `<g class="ord ${m ?? ''}"><circle cx="${(w / 2).toFixed(1)}" cy="${-H - 26}" r="10"/>${txt(w / 2, -H - 22, String(no + 1), 'bt-ord')}</g>` : '';
    items.push({ k: `f-${b.start}`, x, y: g.y, cls: m ? `is-${m}` : '', html: bar(w, H, { cls: `free ${m ?? ''}`, d: D, text: narrow ? '' : K(b.size) }) + badge });
  }
  // 地址刻度
  const marks = [...new Set([0, sim.mem, ...blocks.map((b) => b.start)])].sort((a, b) => a - b);
  let ax = line(0, 0, g.W, 0, 'bl-axis');
  let lastX = -99;
  let lift = false;
  for (const a of marks) {
    const x = a * g.sc;
    lift = x - lastX < 30 ? !lift : false;
    lastX = x;
    ax += line(x, -4, x, 4, 'bl-axis') + txt(x, lift ? 30 : 17, String(a), 'bt-idx');
  }
  items.push({ k: 'axis', x: g.x0, y: g.y + 10, html: ax + txt(-14, 4, z ? '地址(K)' : 'addr (K)', 'bt-cap', 'end') });
  if (sim.algo === 'NF' && opts.ptr != null) items.push({ k: 'ptr', x: g.X(opts.ptr), y: g.y + 50, html: `<path class="bhead" d="M0,-8 L7,4 L-7,4 Z"/>` + txt(0, 20, z ? '指针' : 'pointer', 'bt-now') });
  if (opts.req) {
    const r = opts.req;
    const w = r.size * g.sc;
    const x = r.at == null ? g.x0 : g.X(r.at);
    items.push({ k: `p-${r.name}`, x, y: g.hover, cls: `req ${r.state ?? ''}`, from: [g.x0, g.hover - 30], html: bar(Math.max(w, 6), H * 0.8, { tone: r.state === 'bad' ? 'rose' : tone[r.name], d: D * 0.8, text: `${r.name} ${K(r.size)}` }) + (r.state === 'nofit' ? txt(w / 2, -H * 0.8 - 22, z ? '放不下' : 'too big', 'bt-mark bad') : r.state === 'fit' ? txt(w / 2, -H * 0.8 - 22, z ? '够用' : 'fits', 'bt-mark ok') : '') });
  }
  if (opts.lift) items.push({ k: `p-${opts.lift.owner}`, x: g.X(opts.lift.start), y: g.hover, o: 0, html: bar(opts.lift.size * g.sc, H, { tone: tone[opts.lift.owner], d: D, text: opts.lift.owner }) });
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

const rng = (b) => `[${b.start}, ${b.start + b.size})`;

function allocText(sim, s, z) {
  const ord = s.order.map((b, i) => `${i + 1}. ${K(b.size)}@${b.start}`).join(z ? '，' : ', ');
  const how = z ? `${NAME[sim.algo].zh.split(' ')[0]}把空闲分区${ORDER[sim.algo].zh}排好：${ord || '（没有空闲分区）'}。` : `${NAME[sim.algo].en} orders the free partitions ${ORDER[sim.algo].en}: ${ord || '(none)'}. `;
  const walk = s.checks.map((c) => (z ? `${K(c.size)}@${c.start}${c.fit ? ' 够用' : ' 不够'}` : `${K(c.size)}@${c.start} ${c.fit ? 'fits' : 'too small'}`)).join(z ? ' → ' : ' → ');
  const head = z ? `${s.op.name} 申请 ${K(s.op.size)}。` : `${s.op.name} asks for ${K(s.op.size)}. `;
  const retry = s.retry ? (z ? '紧凑之后重新分配。' : 'Retrying after compaction. ') : '';
  if (s.kind === 'fail') {
    const frag = s.external
      ? z
        ? `总空闲 ${K(s.totalFree)} 比 ${K(s.op.size)} 还多，但最大的一块只有 ${K(s.maxFree)}，分不出来。这些分散在进程之间、单独哪块都不够用的空闲区，就是外部碎片。${sim.compactOnFail ? '下一步紧凑。' : '可以打开「先紧凑再分配」看看紧凑怎么解决它。'}`
        : `There is ${K(s.totalFree)} free in total, more than ${K(s.op.size)}, but the largest piece is only ${K(s.maxFree)}. Free space scattered between processes, no piece big enough on its own, is external fragmentation.${sim.compactOnFail ? ' Compaction comes next.' : ' Turn on compaction to see it fixed.'}`
      : z
        ? `总空闲只有 ${K(s.totalFree)}，确实不够。`
        : `Only ${K(s.totalFree)} is free in total: genuinely not enough.`;
    return head + retry + how + (walk ? (z ? `依次检查：${walk}。` : `Checks: ${walk}. `) : '') + (z ? '没有一块够用，分配失败。' : 'Nothing fits: allocation fails. ') + frag;
  }
  const cut = s.internal
    ? z
      ? `剩下 ${K(s.internal)} 小于最小分割 ${K(sim.minFrag)}，不再切开，整块 ${K(s.part.size)} 都给 ${s.op.name}，多出的 ${K(s.internal)} 是内部碎片。`
      : `The ${K(s.internal)} remainder is below the ${K(sim.minFrag)} minimum, so all ${K(s.part.size)} goes to ${s.op.name}; the extra ${K(s.internal)} is internal fragmentation.`
    : s.rest
      ? z
        ? `从它的低地址端切出 ${K(s.op.size)} 给 ${s.op.name}，占 ${rng(s.part)}；剩下的 ${K(s.rest)} 还是空闲分区，起址变成 ${s.part.start + s.part.size}。`
        : `${K(s.op.size)} is cut from its low end for ${s.op.name}, occupying ${rng(s.part)}; the remaining ${K(s.rest)} stays free from ${s.part.start + s.part.size}.`
      : z
        ? `大小正好，整块给 ${s.op.name}，这个空闲分区从表里删掉。`
        : `It fits exactly, so the whole partition goes to ${s.op.name} and leaves the free list.`;
  const nf = sim.algo === 'NF' ? (z ? `指针移到 ${s.ptr}。` : ` The pointer moves to ${s.ptr}.`) : '';
  return head + retry + how + (z ? `依次检查：${walk}。` : `Checks: ${walk}. `) + (z ? `选中 ${K(s.chosen.size)}@${s.chosen.start}。` : `It picks ${K(s.chosen.size)}@${s.chosen.start}. `) + cut + nf;
}

function freeText(sim, s, z) {
  const head = z ? `${s.op.name} 释放 ${rng(s.freed)}（${K(s.freed.size)}）。` : `${s.op.name} frees ${rng(s.freed)} (${K(s.freed.size)}). `;
  const nb = z
    ? `前面${s.prev ? `是空闲分区 ${rng(s.prev)}` : '不是空闲分区'}，后面${s.next ? `是空闲分区 ${rng(s.next)}` : '不是空闲分区'}。`
    : `The previous neighbour is ${s.prev ? `free, ${rng(s.prev)}` : 'not free'}; the next is ${s.next ? `free, ${rng(s.next)}` : 'not free'}. `;
  const res2 = { none: z ? `不合并，空闲分区表新增一项 ${rng(s.merged)}。` : `No merge: a new entry ${rng(s.merged)}.`, prev: z ? `并入前一块，前一块的起址不变、大小变成 ${K(s.merged.size)}：${rng(s.merged)}。` : `It merges into the previous one, which keeps its start and grows to ${K(s.merged.size)}: ${rng(s.merged)}.`, next: z ? `和后一块合并，起址改为回收区的 ${s.merged.start}、大小 ${K(s.merged.size)}：${rng(s.merged)}。表项数不变。` : `It merges with the next one; the start becomes ${s.merged.start}, size ${K(s.merged.size)}: ${rng(s.merged)}. Same number of entries.`, both: z ? `三块合成一块 ${rng(s.merged)}，用前一块的表项，删掉后一块的表项，空闲分区少了一个。` : `All three become ${rng(s.merged)}: the previous entry is kept, the next one removed, one entry fewer.` }[s.case];
  return head + nb + res2;
}

function compactText(sim, s, z) {
  const mv = s.moves.filter((m) => m.from !== m.to).map((m) => `${m.owner} ${m.from}→${m.to}`).join(z ? '，' : ', ');
  return z
    ? `紧凑：把各进程按原来的先后顺序挪到用户区低端（${mv || '都不用挪'}），所有空闲区拼成一整块 [${s.free ? sim.mem - s.free : sim.mem}, ${sim.mem})，共 ${K(s.free)}。进程被挪动后起址变了，所以紧凑要靠动态重定位：只改重定位寄存器，程序里的逻辑地址不用改。`
    : `Compaction slides every process, in order, down to the bottom of the user area (${mv || 'nothing moves'}) so the free space becomes one block [${sim.mem - s.free}, ${sim.mem}) of ${K(s.free)}. Moved processes have new base addresses, which only works with dynamic relocation: update the relocation register, not the program.`;
}

// ───────────────────────── 原理 ─────────────────────────

/** 一条平面的内存示意条：segs = [{ size, kind: 'os' | 'used' | 'free' | 'waste', label }] */
function memFig(rows, z) {
  const W = 520;
  const RH = 34;
  const gap = 30;
  const left = 120;
  const Hh = rows.length * (RH + gap) + 6;
  let s = '';
  rows.forEach((r, i) => {
    const y = i * (RH + gap) + 18;
    const total = r.segs.reduce((a, b) => a + b.size, 0);
    let x = left;
    s += `<text class="df-name" x="${left - 10}" y="${y + RH / 2 + 4}" text-anchor="end">${esc(z ? r.zh : r.en)}</text>`;
    for (const g of r.segs) {
      const w = (g.size / total) * W;
      s += `<rect class="df-${g.kind}" x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${RH}" rx="2"/>`;
      if (g.label) s += `<text class="df-lab ${g.kind}" x="${(x + w / 2).toFixed(1)}" y="${y + RH / 2 + 4}" text-anchor="middle">${esc(z ? g.label.zh ?? g.label : g.label.en ?? g.label)}</text>`;
      x += w;
    }
    if (r.note) s += `<text class="df-note" x="${left}" y="${y + RH + 15}">${esc(z ? r.note.zh : r.note.en)}</text>`;
  });
  return `<svg class="doc-svg" viewBox="0 0 ${left + W + 10} ${Hh}" role="img">${HATCH_FIG}${s}</svg>`;
}

const HATCH_FIG = `<defs><pattern id="df-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="df-hline"/></pattern><pattern id="df-waste" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="5" class="df-wline"/></pattern></defs>`;

const lab = (zh, en) => ({ zh, en });

function relocFig(z) {
  const t = (zh, en) => esc(z ? zh : en);
  return `<svg class="doc-svg" viewBox="0 0 640 170" role="img">
    <defs><marker id="df-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="df-arrow"/></marker></defs>
    <rect class="df-box" x="10" y="60" width="110" height="44" rx="6"/><text class="df-t" x="65" y="80" text-anchor="middle">${t('逻辑地址', 'Logical')}</text><text class="df-v" x="65" y="96" text-anchor="middle">100</text>
    <rect class="df-box acc" x="170" y="10" width="130" height="40" rx="6"/><text class="df-t" x="235" y="27" text-anchor="middle">${t('界地址寄存器', 'Limit register')}</text><text class="df-v" x="235" y="43" text-anchor="middle">${t('长度', 'length')} 200</text>
    <path class="df-diamond" d="M235,60 L285,82 L235,104 L185,82 Z"/><text class="df-t" x="235" y="86" text-anchor="middle">&lt; ?</text>
    <line class="df-line" x1="120" y1="82" x2="183" y2="82" marker-end="url(#df-arr)"/>
    <line class="df-line" x1="235" y1="50" x2="235" y2="58" marker-end="url(#df-arr)"/>
    <line class="df-line bad" x1="235" y1="104" x2="235" y2="138" marker-end="url(#df-arr)"/><text class="df-t bad" x="245" y="154">${t('否：越界中断', 'no: trap')}</text>
    <circle class="df-box" cx="360" cy="82" r="20"/><text class="df-t" x="360" y="88" text-anchor="middle">+</text>
    <line class="df-line" x1="287" y1="82" x2="338" y2="82" marker-end="url(#df-arr)"/><text class="df-t" x="300" y="74">${t('是', 'yes')}</text>
    <rect class="df-box acc" x="295" y="118" width="130" height="40" rx="6"/><text class="df-t" x="360" y="135" text-anchor="middle">${t('重定位寄存器', 'Relocation reg.')}</text><text class="df-v" x="360" y="151" text-anchor="middle">340</text>
    <line class="df-line" x1="360" y1="118" x2="360" y2="104" marker-end="url(#df-arr)"/>
    <line class="df-line" x1="380" y1="82" x2="458" y2="82" marker-end="url(#df-arr)"/>
    <rect class="df-box" x="460" y="60" width="110" height="44" rx="6"/><text class="df-t" x="515" y="80" text-anchor="middle">${t('物理地址', 'Physical')}</text><text class="df-v" x="515" y="96" text-anchor="middle">440</text>
    <line class="df-line" x1="570" y1="82" x2="628" y2="82" marker-end="url(#df-arr)"/><text class="df-t" x="600" y="74" text-anchor="middle">${t('内存', 'RAM')}</text>
  </svg>`;
}

export const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要管理内存的分配', 'Why memory must be allocated'),
      blocks: [
        { p: T('多道程序设计要求同时有好几个进程在内存里，它们都要占一段物理内存。操作系统要回答三个问题：**给谁、给多少、给哪一段**；进程结束后，还要把内存收回来，留给后来的进程。', 'Multiprogramming keeps several processes in memory at once, each needing a piece of physical memory. The OS must decide **who gets memory, how much, and which part**, and must take it back when a process ends.') },
        { p: T('**连续分配**是最直接的办法：给每个进程分配**一段地址连续**的物理内存。它简单，但「连续」这个要求正是后面所有麻烦（碎片）的来源。分页、分段就是为了摆脱这个要求而出现的。', '**Contiguous allocation** is the simplest answer: each process gets **one contiguous range** of physical memory. It is simple, but the contiguity requirement is the root of all the trouble below (fragmentation), and it is exactly what paging and segmentation later remove.') },
      ],
    },
    {
      id: 'kinds',
      title: T('三种连续分配方式', 'Three contiguous schemes'),
      blocks: [
        {
          fig: (z) =>
            memFig(
              [
                { zh: '单一连续', en: 'Single', segs: [{ size: 12, kind: 'os', label: 'OS' }, { size: 40, kind: 'used', label: lab('用户程序', 'program') }, { size: 48, kind: 'waste', label: lab('用不上', 'unused') }], note: lab('用户区只放一道程序', 'one program in the user area') },
                { zh: '固定分区', en: 'Fixed', segs: [{ size: 12, kind: 'os', label: 'OS' }, { size: 14, kind: 'used', label: 'A' }, { size: 8, kind: 'waste' }, { size: 20, kind: 'used', label: 'B' }, { size: 6, kind: 'waste' }, { size: 26, kind: 'free', label: lab('空分区', 'empty') }, { size: 14, kind: 'used', label: 'C' }], note: lab('分区事先划好；斜纹是分区里没用上的部分：内部碎片', 'partitions are fixed in advance; the hatched parts inside them are internal fragmentation') },
                { zh: '动态分区', en: 'Dynamic', segs: [{ size: 12, kind: 'os', label: 'OS' }, { size: 22, kind: 'used', label: 'A' }, { size: 9, kind: 'free' }, { size: 18, kind: 'used', label: 'B' }, { size: 7, kind: 'free' }, { size: 24, kind: 'used', label: 'C' }, { size: 8, kind: 'free' }], note: lab('按需划分，分区之间留下零散的空闲块：外部碎片', 'carved on demand; small free gaps between partitions are external fragmentation') },
              ],
              z,
            ),
          caption: T('灰色是操作系统，彩色是进程，白底斜线是空闲区，红色斜纹是分配了却用不上的部分', 'Grey: OS; coloured: processes; hatched: free; red hatch: allocated but unused'),
        },
        {
          table: {
            head: [T('方式', 'Scheme'), T('怎么划分', 'How'), T('多道', 'Multi-programming'), T('碎片', 'Fragmentation')],
            rows: [
              [T('单一连续分配', 'Single contiguous'), T('内存分为系统区和用户区，用户区只装一道程序', 'System area + one user program'), T('不支持', 'no'), T('内部碎片（用户区里没用上的部分）', 'internal')],
              [T('固定分区分配', 'Fixed partitions'), T('用户区预先划成若干分区（大小可以相等或不等），每个分区装一道程序，用分区说明表记录', 'User area split in advance (equal or unequal sizes), one program per partition, tracked in a partition table'), T('支持', 'yes'), T('内部碎片；程序比最大的分区还大就装不下', 'internal; programs larger than every partition cannot load')],
              [T('动态分区分配', 'Dynamic partitions'), T('进程装入时按实际需要划出一个分区', 'A partition is carved to the exact size at load time'), T('支持', 'yes'), T('外部碎片', 'external')],
            ],
          },
        },
      ],
    },
    {
      id: 'frag',
      title: T('内部碎片与外部碎片', 'Internal vs external fragmentation'),
      blocks: [
        {
          cols: [
            [{ p: T('**内部碎片**：已经分给某个进程、但进程用不上的那部分空间。它在分区**里面**，别的进程也用不了。固定分区、单一连续分配都有。', '**Internal fragmentation**: space handed to a process that it does not use. It lies **inside** a partition, so nobody else can use it either. Fixed and single contiguous allocation have it.') }],
            [{ p: T('**外部碎片**：分区**之间**的空闲块，每一块都太小，装不下新进程，但加起来可能不少。动态分区分配用久了一定会出现。', '**External fragmentation**: free pieces **between** partitions, each too small for a new process although together they may be large. Dynamic partitioning inevitably produces it.') }],
          ],
        },
        {
          fig: (z) =>
            memFig(
              [
                { zh: '外部碎片', en: 'External', segs: [{ size: 10, kind: 'os', label: 'OS' }, { size: 16, kind: 'used', label: 'B' }, { size: 14, kind: 'free', label: lab('70K', '70K') }, { size: 16, kind: 'used', label: 'D' }, { size: 24, kind: 'free', label: lab('120K', '120K') }, { size: 20, kind: 'used', label: 'F' }], note: lab('还要 150K：总空闲 190K 够，但最大一块只有 120K，分不出来', 'Need 150K: 190K is free in total, but the largest piece is 120K') },
              ],
              z,
            ),
        },
        { tip: T('外部碎片可以用**紧凑**消除：把进程挪到一起，让空闲区连成一片（见第 6 节）。内部碎片在连续分配里只能靠合理划分分区来减少。', 'External fragmentation can be removed by **compaction** (section 6). Internal fragmentation can only be reduced by choosing partition sizes well.') },
      ],
    },
    {
      id: 'algo',
      title: T('四种动态分区分配算法', 'Four placement algorithms'),
      blocks: [
        { p: T('动态分区分配时，空闲分区可能有好几块都够大。选哪一块，就是分配算法要回答的。四种算法的区别只在于**空闲分区按什么顺序排、从哪里开始找**，找到第一个够大的就停。', 'With dynamic partitions several free pieces may be big enough. The algorithms differ only in **how the free list is ordered and where the search starts**; each stops at the first piece that fits.') },
        {
          table: {
            head: [T('算法', 'Algorithm'), T('空闲分区的顺序', 'Free-list order'), T('优点', 'Pros'), T('缺点', 'Cons')],
            rows: [
              [T('首次适应 FF', 'First fit'), T('按起始地址递增，从头找', 'by address, from the start'), T('简单，开销小，综合性能通常最好', 'simple and cheap; usually the best overall'), T('低地址端留下许多小碎片，每次查找都要从它们身上经过', 'small fragments pile up at low addresses and are scanned every time')],
              [T('最佳适应 BF', 'Best fit'), T('按大小递增', 'smallest first'), T('选「刚好够」的，保留了大分区', 'keeps large pieces for large requests'), T('切下来的剩余部分最小，**产生的外部碎片最多**；分配、回收后要重新排序', 'leaves the tiniest leftovers, **the most external fragmentation**; must re-sort after every change')],
              [T('最坏适应 WF', 'Worst fit'), T('按大小递减', 'largest first'), T('切剩的部分最大，还能用，不易产生小碎片', 'leftovers stay large and usable'), T('大分区很快被拆光，后来的大进程分配不到；也要重新排序', 'large pieces vanish quickly, so big requests later fail; must re-sort')],
              [T('邻近适应 NF', 'Next fit'), T('按地址排成循环，从上次分配结束处继续找', 'by address, circular, resuming after the last allocation'), T('查找开销小，空闲分区的使用比较均匀', 'cheap searches, spreads allocations evenly'), T('高地址的大分区也会被拆开，最后往往缺少大的空闲分区', 'high-address large pieces get split too, so large free pieces become rare')],
            ],
          },
        },
        { tip: T('首次适应和邻近适应的空闲分区按地址排，回收时插到地址对应的位置就行；最佳适应和最坏适应按大小排，每次分配、回收后大小变了，都要重新排序。', 'First fit and next fit keep the list in address order, so a freed piece simply slots in; best fit and worst fit order by size and must re-sort after every allocation or release.') },
      ],
    },
    {
      id: 'merge',
      title: T('回收：四种合并情况', 'Freeing: the four merge cases'),
      blocks: [
        { p: T('进程释放分区时，要看它**前后相邻**的是不是空闲分区。相邻的空闲分区要合成一块，否则空闲区会被切得越来越碎。', 'When a partition is freed, check whether its **neighbours** are free. Adjacent free pieces must be merged, otherwise free space keeps getting chopped up.') },
        {
          fig: (z) =>
            memFig(
              [
                { zh: '① 都不相邻', en: '① neither', segs: [{ size: 25, kind: 'used', label: 'A' }, { size: 25, kind: 'fresh', label: lab('回收区', 'freed') }, { size: 25, kind: 'used', label: 'C' }, { size: 25, kind: 'used', label: 'D' }], note: lab('新增一个表项，空闲分区数 +1', 'add an entry: one more free partition') },
                { zh: '② 只与前一块相邻', en: '② previous', segs: [{ size: 25, kind: 'free', label: lab('空闲', 'free') }, { size: 25, kind: 'fresh', label: lab('回收区', 'freed') }, { size: 25, kind: 'used', label: 'C' }, { size: 25, kind: 'used', label: 'D' }], note: lab('并入前一块：前一块起址不变，大小相加；表项数不变', 'merge into the previous piece: same start, sizes add; same count') },
                { zh: '③ 只与后一块相邻', en: '③ next', segs: [{ size: 25, kind: 'used', label: 'A' }, { size: 25, kind: 'fresh', label: lab('回收区', 'freed') }, { size: 25, kind: 'free', label: lab('空闲', 'free') }, { size: 25, kind: 'used', label: 'D' }], note: lab('与后一块合并：起址改成回收区的起址，大小相加；表项数不变', 'merge with the next piece: start becomes the freed start; same count') },
                { zh: '④ 前后都相邻', en: '④ both', segs: [{ size: 25, kind: 'free', label: lab('空闲', 'free') }, { size: 25, kind: 'fresh', label: lab('回收区', 'freed') }, { size: 25, kind: 'free', label: lab('空闲', 'free') }, { size: 25, kind: 'used', label: 'D' }], note: lab('三块合一：用前一块的表项，删掉后一块的表项，空闲分区数 −1', 'three become one: keep the previous entry, drop the next; one fewer') },
              ],
              z,
            ),
          caption: T('橙色是正在回收的分区', 'Orange: the partition being freed'),
        },
      ],
    },
    {
      id: 'compact',
      title: T('紧凑与动态重定位', 'Compaction and dynamic relocation'),
      blocks: [
        { p: T('**紧凑**（也叫拼接）：把内存里的进程挪到一起，让分散的空闲区连成一大块，从而消除外部碎片。代价是要搬动大量数据，很耗时，所以不会经常做。', '**Compaction** slides processes together so the scattered free space becomes one large block, removing external fragmentation. Moving that much data is expensive, so it is done rarely.') },
        { p: T('进程被挪动以后，它在物理内存里的起址变了。如果程序里写死的是物理地址，挪了就全错了。所以紧凑要求**动态重定位**：程序里用的是逻辑地址（从 0 开始），每次访问内存时由硬件临时加上**重定位寄存器**里的起址。挪动进程后只要改重定位寄存器。', 'Moving a process changes its base address, which would break any hard-coded physical addresses. Compaction therefore needs **dynamic relocation**: programs use logical addresses starting at 0, and hardware adds the **relocation register** on every access. After a move only that register changes.') },
        { formula: T('物理地址 = 重定位寄存器 + 逻辑地址　（逻辑地址必须小于界地址寄存器，否则越界中断）', 'physical = relocation register + logical address   (logical must be below the limit register, otherwise a trap)') },
        { fig: (z) => relocFig(z), caption: T('界地址寄存器（限长寄存器）用来做存储保护，防止进程访问到别人的分区', 'The limit register protects other partitions from the process') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('**动态分区没有内部碎片**（不设最小分割时），有外部碎片；固定分区、单一连续分配有内部碎片，没有外部碎片。', '**Dynamic partitioning has no internal fragmentation** (without a minimum leftover) but has external; fixed and single contiguous allocation are the other way round.'),
            T('「最佳适应」不是综合性能最好的，它留下的小碎片最多。综合性能通常是首次适应最好。', 'Best fit is not the best overall: it leaves the most tiny fragments. First fit usually performs best.'),
            T('最坏适应选**最大**的分区，最佳适应选**最小的够用**分区，别弄反。', 'Worst fit takes the **largest** piece, best fit the **smallest that fits**. Do not swap them.'),
            T('回收时前后都相邻，空闲分区数**减 1**；都不相邻**加 1**；只和一边相邻**不变**。', 'Freeing next to two free pieces **removes** an entry; next to none **adds** one; next to one leaves the count unchanged.'),
            T('分配失败不一定是空闲总量不够，可能是外部碎片：总量够，但没有一块够大。', 'A failed allocation may be fragmentation, not a shortage: the total suffices, no single piece does.'),
            T('紧凑要求动态重定位；静态重定位（装入时就改好地址）的程序不能随便挪。', 'Compaction requires dynamic relocation; programs relocated statically at load time cannot be moved.'),
            T('题目没说时，一般从空闲分区的**低地址端**开始切（本课也是这样）；注意看题目的说明。', 'Unless told otherwise, cut from the **low end** of the free partition (as here); read each question carefully.'),
          ],
        },
        { tip: T('外部碎片的根源是「必须连续」。下一节「基本分页」把进程切成固定大小的页，可以分散放进任何空闲页框，从根本上消除外部碎片。', 'External fragmentation comes from requiring contiguity. Paging, next, cuts processes into fixed-size pages that can go into any free frame, eliminating it.') },
      ],
    },
  ],
};

// ───────────────────────── 解析、表格、状态 ─────────────────────────

function decode(ev) {
  const { sim, s } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  const layers = [];
  if (s.kind === 'alloc' || s.kind === 'fail') {
    layers.push({ name: T('查找过程', 'Search'), summary: NAME[sim.algo], start: 0, end: 0, open: true, fields: s.checks.length ? s.checks.map((c, i) => info(T(`第 ${i + 1} 块`, `Piece ${i + 1}`), `${K(c.size)} @ ${c.start} · ${c.fit ? L(T('够用', 'fits')) : L(T('不够', 'too small'))}`, { tone: c.fit ? 'green' : null })) : [info(T('空闲分区', 'Free list'), T('没有', 'empty'))] });
  }
  if (s.kind === 'free') layers.push({ name: T('相邻情况', 'Neighbours'), summary: CASE[s.case], start: 0, end: 0, open: true, fields: [info(T('前一块', 'Previous'), s.prev ? `${L(T('空闲', 'free'))} ${rng(s.prev)}` : T('不是空闲分区', 'not free')), info(T('后一块', 'Next'), s.next ? `${L(T('空闲', 'free'))} ${rng(s.next)}` : T('不是空闲分区', 'not free')), info(T('合并后', 'Result'), rng(s.merged), { tone: 'green' })] });
  if (s.kind === 'compact') layers.push({ name: T('移动', 'Moves'), summary: '', start: 0, end: 0, open: true, fields: s.moves.map((m) => info(m.owner, `${m.from} → ${m.to}（${K(m.size)}）`)) });
  layers.push({ name: T('说明', 'Explanation'), summary: '', start: 0, end: 0, open: true, fields: [info(T('过程', 'Details'), ev.text, { note: true })] });
  return { label: T('分区解析', 'Partition decoder'), tag: { color: ev.color, text: ev.tag }, title: L(ev.what), meta: [[T('算法', 'Algorithm'), L(NAME[sim.algo])]], hint: '', view: { kind: 'none' }, layers };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok || !snap) return '';
  const z = getLang() === 'zh';
  const order = searchOrder(snap.blocks, sim.algo, snap.ptr);
  const frows = order.map((b, i) => ({ cls: snap.mark?.[b.start] === 'chosen' || snap.mark?.[b.start] === 'merged' ? 'm-hit' : '', cells: [i + 1, b.start, K(b.size), b.start + b.size] }));
  const arows = snap.blocks.filter((b) => b.owner).map((b) => ({ cls: b.owner === 'OS' ? 'is-empty' : '', cells: [esc(b.owner), b.start, K(b.size) + (b.need && b.need < b.size ? ` <span class="dim">(${z ? '用' : 'used'} ${K(b.need)})</span>` : ''), b.start + b.size] }));
  const fl = freeList(snap.blocks);
  const total = fl.reduce((a, b) => a + b.size, 0);
  const kv = `<dl class="ms-kv"><div><dt>${z ? '空闲总量' : 'Free total'}</dt><dd>${K(total)}</dd></div><div><dt>${z ? '最大空闲块' : 'Largest piece'}</dt><dd>${K(Math.max(0, ...fl.map((b) => b.size)))}</dd></div><div><dt>${z ? '空闲分区数' : 'Free pieces'}</dt><dd>${fl.length}</dd></div>${sim.algo === 'NF' ? `<div><dt>${z ? '指针' : 'Pointer'}</dt><dd>${snap.ptr}</dd></div>` : ''}</dl>`;
  return `<div class="ms">${card(T('统计', 'Tally'), NAME[sim.algo], kv, 'ms-regs')}${card(T('空闲分区表', 'Free partitions'), ORDER[sim.algo], table([z ? '序号' : '#', z ? '起址' : 'Start', z ? '大小' : 'Size', z ? '结束' : 'End'], frows), 'is-focus')}${card(T('已分配分区', 'Allocated'), '', table([z ? '进程' : 'Proc', z ? '起址' : 'Start', z ? '大小' : 'Size', z ? '结束' : 'End'], arows))}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('操作记录', 'Operations'),
  stateName: T('分区表', 'Partition tables'),
  emptyRows: T('按「播放」或「单步」，每次申请和释放都会记在这里。', 'Press Play or Step; every request and release is logged here.'),
  cols: [
    { label: T('序号', 'No.'), cls: 'col-no' },
    { label: T('操作', 'Operation'), cls: 'col-op' },
    { label: T('结果', 'Result'), cls: 'col-res' },
    { label: T('空闲分区（按地址）', 'Free partitions (by address)'), cls: 'col-info' },
  ],
  cells: (ev, idx) => [`<i class="dot"></i>${idx + 1}`, esc(L(ev.what)), res(ev.tone, ev.result), freeList(ev.s.after).map((b) => `${K(b.size)}@${b.start}`).join('  ') || '—'],
  decode,
  renderState,
});

// ───────────────────────── 生成课程 ─────────────────────────

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'partition',
    kit,
    where: [['os', 'memory']],
    tag: T('分区', 'Part'),
    name: T('连续分配：动态分区', 'Contiguous allocation'),
    full: T('首次 / 最佳 / 最坏 / 邻近适应 · 回收合并 · 外部碎片 · 紧凑', 'First / best / worst / next fit · merging · fragmentation · compaction'),
    title: T(`${NAME[params.algo]?.zh.split(' ')[0] ?? ''} · 内存 ${params.mem}K`, `${params.algo} · ${params.mem}K memory`),
    badge: NAME[params.algo] ?? '',
    nodes: [],
    legend: [
      ['slate', T('操作系统', 'OS')],
      ['blue', T('进程分区', 'Process')],
      ['amber', T('正在检查', 'Checking')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: [],
    overview: {
      desc: T(
        '每个进程要占一段连续的物理内存。进程来了，从空闲分区里挑一块切给它；进程走了，把它占的分区收回来并和相邻的空闲区合并。挑哪一块，就是首次 / 最佳 / 最坏 / 邻近适应四种算法的区别。左上角可以切到「原理」先把道理看明白，再回来看动画。',
        'Each process needs one contiguous piece of physical memory. When it arrives, a free piece is cut for it; when it leaves, its piece is returned and merged with free neighbours. Which piece to cut is what first, best, worst and next fit disagree on. Switch to “Principle” at the top left to read the ideas first, then come back for the animation.',
      ),
      facts: sim.ok
        ? [
            [T('算法', 'Algorithm'), NAME[sim.algo]],
            [T('空闲分区的顺序', 'Free-list order'), ORDER[sim.algo]],
            [T('用户区', 'User area'), `[${sim.os}, ${sim.mem})  ${K(sim.mem - sim.os)}`],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: geo({ mem: params.mem || 640 }).rect }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) {
    lesson.errors = sim.errors.map(([k, v]) => ({ zh: ERR[k].zh.replace('{op}', v?.op ?? '').replace('{name}', v?.name ?? ''), en: ERR[k].en.replace('{op}', v?.op ?? '').replace('{name}', v?.name ?? '') }));
    return lesson;
  }
  const g = geo(sim);
  const boardEv = (opts, blocks, ms) => ({ type: 'board', items: boardOf(sim, blocks, true, opts), itemsEn: boardOf(sim, blocks, false, opts), ms });
  const initial = [...(sim.os ? [{ start: 0, size: sim.os, owner: 'OS' }] : []), { start: sim.os, size: sim.mem - sim.os, owner: null }];
  lesson.start.events = [boardEv({ order: searchOrder(initial, sim.algo, sim.os), ptr: sim.os }, initial), { type: 'snap', snap: { blocks: initial, ptr: sim.os } }];
  const tone = toneMap(sim);
  lesson.steps = sim.steps.map((s) => {
    const evs = [];
    let what;
    let result;
    let rtone;
    let title;
    let ref;
    let text;
    let color;
    let tag;
    if (s.kind === 'alloc' || s.kind === 'fail') {
      const ptrB = s.ptrBefore ?? s.ptr;
      evs.push(boardEv({ order: s.order, req: { name: s.op.name, size: s.op.size, at: null }, ptr: ptrB }, s.before, 450));
      s.checks.forEach((c, i) => {
        const mark = {};
        s.checks.slice(0, i).forEach((p) => (mark[p.start] = 'nofit'));
        mark[c.start] = c.fit ? 'fit' : 'check';
        evs.push(boardEv({ order: s.order, mark, req: { name: s.op.name, size: s.op.size, at: c.start, state: c.fit ? 'fit' : 'nofit' }, ptr: ptrB }, s.before, 520));
      });
      if (s.kind === 'alloc') {
        const after = s.after;
        const mark = {};
        if (s.rest) mark[s.part.start + s.part.size] = 'chosen';
        evs.push(boardEv({ order: searchOrder(after, sim.algo, s.ptr), mark, ptr: s.ptr }, after, 600));
        evs.push({ type: 'note', at: [g.X(s.part.start + s.part.size / 2), g.y - H - 40], text: T(`${s.op.name} → [${s.part.start}, ${s.part.start + s.part.size})`, `${s.op.name} → [${s.part.start}, ${s.part.start + s.part.size})`), tone: 'ok' });
        title = T(`${s.op.name} 申请 ${K(s.op.size)} → 分到 [${s.part.start}, ${s.part.start + s.part.size})`, `${s.op.name} asks ${K(s.op.size)} → [${s.part.start}, ${s.part.start + s.part.size})`);
        what = T(`${s.op.name} 申请 ${K(s.op.size)}`, `${s.op.name} +${K(s.op.size)}`);
        result = T(`分到 ${rng(s.part)}`, `got ${rng(s.part)}`);
        rtone = 'ok';
        ref = s.internal ? ['algo', 'frag'] : 'algo';
        color = tone[s.op.name];
        tag = T('分配', 'Allocate');
      } else {
        evs.push(boardEv({ order: s.order, mark: Object.fromEntries(s.checks.map((c) => [c.start, 'nofit'])), req: { name: s.op.name, size: s.op.size, at: null, state: 'bad' }, ptr: s.ptr }, s.before, 500));
        evs.push({ type: 'note', at: [g.x0 + (s.op.size * g.sc) / 2, g.hover - 70], text: s.external ? T('分配失败：外部碎片', 'Fails: fragmentation') : T('分配失败：空间不够', 'Fails: not enough memory'), tone: 'warn' });
        title = s.external ? T(`${s.op.name} 申请 ${K(s.op.size)}：失败（外部碎片）`, `${s.op.name} asks ${K(s.op.size)}: fails (fragmentation)`) : T(`${s.op.name} 申请 ${K(s.op.size)}：失败`, `${s.op.name} asks ${K(s.op.size)}: fails`);
        what = T(`${s.op.name} 申请 ${K(s.op.size)}`, `${s.op.name} +${K(s.op.size)}`);
        result = s.external ? T('失败 · 外部碎片', 'fail · fragments') : T('失败', 'fail');
        rtone = 'warn';
        ref = s.external ? ['frag', 'compact'] : 'algo';
        color = 'rose';
        tag = T('失败', 'Fail');
      }
      text = both((z) => allocText(sim, s, z));
    } else if (s.kind === 'free') {
      const mid = s.before.map((b) => (b.owner === s.op.name ? { start: b.start, size: b.size, owner: null } : b));
      const pre = Object.fromEntries([[s.freed.start, 'fresh'], ...(s.prev ? [[s.prev.start, 'check']] : []), ...(s.next ? [[s.next.start, 'check']] : [])]);
      evs.push(boardEv({ order: searchOrder(s.before, sim.algo, s.ptr), lift: { owner: s.op.name, start: s.freed.start, size: s.freed.size }, mark: pre, ptr: s.ptr, showOrder: false }, mid, 600));
      evs.push(boardEv({ order: searchOrder(s.after, sim.algo, s.ptr), mark: { [s.merged.start]: 'merged' }, ptr: s.ptr }, s.after, 600));
      evs.push({ type: 'note', at: [g.X(s.merged.start + s.merged.size / 2), g.y - H - 40], text: { none: T('不合并', 'No merge'), prev: T('并入前一块', 'Merged with previous'), next: T('与后一块合并', 'Merged with next'), both: T('三块合一', 'Three into one') }[s.case], tone: 'info' });
      title = T(`${s.op.name} 释放：${CASE[s.case].zh.split('：')[0]}`, `${s.op.name} frees: ${CASE[s.case].en.split(':')[0]}`);
      what = T(`${s.op.name} 释放`, `${s.op.name} frees`);
      result = { none: T('新增空闲分区', 'new free piece'), prev: T('并入前一块', 'merge ←'), next: T('与后一块合并', 'merge →'), both: T('三块合一', 'merge ↔') }[s.case];
      rtone = 'info';
      ref = 'merge';
      text = both((z) => freeText(sim, s, z));
      color = 'slate';
      tag = T('回收', 'Free');
    } else {
      evs.push(boardEv({ order: searchOrder(s.after, sim.algo, s.ptr), mark: { [sim.mem - s.free]: 'merged' }, ptr: s.ptr }, s.after, 1000));
      evs.push({ type: 'note', at: [g.X(sim.mem - s.free / 2), g.y - H - 40], text: T(`紧凑：空出 ${K(s.free)}`, `Compacted: ${K(s.free)} free`), tone: 'ok' });
      title = T('紧凑：把空闲区拼成一块', 'Compaction: gather the free space');
      what = T('紧凑', 'Compact');
      result = T(`空闲 ${K(s.free)} 连成一块`, `${K(s.free)} in one piece`);
      rtone = 'ok';
      ref = 'compact';
      text = both((z) => compactText(sim, s, z));
      color = 'teal';
      tag = T('紧凑', 'Compact');
    }
    const snapMark = s.kind === 'alloc' && s.rest ? { [s.part.start + s.part.size]: 'chosen' } : s.kind === 'free' ? { [s.merged.start]: 'merged' } : {};
    evs.push({ type: 'row', color, sim, s, what, result, tone: rtone, text, tag }, { type: 'snap', snap: { blocks: s.after, ptr: s.ptr, mark: snapMark } });
    const fl = freeList(s.after);
    return {
      title,
      desc: s.kind === 'free' ? CASE[s.case] : s.kind === 'compact' ? T('动态重定位让进程可以被挪动', 'Dynamic relocation lets processes move') : NAME[sim.algo],
      detail: text,
      ref,
      facts: [[T('空闲分区', 'Free pieces'), fl.map((b) => `${K(b.size)}@${b.start}`).join('  ') || '—']],
      events: evs,
    };
  });
  const fl = freeList(sim.final);
  lesson.outro = {
    title: T('操作序列走完了', 'All operations done'),
    text: T(
      '用同一串操作换一种算法再走一遍，对比空闲分区最后的样子：最佳适应留下的碎片最小最多，最坏适应很快把大分区用光，首次适应把碎片集中在低地址。外部碎片是连续分配绕不开的问题，下一节「基本分页」从根本上解决它。',
      'Run the same operations with another algorithm and compare the free list at the end: best fit leaves the most tiny fragments, worst fit uses up the large pieces, first fit gathers fragments at low addresses. External fragmentation is unavoidable with contiguous allocation; paging, next, removes it.',
    ),
    facts: [
      [T('剩余空闲分区', 'Free pieces left'), fl.map((b) => `${K(b.size)}@${b.start}`).join('  ') || '—'],
      [T('空闲总量', 'Free total'), K(sim.totalFree)],
      [T('分配失败', 'Failed requests'), String(sim.fails)],
    ],
  };
  return lesson;
}

export const makePartition = () => parametric('partition', DEFAULTS, build);
