// TCP 拥塞控制的纯计算：按「传输轮次」（一个 RTT 一轮）推算拥塞窗口 cwnd 和门限 ssthresh。
// 约定（与教材和 408 常见题目一致，界面上写明）：
//   · cwnd、ssthresh 以报文段（MSS）为单位；
//   · 慢开始：cwnd < ssthresh 时每轮翻倍；若翻倍会超过 ssthresh，则只增到 ssthresh；
//   · 拥塞避免：cwnd ≥ ssthresh 时每轮加 1；
//   · 第 r 轮发生超时：ssthresh = max(⌊cwnd/2⌋, 2)，下一轮 cwnd = 1，重新慢开始；
//   · 第 r 轮收到 3 个重复确认（Reno：快重传 + 快恢复）：ssthresh = max(⌊cwnd/2⌋, 2)，下一轮 cwnd = ssthresh，进入拥塞避免；
//     Tahoe 没有快恢复，下一轮 cwnd = 1；
//   · 发送窗口 = min(cwnd, rwnd)。

export function simulate({ cwnd0 = 1, ssthresh0 = 16, rounds = 25, timeouts = [], dup3 = [], rwnd = 0, variant = 'reno' }) {
  const errors = [];
  if (!(cwnd0 >= 1 && cwnd0 <= 8)) errors.push('cwnd0');
  if (!(ssthresh0 >= 2 && ssthresh0 <= 128)) errors.push('ssthresh0');
  if (!(rounds >= 2 && rounds <= 40)) errors.push('rounds');
  if ([...timeouts, ...dup3].some((r) => r < 1 || r > rounds)) errors.push('eventRange');
  if (timeouts.some((r) => dup3.includes(r))) errors.push('eventBoth');
  if (errors.length) return { ok: false, errors };

  let cwnd = cwnd0;
  let ssthresh = ssthresh0;
  const rows = [];
  for (let r = 1; r <= rounds; r++) {
    const phase = cwnd < ssthresh ? 'ss' : 'ca';
    const event = timeouts.includes(r) ? 'timeout' : dup3.includes(r) ? 'dup3' : null;
    const win = rwnd > 0 ? Math.min(cwnd, rwnd) : cwnd;
    let next;
    let nextSs = ssthresh;
    let how;
    if (event) {
      nextSs = Math.max(Math.floor(cwnd / 2), 2);
      next = event === 'timeout' || variant === 'tahoe' ? 1 : nextSs;
      how = event;
    } else if (phase === 'ss') {
      next = Math.min(cwnd * 2, ssthresh);
      how = cwnd * 2 > ssthresh ? 'cap' : 'double';
    } else {
      next = cwnd + 1;
      how = 'plus1';
    }
    rows.push({ r, cwnd, ssthresh, phase, event, win, next, nextSs, how });
    cwnd = next;
    ssthresh = nextSs;
  }
  return { ok: true, rows, variant, rwnd, final: { cwnd, ssthresh } };
}
