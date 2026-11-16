// 「计数排序与内部排序对比」：三排格子——原数组 A、计数数组 C、输出数组 B。
// 统计时 A 的元素「投」进 C 的格子；求前缀和以后，C[x] 就是 x 在 B 里最后一个位置的下一格；
// 从后往前放回，相同的关键字（用下角标 a、b 区分）保持原来的先后次序——稳定性看得见。
// 最后一步把所有内部排序摆成一张对比表。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from './graph.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { countingSort } from './csort.js';

const W = [['ds', 'sort']];
const CW = 46;
const X0 = 140;
const AY = 150;
const CY = 290;
const BY = 430;
const TONES = ['blue', 'violet', 'teal', 'amber', 'rose', 'green', 'orange', 'slate'];

/** 所有内部排序的对比，最后一步画成表格，原理页里也用这份数据 */
const SORTS = [
  [T('直接插入', 'Insertion'), 'O(n²)', 'O(n)', 'O(n²)', 'O(1)', true, true],
  [T('希尔排序', 'Shell'), T('约 O(n^1.3)', '≈ O(n^1.3)'), '—', 'O(n²)', 'O(1)', false, false],
  [T('冒泡排序', 'Bubble'), 'O(n²)', 'O(n)', 'O(n²)', 'O(1)', true, true],
  [T('快速排序', 'Quicksort'), 'O(n log n)', 'O(n log n)', 'O(n²)', 'O(log n)', false, false],
  [T('简单选择', 'Selection'), 'O(n²)', 'O(n²)', 'O(n²)', 'O(1)', false, true],
  [T('堆排序', 'Heapsort'), 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(1)', false, false],
  [T('2 路归并', 'Merge sort'), 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n)', true, true],
  [T('基数排序', 'Radix'), 'O(d(n + r))', 'O(d(n + r))', 'O(d(n + r))', 'O(r)', true, true],
  [T('计数排序', 'Counting'), 'O(n + k)', 'O(n + k)', 'O(n + k)', 'O(n + k)', true, false],
];
const yes = (b) => (b ? '✓' : '✗');

const PRINCIPLE = {
  sections: [
    {
      id: 'idea',
      title: T('计数排序：不比较，直接数', 'Counting sort: count, don’t compare'),
      blocks: [
        { p: T('前面的排序都靠「比较两个关键字」决定先后，最快也只能到 O(n log n)。计数排序不比较：关键字是 0～k 的整数时，数一数每个值出现了几次，就知道它在结果里该放在哪。', 'Comparison sorts cannot beat O(n log n). When keys are integers 0–k, counting how often each value occurs tells where it goes.') },
        { steps: [
          T('**统计**：扫描 A，C[x] 记下值 x 出现的次数；', '**Count**: C[x] = how many times x occurs;'),
          T('**前缀和**：C[x] += C[x − 1]，现在 C[x] 是「不大于 x 的元素个数」，也就是 x 在结果里最后一个位置的下一格；', '**Prefix sums**: C[x] becomes the number of elements ≤ x;'),
          T('**放回**：**从后往前**扫描 A，把 A[i] 放到 B[C[A[i]] − 1]，再把 C[A[i]] 减 1。', '**Place**: scan A **backwards**, put A[i] at B[C[A[i]] − 1] and decrement.'),
        ] },
        { formula: T('时间 O(n + k)，空间 O(n + k)（计数数组 + 输出数组）', 'time O(n + k), space O(n + k)') },
      ],
    },
    {
      id: 'stable',
      title: T('为什么要从后往前放', 'Why place from the back'),
      blocks: [
        { p: T('从后往前扫时，值相同的元素里最后出现的那个先放，放在这一段的最后一格；前面出现的依次放在它前面。于是相同关键字的先后次序和原来一样——计数排序是**稳定**的。如果从前往后扫、却仍然从段尾放，相同元素的次序就会反过来。', 'Scanning backwards places the last equal key at the end of its block, keeping equal keys in order: the sort is **stable**.') },
        { tip: T('稳定性正是基数排序要用到的：基数排序每一趟按一位排序，常用的就是计数排序（或者分配—收集），必须稳定，前一趟的结果才不会被打乱。', 'Radix sort relies on a stable per-digit sort, often counting sort.') },
      ],
    },
    {
      id: 'when',
      title: T('什么时候适合用', 'When to use it'),
      blocks: [
        { list: [
          T('关键字是整数（或能映射成小范围整数），而且范围 k 不太大：k 和 n 同一个量级时，O(n + k) 就是线性时间；', 'Integer keys with a modest range k ≈ n;'),
          T('k 远大于 n 时（比如对几个 32 位整数排序），计数数组太大，反而不划算；', 'A huge range makes the count array wasteful;'),
          T('只能用于顺序存储，链表不方便直接按下标放回。', 'Needs random access, not linked lists.'),
        ] },
      ],
    },
    {
      id: 'compare',
      title: T('内部排序对比', 'Comparing internal sorts'),
      blocks: [
        {
          table: {
            head: [T('排序', 'Sort'), T('平均', 'Average'), T('最好', 'Best'), T('最坏', 'Worst'), T('辅助空间', 'Space'), T('稳定', 'Stable'), T('适合链表', 'Linked list')],
            rows: SORTS.map(([n, a, b, w, s, st, l]) => [n, a, b, w, s, yes(st), yes(l)]),
          },
        },
        { list: [
          T('**外部排序**几乎都用归并：数据在外存，只能一段段读进来，归并正好适合顺序读写。', '**External sorting** uses merging: it reads and writes sequentially.'),
          T('**每一趟都能确定一个元素最终位置**的：冒泡、简单选择、快速（枢轴）、堆排序；插入、希尔、归并不能。', 'Bubble, selection, quicksort and heapsort fix one element per pass; insertion, Shell and merge do not.'),
          T('**比较次数和初始顺序无关**的：简单选择、堆排序（近似）、归并（近似）、基数和计数不比较。', 'Selection’s comparisons ignore the initial order.'),
          T('**元素基本有序**时：直接插入、冒泡接近 O(n)；快速排序反而退化成 O(n²)。', 'Nearly sorted input: insertion and bubble are near O(n); quicksort degrades.'),
        ] },
      ],
    },
    pit([
      T('计数排序是稳定的，前提是放回时从后往前扫。', 'Counting sort is stable only when placing from the back.'),
      T('计数排序的空间是 O(n + k)，不是 O(1)。', 'Its space is O(n + k), not O(1).'),
      T('基数排序的 r 是基数（每一位可能的取值个数），d 是位数。', 'In radix sort r is the base and d the number of digits.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('有重复的关键字', 'With duplicates'), set: { a: [3, 1, 4, 1, 2, 3, 0, 3] } },
    { label: T('范围很小', 'Tiny range'), set: { a: [2, 0, 2, 1, 1, 0, 2] } },
  ],
  groups: [{ legend: T('待排序的关键字', 'Keys'), fields: [{ name: 'a', label: T('0～12 的整数，最多 14 个', 'Integers 0–12, up to 14'), type: 'list', min: 0, max: 12, maxLen: 14, wide: true }] }],
  note: T('计数数组 C 的下标是 0～k（k 是最大的关键字），输出数组 B 的下标从 0 开始。相同的关键字用下角标 a、b、c 区分先后。', 'C is indexed 0–k; B starts at 0. Equal keys get subscripts a, b, c to show their order.'),
};
const ERR = { n: T('要有 1～14 个关键字', 'Give 1–14 keys'), range: T('关键字要是 0～12 的整数', 'Keys must be integers 0–12') };

/** 相同关键字的下角标：第一次出现 a，第二次 b…… */
const subOf = (a) => {
  const seen = {};
  return a.map((x) => {
    const n = (seen[x] = (seen[x] ?? 0) + 1);
    return a.filter((y) => y === x).length > 1 ? 'abcdefghijklmn'[n - 1] : '';
  });
};

function board(sim, st, z) {
  const items = [];
  const sub = subOf(sim.a);
  const lab = (i) => `${sim.a[i]}${sub[i]}`;
  const phase = st?.phase;
  if (phase === 'table') {
    const rows = SORTS.map(([n, a, b, w, s, stb, l], i) => [{ t: z ? n.zh : n.en, cls: i === SORTS.length - 1 ? 'hot' : '' }, a.zh ? (z ? a.zh : a.en) : a, b, w, s, { t: yes(stb), cls: stb ? 'ok' : 'dim' }, { t: yes(l), cls: l ? 'ok' : 'dim' }]);
    items.push({ k: 'tbl', x: 70, y: 120, html: gridTable([z ? '排序' : 'Sort', z ? '平均' : 'Avg', z ? '最好' : 'Best', z ? '最坏' : 'Worst', z ? '空间' : 'Space', z ? '稳定' : 'Stable', z ? '链表' : 'List'], rows, { cw: [100, 110, 110, 110, 90, 54, 54], rh: 34 }) });
    return items;
  }
  // A
  const curI = phase === 'count' ? st.i : phase === 'fill' ? sim.fill[st.j].i : -1;
  let a = txt(-14, 24, 'A', 'bt-lab', 'end');
  sim.a.forEach((x, i) => (a += `<g transform="translate(${i * CW} 0)">${cell(CW - 6, 36, lab(i), { tone: TONES[x % 8], size: 14, cls: i === curI ? 'hot' : phase === 'fill' && sim.fill.slice(0, st.j).some((f) => f.i === i) ? 'dim' : '' })}${txt((CW - 6) / 2, -8, String(i), 'bt-idx')}</g>`));
  items.push({ k: 'A', x: X0, y: AY, html: a });
  // C
  const C = !phase ? sim.cnt.map(() => 0) : phase === 'count' ? sim.count[st.i].C : phase === 'prefix' ? sim.prefix : sim.fill[st.j].C;
  const hotV = phase === 'count' ? sim.a[st.i] : phase === 'fill' ? sim.fill[st.j].x : -1;
  let c = txt(-14, 24, 'C', 'bt-lab', 'end');
  C.forEach((v, x) => (c += `<g transform="translate(${x * CW} 0)">${cell(CW - 6, 36, String(v), { tone: phase === 'prefix' ? 'violet' : '', size: 14, cls: x === hotV ? 'hot' : v ? '' : 'dim' })}${txt((CW - 6) / 2, -8, String(x), 'bt-idx')}</g>`));
  items.push({ k: 'C', x: X0, y: CY, html: c + txt(-14, -8, z ? '值' : 'value', 'bt-idx', 'end') });
  // B
  const B = phase === 'fill' ? sim.fill[st.j].B : sim.a.map(() => null);
  const pos = phase === 'fill' ? sim.fill[st.j].pos : -1;
  let b = txt(-14, 24, 'B', 'bt-lab', 'end');
  B.forEach((i, p) => (b += `<g transform="translate(${p * CW} 0)">${cell(CW - 6, 36, i == null ? '' : lab(i), { tone: i == null ? '' : TONES[sim.a[i] % 8], size: 14, cls: p === pos ? 'hot' : i == null ? 'dim' : '' })}${txt((CW - 6) / 2, 52, String(p), 'bt-idx')}</g>`));
  items.push({ k: 'B', x: X0, y: BY, html: b });
  // 箭头
  let h = '';
  if (phase === 'count') h += arrow(X0 + st.i * CW + 20, AY + 40, X0 + sim.a[st.i] * CW + 20, CY - 18, 'acc');
  if (phase === 'fill') {
    const f = sim.fill[st.j];
    h += arrow(X0 + f.i * CW + 20, AY + 40, X0 + f.pos * CW + 20, BY - 4, 'acc');
    h += txt(X0 + f.x * CW + 20, CY + 58, `−1`, 'cs-dec');
  }
  if (phase === 'prefix') h += txt(X0, CY + 66, z ? '前缀和：C[x] = 不大于 x 的元素个数' : 'prefix sums: C[x] = number of elements ≤ x', 'bt-cap', 'start');
  items.push({ k: 'arr', x: 0, y: 0, html: h });
  return items;
}

function build(p, kit, ERR) {
  const sim = countingSort(p.a);
  const lesson = shell('counting-sort', kit, ERR, sim, {
    where: W,
    tag: T('计数', 'Count'),
    name: T('计数排序与内部排序对比', 'Counting sort and comparing sorts'),
    full: T('统计 · 前缀和 · 从后往前放回 · 稳定性 · 和基数排序的关系 · 各排序的复杂度和稳定性', 'Count · prefix sums · place from the back · stability · radix sort · comparison'),
    title: T(`${p.a?.length ?? 0} 个关键字`, `${p.a?.length ?? 0} keys`),
    legend: [['violet', T('前缀和', 'Prefix sums')]],
    principle: PRINCIPLE,
    desc: T('计数排序不比较关键字：先数每个值出现几次，再求前缀和算出每个值该放的位置，最后从后往前把元素放回去。相同的关键字用下角标 a、b 标出来，能看到它们放回后先后次序不变。最后一步把所有内部排序放在一张表里对比。', 'Counting sort counts instead of comparing. Equal keys carry subscripts so you can see their order survive. The last step compares every internal sort.'),
    rect: [40, 90, X0 + Math.max(14, 13) * CW + 40, BY + 80],
  });
  if (!sim.ok) return lesson;
  const sub = subOf(sim.a);
  const lab = (i) => `${sim.a[i]}${sub[i]}`;
  const list = [];
  sim.count.forEach((c, i) => list.push({ title: T(`统计 A[${i}] = ${c.x}`, `Count A[${i}] = ${c.x}`), desc: `C[${c.x}] = ${c.C[c.x]}`, detail: T(`A[${i}] 是 ${c.x}，C[${c.x}] 加 1，变成 ${c.C[c.x]}。`, `C[${c.x}] becomes ${c.C[c.x]}.`), ref: 'idea', st: { phase: 'count', i }, row: { color: 'blue', what: `A[${i}]`, result: `C[${c.x}]=${c.C[c.x]}`, tone: 'info' } }));
  list.push({ title: T('求前缀和', 'Prefix sums'), desc: sim.prefix.join(' '), detail: T(`从 C[1] 起，每一格加上前一格：C = ${sim.prefix.join(' ')}。现在 C[x] 表示不大于 x 的元素有几个，比如 C[${sim.k}] = ${sim.prefix[sim.k]} 就是全部元素个数。`, `C = ${sim.prefix.join(' ')}.`), ref: 'idea', st: { phase: 'prefix' }, row: { color: 'violet', what: T('前缀和', 'Prefix'), result: sim.prefix.join(' '), tone: 'info' } });
  sim.fill.forEach((f, j) => list.push({ title: T(`放回 A[${f.i}] = ${lab(f.i)} → B[${f.pos}]`, `A[${f.i}] = ${lab(f.i)} → B[${f.pos}]`), desc: T(`C[${f.x}] 减成 ${f.C[f.x]}`, `C[${f.x}] → ${f.C[f.x]}`), detail: T(`从后往前第 ${j + 1} 个是 A[${f.i}] = ${lab(f.i)}。C[${f.x}] = ${f.C[f.x] + 1}，放到 B[${f.C[f.x] + 1} − 1] = B[${f.pos}]，C[${f.x}] 减成 ${f.C[f.x]}。${sub[f.i] ? `值为 ${f.x} 的元素里它是后出现的，所以放在同值那一段里靠后的位置。` : ''}`, `Place at B[${f.pos}] and decrement C[${f.x}].`), ref: 'stable', st: { phase: 'fill', j }, row: { color: 'teal', what: lab(f.i), result: `B[${f.pos}]`, tone: 'info' } }));
  list.push({ title: T('和其他内部排序比一比', 'Compared with the others'), desc: T('时间、空间、稳定性', 'Time, space, stability'), detail: T(`排好了：${sim.order.map(lab).join(' ')}，相同的关键字 a 在 b 前面，次序没有变。计数排序是 O(n + k) 的稳定排序，但要额外的 O(n + k) 空间，而且只适合范围不大的整数。`, `Sorted: ${sim.order.map(lab).join(' ')}; equal keys keep their order.`), ref: 'compare', st: { phase: 'table' }, row: { color: 'green', what: T('对比', 'Compare'), result: 'O(n + k)', tone: 'ok' } });
  return finish(lesson, list, (st, z) => board(sim, st, z), T(`排好了：${sim.order.map(lab).join(' ')}`, `Sorted: ${sim.order.map(lab).join(' ')}`), T('把关键字改成有更多重复的，看下角标的先后有没有变。', 'Add more duplicates and check their subscripts stay in order.'));
}

export const makeCountingSort = make('counting-sort', SPEC, ERR, build);
