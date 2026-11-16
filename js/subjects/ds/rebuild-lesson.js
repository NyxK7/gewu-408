// 「由遍历序列还原二叉树」：上面两行是给出的先序（或后序）和中序序列，每一步标出这一段的根和它在中序里切开的左右两段；
// 下面的树一个结点一个结点长出来。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { rebuild } from './rebuild.js';
import { TREE_PRINCIPLE } from './trav-lesson.js';
import { treeItems } from './tree.js';

const SPEC = {
  presets: [
    { label: T('先序 + 中序', 'Pre + in'), set: { mode: 'pre', order: 'A B D E C F', inorder: 'D B E A C F' } },
    { label: T('后序 + 中序', 'Post + in'), set: { mode: 'post', order: 'D G E B F C A', inorder: 'D B G E A C F' } },
    { label: T('序列矛盾', 'Inconsistent'), set: { mode: 'pre', order: 'A B C', inorder: 'C A B' } },
  ],
  groups: [
    {
      legend: T('给出的序列', 'Sequences'),
      fields: [
        { name: 'mode', label: T('另一个序列是', 'The other sequence is'), type: 'select', options: [['pre', T('先序', 'preorder')], ['post', T('后序', 'postorder')]] },
        { name: 'order', label: T('先序 / 后序序列', 'Pre/postorder'), type: 'text', wide: true },
        { name: 'inorder', label: T('中序序列', 'Inorder'), type: 'text', wide: true },
      ],
    },
  ],
  note: T('结点值要互不相同，用空格隔开。先序的第一个（或后序的最后一个）是根；在中序里找到根，左边是左子树、右边是右子树；再对左右两段递归。', 'Values must be distinct, separated by spaces. The first preorder (or last postorder) element is the root; it splits the inorder sequence into left and right subtrees; recurse.'),
};
const ERR = {
  len: T('序列长度在 1～15', 'Give 1–15 nodes'),
  mismatch: T('两个序列的结点不一样', 'The sequences contain different nodes'),
  dup: T('结点值要互不相同', 'Values must be distinct'),
  conflict: T('两个序列互相矛盾，还原不出二叉树', 'The sequences contradict each other'),
};

const CW = 38;
const X0 = 150;
const DX = 52;
const DY = 70;
const TY = 230;

function board(sim, st, z) {
  const items = [];
  const s = st.k >= 0 ? sim.steps[st.k] : null;
  const done = new Set(sim.steps.slice(0, (st.k ?? -1) + 1).map((x) => x.root));
  const rowOf = (arr, lab, cls) => txt(-14, 20, lab, 'bt-cap', 'end') + arr.map((v, i) => `<g transform="translate(${i * CW} 0)">${cell(CW - 5, 30, v, { size: 14, ...cls(i, v) })}</g>`).join('');
  const inSeg = (i) => s && i >= s.iseg[0] && i <= s.iseg[1];
  items.push({
    k: 'order',
    x: X0,
    y: 100,
    html: rowOf(sim.order, sim.mode === 'pre' ? (z ? '先序' : 'Pre') : z ? '后序' : 'Post', (i, v) => (s && v === s.root ? { cls: 'hot', tone: 'amber' } : s && i >= s.oseg[0] && i <= s.oseg[1] ? {} : { cls: 'dim' })),
  });
  items.push({
    k: 'in',
    x: X0,
    y: 146,
    html: rowOf(sim.inorder, z ? '中序' : 'In', (i, v) => (!s || !inSeg(i) ? { cls: 'dim' } : i === s.k ? { cls: 'hot', tone: 'amber' } : i < s.k ? { tone: 'blue' } : { tone: 'green' })),
  });
  // 只画到这一步为止已经确定的结点
  if (done.size) {
    // 横坐标按完整树的中序位置，结点出现时位置就固定，不会跳动
    const all = treeItems(sim.root, { x0: X0, y0: TY, dx: DX, dy: DY });
    const keep = new Set([...done].map((v) => `tn-${v}`));
    for (const it of all) {
      if (it.k === 'tree-edges') continue;
      if (!keep.has(it.k)) continue;
      const v = it.k.slice(3);
      if (s && v === s.root) it.html = it.html.replace('class="tn ', 'class="tn hot ');
      items.push({ ...it, from: [it.x, it.y - 30] });
    }
    // 边：只连已出现的结点
    const allEdges = [];
    const at = new Map(all.filter((it) => it.k !== 'tree-edges').map((it) => [it.k.slice(3), [it.x, it.y]]));
    (function walk(n) {
      if (!n) return;
      for (const c of [n.l, n.r]) {
        if (c && done.has(n.val) && done.has(c.val)) {
          const [x1, y1] = at.get(n.val);
          const [x2, y2] = at.get(c.val);
          const len = Math.hypot(x2 - x1, y2 - y1);
          const ux = (x2 - x1) / len;
          const uy = (y2 - y1) / len;
          allEdges.push(`<line class="te" x1="${(x1 + ux * 19).toFixed(1)}" y1="${(y1 + uy * 19).toFixed(1)}" x2="${(x2 - ux * 19).toFixed(1)}" y2="${(y2 - uy * 19).toFixed(1)}"/>`);
        }
        walk(c);
      }
    })(sim.root);
    items.push({ k: 'tree-edges', x: 0, y: 0, html: allEdges.join('') });
  }
  return items;
}

const kit = stepKit({ spec: SPEC, rowsName: T('还原', 'Rebuild') });

function build(params) {
  const sim = rebuild({ mode: params.mode, order: params.order, inorder: params.inorder });
  const n = sim.ok ? sim.order.length : 0;
  const lesson = {
    id: 'bt-rebuild',
    kit,
    where: [['ds', 'tree']],
    tag: T('还原', 'Build'),
    name: T('由遍历序列还原二叉树', 'Rebuilding a tree from traversals'),
    full: T('先序 + 中序 · 后序 + 中序 · 先序 + 后序为什么不行', 'Pre + in · post + in · why pre + post fails'),
    title: sim.ok ? T(sim.mode === 'pre' ? '先序 + 中序' : '后序 + 中序', sim.mode === 'pre' ? 'Pre + in' : 'Post + in') : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['amber', T('这一段的根', 'Root of this part')],
      ['blue', T('左子树', 'Left subtree')],
      ['green', T('右子树', 'Right subtree')],
    ],
    principle: TREE_PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('只给中序序列不够，再给一个先序（或后序）序列，就能唯一还原出二叉树。这节课每一步找出当前这一段的根，在中序里把它左右两边切开，再对两边分别递归，树一个结点一个结点长出来。', 'With inorder plus preorder (or postorder) the tree is unique. Each step finds the root of the current part, splits the inorder sequence around it, and recurses, growing the tree node by node.'),
      facts: [],
    },
    start: { nodes: [], frame: { rect: [20, 60, X0 + Math.max(n, 6) * Math.max(CW, DX) + 40, TY + 5 * DY] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => {
    const where = s.parent ? T(`它是 ${s.parent} 的${s.side === 'l' ? '左' : '右'}孩子。`, `It is ${s.parent}’s ${s.side === 'l' ? 'left' : 'right'} child. `) : T('它是整棵树的根。', 'It is the root. ');
    const pick = sim.mode === 'pre' ? T('这一段先序序列的第一个', 'the first of this preorder part') : T('这一段后序序列的最后一个', 'the last of this postorder part');
    return {
      title: T(`根 ${s.root}：左 {${s.left.join(' ')}}，右 {${s.right.join(' ')}}`, `Root ${s.root}: left {${s.left.join(' ')}}, right {${s.right.join(' ')}}`),
      desc: T(`取${pick.zh}`, `Take ${pick.en}`),
      detail: {
        zh: `${pick.zh}是 ${s.root}，就是这棵子树的根。${where.zh}在中序里找到 ${s.root}：左边 ${s.left.join(' ') || '（空）'} 是它的左子树，右边 ${s.right.join(' ') || '（空）'} 是右子树。`,
        en: `${pick.en} is ${s.root}, the root here. ${where.en}In the inorder sequence, ${s.left.join(' ') || 'nothing'} lies left and ${s.right.join(' ') || 'nothing'} right.`,
      },
      ref: 'rebuild',
      st: { k },
      row: { color: 'amber', what: T(`根 ${s.root}`, `Root ${s.root}`), result: `{${s.left.join(' ')}} ${s.root} {${s.right.join(' ')}}`, tone: 'info' },
    };
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? { k: -1 } : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T('还原完成', 'Tree rebuilt'), text: T('把模式换成「后序」再填一组试试：后序的最后一个才是根。', 'Switch to postorder: the root is the last element.'), facts: [] };
  return lesson;
}

export const makeRebuild = () => parametric('bt-rebuild', SPEC.presets[0].set, build);
