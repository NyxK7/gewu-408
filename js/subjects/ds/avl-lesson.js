// 「平衡二叉树（AVL）」：一个个插入关键字，每个结点旁边标平衡因子；失衡时把最低的失衡结点 A 标红，
// 说清是 LL / RR / LR / RL 哪一种，再旋转——结点会平滑地移到新位置。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { errOf, stepKit, toSteps } from '../../core/steps.js';
import { avl, bf } from './avl.js';
import { ino, layout } from './tree.js';

const SPEC = {
  presets: [
    { label: T('一次 LR 旋转', 'One LR rotation'), set: { keys: [20, 10, 30, 5, 15, 12] } },
    { label: T('四种旋转都有', 'All four rotations'), set: { keys: [30, 20, 10, 40, 50, 35, 12, 1] } },
    { label: T('依次插入 1～7', 'Insert 1 to 7'), set: { keys: [1, 2, 3, 4, 5, 6, 7] } },
  ],
  groups: [{ legend: T('关键字', 'Keys'), fields: [{ name: 'keys', label: T('按顺序插入（最多 15 个）', 'Insert in order (up to 15)'), type: 'list', min: -999, max: 9999, maxLen: 15, wide: true }] }],
  note: T('平衡因子 = 左子树高度 − 右子树高度，平衡二叉树里每个结点的平衡因子只能是 −1、0、1。插入后从新结点往上找第一个失衡的结点 A，只调整以 A 为根的最小不平衡子树。重复的关键字不插入。', 'Balance factor = left height − right height; every node must have −1, 0 or 1. After an insertion, the lowest unbalanced ancestor A is found and only the subtree rooted at A is fixed. Duplicates are skipped.'),
};
const ERR = { keys: T('要有 1～15 个关键字', 'Give 1–15 keys') };

const TYPE = {
  LL: { zh: '新结点插在 A 的左孩子的左子树上：以 A 的左孩子 B 为轴右旋一次，B 成为这棵子树的根，B 原来的右子树挂到 A 的左边。', en: 'Inserted into the left subtree of A’s left child: rotate right once around B; B becomes the root, B’s right subtree moves to A’s left.' },
  RR: { zh: '新结点插在 A 的右孩子的右子树上：以 A 的右孩子 B 为轴左旋一次，B 成为根，B 原来的左子树挂到 A 的右边。', en: 'Inserted into the right subtree of A’s right child: rotate left once around B; B’s left subtree moves to A’s right.' },
  LR: { zh: '新结点插在 A 的左孩子 B 的右子树上：先把 B 的右孩子 C 左旋到 B 的位置，再右旋到 A 的位置，C 成为这棵子树的根。', en: 'Inserted into the right subtree of A’s left child B: rotate C (B’s right child) left, then right; C becomes the root.' },
  RL: { zh: '新结点插在 A 的右孩子 B 的左子树上：先把 B 的左孩子 C 右旋到 B 的位置，再左旋到 A 的位置，C 成为这棵子树的根。', en: 'Inserted into the left subtree of A’s right child B: rotate C right, then left; C becomes the root.' },
};

const DX = 52;
const DY = 72;
const X0 = 70;
const Y0 = 120;

function board(sim, k, z) {
  const items = [];
  const s = k >= 0 ? sim.steps[k] : null;
  const root = s?.tree;
  if (root) {
    const { pos } = layout(root);
    const at = (n) => [X0 + pos.get(n).i * DX, Y0 + pos.get(n).d * DY];
    let edges = '';
    for (const [n] of pos) {
      for (const c of [n.l, n.r]) {
        if (!c) continue;
        const [x1, y1] = at(n);
        const [x2, y2] = at(c);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;
        edges += `<line class="te" x1="${(x1 + ux * 19).toFixed(1)}" y1="${(y1 + uy * 19).toFixed(1)}" x2="${(x2 - ux * 19).toFixed(1)}" y2="${(y2 - uy * 19).toFixed(1)}"/>`;
      }
    }
    items.push({ k: 'tree-edges', x: 0, y: 0, html: edges });
    const involved = new Set(s.kind === 'insert' && s.A != null ? [s.A, s.B, s.C].filter((v) => v != null) : s.kind === 'rotate' ? [s.top] : []);
    for (const [n] of pos) {
      const [x, y] = at(n);
      const b = bf(n);
      let cls = '';
      if (s.kind === 'insert' && n.val === s.key) cls = 'hot';
      if (s.kind === 'insert' && n.val === s.A) cls = 'bad';
      else if (s.kind === 'insert' && involved.has(n.val)) cls = 'warn';
      if (s.kind === 'rotate' && n.val === s.top) cls = 'ok';
      items.push({
        k: `tn-${n.val}`,
        x,
        y,
        from: [x, y - 40],
        html: `<g class="tn ${cls}"><circle r="19"/>${txt(0, 5, String(n.val), 'tn-t')}</g>` + txt(23, -13, b > 0 ? `+${b}` : String(b), `tn-note ${Math.abs(b) > 1 ? 'bad' : ''}`, 'start'),
      });
    }
  }
  // 已插入的关键字
  const done = s ? sim.keys.slice(0, sim.keys.indexOf(s.key) + 1) : [];
  items.push({ k: 'keys', x: X0, y: 70, html: txt(-20, 0, z ? '插入' : 'Insert', 'bt-cap', 'end') + sim.keys.map((v, i) => txt(i * 40, 0, String(v), `av-key ${i < done.length ? (s && i === done.length - 1 ? 'cur' : 'done') : ''}`, 'start')).join('') });
  return items;
}

export const PRINCIPLE = {
  sections: [
    {
      id: 'bst',
      title: T('二叉排序树', 'Binary search trees'),
      blocks: [
        { p: T('**二叉排序树（BST）**：左子树上所有关键字都小于根，右子树上所有关键字都大于根，左右子树也都是二叉排序树。所以它的**中序遍历是递增序列**。查找、插入都从根往下比较，插入的新结点一定是叶子。', 'In a **BST** every left key is smaller and every right key larger, recursively, so **inorder is sorted**. Search and insertion walk down from the root; new nodes are leaves.') },
        { p: T('删除结点 z：是叶子直接删；只有一棵子树就让子树顶替它；有两棵子树，就用它的中序直接后继（右子树里最小的）或直接前驱替代它，再删去那个后继（前驱）。', 'Deleting z: a leaf goes; one child replaces it; with two children, its inorder successor (or predecessor) takes its place.') },
        { warn: T('BST 的形状取决于插入顺序：按有序序列插入会退化成一条链，查找变成 O(n)。这就是要「平衡」的原因。', 'Inserting sorted keys makes a chain with O(n) search; hence balancing.') },
      ],
    },
    {
      id: 'avl',
      title: T('平衡二叉树', 'AVL trees'),
      blocks: [
        { formula: T('平衡因子 = 左子树高度 − 右子树高度，取值只能是 −1、0、1', 'balance = left height − right height ∈ {−1, 0, 1}') },
        { p: T('插入一个结点后，只有从它到根这条路径上的结点平衡因子会变。从新结点往上找**第一个**平衡因子绝对值超过 1 的结点 A，以 A 为根的子树叫**最小不平衡子树**，只需要调整它，整棵树就恢复平衡（而且子树高度恢复成插入前的样子）。', 'Only nodes on the insertion path change. Fixing the **lowest unbalanced** node A restores the whole tree.') },
        {
          table: {
            head: [T('类型', 'Type'), T('新结点插在', 'Inserted into'), T('调整', 'Fix')],
            rows: [
              ['LL', T('A 的左孩子的左子树', 'left subtree of A’s left child'), T('右旋一次', 'one right rotation')],
              ['RR', T('A 的右孩子的右子树', 'right subtree of A’s right child'), T('左旋一次', 'one left rotation')],
              ['LR', T('A 的左孩子的右子树', 'right subtree of A’s left child'), T('先左旋再右旋', 'left, then right')],
              ['RL', T('A 的右孩子的左子树', 'left subtree of A’s right child'), T('先右旋再左旋', 'right, then left')],
            ],
          },
        },
        { tip: T('判断类型只看从 A 往下走的头两步：先往左再往左是 LL，先往左再往右是 LR，以此类推。LR、RL 旋转后，原来的「孙子」C 会升到 A 的位置。', 'Read the first two steps down from A. In LR and RL the grandchild C rises to A’s place.') },
      ],
    },
    {
      id: 'height',
      title: T('高度与查找效率', 'Height and search cost'),
      blocks: [
        { p: T('高度为 h 的平衡二叉树最少有 n_h 个结点：n_0 = 0，n_1 = 1，n_h = n_{h−1} + n_{h−2} + 1（类似斐波那契数列），即 1、2、4、7、12、20……所以含 n 个结点的平衡二叉树高度是 O(log n)，查找、插入、删除都是 O(log n)。', 'A height-h AVL tree has at least n_h nodes, n_h = n_{h−1} + n_{h−2} + 1 (1, 2, 4, 7, 12, 20, …), so the height is O(log n).') },
        { p: T('**红黑树**是另一种平衡树：结点红或黑，根和叶（空结点）是黑色，红结点的孩子都是黑色，从任一结点到叶子的每条路径黑结点数相同。它的平衡要求比 AVL 宽松（最长路径不超过最短的 2 倍），插入删除时旋转更少。考纲只要求了解概念。', 'A **red-black tree** relaxes balance (longest path ≤ twice the shortest) for cheaper updates; the exam asks for the concept only.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('调整的是**最低**的失衡结点，不是根。', 'Fix the **lowest** unbalanced node, not the root.'),
            T('LR 是「先对 A 的左孩子左旋，再对 A 右旋」，名字说的是插入位置，不是旋转方向。', 'LR names the insertion position, not the rotation order.'),
            T('旋转时被「过继」的那棵子树别丢：B 的右子树（LL）、C 的左右子树（LR）要挂到新的位置。', 'Don’t lose the moved subtrees.'),
            T('平衡因子按「左减右」算，题目若用「右减左」符号相反。', 'Some books define balance as right − left.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('插入', 'Insertions') });

function build(params) {
  const sim = avl(params.keys ?? []);
  const maxN = sim.ok ? Math.max(...sim.steps.map((s) => (s.tree ? layout(s.tree).count : 0))) : 6;
  const maxD = sim.ok ? Math.max(...sim.steps.map((s) => (s.tree ? layout(s.tree).depth : 0))) : 3;
  const lesson = {
    id: 'avl',
    kit,
    where: [['ds', 'search']],
    tag: 'AVL',
    name: T('平衡二叉树（AVL）', 'AVL trees'),
    full: T('二叉排序树 · 平衡因子 · 最小不平衡子树 · LL / RR / LR / RL 旋转 · 红黑树概念', 'BST · balance factor · lowest unbalanced subtree · four rotations · red-black trees'),
    title: sim.ok ? T(`插入 ${sim.keys.length} 个关键字`, `${sim.keys.length} insertions`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['orange', T('新插入', 'New')],
      ['rose', T('失衡结点 A', 'Unbalanced A')],
      ['green', T('旋转后的根', 'New subtree root')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('平衡二叉树每插入一个关键字，都要检查有没有结点失衡。这节课一个个插入，每个结点旁边写着平衡因子；一旦失衡，标出最低的失衡结点 A，判断是 LL、RR、LR 还是 RL，再旋转——旋转时结点会平滑地移到新位置。', 'After each insertion the balance factors are shown beside the nodes; when one goes out of range the lowest unbalanced node is marked, the case (LL, RR, LR, RL) is named and the rotation plays as nodes glide to their new places.'),
      facts: sim.ok ? [[T('关键字', 'Keys'), sim.keys.join(' ')]] : [],
    },
    start: { nodes: [], frame: { rect: [10, 40, X0 + Math.max(maxN, 5) * DX + 30, Y0 + (maxD + 1) * DY + 10] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s) => {
    if (s.kind === 'dup') return { title: T(`${s.key} 已经在树里`, `${s.key} is already present`), desc: T('不插入', 'Skipped'), detail: T(`二叉排序树里关键字不重复，${s.key} 已存在，不插入。`, `${s.key} already exists; not inserted.`), ref: 'bst', row: { color: 'slate', what: T(`插入 ${s.key}`, `Insert ${s.key}`), result: T('重复', 'duplicate'), tone: 'info' } };
    if (s.kind === 'insert') {
      const pathTxt = s.path.join(' → ');
      return s.A == null
        ? { title: T(`插入 ${s.key}：仍然平衡`, `Insert ${s.key}: still balanced`), desc: T(`路径 ${pathTxt}`, `Path ${pathTxt}`), detail: T(`从根开始比较，小往左、大往右：${pathTxt}，${s.key} 成为叶子。路径上所有结点的平衡因子都还在 −1～1 之内，不用调整。`, `Compare down from the root (${pathTxt}); ${s.key} becomes a leaf. All balance factors stay within −1…1.`), ref: 'bst', row: { color: 'blue', what: T(`插入 ${s.key}`, `Insert ${s.key}`), result: T('平衡', 'balanced'), tone: 'ok' } }
        : { title: T(`插入 ${s.key}：${s.A} 失衡，${s.type} 型`, `Insert ${s.key}: ${s.A} unbalanced, ${s.type}`), desc: T(`最小不平衡子树的根是 ${s.A}`, `Lowest unbalanced node ${s.A}`), detail: T(`插入路径 ${pathTxt}。从 ${s.key} 往上看，第一个平衡因子绝对值超过 1 的是 ${s.A}（标红）。从 ${s.A} 往下走向新结点，先往${s.type[0] === 'L' ? '左' : '右'}（到 ${s.B}）再往${s.type[1] === 'L' ? '左' : '右'}${s.C != null ? `（到 ${s.C}）` : ''}，所以是 ${s.type} 型。`, `Path ${pathTxt}. The lowest node with |balance| > 1 is ${s.A}. Going down from it: ${s.type[0] === 'L' ? 'left' : 'right'} then ${s.type[1] === 'L' ? 'left' : 'right'}, so ${s.type}.`), ref: 'avl', row: { color: 'rose', what: T(`插入 ${s.key}`, `Insert ${s.key}`), result: T(`${s.type} 失衡`, `${s.type}`), tone: 'warn' } };
    }
    return { title: T(`${s.type} 旋转：${s.top} 成为子树的根`, `${s.type} rotation: ${s.top} on top`), desc: T(`中序仍是 ${ino(s.tree).map((n) => n.val).join(' ')}`, `Inorder still ${ino(s.tree).map((n) => n.val).join(' ')}`), detail: { zh: `${TYPE[s.type].zh}调整后 ${s.top} 成为这棵子树的根，所有结点的平衡因子回到 −1～1。旋转不改变中序序列，二叉排序树的性质仍然成立。`, en: `${TYPE[s.type].en} ${s.top} is now the subtree root and every balance factor is back in range. Rotations keep the inorder sequence.` }, ref: 'avl', row: { color: 'green', what: T(`${s.type} 旋转`, `${s.type} rotation`), result: String(s.top), tone: 'ok' } };
  });
  const built = toSteps(list, (k, z) => board(sim, k, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  const rots = sim.steps.filter((s) => s.kind === 'rotate');
  lesson.outro = { title: T(`旋转了 ${rots.length} 次`, `${rots.length} rotations`), text: T('试试「依次插入 1～7」：普通二叉排序树会退化成一条链，平衡二叉树却始终保持矮胖。', 'Insert 1 to 7: a plain BST would become a chain, but the AVL tree stays short.'), facts: [[T('旋转', 'Rotations'), rots.map((r) => r.type).join(' ') || '—']] };
  return lesson;
}

export const makeAvl = () => parametric('avl', SPEC.presets[0].set, build);
