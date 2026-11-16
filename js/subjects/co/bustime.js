// 总线读事务的定时（主设备从从设备读 n 个 32 位字）的纯计算：
//   · 同步：统一时钟，周期 T。第 1 个周期主设备送地址和读命令；从设备准备数据要 w 个等待周期；
//     之后每个周期送一个字（突发传送），主设备在周期结束的时钟沿锁存。总时间 = (1 + w + n) × T。
//   · 异步全互锁：主设备发「请求」Ready↑；从设备看到后（传播延迟 d）取数据（访问时间 a），送上数据线并发「回答」Ack↑；
//     主设备看到 Ack↑ 锁存数据并撤掉 Ready；从设备看到 Ready↓ 撤掉数据和 Ack；主设备看到 Ack↓ 才能开始下一个字。
//     每个字 = a + 4d。
//   · 异步半互锁：主设备看到 Ack↑ 就撤 Ready 并可以开始下一个字；Ack 由从设备保持固定的时间 h 后自己撤掉（不等 Ready↓）。
//     每个字 = a + 2d（但 h 必须够长，主设备才看得到 Ack）。

const err = (errors) => ({ ok: false, errors });
export const WIDTH = 4; // 字节

export function busTiming({ mode = 'sync', n = 2, T = 10, w = 1, d = 5, a = 20, h = 15 }) {
  const errors = [];
  if (!['sync', 'full', 'half'].includes(mode)) errors.push('mode');
  for (const [k, v, lo, hi] of [['n', n, 1, 4], ['T', T, 1, 100], ['w', w, 0, 4], ['d', d, 1, 50], ['a', a, 0, 200], ['h', h, 1, 200]]) if (!Number.isInteger(v) || v < lo || v > hi) errors.push(k);
  if (errors.length) return err(errors);
  const events = [];
  const sig = { CLK: [], ADDR: [], RD: [], DATA: [], READY: [], ACK: [] };
  let total;
  if (mode === 'sync') {
    const cycles = 1 + w + n;
    total = cycles * T;
    for (let c = 0; c < cycles; c++) sig.CLK.push({ from: c * T, to: c * T + T / 2, v: 1 }, { from: c * T + T / 2, to: (c + 1) * T, v: 0 });
    sig.ADDR.push({ from: 0, to: T, label: 'addr' });
    sig.RD.push({ from: 0, to: total, v: 1 });
    events.push({ t: 0, kind: 'addr', c: 0 });
    for (let i = 0; i < w; i++) events.push({ t: (1 + i) * T, kind: 'wait', c: 1 + i });
    for (let i = 0; i < n; i++) {
      const from = (1 + w + i) * T;
      sig.DATA.push({ from, to: from + T, label: `D${i}` });
      events.push({ t: from, kind: 'data', c: 1 + w + i, i, latch: from + T });
    }
    events.push({ t: total, kind: 'end' });
  } else {
    let t0 = 0;
    for (let i = 0; i < n; i++) {
      const up = t0;
      const ackUp = up + d + a;
      const rdDown = ackUp + d;
      const ackDown = mode === 'full' ? rdDown + d : ackUp + h;
      sig.READY.push({ from: up, to: rdDown, v: 1 });
      sig.ACK.push({ from: ackUp, to: ackDown, v: 1 });
      sig.ADDR.push({ from: up, to: rdDown, label: `A${i}` });
      sig.DATA.push({ from: ackUp, to: mode === 'full' ? ackDown : Math.min(ackDown, rdDown + d), label: `D${i}` });
      events.push({ t: up, kind: 'ready', i });
      events.push({ t: ackUp, kind: 'ack', i });
      events.push({ t: rdDown, kind: 'readyDown', i });
      events.push({ t: ackDown, kind: 'ackDown', i });
      t0 = mode === 'full' ? ackDown + d : rdDown;
    }
    total = mode === 'full' ? t0 : Math.max(t0, sig.ACK.at(-1).to); // 全互锁：最后一个字到主设备看到 Ack↓ 为止
    sig.RD.push({ from: 0, to: total, v: 1 });
    events.sort((x, y) => x.t - y.t || ['ready', 'ack', 'readyDown', 'ackDown'].indexOf(x.kind) - ['ready', 'ack', 'readyDown', 'ackDown'].indexOf(y.kind));
    events.push({ t: total, kind: 'end' });
  }
  // 半互锁的风险：Ack 保持时间太短，主设备还没看到就撤了
  const missed = mode === 'half' && h < d;
  const perWord = mode === 'sync' ? null : mode === 'full' ? a + 4 * d : a + 2 * d;
  const bw = (n * WIDTH) / total; // 字节 / ns = GB/s
  return { ok: true, mode, n, T, w, d, a, h, events, sig, total, perWord, bwMB: bw * 1000, missed };
}
