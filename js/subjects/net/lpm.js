// 路由器转发的纯计算：最长前缀匹配。
//
// 约定（界面上写明）：
//   · 转发表每行写成「网络前缀/前缀长度 下一跳」，下一跳可以是「接口 0」「R2」之类的任意文字；
//     默认路由写成 0.0.0.0/0；
//   · 目的地址和某一行的前缀长度个高位完全相同，就算匹配；匹配的行里选前缀最长的那一行转发；
//   · 一行也匹配不上（又没有默认路由）就丢弃，并向源主机发 ICMP 终点不可达；
//   · 网络前缀的主机位必须是 0（否则视为写错）。

export const ipToInt = (s) => {
  const m = String(s).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
};
export const intToIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
export const maskOf = (len) => (len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0);
export const bits32 = (n) => n.toString(2).padStart(32, '0');

export function parseTable(text) {
  const rows = [];
  for (const line of String(text ?? '').split(/[\n;；]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = line.match(/^(\S+)\/(\d{1,2})\s+(.+)$/);
    if (!m) return { error: ['row', { r: line }] };
    const net = ipToInt(m[1]);
    const len = Number(m[2]);
    if (net == null || len > 32) return { error: ['row', { r: line }] };
    if (((net & ~maskOf(len)) >>> 0) !== 0) return { error: ['hostBits', { r: line }] };
    rows.push({ net, len, hop: m[3].trim(), text: `${m[1]}/${len}` });
  }
  return { rows };
}

export function lpm({ table, dests }) {
  const t = parseTable(table);
  if (t.error) return { ok: false, errors: [t.error] };
  if (!t.rows.length || t.rows.length > 10) return { ok: false, errors: ['count'] };
  const ds = String(dests ?? '').split(/[\s,，;；]+/).filter(Boolean);
  if (!ds.length || ds.length > 6) return { ok: false, errors: ['dests'] };
  const out = [];
  for (const d of ds) {
    const ip = ipToInt(d);
    if (ip == null) return { ok: false, errors: [['dest', { d }]] };
    const checks = t.rows.map((r, i) => {
      const hit = ((ip & maskOf(r.len)) >>> 0) === r.net;
      // 从高位起相同的位数（用来画比对）
      const x = (ip ^ r.net) >>> 0;
      const same = x === 0 ? 32 : Math.clz32(x);
      return { i, hit, same: Math.min(same, r.len) };
    });
    const hits = checks.filter((c) => c.hit);
    const best = hits.length ? hits.reduce((a, b) => (t.rows[b.i].len > t.rows[a.i].len ? b : a)) : null;
    out.push({ ip, text: intToIp(ip), checks, hits: hits.map((h) => h.i), best: best ? best.i : null, hop: best ? t.rows[best.i].hop : null });
  }
  return { ok: true, rows: t.rows, dests: out };
}
