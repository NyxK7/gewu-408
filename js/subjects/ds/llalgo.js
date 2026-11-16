// 链表算法题里的「双指针」：找中间结点、找倒数第 k 个、合并两个有序链表、找两个链表的第一个公共结点。
// 每一步记下各个指针停在哪、说明一句话。
//
// 约定（界面上写明）：
//   · 链表带头结点，下标指第几个数据结点（从 1 开始），0 表示头结点，null 表示 NULL；
//   · 中间结点：慢指针每次走 1 步、快指针每次走 2 步，结点个数为偶数时取前一个中间结点；
//   · 倒数第 k 个：k 从 1 开始，快指针先走 k 步，再一起走到快指针为 NULL；
//   · 合并：两个递增链表合成一个递增链表，相等时先取第一个链表的结点（保持稳定）；
//   · 公共结点：两个链表从某个结点起共用同一段后缀（不是值相等，而是同一个结点）。

const err = (e) => ({ ok: false, errors: [e] });
const seq = (s) => String(s ?? '').split(/[\s,，]+/).filter(Boolean);

export function twoPointer({ mode, a, b = '', c = '', k = 1 }) {
  const A = seq(a);
  if (!A.length && mode !== 'intersect') return err('empty');
  if (A.length > 10) return err('long');
  const steps = [];
  // 最后一步如果指针没再动，就把它标成「停下」，不重复画一遍
  const stop = (extra) => {
    const last = steps.at(-1);
    if (last && last.kind === 'move') Object.assign(last, { kind: 'stop', ...extra });
    else steps.push({ p: { ...last.p }, kind: 'stop', ...extra });
  };
  if (mode === 'mid') {
    let slow = 1;
    let fast = 1;
    steps.push({ p: { slow, fast }, kind: 'start' });
    while (fast + 2 <= A.length) {
      slow += 1;
      fast += 2;
      steps.push({ p: { slow, fast }, kind: 'move' });
    }
    // 快指针再走一步就到 NULL（或者已经是最后一个），慢指针停在中间
    stop({ ans: slow });
    return { ok: true, mode, A, steps, ans: slow };
  }
  if (mode === 'kth') {
    if (!(Number.isInteger(k) && k >= 1)) return err('k');
    if (k > A.length) {
      steps.push({ p: { fast: null }, kind: 'tooFar' });
      return { ok: true, mode, A, k, steps, ans: null };
    }
    let fast = 1;
    let slow = 1;
    steps.push({ p: { fast, slow }, kind: 'start' });
    fast = 1 + k; // 先走 k 步
    steps.push({ p: { fast: fast > A.length ? null : fast, slow }, kind: 'ahead' });
    while (fast <= A.length) {
      fast++;
      slow++;
      steps.push({ p: { fast: fast > A.length ? null : fast, slow }, kind: 'move' });
    }
    stop({ ans: slow });
    return { ok: true, mode, A, k, steps, ans: slow };
  }
  if (mode === 'merge') {
    const B = seq(b);
    if (!B.length || B.length > 10) return err('long');
    const na = A.map(Number);
    const nb = B.map(Number);
    const sorted = (x) => x.every((v, i) => i === 0 || v >= x[i - 1]) && x.every(Number.isFinite);
    if (!sorted(na) || !sorted(nb)) return err('unsorted');
    let i = 0;
    let j = 0;
    const C = [];
    steps.push({ p: { pa: 1, pb: 1 }, C: [], kind: 'start' });
    while (i < na.length && j < nb.length) {
      const fromA = na[i] <= nb[j];
      C.push(fromA ? { l: 'A', i } : { l: 'B', i: j });
      if (fromA) i++;
      else j++;
      steps.push({ p: { pa: i < na.length ? i + 1 : null, pb: j < nb.length ? j + 1 : null }, C: C.map((x) => ({ ...x })), kind: 'take', from: fromA ? 'A' : 'B', cmp: [na[fromA ? i - 1 : i], nb[fromA ? j : j - 1]] });
    }
    const rest = i < na.length ? 'A' : 'B';
    for (; i < na.length; i++) C.push({ l: 'A', i });
    for (; j < nb.length; j++) C.push({ l: 'B', i: j });
    steps.push({ p: { pa: null, pb: null }, C: C.map((x) => ({ ...x })), kind: 'rest', rest });
    return { ok: true, mode, A, B, steps, C };
  }
  if (mode === 'intersect') {
    const B = seq(b);
    const Cm = seq(c);
    if (!Cm.length) return err('common');
    if (A.length + Cm.length > 10 || B.length + Cm.length > 10) return err('long');
    const la = A.length + Cm.length;
    const lb = B.length + Cm.length;
    // 位置：A 链表第 x 个结点，x > A.length 时是公共部分
    let pa = 1;
    let pb = 1;
    steps.push({ p: { pa, pb }, kind: 'len', la, lb });
    const d = Math.abs(la - lb);
    if (la > lb) pa += d;
    else pb += d;
    steps.push({ p: { pa, pb }, kind: 'ahead', d, longer: la > lb ? 'A' : la < lb ? 'B' : null });
    // 同一个结点：两边都走到了公共部分的同一个位置
    const same = () => pa - A.length === pb - B.length && pa > A.length;
    while (!same()) {
      pa++;
      pb++;
      steps.push({ p: { pa, pb }, kind: 'move' });
    }
    stop({ ans: Cm[0] });
    return { ok: true, mode, A, B, Cm, la, lb, steps, ans: Cm[0] };
  }
  return err('mode');
}
