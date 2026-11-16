// 「滑动窗口：GBN 与 SR」这节课：时间从左往右走，上面是发送方、下面是接收方，帧向下斜着飞，确认向上飞；
// 顶上是发送窗口，底下是接收方已交付 / 缓存的帧。
import { SW_PRINCIPLE } from './net-principles.js';
import { boardKit, line, res, txt } from '../../core/board.js';
import { chip } from '../../core/steps.js';
import { L, T, esc, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { simulate } from './sw.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const BASE = { bits: 3, W: 4, N: 6, D: 2, T: 6 };

const SPEC = {
  presets: [
    { label: T('GBN · 第 2 帧丢失', 'GBN · frame 2 lost'), set: { proto: 'GBN', ...BASE, lostF: [2], lostA: [] } },
    { label: T('SR · 第 2 帧丢失', 'SR · frame 2 lost'), set: { proto: 'SR', ...BASE, lostF: [2], lostA: [] } },
    { label: T('GBN · 确认丢失', 'GBN · ACK lost'), set: { proto: 'GBN', bits: 3, W: 4, N: 4, D: 1, T: 5, lostF: [], lostA: [1] } },
    { label: T('SR · 确认丢失', 'SR · ACK lost'), set: { proto: 'SR', ...BASE, lostF: [], lostA: [1] } },
    { label: T('窗口太大', 'Window too large'), set: { proto: 'GBN', bits: 2, W: 4, N: 6, D: 2, T: 6, lostF: [], lostA: [] } },
  ],
  groups: [
    {
      legend: T('协议', 'Protocol'),
      fields: [
        { name: 'proto', label: T('协议', 'Protocol'), type: 'select', options: [['GBN', T('GBN 后退 N 帧', 'Go-Back-N')], ['SR', T('SR 选择重传', 'Selective Repeat')]], wide: true },
        { name: 'bits', label: T('序号位数 n', 'Sequence bits n'), type: 'int', min: 1, max: 6 },
        { name: 'W', label: T('发送窗口 W', 'Send window W'), type: 'int', min: 1, max: 16 },
        { name: 'N', label: T('要发送的帧数', 'Frames to send'), type: 'int', min: 1, max: 16 },
        { name: 'D', label: T('单程时延（时间单位）', 'One-way delay'), type: 'int', min: 1, max: 6 },
        { name: 'T', label: T('超时时间', 'Timeout'), type: 'int', min: 1, max: 40 },
      ],
    },
    {
      legend: T('丢失（填帧的编号 0、1、2……）', 'Losses (frame numbers 0, 1, 2…)'),
      fields: [
        { name: 'lostF', label: T('第一次发送时丢失的帧', 'Frames lost on first send'), type: 'list', min: 0, max: 15, maxLen: 6, allowEmpty: true, wide: true },
        { name: 'lostA', label: T('第一次确认时丢失的确认', 'ACKs lost the first time'), type: 'list', min: 0, max: 15, maxLen: 6, allowEmpty: true, wide: true },
      ],
    },
  ],
  note: T(
    '发送方每个时间单位最多发一帧，帧和确认的单程时延都是 D。GBN 用累积确认（ACK n 表示 n 及以前都收到），接收方只收按序的帧，发送方只为最早未确认的帧计时，超时重传窗口里所有已发未确认的帧。SR 逐帧确认，接收方缓存乱序帧，每帧单独计时，超时只重传那一帧。帧按 0、1、2… 编号，序号 = 编号 mod 2^n。窗口上限：GBN W ≤ 2^n − 1，SR W ≤ 2^(n−1)。',
    'The sender starts at most one frame per time unit; frames and ACKs take D units one way. GBN uses cumulative ACKs (ACK n means up to n), the receiver accepts only in-order frames, and one timer covers the oldest unacknowledged frame; a timeout resends everything outstanding. SR acknowledges each frame, buffers out-of-order ones and times each frame separately, resending only the one that timed out. Frames are numbered 0, 1, 2…; the sequence number is that mod 2^n. Window limits: GBN W ≤ 2^n − 1, SR W ≤ 2^(n−1).',
  ),
};

const ERR = {
  proto: T('请选择协议', 'Pick a protocol'),
  bits: T('序号位数要在 1～6 之间', 'Use 1–6 sequence bits'),
  W: T('窗口要在 1～16 之间', 'Window must be 1–16'),
  N: T('帧数要在 1～16 之间', 'Send 1–16 frames'),
  D: T('时延要在 1～6 之间', 'Delay must be 1–6'),
  T: T('超时时间要在 1～40 之间', 'Timeout must be 1–40'),
  lostRange: T('丢失的帧编号超出了范围', 'A lost frame number is out of range'),
};

// ───────────────────────── 画板 ─────────────────────────

const seqOf = (sim, k) => k % 2 ** sim.bits;

function geo(sim) {
  const F = sim.finish + 1;
  const TX = Math.max(16, Math.min(44, 640 / F));
  const x0 = 140;
  const X = (t) => x0 + t * TX;
  const sy = 220;
  const ry = 410;
  const TS = 34;
  const right = Math.max(X(F) + 40, x0 + sim.N * TS + 60);
  return { TX, x0, X, sy, ry, TS, F, rect: [10, 70, right, 540] };
}

/** 到时刻 now 为止的状态 */
function stateAt(sim, now) {
  let snd = { base: 0, next: 0, acked: Array(sim.N).fill(false) };
  let rcv = { delivered: [], buffered: [], expected: 0 };
  for (const ev of sim.log) {
    if (ev.t > now) break;
    if (ev.acked) snd = { base: ev.base, next: ev.next, acked: ev.acked };
    else snd = { ...snd, base: ev.base };
    for (const r of ev.rx) rcv = { delivered: r.delivered, buffered: r.buffered, expected: r.delivered.length };
  }
  if (now >= sim.finish) snd.acked = Array(sim.N).fill(true);
  return { snd, rcv };
}

function boardAt(sim, now, z) {
  const g = geo(sim);
  const items = [];
  // 两条时间线
  let lanes = line(g.X(0), g.sy, g.X(g.F), g.sy, 'bl-axis') + line(g.X(0), g.ry, g.X(g.F), g.ry, 'bl-axis');
  const every = g.TX >= 22 ? 1 : 2;
  for (let t = 0; t <= g.F; t += every) lanes += line(g.X(t), g.sy - 3, g.X(t), g.sy + 3, 'bl-axis') + txt(g.X(t), g.sy - 8, String(t), 'bt-idx');
  lanes += txt(g.X(0) - 14, g.sy + 4, z ? '发送方' : 'Sender', 'bt-cap', 'end') + txt(g.X(0) - 14, g.ry + 4, z ? '接收方' : 'Receiver', 'bt-cap', 'end');
  items.push({ k: 'lanes', x: 0, y: 0, html: lanes });
  if (now >= 0) items.push({ k: 'now', x: g.X(now), y: 0, html: line(0, g.sy - 20, 0, g.ry + 10, 'bl-now') + txt(0, g.ry + 26, `t=${now}`, 'bt-now') });
  // 帧和确认（画到 now 为止）
  const clip = (t0, t1, lost) => {
    if (now < t0) return null;
    const half = lost ? 0.5 : 1;
    const k = Math.min(half, (now - t0) / (t1 - t0));
    return k;
  };
  let arrows = '';
  sim.frames.forEach((f) => {
    const k = clip(f.t, f.arrive, f.lost);
    if (k == null) return;
    const x1 = g.X(f.t);
    const x2 = g.X(f.t) + (g.X(f.arrive) - g.X(f.t)) * k;
    const y2 = g.sy + (g.ry - g.sy) * k;
    arrows += `<line class="bfr ${f.retx ? 'retx' : ''} ${f.lost ? 'lost' : ''}" x1="${x1}" y1="${g.sy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    if (k >= 1) arrows += `<path class="bfr-tip ${f.retx ? 'retx' : ''}" d="M${x2},${y2} l-3,-9 l7,2 z"/>`;
    if (f.lost && k >= 0.5) arrows += txt(x2, y2 + 5, '✗', 'bt-mark bad');
    arrows += txt(x1 - 2, g.sy + 16, String(seqOf(sim, f.k)), `bt-fr ${f.retx ? 'retx' : ''}`, 'end');
  });
  sim.acks.forEach((a) => {
    const k = clip(a.t, a.arrive, a.lost);
    if (k == null) return;
    const x1 = g.X(a.t);
    const x2 = g.X(a.t) + (g.X(a.arrive) - g.X(a.t)) * k;
    const y2 = g.ry - (g.ry - g.sy) * k;
    arrows += `<line class="back ${a.lost ? 'lost' : ''} ${a.dup ? 'dup' : ''}" x1="${x1}" y1="${g.ry}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    if (a.lost && k >= 0.5) arrows += txt(x2, y2 + 5, '✗', 'bt-mark bad');
    arrows += txt(x1 + 2, g.ry + 14, `A${seqOf(sim, a.n)}`, `bt-ack ${a.dup ? 'dup' : ''}`, 'start');
  });
  sim.log.filter((e) => e.timeout && e.t <= now).forEach((e) => (arrows += txt(g.X(e.t), g.sy - 26, z ? '超时' : 'timeout', 'bt-to')));
  items.push({ k: 'arrows', x: 0, y: 0, html: arrows });
  // 发送窗口
  const { snd, rcv } = stateAt(sim, now);
  let strip = '';
  for (let k = 0; k < sim.N; k++) {
    const st = snd.acked[k] ? 'green' : k < snd.next ? 'amber' : k < snd.base + sim.W ? '' : 'slate';
    strip += `<g transform="translate(${k * g.TS} 0)"><g transform="translate(0 -7)">${chip(g.TS - 8, 28, String(seqOf(sim, k)), { tone: st, size: 12, cls: k >= snd.base + sim.W && !snd.acked[k] ? 'unk' : '' })}</g></g>`;
  }
  const bx0 = snd.base * g.TS - g.TS / 2 + 2;
  const bw = Math.min(sim.W, sim.N - snd.base) * g.TS - 4;
  if (snd.base < sim.N) strip += `<rect class="bwin" x="${bx0}" y="-26" width="${bw}" height="38" rx="6"/>`;
  items.push({ k: 'swin', x: g.x0 + 20, y: 140, html: txt(-34, 4, z ? '发送窗口' : 'send window', 'bt-cap', 'end') + strip });
  // 接收方
  let rs = '';
  for (let k = 0; k < sim.N; k++) {
    const st = rcv.delivered.includes(k) ? 'green' : rcv.buffered.includes(k) ? 'blue' : '';
    rs += `<g transform="translate(${k * g.TS} 0)"><g transform="translate(0 -7)">${chip(g.TS - 8, 28, String(seqOf(sim, k)), { tone: st, size: 12, cls: st ? '' : 'unk' })}</g></g>`;
  }
  const rw = sim.proto === 'SR' ? sim.W : 1;
  const rx0 = rcv.expected * g.TS - g.TS / 2 + 2;
  if (rcv.expected < sim.N) rs += `<rect class="bwin rcv" x="${rx0}" y="-26" width="${Math.min(rw, sim.N - rcv.expected) * g.TS - 4}" height="38" rx="6"/>`;
  items.push({ k: 'rwin', x: g.x0 + 20, y: 492, html: txt(-34, 4, z ? (sim.proto === 'SR' ? '接收窗口' : '期望') : sim.proto === 'SR' ? 'recv window' : 'expected', 'bt-cap', 'end') + rs });
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

function evText(sim, ev, z) {
  const S = (k) => `${k}${2 ** sim.bits <= k ? `（${z ? '序号' : 'seq '}${seqOf(sim, k)}）` : ''}`;
  const parts = [];
  for (const r of ev.rx) {
    const act = {
      accept: z ? `接收方收到帧 ${S(r.k)}，正是期望的，交付上层` : `the receiver gets frame ${S(r.k)}, the one it expects, and delivers it`,
      buffer: z ? `接收方收到帧 ${S(r.k)}，在接收窗口内但不是最早的，先缓存` : `the receiver buffers frame ${S(r.k)} (in window, out of order)`,
      discard: z ? `接收方收到帧 ${S(r.k)}，但它在等帧 ${r.expected}，${sim.proto === 'GBN' ? 'GBN 不收乱序帧，丢弃' : '不在接收窗口内，丢弃'}` : `the receiver drops frame ${S(r.k)} while waiting for ${r.expected}${sim.proto === 'GBN' ? ' (GBN keeps no out-of-order frames)' : ''}`,
      dup: z ? `接收方收到帧 ${S(r.k)}，以前已经收过了（重复帧），丢弃` : `the receiver gets a duplicate of frame ${S(r.k)} and drops it`,
    }[r.action];
    const ack = r.ackN == null ? '' : z ? `，回 ACK${seqOf(sim, r.ackN)}${sim.proto === 'GBN' ? `（表示 ${r.ackN} 及以前都收到了）` : ''}${r.ackLost ? '，但这个确认丢了' : ''}` : `, replying ACK${seqOf(sim, r.ackN)}${r.ackLost ? ', which is lost' : ''}`;
    parts.push(act + ack);
  }
  for (const a of ev.acksIn) {
    const A = `ACK${seqOf(sim, a.n)}`;
    if (a.moved) parts.push(z ? `${A} 到达发送方，窗口左沿移到 ${a.base}` : `${A} arrives; the window base moves to ${a.base}`);
    // SR 是逐帧确认：窗口不动只是因为更早的帧还没确认，不是重复确认
    else if (sim.proto === 'SR') parts.push(z ? `${A} 到达，帧 ${a.n} 记为已确认；但最早的帧 ${a.base} 还没确认，窗口不动` : `${A} arrives and frame ${a.n} is marked acknowledged, but the oldest frame ${a.base} is not, so the window stays`);
    else parts.push(z ? `${A} 到达，窗口不动（重复确认）` : `${A} arrives but the window does not move (duplicate ACK)`);
  }
  if (ev.timeout) parts.push(sim.proto === 'GBN' ? (z ? `计时器超时，GBN 要重传窗口里所有已发未确认的帧：${ev.timeout.join('、')}` : `the timer expires; GBN resends every outstanding frame: ${ev.timeout.join(', ')}`) : z ? `帧 ${ev.timeout.join('、')} 的计时器超时，SR 只重传${ev.timeout.length > 1 ? '这几帧' : '这一帧'}` : `frame ${ev.timeout.join(', ')} timed out; SR resends only ${ev.timeout.length > 1 ? 'those' : 'that one'}`);
  if (ev.sent) parts.push(ev.sent.retx ? (z ? `发送方重传帧 ${S(ev.sent.k)}` : `the sender resends frame ${S(ev.sent.k)}`) : z ? `发送方发出帧 ${S(ev.sent.k)}${ev.sent.lost ? '，这一帧在路上丢了' : ''}` : `the sender sends frame ${S(ev.sent.k)}${ev.sent.lost ? ', which is lost' : ''}`);
  if (ev.base >= sim.N) parts.push(z ? '所有帧都已确认，传输结束' : 'every frame is acknowledged; done');
  return (z ? `t=${ev.t}：` : `t=${ev.t}: `) + parts.join(z ? '；' : '; ') + (z ? '。' : '.');
}

function evTitle(sim, ev) {
  if (ev.base >= sim.N) return T(`t=${ev.t}：全部确认`, `t=${ev.t}: all acknowledged`);
  if (ev.timeout) return T(`t=${ev.t}：超时重传`, `t=${ev.t}: timeout`);
  if (ev.sent?.lost) return T(`t=${ev.t}：帧 ${ev.sent.k} 丢失`, `t=${ev.t}: frame ${ev.sent.k} lost`);
  if (ev.rx.some((r) => r.action === 'discard')) return T(`t=${ev.t}：乱序帧`, `t=${ev.t}: out of order`);
  if (ev.acksIn.some((a) => a.moved)) return T(`t=${ev.t}：窗口滑动`, `t=${ev.t}: window slides`);
  if (ev.sent) return T(`t=${ev.t}：发送帧 ${ev.sent.k}`, `t=${ev.t}: send frame ${ev.sent.k}`);
  if (ev.rx.some((r) => r.action === 'buffer')) return T(`t=${ev.t}：缓存乱序帧`, `t=${ev.t}: buffer out of order`);
  if (ev.rx.some((r) => r.action === 'dup')) return T(`t=${ev.t}：重复帧`, `t=${ev.t}: duplicate frame`);
  if (ev.rx.some((r) => r.action === 'accept')) return T(`t=${ev.t}：接收帧 ${ev.rx.find((r) => r.action === 'accept').k}`, `t=${ev.t}: frame ${ev.rx.find((r) => r.action === 'accept').k} received`);
  if (ev.acksIn.length && sim.proto === 'SR') return T(`t=${ev.t}：收到 ACK${seqOf(sim, ev.acksIn[0].n)}，窗口未动`, `t=${ev.t}: ACK${seqOf(sim, ev.acksIn[0].n)}, window stays`);
  if (ev.acksIn.length) return T(`t=${ev.t}：重复确认`, `t=${ev.t}: duplicate ACK`);
  return T(`t=${ev.t}`, `t=${ev.t}`);
}

function decode(ev) {
  const { sim, e } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  return {
    label: T('滑动窗口解析', 'Sliding-window decoder'),
    tag: { color: e.timeout ? 'rose' : 'blue', text: sim.proto },
    title: L(evTitle(sim, e)),
    meta: [[T('窗口', 'Window'), `[${e.base}, ${Math.min(e.base + sim.W, sim.N) - 1}]`]],
    hint: '',
    view: { kind: 'none' },
    layers: [{ name: T('这一时刻', 'This moment'), summary: '', start: 0, end: 0, open: true, fields: [info(T('说明', 'Notes'), both((z) => evText(sim, e, z)), { note: true })] }],
  };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok) return '';
  const now = snap?.t ?? -1;
  const z = getLang() === 'zh';
  const rows = sim.frames.filter((f) => f.t <= now).map((f) => ({ cls: f.lost ? 'm-fault' : f.retx ? 'm-new' : '', cells: [f.k, seqOf(sim, f.k), f.t, f.lost ? (z ? '丢失' : 'lost') : f.arrive, f.retx ? (z ? '重传' : 'resend') : ''] }));
  const acks = sim.acks.filter((a) => a.t <= now).map((a) => ({ cls: a.lost ? 'm-fault' : a.dup ? 'is-empty' : '', cells: [`ACK${seqOf(sim, a.n)}`, a.t, a.lost ? (z ? '丢失' : 'lost') : a.arrive, a.dup ? (z ? '重复' : 'dup') : ''] }));
  return `<div class="ms">${card(T('发出的帧', 'Frames sent'), '', table([z ? '编号' : 'No.', z ? '序号' : 'Seq', z ? '发出' : 'Sent', z ? '到达' : 'Arrives', ''], rows), 'is-focus')}${card(T('确认', 'ACKs'), '', table(['ACK', z ? '发出' : 'Sent', z ? '到达' : 'Arrives', ''], acks))}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('时间线', 'Timeline'),
  stateName: T('帧与确认', 'Frames & ACKs'),
  emptyRows: T('按「播放」或「单步」，每个时刻发生的事都会记在这里。', 'Press Play or Step; each moment is logged here.'),
  cols: [
    { label: T('时刻', 'Time'), cls: 'col-no' },
    { label: T('事件', 'Event'), cls: 'col-op' },
    { label: T('发送窗口', 'Send window'), cls: 'col-res' },
    { label: T('说明', 'Details'), cls: 'col-info' },
  ],
  cells: (ev) => {
    const { sim, e } = ev;
    const z = getLang() === 'zh';
    return [`<i class="dot"></i>${e.t}`, L(evTitle(sim, e)).replace(/^t=\d+[：:]\s*/, ''), e.base >= sim.N ? '—' : `[${e.base}, ${Math.min(e.base + sim.W, sim.N) - 1}]`, esc(evText(sim, e, z).replace(/^t=\d+[：:]\s*/, ''))];
  },
  decode,
  renderState,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'sliding-window',
    kit,
    where: [['net', 'link']],
    principle: SW_PRINCIPLE,
    tag: T('窗口', 'ARQ'),
    name: T('滑动窗口：GBN 与 SR', 'Sliding windows: GBN and SR'),
    full: T('后退 N 帧 · 选择重传 · 累积确认 · 超时重传', 'Go-Back-N · Selective Repeat · cumulative ACKs · timeouts'),
    title: T(`${params.proto} · W = ${params.W} · ${params.bits} 位序号`, `${params.proto} · W = ${params.W} · ${params.bits}-bit sequence`),
    badge: params.proto === 'GBN' ? T('后退 N 帧', 'Go-Back-N') : T('选择重传', 'Selective Repeat'),
    nodes: [],
    legend: [
      ['amber', T('已发未确认', 'In flight')],
      ['green', T('已确认 / 已交付', 'Acked / delivered')],
      ['blue', T('接收方缓存', 'Buffered')],
      ['rose', T('重传', 'Resent')],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '停等协议每发一帧都要等确认，信道大部分时间空着。滑动窗口允许连续发出 W 帧再等确认；出错时，GBN 把出错帧之后的都重传，SR 只重传出错的那一帧，但接收方要能缓存乱序帧。下面可以选协议、改窗口和时延、指定哪一帧或哪个确认丢失。',
        'Stop-and-wait leaves the channel idle while it waits. A sliding window keeps up to W frames in flight; after an error GBN resends everything from the lost frame on, while SR resends only the lost frame but needs a receiver that buffers. Pick a protocol, set the window and delay, and choose which frame or ACK is lost.',
      ),
      facts: sim.ok
        ? [
            [T('窗口上限', 'Window limit'), both((z) => (sim.proto === 'GBN' ? `2^${sim.bits} − 1 = ${sim.limit}` : `2^(${sim.bits} − 1) = ${sim.limit}`) + (z ? `（现在 W = ${sim.W}）` : ` (W = ${sim.W})`))],
            [T('往返时间', 'Round trip'), `2 × ${sim.D} = ${2 * sim.D}`],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const warns = [];
  if (sim.warn) warns.push(T(`窗口 W = ${sim.W} 超过了上限 ${sim.limit}：序号只有 ${2 ** sim.bits} 个，接收方可能把重传的旧帧当成新帧收下。本课按编号模拟，不会真的出错，但实际协议会出问题。`, `W = ${sim.W} exceeds the limit ${sim.limit}: with only ${2 ** sim.bits} sequence numbers a receiver could take an old retransmission for a new frame. The simulation uses absolute numbers, but a real protocol would break.`));
  if (sim.T <= 2 * sim.D) warns.push(T(`超时时间 ${sim.T} 不大于往返时间 ${2 * sim.D}，确认还没回来就会超时，出现不必要的重传。`, `The timeout ${sim.T} is not longer than the round trip ${2 * sim.D}, so frames time out before their ACKs can return.`));
  if (!sim.done) warns.push(T('200 个时间单位内没有传完，可能是超时设得太短。', 'Not finished within 200 time units; the timeout may be too short.'));
  // 提示要跟着当前语言，所以做成函数，渲染时再取
  lesson.extraHtml = () => (warns.length ? `<div class="mem-errors warn"><ul>${warns.map((w) => `<li>${esc(L(w))}</li>`).join('')}</ul></div>` : '');
  const g = geo(sim);
  const boardEv = (t) => ({ type: 'board', items: boardAt(sim, t, true), itemsEn: boardAt(sim, t, false), ms: 420 });
  lesson.start.events = [boardEv(-1), { type: 'snap', snap: { t: -1 } }];
  lesson.steps = sim.log.map((e) => ({
    title: evTitle(sim, e),
    desc: e.base >= sim.N ? T('传输结束', 'Done') : T(`窗口 [${e.base}, ${Math.min(e.base + sim.W, sim.N) - 1}]`, `Window [${e.base}, ${Math.min(e.base + sim.W, sim.N) - 1}]`),
    detail: both((z) => evText(sim, e, z)),
    facts: [],
    events: [boardEv(e.t), ...(e.timeout ? [{ type: 'note', at: [g.X(e.t), g.sy - 56], text: T('超时', 'Timeout'), tone: 'warn' }] : []), { type: 'row', color: e.timeout ? 'rose' : e.sent?.lost ? 'rose' : 'blue', sim, e }, { type: 'snap', snap: { t: e.t } }],
  }));
  lesson.outro = {
    title: T(`t=${sim.finish} 传完`, `Done at t=${sim.finish}`),
    text: T('把同一组丢失换成另一个协议再看：GBN 一帧出错要重传后面所有的帧，信道好时简单省事；SR 只重传出错的帧，但接收方要缓存，窗口也只能到序号空间的一半。', 'Try the same losses with the other protocol: GBN resends everything after an error, simple when the channel is good; SR resends only the lost frame but must buffer, and its window can only be half the sequence space.'),
    facts: [
      [T('完成时刻', 'Finished at'), `t = ${sim.finish}`],
      [T('发送帧数', 'Frames sent'), both((z) => (z ? `${sim.frames.length}（其中重传 ${sim.retx}）` : `${sim.frames.length} (${sim.retx} resent)`))],
      [T('确认数', 'ACKs'), String(sim.acks.length)],
    ],
  };
  return lesson;
}

export const makeSW = () => parametric('sliding-window', DEFAULTS, build);
