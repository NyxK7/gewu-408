// 「交换机自学习与 VLAN」：上面一台 4 口交换机，下面挂着主机（4 口经集线器接 D、E）；右边是转发表。
// 每个帧：先把源 MAC 记进表，再按目的 MAC 决定转发、泛洪还是丢弃。打开 VLAN 后，泛洪只到同一 VLAN 的端口。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { HOSTS, PORTS, learnSwitch, vlanOf } from './switch.js';

const W = [['net', 'link']];
const PX = (p) => 150 + (p - 1) * 140;
const SY = 130; // 交换机顶
const PY = 200; // 端口
const HY = 300; // 主机
const HUBY = 280;
const DY = 380;
const TX = 740;
const HP = {
  A: { x: PX(1) + 20, y: HY },
  B: { x: PX(2) + 20, y: HY },
  C: { x: PX(3) + 20, y: HY },
  D: { x: PX(4) - 30, y: DY },
  E: { x: PX(4) + 70, y: DY },
};
const VT = { 10: 'blue', 20: 'violet', 1: '' };

const PRINCIPLE = {
  sections: [
    {
      id: 'learn',
      title: T('交换机怎样学会转发', 'How a switch learns'),
      blocks: [
        { p: T('交换机（多端口网桥）工作在数据链路层，按**转发表**（MAC 地址表）转发帧。表一开始是空的，靠「看来往的帧」自己学：', 'A switch forwards frames with a **MAC table** that it learns from traffic:') },
        { steps: [
          T('**学源地址**：帧从哪个端口进来，就记下「源 MAC → 这个端口」（已有就更新时间）；', '**Learn the source**: record source MAC → incoming port;'),
          T('**查目的地址**：广播地址，或者表里没有 → 从除进来的端口以外的所有端口发出（**泛洪**）；', '**Look up the destination**: broadcast or unknown → **flood** to all other ports;'),
          T('查到了，且在别的端口 → 只从那个端口**转发**；', 'known on another port → **forward** there only;'),
          T('查到了，正好就是进来的端口 → **丢弃**（对方已经在同一个网段上收到了）。', 'known on the incoming port → **filter** (drop).'),
        ] },
        { tip: T('表项有**老化时间**：一段时间没有再见到这个源地址就删掉，这样主机换了端口也能重新学到。', 'Entries **age out**, so moved hosts are relearned.') },
      ],
    },
    {
      id: 'domain',
      title: T('冲突域和广播域', 'Collision and broadcast domains'),
      blocks: [
        {
          table: {
            head: [T('设备', 'Device'), T('层次', 'Layer'), T('隔离冲突域', 'Splits collision domains'), T('隔离广播域', 'Splits broadcast domains')],
            rows: [
              [T('中继器、集线器', 'Repeater, hub'), T('物理层', 'Physical'), T('不能', 'no'), T('不能', 'no')],
              [T('网桥、交换机', 'Bridge, switch'), T('数据链路层', 'Link'), T('能：每个端口一个冲突域', 'yes: one per port'), T('不能（划分 VLAN 才能）', 'no (unless VLANs)')],
              [T('路由器', 'Router'), T('网络层', 'Network'), T('能', 'yes'), T('能', 'yes')],
            ],
          },
        },
        { p: T('图里 4 口经集线器接着 D、E，它们在同一个冲突域里：D 发的帧 E 直接就能收到，所以交换机见到「目的在进来的端口」就丢弃。', 'D and E share the hub: they form one collision domain, which is why the switch filters D → E.') },
        { list: [
          T('**存储转发**：收完整个帧、检查 CRC 再转发，能丢掉坏帧，时延大。', '**Store-and-forward**: receive and check the whole frame first.'),
          T('**直通**：收到目的地址（前 6 字节）就开始转发，时延小，但会把坏帧也转发出去。', '**Cut-through**: start once the destination is read; faster, forwards bad frames.'),
        ] },
        { warn: T('交换机各端口独享带宽：N 个 10Mb/s 端口的交换机，总容量是 N × 10Mb/s；集线器的所有端口共享 10Mb/s。', 'Switch ports each get full bandwidth; a hub’s ports share it.') },
      ],
    },
    {
      id: 'vlan',
      title: T('虚拟局域网 VLAN', 'VLANs'),
      blocks: [
        { p: T('VLAN 把一台（或几台）交换机上的端口按逻辑分组，每组是一个独立的**广播域**：广播和泛洪只在本 VLAN 里传。划分方式可以按端口、按 MAC 地址、按 IP 地址等。', 'A VLAN groups ports into a separate **broadcast domain**: broadcasts and floods stay inside it.') },
        { list: [
          T('IEEE 802.1Q 在以太网帧的源地址后面插入 4 字节标记，其中 12 位 VID 标明属于哪个 VLAN。', '802.1Q inserts a 4-byte tag with a 12-bit VLAN ID after the source address.'),
          T('交换机之间的干道（trunk）链路上传带标记的帧；交给主机前去掉标记。', 'Trunk links carry tagged frames; tags are removed toward hosts.'),
          T('不同 VLAN 的主机即使接在同一台交换机上，也不能直接在链路层通信，要经过路由器（或三层交换机）。', 'Different VLANs need a router (or layer-3 switch) to talk.'),
        ] },
      ],
    },
    {
      id: 'ether',
      title: T('以太网与 MAC 帧', 'Ethernet and the MAC frame'),
      blocks: [
        { p: T('**MAC 地址** 48 位，固化在网卡里，常写成 6 组十六进制数；全 1（FF-FF-FF-FF-FF-FF）是广播地址。', '**MAC addresses** are 48 bits; all ones is broadcast.') },
        {
          table: {
            head: [T('字段', 'Field'), T('长度', 'Size'), T('说明', 'Notes')],
            rows: [
              [T('前导码 + 帧开始定界符', 'Preamble + SFD'), '7 + 1 B', T('物理层加的，用来同步，不算帧长', 'added by the physical layer')],
              [T('目的地址', 'Destination'), '6 B', T('放在最前面，便于交换机尽早决定转发', 'first, for fast forwarding')],
              [T('源地址', 'Source'), '6 B', ''],
              [T('类型', 'Type'), '2 B', T('上层协议，0x0800 是 IPv4，0x0806 是 ARP', '0x0800 IPv4, 0x0806 ARP')],
              [T('数据', 'Data'), '46～1500 B', T('不足 46 字节要填充；1500 就是以太网的 MTU', 'padded to 46; 1500 is the MTU')],
              [T('FCS', 'FCS'), '4 B', T('CRC 校验', 'CRC')],
            ],
          },
        },
        { tip: T('所以以太网帧长 64～1518 字节。以太网提供的是**无连接、不可靠**的服务：收到错帧直接丢掉，不重传，重传交给上层。', 'Frames are 64–1518 bytes. Ethernet is **connectionless and unreliable**: bad frames are dropped.') },
        { p: T('常见标准：10BASE-T（10Mb/s，双绞线，星形，集线器）、100BASE-T 快速以太网、吉比特和 10 吉比特以太网（10 吉比特只工作在全双工，不再用 CSMA/CD）。', 'Standards: 10BASE-T, 100BASE-T, gigabit, 10-gigabit (full duplex only, no CSMA/CD).') },
      ],
    },
    pit([
      T('交换机学的是**源**地址，查的是**目的**地址。', 'Learn the **source**, look up the **destination**.'),
      T('目的地址查不到时泛洪，不是丢弃；泛洪和广播一样发到所有其他端口（同一 VLAN 内）。', 'Unknown destinations are flooded, not dropped.'),
      T('交换机隔离冲突域但不隔离广播域；隔离广播域靠路由器或 VLAN。', 'Switches split collision domains, not broadcast domains.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('表从空开始：学习、泛洪、转发', 'From an empty table'), set: { frames: 'A>B, B>A, C>A, A>FF, D>C, E>D, B>E', vlan: false, age: 0 } },
    { label: T('同一端口：丢弃', 'Same port: filtered'), set: { frames: 'D>E, E>D, D>E, A>D', vlan: false, age: 0 } },
    { label: T('划分 VLAN：1、2 口和 3、4 口', 'VLANs: ports 1–2 and 3–4'), set: { frames: 'A>B, B>A, A>FF, C>A, D>C, A>D', vlan: true, age: 0 } },
    { label: T('老化时间 3：表项过期后又泛洪', 'Aging 3: entries expire'), set: { frames: 'A>B, B>A, C>D, D>C, C>A, B>A', vlan: false, age: 3 } },
  ],
  groups: [{ legend: T('帧和交换机', 'Frames and switch'), fields: [
    { name: 'frames', label: T('依次发出的帧（源>目的，FF 为广播）', 'Frames in order (src>dst, FF = broadcast)'), type: 'text', parse: (s) => String(s).trim(), wide: true },
    { name: 'vlan', label: T('划分 VLAN（1、2 口 = VLAN 10，3、4 口 = VLAN 20）', 'VLANs (ports 1–2 = 10, 3–4 = 20)'), type: 'check' },
    { name: 'age', label: T('老化时间（帧数，0 = 不老化）', 'Aging time (frames, 0 = never)'), type: 'int', min: 0, max: 20 },
  ] }],
  note: T('A、B、C 接交换机 1～3 口，D、E 经集线器接 4 口。每个帧占一个时刻；主机名当作 MAC 地址。', 'A, B, C on ports 1–3; D and E on port 4 via a hub. One frame per time step.'),
};
const ERR = { frames: T('帧写成「A>B」，主机 A～E，FF 为广播，用逗号隔开，最多 12 个', 'Write frames as A>B (hosts A–E, FF broadcast), up to 12'), self: T('源和目的不能相同', 'Source and destination must differ'), age: T('老化时间 0～20', 'Aging: 0–20') };

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : null;
  // 交换机和端口
  let h = `<g transform="translate(${PX(1) - 40} ${SY})">${cell(PX(4) - PX(1) + 120, 70, '', { tone: 'slate' })}</g>`;
  h += txt(PX(1) - 28, SY + 22, z ? '交换机' : 'Switch', 'bt-lab', 'start');
  for (const p of PORTS) {
    const v = vlanOf(p, sim.vlan);
    const used = s && (s.inPort === p || s.out.includes(p));
    h += `<g transform="translate(${PX(p)} ${PY})">${cell(40, 28, String(p), { size: 13, tone: s && s.inPort === p ? 'amber' : s && s.out.includes(p) ? 'green' : VT[v], cls: used ? 'hot' : '' })}</g>`;
    if (sim.vlan) h += txt(PX(p) + 20, PY - 10, `VLAN ${v}`, 'bt-idx');
    // 连线
    if (p < 4) h += `<g class="barw"><line x1="${PX(p) + 20}" y1="${PY + 28}" x2="${PX(p) + 20}" y2="${HY}"/></g>`;
  }
  // 集线器
  h += `<g class="barw"><line x1="${PX(4) + 20}" y1="${PY + 28}" x2="${PX(4) + 20}" y2="${HUBY}"/><line x1="${HP.D.x}" y1="${HUBY + 30}" x2="${HP.D.x}" y2="${DY}"/><line x1="${HP.E.x}" y1="${HUBY + 30}" x2="${HP.E.x}" y2="${DY}"/><line x1="${HP.D.x}" y1="${HUBY + 30}" x2="${HP.E.x}" y2="${HUBY + 30}"/></g>`;
  h += `<g transform="translate(${PX(4) - 30} ${HUBY})">${cell(100, 30, z ? '集线器' : 'Hub', { size: 12, cls: 'dim' })}</g>`;
  // 主机
  for (const [name, pos] of Object.entries(HP)) {
    const p = HOSTS[name];
    let tone = VT[vlanOf(p, sim.vlan)];
    let note = '';
    if (s) {
      if (name === s.src) tone = 'amber';
      else if (s.delivered.includes(name)) {
        tone = 'green';
        note = z ? '收下' : 'accepts';
      } else if (s.out.includes(p) || (s.action === 'filter' && p === s.inPort)) {
        tone = 'slate';
        note = z ? '不是给我的，丢弃' : 'not mine: drops';
      }
    }
    h += `<g transform="translate(${pos.x - 45} ${pos.y})">${cell(90, 46, z ? `主机 ${name}` : `Host ${name}`, { size: 14, tone, cls: s && (name === s.src || s.delivered.includes(name)) ? 'hot' : '' })}</g>`;
    if (note) h += txt(pos.x, pos.y + 64, note, 'bt-idx');
  }
  // 这个帧的走向
  if (s) {
    const src = HP[s.src];
    const inX = PX(s.inPort) + 20;
    if (s.inPort === 4) h += arrow(src.x + (s.src === 'D' ? 12 : -12), DY - 2, src.x + (s.src === 'D' ? 12 : -12), HUBY + 34, 'acc') + arrow(inX - 8, HUBY - 2, inX - 8, PY + 32, 'acc');
    else h += arrow(inX - 8, HY - 2, inX - 8, PY + 32, 'acc');
    for (const p of s.out) {
      const x = PX(p) + 20 + 8;
      const cls = s.action === 'forward' ? 'ok' : 'cs-b dash';
      h += arrow(x, PY + 32, x, (p === 4 ? HUBY : HY) - 4, cls);
    }
    if (s.action === 'filter') h += txt(inX + 30, PY + 50, z ? '同一端口：丢弃' : 'same port: filtered', 'cw-lab bad l');
    const what = { forward: T('转发', 'forward'), flood: T('查不到：泛洪', 'unknown: flood'), broadcast: T('广播', 'broadcast'), filter: T('丢弃', 'filter') }[s.action];
    h += txt(PX(1) - 40, 92, z ? `时刻 ${s.t}：${s.src} → ${s.dst === 'FF' ? '广播' : s.dst}　${what.zh}` : `t = ${s.t}: ${s.src} → ${s.dst === 'FF' ? 'broadcast' : s.dst}   ${what.en}`, 'bt-lab', 'start');
  } else h += txt(PX(1) - 40, 92, z ? '转发表是空的' : 'The table is empty', 'bt-lab', 'start');
  items.push({ k: 'net', x: 0, y: 0, html: h });

  // 转发表
  const table = s ? s.table : [];
  const head = sim.vlan ? ['MAC', z ? '端口' : 'Port', 'VLAN', z ? '记录时刻' : 'Time'] : ['MAC', z ? '端口' : 'Port', z ? '记录时刻' : 'Time'];
  const rows = table.length
    ? table.map((e) => {
        const tone = s && e.mac === s.learn.mac && e.vlan === s.vlan ? 'amber' : s?.hit && e.mac === s.hit.mac && e.vlan === s.hit.vlan ? 'green' : '';
        return sim.vlan ? [{ t: e.mac, tone }, { t: String(e.port), tone }, { t: String(e.vlan), tone }, { t: String(e.t), tone }] : [{ t: e.mac, tone }, { t: String(e.port), tone }, { t: String(e.t), tone }];
      })
    : [sim.vlan ? [{ t: z ? '（空）' : '(empty)' }, '', '', ''] : [{ t: z ? '（空）' : '(empty)' }, '', '']];
  let th = txt(0, -12, z ? '转发表（MAC 地址表）' : 'MAC table', 'bt-lab', 'start') + gridTable(head, rows, { cw: sim.vlan ? [60, 54, 60, 80] : [70, 60, 90], rh: 32 });
  if (s?.aged.length) th += txt(0, (rows.length + 1) * 32 + 22, z ? `老化删除：${s.aged.join('、')}` : `aged out: ${s.aged.join(', ')}`, 'cw-lab bad l');
  items.push({ k: 'table', x: TX, y: SY, html: th });
  return items;
}

function build(p, kit, ERR) {
  const sim = learnSwitch(p);
  const lesson = shell('switch', kit, ERR, sim, {
    where: W,
    tag: T('交换', 'Switch'),
    name: T('交换机自学习与 VLAN', 'Switch learning and VLANs'),
    full: T('转发表 · 学源地址 · 泛洪、转发与丢弃 · 老化 · 冲突域与广播域 · 存储转发与直通 · VLAN 与 802.1Q · 以太网 MAC 帧', 'MAC table · learning · flood, forward, filter · aging · collision and broadcast domains · VLANs · the Ethernet frame'),
    title: SPEC.presets.find((x) => x.set.frames === p.frames && x.set.vlan === p.vlan && x.set.age === p.age)?.label ?? T('交换机自学习', 'Switch learning'),
    legend: [['amber', T('发送方 / 刚学到的表项', 'Sender / learned entry')], ['green', T('转发到 / 收下', 'Forwarded / accepted')], ['violet', T('泛洪（虚线）', 'Flood (dashed)')]],
    principle: PRINCIPLE,
    desc: T('交换机的转发表一开始是空的。每来一个帧，它先记下「源 MAC 从哪个端口来」，再查目的 MAC：查不到就泛洪，查到了就只往那个端口转发，正好是进来的端口就丢弃。打开 VLAN 后，看广播和泛洪怎样被关在各自的 VLAN 里。', 'The switch learns source addresses and forwards by destination: flood when unknown, forward when known, filter on the same port. VLANs confine floods.'),
    rect: [60, 60, 1000, 430],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => {
    const learn = s.learn.kind === 'new' ? T(`记下「${s.src} 在 ${s.inPort} 口」`, `learn ${s.src} on port ${s.inPort}`) : T(`表里已有 ${s.src}，更新记录时刻为 ${s.t}`, `refresh ${s.src}`);
    const aged = s.aged.length ? T(`先删掉老化的表项 ${s.aged.join('、')}；`, `Aged out: ${s.aged.join(', ')}; `) : T('', '');
    let fw;
    if (s.action === 'broadcast') fw = T(`目的是广播地址，从${sim.vlan ? ` VLAN ${s.vlan} 里` : ''}除 ${s.inPort} 口以外的端口 ${s.out.join('、') || '（没有）'} 发出，${s.delivered.join('、') || '没有主机'}都收到。`, `Broadcast out of ports ${s.out.join(', ')}.`);
    else if (s.action === 'flood') fw = T(`表里${sim.vlan ? `（VLAN ${s.vlan}）` : ''}查不到 ${s.dst}，只好泛洪到端口 ${s.out.join('、') || '（没有）'}。${s.delivered.length ? `${s.dst} 收下，其他主机发现不是给自己的就丢弃。` : s.otherVlan ? `${s.dst} 在另一个 VLAN，根本收不到——不同 VLAN 之间要经过路由器。` : ''}`, `Unknown ${s.dst}: flood to ${s.out.join(', ')}.${s.otherVlan ? ' It is in another VLAN and never arrives.' : ''}`);
    else if (s.action === 'forward') fw = T(`表里查到 ${s.dst} 在 ${s.hit.port} 口，只从 ${s.hit.port} 口转发，其他端口看不到这个帧。`, `${s.dst} is on port ${s.hit.port}: forward only there.`);
    else fw = T(`表里查到 ${s.dst} 也在 ${s.inPort} 口，和发送方在同一个网段，${s.dst} 已经从集线器上直接收到了，交换机丢弃这个帧。`, `${s.dst} is on the incoming port: filter.`);
    const ref = s.action === 'filter' ? 'domain' : s.otherVlan || (sim.vlan && s.action !== 'forward') ? 'vlan' : 'learn';
    return {
      title: T(`${s.src} → ${s.dst === 'FF' ? '广播' : s.dst}：${{ forward: '转发', flood: '泛洪', broadcast: '广播', filter: '丢弃' }[s.action]}`, `${s.src} → ${s.dst === 'FF' ? 'all' : s.dst}: ${s.action}`),
      desc: T(`时刻 ${s.t} · 从 ${s.inPort} 口进来`, `t = ${s.t} · in on port ${s.inPort}`),
      detail: T(`${aged.zh}${learn.zh}。${fw.zh}`, `${aged.en}${learn.en}. ${fw.en}`),
      ref,
      st: { k },
      row: { color: s.action === 'forward' ? 'green' : s.action === 'filter' ? 'slate' : 'violet', what: T(`${s.src} → ${s.dst}`, `${s.src} → ${s.dst}`), result: T({ forward: `转发到 ${s.out}`, flood: `泛洪 ${s.out.join(',')}`, broadcast: `广播 ${s.out.join(',')}`, filter: '丢弃' }[s.action], s.action), tone: 'info' },
    };
  });
  const title = T(`${sim.steps.length} 个帧里泛洪 / 广播 ${sim.floods} 次，表里学到 ${sim.final.length} 项`, `${sim.floods} floods in ${sim.steps.length} frames; ${sim.final.length} entries learned`);
  const text = sim.vlan ? T('VLAN 10 和 VLAN 20 各是一个广播域：广播和泛洪都没有越过 VLAN 的边界。', 'Each VLAN is its own broadcast domain.') : T('表学满以后，大部分帧都只往一个端口转发，其他端口不受打扰。', 'Once learned, most frames go out of one port only.');
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeSwitch = make('switch', SPEC, ERR, build);
