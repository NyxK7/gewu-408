// 「TCP 拥塞控制」这节课：一轮一根立体柱，画出 cwnd 随传输轮次的变化，ssthresh 是一条会跳变的虚线。
import { CC_PRINCIPLE } from './net-principles.js';
import { bar, boardKit, line, res, txt } from '../../core/board.js';
import { L, T, getLang } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { simulate } from './cc.js';

const both = (f) => ({ zh: f(true), en: f(false) });

const SPEC = {
  presets: [
    { label: T('教材例 · Reno', 'Textbook · Reno'), set: { variant: 'reno', cwnd0: 1, ssthresh0: 16, rounds: 25, timeouts: [13], dup3: [22], rwnd: 0 } },
    { label: T('同一例 · Tahoe', 'Same · Tahoe'), set: { variant: 'tahoe', cwnd0: 1, ssthresh0: 16, rounds: 25, timeouts: [13], dup3: [22], rwnd: 0 } },
    { label: T('超时后再过 4 个 RTT', '4 RTTs after a timeout'), set: { variant: 'reno', cwnd0: 1, ssthresh0: 32, rounds: 10, timeouts: [5], dup3: [], rwnd: 0 } },
    { label: T('接收窗口 rwnd = 20', 'Receiver window 20'), set: { variant: 'reno', cwnd0: 1, ssthresh0: 32, rounds: 16, timeouts: [], dup3: [12], rwnd: 20 } },
  ],
  groups: [
    {
      legend: T('算法与初值', 'Variant and start'),
      fields: [
        { name: 'variant', label: T('算法', 'Variant'), type: 'select', options: [['reno', T('Reno（快重传 + 快恢复）', 'Reno (fast retransmit + recovery)')], ['tahoe', T('Tahoe（没有快恢复）', 'Tahoe (no fast recovery)')]], wide: true },
        { name: 'cwnd0', label: T('初始 cwnd', 'Initial cwnd'), type: 'int', min: 1, max: 8 },
        { name: 'ssthresh0', label: T('初始 ssthresh', 'Initial ssthresh'), type: 'int', min: 2, max: 128 },
        { name: 'rounds', label: T('传输轮次', 'Rounds'), type: 'int', min: 2, max: 40 },
        { name: 'rwnd', label: T('接收窗口 rwnd（0 = 不限）', 'rwnd (0 = none)'), type: 'int', min: 0, max: 200 },
      ],
    },
    {
      legend: T('拥塞事件（填轮次）', 'Congestion events (round numbers)'),
      fields: [
        { name: 'timeouts', label: T('这些轮发生超时', 'Timeouts in rounds'), type: 'list', min: 1, max: 40, maxLen: 6, allowEmpty: true, wide: true },
        { name: 'dup3', label: T('这些轮收到 3 个重复确认', '3 duplicate ACKs in rounds'), type: 'list', min: 1, max: 40, maxLen: 6, allowEmpty: true, wide: true },
      ],
    },
  ],
  note: T(
    '窗口以报文段（MSS）为单位，一轮 = 一个 RTT。慢开始每轮翻倍，翻倍会超过 ssthresh 时只增到 ssthresh；cwnd ≥ ssthresh 后拥塞避免，每轮加 1。超时：ssthresh = ⌊cwnd/2⌋（至少 2），cwnd = 1。3 个重复确认（Reno）：ssthresh = ⌊cwnd/2⌋，cwnd = ssthresh。发送窗口 = min(cwnd, rwnd)。',
    'Windows count segments (MSS); one round is one RTT. Slow start doubles each round but stops at ssthresh; from cwnd ≥ ssthresh congestion avoidance adds 1 per round. Timeout: ssthresh = ⌊cwnd/2⌋ (at least 2), cwnd = 1. Three duplicate ACKs (Reno): ssthresh = ⌊cwnd/2⌋, cwnd = ssthresh. Send window = min(cwnd, rwnd).',
  ),
};

const ERR = {
  cwnd0: T('初始 cwnd 要在 1～8 之间', 'Initial cwnd must be 1–8'),
  ssthresh0: T('初始 ssthresh 要在 2～128 之间', 'Initial ssthresh must be 2–128'),
  rounds: T('轮次要在 2～40 之间', 'Use 2–40 rounds'),
  eventRange: T('拥塞事件的轮次超出了范围', 'An event round is out of range'),
  eventBoth: T('同一轮不能既超时又收到 3 个重复确认', 'A round cannot have both a timeout and 3 duplicate ACKs'),
};

const PH = { ss: T('慢开始', 'Slow start'), ca: T('拥塞避免', 'Congestion avoidance') };
const EV = { timeout: T('超时', 'Timeout'), dup3: T('3 个重复确认', '3 dup ACKs') };

function geo(sim) {
  const n = sim.rows.length;
  const max = Math.max(...sim.rows.map((r) => r.cwnd), ...sim.rows.map((r) => r.ssthresh), sim.rwnd || 0);
  const dx = Math.max(16, Math.min(34, 600 / n));
  const uy = Math.max(3.4, Math.min(14, 250 / max));
  const x0 = 90;
  const y0 = 420;
  const X = (r) => x0 + (r - 0.5) * dx;
  return { n, max, dx, uy, x0, y0, X, Y: (v) => y0 - v * uy, rect: [20, y0 - max * uy - 70, x0 + n * dx + 70, y0 + 48] };
}

function boardAt(sim, k, z) {
  const g = geo(sim);
  const items = [];
  // 坐标轴
  const step = g.max > 64 ? 16 : g.max > 32 ? 8 : g.max > 16 ? 4 : 2;
  let ax = line(0, 0, g.n * g.dx + 20, 0, 'bl-axis') + line(0, 0, 0, -(g.max * g.uy + 20), 'bl-axis');
  for (let v = step; v <= g.max; v += step) ax += line(-4, -v * g.uy, g.n * g.dx + 20, -v * g.uy, 'bl-lane') + txt(-8, -v * g.uy + 4, String(v), 'bt-idx', 'end');
  const every = g.dx >= 22 ? 1 : 2;
  for (let r = 1; r <= g.n; r += every) ax += txt((r - 0.5) * g.dx, 18, String(r), 'bt-idx');
  ax += txt(g.n * g.dx + 24, 4, z ? '轮次' : 'round', 'bt-dim', 'start') + txt(0, -(g.max * g.uy + 28), 'cwnd', 'bt-dim');
  items.push({ k: 'axes', x: g.x0, y: g.y0, html: ax });
  if (sim.rwnd > 0) items.push({ k: 'rwnd', x: g.x0, y: g.Y(sim.rwnd), html: line(0, 0, g.n * g.dx + 20, 0, 'bl-rwnd') + txt(6, -6, `rwnd = ${sim.rwnd}`, 'bt-rwnd', 'start') });
  // 每轮一根柱子
  const w = g.dx * 0.6;
  sim.rows.slice(0, k + 1).forEach((r, i) => {
    const h = r.cwnd * g.uy;
    let flag = '';
    if (r.event) flag = `<g class="ev-flag ${r.event}">${line(w / 2, -h - 22, w / 2, -h - 6, 'bl-ev')}<rect x="${w / 2 - 2}" y="${-h - 46}" width="${r.event === 'timeout' ? 34 : 64}" height="18" rx="3"/>${txt(w / 2 + (r.event === 'timeout' ? 15 : 30), -h - 33, z ? EV[r.event].zh : EV[r.event].en, 'bt-ev')}</g>`;
    items.push({
      k: `r-${r.r}`,
      x: g.X(r.r) - w / 2,
      y: g.y0,
      from: [g.X(r.r) - w / 2, g.y0 + 30],
      cls: i === k ? 'is-cur' : '',
      html: bar(w, h, { tone: r.event === 'timeout' ? 'rose' : r.event === 'dup3' ? 'amber' : r.phase === 'ss' ? 'teal' : 'blue', d: 0 }) + txt(w / 2 + 2, -h - 8, String(r.cwnd), 'bt-val') + flag,
    });
  });
  // ssthresh：分段的水平虚线
  if (k >= 0) {
    let d = '';
    sim.rows.slice(0, k + 1).forEach((r, i) => {
      const xa = (r.r - 1) * g.dx;
      const xb = r.r * g.dx;
      const y = -r.ssthresh * g.uy;
      d += `${i ? 'L' : 'M'}${xa.toFixed(1)},${y.toFixed(1)} L${xb.toFixed(1)},${y.toFixed(1)} `;
    });
    const cur = sim.rows[k];
    items.push({ k: 'ss', x: g.x0, y: g.y0, html: `<path class="bl-ss" d="${d}"/>` + txt(k * g.dx + g.dx + 6, -cur.ssthresh * g.uy - 6, `ssthresh = ${cur.ssthresh}`, 'bt-ss', 'start') });
  }
  return items;
}

function roundText(sim, r, z) {
  const win = sim.rwnd > 0 ? (z ? `发送窗口 = min(cwnd, rwnd) = min(${r.cwnd}, ${sim.rwnd}) = ${r.win}，` : `send window = min(${r.cwnd}, ${sim.rwnd}) = ${r.win}; `) : '';
  const head = z ? `第 ${r.r} 轮：cwnd = ${r.cwnd}，ssthresh = ${r.ssthresh}，` : `Round ${r.r}: cwnd = ${r.cwnd}, ssthresh = ${r.ssthresh}; `;
  const ph = r.phase === 'ss' ? (z ? `cwnd < ssthresh，处于慢开始。` : `cwnd < ssthresh, so this is slow start. `) : z ? `cwnd ≥ ssthresh，处于拥塞避免。` : `cwnd ≥ ssthresh, so this is congestion avoidance. `;
  const send = z ? `${win}这一轮发出 ${r.win} 个报文段。` : `${win}${r.win} segments go out this round. `;
  let nx;
  if (r.how === 'double') nx = z ? `全部收到确认，cwnd 翻倍：${r.cwnd} × 2 = ${r.next}。` : `All are acknowledged, so cwnd doubles to ${r.next}.`;
  if (r.how === 'cap') nx = z ? `全部收到确认。翻倍是 ${r.cwnd * 2}，会超过 ssthresh = ${r.ssthresh}，所以只增到 ${r.next}，下一轮起改为拥塞避免。` : `All are acknowledged. Doubling would give ${r.cwnd * 2}, past ssthresh = ${r.ssthresh}, so cwnd stops at ${r.next} and congestion avoidance begins.`;
  if (r.how === 'plus1') nx = z ? `全部收到确认，拥塞避免每轮只加 1：cwnd = ${r.next}。` : `All are acknowledged; congestion avoidance adds one: cwnd = ${r.next}.`;
  if (r.how === 'timeout') nx = z ? `这一轮发生超时，判断网络拥塞：ssthresh = ⌊${r.cwnd} / 2⌋ = ${r.nextSs}，cwnd 重置为 1，重新慢开始。` : `A timeout signals congestion: ssthresh = ⌊${r.cwnd}/2⌋ = ${r.nextSs}, cwnd resets to 1 and slow start begins again.`;
  if (r.how === 'dup3')
    nx =
      sim.variant === 'tahoe'
        ? z
          ? `收到 3 个重复确认，立即重传丢失的报文段（快重传）。Tahoe 没有快恢复：ssthresh = ⌊${r.cwnd} / 2⌋ = ${r.nextSs}，cwnd = 1，重新慢开始。`
          : `Three duplicate ACKs trigger a fast retransmit. Tahoe has no fast recovery: ssthresh = ⌊${r.cwnd}/2⌋ = ${r.nextSs}, cwnd = 1.`
        : z
          ? `收到 3 个重复确认，立即重传丢失的报文段（快重传）。这说明网络还能送达后续报文，只是个别丢失，所以快恢复：ssthresh = ⌊${r.cwnd} / 2⌋ = ${r.nextSs}，cwnd = ${r.next}，直接进入拥塞避免。`
          : `Three duplicate ACKs trigger a fast retransmit. Later segments still get through, so fast recovery applies: ssthresh = ⌊${r.cwnd}/2⌋ = ${r.nextSs}, cwnd = ${r.next}, straight into congestion avoidance.`;
  return head + ph + send + nx;
}

function decode(ev) {
  const { sim, r } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  return {
    label: T('窗口解析', 'Window decoder'),
    tag: { color: r.event ? (r.event === 'timeout' ? 'rose' : 'amber') : r.phase === 'ss' ? 'teal' : 'blue', text: r.event ? EV[r.event] : PH[r.phase] },
    title: both((z) => (z ? `第 ${r.r} 轮 · cwnd ${r.cwnd}` : `Round ${r.r} · cwnd ${r.cwnd}`)),
    meta: [
      ['cwnd', String(r.cwnd)],
      ['ssthresh', String(r.ssthresh)],
      [T('发送窗口', 'Send window'), String(r.win)],
    ],
    hint: T('这一轮的状态，以及下一轮的窗口怎么来。', 'This round, and how the next window is derived.'),
    view: { kind: 'none' },
    layers: [
      { name: T('这一轮', 'This round'), summary: L(PH[r.phase]), start: 0, end: 0, open: true, fields: [info('cwnd', String(r.cwnd)), info('ssthresh', String(r.ssthresh)), info(T('阶段', 'Phase'), PH[r.phase]), info(T('事件', 'Event'), r.event ? EV[r.event] : T('无', 'none'))] },
      { name: T('下一轮', 'Next round'), summary: `cwnd ${r.next} · ssthresh ${r.nextSs}`, start: 0, end: 0, open: true, fields: [info(T('推算', 'Derivation'), both((z) => roundText(sim, r, z)), { note: true })] },
    ],
  };
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('传输轮次', 'Rounds'),
  emptyRows: T('按「播放」或「单步」，每一轮的窗口都会记在这里。', 'Press Play or Step; each round is logged here.'),
  cols: [
    { label: T('轮次', 'Round'), cls: 'col-no' },
    { label: 'cwnd', cls: 'col-op' },
    { label: 'ssthresh', cls: 'col-op' },
    { label: T('阶段', 'Phase'), cls: 'col-res' },
    { label: T('事件 → 下一轮', 'Event → next'), cls: 'col-info' },
  ],
  cells: (ev) => {
    const r = ev.r;
    const z = getLang() === 'zh';
    return [
      `<i class="dot"></i>${r.r}`,
      String(r.cwnd) + (ev.sim.rwnd > 0 && r.win < r.cwnd ? ` (${z ? '发' : 'send'} ${r.win})` : ''),
      String(r.ssthresh),
      res(r.phase === 'ss' ? 'ok' : 'info', PH[r.phase]),
      (r.event ? `${L(EV[r.event])} → ` : '') + `cwnd ${r.next}${r.nextSs !== r.ssthresh ? `, ssthresh ${r.nextSs}` : ''}`,
    ];
  },
  decode,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'tcp-cc',
    kit,
    where: [['net', 'transport']],
    principle: CC_PRINCIPLE,
    tag: 'cwnd',
    name: T('TCP 拥塞控制', 'TCP congestion control'),
    full: T('慢开始 · 拥塞避免 · 快重传 · 快恢复', 'Slow start · congestion avoidance · fast retransmit · fast recovery'),
    title: T(`${params.variant === 'tahoe' ? 'Tahoe' : 'Reno'} · ${params.rounds} 轮`, `${params.variant === 'tahoe' ? 'Tahoe' : 'Reno'} · ${params.rounds} rounds`),
    badge: params.variant === 'tahoe' ? 'Tahoe' : 'Reno',
    nodes: [],
    legend: [
      ['teal', PH.ss],
      ['blue', PH.ca],
      ['rose', EV.timeout],
      ['amber', EV.dup3],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '发送方不知道网络能承受多少，只能试探：先小窗口起步、成倍增长（慢开始），接近门限后线性增长（拥塞避免），一旦超时或收到重复确认就降下来。下面可以改初值、轮次和拥塞发生的位置，每一轮的窗口都是按规则算出来的。',
        'The sender cannot see how much the network can take, so it probes: start small and double (slow start), grow linearly near the threshold (congestion avoidance), and back off on a timeout or duplicate ACKs. Change the start values, rounds and events; every window is computed by the rules.',
      ),
      facts: sim.ok
        ? [
            [T('初始', 'Start'), `cwnd ${params.cwnd0} · ssthresh ${params.ssthresh0}`],
            [T('超时', 'Timeouts'), params.timeouts.length ? both((z) => params.timeouts.map((r) => (z ? `第 ${r} 轮` : `round ${r}`)).join(z ? '、' : ', ')) : T('无', 'none')],
            [T('3 个重复确认', '3 dup ACKs'), params.dup3.length ? both((z) => params.dup3.map((r) => (z ? `第 ${r} 轮` : `round ${r}`)).join(z ? '、' : ', ')) : T('无', 'none')],
            ['rwnd', params.rwnd ? String(params.rwnd) : T('不限', 'none')],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const g = geo(sim);
  const boardEv = (k) => ({ type: 'board', items: boardAt(sim, k, true), itemsEn: boardAt(sim, k, false), ms: 450 });
  lesson.start.events = [boardEv(-1)];
  lesson.steps = sim.rows.map((r, k) => ({
    title: r.event ? T(`第 ${r.r} 轮：${EV[r.event].zh}`, `Round ${r.r}: ${EV[r.event].en}`) : T(`第 ${r.r} 轮：cwnd = ${r.cwnd}`, `Round ${r.r}: cwnd = ${r.cwnd}`),
    desc: T(`${PH[r.phase].zh} · 下一轮 cwnd = ${r.next}`, `${PH[r.phase].en} · next cwnd = ${r.next}`),
    detail: both((z) => roundText(sim, r, z)),
    facts: [
      ['cwnd', String(r.cwnd)],
      ['ssthresh', String(r.ssthresh)],
      [T('阶段', 'Phase'), PH[r.phase]],
      [T('下一轮', 'Next'), `cwnd ${r.next} · ssthresh ${r.nextSs}`],
    ],
    events: [
      boardEv(k),
      ...(r.event ? [{ type: 'note', at: [g.X(r.r), g.Y(r.cwnd) - 86], text: r.event === 'timeout' ? T(`超时 → cwnd 1`, `Timeout → cwnd 1`) : T(`→ cwnd ${r.next}`, `→ cwnd ${r.next}`), tone: 'warn' }] : []),
      { type: 'row', color: r.event ? (r.event === 'timeout' ? 'rose' : 'amber') : r.phase === 'ss' ? 'teal' : 'blue', r, sim },
    ],
  }));
  const last = sim.rows.at(-1);
  lesson.outro = {
    title: T(`${sim.rows.length} 轮结束`, `${sim.rows.length} rounds done`),
    text:
      params.variant === 'tahoe'
        ? T(
            'Tahoe 不区分两种拥塞信号：超时也好、收到 3 个重复确认也好，都把 ssthresh 设为当前窗口的一半、cwnd 退回 1，重新慢开始（收到 3 个重复确认时照样快重传，只是没有快恢复）。把算法换成 Reno 对比一下，看 3 个重复确认之后的曲线有什么不同。',
            'Tahoe treats both signals alike: on a timeout or three duplicate ACKs it halves ssthresh and drops cwnd to 1 to slow-start again (it still fast-retransmits, but has no fast recovery). Switch to Reno and compare the curve after the duplicate ACKs.',
          )
        : T(
            '注意两种拥塞信号的区别：超时说明网络可能严重拥塞，窗口退回 1；收到 3 个重复确认说明后面的报文还能到达，Reno 用快恢复把窗口降到一半后直接线性增长。改一下事件发生的轮次，看看曲线怎么变。',
            'Note the two signals: a timeout suggests heavy congestion and drops the window to 1; three duplicate ACKs show later segments still arrive, so Reno halves the window and keeps growing linearly. Move the events and watch the curve change.',
          ),
    facts: [
      [T('最后一轮', 'Last round'), `cwnd ${last.cwnd} · ssthresh ${last.ssthresh}`],
      [T('之后', 'After it'), `cwnd ${sim.final.cwnd} · ssthresh ${sim.final.ssthresh}`],
      [T('最大 cwnd', 'Peak cwnd'), String(Math.max(...sim.rows.map((r) => r.cwnd)))],
    ],
  };
  return lesson;
}

export const makeCC = () => parametric('tcp-cc', DEFAULTS, build);
