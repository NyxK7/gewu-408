// CSMA/CD 的纯计算：争用期与最短帧长、两站碰撞的时间—位置关系、二进制指数退避。
//
// 约定（界面上写明）：
//   · 总线长 L，信号传播速率 v，端到端单程传播时延 τ = L / v；争用期 2τ；最短帧长 = 2τ × 数据率 R；
//   · A 在总线一端（位置 0），B 在距 A 为 d 的位置；A 在 t = 0 开始发送，B 在 tB 时刻想发送；
//   · A 的信号 d / v 时刻到达 B。tB 早于它，B 监听到信道空闲就发送，于是碰撞；否则 B 监听到信道忙，
//     按 1-坚持推迟到 A 的帧尾经过 B 之后再发；
//   · 碰撞：两路信号在 t = (d / v + tB) / 2、离 A 为 v·t 处相遇；B 在 d / v 检测到，A 在 tB + d / v 检测到；
//     A 的帧如果在检测到之前就已经发完（帧长 / R ≤ tB + d / v），A 不再监听，这次碰撞它就发现不了；
//   · 退避（简化成以争用期为单位的时隙）：第 k 次碰撞后各自从 0 ～ 2^min(k, 10) − 1 里取一个整数 r，
//     等待 r 个争用期。两站取的 r 相同就再次碰撞，不同就 r 小的先重传成功；碰撞到第 16 次放弃。
//     随机数由使用者给出，所以结果可以复现。

const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function csma({ L, v = 2e8, R, d, tB, frame, rA = [], rB = [] }) {
  const errors = [];
  if (!(L > 0)) errors.push('L');
  if (!(v > 0)) errors.push('v');
  if (!(R > 0)) errors.push('R');
  if (!(d > 0 && d <= L)) errors.push('d');
  if (!(tB >= 0)) errors.push('tB');
  if (!(Number.isInteger(frame) && frame > 0)) errors.push('frame');
  if (errors.length) return { ok: false, errors };

  const tau = L / v;
  const minBits = 2 * tau * R;
  const dt = d / v; // A 的信号到达 B
  const sendA = (frame * 8) / R;
  const base = {
    ok: true,
    L,
    v,
    R,
    d,
    tB,
    frame,
    tau,
    slot: 2 * tau,
    minBits: r6(minBits),
    minBytes: Math.ceil(minBits / 8 - 1e-9),
    dt,
    sendA,
  };
  if (tB >= dt) {
    // B 听到信道忙：1-坚持，等 A 的帧尾经过 B（sendA + dt）后立即发送
    return { ...base, collide: false, bStart: Math.max(tB, sendA + dt) };
  }
  const tm = (dt + tB) / 2;
  const bDetect = dt;
  const aDetect = tB + dt;
  const hidden = sendA <= aDetect; // A 在检测到碰撞之前就发完了
  const out = {
    ...base,
    collide: true,
    tm,
    xm: v * tm,
    bDetect,
    aDetect,
    hidden,
    aBits: r6(Math.min(aDetect, sendA) * R),
    bBits: r6((bDetect - tB) * R),
    rounds: [],
  };
  if (hidden) return out;

  // 二进制指数退避
  for (let k = 1; ; k++) {
    if (k > 16) {
      out.rounds.push({ k, giveUp: true });
      break;
    }
    const max = 2 ** Math.min(k, 10) - 1;
    const a = rA[k - 1];
    const b = rB[k - 1];
    if (a == null || b == null) {
      out.rounds.push({ k, max, missing: true });
      break;
    }
    if (!(Number.isInteger(a) && a >= 0 && a <= max) || !(Number.isInteger(b) && b >= 0 && b <= max)) {
      return { ok: false, errors: [['rRange', { k, max }]] };
    }
    if (a === b) {
      out.rounds.push({ k, max, a, b, again: true });
      continue;
    }
    out.rounds.push({ k, max, a, b, winner: a < b ? 'A' : 'B', wait: Math.min(a, b) * 2 * tau });
    break;
  }
  return out;
}
