// 排序这一章其余三节课：内部排序每一趟对比、外部排序、时间复杂度（基本概念）。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, node, stepKit, toSteps } from '../../core/steps.js';
import { bestMerge, countLoop, passes, replaceSelect } from './sorts.js';

const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
function make(id, spec, ERR, build) {
  const kit = stepKit({ spec, rowsName: T('过程', 'Steps') });
  return () => parametric(id, spec.presets[0].set, (p) => build(p, kit, ERR));
}
function shell(id, kit, ERR, sim, o) {
  return { id, kit, where: o.where, tag: o.tag, name: o.name, full: o.full, title: o.title, nodes: [], legend: o.legend, principle: o.principle, sim, errors: sim.ok ? [] : errOf(ERR, sim.errors), overview: { desc: o.desc, facts: [] }, start: { nodes: [], frame: { rect: o.rect ?? [0, 40, 900, 520] }, events: [] }, steps: [], outro: { title: '', text: '', facts: [] } };
}
function finish(lesson, list, board, title, text, facts = []) {
  const b = toSteps(list, board);
  lesson.steps = b.steps;
  lesson.start.events = b.start;
  lesson.outro = { title, text, facts };
  return lesson;
}

// ═════════════════════════ 内部排序 ═════════════════════════

const ALG = {
  insert: { zh: '直接插入排序', en: 'Insertion sort' },
  binsert: { zh: '折半插入排序', en: 'Binary insertion sort' },
  shell: { zh: '希尔排序', en: 'Shell sort' },
  bubble: { zh: '冒泡排序', en: 'Bubble sort' },
  select: { zh: '简单选择排序', en: 'Selection sort' },
  merge: { zh: '二路归并排序', en: 'Merge sort' },
  radix: { zh: '基数排序', en: 'Radix sort' },
};
const SORT_PRINCIPLE = {
  sections: [
    {
      id: 'insert',
      title: T('插入类：直接插入、折半插入、希尔', 'Insertion sorts'),
      blocks: [
        { p: T('**直接插入**：前面一段已经有序，每趟把下一个元素从后往前比较，插到合适位置，比它大的元素后移。最好（已经有序）O(n)，最坏 O(n²)，稳定。**折半插入**用折半查找找位置，比较次数减少，但移动次数不变，仍是 O(n²)。', '**Insertion**: grow a sorted prefix by inserting the next element; O(n) best, O(n²) worst, stable. **Binary insertion** saves comparisons, not moves.') },
        { p: T('**希尔排序**：先按增量 d 把序列分成若干组（下标相差 d 的为一组），各组内直接插入排序；再缩小增量，直到 d = 1。时间约 O(n^1.3)，最坏 O(n²)，**不稳定**，只能用于顺序表。', '**Shell sort**: insertion-sort each gap-d group, shrinking d to 1; about O(n^1.3), **unstable**.') },
      ],
    },
    {
      id: 'swap',
      title: T('交换类：冒泡、快速', 'Exchange sorts'),
      blocks: [
        { p: T('**冒泡排序**：每趟从后往前两两比较，逆序就交换，一趟把最小的元素「冒」到最前面，它的最终位置就确定了。某一趟没有交换说明已经有序，可以提前结束。最好 O(n)，最坏 O(n²)，稳定。快速排序见专门的一节。', '**Bubble sort** moves the smallest to the front each pass and stops early if nothing swaps; O(n) to O(n²), stable.') },
      ],
    },
    {
      id: 'select',
      title: T('选择类：简单选择、堆排序', 'Selection sorts'),
      blocks: [
        { p: T('**简单选择**：每趟在未排序部分里选出最小的，和这一段的第一个元素交换。比较次数固定 n(n − 1)/2，和初始序列无关；移动次数少；**不稳定**。堆排序见专门的一节。', '**Selection**: swap the minimum to the front; always n(n − 1)/2 comparisons; **unstable**.') },
      ],
    },
    {
      id: 'merge',
      title: T('归并排序与基数排序', 'Merge and radix sorts'),
      blocks: [
        { p: T('**二路归并**：先把每个元素看成长度 1 的有序段，两两归并成长度 2 的，再归并成长度 4 的……共 ⌈log₂n⌉ 趟，每趟 O(n)，总时间 O(n log n)，需要 O(n) 辅助空间，稳定。', '**Merge sort**: ⌈log₂n⌉ passes of O(n), O(n) extra space, stable.') },
        { p: T('**基数排序**（最低位优先）：不比较关键字。按个位把元素**分配**到 0～9 号队列，再按队列顺序**收集**；然后按十位、百位……重复。d 位、基数 r：时间 O(d(n + r))，空间 O(r)，稳定。', '**Radix sort (LSD)**: distribute by the lowest digit into r queues, collect, repeat for each digit; O(d(n + r)), stable.') },
      ],
    },
    {
      id: 'choose',
      title: T('怎么选、怎么判断', 'Choosing and recognising'),
      blocks: [
        {
          list: [
            T('**每趟能确定一个元素最终位置的**：冒泡、简单选择、快速（枢轴）、堆排序；插入类和归并不能。', 'One final position per pass: bubble, selection, quick, heap.'),
            T('**比较次数和初始序列无关的**：简单选择、（二路）归并的趟数、基数排序。', 'Independent of input order: selection, merge passes, radix.'),
            T('**不稳定的**：希尔、快速、简单选择、堆（口诀「快些选堆」）。', '**Unstable**: Shell, quick, selection, heap.'),
            T('n 较小：直接插入或简单选择；基本有序：直接插入、冒泡；n 很大：快速、堆、归并；要求稳定且快：归并。', 'Small n: insertion or selection; nearly sorted: insertion; large n: quick, heap or merge; stable and fast: merge.'),
          ],
        },
      ],
    },
    pit([
      T('希尔排序每趟用一个增量，组内是插入排序。', 'Each Shell pass uses one gap.'),
      T('冒泡的方向（从前往后还是从后往前）各教材不同，看清题目。', 'Bubble direction varies by book.'),
      T('判断「第几趟的结果」时，先看哪些元素已经在最终位置上。', 'To identify a pass, look for elements already in place.'),
    ]),
  ],
};
const SORT_SPEC = {
  presets: Object.entries(ALG).map(([k, v]) => ({ label: T(v.zh, v.en), set: { algo: k, keys: k === 'radix' ? [278, 109, 63, 930, 589, 184, 505, 269, 8, 83] : [49, 38, 65, 97, 76, 13, 27, 49] } })),
  groups: [{ legend: T('排序', 'Sort'), fields: [
    { name: 'algo', label: T('算法', 'Algorithm'), type: 'select', options: Object.entries(ALG).map(([k, v]) => [k, T(v.zh, v.en)]), wide: true },
    { name: 'keys', label: T('关键字（2～14 个；基数排序要非负整数）', 'Keys (2–14; radix needs non-negative integers)'), type: 'list', min: -999, max: 9999, maxLen: 14, wide: true },
  ] }],
  note: T('都排成递增。希尔增量取 n/2、n/4……1；冒泡从后往前、一趟没有交换就结束；归并自底向上两两归并；基数排序从个位开始。', 'Ascending; Shell gaps n/2, n/4 … 1; bubble back to front with early exit; bottom-up merge; LSD radix.'),
};
const SORT_ERR = { keys: T('要有 2～14 个关键字', 'Give 2–14 keys'), radix: T('基数排序只能排非负整数', 'Radix sort needs non-negative integers'), algo: T('算法不对', 'Unknown algorithm') };
const CW = 46;
function sortBoard(sim, k, z) {
  const items = [];
  const n = sim.keys.length;
  items.push({ k: 'idx', x: 190, y: 96, html: Array.from({ length: n }, (_, i) => txt(i * CW + (CW - 6) / 2, 0, String(i + 1), 'bt-idx')).join('') });
  const row = (a, y, cls) => a.map((v, i) => `<g transform="translate(${i * CW} 0)">${cell(CW - 6, 30, String(v), { size: 13, ...cls(i) })}</g>`).join('');
  items.push({ k: 'r-init', x: 190, y: 106, html: txt(-14, 20, z ? '初始' : 'Initial', 'bt-cap', 'end') + row(sim.keys, 0, () => ({})) });
  const KEEP = 8;
  const shown = sim.passes.slice(0, k + 1);
  const first = Math.max(0, shown.length - KEEP);
  shown.slice(first).forEach((p, j) => {
    const idx = first + j;
    const cur = idx === k;
    const lab = sim.algo === 'shell' ? (z ? `d = ${p.gap}` : `d = ${p.gap}`) : sim.algo === 'merge' ? (z ? `段长 ${p.width}` : `width ${p.width}`) : sim.algo === 'radix' ? (z ? ['个位', '十位', '百位', '千位'][p.digit] : `digit ${p.digit}`) : z ? `第 ${idx + 1} 趟` : `Pass ${idx + 1}`;
    const cls = (i) => {
      if (p.hot?.includes(i) && cur) return { cls: 'hot', tone: 'orange' };
      if (p.sorted && i <= p.sorted[1] && (sim.algo === 'bubble' || sim.algo === 'select')) return { tone: 'green' };
      if (p.sorted && i <= p.sorted[1]) return { tone: 'teal' };
      if (sim.algo === 'shell' && cur) return { tone: ['blue', 'violet', 'amber', 'rose', 'teal', 'orange', 'green'][i % p.gap] };
      if (sim.algo === 'merge') return { tone: Math.floor(i / p.width) % 2 ? 'violet' : 'blue' };
      return {};
    };
    items.push({ k: `r${idx}`, x: 190, y: 106 + (j + 1) * 40, from: [190, 106 + j * 40], html: txt(-14, 20, lab, cur ? 'qs-lab on' : 'qs-lab', 'end') + row(p.a, 0, cls) });
  });
  if (sim.algo === 'radix' && k >= 0) {
    const b = sim.passes[k].buckets;
    let h = txt(0, -12, z ? '分配到各队列' : 'Buckets', 'bt-cap', 'start');
    b.forEach((q, d) => (h += txt(0, d * 20 + 6, `${d}: ${q.join(' ')}`, 'gs-adj', 'start')));
    items.push({ k: 'buckets', x: 190 + n * CW + 40, y: 150, html: h });
  }
  return items;
}
function buildSort(p, kit, ERR) {
  const sim = passes(p);
  const a = ALG[p.algo] ?? ALG.insert;
  const lesson = shell('sort-passes', kit, ERR, sim, {
    where: [['ds', 'sort']],
    tag: T('排序', 'Sort'),
    name: T('内部排序：每一趟的结果', 'Internal sorts pass by pass'),
    full: T('直接插入 · 折半插入 · 希尔 · 冒泡 · 简单选择 · 归并 · 基数 · 稳定性', 'Insertion · binary insertion · Shell · bubble · selection · merge · radix · stability'),
    title: T(a.zh, a.en),
    legend: [['green', T('已在最终位置', 'Final position')], ['teal', T('已排好的前缀', 'Sorted prefix')], ['orange', T('这一趟动到的', 'Moved this pass')]],
    principle: SORT_PRINCIPLE,
    desc: T('选择题常问「某种排序第几趟后的结果」。这节课把一种排序每一趟之后的序列写成一行，像课本上的排序过程表；换一个算法就能对比同一组数据在不同排序下怎么变。', 'Exam questions ask what the array looks like after pass k. Each pass is one row; switch algorithms to compare the same data.'),
    rect: [30, 70, 190 + (sim.ok ? sim.keys.length : 8) * CW + (p.algo === 'radix' ? 260 : 40), 106 + 9 * 40 + 20],
  });
  if (!sim.ok) return lesson;
  const list = sim.passes.map((ps, k) => {
    let d;
    if (sim.algo === 'insert' || sim.algo === 'binsert') d = T(`把 ${ps.note} 插进前面已经有序的部分，放在第 ${ps.hot[0] + 1} 个位置${sim.algo === 'binsert' ? '（用折半查找找到位置）' : ''}。`, `Insert ${ps.note} into the sorted prefix at ${ps.hot[0] + 1}.`);
    else if (sim.algo === 'shell') d = T(`增量 ${ps.gap}：下标相差 ${ps.gap} 的元素为一组（颜色相同），共 ${ps.gap} 组，各组内做直接插入排序。`, `Gap ${ps.gap}: insertion-sort each of the ${ps.gap} groups.`);
    else if (sim.algo === 'bubble') d = ps.swapped ? T(`从后往前两两比较、逆序就交换，第 ${k + 1} 小的元素 ${ps.a[k]} 冒到了第 ${k + 1} 个位置。`, `The next smallest, ${ps.a[k]}, bubbles to position ${k + 1}.`) : T('这一趟一次交换都没有，说明已经有序，提前结束。', 'No swaps: sorted, stop early.');
    else if (sim.algo === 'select') d = T(`在第 ${k + 1}～${sim.keys.length} 个元素里选出最小的 ${ps.a[k]}，和第 ${k + 1} 个交换${ps.hot[0] === ps.hot[1] ? '（它就在这里，不用换）' : ''}。`, `The minimum of the rest, ${ps.a[k]}, moves to ${k + 1}.`);
    else if (sim.algo === 'merge') d = T(`相邻的有序段两两归并，段长变成 ${ps.width}（同色的是一段）。`, `Merge neighbouring runs into runs of ${ps.width}.`);
    else d = T(`按${['个', '十', '百', '千'][ps.digit]}位把每个数分配到 0～9 号队列（右边），再按队列顺序收集起来。`, `Distribute by digit ${ps.digit}, then collect.`);
    return { title: T(`第 ${k + 1} 趟：${ps.a.join(' ')}`, `Pass ${k + 1}: ${ps.a.join(' ')}`), desc: sim.algo === 'shell' ? T(`增量 ${ps.gap}`, `gap ${ps.gap}`) : T(a.zh, a.en), detail: d, ref: { insert: 'insert', binsert: 'insert', shell: 'insert', bubble: 'swap', select: 'select', merge: 'merge', radix: 'merge' }[sim.algo], row: { color: 'orange', what: T(`第 ${k + 1} 趟`, `Pass ${k + 1}`), result: ps.a.join(' '), tone: 'info' } };
  });
  return finish(lesson, list, (k, z) => sortBoard(sim, k, z), T(`${sim.passes.length} 趟排完`, `${sim.passes.length} passes`), T(`一共比较 ${sim.cmp} 次${sim.algo === 'radix' ? '（基数排序不比较关键字）' : ''}。换一个算法，用同样的数据再看一遍。`, `${sim.cmp} comparisons. Try another algorithm on the same data.`));
}
export const makeSortPasses = make('sort-passes', SORT_SPEC, SORT_ERR, buildSort);

// ═════════════════════════ 外部排序 ═════════════════════════

const EXT_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('外部排序的思路', 'External sorting'),
      blocks: [
        { p: T('数据太多放不进内存时，要在磁盘上排序。时间主要花在**读写磁盘**上。两步：先把文件分段读进内存排好，写回成若干个**初始归并段**；再对归并段做多路归并，直到只剩一个。', 'Too big for memory: first produce sorted **initial runs**, then merge them in several passes. Disk I/O dominates.') },
        { formula: T('归并趟数 S = ⌈log_k r⌉（r 个初始归并段，k 路归并）', 'passes S = ⌈log_k r⌉') },
        { p: T('减少读写次数的两个方向：**增大 k**（多路归并，用败者树降低选最小值的比较次数）；**减少 r**（置换—选择生成更长的初始归并段）。', 'Fewer I/Os: **larger k** (with a loser tree) and **smaller r** (replacement selection).') },
      ],
    },
    {
      id: 'loser',
      title: T('败者树', 'Loser trees'),
      blocks: [
        { p: T('k 路归并每次要从 k 个段的当前元素里选最小的。直接比较要 k − 1 次；**败者树**是一棵完全二叉树，叶子是 k 个段的当前元素，内部结点记录比赛的「败者」，根上面记录冠军。选出一个后只需沿一条路径重新比赛，比较 ⌈log₂k⌉ 次，所以增大 k 不会让内部比较时间增加。', 'A **loser tree** records losers in internal nodes; after each output only one root-to-leaf path is replayed: ⌈log₂k⌉ comparisons.') },
      ],
    },
    {
      id: 'rs',
      title: T('置换—选择排序', 'Replacement selection'),
      blocks: [
        {
          steps: [
            T('从输入读满工作区 WA（w 个记录）；', 'fill the work area with w records;'),
            T('从 WA 里选出不小于 MINIMAX（当前段最后输出的值）的最小记录输出，作为新的 MINIMAX；', 'output the smallest record ≥ MINIMAX and make it the new MINIMAX;'),
            T('再从输入读一个记录补进 WA；', 'read the next input record into WA;'),
            T('WA 里所有记录都小于 MINIMAX 时，当前归并段结束，开始下一段。', 'when every record in WA is below MINIMAX, start a new run.'),
          ],
        },
        { p: T('得到的初始归并段平均长度约是工作区的 2 倍，而且长度不等。', 'Runs average about twice the work area and vary in length.') },
      ],
    },
    {
      id: 'best',
      title: T('最佳归并树', 'Optimal merge trees'),
      blocks: [
        { p: T('归并段长度不等时，哪些段先归并会影响读写量。把段长看成权值，构造 **k 叉哈夫曼树**，叫最佳归并树。读写磁盘的总次数 = 2 × WPL。', 'With unequal runs, a **k-ary Huffman tree** minimises I/O: total reads and writes = 2 × WPL.') },
        { formula: T('若 (r − 1) % (k − 1) = u ≠ 0，补 k − 1 − u 个长度为 0 的虚段', 'if (r − 1) % (k − 1) = u ≠ 0, add k − 1 − u empty runs') },
        { p: T('虚段让每次都能凑够 k 个一起归并，构成严格 k 叉树。虚段权值为 0，会被放在最深的位置。', 'Empty runs make every merge k-way; they sit deepest.') },
      ],
    },
    pit([
      T('读写次数 = 2 × WPL（每个记录读一次、写一次）。', 'I/O = 2 × WPL.'),
      T('补虚段的个数按 (r − 1) % (k − 1) 算，别忘了。', 'Remember the empty runs.'),
      T('败者树的内部结点存败者，不是胜者。', 'Loser-tree nodes store losers.'),
    ]),
  ],
};
const EXT_SPEC = {
  presets: [
    { label: T('最佳归并树', 'Optimal merge tree'), set: { mode: 'best', lens: [9, 30, 12, 18, 3, 17, 2, 6, 24], k: 3, keys: [51, 49, 39, 46, 38, 29, 14, 61, 15, 30, 1, 48, 52, 3, 63, 27, 4, 13, 89, 24, 46, 58, 33, 76], w: 3 } },
    { label: T('要补虚段', 'With empty runs'), set: { mode: 'best', lens: [2, 3, 6, 9, 12, 17, 18, 24], k: 3, keys: [51, 49, 39, 46, 38, 29, 14, 61, 15, 30, 1, 48, 52, 3, 63, 27, 4, 13, 89, 24, 46, 58, 33, 76], w: 3 } },
    { label: T('置换—选择', 'Replacement selection'), set: { mode: 'rs', lens: [9, 30, 12, 18, 3, 17, 2, 6, 24], k: 3, keys: [51, 49, 39, 46, 38, 29, 14, 61, 15, 30, 1, 48, 52, 3, 63, 27, 4, 13, 89, 24, 46, 58, 33, 76], w: 3 } },
  ],
  groups: [{ legend: T('外部排序', 'External sorting'), fields: [
    { name: 'mode', label: T('演示', 'Show'), type: 'select', options: [['best', T('最佳归并树', 'optimal merge tree')], ['rs', T('置换—选择', 'replacement selection')]], wide: true },
    { name: 'lens', label: T('各初始归并段的长度', 'Run lengths'), type: 'list', min: 1, max: 999, maxLen: 14, wide: true },
    { name: 'k', label: T('k 路归并', 'k-way'), type: 'int', min: 2, max: 5 },
    { name: 'keys', label: T('置换—选择的输入记录', 'Records for replacement selection'), type: 'list', min: -999, max: 9999, maxLen: 24, wide: true },
    { name: 'w', label: T('工作区大小', 'Work area'), type: 'int', min: 2, max: 6 },
  ] }],
  note: T('最佳归并树每次取最小的 k 个合并，长度相同时先出现的在前。', 'Merge the k smallest each time; ties go to the earlier one.'),
};
const EXT_ERR = { lens: T('归并段长度要 2～14 个正数', 'Give 2–14 positive lengths'), k: T('k 在 2～5', 'k must be 2–5'), keys: T('输入记录要 2～24 个', 'Give 2–24 records'), w: T('工作区在 2～6', 'Work area 2–6') };
function extBoard(sim, k, z) {
  if (sim.mode === 'rs') {
    const s = k >= 0 ? sim.rs.steps[k] : null;
    const items = [];
    items.push({ k: 'in', x: 100, y: 110, html: txt(-14, 20, z ? '输入' : 'Input', 'bt-cap', 'end') + sim.rs.keys.map((v, i) => `<g transform="translate(${(i % 12) * 40} ${Math.floor(i / 12) * 38})">${cell(34, 30, String(v), { size: 12, cls: s && i < (sim.rs.w + sim.rs.steps.slice(0, k + 1).filter((x) => x.kind === 'out' && x.in != null).length) ? 'dim' : '' })}</g>`).join('') });
    items.push({ k: 'wa', x: 100, y: 230, html: txt(-14, 20, z ? '工作区' : 'Work area', 'bt-cap', 'end') + (s ? s.wa : sim.rs.keys.slice(0, sim.rs.w)).map((v, i) => `<g transform="translate(${i * 46} 0)">${cell(40, 30, String(v), { tone: 'violet', size: 13 })}</g>`).join('') });
    const runs = s ? (s.runs ?? sim.rs.steps.slice(0, k).reverse().find((x) => x.runs)?.runs ?? [[]]) : [[]];
    runs.forEach((r, i) => items.push({ k: `run${i}`, x: 100, y: 300 + i * 40, html: txt(-14, 20, z ? `段 ${i + 1}` : `Run ${i + 1}`, 'bt-cap', 'end') + r.map((v, j) => `<g transform="translate(${j * 40} 0)">${cell(34, 30, String(v), { tone: 'green', size: 12, cls: s?.kind === 'out' && i === s.run && j === r.length - 1 ? 'hot' : '' })}</g>`).join('') }));
    return items;
  }
  const b = sim.best;
  const trees = k < 0 ? [...b.lens.map((v, i) => ({ id: `r${i}`, val: v, leaf: true, kids: [] })), ...Array.from({ length: b.dummies }, (_, i) => ({ id: `d${i}`, val: 0, leaf: true, dummy: true, kids: [] }))] : b.steps[k].forest;
  const pos = new Map();
  let x = 0;
  const go = (n, d) => {
    if (!n.kids.length) pos.set(n, [100 + x++ * 50, 140 + d * 76]);
    else {
      n.kids.forEach((c) => go(c, d + 1));
      pos.set(n, [(pos.get(n.kids[0])[0] + pos.get(n.kids.at(-1))[0]) / 2, 140 + d * 76]);
    }
  };
  trees.forEach((t) => {
    go(t, 0);
    x += 0.6;
  });
  let edges = '';
  for (const [n, [px, py]] of pos) n.kids.forEach((c) => { const [cx, cy] = pos.get(c); edges += `<line class="te" x1="${px}" y1="${py + 19}" x2="${cx}" y2="${cy - 19}"/>`; });
  const items = [{ k: 'tree-edges', x: 0, y: 0, html: edges }];
  const cur = k >= 0 ? b.steps[k].forest.at(-1) : null;
  for (const [n, [px, py]] of pos) items.push({ k: `tn-${n.id}`, x: px, y: py, html: node(String(n.val), { tone: n.dummy ? '' : n.leaf ? 'teal' : '', cls: n === cur ? 'hot' : n.dummy ? 'dim' : '', size: 13 }) });
  if (k === b.steps.length - 1) items.push({ k: 'wpl', x: 100, y: 110, html: txt(0, 0, z ? `WPL = ${b.wpl}，读写磁盘 2 × ${b.wpl} = ${b.io} 次` : `WPL = ${b.wpl}; I/O = ${b.io}`, 'bt-lab', 'start') });
  return items;
}
function buildExt(p, kit, ERR) {
  const best = bestMerge({ lens: p.lens, k: p.k });
  const rs = replaceSelect({ keys: p.keys, w: p.w });
  const sim = p.mode === 'rs' ? (rs.ok ? { ok: true, mode: 'rs', rs } : rs) : best.ok ? { ok: true, mode: 'best', best } : best;
  const lesson = shell('ext-sort', kit, ERR, sim, {
    where: [['ds', 'sort']],
    tag: T('外排', 'Ext'),
    name: T('外部排序', 'External sorting'),
    full: T('初始归并段 · 多路归并与败者树 · 置换—选择 · 最佳归并树', 'Initial runs · k-way merging and loser trees · replacement selection · optimal merge trees'),
    title: p.mode === 'rs' ? T('置换—选择', 'Replacement selection') : T(`${p.k} 路最佳归并树`, `${p.k}-way optimal merge tree`),
    legend: p.mode === 'rs' ? [['violet', T('工作区', 'Work area')], ['green', T('输出的归并段', 'Runs')]] : [['teal', T('初始归并段', 'Initial runs')]],
    principle: EXT_PRINCIPLE,
    desc: T('外部排序的时间主要花在读写磁盘上。最佳归并树用 k 叉哈夫曼树安排归并的顺序，让读写次数最少；置换—选择能生成比内存更长的初始归并段。两种都可以在这里演示。', 'Disk I/O dominates external sorting. An optimal merge tree (a k-ary Huffman tree) minimises it; replacement selection produces longer initial runs.'),
    rect: p.mode === 'rs' ? [20, 80, 100 + 12 * 40 + 40, 300 + 5 * 40 + 20] : [30, 90, 100 + ((p.lens?.length ?? 8) + 2) * 50 + 40, 140 + 4 * 76],
  });
  if (!sim.ok) return lesson;
  let list;
  if (sim.mode === 'rs') {
    list = rs.steps.map((s) => (s.kind === 'newrun' ? { title: T(`工作区都比 MINIMAX 小：开始第 ${s.run + 1} 段`, `Start run ${s.run + 1}`), desc: T(`工作区 ${s.wa.join(' ')}`, `WA ${s.wa.join(' ')}`), detail: T(`工作区里的 ${s.wa.join('、')} 都比当前段最后输出的数小，放不进这一段了，当前段结束，开始新的一段。`, 'Everything in the work area is too small for the current run: start a new one.'), ref: 'rs', row: { color: 'rose', what: T('新段', 'New run'), result: String(s.run + 1), tone: 'warn' } } : { title: T(`输出 ${s.x}${s.in != null ? `，读入 ${s.in}` : ''}`, `Output ${s.x}${s.in != null ? `, read ${s.in}` : ''}`), desc: T(`第 ${s.run + 1} 段`, `Run ${s.run + 1}`), detail: T(`在工作区里选不小于 MINIMAX 的最小值 ${s.x} 输出到第 ${s.run + 1} 段，MINIMAX = ${s.x}。${s.in != null ? `再读入 ${s.in} 补进工作区。` : '输入已经读完。'}`, `Output ${s.x} (smallest ≥ MINIMAX)${s.in != null ? `, read ${s.in}` : ''}.`), ref: 'rs', row: { color: 'green', what: String(s.x), result: T(`段 ${s.run + 1}`, `run ${s.run + 1}`), tone: 'info' } }));
  } else {
    list = [];
    if (best.dummies) list.push({ title: T(`补 ${best.dummies} 个虚段`, `Add ${best.dummies} empty run(s)`), desc: T(`(${best.lens.length} − 1) % (${best.k} − 1) = ${(best.lens.length - 1) % (best.k - 1)}`, `(r − 1) % (k − 1) ≠ 0`), detail: T(`${best.lens.length} 个归并段做 ${best.k} 路归并：(${best.lens.length} − 1) % (${best.k} − 1) = ${(best.lens.length - 1) % (best.k - 1)} ≠ 0，要补 ${best.k} − 1 − ${(best.lens.length - 1) % (best.k - 1)} = ${best.dummies} 个长度为 0 的虚段，才能每次都凑满 ${best.k} 个。`, `Add ${best.dummies} empty runs so every merge is ${best.k}-way.`), ref: 'best', k0: -1, row: { color: 'slate', what: T('虚段', 'Empty runs'), result: String(best.dummies), tone: 'info' } });
    best.steps.forEach((s) => list.push({ title: T(`归并 ${s.take.join('、')} → ${s.sum}`, `Merge ${s.take.join(', ')} → ${s.sum}`), desc: T(`剩 ${s.forest.length} 个`, `${s.forest.length} left`), detail: T(`选最短的 ${best.k} 个段（${s.take.join('、')}）归并成长度 ${s.sum} 的段。`, `Merge the ${best.k} shortest runs into one of ${s.sum}.`), ref: 'best', row: { color: 'teal', what: s.take.join('+'), result: String(s.sum), tone: 'info' } }));
    list.push({ title: T(`读写磁盘 ${best.io} 次`, `${best.io} disk I/Os`), desc: `WPL = ${best.wpl}`, detail: T(`WPL = 各段长度 × 它在树里的深度之和 = ${best.wpl}。每个记录归并一次要读一次、写一次，所以读写总次数 = 2 × ${best.wpl} = ${best.io}。`, `WPL = ${best.wpl}; I/O = 2 × WPL = ${best.io}.`), ref: 'best', row: { color: 'green', what: T('读写次数', 'I/O'), result: String(best.io), tone: 'ok' } });
  }
  const offset = sim.mode === 'best' && best.dummies ? 1 : 0;
  return finish(lesson, list, (k, z) => extBoard(sim, sim.mode === 'best' ? Math.min(k - offset, best.steps.length - 1) : k, z), sim.mode === 'rs' ? T(`得到 ${rs.runs.length} 个初始归并段`, `${rs.runs.length} initial runs`) : T(`读写 ${best.io} 次`, `${best.io} I/Os`), sim.mode === 'rs' ? T(`工作区只有 ${rs.w} 个记录，平均每段却有 ${+(rs.keys.length / rs.runs.length).toFixed(1)} 个。`, `Runs average ${+(rs.keys.length / rs.runs.length).toFixed(1)} records with a work area of ${rs.w}.`) : T('把 k 改大一点，看树变矮、读写次数减少。', 'Increase k and watch the tree flatten.'));
}
export const makeExtSort = make('ext-sort', EXT_SPEC, EXT_ERR, buildExt);

// ═════════════════════════ 时间复杂度 ═════════════════════════

const CODE = {
  double: { zh: 'i = 1; while (i <= n) i = i * 2;', fn: 'log₂n', big: 'O(log n)' },
  tri: { zh: 'for (i = 1; i <= n; i++)\n  for (j = 1; j <= i; j++) x++;', fn: 'n(n + 1)/2', big: 'O(n²)' },
  nested: { zh: 'for (i = 1; i <= n; i++)\n  for (j = 1; j <= n; j = j * 2) x++;', fn: 'n·(⌊log₂n⌋ + 1)', big: 'O(n log n)' },
  sqrt: { zh: 'i = 0; s = 0;\nwhile (s < n) { i++; s = s + i; }', fn: '√(2n)', big: 'O(√n)' },
};
const CX_PRINCIPLE = {
  sections: [
    {
      id: 'concept',
      title: T('数据结构的基本概念', 'Basic concepts'),
      blocks: [
        { p: T('数据结构研究数据元素之间的关系和对它们的操作，包括三方面：**逻辑结构**（集合、线性、树、图）、**存储结构**（顺序、链式、索引、散列）、**数据的运算**。逻辑结构独立于存储结构。', 'A data structure has a **logical structure** (set, linear, tree, graph), a **storage structure** (sequential, linked, indexed, hashed) and **operations**.') },
        { p: T('**算法**的五个特性：有穷性、确定性、可行性、输入、输出。好算法还要正确、可读、健壮，时间和空间效率高。', 'An **algorithm** is finite, definite, feasible, with inputs and outputs.') },
      ],
    },
    {
      id: 'time',
      title: T('时间复杂度', 'Time complexity'),
      blocks: [
        { p: T('找出**基本语句**（最深层循环里的语句），数它的执行次数 f(n)，只保留增长最快的项、去掉系数，就是时间复杂度 T(n) = O(f(n))。', 'Count how often the **innermost statement** runs, keep the fastest-growing term without constants.') },
        { formula: 'O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(n³) < O(2ⁿ) < O(n!) < O(nⁿ)' },
        {
          list: [
            T('**加法规则**：并列的代码段取最大的；**乘法规则**：嵌套的循环相乘。', '**Sum rule** for sequences, **product rule** for nesting.'),
            T('循环变量每次乘 2（或除以 2）：执行 log₂n 次。', 'Doubling or halving: log₂n iterations.'),
            T('内层循环次数依赖外层变量时，要对每一次外层循环求和，不能直接相乘。', 'When the inner bound depends on the outer variable, sum instead of multiplying.'),
            T('递归：写出递推式 T(n) = aT(n/b) + f(n)，展开求和。', 'Recursion: expand the recurrence.'),
          ],
        },
        { tip: T('一般说的时间复杂度指**最坏情况**；平均时间复杂度是所有输入等概率时的期望。', 'Complexity normally means the **worst case**.') },
      ],
    },
    {
      id: 'space',
      title: T('空间复杂度', 'Space complexity'),
      blocks: [
        { p: T('除了输入本身，算法额外用到的存储空间。只用几个变量是 O(1)，叫**原地工作**；递归要算递归栈的深度。', 'Extra space beyond the input: O(1) is **in place**; recursion counts its stack depth.') },
      ],
    },
    pit([
      T('while (s < n) 这类循环要先找出循环变量和 n 的关系，再解出次数。', 'Find the relation between the loop variable and n first.'),
      T('三角形嵌套循环是 n(n + 1)/2 次，仍是 O(n²)。', 'Triangular nesting is still O(n²).'),
    ]),
  ],
};
const CX_SPEC = {
  presets: [
    { label: T('i = i × 2', 'i = i × 2'), set: { kind: 'double', n: 100 } },
    { label: T('三角形嵌套', 'Triangular nesting'), set: { kind: 'tri', n: 10 } },
    { label: T('外层 n、内层翻倍', 'Linear × doubling'), set: { kind: 'nested', n: 16 } },
    { label: T('s = s + i', 's = s + i'), set: { kind: 'sqrt', n: 100 } },
  ],
  groups: [{ legend: T('代码', 'Code'), fields: [
    { name: 'kind', label: T('循环', 'Loop'), type: 'select', options: [['double', 'i = i × 2'], ['tri', T('三角形嵌套', 'triangular')], ['nested', T('外层 n、内层翻倍', 'n × log n')], ['sqrt', 's = s + i']], wide: true },
    { name: 'n', label: 'n', type: 'int', min: 1, max: 4096 },
  ] }],
  note: T('真的把循环跑一遍数次数，再和公式对照。', 'The loop is actually run and counted, then compared with the formula.'),
};
const CX_ERR = { n: T('n 在 1～4096', 'n must be 1–4096'), kind: T('循环类型不对', 'Unknown loop') };
function cxBoard(sim, st, z) {
  const c = CODE[sim.kind];
  const items = [];
  items.push({ k: 'code', x: 100, y: 120, html: c.zh.split('\n').map((l, i) => txt(0, i * 24, l, 'cx-code', 'start')).join('') });
  if (st >= 1) {
    if (sim.trace.length) items.push({ k: 'trace', x: 100, y: 220, html: txt(0, -10, sim.kind === 'double' ? (z ? '每次循环时 i 的值' : 'i at each iteration') : z ? '每次循环后 s 的值' : 's after each iteration', 'bt-cap', 'start') + sim.trace.slice(0, 16).map((v, i) => `<g transform="translate(${i * 46} 0)">${cell(40, 28, String(v), { tone: 'blue', size: 11 })}</g>`).join('') + (sim.trace.length > 16 ? txt(16 * 46, 20, '…', 'bt-idx', 'start') : '') });
    items.push({ k: 'count', x: 100, y: 300, html: txt(0, 0, z ? `n = ${sim.n} 时执行了 ${sim.count} 次` : `${sim.count} runs for n = ${sim.n}`, 'bt-formula cur', 'start') });
  }
  if (st >= 2) items.push({ k: 'big', x: 100, y: 340, html: txt(0, 0, `${z ? '次数' : 'count'} ≈ ${c.fn}  ⇒  ${c.big}`, 'cx-big', 'start') });
  return items;
}
function buildCx(p, kit, ERR) {
  const sim = countLoop(p);
  const c = CODE[p.kind] ?? CODE.double;
  const lesson = shell('complexity', kit, ERR, sim, {
    where: [['ds', 'basic']],
    tag: 'O(n)',
    name: T('时间复杂度', 'Time complexity'),
    full: T('逻辑结构与存储结构 · 算法特性 · 数基本语句 · 加法和乘法规则 · 空间复杂度', 'Structures · algorithm properties · counting · sum and product rules · space'),
    title: T(c.big, c.big),
    legend: [['blue', T('循环变量的变化', 'Loop variable')]],
    principle: CX_PRINCIPLE,
    desc: T('求时间复杂度就是数基本语句执行了多少次。这节课真的把循环跑一遍，列出循环变量的变化、数出次数，再和公式、大 O 对照。', 'Complexity means counting how often the basic statement runs. The loop is executed, its variable traced and the count matched against the formula.'),
    rect: [40, 90, 100 + 17 * 46 + 30, 380],
  });
  if (!sim.ok) return lesson;
  const D = {
    double: T(`i 依次是 1、2、4、8……，每次乘 2，到超过 ${sim.n} 为止。设执行 t 次，则 2^(t−1) ≤ n，t = ⌊log₂n⌋ + 1 = ${sim.count}。`, `i doubles until it exceeds ${sim.n}: ⌊log₂n⌋ + 1 = ${sim.count}.`),
    tri: T(`外层第 i 次，内层执行 i 次。总次数 = 1 + 2 + … + ${sim.n} = ${sim.n}×${sim.n + 1}/2 = ${sim.count}。`, `1 + 2 + … + ${sim.n} = ${sim.count}.`),
    nested: T(`外层 ${sim.n} 次，每次内层 j 从 1 翻倍到 ${sim.n}，执行 ⌊log₂${sim.n}⌋ + 1 = ${sim.count / sim.n} 次。两者相乘：${sim.count}。`, `${sim.n} × ${sim.count / sim.n} = ${sim.count}.`),
    sqrt: T(`第 t 次循环后 s = 1 + 2 + … + t = t(t + 1)/2。s ≥ ${sim.n} 时停止，t(t + 1)/2 ≥ ${sim.n}，t 约 √(2n)，这里 t = ${sim.count}。`, `s = t(t + 1)/2 ≥ ${sim.n} gives t ≈ √(2n) = ${sim.count}.`),
  }[sim.kind];
  const list = [
    { title: T('找基本语句', 'Find the basic statement'), desc: T('最深层循环里的那一句', 'The innermost statement'), detail: T('基本语句是执行次数最多的那一句，一般就是最内层循环里的语句。时间复杂度由它的执行次数决定。', 'The innermost statement runs most often and determines the complexity.'), ref: 'time', st: 0, row: { color: 'slate', what: T('基本语句', 'Basic'), result: '', tone: 'info' } },
    { title: T(`数一数：${sim.count} 次`, `Count: ${sim.count}`), desc: `n = ${sim.n}`, detail: D, ref: 'time', st: 1, row: { color: 'blue', what: T('次数', 'Count'), result: String(sim.count), tone: 'info' } },
    { title: T(`时间复杂度 ${c.big}`, `Complexity ${c.big}`), desc: T(`次数 ≈ ${c.fn}`, `count ≈ ${c.fn}`), detail: T(`执行次数是 ${c.fn} 这个量级，去掉低阶项和系数，时间复杂度是 ${c.big}。改一下 n，看次数是不是按这个规律增长。`, `The count grows like ${c.fn}: ${c.big}.`), ref: 'time', st: 2, row: { color: 'green', what: 'T(n)', result: c.big, tone: 'ok' } },
  ];
  return finish(lesson, list, (k, z) => cxBoard(sim, k < 0 ? -1 : list[k].st, z), T(c.big, c.big), T('把 n 翻一倍，看次数怎么变：O(log n) 只多 1 次，O(n²) 变成 4 倍。', 'Double n: O(log n) adds one, O(n²) quadruples.'));
}
export const makeComplexity = make('complexity', CX_SPEC, CX_ERR, buildCx);
