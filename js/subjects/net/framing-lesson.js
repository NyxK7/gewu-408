// 「组帧：字节填充与比特填充」：上面一行是要发的数据，指针一格格往右；中间一行是实际发出的帧，
// 两头是标志，插进去的转义字节 / 0 比特标成橙色；最后接收方把它们去掉，还原出原数据。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { BITFLAG, ESC, FLAG, framing, hx } from './framing.js';

const W = [['net', 'link']];
const MAXW = 940;

const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要组帧', 'Why framing'),
      blocks: [
        { p: T('物理层只管传比特，数据链路层要把网络层交下来的分组加上首部和尾部封装成**帧**，让接收方能从一串比特里找出每一帧从哪开始、到哪结束（**帧定界**）。还要做到**透明传输**：不管数据里是什么比特组合，都不能被误认为帧的边界。', 'The link layer wraps packets into **frames** so the receiver can find their boundaries, and must be **transparent**: no data may look like a boundary.') },
        {
          table: {
            head: [T('方法', 'Method'), T('做法', 'How'), T('问题', 'Weakness')],
            rows: [
              [T('字符计数法', 'Character count'), T('帧首部写出这一帧的字节数', 'a length field in the header'), T('计数字段一出错，后面所有帧都乱了', 'one bad count desynchronises everything after')],
              [T('字节填充法', 'Byte stuffing'), T('特定字节作标志，数据里出现时前面加转义字节', 'flag bytes; escape them inside data'), T('帧长不再固定是原数据长度', 'frames grow')],
              [T('零比特填充法', 'Bit stuffing'), T('标志 01111110；数据里连续 5 个 1 后插一个 0', 'flag 01111110; insert 0 after five 1s'), T('只适合按比特传的同步链路', 'bit-oriented links')],
              [T('违规编码法', 'Code violations'), T('用物理层不会出现的码元（如曼彻斯特编码里的「高—高」）作边界', 'use signals the line code never produces'), T('只能用在有冗余的编码上', 'needs a redundant line code')],
            ],
          },
        },
      ],
    },
    {
      id: 'byte',
      title: T('字节填充', 'Byte stuffing'),
      blocks: [
        { p: T('PPP 在异步链路上用字节填充：帧以 0x7E 开头和结尾，转义字节是 0x7D。', 'PPP on asynchronous links uses flag 0x7E and escape 0x7D.') },
        { list: [
          T('数据里的 0x7E 变成 0x7D 0x5E；', '0x7E becomes 0x7D 0x5E;'),
          T('数据里的 0x7D 变成 0x7D 0x5D（转义字节自己也要转义）；', '0x7D becomes 0x7D 0x5D (the escape itself);'),
          T('数值小于 0x20 的控制字符 x 变成 0x7D 和 x ⊕ 0x20（例如 0x03 → 0x7D 0x23），防止被当成控制字符。', 'control characters x < 0x20 become 0x7D, x ⊕ 0x20.'),
        ] },
        { tip: T('接收方遇到 0x7D 就把它删掉，把下一个字节异或 0x20 还原。所以帧里除了两头，再也不会出现 0x7E。', 'The receiver drops 0x7D and XORs the next byte with 0x20.') },
      ],
    },
    {
      id: 'bit',
      title: T('零比特填充', 'Bit stuffing'),
      blocks: [
        { p: T('HDLC 和同步链路上的 PPP 用标志 01111110（6 个连续的 1）。发送方扫描数据，**每出现连续 5 个 1，就在后面插一个 0**；接收方每看到连续 5 个 1，就把后面那个 0 删掉。这样数据里永远不会出现 6 个连续的 1。', 'Flag 01111110. After **five consecutive 1s** the sender inserts a 0; the receiver removes it.') },
        { warn: T('插入的 0 之后计数从头开始；原数据里本来跟在 5 个 1 后面的 0 也照样要再插一个 0。', 'The count restarts after the inserted 0; even an original 0 after five 1s gets another 0 inserted.') },
      ],
    },
    {
      id: 'ppp',
      title: T('PPP 协议', 'PPP'),
      blocks: [
        { p: T('PPP 是点对点链路上最常用的数据链路层协议（如拨号上网、宽带接入的 PPPoE）。', 'PPP is the usual link protocol for point-to-point links.') },
        {
          table: {
            head: [T('字段', 'Field'), T('长度', 'Size'), T('内容', 'Contents')],
            rows: [
              [T('标志 F', 'Flag'), '1 B', '0x7E'],
              [T('地址 A', 'Address'), '1 B', T('0xFF（点对点，没有意义）', '0xFF')],
              [T('控制 C', 'Control'), '1 B', '0x03'],
              [T('协议', 'Protocol'), '2 B', T('0x0021 IP、0xC021 LCP、0x8021 IPCP（NCP）', '0x0021 IP, 0xC021 LCP, 0x8021 IPCP')],
              [T('信息', 'Information'), T('≤ 1500 B', '≤ 1500 B'), T('不足不用填充', 'no padding')],
              [T('FCS', 'FCS'), '2 B', 'CRC'],
              [T('标志 F', 'Flag'), '1 B', '0x7E'],
            ],
          },
        },
        { list: [
          T('三个组成部分：封装成帧的方法、**链路控制协议 LCP**（建立、配置、测试链路，身份认证）、**网络控制协议 NCP**（为各种网络层协议协商参数，如分配 IP 地址）。', 'Three parts: framing, **LCP** (link setup, options, authentication), and **NCP** (per network protocol, e.g. IP addresses).'),
          T('链路建立过程：链路静止 → 物理链路建立 → LCP 协商 → 鉴别 → NCP 配置 → 链路打开，可以传数据 → 终止。', 'Phases: dead → establish (LCP) → authenticate → network (NCP) → open → terminate.'),
          T('只检错不纠错，**不编号、不确认、不重传**，提供不可靠服务；只支持点对点、全双工。', 'Error detection only: **no numbering, acknowledgements or retransmission**; point-to-point, full duplex.'),
        ] },
      ],
    },
    pit([
      T('零比特填充是「连续 5 个 1 后插 0」，不是 6 个；标志才是 6 个 1。', 'Insert after five 1s; the flag has six.'),
      T('字节填充时转义字节 0x7D 本身也要转义。', 'The escape byte must itself be escaped.'),
      T('PPP 不提供可靠传输，也没有 MAC 地址字段的实际作用。', 'PPP is not reliable and has no meaningful address.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('字节填充：数据里有 7E 和 7D', 'Bytes: data contains 7E and 7D'), set: { mode: 'byte', data: '41 7E 42 7D 43', ctl: false } },
    { label: T('字节填充：控制字符也转义', 'Bytes: escape control characters'), set: { mode: 'byte', data: '48 03 7E 11 69', ctl: true } },
    { label: T('比特填充：一长串 1', 'Bits: a long run of 1s'), set: { mode: 'bit', data: '0110111111111100011111010', ctl: false } },
    { label: T('比特填充：数据里像标志的样子', 'Bits: data that looks like a flag'), set: { mode: 'bit', data: '01111110011111', ctl: false } },
  ],
  groups: [{ legend: T('数据', 'Data'), fields: [
    { name: 'mode', label: T('方法', 'Method'), type: 'select', options: [['byte', T('字节填充（PPP 异步）', 'Byte stuffing (async PPP)')], ['bit', T('零比特填充（HDLC / 同步 PPP）', 'Bit stuffing (HDLC)')]] },
    { name: 'data', label: T('数据（字节用十六进制，空格隔开；比特写 0 和 1）', 'Data (hex bytes, or a bit string)'), type: 'text', parse: (s) => String(s).trim(), wide: true },
    { name: 'ctl', label: T('小于 0x20 的控制字符也转义', 'Escape bytes below 0x20'), type: 'check', show: (p) => p.mode === 'byte' },
  ] }],
  note: T('字节填充：标志 7E，转义 7D，被转义的字节异或 20。比特填充：标志 01111110，连续 5 个 1 后插 0。最多 16 个字节或 48 个比特。', 'Bytes: flag 7E, escape 7D, XOR 20. Bits: flag 01111110, insert 0 after five 1s. Up to 16 bytes or 48 bits.'),
};
const ERR = { bytes: T('字节写成两位十六进制，空格隔开，1～16 个', 'Hex bytes separated by spaces, 1–16'), bits: T('比特串只能有 0 和 1，1～48 位', 'Bits: 0/1 only, 1–48'), mode: T('方法不对', 'Unknown method') };

/** 一排格子，超过 MAXW 换行；返回 html 和高度 */
function row(cells, top) {
  let x = 0;
  let y = 0;
  let h = '';
  for (const c of cells) {
    if (x + c.w > MAXW) {
      x = 0;
      y += 50;
    }
    h += `<g transform="translate(${x} ${top + y})">${cell(c.w - 4, 40, c.t, { size: c.size ?? (c.w > 40 ? 16 : 14), tone: c.tone ?? '', cls: c.hot ? 'hot' : '' })}</g>`;
    x += c.w;
  }
  return { h, height: y + 50 };
}

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const s = k >= 0 ? sim.list[k] : null;
  const byte = sim.mode === 'byte';
  const BW = byte ? 64 : 34;
  let h = '';
  // 原数据
  h += txt(0, 0, z ? '要发送的数据' : 'Data to send', 'bt-lab', 'start');
  const inCells = (byte ? sim.input.map(hx) : [...sim.input]).map((t, i) => {
    const cur = s && s.kind === 'one' && (byte ? i === s.i : i >= s.from && i <= s.to);
    const done = s && (s.kind === 'end' || s.kind === 'recv' || (s.kind === 'one' && (byte ? i < s.i : i < s.from)));
    const special = byte ? [FLAG, ESC].includes(sim.input[i]) || (sim.ctl && sim.input[i] < 0x20) : false;
    return { t, w: BW, tone: cur ? 'amber' : done ? 'slate' : special ? 'rose' : '', hot: cur };
  });
  const r1 = row(inCells, 14);
  h += r1.h;
  // 发出的帧
  const y2 = 14 + r1.height + 40;
  h += txt(0, y2 - 14, z ? '实际发出的帧' : 'Frame on the wire', 'bt-lab', 'start');
  const outLen = !s ? 0 : s.kind === 'one' ? s.outLen : sim.out.length;
  const outCells = [];
  if (s) outCells.push({ t: byte ? '7E' : BITFLAG, w: byte ? BW : 120, tone: 'teal', hot: s.kind === 'start' });
  const outArr = byte ? sim.out.map(hx) : [...sim.out];
  for (let j = 0; j < outLen; j++) {
    const ins = sim.inserted.has(j);
    const fresh = s.kind === 'one' && j >= s.outFrom;
    outCells.push({ t: outArr[j], w: BW, tone: ins ? 'orange' : fresh ? 'amber' : 'blue', hot: fresh });
  }
  if (s && (s.kind === 'end' || s.kind === 'recv')) outCells.push({ t: byte ? '7E' : BITFLAG, w: byte ? BW : 120, tone: 'teal', hot: s.kind === 'end' });
  const r2 = s ? row(outCells, y2) : { h: txt(0, y2 + 24, z ? '（还没开始）' : '(not started)', 'bt-idx', 'start'), height: 50 };
  h += r2.h;
  // 接收方还原
  if (s && s.kind === 'recv') {
    const y3 = y2 + r2.height + 40;
    h += txt(0, y3 - 14, z ? `接收方去掉标志和填充：${sim.same ? '和原数据完全一样 ✓' : '不一样！'}` : `Receiver removes flags and stuffing: ${sim.same ? 'identical ✓' : 'mismatch!'}`, 'bt-lab', 'start');
    h += row((byte ? sim.back.map(hx) : [...sim.back]).map((t) => ({ t, w: BW, tone: 'green' })), y3).h;
  }
  items.push({ k: 'rows', x: 40, y: 110, html: h });
  return items;
}

function build(p, kit, ERR) {
  const sim = framing(p);
  // 画布大小跟着内容走：字节少时别缩成一小块
  const need = !sim.ok ? 600 : sim.mode === 'byte' ? (sim.out.length + 2) * 64 : 240 + sim.out.length * 34;
  const nrow = Math.ceil(need / MAXW);
  const rect = [20, 80, Math.max(560, Math.min(MAXW, need)) + 60, 120 + 3 * (nrow * 50 + 54)];
  const lesson = shell('framing', kit, ERR, sim, {
    where: W,
    tag: T('组帧', 'Frame'),
    name: T('组帧：字节填充与比特填充', 'Framing: byte and bit stuffing'),
    full: T('帧定界与透明传输 · 字符计数 · 字节填充 · 零比特填充 · 违规编码 · PPP 帧格式、LCP 与 NCP', 'Delimiting and transparency · character count · byte stuffing · bit stuffing · code violations · PPP'),
    title: SPEC.presets.find((x) => x.set.mode === p.mode && x.set.data === p.data && !!x.set.ctl === !!p.ctl)?.label ?? T('组帧', 'Framing'),
    legend: [['teal', T('标志', 'Flag')], ['orange', T('插进去的转义字节 / 0', 'Inserted escape / 0')], ['rose', T('需要转义的字节', 'Byte to escape')]],
    principle: PRINCIPLE,
    desc: T('帧的两头是标志，可数据里偏偏也出现了标志的样子怎么办？字节填充在前面加转义字节，零比特填充在连续 5 个 1 后面插一个 0。一格格看发送方怎样填充，最后接收方怎样还原。', 'What if the data contains the flag? Byte stuffing escapes it; bit stuffing inserts a 0 after five 1s. Watch the sender stuff and the receiver restore.'),
    rect,
  });
  if (!sim.ok) return lesson;
  const byte = sim.mode === 'byte';
  // 记下哪些输出位置是插进去的
  sim.inserted = new Set();
  const list = [];
  const push = (o) => list.push(o);
  push({ kind: 'start' });
  if (byte) {
    for (const st of sim.steps) {
      if (st.add.length > 1) sim.inserted.add(st.at);
      push({ kind: 'one', i: st.i, b: st.b, add: st.add, why: st.why, outFrom: st.at, outLen: st.at + st.add.length });
    }
  } else {
    for (const st of sim.steps) {
      if (st.at != null) sim.inserted.add(st.at);
      const outFrom = st.from + sim.steps.filter((x) => x.at != null && x.to < st.from).length;
      push({ kind: 'one', from: st.from, to: st.to, at: st.at, outFrom, outLen: st.at != null ? st.at + 1 : sim.out.length });
    }
  }
  push({ kind: 'end' });
  push({ kind: 'recv' });
  sim.list = list;
  const lines = list.map((s, k) => {
    let d;
    if (s.kind === 'start') d = [T('帧开始：先发一个标志', 'Start with a flag'), byte ? T('发送方先发标志字节 0x7E，接收方看到它就知道一帧开始了。', 'Send 0x7E first.') : T(`先发标志 ${BITFLAG}。`, `Send the flag ${BITFLAG}.`), byte ? 'byte' : 'bit'];
    else if (s.kind === 'one' && byte) {
      const b = hx(s.b);
      d = s.why
        ? [T(`${b}：要转义，发 ${s.add.map(hx).join(' ')}`, `${b}: escaped as ${s.add.map(hx).join(' ')}`), T({ flag: `数据里的 7E 和标志一模一样，接收方会误以为帧结束了，所以发转义字节 7D，再发 7E ⊕ 20 = 5E。`, esc: `数据里的 7D 会被当成转义字节，所以它自己也要转义：7D 5D。`, ctl: `${b} 小于 0x20，是控制字符，发 7D 和 ${b} ⊕ 20 = ${hx(s.add[1])}。` }[s.why], { flag: '7E would look like the end of the frame: send 7D 5E.', esc: '7D must be escaped too: 7D 5D.', ctl: `Control character: 7D ${hx(s.add[1])}.` }[s.why]), 'byte']
        : [T(`${b}：原样发送`, `${b}: as is`), T(`${b} 不是 7E、7D${sim.ctl ? '，也不是控制字符' : ''}，原样发出。`, `${b} is sent unchanged.`), 'byte'];
    } else if (s.kind === 'one') {
      const seg = sim.input.slice(s.from, s.to + 1);
      d = s.at != null
        ? [T(`第 ${s.from + 1}～${s.to + 1} 位：连续 5 个 1，插一个 0`, `Bits ${s.from + 1}–${s.to + 1}: five 1s, insert 0`), T(`发出 ${seg}，此时刚好连着 5 个 1，紧跟着插入一个 0（橙色），计数清零。`, `Send ${seg}, then an inserted 0.`), 'bit']
        : [T(`第 ${s.from + 1}～${s.to + 1} 位：不用再插`, `Bits ${s.from + 1}–${s.to + 1}: nothing to insert`), T(`剩下的 ${seg} 里没有连续 5 个 1，原样发出。`, `${seg} goes out unchanged.`), 'bit'];
    } else if (s.kind === 'end') d = [T('帧结束：再发一个标志', 'End with a flag'), T(`数据发完再发一个标志。原数据 ${byte ? sim.input.length + ' 字节' : sim.input.length + ' 位'}，填充后 ${byte ? sim.out.length + ' 字节' : sim.out.length + ' 位'}，多了 ${sim.added} 个。`, `${sim.added} ${byte ? 'bytes' : 'bits'} were added.`), 'why'];
    else d = [T('接收方还原', 'The receiver restores the data'), byte ? T('接收方去掉头尾的 7E；遇到 7D 就删掉它，把下一个字节异或 20。得到的和原数据一样。', 'Drop the flags; for each 7D, drop it and XOR the next byte with 20.') : T('接收方去掉头尾的标志；每看到连续 5 个 1，就把后面的 0 删掉。得到的和原数据一样。', 'Drop the flags and every 0 that follows five 1s.'), byte ? 'byte' : 'bit'];
    return { title: d[0], desc: T(`已发 ${s.kind === 'one' ? s.outLen : s.kind === 'start' ? 0 : sim.out.length} ${byte ? '字节' : '位'}`, `${s.kind === 'one' ? s.outLen : s.kind === 'start' ? 0 : sim.out.length} sent`), detail: d[1], ref: d[2], st: { k }, row: { color: s.kind === 'one' && (s.why || s.at != null) ? 'orange' : 'blue', what: d[0], result: T(s.kind === 'one' && (s.why || s.at != null) ? '填充' : '—', s.kind === 'one' && (s.why || s.at != null) ? 'stuffed' : '—'), tone: 'info' } };
  });
  const title = T(`填充了 ${sim.added} 个${byte ? '字节' : '比特'}，接收方${sim.same ? '还原正确' : '还原出错'}`, `${sim.added} ${byte ? 'bytes' : 'bits'} stuffed; ${sim.same ? 'restored correctly' : 'mismatch'}`);
  const text = byte ? T(`发出的帧：${sim.frame.map(hx).join(' ')}。中间不会再出现 7E。`, `Frame: ${sim.frame.map(hx).join(' ')}.`) : T(`发出的帧：${sim.frame}。中间不会出现 6 个连续的 1。`, `Frame: ${sim.frame}.`);
  return finish(lesson, lines, (st, z) => board(sim, st, z), title, text);
}

export const makeFraming = make('framing', SPEC, ERR, build);
