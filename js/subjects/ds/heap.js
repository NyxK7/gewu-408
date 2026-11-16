// 堆的纯计算：筛选法建堆（从 ⌊n/2⌋ 往前逐个向下调整）、逐个插入建堆（向上调整）、堆排序。数组下标从 1 开始。
// 关键字比较次数的约定（界面上写明）：
//   · 向下调整：有两个孩子时，先比较两个孩子（1 次），再拿较大（小根堆为较小）的孩子和结点比较（1 次）；只有一个孩子时只比 1 次；
//     结点已经不小于（小根堆：不大于）孩子就停；
//   · 向上调整：每上一层和双亲比较 1 次，不比双亲大（小）就停；到根为止。

const better = (kind) => (kind === 'max' ? (x, y) => x > y : (x, y) => x < y);

/** a: 1 起的数组，元素是 { id, key }。返回这次调整的比较次数和交换序列 */
function siftDown(a, i, size, kind) {
  const b = better(kind);
  let cmp = 0;
  const swaps = [];
  const log = [];
  for (;;) {
    const l = 2 * i;
    const r = l + 1;
    if (l > size) break;
    let c = l;
    if (r <= size) {
      cmp++;
      log.push({ type: 'kids', l, r, pick: b(a[r].key, a[l].key) ? r : l });
      if (b(a[r].key, a[l].key)) c = r;
    }
    cmp++;
    const sw = b(a[c].key, a[i].key);
    log.push({ type: 'vs', i, c, swap: sw });
    if (!sw) break;
    [a[i], a[c]] = [a[c], a[i]];
    swaps.push([i, c]);
    i = c;
  }
  return { cmp, swaps, log };
}

function siftUp(a, i, kind) {
  const b = better(kind);
  let cmp = 0;
  const swaps = [];
  const log = [];
  while (i > 1) {
    const p = Math.floor(i / 2);
    cmp++;
    const sw = b(a[i].key, a[p].key);
    log.push({ type: 'up', i, p, swap: sw });
    if (!sw) break;
    [a[i], a[p]] = [a[p], a[i]];
    swaps.push([i, p]);
    i = p;
  }
  return { cmp, swaps, log };
}

const keysOf = (a, n) => a.slice(1, n + 1).map((e) => e.key);

export function simulate({ keys, kind = 'max', op = 'build' }) {
  const errors = [];
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 15) errors.push('keys');
  if (!['max', 'min'].includes(kind)) errors.push('kind');
  if (!['build', 'insert', 'sort'].includes(op)) errors.push('op');
  if (errors.length) return { ok: false, errors };

  const n = keys.length;
  const items = keys.map((key, id) => ({ id, key }));
  const a = [null];
  const steps = [];
  let total = 0;
  if (op === 'insert') {
    for (const e of items) {
      a.push(e);
      const prev = [...a];
      const at = a.length - 1;
      const r = siftUp(a, at, kind);
      total += r.cmp;
      steps.push({ type: 'insert', key: e.key, at, ...r, size: a.length - 1, prev, arr: [...a], total });
    }
  } else {
    a.push(...items);
    steps.push({ type: 'tree', cmp: 0, swaps: [], log: [], size: n, arr: [...a], total });
    for (let i = Math.floor(n / 2); i >= 1; i--) {
      const prev = [...a];
      const k0 = a[i].key;
      const r = siftDown(a, i, n, kind);
      total += r.cmp;
      steps.push({ type: 'sift', i, key: k0, ...r, size: n, prev, arr: [...a], total });
    }
    if (op === 'sort') {
      for (let size = n; size > 1; size--) {
        const prev = [...a];
        [a[1], a[size]] = [a[size], a[1]];
        const out = a[size].key;
        const mid = [...a];
        const r = siftDown(a, 1, size - 1, kind);
        total += r.cmp;
        steps.push({ type: 'extract', out, last: size, ...r, size: size - 1, prev, mid, arr: [...a], total });
      }
    }
  }
  const heap = op === 'sort' ? null : keysOf(a, n);
  return { ok: true, kind, op, n, keys, steps, heap, sorted: op === 'sort' ? keysOf(a, n) : null, total };
}
