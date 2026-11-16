// UDP 校验和的纯计算：伪首部（源 IP、目的 IP、0、协议号 17、UDP 长度）+ UDP 首部（校验和先填 0）+ 数据（奇数字节补一个 0），
// 按 16 位一个字逐个相加，最高位的进位加回最低位（回卷），最后取反就是校验和。接收方把所有字（含校验和）加起来，全 1 才算没错。

const err = (errors) => ({ ok: false, errors });
export const PROTO = 17;
const hx4 = (v) => v.toString(16).toUpperCase().padStart(4, '0');

export function parseIp(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const b = m.slice(1).map(Number);
  return b.every((x) => x <= 255) ? b : null;
}

/** 逐个 16 位相加（回卷），记下每一步 */
export function onesSum(words) {
  let sum = 0;
  return words.map((w) => {
    const raw = sum + w.v;
    const carry = raw > 0xffff;
    sum = carry ? (raw & 0xffff) + 1 : raw;
    return { ...w, raw, carry, sum };
  });
}

export function udp({ srcIp = '192.168.1.10', dstIp = '202.38.64.3', srcPort = 50123, dstPort = 53, data = 'HELLO', flip = -1 }) {
  const errors = [];
  const s = parseIp(srcIp);
  const d = parseIp(dstIp);
  if (!s) errors.push('srcIp');
  if (!d) errors.push('dstIp');
  for (const [k, v] of [['srcPort', srcPort], ['dstPort', dstPort]]) if (!Number.isInteger(v) || v < 0 || v > 65535) errors.push(k);
  const text = String(data ?? '');
  if (!/^[\x20-\x7e]{1,12}$/.test(text)) errors.push('data');
  if (errors.length) return err(errors);
  const bytes = [...text].map((c) => c.charCodeAt(0));
  const len = 8 + bytes.length;
  const padded = bytes.length % 2 ? [...bytes, 0] : bytes;
  const w16 = (hi, lo) => (hi << 8) | lo;
  const words = [
    { part: 'pseudo', name: 'srcIp1', v: w16(s[0], s[1]) },
    { part: 'pseudo', name: 'srcIp2', v: w16(s[2], s[3]) },
    { part: 'pseudo', name: 'dstIp1', v: w16(d[0], d[1]) },
    { part: 'pseudo', name: 'dstIp2', v: w16(d[2], d[3]) },
    { part: 'pseudo', name: 'proto', v: w16(0, PROTO) },
    { part: 'pseudo', name: 'len', v: len },
    { part: 'hdr', name: 'srcPort', v: srcPort },
    { part: 'hdr', name: 'dstPort', v: dstPort },
    { part: 'hdr', name: 'len', v: len },
    { part: 'hdr', name: 'cks', v: 0 },
  ];
  for (let i = 0; i < padded.length; i += 2) words.push({ part: 'data', name: `d${i / 2}`, v: w16(padded[i], padded[i + 1]), chars: text.slice(i, i + 2), pad: i + 1 >= bytes.length });
  const adds = onesSum(words);
  const sum = adds.at(-1).sum;
  let cks = ~sum & 0xffff;
  if (cks === 0) cks = 0xffff; // 算出 0 时发全 1，因为 0 表示「没算校验和」
  // 接收方：校验和填进去；可选把数据里第 flip 个比特翻转
  const rx = words.map((w) => (w.name === 'cks' ? { ...w, v: cks } : { ...w }));
  let flipped = null;
  if (Number.isInteger(flip) && flip >= 0) {
    const dataWords = rx.filter((w) => w.part === 'data');
    const bit = flip % (dataWords.length * 16);
    const w = dataWords[Math.floor(bit / 16)];
    w.v ^= 1 << (15 - (bit % 16));
    flipped = { word: w.name, bit };
  }
  const radds = onesSum(rx);
  const rsum = radds.at(-1).sum;
  return { ok: true, srcIp: s, dstIp: d, srcPort, dstPort, text, bytes, len, words, adds, sum, cks, rx, radds, rsum, good: rsum === 0xffff, flipped, carries: adds.filter((a) => a.carry).length, hx4 };
}
export { hx4 };
