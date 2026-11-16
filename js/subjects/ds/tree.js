// 二叉树的通用小件：按层序串建树、四种遍历、平面画法（结点是圆、边是线）。
// 结点 { id, val, l, r }；id 唯一，画板上用它做 key，结点移动时能补间。
import { txt } from '../../core/board.js';

/** 层序串 → 二叉树。「#」或「^」表示空。返回根，或 null（串不合法） */
export function fromLevel(text) {
  const tok = String(text ?? '').split(/[\s,，]+/).filter(Boolean);
  if (!tok.length || tok[0] === '#' || tok[0] === '^' || tok.length > 31) return null;
  const nodes = tok.map((t, i) => (t === '#' || t === '^' ? null : { id: `n${i}`, val: t, l: null, r: null }));
  const root = nodes[0];
  const q = [root];
  let i = 1;
  while (q.length && i < nodes.length) {
    const p = q.shift();
    p.l = nodes[i++] ?? null;
    if (p.l) q.push(p.l);
    if (i < nodes.length) {
      p.r = nodes[i++] ?? null;
      if (p.r) q.push(p.r);
    }
  }
  // 多余的非空记号没有父结点可挂：不合法
  const used = new Set();
  (function walk(n) {
    if (!n) return;
    used.add(n);
    walk(n.l);
    walk(n.r);
  })(root);
  if (nodes.some((n) => n && !used.has(n))) return null;
  return root;
}

export const pre = (n, out = []) => (n ? (out.push(n), pre(n.l, out), pre(n.r, out), out) : out);
export const ino = (n, out = []) => (n ? (ino(n.l, out), out.push(n), ino(n.r, out), out) : out);
export const post = (n, out = []) => (n ? (post(n.l, out), post(n.r, out), out.push(n), out) : out);
export function level(root) {
  const out = [];
  const q = root ? [root] : [];
  while (q.length) {
    const n = q.shift();
    out.push(n);
    if (n.l) q.push(n.l);
    if (n.r) q.push(n.r);
  }
  return out;
}
export const height = (n) => (n ? 1 + Math.max(height(n.l), height(n.r)) : 0);

/** 布局：横坐标按中序位置，纵坐标按深度 */
export function layout(root) {
  const pos = new Map();
  let i = 0;
  let depth = 0;
  (function go(n, d) {
    if (!n) return;
    go(n.l, d + 1);
    pos.set(n, { i: i++, d });
    depth = Math.max(depth, d);
    go(n.r, d + 1);
  })(root, 0);
  return { pos, count: i, depth };
}

/**
 * 画成画板图元：每个结点一个图元（key = 'tn-' + id），所有边合成一个图元。
 * opt: { x0, y0, dx, dy, r, cls(n), note(n), tag(n) }
 */
export function treeItems(root, opt = {}) {
  const { x0 = 0, y0 = 0, dx = 52, dy = 72, r = 19 } = opt;
  const { pos } = layout(root);
  const at = (n) => [x0 + pos.get(n).i * dx, y0 + pos.get(n).d * dy];
  const items = [];
  let edges = '';
  for (const [n] of pos) {
    const [x, y] = at(n);
    for (const c of [n.l, n.r]) {
      if (!c) continue;
      const [cx, cy] = at(c);
      const len = Math.hypot(cx - x, cy - y);
      const ux = (cx - x) / len;
      const uy = (cy - y) / len;
      edges += `<line class="te ${opt.edge?.(n, c) ?? ''}" x1="${(x + ux * r).toFixed(1)}" y1="${(y + uy * r).toFixed(1)}" x2="${(cx - ux * r).toFixed(1)}" y2="${(cy - uy * r).toFixed(1)}"/>`;
    }
  }
  items.push({ k: 'tree-edges', x: 0, y: 0, html: edges });
  for (const [n] of pos) {
    const [x, y] = at(n);
    const note = opt.note?.(n);
    const tag = opt.tag?.(n);
    items.push({
      k: `tn-${n.id}`,
      x,
      y,
      html: `<g class="tn ${opt.cls?.(n) ?? ''}"><circle r="${r}"/>${txt(0, 5, String(n.val), 'tn-t')}</g>` + (note != null ? txt(r + 4, -r + 4, String(note), 'tn-note', 'start') : '') + (tag != null ? txt(0, r + 16, String(tag), 'tn-tag') : ''),
    });
  }
  return items;
}
