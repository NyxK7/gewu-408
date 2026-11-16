// 「工作集与抖动」：上面是访问串，窗口 Δ 一格格往右滑；中间是当前的工作集；
// 下面的柱子是每个时刻工作集的大小，虚线是分到的页框数 F；最下面一行是 LRU 在 F 个页框里的命中 / 缺页。
// 柱子冒过虚线的地方，缺页就扎堆——这就是页框不够时的抖动。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { workingSet } from './wset.js';

const W = [['os', 'memory']];
const CX = 34; // 每个时刻一列
const X0 = 120;
const RY = 120; // 访问串
const WY = 210; // 工作集
const BY = 300; // 柱状图顶
const BH = 150; // 柱状图高
const LY = BY + BH + 40; // LRU 一行

// 按比例分配的例子（由代码算）
const SIZES = [20, 60, 120];
const TOTAL = 50;
const share = SIZES.map((s) => (s / SIZES.reduce((a, b) => a + b, 0)) * TOTAL);
// 抖动的例子：每个进程的工作集约 WSS 页，共 M 个页框
const M = 64;
const WSS = 12;

const PRINCIPLE = {
  sections: [
    {
      id: 'ws',
      title: T('工作集', 'The working set'),
      blocks: [
        { p: T('进程在一段时间里只集中访问少数几页（局部性）。**工作集** W(t, Δ) 就是在时刻 t 之前、最近 Δ 次访问里用到的页的集合，Δ 叫工作集窗口。', 'The **working set** W(t, Δ) is the set of pages used in the last Δ references.') },
        { list: [
          T('窗口 Δ 太小，装不下一个局部；太大，又把好几个局部都算进来。', 'Too small a window misses a locality; too large spans several.'),
          T('工作集大小随时间变化：在一个局部里比较稳定，换局部的时候会先变大再回落。', 'Its size is steady within a locality and bulges at transitions.'),
          T('**工作集策略**：给进程分的页框数至少等于它的工作集大小；不在工作集里的页可以换出去。', '**Policy**: give each process at least its working-set size in frames.'),
        ] },
        { tip: T('工作集是由访问串**算出来**的，不是由页框数决定的；页框数只影响缺不缺页。', 'The working set comes from the references alone; the frame count only decides faults.') },
      ],
    },
    {
      id: 'alloc',
      title: T('页框分配', 'Frame allocation'),
      blocks: [
        { p: T('每个进程至少要有能执行一条指令所需的最少页框（指令本身和它要访问的数据可能跨好几页）。在此之上有三种分配和置换的组合：', 'Each process needs a minimum number of frames; beyond that, three combinations:') },
        {
          table: {
            head: [T('策略', 'Policy'), T('做法', 'How'), T('特点', 'Notes')],
            rows: [
              [T('固定分配，局部置换', 'Fixed, local'), T('页框数运行前定好；缺页时只在自己的页框里换', 'fixed count; replace among own frames'), T('分多了浪费，分少了频繁缺页', 'hard to size')],
              [T('可变分配，全局置换', 'Variable, global'), T('缺页时从系统空闲页框里拿；没有空闲就换掉任意进程的页', 'take free frames; else evict anyone’s page'), T('简单，但一个进程会挤占别人', 'one process can starve others')],
              [T('可变分配，局部置换', 'Variable, local'), T('缺页时在自己的页框里换；按缺页率增减页框数', 'replace locally; adjust by fault rate'), T('兼顾，但要统计缺页率', 'balanced; needs fault statistics')],
            ],
          },
        },
        { p: T('（没有「固定分配，全局置换」：全局置换必然让页框数变化。）分配多少可以平均分、按进程大小比例分，或者再考虑优先级。', '(Fixed allocation cannot be global.) Shares can be equal, proportional to size, or priority-based.') },
        { formula: T(`按比例分：${TOTAL} 个页框给大小为 ${SIZES.join('、')} 页的三个进程，各得 ${share.map((x) => x.toFixed(1)).join('、')}，取整约 ${share.map((x) => Math.floor(x)).join('、')} 个（剩下的再按规则补）。`, `Proportional: ${TOTAL} frames for sizes ${SIZES.join(', ')} → ${share.map((x) => x.toFixed(1)).join(', ')}.`) },
      ],
    },
    {
      id: 'thrash',
      title: T('抖动', 'Thrashing'),
      blocks: [
        { p: T('**抖动**（颠簸）：刚换出去的页马上又要用，又换进来，进程大部分时间花在换页上，CPU 利用率反而掉下来。', '**Thrashing**: pages just evicted are needed again at once; the system spends its time paging and CPU utilisation collapses.') },
        { p: T('根本原因是：同时运行的进程太多，分给每个进程的页框**少于它的工作集**。这时操作系统如果看到 CPU 闲着就再调入新进程，只会让情况更糟。', 'Cause: too many processes, each with fewer frames than its working set. Admitting more processes makes it worse.') },
        { formula: T(`例：共 ${M} 个页框，每个进程的工作集约 ${WSS} 页，最多同时放 ⌊${M}/${WSS}⌋ = ${Math.floor(M / WSS)} 个进程；放第 ${Math.floor(M / WSS) + 1} 个，所有进程的页框都不够用，就会抖动。`, `With ${M} frames and working sets of ~${WSS}, at most ${Math.floor(M / WSS)} processes fit.`) },
        { list: [
          T('**工作集策略**：保证每个进程的工作集都在内存里，装不下就挂起一些进程。', '**Working-set policy**: keep every working set resident; suspend processes if needed.'),
          T('**缺页率（PFF）控制**：缺页率高于上限就多给页框，低于下限就收回一些。', '**Page-fault frequency**: add frames above an upper bound, reclaim below a lower one.'),
          T('**降低多道程序度**：挂起（换出）部分进程，即中级调度。', '**Reduce multiprogramming**: swap out processes (medium-term scheduling).'),
          T('改置换算法、加快磁盘都治标不治本；增加内存是有效的。', 'Better algorithms or disks do not fix it; more memory does.'),
        ] },
      ],
    },
    pit([
      T('抖动是因为页框不够，不是因为置换算法不好；换成 OPT 也会大量缺页。', 'Thrashing is a frame shortage, not an algorithm problem.'),
      T('CPU 利用率低时盲目提高多道程序度，可能正好引发抖动。', 'Raising multiprogramming when the CPU looks idle can cause thrashing.'),
      T('工作集大小 ≤ Δ，也 ≤ 进程的总页数。', 'The working-set size is at most Δ.'),
    ]),
  ],
};

const REFS = [1, 2, 1, 3, 2, 1, 3, 2, 5, 6, 7, 5, 6, 8, 7, 5, 6, 8, 1, 2, 3, 1, 2];
const SPEC = {
  presets: [
    { label: T('Δ = 4，只给 3 个页框：换局部时抖动', 'Δ = 4 with 3 frames: thrashing'), set: { refs: REFS, delta: 4, frames: 3 } },
    { label: T('Δ = 4，给 4 个页框', 'Δ = 4 with 4 frames'), set: { refs: REFS, delta: 4, frames: 4 } },
    { label: T('窗口太小：Δ = 2', 'Too small a window: Δ = 2'), set: { refs: REFS, delta: 2, frames: 3 } },
    { label: T('窗口很大：Δ = 8', 'A large window: Δ = 8'), set: { refs: REFS, delta: 8, frames: 4 } },
  ],
  groups: [{ legend: T('访问串和参数', 'Parameters'), fields: [
    { name: 'refs', label: T('页面访问串', 'Reference string'), type: 'list', min: 0, max: 20, maxLen: 30, wide: true, hint: T('页号 0～20，最多 30 个', 'Pages 0–20, up to 30') },
    { name: 'delta', label: T('工作集窗口 Δ', 'Window Δ'), type: 'int', min: 1, max: 12 },
    { name: 'frames', label: T('分到的页框数 F（LRU）', 'Frames F (LRU)'), type: 'int', min: 1, max: 8 },
  ] }],
  note: T('W(t, Δ) 取包括当前这次在内的最近 Δ 次访问。下面一行用 LRU 在 F 个页框里模拟，只是为了看缺页和工作集的关系。', 'W(t, Δ) covers the last Δ references including the current one. The LRU row shows faults with F frames.'),
};
const ERR = { refs: T('访问串：2～30 个 0～20 的页号', 'Reference string: 2–30 pages, 0–20'), delta: T('Δ 取 1～12', 'Δ: 1–12'), frames: T('页框数 1～8', 'Frames: 1–8') };

function board(sim, st, z) {
  const items = [];
  const t = st ? st.t : -1;
  const n = sim.refs.length;
  const lo = t - sim.delta + 1;
  // 访问串
  let rh = txt(-14, 22, z ? '访问串' : 'References', 'bt-lab', 'end');
  sim.refs.forEach((p, i) => {
    const inW = t >= 0 && i >= lo && i <= t;
    rh += txt(i * CX + 15, -8, String(i + 1), 'bt-idx');
    rh += `<g transform="translate(${i * CX} 0)">${cell(30, 34, String(p), { size: 15, tone: i === t ? 'amber' : inW ? 'blue' : i < t ? 'slate' : '', cls: i === t ? 'hot' : '' })}</g>`;
  });
  if (t >= 0) {
    const a = Math.max(0, lo);
    rh += `<g class="barw acc"><line x1="${a * CX - 2}" y1="44" x2="${t * CX + 32}" y2="44"/><line x1="${a * CX - 2}" y1="38" x2="${a * CX - 2}" y2="48"/><line x1="${t * CX + 32}" y1="38" x2="${t * CX + 32}" y2="48"/></g>`;
    rh += txt(((a + t) * CX) / 2 + 15, 62, `Δ = ${sim.delta}`, 'cw-lab acc');
  }
  items.push({ k: 'refs', x: X0, y: RY, html: rh });

  // 工作集
  let wh = txt(-14, 22, z ? '工作集' : 'Working set', 'bt-lab', 'end');
  if (t >= 0) {
    const w = sim.ws[t];
    w.forEach((p, i) => (wh += `<g transform="translate(${i * 46} 0)">${cell(40, 34, String(p), { size: 15, tone: sim.enter[t].includes(p) ? 'amber' : 'blue', cls: sim.enter[t].includes(p) ? 'hot' : '' })}</g>`));
    let tail = z ? `大小 ${w.length}` : `size ${w.length}`;
    if (sim.leave[t].length) tail += z ? `　移出 ${sim.leave[t].join('、')}` : `   left: ${sim.leave[t].join(', ')}`;
    wh += txt(w.length * 46 + 10, 22, tail, 'bt-cap', 'start');
  } else wh += txt(0, 22, z ? '（还没开始）' : '(not started)', 'bt-idx', 'start');
  items.push({ k: 'ws', x: X0, y: WY, html: wh });

  // 柱状图：工作集大小，虚线是页框数
  const top = Math.max(sim.delta, sim.frames + 1, sim.maxW);
  const hOf = (v) => (v / top) * BH;
  let bh = txt(-14, 12, z ? '工作集大小' : 'Size', 'bt-lab', 'end');
  for (let i = 0; i <= t; i++) {
    const v = sim.sizes[i];
    const over = v > sim.frames;
    bh += `<g transform="translate(${i * CX + 4} ${BH - hOf(v)})">${cell(22, hOf(v), '', { tone: over ? 'rose' : 'blue', cls: i === t ? 'hot' : '' })}</g>`;
    bh += txt(i * CX + 15, BH - hOf(v) - 6, String(v), 'bt-idx');
  }
  const fy = BH - hOf(sim.frames);
  bh += `<g class="barw dash bad"><line x1="-4" y1="${fy}" x2="${n * CX}" y2="${fy}"/></g>`;
  bh += txt(n * CX + 6, fy + 4, `F = ${sim.frames}`, 'cw-lab bad l');
  bh += `<g class="barw"><line x1="-4" y1="${BH}" x2="${n * CX}" y2="${BH}"/></g>`;
  items.push({ k: 'bars', x: X0, y: BY, html: bh });

  // LRU 命中 / 缺页
  let lh = txt(-14, 20, z ? `LRU · ${sim.frames} 页框` : `LRU · ${sim.frames} frames`, 'bt-lab', 'end');
  let cnt = 0;
  for (let i = 0; i <= t; i++) {
    const f = sim.fault[i];
    if (f) cnt++;
    lh += `<g transform="translate(${i * CX} 0)">${cell(30, 30, f ? (z ? '缺' : 'F') : '✓', { size: 13, tone: f ? 'rose' : 'green', cls: i === t ? 'hot' : '' })}</g>`;
  }
  if (t >= 0) lh += txt(n * CX + 6, 20, z ? `缺页 ${cnt} 次` : `${cnt} faults`, 'bt-cap', 'start');
  items.push({ k: 'lru', x: X0, y: LY, html: lh });
  return items;
}

function build(p, kit, ERR) {
  const sim = workingSet(p);
  const lesson = shell('working-set', kit, ERR, sim, {
    where: W,
    tag: T('工作集', 'WS'),
    name: T('工作集与抖动', 'Working sets and thrashing'),
    full: T('局部性 · 工作集窗口 Δ · 工作集大小的变化 · 页框分配与置换策略 · 抖动的原因和对策 · 缺页率控制', 'Locality · the window Δ · working-set size over time · frame allocation · thrashing and its cures · PFF'),
    title: SPEC.presets.find((x) => x.set.delta === p.delta && x.set.frames === p.frames && x.set.refs.join() === (p.refs ?? []).join())?.label ?? T('工作集与抖动', 'Working sets'),
    legend: [['blue', T('在工作集里', 'In the working set')], ['amber', T('当前访问 / 新进入', 'Current / just entered')], ['rose', T('工作集比页框多 / 缺页', 'Larger than F / fault')]],
    principle: PRINCIPLE,
    desc: T('窗口 Δ 在访问串上一格格滑过去，窗口里出现过的页就是此刻的工作集。工作集大小一旦超过分到的页框数，LRU 的缺页就扎堆出现——这就是抖动的苗头。可以改 Δ 和页框数对比。', 'Slide the window Δ along the references; the pages inside form the working set. Whenever it outgrows the frames, faults cluster — the seed of thrashing.'),
    rect: [0, 80, X0 + (p.refs?.length ?? 23) * CX + 90, LY + 60],
  });
  if (!sim.ok) return lesson;
  const list = sim.refs.map((pg, t) => {
    const w = sim.ws[t];
    const lo = Math.max(0, t - sim.delta + 1);
    const win = sim.refs.slice(lo, t + 1).join(' ');
    const moves = [sim.enter[t].length ? T(`新进入 ${sim.enter[t].join('、')}`, `entered ${sim.enter[t].join(', ')}`) : null, sim.leave[t].length ? T(`移出 ${sim.leave[t].join('、')}`, `left ${sim.leave[t].join(', ')}`) : null].filter(Boolean);
    const over = w.length > sim.frames;
    const detail = T(
      `窗口里是第 ${lo + 1}～${t + 1} 次访问：${win}，工作集 = {${w.join(', ')}}，大小 ${w.length}${moves.length ? `（${moves.map((m) => m.zh).join('，')}）` : ''}。LRU 在 ${sim.frames} 个页框里：${sim.fault[t] ? '缺页' : '命中'}。${over ? `工作集有 ${w.length} 页，页框只有 ${sim.frames} 个，装不下，缺页会接连发生。` : ''}`,
      `Window ${lo + 1}–${t + 1}: ${win}; W = {${w.join(', ')}}, size ${w.length}. LRU: ${sim.fault[t] ? 'fault' : 'hit'}.${over ? ' The working set exceeds the frames.' : ''}`,
    );
    return { title: T(`第 ${t + 1} 次访问页 ${pg}`, `Reference ${t + 1}: page ${pg}`), desc: T(`工作集大小 ${w.length}`, `size ${w.length}`), detail, ref: over ? 'thrash' : 'ws', st: { t }, row: { color: over ? 'rose' : 'blue', what: T(`访问 ${pg}`, `page ${pg}`), result: T(`|W| = ${w.length}，${sim.fault[t] ? '缺页' : '命中'}`, `|W| = ${w.length}, ${sim.fault[t] ? 'fault' : 'hit'}`), tone: sim.fault[t] ? 'bad' : 'info' } };
  });
  const title = T(`最大工作集 ${sim.maxW}，平均 ${sim.avgW.toFixed(2)}；${sim.frames} 个页框缺页 ${sim.faults} 次`, `Max working set ${sim.maxW}, mean ${sim.avgW.toFixed(2)}; ${sim.faults} faults with ${sim.frames} frames`);
  const text = T(
    `工作集超过页框数的时刻有 ${sim.overT} 个，其中 ${sim.overFaults} 个缺页。${sim.maxW > sim.frames ? `如果给 ${sim.fit} 个页框（够装下最大工作集${sim.maxW > 8 ? '的上限 8' : ''}），缺页降到 ${sim.fitFaults} 次。` : '页框数已经够装下最大工作集。'}`,
    `${sim.overT} references with |W| > F, ${sim.overFaults} of them faults.${sim.maxW > sim.frames ? ` With ${sim.fit} frames: ${sim.fitFaults} faults.` : ''}`,
  );
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeWorkingSet = make('working-set', SPEC, ERR, build);
