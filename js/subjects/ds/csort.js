// 计数排序的纯计算：统计、求前缀和、从后往前放回（保证稳定）。
//
// 约定（界面上写明）：关键字是 0～k 的整数；计数数组 C 下标 0～k；输出数组 B 下标从 0 开始；
// 放回时从 A 的最后一个元素往前扫，B[C[x] − 1] = x，然后 C[x] 减 1——相同的关键字保持原来的先后次序。

const err = (e) => ({ ok: false, errors: [e] });

export function countingSort(a) {
  if (!Array.isArray(a) || !a.length || a.length > 14) return err('n');
  if (a.some((x) => !Number.isInteger(x) || x < 0 || x > 12)) return err('range');
  const k = Math.max(...a);
  const C = Array(k + 1).fill(0);
  const count = a.map((x, i) => {
    C[x]++;
    return { i, x, C: [...C] };
  });
  const cnt = [...C];
  for (let v = 1; v <= k; v++) C[v] += C[v - 1];
  const prefix = [...C];
  const B = Array(a.length).fill(null);
  const fill = [];
  for (let i = a.length - 1; i >= 0; i--) {
    const x = a[i];
    const pos = C[x] - 1;
    B[pos] = i; // 记下原下标，画的时候能看出是哪一个
    C[x]--;
    fill.push({ i, x, pos, C: [...C], B: [...B] });
  }
  return { ok: true, a, k, cnt, prefix, count, fill, sorted: B.map((i) => a[i]), order: [...B] };
}
