// 「二叉树的遍历」：同一棵树依次做先序、中序、后序、层序遍历，结点旁边标出它是第几个被访问的，
// 下面写出遍历序列；层序遍历再把每一步的队列画出来。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { fromLevel, height, ino, layout, level, post, pre, treeItems } from './tree.js';

const SPEC = {
  presets: [
    { label: T('六个结点', 'Six nodes'), set: { tree: 'A B C D E # F' } },
    { label: T('只有左孩子的一条链', 'A left chain'), set: { tree: 'A B # C # D' } },
    { label: T('满二叉树', 'Full binary tree'), set: { tree: 'A B C D E F G' } },
  ],
  groups: [{ legend: T('二叉树', 'Binary tree'), fields: [{ name: 'tree', label: T('按层序写结点，空位置写 #', 'Nodes in level order, # for empty'), type: 'text', wide: true, hint: T('例：A B C D E # F 表示 A 的孩子是 B、C，B 的孩子是 D、E，C 只有右孩子 F', 'e.g. A B C D E # F') }] }],
  note: T('先序：根 → 左 → 右；中序：左 → 根 → 右；后序：左 → 右 → 根；层序：从上到下、每层从左到右。层序串里空孩子写 #，空结点的孩子不用再写。', 'Preorder: root, left, right; inorder: left, root, right; postorder: left, right, root; level order: top to bottom, left to right. In the input, # marks an empty child; children of empty positions are not written.'),
};
const ERR = { tree: T('层序串不合法：每个非空结点都要能挂到上一层的某个结点下面', 'Invalid level-order string') };

const KINDS = [
  { key: 'pre', zh: '先序遍历', en: 'Preorder', fn: pre, rule: T('根 → 左子树 → 右子树', 'root, left, right'), tone: 'blue' },
  { key: 'in', zh: '中序遍历', en: 'Inorder', fn: ino, rule: T('左子树 → 根 → 右子树', 'left, root, right'), tone: 'green' },
  { key: 'post', zh: '后序遍历', en: 'Postorder', fn: post, rule: T('左子树 → 右子树 → 根', 'left, right, root'), tone: 'violet' },
  { key: 'level', zh: '层序遍历', en: 'Level order', fn: level, rule: T('一层一层，每层从左到右', 'level by level'), tone: 'amber' },
];

const DX = 56;
const DY = 76;
const X0 = 120;
const Y0 = 130;

function board(sim, st, z) {
  const items = [];
  const kind = st.k != null ? KINDS[st.k] : null;
  const order = kind ? kind.fn(sim.root) : [];
  const no = new Map(order.map((n, i) => [n, i + 1]));
  items.push(...treeItems(sim.root, { x0: X0, y0: Y0, dx: DX, dy: DY, cls: (n) => (kind ? `c-${kind.tone} has-tone` : ''), note: (n) => (kind ? no.get(n) : null) }));
  const SY = Y0 + (sim.depth + 1) * DY + 10;
  if (kind) {
    let h = txt(-14, 20, z ? kind.zh : kind.en, `bt-lab c-${kind.tone}`, 'end');
    order.forEach((n, i) => (h += `<g transform="translate(${i * 40} 0)">${cell(34, 30, String(n.val), { tone: kind.tone, size: 14 })}${txt(17, 46, String(i + 1), 'bt-idx')}</g>`));
    items.push({ k: 'seq', x: X0, y: SY, html: h });
  }
  // 层序遍历：队列的变化
  if (kind?.key === 'level') {
    const q = [sim.root];
    const lines = [];
    while (q.length) {
      const n = q.shift();
      const add = [n.l, n.r].filter(Boolean);
      q.push(...add);
      lines.push({ out: n.val, q: q.map((x) => x.val) });
    }
    let h = txt(0, -10, z ? '队列（出队一个，把它的孩子入队）' : 'Queue (dequeue one, enqueue its children)', 'bt-cap', 'start');
    lines.slice(0, 8).forEach((l, i) => (h += txt(0, i * 22 + 12, `${z ? '出' : 'out'} ${l.out}　→　[ ${l.q.join(' ') || ' '} ]`, 'tv-q', 'start')));
    items.push({ k: 'queue', x: X0 + (sim.count + 1) * DX + 30, y: Y0, html: h });
  }
  return items;
}

export const TREE_PRINCIPLE = {
  sections: [
    {
      id: 'concept',
      title: T('二叉树的基本性质', 'Basic properties'),
      blocks: [
        {
          list: [
            T('非空二叉树：叶结点数 n₀ = 度为 2 的结点数 n₂ + 1。', 'n₀ = n₂ + 1.'),
            T('第 i 层最多 2^(i−1) 个结点；高度为 h 最多 2^h − 1 个结点。', 'At most 2^(i−1) nodes on level i and 2^h − 1 in height h.'),
            T('n 个结点的完全二叉树高度为 ⌈log₂(n + 1)⌉（或 ⌊log₂n⌋ + 1）；按层序从 1 编号，结点 i 的左孩子是 2i、右孩子是 2i + 1、双亲是 ⌊i/2⌋。', 'A complete tree of n nodes has height ⌈log₂(n + 1)⌉; node i has children 2i, 2i + 1 and parent ⌊i/2⌋.'),
            T('存储：顺序存储适合完全二叉树；一般用二叉链表（data、lchild、rchild），n 个结点有 n + 1 个空指针。', 'Storage: arrays suit complete trees; linked nodes have n + 1 null pointers.'),
          ],
        },
      ],
    },
    {
      id: 'order',
      title: T('四种遍历', 'Four traversals'),
      blocks: [
        {
          table: {
            head: [T('遍历', 'Traversal'), T('顺序', 'Order'), T('实现', 'Implementation')],
            rows: [
              [T('先序', 'Preorder'), T('根、左、右', 'root, left, right'), T('递归，或用栈', 'recursion or a stack')],
              [T('中序', 'Inorder'), T('左、根、右', 'left, root, right'), T('递归，或用栈', 'recursion or a stack')],
              [T('后序', 'Postorder'), T('左、右、根', 'left, right, root'), T('递归，或用栈（要记录右子树是否访问过）', 'recursion or a stack with a visited flag')],
              [T('层序', 'Level order'), T('一层层从左到右', 'by levels'), T('用队列：出队一个，把它的左、右孩子依次入队', 'a queue')],
            ],
          },
        },
        { tip: T('快速写序列的办法：沿着树的外轮廓从根出发绕一圈，第一次经过结点时记下就是先序，从下面经过（左子树走完）时记下是中序，最后一次离开时记下是后序。', 'Trace the outline: first visit = preorder, passing under = inorder, last visit = postorder.') },
        { p: T('三种深度优先遍历的时间复杂度都是 O(n)，递归栈深度等于树高，空间 O(h)。', 'All run in O(n) time with O(h) stack space.') },
      ],
    },
    {
      id: 'rebuild',
      title: T('由遍历序列确定二叉树', 'Determining a tree from traversals'),
      blocks: [
        {
          list: [
            T('**先序 + 中序**、**后序 + 中序**、**层序 + 中序**都能唯一确定一棵二叉树（结点值互不相同）。', '**pre + in**, **post + in** and **level + in** each determine the tree.'),
            T('**先序 + 后序不能**唯一确定：只有一个孩子时分不清是左孩子还是右孩子。', '**pre + post does not**: a single child could be left or right.'),
            T('关键在中序：先序第一个（或后序最后一个）是根，它在中序里的位置把序列分成左子树和右子树。', 'The key is the inorder split around the root.'),
          ],
        },
      ],
    },
    {
      id: 'thread',
      title: T('线索二叉树、树和森林', 'Threads, trees and forests'),
      blocks: [
        { p: T('**线索二叉树**：利用 n + 1 个空指针，左空指针指向遍历序列中的前驱、右空指针指向后继，并用 ltag、rtag 标记是孩子还是线索。按哪种遍历加线索，就叫先序 / 中序 / 后序线索二叉树。', '**Threaded trees** reuse the n + 1 null pointers to point to traversal predecessors and successors, marked by tag bits.') },
        { p: T('**树 ↔ 二叉树**：孩子兄弟表示法——左指针指第一个孩子，右指针指下一个兄弟。树的先根遍历 = 对应二叉树的先序；后根遍历 = 对应二叉树的中序。森林把各棵树的根看成兄弟连起来。', '**Tree ↔ binary tree**: first child on the left, next sibling on the right. Tree preorder = binary preorder; tree postorder = binary inorder.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('中序遍历里「左子树」是整棵左子树走完，不是只看左孩子。', 'Inorder visits the whole left subtree first.'),
            T('只有右孩子的结点，中序里它排在右孩子前面。', 'A node with only a right child precedes it in inorder.'),
            T('层序遍历用队列，不是栈。', 'Level order uses a queue.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('遍历', 'Traversals') });

function build(params) {
  const root = fromLevel(params.tree);
  const sim = root ? { ok: true, root, depth: layout(root).depth, count: layout(root).count, h: height(root) } : { ok: false, errors: ['tree'] };
  const lesson = {
    id: 'bt-traverse',
    kit,
    where: [['ds', 'tree']],
    tag: T('遍历', 'Trav'),
    name: T('二叉树的遍历', 'Binary tree traversal'),
    full: T('二叉树性质 · 先序 / 中序 / 后序 / 层序 · 队列 · 线索二叉树 · 树与森林', 'Properties · four traversals · queue · threaded trees · forests'),
    title: sim.ok ? T(`${sim.count} 个结点，高 ${sim.h}`, `${sim.count} nodes, height ${sim.h}`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: KINDS.map((k) => [k.tone, T(k.zh, k.en)]),
    principle: TREE_PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('同一棵二叉树，四种遍历的访问顺序完全不同。这节课依次做先序、中序、后序、层序遍历，每个结点旁边标出它第几个被访问，下面写出遍历序列；层序遍历再把队列的变化列出来。', 'One tree, four orders. Each traversal numbers the nodes in visiting order and writes out the sequence; level order also shows the queue.'),
      facts: sim.ok ? [[T('层序串', 'Level string'), params.tree]] : [],
    },
    start: { nodes: [], frame: { rect: [10, 70, X0 + (sim.ok ? sim.count : 6) * DX + 330, Y0 + (sim.ok ? sim.depth + 2 : 4) * DY + 30] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = KINDS.map((k, i) => {
    const s = k.fn(root).map((n) => n.val).join(' ');
    return {
      title: T(`${k.zh}：${s}`, `${k.en}: ${s}`),
      desc: k.rule,
      detail:
        k.key === 'level'
          ? T(`层序遍历用队列：根先入队；每次出队一个结点访问它，再把它的左、右孩子依次入队，直到队空。右边列出了每一步出队的结点和此时的队列。序列：${s}。`, `A queue: dequeue, visit, enqueue the children. Sequence: ${s}.`)
          : T(`${k.zh}的规则是「${k.rule.zh}」，对每棵子树都递归地这样做。结点旁边的数字是访问次序。序列：${s}。`, `Rule: ${k.rule.en}, applied recursively. Numbers show the visiting order. Sequence: ${s}.`),
      ref: k.key === 'level' ? 'order' : 'order',
      st: { k: i },
      row: { color: k.tone, what: T(k.zh, k.en), result: s, tone: 'info' },
    };
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T('四种序列', 'Four sequences'), text: T('拿先序和中序两个序列，到「由遍历序列还原二叉树」那节课里还原一下，看能不能得到同一棵树。', 'Feed the preorder and inorder sequences into the rebuild lesson and see the same tree come back.'), facts: KINDS.map((k) => [T(k.zh, k.en), k.fn(root).map((n) => n.val).join(' ')]) };
  return lesson;
}

export const makeTraverse = () => parametric('bt-traverse', SPEC.presets[0].set, build);
