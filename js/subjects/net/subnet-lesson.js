// 「子网划分」这节课：32 个位排成一行，IP、掩码、网络地址、广播地址一行一行叠出来；
// 给了主机数需求时，再把整个地址块按 VLSM 切开。
import { SUBNET_PRINCIPLE } from './net-principles.js';
import { bar, boardKit, line, res, txt } from '../../core/board.js';
import { chip } from '../../core/steps.js';
import { L, T, getLang } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { hostCount, simulate, toBin, toInt, toIp } from './subnet.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const dotted = (v) => toBin(v).match(/.{8}/g).join('.');

const SPEC = {
  presets: [
    { label: T('192.168.1.130/26', '192.168.1.130/26'), set: { ip: '192.168.1.130', prefix: 26, needs: [] } },
    { label: T('172.16.45.14/20', '172.16.45.14/20'), set: { ip: '172.16.45.14', prefix: 20, needs: [] } },
    { label: T('VLSM：/24 分给 60、30、12、6 台', 'VLSM: /24 for 60, 30, 12, 6 hosts'), set: { ip: '192.168.10.0', prefix: 24, needs: [60, 30, 12, 6] } },
  ],
  groups: [
    {
      legend: T('地址', 'Address'),
      fields: [
        { name: 'ip', label: T('IP 地址', 'IP address'), type: 'text', parse: (t) => (Number.isNaN(toInt(t)) ? NaN : toIp(toInt(t))) },
        { name: 'prefix', label: T('前缀长度 /n', 'Prefix /n'), type: 'int', min: 0, max: 32 },
        { name: 'needs', label: T('各子网的主机数（可空）', 'Hosts per subnet (optional)'), type: 'list', min: 1, max: 100000, maxLen: 8, allowEmpty: true, wide: true, hint: T('填了就做变长子网划分（VLSM）', 'Fill in to split the block with VLSM') },
      ],
    },
  ],
  note: T(
    '可分配的主机地址数 = 2^主机位数 − 2（主机位全 0 是网络地址，全 1 是广播地址）。VLSM 按主机数从大到小依次分配，每个子网取能容纳「主机数 + 2」的最小 2 的幂。CIDR 不再看 A/B/C 分类，这里列出分类只作参考。',
    'Usable hosts = 2^host bits − 2 (all-zero host bits name the network, all-ones is broadcast). VLSM allocates the largest request first, each subnet being the smallest power of two that fits hosts + 2. CIDR ignores classes; the class is shown for reference only.',
  ),
};

const ERR = {
  ip: T('IP 地址格式不对（例如 192.168.1.130）', 'Malformed IP address (e.g. 192.168.1.130)'),
  prefix: T('前缀长度要在 0～32 之间', 'Prefix must be 0–32'),
  needs: T('主机数需求最多 8 项，每项至少 1', 'At most 8 host counts, each at least 1'),
  noRoom: T('这个地址块放不下所有子网', 'The block is too small for all the subnets'),
};

// ───────────────────────── 画板：位的行 ─────────────────────────

const BW = 18;
const OG = 14;
const bx = (i) => i * BW + Math.floor(i / 8) * OG;
const ROWW = bx(31) + BW;

function bitRow(v, prefix, kind) {
  const b = toBin(v);
  let s = '';
  for (let i = 0; i < 32; i++) {
    const net = i < prefix;
    let tone = net ? 'blue' : 'amber';
    if (kind === 'mask') tone = b[i] === '1' ? 'blue' : '';
    s += `<g transform="translate(${bx(i) + BW / 2} 0)"><g transform="translate(0 -6)">${chip(BW - 2, 24, b[i], { tone, size: 12 })}</g></g>`;
  }
  return s;
}

function geo(sim) {
  const x0 = 150;
  const rowY = (k) => 160 + k * 62;
  const vlsmY = rowY(4) + 30;
  const bottom = sim.subnets.length ? vlsmY + 100 : rowY(3) + 60;
  return { x0, rowY, vlsmY, rect: [10, 90, x0 + ROWW + 20, bottom] };
}

const ROWS = [
  { key: 'ip', zh: 'IP 地址', en: 'IP address' },
  { key: 'mask', zh: '子网掩码', en: 'Mask' },
  { key: 'net', zh: '网络地址', en: 'Network' },
  { key: 'bcast', zh: '广播地址', en: 'Broadcast' },
];

/** 画到第 k 步（k = -1 开始前；0 IP；1 掩码；2 网络地址；3 广播；4 主机范围；5… VLSM） */
function boardAt(sim, k, z) {
  const g = geo(sim);
  const items = [];
  const vals = { ip: sim.ip, mask: sim.mask, net: sim.net, bcast: sim.bcast };
  ROWS.forEach((r, i) => {
    if (k < i) return;
    const y = g.rowY(i);
    items.push({
      k: `row-${r.key}`,
      x: g.x0,
      y,
      from: i === 2 ? [g.x0, g.rowY(0)] : i === 3 ? [g.x0, g.rowY(2)] : [g.x0, y + 20],
      cls: i === Math.min(k, 3) ? 'is-cur' : '',
      html: txt(-16, -4, z ? r.zh : r.en, 'bt-cap', 'end') + txt(-16, 12, toIp(vals[r.key]), 'bt-lab', 'end') + bitRow(vals[r.key], sim.prefix, r.key),
    });
  });
  if (k >= 0) {
    // 网络位 | 主机位 的分界线
    const xb = sim.prefix === 0 ? -6 : sim.prefix === 32 ? ROWW + 6 : bx(sim.prefix) - (sim.prefix % 8 === 0 ? OG / 2 : 0);
    const h = g.rowY(Math.min(Math.max(k, 0), 3)) - g.rowY(0) + 34;
    items.push({ k: 'cut', x: g.x0 + xb, y: g.rowY(0) - 26, html: line(0, -22, 0, h, 'bl-now') + txt(-6, -26, z ? `网络 ${sim.prefix} 位` : `net ${sim.prefix}`, 'bt-net', 'end') + txt(6, -26, z ? `主机 ${sim.hostBits} 位` : `host ${sim.hostBits}`, 'bt-host', 'start') });
    // 每个字节上方标十进制
    const oct = toIp(sim.ip).split('.');
    items.push({ k: 'octs', x: g.x0, y: g.rowY(0) - 30, html: oct.map((o, j) => txt(bx(j * 8) + 4 * BW, 0, o, 'bt-idx')).join('') });
  }
  if (k >= 4) {
    const t = sim.hostBits >= 2 ? (z ? `可用 ${toIp(sim.first)} ～ ${toIp(sim.last)}，共 2^${sim.hostBits} − 2 = ${sim.hosts} 个` : `usable ${toIp(sim.first)} – ${toIp(sim.last)}: 2^${sim.hostBits} − 2 = ${sim.hosts}`) : z ? '主机位不足 2 位，没有可分配的主机地址' : 'fewer than 2 host bits: no usable hosts';
    items.push({ k: 'range', x: g.x0 + ROWW / 2, y: g.rowY(3) + 44, html: txt(0, 0, t, 'bt-range') });
  }
  // VLSM：整个地址块是一根长条，切成几段
  if (sim.subnets.length && k >= 5) {
    const total = sim.bcast - sim.net + 1;
    const W = ROWW;
    items.push({ k: 'block', x: g.x0, y: g.vlsmY + 40, html: bar(W, 20, { cls: 'waiting', d: 0 }) + txt(-18, -6, z ? '地址块' : 'block', 'bt-cap', 'end') + txt(0, 22, toIp(sim.net), 'bt-idx', 'start') + txt(W, 22, toIp(sim.bcast), 'bt-idx', 'end') });
    const tones = ['blue', 'green', 'violet', 'teal', 'rose', 'orange', 'amber', 'slate'];
    sim.subnets.slice(0, k - 4).forEach((s, j) => {
      const xa = ((s.net - sim.net) / total) * W;
      const w = Math.max(3, (s.size / total) * W);
      items.push({
        k: `sub-${j}`,
        x: g.x0 + xa,
        y: g.vlsmY + 40,
        from: [g.x0 + xa, g.vlsmY],
        cls: j === k - 5 ? 'is-cur' : '',
        html: bar(w, 20, { tone: tones[s.i % 8], d: 0 }) + (w > 46 ? txt(w / 2, -30, `/${s.prefix}`, 'bt-lab') + txt(w / 2, -44, z ? `需 ${s.need}` : `${s.need} hosts`, 'bt-dim') : ''),
      });
    });
  }
  return items;
}

// ───────────────────────── 文案与解析 ─────────────────────────

function regs(sim, which) {
  const segs = (p) => [
    { hi: 31, lo: 32 - p, tone: 'blue', label: T('网络号', 'Network') },
    { hi: 31 - p, lo: 0, tone: 'amber', label: T('主机号', 'Host') },
  ];
  const all = { ip: [T('IP 地址', 'IP address'), sim.ip], mask: [T('子网掩码', 'Mask'), sim.mask], net: [T('网络地址', 'Network'), sim.net], bcast: [T('广播地址', 'Broadcast'), sim.bcast] };
  let start = 0;
  return which.map((w) => {
    const [name, v] = all[w];
    const r = { name, value: v, width: 32, segs: segs(sim.prefix).filter((s) => s.hi >= s.lo), start, note: toIp(v) };
    start += 32;
    return r;
  });
}

function decode(ev) {
  const { sim, k } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  const pick = [['ip'], ['ip', 'mask'], ['ip', 'mask', 'net'], ['net', 'bcast'], ['net', 'bcast']][Math.min(k, 4)];
  const rs = regs(sim, pick);
  const layers = rs.map((r) => ({
    name: r.name,
    summary: toIp(r.value),
    start: r.start,
    end: r.start + 32,
    open: true,
    fields: [
      ...(sim.prefix > 0 ? [{ label: T('网络号', 'Network part'), value: `${sim.prefix} ${getLang() === 'zh' ? '位' : 'bits'}`, start: r.start, end: r.start + sim.prefix, tone: 'blue' }] : []),
      ...(sim.prefix < 32 ? [{ label: T('主机号', 'Host part'), value: `${sim.hostBits} ${getLang() === 'zh' ? '位' : 'bits'}`, start: r.start + sim.prefix, end: r.start + 32, tone: 'amber' }] : []),
      info(T('二进制', 'Binary'), dotted(r.value)),
    ],
  }));
  if (k >= 5) {
    const s = sim.subnets[k - 5];
    layers.unshift({ name: T(`子网 ${k - 4}`, `Subnet ${k - 4}`), summary: `${toIp(s.net)}/${s.prefix}`, start: 0, end: 0, open: true, fields: [info(T('需求', 'Needs'), String(s.need)), info(T('大小', 'Size'), `2^${32 - s.prefix} = ${s.size}`), info(T('范围', 'Range'), `${toIp(s.net)} ~ ${toIp(s.bcast)}`), info(T('掩码', 'Mask'), toIp(s.mask))] });
  }
  return {
    label: T('地址解析', 'Address decoder'),
    tag: { color: 'blue', text: `/${sim.prefix}` },
    title: L(ev.what),
    meta: [
      ['IP', toIp(sim.ip)],
      [T('掩码', 'Mask'), toIp(sim.mask)],
    ],
    hint: T('悬停字段，位格子里对应的位会高亮。', 'Hover a field to light up its bits.'),
    unit: 'bit',
    view: { kind: 'bits', regs: rs },
    layers,
  };
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('计算步骤', 'Steps'),
  emptyRows: T('按「播放」或「单步」，每一步算出的地址会记在这里。点任意一行看按位拆分。', 'Press Play or Step; each computed address is logged here. Click a row for its bits.'),
  cols: [
    { label: T('序号', 'No.'), cls: 'col-no' },
    { label: T('计算', 'Step'), cls: 'col-op' },
    { label: T('结果', 'Result'), cls: 'col-info' },
  ],
  cells: (ev, idx) => [`<i class="dot"></i>${idx + 1}`, L(ev.what), L(ev.value)],
  decode,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'subnet',
    kit,
    where: [['net', 'network']],
    principle: SUBNET_PRINCIPLE,
    tag: 'CIDR',
    name: T('子网划分与 CIDR', 'Subnetting and CIDR'),
    full: T('掩码 · 网络地址 · 广播地址 · 主机范围 · VLSM', 'Mask · network · broadcast · host range · VLSM'),
    title: T(`${params.ip}/${params.prefix}`, `${params.ip}/${params.prefix}`),
    badge: `/${params.prefix}`,
    nodes: [],
    legend: [
      ['blue', T('网络位', 'Network bits')],
      ['amber', T('主机位', 'Host bits')],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        'IP 地址的前一段是网络号、后一段是主机号，前缀 /n 说明前 n 位是网络号。把地址和掩码逐位对齐，网络地址、广播地址和主机范围就一目了然。下面可以改地址、前缀，或填几个子网的主机数做变长子网划分。',
        'The first part of an IP address is the network, the rest the host; a /n prefix says the first n bits are network. Line the address up with the mask bit by bit and the network, broadcast and host range fall out. Change the address or prefix, or give host counts to split the block with VLSM.',
      ),
      facts: sim.ok
        ? [
            [T('分类（参考）', 'Class (reference)'), both((z) => `${sim.klass}${sim.private ? (z ? ' · 私有地址' : ' · private') : ''}`)],
            [T('网络位 / 主机位', 'Network / host bits'), `${sim.prefix} / ${sim.hostBits}`],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const boardEv = (k) => ({ type: 'board', items: boardAt(sim, k, true), itemsEn: boardAt(sim, k, false) });
  const row = (k, what, value) => ({ type: 'row', color: k >= 5 ? 'green' : k === 1 ? 'slate' : 'blue', k, sim, what, value });
  const ipStr = toIp(sim.ip);
  const octIdx = Math.min(3, Math.floor(sim.prefix / 8));
  const ipOct = (sim.ip >>> (24 - octIdx * 8)) & 255;
  const mOct = (sim.mask >>> (24 - octIdx * 8)) & 255;
  const steps = [
    {
      title: T('把 IP 地址写成二进制', 'Write the address in binary'),
      desc: T(`${ipStr}/${sim.prefix}`, `${ipStr}/${sim.prefix}`),
      detail: both((z) => (z ? `IP 地址 ${ipStr} 的每个字节换成 8 位二进制：${dotted(sim.ip)}。前缀 /${sim.prefix} 表示前 ${sim.prefix} 位是网络号，后 ${sim.hostBits} 位是主机号。` : `Each byte of ${ipStr} becomes 8 bits: ${dotted(sim.ip)}. The /${sim.prefix} prefix makes the first ${sim.prefix} bits the network and the last ${sim.hostBits} the host.`)),
      facts: [
        ['IP', ipStr],
        [T('二进制', 'Binary'), dotted(sim.ip)],
      ],
      events: [boardEv(0), row(0, T('写成二进制', 'Binary'), dotted(sim.ip))],
    },
    {
      title: T('前缀长度 → 子网掩码', 'Prefix → subnet mask'),
      desc: T(`/${sim.prefix} = ${toIp(sim.mask)}`, `/${sim.prefix} = ${toIp(sim.mask)}`),
      detail: both((z) => (z ? `/${sim.prefix} 就是 ${sim.prefix} 个 1 后面接 ${sim.hostBits} 个 0：${dotted(sim.mask)}，写成点分十进制是 ${toIp(sim.mask)}。` : `/${sim.prefix} is ${sim.prefix} ones followed by ${sim.hostBits} zeros: ${dotted(sim.mask)}, or ${toIp(sim.mask)} in dotted decimal.`)),
      facts: [[T('子网掩码', 'Mask'), toIp(sim.mask)]],
      events: [boardEv(1), row(1, T('子网掩码', 'Mask'), `/${sim.prefix} = ${toIp(sim.mask)}`)],
    },
    {
      title: T('按位与，得到网络地址', 'AND them: the network address'),
      desc: T(`网络地址 ${toIp(sim.net)}`, `Network ${toIp(sim.net)}`),
      detail: both((z) =>
        z
          ? `IP 和掩码逐位相与：掩码为 1 的位保持不变，为 0 的位（主机位）全部变成 0。${sim.prefix % 8 && sim.prefix < 32 ? `网络位和主机位的分界落在第 ${octIdx + 1} 个字节：${ipOct} = ${ipOct.toString(2).padStart(8, '0')}，与 ${mOct.toString(2).padStart(8, '0')} 相与得 ${(ipOct & mOct).toString(2).padStart(8, '0')} = ${ipOct & mOct}。` : ''}网络地址是 ${toIp(sim.net)}。`
          : `AND the address with the mask: bits under a 1 stay, host bits become 0. ${sim.prefix % 8 && sim.prefix < 32 ? `The boundary falls in byte ${octIdx + 1}: ${ipOct} = ${ipOct.toString(2).padStart(8, '0')} AND ${mOct.toString(2).padStart(8, '0')} = ${ipOct & mOct}. ` : ''}The network address is ${toIp(sim.net)}.`,
      ),
      facts: [[T('网络地址', 'Network'), `${toIp(sim.net)}/${sim.prefix}`]],
      events: [boardEv(2), row(2, T('网络地址 = IP AND 掩码', 'Network = IP AND mask'), toIp(sim.net))],
    },
    {
      title: T('主机位全置 1，得到广播地址', 'Set host bits: the broadcast address'),
      desc: T(`广播地址 ${toIp(sim.bcast)}`, `Broadcast ${toIp(sim.bcast)}`),
      detail: both((z) => (z ? `网络位不变，后面 ${sim.hostBits} 个主机位全部置 1，就是这个网络的广播地址 ${toIp(sim.bcast)}。` : `Keep the network bits and set all ${sim.hostBits} host bits to 1: the broadcast address ${toIp(sim.bcast)}.`)),
      facts: [[T('广播地址', 'Broadcast'), toIp(sim.bcast)]],
      events: [boardEv(3), row(3, T('广播地址', 'Broadcast'), toIp(sim.bcast))],
    },
    {
      title: T('可分配的主机地址', 'Usable host addresses'),
      desc: T(`共 ${sim.hosts} 个`, `${sim.hosts} hosts`),
      detail: both((z) =>
        sim.hostBits >= 2
          ? z
            ? `主机位全 0 的是网络地址、全 1 的是广播地址，都不能分给主机，所以可分配 2^${sim.hostBits} − 2 = ${sim.hosts} 个：从 ${toIp(sim.first)}（网络地址 + 1）到 ${toIp(sim.last)}（广播地址 − 1）。`
            : `All-zero host bits name the network and all-ones is broadcast, so 2^${sim.hostBits} − 2 = ${sim.hosts} remain: ${toIp(sim.first)} (network + 1) to ${toIp(sim.last)} (broadcast − 1).`
          : z
            ? `只剩 ${sim.hostBits} 个主机位，按 2^n − 2 计算没有可分配的主机地址（/31 在点对点链路上有特殊用法，/32 表示单台主机）。`
            : `Only ${sim.hostBits} host bit(s) remain, so 2^n − 2 leaves none (/31 has a special point-to-point use, /32 names a single host).`,
      ),
      facts: [
        [T('第一个', 'First'), sim.first == null ? '—' : toIp(sim.first)],
        [T('最后一个', 'Last'), sim.last == null ? '—' : toIp(sim.last)],
        [T('数量', 'Count'), `2^${sim.hostBits} − 2 = ${sim.hosts}`],
      ],
      events: [boardEv(4), row(4, T('可用主机', 'Usable hosts'), sim.first == null ? '0' : `${toIp(sim.first)} ~ ${toIp(sim.last)} (${sim.hosts})`)],
    },
  ];
  sim.subnets.forEach((s, j) => {
    const k = 5 + j;
    steps.push({
      title: T(`VLSM：给需要 ${s.need} 台主机的子网分配地址`, `VLSM: a subnet for ${s.need} hosts`),
      desc: T(`${toIp(s.net)}/${s.prefix}`, `${toIp(s.net)}/${s.prefix}`),
      detail: both((z) =>
        (j === 0 ? (z ? `先把需求从大到小排好：${sim.subnets.map((x) => x.need).join('、')}，大的先分，地址块才不会被切碎。` : `Sort the requests largest first (${sim.subnets.map((x) => x.need).join(', ')}) so the block is not fragmented. `) : '') +
        (z
          ? `${s.need} 台主机加上网络地址和广播地址要 ${s.need + 2} 个地址，最小的 2 的幂是 ${s.size} = 2^${32 - s.prefix}，所以主机位 ${32 - s.prefix} 位、前缀 /${s.prefix}，掩码 ${toIp(s.mask)}。从 ${toIp(s.net)} 开始分：${toIp(s.net)} ~ ${toIp(s.bcast)}，可用 ${toIp(s.first)} ~ ${toIp(s.last)}。`
          : `${s.need} hosts plus network and broadcast need ${s.need + 2} addresses; the smallest power of two is ${s.size} = 2^${32 - s.prefix}, so ${32 - s.prefix} host bits, prefix /${s.prefix}, mask ${toIp(s.mask)}. Starting at ${toIp(s.net)}: ${toIp(s.net)} – ${toIp(s.bcast)}, usable ${toIp(s.first)} – ${toIp(s.last)}.`),
      ),
      facts: [
        [T('前缀', 'Prefix'), `/${s.prefix}`],
        [T('范围', 'Range'), `${toIp(s.net)} ~ ${toIp(s.bcast)}`],
        [T('可用', 'Usable'), `${toIp(s.first)} ~ ${toIp(s.last)}（${s.hosts}）`],
      ],
      events: [boardEv(k), row(k, T(`子网 ${j + 1}（${s.need} 台）`, `Subnet ${j + 1} (${s.need} hosts)`), `${toIp(s.net)}/${s.prefix}`)],
    });
  });
  lesson.steps = steps;
  lesson.start.events = [boardEv(-1)];
  lesson.outro = {
    title: T('地址算完了', 'Addresses worked out'),
    text: T(
      '记住三件事：网络地址 = IP AND 掩码；广播地址 = 网络地址把主机位全置 1；可用主机数 = 2^主机位数 − 2。考试里常见的变化是给出主机数反推前缀，或者判断两个地址是否在同一子网（各自与掩码相与后比较）。',
      'Three rules: network = IP AND mask; broadcast = network with all host bits set; usable hosts = 2^host bits − 2. Exams also ask you to derive the prefix from a host count, or whether two addresses share a subnet (AND each with the mask and compare).',
    ),
    facts: [
      [T('网络地址', 'Network'), `${toIp(sim.net)}/${sim.prefix}`],
      [T('广播地址', 'Broadcast'), toIp(sim.bcast)],
      [T('可用主机', 'Usable hosts'), String(hostCount(sim.prefix))],
      ...(sim.subnets.length ? [[T('VLSM 剩余', 'VLSM left over'), both((z) => (z ? `${sim.free} 个地址` : `${sim.free} addresses`))]] : []),
    ],
  };
  return lesson;
}

export const makeSubnet = () => parametric('subnet', DEFAULTS, build);
