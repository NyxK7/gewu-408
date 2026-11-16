// 快速排序的纯计算（教材的写法）：取区间第一个元素做枢轴，low、high 两个指针交替向中间移动「挖坑填数」，
// 枢轴落到最终位置；再递归处理左边、右边（先左后右）。只有长度 ≥ 2 的区间才做划分。
//
// 每次划分记录：区间、枢轴、落点、划分前后的数组、每次「填坑」的移动、和枢轴比较的次数。

export function quicksort(input) {
  if (!Array.isArray(input) || input.length < 2 || input.length > 14 || input.some((x) => !Number.isFinite(x))) return { ok: false, errors: ['keys'] };
  const a = [...input];
  const parts = [];
  const fixed = new Set();
  (function qs(lo, hi, depth) {
    if (lo > hi) return;
    if (lo === hi) {
      fixed.add(lo);
      return;
    }
    const before = [...a];
    const pivot = a[lo];
    const moves = [];
    let cmp = 0;
    let low = lo;
    let high = hi;
    while (low < high) {
      while (low < high && (cmp++, a[high] >= pivot)) high--;
      if (low < high) {
        moves.push({ from: high, to: low, val: a[high], side: 'high' });
        a[low] = a[high];
      }
      while (low < high && (cmp++, a[low] <= pivot)) low++;
      if (low < high) {
        moves.push({ from: low, to: high, val: a[low], side: 'low' });
        a[high] = a[low];
      }
    }
    a[low] = pivot;
    fixed.add(low);
    parts.push({ lo, hi, pivot, pos: low, depth, before, after: [...a], moves, cmp, fixed: [...fixed] });
    qs(lo, low - 1, depth + 1);
    qs(low + 1, hi, depth + 1);
  })(0, a.length - 1, 0);
  return { ok: true, input: [...input], parts, sorted: a };
}
