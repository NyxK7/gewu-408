// 「NAT 网络地址转换」：左边内网、中间 NAT 路由器、右边外网；分组首部画成四个格子（源 IP、源端口、目的 IP、目的端口），
// 经过路由器前后各画一份，改动的格子高亮；下面是 NAT 转换表。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { nat, parseEvents } from './nat.js';

const EV = 'out 192.168.0.2:3345 → 202.10.1.1:80\nout 192.168.0.3:3345 → 202.10.1.1:80\nin 202.10.1.1:80 → :5002\nout 192.168.0.2:3345 → 202.10.1.1:80\nin 61.1.1.1:53 → :6000';
const SPEC = {
  presets: [
    { label: T('两台主机共用一个公网地址', 'Two hosts, one public address'), set: { pub: '172.38.1.5', base: 5001, events: EV } },
    { label: T('一台主机开两个连接', 'One host, two connections'), set: { pub: '172.38.1.5', base: 6001, events: 'out 10.0.0.8:4001 → 93.184.216.34:443\nout 10.0.0.8:4002 → 93.184.216.34:443\nin 93.184.216.34:443 → :6001\nin 93.184.216.34:443 → :6002' } },
  ],
  groups: [
    {
      legend: T('NAT 路由器', 'NAT router'),
      fields: [
        { name: 'pub', label: T('公网 IP 地址', 'Public IP'), type: 'text' },
        { name: 'base', label: T('外部端口从几开始分配', 'First external port'), type: 'int', min: 1024, max: 65000 },
      ],
    },
    {
      legend: T('分组', 'Packets'),
      fields: [{ name: 'events', label: T('每行一个：out 内网IP:端口 → 外网IP:端口；in 外网IP:端口 → :目的端口', 'One per line: out ip:port → ip:port; in ip:port → :port'), type: 'text', wide: true, multiline: true, rows: 5, parse: (s) => (parseEvents(s).events ? s : NaN) }],
    },
  ],
  note: T(
    '这里演示的是 NAPT（网络地址与端口转换）：内网多台主机共用路由器的一个公网 IP，用不同的外部端口区分。新的（内网地址，端口）出去时分配一个新外部端口，从设定的值起依次加 1；回来的分组按目的端口查表改回去，查不到就丢弃。',
    'This is NAPT: many private hosts share one public IP, told apart by external ports. A new (private address, port) gets the next external port; returning packets are translated back by destination port, or dropped if unknown.',
  ),
};
const ERR = {
  pub: T('公网地址不对', 'Invalid public address'),
  base: T('起始端口在 1024～65000', 'Start port 1024–65000'),
  event: T('这一行看不懂：{e}', 'Cannot read: {e}'),
  count: T('分组要有 1～8 个', 'Give 1–8 packets'),
};

// ───── 画板 ─────
const LX = 40;
const RX = 690;
const MX = 520;
const HY = 262;
const ZY = 100;
const ZH = 230;
const FW = [120, 62, 120, 54];

function header(h, changed, z, dropped) {
  const labels = z ? ['源 IP', '源端口', '目的 IP', '目的端口'] : ['src IP', 'port', 'dst IP', 'port'];
  const vals = h ? [h.sip, h.sport, h.dip, h.dport] : ['—', '—', '—', '—'];
  let x = 0;
  return labels
    .map((lab, i) => {
      const g = `<g transform="translate(${x} 0)">${txt(FW[i] / 2, -6, lab, 'bt-idx')}${cell(FW[i] - 4, 30, String(vals[i]), { cls: dropped ? 'bad' : changed.includes(i) ? 'hot' : '', size: 11.5 })}</g>`;
      x += FW[i];
      return g;
    })
    .join('');
}

/** 内网主机和外网服务器；当前分组走的那条路亮起来 */
function natHosts(sim, s, z) {
  const inner = [...new Set(sim.steps.flatMap((x) => (x.dir === 'out' ? [x.sip] : x.row ? [x.row.ip] : [])))].slice(0, 3);
  const outer = [...new Set(sim.steps.map((x) => (x.dir === 'out' ? x.dip : x.sip)))].slice(0, 3);
  const HYc = ZY + 64;
  const pos = (list, x0, ip) => x0 + 4 + list.indexOf(ip) * 126 + 58;
  let h = '';
  const host = s ? (s.dir === 'out' ? s.sip : s.row?.ip) : null;
  const server = s ? (s.dir === 'out' ? s.dip : s.sip) : null;
  inner.forEach((ip, i) => (h += `<g transform="translate(${LX + 4 + i * 126} ${HYc - 18})">${cell(116, 36, ip, { tone: 'blue', size: 12, cls: ip === host ? 'hot' : s ? 'dim' : '' })}</g>`));
  outer.forEach((ip, i) => (h += `<g transform="translate(${RX + 4 + i * 126} ${HYc - 18})">${cell(116, 36, ip, { tone: 'green', size: 12, cls: ip === server ? 'hot' : s ? 'dim' : '' })}</g>`));
  if (s) {
    const bad = s.dropped;
    const hx = host && inner.includes(host) ? pos(inner, LX, host) : null;
    const sx = outer.includes(server) ? pos(outer, RX, server) : null;
    const y = HYc + 18;
    const cls = bad ? 'bad' : s.dir === 'out' ? 'out' : 'in';
    let p = '';
    if (sx != null) p += `<path class="nt-route ${cls}" d="M${sx} ${y} C${sx} ${y + 34}, ${MX + 120} ${HYc}, ${MX + 70} ${HYc}"/>`;
    if (hx != null && !bad) p += `<path class="nt-route ${cls}" d="M${hx} ${y} C${hx} ${y + 34}, ${MX - 120} ${HYc}, ${MX - 70} ${HYc}"/>`;
    if (bad) p += txt(MX + 92, HYc - 10, '✕', 'nt-x');
    h += p;
  }
  return [{ k: 'hosts', x: 0, y: 0, html: h }];
}

function board(sim, st, z) {
  const items = [];
  const s = st.i != null ? sim.steps[st.i] : null;
  // 三个区域
  items.push({
    k: 'zones',
    x: 0,
    y: 0,
    html:
      `<rect class="nt-zone" x="${LX - 20}" y="${ZY}" width="400" height="${ZH}" rx="10"/>` +
      txt(LX - 8, ZY + 20, z ? '内网（私有地址）' : 'Private network', 'bt-cap', 'start') +
      `<rect class="nt-zone pub" x="${RX - 20}" y="${ZY}" width="400" height="${ZH}" rx="10"/>` +
      txt(RX - 8, ZY + 20, z ? '外网（互联网）' : 'Internet', 'bt-cap', 'start') +
      `<g transform="translate(${MX - 70} ${ZY + 2})">${cell(140, ZH - 4, '', { tone: 'amber' })}</g>` +
      txt(MX, ZY + 40, z ? 'NAT 路由器' : 'NAT router', 'bt-lab') +
      txt(MX, ZY + 62, sim.pub, 'ar-ip') +
      txt(MX, ZY + 82, z ? '（公网地址）' : '(public)', 'bt-cap'),
  });
  items.push(...natHosts(sim, s, z));
  if (s) {
    const out = s.dir === 'out';
    const left = out ? s.before : s.after;
    const right = out ? s.after : s.before;
    const chL = out ? [] : [2, 3];
    const chR = out ? [0, 1] : [];
    items.push({ k: 'hl', x: LX, y: HY, html: header(left, st.phase >= 1 ? chL : [], z, !out && s.dropped && st.phase >= 1) });
    items.push({ k: 'hr', x: RX, y: HY, html: header(st.phase >= 1 || !out ? right : null, st.phase >= 1 ? chR : [], z) });
    const y = HY + 50;
    items.push({ k: 'dir', x: 0, y, html: out ? arrow(LX + 340, y - y, RX - 20, 0, 'acc') + txt(MX, 22, z ? '出去：改源地址和源端口' : 'outbound: rewrite source', 'nt-dir', 'middle') : arrow(RX - 20, 0, LX + 340, 0, s.dropped && st.phase >= 1 ? 'bad' : 'ok') + txt(MX, 22, s.dropped && st.phase >= 1 ? (z ? '表里没有这个端口：丢弃' : 'no such port: drop') : z ? '回来：改目的地址和目的端口' : 'inbound: rewrite destination', `nt-dir ${s.dropped && st.phase >= 1 ? 'bad' : 'ok'}`, 'middle') });
  }
  // 转换表
  const table = s ? (st.phase >= 1 ? s.table : st.i > 0 ? sim.steps[st.i - 1].table : []) : [];
  const TY = 380;
  let t = txt(0, -14, z ? 'NAT 转换表' : 'NAT table', 'bt-lab', 'start');
  const cols = [[z ? '内网地址' : 'Private', 200], [z ? '外部地址' : 'Public', 200]];
  let x = 0;
  for (const [lab, w] of cols) {
    t += `<g transform="translate(${x} 0)">${cell(w - 4, 26, lab, { cls: 'head', size: 11 })}</g>`;
    x += w;
  }
  if (!table.length) t += txt(0, 50, z ? '（空）' : '(empty)', 'bt-dim', 'start');
  table.forEach((r, i) => {
    const hot = s && st.phase >= 1 && s.row && r.ext === s.row.ext;
    const cls = hot ? (s.dir === 'out' && s.fresh ? 'hot' : 'ok') : '';
    t += `<g transform="translate(0 ${(i + 1) * 30})">${cell(196, 26, `${r.ip}:${r.port}`, { cls, size: 11.5 })}<g transform="translate(200 0)">${cell(196, 26, `${sim.pub}:${r.ext}`, { cls, size: 11.5 })}</g></g>`;
  });
  items.push({ k: 'table', x: MX - 200, y: TY, html: t });
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要 NAT', 'Why NAT'),
      blocks: [
        { p: T('IPv4 地址不够用。很多机构内部使用**私有地址**，它们只在内部有效，互联网上的路由器不转发目的地址是私有地址的分组。**NAT（网络地址转换）**装在内网连到互联网的路由器上，让内网主机用这台路由器的**公网地址**去和外面通信。', 'IPv4 addresses ran out. Private addresses are only valid inside and never routed on the Internet. **NAT** on the border router lets inside hosts use its **public address**.') },
        {
          table: {
            head: [T('私有地址块', 'Private block'), T('范围', 'Range')],
            rows: [
              ['10.0.0.0/8', '10.0.0.0 ～ 10.255.255.255'],
              ['172.16.0.0/12', '172.16.0.0 ～ 172.31.255.255'],
              ['192.168.0.0/16', '192.168.0.0 ～ 192.168.255.255'],
            ],
          },
        },
      ],
    },
    {
      id: 'napt',
      title: T('NAT 和 NAPT', 'NAT and NAPT'),
      blocks: [
        { p: T('最简单的 NAT 只改 IP 地址：一个公网地址同一时刻只能给一台内网主机用。实际普遍使用的是 **NAPT（网络地址与端口转换）**：同时改写 IP 地址和传输层端口号，内网很多主机可以共用一个公网地址，靠不同的外部端口区分。', 'Basic NAT rewrites only addresses, so one public address serves one host at a time. **NAPT** also rewrites ports, letting many hosts share one address.') },
        {
          steps: [
            T('内网主机发出分组：路由器把**源 IP** 改成公网地址，**源端口**改成一个新分配的端口，并在转换表里记下对应关系；', 'outbound: replace the **source IP** with the public address and the **source port** with a fresh one, recording the mapping;'),
            T('外面的服务器回复时，目的地址是公网地址、目的端口是那个外部端口；', 'replies come back to the public address and that port;'),
            T('路由器按**目的端口**查转换表，把**目的 IP 和目的端口**改回内网主机的地址和端口，再转发进内网。', 'inbound: look up the **destination port** and restore the private address and port.'),
          ],
        },
        { warn: T('NAPT 要改传输层的端口号，所以严格说它跨越了网络层和传输层；改了地址和端口后，IP 首部检验和和 TCP / UDP 检验和都要重新计算。', 'NAPT touches transport-layer ports, so IP and TCP/UDP checksums must be recomputed.') },
      ],
    },
    {
      id: 'limits',
      title: T('NAT 带来的问题', 'Side effects'),
      blocks: [
        {
          list: [
            T('外网主机不能主动访问内网主机：转换表里还没有记录时，进来的分组找不到要转给谁，只能丢弃。内网要对外提供服务，需要在路由器上手工配置静态映射（端口转发）。', 'Outsiders cannot initiate connections; static port forwarding is needed for inside servers.'),
            T('违背了「端到端」原则：中间设备改了分组首部；一些在报文里携带 IP 地址的应用（如 FTP 的主动模式）需要额外处理。', 'It breaks end-to-end addressing; protocols that embed addresses need help.'),
          ],
        },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('出去改的是**源**地址和**源**端口；回来改的是**目的**地址和**目的**端口。', 'Outbound rewrites the **source**; inbound rewrites the **destination**.'),
            T('外网服务器看到的源地址是 NAT 路由器的公网地址，看不到内网地址。', 'The server only sees the public address.'),
            T('两台内网主机用同一个源端口也没关系，NAPT 会给它们分配不同的外部端口。', 'Identical inside ports get different outside ports.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('分组', 'Packets') });

function build(params) {
  const sim = nat({ pub: params.pub, base: params.base, events: params.events });
  const lesson = {
    id: 'nat',
    kit,
    where: [['net', 'network']],
    tag: 'NAT',
    name: T('NAT 网络地址转换', 'Network address translation'),
    full: T('私有地址 · NAT 与 NAPT · 转换表 · 出去改源、回来改目的', 'Private addresses · NAT and NAPT · translation table · rewrite source out, destination in'),
    title: sim.ok ? T(`公网 ${sim.pub}`, `Public ${sim.pub}`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['amber', T('NAT 路由器', 'NAT router')],
      ['rose', T('被改写的字段', 'Rewritten field')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('内网主机用的是私有地址，出不了门。NAT 路由器在分组出去时把源地址换成自己的公网地址、源端口换成一个新端口，记在转换表里；回复回来时按端口查表换回去。这节课把分组首部的四个字段画在路由器两侧，改了哪一格一眼就能看到。', 'Private hosts cannot reach the Internet directly. The NAT router swaps the source for its public address and a new port on the way out, logs it, and swaps back on the way in. The four header fields are drawn on both sides of the router so every rewrite stands out.'),
      facts: sim.ok ? [[T('公网地址', 'Public address'), sim.pub]] : [],
    },
    start: { nodes: [], frame: { rect: [10, 80, RX + 390, 380 + 30 * (sim.ok ? Math.max(1, sim.steps.at(-1).table.length) : 2) + 50] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [];
  sim.steps.forEach((s, i) => {
    if (s.dir === 'out') {
      list.push({
        title: T(`${s.sip}:${s.sport} 出去`, `${s.sip}:${s.sport} goes out`),
        desc: T(`→ ${sim.pub}:${s.row.ext}`, `→ ${sim.pub}:${s.row.ext}`),
        detail: s.fresh
          ? T(`转换表里还没有 ${s.sip}:${s.sport}，分配新的外部端口 ${s.row.ext}，记下这一行。把源地址 ${s.sip} 改成 ${sim.pub}、源端口 ${s.sport} 改成 ${s.row.ext}，目的地址和端口不变，发往 ${s.dip}:${s.dport}。`, `New pair: allocate port ${s.row.ext}. Source ${s.sip}:${s.sport} becomes ${sim.pub}:${s.row.ext}; the destination is unchanged.`)
          : T(`转换表里已经有 ${s.sip}:${s.sport} → ${sim.pub}:${s.row.ext}，沿用这个外部端口，源地址和源端口照样改写。`, `Existing mapping reused: ${sim.pub}:${s.row.ext}.`),
        ref: 'napt',
        st: { i, phase: 1 },
        row: { color: 'amber', what: T('出去', 'Out'), result: `${sim.pub}:${s.row.ext}`, tone: 'info', info: `${s.sip}:${s.sport} → ${s.dip}:${s.dport}` },
      });
    } else {
      list.push({
        title: s.dropped ? T(`端口 ${s.dport}：表里没有，丢弃`, `Port ${s.dport}: unknown, dropped`) : T(`回来的分组 → ${s.row.ip}:${s.row.port}`, `Reply → ${s.row.ip}:${s.row.port}`),
        desc: s.dropped ? T('外网不能主动连进来', 'Unsolicited inbound traffic') : T(`按目的端口 ${s.dport} 查表`, `Look up port ${s.dport}`),
        detail: s.dropped
          ? T(`${s.sip}:${s.sport} 发来一个目的端口为 ${s.dport} 的分组，可转换表里没有这个外部端口——没有哪台内网主机先发起过这个连接。路由器不知道该转给谁，只能丢弃。`, `No inside host opened port ${s.dport}, so the router cannot forward it and drops it.`)
          : T(`来自 ${s.sip}:${s.sport} 的分组，目的地址是 ${sim.pub}、目的端口 ${s.dport}。查表得到 ${s.row.ip}:${s.row.port}，把目的地址和目的端口改回去，转发进内网；源地址不变。`, `Destination port ${s.dport} maps to ${s.row.ip}:${s.row.port}; the destination is restored and the packet goes inside.`),
        ref: s.dropped ? 'limits' : 'napt',
        st: { i, phase: 1 },
        row: { color: s.dropped ? 'rose' : 'green', what: T('回来', 'In'), result: s.dropped ? T('丢弃', 'drop') : `${s.row.ip}:${s.row.port}`, tone: s.dropped ? 'warn' : 'ok', info: `${s.sip}:${s.sport} → ${sim.pub}:${s.dport}` },
      });
    }
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T(`转换表 ${sim.steps.at(-1).table.length} 行`, `${sim.steps.at(-1).table.length} mappings`), text: T('加一行从外网主动发进来的分组（目的端口随便写一个），看它为什么进不来。', 'Add an unsolicited inbound packet and see why it is dropped.'), facts: [] };
  return lesson;
}

export const makeNat = () => parametric('nat', SPEC.presets[0].set, build);
