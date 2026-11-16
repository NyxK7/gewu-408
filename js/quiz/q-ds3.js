// 数据结构第三批题：给之前还没有题的课补题（图的遍历、最小生成树、关键路径、Floyd、中缀转后缀、特殊矩阵、
// 二叉排序树、B 树、遍历序列还原、线索二叉树、森林转换、并查集、堆、外部排序）。答案都通过课程的 update 拿到 sim 算出。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const LET = 'ABCDEFGHIJ';
/** 序列答案：空格、逗号、顿号隔开都算对 */
const seq = (a) => ({
  accept: [a.join(''), a.join(','), a.join('，'), a.join('、'), a.join(' ')],
  show: a.join(' '),
});

// ── 随机图 ──
/** n 个顶点的连通无向图：先随机一棵生成树，再加 extra 条边；weighted 时每条边带不同的权 */
function randGraph(r, n, extra, weighted) {
  const V = LET.slice(0, n).split('');
  const key = (a, b) => [a, b].sort().join('-');
  const E = new Map();
  for (let i = 1; i < n; i++) E.set(key(V[r.int(0, i - 1)], V[i]), 0);
  for (let t = 0; E.size < n - 1 + extra && t < 100; t++) {
    const a = V[r.int(0, n - 1)];
    const b = V[r.int(0, n - 1)];
    if (a !== b) E.set(key(a, b), 0);
  }
  const ws = r.shuffle(Array.from({ length: 20 }, (_, i) => i + 1));
  return [...E.keys()].map((k, i) => (weighted ? `${k} ${ws[i]}` : k)).join(', ');
}
/** 有唯一源点 A、唯一汇点（最后一个顶点）的 AOE 网 */
function randAoe(r, n) {
  const V = LET.slice(0, n).split('');
  const E = new Map();
  for (let i = 1; i < n; i++) E.set(`${V[r.int(0, i - 1)]}>${V[i]}`, r.int(1, 6));
  for (let i = 0; i < n - 1; i++) if (![...E.keys()].some((k) => k.startsWith(V[i] + '>'))) E.set(`${V[i]}>${V[r.int(i + 1, n - 1)]}`, r.int(1, 6));
  for (let t = 0; t < 3; t++) {
    const i = r.int(0, n - 2);
    const j = r.int(i + 1, n - 1);
    E.set(`${V[i]}>${V[j]}`, r.int(1, 6));
  }
  return [...E].map(([k, w]) => `${k} ${w}`).join(', ');
}

// ── 随机二叉树：按层序位置 1..15 生成（孩子只在双亲存在时出现），结点名按层序依次取字母 ──
function randTree(r, count) {
  for (;;) {
    const on = new Set([1]);
    for (let p = 2; p <= 15 && on.size < count; p++) if (on.has(p >> 1) && r.next() < 0.62) on.add(p);
    if (on.size !== count) continue;
    const pos = [...on].sort((a, b) => a - b);
    const name = Object.fromEntries(pos.map((p, i) => [p, LET[i]]));
    const node = (p) => (on.has(p) ? { val: name[p], l: node(2 * p), r: node(2 * p + 1) } : null);
    const root = node(1);
    // 课程用的层序串：只给存在的结点列出两个孩子位置（空的写 #），末尾的 # 去掉
    const tok = [root.val];
    const q = [root];
    while (q.length) {
      const p = q.shift();
      for (const c of [p.l, p.r]) {
        tok.push(c ? c.val : '#');
        if (c) q.push(c);
      }
    }
    while (tok.at(-1) === '#') tok.pop();
    return { root, level: tok.join(' ') };
  }
}
const pre = (t) => (t ? [t.val, ...pre(t.l), ...pre(t.r)] : []);
const ino = (t) => (t ? [...ino(t.l), t.val, ...ino(t.r)] : []);
const post = (t) => (t ? [...post(t.l), ...post(t.r), t.val] : []);
const height = (t) => (!t ? 0 : t.kids ? 1 + Math.max(0, ...t.kids.map(height)) : 1 + Math.max(height(t.l), height(t.r)));

export const DS_QUESTIONS3 = [
  // ───── 图 ─────
  {
    id: 'ds-trav-01',
    subject: 'ds',
    chapter: 'graph',
    topic: T('图的遍历', 'Graph traversal'),
    type: 'text',
    difficulty: 2,
    lessons: ['graph-search'],
    tags: ['过程推演'],
    conv: T('邻接表里的邻接点按字母顺序排列，遍历时按这个顺序访问。', 'Neighbours are visited in alphabetical order.'),
    make(r) {
      const mode = r.pick(['dfs', 'bfs']);
      const graph = randGraph(r, 6, 2, false);
      const params = { graph, start: 'A', directed: false, mode };
      const l = L('graph-search', params);
      const s = l.sim;
      const name = mode === 'dfs' ? T('深度优先（DFS）', 'depth-first') : T('广度优先（BFS）', 'breadth-first');
      return {
        question: T(`无向图的边为 ${graph}。从 A 出发${name.zh}遍历，访问顺序是什么？（写出顶点序列）`, `Undirected edges ${graph}. Starting at A, what is the ${name.en} order?`),
        answer: seq(s.order),
        steps: [
          {
            text: T(mode === 'dfs' ? '深度优先：访问一个顶点后，沿第一个没访问过的邻接点一直往下走，走不通再退回上一个顶点。' : '广度优先：先访问起点的所有邻接点，再一层层往外，用队列记下待访问的顶点。', mode === 'dfs' ? 'DFS goes deep first and backtracks.' : 'BFS visits layer by layer with a queue.'),
            go: { lesson: 'graph-search', doc: mode },
          },
          {
            text: T(`按字母顺序走一遍得到 ${s.order.join(' → ')}。`, `Order: ${s.order.join(' → ')}.`),
            go: { lesson: 'graph-search', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'ds-mst-01',
    subject: 'ds',
    chapter: 'graph',
    topic: T('最小生成树', 'Minimum spanning trees'),
    type: 'number',
    difficulty: 2,
    lessons: ['mst'],
    tags: ['计算'],
    make(r) {
      const graph = randGraph(r, 6, 4, true);
      const algo = r.pick(['prim', 'kruskal']);
      const params = { graph, algo, start: 'A' };
      const l = L('mst', params);
      const s = l.sim;
      const picks = s.steps.filter((x) => x.pick && x.ok !== false).map((x) => `${x.pick.u}-${x.pick.v}(${x.pick.w})`);
      return {
        question: T(`带权无向图的边为 ${graph}（数字是权值）。它的最小生成树的权值之和是多少？`, `Weighted edges ${graph}. What is the total weight of a minimum spanning tree?`),
        answer: { value: s.total },
        steps: [
          {
            text: T(`用 ${algo === 'prim' ? 'Prim 算法从 A 出发，每次加入连接树内外的最小边' : 'Kruskal 算法，按权值从小到大选不构成回路的边'}：依次选 ${picks.join('、')}。`, `${algo}: ${picks.join(', ')}.`),
            go: { lesson: 'mst', params, step: last(l) },
          },
          {
            text: T(`6 个顶点选 5 条边，权值和 ${s.total}。最小生成树可能不唯一，但权值和唯一。`, `Total ${s.total}; the tree may not be unique but its weight is.`),
            go: { lesson: 'mst', doc: 'def' },
          },
        ],
      };
    },
  },
  {
    id: 'ds-cp-01',
    subject: 'ds',
    chapter: 'graph',
    topic: T('关键路径', 'Critical paths'),
    type: 'number',
    difficulty: 2,
    lessons: ['critical-path'],
    tags: ['计算'],
    make(r) {
      const graph = randAoe(r, 6);
      const params = { graph };
      const l = L('critical-path', params);
      const s = l.sim;
      return {
        question: T(`AOE 网的边为 ${graph}（A>B 3 表示活动 A→B 要 3 天）。完成整个工程至少需要多少天？`, `AOE edges ${graph}. What is the shortest project duration?`),
        answer: { value: s.length },
        steps: [
          {
            text: T(`按拓扑序算各事件的最早发生时间 ve：${s.V.map((v) => `${v}=${s.ve[v]}`).join('，')}。`, `ve: ${s.V.map((v) => `${v}=${s.ve[v]}`).join(', ')}.`),
            go: { lesson: 'critical-path', params, step: 1 },
          },
          {
            text: T(`汇点的 ve 就是工程的最短工期：${s.length} 天。关键活动是 ${s.critical.map((a) => `${a.u}→${a.v}`).join('、')}。`, `Duration ${s.length}; critical: ${s.critical.map((a) => `${a.u}→${a.v}`).join(', ')}.`),
            go: { lesson: 'critical-path', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'ds-cp-02',
    subject: 'ds',
    chapter: 'graph',
    topic: T('关键路径', 'Critical paths'),
    type: 'number',
    difficulty: 3,
    lessons: ['critical-path'],
    tags: ['计算'],
    make(r) {
      for (;;) {
        const graph = randAoe(r, 6);
        const params = { graph };
        const l = L('critical-path', params);
        const s = l.sim;
        const slack = s.acts.filter((a) => a.d > 0);
        if (!slack.length) continue;
        const a = r.pick(slack);
        return {
          question: T(`AOE 网的边为 ${graph}。活动 ${a.u}→${a.v} 的最迟开始时间 l 是多少？`, `AOE edges ${graph}. What is the latest start time l of activity ${a.u}→${a.v}?`),
          answer: { value: a.l },
          steps: [
            {
              text: T(`先倒着算各事件的最迟发生时间 vl：${s.V.map((v) => `${v}=${s.vl[v]}`).join('，')}。`, `vl: ${s.V.map((v) => `${v}=${s.vl[v]}`).join(', ')}.`),
              go: { lesson: 'critical-path', params, step: 2 },
            },
            {
              text: T(`活动的最迟开始时间 = 终点事件的 vl − 活动时间：l = vl(${a.v}) − ${a.w} = ${s.vl[a.v]} − ${a.w} = ${a.l}。它的最早开始时间 e = ve(${a.u}) = ${a.e}，时间余量 ${a.d}，不是关键活动。`, `l = vl(${a.v}) − ${a.w} = ${a.l}; e = ${a.e}; slack ${a.d}.`),
              go: { lesson: 'critical-path', doc: 'four' },
            },
          ],
        };
      }
    },
  },
  {
    id: 'ds-floyd-01',
    subject: 'ds',
    chapter: 'graph',
    topic: T('Floyd 算法', 'Floyd’s algorithm'),
    type: 'number',
    difficulty: 2,
    lessons: ['floyd'],
    tags: ['计算'],
    make(r) {
      for (;;) {
        const V = 'ABCD'.split('');
        const E = new Map();
        for (let t = 0; t < 7; t++) {
          const a = r.pick(V);
          const b = r.pick(V);
          if (a !== b) E.set(`${a}>${b}`, r.int(1, 9));
        }
        const graph = [...E].map(([k, w]) => `${k} ${w}`).join(', ');
        const params = { graph };
        const l = L('floyd', params);
        if (l.errors?.length) continue;
        const s = l.sim;
        const pairs = [];
        s.V.forEach((a, i) => s.V.forEach((b, j) => i !== j && Number.isFinite(s.A[i][j]) && !E.has(`${a}>${b}`) && pairs.push([i, j])));
        if (!pairs.length) continue;
        const [i, j] = r.pick(pairs);
        return {
          question: T(`有向图的边为 ${graph}。用 Floyd 算法求出所有顶点之间的最短路径后，${s.V[i]} 到 ${s.V[j]} 的最短路径长度是多少？`, `Directed edges ${graph}. After Floyd’s algorithm, what is the shortest distance from ${s.V[i]} to ${s.V[j]}?`),
          answer: { value: s.A[i][j] },
          steps: [
            {
              text: T(`${s.V[i]} 到 ${s.V[j]} 没有直接的边，要经过中转点。Floyd 依次以 ${s.V.join('、')} 为中转点更新距离矩阵。`, 'No direct edge; Floyd tries each vertex as a stopover.'),
              go: { lesson: 'floyd', doc: 'idea' },
            },
            {
              text: T(`最后的矩阵里 A[${s.V[i]}][${s.V[j]}] = ${s.A[i][j]}。`, `Final A[${s.V[i]}][${s.V[j]}] = ${s.A[i][j]}.`),
              go: { lesson: 'floyd', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  // ───── 栈、队列和数组 ─────
  {
    id: 'ds-infix-01',
    subject: 'ds',
    chapter: 'stack',
    topic: T('中缀转后缀', 'Infix to postfix'),
    type: 'text',
    difficulty: 2,
    lessons: ['infix'],
    tags: ['过程推演'],
    make(r) {
      const d = () => String(r.int(1, 9));
      const op = () => r.pick(['+', '-', '*', '/']);
      const forms = [() => `${d()}${op()}${d()}${op()}(${d()}${op()}${d()})`, () => `(${d()}${op()}${d()})${op()}${d()}${op()}${d()}`, () => `${d()}${op()}(${d()}${op()}${d()}${op()}${d()})${op()}${d()}`, () => `${d()}${op()}${d()}${op()}${d()}${op()}${d()}`];
      const expr = r.pick(forms)();
      const params = { expr };
      const l = L('infix', params);
      const s = l.sim;
      return {
        question: T(`把中缀表达式 ${expr} 转换成后缀表达式。`, `Convert ${expr} to postfix.`),
        answer: seq(s.postfix),
        steps: [
          {
            text: T('从左往右扫描：数字直接输出；运算符先把栈里优先级不低于它的弹出输出，再入栈；左括号入栈，遇到右括号弹到左括号为止。', 'Operands go out; operators pop equal-or-higher ones first; parentheses bracket the stack.'),
            go: { lesson: 'infix', doc: 'conv' },
          },
          {
            text: T(`得到 ${s.postfix.join(' ')}。`, `Result: ${s.postfix.join(' ')}.`),
            go: {
              lesson: 'infix',
              params,
              step: Math.min(last(l), s.toks.length),
            },
          },
        ],
      };
    },
  },
  {
    id: 'ds-matrix-01',
    subject: 'ds',
    chapter: 'stack',
    topic: T('特殊矩阵的压缩存储', 'Compressed special matrices'),
    type: 'number',
    difficulty: 2,
    lessons: ['matrix'],
    tags: ['计算'],
    conv: T('矩阵下标 i、j 从 1 开始；一维数组 B 的下标从 0 开始；按行优先存储（对称矩阵存下三角）。', 'i, j from 1; B from 0; row-major (symmetric: lower triangle).'),
    make(r) {
      for (;;) {
        const kind = r.pick(['sym', 'lower', 'upper', 'tri']);
        const n = r.int(5, 10);
        const i = r.int(1, n);
        const j = r.int(1, n);
        const params = { kind, n, i, j };
        const l = L('matrix', params);
        if (l.errors?.length || !(l.sim.k >= 0)) continue;
        const s = l.sim;
        const name = {
          sym: T('对称矩阵', 'symmetric'),
          lower: T('下三角矩阵', 'lower triangular'),
          upper: T('上三角矩阵', 'upper triangular'),
          tri: T('三对角矩阵', 'tridiagonal'),
        }[kind];
        return {
          question: T(`${n} 阶${name.zh}按压缩存储方式存到一维数组 B 中，元素 a[${i}][${j}] 存在 B 的第几号单元（下标）？`, `An order-${n} ${name.en} matrix is stored compactly in B. At which index of B is a[${i}][${j}]?`),
          answer: { value: s.k },
          steps: [
            {
              text: T(`${kind === 'sym' && i < j ? `对称矩阵只存下三角，a[${i}][${j}] = a[${j}][${i}]。` : ''}数一数按行优先排在它前面有几个元素。`, 'Count the stored elements before it, row by row.'),
              go: { lesson: 'matrix', doc: 'special' },
            },
            {
              text: T(`算得下标 ${s.k}。`, `Index ${s.k}.`),
              go: { lesson: 'matrix', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  // ───── 树 ─────
  {
    id: 'ds-rebuild-01',
    subject: 'ds',
    chapter: 'tree',
    topic: T('由遍历序列还原二叉树', 'Rebuilding a binary tree'),
    type: 'text',
    difficulty: 2,
    lessons: ['bt-rebuild'],
    tags: ['过程推演'],
    make(r) {
      const t = randTree(r, r.int(6, 8)).root;
      const order = pre(t);
      const inorder = ino(t);
      const params = {
        mode: 'pre',
        order: order.join(' '),
        inorder: inorder.join(' '),
      };
      const l = L('bt-rebuild', params);
      const ans = post(l.sim.root);
      return {
        question: T(`一棵二叉树的先序序列是 ${order.join(' ')}，中序序列是 ${inorder.join(' ')}。它的后序序列是什么？`, `Preorder ${order.join(' ')}, inorder ${inorder.join(' ')}. What is the postorder?`),
        answer: seq(ans),
        steps: [
          {
            text: T(`先序第一个 ${order[0]} 是根；在中序里找到 ${order[0]}，左边是左子树、右边是右子树，再对两边递归。`, `${order[0]} is the root; split the inorder around it and recurse.`),
            go: { lesson: 'bt-rebuild', doc: 'rebuild' },
          },
          {
            text: T(`还原出树后，按「左、右、根」读出后序：${ans.join(' ')}。`, `Postorder: ${ans.join(' ')}.`),
            go: { lesson: 'bt-rebuild', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'ds-thread-01',
    subject: 'ds',
    chapter: 'tree',
    topic: T('线索二叉树', 'Threaded binary trees'),
    type: 'single',
    difficulty: 2,
    lessons: ['thread'],
    tags: ['概念'],
    make(r) {
      const { level } = randTree(r, r.int(6, 7));
      const order = r.pick(['in', 'pre', 'post']);
      const params = { tree: level, order };
      const l = L('thread', params);
      const th = r.pick(l.sim.threads);
      const right = th.to?.val ?? 'NULL';
      const names = level.split(' ').filter((x) => x !== '#');
      const others = r.shuffle([...names, 'NULL'].filter((x) => x !== right && x !== th.from.val)).slice(0, 3);
      const { options, answer } = shuffled(r, right, others);
      const oname = {
        in: T('中序', 'inorder'),
        pre: T('先序', 'preorder'),
        post: T('后序', 'postorder'),
      }[order];
      const sideName = th.side === 'l' ? T('左（前驱）线索', 'left (predecessor) thread') : T('右（后继）线索', 'right (successor) thread');
      return {
        question: T(`二叉树按层序给出为 ${level}（# 表示空孩子，空位置下面不再列出）。把它${oname.zh}线索化后，结点 ${th.from.val} 的${sideName.zh}指向哪个结点？`, `Level order ${level}. After ${oname.en} threading, where does ${th.from.val}’s ${sideName.en} point?`),
        options,
        answer,
        steps: [
          {
            text: T(`先写出${oname.zh}序列：${l.sim.seq.map((x) => x.val).join(' ')}。`, `${oname.en}: ${l.sim.seq.map((x) => x.val).join(' ')}.`),
            go: { lesson: 'thread', params, step: 0 },
          },
          {
            text: T(`${th.from.val} 的${th.side === 'l' ? '左' : '右'}孩子为空，线索指向它在这个序列里的${th.side === 'l' ? '前驱' : '后继'}：${right}${right === 'NULL' ? '（它是序列的' + (th.side === 'l' ? '第一个' : '最后一个') + '）' : ''}。`, `It points to the ${th.side === 'l' ? 'predecessor' : 'successor'}: ${right}.`),
            go: { lesson: 'thread', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'ds-forest-01',
    subject: 'ds',
    chapter: 'tree',
    topic: T('树、森林与二叉树的转换', 'Forests and binary trees'),
    type: 'single',
    difficulty: 2,
    lessons: ['forest'],
    tags: ['概念'],
    make(r) {
      // 随机森林：2～3 棵树，结点名依次取字母
      for (;;) {
        let next = 0;
        const tree = (depth) => {
          const v = LET[next++];
          const k = depth < 2 && next < 8 ? r.int(0, 3) : 0;
          const kids = [];
          for (let i = 0; i < k && next < 9; i++) kids.push(tree(depth + 1));
          return kids.length ? `${v}(${kids.join(',')})` : v;
        };
        const trees = [];
        const cnt = r.int(2, 3);
        for (let i = 0; i < cnt && next < 9; i++) trees.push(tree(0));
        const forest = trees.join(' ');
        const params = { forest };
        const l = L('forest', params);
        const nodes = [];
        const walk = (t) => t && (nodes.push(t), walk(t.l), walk(t.r));
        walk(l.sim.bin);
        if (nodes.length < 6) continue;
        const x = r.pick(nodes);
        const side = r.pick(['l', 'r']);
        const right = x[side]?.val ?? T('没有（空）', 'none').zh;
        const others = r.shuffle([...nodes.map((n) => n.val), T('没有（空）', 'none').zh].filter((v) => v !== right && v !== x.val)).slice(0, 3);
        const { options, answer } = shuffled(r, right, others);
        return {
          question: T(`森林 ${forest}（括号里是孩子）按「左孩子右兄弟」转换成二叉树后，结点 ${x.val} 的${side === 'l' ? '左' : '右'}孩子是？`, `Forest ${forest} becomes a binary tree by first-child / next-sibling. What is ${x.val}’s ${side === 'l' ? 'left' : 'right'} child?`),
          options,
          answer,
          steps: [
            {
              text: T('左孩子 = 原来的第一个孩子；右孩子 = 原来的下一个兄弟（各棵树的根互为兄弟）。', 'Left = first child; right = next sibling (roots are siblings).'),
              go: { lesson: 'forest', doc: 'conv' },
            },
            {
              text: T(`所以 ${x.val} 的${side === 'l' ? '左' : '右'}孩子是 ${right}。`, `So it is ${right}.`),
              go: { lesson: 'forest', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  {
    id: 'ds-uf-01',
    subject: 'ds',
    chapter: 'tree',
    topic: T('并查集', 'Union–find'),
    type: 'number',
    difficulty: 2,
    lessons: ['union-find'],
    tags: ['过程推演'],
    conv: T('根结点存 −集合大小；小树并到大树下，一样大时第二个元素的根并到第一个元素的根下。', 'Roots store −size; smaller under larger; ties: second root under the first.'),
    make(r) {
      const n = 8;
      const ops = [];
      for (let i = 0; i < 5; i++) {
        const a = r.int(0, n - 1);
        let b = r.int(0, n - 1);
        if (b === a) b = (a + 1) % n;
        ops.push(`U ${a} ${b}`);
      }
      const x = r.int(0, n - 1);
      ops.push(`F ${x}`);
      const params = { n, ops: ops.join(', '), compress: false };
      const l = L('union-find', params);
      const fin = l.sim.steps.at(-1);
      return {
        question: T(`0～${n - 1} 共 ${n} 个元素，开始各自一个集合。依次执行 ${ops.slice(0, -1).join('、')}（U a b 表示合并 a、b 所在的集合，按大小合并）。Find(${x}) 返回的根是几？`, `Elements 0–${n - 1}; run ${ops.slice(0, -1).join(', ')} (union by size). What does Find(${x}) return?`),
        answer: { value: fin.root },
        steps: [
          {
            text: T('每次合并先各自找到根，小集合的根挂到大集合的根下面。', 'Find both roots; hang the smaller under the larger.'),
            go: { lesson: 'union-find', doc: 'union' },
          },
          {
            text: T(`最后的 S 数组是 [${fin.S.join(', ')}]，从 ${x} 沿双亲往上走 ${fin.path.join(' → ')}，根是 ${fin.root}。`, `S = [${fin.S.join(', ')}]; path ${fin.path.join(' → ')}.`),
            go: { lesson: 'union-find', params, step: last(l) },
          },
        ],
      };
    },
  },
  // ───── 查找 ─────
  {
    id: 'ds-bst-01',
    subject: 'ds',
    chapter: 'search',
    topic: T('二叉排序树', 'Binary search trees'),
    type: 'number',
    difficulty: 1,
    lessons: ['bst'],
    tags: ['过程推演'],
    make(r) {
      const keys = r.shuffle(Array.from({ length: 40 }, (_, i) => (i + 1) * 3)).slice(0, r.int(7, 9));
      const params = { ops: keys.join(' ') };
      const l = L('bst', params);
      const st = l.sim.steps.filter((s) => s.op === 'ins');
      const pick = r.pick(st.slice(1));
      return {
        question: T(`依次插入 ${keys.join(' ')} 建立二叉排序树。查找 ${pick.k} 成功时要比较几次关键字？`, `Insert ${keys.join(' ')} into a BST. How many comparisons does a successful search for ${pick.k} take?`),
        answer: { value: pick.path.length },
        steps: [
          {
            text: T('比根小往左、比根大往右，比较次数等于它所在的层数。', 'Comparisons equal the node’s level.'),
            go: { lesson: 'bst', doc: 'asl' },
          },
          {
            text: T(`查找路径 ${pick.path.join(' → ')}，比较 ${pick.path.length} 次。`, `Path ${pick.path.join(' → ')}: ${pick.path.length}.`),
            go: { lesson: 'bst', params, step: l.sim.steps.indexOf(pick) },
          },
        ],
      };
    },
  },
  {
    id: 'ds-btree-01',
    subject: 'ds',
    chapter: 'search',
    topic: T('B 树的插入', 'B-tree insertion'),
    type: 'number',
    difficulty: 3,
    lessons: ['btree'],
    tags: ['过程推演'],
    conv: T('3 阶 B 树（每个结点最多 2 个关键字）；上溢时中间的关键字上移。', 'Order-3 B-tree (at most 2 keys); the middle key moves up on overflow.'),
    make(r) {
      const keys = r.shuffle(Array.from({ length: 60 }, (_, i) => i + 10)).slice(0, r.int(7, 9));
      const params = { m: 3, ops: keys.join(' ') };
      const l = L('btree', params);
      const s = l.sim;
      const splits = s.steps.filter((x) => x.kind === 'split').length;
      const h = height(s.tree);
      return {
        question: T(`从空树开始，依次把 ${keys.join(' ')} 插入一棵 3 阶 B 树。插完后这棵 B 树有几层（不算叶子下面的空结点）？`, `Insert ${keys.join(' ')} into an empty order-3 B-tree. How many levels does it have?`),
        answer: { value: h },
        steps: [
          {
            text: T('3 阶 B 树每个结点最多 2 个关键字，插入第 3 个就要分裂：中间的关键字上移到双亲；根分裂时树长高一层。', 'A third key splits the node; a root split adds a level.'),
            go: { lesson: 'btree', doc: 'insert' },
          },
          {
            text: T(`一共分裂 ${splits} 次，最后 ${h} 层，根是 [${s.tree.keys.join(', ')}]。`, `${splits} splits; ${h} levels.`),
            go: { lesson: 'btree', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'ds-btree-02',
    subject: 'ds',
    chapter: 'search',
    topic: T('B 树的性质', 'B-tree properties'),
    type: 'number',
    difficulty: 1,
    lessons: ['btree'],
    tags: ['计算'],
    make(r) {
      const m = r.int(3, 10);
      const root = r.next() < 0.3;
      const ans = root ? 1 : Math.ceil(m / 2) - 1;
      return {
        question: T(`一棵 ${m} 阶 B 树中，${root ? '根结点（非空树、且不是叶子）' : '除根以外的非叶结点'}至少有几个关键字？`, `In an order-${m} B-tree, at least how many keys does ${root ? 'the (non-leaf) root' : 'a non-root internal node'} have?`),
        answer: { value: ans },
        steps: [
          {
            text: root ? T('根结点至少 1 个关键字（至少两棵子树）。', 'The root has at least one key.') : T(`非根结点至少 ⌈m/2⌉ − 1 = ⌈${m}/2⌉ − 1 = ${ans} 个关键字，最多 m − 1 = ${m - 1} 个。`, `At least ⌈m/2⌉ − 1 = ${ans}.`),
            go: { lesson: 'btree', doc: 'def' },
          },
        ],
      };
    },
  },
  // ───── 排序 ─────
  {
    id: 'ds-heap-01',
    subject: 'ds',
    chapter: 'sort',
    topic: T('建堆', 'Building a heap'),
    type: 'text',
    difficulty: 2,
    lessons: ['heap'],
    tags: ['过程推演'],
    make(r) {
      const keys = r.shuffle(Array.from({ length: 89 }, (_, i) => i + 10)).slice(0, 8);
      const kind = r.pick(['max', 'min']);
      const params = { keys, kind, op: 'build' };
      const l = L('heap', params);
      const s = l.sim;
      return {
        question: T(`对序列 ${keys.join(' ')} 用筛选法建${kind === 'max' ? '大' : '小'}根堆，得到的堆（按数组顺序）是？`, `Heapify ${keys.join(' ')} into a ${kind}-heap. What is the array?`),
        answer: seq(s.heap),
        steps: [
          {
            text: T(`从最后一个非叶结点（第 ⌊n/2⌋ = ${Math.floor(keys.length / 2)} 个）开始往前，对每个结点向下调整。`, `Sift down from position ⌊n/2⌋ backwards.`),
            go: { lesson: 'heap', doc: 'build' },
          },
          {
            text: T(`调整完得到 ${s.heap.join(' ')}。`, `Result: ${s.heap.join(' ')}.`),
            go: { lesson: 'heap', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'ds-heap-02',
    subject: 'ds',
    chapter: 'sort',
    topic: T('建堆的比较次数', 'Comparisons when heapifying'),
    type: 'number',
    difficulty: 3,
    lessons: ['heap'],
    tags: ['计算'],
    conv: T('向下调整时：有两个孩子先比两个孩子（1 次），再拿较大（小根堆为较小）的孩子和结点比（1 次）；只有一个孩子比 1 次。', 'Two children: compare them (1), then with the node (1); one child: 1.'),
    make(r) {
      const keys = r.shuffle(Array.from({ length: 89 }, (_, i) => i + 10)).slice(0, r.int(6, 8));
      const params = { keys, kind: 'max', op: 'build' };
      const l = L('heap', params);
      const s = l.sim;
      return {
        question: T(`对序列 ${keys.join(' ')} 建大根堆，一共要比较多少次关键字？`, `Heapify ${keys.join(' ')} into a max-heap: how many key comparisons?`),
        answer: { value: s.total },
        steps: [
          {
            text: T(
              `依次对第 ${Math.floor(keys.length / 2)}、…、1 个结点向下调整，各次比较次数：${s.steps
                .filter((x) => x.type === 'sift')
                .map((x) => x.cmp)
                .join('、')}。`,
              `Per node: ${s.steps
                .filter((x) => x.type === 'sift')
                .map((x) => x.cmp)
                .join(', ')}.`,
            ),
            go: { lesson: 'heap', params, step: last(l) },
          },
          {
            text: T(`合计 ${s.total} 次。`, `Total ${s.total}.`),
            go: { lesson: 'heap', doc: 'build' },
          },
        ],
      };
    },
  },
  {
    id: 'ds-ext-01',
    subject: 'ds',
    chapter: 'sort',
    topic: T('最佳归并树', 'Optimal merge trees'),
    type: 'number',
    difficulty: 3,
    lessons: ['ext-sort'],
    tags: ['计算'],
    conv: T('段长以块为单位；每次取最小的 k 个合并；段数不够时补长度为 0 的虚段。', 'Lengths in blocks; merge the k smallest; pad with zero-length dummies.'),
    make(r) {
      const n = r.int(6, 9);
      const lens = Array.from({ length: n }, () => r.int(2, 30));
      const k = r.pick([2, 3]);
      const params = {
        ...lessonById('ext-sort').params,
        mode: 'best',
        lens,
        k,
      };
      const l = L('ext-sort', params);
      const b = l.sim.best;
      return {
        question: T(`${n} 个初始归并段的长度（块数）为 ${lens.join('、')}，做 ${k} 路归并。最佳归并树的带权路径长度 WPL 是多少？`, `${n} runs of ${lens.join(', ')} blocks, ${k}-way merging. What is the WPL of the optimal merge tree?`),
        answer: { value: b.wpl },
        steps: [
          {
            text: T(`${b.dummies ? `(${n} − 1) mod (${k} − 1) ≠ 0，先补 ${b.dummies} 个虚段；` : ''}每次取最小的 ${k} 个合并：${b.steps.map((s) => s.take.join('+') + '=' + s.sum).join('，')}。`, b.steps.map((s) => s.take.join('+') + '=' + s.sum).join(', ')),
            go: { lesson: 'ext-sort', params, step: last(l) },
          },
          {
            text: T(`WPL = 所有合并结果之和 = ${b.wpl}；读写外存的块数是 2 × WPL = ${b.io}。`, `WPL ${b.wpl}; I/O ${b.io}.`),
            go: { lesson: 'ext-sort', doc: 'best' },
          },
        ],
      };
    },
  },
  {
    id: 'ds-ext-02',
    subject: 'ds',
    chapter: 'sort',
    topic: T('置换—选择排序', 'Replacement selection'),
    type: 'number',
    difficulty: 3,
    lessons: ['ext-sort'],
    tags: ['过程推演'],
    make(r) {
      const keys = r.shuffle(Array.from({ length: 90 }, (_, i) => i + 1)).slice(0, r.int(12, 16));
      const w = r.int(2, 4);
      const params = { ...lessonById('ext-sort').params, mode: 'rs', keys, w };
      const l = L('ext-sort', params);
      const rs = l.sim.rs;
      return {
        question: T(`用置换—选择排序生成初始归并段，工作区能放 ${w} 个记录。输入 ${keys.join(' ')}，一共得到几个初始归并段？`, `Replacement selection with a workspace of ${w}: input ${keys.join(' ')}. How many runs?`),
        answer: { value: rs.runs.length },
        steps: [
          {
            text: T('每次输出工作区里不小于上一个输出值的最小记录；工作区里都比它小了，就结束当前段、开始新段。', 'Output the smallest key not below the last output; when none qualifies, start a new run.'),
            go: { lesson: 'ext-sort', doc: 'rs' },
          },
          {
            text: T(`得到 ${rs.runs.length} 段：${rs.runs.map((x) => `(${x.join(' ')})`).join(' ')}。`, `${rs.runs.length} runs.`),
            go: { lesson: 'ext-sort', params, step: last(l) },
          },
        ],
      };
    },
  },
];
