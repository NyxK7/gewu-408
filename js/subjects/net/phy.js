// 物理层的纯计算：
//   encode：把比特串编成几种常见编码的电平序列（每个比特分前后两个半周期，1 高 0 低）；
//   limits：奈氏准则和香农公式算出的极限数据率。
//
// 编码约定（界面上写明）：
//   · 不归零 NRZ：1 高电平，0 低电平，整个码元保持不变；
//   · 反向不归零 NRZI：电平翻转表示 0，保持不变表示 1（各教材说法不一，本课按这一种）；
//   · 曼彻斯特：每个码元中间都跳变。manchester = 'up0'：中间向上跳表示 0、向下跳表示 1；
//     'up1'：向上跳表示 1、向下跳表示 0（IEEE 802.3 以太网的约定）；
//   · 差分曼彻斯特：每个码元中间都跳变（只用来同步）；码元开始处有跳变表示 0，没有跳变表示 1；
//   · NRZI 和差分曼彻斯特都要知道「开始前的电平」init（0 低、1 高）。

export function encode({ bits, init = 0, manchester = 'up0' }) {
  if (!/^[01]{1,16}$/.test(bits ?? '')) return { ok: false, errors: ['bits'] };
  const b = [...bits].map(Number);
  const nrz = b.flatMap((x) => [x, x]);
  const nrzi = [];
  let lv = init;
  for (const x of b) {
    if (x === 0) lv = 1 - lv;
    nrzi.push(lv, lv);
  }
  // 曼彻斯特：up0 时 0 = 低→高，1 = 高→低
  const man = b.flatMap((x) => {
    const up = manchester === 'up0' ? x === 0 : x === 1;
    return up ? [0, 1] : [1, 0];
  });
  // 差分曼彻斯特：开始处 0 跳变、1 不跳变；中间一定跳变
  const diff = [];
  lv = init;
  for (const x of b) {
    const first = x === 0 ? 1 - lv : lv;
    diff.push(first, 1 - first);
    lv = 1 - first;
  }
  return { ok: true, bits: b, init, manchester, codes: { nrz, nrzi, man, diff } };
}

/** 奈氏准则与香农公式。W 带宽（Hz），V 码元的离散电平数，snr 信噪比（db 为真时按分贝给出） */
export function limits({ W, V, snr, db = true }) {
  const errors = [];
  if (!(W > 0)) errors.push('W');
  if (!(Number.isInteger(V) && V >= 2)) errors.push('V');
  if (!(snr >= 0)) errors.push('snr');
  if (errors.length) return { ok: false, errors };
  const ratio = db ? 10 ** (snr / 10) : snr;
  if (!Number.isFinite(ratio) || !Number.isFinite(W * Math.log2(1 + ratio))) return { ok: false, errors: ['snrBig'] }; // 比如 99999999 dB，换算后是无穷大
  const baud = 2 * W;
  const bitsPer = Math.log2(V);
  const nyq = baud * bitsPer;
  const shannon = W * Math.log2(1 + ratio);
  return { ok: true, W, V, snr, db, ratio, baud, bitsPer, nyq, shannon, max: Math.min(nyq, shannon), by: nyq <= shannon ? 'nyq' : 'shannon' };
}
