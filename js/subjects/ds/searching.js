// 查找这一章的纯计算：折半查找与判定树、二叉排序树的插入删除、B 树的插入删除。
//
// 约定（界面上写明）：
//   · 折半查找：表按 1～n 编号，mid = ⌊(low + high) / 2⌋；
//   · 二叉排序树删除有两个孩子的结点时，用中序直接后继（右子树最小）替代；
//   · B 树：m 阶，每个结点最多 m − 1 个关键字，非根结点至少 ⌈m/2⌉ − 1 个；
//     插入上溢时把第 ⌈m/2⌉ 个关键字提到父结点，左右分成两个结点；
//     删除非叶结点的关键字时用它的直接前驱替代；下溢时先向左兄弟借，左兄弟不够再向右兄弟借，都不够就和兄弟合并（优先左兄弟）。

const err = (e) => ({ ok: false, errors: [e] });

// ───── 折半查找 ─────
export function bsearch({ keys, target }) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 20) return err('keys');
  for (let i = 1; i < keys.length; i++) if (keys[i] < keys[i - 1]) return err('sorted');
  const n = keys.length;
  const steps = [];
  let low = 1;
  let high = n;
  let found = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const v = keys[mid - 1];
    const cmp = target === v ? 0 : target < v ? -1 : 1;
    steps.push({ low, high, mid, v, cmp });
    if (cmp === 0) {
      found = mid;
      break;
    }
    if (cmp < 0) high = mid - 1;
    else low = mid + 1;
  }
  // 判定树：结点是位置 mid，深度从 1 开始
  let id = 0;
  const fails = [];
  const build = (lo, hi, d) => {
    if (lo > hi) return null;
    const mid = Math.floor((lo + hi) / 2);
    const node = { id: `p${mid}`, val: keys[mid - 1], pos: mid, d, l: null, r: null };
    node.l = build(lo, mid - 1, d + 1);
    node.r = build(mid + 1, hi, d + 1);
    if (!node.l) fails.push(d);
    if (!node.r) fails.push(d);
    id++;
    return node;
  };
  const root = build(1, n, 1);
  const depths = [];
  (function walk(t) {
    if (!t) return;
    depths.push(t.d);
    walk(t.l);
    walk(t.r);
  })(root);
  const succ = depths.reduce((a, b) => a + b, 0);
  const fail = fails.reduce((a, b) => a + b, 0);
  const height = Math.max(...depths);
  return { ok: true, keys, n, target, steps, found, root, succ: [succ, n], fail: [fail, n + 1], height, levels: Array.from({ length: height }, (_, i) => depths.filter((d) => d === i + 1).length) };
}

// ───── 二叉排序树 ─────
const clone = (t) => (t ? { id: t.id, val: t.val, l: clone(t.l), r: clone(t.r) } : null);
export function parseOps(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[\s,，;；]+/).filter(Boolean)) {
    const m = it.match(/^([+-]?)(-?\d+)$/);
    if (!m) return null;
    out.push({ op: m[1] === '-' ? 'del' : 'ins', k: Number(m[2]) });
  }
  return out;
}

export function bst({ ops }) {
  const list = parseOps(ops);
  if (!list || !list.length || list.length > 20) return err('ops');
  let root = null;
  const steps = [];
  for (const { op, k } of list) {
    const path = [];
    let p = root;
    let parent = null;
    let side = null;
    while (p && p.val !== k) {
      path.push(p.val);
      parent = p;
      side = k < p.val ? 'l' : 'r';
      p = p[side];
    }
    if (op === 'ins') {
      if (p) {
        steps.push({ op, k, kind: 'dup', path: [...path, k], tree: clone(root) });
        continue;
      }
      const n = { id: `b${k}`, val: k, l: null, r: null };
      if (!parent) root = n;
      else parent[side] = n;
      steps.push({ op, k, kind: 'ins', path: [...path, k], tree: clone(root) });
      continue;
    }
    if (!p) {
      steps.push({ op, k, kind: 'missing', path, tree: clone(root) });
      continue;
    }
    const before = clone(root);
    const set = (child) => {
      if (!parent) root = child;
      else parent[side] = child;
    };
    let kind;
    let succ = null;
    if (!p.l && !p.r) {
      kind = 'leaf';
      set(null);
    } else if (!p.l || !p.r) {
      kind = 'one';
      set(p.l ?? p.r);
    } else {
      kind = 'two';
      // 右子树里最左的结点
      let sp = p;
      let s = p.r;
      while (s.l) {
        sp = s;
        s = s.l;
      }
      succ = s.val;
      if (sp === p) sp.r = s.r;
      else sp.l = s.r;
      p.val = s.val;
      p.id = s.id;
    }
    steps.push({ op, k, kind, succ, path: [...path, k], before, tree: clone(root) });
  }
  return { ok: true, steps, root: clone(root) };
}

// ───── B 树 ─────
export function btree({ m, ops }) {
  if (!(Number.isInteger(m) && m >= 3 && m <= 6)) return err('m');
  const list = parseOps(ops);
  if (!list || !list.length || list.length > 24) return err('ops');
  const maxK = m - 1;
  const minK = Math.ceil(m / 2) - 1;
  let seq = 0;
  const mk = (keys, kids = []) => ({ id: `n${seq++}`, keys, kids });
  let root = mk([]);
  const steps = [];
  const snap = () => cloneB(root);
  const findPath = (k) => {
    const path = [];
    let p = root;
    for (;;) {
      path.push(p);
      if (p.keys.includes(k) || !p.kids.length) return path;
      let i = 0;
      while (i < p.keys.length && k > p.keys[i]) i++;
      p = p.kids[i];
    }
  };
  const parentOf = (node, cur = root, par = null) => {
    if (cur === node) return par;
    for (const c of cur.kids) {
      const r = parentOf(node, c, cur);
      if (r) return r;
    }
    return null;
  };
  for (const { op, k } of list) {
    if (op === 'ins') {
      const path = findPath(k);
      const leaf = path.at(-1);
      if (leaf.keys.includes(k)) {
        steps.push({ op, k, kind: 'dup', tree: snap() });
        continue;
      }
      leaf.keys.push(k);
      leaf.keys.sort((a, b) => a - b);
      steps.push({ op, k, kind: 'ins', hot: leaf.id, over: leaf.keys.length > maxK, tree: snap() });
      let node = leaf;
      while (node.keys.length > maxK) {
        const mid = Math.ceil(m / 2) - 1;
        const up = node.keys[mid];
        const right = mk(node.keys.slice(mid + 1), node.kids.slice(mid + 1));
        node.keys = node.keys.slice(0, mid);
        node.kids = node.kids.slice(0, mid + 1);
        let par = parentOf(node);
        let newRoot = false;
        if (!par) {
          par = mk([], [node]);
          root = par;
          newRoot = true;
        }
        const at = par.kids.indexOf(node);
        par.keys.splice(at, 0, up);
        par.kids.splice(at + 1, 0, right);
        steps.push({ op, k, kind: 'split', up, left: node.id, right: right.id, par: par.id, newRoot, over: par.keys.length > maxK, tree: snap() });
        node = par;
      }
      continue;
    }
    // 删除
    const path = findPath(k);
    let node = path.at(-1);
    if (!node.keys.includes(k)) {
      steps.push({ op, k, kind: 'missing', tree: snap() });
      continue;
    }
    if (node.kids.length) {
      // 用直接前驱替代：左子树里最右下的关键字
      const i = node.keys.indexOf(k);
      let q = node.kids[i];
      while (q.kids.length) q = q.kids.at(-1);
      const pred = q.keys.at(-1);
      node.keys[i] = pred;
      q.keys.pop();
      steps.push({ op, k, kind: 'pred', pred, at: node.id, leaf: q.id, under: q !== root && q.keys.length < minK, tree: snap() });
      node = q;
    } else {
      node.keys.splice(node.keys.indexOf(k), 1);
      steps.push({ op, k, kind: 'del', at: node.id, under: node !== root && node.keys.length < minK, tree: snap() });
    }
    // 下溢修复
    while (node !== root && node.keys.length < minK) {
      const par = parentOf(node);
      const i = par.kids.indexOf(node);
      const L = par.kids[i - 1];
      const R = par.kids[i + 1];
      if (L && L.keys.length > minK) {
        node.keys.unshift(par.keys[i - 1]);
        par.keys[i - 1] = L.keys.pop();
        if (L.kids.length) node.kids.unshift(L.kids.pop());
        steps.push({ op, k, kind: 'borrowL', at: node.id, sib: L.id, par: par.id, up: par.keys[i - 1], down: node.keys[0], tree: snap() });
        break;
      }
      if (R && R.keys.length > minK) {
        node.keys.push(par.keys[i]);
        par.keys[i] = R.keys.shift();
        if (R.kids.length) node.kids.push(R.kids.shift());
        steps.push({ op, k, kind: 'borrowR', at: node.id, sib: R.id, par: par.id, up: par.keys[i], down: node.keys.at(-1), tree: snap() });
        break;
      }
      // 合并：和左兄弟（没有就和右兄弟），父结点里夹在中间的关键字下移
      const [A, B, j] = L ? [L, node, i - 1] : [node, R, i];
      const down = par.keys[j];
      A.keys = [...A.keys, down, ...B.keys];
      A.kids = [...A.kids, ...B.kids];
      par.keys.splice(j, 1);
      par.kids.splice(j + 1, 1);
      let rootGone = false;
      if (par === root && !par.keys.length) {
        root = A;
        rootGone = true;
      }
      steps.push({ op, k, kind: 'merge', at: A.id, gone: B.id, down, par: par.id, rootGone, under: !rootGone && par !== root && par.keys.length < minK, tree: snap() });
      node = par;
      if (rootGone) break;
    }
  }
  return { ok: true, m, maxK, minK, steps, tree: snap() };
}
const cloneB = (n) => ({ id: n.id, keys: [...n.keys], kids: n.kids.map(cloneB) });
export const flatB = (n, d = 0, out = []) => (out.push({ ...n, d }), n.kids.forEach((c) => flatB(c, d + 1, out)), out);
export const keysInOrder = (n) => (n.kids.length ? n.keys.flatMap((k, i) => [...keysInOrder(n.kids[i]), k]).concat(keysInOrder(n.kids.at(-1))) : [...n.keys]);
