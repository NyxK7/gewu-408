// 「网络体系结构：逐层封装」：左中右三列是主机 A、路由器、主机 B 的协议栈；底下一条横条是这一刻的 PDU，
// 每一段是一个首部（或数据、填充、尾部），往下走一层加一段，往上走一层拆一段。路由器只拆到网络层。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { ADDR, HDR, encap } from './encap.js';

const W = [['net', 'arch']];
const CX = { A: 40, R: 420, B: 800 };
const CW = 160;
const CH = 46;
const Y0 = 100;
const RS = 58;
const PY = 480; // PDU 条
const yOf = (li) => Y0 + li * RS;
const LNAME = [T('应用层', 'Application'), T('传输层', 'Transport'), T('网络层', 'Network'), T('数据链路层', 'Link'), T('物理层', 'Physical')];
const PART = {
  data: T('数据', 'Data'),
  tcp: T('TCP 首部', 'TCP hdr'),
  udp: T('UDP 首部', 'UDP hdr'),
  ip: T('IP 首部', 'IP hdr'),
  eth: T('以太网首部', 'Eth hdr'),
  fcs: 'FCS',
  pad: T('填充', 'Pad'),
  pre: T('前导码', 'Preamble'),
  ppp: T('PPP 首部', 'PPP hdr'),
  pppt: T('FCS+标志', 'FCS+flag'),
};
const PTONE = { data: 'blue', tcp: 'violet', udp: 'violet', ip: 'teal', eth: 'orange', fcs: 'orange', pad: 'slate', pre: 'slate', ppp: 'green', pppt: 'green' };
const pduName = (s, trans) =>
  ({
    app: T('报文', 'message'),
    trans: trans === 'tcp' ? T('TCP 报文段', 'TCP segment') : T('UDP 用户数据报', 'UDP datagram'),
    net: T('IP 数据报（分组）', 'IP datagram (packet)'),
    link: T('帧', 'frame'),
    phy: T('比特流', 'bits'),
  })[s.layer];

const EX = 100; // 原理页的例子：100 字节的 HTTP 数据走以太网
const exWire = HDR.pre + HDR.eth + HDR.ip + HDR.tcp + EX + HDR.fcs;

const PRINCIPLE = {
  sections: [
    {
      id: 'net',
      title: T('计算机网络的组成与分类', 'What a network is made of'),
      blocks: [
        { p: T('计算机网络是把分散的、自治的计算机用通信线路和设备连起来，按照协议互相通信、共享资源的系统。从工作方式看分成两部分：**边缘部分**是连在网上的主机（用户直接使用）；**核心部分**是大量网络和连接它们的路由器（为边缘提供连通和交换）。', 'A network links autonomous computers so they can communicate under protocols. The **edge** is the hosts; the **core** is the networks and routers that connect them.') },
        {
          table: {
            head: [T('分类方法', 'By'), T('类别', 'Classes')],
            rows: [
              [T('覆盖范围', 'Range'), T('广域网 WAN、城域网 MAN、局域网 LAN、个人区域网 PAN', 'WAN, MAN, LAN, PAN')],
              [T('传输技术', 'Transmission'), T('广播式网络（共享信道，如早期以太网）、点对点网络（存储转发）', 'broadcast vs point-to-point')],
              [T('拓扑结构', 'Topology'), T('总线、星形、环形、网状', 'bus, star, ring, mesh')],
              [T('交换方式', 'Switching'), T('电路交换、报文交换、分组交换', 'circuit, message, packet switching')],
              [T('使用者', 'Users'), T('公用网、专用网', 'public, private')],
            ],
          },
        },
        { tip: T('功能上：数据通信（最基本）、资源共享（最主要的目的）、分布式处理、提高可靠性、负载均衡。', 'Functions: communication (basic), resource sharing (main goal), distributed processing, reliability, load balancing.') },
      ],
    },
    {
      id: 'layers',
      title: T('分层：协议、服务和接口', 'Layering: protocols, services, interfaces'),
      blocks: [
        { list: [
          T('**协议**：对等实体（两台机器上同一层）之间通信的规则，由语法（格式）、语义（含义、要做的动作）、同步（时序）三部分组成。协议是**水平**的。', '**Protocol**: rules between peer entities — syntax, semantics, timing. Protocols are **horizontal**.'),
          T('**服务**：下层通过层间接口为上层提供的功能。服务是**垂直**的；上层看得见服务，看不见下层的协议。', '**Service**: what a layer offers the layer above. Services are **vertical**.'),
          T('**接口**（服务访问点 SAP）：相邻两层交换信息的地方。比如传输层的 SAP 是端口，网络层的 SAP 是 IP 地址，链路层的 SAP 是 MAC 地址。', '**Interface / SAP**: where adjacent layers meet (ports, IP addresses, MAC addresses).'),
          T('**PDU**（协议数据单元）= 本层首部 + **SDU**（上层交下来的服务数据单元）。往下走一层就把上一层整个 PDU 当作数据，再加自己的首部（链路层还加尾部）。', '**PDU** = header + **SDU** from above; each layer treats the whole upper PDU as data.'),
        ] },
        { warn: T('第 n 层的协议只和对方的第 n 层「对话」，但实际数据要一路下到物理层传过去，再一路上来。', 'Layer n talks only to its peer, but the data actually goes all the way down and back up.') },
      ],
    },
    {
      id: 'osi',
      title: T('OSI 七层与 TCP/IP 四层', 'OSI and TCP/IP'),
      blocks: [
        {
          table: {
            head: ['OSI', 'TCP/IP', T('教学用五层', 'Five-layer'), T('这一层的 PDU', 'PDU'), T('设备', 'Devices')],
            rows: [
              [T('应用层、表示层、会话层', 'Application, presentation, session'), T('应用层', 'Application'), T('应用层', 'Application'), T('报文', 'message'), T('网关（应用层网关）', 'gateways')],
              [T('传输层', 'Transport'), T('传输层', 'Transport'), T('传输层', 'Transport'), T('报文段 / 用户数据报', 'segment / datagram'), '—'],
              [T('网络层', 'Network'), T('网际层', 'Internet'), T('网络层', 'Network'), T('分组（IP 数据报）', 'packet'), T('路由器', 'routers')],
              [T('数据链路层', 'Data link'), T('网络接口层', 'Network access'), T('数据链路层', 'Link'), T('帧', 'frame'), T('交换机、网桥', 'switches, bridges')],
              [T('物理层', 'Physical'), '', T('物理层', 'Physical'), T('比特', 'bits'), T('集线器、中继器', 'hubs, repeaters')],
            ],
          },
        },
        { list: [
          T('OSI 是先有模型后有协议，概念清楚但没有流行起来；TCP/IP 是先有协议后有模型，是事实上的标准。', 'OSI came before its protocols; TCP/IP is the de facto standard.'),
          T('OSI 的网络层支持无连接和面向连接两种，传输层只有面向连接；TCP/IP 的网际层只有无连接（IP），传输层两种都有（TCP、UDP）。', 'OSI: network layer both, transport connection-oriented only. TCP/IP: IP is connectionless; transport offers both.'),
        ] },
      ],
    },
    {
      id: 'pdu',
      title: T('首部开销和传输效率', 'Header overhead'),
      blocks: [
        { p: T('每层都加首部，线路上真正的「有用数据」只占一部分。', 'Every layer adds overhead.') },
        {
          table: {
            head: [T('谁加的', 'Added by'), T('多长', 'Size')],
            rows: [
              [T('TCP 首部（无选项）', 'TCP header'), `${HDR.tcp} B`],
              [T('UDP 首部', 'UDP header'), `${HDR.udp} B`],
              [T('IPv4 首部（无选项）', 'IPv4 header'), `${HDR.ip} B`],
              [T('以太网首部 + FCS', 'Ethernet header + FCS'), `${HDR.eth} + ${HDR.fcs} B`],
              [T('前导码 + 帧开始定界符（物理层）', 'Preamble + SFD'), `${HDR.pre} B`],
            ],
          },
        },
        { formula: T(`例：${EX}B 的 HTTP 数据经以太网发出，线路上共 ${HDR.pre} + ${HDR.eth} + ${HDR.ip} + ${HDR.tcp} + ${EX} + ${HDR.fcs} = ${exWire}B，传输效率 ${EX}/${exWire} ≈ ${((EX / exWire) * 100).toFixed(1)}%。`, `Example: ${EX} B of HTTP data → ${exWire} B on the wire, ${((EX / exWire) * 100).toFixed(1)}% efficiency.`) },
        { tip: T('以太网帧的数据部分最少 46B（帧最短 64B），IP 数据报不够长时链路层要填充。题目里算效率时看清楚算不算前导码。', 'Ethernet needs at least 46 B of payload (64 B frames); short packets are padded. Check whether the preamble counts.') },
      ],
    },
    pit([
      T('路由器只处理到网络层：它拆掉链路层首部，看 IP 首部决定往哪转，再换上新的链路层首部；IP 地址不变，MAC 地址每一跳都变。', 'Routers go up to layer 3: the link header is replaced at every hop; IP addresses stay, MAC addresses change.'),
      T('协议是水平的、服务是垂直的；下层的协议对上层透明。', 'Protocols are horizontal, services vertical.'),
      T('TTL 每经过一个路由器减 1，所以 IP 首部校验和每一跳都要重算。', 'TTL drops by one per router, so the header checksum is recomputed at every hop.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('HTTP 请求 300 字节，两段都是以太网', 'HTTP 300 B over Ethernet'), set: { app: 'http', n: 300, link2: 'eth' } },
    { label: T('很短的 DNS 数据 10 字节（要填充）', 'A 10 B DNS payload (padded)'), set: { app: 'dns', n: 10, link2: 'eth' } },
    { label: T('第二段换成 PPP 链路', 'Second link is PPP'), set: { app: 'http', n: 300, link2: 'ppp' } },
    { label: T('装满一个报文段：1460 字节', 'A full segment: 1460 B'), set: { app: 'http', n: 1460, link2: 'eth' } },
  ],
  groups: [{ legend: T('主机 A → 路由器 → 主机 B', 'Host A → router → host B'), fields: [
    { name: 'app', label: T('应用', 'Application'), type: 'select', options: [['http', T('HTTP（用 TCP，端口 80）', 'HTTP (TCP, port 80)')], ['dns', T('DNS（用 UDP，端口 53）', 'DNS (UDP, port 53)')]] },
    { name: 'n', label: T('应用数据（字节）', 'Application data (bytes)'), type: 'int', min: 1, max: 1472 },
    { name: 'link2', label: T('路由器到 B 的链路', 'Router → B link'), type: 'select', options: [['eth', T('以太网', 'Ethernet')], ['ppp', 'PPP']] },
  ] }],
  note: T('TCP、IP 首部都按 20 字节（无选项）、UDP 8 字节；以太网首部 14 + FCS 4，数据不足 46 字节要填充，前导码 8 字节；PPP 帧开销 8 字节。数据不超过一个报文段，不分片。', 'TCP/IP headers 20 B, UDP 8 B; Ethernet 14 + 4 B with 46 B minimum payload and an 8 B preamble; PPP 8 B. No fragmentation.'),
};
const ERR = { app: T('应用不对', 'Unknown application'), link2: T('链路类型不对', 'Unknown link'), n: T('数据 1～1460 字节（DNS 用 UDP 时最多 1472）', 'Data: 1–1460 B (1472 for UDP)') };

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const s = k >= 0 ? sim.steps[k] : null;
  const L = (t) => (typeof t === 'string' ? t : z ? t.zh : t.en);
  // 三个协议栈
  let sh = '';
  for (const [who, x] of Object.entries(CX)) {
    const rows = who === 'R' ? [2, 3, 4] : [0, 1, 2, 3, 4];
    sh += txt(x + CW / 2, Y0 - 16, who === 'R' ? (z ? '路由器' : 'Router') : z ? `主机 ${who}` : `Host ${who}`, 'bt-lab');
    for (const li of rows) {
      const visited = sim.steps.slice(0, k + 1).some((x2) => x2.at === who && x2.li === li);
      const cur = s && s.at === who && s.li === li;
      sh += `<g transform="translate(${x} ${yOf(li)})">${cell(CW, CH, L(LNAME[li]), { size: 15, tone: cur ? 'amber' : visited ? 'slate' : '', cls: cur ? 'hot' : '' })}</g>`;
    }
  }
  // 线路
  const wy = yOf(4) + CH / 2;
  sh += `<g class="barw"><line x1="${CX.A + CW}" y1="${wy}" x2="${CX.R}" y2="${wy}"/><line x1="${CX.R + CW}" y1="${wy}" x2="${CX.B}" y2="${wy}"/></g>`;
  sh += txt((CX.A + CW + CX.R) / 2, wy + 24, z ? '以太网' : 'Ethernet', 'bt-cap');
  sh += txt((CX.R + CW + CX.B) / 2, wy + 24, sim.link2 === 'eth' ? (z ? '以太网' : 'Ethernet') : 'PPP', 'bt-cap');
  // 这一步的走向
  if (s && k > 0) {
    const p = sim.steps[k - 1];
    const px = CX[p.at] + CW / 2;
    const cx = CX[s.at] + CW / 2;
    if (p.at === s.at) sh += arrow(cx + CW / 2 + 14, yOf(p.li) + CH / 2, cx + CW / 2 + 14, yOf(s.li) + CH / 2, 'acc');
    else sh += arrow(px + CW / 2, wy - 8, cx - CW / 2, wy - 8, 'acc');
  }
  items.push({ k: 'stack', x: 0, y: 0, html: sh });

  // PDU 条
  let ph = '';
  if (s) {
    const dataW = 110 + Math.min(1, sim.n / 1460) * 200;
    const wOf = (p) => (p.k === 'data' ? dataW : p.k === 'pad' || p.k === 'fcs' ? 84 : 116);
    let x = 0;
    for (const p of s.pdu) {
      const w = wOf(p);
      const tone = p.k === s.add ? 'amber' : p.k === s.strip ? 'rose' : PTONE[p.k];
      ph += `<g transform="translate(${x} 0)">${cell(w - 4, 46, `${L(PART[p.k])} ${p.size}`, { size: 14, tone, cls: p.k === s.add || p.k === s.strip ? 'hot' : '' })}</g>`;
      x += w;
    }
    ph += txt(0, -12, z ? `${pduName(s, sim.trans).zh} · ${s.total} 字节` : `${pduName(s, sim.trans).en} · ${s.total} bytes`, 'bt-lab', 'start');
    // 这一层关心的字段
    const f = fieldsOf(sim, s, z);
    if (f) ph += txt(0, 76, f, 'ar-mono', 'start');
  } else ph += txt(0, 20, z ? '（点播放：从主机 A 的应用层开始）' : '(press play)', 'bt-idx', 'start');
  items.push({ k: 'pdu', x: CX.A, y: PY, html: ph });
  return items;
}

function fieldsOf(sim, s, z) {
  const sp = 50000;
  if (s.layer === 'trans') return z ? `源端口 ${sp} → 目的端口 ${sim.port}` : `src port ${sp} → dst port ${sim.port}`;
  if (s.layer === 'net') {
    const base = z ? `源 IP ${ADDR.A.ip} → 目的 IP ${ADDR.B.ip}，协议 ${sim.trans === 'tcp' ? 6 : 17}` : `src ${ADDR.A.ip} → dst ${ADDR.B.ip}, proto ${sim.trans === 'tcp' ? 6 : 17}`;
    if (s.route) return base + (z ? '，TTL 64 → 63，重算首部校验和' : ', TTL 64 → 63, new checksum');
    return base + `，TTL ${s.ttl}`;
  }
  if (s.layer === 'link') {
    if (s.link === 'ppp') return z ? 'PPP：标志 7E · 地址 FF · 控制 03 · 协议 0021（IP）' : 'PPP: flag 7E · addr FF · ctrl 03 · proto 0021 (IP)';
    const [a, b] = s.at === 'A' || (s.at === 'R' && s.dir === 'up') ? [ADDR.A.mac, ADDR.R1.mac] : [ADDR.R2.mac, ADDR.B.mac];
    return (z ? `源 MAC ${a} → 目的 MAC ${b}，类型 0x0800` : `src MAC ${a} → dst MAC ${b}, type 0x0800`) + (s.pad ? (z ? `，填充 ${s.pad} 字节` : `, ${s.pad} B pad`) : '');
  }
  if (s.layer === 'phy') return z ? `线路上 ${s.total} 字节 = ${s.total * 8} 比特` : `${s.total} B = ${s.total * 8} bits on the wire`;
  return null;
}

function build(p, kit, ERR) {
  const sim = encap(p);
  const lesson = shell('encap', kit, ERR, sim, {
    where: W,
    tag: T('封装', 'Encap'),
    name: T('逐层封装：数据怎样穿过各层', 'Encapsulation through the layers'),
    full: T('网络的组成与分类 · 协议、服务、接口 · PDU 与 SDU · OSI 与 TCP/IP · 逐层封装与拆封 · 路由器只到网络层 · 首部开销', 'Network structure · protocols, services, interfaces · PDUs · OSI and TCP/IP · encapsulation · routers stop at layer 3 · overhead'),
    title: SPEC.presets.find((x) => x.set.app === p.app && x.set.n === p.n && x.set.link2 === p.link2)?.label ?? T('逐层封装', 'Encapsulation'),
    legend: [['amber', T('这一层加上的', 'Added here')], ['rose', T('这一层拆掉的', 'Removed here')]],
    principle: PRINCIPLE,
    desc: T('一份应用数据从主机 A 出发：每往下一层就加一个首部，到物理层变成比特；路由器只拆到网络层，看 IP 地址决定往哪转，再换上新的链路层首部；到了主机 B 再一层层拆开，交给对应的进程。底下的横条就是每一刻的 PDU。', 'Data goes down A’s stack gaining headers, the router opens it only to layer 3 and re-frames it, and B unwraps it layer by layer.'),
    rect: [0, 60, 1000, 580],
  });
  if (!sim.ok) return lesson;
  const tname = sim.trans === 'tcp' ? 'TCP' : 'UDP';
  const list = sim.steps.map((s, k) => {
    const L = LNAME[s.li];
    const where = s.at === 'R' ? T('路由器', 'router') : T(`主机 ${s.at}`, `host ${s.at}`);
    let d;
    const key = `${s.at}-${s.layer}-${s.dir}`;
    if (key === 'A-app-down') d = [T(`A 的应用层：${sim.n} 字节的 ${sim.app.toUpperCase()} 报文`, `A: ${sim.n} B ${sim.app.toUpperCase()} message`), T(`应用进程把 ${sim.n} 字节的数据交给传输层，告诉它发往 ${ADDR.B.ip} 的 ${sim.port} 端口。`, `The process hands ${sim.n} bytes to the transport layer for ${ADDR.B.ip}:${sim.port}.`), 'layers'];
    else if (key === 'A-trans-down') d = [T(`加 ${tname} 首部 ${HDR[sim.trans]} 字节`, `Add the ${tname} header`), T(`${tname} 把整个报文当作数据，前面加上 ${HDR[sim.trans]} 字节的首部（源端口、目的端口${sim.trans === 'tcp' ? '、序号、确认号、窗口……' : '、长度、校验和'}），成为 ${sim.trans === 'tcp' ? 'TCP 报文段' : 'UDP 用户数据报'}，共 ${s.total} 字节。`, `${tname} adds ${HDR[sim.trans]} B: ${s.total} B.`), 'pdu'];
    else if (key === 'A-net-down') d = [T(`加 IP 首部 20 字节`, 'Add the IP header'), T(`IP 加上 20 字节首部（源、目的 IP 地址，TTL = 64，协议字段 ${sim.trans === 'tcp' ? 6 : 17} 表示上面是 ${tname}），成为 IP 数据报，共 ${s.total} 字节。目的地不在本网络，下一跳是网关 ${ADDR.R1.ip}。`, `IP adds 20 B: ${s.total} B. Next hop: the gateway.`), 'osi'];
    else if (key === 'A-link-down') d = [T('封装成以太网帧', 'Frame it for Ethernet'), T(`加以太网首部 14 字节（目的 MAC 是网关 ${ADDR.R1.mac}，用 ARP 查到）和尾部 FCS 4 字节${s.pad ? `；IP 数据报只有 ${sim.ipLen} 字节，不够 46 字节，填充 ${s.pad} 字节` : ''}。帧长 ${s.total} 字节。`, `Ethernet header 14 B + FCS 4 B${s.pad ? ` + ${s.pad} B pad` : ''}: ${s.total} B frame.`), 'pdu'];
    else if (key === 'A-phy-down') d = [T('变成比特发出去', 'Send the bits'), T(`物理层加 8 字节前导码和帧开始定界符，把 ${s.total} 字节 = ${s.total * 8} 比特编码成信号送上线路。`, `Preamble 8 B: ${s.total * 8} bits on the wire.`), 'osi'];
    else if (key === 'R-phy-up') d = [T('路由器收到比特', 'The router receives the bits'), T('接口的物理层收下信号，去掉前导码，还原出一个帧交给链路层。', 'The physical layer strips the preamble.'), 'osi'];
    else if (key === 'R-link-up') d = [T('检查 FCS，拆掉以太网首部', 'Check FCS, remove the Ethernet header'), T(`目的 MAC 是自己 ${ADDR.R1.mac}，FCS 校验正确，拆掉首部和尾部${s.pad ? '（连同填充）' : ''}，把 IP 数据报交给网络层。`, 'The frame is for this interface and intact; the packet goes up.'), 'layers'];
    else if (key === 'R-net-up') d = [T('网络层：查转发表', 'Network layer: forward'), T(`看目的 IP ${ADDR.B.ip}，查转发表：10.0.2.0/24 是直连网络，从接口 2 发出。TTL 64 → 63，IP 首部变了，所以重算首部校验和。路由器到此为止，不看 ${tname} 首部和数据。`, `Lookup: 10.0.2.0/24 is direct. TTL 64 → 63, checksum recomputed. The router stops at layer 3.`), 'pitfall'];
    else if (key === 'R-link-down') d = sim.link2 === 'eth' ? [T('换上新的以太网首部', 'A new Ethernet header'), T(`新的帧：源 MAC 是路由器接口 2 的 ${ADDR.R2.mac}，目的 MAC 是 B 的 ${ADDR.B.mac}。IP 地址没变，MAC 地址每一跳都换。`, 'New MACs for this hop; IP addresses unchanged.'), 'pitfall'] : [T('封装成 PPP 帧', 'Frame it for PPP'), T(`这条链路是 PPP：加首部 5 字节（标志、地址、控制、协议）和尾部 3 字节（FCS 2、标志 1），帧长 ${s.total} 字节。点对点链路上没有 MAC 地址，也不用填充。`, `PPP adds 8 B: ${s.total} B, no MACs, no padding.`), 'pitfall'];
    else if (key === 'R-phy-down') d = [T('再变成比特发出', 'Out as bits again'), T(`${s.total} 字节 = ${s.total * 8} 比特送上第二段线路。`, `${s.total * 8} bits on the second link.`), 'osi'];
    else if (key === 'B-phy-up') d = [T('B 收到比特', 'B receives the bits'), T('物理层还原出帧。', 'The physical layer recovers the frame.'), 'osi'];
    else if (key === 'B-link-up') d = [T('链路层拆帧', 'Unframe'), T('校验 FCS，拆掉链路层首部和尾部，IP 数据报交给网络层。', 'Check FCS and strip the link header and trailer.'), 'layers'];
    else if (key === 'B-net-up') d = [T('网络层：是给我的', 'Network layer: for me'), T(`目的 IP 是自己的地址，拆掉 IP 首部，看协议字段 ${sim.trans === 'tcp' ? 6 : 17} 把数据交给 ${tname}。`, `Destination is B; protocol ${sim.trans === 'tcp' ? 6 : 17} → ${tname}.`), 'layers'];
    else if (key === 'B-trans-up') d = [T(`传输层：按端口 ${sim.port} 交给进程`, `Transport: port ${sim.port}`), T(`拆掉 ${tname} 首部，按目的端口 ${sim.port} 找到${sim.app === 'http' ? ' Web 服务器' : ' DNS 服务器'}进程（分用）。`, `Demultiplex by port ${sim.port}.`), 'layers'];
    else d = [T(`应用层收到 ${sim.n} 字节`, `The application gets ${sim.n} B`), T(`服务器进程拿到的正是 A 发的那 ${sim.n} 字节，各层首部都已经拆掉了。`, `Exactly the ${sim.n} bytes A sent.`), 'layers'];
    return { title: d[0], desc: T(`${where.zh} · ${L.zh}`, `${where.en} · ${L.en}`), detail: d[1], ref: d[2], st: { k }, row: { color: s.dir === 'down' ? 'amber' : 'blue', what: d[0], result: T(`${s.total} 字节`, `${s.total} B`), tone: 'info' } };
  });
  const title = T(`第一段线路上 ${sim.wire1} 字节，有用数据占 ${(sim.eff1 * 100).toFixed(1)}%`, `${sim.wire1} B on the first link: ${(sim.eff1 * 100).toFixed(1)}% useful`);
  const text = T(
    `${sim.n} 字节数据 + ${tname} ${HDR[sim.trans]} + IP 20 + 以太网 18${sim.pad ? ` + 填充 ${sim.pad}` : ''} + 前导码 8 = ${sim.wire1} 字节。${sim.link2 === 'ppp' ? `第二段走 PPP，帧长 ${sim.wire2} 字节，效率 ${(sim.eff2 * 100).toFixed(1)}%。` : ''}`,
    `${sim.wire1} B on the wire.${sim.link2 === 'ppp' ? ` PPP link: ${sim.wire2} B.` : ''}`,
  );
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeEncap = make('encap', SPEC, ERR, build);
