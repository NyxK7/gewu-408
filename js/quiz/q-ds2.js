// 数据结构第二批题：每一章都有。生成题的答案由课程同一份计算代码算出。
import { T } from '../core/i18n.js';
import { simulate as dijkstra } from '../subjects/ds/dijkstra.js';
import { topo } from '../subjects/ds/graphalgo.js';
import { quicksort } from '../subjects/ds/qsort.js';
import { rbInsert } from '../subjects/ds/rbtree.js';
import { bsearch } from '../subjects/ds/searching.js';
import { stackSeq } from '../subjects/ds/linear.js';
import { countingSort } from '../subjects/ds/csort.js';
import { match, nextOf, nextvalOf } from '../subjects/ds/string.js';
import { huffman } from '../subjects/ds/trees2.js';
import { twoPointer } from '../subjects/ds/llalgo.js';
import { shuffled } from './kit.js';

const NEXT1 = T('next 数组按下标从 1 开始的写法：next[1] = 0，next[j] = P[1..j−1] 的最长相等前后缀长度 + 1。', 'next is 1-based: next[1] = 0, next[j] = longest border of P[1..j−1] + 1.');
const randStr = (r, n, abc = 'ab') => Array.from({ length: n }, () => abc[r.int(0, abc.length - 1)]).join('');
const plus1 = (a) => a.map((v) => v + 1);

export const DS_QUESTIONS2 = [
  // ───── 绪论 ─────
  {
    id: 'ds-cx-01',
    subject: 'ds',
    chapter: 'basic',
    topic: T('时间复杂度', 'Time complexity'),
    type: 'single',
    difficulty: 2,
    lessons: ['complexity'],
    tags: ['计算'],
    question: T('下面这段程序的时间复杂度是：`i = 1; while (i <= n) i = i * 3;`', 'What is the time complexity of `i = 1; while (i <= n) i = i * 3;`?'),
    options: ['O(n)', 'O(log₃ n)', 'O(n / 3)', 'O(√n)'],
    answer: 1,
    steps: [
      { text: T('设循环执行了 t 次，每次 i 乘 3，执行完 i = 3^t。循环在 3^t > n 时结束，所以 t ≈ log₃ n。', 'After t rounds i = 3^t; it stops when 3^t > n, so t ≈ log₃ n.'), go: { lesson: 'complexity', doc: 'time' } },
      { text: T('底数不同的对数只差一个常数倍，写成 O(log n) 也可以；O(n / 3) 就是 O(n)，不对。', 'Log bases differ by a constant, so O(log n) is also fine; O(n/3) is O(n).') },
    ],
  },
  // ───── 线性表 ─────
  {
    id: 'ds-ll-01',
    subject: 'ds',
    chapter: 'list',
    topic: T('链表双指针', 'Two pointers'),
    type: 'number',
    difficulty: 2,
    lessons: ['ll-algo'],
    tags: ['过程推演'],
    conv: T('链表带头结点，结点从 1 开始编号；k 从 1 开始数。', 'Head node present; nodes and k count from 1.'),
    make(r) {
      const n = r.int(6, 9);
      const k = r.int(2, n - 1);
      const a = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i)).join(' ');
      const params = { mode: 'kth', a, b: '', c: '', k };
      const sim = twoPointer(params);
      return {
        question: T(`用「快指针先走 k 步」的方法找带头结点单链表 ${a.split(' ').join(' → ')} 的倒数第 ${k} 个结点。快指针先走完 ${k} 步时，它指向第几个结点？（走到 NULL 记作 0）`, `To find the ${k}-th node from the end of ${a}, fast first moves ${k} steps. Which node does fast then point to? (0 for NULL)`),
        answer: { value: k + 1 > n ? 0 : k + 1 },
        steps: [
          { text: T(`fast、slow 都从第 1 个结点出发。`, 'Both start at node 1.'), go: { lesson: 'll-algo', params, step: 0 } },
          { text: T(`fast 先走 ${k} 步，到第 1 + ${k} = ${k + 1} 个结点。`, `fast moves ${k} steps to node ${k + 1}.`), go: { lesson: 'll-algo', params, step: 1 } },
          { text: T(`之后两个一起走，fast 到 NULL 时 slow 在第 ${sim.ans} 个，也就是倒数第 ${k} 个。`, `Then slow ends at node ${sim.ans}.`), go: { lesson: 'll-algo', params, step: sim.steps.length - 1 } },
        ],
      };
    },
  },
  {
    id: 'ds-ll-02',
    subject: 'ds',
    chapter: 'list',
    topic: T('顺序表与链表', 'Arrays and linked lists'),
    type: 'multi',
    difficulty: 1,
    lessons: ['linked-list'],
    tags: ['概念'],
    question: T('与顺序表相比，单链表的特点有：', 'Compared with a sequential list, a singly linked list:'),
    options: [
      T('插入、删除时不需要移动元素', 'needs no element moves to insert or delete'),
      T('可以随机存取第 i 个元素', 'gives random access to element i'),
      T('存储密度小于 1', 'has a storage density below 1'),
      T('不需要事先分配一整块连续空间', 'needs no preallocated contiguous block'),
    ],
    answer: [0, 2, 3],
    steps: [
      { text: T('链表插入删除只改指针，但要先找到位置（O(n)）；顺序表要移动后面的元素。', 'Linked lists only relink pointers (after finding the spot).'), go: { lesson: 'linked-list', doc: 'link' } },
      { text: T('链表只能从头往后找，不能随机存取；每个结点还要存指针，存储密度 < 1。', 'No random access; pointers lower the density.'), go: { lesson: 'linked-list', doc: 'seq' } },
    ],
  },
  // ───── 栈、队列和数组 ─────
  {
    id: 'ds-st-01',
    subject: 'ds',
    chapter: 'stack',
    topic: T('出栈序列', 'Pop orders'),
    type: 'judge',
    difficulty: 2,
    lessons: ['stack-seq'],
    tags: ['过程推演'],
    make(r) {
      const n = 5;
      const push = '1 2 3 4 5';
      let pop;
      const want = r.next() < 0.5; // 可能和不可能各占一半
      for (;;) {
        pop = r.shuffle(['1', '2', '3', '4', '5']).join(' ');
        if (stackSeq({ push, pop }).valid === want) break;
      }
      const params = { push, pop };
      const sim = stackSeq(params);
      const last = sim.steps.length - 1;
      return {
        question: T(`入栈序列是 1 2 3 4 5，出栈和入栈可以交替进行。${pop.split(' ').join(' ')} 是一个可能的出栈序列。`, `With pushes 1–5 in order and pops interleaved, ${pop} is a possible pop order.`),
        answer: sim.valid,
        steps: [
          { text: T('用一个栈模拟：要出的元素还没入栈，就继续按顺序入栈；它在栈顶就出栈；它在栈里但不在栈顶，就不可能。', 'Simulate: push until the wanted element is on top; if it is buried, impossible.'), go: { lesson: 'stack-seq', doc: 'seq' } },
          sim.valid
            ? { text: T(`按这个规则一路做下去，${n} 个元素都能按顺序出栈，所以是可能的。`, 'Every element pops in turn: possible.'), go: { lesson: 'stack-seq', params, step: last } }
            : { text: T(`要出 ${sim.fail.want} 时，栈顶是 ${sim.fail.top}，${sim.fail.want} 被压在下面，取不出来，所以不可能。`, `${sim.fail.want} is under ${sim.fail.top}: impossible.`), go: { lesson: 'stack-seq', params, step: last } },
        ],
      };
    },
  },
  {
    id: 'ds-lq-01',
    subject: 'ds',
    chapter: 'stack',
    topic: T('链队', 'Linked queues'),
    type: 'single',
    difficulty: 2,
    lessons: ['linked-sq'],
    tags: ['易错点'],
    conv: T('链队带头结点，front 指向头结点，rear 指向队尾结点。', 'Head node; front at the head node, rear at the tail.'),
    question: T('队列中只有一个元素时执行出队，除了修改头结点的 next，还必须：', 'Dequeuing the only element, besides the head node’s next you must also:'),
    options: [T('把 rear 改为指向头结点（rear = front）', 'set rear = front'), T('把 front 置为 NULL', 'set front = NULL'), T('什么都不用改', 'change nothing'), T('把 rear 置为 NULL', 'set rear = NULL')],
    answer: 0,
    steps: [
      { text: T('被删除的结点正好是 rear 指的结点，释放它以后 rear 会悬空。', 'The freed node is the one rear points at.'), go: { lesson: 'linked-sq', params: { kind: 'queue', head: true, ops: '+a +b - +c - - -' }, step: 5 } },
      { text: T('带头结点时队空的条件是 front == rear，所以要让 rear 回到头结点。front 永远指向头结点，不能置空。', 'Empty means front == rear, so rear returns to the head node.'), go: { lesson: 'linked-sq', doc: 'queue' } },
    ],
  },
  // ───── 串 ─────
  {
    id: 'ds-kmp-01',
    subject: 'ds',
    chapter: 'string',
    topic: T('KMP 的 next 数组', 'KMP next array'),
    type: 'text',
    difficulty: 2,
    lessons: ['kmp'],
    tags: ['计算'],
    conv: NEXT1,
    make(r) {
      const p = randStr(r, r.int(5, 7), r.next() < 0.5 ? 'ab' : 'abc');
      const nx = plus1(nextOf(p));
      const params = { text: p + p, pattern: p, algo: 'kmp', base: 1 };
      return {
        question: T(`模式串 P = 「${p}」，它的 next 数组是什么？（各项用空格隔开）`, `Pattern P = "${p}". What is its next array (space-separated)?`),
        answer: { accept: [nx.join(' '), nx.join(',')], show: nx.join(' ') },
        steps: [
          ...[...p].map((_, j) => ({ text: T(`next[${j + 1}] = ${nx[j]}`, `next[${j + 1}] = ${nx[j]}`), go: { lesson: 'kmp', params, step: j } })),
          { text: T('手算技巧：先写出每个前缀的最长相等前后缀长度（部分匹配值），整体右移一位、首位补 −1，再整体加 1。', 'Trick: write the partial-match values, shift right, put −1 first, add 1.'), go: { lesson: 'kmp', doc: 'next' } },
        ],
      };
    },
  },
  {
    id: 'ds-kmp-02',
    subject: 'ds',
    chapter: 'string',
    topic: T('KMP 的 nextval', 'nextval'),
    type: 'text',
    difficulty: 3,
    lessons: ['kmp'],
    tags: ['计算'],
    conv: T('nextval 也按下标从 1 开始的写法（nextval[1] = 0）。', 'nextval is 1-based too (nextval[1] = 0).'),
    make(r) {
      for (;;) {
        const p = randStr(r, r.int(5, 7));
        const nv = plus1(nextvalOf(p));
        if (nv.join() === plus1(nextOf(p)).join()) continue; // 要让 nextval 和 next 不一样
        const params = { text: p + p, pattern: p, algo: 'kmpval', base: 1 };
        return {
          question: T(`模式串 P = 「${p}」，它的 nextval 数组是什么？`, `Pattern P = "${p}". What is its nextval array?`),
          answer: { accept: [nv.join(' '), nv.join(',')], show: nv.join(' ') },
          steps: [
            { text: T(`先求 next：${plus1(nextOf(p)).join(' ')}。`, `next: ${plus1(nextOf(p)).join(' ')}.`), go: { lesson: 'kmp', params, step: p.length - 1 } },
            { text: T(`再逐个看：P[j] 和 P[next[j]] 相同，nextval[j] 就取 nextval[next[j]]，否则等于 next[j]。得到 ${nv.join(' ')}。`, `If P[j] = P[next[j]] take nextval[next[j]], else next[j]: ${nv.join(' ')}.`), go: { lesson: 'kmp', params, step: p.length } },
          ],
        };
      }
    },
  },
  {
    id: 'ds-kmp-03',
    subject: 'ds',
    chapter: 'string',
    topic: T('串的模式匹配', 'Pattern matching'),
    type: 'number',
    difficulty: 3,
    lessons: ['kmp'],
    tags: ['过程推演'],
    conv: T('比较次数按字符比较算，失配的那一次也算。', 'Count every character comparison, including mismatches.'),
    make(r) {
      for (;;) {
        const p = randStr(r, r.int(4, 5));
        const t = randStr(r, r.int(10, 14));
        const sim = match({ text: t, pattern: p, algo: 'kmp' });
        if (sim.found < 0 || sim.rounds.length < 3) continue;
        const params = { text: t, pattern: p, algo: 'kmp', base: 1 };
        return {
          question: T(`用 KMP 算法在主串「${t}」中查找模式串「${p}」，直到找到第一次匹配为止，一共进行了多少次字符比较？`, `Using KMP to find "${p}" in "${t}", how many character comparisons until the first match?`),
          answer: { value: sim.total },
          steps: [
            { text: T(`next 数组：${plus1(sim.next).join(' ')}。`, `next: ${plus1(sim.next).join(' ')}.`), go: { lesson: 'kmp', params, step: p.length - 1 } },
            ...sim.rounds.map((rd, k) => ({ text: T(`第 ${k + 1} 轮比较 ${rd.cmps.length} 次${rd.end === 'match' ? '，匹配成功' : '，失配'}。`, `Round ${k + 1}: ${rd.cmps.length}.`), go: { lesson: 'kmp', params, step: p.length + k } })),
            { text: T(`合计 ${sim.total} 次，在位置 ${sim.found + 1} 找到。`, `Total ${sim.total}, found at ${sim.found + 1}.`) },
          ],
        };
      }
    },
  },
  // ───── 树与二叉树 ─────
  {
    id: 'ds-huf-01',
    subject: 'ds',
    chapter: 'tree',
    topic: T('哈夫曼树', 'Huffman trees'),
    type: 'number',
    difficulty: 2,
    lessons: ['huffman'],
    tags: ['计算'],
    make(r) {
      const weights = r.distinct(r.int(4, 6), 1, 20);
      const params = { weights };
      const sim = huffman(params);
      return {
        question: T(`用权值 ${weights.join('、')} 构造哈夫曼树，它的带权路径长度 WPL 是多少？`, `Build a Huffman tree from weights ${weights.join(', ')}. What is its WPL?`),
        answer: { value: sim.wpl },
        steps: [
          ...sim.steps.map((s, k) => ({ text: T(`取最小的两个 ${s.a} 和 ${s.b}，合成 ${s.sum}。`, `Merge ${s.a} and ${s.b} into ${s.sum}.`), go: { lesson: 'huffman', params, step: k } })),
          { text: T(`WPL = ${weights.map((w, i) => `${w}×${sim.codes[i].length}`).join(' + ')} = ${sim.wpl}。也等于所有新结点权值之和：${sim.steps.map((s) => s.sum).join(' + ')} = ${sim.steps.reduce((a, s) => a + s.sum, 0)}。`, `WPL = ${sim.wpl}, also the sum of merged weights.`) },
        ],
      };
    },
  },
  {
    id: 'ds-bt-01',
    subject: 'ds',
    chapter: 'tree',
    topic: T('二叉树的性质', 'Binary tree properties'),
    type: 'number',
    difficulty: 2,
    lessons: ['bt-traverse'],
    tags: ['计算'],
    make(r) {
      const n2 = r.int(5, 40);
      const n1 = r.int(0, 20);
      return {
        question: T(`一棵二叉树有 ${n2} 个度为 2 的结点、${n1} 个度为 1 的结点，它有多少个叶子结点？`, `A binary tree has ${n2} nodes of degree 2 and ${n1} of degree 1. How many leaves?`),
        answer: { value: n2 + 1 },
        steps: [
          { text: T('结点数 n = n0 + n1 + n2；除根以外每个结点都有一条进入它的边，边数 = n − 1 = n1 + 2·n2。', 'n = n0 + n1 + n2 and edges n − 1 = n1 + 2n2.'), go: { lesson: 'bt-traverse', doc: 'concept' } },
          { text: T(`两式相减得 n0 = n2 + 1 = ${n2 + 1}，和度为 1 的结点个数无关。`, `So n0 = n2 + 1 = ${n2 + 1}, regardless of n1.`) },
        ],
      };
    },
  },
  // ───── 图 ─────
  {
    id: 'ds-gs-01',
    subject: 'ds',
    chapter: 'graph',
    topic: T('图的存储', 'Graph storage'),
    type: 'number',
    difficulty: 1,
    lessons: ['graph-store'],
    tags: ['计算'],
    make(r) {
      const n = r.int(6, 30);
      const e = r.int(n, (n * (n - 1)) / 2);
      return {
        question: T(`一个无向图有 ${n} 个顶点、${e} 条边，用邻接表存储时，边表结点一共有多少个？`, `An undirected graph has ${n} vertices and ${e} edges. How many edge nodes does its adjacency list have?`),
        answer: { value: 2 * e },
        steps: [
          { text: T('无向图的每条边 (u, v) 既出现在 u 的边表里，也出现在 v 的边表里，存两次。', 'Each undirected edge appears in two lists.'), go: { lesson: 'graph-store', doc: 'adj' } },
          { text: T(`所以边表结点 = 2e = ${2 * e} 个。有向图才是 e 个。`, `2e = ${2 * e}; a directed graph would have e.`), go: { lesson: 'graph-store', params: { directed: false, edges: 'A B, A C, B C, B D, C E, D E', store: 'adj' }, step: 6 } },
        ],
      };
    },
  },
  {
    id: 'ds-gs-02',
    subject: 'ds',
    chapter: 'graph',
    topic: T('图的存储', 'Graph storage'),
    type: 'single',
    difficulty: 2,
    lessons: ['graph-store'],
    tags: ['概念'],
    question: T('对一个有向图，既要经常求某个顶点的出度，又要经常求它的入度，最合适的存储结构是：', 'For a directed graph where both in- and out-degrees are queried often, the best structure is:'),
    options: [T('邻接表', 'adjacency list'), T('逆邻接表', 'inverse adjacency list'), T('十字链表', 'orthogonal list'), T('邻接多重表', 'adjacency multilist')],
    answer: 2,
    steps: [
      { text: T('邻接表求出度方便、求入度要扫全部边表；逆邻接表正相反。', 'The adjacency list favours out-degree, the inverse list in-degree.'), go: { lesson: 'graph-store', doc: 'cost' } },
      { text: T('十字链表把两者合在一起：沿 tlink 数出弧、沿 hlink 数入弧。邻接多重表是给无向图用的。', 'The orthogonal list has both chains; multilists are for undirected graphs.'), go: { lesson: 'graph-store', params: { directed: true, edges: 'A B, A C, C A, C D, D A, D B', store: 'cross' }, step: 6 } },
    ],
  },
  {
    id: 'ds-dij-01',
    subject: 'ds',
    chapter: 'graph',
    topic: T('Dijkstra 最短路径', 'Dijkstra'),
    type: 'text',
    difficulty: 2,
    lessons: ['dijkstra'],
    tags: ['过程推演'],
    conv: T('距离相同时选顶点名字母小的。', 'Ties go to the alphabetically smaller vertex.'),
    make(r) {
      const V = ['A', 'B', 'C', 'D', 'E'];
      for (;;) {
        const edges = [];
        for (const u of V) for (const v of V) if (u !== v && r.next() < 0.35) edges.push(`${u}>${v} ${r.int(1, 9)}`);
        const params = { graph: edges.join(', '), src: 'A', directed: true };
        const sim = dijkstra(params);
        if (!sim.ok || sim.rounds.some((x) => x.pick == null) || sim.rounds.length < 4) continue;
        const order = sim.rounds.map((x) => x.pick);
        return {
          question: T(`有向带权图的边为：${edges.join('，')}（A>B 3 表示 A 到 B 权为 3）。用 Dijkstra 算法求 A 到其他顶点的最短路径，顶点加入集合 S 的先后顺序是什么？（不含 A，用空格隔开）`, `Edges: ${edges.join(', ')}. With Dijkstra from A, in what order do vertices join S (excluding A)?`),
          answer: { accept: [order.join(' '), order.join(''), order.join(',')], show: order.join(' ') },
          steps: [
            { text: T('初始化：S = {A}，dist 是 A 直接到各顶点的边权。', 'Initialize from A’s edges.'), go: { lesson: 'dijkstra', params, step: 0 } },
            ...sim.rounds.map((x, k) => ({ text: T(`第 ${k + 1} 轮：不在 S 中、dist 最小的是 ${x.pick}（${x.d}），加入 S，再用它更新其他顶点。`, `Round ${k + 1}: pick ${x.pick} (${x.d}).`), go: { lesson: 'dijkstra', params, step: k + 1 } })),
          ],
        };
      }
    },
  },
  {
    id: 'ds-topo-01',
    subject: 'ds',
    chapter: 'graph',
    topic: T('拓扑排序', 'Topological sort'),
    type: 'judge',
    difficulty: 2,
    lessons: ['topo'],
    tags: ['概念'],
    question: T('一个有向图的拓扑序列如果唯一，那么这个图的结构是唯一确定的。', 'If a digraph has a unique topological order, the graph is uniquely determined.'),
    answer: false,
    steps: [
      { text: T('拓扑序列唯一只说明每一步都恰好只有一个入度为 0 的顶点，比如一条链 A→B→C 的拓扑序列唯一。', 'A unique order only means one zero in-degree vertex at each step, as in a chain A→B→C.'), go: { lesson: 'topo', doc: 'kahn' } },
      { text: T('但在 A→B→C 上再加一条 A→C，拓扑序列还是 A B C，图却不一样了。所以图不能由拓扑序列唯一确定。', 'Adding A→C keeps the order but changes the graph.'), go: { lesson: 'topo', params: { graph: 'A>B, B>C, A>C' }, step: 2 } },
    ],
  },
  // ───── 查找 ─────
  {
    id: 'ds-bs-01',
    subject: 'ds',
    chapter: 'search',
    topic: T('折半查找', 'Binary search'),
    type: 'number',
    difficulty: 2,
    lessons: ['binary-search'],
    tags: ['过程推演'],
    conv: T('位置从 1 开始，mid = ⌊(low + high) / 2⌋。', 'Positions start at 1; mid = ⌊(low + high)/2⌋.'),
    make(r) {
      const n = r.int(9, 15);
      const keys = r.distinct(n, 1, 99).sort((a, b) => a - b);
      const hit = r.next() < 0.6;
      let target = hit ? r.pick(keys) : r.int(1, 99);
      while (!hit && keys.includes(target)) target = r.int(1, 99);
      const params = { keys, target };
      const sim = bsearch(params);
      return {
        question: T(`在有序表 ${keys.join(' ')} 中折半查找 ${target}，一共要和多少个关键字比较？`, `Binary search for ${target} in ${keys.join(' ')}: how many keys are compared?`),
        answer: { value: sim.steps.length },
        steps: [
          ...sim.steps.map((s, k) => ({ text: T(`low = ${s.low}，high = ${s.high}，mid = ${s.mid}，和 ${s.v} 比：${s.cmp === 0 ? '相等，找到' : s.cmp < 0 ? '小于它，往左' : '大于它，往右'}。`, `mid = ${s.mid}, compare with ${s.v}.`), go: { lesson: 'binary-search', params, step: k } })),
          { text: sim.found ? T(`共比较 ${sim.steps.length} 次。`, `${sim.steps.length} comparisons.`) : T(`low > high，查找失败，共比较 ${sim.steps.length} 次。`, `low > high: not found after ${sim.steps.length}.`) },
        ],
      };
    },
  },
  {
    id: 'ds-rb-01',
    subject: 'ds',
    chapter: 'search',
    topic: T('红黑树', 'Red–black trees'),
    type: 'single',
    difficulty: 2,
    lessons: ['rbtree'],
    tags: ['过程推演'],
    make(r) {
      for (;;) {
        const keys = r.distinct(r.int(5, 7), 1, 60);
        const sim = rbInsert(keys);
        const last = sim.steps.filter((s) => s.key === keys.at(-1) && s.kind !== 'insert' && s.kind !== 'dup');
        const first = last[0]?.kind ?? 'none';
        const names = {
          none: T('父结点是黑的，不用调整', 'black parent, nothing to do'),
          recolor: T('叔叔是红的：父、叔变黑，祖父变红', 'red uncle: recolour'),
          inner: T('叔叔是黑的、在内侧：先绕父结点旋转一次', 'black uncle, inner: rotate at the parent first'),
          outer: T('叔叔是黑的、在外侧：变色后绕祖父旋转一次', 'black uncle, outer: recolour and rotate at the grandparent'),
          root: T('新结点是根：直接涂黑', 'it is the root: paint it black'),
        };
        if (first === 'root') continue;
        const k = keys.length - 1;
        const params = { keys };
        const idx = sim.steps.findIndex((s) => s.key === keys.at(-1) && s.kind === 'insert');
        const { options, answer } = shuffled(r, names[first], ['none', 'recolor', 'inner', 'outer'].filter((x) => x !== first).map((x) => names[x]));
        return {
          question: T(`依次向空红黑树插入 ${keys.join('、')}。插入最后一个关键字 ${keys[k]} 时，第一步要做的调整是：`, `Insert ${keys.join(', ')} into an empty red–black tree. When ${keys[k]} goes in, the first fix-up step is:`),
          options,
          answer,
          steps: [
            { text: T(`前面几个插完以后，${keys[k]} 按二叉排序树的位置插入并涂红。`, `${keys[k]} is inserted red.`), go: { lesson: 'rbtree', params, step: idx } },
            { text: first === 'none' ? T('它的父结点是黑的，没有连续的红结点，不用调整。', 'Black parent: done.') : T(`父结点是红的，看叔叔的颜色和新结点的位置：${names[first].zh}。`, `Red parent: ${names[first].en}.`), go: { lesson: 'rbtree', params, step: first === 'none' ? idx : idx + 1 } },
          ],
        };
      }
    },
  },
  {
    id: 'ds-rb-02',
    subject: 'ds',
    chapter: 'search',
    topic: T('红黑树', 'Red–black trees'),
    type: 'multi',
    difficulty: 2,
    lessons: ['rbtree', 'avl'],
    tags: ['概念'],
    question: T('关于红黑树，下列说法正确的有：', 'Which statements about red–black trees are true?'),
    options: [
      T('新插入的结点总是涂成红色', 'a newly inserted node is always red'),
      T('从任一结点到其下各叶子的路径上黑结点数相同', 'every path from a node to its leaves has the same number of black nodes'),
      T('红黑树一定是平衡二叉树（AVL 树）', 'every red–black tree is an AVL tree'),
      T('n 个内部结点的红黑树高度不超过 2log₂(n + 1)', 'the height is at most 2 log₂(n + 1)'),
    ],
    answer: [0, 1, 3],
    steps: [
      { text: T('涂红不改变任何路径上的黑结点数，所以新结点涂红；黑结点数相同是性质 5。', 'Red keeps the black counts; equal black counts is property 5.'), go: { lesson: 'rbtree', doc: 'props' } },
      { text: T('红黑树只保证最长路径不超过最短路径的两倍，左右子树高度差可以大于 1，不一定是 AVL 树。', 'It only bounds longest ≤ 2 × shortest; heights may differ by more than 1.'), go: { lesson: 'rbtree', doc: 'height' } },
    ],
  },
  // ───── 排序 ─────
  {
    id: 'ds-qs-01',
    subject: 'ds',
    chapter: 'sort',
    topic: T('快速排序', 'Quicksort'),
    type: 'text',
    difficulty: 2,
    lessons: ['quicksort'],
    tags: ['过程推演'],
    conv: T('取区间第一个元素为枢轴，high 先从右往左找；结果写成空格隔开的序列。', 'The first element is the pivot; high scans first. Answer space-separated.'),
    make(r) {
      const keys = r.distinct(r.int(7, 9), 10, 99);
      const params = { keys };
      const sim = quicksort(keys);
      const after = sim.parts[0].after;
      return {
        question: T(`对 ${keys.join(' ')} 进行快速排序，第一次划分结束后的序列是什么？`, `Quicksort ${keys.join(' ')}: what is the sequence after the first partition?`),
        answer: { accept: [after.join(' '), after.join(',')], show: after.join(' ') },
        steps: [
          { text: T(`枢轴是 ${keys[0]}。high 从右往左找比它小的，挪到 low；low 从左往右找比它大的，挪到 high，直到相遇。`, `Pivot ${keys[0]}; alternate high and low scans.`), go: { lesson: 'quicksort', doc: 'partition' } },
          { text: T(`${keys[0]} 落在位置 ${sim.parts[0].pos + 1}，左边都比它小、右边都比它大：${after.join(' ')}。`, `${keys[0]} lands at ${sim.parts[0].pos + 1}: ${after.join(' ')}.`), go: { lesson: 'quicksort', params, step: 0 } },
        ],
      };
    },
  },
  {
    id: 'ds-cs-01',
    subject: 'ds',
    chapter: 'sort',
    topic: T('计数排序', 'Counting sort'),
    type: 'text',
    difficulty: 2,
    lessons: ['counting-sort'],
    tags: ['计算'],
    conv: T('计数数组 C 下标从 0 开始，答案写「求前缀和以后」的 C，各项用空格隔开。', 'C is 0-based; give C after the prefix sums, space-separated.'),
    make(r) {
      const a = Array.from({ length: r.int(7, 9) }, () => r.int(0, 5));
      const params = { a };
      const sim = countingSort(a);
      return {
        question: T(`对 ${a.join(' ')} 做计数排序，统计完并求前缀和以后，计数数组 C 是什么？`, `Counting sort on ${a.join(' ')}: what is C after the prefix sums?`),
        answer: { accept: [sim.prefix.join(' '), sim.prefix.join(',')], show: sim.prefix.join(' ') },
        steps: [
          { text: T(`先统计每个值出现的次数：${sim.cnt.join(' ')}。`, `Counts: ${sim.cnt.join(' ')}.`), go: { lesson: 'counting-sort', params, step: a.length - 1 } },
          { text: T(`再从左往右累加：${sim.prefix.join(' ')}。C[x] 是不大于 x 的元素个数。`, `Prefix sums: ${sim.prefix.join(' ')}.`), go: { lesson: 'counting-sort', params, step: a.length } },
        ],
      };
    },
  },
  {
    id: 'ds-sort-01',
    subject: 'ds',
    chapter: 'sort',
    topic: T('排序算法的比较', 'Comparing sorts'),
    type: 'multi',
    difficulty: 2,
    lessons: ['counting-sort', 'sort-passes'],
    tags: ['概念'],
    question: T('下列排序算法中，是稳定排序的有：', 'Which of these sorts are stable?'),
    options: [T('直接插入排序', 'insertion sort'), T('快速排序', 'quicksort'), T('2 路归并排序', 'merge sort'), T('堆排序', 'heapsort'), T('基数排序', 'radix sort'), T('简单选择排序', 'selection sort')],
    answer: [0, 2, 4],
    steps: [
      { text: T('稳定的：直接插入、冒泡、归并、基数、计数。', 'Stable: insertion, bubble, merge, radix, counting.'), go: { lesson: 'counting-sort', params: { a: [3, 1, 4, 1, 2, 3, 0, 3] }, step: 17 } },
      { text: T('不稳定的：希尔、快速、简单选择、堆排序——它们都有「跨越很远的交换」，可能把相同的关键字换了次序。', 'Unstable: Shell, quick, selection, heap — long-distance swaps.'), go: { lesson: 'counting-sort', doc: 'compare' } },
    ],
  },
];
