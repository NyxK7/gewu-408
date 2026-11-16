// ARP 的纯计算：主机 A 要给某个 IP 发数据报，先判断目的地址在不在本网络，决定要解析谁的 MAC 地址；
// 再查 ARP 高速缓存，查不到就广播请求、等单播响应。按顺序处理几次发送，缓存会被前面的解析填上。
//
// 约定（界面上写明）：
//   · 本网络里的主机和路由器接口由使用者列出（IP + MAC）；
//   · 目的 IP 与本机 IP 和子网掩码按位与的结果相同 → 在本网络，直接解析目的 IP；否则解析默认网关的 IP；
//   · ARP 请求以广播帧发出（目的 MAC 全 1），被请求的那台回复单播响应；
//     收到请求的主机顺便把请求方的 IP→MAC 记进自己的缓存（这里只记录 A 自己的缓存）；
//   · 缓存条目不过期（演示一次会话）。

import { intToIp, ipToInt, maskOf } from './lpm.js';

export function arp({ me, prefix, gateway, hosts, cache = [], sends }) {
  const errors = [];
  const myIp = ipToInt(me?.ip);
  if (myIp == null) errors.push('me');
  if (!(Number.isInteger(prefix) && prefix >= 8 && prefix <= 30)) errors.push('prefix');
  const gw = ipToInt(gateway);
  if (gw == null) errors.push('gateway');
  if (errors.length) return { ok: false, errors };
  const mask = maskOf(prefix);
  const same = (ip) => ((ip & mask) >>> 0) === ((myIp & mask) >>> 0);
  if (!same(gw)) return { ok: false, errors: ['gwNet'] };
  const table = new Map(hosts.map((h) => [ipToInt(h.ip), h]));
  if (hosts.some((h) => ipToInt(h.ip) == null)) return { ok: false, errors: ['hosts'] };
  const known = new Map(cache.map((c) => [ipToInt(c.ip), c.mac]));
  const steps = [];
  for (const s of sends) {
    const dst = ipToInt(s);
    if (dst == null) return { ok: false, errors: [['send', { s }]] };
    const local = same(dst);
    const target = local ? dst : gw;
    const hit = known.has(target);
    const owner = table.get(target);
    let mac = hit ? known.get(target) : owner?.mac ?? null;
    if (!hit && mac) known.set(target, mac);
    steps.push({ dst: intToIp(dst), local, target: intToIp(target), hit, found: !!mac, mac, owner: owner?.name ?? null, cache: [...known].map(([ip, m]) => ({ ip: intToIp(ip), mac: m })) });
  }
  return { ok: true, me, prefix, mask: intToIp(mask), net: intToIp((myIp & mask) >>> 0), gateway: intToIp(gw), hosts, steps, initCache: cache };
}
