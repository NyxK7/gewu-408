// 平衡二叉树（AVL）的插入：先按二叉排序树插入，再从新结点往上找第一个（最低的）平衡因子绝对值 > 1 的结点 A，
// 按新结点插在 A 的哪一侧的哪一侧判断 LL / RR / LR / RL，做一次（或两次）旋转。
// 平衡因子 = 左子树高度 − 右子树高度。重复的关键字不插入。
// 每个关键字产生 1～2 个快照：插入后（可能失衡）、调整后。

import { height } from './tree.js';

const clone = (n) => (n ? { id: n.id, val: n.val, l: clone(n.l), r: clone(n.r) } : null);
export const bf = (n) => height(n.l) - height(n.r);

const rotR = (a) => {
  const b = a.l;
  a.l = b.r;
  b.r = a;
  return b;
};
const rotL = (a) => {
  const b = a.r;
  a.r = b.l;
  b.l = a;
  return b;
};

export function avl(keys) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 15 || keys.some((k) => !Number.isFinite(k))) return { ok: false, errors: ['keys'] };
  let root = null;
  const steps = [];
  for (const key of keys) {
    // 1. 按二叉排序树插入，记下路径
    const path = [];
    const dirs = [];
    let p = root;
    let dup = false;
    while (p) {
      path.push(p);
      if (key === p.val) {
        dup = true;
        break;
      }
      const d = key < p.val ? 'l' : 'r';
      dirs.push(d);
      p = p[d];
    }
    if (dup) {
      steps.push({ key, kind: 'dup', tree: clone(root) });
      continue;
    }
    const n = { id: `k${key}`, val: key, l: null, r: null };
    if (!root) root = n;
    else path.at(-1)[dirs.at(-1)] = n;
    path.push(n);
    // 2. 从下往上找最低的失衡结点
    let ai = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (Math.abs(bf(path[i])) > 1) {
        ai = i;
        break;
      }
    }
    const A = ai >= 0 ? path[ai] : null;
    const type = A ? (dirs[ai] === 'l' ? 'L' : 'R') + (dirs[ai + 1] === 'l' ? 'L' : 'R') : null;
    steps.push({ key, kind: 'insert', tree: clone(root), path: path.map((x) => x.val), A: A?.val ?? null, type, B: A ? path[ai + 1].val : null, C: type === 'LR' || type === 'RL' ? path[ai + 2].val : null });
    if (!A) continue;
    // 3. 旋转
    let sub;
    if (type === 'LL') sub = rotR(A);
    else if (type === 'RR') sub = rotL(A);
    else if (type === 'LR') {
      A.l = rotL(A.l);
      sub = rotR(A);
    } else {
      A.r = rotR(A.r);
      sub = rotL(A);
    }
    if (ai === 0) root = sub;
    else path[ai - 1][dirs[ai - 1]] = sub;
    steps.push({ key, kind: 'rotate', tree: clone(root), A: A.val, type, top: sub.val });
  }
  return { ok: true, keys, steps, root: clone(root) };
}
