// 「ARP 地址解析」：一条平面的局域网总线，A 和网上其他主机、路由器接口挂在上面；右边是 A 的 ARP 高速缓存。
// 每次发送分三拍：判断解析谁 → 查缓存 → 广播请求 / 单播响应（或者直接命中）。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { arp } from './arp.js';

const parseHosts = (text) => {
  const out = [];
  for (const line of String(text ?? '').split(/[\n;；]+/).map((x) => x.trim()).filter(Boolean)) {
    const p = line.split(/[\s,，]+/);
    if (p.length !== 3) return null;
    out.push({ name: p[0], ip: p[1], mac: p[2] });
  }
  return out;
};

const HOSTS = 'B 192.168.1.20 00-1B-22-33-44-02\nC 192.168.1.30 00-1B-22-33-44-03\nR 192.168.1.1 00-1B-22-33-44-FE';
const SPEC = {
  presets: [
    { label: T('同网和外网各发一次', 'Local, then remote'), set: { myIp: '192.168.1.10', myMac: '00-1B-22-33-44-01', prefix: 24, gateway: '192.168.1.1', hosts: HOSTS, sends: '192.168.1.20 202.120.2.101 192.168.1.20' } },
    { label: T('掩码变了，判断也变', 'A different mask'), set: { myIp: '192.168.1.10', myMac: '00-1B-22-33-44-01', prefix: 26, gateway: '192.168.1.1', hosts: 'B 192.168.1.20 00-1B-22-33-44-02\nD 192.168.1.100 00-1B-22-33-44-04\nR 192.168.1.1 00-1B-22-33-44-FE', sends: '192.168.1.20 192.168.1.100' } },
  ],
  groups: [
    {
      legend: T('主机 A', 'Host A'),
      fields: [
        { name: 'myIp', label: T('A 的 IP', 'A’s IP'), type: 'text' },
        { name: 'myMac', label: T('A 的 MAC', 'A’s MAC'), type: 'text' },
        { name: 'prefix', label: T('前缀长度（掩码）', 'Prefix length'), type: 'int', min: 8, max: 30 },
        { name: 'gateway', label: T('默认网关', 'Default gateway'), type: 'text' },
      ],
    },
    {
      legend: T('局域网和发送', 'LAN and sends'),
      fields: [
        { name: 'hosts', label: T('网上其他设备：每行「名字 IP MAC」', 'Other devices: "name IP MAC" per line'), type: 'text', wide: true, multiline: true, rows: 4, parse: (s) => (parseHosts(s) ? s : NaN) },
        { name: 'sends', label: T('A 依次要发往的 IP', 'Destinations, in order'), type: 'text', wide: true },
      ],
    },
  ],
  note: T(
    'A 先用掩码判断目的地址在不在本网络：在，就解析目的主机的 MAC；不在，就解析默认网关的 MAC（IP 首部里的目的地址不变）。ARP 请求用广播帧发出，只有被问到的那台用单播帧回答。演示中缓存不过期。',
    'A first uses its mask: a local destination is resolved directly, a remote one by resolving the default gateway (the IP destination stays the same). Requests are broadcast; only the owner replies, by unicast. Cache entries do not expire here.',
  ),
};
const ERR = {
  me: T('A 的 IP 不对', 'A’s IP is invalid'),
  prefix: T('前缀长度在 8～30', 'Prefix 8–30'),
  gateway: T('网关地址不对', 'Invalid gateway'),
  gwNet: T('默认网关必须和 A 在同一个网络里', 'The gateway must be on A’s network'),
  hosts: T('设备列表里有不合法的 IP', 'A device has an invalid IP'),
  send: T('不是合法的 IP：{s}', 'Not an IP: {s}'),
};

// ───── 画板 ─────
const BUS = 300;
const HX = 90;
const GAP = 180;
const CX = 820;

function board(sim, st, z) {
  const items = [];
  const devs = [{ name: 'A', ip: sim.me.ip, mac: sim.me.mac }, ...sim.hosts];
  const X = (i) => HX + i * GAP;
  const s = st.i != null ? sim.steps[st.i] : null;
  items.push({ k: 'bus', x: 0, y: BUS, html: line(HX - 50, 0, X(devs.length - 1) + 110, 0, 'ar-bus') + txt(HX - 50, -10, z ? `局域网 ${sim.net}/${sim.prefix}` : `LAN ${sim.net}/${sim.prefix}`, 'bt-cap', 'start') });
  devs.forEach((d, i) => {
    const isTarget = s && st.phase >= 1 && d.ip === s.target;
    const isGw = d.ip === sim.gateway;
    const cls = isTarget ? 'hot' : i === 0 && s ? 'ok' : '';
    let h = cell(150, 64, '', { tone: i === 0 ? 'blue' : isGw ? 'amber' : 'slate', cls }) + txt(75, 22, isGw ? `${d.name}${z ? '（网关）' : ' (gateway)'}` : d.name, 'bt-lab') + txt(75, 40, d.ip, 'ar-ip') + txt(75, 55, d.mac, 'ar-mac');
    h += line(75, 64, 75, BUS - 196, 'ar-drop');
    items.push({ k: `d${i}`, x: X(i) - 75, y: 196, html: h });
  });
  // 请求和响应
  if (s && st.phase >= 2 && !s.hit) {
    let h = '';
    devs.slice(1).forEach((d, j) => {
      h += arrow(X(0), BUS + 18, X(j + 1), BUS + 18, 'acc dash');
    });
    h += txt(X(0), BUS + 40, z ? `ARP 请求（广播，目的 MAC FF-FF-FF-FF-FF-FF）：谁是 ${s.target}？` : `ARP request (broadcast): who has ${s.target}?`, 'ar-msg', 'start');
    items.push({ k: 'req', x: 0, y: 0, html: h });
    if (s.found) {
      const ti = devs.findIndex((d) => d.ip === s.target);
      items.push({ k: 'rep', x: 0, y: 0, html: arrow(X(ti), BUS + 64, X(0), BUS + 64, 'ok') + txt(X(0), BUS + 86, z ? `ARP 响应（单播）：${s.target} 的 MAC 是 ${s.mac}` : `ARP reply (unicast): ${s.target} is at ${s.mac}`, 'ar-msg ok', 'start') });
    } else items.push({ k: 'rep', x: 0, y: 0, html: txt(X(0), BUS + 86, z ? '没有设备回答：这个 IP 在网上不存在' : 'No reply: nobody has that IP', 'ar-msg bad', 'start') });
  }
  if (s && st.phase >= 2 && s.hit) items.push({ k: 'req', x: 0, y: 0, html: txt(X(0), BUS + 40, z ? `缓存里有 ${s.target} → ${s.mac}，不用发 ARP 请求` : `Cache hit: ${s.target} → ${s.mac}, no request`, 'ar-msg ok', 'start') });
  if (s && st.phase >= 1) items.push({ k: 'dec', x: HX - 50, y: 140, html: txt(0, 0, s.local ? (z ? `${s.dst} 和 A 在同一网络 → 解析 ${s.target}` : `${s.dst} is local → resolve ${s.target}`) : z ? `${s.dst} 不在本网络 → 交给网关，解析 ${s.target}` : `${s.dst} is remote → resolve the gateway ${s.target}`, 'bt-formula cur', 'start') });
  // ARP 缓存
  const cache = s && st.phase >= 2 ? s.cache : st.i != null && st.i > 0 ? sim.steps[st.i - 1].cache : sim.initCache;
  let c = txt(0, -14, z ? 'A 的 ARP 高速缓存' : 'A’s ARP cache', 'bt-lab', 'start') + cell(130, 26, 'IP', { cls: 'head', size: 11 }) + `<g transform="translate(134 0)">${cell(150, 26, 'MAC', { cls: 'head', size: 11 })}</g>`;
  if (!cache.length) c += txt(0, 50, z ? '（空）' : '(empty)', 'bt-dim', 'start');
  cache.forEach((e, i) => {
    const fresh = s && st.phase >= 2 && !s.hit && e.ip === s.target;
    const hitRow = s && st.phase >= 2 && s.hit && e.ip === s.target;
    c += `<g transform="translate(0 ${(i + 1) * 30})">${cell(130, 26, e.ip, { size: 11, cls: fresh ? 'hot' : hitRow ? 'ok' : '' })}<g transform="translate(134 0)">${cell(150, 26, e.mac, { size: 10.5, cls: fresh ? 'hot' : hitRow ? 'ok' : '' })}</g></g>`;
  });
  items.push({ k: 'cache', x: X(devs.length - 1) + 140, y: 120, html: c });
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么需要 ARP', 'Why ARP'),
      blocks: [
        { p: T('网络层用 IP 地址，但数据报最终要装进**帧**里在一段具体的链路上传，帧里写的是 **MAC 地址**（硬件地址，48 位）。所以每次在局域网上发送，都要先知道「下一站」的 MAC 地址。**ARP（地址解析协议）**就是在同一个局域网内，根据 IP 地址查出对应 MAC 地址的协议。', 'IP addresses route, but frames on a link carry **MAC addresses**. **ARP** finds the MAC address for an IP address within one LAN.') },
        { warn: T('ARP 只解决**同一个局域网**上的地址解析。目的主机在别的网络时，要解析的是**默认网关（路由器接口）**的 MAC，而 IP 首部里的目的地址始终是最终的目的主机。', 'ARP only works **within a LAN**. For a remote destination you resolve the **gateway**; the IP destination never changes.') },
      ],
    },
    {
      id: 'how',
      title: T('解析过程', 'How it works'),
      blocks: [
        {
          steps: [
            T('用子网掩码判断目的 IP 是否在本网络，确定要解析的 IP（目的主机或默认网关）；', 'use the mask to decide whose MAC is needed (the host or the gateway);'),
            T('先查本机的 **ARP 高速缓存**，有就直接用；', 'check the **ARP cache** first;'),
            T('没有就发 **ARP 请求**：帧的目的 MAC 是全 1 的广播地址，局域网上所有主机都能收到；', 'otherwise broadcast an **ARP request** (destination MAC all ones);'),
            T('IP 地址与之相符的那台主机发回 **ARP 响应**（单播），写上自己的 MAC；它同时把请求方的 IP→MAC 记进自己的缓存；', 'the owner replies by **unicast** and caches the requester’s mapping;'),
            T('请求方把结果写入缓存，再把数据报封装成帧发出去。缓存条目有生存时间，过期删除。', 'the requester caches the answer and sends the frame. Entries age out.'),
          ],
        },
        { tip: T('ARP 报文直接封装在以太网帧里（类型字段 0x0806），不经过 IP。它的功能属于网络层，但考纲把它和 IP 放在一起讲。', 'ARP rides directly in Ethernet frames (type 0x0806), not in IP.') },
      ],
    },
    {
      id: 'cases',
      title: T('四种典型情况', 'Four typical cases'),
      blocks: [
        {
          table: {
            head: [T('发送方', 'Sender'), T('接收方', 'Receiver'), T('解析谁的 MAC', 'Resolve')],
            rows: [
              [T('主机', 'Host'), T('本网络上的主机', 'host on the same LAN'), T('目的主机', 'the destination host')],
              [T('主机', 'Host'), T('别的网络上的主机', 'host elsewhere'), T('本网络的路由器（默认网关）', 'the default gateway')],
              [T('路由器', 'Router'), T('别的网络上的主机', 'host elsewhere'), T('下一跳路由器', 'the next-hop router')],
              [T('路由器', 'Router'), T('直接相连网络上的主机', 'host on an attached LAN'), T('目的主机', 'the destination host')],
            ],
          },
        },
        { p: T('所以数据报每经过一段链路，帧的源和目的 MAC 都会换成这一段两端的地址，而 IP 首部里的源和目的 IP 不变（不考虑 NAT）。', 'Each hop rewrites the frame’s MAC addresses; the IP addresses stay put (ignoring NAT).') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('ARP 请求是广播，响应是单播。', 'Request: broadcast; reply: unicast.'),
            T('跨网络通信时解析的是网关的 MAC，不是目的主机的。', 'For remote hosts, resolve the gateway.'),
            T('判断在不在本网络要用本机的子网掩码。', 'Use your own mask to decide locality.'),
            T('题目问「帧的目的 MAC」时，看的是这一段链路的下一站。', 'A frame’s destination MAC is the next hop on this link.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('解析', 'Resolution') });

function build(params) {
  const hosts = parseHosts(params.hosts) ?? [];
  const sends = String(params.sends ?? '').split(/[\s,，;；]+/).filter(Boolean).slice(0, 6);
  const sim = arp({ me: { ip: params.myIp, mac: params.myMac }, prefix: params.prefix, gateway: params.gateway, hosts, sends });
  const lesson = {
    id: 'arp',
    kit,
    where: [['net', 'network']],
    tag: 'ARP',
    name: T('ARP 地址解析', 'ARP address resolution'),
    full: T('IP 地址与 MAC 地址 · 本网络还是交给网关 · ARP 高速缓存 · 广播请求与单播响应', 'IP vs MAC · local or via gateway · ARP cache · broadcast request, unicast reply'),
    title: sim.ok ? T(`${sim.net}/${sim.prefix}`, `${sim.net}/${sim.prefix}`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['blue', T('主机 A', 'Host A')],
      ['amber', T('默认网关', 'Gateway')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('主机 A 要给某个 IP 发数据，可局域网上的帧要写 MAC 地址。A 先用掩码判断对方在不在本网络——在就问对方的 MAC，不在就问默认网关的 MAC；查不到缓存就在网上广播一声「谁是这个 IP？」，只有那台主机回答。连续发几次，看缓存怎么被填上。', 'A needs a MAC address for its frame. It decides by mask whether to resolve the destination or the gateway, checks its cache, and otherwise broadcasts “who has this IP?”; only the owner answers. Send several times and watch the cache fill.'),
      facts: sim.ok ? [[T('A', 'A'), `${sim.me.ip}/${sim.prefix}`], [T('默认网关', 'Gateway'), sim.gateway]] : [],
    },
    start: { nodes: [], frame: { rect: [20, 90, HX + hosts.length * GAP + 460, BUS + 110] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [];
  sim.steps.forEach((s, i) => {
    list.push({
      title: s.local ? T(`发往 ${s.dst}：在本网络`, `To ${s.dst}: local`) : T(`发往 ${s.dst}：交给网关`, `To ${s.dst}: via the gateway`),
      desc: T(`要解析 ${s.target} 的 MAC`, `Resolve ${s.target}`),
      detail: s.local
        ? T(`${s.dst} 和 A（${sim.me.ip}）与掩码 ${sim.mask} 按位与的结果相同，在同一个网络，帧可以直接发给它，所以要解析的就是 ${s.dst}。`, `${s.dst} AND ${sim.mask} equals A’s network, so it is local and its own MAC is needed.`)
        : T(`${s.dst} 与掩码 ${sim.mask} 按位与后和 A 的网络 ${sim.net} 不同，不在本网络。帧要先交给默认网关 ${sim.gateway}，所以要解析的是网关的 MAC；IP 首部里的目的地址仍是 ${s.dst}。`, `${s.dst} is not on ${sim.net}, so the frame goes to the gateway ${sim.gateway}; the IP destination stays ${s.dst}.`),
      ref: 'cases',
      st: { i, phase: 1 },
      row: { color: s.local ? 'blue' : 'amber', what: T(`发往 ${s.dst}`, `To ${s.dst}`), result: s.local ? T('本网络', 'local') : T('经网关', 'via gateway'), tone: 'info' },
    });
    list.push({
      title: s.hit ? T(`缓存命中：${s.mac}`, `Cache hit: ${s.mac}`) : s.found ? T(`广播请求，${s.owner} 回答`, `Broadcast; ${s.owner} replies`) : T('广播请求，没人回答', 'Broadcast; no reply'),
      desc: s.hit ? T('不用发 ARP 请求', 'No request needed') : T('请求广播，响应单播', 'Broadcast request, unicast reply'),
      detail: s.hit
        ? T(`A 的 ARP 高速缓存里已经有 ${s.target} → ${s.mac}，直接用它封装帧。`, `The cache already maps ${s.target} → ${s.mac}.`)
        : s.found
          ? T(`缓存里没有 ${s.target}。A 发出 ARP 请求，帧的目的 MAC 是 FF-FF-FF-FF-FF-FF，局域网上每台设备都收到。只有 ${s.owner}（${s.target}）用单播回答自己的 MAC ${s.mac}，并顺便记下 A 的地址。A 把 ${s.target} → ${s.mac} 写进缓存，再把数据报装进帧发出。`, `No entry, so A broadcasts a request. Only ${s.owner} answers by unicast with ${s.mac}; A caches it and sends the frame.`)
          : T(`缓存里没有 ${s.target}，A 广播 ARP 请求，但网上没有这个 IP 的设备，没人回答。数据报发不出去，上层会收到出错。`, `Nobody owns ${s.target}; the request goes unanswered.`),
      ref: s.hit ? 'how' : 'how',
      st: { i, phase: 2 },
      row: { color: s.hit ? 'green' : s.found ? 'blue' : 'rose', what: T(`解析 ${s.target}`, `Resolve ${s.target}`), result: s.mac ?? T('失败', 'failed'), tone: s.found ? 'ok' : 'warn', info: s.hit ? T('缓存命中', 'cache hit') : T('广播请求', 'broadcast') },
    });
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T(`缓存里有 ${sim.steps.at(-1)?.cache.length ?? 0} 条`, `${sim.steps.at(-1)?.cache.length ?? 0} cache entries`), text: T('把前缀长度改小或改大，看同一个目的地址的判断怎么变：掩码决定了谁算「本网络」。', 'Change the prefix length and watch the same destination switch between local and remote.'), facts: [] };
  return lesson;
}

export const makeArp = () => parametric('arp', SPEC.presets[0].set, build);
