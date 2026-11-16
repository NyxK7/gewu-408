// 逐层封装的纯计算：主机 A 的一份应用数据，往下逐层加首部变成比特，经过一台路由器（只拆到网络层，换一个链路层首部），
// 到主机 B 再逐层拆开。记下每一步的 PDU 由哪几段组成、各多少字节。
//
// 约定（界面上写明）：
//   · TCP 首部 20B、UDP 首部 8B、IPv4 首部 20B（都不带选项）；
//   · 以太网帧：首部 14B（目的 MAC 6 + 源 MAC 6 + 类型 2）+ FCS 4B，数据部分不足 46B 要填充；前导码和帧开始定界符共 8B 由物理层加；
//   · PPP 帧：标志 1 + 地址 1 + 控制 1 + 协议 2 + FCS 2 + 标志 1，共 8B；
//   · 应用数据不超过一个报文段能装下的长度，不分段、不分片。

const err = (e) => ({ ok: false, errors: [e] });
export const HDR = { tcp: 20, udp: 8, ip: 20, eth: 14, fcs: 4, pre: 8, ppp: 5, pppt: 3 };
export const APPS = {
  http: { trans: 'tcp', port: 80, max: 1460 },
  dns: { trans: 'udp', port: 53, max: 1472 },
};
export const ADDR = {
  A: { ip: '10.0.1.5', mac: 'AA-01' },
  R1: { ip: '10.0.1.1', mac: 'R1-0A' },
  R2: { ip: '10.0.2.1', mac: 'R2-0B' },
  B: { ip: '10.0.2.9', mac: 'BB-02' },
};
const LAYERS = ['app', 'trans', 'net', 'link', 'phy'];

export function encap({ app = 'http', n = 300, link2 = 'eth' }) {
  if (!APPS[app]) return err('app');
  if (!['eth', 'ppp'].includes(link2)) return err('link2');
  const A = APPS[app];
  if (!Number.isInteger(n) || n < 1 || n > A.max) return err('n');
  const trans = A.trans;
  const ipLen = HDR.ip + HDR[trans] + n;
  const pad = Math.max(0, 46 - ipLen);
  const ethFrame = HDR.eth + ipLen + pad + HDR.fcs;
  const pppFrame = HDR.ppp + ipLen + HDR.pppt;
  const segs = {
    app: [{ k: 'data', size: n }],
    trans: [{ k: trans, size: HDR[trans] }, { k: 'data', size: n }],
    net: [{ k: 'ip', size: HDR.ip }, { k: trans, size: HDR[trans] }, { k: 'data', size: n }],
  };
  const frame = (kind) =>
    kind === 'eth'
      ? [{ k: 'eth', size: HDR.eth }, ...segs.net, ...(pad ? [{ k: 'pad', size: pad }] : []), { k: 'fcs', size: HDR.fcs }]
      : [{ k: 'ppp', size: HDR.ppp }, ...segs.net, { k: 'pppt', size: HDR.pppt }];
  const bits = (kind) => (kind === 'eth' ? [{ k: 'pre', size: HDR.pre }, ...frame('eth')] : frame('ppp'));
  const pduOf = (layer, kind) => (layer === 'link' ? frame(kind) : layer === 'phy' ? bits(kind) : segs[layer]);
  const steps = [];
  const push = (at, layer, dir, kind, extra = {}) => {
    const pdu = pduOf(layer, kind);
    steps.push({ at, layer, li: LAYERS.indexOf(layer), dir, link: kind, pdu, total: pdu.reduce((s, p) => s + p.size, 0), ttl: at === 'A' || (at === 'R' && dir === 'up') ? 64 : 63, ...extra });
  };
  // 主机 A 往下
  push('A', 'app', 'down', 'eth', { add: 'data' });
  push('A', 'trans', 'down', 'eth', { add: trans });
  push('A', 'net', 'down', 'eth', { add: 'ip' });
  push('A', 'link', 'down', 'eth', { add: 'eth', pad });
  push('A', 'phy', 'down', 'eth', { add: 'pre' });
  // 路由器：往上拆到网络层，再往下
  push('R', 'phy', 'up', 'eth', { strip: 'pre' });
  push('R', 'link', 'up', 'eth', { strip: 'eth' });
  push('R', 'net', 'up', 'eth', { route: true });
  push('R', 'link', 'down', link2, { add: link2 });
  push('R', 'phy', 'down', link2, { add: link2 === 'eth' ? 'pre' : null });
  // 主机 B 往上
  push('B', 'phy', 'up', link2, { strip: link2 === 'eth' ? 'pre' : null });
  push('B', 'link', 'up', link2, { strip: link2 });
  push('B', 'net', 'up', link2, { strip: 'ip' });
  push('B', 'trans', 'up', link2, { strip: trans });
  push('B', 'app', 'up', link2, { strip: 'data' });
  const wire1 = HDR.pre + ethFrame;
  const wire2 = link2 === 'eth' ? HDR.pre + HDR.eth + ipLen + pad + HDR.fcs : pppFrame;
  return { ok: true, app, n, trans, link2, port: A.port, ipLen, pad, ethFrame, pppFrame, wire1, wire2, eff1: n / wire1, eff2: n / wire2, steps };
}
