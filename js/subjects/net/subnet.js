// 子网划分的纯计算：IPv4 地址 + 前缀 → 掩码、网络地址、广播地址、可用主机范围；
// 可选：把这个网络按主机数需求做变长子网划分（VLSM）。全部用 32 位无符号整数运算。
// 约定：可分配的主机地址数 = 2^主机位数 − 2（全 0 是网络地址、全 1 是广播地址）；
//       VLSM 按需求从大到小依次分配，每个子网大小取能容纳「主机数 + 2」的最小 2 的幂。

export const toInt = (s) => {
  const m = String(s).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return NaN;
  const o = m.slice(1).map(Number);
  if (o.some((x) => x > 255)) return NaN;
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
};
export const toIp = (v) => [24, 16, 8, 0].map((s) => (v >>> s) & 255).join('.');
export const toBin = (v) => (v >>> 0).toString(2).padStart(32, '0');
export const maskOf = (p) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);

export function hostCount(p) {
  const h = 32 - p;
  return h >= 2 ? 2 ** h - 2 : 0;
}

export function klass(ip) {
  const a = ip >>> 24;
  if (a < 128) return 'A';
  if (a < 192) return 'B';
  if (a < 224) return 'C';
  if (a < 240) return 'D';
  return 'E';
}

export function isPrivate(ip) {
  return (ip >>> 24 === 10) || (ip >>> 20 === ((172 << 4) | 1)) || (ip >>> 16 === ((192 << 8) | 168));
}

export function simulate({ ip, prefix, needs = [] }) {
  const errors = [];
  const v = typeof ip === 'number' ? ip : toInt(ip);
  if (Number.isNaN(v)) errors.push('ip');
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) errors.push('prefix');
  if (needs.length > 8 || needs.some((n) => !Number.isInteger(n) || n < 1)) errors.push('needs');
  if (errors.length) return { ok: false, errors };

  const mask = maskOf(prefix);
  const net = (v & mask) >>> 0;
  const bcast = (net | (~mask >>> 0)) >>> 0;
  const h = 32 - prefix;
  const res = {
    ok: true,
    ip: v,
    prefix,
    mask,
    net,
    bcast,
    hostBits: h,
    hosts: hostCount(prefix),
    first: h >= 2 ? net + 1 : null,
    last: h >= 2 ? bcast - 1 : null,
    klass: klass(v),
    private: isPrivate(v),
    subnets: [],
  };
  if (!needs.length) return res;

  // VLSM：按主机数从大到小（相同时按原来的顺序）依次分配
  const order = needs.map((n, i) => ({ i, need: n })).sort((a, b) => b.need - a.need || a.i - b.i);
  let cur = net;
  const end = bcast + 1;
  for (const o of order) {
    let bits = 2;
    while (2 ** bits < o.need + 2) bits++;
    const size = 2 ** bits;
    const p = 32 - bits;
    if (p < prefix || cur + size > end) {
      res.ok = false;
      res.errors = ['noRoom'];
      res.subnets = [];
      return res;
    }
    res.subnets.push({ ...o, size, prefix: p, net: cur, bcast: cur + size - 1, first: cur + 1, last: cur + size - 2, hosts: size - 2, mask: maskOf(p) });
    cur += size;
  }
  res.used = cur - net;
  res.free = end - cur;
  return res;
}
