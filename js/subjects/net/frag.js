// IPv4 分片的纯计算。
//
// 约定（界面上写明）：
//   · total 是整个 IP 数据报的总长度（首部 + 数据），hdr 是首部长度，每个分片都带一个同样长的首部；
//   · 每片能放的数据 = ⌊(MTU − 首部) ÷ 8⌋ × 8（片偏移以 8 字节为单位，除最后一片外数据长度必须是 8 的倍数）；
//   · 片偏移字段 = 这一片数据在原数据中的字节位置 ÷ 8；MF = 1 表示后面还有分片，最后一片 MF = 0；
//   · DF = 1 且数据报比 MTU 长：不能分片，路由器丢弃并发回 ICMP「需要分片但设置了 DF」；
//   · mtu2：分片经过的下一段链路的 MTU（0 表示没有）。已经是分片的数据报还可以再分，
//     偏移仍按原始数据计算；只有原来最后一片的最后一小片 MF = 0。

export function fragment(L, hdr, mtu, base = 0, lastMF = 0) {
  const data = L - hdr;
  const per = Math.floor((mtu - hdr) / 8) * 8;
  if (L <= mtu) return [{ off: base, len: data, MF: lastMF }];
  const out = [];
  for (let o = 0; o < data; o += per) {
    const len = Math.min(per, data - o);
    out.push({ off: base + o, len, MF: o + len < data ? 1 : lastMF });
  }
  return out;
}

export const MAX_PIECES = 64;

export function frag({ total, hdr = 20, mtu, df = false, mtu2 = 0 }) {
  const errors = [];
  if (!(Number.isInteger(hdr) && hdr >= 20 && hdr <= 60 && hdr % 4 === 0)) errors.push('hdr');
  if (!(Number.isInteger(total) && total > hdr && total <= 65535)) errors.push('total');
  if (!(Number.isInteger(mtu) && mtu >= hdr + 8)) errors.push('mtu');
  if (!(mtu2 === 0 || (Number.isInteger(mtu2) && mtu2 >= hdr + 8))) errors.push('mtu2');
  if (errors.length) return { ok: false, errors };
  const data = total - hdr;
  const per = Math.floor((mtu - hdr) / 8) * 8;
  const out = { ok: true, total, hdr, mtu, df, mtu2, data, per };
  if (total <= mtu) return { ...out, need: false, frags: [{ off: 0, len: data, MF: 0 }], second: [] };
  if (df) return { ...out, need: true, dropped: true, frags: [], second: [] };
  const frags = fragment(total, hdr, mtu).map((f) => ({ ...f, total: f.len + hdr, field: f.off / 8 }));
  const second = mtu2
    ? frags.map((f) => {
        const per2 = Math.floor((mtu2 - hdr) / 8) * 8;
        const pieces = fragment(f.total, hdr, mtu2, f.off, f.MF).map((p) => ({ ...p, total: p.len + hdr, field: p.off / 8 }));
        return { from: f, per2, split: f.total > mtu2, pieces };
      })
    : [];
  // 片数太多（比如 MTU 只有 28、要分几千片）画不出来，也没有讲解的意义，让用户把 MTU 调大或把总长度调小
  const pieces = second.length ? second.reduce((a, s) => a + s.pieces.length, 0) : frags.length;
  if (pieces > MAX_PIECES) return { ok: false, errors: [['many', { n: pieces, max: MAX_PIECES }]] };
  return { ...out, need: true, dropped: false, frags, second };
}
