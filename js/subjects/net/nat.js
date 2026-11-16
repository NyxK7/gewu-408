// NAPT（网络地址与端口转换）的纯计算：内网主机的分组出去时改写源地址和源端口，回来时按转换表改回。
//
// 约定（界面上写明）：
//   · 路由器只有一个公网地址 pub，给每个新的（内网 IP, 内网端口）分配一个新的外部端口，从 base 开始依次加 1；
//   · 同一个（内网 IP, 内网端口）再次出去时沿用原来的外部端口；
//   · 从外网回来的分组：目的地址是 pub，按目的端口查表改回内网地址和端口；查不到就丢弃；
//   · 事件写法：「out 192.168.0.2:3345 → 1.2.3.4:80」或「in 1.2.3.4:80 → :5001」（只给目的端口即可）。

import { ipToInt } from './lpm.js';

const ADDR = /^(\d+\.\d+\.\d+\.\d+):(\d{1,5})$/;

export function parseEvents(text) {
  const out = [];
  for (const line of String(text ?? '').split(/[\n;；]+/).map((x) => x.trim()).filter(Boolean)) {
    const m = line.match(/^(out|in)\s+(\S+)\s*(?:->|→)\s*(\S+)$/i);
    if (!m) return { error: line };
    const dir = m[1].toLowerCase();
    if (dir === 'out') {
      const a = m[2].match(ADDR);
      const b = m[3].match(ADDR);
      if (!a || !b || ipToInt(a[1]) == null || ipToInt(b[1]) == null) return { error: line };
      out.push({ dir, sip: a[1], sport: +a[2], dip: b[1], dport: +b[2] });
    } else {
      const a = m[2].match(ADDR);
      const b = m[3].match(/^:?(\d{1,5})$/);
      if (!a || !b || ipToInt(a[1]) == null) return { error: line };
      out.push({ dir, sip: a[1], sport: +a[2], dport: +b[1] });
    }
  }
  return { events: out };
}

export function nat({ pub, base, events }) {
  if (ipToInt(pub) == null) return { ok: false, errors: ['pub'] };
  if (!(Number.isInteger(base) && base >= 1024 && base <= 65000)) return { ok: false, errors: ['base'] };
  const p = parseEvents(events);
  if (p.error) return { ok: false, errors: [['event', { e: p.error }]] };
  if (!p.events.length || p.events.length > 8) return { ok: false, errors: ['count'] };
  const table = [];
  let next = base;
  const steps = p.events.map((e) => {
    if (e.dir === 'out') {
      let row = table.find((r) => r.ip === e.sip && r.port === e.sport);
      const fresh = !row;
      if (!row) {
        row = { ip: e.sip, port: e.sport, ext: next++ };
        table.push(row);
      }
      return { ...e, fresh, before: { sip: e.sip, sport: e.sport, dip: e.dip, dport: e.dport }, after: { sip: pub, sport: row.ext, dip: e.dip, dport: e.dport }, table: table.map((r) => ({ ...r })), row: { ...row } };
    }
    const row = table.find((r) => r.ext === e.dport);
    return { ...e, before: { sip: e.sip, sport: e.sport, dip: pub, dport: e.dport }, after: row ? { sip: e.sip, sport: e.sport, dip: row.ip, dport: row.port } : null, dropped: !row, table: table.map((r) => ({ ...r })), row: row ? { ...row } : null };
  });
  return { ok: true, pub, base, steps };
}
