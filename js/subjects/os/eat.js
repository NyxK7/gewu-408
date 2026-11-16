// 快表（TLB）与有效访问时间 EAT 的纯计算。
// 约定（界面上写明）：
//   · 命中率 α、缺页率 f 都按「所有访存」计；缺页一定发生在快表未命中时，所以 α + f ≤ 1；
//   · 串行查找：先查快表，未命中再查页表。命中 t + m；未命中 t + k·m + m（k 是页表级数）；
//   · 并行查找：快表和页表同时查。命中 t + m；未命中 k·m + m（查快表的时间被页表查找盖住）；
//   · 缺页：查快表（串行时）+ 查页表发现不在内存 + 缺页处理时间 T，然后重新执行这次访存；
//     reHit 为真时，缺页处理程序已把页表项装进快表，重新执行时快表命中（t + m），否则再走一遍未命中路径；
//   · 时间单位统一用 ns，结果保留到小数点后 4 位。

const r4 = (x) => Math.round(x * 1e4) / 1e4;

export function simulate({ t, m, alpha, f = 0, T = 0, parallel = false, levels = 1, reHit = true }) {
  const errors = [];
  if (!(t >= 0)) errors.push('t');
  if (!(m > 0)) errors.push('m');
  if (!(alpha >= 0 && alpha <= 1)) errors.push('alpha');
  if (!(f >= 0 && f <= 1)) errors.push('f');
  if (alpha + f > 1 + 1e-12) errors.push('sum');
  if (![1, 2, 3].includes(levels)) errors.push('levels');
  if (f > 0 && !(T > 0)) errors.push('T');
  if (errors.length) return { ok: false, errors };

  const k = levels;
  const hit = [{ kind: 'tlb', ms: t }, { kind: 'mem', ms: m }];
  const walk = Array.from({ length: k }, (_, i) => ({ kind: 'pt', ms: m, lv: i + 1 }));
  const miss = [...(parallel ? [] : [{ kind: 'tlb', ms: t }]), ...walk, { kind: 'mem', ms: m }];
  const fault = [...(parallel ? [] : [{ kind: 'tlb', ms: t }]), ...walk, { kind: 'fault', ms: T }, ...(reHit ? hit : miss).map((x) => ({ ...x, retry: true }))];
  const sum = (p) => r4(p.reduce((a, x) => a + x.ms, 0));
  const paths = { hit: { segs: hit, time: sum(hit), p: alpha }, miss: { segs: miss, time: sum(miss), p: r4(1 - alpha - f) } };
  if (f > 0) paths.fault = { segs: fault, time: sum(fault), p: f };
  const eat = r4(Object.values(paths).reduce((a, x) => a + x.p * x.time, 0));
  // 不用快表：每次都查 k 级页表再取数据；缺页时同样加上处理时间和重新执行
  const plain = (k + 1) * m;
  const noTlb = r4(f > 0 ? (1 - f) * plain + f * (k * m + T + plain) : plain);
  return { ok: true, t, m, alpha, f, T, parallel, levels: k, reHit, paths, eat, noTlb, speedup: r4(noTlb / eat) };
}
