// 时延的纯计算：报文交换和分组交换经过 k 段链路（k − 1 个路由器，存储转发）所用的总时间。
//
// 约定（界面上写明）：
//   · 每段链路数据率都是 b（b/s），传播时延都是 d（秒）；不计排队时延和处理时延；
//   · 报文交换：整个报文 x 比特一次发送，每个结点收完整个报文才往下一段发；
//   · 分组交换：报文按 p 比特切成 n = ⌈x / p⌉ 个分组（最后一个可能不满），每个分组再加 h 比特首部；
//     每个结点收完一个分组就转发，一段链路上同一时间只能发一个分组；
//   · 用逐个分组、逐段链路的推算求结果：分组 i 在第 j 段开始发送 = max(它到达这个结点的时刻, 分组 i − 1 在这段发完的时刻)。

export function switching({ x, p, h = 0, b, d = 0, k }) {
  const errors = [];
  if (!(Number.isInteger(x) && x > 0)) errors.push('x');
  if (!(Number.isInteger(p) && p > 0)) errors.push('p');
  if (!(Number.isInteger(h) && h >= 0)) errors.push('h');
  if (!(b > 0)) errors.push('b');
  if (!(d >= 0)) errors.push('d');
  if (!(Number.isInteger(k) && k >= 1 && k <= 6)) errors.push('k');
  if (errors.length) return { ok: false, errors };
  const n = Math.ceil(x / p);
  if (n > 16) return { ok: false, errors: ['n'] };

  // 报文交换
  const tm = x / b;
  const msg = [];
  let t = 0;
  for (let j = 0; j < k; j++) {
    msg.push({ link: j, start: t, end: t + tm });
    t += tm + d;
  }
  const msgTotal = t;

  // 分组交换
  const sizes = Array.from({ length: n }, (_, i) => Math.min(p, x - i * p) + h);
  const fin = Array.from({ length: n }, () => Array(k).fill(0));
  const segs = [];
  for (let i = 0; i < n; i++) {
    const tx = sizes[i] / b;
    for (let j = 0; j < k; j++) {
      const arrive = j === 0 ? 0 : fin[i][j - 1] + d;
      const free = i === 0 ? 0 : fin[i - 1][j];
      const start = Math.max(arrive, free);
      fin[i][j] = start + tx;
      segs.push({ pkt: i, link: j, start, end: fin[i][j] });
    }
  }
  const pktTotal = fin[n - 1][k - 1] + d;
  const equal = x % p === 0;
  const tp = (p + h) / b;
  return {
    ok: true,
    x,
    p,
    h,
    b,
    d,
    k,
    n,
    tm,
    tp,
    sizes,
    msg,
    msgTotal,
    segs,
    pktTotal,
    equal,
    // 分组大小都相同时的公式结果，用来和推算对照
    formula: equal ? (n + k - 1) * tp + k * d : null,
  };
}
