// 「UDP：首部、校验和与分用」：左边按 32 位一行画出伪首部、UDP 首部和数据（每格是一个 16 位字），
// 右边是逐字相加的竖式表：每加一个字写出结果，最高位溢出时回卷加 1。最后取反得到校验和，接收方再加一遍核对。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { hx4, udp } from './udp.js';

const W = [['net', 'transport']];
const HW = 150; // 半行（16 位）宽
const RH = 46;
const PART_TONE = { pseudo: 'slate', hdr: 'violet', data: 'blue' };

const PRINCIPLE = {
  sections: [
    {
      id: 'udp',
      title: T('UDP 的特点', 'What UDP is'),
      blocks: [
        { list: [
          T('**无连接**：发数据前不用建立连接，减少了开销和时延。', '**Connectionless**: no setup delay.'),
          T('**尽最大努力交付**：不保证可靠，不编号、不确认、不重传。', '**Best effort**: no sequence numbers, acknowledgements or retransmission.'),
          T('**面向报文**：应用层交下来的报文原样加个首部就发，不拆分也不合并；所以应用程序要自己选合适的报文大小。', '**Message-oriented**: each application message becomes one datagram.'),
          T('**没有拥塞控制**：网络拥塞也不降低发送速率，适合实时应用（视频、语音）。', '**No congestion control**: suits real-time traffic.'),
          T('支持一对一、一对多、多对一、多对多通信；首部只有 8 字节。', 'Any-to-any communication; an 8-byte header.'),
        ] },
        { tip: T('常用 UDP 的应用：DNS（53）、DHCP（67/68）、TFTP（69）、SNMP（161）、RIP（520），以及实时音视频。', 'UDP users: DNS 53, DHCP 67/68, TFTP 69, SNMP 161, RIP 520, real-time media.') },
      ],
    },
    {
      id: 'header',
      title: T('首部和伪首部', 'Header and pseudo-header'),
      blocks: [
        {
          table: {
            head: [T('字段', 'Field'), T('长度', 'Size'), T('说明', 'Notes')],
            rows: [
              [T('源端口', 'Source port'), '2 B', T('需要对方回信时填，不需要可以全 0', 'may be 0 if no reply is needed')],
              [T('目的端口', 'Destination port'), '2 B', T('交付时用它找到进程', 'used for demultiplexing')],
              [T('长度', 'Length'), '2 B', T('首部 + 数据的字节数，最小 8', 'header + data, at least 8')],
              [T('校验和', 'Checksum'), '2 B', T('检验首部和数据；全 0 表示不校验', 'over header and data; 0 = unused')],
            ],
          },
        },
        { p: T('算校验和时要在前面临时加一个 12 字节的**伪首部**：源 IP 地址、目的 IP 地址、一个全 0 字节、协议号 17、UDP 长度。伪首部**不发送**，也不算进长度，只是为了让校验和顺带检查 IP 地址有没有送错。', 'A 12-byte **pseudo-header** (source and destination IP, zero, protocol 17, UDP length) is prepended only for the checksum. It is never sent.') },
      ],
    },
    {
      id: 'checksum',
      title: T('校验和怎样算', 'Computing the checksum'),
      blocks: [
        { steps: [
          T('把校验和字段先填 0；数据是奇数字节就在末尾补一个全 0 字节（补的这个字节不发送）；', 'Zero the checksum field; pad an odd byte count with a zero byte (not sent);'),
          T('把伪首部、首部、数据按 16 位一个字排好，用**反码加法**逐个相加：最高位进位要加回最低位（回卷）；', 'Add all 16-bit words in ones’-complement arithmetic, wrapping carries around;'),
          T('把和**取反**，就是校验和，填进首部；', '**Complement** the sum: that is the checksum;'),
          T('接收方把伪首部、首部（含校验和）、数据照样相加，结果全是 1（FFFF）说明没发现差错，否则丢弃。', 'The receiver adds everything including the checksum: all ones means no error was found.'),
        ] },
        { warn: T('这种校验只能发现差错，有的错误（比如两个字交换位置）发现不了；UDP 发现差错直接丢弃报文，不通知发送方。', 'It only detects some errors (swapped words go unnoticed); bad datagrams are silently dropped.') },
      ],
    },
    {
      id: 'demux',
      title: T('复用、分用和端口', 'Multiplexing and ports'),
      blocks: [
        { p: T('**复用**：不同的应用进程都可以用同一个传输层协议发数据；**分用**：传输层剥去首部后按**目的端口**把数据交给对应的进程。端口号 16 位，只在本机有意义。', '**Multiplexing**: many processes share the transport protocol; **demultiplexing** delivers by **destination port**.') },
        {
          table: {
            head: [T('范围', 'Range'), T('名称', 'Name'), T('用途', 'Use')],
            rows: [
              ['0～1023', T('熟知端口', 'Well-known'), T('标准服务：FTP 21、SSH 22、TELNET 23、SMTP 25、DNS 53、HTTP 80、POP3 110、HTTPS 443', 'standard services')],
              ['1024～49151', T('登记端口', 'Registered'), T('没有熟知端口的应用向 IANA 登记', 'registered applications')],
              ['49152～65535', T('短暂端口', 'Ephemeral'), T('客户进程临时使用', 'clients, temporarily')],
            ],
          },
        },
        { tip: T('UDP 套接字由「IP 地址 + 端口」标识；收到的 UDP 报文目的端口上没有进程在等，就丢弃并回一个 ICMP「端口不可达」。', 'A UDP datagram to a closed port is dropped and answered with ICMP port unreachable.') },
      ],
    },
    pit([
      T('伪首部只参与校验和计算，既不发送，也不算进 UDP 长度。', 'The pseudo-header is neither sent nor counted in the length.'),
      T('反码求和时进位要回卷；最后还要取反。', 'Wrap carries around, then complement.'),
      T('UDP 长度字段包括首部 8 字节。', 'The length field includes the 8-byte header.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('发 5 个字符（奇数字节要补 0）', '5 characters (odd: pad a 0)'), set: { srcIp: '192.168.1.10', dstIp: '202.38.64.3', srcPort: 50123, dstPort: 53, data: 'HELLO', flip: -1 } },
    { label: T('传输中翻转了 1 个比特', 'One bit flipped in transit'), set: { srcIp: '192.168.1.10', dstIp: '202.38.64.3', srcPort: 50123, dstPort: 53, data: 'HELLO', flip: 3 } },
    { label: T('偶数个字节：DATA', 'Even length: DATA'), set: { srcIp: '10.0.0.2', dstIp: '10.0.0.9', srcPort: 68, dstPort: 67, data: 'DATA', flip: -1 } },
  ],
  groups: [{ legend: T('UDP 用户数据报', 'UDP datagram'), fields: [
    { name: 'srcIp', label: T('源 IP', 'Source IP'), type: 'text', parse: (s) => String(s).trim() },
    { name: 'dstIp', label: T('目的 IP', 'Destination IP'), type: 'text', parse: (s) => String(s).trim() },
    { name: 'srcPort', label: T('源端口', 'Source port'), type: 'int', min: 0, max: 65535 },
    { name: 'dstPort', label: T('目的端口', 'Destination port'), type: 'int', min: 0, max: 65535 },
    { name: 'data', label: T('数据（ASCII，1～12 个字符）', 'Data (ASCII, 1–12 chars)'), type: 'text', parse: (s) => String(s), wide: true },
    { name: 'flip', label: T('传输中翻转数据的第几个比特（−1 = 不翻转）', 'Flip data bit (−1 = none)'), type: 'int', min: -1, max: 95 },
  ] }],
  note: T('数据按 ASCII 编码；奇数字节在末尾补一个 0 字节参与计算（不发送）。校验和算出 0 时发 FFFF。', 'ASCII data; an odd byte count is padded with a zero for the sum only. A computed 0 is sent as FFFF.'),
};
const ERR = { srcIp: T('源 IP 格式不对', 'Bad source IP'), dstIp: T('目的 IP 格式不对', 'Bad destination IP'), srcPort: T('端口 0～65535', 'Port 0–65535'), dstPort: T('端口 0～65535', 'Port 0–65535'), data: T('数据 1～12 个可见 ASCII 字符', 'Data: 1–12 printable ASCII characters') };

function wordLabel(w, sim, z) {
  const ip = (a, i) => `${a[i]}.${a[i + 1]}`;
  return {
    srcIp1: ip(sim.srcIp, 0), srcIp2: ip(sim.srcIp, 2), dstIp1: ip(sim.dstIp, 0), dstIp2: ip(sim.dstIp, 2),
    proto: z ? '0 | 17' : '0 | 17', len: z ? `长度 ${sim.len}` : `len ${sim.len}`,
    srcPort: z ? `源端口 ${sim.srcPort}` : `src ${sim.srcPort}`, dstPort: z ? `目的端口 ${sim.dstPort}` : `dst ${sim.dstPort}`,
    cks: z ? '校验和' : 'checksum',
  }[w.name] ?? `"${w.chars}"${w.pad ? (z ? ' + 补 0' : ' + pad') : ''}`;
}

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.list[st.k] : null;
  const kind = s?.kind ?? 'pre';
  const recv = kind === 'recv' || kind === 'demux';
  const ws = recv ? sim.rx : sim.words;
  // 左：按 32 位一行
  let h = txt(0, -16, z ? '伪首部 + UDP 首部 + 数据（每格 16 位）' : 'Pseudo-header + header + data (16-bit words)', 'bt-lab', 'start');
  const rowName = [T('源 IP', 'Source IP'), T('目的 IP', 'Destination IP'), T('0 · 协议 · 长度', '0 · proto · length'), T('端口', 'Ports'), T('长度 · 校验和', 'Length · checksum')];
  const nrow = Math.ceil(ws.length / 2);
  const active = { pseudo: ['pseudo'], hdr: ['hdr'], data: ['data'] }[kind] ?? [];
  for (let r = 0; r < nrow; r++) {
    const y = r * RH + (r >= 3 ? 14 : 0);
    const lab = r < 5 ? rowName[r] : T('数据', 'Data');
    h += txt(-12, y + 26, z ? lab.zh : lab.en, 'bt-cap', 'end');
    for (let c = 0; c < 2; c++) {
      const w = ws[r * 2 + c];
      if (!w) continue;
      const isCks = w.name === 'cks';
      const filled = isCks && (kind === 'not' || recv);
      const flippedHere = recv && sim.flipped?.word === w.name;
      const tone = flippedHere ? 'rose' : isCks && filled ? 'amber' : active.includes(w.part) ? 'amber' : PART_TONE[w.part];
      const v = isCks ? (filled ? sim.cks : 0) : w.v;
      h += `<g transform="translate(${c * HW} ${y})">${cell(HW - 4, RH - 6, `${hx4(v)}  ${wordLabel(w, sim, z)}`, { size: 12, tone, cls: active.includes(w.part) || (isCks && kind === 'not') || flippedHere ? 'hot' : '' })}</g>`;
    }
  }
  h += txt(2 * HW + 8, 3 * RH / 2 + 4, z ? '← 伪首部（不发送）' : '← pseudo-header (not sent)', 'bt-idx', 'start');
  items.push({ k: 'pkt', x: 130, y: 120, html: h });
  // 右：逐字相加
  let r = '';
  const adds = recv ? sim.radds : sim.adds;
  const upto = { pre: 0, build: 0, pseudo: 6, hdr: 10, data: adds.length, not: adds.length, recv: adds.length, demux: adds.length }[kind];
  r += txt(0, -16, recv ? (z ? '接收方：全部相加（含校验和）' : 'Receiver: add everything') : z ? '发送方：逐字相加（进位回卷）' : 'Sender: add word by word', 'bt-lab', 'start');
  const rows = adds.slice(0, upto).map((a, i) => {
    const hot = (kind === 'pseudo' && a.part === 'pseudo') || (kind === 'hdr' && a.part === 'hdr') || (kind === 'data' && a.part === 'data');
    const tone = hot ? 'amber' : '';
    return [{ t: String(i + 1), tone }, { t: `+ ${hx4(a.v)}`, tone }, { t: a.carry ? `${a.raw.toString(16).toUpperCase()} → ${hx4(a.sum)}` : hx4(a.sum), tone: a.carry ? 'orange' : tone }];
  });
  if (rows.length) r += gridTable(['#', z ? '加上' : 'add', z ? '和（回卷后）' : 'sum'], rows, { cw: [36, 90, 130], rh: 26 });
  const yEnd = (rows.length + 1) * 26 + 24;
  if (kind === 'not') r += txt(0, yEnd, z ? `和 = ${hx4(sim.sum)}，取反得校验和 ${hx4(sim.cks)}` : `sum ${hx4(sim.sum)} → checksum ${hx4(sim.cks)}`, 'bt-lab', 'start');
  if (recv) r += txt(0, yEnd, sim.good ? (z ? `结果 ${hx4(sim.rsum)}：全 1，没发现差错 ✓` : `${hx4(sim.rsum)}: all ones ✓`) : z ? `结果 ${hx4(sim.rsum)}：不是全 1，有差错，丢弃` : `${hx4(sim.rsum)}: error, dropped`, sim.good ? 'bt-lab' : 'cw-lab bad l', 'start');
  if (kind === 'demux') r += txt(0, yEnd + 28, z ? `按目的端口 ${sim.dstPort} 交给对应的进程` : `deliver to port ${sim.dstPort}`, 'bt-cap', 'start');
  items.push({ k: 'sum', x: 610, y: 120, html: r });
  return items;
}

function build(p, kit, ERR) {
  const sim = udp(p);
  const lesson = shell('udp', kit, ERR, sim, {
    where: W,
    tag: 'UDP',
    name: T('UDP：首部、校验和与分用', 'UDP: header, checksum, ports'),
    full: T('UDP 的特点 · 8 字节首部 · 伪首部 · 反码求和与回卷 · 接收方核对 · 复用与分用 · 端口号分类', 'UDP features · the 8-byte header · pseudo-header · ones’-complement sums · verification · ports'),
    title: SPEC.presets.find((x) => Object.entries(x.set).every(([k, v]) => p[k] === v))?.label ?? T('UDP 校验和', 'UDP checksum'),
    legend: [['slate', T('伪首部', 'Pseudo-header')], ['violet', T('UDP 首部', 'UDP header')], ['blue', T('数据', 'Data')], ['orange', T('有进位、回卷', 'Carry wrapped')]],
    principle: PRINCIPLE,
    desc: T('UDP 首部只有 8 字节，其中校验和要连一个「伪首部」一起算：把所有内容按 16 位一个字排好，逐个相加、进位回卷，最后取反。接收方再全部加一遍，全 1 才算对。可以试着翻转一个比特，看校验和怎样发现它。', 'The UDP checksum covers a pseudo-header too: add all 16-bit words with wrap-around carries and complement. The receiver adds again and expects all ones.'),
    rect: [0, 80, 900, 560],
  });
  if (!sim.ok) return lesson;
  const kinds = ['build', 'pseudo', 'hdr', 'data', 'not', 'recv', 'demux'];
  sim.list = kinds.map((kind) => ({ kind }));
  const sumAt = (n) => hx4(sim.adds[n - 1].sum);
  const nData = sim.words.filter((w) => w.part === 'data').length;
  const list = sim.list.map((s, k) => {
    let d;
    if (s.kind === 'build') d = [T('排好要相加的 16 位字', 'Lay out the 16-bit words'), T(`数据「${sim.text}」${sim.bytes.length} 字节，UDP 长度 = 8 + ${sim.bytes.length} = ${sim.len}。前面临时加上 12 字节伪首部，校验和字段先填 0${sim.bytes.length % 2 ? '；数据是奇数字节，末尾补一个 0 字节' : ''}。一共 ${sim.words.length} 个字。`, `${sim.bytes.length} B of data, length ${sim.len}; ${sim.words.length} words with the pseudo-header.`), 'header'];
    else if (s.kind === 'pseudo') d = [T('加伪首部的 6 个字', 'Add the pseudo-header'), T(`源 IP、目的 IP、0 和协议号 17、UDP 长度，依次相加，和是 ${sumAt(6)}。`, `Sum so far ${sumAt(6)}.`), 'checksum'];
    else if (s.kind === 'hdr') d = [T('加 UDP 首部的 4 个字', 'Add the UDP header'), T(`源端口、目的端口、长度、校验和（现在是 0），和是 ${sumAt(10)}。`, `Sum so far ${sumAt(10)}.`), 'checksum'];
    else if (s.kind === 'data') d = [T(`加数据的 ${nData} 个字`, `Add ${nData} data words`), T(`每两个字符一个字。${sim.carries ? `一共有 ${sim.carries} 次最高位进位，进位都加回了最低位（橙色）。` : ''}最后的和是 ${hx4(sim.sum)}。`, `Final sum ${hx4(sim.sum)}; ${sim.carries} carries wrapped.`), 'checksum'];
    else if (s.kind === 'not') d = [T(`取反：校验和 = ${hx4(sim.cks)}`, `Complement: ${hx4(sim.cks)}`), T(`${hx4(sim.sum)} 按位取反得 ${hx4(sim.cks)}，填进首部的校验和字段，然后发送（伪首部和补的 0 不发）。`, `${hx4(sim.sum)} complemented is ${hx4(sim.cks)}.`), 'checksum'];
    else if (s.kind === 'recv') d = sim.good ? [T('接收方核对：FFFF，没发现差错', 'Receiver: FFFF, no error found'), T(`接收方用收到的数据报自己再拼一个伪首部，连同校验和一起全部相加，得 FFFF。因为 和 + 取反(和) 必然是全 1。`, 'sum + ~sum is all ones.'), 'checksum'] : [T(`接收方核对：${hx4(sim.rsum)}，发现差错`, `Receiver: ${hx4(sim.rsum)}, error`), T(`数据在传输中第 ${sim.flipped.bit + 1} 个比特被翻转（红色），全部相加不再是 FFFF，接收方直接丢弃这个数据报，也不通知发送方。`, 'The flipped bit breaks the sum; the datagram is silently dropped.'), 'checksum'];
    else d = sim.good ? [T(`按端口 ${sim.dstPort} 交付`, `Deliver to port ${sim.dstPort}`), T(`去掉 8 字节首部，按目的端口 ${sim.dstPort} 把「${sim.text}」交给在这个端口上等着的进程（分用）。如果这个端口没有进程，就丢弃并回一个 ICMP 端口不可达。`, `Strip the header and hand the data to the process on port ${sim.dstPort}.`), 'demux'] : [T('出错的数据报已丢弃', 'Already dropped'), T('有差错的数据报不会交给应用进程；UDP 不重传，要不要重发由应用自己决定。', 'UDP never retransmits.'), 'udp'];
    return { title: d[0], desc: T(`第 ${k + 1} 步`, `Step ${k + 1}`), detail: d[1], ref: d[2], st: { k }, row: { color: 'blue', what: d[0], result: T(s.kind === 'not' ? hx4(sim.cks) : '—', s.kind === 'not' ? hx4(sim.cks) : '—'), tone: s.kind === 'recv' && !sim.good ? 'bad' : 'info' } };
  });
  const title = T(`校验和 ${hx4(sim.cks)}，接收方${sim.good ? '核对无误' : '发现差错'}`, `Checksum ${hx4(sim.cks)}; ${sim.good ? 'verified' : 'error detected'}`);
  const text = T(`UDP 数据报共 ${sim.len} 字节（首部 8 + 数据 ${sim.bytes.length}）；参与计算的还有 12 字节伪首部${sim.bytes.length % 2 ? '和 1 个补的 0 字节' : ''}。`, `${sim.len} B datagram; the 12 B pseudo-header only takes part in the sum.`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeUdp = make('udp', SPEC, ERR, build);
