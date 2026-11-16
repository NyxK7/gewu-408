// 「快表与有效访问时间」：把命中、未命中、缺页三条路径画成时间条，再按概率加权得到 EAT。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { simulate } from './eat.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const fmt = (x) => String(+(+x).toFixed(4));
const pct = (p) => `${fmt(p * 100)}%`;

const SPEC = {
  presets: [
    { label: T('串行 · 命中率 80%', 'Serial · 80% hits'), set: { t: 20, m: 100, alpha: 80, f: 0, T: 0, parallel: false, levels: 1, reHit: true } },
    { label: T('串行 · 命中率 98%', 'Serial · 98% hits'), set: { t: 20, m: 100, alpha: 98, f: 0, T: 0, parallel: false, levels: 1, reHit: true } },
    { label: T('并行查找', 'Parallel lookup'), set: { t: 20, m: 100, alpha: 80, f: 0, T: 0, parallel: true, levels: 1, reHit: true } },
    { label: T('两级页表', 'Two-level table'), set: { t: 20, m: 100, alpha: 80, f: 0, T: 0, parallel: false, levels: 2, reHit: true } },
    { label: T('有缺页', 'With page faults'), set: { t: 10, m: 100, alpha: 50, f: 0.1, T: 100000000, parallel: false, levels: 1, reHit: true } },
  ],
  groups: [
    {
      legend: T('时间（ns）', 'Times (ns)'),
      fields: [
        { name: 't', label: T('查快表时间 t', 'TLB lookup t'), type: 'int', min: 0, max: 100000 },
        { name: 'm', label: T('访存时间 m', 'Memory access m'), type: 'int', min: 1, max: 100000 },
        { name: 'alpha', label: T('快表命中率 α（%）', 'TLB hit rate α (%)'), type: 'text', parse: (s) => (/^\d+(\.\d+)?$/.test(s) && +s <= 100 ? +s : NaN) },
        { name: 'levels', label: T('页表级数', 'Page-table levels'), type: 'select', options: [[1, '1'], [2, '2'], [3, '3']] },
        { name: 'parallel', label: T('快表和页表并行查找', 'Search TLB and page table in parallel'), type: 'check', wide: true },
      ],
    },
    {
      legend: T('缺页（可选）', 'Page faults (optional)'),
      fields: [
        { name: 'f', label: T('缺页率（%）', 'Fault rate (%)'), type: 'text', parse: (s) => (/^\d+(\.\d+)?$/.test(s) && +s <= 100 ? +s : NaN) },
        { name: 'T', label: T('缺页处理时间（ns）', 'Fault service time (ns)'), type: 'int', min: 0, max: 1e12 },
        { name: 'reHit', label: T('处理完已更新快表，重新执行时快表命中', 'The handler fills the TLB, so the retry hits'), type: 'check', wide: true },
      ],
    },
  ],
  note: T(
    '命中率和缺页率都按全部访存计（缺页一定是快表未命中），所以命中率 + 缺页率 ≤ 100%。串行：先查快表，没命中再查页表；并行：两者同时查，未命中时查快表的时间不另算。缺页时，查到页表项无效后执行缺页处理，再重新执行这次访存。',
    'Hit and fault rates are fractions of all accesses (a fault is always a TLB miss), so they sum to at most 100%. Serial: TLB first, then the page table; parallel: both at once, so a miss does not pay for the TLB lookup. On a fault the handler runs after the invalid entry is found, then the access is retried.',
  ),
};

const ERR = {
  t: T('快表时间不能为负', 'TLB time cannot be negative'),
  m: T('访存时间要大于 0', 'Memory time must be positive'),
  alpha: T('命中率要在 0～100% 之间', 'Hit rate must be 0–100%'),
  f: T('缺页率要在 0～100% 之间', 'Fault rate must be 0–100%'),
  sum: T('命中率 + 缺页率不能超过 100%（缺页一定是快表未命中）', 'Hit rate + fault rate cannot exceed 100%'),
  levels: T('页表级数是 1～3', 'Use 1–3 levels'),
  T: T('有缺页时要给出缺页处理时间', 'Give a fault service time'),
};

// ───────────────────────── 画板：三条时间条 ─────────────────────────

const LAB = {
  tlb: T('快表', 'TLB'),
  pt: T('页表', 'Page table'),
  mem: T('取数据', 'Data'),
  fault: T('缺页处理', 'Fault service'),
};
const TONE = { tlb: 'amber', pt: 'violet', mem: 'green', fault: 'rose' };
const ROWS = { hit: T('命中', 'Hit'), miss: T('未命中', 'Miss'), fault: T('缺页', 'Fault') };

function board(sim, st, z) {
  const items = [];
  const x0 = 150;
  const W = 600;
  const keys = Object.keys(sim.paths);
  // 缺页处理的时间太长，画成固定宽度的「断开」段，其余按比例
  const scaleMax = Math.max(...keys.map((k) => sim.paths[k].segs.filter((s) => s.kind !== 'fault').reduce((a, s) => a + s.ms, 0)));
  const faultW = 160;
  const sc = (W - (sim.paths.fault ? faultW : 0)) / Math.max(scaleMax, 1);
  keys.forEach((key, i) => {
    if (i > st.row) return;
    const P = sim.paths[key];
    const y = 110 + i * 78;
    let x = 0;
    let s = txt(-14, 20, z ? ROWS[key].zh : ROWS[key].en, 'bt-lab', 'end') + txt(-14, 38, `p = ${pct(P.p)}`, 'bt-dim', 'end');
    for (const seg of P.segs) {
      const w = seg.kind === 'fault' ? faultW : Math.max(seg.ms * sc, seg.ms ? 4 : 0);
      if (!w) continue;
      const lab = seg.kind === 'pt' && sim.levels > 1 ? `${z ? '页表' : 'PT'}${seg.lv}` : z ? LAB[seg.kind].zh : LAB[seg.kind].en;
      s += `<g transform="translate(${x.toFixed(1)} 0)">${cell(w - 2, 34, w > 46 ? lab : '', { tone: TONE[seg.kind], cls: seg.retry ? 'retry' : '', size: 11 })}</g>`;
      if (w > 30) s += txt(x + w / 2, 50, seg.kind === 'fault' ? `≈ ${fmt(seg.ms)}` : fmt(seg.ms), 'bt-idx');
      x += w;
    }
    s += txt(x + 12, 22, `= ${fmt(P.time)} ns`, 'bt-acc', 'start');
    items.push({ k: `row-${key}`, x: x0, y, cls: st.hot === key ? 'is-cur' : '', from: [x0, y + 20], html: s });
  });
  if (st.eat) {
    const terms = keys.map((k) => `${fmt(sim.paths[k].p)} × ${fmt(sim.paths[k].time)}`).join(' + ');
    items.push({ k: 'eat', x: x0 - 130, y: 110 + keys.length * 78 + 20, html: txt(0, 0, `EAT = ${terms}`, 'bt-formula cur', 'start') + txt(0, 30, `= ${fmt(sim.eat)} ns`, 'bt-big', 'start') });
  }
  if (st.cmp) items.push({ k: 'cmp', x: x0 - 130, y: 110 + keys.length * 78 + 90, html: txt(0, 0, z ? `不用快表：${fmt(sim.noTlb)} ns，快表让访存快了 ${fmt(sim.speedup)} 倍` : `Without a TLB: ${fmt(sim.noTlb)} ns; the TLB is ${fmt(sim.speedup)}× faster`, 'bt-formula', 'start') });
  return items;
}

// ───────────────────────── 原理 ─────────────────────────

export const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么需要快表', 'Why a TLB'),
      blocks: [
        { p: T('分页之后，每取一个数据都要先到内存里读页表项，再去读数据：**一次访存变成了两次**，用两级页表还会变成三次。程序的运行速度会直接减半甚至更慢，这是不能接受的。', 'With paging every data access first reads a page-table entry: **one access becomes two**, three with a two-level table. Programs would run at half speed or worse.') },
        { p: T('好在程序访存有**局部性**：一段时间内反复访问的总是少数几页（时间局部性），访问了某个地址很可能接着访问它附近的地址（空间局部性）。所以只要把**最近用过的那几个页表项**放在 CPU 里一个很快的地方，大部分时候就不用再去内存查页表了。', 'Fortunately access is **local**: a few pages are used again and again (temporal locality), and nearby addresses follow each other (spatial locality). Keeping **the few most recently used entries** somewhere fast inside the CPU avoids most page-table reads.') },
      ],
    },
    {
      id: 'tlb',
      title: T('快表是什么', 'What a TLB is'),
      blocks: [
        {
          list: [
            T('**快表**（TLB，也叫联想存储器、相联寄存器）是 MMU 里一个小而快的**相联存储器**，存着若干条「页号 → 块号」。它能用页号**同时和所有表项比较**，一次就知道有没有。', 'The **TLB** (translation lookaside buffer, associative memory) is a small, fast **associative memory** in the MMU holding a few “page → frame” pairs, compared against **all entries at once**.'),
            T('相对地，放在内存里的页表叫**慢表**。快表里的内容是慢表的一部分副本。', 'The in-memory page table is the **slow table**; the TLB holds a copy of part of it.'),
            T('**命中**：在快表里找到页号，直接得到块号，只需访存 1 次（取数据）。', '**Hit**: the page is in the TLB, so only the data access is needed.'),
            T('**未命中**：还要去内存查页表，查到后把这一项**写进快表**（满了就按某种算法换掉一项），以便下次命中。', '**Miss**: read the page table in memory, then **load the entry into the TLB** (evicting one if full) for next time.'),
          ],
        },
        { tip: T('快表和 Cache 都是「用小而快的存储器缓存常用内容」，但快表缓存的是**页表项**，Cache 缓存的是**主存里的数据块**，两者不要混淆。', 'TLB and cache both keep popular content in small fast memory, but the TLB caches **page-table entries** and the cache caches **memory blocks**.') },
      ],
    },
    {
      id: 'mode',
      title: T('串行查找与并行查找', 'Serial vs parallel lookup'),
      blocks: [
        {
          table: {
            head: ['', T('命中', 'Hit'), T('未命中（一级页表）', 'Miss (one level)')],
            rows: [
              [T('串行：先查快表，没有再查页表', 'Serial: TLB first, then the page table'), 't + m', 't + m + m'],
              [T('并行：快表和页表同时查', 'Parallel: both at once'), 't + m', 'm + m'],
            ],
          },
        },
        { p: T('题目没有说明时，一般按**串行**算（先查快表）。如果题目说「同时查找快表和页表」，未命中时就不再加 t。k 级页表未命中时，把中间的 m 换成 k·m。', 'Unless told otherwise assume **serial**. If the question says both are searched simultaneously, a miss does not add t. With k levels a miss costs k·m for the walk.') },
      ],
    },
    {
      id: 'eat',
      title: T('有效访问时间 EAT', 'Effective access time'),
      blocks: [
        { p: T('**有效访问时间**（平均访存时间）就是把每种情况的时间按它发生的概率加权平均：', 'The **effective access time** is the probability-weighted average over all cases:') },
        { formula: T('EAT = α × (t + m) + (1 − α) × (t + m + m)　　（串行，一级页表，不考虑缺页）', 'EAT = α(t + m) + (1 − α)(t + 2m)    (serial, one level, no faults)') },
        { p: T('例：t = 20 ns，m = 100 ns，命中率 80%：EAT = 0.8 × 120 + 0.2 × 220 = 140 ns，比不用快表的 200 ns 快了不少；命中率到 98% 时 EAT = 122 ns，已经很接近只访存一次的 100 ns。', 'Example: t = 20, m = 100, α = 80%: EAT = 0.8 × 120 + 0.2 × 220 = 140 ns versus 200 ns without a TLB; at 98% it is 122 ns, close to a single access.') },
        { tip: T('快表的效果几乎全靠命中率。由于局部性，实际系统的命中率通常在 90% 以上。', 'The TLB’s benefit rests on the hit rate, usually above 90% thanks to locality.') },
      ],
    },
    {
      id: 'fault',
      title: T('把缺页也算进去', 'Including page faults'),
      blocks: [
        { p: T('在请求分页系统里，查页表还可能发现这一页不在内存（缺页）。这时要执行缺页中断处理：从磁盘调入这一页、更新页表（通常还更新快表），然后**重新执行**这次访存。', 'With demand paging the walk may find the page absent. The fault handler loads it from disk, updates the page table (usually the TLB too) and the access is **retried**.') },
        { formula: T('缺页的那次访存 = t + m（发现无效）+ 缺页处理时间 + 重新执行的时间', 'Faulting access = t + m (finds it invalid) + service time + retry time') },
        { warn: T('缺页处理要读磁盘，通常是毫秒级，比访存慢几十万倍。所以哪怕缺页率只有千分之一，EAT 也会被拖慢上千倍 —— 这就是为什么缺页率必须极低、为什么要有好的页面置换算法。', 'Servicing a fault reads the disk, milliseconds, hundreds of thousands of times slower than memory. Even a 0.1% fault rate slows EAT a thousandfold, which is why faults must be rare and replacement algorithms matter.') },
        { p: T('重新执行时快表是否命中，要看题目：如果说缺页处理已经更新了快表，重新执行就按命中算；否则还要再查一次页表。', 'Whether the retry hits depends on the question: if the handler updated the TLB it hits; otherwise the page table is read again.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('串行查找时，**未命中也要算上查快表的时间 t**；并行查找才不算。', 'With serial lookup a **miss still pays t**; only parallel lookup avoids it.'),
            T('命中时也要访存一次（取数据），EAT 里命中项是 t + m，不是 t。', 'A hit still accesses memory once: the hit term is t + m, not t.'),
            T('题目给的时间单位可能不同（快表 ns、缺页处理 ms），要先统一单位。1 ms = 10^6 ns。', 'Units may differ (ns for memory, ms for faults); convert first: 1 ms = 10^6 ns.'),
            T('多级页表未命中时要访存 k 次页表再加 1 次数据；有快表时命中仍只要 1 次访存。', 'A k-level miss reads k table entries plus the data; a hit still needs one access.'),
            T('命中率、缺页率的「分母」要看题目怎么说：是所有访存，还是快表未命中的那部分。本课按所有访存计。', 'Check what a rate is relative to: all accesses or only TLB misses. This lesson uses all accesses.'),
          ],
        },
      ],
    },
  ],
};

// ───────────────────────── 生成课程 ─────────────────────────

const kit = stepKit({ spec: SPEC, rowsName: T('计算步骤', 'Steps') });

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate({ ...params, alpha: Number(params.alpha) / 100, f: Number(params.f) / 100, levels: Number(params.levels) });
  const lesson = {
    id: 'tlb-eat',
    kit,
    where: [['os', 'memory'], ['co', 'memory']],
    tag: 'EAT',
    name: T('快表与有效访问时间', 'TLB and effective access time'),
    full: T('快表命中 / 未命中 · 串行 / 并行 · 多级页表 · 缺页对访存时间的影响', 'Hits and misses · serial / parallel · multi-level · page faults'),
    title: T(`命中率 ${params.alpha}% · ${params.parallel ? '并行' : '串行'}`, `${params.alpha}% hits · ${params.parallel ? 'parallel' : 'serial'}`),
    badge: params.parallel ? T('并行查找', 'Parallel') : T('串行查找', 'Serial'),
    nodes: [],
    legend: [
      ['amber', T('查快表', 'TLB')],
      ['violet', T('查页表', 'Page table')],
      ['green', T('取数据', 'Data')],
      ['rose', T('缺页处理', 'Fault')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '分页让每次取数据都要先查一次内存里的页表，访存时间翻倍。快表把最近用过的页表项放在 CPU 里，命中时就不用查页表。这节课把命中、未命中、缺页三种情况各要花多少时间画成时间条，再按概率加权算出平均访存时间。',
        'Paging makes every data access read a page-table entry first, doubling the time. A TLB keeps recent entries inside the CPU so hits skip the table. This lesson draws the time of a hit, a miss and a page fault as bars, then weights them by probability to get the average access time.',
      ),
      facts: sim.ok ? [[T('不用快表', 'Without a TLB'), `${fmt(sim.noTlb)} ns`]] : [],
    },
    start: { nodes: [], frame: { rect: [0, 60, 900, 470] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const P = sim.paths;
  const join = (segs, z) => segs.map((s) => fmt(s.ms)).join(' + ');
  const list = [];
  const S = { row: -1 };
  const push = (st, s) => {
    Object.assign(S, st);
    list.push({ ...s, st: { ...S } });
  };
  push({ row: 0, hot: 'hit' }, {
    title: T(`快表命中：${fmt(P.hit.time)} ns`, `TLB hit: ${fmt(P.hit.time)} ns`),
    desc: T(`查快表 + 取数据，概率 ${pct(P.hit.p)}`, `TLB + data, probability ${pct(P.hit.p)}`),
    detail: T(`在快表里找到页号，直接得到块号，然后访存取数据：${join(P.hit.segs)} = ${fmt(P.hit.time)} ns。`, `The page is in the TLB, giving the frame directly; then the data access: ${join(P.hit.segs)} = ${fmt(P.hit.time)} ns.`),
    ref: 'tlb',
    row: { color: 'amber', what: T('命中路径', 'Hit path'), result: `${fmt(P.hit.time)} ns`, tone: 'ok' },
  });
  push({ row: 1, hot: 'miss' }, {
    title: T(`快表未命中：${fmt(P.miss.time)} ns`, `TLB miss: ${fmt(P.miss.time)} ns`),
    desc: T(`概率 ${pct(P.miss.p)}`, `Probability ${pct(P.miss.p)}`),
    detail: both((z) =>
      z
        ? `${sim.parallel ? '快表和页表同时查，没命中时查快表的时间被查页表盖住，不另算。' : '先查快表没找到，再去内存查页表。'}${sim.levels > 1 ? `${sim.levels} 级页表要访存 ${sim.levels} 次才找到块号。` : ''}然后取数据：${join(P.miss.segs)} = ${fmt(P.miss.time)} ns。查到的页表项同时写进快表。`
        : `${sim.parallel ? 'Both are searched at once, so the TLB time is hidden. ' : 'The TLB misses, then the page table is read. '}${sim.levels > 1 ? `A ${sim.levels}-level table takes ${sim.levels} reads. ` : ''}Then the data: ${join(P.miss.segs)} = ${fmt(P.miss.time)} ns. The entry is copied into the TLB.`,
    ),
    ref: ['tlb', 'mode'],
    row: { color: 'violet', what: T('未命中路径', 'Miss path'), result: `${fmt(P.miss.time)} ns`, tone: 'warn' },
  });
  if (P.fault) {
    push({ row: 2, hot: 'fault' }, {
      title: T(`缺页：${fmt(P.fault.time)} ns`, `Page fault: ${fmt(P.fault.time)} ns`),
      desc: T(`概率 ${pct(P.fault.p)}`, `Probability ${pct(P.fault.p)}`),
      detail: T(`查页表发现这一页不在内存，执行缺页处理（${fmt(sim.T)} ns），再重新执行这次访存${sim.reHit ? '（处理时已更新快表，这次命中）' : '（快表没更新，再走一遍未命中）'}：${join(P.fault.segs)} = ${fmt(P.fault.time)} ns。`, `The walk finds the page absent; the handler runs (${fmt(sim.T)} ns) and the access is retried${sim.reHit ? ' (the TLB was updated, so it hits)' : ' (the TLB was not updated, so it misses again)'}: ${join(P.fault.segs)} = ${fmt(P.fault.time)} ns.`),
      ref: 'fault',
      row: { color: 'rose', what: T('缺页路径', 'Fault path'), result: `${fmt(P.fault.time)} ns`, tone: 'warn' },
    });
  }
  push({ eat: true, hot: null }, {
    title: T(`有效访问时间 EAT = ${fmt(sim.eat)} ns`, `EAT = ${fmt(sim.eat)} ns`),
    desc: T('按概率加权平均', 'Weighted by probability'),
    detail: T(`EAT = ${Object.keys(P).map((k) => `${fmt(P[k].p)} × ${fmt(P[k].time)}`).join(' + ')} = ${fmt(sim.eat)} ns。`, `EAT = ${Object.keys(P).map((k) => `${fmt(P[k].p)} × ${fmt(P[k].time)}`).join(' + ')} = ${fmt(sim.eat)} ns.`),
    ref: 'eat',
    row: { color: 'green', what: T('加权平均', 'Weighted average'), result: `${fmt(sim.eat)} ns`, tone: 'ok' },
  });
  push({ cmp: true }, {
    title: T('和不用快表比较', 'Compared with no TLB'),
    desc: T(`不用快表 ${fmt(sim.noTlb)} ns`, `No TLB: ${fmt(sim.noTlb)} ns`),
    detail: T(`不用快表时每次都要查 ${sim.levels} 级页表再取数据：${sim.levels + 1} × ${sim.m} = ${(sim.levels + 1) * sim.m} ns${sim.f > 0 ? '（再加上缺页的开销）' : ''}，平均 ${fmt(sim.noTlb)} ns。有了快表平均 ${fmt(sim.eat)} ns，是原来的 1 / ${fmt(sim.speedup)}。${sim.f > 0 ? '注意缺页的影响远大于快表：缺页率稍高一点，EAT 就会大得多。' : '把命中率改高或改低，看 EAT 怎么变。'}`, `Without a TLB every access reads ${sim.levels} table level(s) then the data: ${(sim.levels + 1) * sim.m} ns${sim.f > 0 ? ' plus fault costs' : ''}, average ${fmt(sim.noTlb)} ns. With the TLB: ${fmt(sim.eat)} ns, 1/${fmt(sim.speedup)} of that.${sim.f > 0 ? ' Note faults dominate everything.' : ' Change the hit rate and watch EAT.'}`),
    ref: sim.f > 0 ? 'fault' : 'eat',
    row: { color: 'slate', what: T('不用快表', 'No TLB'), result: `${fmt(sim.noTlb)} ns`, tone: 'info' },
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? { row: -1 } : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: T(`EAT = ${fmt(sim.eat)} ns`, `EAT = ${fmt(sim.eat)} ns`),
    text: T('试试改命中率、换成并行查找或两级页表，再加一点缺页率，看 EAT 对哪个参数最敏感。', 'Change the hit rate, switch to parallel or two levels, then add a small fault rate, and see which parameter EAT is most sensitive to.'),
    facts: [
      ['EAT', `${fmt(sim.eat)} ns`],
      [T('不用快表', 'Without a TLB'), `${fmt(sim.noTlb)} ns`],
    ],
  };
  return lesson;
}

export const makeEat = () => parametric('tlb-eat', DEFAULTS, build);
