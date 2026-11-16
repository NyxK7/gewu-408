// 「IP 分片」：最上面是原来的数据报（首部 + 数据），下面每一片对齐画在它带走的那段数据正下方，
// 右边写着这一片首部里的总长度、MF、片偏移；再经过更小的 MTU 时，每一片还会再切。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { frag } from './frag.js';

const SPEC = {
  presets: [
    { label: T('4000 B 过 MTU 1500', '4000 B over MTU 1500'), set: { total: 4000, hdr: 20, mtu: 1500, df: false, mtu2: 0 } },
    { label: T('数据不是 8 的倍数', 'Not a multiple of 8'), set: { total: 3820, hdr: 20, mtu: 1000, df: false, mtu2: 0 } },
    { label: T('再过 MTU 576', 'Then MTU 576'), set: { total: 4000, hdr: 20, mtu: 1500, df: false, mtu2: 576 } },
    { label: T('DF = 1：不许分片', 'DF = 1: no fragmenting'), set: { total: 4000, hdr: 20, mtu: 1500, df: true, mtu2: 0 } },
  ],
  groups: [
    {
      legend: T('数据报', 'Datagram'),
      fields: [
        { name: 'total', label: T('总长度（B，含首部）', 'Total length (B, with header)'), type: 'int', min: 21, max: 65535 },
        { name: 'hdr', label: T('首部长度（B）', 'Header length (B)'), type: 'select', options: [20, 24, 28, 32, 40, 60].map((v) => [v, String(v)]) },
        { name: 'df', label: T('DF = 1（不允许分片）', 'DF = 1 (don’t fragment)'), type: 'check' },
      ],
    },
    {
      legend: T('链路', 'Links'),
      fields: [
        { name: 'mtu', label: T('出去的链路 MTU（B）', 'Outgoing MTU (B)'), type: 'int', min: 28, max: 65535 },
        { name: 'mtu2', label: T('再下一段链路的 MTU（0 表示没有）', 'Next link MTU (0 = none)'), type: 'int', min: 0, max: 65535 },
      ],
    },
  ],
  note: T(
    'MTU 是链路层一帧能装下的 IP 数据报最大长度（含 IP 首部）。每一片都带一个和原来一样长的首部。片偏移以 8 字节为单位，所以除最后一片外，每片的数据长度都要是 8 的倍数。分片只在目的主机重组，中途的路由器不重组。',
    'The MTU is the largest IP datagram (header included) a link frame can carry. Every fragment carries a full header. Offsets count 8-byte units, so every fragment but the last carries a multiple of 8 data bytes. Only the destination host reassembles.',
  ),
};
const ERR = {
  total: T('总长度要大于首部、不超过 65535', 'Total must exceed the header and be at most 65535'),
  hdr: T('首部长度是 20～60 中 4 的倍数', 'Header length is a multiple of 4 in 20–60'),
  mtu: T('MTU 至少要能装下首部和 8 字节数据', 'The MTU must fit the header plus 8 bytes'),
  mtu2: T('第二段 MTU 太小（或填 0 表示没有）', 'Second MTU too small (or 0 for none)'),
  many: T('要分成 {n} 片，太多了画不下（最多 {max} 片）：把 MTU 调大或把总长度调小', '{n} fragments is too many to draw (max {max}): raise the MTU or shrink the datagram'),
};

const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'orange', 'rose', 'slate'];

// ───── 画板 ─────
const X0 = 200;
const W = 600;
const HW = 46;
const BH = 30;
const OY = 110;
const FY = 196;
const FG = 58;

function board(sim, st, z) {
  const items = [];
  const sc = W / sim.data;
  const X = (b) => X0 + b * sc;
  const bar = (x, w, tone, text, cls = '') => `<g transform="translate(${x.toFixed(1)} 0)">${cell(Math.max(w - 2, 3), BH, w > 40 ? text : '', { tone, cls, size: 12 })}</g>`;
  const head = (x, cls = '') => `<g transform="translate(${(x - HW - 2).toFixed(1)} 0)">${cell(HW - 2, BH, `H ${sim.hdr}`, { tone: 'slate', cls, size: 11 })}</g>`;

  // 原来的数据报
  let o = txt(X0 - HW - 14, BH / 2 + 4, z ? '原数据报' : 'Original', 'bt-cap', 'end') + head(X0) + bar(X0, W, '', z ? `数据 ${sim.data} B` : `data ${sim.data} B`, 'dim');
  o += txt(X0 + W + 16, BH / 2 + 4, z ? `总长 ${sim.total} B` : `total ${sim.total} B`, 'fr-f', 'start');
  if (st.cut && sim.frags.length > 1) {
    sim.frags.forEach((f, i) => {
      o += `<line class="fr-cut" x1="${X(f.off).toFixed(1)}" y1="-8" x2="${X(f.off).toFixed(1)}" y2="${BH + 8}"/>` + txt(X(f.off), BH + 22, String(f.off), 'bt-idx');
      if (i === sim.frags.length - 1) o += txt(X(sim.data), BH + 22, String(sim.data), 'bt-idx');
    });
  }
  items.push({ k: 'orig', x: 0, y: OY, html: o });

  if (sim.dropped && st.drop) {
    items.push({ k: 'drop', x: X0, y: FY, html: cell(W, 46, z ? `DF = 1，又比 MTU ${sim.mtu} 长：丢弃，发回 ICMP 差错报告` : `DF = 1 and longer than MTU ${sim.mtu}: dropped, ICMP error sent`, { cls: 'bad', size: 14 }) });
    return items;
  }

  // 第一跳的分片
  const shown = st.f ?? 0;
  sim.frags.slice(0, shown).forEach((f, i) => {
    const y = FY + i * FG;
    let h = txt(X0 - HW - 14, BH / 2 + 4, z ? `第 ${i + 1} 片` : `Frag ${i + 1}`, 'bt-cap', 'end');
    h += `<g transform="translate(${(X(f.off) - X0).toFixed(1)} 0)">${head(X0)}</g>` + bar(X(f.off), f.len * sc, TONES[i % 8], `${f.len} B`, i === shown - 1 && !st.second ? 'hot' : '');
    h += txt(X0 + W + 16, BH / 2 + 4, z ? `总长 ${f.total} · MF ${f.MF} · 偏移 ${f.field}` : `len ${f.total} · MF ${f.MF} · off ${f.field}`, 'fr-f', 'start');
    items.push({ k: `f${i}`, x: 0, y, from: [0, OY], html: h });
  });

  // 第二跳：每一片再切
  if (sim.second.length) {
    const SY = FY + sim.frags.length * FG + 34;
    const shown2 = st.s ?? 0;
    if (shown2) items.push({ k: 'hop2', x: X0 - HW - 14, y: SY - 18, html: txt(0, 0, z ? `再经过 MTU ${sim.mtu2} 的链路：每片最多 ${sim.second[0].per2} B 数据` : `Then MTU ${sim.mtu2}: up to ${sim.second[0].per2} B data each`, 'bt-cap', 'start') });
    sim.second.slice(0, shown2).forEach((g, i) => {
      const y = SY + i * FG;
      let h = txt(X0 - HW - 14, BH / 2 + 4, z ? `第 ${i + 1} 片 →` : `Frag ${i + 1} →`, 'bt-cap', 'end');
      g.pieces.forEach((p) => {
        h += bar(X(p.off), p.len * sc, TONES[i % 8], p.len * sc > 96 ? `${p.field} · MF${p.MF}` : String(p.field), i === shown2 - 1 ? 'hot' : '');
      });
      h += txt(X0 + W + 16, BH / 2 + 4, g.split ? (z ? `切成 ${g.pieces.length} 片` : `${g.pieces.length} pieces`) : z ? '不用再切' : 'fits', 'fr-f', 'start');
      items.push({ k: `s${i}`, x: 0, y, from: [0, FY + i * FG], html: h });
    });
  }
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'header',
      title: T('IPv4 首部里和分片有关的字段', 'Header fields used for fragmentation'),
      blocks: [
        {
          table: {
            head: [T('字段', 'Field'), T('长度', 'Size'), T('作用', 'Purpose')],
            rows: [
              [T('总长度', 'Total length'), T('16 位', '16 bits'), T('首部 + 数据的总字节数，最大 65535', 'header plus data in bytes, at most 65535')],
              [T('标识', 'Identification'), T('16 位', '16 bits'), T('同一个数据报的所有分片标识相同，目的主机靠它把分片归到一起', 'shared by all fragments of one datagram')],
              [T('标志 DF', 'DF flag'), T('1 位', '1 bit'), T('Don’t Fragment：为 1 时不许分片', 'Don’t Fragment')],
              [T('标志 MF', 'MF flag'), T('1 位', '1 bit'), T('More Fragments：为 1 表示后面还有分片，最后一片为 0', 'More Fragments: 0 on the last one')],
              [T('片偏移', 'Fragment offset'), T('13 位', '13 bits'), T('这一片的数据在原数据中的位置，以 8 字节为单位', 'position in the original data, in 8-byte units')],
              [T('首部长度', 'Header length'), T('4 位', '4 bits'), T('以 4 字节为单位，最小 5（20 B），最大 15（60 B）', 'in 4-byte units: 5 (20 B) to 15 (60 B)')],
            ],
          },
        },
        { tip: T('片偏移只有 13 位，却要表示最大 65535 字节的位置，所以以 8 字节为单位（2^13 × 8 = 65536）。这也是除最后一片外，每片数据长度必须是 8 的倍数的原因。', 'Thirteen bits must cover 65535 bytes, hence 8-byte units (2^13 × 8 = 65536), and hence every fragment but the last carries a multiple of 8 bytes.') },
      ],
    },
    {
      id: 'why',
      title: T('为什么要分片', 'Why fragment'),
      blocks: [
        { p: T('IP 数据报要装进链路层的帧里传。每种链路一帧能装的数据有上限，叫**最大传送单元 MTU**，以太网是 1500 字节。数据报比出去那条链路的 MTU 长，路由器（或源主机）就要把它切成几片，每片都是一个完整的 IP 数据报，带自己的首部。', 'An IP datagram rides inside a link-layer frame, whose payload limit is the **MTU** (1500 bytes on Ethernet). A datagram longer than the outgoing MTU is cut into fragments, each a complete IP datagram with its own header.') },
      ],
    },
    {
      id: 'how',
      title: T('怎么切', 'How to cut'),
      blocks: [
        {
          steps: [
            T('原数据长度 = 总长度 − 首部长度；', 'data = total length − header;'),
            T('每片最多能放的数据 = ⌊(MTU − 首部长度) ÷ 8⌋ × 8；', 'data per fragment = ⌊(MTU − header) ÷ 8⌋ × 8;'),
            T('从头按这个长度切，最后一片放剩下的；', 'cut from the start; the last fragment takes the rest;'),
            T('每片：总长度 = 首部 + 这片数据；片偏移 = 这片数据在原数据中的起始字节 ÷ 8；除最后一片外 MF = 1；标识和原来相同。', 'each fragment: total = header + its data; offset = its starting byte ÷ 8; MF = 1 except the last; same identification.'),
          ],
        },
        { warn: T('片偏移算的是**数据**的位置，不含首部；MTU 包含首部。两个最容易错的地方。', 'Offsets count **data** only, while the MTU includes the header: the two classic slips.') },
      ],
    },
    {
      id: 'more',
      title: T('再分片、DF 与重组', 'Refragmenting, DF and reassembly'),
      blocks: [
        { p: T('分片在后面的链路上遇到更小的 MTU 时，还会被再切。新切出的片偏移仍按**原始数据**计算；原来那片 MF = 1，切出的每一片都 MF = 1；原来那片 MF = 0（最后一片），只有切出的最后一小片 MF = 0。', 'A fragment meeting a smaller MTU is cut again. Offsets stay relative to the **original** data; only the very last piece of the original last fragment has MF = 0.') },
        { p: T('DF = 1 的数据报比 MTU 长时不能分片，路由器丢弃它，并向源主机发回 ICMP 差错报告（终点不可达：需要分片但设置了 DF）。路径 MTU 发现就是利用这一点找出整条路径上最小的 MTU。', 'With DF = 1 a too-long datagram is dropped and an ICMP destination-unreachable (fragmentation needed) goes back to the source; path MTU discovery relies on this.') },
        { p: T('**只有目的主机**重组：按标识把分片归在一起，按片偏移排好，看到 MF = 0 的那一片再结合偏移判断是否收齐。中途的路由器不重组，因为各分片可能走不同的路。任何一片丢了，整个数据报都要由上层重传。', 'Only the **destination** reassembles, grouping by identification and ordering by offset; routers never do, since fragments may take different routes. Losing any fragment loses the datagram.') },
        { tip: T('IPv6 中路由器不再分片，只有源主机能分片（用分片扩展首部）。', 'In IPv6 routers never fragment; only the source can, with an extension header.') },
      ],
    },
    {
      id: 'ipv6',
      title: 'IPv6',
      blocks: [
        { p: T('IPv4 地址只有 32 位，早已分配完。IPv6 把地址扩大到 **128 位**，同时简化了首部。', 'IPv6 uses **128-bit** addresses and a simpler header.') },
        { list: [
          T('**基本首部固定 40 字节**，去掉了首部校验和（交给链路层和传输层）、分片字段和选项字段；可选功能放在**扩展首部**里。', 'A **fixed 40-byte header**: no checksum, no fragmentation fields, options moved to **extension headers**.'),
          T('**路由器不分片**：分片只能由源主机做（用分片扩展首部）；分组太大时路由器丢弃它，回一个 ICMPv6「分组太大」。', '**Routers never fragment**: only the source does; routers drop and send ICMPv6 “packet too big”.'),
          T('地址写成 8 组十六进制数，用冒号隔开；连续的全 0 组可以压缩成「::」（一个地址里只能用一次），每组的前导 0 可以省略。', 'Eight hex groups separated by colons; one run of zero groups may become “::”.'),
          T('地址类型：单播、多播、任播（交给一组中「最近」的一个），**没有广播地址**。', 'Unicast, multicast and anycast; **no broadcast**.'),
          T('支持即插即用（无状态地址自动配置），不一定需要 DHCP；首部有流标号，便于实时业务。', 'Stateless autoconfiguration; a flow label for real-time traffic.'),
        ] },
        { p: T('从 IPv4 过渡到 IPv6 有两种主要办法：**双协议栈**（主机和路由器同时装 IPv4 和 IPv6）和**隧道技术**（把 IPv6 数据报封装在 IPv4 数据报里穿过 IPv4 网络）。', 'Transition by **dual stack** or **tunnelling** IPv6 inside IPv4.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('MTU 包含 IP 首部，每片的数据 = MTU − 首部，再向下取到 8 的倍数。', 'Data per fragment = MTU − header, rounded down to a multiple of 8.'),
            T('片偏移的单位是 8 字节，填到首部里的是字节数 ÷ 8。', 'The offset field holds bytes ÷ 8.'),
            T('每片都要加上首部：各片总长度之和大于原来的总长度。', 'Every fragment carries a header, so the fragments total more than the original.'),
            T('最后一片 MF = 0，其余 MF = 1；DF 只表示能不能分，和是不是最后一片无关。', 'MF = 0 only on the last; DF is unrelated.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('分片', 'Fragments') });

function build(params) {
  const sim = frag({ total: params.total, hdr: Number(params.hdr), mtu: params.mtu, df: !!params.df, mtu2: params.mtu2 ?? 0 });
  const lesson = {
    id: 'ip-frag',
    kit,
    where: [['net', 'network']],
    tag: T('分片', 'Frag'),
    name: T('IP 分片', 'IP fragmentation'),
    full: T('MTU · 标识 · DF / MF · 片偏移 · 再分片 · 重组', 'MTU · identification · DF / MF · offset · refragmenting · reassembly'),
    title: sim.ok ? T(`${params.total} B · MTU ${params.mtu}`, `${params.total} B · MTU ${params.mtu}`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['slate', T('首部', 'Header')],
      ['blue', T('各片的数据', 'Fragment data')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '数据报比链路的 MTU 长，就要切成几片，每片都带自己的首部。这节课把原数据报画在最上面，每一片对齐画在它带走的那段数据正下方，一眼就能看出片偏移是怎么来的；还可以让分片再经过一段更小的 MTU，或者设上 DF 看它被丢弃。',
        'A datagram longer than the MTU is cut into fragments, each with its own header. Each fragment is drawn right under the slice of data it carries, so the offsets read straight off the picture. Add a second, smaller MTU, or set DF and watch it get dropped.',
      ),
      facts: sim.ok ? [[T('原数据长度', 'Data length'), `${sim.total} − ${sim.hdr} = ${sim.data} B`], [T('每片最多数据', 'Data per fragment'), `${sim.per} B`]] : [],
    },
    start: { nodes: [], frame: { rect: [-40, 40, X0 + W + 250, sim.ok ? FY + Math.max(1, sim.frags.length) * FG + (sim.second.length ? 34 + sim.second.length * FG : 0) + 30 : 500] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [];
  if (!sim.need) {
    list.push({ title: T('不用分片', 'No fragmentation needed'), desc: T(`${sim.total} ≤ MTU ${sim.mtu}`, `${sim.total} ≤ MTU ${sim.mtu}`), detail: T(`数据报总长 ${sim.total} B 不超过 MTU ${sim.mtu} B，一帧就装得下，直接转发。`, `${sim.total} B fits in one ${sim.mtu} B frame and is forwarded as is.`), ref: 'why', st: {}, row: { color: 'green', what: T('检查长度', 'Check'), result: T('不用分片', 'no need'), tone: 'ok' } });
  } else {
    const head = T(`原数据 = ${sim.total} − ${sim.hdr} = ${sim.data} B。每片数据最多 ⌊(${sim.mtu} − ${sim.hdr}) ÷ 8⌋ × 8 = ${sim.per} B${(sim.mtu - sim.hdr) % 8 ? `（${sim.mtu - sim.hdr} 不是 8 的倍数，要向下取）` : ''}。`, `Data = ${sim.total} − ${sim.hdr} = ${sim.data} B. Each fragment carries at most ⌊(${sim.mtu} − ${sim.hdr}) ÷ 8⌋ × 8 = ${sim.per} B.`);
    list.push({
      title: T(`每片最多带 ${sim.per} B 数据`, `Up to ${sim.per} B per fragment`),
      desc: T(`${sim.total} B > MTU ${sim.mtu}，要分片`, `${sim.total} B > MTU ${sim.mtu}`),
      detail: sim.dropped ? head : { zh: head.zh + `要切成 ${sim.frags.length} 片。`, en: head.en + ` That makes ${sim.frags.length} fragments.` },
      ref: 'how',
      st: { cut: !sim.dropped },
      row: { color: 'slate', what: T('每片数据', 'Per fragment'), result: `${sim.per} B`, tone: 'info' },
    });
    if (sim.dropped) {
      list.push({ title: T('DF = 1：丢弃', 'DF = 1: dropped'), desc: T('发回 ICMP 差错报告', 'ICMP error sent back'), detail: T(`首部里 DF = 1，不允许分片，可数据报又比 MTU 长。路由器只能丢弃它，并向源主机发回 ICMP 终点不可达报文（需要分片但设置了 DF）。`, 'DF = 1 forbids fragmenting, yet the datagram is too long. The router drops it and returns an ICMP destination-unreachable (fragmentation needed).'), ref: 'more', st: { drop: true }, row: { color: 'rose', what: T('DF = 1', 'DF = 1'), result: T('丢弃', 'dropped'), tone: 'warn' } });
    } else {
      sim.frags.forEach((f, i) => {
        const last = i === sim.frags.length - 1;
        list.push({
          title: T(`第 ${i + 1} 片：偏移 ${f.field}，MF = ${f.MF}`, `Fragment ${i + 1}: offset ${f.field}, MF = ${f.MF}`),
          desc: T(`数据 ${f.len} B，总长 ${f.total} B`, `${f.len} B data, ${f.total} B total`),
          detail: T(`带走原数据的第 ${f.off}～${f.off + f.len - 1} 字节，共 ${f.len} B。总长度 = ${sim.hdr} + ${f.len} = ${f.total}；片偏移 = ${f.off} ÷ 8 = ${f.field}；${last ? '这是最后一片，MF = 0' : '后面还有，MF = 1'}；标识和原数据报相同。`, `Carries bytes ${f.off}–${f.off + f.len - 1}. Total = ${sim.hdr} + ${f.len} = ${f.total}; offset = ${f.off} ÷ 8 = ${f.field}; ${last ? 'last one, MF = 0' : 'more to come, MF = 1'}.`),
          ref: 'how',
          st: { cut: true, f: i + 1 },
          facts: [[T('总长度', 'Total length'), String(f.total)], ['MF', String(f.MF)], [T('片偏移', 'Offset'), String(f.field)]],
          row: { color: TONES[i % 8], what: T(`第 ${i + 1} 片`, `Fragment ${i + 1}`), result: `${f.total} · ${f.MF} · ${f.field}`, tone: 'info', info: T(`总长 ${f.total}，MF ${f.MF}，偏移 ${f.field}`, `len ${f.total}, MF ${f.MF}, off ${f.field}`) },
        });
      });
      sim.second.forEach((g, i) => {
        list.push({
          title: g.split ? T(`第 ${i + 1} 片再切成 ${g.pieces.length} 片`, `Fragment ${i + 1} cut into ${g.pieces.length}`) : T(`第 ${i + 1} 片不用再切`, `Fragment ${i + 1} fits`),
          desc: T(`偏移 ${g.pieces.map((p) => p.field).join('、')}`, `offsets ${g.pieces.map((p) => p.field).join(', ')}`),
          detail: g.split
            ? T(`第 ${i + 1} 片总长 ${g.from.total} B，比 MTU ${sim.mtu2} 长。每小片最多 ${g.per2} B 数据，切成 ${g.pieces.map((p) => `${p.len}`).join(' + ')}。偏移按原始数据算：${g.pieces.map((p) => `${p.off} ÷ 8 = ${p.field}`).join('，')}。${g.from.MF ? '原来这片 MF = 1，切出的都是 MF = 1。' : '原来是最后一片，只有切出的最后一小片 MF = 0。'}`, `Fragment ${i + 1} (${g.from.total} B) exceeds MTU ${sim.mtu2}; pieces of up to ${g.per2} B: ${g.pieces.map((p) => p.len).join(' + ')}. Offsets stay relative to the original data: ${g.pieces.map((p) => p.field).join(', ')}.`)
            : T(`第 ${i + 1} 片总长 ${g.from.total} B，不超过 MTU ${sim.mtu2}，原样通过。`, `Fragment ${i + 1} (${g.from.total} B) fits MTU ${sim.mtu2}.`),
          ref: 'more',
          st: { cut: true, f: sim.frags.length, second: true, s: i + 1 },
          row: { color: TONES[i % 8], what: T(`再分第 ${i + 1} 片`, `Refragment ${i + 1}`), result: String(g.pieces.length), tone: 'info', info: T(g.pieces.map((p) => `${p.total}/${p.field}/MF${p.MF}`).join('  '), g.pieces.map((p) => `${p.total}/${p.field}/MF${p.MF}`).join('  ')) },
        });
      });
      const all = sim.second.length ? sim.second.flatMap((g) => g.pieces) : sim.frags;
      list.push({
        title: T(`目的主机重组 ${all.length} 片`, `The destination reassembles ${all.length} pieces`),
        desc: T('按标识归组、按偏移排序', 'Group by ID, sort by offset'),
        detail: T(`中途路由器不重组。目的主机把标识相同的 ${all.length} 片放在一起，按片偏移 × 8 放回原位置；收到 MF = 0 的那一片，并且前面没有缺口，就说明收齐了，拼回 ${sim.data} B 的数据。任何一片丢失，整个数据报都作废。`, `Routers never reassemble. The destination groups the ${all.length} pieces by ID, places each at offset × 8 and is done once the MF = 0 piece has arrived with no gaps: ${sim.data} B again. Losing any piece loses the datagram.`),
        ref: 'more',
        st: { cut: true, f: sim.frags.length, s: sim.second.length, second: !!sim.second.length },
        row: { color: 'green', what: T('重组', 'Reassemble'), result: `${sim.data} B`, tone: 'ok' },
      });
    }
  }
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: !sim.need ? T('一帧装得下', 'Fits in one frame') : sim.dropped ? T('被丢弃', 'Dropped') : T(`分成 ${sim.frags.length} 片`, `${sim.frags.length} fragments`),
    text: T('改一下 MTU，看每片的数据长度怎么向下取到 8 的倍数；加一段更小的 MTU，看偏移是不是仍按原始数据算。', 'Change the MTU to see the 8-byte rounding; add a smaller second MTU to see offsets stay relative to the original.'),
    facts: sim.need && !sim.dropped ? [[T('各片 总长/偏移/MF', 'len/off/MF'), sim.frags.map((f) => `${f.total}/${f.field}/${f.MF}`).join('  ')]] : [],
  };
  return lesson;
}

export const makeFrag = () => parametric('ip-frag', SPEC.presets[0].set, build);
