// 树这一章的四节课：哈夫曼树、并查集、线索二叉树、树和森林与二叉树的转换。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { errOf, node, stepKit, toSteps } from '../../core/steps.js';
import { gridTable } from './graph.js';
import { fromLevel, layout, treeItems } from './tree.js';
import { forestOf, forestPost, forestPre, huffman, ino, parseForest, parseUf, pre, thread, toBinary, unionFind } from './trees2.js';

const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
function make(id, spec, ERR, build) {
  const kit = stepKit({ spec, rowsName: T('过程', 'Steps') });
  return () => parametric(id, spec.presets[0].set, (p) => build(p, kit, ERR));
}
function shell(id, kit, ERR, sim, o) {
  return { id, kit, where: [['ds', 'tree']], tag: o.tag, name: o.name, full: o.full, title: o.title, nodes: [], legend: o.legend, principle: o.principle, sim, errors: sim.ok ? [] : errOf(ERR, sim.errors), overview: { desc: o.desc, facts: [] }, start: { nodes: [], frame: { rect: o.rect ?? [0, 40, 900, 520] }, events: [] }, steps: [], outro: { title: '', text: '', facts: [] } };
}
function finish(lesson, list, board, title, text, facts = []) {
  const b = toSteps(list, board);
  lesson.steps = b.steps;
  lesson.start.events = b.start;
  lesson.outro = { title, text, facts };
  return lesson;
}

/** 一般树 / 森林的平面布局：叶子从左到右排，父结点在孩子们正中间。结点 { id, val, kids } */
function forestLayout(trees, { x0 = 80, y0 = 140, dx = 56, dy = 76, gap = 1 } = {}) {
  const pos = new Map();
  let i = 0;
  const go = (n, d) => {
    if (!n.kids.length) pos.set(n, [x0 + i++ * dx, y0 + d * dy]);
    else {
      n.kids.forEach((c) => go(c, d + 1));
      pos.set(n, [(pos.get(n.kids[0])[0] + pos.get(n.kids.at(-1))[0]) / 2, y0 + d * dy]);
    }
  };
  trees.forEach((t) => {
    go(t, 0);
    i += gap;
  });
  return { pos, width: i * dx };
}
function forestItems(trees, opt = {}) {
  const { pos } = forestLayout(trees, opt);
  let edges = '';
  for (const [n, [x, y]] of pos)
    n.kids.forEach((c, j) => {
      const [cx, cy] = pos.get(c);
      const len = Math.hypot(cx - x, cy - y);
      edges += `<line class="te ${opt.edgeCls?.(n, c, j) ?? ''}" x1="${(x + ((cx - x) / len) * 19).toFixed(1)}" y1="${(y + ((cy - y) / len) * 19).toFixed(1)}" x2="${(cx - ((cx - x) / len) * 19).toFixed(1)}" y2="${(cy - ((cy - y) / len) * 19).toFixed(1)}"/>`;
    });
  const items = [{ k: 'tree-edges', x: 0, y: 0, html: edges + (opt.extra?.(pos) ?? '') }];
  for (const [n, [x, y]] of pos) {
    const tag = opt.tag?.(n);
    items.push({ k: `tn-${n.id}`, x, y, html: node(String(n.val), { cls: opt.cls?.(n) ?? '', tone: opt.tone?.(n) ?? '' }) + (tag != null ? txt(0, 36, String(tag), 'tn-tag') : '') });
  }
  return { items, pos };
}

// ═════════════════════════ 哈夫曼树 ═════════════════════════

const HF_PRINCIPLE = {
  sections: [
    {
      id: 'wpl',
      title: T('带权路径长度', 'Weighted path length'),
      blocks: [
        { p: T('结点的**带权路径长度** = 从根到它的路径长度（边数）× 它的权值。树的**带权路径长度 WPL** = 所有叶结点的带权路径长度之和。n 个带权叶结点构成的二叉树中，WPL 最小的叫**哈夫曼树**（最优二叉树）。', 'A leaf’s weighted path length is depth × weight; **WPL** sums over leaves. The binary tree of minimum WPL is the **Huffman tree**.') },
      ],
    },
    {
      id: 'build',
      title: T('构造方法', 'Construction'),
      blocks: [
        {
          steps: [
            T('把 n 个结点各看成一棵只有根的树，组成森林；', 'start with n single-node trees;'),
            T('选出根权值最小的两棵树，作为左右子树构成一棵新树，新根的权值是两者之和；', 'join the two lightest trees under a new root whose weight is their sum;'),
            T('从森林中删去这两棵，加入新树；', 'replace them by the new tree;'),
            T('重复 n − 1 次，剩下的一棵就是哈夫曼树。', 'repeat n − 1 times.'),
          ],
        },
        {
          list: [
            T('哈夫曼树一共 2n − 1 个结点，**没有度为 1 的结点**；', '2n − 1 nodes, **no node of degree 1**;'),
            T('权值越小的叶子离根越远；', 'lighter leaves sit deeper;'),
            T('左右子树交换后仍是哈夫曼树，所以树的形状、编码不唯一，但 WPL 唯一。', 'swapping subtrees keeps it optimal, so shape and codes vary but WPL does not.'),
          ],
        },
      ],
    },
    {
      id: 'code',
      title: T('哈夫曼编码', 'Huffman coding'),
      blocks: [
        { p: T('把每个字符的出现频率作为权值构造哈夫曼树，左分支记 0、右分支记 1，从根到叶的 0/1 串就是这个字符的编码。它是**前缀编码**——没有哪个编码是另一个编码的前缀，所以解码不会有歧义。', 'With frequencies as weights and 0/1 on left/right branches, root-to-leaf strings are **prefix codes**: none is a prefix of another.') },
        { formula: T('编码总长度（比特数）= WPL（以出现次数作权值时）', 'total encoded bits = WPL (weights = counts)') },
        { tip: T('和等长编码比较：n 个字符的等长编码需要 ⌈log₂n⌉ 位，题目常问「哈夫曼编码比等长编码节省多少」。', 'Fixed-length codes need ⌈log₂n⌉ bits; exams ask how much Huffman saves.') },
      ],
    },
    pit([
      T('WPL 只算叶结点，不算新生成的内部结点。', 'WPL counts leaves only.'),
      T('每次选的是森林里**所有**根中最小的两个，包括新生成的树。', 'Pick from **all** roots, new ones included.'),
      T('判断一组编码是不是前缀编码：画成二叉树，看编码是否都在叶子上。', 'Prefix codes all sit at leaves.'),
    ]),
  ],
};
const HF_SPEC = {
  presets: [
    { label: T('4 个权值', 'Four weights'), set: { weights: [7, 5, 2, 4] } },
    { label: T('字符频率', 'Character frequencies'), set: { weights: [45, 13, 12, 16, 9, 5] } },
  ],
  groups: [{ legend: T('权值', 'Weights'), fields: [{ name: 'weights', label: T('各叶结点的权值（2～12 个，正数）', 'Leaf weights (2–12)'), type: 'list', min: 1, max: 9999, maxLen: 12, wide: true }] }],
  note: T('小的作左子树；权值相同时先生成的在左。左分支 0，右分支 1。', 'Lighter on the left; ties: older on the left. Left 0, right 1.'),
};
const HF_ERR = { weights: T('要 2～12 个正的权值', 'Give 2–12 positive weights') };
const toKids = (t) => ({ id: t.id, val: t.val, leaf: t.leaf, idx: t.idx, kids: t.leaf ? [] : [toKids(t.l), toKids(t.r)] });
function hfBoard(sim, k, z, final) {
  const trees = k < 0 ? sim.weights.map((w, i) => ({ id: `h${i}`, val: w, leaf: true, idx: i, kids: [] })) : sim.steps[k].forest.map(toKids);
  const cur = k >= 0 ? sim.steps[k].node : null;
  const { items, pos } = forestItems(trees, {
    x0: 80,
    y0: 140,
    cls: (n) => (n.id === cur ? 'hot' : ''),
    tone: (n) => (n.leaf ? 'teal' : ''),
    tag: (n) => (final && n.leaf ? sim.codes[n.idx] : null),
    extra: (p) => {
      if (!final) return '';
      let h = '';
      for (const [n, [x, y]] of p) n.kids.forEach((c, j) => { const [cx, cy] = p.get(c); h += txt((x + cx) / 2 + (j ? 9 : -9), (y + cy) / 2, j ? '1' : '0', 'hf-bit'); });
      return h;
    },
  });
  const W = Math.max(...[...pos.values()].map((p) => p[0]));
  if (final) {
    const head = [z ? '权值' : 'weight', ...sim.weights];
    const rows = [[z ? '编码' : 'code', ...sim.codes], [z ? '码长' : 'bits', ...sim.codes.map((c) => c.length)]];
    items.push({ k: 'codes', x: W + 70, y: 150, html: gridTable(head, rows, { cw: 52, first: 60 }) + txt(0, 120, `WPL = ${sim.weights.map((w, i) => `${w}×${sim.codes[i].length}`).join(' + ')} = ${sim.wpl}`, 'bt-lab', 'start') });
  }
  return items;
}
function buildHf(p, kit, ERR) {
  const sim = huffman(p);
  const lesson = shell('huffman', kit, ERR, sim, {
    tag: T('哈夫', 'Huff'),
    name: T('哈夫曼树与哈夫曼编码', 'Huffman trees and codes'),
    full: T('带权路径长度 WPL · 每次合并最小的两棵 · 前缀编码', 'WPL · merge the two lightest · prefix codes'),
    title: sim.ok ? T(`${sim.weights.length} 个权值`, `${sim.weights.length} weights`) : T('参数有误', 'Invalid parameters'),
    legend: [['teal', T('原始叶结点', 'Leaves')], ['orange', T('新合并的', 'Just merged')]],
    principle: HF_PRINCIPLE,
    desc: T('每次从森林里挑权值最小的两棵树合并，n − 1 次之后就是哈夫曼树。最后给左右分支标上 0、1，得到每个叶子的编码和 WPL。', 'Repeatedly merge the two lightest trees; label branches 0 and 1 for the codes and WPL.'),
    rect: [30, 90, 80 + (sim.ok ? sim.weights.length : 4) * 56 + (sim.ok ? 120 + sim.weights.length * 52 : 200), 140 + (sim.ok ? Math.min(sim.weights.length, 8) : 4) * 76],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => ({
    title: T(`合并 ${s.a} 和 ${s.b} → ${s.sum}`, `Merge ${s.a} and ${s.b} → ${s.sum}`),
    desc: T(`森林剩 ${s.forest.length} 棵`, `${s.forest.length} trees left`),
    detail: T(`现在森林里各棵树的根是 ${[...(sim.steps[k - 1]?.forest ?? sim.weights.map((w) => ({ val: w })))].map((x) => x.val).sort((a, b) => a - b).join('、')}，最小的两个是 ${s.a} 和 ${s.b}，合成一棵根为 ${s.sum} 的新树（${s.a} 在左）。`, `The two smallest roots are ${s.a} and ${s.b}; they join under ${s.sum}.`),
    ref: 'build',
    st: { k },
    row: { color: 'orange', what: `${s.a} + ${s.b}`, result: String(s.sum), tone: 'info' },
  }));
  list.push({ title: T(`哈夫曼编码，WPL = ${sim.wpl}`, `Codes, WPL = ${sim.wpl}`), desc: T('左 0 右 1', 'Left 0, right 1'), detail: T(`从根到每个叶子读出分支上的 0、1：${sim.weights.map((w, i) => `${w}:${sim.codes[i]}`).join('，')}。WPL = ${sim.weights.map((w, i) => `${w}×${sim.codes[i].length}`).join(' + ')} = ${sim.wpl}。`, `Codes: ${sim.weights.map((w, i) => `${w}:${sim.codes[i]}`).join(', ')}. WPL = ${sim.wpl}.`), ref: 'code', st: { k: sim.steps.length - 1, final: true }, row: { color: 'green', what: 'WPL', result: String(sim.wpl), tone: 'ok' } });
  return finish(lesson, list, (k, z) => hfBoard(sim, k < 0 ? -1 : list[k].st.k, z, k >= 0 && list[k].st.final), T(`WPL = ${sim.wpl}`, `WPL = ${sim.wpl}`), T('把两个权值改成一样的，看编码会不会变——WPL 不会变。', 'Make two weights equal: codes may change, WPL will not.'));
}
export const makeHuffman = make('huffman', HF_SPEC, HF_ERR, buildHf);

// ═════════════════════════ 并查集 ═════════════════════════

const UF_PRINCIPLE = {
  sections: [
    {
      id: 'repr',
      title: T('用树表示集合', 'Sets as trees'),
      blocks: [
        { p: T('**并查集**管理若干互不相交的集合，支持两种操作：**Find(x)** 找 x 所在集合（返回根），**Union(a, b)** 把两个集合合并。每个集合用一棵树表示，用双亲表示法存在数组 S 里：S[i] 是 i 的父结点下标，根结点存负数（−集合大小，或简单地存 −1）。', '**Union-find** keeps disjoint sets as trees in a parent array S; roots store a negative value (minus the size).') },
      ],
    },
    {
      id: 'union',
      title: T('合并：小树并到大树', 'Union by size'),
      blocks: [
        { p: T('先找到两个元素的根；根相同说明已在同一集合。否则把一个根挂到另一个根下面。随便挂会让树越来越高，所以**把小树并到大树下**（按大小或按高度），这样树高不超过 ⌊log₂n⌋ + 1，Find 是 O(log n)。', 'Find both roots; if they differ, hang the **smaller tree under the larger**, keeping height O(log n).') },
      ],
    },
    {
      id: 'find',
      title: T('查找：路径压缩', 'Find with path compression'),
      blocks: [
        { p: T('Find 从 x 一路往上走到根。**路径压缩**：顺便把路径上的每个结点都直接挂到根下面，下次再查就只要一步。按大小合并 + 路径压缩后，每次操作的均摊时间几乎是常数（O(α(n))）。', 'Find walks up to the root; **path compression** re-hangs every node on the way directly under the root, making operations nearly constant.') },
        { tip: T('并查集的典型用途：Kruskal 算法判断两个顶点是否已经连通；求无向图的连通分量。', 'Uses: Kruskal’s cycle test, connected components.') },
      ],
    },
    pit([
      T('Union 合并的是两个**根**，不是两个元素本身。', 'Union links **roots**.'),
      T('根结点的 S 值是负数，绝对值是集合大小。', 'A root’s entry is minus its size.'),
    ]),
  ],
};
const UF_SPEC = {
  presets: [
    { label: T('合并与路径压缩', 'Union and compression'), set: { n: 6, ops: 'U 0 1, U 2 3, U 1 3, U 4 5, U 5 3, F 5', compress: true } },
    { label: T('不压缩', 'No compression'), set: { n: 6, ops: 'U 0 1, U 2 3, U 1 3, U 4 5, U 5 3, F 5', compress: false } },
  ],
  groups: [{ legend: T('并查集', 'Union-find'), fields: [
    { name: 'n', label: T('元素个数（编号 0 起）', 'Elements (from 0)'), type: 'int', min: 2, max: 12 },
    { name: 'ops', label: T('操作：U a b 合并，F a 查找，逗号隔开', 'Ops: U a b, F a'), type: 'text', wide: true, parse: (s) => (parseUf(s) ? s : NaN) },
    { name: 'compress', label: T('查找时路径压缩', 'Path compression'), type: 'check' },
  ] }],
  note: T('根结点存 −集合大小。小树并到大树下，一样大时第二个元素的根并到第一个元素的根下。', 'Roots store −size; smaller under larger, ties: the second root under the first.'),
};
const UF_ERR = { n: T('元素个数在 2～12', 'Use 2–12 elements'), ops: T('操作写错了', 'Invalid operations'), range: T('编号超出范围', 'Index out of range') };
function ufBoard(sim, k, z) {
  const s = k >= 0 ? sim.steps[k] : null;
  const S = s ? s.S : Array(sim.n).fill(-1);
  const trees = forestOf(S);
  const hot = new Set([s?.a, s?.b, ...(s?.path ?? [])].filter((x) => x != null).map(String));
  const { items } = forestItems(trees, { x0: 90, y0: 240, dx: 60, cls: (n) => (s && (n.val === String(s.small) || (s.op === 'F' && n.val === String(s.a))) ? 'hot' : hot.has(n.val) ? 'warn' : ''), tone: (n) => (S[+n.val] < 0 ? 'teal' : '') });
  const head = [z ? '下标' : 'i', ...S.map((_, i) => i)];
  items.push({ k: 'arr', x: 90, y: 110, html: gridTable(head, [['S', ...S.map((v, i) => ({ t: v, cls: s && (i === s.small || s.moved?.includes(i)) ? 'hot' : '' }))]], { cw: 44, first: 50 }) });
  return items;
}
function buildUf(p, kit, ERR) {
  const sim = unionFind({ ...p, compress: !!p.compress });
  const lesson = shell('union-find', kit, ERR, sim, {
    tag: T('并查', 'UF'),
    name: T('并查集', 'Union-find'),
    full: T('双亲表示 · Find / Union · 小树并大树 · 路径压缩', 'Parent array · find / union · union by size · compression'),
    title: sim.ok ? T(`${sim.n} 个元素`, `${sim.n} elements`) : T('参数有误', 'Invalid parameters'),
    legend: [['teal', T('根', 'Root')], ['orange', T('这一步改动的', 'Changed')]],
    principle: UF_PRINCIPLE,
    desc: T('上面是并查集的数组 S，下面是它表示的森林。合并时把小树挂到大树的根下；查找时一路往上找根，打开路径压缩就把路上的结点都直接挂到根下。', 'The array S above and the forest it encodes below. Union hangs the smaller tree under the larger root; find walks up and, with compression, flattens the path.'),
    rect: [40, 70, 90 + Math.max(sim.ok ? sim.n : 6, 6) * 60 + 80, 240 + 4 * 76],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => {
    if (s.op === 'F') return { title: T(`Find(${s.a}) = ${s.root}`, `Find(${s.a}) = ${s.root}`), desc: T(`路径 ${s.path.join('→')}`, `Path ${s.path.join('→')}`), detail: s.moved.length ? T(`从 ${s.a} 往上走：${s.path.join(' → ')}，根是 ${s.root}。路径压缩：把 ${s.moved.join('、')} 直接挂到 ${s.root} 下。`, `Path ${s.path.join(' → ')}; compress ${s.moved.join(', ')} under ${s.root}.`) : T(`从 ${s.a} 往上走：${s.path.join(' → ')}，根是 ${s.root}。${sim.compress ? '路径很短，不用压缩。' : '没有开路径压缩，树的形状不变。'}`, `Path ${s.path.join(' → ')}; root ${s.root}.`), ref: 'find', row: { color: 'blue', what: `F ${s.a}`, result: String(s.root), tone: 'info' } };
    if (s.same) return { title: T(`Union(${s.a}, ${s.b})：已在同一集合`, `Union(${s.a}, ${s.b}): same set`), desc: T(`根都是 ${s.ra}`, `Both root ${s.ra}`), detail: T(`${s.a} 的根和 ${s.b} 的根都是 ${s.ra}，不用合并。`, `Both have root ${s.ra}.`), ref: 'union', row: { color: 'slate', what: `U ${s.a} ${s.b}`, result: T('同一集合', 'same'), tone: 'info' } };
    return { title: T(`Union(${s.a}, ${s.b})：${s.small} 挂到 ${s.big} 下`, `Union(${s.a}, ${s.b}): ${s.small} under ${s.big}`), desc: T(`集合大小 ${-s.S[s.big]}`, `Size ${-s.S[s.big]}`), detail: T(`${s.a} 的根是 ${s.ra}（${s.pa.length > 1 ? `路径 ${s.pa.join('→')}` : '它自己'}），${s.b} 的根是 ${s.rb}。${s.small} 那棵不比 ${s.big} 那棵大，把根 ${s.small} 挂到 ${s.big} 下：S[${s.small}] = ${s.big}，S[${s.big}] = ${s.S[s.big]}。`, `Roots ${s.ra} and ${s.rb}; hang ${s.small} under ${s.big}.`), ref: 'union', row: { color: 'orange', what: `U ${s.a} ${s.b}`, result: `${s.small}→${s.big}`, tone: 'info' } };
  });
  return finish(lesson, list, (k, z) => ufBoard(sim, k, z), T('操作完成', 'Done'), T('关掉路径压缩再走一遍，比比最后一次查找前后树的样子。', 'Turn compression off and compare the final tree.'));
}
export const makeUnionFind = make('union-find', UF_SPEC, UF_ERR, buildUf);

// ═════════════════════════ 线索二叉树 ═════════════════════════

const TH_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要线索化', 'Why threads'),
      blocks: [
        { p: T('n 个结点的二叉链表有 2n 个指针，只用了 n − 1 个，剩下 **n + 1 个空指针**。线索化就是利用它们：左指针为空时指向遍历序列中的**前驱**，右指针为空时指向**后继**。这样不用栈也能找到前驱后继、遍历整棵树。', 'A linked binary tree wastes **n + 1 null pointers**. Threads reuse them: an empty left points to the traversal **predecessor**, an empty right to the **successor**.') },
        { p: T('为了区分「指向孩子」和「指向前驱 / 后继」，每个结点加两个标志位 ltag、rtag：0 表示孩子，1 表示线索。', 'Tags ltag and rtag tell children (0) from threads (1).') },
      ],
    },
    {
      id: 'how',
      title: T('线索化的过程', 'Threading'),
      blocks: [
        { p: T('按某种遍历次序遍历，用指针 pre 记住刚访问过的结点。访问结点 p 时：p 的左指针为空，就让它指向 pre（前驱）；pre 的右指针为空，就让它指向 p（后继）。遍历结束后，最后一个结点的右线索指向 NULL。', 'Traverse with a pointer pre to the previous node: an empty p.left points to pre; an empty pre.right points to p.') },
        {
          table: {
            head: [T('线索二叉树', 'Kind'), T('找后继', 'Successor'), T('找前驱', 'Predecessor')],
            rows: [
              [T('中序', 'Inorder'), T('右子树最左下的结点（无右孩子时看线索）', 'leftmost of the right subtree'), T('左子树最右下的结点', 'rightmost of the left subtree')],
              [T('先序', 'Preorder'), T('有左孩子是左孩子，否则右孩子（或线索）', 'left child, else right'), T('不方便（需要知道双亲）', 'hard without parents')],
              [T('后序', 'Postorder'), T('不方便（需要知道双亲）', 'hard without parents'), T('有右孩子是右孩子，否则左孩子（或线索）', 'right child, else left')],
            ],
          },
        },
      ],
    },
    pit([
      T('线索指向的是遍历**序列**中的前驱后继，不是树里的双亲。', 'Threads follow the traversal **sequence**, not parents.'),
      T('中序线索树中，第一个结点的左线索、最后一个结点的右线索为 NULL。', 'The first left thread and last right thread are NULL in inorder.'),
      T('后序线索树找后继仍然需要栈（或三叉链表）。', 'Postorder successors still need a stack.'),
    ]),
  ],
};
const TH_SPEC = {
  presets: [
    { label: T('中序线索', 'Inorder threads'), set: { tree: 'A B C D E # F', order: 'in' } },
    { label: T('先序线索', 'Preorder threads'), set: { tree: 'A B C D E # F', order: 'pre' } },
    { label: T('后序线索', 'Postorder threads'), set: { tree: 'A B C D E # F', order: 'post' } },
  ],
  groups: [{ legend: T('二叉树', 'Binary tree'), fields: [
    { name: 'tree', label: T('按层序写结点，空位置写 #', 'Level order, # for empty'), type: 'text', wide: true },
    { name: 'order', label: T('线索化次序', 'Order'), type: 'select', options: [['in', T('中序', 'inorder')], ['pre', T('先序', 'preorder')], ['post', T('后序', 'postorder')]] },
  ] }],
  note: T('虚线箭头是线索：从结点左边出来的是前驱线索，右边出来的是后继线索；指向 NULL 的画成短线。', 'Dashed arrows are threads: from the left side to the predecessor, from the right to the successor.'),
};
const TH_ERR = { tree: T('层序串不合法', 'Invalid level-order string') };
function thBoard(sim, k, z) {
  const shown = new Set(sim.seq.slice(0, k + 1));
  const items = treeItems(sim.root, { x0: 90, y0: 150, cls: (n) => (k >= 0 && n === sim.seq[k] ? 'hot' : shown.has(n) ? 'warn' : ''), note: (n) => (shown.has(n) ? sim.pos.get(n) + 1 : null) });
  const at = new Map(items.filter((it) => it.k.startsWith('tn-')).map((it) => [it.k.slice(3), [it.x, it.y]]));
  let h = '';
  for (const t of sim.threads) {
    if (!shown.has(t.from)) continue;
    const [x, y] = at.get(t.from.id);
    const sx = x + (t.side === 'l' ? -14 : 14);
    const sy = y + 14;
    if (!t.to) {
      h += `<line class="th-null" x1="${sx}" y1="${sy}" x2="${sx + (t.side === 'l' ? -14 : 14)}" y2="${sy + 22}"/>` + txt(sx + (t.side === 'l' ? -18 : 18), sy + 36, 'NULL', 'th-t');
      continue;
    }
    const [tx, ty] = at.get(t.to.id);
    const mx = (sx + tx) / 2;
    const my = Math.max(sy, ty) + 46;
    h += `<path class="th-line ${t.side}" d="M${sx},${sy} Q${mx},${my} ${tx + (tx > sx ? -10 : 10)},${ty + 16}"/>` + `<circle class="th-dot ${t.side}" cx="${tx + (tx > sx ? -10 : 10)}" cy="${ty + 16}" r="3.5"/>`;
  }
  items.push({ k: 'threads', x: 0, y: 0, html: h });
  const { depth } = layout(sim.root);
  items.push({ k: 'seq', x: 90, y: 150 + (depth + 1) * 72 + 30, html: txt(0, 0, ({ in: z ? '中序序列：' : 'Inorder: ', pre: z ? '先序序列：' : 'Preorder: ', post: z ? '后序序列：' : 'Postorder: ' })[sim.order] + sim.seq.map((n) => n.val).join(' '), 'bt-lab', 'start') });
  return items;
}
function buildTh(p, kit, ERR) {
  const root = fromLevel(p.tree);
  const sim = root ? { ok: true, root, order: p.order, ...thread(root, p.order) } : { ok: false, errors: ['tree'] };
  const { count, depth } = root ? layout(root) : { count: 6, depth: 3 };
  const lesson = shell('thread', kit, ERR, sim, {
    tag: T('线索', 'Thr'),
    name: T('线索二叉树', 'Threaded binary trees'),
    full: T('n + 1 个空指针 · 前驱与后继线索 · ltag / rtag · 先序 / 中序 / 后序线索', 'n + 1 nulls · predecessor and successor threads · tags'),
    title: sim.ok ? T(({ in: '中序', pre: '先序', post: '后序' })[p.order] + '线索化', `${p.order}order threads`) : T('参数有误', 'Invalid parameters'),
    legend: [['blue', T('前驱线索（左）', 'Predecessor (left)')], ['violet', T('后继线索（右）', 'Successor (right)')]],
    principle: TH_PRINCIPLE,
    desc: T('二叉链表里有 n + 1 个空指针，线索化把它们利用起来：左边空着就指向遍历序列里的前驱，右边空着就指向后继。这节课按遍历次序一个个访问结点，把它的线索画出来。', 'The n + 1 null pointers become threads to traversal predecessors and successors, drawn node by node in visiting order.'),
    rect: [30, 90, 90 + count * 52 + 70, 150 + (depth + 1) * 72 + 60],
  });
  if (!sim.ok) return lesson;
  const list = sim.seq.map((n, k) => {
    const th = sim.threads.filter((t) => t.from === n);
    const txtZ = th.map((t) => `${t.side === 'l' ? '左指针空，指向前驱' : '右指针空，指向后继'} ${t.to?.val ?? 'NULL'}`).join('；');
    const txtE = th.map((t) => `${t.side === 'l' ? 'left → pred' : 'right → succ'} ${t.to?.val ?? 'NULL'}`).join('; ');
    return { title: T(`访问 ${n.val}${th.length ? `：${th.length} 条线索` : ''}`, `Visit ${n.val}${th.length ? `: ${th.length} thread(s)` : ''}`), desc: th.length ? T(txtZ, txtE) : T('左右孩子都有', 'Both children present'), detail: th.length ? T(`${n.val} 是序列里第 ${k + 1} 个。${txtZ}，对应的标志位置 1。`, `${n.val} is #${k + 1}. ${txtE}.`) : T(`${n.val} 左右孩子都有，没有空指针可用。`, `${n.val} has both children.`), ref: 'how', row: { color: th.length ? 'violet' : 'slate', what: n.val, result: String(th.length), tone: 'info' } };
  });
  return finish(lesson, list, (k, z) => thBoard(sim, k, z), T(`${sim.threads.length} 条线索`, `${sim.threads.length} threads`), T(`n = ${count} 个结点，空指针正好 n + 1 = ${count + 1} 个，全部变成了线索。`, `${count} nodes: exactly ${count + 1} threads.`));
}
export const makeThread = make('thread', TH_SPEC, TH_ERR, buildTh);

// ═════════════════════════ 树、森林与二叉树 ═════════════════════════

const FO_PRINCIPLE = {
  sections: [
    {
      id: 'store',
      title: T('树的存储', 'Storing trees'),
      blocks: [
        {
          table: {
            head: [T('方法', 'Method'), T('做法', 'How'), T('特点', 'Notes')],
            rows: [
              [T('双亲表示法', 'Parent array'), T('每个结点记双亲的位置', 'store each parent'), T('找双亲快，找孩子要遍历', 'parents fast, children slow')],
              [T('孩子表示法', 'Child lists'), T('每个结点挂一个孩子链表', 'a list of children per node'), T('找孩子快，找双亲难', 'children fast')],
              [T('孩子兄弟表示法', 'Child-sibling'), T('左指针指第一个孩子，右指针指下一个兄弟', 'first child left, next sibling right'), T('就是把树变成二叉树', 'turns a tree into a binary tree')],
            ],
          },
        },
      ],
    },
    {
      id: 'conv',
      title: T('转换方法', 'Conversion'),
      blocks: [
        {
          steps: [
            T('**加线**：在兄弟结点之间连一条线（森林里把各棵树的根也看成兄弟）；', '**add lines** between siblings (forest roots are siblings);'),
            T('**去线**：每个结点只保留和第一个孩子的连线，去掉和其他孩子的连线；', '**remove lines** except to each first child;'),
            T('**旋转**：以根为轴顺时针转 45°：原来的「第一个孩子」成为左孩子，「下一个兄弟」成为右孩子。', '**rotate**: first child becomes left, next sibling right.'),
          ],
        },
        { tip: T('树转成的二叉树，根没有右子树；森林转成的二叉树，根的右子树是其余各棵树。', 'A single tree’s root has no right subtree; in a forest it holds the other trees.') },
      ],
    },
    {
      id: 'order',
      title: T('遍历的对应关系', 'Traversals'),
      blocks: [
        {
          table: {
            head: [T('树', 'Tree'), T('森林', 'Forest'), T('对应的二叉树', 'Binary tree')],
            rows: [
              [T('先根遍历', 'preorder'), T('先序遍历', 'preorder'), T('先序遍历', 'preorder')],
              [T('后根遍历', 'postorder'), T('中序遍历（也叫后序）', 'inorder (postorder)'), T('中序遍历', 'inorder')],
            ],
          },
        },
        { warn: T('森林的「中序」各教材叫法不一（王道等称为中序，严蔚敏称为后序），指的都是「先依次遍历各子树，再访问根」。', 'Books call the forest’s second order inorder or postorder; it means subtrees first, then the root.') },
      ],
    },
    pit([
      T('二叉树的右孩子在原树里是**兄弟**，不是孩子。', 'A right child was a **sibling**.'),
      T('树的叶子数 = 对应二叉树中左指针为空的结点数。', 'Leaves = binary nodes with empty left pointers.'),
    ]),
  ],
};
const FO_SPEC = {
  presets: [
    { label: T('一个森林', 'A forest'), set: { forest: 'A(B,C(D)) E(F,G) H' } },
    { label: T('一棵树', 'A single tree'), set: { forest: 'A(B(E,F),C,D(G))' } },
  ],
  groups: [{ legend: T('树或森林', 'Tree or forest'), fields: [{ name: 'forest', label: T('括号里是孩子，用逗号隔开；各棵树之间用空格', 'Children in parentheses; trees separated by spaces'), type: 'text', wide: true, parse: (s) => (parseForest(s) ? s : NaN) }] }],
  note: T('写法：A(B,C(D)) 表示 A 有孩子 B、C，C 有孩子 D。结点名不能重复，最多 16 个。', 'A(B,C(D)) means A has children B and C, C has child D.'),
};
const FO_ERR = { forest: T('写法不对', 'Invalid notation') };
function foBoard(sim, ph, z) {
  if (ph < 3) {
    const { items, pos } = forestItems(sim.trees, {
      x0: 90,
      y0: 160,
      dx: 60,
      edgeCls: (n, c, j) => (ph >= 2 && j > 0 ? 'cut' : ph >= 2 ? 'keep' : ''),
      extra: (p) => {
        if (ph < 1) return '';
        let h = '';
        const sib = (list) => list.forEach((c, j) => j && (h += line(p.get(list[j - 1])[0] + 19, p.get(list[j - 1])[1], p.get(c)[0] - 19, p.get(c)[1], 'fo-sib')));
        sib(sim.trees);
        for (const [n] of p) sib(n.kids);
        return h;
      },
    });
    return items;
  }
  const items = treeItems(sim.bin, { x0: 90, y0: 160, dx: 52, dy: 64, edge: (n, c) => (c === n.r ? 'fo-r' : '') });
  items.push({ k: 'orders', x: 90, y: 160 + (layout(sim.bin).depth + 1) * 64 + 20, html: txt(0, 0, `${z ? '先序' : 'Preorder'}：${pre(sim.bin).map((n) => n.val).join(' ')}　${z ? '中序' : 'Inorder'}：${ino(sim.bin).map((n) => n.val).join(' ')}`, 'bt-lab', 'start') });
  return items;
}
function buildFo(p, kit, ERR) {
  const trees = parseForest(p.forest);
  const sim = trees ? { ok: true, trees, bin: toBinary(trees) } : { ok: false, errors: ['forest'] };
  const n = trees ? forestPre(trees).length : 6;
  const lesson = shell('forest', kit, ERR, sim, {
    tag: T('森林', 'For'),
    name: T('树、森林与二叉树的转换', 'Trees, forests and binary trees'),
    full: T('双亲 / 孩子 / 孩子兄弟表示法 · 加线去线旋转 · 遍历的对应', 'Representations · add, remove, rotate · traversals'),
    title: sim.ok ? T(`${trees.length} 棵树，${n} 个结点`, `${trees.length} tree(s), ${n} nodes`) : T('参数有误', 'Invalid parameters'),
    legend: [['blue', T('兄弟之间加的线', 'Sibling lines')], ['rose', T('去掉的线', 'Removed')]],
    principle: FO_PRINCIPLE,
    desc: T('用孩子兄弟表示法，任何树或森林都能变成一棵二叉树。这节课照课本的三步走：兄弟之间加线，只留第一个孩子的线，再转 45°。转完后对比遍历序列。', 'With child-sibling links any tree or forest becomes a binary tree: add sibling lines, keep only first-child lines, rotate; then compare traversals.'),
    rect: [30, 110, 90 + n * 60 + 60, 160 + 6 * 64],
  });
  if (!sim.ok) return lesson;
  const fp = forestPre(trees).join(' ');
  const fq = forestPost(trees).join(' ');
  const list = [
    { title: T('原来的树 / 森林', 'The original'), desc: T(`${trees.length} 棵树`, `${trees.length} tree(s)`), detail: T(`先根（先序）遍历：${fp}；后根遍历：${fq}。`, `Preorder ${fp}; postorder ${fq}.`), ref: 'store', st: 0, row: { color: 'slate', what: T('原树', 'Original'), result: fp, tone: 'info' } },
    { title: T('加线：兄弟之间连起来', 'Add sibling lines'), desc: trees.length > 1 ? T('各棵树的根也算兄弟', 'Roots count as siblings') : T('同一个双亲的孩子连起来', 'Link children of each node'), detail: T('每个结点和它右边的兄弟连一条线（蓝色）。森林里各棵树的根也互相看成兄弟。', 'Connect each node to its next sibling (blue); forest roots are siblings too.'), ref: 'conv', st: 1, row: { color: 'blue', what: T('加线', 'Add'), result: '', tone: 'info' } },
    { title: T('去线：只留第一个孩子', 'Keep only first-child lines'), desc: T('其他孩子的连线去掉', 'Drop the rest'), detail: T('每个结点只保留和第一个（最左边）孩子的连线，和其他孩子的连线去掉（红色虚线）——其他孩子已经通过兄弟线连上了。', 'Keep only the line to each first child; the others are reached through sibling lines.'), ref: 'conv', st: 2, row: { color: 'rose', what: T('去线', 'Remove'), result: '', tone: 'info' } },
    { title: T('旋转成二叉树', 'Rotate into a binary tree'), desc: T('第一个孩子 → 左，下一个兄弟 → 右', 'first child left, sibling right'), detail: T(`原来的第一个孩子成为左孩子，下一个兄弟成为右孩子。二叉树的先序 ${pre(sim.bin).map((x) => x.val).join(' ')} 等于森林的先序；中序 ${ino(sim.bin).map((x) => x.val).join(' ')} 等于森林的后根（中序）遍历。`, `Preorder matches the forest preorder; inorder matches its postorder.`), ref: 'order', st: 3, row: { color: 'green', what: T('二叉树', 'Binary'), result: ino(sim.bin).map((x) => x.val).join(' '), tone: 'ok' } },
  ];
  return finish(lesson, list, (k, z) => foBoard(sim, k < 0 ? 0 : list[k].st, z), T('转换完成', 'Converted'), T('二叉树里每个右孩子在原来的树里都是兄弟。', 'Every right child was a sibling.'));
}
export const makeForest = make('forest', FO_SPEC, FO_ERR, buildFo);

