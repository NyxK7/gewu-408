// 滑动窗口协议（后退 N 帧 GBN / 选择重传 SR）的离散时间模拟。
// 模型（界面上写明）：
//   · 时间按单位走，发送方每个时间单位最多发出一帧；帧和确认的单程传播时延都是 D；
//   · 每个时间单位里发送方依次：处理到达的确认 → 检查超时 → 发一帧（重传优先，然后是新帧）；
//   · GBN：接收方只收按序到达的帧，对按序收到的最后一帧发累积确认 ACK n（表示 n 及以前都收到）；
//     乱序帧丢弃并重发上一个确认；发送方只为最早未确认的帧计时，超时就重传窗口里所有已发未确认的帧；
//   · SR：接收方在接收窗口内缓存乱序帧，逐帧确认 ACK n；发送方每帧单独计时，超时只重传那一帧；
//   · 丢失的设定针对「第一次发送」：lostF 里的帧第一次发出时丢失，lostA 里的帧第一次被确认时那个确认丢失；
//   · 帧编号用 0、1、2… 连续计数，显示时再取模 2^bits 得到序号。

export function simulate({ proto = 'GBN', bits = 3, W = 4, N = 8, D = 2, T = 6, lostF = [], lostA = [] }) {
  const errors = [];
  if (!['GBN', 'SR'].includes(proto)) errors.push('proto');
  if (!(bits >= 1 && bits <= 6)) errors.push('bits');
  if (!(W >= 1 && W <= 16)) errors.push('W');
  if (!(N >= 1 && N <= 16)) errors.push('N');
  if (!(D >= 1 && D <= 6)) errors.push('D');
  if (!(T >= 1 && T <= 40)) errors.push('T');
  if ([...lostF, ...lostA].some((k) => k < 0 || k >= N)) errors.push('lostRange');
  if (errors.length) return { ok: false, errors };

  const limit = proto === 'GBN' ? 2 ** bits - 1 : 2 ** (bits - 1);
  const warn = W > limit;

  const frames = []; // 每次发送一帧：{ k, t, arrive, lost, retx }
  const acks = []; // { n, t, arrive, lost, dup, for }
  const log = []; // 每个时间单位发生了什么
  const lostFLeft = new Set(lostF);
  const lostALeft = new Set(lostA);
  let base = 0;
  let next = 0;
  const acked = Array(N).fill(false);
  const lastSend = Array(N).fill(null);
  let timer = null; // GBN 的唯一计时器起点
  const queue = []; // 待重传
  // 接收方
  let expected = 0; // GBN：期望的下一帧；SR：接收窗口左沿
  const buffered = new Set();
  const delivered = [];
  const inbox = new Map(); // t → [{ k }]，到达接收方的帧
  const ackbox = new Map(); // t → [{ n }]，到达发送方的确认
  const push = (m, t, x) => (m.has(t) ? m.get(t).push(x) : m.set(t, [x]));

  for (let t = 0; t <= 200; t++) {
    const ev = { t, rx: [], acksIn: [], timeout: null, sent: null, base0: base };
    // 接收方：处理这一时刻到达的帧
    for (const f of inbox.get(t) ?? []) {
      const k = f.k;
      let ackN = null;
      let action;
      if (proto === 'GBN') {
        if (k === expected) {
          delivered.push(k);
          expected++;
          ackN = k;
          action = 'accept';
        } else {
          action = k < expected ? 'dup' : 'discard';
          ackN = expected > 0 ? expected - 1 : null;
        }
      } else if (k >= expected && k < expected + W) {
        buffered.add(k);
        ackN = k;
        action = k === expected ? 'accept' : 'buffer';
        while (buffered.has(expected)) {
          buffered.delete(expected);
          delivered.push(expected);
          expected++;
        }
      } else if (k < expected) {
        ackN = k;
        action = 'dup';
      } else action = 'discard';
      let lost = false;
      if (ackN !== null) {
        // 「第一次确认帧 k」的那个确认丢失
        const first = !acks.some((a) => a.n === ackN);
        if (first && lostALeft.has(ackN)) {
          lost = true;
          lostALeft.delete(ackN);
        }
        const a = { n: ackN, t, arrive: t + D, lost, dup: !first, for: k };
        acks.push(a);
        if (!lost) push(ackbox, t + D, a);
      }
      ev.rx.push({ k, action, ackN, ackLost: lost, expected, delivered: [...delivered], buffered: [...buffered].sort((a, b) => a - b) });
    }
    // 发送方：先处理确认
    for (const a of ackbox.get(t) ?? []) {
      const old = base;
      if (proto === 'GBN') {
        if (a.n + 1 > base) {
          for (let i = base; i <= a.n; i++) acked[i] = true;
          base = a.n + 1;
        }
        if (base !== old) timer = base < next ? t : null;
      } else {
        acked[a.n] = true;
        while (base < N && acked[base]) base++;
      }
      ev.acksIn.push({ n: a.n, moved: base - old, base });
    }
    if (base >= N) {
      ev.base = base;
      log.push(ev);
      break;
    }
    // 超时
    if (proto === 'GBN') {
      if (timer !== null && t >= timer + T && !queue.length) {
        ev.timeout = Array.from({ length: next - base }, (_, i) => base + i);
        queue.push(...ev.timeout);
        timer = t;
      }
    } else {
      const due = [];
      for (let k = base; k < next; k++) if (!acked[k] && lastSend[k] !== null && t >= lastSend[k] + T && !queue.includes(k)) due.push(k);
      if (due.length) {
        ev.timeout = due;
        queue.push(...due);
      }
    }
    // 发一帧
    let k = null;
    let retx = false;
    while (queue.length && acked[queue[0]]) queue.shift();
    if (queue.length) {
      k = queue.shift();
      retx = true;
    } else if (next < N && next < base + W) {
      k = next++;
    }
    if (k !== null) {
      const lost = !retx && lostFLeft.has(k);
      if (lost) lostFLeft.delete(k);
      const f = { k, t, arrive: t + D, lost, retx };
      frames.push(f);
      lastSend[k] = t;
      if (proto === 'GBN' && timer === null) timer = t;
      if (!lost) push(inbox, t + D, f);
      ev.sent = f;
    }
    ev.base = base;
    ev.next = next;
    ev.acked = [...acked];
    ev.queue = [...queue];
    if (ev.rx.length || ev.acksIn.length || ev.timeout || ev.sent) log.push(ev);
  }
  const done = base >= N;
  return { ok: true, proto, bits, W, N, D, T, limit, warn, frames, acks, log, done, finish: log.at(-1)?.t ?? 0, retx: frames.filter((f) => f.retx).length, delivered };
}
