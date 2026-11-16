// 「快速排序」：课本上的排序过程表——每做一次划分写一行，当前区间用框框住，枢轴落点高亮，
// 已经落到最终位置的元素标绿；上面一行展开当前这次划分里 low、high 交替「挖坑填数」的过程。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { quicksort } from './qsort.js';

const SPEC = {
  presets: [
    { label: T('课本上的那组数', 'The textbook array'), set: { keys: [49, 38, 65, 97, 76, 13, 27, 49] } },
    { label: T('已经有序：最坏情况', 'Already sorted: worst case'), set: { keys: [1, 2, 3, 4, 5, 6, 7] } },
    { label: T('枢轴每次都在中间', 'Balanced splits'), set: { keys: [50, 20, 80, 10, 30, 70, 90] } },
  ],
  groups: [{ legend: T('待排序序列', 'Keys'), fields: [{ name: 'keys', label: T('关键字（2～14 个）', 'Keys (2–14)'), type: 'list', min: -999, max: 9999, maxLen: 14, wide: true }] }],
  note: T(
    '取区间第一个元素做枢轴，high 从右往左找比枢轴小的、low 从左往右找比枢轴大的，交替把找到的元素填进对方留下的「坑」，两指针相遇处放枢轴。等于枢轴的元素不移动。划分完先处理左边再处理右边，长度为 1 的区间不用划分。',
    'The first element is the pivot. high scans left for something smaller, low scans right for something larger, alternately filling each other’s hole; the pivot goes where they meet. Equal keys stay put. The left part is processed before the right; one-element parts need no partition.',
  ),
};
const ERR = { keys: T('要有 2～14 个关键字', 'Give 2–14 keys') };

// ───── 画板 ─────
const CW = 46;
const RH = 40;
const X0 = 190;
const TY = 240;
const KEEP = 7;

const row = (vals, cls) => vals.map((v, i) => `<g transform="translate(${i * CW} 0)">${cell(CW - 6, RH - 10, String(v), { size: 14, ...cls(i) })}</g>`).join('');

function board(sim, st, z) {
  const items = [];
  const n = sim.input.length;
  // 下标
  items.push({ k: 'idx', x: X0, y: TY - 14, html: Array.from({ length: n }, (_, i) => txt(i * CW + (CW - 6) / 2, 0, String(i), 'bt-idx')).join('') });
  // 当前这次划分的「挖坑填数」过程
  const cur = st.k >= 0 ? sim.parts[st.k] : null;
  if (cur) {
    let h = txt(-16, 18, z ? `本次划分 [${cur.lo}..${cur.hi}]` : `This partition [${cur.lo}..${cur.hi}]`, 'qs-lab on', 'end');
    h += row(cur.before, (i) => (i < cur.lo || i > cur.hi ? { cls: 'dim' } : i === cur.lo ? { tone: 'amber' } : {}));
    h += txt(n * CW + 10, 18, z ? `枢轴 ${cur.pivot}` : `pivot ${cur.pivot}`, 'qs-piv', 'start');
    // 移动画成弧线箭头
    cur.moves.forEach((m, j) => {
      const x1 = m.from * CW + (CW - 6) / 2;
      const x2 = m.to * CW + (CW - 6) / 2;
      const up = 16 + j * 14;
      const peak = -0.75 * (up + 10) - 2;
      h += `<path class="qs-mv ${m.side}" d="M${x1},-2 C${x1},${-up - 10} ${x2},${-up - 10} ${x2},-2"/>` + `<circle class="qs-dot" cx="${((x1 + x2) / 2).toFixed(1)}" cy="${peak.toFixed(1)}" r="7"/>` + txt((x1 + x2) / 2, peak + 4, String(j + 1), 'qs-no');
    });
    const px = cur.pos * CW + (CW - 6) / 2;
    h += `<path class="qs-mv piv" d="M${(cur.lo * CW + (CW - 6) / 2).toFixed(1)},${RH - 8} C${(cur.lo * CW + (CW - 6) / 2).toFixed(1)},${RH + 18} ${px},${RH + 18} ${px},${RH - 8}"/>`;
    const order = cur.moves.map((m, j) => `${'①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭'[j] ?? j + 1} ${m.val}→${m.to}`).join('　');
    h += txt(0, RH + 40, (z ? '填坑顺序：' : 'Moves: ') + (order || (z ? '没有元素移动' : 'none')) + (z ? `　枢轴 ${cur.pivot}→${cur.pos}` : `　pivot ${cur.pivot}→${cur.pos}`), 'qs-order', 'start');
    items.push({ k: 'cur', x: X0, y: 124, html: h });
  }
  // 排序过程表
  const shown = st.k >= 0 ? sim.parts.slice(0, st.k + 1) : [];
  const first = Math.max(0, shown.length - KEEP);
  let t = txt(-16, 18, z ? '初始' : 'Initial', 'bt-cap', 'end') + row(sim.input, () => ({}));
  items.push({ k: 'r-init', x: X0, y: TY, html: t });
  shown.slice(first).forEach((p, j) => {
    const idx = first + j;
    const y = TY + (j + 1) * RH;
    const fixed = new Set(p.fixed);
    let h = txt(-16, 18, z ? `第 ${idx + 1} 次 [${p.lo}..${p.hi}]` : `#${idx + 1} [${p.lo}..${p.hi}]`, `qs-lab ${idx === st.k ? 'on' : ''}`, 'end');
    h += `<rect class="qs-range ${idx === st.k ? 'on' : ''}" x="${p.lo * CW - 4}" y="-4" width="${(p.hi - p.lo + 1) * CW + 2}" height="${RH - 2}" rx="7"/>`;
    h += row(p.after, (i) => (i === p.pos ? { cls: idx === st.k ? 'hot' : '', tone: 'green' } : fixed.has(i) ? { tone: 'green' } : i < p.lo || i > p.hi ? { cls: 'dim' } : {}));
    items.push({ k: `r${idx}`, x: X0, y, from: [X0, y - RH], html: h });
  });
  if (st.done) {
    const y = TY + (Math.min(shown.length, KEEP) + 1) * RH + 8;
    items.push({ k: 'r-done', x: X0, y, html: txt(-16, 18, z ? '结果' : 'Sorted', 'bt-lab', 'end') + row(sim.sorted, () => ({ tone: 'green' })) });
  }
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'idea',
      title: T('快速排序的思想', 'The idea'),
      blocks: [
        { p: T('快速排序基于**分治**：任取一个元素做**枢轴**（通常取第一个），通过一次**划分**把序列分成两部分——左边都不大于枢轴，右边都不小于枢轴，枢轴本身就落在了它排好序后的**最终位置**上。然后对左右两部分分别递归地做同样的事。', 'Quicksort is **divide and conquer**: a **partition** around a **pivot** leaves smaller keys on the left, larger on the right, and the pivot in its **final position**; then both sides are sorted recursively.') },
        { tip: T('判断「是不是快速排序第 k 趟的结果」：看有几个元素已经在最终位置上，并且它左边的都比它小、右边的都比它大。每一趟至少确定一个元素的最终位置（第二趟以后通常更多）。', 'To check a pass: count elements already in their final place with smaller keys on the left and larger on the right.') },
      ],
    },
    {
      id: 'partition',
      title: T('一次划分怎么做', 'One partition'),
      blocks: [
        {
          steps: [
            T('把第一个元素存为枢轴 pivot，它的位置空出来成了一个「坑」；low 指向区间头，high 指向区间尾；', 'save the first element as the pivot, leaving a hole; low at the start, high at the end;'),
            T('high 向左移，跳过 ≥ pivot 的元素，遇到比 pivot 小的，把它填进 low 处的坑（high 处成了新坑）；', 'move high left past keys ≥ pivot; move the first smaller one into the hole at low;'),
            T('low 向右移，跳过 ≤ pivot 的元素，遇到比 pivot 大的，填进 high 处的坑；', 'move low right past keys ≤ pivot; move the first larger one into the hole at high;'),
            T('重复 2、3，直到 low 和 high 相遇，把 pivot 放进这个位置。', 'repeat until they meet, then drop the pivot there.'),
          ],
        },
        { warn: T('先动 high，再动 low，顺序不能反：坑一开始在左边。', 'Move high first: the first hole is on the left.') },
      ],
    },
    {
      id: 'perf',
      title: T('性能', 'Performance'),
      blocks: [
        {
          list: [
            T('**时间**：每层划分合起来是 O(n)，递归深度最好 O(log n)、最坏 O(n)。平均和最好 O(n log n)，**最坏 O(n²)**——序列本来就有序（或逆序）时，每次枢轴都落在一端。', '**Time**: O(n) per level; depth O(log n) at best, O(n) at worst. Average O(n log n), **worst O(n²)** on already sorted input.'),
            T('**空间**：递归要用栈，最好 O(log n)，最坏 O(n)。', '**Space**: recursion stack, O(log n) to O(n).'),
            T('**不稳定**：相同关键字的相对次序可能改变。', '**Unstable**.'),
            T('平均性能是内部排序里最好的；改进办法：随机选枢轴、三者取中。', 'Best average among internal sorts; random or median-of-three pivots help.'),
          ],
        },
      ],
    },
    {
      id: 'compare',
      title: T('各种内部排序对比', 'Internal sorts compared'),
      blocks: [
        {
          table: {
            head: [T('算法', 'Sort'), T('平均时间', 'Average'), T('最坏时间', 'Worst'), T('空间', 'Space'), T('稳定', 'Stable')],
            rows: [
              [T('直接插入', 'Insertion'), 'O(n²)', 'O(n²)', 'O(1)', T('是', 'yes')],
              [T('希尔', 'Shell'), T('约 O(n^1.3)', '≈ O(n^1.3)'), 'O(n²)', 'O(1)', T('否', 'no')],
              [T('冒泡', 'Bubble'), 'O(n²)', 'O(n²)', 'O(1)', T('是', 'yes')],
              [T('快速', 'Quick'), 'O(n log n)', 'O(n²)', 'O(log n)', T('否', 'no')],
              [T('简单选择', 'Selection'), 'O(n²)', 'O(n²)', 'O(1)', T('否', 'no')],
              [T('堆', 'Heap'), 'O(n log n)', 'O(n log n)', 'O(1)', T('否', 'no')],
              [T('归并', 'Merge'), 'O(n log n)', 'O(n log n)', 'O(n)', T('是', 'yes')],
              [T('基数', 'Radix'), 'O(d(n + r))', 'O(d(n + r))', 'O(r)', T('是', 'yes')],
            ],
          },
        },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('「一趟」的说法不统一：有的指一次划分，有的指递归的一层（对当前所有子区间各做一次划分）。看清题目的意思。', '“One pass” may mean one partition or one recursion level; read the question.'),
            T('初始序列越有序，快排越慢，这和插入排序正好相反。', 'Sorted input is quicksort’s worst case, the opposite of insertion sort.'),
            T('和枢轴相等的元素不移动（判断条件是 ≥ 和 ≤）。', 'Keys equal to the pivot stay put (≥ and ≤).'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('划分', 'Partitions') });

function build(params) {
  const sim = quicksort(params.keys ?? []);
  const lesson = {
    id: 'quicksort',
    kit,
    where: [['ds', 'sort']],
    tag: T('快排', 'QS'),
    name: T('快速排序', 'Quicksort'),
    full: T('分治 · 一次划分（挖坑填数）· 排序过程表 · 最坏情况 · 内部排序对比', 'Divide and conquer · partitioning · pass table · worst case · comparing sorts'),
    title: sim.ok ? T(`${sim.input.length} 个关键字`, `${sim.input.length} keys`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['amber', T('枢轴', 'Pivot')],
      ['green', T('已在最终位置', 'Final position')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('快速排序每做一次划分，就有一个枢轴落到它的最终位置。这节课照课本的排序过程表一行一行写：当前区间用框框住，枢轴落点高亮，已经定下来的元素标绿；上面再把这次划分里 low、high 交替填坑的每一步用箭头画出来。', 'Every partition puts one pivot in its final place. The textbook pass table grows a row per partition, the current range boxed and settled keys in green; above it, arrows show each hole-filling move.'),
      facts: sim.ok ? [[T('序列', 'Keys'), sim.input.join(' ')]] : [],
    },
    start: { nodes: [], frame: { rect: [20, 20, X0 + (sim.ok ? sim.input.length : 8) * CW + 110, TY + (KEEP + 2) * RH + 20] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.parts.map((p, k) => {
    const mv = p.moves.map((m) => `${m.val}→[${m.to}]`).join('，');
    return {
      title: T(`第 ${k + 1} 次划分：${p.pivot} 落在位置 ${p.pos}`, `Partition ${k + 1}: ${p.pivot} lands at ${p.pos}`),
      desc: T(`区间 [${p.lo}..${p.hi}]，结果 ${p.after.slice(p.lo, p.hi + 1).join(' ')}`, `[${p.lo}..${p.hi}] → ${p.after.slice(p.lo, p.hi + 1).join(' ')}`),
      detail: T(
        `对区间 [${p.lo}..${p.hi}]（${p.before.slice(p.lo, p.hi + 1).join(' ')}）划分，枢轴 ${p.pivot}。${p.moves.length ? `low、high 交替填坑：${mv}（箭头上的数字是先后次序）。` : `high 一路左移都没遇到比 ${p.pivot} 小的，没有元素移动。`}两指针在位置 ${p.pos} 相遇，枢轴放在这里：左边 ${p.after.slice(p.lo, p.pos).join(' ') || '（空）'} 都不大于它，右边 ${p.after.slice(p.pos + 1, p.hi + 1).join(' ') || '（空）'} 都不小于它。和枢轴比较了 ${p.cmp} 次。`,
        `Partition [${p.lo}..${p.hi}] around ${p.pivot}. ${p.moves.length ? `Moves: ${mv}.` : 'Nothing moves.'} The pointers meet at ${p.pos}; ${p.cmp} comparisons.`,
      ),
      ref: 'partition',
      st: { k },
      facts: [[T('枢轴', 'Pivot'), String(p.pivot)], [T('落点', 'Final index'), String(p.pos)], [T('比较次数', 'Comparisons'), String(p.cmp)]],
      row: { color: 'amber', what: T(`第 ${k + 1} 次 [${p.lo}..${p.hi}]`, `#${k + 1} [${p.lo}..${p.hi}]`), result: p.after.join(' '), tone: 'info' },
    };
  });
  list.push({
    title: T('排序完成', 'Sorted'),
    desc: T(`共划分 ${sim.parts.length} 次`, `${sim.parts.length} partitions`),
    detail: T(`所有长度 ≥ 2 的区间都划分过了，剩下长度为 1 的区间自然有序。一共划分 ${sim.parts.length} 次，比较 ${sim.parts.reduce((a, p) => a + p.cmp, 0)} 次。${sim.parts.length === sim.input.length - 1 ? '每次枢轴都落在区间一端，这是最坏情况，比较次数是 O(n²) 级别。' : ''}`, `Every part of length ≥ 2 has been partitioned: ${sim.parts.length} partitions, ${sim.parts.reduce((a, p) => a + p.cmp, 0)} comparisons.`),
    ref: 'perf',
    st: { k: sim.parts.length - 1, done: true },
    row: { color: 'green', what: T('结果', 'Result'), result: sim.sorted.join(' '), tone: 'ok' },
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? { k: -1 } : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T(`划分 ${sim.parts.length} 次`, `${sim.parts.length} partitions`), text: T('试试「已经有序」那个预设：每次枢轴都落在最左边，划分次数达到 n − 1，这就是快排的最坏情况。', 'Try the sorted preset: the pivot always lands at the left end, giving n − 1 partitions, the worst case.'), facts: [[T('比较次数', 'Comparisons'), String(sim.parts.reduce((a, p) => a + p.cmp, 0))]] };
  return lesson;
}

export const makeQuicksort = () => parametric('quicksort', SPEC.presets[0].set, build);
