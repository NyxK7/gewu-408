// 「红黑树的插入」：一个个插入关键字，新结点先涂红；父结点也是红的就要修正——
// 看叔叔的颜色：叔叔红就变色、问题往上推；叔叔黑就旋转（内侧先转一次变成外侧）。
// 画法：真的把结点涂成红色和黑色，正在处理的新结点 z、父 p、叔 u、祖父 g 在旁边标出来。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { blackHeight, rbInsert } from './rbtree.js';
import { height, layout } from './tree.js';

const W = [['ds', 'search']];
const DX = 52;
const DY = 74;
const X0 = 80;
const Y0 = 130;

const PRINCIPLE = {
  sections: [
    {
      id: 'props',
      title: T('红黑树的五条性质', 'The five properties'),
      blocks: [
        { steps: [
          T('每个结点不是红色就是黑色；', 'Every node is red or black;'),
          T('根结点是黑色；', 'the root is black;'),
          T('叶子（空结点 NIL）都是黑色；', 'every leaf (NIL) is black;'),
          T('红结点的两个孩子都是黑色——**不能有两个相连的红结点**；', 'a red node has black children: **no two reds in a row**;'),
          T('从任意一个结点到它下面每个叶子的路径上，**黑结点个数相同**。', 'every path from a node down to its leaves has **the same number of black nodes**.'),
        ] },
        { p: T('从某个结点出发（不算它自己）到叶子路径上的黑结点数，叫它的**黑高** bh。根的黑高就是整棵树的黑高。', 'The number of black nodes from a node (excluding itself) down to a leaf is its **black height** bh.') },
      ],
    },
    {
      id: 'height',
      title: T('为什么高度是 O(log n)', 'Why the height is O(log n)'),
      blocks: [
        { p: T('由性质 4，任何一条路径上红结点不会超过一半，所以树高 h ≤ 2bh。由性质 5，黑高为 bh 的子树至少有 2^bh − 1 个内部结点。两条合起来：', 'By property 4, at most half of any path is red, so h ≤ 2·bh. By property 5, a subtree of black height bh has at least 2^bh − 1 internal nodes. Hence:') },
        { formula: 'h ≤ 2 log₂(n + 1)' },
        { tip: T('所以红黑树的查找、插入、删除都是 O(log n)。它比 AVL 「松」一些：最长路径最多是最短路径的两倍。', 'All operations are O(log n). It is looser than AVL: the longest path is at most twice the shortest.') },
      ],
    },
    {
      id: 'insert',
      title: T('插入：先涂红，再修正', 'Insertion: paint red, then fix'),
      blocks: [
        { p: T('新结点按二叉排序树的规则插入，涂成**红色**——这样不会改变任何路径上的黑结点数（性质 5 不受影响）。可能被破坏的只有：新结点是根（性质 2），或者父结点也是红的（性质 4）。', 'Insert as in a BST and paint the node **red**, which keeps property 5. Only property 2 (it is the root) or property 4 (red parent) can break.') },
        {
          table: {
            head: [T('情况', 'Case'), T('怎么做', 'Fix'), T('之后', 'Then')],
            rows: [
              [T('父结点是黑的', 'Black parent'), T('什么都不用做', 'nothing'), T('结束', 'done')],
              [T('叔叔是红的', 'Red uncle'), T('父、叔变黑，祖父变红', 'parent and uncle black, grandparent red'), T('把祖父当作新的 z 继续往上检查', 'continue from the grandparent')],
              [T('叔叔是黑的，z 在内侧', 'Black uncle, z inner'), T('绕父结点旋转一次，变成外侧的情况', 'rotate at the parent to make it outer'), T('接着做下一行', 'go to the next row')],
              [T('叔叔是黑的，z 在外侧', 'Black uncle, z outer'), T('父变黑、祖父变红，绕祖父旋转一次', 'parent black, grandparent red, rotate at the grandparent'), T('结束', 'done')],
            ],
          },
        },
        { p: T('「外侧」指 z、父、祖父在一条直线上（都是左孩子或都是右孩子），「内侧」指拐了个弯。最后如果根是红的，把它涂黑。', '“Outer” means z, parent and grandparent line up; “inner” means a zigzag. Finally paint the root black.') },
        { tip: T('一次插入最多旋转两次；变色可能一路推到根，但只是 O(log n) 次。', 'An insertion rotates at most twice; recolouring may climb to the root, O(log n) times.') },
      ],
    },
    {
      id: 'delete',
      title: T('删除（了解）', 'Deletion (overview)'),
      blocks: [
        { p: T('先按二叉排序树删除：被删结点有两个孩子时，用中序后继顶替，转化为删除最多只有一个孩子的结点。删的是红结点，什么都不用做；删的是黑结点，那条路径上就少了一个黑结点（「双黑」），需要看兄弟结点的颜色和兄弟孩子的颜色，通过变色和最多三次旋转修正。', 'Delete as in a BST (replacing a two-child node by its successor). Removing a red node is free; removing a black one leaves a “double black” fixed by recolouring and at most three rotations, depending on the sibling.') },
      ],
    },
    {
      id: 'avl',
      title: T('红黑树和 AVL', 'Red–black vs AVL'),
      blocks: [
        {
          table: {
            head: ['', 'AVL', T('红黑树', 'Red–black')],
            rows: [
              [T('平衡要求', 'Balance'), T('左右子树高度差 ≤ 1', 'heights differ by ≤ 1'), T('最长路径 ≤ 最短路径的 2 倍', 'longest ≤ 2 × shortest')],
              [T('查找', 'Search'), T('略快（树更矮）', 'slightly faster'), T('略慢', 'slightly slower')],
              [T('插入 / 删除的调整', 'Rebalancing'), T('删除时可能一路旋转到根', 'deletions may rotate up to the root'), T('旋转次数少：插入 ≤ 2 次，删除 ≤ 3 次', 'few rotations: ≤ 2 insert, ≤ 3 delete')],
              [T('适合', 'Best for'), T('查找多、修改少', 'read-heavy'), T('插入删除频繁', 'frequent updates')],
            ],
          },
        },
      ],
    },
    pit([
      T('新插入的结点是红色，不是黑色。', 'New nodes are red, not black.'),
      T('叔叔是 NIL 时也算黑色。', 'A NIL uncle counts as black.'),
      T('红黑树一定是二叉排序树，但不一定是 AVL 树。', 'Every red–black tree is a BST but not necessarily an AVL tree.'),
      T('叔叔红的情况只变色、不旋转，但问题会传到祖父。', 'A red uncle means recolour only, then continue at the grandparent.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('变色、旋转都有', 'Recolours and rotations'), set: { keys: [10, 20, 30, 15, 25, 5, 1] } },
    { label: T('内侧：先转一次再转一次', 'Inner case: two rotations'), set: { keys: [30, 10, 20, 40, 35, 50] } },
    { label: T('依次插入 1～8', 'Insert 1 to 8'), set: { keys: [1, 2, 3, 4, 5, 6, 7, 8] } },
  ],
  groups: [{ legend: T('关键字', 'Keys'), fields: [{ name: 'keys', label: T('按顺序插入（最多 15 个）', 'Insert in order (up to 15)'), type: 'list', min: -999, max: 9999, maxLen: 15, wide: true }] }],
  note: T('新结点涂红；叶子 NIL 当作黑色，图上不画。重复的关键字不插入。', 'New nodes are red; NIL leaves count as black and are not drawn. Duplicates are skipped.'),
};
const ERR = { keys: T('要有 1～15 个关键字', 'Give 1–15 keys') };

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : null;
  const root = s?.tree;
  const role = new Map();
  if (s && s.kind !== 'dup') {
    if (s.z != null) role.set(s.z, 'z');
    if (s.p != null) role.set(s.p, 'p');
    if (s.u != null) role.set(s.u, 'u');
    if (s.g != null) role.set(s.g, 'g');
  }
  if (root) {
    const { pos } = layout(root);
    const at = (n) => [X0 + pos.get(n).i * DX, Y0 + pos.get(n).d * DY];
    let edges = '';
    for (const [n] of pos)
      for (const c of [n.l, n.r]) {
        if (!c) continue;
        const [x1, y1] = at(n);
        const [x2, y2] = at(c);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;
        edges += `<line class="te" x1="${(x1 + ux * 19).toFixed(1)}" y1="${(y1 + uy * 19).toFixed(1)}" x2="${(x2 - ux * 19).toFixed(1)}" y2="${(y2 - uy * 19).toFixed(1)}"/>`;
      }
    items.push({ k: 'edges', x: 0, y: 0, html: edges });
    for (const [n] of pos) {
      const [x, y] = at(n);
      const r = role.get(n.val);
      const tag = r ? txt(0, 36, r, `rb-role ${r}`) : '';
      items.push({ k: `tn-${n.id}`, x, y, from: [x, y - 40], html: `<g class="tn ${n.red ? 'rb-red' : 'rb-black'} ${r === 'z' ? 'rb-cur' : ''}"><circle r="19"/>${txt(0, 5, String(n.val), 'tn-t')}</g>${tag}` });
    }
  }
  // 插入顺序
  const at = s ? sim.keys.indexOf(s.key) : -1;
  items.push({ k: 'keys', x: X0, y: 70, html: txt(-20, 0, z ? '插入' : 'Insert', 'bt-cap', 'end') + sim.keys.map((v, i) => txt(i * 40, 0, String(v), `av-key ${i <= at ? (i === at ? 'cur' : 'done') : ''}`, 'start')).join('') });
  if (s && root) {
    const h = height(root);
    let bh = '?';
    try {
      bh = blackHeight(root);
    } catch {
      bh = '—';
    }
    items.push({ k: 'info', x: X0, y: Y0 + h * DY + 10, html: txt(-20, 0, z ? `树高 ${h}，黑高 ${bh}` : `height ${h}, black height ${bh}`, 'bt-cap', 'start') });
  }
  return items;
}

const sideName = (d, z) => (d === 'l' ? (z ? '左旋' : 'rotate left') : z ? '右旋' : 'rotate right');

function build(p, kit, ERR) {
  const sim = rbInsert(p.keys);
  const lesson = shell('rbtree', kit, ERR, sim, {
    where: W,
    tag: T('红黑', 'RB'),
    name: T('红黑树的插入', 'Red–black tree insertion'),
    full: T('五条性质 · 黑高 · 新结点涂红 · 叔叔红就变色 · 叔叔黑就旋转 · 和 AVL 对比', 'Five properties · black height · red new nodes · recolour or rotate · vs AVL'),
    title: T(`插入 ${p.keys?.length ?? 0} 个关键字`, `${p.keys?.length ?? 0} insertions`),
    legend: [['rose', T('红结点', 'Red node')], ['slate', T('黑结点', 'Black node')]],
    principle: PRINCIPLE,
    desc: T('红黑树用「颜色」代替严格的高度平衡：新结点一律涂红，只在出现两个相连的红结点时才调整。调整只看叔叔：叔叔是红的，父叔变黑、祖父变红，问题往上推；叔叔是黑的，就旋转。这节课一个个插入，把每一次变色和旋转都单独演示出来。', 'Red–black trees balance by colour: new nodes are red and only two reds in a row need fixing. Look at the uncle: red means recolour and move up, black means rotate. Every recolour and rotation is shown on its own.'),
    rect: [20, 50, X0 + 15 * DX + 40, Y0 + 6 * DY + 40],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => {
    let title;
    let detail;
    let ref = 'insert';
    let color = 'blue';
    if (s.kind === 'dup') {
      title = T(`${s.key} 已经在树里`, `${s.key} is already there`);
      detail = T('重复的关键字不插入。', 'Duplicates are skipped.');
      color = 'slate';
    } else if (s.kind === 'insert') {
      title = s.fine === 'root' ? T(`插入 ${s.key}：它就是根`, `Insert ${s.key}: the root`) : s.fine ? T(`插入 ${s.key}：父结点黑，不用调整`, `Insert ${s.key}: black parent, done`) : T(`插入 ${s.key}：和父结点 ${s.parent} 都是红的`, `Insert ${s.key}: red under red ${s.parent}`);
      detail = s.fine === 'root'
        ? T(`树是空的，${s.key} 成为根。新结点先涂红，接下来要把根改成黑色。`, `${s.key} becomes the root; it will be painted black.`)
        : s.fine
          ? T(`按二叉排序树的规则，${s.key} 成为 ${s.parent} 的孩子，涂成红色。父结点 ${s.parent} 是黑的，没有出现两个相连的红结点，各条路径的黑结点数也没变，不用调整。`, `${s.key} hangs under black ${s.parent}: nothing to fix.`)
          : T(`按二叉排序树的规则，${s.key} 成为 ${s.parent} 的孩子，涂成红色。可父结点 ${s.parent} 也是红的，违反了「红结点的孩子必须是黑的」，要修正。`, `${s.key} hangs under red ${s.parent}: two reds in a row, fix it.`);
      color = s.fine ? 'green' : 'rose';
    } else if (s.kind === 'recolor') {
      title = T(`叔叔 ${s.u} 是红的：变色`, `Red uncle ${s.u}: recolour`);
      detail = T(`z = ${s.z} 的父结点 ${s.p} 和叔叔 ${s.u} 都是红的。把它们都变黑，祖父 ${s.g} 变红：每条路径的黑结点数不变，但 ${s.g} 变红后可能又和它的父结点冲突，所以把 ${s.g} 当作新的 z 继续往上检查。`, `Parent ${s.p} and uncle ${s.u} turn black, grandparent ${s.g} red; continue from ${s.g}.`);
      color = 'amber';
    } else if (s.kind === 'inner') {
      title = T(`叔叔黑，${s.zOld} 在内侧：绕 ${s.pOld} ${sideName(s.dir, true)}`, `Black uncle, inner: ${sideName(s.dir, false)} at ${s.pOld}`);
      detail = T(`叔叔${s.u == null ? '是空结点（算黑色）' : ` ${s.u} 是黑的`}，而 ${s.zOld}、${s.pOld}、${s.g} 拐了一个弯（内侧）。先绕父结点 ${s.pOld} ${sideName(s.dir, true)}一次，把它们拉成一条直线，变成外侧的情况，原来的父结点 ${s.pOld} 变成新的 z。`, `Zigzag: rotate at ${s.pOld} to make it a straight line; ${s.pOld} becomes z.`);
      ref = 'insert';
      color = 'violet';
    } else if (s.kind === 'outer') {
      title = T(`叔叔黑，外侧：${s.p} 变黑、${s.g} 变红，绕 ${s.g} ${sideName(s.dir, true)}`, `Black uncle, outer: recolour and ${sideName(s.dir, false)} at ${s.g}`);
      detail = T(`z、父结点 ${s.p}、祖父 ${s.g} 在一条直线上。把 ${s.p} 变黑、${s.g} 变红，再绕 ${s.g} ${sideName(s.dir, true)}一次：${s.p} 升上去当这棵子树的根，两边各挂一个红孩子，冲突消除，修正结束。`, `${s.p} black, ${s.g} red, rotate at ${s.g}: ${s.p} becomes the subtree root and the conflict is gone.`);
      color = 'teal';
    } else {
      title = T(`根 ${s.z} 涂黑`, `Paint root ${s.z} black`);
      detail = T('性质 2：根结点必须是黑色。把根涂黑相当于每条路径都多了一个黑结点，不会破坏性质 5。', 'Property 2: the root is black; this adds one black to every path equally.');
      ref = 'props';
      color = 'slate';
    }
    return { title, desc: T(`插入 ${s.key}`, `Inserting ${s.key}`), detail, ref, st: { k }, row: { color, what: String(s.key), result: L2(s.kind), tone: s.kind === 'insert' && !s.fine ? 'warn' : 'info' } };
  });
  const rot = sim.steps.filter((s) => s.kind === 'inner' || s.kind === 'outer').length;
  const rec = sim.steps.filter((s) => s.kind === 'recolor').length;
  return finish(lesson, list, (st, z) => board(sim, st, z), T(`旋转 ${rot} 次，变色 ${rec} 次`, `${rot} rotations, ${rec} recolourings`), T(`最后树高 ${height(sim.tree)}，黑高 ${blackHeight(sim.tree)}。把同一串关键字放到 AVL 那节课里，比一比两棵树的形状和旋转次数。`, `Height ${height(sim.tree)}, black height ${blackHeight(sim.tree)}. Try the same keys in the AVL lesson.`));
}

function L2(kind) {
  return {
    dup: T('重复', 'dup'),
    insert: T('插入', 'insert'),
    recolor: T('变色', 'recolour'),
    inner: T('内侧旋转', 'inner rotate'),
    outer: T('外侧旋转', 'outer rotate'),
    root: T('根涂黑', 'root black'),
  }[kind];
}

export const makeRbTree = make('rbtree', SPEC, ERR, build);
