// CRC 循环冗余校验的纯计算：模 2 除法求冗余码（FCS），接收方用同一个生成多项式检验。
//
// 约定（界面上写明）：
//   · 生成多项式写成比特串，最高位必须是 1，阶数 r = 位数 − 1；
//   · 发送方：数据后面补 r 个 0，用生成多项式做模 2 除法（每一步按位异或，不借位），余数就是 r 位冗余码；
//     发送的帧 = 数据 + 冗余码；
//   · 接收方：把收到的整串直接除以生成多项式，余数为 0 就接受，不为 0 就丢弃；
//   · flips 是传输中翻转的位置（从 0 开始，从左往右数），用来演示出错；
//     错误模式恰好是生成多项式的倍数时余数也为 0，这种错误检测不出来。

const bits = (s) => [...s].map(Number);

/** 模 2 除法：返回每一次异或的位置和异或后的整串，以及商和余数 */
export function divide(dividend, gen) {
  const a = [...dividend];
  const r = gen.length - 1;
  const n = a.length - r; // 商的位数
  const q = [];
  const xors = [];
  for (let i = 0; i < n; i++) {
    if (a[i] === 1) {
      const before = a.slice(i, i + gen.length);
      for (let j = 0; j < gen.length; j++) a[i + j] ^= gen[j];
      q.push(1);
      xors.push({ pos: i, before, after: a.slice(i, i + gen.length), snap: [...a] });
    } else q.push(0);
  }
  return { q, rem: a.slice(n), xors, final: a };
}

export function crc({ data, gen, flips = [] }) {
  const errors = [];
  if (!/^[01]{1,24}$/.test(data ?? '')) errors.push('data');
  if (!/^1[01]{1,8}$/.test(gen ?? '')) errors.push('gen');
  if (errors.length) return { ok: false, errors };
  const d = bits(data);
  const g = bits(gen);
  const r = g.length - 1;
  const len = d.length + r;
  for (const f of flips) if (!(Number.isInteger(f) && f >= 0 && f < len)) return { ok: false, errors: [['flip', { f, max: len - 1 }]] };
  const dividend = [...d, ...Array(r).fill(0)];
  const send = divide(dividend, g);
  const frame = [...d, ...send.rem];
  const recvBits = frame.map((b, i) => (flips.includes(i) ? 1 - b : b));
  const recv = divide(recvBits, g);
  const zero = recv.rem.every((b) => b === 0);
  return {
    ok: true,
    data: d,
    gen: g,
    r,
    dividend,
    q: send.q,
    rem: send.rem,
    xors: send.xors,
    frame,
    flips: [...new Set(flips)].sort((a, b) => a - b),
    recvBits,
    recvRem: recv.rem,
    recvXors: recv.xors.length,
    accepted: zero,
    // 有错却余数为 0：检测不出来
    missed: zero && flips.length > 0 && recvBits.some((b, i) => b !== frame[i]),
  };
}

export const toStr = (a) => a.join('');
