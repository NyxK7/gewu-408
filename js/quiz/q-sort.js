// 排序的选择题（真题里考得最多的考点）：某一趟的结果、从结果认算法、快排第二趟、递归深度、划分是否均衡、
// 删除堆顶、比较次数、趟数。答案都由排序课的计算代码（sorts.js、qsort.js、heap 课）算出。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { quicksort } from '../subjects/ds/qsort.js';
import { passes } from '../subjects/ds/sorts.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const ALG = {
  insert: T('直接插入排序', 'insertion sort'),
  binsert: T('折半插入排序', 'binary insertion sort'),
  shell: T('希尔排序', 'Shell sort'),
  bubble: T('冒泡排序', 'bubble sort'),
  select: T('简单选择排序', 'selection sort'),
  merge: T('二路归并排序', 'merge sort'),
  radix: T('基数排序', 'radix sort'),
};
const HOW = {
  insert: T('把下一个元素插到前面有序部分的合适位置', 'insert the next element into the sorted prefix'),
  shell: T('按增量 ⌊n/2⌋、⌊n/4⌋…… 分组，组内做直接插入', 'insertion sort within groups of gap ⌊n/2⌋, ⌊n/4⌋, …'),
  bubble: T('从后往前两两比较，把最小的冒到最前面', 'compare from the back, bubbling the minimum to the front'),
  select: T('从未排序部分选出最小的，和未排序部分的第一个交换', 'swap the minimum of the unsorted part to its front'),
  merge: T('相邻的有序段两两归并，段长每趟翻倍', 'merge neighbouring runs; run length doubles'),
  radix: T('从个位起按一位分配到 10 个队列再收集', 'distribute by one digit (from the units) and collect'),
};
const CONV = T('都排成递增。冒泡从后往前冒；希尔增量取 ⌊n/2⌋、⌊n/4⌋……直到 1；二路归并自底向上；基数排序从个位起。', 'Ascending. Bubble from the back; Shell gaps ⌊n/2⌋, ⌊n/4⌋, …, 1; bottom-up merge; radix from the units digit.');
const seq = (a) => a.join(' ');
const same = (a, b) => a.join() === b.join();

// ───── 快速排序：第二趟、到位的元素 ─────
/** 只做完第 0、1 层划分后的序列（第二趟结束） */
function afterTwo(keys) {
  const s = quicksort(keys);
  const a = [...keys];
  for (const p of [...s.parts].filter((x) => x.depth <= 1).sort((x, y) => x.depth - y.depth)) a.splice(p.lo, p.hi - p.lo + 1, ...p.after.slice(p.lo, p.hi + 1)); // after 是整个数组的快照，只取这次划分的区间
  return a;
}
/** 已经在最终位置上的下标：左边都比它小、右边都比它大 */
const fixedOf = (a) => a.map((x, i) => (a.slice(0, i).every((y) => y < x) && a.slice(i + 1).every((y) => y > x) ? i : -1)).filter((i) => i >= 0);
/** 能不能是第二趟的结果：有一个到位的元素 p，它左右两边要么长度不超过 1，要么里面也有到位的元素 */
function canBeSecond(a) {
  const fx = fixedOf(a);
  const ok = (lo, hi) => hi - lo + 1 <= 1 || fx.some((i) => i >= lo && i <= hi);
  return fx.some((p) => ok(0, p - 1) && ok(p + 1, a.length - 1));
}

export const SORT_QUESTIONS = [
  {
    id: 'ds-sp-01',
    subject: 'ds',
    chapter: 'sort',
    topic: T('排序某一趟的结果', 'The result of one pass'),
    type: 'single',
    difficulty: 2,
    lessons: ['sort-passes'],
    tags: ['过程推演'],
    conv: CONV,
    make(r) {
      for (;;) {
        const keys = r.distinct(8, 10, 99);
        const algo = r.pick(['insert', 'bubble', 'select', 'shell', 'merge', 'radix']);
        const all = Object.fromEntries(['insert', 'bubble', 'select', 'shell', 'merge', 'radix'].map((a) => [a, passes({ keys, algo: a }).passes]));
        const k = r.int(1, Math.min(3, all[algo].length));
        const right = all[algo][k - 1].a;
        const wrongs = [];
        for (const [a, ps] of Object.entries(all)) {
          const x = ps[Math.min(k, ps.length) - 1]?.a;
          if (a !== algo && x && !same(x, right) && !wrongs.some((w) => same(w, x))) wrongs.push(x);
        }
        if (wrongs.length < 3) continue;
        const { options, answer } = shuffled(r, seq(right), r.shuffle(wrongs).slice(0, 3).map(seq));
        const params = { algo, keys };
        const l = L('sort-passes', params);
        return {
          question: T(`对关键字序列 ${seq(keys)} 进行${ALG[algo].zh}，第 ${k} 趟结束后的序列是？`, `Apply ${ALG[algo].en} to ${seq(keys)}. What is the sequence after pass ${k}?`),
          options,
          answer,
          steps: [
            { text: T(`${ALG[algo].zh}每一趟：${HOW[algo].zh}。`, `Each pass: ${HOW[algo].en}.`), go: { lesson: 'sort-passes', doc: algo === 'merge' || algo === 'radix' ? 'merge' : algo === 'insert' || algo === 'shell' ? 'insert' : algo === 'bubble' ? 'swap' : 'select' } },
            { text: T(`逐趟写出：${all[algo].slice(0, k).map((p, i) => `第 ${i + 1} 趟 ${seq(p.a)}`).join('；')}。`, all[algo].slice(0, k).map((p, i) => `pass ${i + 1}: ${seq(p.a)}`).join('; ')), go: { lesson: 'sort-passes', params, step: Math.min(k - 1, last(l)) } },
            { text: T('其余选项分别是别的排序算法同一趟的结果，可以对照着看各算法一趟做了什么。', 'The other options are other algorithms after the same number of passes.') },
          ],
        };
      }
    },
  },
  {
    id: 'ds-sp-02',
    subject: 'ds',
    chapter: 'sort',
    topic: T('从中间结果认排序算法', 'Recognising a sort from its passes'),
    type: 'single',
    difficulty: 2,
    lessons: ['sort-passes'],
    tags: ['过程推演'],
    conv: CONV,
    make(r) {
      const pool = ['insert', 'bubble', 'select', 'shell', 'merge'];
      for (;;) {
        const keys = r.distinct(8, 10, 99);
        const algo = r.pick(pool);
        const k = r.int(1, 2);
        const at = (a) => passes({ keys, algo: a }).passes[k - 1]?.a;
        const right = at(algo);
        if (!right) continue;
        const others = pool.filter((a) => a !== algo && at(a) && !same(at(a), right));
        if (others.length < 3) continue;
        const pick = r.shuffle(others).slice(0, 3);
        const { options, answer } = shuffled(r, ALG[algo], pick.map((a) => ALG[a]));
        const params = { algo, keys };
        return {
          question: T(`对 ${seq(keys)} 用某种排序方法排成递增，第 ${k} 趟结束后得到 ${seq(right)}。用的是哪种排序方法？`, `Sorting ${seq(keys)} ascending gives ${seq(right)} after pass ${k}. Which method?`),
          options,
          answer,
          steps: [
            { text: T(`按${ALG[algo].zh}的做法（${HOW[algo].zh}）走 ${k} 趟，正好得到 ${seq(right)}。`, `${ALG[algo].en} gives exactly this after ${k} pass(es).`), go: { lesson: 'sort-passes', params, step: k - 1 } },
            { text: T(`对照其他选项：${pick.map((a) => `${ALG[a].zh}第 ${k} 趟是 ${seq(at(a))}`).join('；')}，都对不上。`, pick.map((a) => `${ALG[a].en}: ${seq(at(a))}`).join('; ')), go: { lesson: 'sort-passes', doc: 'choose' } },
          ],
        };
      }
    },
  },
  {
    id: 'ds-qs-02',
    subject: 'ds',
    chapter: 'sort',
    topic: T('快速排序第二趟的结果', 'After two quicksort passes'),
    type: 'single',
    difficulty: 3,
    lessons: ['quicksort'],
    tags: ['易错点'],
    conv: T('「一趟」指对当前所有待排子序列各做一次划分。', 'One pass partitions every pending subsequence once.'),
    make(r) {
      for (;;) {
        const keys = r.distinct(8, 1, 40).sort((a, b) => a - b);
        const good = [];
        for (let t = 0; t < 40 && good.length < 3; t++) {
          const s = afterTwo(r.shuffle(keys));
          if (!good.some((g) => same(g, s)) && !same(s, keys)) good.push(s);
        }
        if (good.length < 3 || !good.every(canBeSecond)) continue;
        let bad = null;
        for (let t = 0; t < 200 && !bad; t++) {
          const c = r.shuffle(keys);
          if (!canBeSecond(c) && fixedOf(c).length >= 1) bad = c;
        }
        if (!bad) continue;
        const { options, answer } = shuffled(r, seq(bad), good.map(seq));
        const fb = fixedOf(bad).map((i) => bad[i]);
        return {
          question: T(`下列序列中，不可能是快速排序第二趟结束后结果的是：`, 'Which sequence cannot be the result after the second quicksort pass?'),
          options,
          answer,
          steps: [
            { text: T('每做一次划分，枢轴就落到最终位置：它左边的都比它小、右边的都比它大。第一趟定下 1 个；第二趟对它两边各划分一次，又定下 1～2 个。', 'Each partition fixes its pivot. Pass 1 fixes one; pass 2 fixes one more on each non-trivial side.'), go: { lesson: 'quicksort', doc: 'partition' } },
            { text: T('所以第二趟后至少有 2 个元素到位；而且如果第一趟的枢轴不在两端，它两边都要再划分，至少有 3 个到位。', 'So at least 2 are fixed, and 3 unless the first pivot sits at an end.'), go: { lesson: 'quicksort', doc: 'perf' } },
            { text: T(`逐个检查到位的元素：${options.map((o, i) => `${'ABCD'[i]} 中到位的有 ${fixedOf(o.split(' ').map(Number)).map((j) => o.split(' ')[j]).join('、') || '没有'}`).join('；')}。${seq(bad)} 只有 ${fb.join('、')} 到位，不满足条件。`, `Fixed elements per option; ${seq(bad)} fails.`) },
          ],
        };
      }
    },
  },
  {
    id: 'ds-qs-03',
    subject: 'ds',
    chapter: 'sort',
    topic: T('快速排序的递归深度', 'Quicksort recursion depth'),
    type: 'number',
    difficulty: 2,
    lessons: ['quicksort'],
    tags: ['过程推演'],
    conv: T('取区间第一个元素为枢轴；第一次划分算第 1 层，长度不超过 1 的区间不再递归。', 'First element as pivot; the first partition is level 1; ranges of length ≤ 1 stop.'),
    make(r) {
      const keys = r.distinct(r.int(7, 9), 10, 99);
      const s = quicksort(keys);
      const depth = Math.max(...s.parts.map((p) => p.depth)) + 1;
      const byLv = Array.from({ length: depth }, (_, d) => s.parts.filter((p) => p.depth === d).map((p) => p.pivot));
      const params = { keys };
      return {
        question: T(`对 ${seq(keys)} 进行快速排序，递归调用（做划分）最深到第几层？`, `Quicksort ${seq(keys)}: how many levels deep does the recursion go?`),
        answer: { value: depth },
        steps: [
          { text: T(`逐层看各次划分的枢轴：${byLv.map((v, d) => `第 ${d + 1} 层 ${v.join('、')}`).join('；')}。`, byLv.map((v, d) => `level ${d + 1}: ${v.join(', ')}`).join('; ')), go: { lesson: 'quicksort', params, step: s.parts.length - 1 } },
          { text: T(`最深 ${depth} 层。初始序列越接近有序，划分越不均衡，层数越接近 n；每次都对半分时约为 log₂n。`, `${depth} levels; nearly sorted input approaches n, even splits about log₂n.`), go: { lesson: 'quicksort', doc: 'perf' } },
        ],
      };
    },
  },
  {
    id: 'ds-qs-04',
    subject: 'ds',
    chapter: 'sort',
    topic: T('快速排序的划分是否均衡', 'Balanced quicksort partitions'),
    type: 'single',
    difficulty: 2,
    lessons: ['quicksort'],
    tags: ['概念'],
    conv: T('取第一个元素为枢轴。', 'First element as pivot.'),
    make(r) {
      for (;;) {
        const keys = r.distinct(7, 10, 99).sort((a, b) => a - b);
        const mid = (keys.length - 1) / 2;
        // 让枢轴（第一个元素）的大小排名各不相同，答案是排名最接近中间的那个
        const ranks = r.shuffle([0, 1, 2, 3, 4, 5, 6]).slice(0, 4);
        const best = ranks.reduce((b, x) => (Math.abs(x - mid) < Math.abs(b - mid) ? x : b));
        if (ranks.filter((x) => Math.abs(x - mid) === Math.abs(best - mid)).length > 1) continue;
        const seqs = ranks.map((k) => [keys[k], ...r.shuffle(keys.filter((_, i) => i !== k))]);
        const sims = seqs.map((s) => quicksort(s));
        const pos = sims.map((s) => s.parts[0].pos);
        const right = seqs[ranks.indexOf(best)];
        const { options, answer } = shuffled(r, seq(right), seqs.filter((s) => s !== right).map(seq));
        const params = { keys: right };
        return {
          question: T('用快速排序分别对下面四个序列排序，哪一个第一趟划分最均衡（枢轴两边的元素个数最接近）？', 'Which sequence gives the most balanced first quicksort partition?'),
          options,
          answer,
          steps: [
            { text: T('第一趟划分后枢轴落在哪里，只取决于枢轴（第一个元素）在所有元素里排第几：比它小的有几个，它就落在第几个位置后面。', 'Where the pivot lands depends only on its rank among the keys.'), go: { lesson: 'quicksort', doc: 'perf' } },
            { text: T(`按选项顺序，枢轴分别是 ${options.map((o, i) => { const j = seqs.findIndex((s) => seq(s) === o); return `${'ABCD'[i]} ${seqs[j][0]}（比它小的 ${pos[j]} 个）`; }).join('、')}。${right[0]} 最接近中位数，两边是 ${pos[ranks.indexOf(best)]} 和 ${keys.length - 1 - pos[ranks.indexOf(best)]} 个。`, `Pivots in option order: ${options.map((o) => o.split(" ")[0]).join(", ")}; ${right[0]} is closest to the median.`), go: { lesson: 'quicksort', params, step: 0 } },
          ],
        };
      }
    },
  },
  {
    id: 'ds-hs-03',
    subject: 'ds',
    chapter: 'sort',
    topic: T('删除堆顶后的调整', 'Re-heapifying after removing the top'),
    type: 'text',
    difficulty: 2,
    lessons: ['heap'],
    tags: ['过程推演'],
    conv: T('删除堆顶：把最后一个元素移到堆顶，再向下调整（和较大 / 较小的孩子比较、交换）。答案按数组顺序写。', 'Move the last element to the top and sift down. Answer in array order.'),
    make(r) {
      const kind = r.pick(['max', 'min']);
      const keys = r.distinct(r.int(8, 10), 10, 99);
      const h = L('heap', { keys, kind, op: 'build' }).sim.heap;
      const params = { keys: h, kind, op: 'sort' };
      const l = L('heap', params);
      const st = l.sim.steps.find((x) => x.type === 'extract');
      const after = st.arr.slice(1, st.size + 1).map((x) => x.key);
      const k = l.sim.steps.indexOf(st);
      return {
        question: T(`${kind === 'max' ? '大' : '小'}根堆（按数组顺序）为 ${seq(h)}。删除堆顶元素后，重新调整得到的堆是？`, `The ${kind}-heap is ${seq(h)}. What is the heap after removing the top?`),
        answer: { accept: [seq(after), after.join(','), after.join('，'), after.join('、'), after.join('')], show: seq(after) },
        steps: [
          { text: T(`堆顶 ${h[0]} 删掉，把最后一个元素 ${h.at(-1)} 移到堆顶，堆里剩 ${st.size} 个元素。`, `Remove ${h[0]}; move ${h.at(-1)} to the top.`), go: { lesson: 'heap', doc: 'sort' } },
          { text: T(`向下调整：${h.at(-1)} 和${kind === 'max' ? '较大' : '较小'}的孩子比较、交换，一共比较 ${st.cmp} 次，得到 ${seq(after)}。`, `Sift down with ${st.cmp} comparisons: ${seq(after)}.`), go: { lesson: 'heap', params, step: k } },
        ],
      };
    },
  },
  {
    id: 'ds-sp-03',
    subject: 'ds',
    chapter: 'sort',
    topic: T('排序的比较次数', 'Number of comparisons'),
    type: 'number',
    difficulty: 2,
    lessons: ['sort-passes'],
    tags: ['计算'],
    conv: T('直接插入：每个元素从后往前和有序部分比较，遇到不比它大的就停（这一次也算）；折半插入：只数折半查找的比较；冒泡：从后往前，某一趟没有交换就结束；简单选择：每趟和未排序部分的其余元素各比一次。', 'Insertion counts the stopping comparison; binary insertion counts the search; bubble stops after a pass with no swaps; selection compares with every remaining element.'),
    make(r) {
      const algo = r.pick(['insert', 'binsert', 'bubble', 'select']);
      const n = r.int(5, 7);
      const keys = r.distinct(n, 10, 99);
      const s = passes({ keys, algo });
      const params = { algo, keys };
      const tip = {
        insert: T(`和初始顺序有关：最好（已经有序）n − 1 = ${n - 1} 次，最坏（逆序）n(n − 1)/2 = ${(n * (n - 1)) / 2} 次。`, `Depends on the input: best ${n - 1}, worst ${(n * (n - 1)) / 2}.`),
        binsert: T('比较次数只和元素个数有关，和初始顺序无关；但移动次数仍和初始顺序有关。', 'Comparisons depend only on n; moves still depend on the order.'),
        bubble: T(`和初始顺序有关：已经有序时一趟就结束，只比 n − 1 = ${n - 1} 次。`, `Best case ${n - 1}.`),
        select: T(`和初始顺序无关，总是 n(n − 1)/2 = ${(n * (n - 1)) / 2} 次。`, `Always n(n − 1)/2 = ${(n * (n - 1)) / 2}.`),
      }[algo];
      return {
        question: T(`对 ${seq(keys)} 进行${ALG[algo].zh}（递增），整个过程一共要比较多少次关键字？`, `${ALG[algo].en} on ${seq(keys)}: how many key comparisons?`),
        answer: { value: s.cmp },
        steps: [
          { text: T(`一趟一趟数下来：${s.passes.map((p, i) => `第 ${i + 1} 趟后 ${seq(p.a)}`).join('；')}；合计 ${s.cmp} 次比较。`, `Total ${s.cmp} comparisons.`), go: { lesson: 'sort-passes', params, step: s.passes.length - 1 } },
          { text: tip, go: { lesson: 'sort-passes', doc: 'choose' } },
        ],
      };
    },
  },
  {
    id: 'ds-sp-04',
    subject: 'ds',
    chapter: 'sort',
    topic: T('排序的趟数', 'Number of passes'),
    type: 'number',
    difficulty: 1,
    lessons: ['sort-passes'],
    tags: ['计算'],
    conv: CONV,
    make(r) {
      const algo = r.pick(['merge', 'radix', 'bubble']);
      let keys;
      if (algo === 'merge') keys = r.distinct(r.int(5, 14), 10, 99);
      else if (algo === 'radix') {
        const d = r.int(2, 4);
        keys = r.distinct(r.int(6, 10), 1, 10 ** (d - 1) * 9);
        keys[r.int(0, keys.length - 1)] = r.int(10 ** (d - 1), 10 ** d - 1);
        keys = [...new Set(keys)];
      } else {
        // 基本有序：只打乱几个，冒泡会提前结束
        keys = r.distinct(r.int(7, 9), 10, 99).sort((a, b) => a - b);
        for (let t = r.int(1, 2); t > 0; t--) {
          const i = r.int(1, keys.length - 1);
          [keys[i - 1], keys[i]] = [keys[i], keys[i - 1]];
        }
      }
      const s = passes({ keys, algo });
      const n = keys.length;
      const params = { algo, keys };
      const why = {
        merge: T(`段长 1、2、4……每趟翻倍，直到不小于 n = ${n}：趟数 = ⌈log₂${n}⌉ = ${s.passes.length}。`, `⌈log₂${n}⌉ = ${s.passes.length}.`),
        radix: T(`最大的数 ${Math.max(...keys)} 有 ${s.passes.length} 位，每一位做一趟分配和收集，共 ${s.passes.length} 趟，和元素个数无关。`, `${s.passes.length} digits, one pass each.`),
        bubble: T(`前 ${s.passes.length - 1} 趟都有交换；第 ${s.passes.length} 趟一次交换也没有，说明已经有序，提前结束。`, `Pass ${s.passes.length} makes no swap, so it stops.`),
      }[algo];
      return {
        question: T(`对 ${seq(keys)} 进行${ALG[algo].zh}，一共要进行多少趟？`, `How many passes does ${ALG[algo].en} make on ${seq(keys)}?`),
        answer: { value: s.passes.length },
        steps: [
          { text: why, go: { lesson: 'sort-passes', params, step: s.passes.length - 1 } },
          { text: T(`各趟结果：${s.passes.map((p) => seq(p.a)).join(' → ')}。`, s.passes.map((p) => seq(p.a)).join(' → ')), go: { lesson: 'sort-passes', doc: algo === 'bubble' ? 'swap' : 'merge' } },
        ],
      };
    },
  },
];

export { afterTwo, canBeSecond, fixedOf };
