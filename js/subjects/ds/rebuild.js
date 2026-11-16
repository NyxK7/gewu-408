// 由遍历序列还原二叉树：先序 + 中序，或后序 + 中序。结点值要互不相同。
// 每一步记录：这一段的根是谁、它在中序里把序列分成左右两段。

export const seq = (s) => String(s ?? '').split(/[\s,，]+/).filter(Boolean);

export function rebuild({ mode = 'pre', order, inorder }) {
  const o = seq(order);
  const m = seq(inorder);
  if (!o.length || o.length > 15) return { ok: false, errors: ['len'] };
  if (o.length !== m.length) return { ok: false, errors: ['mismatch'] };
  if (new Set(m).size !== m.length) return { ok: false, errors: ['dup'] };
  if ([...o].sort().join() !== [...m].sort().join()) return { ok: false, errors: ['mismatch'] };
  const steps = [];
  const node = (v) => ({ id: v, val: v, l: null, r: null });
  let bad = false;
  // os..oe 是先序（或后序）的一段，is..ie 是中序的一段
  function go(os, oe, is, ie, parent, side) {
    if (os > oe) return null;
    const rootVal = mode === 'pre' ? o[os] : o[oe];
    const k = m.indexOf(rootVal, is);
    if (k < is || k > ie) {
      bad = true;
      return null;
    }
    const n = node(rootVal);
    const nl = k - is;
    steps.push({ root: rootVal, parent: parent?.val ?? null, side, oseg: [os, oe], iseg: [is, ie], k, left: m.slice(is, k), right: m.slice(k + 1, ie + 1), n });
    if (parent) parent[side] = n;
    if (mode === 'pre') {
      go(os + 1, os + nl, is, k - 1, n, 'l');
      go(os + nl + 1, oe, k + 1, ie, n, 'r');
    } else {
      go(os, os + nl - 1, is, k - 1, n, 'l');
      go(os + nl, oe - 1, k + 1, ie, n, 'r');
    }
    return n;
  }
  const root = go(0, o.length - 1, 0, m.length - 1, null, null);
  if (bad) return { ok: false, errors: ['conflict'] };
  return { ok: true, mode, order: o, inorder: m, root, steps };
}
