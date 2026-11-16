// 「TCP 序号、确认号与流量控制」：左边是时序图（A、B 两条竖线，时间往下走），报文段斜着飞向 B，确认斜着飞回 A；
// 右边上面是 B 的接收缓存（还没被应用读走的占了多少），下面是 A 眼里的字节流：已确认、已发未确认、窗口内还能发、不能发。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { tcpFlow } from './tcpflow.js';

const W = [['net', 'transport']];
const AX = 200;
const BX = 560;
const Y0 = 150;
const SEG = 26;
const PX = 660; // 右边面板
const PW = 300;

const roundH = (r) => 36 + Math.max(1, r.segs.length + (r.probe ? 1 : 0)) * SEG + 64;

const PRINCIPLE = {
  sections: [
    {
      id: 'seq',
      title: T('序号和确认号', 'Sequence and acknowledgement numbers'),
      blocks: [
        { p: T('TCP 是**面向字节流**的：把要发的数据看成一串字节，每个字节都编号。报文段首部的**序号**是这个报文段数据的**第一个字节**的编号；**确认号**是期望收到对方**下一个**报文段数据的第一个字节的编号，表示这之前的都收到了（**累积确认**）。', 'TCP numbers every byte. The **sequence number** is the first byte of the segment; the **ack number** is the next byte expected (**cumulative**).') },
        { formula: T('下一个报文段的序号 = 本报文段序号 + 数据长度', 'next seq = seq + length') },
        { list: [
          T('例：序号 301、数据 100 字节，这一段是第 301～400 字节；收方正确收到后发确认号 401。', 'Seq 301 with 100 bytes covers 301–400; the ack is 401.'),
          T('SYN、FIN 报文段不带数据也要消耗一个序号；纯确认报文段（只有 ACK）不消耗序号。', 'SYN and FIN consume one number; a pure ACK does not.'),
          T('初始序号 ISN 在建立连接时随机选，第一个数据字节的序号是 ISN + 1。', 'The first data byte is ISN + 1.'),
        ] },
      ],
    },
    {
      id: 'flow',
      title: T('流量控制：接收窗口', 'Flow control: the receive window'),
      blocks: [
        { p: T('**流量控制**是让发送方别发得太快，免得接收方的缓存装不下。接收方在每个确认里填**窗口**字段 rwnd = 接收缓存里还空着的字节数；发送方已发出但未被确认的数据不能超过 rwnd。', '**Flow control** keeps the sender from overrunning the receiver: each ACK advertises **rwnd**, the free buffer space.') },
        { formula: T('发送窗口 = min(接收窗口 rwnd, 拥塞窗口 cwnd)', 'send window = min(rwnd, cwnd)') },
        { tip: T('接收缓存里放的是「已经收到、但应用进程还没读走」的数据。应用读得慢，缓存就满，窗口就缩小直到 0。', 'The buffer holds data received but not yet read; a slow reader shrinks the window to 0.') },
      ],
    },
    {
      id: 'zero',
      title: T('零窗口和持续计时器', 'Zero window and the persist timer'),
      blocks: [
        { p: T('B 通告窗口 0 之后，A 就停止发数据。等 B 的缓存空出来，B 会发一个窗口不为 0 的确认——可这个确认如果丢了，A 等 B 的新窗口、B 等 A 的数据，就**死锁**了。', 'After rwnd = 0 the sender stops. If B’s window update is lost, both wait forever: a **deadlock**.') },
        { p: T('所以 A 收到零窗口通知后启动**持续计时器**，计时器到期就发一个**零窗口探测报文段**（只带 1 字节数据）。B 回的确认里带着当前的窗口；还是 0 就重设计时器，不是 0 就可以继续发。', 'So A starts a **persist timer** and sends a 1-byte **zero-window probe** when it expires; B answers with its current window.') },
        { warn: T('即使窗口为 0，接收方也必须接收零窗口探测报文段、紧急数据和只有确认的报文段，并且回复确认。', 'A receiver must still accept probes, urgent data and pure ACKs at zero window.') },
      ],
    },
    pit([
      T('确认号是「期望的下一个字节」，不是「收到的最后一个字节」。', 'The ack number is the next byte expected, not the last received.'),
      T('流量控制看接收方（rwnd），拥塞控制看网络（cwnd），发送窗口取两者的较小值。', 'Flow control is about the receiver, congestion control about the network.'),
      T('窗口字段是接收方告诉发送方的，单位是字节。', 'The window field is set by the receiver, in bytes.'),
    ]),
  ],
};

const listOf = (s) => (Array.isArray(s) ? s : String(s ?? '').split(/[\s,，]+/).filter(Boolean).map(Number));
const SPEC = {
  presets: [
    { label: T('应用读得慢：窗口变 0，零窗口探测', 'A slow reader: zero window and probes'), set: { seq0: 1, mss: 200, total: 1200, buf: 600, reads: [0, 200, 0, 0, 400] } },
    { label: T('应用读得快：窗口一直够用', 'A fast reader: the window stays open'), set: { seq0: 1001, mss: 300, total: 1800, buf: 900, reads: [] } },
    { label: T('缓存比 MSS 大不了多少', 'A buffer barely above the MSS'), set: { seq0: 1, mss: 500, total: 1500, buf: 600, reads: [300, 300] } },
  ],
  groups: [{ legend: T('A 向 B 发数据', 'A sends to B'), fields: [
    { name: 'seq0', label: T('第一个数据字节的序号', 'Sequence number of the first byte'), type: 'int', min: 0, max: 1000000000 },
    { name: 'mss', label: 'MSS', type: 'int', min: 10, max: 2000 },
    { name: 'total', label: T('一共要发（字节）', 'Bytes to send'), type: 'int', min: 1, max: 6000 },
    { name: 'buf', label: T('B 的接收缓存（字节）', 'B’s buffer (bytes)'), type: 'int', min: 10, max: 6000 },
    { name: 'reads', label: T('B 的应用每轮读走多少（列表用完后每轮读空）', 'Bytes B’s application reads per round'), type: 'text', parse: listOf, wide: true },
  ] }],
  note: T('按轮推进：每轮 A 按最近的窗口发，B 收下、应用读一部分、回确认。开始时窗口等于整个缓存。不考虑丢包和拥塞窗口。', 'Round by round; the initial window is the whole buffer. No loss, no congestion window.'),
};
const ERR = { seq0: T('序号 0～10⁹', 'Sequence 0–10⁹'), mss: T('MSS 10～2000', 'MSS 10–2000'), total: T('1～6000 字节', '1–6000 bytes'), buf: T('缓存至少一个 MSS，最多 6000', 'Buffer between MSS and 6000'), reads: T('读的字节数用空格或逗号隔开，最多 12 个', 'Up to 12 non-negative numbers') };

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const r = k >= 0 ? Math.floor(k / 2) : -1;
  const half = k >= 0 ? k % 2 : -1; // 0 发，1 确认
  // 时序图
  let h = txt(AX, Y0 - 34, z ? 'A（发送方）' : 'A (sender)', 'bt-lab');
  h += txt(BX, Y0 - 34, z ? 'B（接收方）' : 'B (receiver)', 'bt-lab');
  let y = Y0;
  const lastY = Y0 + sim.rounds.slice(0, Math.max(0, r) + 1).reduce((s, x) => s + roundH(x), 0);
  h += `<g class="barw"><line x1="${AX}" y1="${Y0 - 18}" x2="${AX}" y2="${lastY + 10}"/><line x1="${BX}" y1="${Y0 - 18}" x2="${BX}" y2="${lastY + 10}"/></g>`;
  sim.rounds.forEach((rd, i) => {
    if (i > r) return;
    const cur = i === r;
    h += txt(AX - 20, y + 16, z ? `第 ${i + 1} 轮` : `round ${i + 1}`, 'bt-idx', 'end');
    let yy = y + 10;
    for (const s of rd.segs) {
      h += arrow(AX, yy, BX, yy + 20, cur && half === 0 ? 'acc' : '');
      h += txt((AX + BX) / 2, yy + 4, `seq=${s.seq}, ${s.len}B`, cur && half === 0 ? 'ar-mono' : 'bt-idx');
      yy += SEG;
    }
    if (rd.probe) {
      h += arrow(AX, yy, BX, yy + 20, 'bad dash');
      h += txt((AX + BX) / 2, yy + 4, z ? `零窗口探测 seq=${rd.probe.seq}, 1B` : `probe seq=${rd.probe.seq}, 1B`, 'cw-lab bad');
      h += txt(BX + 10, yy + 24, z ? '缓存满，丢弃这 1 字节' : 'buffer full: dropped', 'bt-idx', 'start');
      yy += SEG;
    }
    if (i < r || half === 1) {
      const ay = yy + 34;
      h += txt(BX + 10, ay - 10, z ? `应用读走 ${rd.read}B` : `app reads ${rd.read} B`, 'bt-idx', 'start');
      h += arrow(BX, ay, AX, ay + 20, rd.zero ? 'bad' : 'ok');
      h += txt((AX + BX) / 2, ay + 4, `ACK=${rd.ack.ack}, rwnd=${rd.ack.rwnd}`, rd.zero ? 'cw-lab bad' : cur ? 'ar-mono' : 'bt-idx');
    }
    y += roundH(rd);
  });
  if (r < 0) h += txt((AX + BX) / 2, Y0 + 30, z ? `开始时 B 通告窗口 ${sim.buf}（整个缓存）` : `B starts with rwnd = ${sim.buf}`, 'bt-cap');
  items.push({ k: 'seqd', x: 0, y: 0, html: h });

  // 右：B 的接收缓存
  const rd = r >= 0 ? sim.rounds[r] : null;
  const inBuf = !rd ? 0 : half === 0 ? rd.filled : rd.buffered;
  let p = txt(0, -14, z ? `B 的接收缓存（${sim.buf}B）` : `B’s buffer (${sim.buf} B)`, 'bt-lab', 'start');
  const fw = (inBuf / sim.buf) * PW;
  p += `<g>${cell(PW, 36, '', {})}</g>`;
  if (fw > 0) p += `<g>${cell(Math.max(4, fw), 36, z ? `待读 ${inBuf}` : `${inBuf} unread`, { size: 12, tone: 'amber' })}</g>`;
  p += txt(PW, 56, z ? `空闲 ${sim.buf - inBuf} = 能通告的窗口` : `free ${sim.buf - inBuf} = window`, sim.buf - inBuf === 0 ? 'cw-lab bad' : 'bt-cap', 'end');
  if (rd) p += txt(0, 56, z ? `应用已读走 ${half === 0 ? rd.delivered - rd.read : rd.delivered}B` : `read so far ${half === 0 ? rd.delivered - rd.read : rd.delivered} B`, 'bt-cap', 'start');
  // 右下：A 的字节流
  const prev = r > 0 ? sim.rounds[r - 1] : null;
  const ackA = !rd ? sim.seq0 : half === 1 ? rd.ack.ack : prev ? prev.ack.ack : sim.seq0;
  const winA = !rd ? sim.buf : half === 1 ? rd.ack.rwnd : prev ? prev.ack.rwnd : sim.buf;
  const sentA = !rd ? sim.seq0 : rd.sent;
  const sc = PW / sim.total;
  const seg = (from, to, tone, label) => (to > from ? `<g transform="translate(${(from - sim.seq0) * sc} 110)">${cell(Math.max(3, (to - from) * sc), 36, (to - from) * sc > 46 ? label : '', { size: 11, tone })}</g>` : '');
  p += txt(0, 96, z ? 'A 要发的字节流' : 'A’s byte stream', 'bt-lab', 'start');
  p += `<g transform="translate(0 110)">${cell(PW, 36, '', {})}</g>`;
  p += seg(sim.seq0, ackA, 'green', z ? '已确认' : 'acked');
  p += seg(ackA, sentA, 'amber', z ? '已发未确认' : 'in flight');
  p += seg(sentA, Math.min(sim.end, ackA + winA), 'blue', z ? '窗口内可发' : 'usable');
  p += txt(0, 166, z ? `确认到 ${ackA}，窗口 ${winA}，可发到 ${Math.min(sim.end, ackA + winA) - 1}` : `acked to ${ackA}, window ${winA}`, 'bt-cap', 'start');
  items.push({ k: 'panel', x: PX, y: Y0, html: p });
  return items;
}

function build(p, kit, ERR) {
  const sim = tcpFlow({ ...p, reads: listOf(p.reads) });
  const height = sim.ok ? sim.rounds.reduce((s, x) => s + roundH(x), 0) : 400;
  const lesson = shell('tcp-flow', kit, ERR, sim, {
    where: W,
    tag: T('窗口', 'rwnd'),
    name: T('TCP 序号、确认号与流量控制', 'TCP sequence numbers and flow control'),
    full: T('面向字节流 · 序号与确认号 · 累积确认 · 接收窗口 rwnd · 接收缓存 · 零窗口 · 持续计时器与零窗口探测', 'Byte streams · seq and ack · cumulative acks · rwnd · receive buffer · zero window · persist timer'),
    title: SPEC.presets.find((x) => x.set.seq0 === p.seq0 && x.set.mss === p.mss && x.set.total === p.total && x.set.buf === p.buf && listOf(x.set.reads).join() === listOf(p.reads).join())?.label ?? T('TCP 流量控制', 'TCP flow control'),
    legend: [['amber', T('已发未确认 / 缓存里待读', 'In flight / unread')], ['green', T('已确认', 'Acknowledged')], ['blue', T('窗口内可发', 'Usable window')]],
    principle: PRINCIPLE,
    desc: T('TCP 给每个字节编号：报文段的序号是它第一个字节的编号，确认号是「我期望的下一个字节」。接收方在确认里告诉发送方自己的缓存还剩多少（窗口）；应用读得慢，窗口就缩到 0，发送方只能停下来，靠零窗口探测打听什么时候能继续。', 'Every byte is numbered; ACKs carry the next byte expected and the free buffer space. A slow reader closes the window; the sender then probes.'),
    rect: [40, 90, 940, Math.max(360, height + 110)],
  });
  if (!sim.ok) return lesson;
  const list = [];
  sim.rounds.forEach((rd, i) => {
    const prevWin = i ? sim.rounds[i - 1].ack.rwnd : sim.buf;
    const sendT = rd.probe
      ? [T(`第 ${i + 1} 轮：窗口为 0，发零窗口探测`, `Round ${i + 1}: probe`), T(`B 上次通告的窗口是 0，A 不能发数据。持续计时器到期，A 发 1 字节的零窗口探测（序号 ${rd.probe.seq}）。B 的缓存还是满的，丢掉这个字节。`, `rwnd 0: a 1-byte probe at seq ${rd.probe.seq}; B drops it.`), 'zero']
      : [T(`第 ${i + 1} 轮：A 发 ${rd.segs.length} 个报文段`, `Round ${i + 1}: ${rd.segs.length} segment(s)`), T(`窗口 ${prevWin}，还剩 ${sim.end - rd.segs[0].seq} 字节没发，按 MSS = ${sim.mss} 切成：${rd.segs.map((s) => `序号 ${s.seq}（第 ${s.seq}～${s.seq + s.len - 1} 字节）`).join('、')}。下一段的序号 = 本段序号 + 长度。`, `Window ${prevWin}: ${rd.segs.map((s) => `seq ${s.seq} (${s.len} B)`).join(', ')}.`), 'seq'];
    list.push({ title: sendT[0], desc: T(`窗口 ${prevWin}`, `window ${prevWin}`), detail: sendT[1], ref: sendT[2], st: { k: list.length }, row: { color: rd.probe ? 'rose' : 'blue', what: sendT[0], result: T(rd.probe ? '探测' : `${rd.segs.reduce((s, x) => s + x.len, 0)}B`, rd.probe ? 'probe' : `${rd.segs.reduce((s, x) => s + x.len, 0)} B`), tone: 'info' } });
    const ackT = [
      T(`B 确认 ${rd.ack.ack}，窗口 ${rd.ack.rwnd}`, `B acks ${rd.ack.ack}, rwnd ${rd.ack.rwnd}`),
      T(`${rd.segs.length ? `B 收到这些字节后，缓存里有 ${rd.filled} 字节待读；` : ''}应用读走 ${rd.read} 字节，缓存剩 ${rd.buffered} 字节、空闲 ${rd.ack.rwnd} 字节。B 回确认：确认号 ${rd.ack.ack}（期望的下一个字节），窗口 ${rd.ack.rwnd}。${rd.zero ? 'A 收到零窗口，停发并启动持续计时器。' : ''}`, `B buffers ${rd.filled}, the app reads ${rd.read}; ack ${rd.ack.ack}, window ${rd.ack.rwnd}.${rd.zero ? ' Zero window: A starts the persist timer.' : ''}`),
      rd.zero ? 'zero' : 'flow',
    ];
    list.push({ title: ackT[0], desc: T(`缓存待读 ${rd.buffered}`, `${rd.buffered} unread`), detail: ackT[1], ref: ackT[2], st: { k: list.length }, row: { color: rd.zero ? 'rose' : 'green', what: ackT[0], result: T(`rwnd ${rd.ack.rwnd}`, `rwnd ${rd.ack.rwnd}`), tone: rd.zero ? 'bad' : 'info' } });
  });
  const title = T(`${sim.total} 字节分 ${sim.segCount} 个报文段发完，窗口为 0 的确认 ${sim.zeroRounds} 次，探测 ${sim.probes} 次`, `${sim.segCount} segments; ${sim.zeroRounds} zero windows; ${sim.probes} probes`);
  const text = T(`最后确认号是 ${sim.end}，即 ${sim.seq0} + ${sim.total}：所有字节都收到了。`, `Final ack ${sim.end} = ${sim.seq0} + ${sim.total}.`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeTcpFlow = make('tcp-flow', SPEC, ERR, build);
