// 「堆与堆排序」这节课：上面是完全二叉树，下面是同一组元素的数组；每次交换，树上和数组里的两个方块同时换位。
import { HEAP_PRINCIPLE, heapRef } from './ds-principles.js';
import { boardKit, line, res, txt } from '../../core/board.js';
import { chip, node } from '../../core/steps.js';
import { L, T, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { simulate } from './heap.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const K = [53, 17, 78, 9, 45, 65, 87, 32];
const OPN = { build: T('筛选法建堆', 'Build by sifting down'), insert: T('逐个插入建堆', 'Build by insertion'), sort: T('堆排序', 'Heapsort') };
const KIND = { max: T('大根堆', 'Max-heap'), min: T('小根堆', 'Min-heap') };

const SPEC = {
  presets: [
    { label: T('筛选法建大根堆', 'Sift-down, max-heap'), set: { keys: K, kind: 'max', op: 'build' } },
    { label: T('筛选法建小根堆', 'Sift-down, min-heap'), set: { keys: K, kind: 'min', op: 'build' } },
    { label: T('逐个插入建堆', 'Insert one by one'), set: { keys: K, kind: 'max', op: 'insert' } },
    { label: T('堆排序', 'Heapsort'), set: { keys: K, kind: 'max', op: 'sort' } },
  ],
  groups: [
    {
      legend: T('参数', 'Parameters'),
      fields: [
        { name: 'op', label: T('操作', 'Operation'), type: 'select', options: Object.keys(OPN).map((k) => [k, OPN[k]]) },
        { name: 'kind', label: T('堆的类型', 'Heap type'), type: 'select', options: Object.keys(KIND).map((k) => [k, KIND[k]]) },
        { name: 'keys', label: T('关键字序列', 'Keys'), type: 'list', min: 0, max: 999, maxLen: 15, wide: true },
      ],
    },
  ],
  note: T(
    '数组下标从 1 开始，结点 i 的孩子是 2i 和 2i+1，双亲是 ⌊i/2⌋。比较次数：向下调整时，有两个孩子先比较两个孩子（1 次），再拿较大（小根堆为较小）的孩子和结点比（1 次）；只有一个孩子只比 1 次。向上调整每层和双亲比 1 次。',
    'Indices start at 1: node i has children 2i and 2i+1 and parent ⌊i/2⌋. Comparisons: sifting down, two children cost one comparison between them and one with the node; a single child costs one. Sifting up costs one comparison per level.',
  ),
};
const ERR = { keys: T('关键字要有 1～15 个', 'Give 1–15 keys') };

// ───────────────────────── 画板 ─────────────────────────

function geo(n) {
  const W = 620;
  const x0 = 80;
  const y0 = 150;
  const LV = 74;
  const depth = Math.floor(Math.log2(n));
  const pos = (i) => {
    const d = Math.floor(Math.log2(i));
    const k = i - 2 ** d;
    return [x0 + ((k + 0.5) * W) / 2 ** d, y0 + d * LV];
  };
  const arrY = y0 + depth * LV + 96;
  const AS = Math.min(54, (W + 60) / n);
  const ax = (i) => x0 + W / 2 - ((n - 1) * AS) / 2 + (i - 1) * AS;
  return { pos, arrY, ax, rect: [20, y0 - 60, x0 + W + 40, arrY + 54] };
}

const TONE = (sorted) => (sorted ? 'slate' : 'teal');

/** arr：1 起的元素数组；size：堆的大小（之后的是已排好序的）；hot：强调的下标 */
function boardAt(sim, arr, size, hot, z) {
  const g = geo(sim.n);
  const items = [];
  let edges = '';
  for (let i = 2; i <= size; i++) {
    const [x1, y1] = g.pos(Math.floor(i / 2));
    const [x2, y2] = g.pos(i);
    edges += line(x1, y1 - 10, x2, y2 - 10, 'bl-tree');
  }
  items.push({ k: 'edges', x: 0, y: 0, html: edges });
  items.push({ k: 'lab-arr', x: g.ax(1) - 30, y: g.arrY + 4, html: txt(0, 0, z ? '数组' : 'array', 'bt-cap', 'end') });
  for (let i = 1; i <= sim.n; i++) {
    items.push({ k: `slot-${i}`, x: g.ax(i), y: g.arrY, html: chip(34, 34, '', { cls: 'slot' }) + txt(0, 34, String(i), 'bt-idx') });
    const e = arr[i];
    if (!e) continue;
    const done = i > size;
    const h = hot.includes(i);
    const tone = done ? 'slate' : h ? 'amber' : 'teal';
    const [x, y] = g.pos(i);
    items.push({ k: `t-${e.id}`, x, y, o: done ? 0 : 1, cls: h ? 'is-cur' : '', html: node(e.key, { tone, dy: -10, r: 19, size: 13 }) });
    items.push({ k: `a-${e.id}`, x: g.ax(i), y: g.arrY - 3, cls: `${h ? 'is-cur' : ''} ${done ? 'is-done' : ''}`, html: `<g transform="translate(0 3)">${chip(28, 28, e.key, { tone: done ? 'green' : TONE(false), size: 12 })}</g>` });
  }
  if (size < sim.n) items.push({ k: 'lab-sorted', x: g.ax(size + 1) - 18, y: g.arrY + 62, html: txt(0, 0, z ? '有序区 →' : 'sorted →', 'bt-dim', 'start') });
  return items;
}

const swapped = (arr, [i, j]) => {
  const b = [...arr];
  [b[i], b[j]] = [b[j], b[i]];
  return b;
};

// ───────────────────────── 文案 ─────────────────────────

const keyAt = (arr, i) => arr[i].key;

function logText(sim, st, z) {
  const big = sim.kind === 'max';
  let arr = st.mid ?? st.prev;
  const parts = [];
  for (const l of st.log) {
    if (l.type === 'kids') parts.push(z ? `孩子 a[${l.l}]=${keyAt(arr, l.l)} 和 a[${l.r}]=${keyAt(arr, l.r)} 比较，${big ? '较大' : '较小'}的是 ${keyAt(arr, l.pick)}` : `children ${keyAt(arr, l.l)} and ${keyAt(arr, l.r)}: ${big ? 'larger' : 'smaller'} is ${keyAt(arr, l.pick)}`);
    if (l.type === 'vs') {
      parts.push(l.swap ? (z ? `${keyAt(arr, l.c)} ${big ? '>' : '<'} ${keyAt(arr, l.i)}，交换` : `${keyAt(arr, l.c)} ${big ? '>' : '<'} ${keyAt(arr, l.i)}: swap`) : z ? `${keyAt(arr, l.i)} 已经${big ? '不小于' : '不大于'} ${keyAt(arr, l.c)}，停止` : `${keyAt(arr, l.i)} already ${big ? '≥' : '≤'} ${keyAt(arr, l.c)}: stop`);
      if (l.swap) arr = swapped(arr, [l.i, l.c]);
    }
    if (l.type === 'up') {
      parts.push(l.swap ? (z ? `和双亲 a[${l.p}]=${keyAt(arr, l.p)} 比较，${keyAt(arr, l.i)} 更${big ? '大' : '小'}，交换` : `vs parent ${keyAt(arr, l.p)}: swap`) : z ? `和双亲 a[${l.p}]=${keyAt(arr, l.p)} 比较，不用换，停止` : `vs parent ${keyAt(arr, l.p)}: stop`);
      if (l.swap) arr = swapped(arr, [l.i, l.p]);
    }
  }
  if (!parts.length) return z ? '它是叶子 / 已经是根，不用调整' : 'nothing to compare';
  return parts.join(z ? '；' : '; ');
}

function stepText(sim, st, z) {
  const n = sim.n;
  if (st.type === 'tree') return z ? `把关键字序列按层序放进一棵完全二叉树（数组下标从 1 开始，a[i] 的孩子是 a[2i]、a[2i+1]）。叶子天然是堆；最后一个非叶结点是 a[⌊${n}/2⌋] = a[${Math.floor(n / 2)}]，从它开始往前逐个向下调整。` : `Lay the keys out level by level as a complete binary tree (indices from 1; a[i]'s children are a[2i], a[2i+1]). Leaves are already heaps; sift down from the last internal node a[⌊${n}/2⌋] = a[${Math.floor(n / 2)}] back to the root.`;
  if (st.type === 'sift') return (z ? `调整以 a[${st.i}] = ${st.key} 为根的子树：` : `Sift down a[${st.i}] = ${st.key}: `) + logText(sim, st, z) + (z ? `。比较 ${st.cmp} 次，累计 ${st.total} 次。` : `. ${st.cmp} comparison(s), ${st.total} so far.`);
  if (st.type === 'insert') return (z ? `插入 ${st.key}：先放在末尾 a[${st.at}]，再向上调整：` : `Insert ${st.key} at the end, a[${st.at}], then sift up: `) + logText(sim, st, z) + (z ? `。比较 ${st.cmp} 次，累计 ${st.total} 次。` : `. ${st.cmp} comparison(s), ${st.total} so far.`);
  return (z ? `堆顶 ${st.out} 是当前${sim.kind === 'max' ? '最大' : '最小'}的，和末尾 a[${st.last}] 交换，它就排好了位置；剩下 ${st.size} 个元素从根向下调整：` : `The root ${st.out} is the current ${sim.kind === 'max' ? 'maximum' : 'minimum'}; swap it with a[${st.last}] so it is in place, then sift the remaining ${st.size} down from the root: `) + logText(sim, st, z) + (z ? `。` : '.');
}

function stepTitle(sim, st) {
  if (st.type === 'tree') return T('看成完全二叉树', 'View it as a complete binary tree');
  if (st.type === 'sift') return T(`调整 a[${st.i}] = ${st.key}`, `Sift down a[${st.i}] = ${st.key}`);
  if (st.type === 'insert') return T(`插入 ${st.key}`, `Insert ${st.key}`);
  return T(`输出堆顶 ${st.out}`, `Take the root ${st.out}`);
}

function decode(ev) {
  const { sim, st } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  return {
    label: T('堆调整解析', 'Heap decoder'),
    tag: { color: 'teal', text: KIND[sim.kind] },
    title: L(stepTitle(sim, st)),
    meta: [
      [T('本步比较', 'Comparisons'), String(st.cmp)],
      [T('累计比较', 'Total'), String(st.total)],
    ],
    hint: '',
    view: { kind: 'none' },
    layers: [
      { name: T('过程', 'Process'), summary: '', start: 0, end: 0, open: true, fields: [info(T('说明', 'Notes'), both((z) => stepText(sim, st, z)), { note: true })] },
      { name: T('调整后的数组', 'Array after'), summary: '', start: 0, end: 0, open: true, fields: [info('a[1..n]', st.arr.slice(1).map((e, i) => (i + 1 > st.size ? `[${e.key}]` : e.key)).join(' '))] },
    ],
  };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok || !snap) return '';
  const z = getLang() === 'zh';
  const arr = snap.arr;
  const rows = [
    { cells: [z ? '下标' : 'i', ...arr.slice(1).map((_, i) => i + 1)] },
    { cls: 'row-ref', cells: [z ? '关键字' : 'key', ...arr.slice(1).map((e, i) => (i + 1 > snap.size ? `<span class="dim">${e.key}</span>` : e.key))] },
  ];
  return `<div class="ms ms-wide">${card(T('数组表示', 'Array'), T(`累计比较 ${snap.total} 次`, `${snap.total} comparisons so far`), table(['', ...arr.slice(1).map(() => '')], rows), 'ms-grid is-focus')}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('调整记录', 'Steps'),
  stateName: T('数组', 'Array'),
  emptyRows: T('按「播放」或「单步」，每次调整都会记在这里。', 'Press Play or Step; every adjustment is logged here.'),
  cols: [
    { label: T('序号', 'No.'), cls: 'col-no' },
    { label: T('操作', 'Step'), cls: 'col-op' },
    { label: T('比较', 'Cmp'), cls: 'col-res' },
    { label: T('调整后', 'Array after'), cls: 'col-info' },
  ],
  cells: (ev, idx) => [`<i class="dot"></i>${idx + 1}`, L(stepTitle(ev.sim, ev.st)), res(ev.st.cmp ? 'info' : 'ok', String(ev.st.cmp)), ev.st.arr.slice(1).map((e, i) => (i + 1 > ev.st.size ? `[${e.key}]` : e.key)).join(' ')],
  decode,
  renderState,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'heap',
    kit,
    where: [['ds', 'sort']],
    principle: HEAP_PRINCIPLE,
    tag: T('堆', 'Heap'),
    name: T('堆与堆排序', 'Heaps and heapsort'),
    full: T('筛选法建堆 · 插入 · 堆排序 · 比较次数', 'Sift-down build · insertion · heapsort · comparisons'),
    title: T(`${OPN[params.op]?.zh ?? ''} · ${KIND[params.kind]?.zh ?? ''}`, `${OPN[params.op]?.en ?? ''} · ${KIND[params.kind]?.en ?? ''}`),
    badge: KIND[params.kind] ?? '',
    nodes: [],
    legend: [
      ['teal', T('堆中元素', 'In heap')],
      ['amber', T('正在调整', 'Adjusting')],
      ['green', T('已排好', 'Sorted')],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '堆是一棵完全二叉树，每个结点都不小于（小根堆：不大于）它的孩子，所以堆顶就是最大（最小）值。它用数组存，不需要指针。建堆、插入、删除堆顶都是沿着一条路径做比较和交换，下面可以看到树和数组同时在变。',
        'A heap is a complete binary tree where every node is at least (min-heap: at most) its children, so the root is the maximum (minimum). It lives in an array with no pointers. Building, inserting and removing the root all compare and swap along one path; the tree and the array change together below.',
      ),
      facts: sim.ok
        ? [
            [T('操作', 'Operation'), OPN[sim.op]],
            [T('关键字', 'Keys'), sim.keys.join(' ')],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim.n).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const boardEv = (arr, size, hot) => ({ type: 'board', items: boardAt(sim, arr, size, hot, true), itemsEn: boardAt(sim, arr, size, hot, false), ms: 520 });
  const first = sim.op === 'insert' ? [null] : sim.steps[0].arr;
  lesson.start.events = [boardEv(first, sim.op === 'insert' ? 0 : sim.n, []), { type: 'snap', snap: { arr: sim.op === 'insert' ? [null, ...sim.keys.map((key, id) => ({ id, key }))] : first, size: sim.op === 'insert' ? 0 : sim.n, total: 0 } }];
  lesson.steps = sim.steps.map((st) => {
    const evs = [];
    if (st.type === 'tree') evs.push(boardEv(st.arr, st.size, []));
    else {
      // 逐次交换做成几段动画
      let arr = st.mid ?? st.prev;
      const size = st.size;
      if (st.mid) evs.push(boardEv(st.prev, st.size + 1, [1, st.last]), boardEv(st.mid, size, [1]));
      else evs.push(boardEv(arr, size, [st.type === 'insert' ? st.at : st.i]));
      for (const sw of st.swaps) {
        arr = swapped(arr, sw);
        evs.push(boardEv(arr, size, [sw[1]]));
      }
      evs.push(boardEv(st.arr, size, []));
    }
    evs.push({ type: 'row', color: st.swaps.length ? 'amber' : 'teal', sim, st }, { type: 'snap', snap: { arr: st.arr, size: st.size, total: st.total } });
    return {
      title: stepTitle(sim, st),
      desc: T(`比较 ${st.cmp} 次，累计 ${st.total}`, `${st.cmp} comparison(s), ${st.total} total`),
      detail: both((z) => stepText(sim, st, z)),
      facts: [[T('调整后', 'Array'), st.arr.slice(1).map((e, i) => (i + 1 > st.size ? `[${e.key}]` : e.key)).join(' ')]],
      events: evs,
    };
  });
  const result = sim.op === 'sort' ? sim.sorted : sim.heap;
  lesson.outro = {
    title: sim.op === 'sort' ? T('排序完成', 'Sorted') : T('堆建好了', 'Heap built'),
    text: T(
      '筛选法建堆从最后一个非叶结点往前调整，总时间是 O(n)；逐个插入建堆是 O(n log n)，两种方法得到的堆可能不一样（比较一下两个预设的结果）。堆排序每趟把堆顶换到末尾，共 n−1 趟，时间 O(n log n)，不稳定。',
      'Building by sifting down from the last internal node takes O(n); inserting one by one takes O(n log n), and the two can give different heaps (compare the presets). Heapsort moves the root to the end n−1 times: O(n log n), not stable.',
    ),
    facts: [
      [sim.op === 'sort' ? T('排序结果', 'Sorted') : T('堆（数组）', 'Heap (array)'), result.join(' ')],
      [T('关键字比较次数', 'Comparisons'), String(sim.total)],
    ],
  };
  lesson.steps.forEach((s, i, all) => (s.ref ??= heapRef(sim.op)(s, i, all)));
  return lesson;
}

export const makeHeap = () => parametric('heap', DEFAULTS, build);
