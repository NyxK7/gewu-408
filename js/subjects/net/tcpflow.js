// TCP 序号、确认号与流量控制的纯计算（A 向 B 发 total 字节）。按「轮」推进：
//   · 每轮开始，A 按 B 最近通告的接收窗口 rwnd，把能发的数据切成不超过 MSS 的报文段一起发出；
//     报文段的序号是它第一个字节的编号（第一个数据字节编号为 seq0）；
//   · B 收下放进接收缓存，然后应用进程从缓存里读走 reads[r] 字节（列表用完以后每轮把缓存读空）；
//   · B 回一个确认：确认号 = 期望收到的下一个字节的编号，窗口 = 缓存剩余空间；
//   · 窗口为 0 时 A 不再发数据，启动持续计时器，下一轮发 1 字节的零窗口探测报文；B 缓存满就丢掉这个字节，照样回确认告诉当前窗口。
// 不考虑丢包、超时重传和拥塞窗口（拥塞控制另有一节课）。

const err = (errors) => ({ ok: false, errors });

export function tcpFlow({ seq0 = 1, mss = 200, total = 1200, buf = 600, reads = [0, 200, 0, 0, 400] }) {
  const errors = [];
  if (!Number.isInteger(seq0) || seq0 < 0 || seq0 > 1e9) errors.push('seq0');
  if (!Number.isInteger(mss) || mss < 10 || mss > 2000) errors.push('mss');
  if (!Number.isInteger(total) || total < 1 || total > 6000) errors.push('total');
  if (!Number.isInteger(buf) || buf < mss || buf > 6000) errors.push('buf');
  if (!Array.isArray(reads) || reads.length > 12 || reads.some((x) => !Number.isInteger(x) || x < 0)) errors.push('reads');
  if (errors.length) return err(errors);
  let next = seq0; // A 下一个要发的字节
  let acked = seq0; // A 收到的确认号
  let rwnd = buf; // A 知道的窗口（开始时按建立连接时通告的整个缓存）
  let buffered = 0; // B 缓存里还没被读走的字节
  let delivered = 0; // B 的应用已经读走的
  let expect = seq0; // B 期望的下一个字节
  const end = seq0 + total;
  const rounds = [];
  for (let r = 0; acked < end && r < 30; r++) {
    const segs = [];
    let probe = null;
    if (rwnd > 0) {
      let can = Math.min(rwnd, end - next);
      while (can > 0) {
        const len = Math.min(mss, can);
        segs.push({ seq: next, len });
        next += len;
        can -= len;
      }
    } else {
      probe = { seq: next, len: 1 };
    }
    // B 收
    for (const s of segs) {
      buffered += s.len;
      expect = s.seq + s.len;
    }
    const probeAccepted = false; // 缓存满，探测字节被丢弃（这里只有窗口为 0 才探测，缓存一定是满的）
    const before = buffered;
    const want = r < reads.length ? reads[r] : Infinity;
    const read = Math.min(want, buffered);
    buffered -= read;
    delivered += read;
    const ack = { ack: expect, rwnd: buf - buffered };
    acked = expect;
    rwnd = ack.rwnd;
    rounds.push({ r, segs, probe, probeAccepted, filled: before, read, buffered, delivered, ack, sent: next, zero: ack.rwnd === 0 });
  }
  const zeroRounds = rounds.filter((x) => x.zero).length;
  const probes = rounds.filter((x) => x.probe).length;
  return { ok: true, seq0, mss, total, buf, reads, rounds, end, zeroRounds, probes, segCount: rounds.reduce((s, x) => s + x.segs.length, 0), done: acked >= end };
}
