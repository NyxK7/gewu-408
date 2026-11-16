// 树这一章的纯计算：哈夫曼树、并查集、线索二叉树、树和森林与二叉树的转换。
//
// 约定（界面上写明）：
//   · 哈夫曼树：每次取权值最小的两棵树合并，小的作左子树；权值相同时先生成的在左（原始结点按输入顺序）；左 0 右 1；
//   · 并查集：数组 S，根结点存「−集合大小」，其余存父结点下标；按大小合并（小树并到大树下，一样大时第二个并到第一个下）；
//     查找时可选「路径压缩」：查找路径上的结点都直接挂到根下。
import { ino, level, post, pre } from './tree.js';

const err = (e) => ({ ok: false, errors: [e] });

// ───── 哈夫曼树 ─────
export function huffman({ weights }) {
  if (!Array.isArray(weights) || weights.length < 2 || weights.length > 12 || weights.some((w) => !(w > 0))) return err('weights');
  let seq = 0;
  let pool = weights.map((w, i) => ({ id: `h${i}`, val: w, leaf: true, idx: i, seq: seq++, l: null, r: null }));
  const steps = [];
  while (pool.length > 1) {
    pool.sort((a, b) => a.val - b.val || a.seq - b.seq);
    const [a, b] = pool;
    const n = { id: `m${seq}`, val: a.val + b.val, leaf: false, seq: seq++, l: a, r: b };
    pool = [...pool.slice(2), n];
    steps.push({ a: a.val, b: b.val, sum: n.val, node: n.id, forest: pool.map((x) => x) });
  }
  const root = pool[0];
  const codes = [];
  (function walk(t, code) {
    if (t.leaf) codes[t.idx] = code || '0';
    else {
      walk(t.l, code + '0');
      walk(t.r, code + '1');
    }
  })(root, '');
  const wpl = weights.reduce((s, w, i) => s + w * codes[i].length, 0);
  return { ok: true, weights, steps, root, codes, wpl };
}

// ───── 并查集 ─────
export function parseUf(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[,，;；\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = it.match(/^([UuFf])\s+(\d+)(?:\s+(\d+))?$/);
    if (!m) return null;
    if (/u/i.test(m[1]) && m[3] == null) return null;
    out.push(/u/i.test(m[1]) ? { op: 'U', a: +m[2], b: +m[3] } : { op: 'F', a: +m[2] });
  }
  return out;
}
export function unionFind({ n, ops, compress = true }) {
  if (!(Number.isInteger(n) && n >= 2 && n <= 12)) return err('n');
  const list = parseUf(ops);
  if (!list || !list.length || list.length > 16) return err('ops');
  if (list.some((o) => o.a >= n || (o.b ?? 0) >= n)) return err('range');
  const S = Array(n).fill(-1);
  const steps = [];
  const find = (x) => {
    const path = [x];
    while (S[path.at(-1)] >= 0) path.push(S[path.at(-1)]);
    return path;
  };
  for (const o of list) {
    if (o.op === 'F') {
      const path = find(o.a);
      const root = path.at(-1);
      const moved = [];
      if (compress) for (const v of path.slice(0, -2)) {
        S[v] = root;
        moved.push(v);
      }
      steps.push({ ...o, path, root, moved, S: [...S] });
      continue;
    }
    const pa = find(o.a);
    const pb = find(o.b);
    const ra = pa.at(-1);
    const rb = pb.at(-1);
    if (ra === rb) {
      steps.push({ ...o, same: true, ra, rb, pa, pb, S: [...S] });
      continue;
    }
    // 小树并到大树；一样大时 b 的根并到 a 的根
    const [big, small] = -S[rb] > -S[ra] ? [rb, ra] : [ra, rb];
    S[big] += S[small];
    S[small] = big;
    steps.push({ ...o, ra, rb, pa, pb, big, small, S: [...S] });
  }
  return { ok: true, n, steps, compress, S };
}
export function forestOf(S) {
  // 把数组变成森林（每个结点的孩子按下标排序）
  const kids = S.map(() => []);
  S.forEach((p, i) => p >= 0 && kids[p].push(i));
  const mk = (i) => ({ id: `u${i}`, val: String(i), kids: kids[i].map(mk) });
  return S.map((p, i) => (p < 0 ? mk(i) : null)).filter(Boolean);
}

// ───── 线索二叉树 ─────
export function thread(root, order = 'in') {
  const seq = (order === 'pre' ? pre : order === 'post' ? post : ino)(root);
  const pos = new Map(seq.map((n, i) => [n, i]));
  const threads = [];
  seq.forEach((n, i) => {
    if (!n.l) threads.push({ from: n, side: 'l', to: seq[i - 1] ?? null });
    if (!n.r) threads.push({ from: n, side: 'r', to: seq[i + 1] ?? null });
  });
  return { seq, pos, threads };
}

// ───── 树、森林 ↔ 二叉树 ─────
/** 读「A(B,C(D)) E(F)」这样的写法：括号里是孩子，顶层空格隔开的是森林里的各棵树 */
export function parseForest(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  let i = 0;
  const names = new Set();
  const node = () => {
    const m = s.slice(i).match(/^[A-Za-z0-9]{1,3}/);
    if (!m) throw new Error('bad');
    i += m[0].length;
    if (names.has(m[0])) throw new Error('dup');
    names.add(m[0]);
    const n = { id: `f${m[0]}`, val: m[0], kids: [] };
    if (s[i] === '(') {
      i++;
      for (;;) {
        while (s[i] === ' ') i++;
        n.kids.push(node());
        while (s[i] === ' ') i++;
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i] === ')') {
          i++;
          break;
        }
        throw new Error('bad');
      }
    }
    return n;
  };
  try {
    const trees = [];
    while (i < s.length) {
      while (s[i] === ' ' || s[i] === ',') i++;
      if (i >= s.length) break;
      trees.push(node());
    }
    if (!trees.length || names.size > 16) return null;
    return trees;
  } catch {
    return null;
  }
}
/** 孩子兄弟表示：左指针指第一个孩子，右指针指下一个兄弟；森林里各棵树的根互为兄弟 */
export function toBinary(trees) {
  const conv = (list) => {
    if (!list.length) return null;
    const [h, ...rest] = list;
    return { id: h.id, val: h.val, l: conv(h.kids), r: conv(rest) };
  };
  return conv(trees);
}
export const forestPre = (trees) => trees.flatMap((t) => [t.val, ...forestPre(t.kids)]);
export const forestPost = (trees) => trees.flatMap((t) => [...forestPost(t.kids), t.val]);
export { ino, level, post, pre };
