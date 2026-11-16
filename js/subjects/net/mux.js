// 信道复用的纯计算。
//   · 码分复用 CDMA：每个站有一个 8 位码片序列（取 8 阶沃尔什矩阵的第 1～4 行，用 ±1 表示，两两正交）。
//     发 1 送出码片序列本身，发 0 送出它的反码，不发就是全 0；信道上各站的信号逐位相加；
//     接收方要收某站的数据，就把叠加信号和该站的码片序列做内积再除以 8：得 1 是发了 1，−1 是发了 0，0 是没发。
//   · 时分复用 TDM：每个用户在每一轮可能有一个数据单元（'.' 表示这一轮没有）。
//     同步时分：每帧给每个用户固定一个时隙，没数据也占着；
//     统计时分：每帧只有 k 个时隙，按到达先后装进有数据的单元（时隙里要带地址），装不下的排队到下一帧。

const err = (errors) => ({ ok: false, errors });
export const M = 8;
export function walsh(n) {
  let h = [[1]];
  while (h.length < n) h = [...h.map((r) => [...r, ...r]), ...h.map((r) => [...r, ...r.map((x) => -x)])];
  return h;
}
export const CODES = walsh(M).slice(1, 5); // 4 个站的码片序列
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

export function parseBits(text) {
  const s = String(text ?? '').replace(/[\s,]/g, '');
  return /^[01-]{1,4}$/.test(s) ? [...s] : null;
}

export function cdma({ bits = ['101', '110', '0-1'], target = 1 }) {
  const errors = [];
  const list = bits.map(parseBits);
  if (list.length < 2 || list.length > 4 || list.some((b) => !b)) errors.push('bits');
  else if (new Set(list.map((b) => b.length)).size !== 1) errors.push('len');
  if (!Number.isInteger(target) || target < 1 || target > list.length) errors.push('target');
  if (errors.length) return err(errors);
  const n = list.length;
  const T = list[0].length;
  const codes = CODES.slice(0, n);
  const send = (b, c) => (b === '1' ? [...c] : b === '0' ? c.map((x) => -x) : c.map(() => 0));
  const times = [];
  for (let t = 0; t < T; t++) {
    const tx = list.map((b, i) => send(b[t], codes[i]));
    const sum = Array.from({ length: M }, (_, j) => tx.reduce((s, v) => s + v[j], 0));
    const decode = codes.map((c) => {
      const prod = sum.map((x, j) => x * c[j]);
      const v = dot(sum, c) / M;
      return { prod, sum: dot(sum, c), v, bit: v === 1 ? '1' : v === -1 ? '0' : '-' };
    });
    times.push({ t, bits: list.map((b) => b[t]), tx, sum, decode });
  }
  // 正交性核对
  const ortho = codes.every((a, i) => codes.every((b, j) => dot(a, b) === (i === j ? M : 0)));
  const got = times.map((x) => x.decode[target - 1].bit).join('');
  return { ok: true, mode: 'cdma', n, T, codes, list, times, target, got, want: list[target - 1].join(''), ortho };
}

export function parseQueue(text) {
  const s = String(text ?? '').replace(/\s/g, '');
  return /^[a-z.]{1,8}$/i.test(s) ? [...s] : null;
}

export function tdm({ users = ['ab.c', '..d.', 'e..f', '.g..'], k = 2 }) {
  const errors = [];
  const qs = users.map(parseQueue);
  if (qs.length < 2 || qs.length > 4 || qs.some((q) => !q)) errors.push('users');
  else if (new Set(qs.map((q) => q.length)).size !== 1) errors.push('len');
  if (!Number.isInteger(k) || k < 1 || k > (qs.length || 4)) errors.push('k');
  if (errors.length) return err(errors);
  const n = qs.length;
  const R = qs[0].length;
  const names = ['A', 'B', 'C', 'D'].slice(0, n);
  const units = qs.reduce((s, q) => s + q.filter((c) => c !== '.').length, 0);
  // 同步时分：每轮一帧，n 个时隙
  const sync = Array.from({ length: R }, (_, r) => names.map((u, i) => ({ u, d: qs[i][r] === '.' ? null : qs[i][r] })));
  // 统计时分：每轮把这一轮到达的放进队尾，再取前 k 个；最后把队里剩下的发完
  const queue = [];
  const stat = [];
  for (let r = 0; r < R || queue.length; r++) {
    if (r < R) for (let i = 0; i < n; i++) if (qs[i][r] !== '.') queue.push({ u: names[i], d: qs[i][r], at: r });
    const slots = queue.splice(0, k);
    stat.push({ r, slots, waiting: queue.map((x) => ({ ...x })) });
    if (r > R + 40) break;
  }
  return { ok: true, mode: 'tdm', n, R, k, names, qs, units, sync, stat, syncUse: units / (R * n), statUse: units / (stat.length * k) };
}
