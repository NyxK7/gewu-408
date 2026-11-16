// 「路由器转发：最长前缀匹配」：左边是转发表，右边把目的地址和每一行的网络前缀逐位写成二进制对齐，
// 前缀长度以内全相同就算匹配，匹配的行里挑最长的。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { bits32, intToIp, lpm, maskOf } from './lpm.js';

// 组播 MAC 的例子由代码算：IP 的低 23 位接在 01-00-5E 后面
const MC = (() => {
  const ip = [230, 65, 130, 9];
  const low = [ip[1] & 0x7f, ip[2], ip[3]];
  const hx = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  return { ip: ip.join('.'), low: low.map(hx).join('-'), mac: ['01', '00', '5E', ...low.map(hx)].join('-') };
})();

const TABLE = '172.16.0.0/16 接口0\n172.16.128.0/17 接口1\n172.16.160.0/19 R2\n172.16.168.0/21 R3\n0.0.0.0/0 R4';
const SPEC = {
  presets: [
    { label: T('一层套一层的前缀', 'Nested prefixes'), set: { table: TABLE, dests: '172.16.170.5 172.16.150.1 172.16.33.7 10.0.0.1' } },
    { label: T('子网与聚合路由', 'Subnets and an aggregate'), set: { table: '192.168.0.0/22 R1\n192.168.2.0/24 R2\n192.168.2.128/25 接口1\n0.0.0.0/0 R3', dests: '192.168.2.200 192.168.2.7 192.168.3.1 192.168.4.1' } },
    { label: T('没有默认路由', 'No default route'), set: { table: '10.1.0.0/16 接口0\n10.1.64.0/18 接口1', dests: '10.1.100.1 10.2.0.1' } },
  ],
  groups: [
    {
      legend: T('转发表', 'Forwarding table'),
      fields: [
        { name: 'table', label: T('每行「网络前缀/长度 下一跳」，默认路由写 0.0.0.0/0', 'One per line: "prefix/len next-hop"; default is 0.0.0.0/0'), type: 'text', wide: true, multiline: true },
        { name: 'dests', label: T('要转发的目的地址（空格隔开，最多 6 个）', 'Destination addresses (up to 6)'), type: 'text', wide: true },
      ],
    },
  ],
  note: T(
    '目的地址和某一行的高「前缀长度」位完全相同就算匹配。几行都匹配时选前缀最长的那一行（最具体的路由）。默认路由 0.0.0.0/0 的前缀长度为 0，和任何地址都匹配，但最短，只有别的都不匹配时才用它。',
    'A destination matches a row when its top “length” bits equal the prefix. Among matches the longest prefix (the most specific route) wins. The default route 0.0.0.0/0 matches everything but is the shortest, so it is used only when nothing else matches.',
  ),
};
const ERR = {
  row: T('这一行看不懂：{r}', 'Cannot read this row: {r}'),
  hostBits: T('这一行的网络前缀主机位不是 0：{r}', 'This prefix has host bits set: {r}'),
  count: T('转发表要有 1～10 行', 'Give 1–10 rows'),
  dests: T('目的地址要有 1～6 个', 'Give 1–6 addresses'),
  dest: T('不是合法的 IPv4 地址：{d}', 'Not an IPv4 address: {d}'),
};

// ───── 画板 ─────
const TX = 30;
const BX = 380;
const BW = 13;
const RH = 38;
const DY = 108;
const RY = 196;
const bx = (i) => BX + i * BW + Math.floor(i / 8) * 8;

function bitRow(b, len, same, hit, stage) {
  let h = '';
  for (let i = 0; i < 32; i++) {
    const inside = i < len;
    let cls = 'dim';
    let tone = '';
    if (inside && stage >= 1) {
      if (i < same) tone = 'green';
      else if (i === same && !hit) cls = 'bad';
      else cls = '';
    } else if (inside) cls = '';
    h += `<g transform="translate(${bx(i) - BX} 0)">${cell(BW - 2, 24, inside ? b[i] : '·', { cls, tone, size: 11 })}</g>`;
  }
  return h;
}

function board(sim, st, z) {
  const items = [];
  const d = st.d != null ? sim.dests[st.d] : null;
  // 表头
  items.push({ k: 'head', x: 0, y: RY - 18, html: txt(TX, 0, z ? '目的网络' : 'Prefix', 'bt-cap', 'start') + txt(TX + 190, 0, z ? '下一跳' : 'Next hop', 'bt-cap', 'start') + txt(BX, 0, z ? '网络前缀（二进制，前缀长度以内）' : 'Prefix bits (within the length)', 'bt-cap', 'start') });
  sim.rows.forEach((r, i) => {
    const c = d?.checks[i];
    const stage = d ? st.phase : 0;
    const best = d && st.phase >= 2 && d.best === i;
    const markCls = !c || stage < 1 ? '' : c.hit ? (best ? 'hot' : 'ok') : 'dim';
    let h = `<g transform="translate(${TX} 0)">${cell(180, 28, r.text, { cls: markCls, size: 13, anchor: 'start' })}</g>`;
    h += `<g transform="translate(${TX + 186} 0)">${cell(92, 28, r.hop, { cls: best ? 'hot' : '', size: 13 })}</g>`;
    if (c && stage >= 1) h += txt(TX + 296, 19, c.hit ? '✓' : '✗', `bt-mark ${c.hit ? 'ok' : 'bad'}`);
    h += `<g transform="translate(${BX} 2)">${bitRow(bits32(r.net), r.len, c ? c.same : 0, c ? c.hit : false, stage)}</g>`;
    h += txt(bx(31) + BW + 10, 19, `/${r.len}`, best ? 'bt-acc' : 'bt-lab', 'start');
    items.push({ k: `r${i}`, x: 0, y: RY + i * RH, cls: best ? 'is-cur' : '', html: h });
  });
  // 目的地址
  if (d) {
    let h = txt(TX, 18, z ? `目的地址 ${d.text}` : `Destination ${d.text}`, 'lp-dest', 'start');
    h += `<g transform="translate(${BX} 0)">`;
    const b = bits32(d.ip);
    for (let i = 0; i < 32; i++) h += `<g transform="translate(${bx(i) - BX} 0)">${cell(BW - 2, 24, b[i], { tone: 'blue', size: 11 })}</g>`;
    h += '</g>';
    for (let o = 0; o < 4; o++) h += txt(bx(o * 8) + 4 * BW - 1, -8, String((d.ip >>> (24 - o * 8)) & 255), 'bt-idx');
    items.push({ k: 'dest', x: 0, y: DY, html: h });
  }
  // 结果
  if (d && st.phase >= 2) {
    const y = RY + sim.rows.length * RH + 20;
    const t = d.best == null ? (z ? '一行也不匹配：丢弃，发回 ICMP 终点不可达' : 'No match: drop, send ICMP destination unreachable') : z ? `最长的是 ${sim.rows[d.best].text}（/${sim.rows[d.best].len}）→ 从「${d.hop}」转发` : `Longest is ${sim.rows[d.best].text} → forward via ${d.hop}`;
    items.push({ k: 'res', x: TX, y, html: txt(0, 0, t, `lp-res ${d.best == null ? 'bad' : ''}`, 'start') });
  }
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'cidr',
      title: T('CIDR：网络前缀', 'CIDR prefixes'),
      blocks: [
        { p: T('CIDR（无分类编址）不再按 A、B、C 类划分，而是把 IP 地址分成**网络前缀**和**主机号**两部分，写成 a.b.c.d/n，n 是网络前缀的位数。前缀相同的一组地址叫一个 **CIDR 地址块**，它对应的掩码是前 n 位为 1、其余为 0。', 'CIDR drops address classes: an address splits into an n-bit **network prefix** and a host part, written a.b.c.d/n. Addresses sharing a prefix form a **CIDR block**, whose mask has n leading ones.') },
        { p: T('一个大的地址块可以包含若干小的地址块。比如 172.16.0.0/16 包含 172.16.128.0/17，后者又包含 172.16.160.0/19。小块的前缀更长，范围更小，也就更「具体」。', 'Large blocks contain smaller ones: 172.16.0.0/16 contains 172.16.128.0/17, which contains 172.16.160.0/19. Longer prefixes are smaller and more specific.') },
      ],
    },
    {
      id: 'match',
      title: T('怎么判断匹配', 'Checking a match'),
      blocks: [
        { formula: T('目的地址 AND 掩码 = 网络前缀  ⇔  匹配', 'destination AND mask = prefix  ⇔  match') },
        { p: T('等价的说法：把目的地址和网络前缀都写成二进制，看前 n 位是否完全相同。考试时只需要把「前缀长度落在的那个字节」写成二进制比较，前面整字节直接比十进制就行。', 'Equivalently, compare the first n bits in binary. In practice only the byte where the prefix ends needs binary; whole bytes before it compare in decimal.') },
        { tip: T('例：172.16.170.5 和 172.16.160.0/19。/19 落在第三个字节的前 3 位：170 = 101 01010，160 = 101 00000，前 3 位都是 101，匹配。', 'Example: 172.16.170.5 vs 172.16.160.0/19. The /19 ends 3 bits into byte three: 170 = 101 01010, 160 = 101 00000 — the same 101, a match.') },
      ],
    },
    {
      id: 'longest',
      title: T('最长前缀匹配', 'Longest prefix match'),
      blocks: [
        { p: T('一个目的地址可能同时匹配好几行（因为大块包含小块）。路由器选**前缀最长**的那一行，因为它描述的范围最小、最精确。这就是**最长前缀匹配**。', 'An address may match several rows because blocks nest. The router picks the **longest prefix**, the most specific route.') },
        {
          list: [
            T('**默认路由** 0.0.0.0/0：前缀长度为 0，和所有地址都匹配，但它最短，只有别的都不匹配时才会被选中。', '**Default route** 0.0.0.0/0 matches everything but is the shortest, so it wins only when nothing else matches.'),
            T('**特定主机路由**：前缀长度 32，只匹配一个地址，是最长的。', '**Host route**: /32 matches one address and beats everything.'),
            T('一行也不匹配又没有默认路由：丢弃分组，向源主机发 ICMP 终点不可达。', 'No match and no default: drop and send ICMP destination unreachable.'),
          ],
        },
      ],
    },
    {
      id: 'agg',
      title: T('路由聚合', 'Route aggregation'),
      blocks: [
        { p: T('如果几个网络的下一跳相同，而且它们合起来正好是一个更大的 CIDR 地址块，就可以用一行（更短的前缀）代替它们，转发表更小，这叫**路由聚合**（构成超网）。', 'Networks with the same next hop that together form a larger block can be replaced by one shorter-prefix row: **route aggregation** (supernetting).') },
        { p: T('求聚合后的前缀：把这几个网络地址写成二进制，找出它们从高位起**共同的位**，共同位数就是聚合后的前缀长度。例：192.168.0.0/24 ～ 192.168.3.0/24 第三字节是 000000 00 ～ 000000 11，共同前 22 位，聚合成 192.168.0.0/22。', 'To aggregate, write the networks in binary and count their **common leading bits**: 192.168.0.0/24 to 192.168.3.0/24 share 22 bits, giving 192.168.0.0/22.') },
        { warn: T('聚合后的大块里如果有一部分其实要走别的路，就再单独加一条更长前缀的路由——最长前缀匹配会让它优先。', 'If part of the aggregate goes elsewhere, add a longer-prefix row for it; longest-prefix matching gives it priority.') },
      ],
    },
    {
      id: 'forward',
      title: T('路由器转发分组的过程', 'How a router forwards'),
      blocks: [
        {
          steps: [
            T('从收到的分组首部取出目的 IP 地址；', 'take the destination address from the header;'),
            T('用最长前缀匹配查转发表，得到下一跳（或直接交付的接口）；', 'look it up by longest prefix match to get the next hop or interface;'),
            T('若下一跳是路由器，用 ARP 查出它的 MAC 地址，把分组封装成帧从对应接口发出；若目的网络就在这个接口上，直接交付给目的主机；', 'if the next hop is a router, ARP for its MAC and send the frame; if the network is directly attached, deliver to the host;'),
            T('TTL 减 1（减到 0 就丢弃并发 ICMP 时间超过），重新计算首部检验和。', 'decrement TTL (drop at 0 with ICMP time exceeded) and recompute the header checksum.'),
          ],
        },
        { tip: T('转发表只写「到哪个网络、下一跳是谁」，不写完整路径；IP 分组每到一个路由器都重新查一次表。', 'The table lists only network and next hop, never the full path; each router looks up afresh.') },
      ],
    },
    {
      id: 'sdn',
      title: T('路由器的结构与 SDN', 'Router architecture and SDN'),
      blocks: [
        { p: T('路由器分成两部分：**控制平面**（路由选择部分）运行 RIP、OSPF、BGP 等路由协议，算出路由表；**数据平面**（分组转发部分）按转发表把分组从输入端口经交换结构送到输出端口。路由表是算出来的「全局视图」，转发表是从它导出、供快速查找用的。', 'A router has a **control plane** that runs routing protocols to build the routing table, and a **data plane** that forwards packets from input ports through the switch fabric to output ports using the forwarding table.') },
        { list: [
          T('**输入端口**：物理层收比特、链路层拆帧，再按目的地址查转发表；分组来得太快时要在输入端口排队。', '**Input ports** receive, decapsulate and look up the forwarding table; packets may queue here.'),
          T('**交换结构**：把分组从输入端口交换到输出端口（经内存、经总线、经互联网络三种方式）。', '**Switch fabric**: via memory, a bus or an interconnection network.'),
          T('**输出端口**：缓存、封装成帧发出；交换结构送来的速度超过链路速率时在这里排队，缓存满了就丢分组。', '**Output ports** buffer and transmit; full buffers drop packets.'),
        ] },
        { p: T('**软件定义网络（SDN）**把控制平面从每台路由器里拿出来，集中到一个远程的**控制器**上：控制器掌握全网视图，算出每台设备该怎么转发，把规则下发给交换机；交换机只做数据平面的事——按**流表**匹配分组首部的若干字段（不只是目的 IP），执行对应的动作（转发到某端口、丢弃、修改首部等）。', '**SDN** moves the control plane to a remote **controller** that computes and installs rules; switches only forward, matching packets against a **flow table** (many header fields, not just the destination) and applying actions.') },
        {
          table: {
            head: ['', T('传统路由器', 'Traditional router'), T('SDN', 'SDN')],
            rows: [
              [T('控制平面在哪', 'Control plane'), T('每台路由器各自运行路由协议', 'in every router'), T('集中在远程控制器', 'centralised in a controller')],
              [T('转发依据', 'Forwarding by'), T('目的 IP 地址（最长前缀匹配）', 'destination IP (longest prefix)'), T('流表：多个首部字段匹配 + 动作', 'flow table: match fields + actions')],
              [T('改变网络行为', 'Changing behaviour'), T('逐台配置设备', 'configure each device'), T('在控制器上编程', 'program the controller')],
            ],
          },
        },
        { tip: T('控制器和交换机之间的接口叫**南向接口**（如 OpenFlow 协议）；控制器向上给网络应用提供的接口叫**北向接口**。', 'The controller–switch interface is **southbound** (e.g. OpenFlow); the interface to network applications is **northbound**.') },
      ],
    },
    {
      id: 'cong',
      title: T('网络层的拥塞控制', 'Congestion control at the network layer'),
      blocks: [
        { p: T('**拥塞**：某段时间里对网络中某一资源（链路带宽、路由器缓存、处理机）的需求超过了它能提供的量，网络性能随之变坏。拥塞严重时，网络吞吐量不升反降，甚至降到 0（**死锁**）。', '**Congestion**: demand for some resource exceeds what it can supply; throughput falls and can collapse to zero (**deadlock**).') },
        { list: [
          T('**拥塞控制**是全局性的：防止过多数据注入网络，让路由器和链路不过载，涉及所有主机和路由器。**流量控制**是点对点的：只管发送方别比接收方快。两者都可能让发送方减速，但目的不同。', '**Congestion control** is global (keep the network from overloading); **flow control** is end-to-end (keep the sender from swamping the receiver).'),
          T('**开环控制**：在设计网络时就事先考虑可能引起拥塞的因素，力求运行时不出现拥塞，一旦运行就不再动态调整。', '**Open loop**: design to avoid congestion; no adjustment while running.'),
          T('**闭环控制**：基于反馈——监测网络发现何时何处拥塞，把拥塞信息传给能采取行动的地方，再调整系统运行（例如让源端降低发送速率、路由器丢弃分组）。', '**Closed loop**: monitor, report congestion to those who can act, then adjust (sources slow down, routers drop packets).'),
        ] },
        { warn: T('IP 只提供尽最大努力交付，网络层本身不保证不拥塞；因特网里真正的拥塞控制主要靠传输层的 TCP（见「TCP 拥塞控制」那节课），路由器的作用是排队和在缓存满时丢弃分组。', 'IP is best effort; in the Internet, TCP does most congestion control while routers queue and drop.') },
      ],
    },
    {
      id: 'mcast',
      title: T('IP 组播', 'IP multicast'),
      blocks: [
        { p: T('**组播**：一个源把同一份数据发给一组接收者。源只发一份，到了需要分岔的路由器才复制，比对每个接收者各发一份（单播）省带宽得多。', '**Multicast** sends one copy that routers duplicate only where paths branch.') },
        { list: [
          T('组播地址是 **D 类地址** 224.0.0.0～239.255.255.255，只能作目的地址；组播数据报用 UDP 尽最大努力交付，不产生 ICMP 差错报文。', 'Class **D** addresses 224.0.0.0–239.255.255.255, destination only; best effort over UDP.'),
          T('**IGMP**（网际组管理协议）：主机用它告诉本地的组播路由器自己加入了哪个组；路由器周期性地询问组成员是否还在。', '**IGMP** lets hosts tell the local router which groups they joined.'),
          T('组播路由协议在路由器之间建组播转发树（如基于源树、共享树）。', 'Multicast routing protocols build delivery trees between routers.'),
        ] },
        { formula: T(`以太网组播 MAC 地址 = 01-00-5E + IP 地址的低 23 位。例：${MC.ip} 的低 23 位是 ${MC.low}，对应 ${MC.mac}。`, `Multicast MAC = 01-00-5E + the low 23 bits: ${MC.ip} → ${MC.mac}.`) },
        { warn: T('D 类地址有 28 位可变，映射时丢掉了高 5 位，所以 2⁵ = 32 个组播 IP 地址对应同一个 MAC 地址；主机收到后还要在 IP 层再过滤一次。', '28 variable bits but only 23 mapped: 32 groups share each MAC, so IP must filter again.') },
      ],
    },
    {
      id: 'mobile',
      title: T('移动 IP', 'Mobile IP'),
      blocks: [
        { p: T('移动主机换到别的网络以后，IP 地址最好不变（不然正在进行的 TCP 连接就断了）。**移动 IP** 让它一直使用原来的**永久地址**，靠两个代理把分组转过去。', '**Mobile IP** lets a host keep its **permanent address** after moving, with two agents relaying its packets.') },
        { list: [
          T('**归属网络、归属代理**：移动主机原来所在的网络和那里的一个路由器（本地代理）。**外地网络、外地代理**：移动主机现在所在的网络和那里的代理。', '**Home network / home agent** where the host belongs; **foreign network / foreign agent** where it is now.'),
          T('移动主机到了外地网络，先向外地代理登记，拿到一个**转交地址**（care-of address，通常就是外地代理的地址），再通过外地代理向归属代理登记。', 'In a foreign network the host registers with the foreign agent, gets a **care-of address**, and registers it with the home agent.'),
          T('通信过程：别的主机照常把分组发往移动主机的永久地址 → 归属代理截获，封装后发到转交地址（隧道）→ 外地代理拆封后交给移动主机。移动主机发出的分组可以直接用永久地址作源地址发给对方，不必绕回归属代理，所以路径是个「三角形」。', 'Packets to the permanent address are intercepted by the home agent and tunnelled to the care-of address; replies go directly: **triangle routing**.'),
        ] },
        { tip: T('移动 IP 解决的是「地址不变」，不是无线接入本身；在同一个网络里移动（比如同一 Wi-Fi 下换位置）用不到它。', 'Mobile IP keeps the address unchanged; moving within one network does not need it.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('几行都匹配时选**最长**的，不是表里的第一行。', 'Choose the **longest** match, not the first row.'),
            T('只比前缀长度以内的位，后面的主机位不用看。', 'Compare only bits within the prefix length.'),
            T('默认路由也是匹配的，但最短；有它就不会丢弃。', 'The default route always matches but is shortest.'),
            T('聚合时找的是共同前缀的位数，不是简单地把掩码改短。', 'Aggregation counts common leading bits.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('转发', 'Forwarding') });

function build(params) {
  const sim = lpm({ table: params.table, dests: params.dests });
  const lesson = {
    id: 'lpm',
    kit,
    where: [['net', 'network']],
    tag: T('转发', 'LPM'),
    name: T('路由器转发：最长前缀匹配', 'Forwarding: longest prefix match'),
    full: T('CIDR · 前缀与掩码 · 最长前缀匹配 · 默认路由 · 路由聚合', 'CIDR · prefixes · longest prefix match · default route · aggregation'),
    title: sim.ok ? T(`转发表 ${sim.rows.length} 行`, `${sim.rows.length} routes`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['blue', T('目的地址', 'Destination')],
      ['green', T('相同的位', 'Matching bits')],
      ['rose', T('第一个不同的位', 'First mismatch')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '路由器收到分组，要用目的地址去查转发表。一个地址可能同时落在好几个地址块里，这时选前缀最长的那一行。这节课把目的地址和每一行的网络前缀都写成二进制对齐，一位一位比，相同的标绿，第一个不同的位标红。',
        'A router looks up the destination in its forwarding table. Because blocks nest, several rows may match; the longest prefix wins. Each prefix is written in binary under the destination, matching bits in green and the first mismatch in red.',
      ),
      facts: sim.ok ? [[T('转发表', 'Table'), T(`${sim.rows.length} 行`, `${sim.rows.length} rows`)], [T('目的地址', 'Destinations'), sim.dests.map((d) => d.text).join('  ')]] : [],
    },
    start: { nodes: [], frame: { rect: [10, 40, bx(31) + 70, RY + (sim.ok ? sim.rows.length : 4) * RH + 50] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [];
  sim.dests.forEach((d, di) => {
    const lines = d.checks.map((c) => {
      const r = sim.rows[c.i];
      const mask = intToIp(maskOf(r.len));
      return { zh: `${r.text}：${d.text} AND ${mask} = ${intToIp((d.ip & maskOf(r.len)) >>> 0)}，${c.hit ? '相同，匹配' : `第 ${c.same + 1} 位不同，不匹配`}`, en: `${r.text}: ${d.text} AND ${mask} = ${intToIp((d.ip & maskOf(r.len)) >>> 0)}, ${c.hit ? 'match' : `differs at bit ${c.same + 1}`}` };
    });
    list.push({
      title: T(`${d.text}：逐行比对`, `${d.text}: compare each row`),
      desc: T(`匹配 ${d.hits.length} 行`, `${d.hits.length} match`),
      detail: { zh: lines.map((l) => l.zh).join('；') + '。', en: lines.map((l) => l.en).join('; ') + '.' },
      ref: 'match',
      st: { d: di, phase: 1 },
      row: { color: 'blue', what: T(`比对 ${d.text}`, `Compare ${d.text}`), result: T(`${d.hits.length} 行匹配`, `${d.hits.length} match`), tone: 'info' },
    });
    const best = d.best == null ? null : sim.rows[d.best];
    list.push({
      title: best ? T(`${d.text} → ${d.hop}`, `${d.text} → ${d.hop}`) : T(`${d.text}：丢弃`, `${d.text}: dropped`),
      desc: best ? T(`最长前缀 /${best.len}`, `Longest /${best.len}`) : T('没有匹配的路由', 'No route'),
      detail: best
        ? T(`匹配的有 ${d.hits.map((i) => `/${sim.rows[i].len}`).join('、')}，最长的是 ${best.text}，从「${d.hop}」转发。${d.hits.length > 1 ? '它比其他匹配的行范围更小、更具体。' : ''}`, `Matches: ${d.hits.map((i) => `/${sim.rows[i].len}`).join(', ')}. The longest is ${best.text}; forward via ${d.hop}.`)
        : T('一行也不匹配，转发表里也没有默认路由。路由器丢弃这个分组，并向源主机发 ICMP 终点不可达报文。', 'No row matches and there is no default route: the router drops the packet and sends ICMP destination unreachable.'),
      ref: best ? 'longest' : 'longest',
      st: { d: di, phase: 2 },
      row: { color: best ? 'green' : 'rose', what: T(`转发 ${d.text}`, `Forward ${d.text}`), result: best ? d.hop : T('丢弃', 'drop'), tone: best ? 'ok' : 'warn' },
    });
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: T('转发完成', 'All forwarded'),
    text: T('在转发表里加一行更长的前缀（比如某个 /32 主机路由），看它怎么「抢走」原来的匹配。', 'Add a longer prefix (say a /32 host route) and watch it take over.'),
    facts: sim.dests.map((d) => [d.text, d.hop ?? T('丢弃', 'drop')]),
  };
  return lesson;
}

export const makeLpm = () => parametric('lpm', SPEC.presets[0].set, build);
