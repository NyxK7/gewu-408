// 「进程调度」这节课：一段一段画出甘特图，上面是 CPU 时间线，下面每个进程一条泳道（运行 / 等待），顶上是就绪队列。
import { boardKit, bar, frac, line, res, txt } from '../../core/board.js';
import { chip } from '../../core/steps.js';
import { L, T, esc, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { ALGOS, simulate } from './sched.js';
import { SCHED_PRINCIPLE, schedRef } from './sched-principle.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'];
const STALLINGS = { arrive: [0, 2, 4, 6, 8], burst: [3, 6, 4, 5, 2] };

const NAME = {
  FCFS: T('FCFS 先来先服务', 'FCFS'),
  SJF: T('SJF 短作业优先（非抢占）', 'SJF (non-preemptive)'),
  SRTF: T('SRTF 最短剩余时间优先（抢占）', 'SRTF (preemptive SJF)'),
  HRRN: T('HRRN 高响应比优先', 'HRRN (highest response ratio)'),
  PRIO: T('优先级调度', 'Priority'),
  RR: T('RR 时间片轮转', 'Round robin'),
};
const RULE = {
  FCFS: T('按到达先后排队，先到先运行，运行到结束为止。', 'Run in arrival order, each to completion.'),
  SJF: T('CPU 空闲时，在就绪进程里挑运行时间最短的，运行到结束（不抢占）。', 'When the CPU frees up, run the shortest ready job to completion.'),
  SRTF: T('任何时刻都运行剩余时间最短的进程；新进程到达时若剩余时间更短就抢占。', 'Always run the job with the least time left; a newcomer with less time left preempts.'),
  HRRN: T('CPU 空闲时计算响应比 = (等待时间 + 要求服务时间) ÷ 要求服务时间，选最大的，不抢占。', 'When the CPU frees up, pick the highest (wait + service) ÷ service, without preemption.'),
  PRIO: T('选优先级最高的进程；抢占式下，更高优先级的进程到达时立即抢占。', 'Pick the highest priority; the preemptive version switches as soon as a higher priority arrives.'),
  RR: T('就绪进程排成队，队首运行一个时间片；没运行完就回到队尾。', 'Ready processes queue up; the head runs for one quantum, then goes to the back if unfinished.'),
};

const SPEC = {
  presets: [
    { label: T('FCFS', 'FCFS'), set: { algo: 'FCFS', ...STALLINGS } },
    { label: T('SJF', 'SJF'), set: { algo: 'SJF', ...STALLINGS } },
    { label: T('SRTF', 'SRTF'), set: { algo: 'SRTF', ...STALLINGS } },
    { label: T('HRRN', 'HRRN'), set: { algo: 'HRRN', ...STALLINGS } },
    { label: T('RR q=4', 'RR q=4'), set: { algo: 'RR', q: 4, ...STALLINGS } },
    { label: T('优先级 · 抢占', 'Priority · preemptive'), set: { algo: 'PRIO', arrive: [0, 1, 2], burst: [4, 3, 2], prio: [3, 1, 2], preempt: true, prioLow: true } },
  ],
  groups: [
    {
      legend: T('算法', 'Algorithm'),
      fields: [
        { name: 'algo', label: T('调度算法', 'Algorithm'), type: 'select', options: ALGOS.map((a) => [a, NAME[a]]), wide: true },
        { name: 'q', label: T('时间片 q', 'Quantum q'), type: 'int', min: 1, max: 20, show: (p) => p.algo === 'RR' },
        { name: 'newFirst', label: T('同一时刻新到达的先入队', 'Newcomers queue before the preempted job'), type: 'check', wide: true, show: (p) => p.algo === 'RR' },
        { name: 'prioLow', label: T('优先级', 'Priority'), type: 'select', options: [[true, T('数值越小越优先', 'smaller number = higher')], [false, T('数值越大越优先', 'larger number = higher')]], show: (p) => p.algo === 'PRIO' },
        { name: 'preempt', label: T('抢占式', 'Preemptive'), type: 'check', show: (p) => p.algo === 'PRIO' },
      ],
    },
    {
      legend: T('进程（按 P1、P2…… 顺序）', 'Processes (P1, P2, …)'),
      fields: [
        { name: 'arrive', label: T('到达时间', 'Arrival times'), type: 'list', min: 0, max: 99, maxLen: 8, wide: true },
        { name: 'burst', label: T('运行时间', 'Burst times'), type: 'list', min: 1, max: 50, maxLen: 8, wide: true },
        { name: 'prio', label: T('优先级', 'Priorities'), type: 'list', min: 0, max: 99, maxLen: 8, wide: true, show: (p) => p.algo === 'PRIO' },
      ],
    },
  ],
  note: T(
    '不计进程切换开销；同等条件下先到达的优先，再按编号。抢占式算法只在新进程「严格更优」时抢占。周转时间 = 完成 − 到达，带权周转时间 = 周转 ÷ 运行，等待时间 = 周转 − 运行。',
    'Context switches are free; ties go to the earlier arrival, then the lower number. Preemption only happens when the newcomer is strictly better. Turnaround = finish − arrival, weighted = turnaround ÷ burst, waiting = turnaround − burst.',
  ),
};

const ERR = {
  algo: T('请选择算法', 'Pick an algorithm'),
  count: T('进程数要在 1～8 之间', 'Use 1–8 processes'),
  burstLen: T('运行时间的个数要和到达时间一样多', 'Give as many burst times as arrival times'),
  prioLen: T('优先级的个数要和到达时间一样多', 'Give as many priorities as arrival times'),
  burstPos: T('运行时间至少为 1', 'Burst times must be at least 1'),
  arrivePos: T('到达时间不能为负', 'Arrival times cannot be negative'),
  q: T('时间片至少为 1', 'The quantum must be at least 1'),
  tooLong: T('总时长太长（超过 200），请减少进程或运行时间', 'The schedule is too long (over 200 units)'),
};

// ───────────────────────── 画板 ─────────────────────────

function geo(sim) {
  const sc = Math.max(12, Math.min(36, 580 / sim.total));
  const x0 = 120;
  const X = (t) => x0 + t * sc;
  const laneY = (i) => 236 + i * 40;
  const axisY = laneY(sim.n - 1) + 34;
  return { sc, X, x0, qY: 96, cpuY: 178, laneY, axisY, rect: [20, 70, X(sim.total) + 60, axisY + 44] };
}

const nm = (sim, i) => sim.procs[i].name;
const tone = (i) => TONES[i % TONES.length];

/** 画到第 k 段为止（k = -1 是开始前） */
function boardAt(sim, k, z) {
  const g = geo(sim);
  const now = k >= 0 ? sim.segs[k].end : 0;
  const items = [];
  items.push({ k: 'lab-q', x: g.x0 - 16, y: g.qY + 4, html: txt(0, 0, z ? '就绪队列' : 'ready queue', 'bt-cap', 'end') });
  items.push({ k: 'lab-cpu', x: g.x0 - 16, y: g.cpuY - 10, html: txt(0, 0, 'CPU', 'bt-cap', 'end') });
  items.push({ k: 'track', x: g.X(0), y: g.cpuY, html: line(0, 0, g.X(sim.total) - g.X(0), 0, 'bl-track') });
  // 时间轴：所有段的边界和到达时刻
  const ticks = new Set([0, sim.total, ...sim.segs.map((s) => s.end), ...sim.procs.map((p) => p.arrive)]);
  const axis = [line(0, 0, g.X(sim.total) - g.X(0), 0, 'bl-axis'), ...[...ticks].map((t) => line(g.X(t) - g.X(0), -4, g.X(t) - g.X(0), 4, 'bl-axis') + txt(g.X(t) - g.X(0), 18, String(t), 'bt-idx'))];
  items.push({ k: 'axis', x: g.X(0), y: g.axisY, html: axis.join('') });
  // CPU 时间线（经典甘特图）
  sim.segs.slice(0, k + 1).forEach((s, j) => {
    const w = (s.end - s.start) * g.sc;
    items.push({
      k: `cpu-${j}`,
      x: g.X(s.start),
      y: g.cpuY,
      from: [g.X(s.start) - 16, g.cpuY],
      cls: j === k ? 'is-cur' : '',
      html: s.pid == null ? bar(w, 14, { cls: 'idle', d: 0, text: w > 30 ? (z ? '空闲' : 'idle') : '' }) : bar(w, 32, { tone: tone(s.pid), d: 0, text: w > 22 ? nm(sim, s.pid) : '' }),
    });
  });
  // 每个进程一条泳道
  sim.procs.forEach((p, i) => {
    const y = g.laneY(i);
    items.push({ k: `lab-${i}`, x: g.x0 - 16, y: y - 4, html: txt(0, 0, p.name, `bt-lab c-${tone(i)}`, 'end') + txt(0, 15, z ? `到达 ${p.arrive} · 运行 ${p.burst}` : `arr ${p.arrive} · burst ${p.burst}`, 'bt-dim', 'end') });
    items.push({ k: `lane-${i}`, x: g.X(0), y, html: line(0, 0, g.X(sim.total) - g.X(0), 0, 'bl-lane') });
    items.push({ k: `arr-${i}`, x: g.X(p.arrive), y: y - 26, cls: p.arrive <= now ? '' : 'is-future', html: `<path class="barrival c-${tone(i)}" d="M0,0 L5,-8 L-5,-8 Z"/>` });
    // 等待段：到达之后、完成之前、没在运行的时间（只画到 now）
    const runs = sim.segs.slice(0, k + 1).filter((s) => s.pid === i);
    const end = Math.min(p.finish, now);
    let cur = p.arrive;
    let w = 0;
    for (const r of [...runs, { start: end, end }]) {
      const a = cur;
      const b = Math.min(r.start, end);
      if (b > a) items.push({ k: `wait-${i}-${w++}`, x: g.X(a), y, html: bar((b - a) * g.sc, 12, { cls: 'waiting', d: 0 }) });
      cur = Math.max(cur, r.end);
    }
    runs.forEach((r) => items.push({ k: `run-${i}-${r.start}`, x: g.X(r.start), y, from: [g.X(r.start) - 12, y], html: bar((r.end - r.start) * g.sc, 18, { tone: tone(i), d: 0 }) }));
    if (p.finish <= now) items.push({ k: `fin-${i}`, x: g.X(p.finish) + 14, y: y - 4, html: txt(0, 0, z ? `完成 ${p.finish}` : `done ${p.finish}`, 'bt-dim', 'start') });
  });
  // 就绪队列：这一段运行时排着的进程
  if (k >= 0) {
    const s = sim.segs[k];
    const q = sim.algo === 'RR' ? (s.queue ?? []).slice(1) : s.queue ?? [];
    q.forEach((pid, j) => items.push({ k: `q-${pid}`, x: g.x0 + 22 + j * 46, y: g.qY + 10, from: [g.X(sim.procs[pid].arrive), g.laneY(pid)], html: chip(36, 30, nm(sim, pid), { tone: tone(pid), size: 12 }) }));
    if (!q.length) items.push({ k: 'q-empty', x: g.x0 + 10, y: g.qY + 4, html: txt(0, 0, z ? '（空）' : '(empty)', 'bt-dim', 'start') });
    items.push({ k: 'now', x: g.X(now), y: g.cpuY - 56, html: line(0, 0, 0, g.axisY - g.cpuY + 56, 'bl-now') + txt(0, g.axisY - g.cpuY + 92, `t=${now}`, 'bt-now') });
  }
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

function segText(sim, s, z) {
  const N = (i) => nm(sim, i);
  if (s.pid == null) {
    const nxt = sim.procs.filter((p) => p.arrive === s.end).map((p) => p.name);
    return z ? `t=${s.start} 到 t=${s.end} 没有就绪的进程，CPU 空闲，直到 ${nxt.join('、')} 到达。` : `From t=${s.start} to t=${s.end} nothing is ready, so the CPU idles until ${nxt.join(', ')} arrives.`;
  }
  const P = sim.procs[s.pid];
  const fin = P.finish === s.end ? (z ? `${P.name} 在 t=${s.end} 完成：周转时间 = ${s.end} − ${P.arrive} = ${P.tat}，带权周转时间 = ${P.tat} ÷ ${P.burst} = ${frac(P.tat, P.burst)}。` : ` ${P.name} finishes at t=${s.end}: turnaround ${s.end} − ${P.arrive} = ${P.tat}, weighted ${P.tat} ÷ ${P.burst} = ${frac(P.tat, P.burst)}.`) : '';
  if (sim.algo === 'RR') {
    const q = s.queue.map(N);
    const ran = s.end - s.start;
    const left = P.burst - sim.segs.filter((x) => x.pid === s.pid && x.end <= s.end).reduce((a, x) => a + x.end - x.start, 0);
    const head = z ? `t=${s.start} 就绪队列是 ${q.join(' → ')}，队首 ${P.name} 出队运行。` : `At t=${s.start} the queue is ${q.join(' → ')}; the head, ${P.name}, runs. `;
    if (s.why === 'done') return head + (z ? `它只剩 ${ran}，不到一个时间片（q=${sim.q ?? ''}）就运行完了。` : `It needs only ${ran} more, less than a quantum.`) + fin;
    return head + (z ? `运行一个时间片 ${ran} 后还剩 ${left}，回到队尾，此时队列为 ${s.after.map(N).join(' → ')}。` : `After one quantum (${ran}) it still needs ${left} and goes to the back: ${s.after.map(N).join(' → ')}.`);
  }
  if (sim.algo === 'SRTF' || (sim.algo === 'PRIO' && sim.preempt)) {
    const key = sim.algo === 'SRTF' ? (r) => (z ? `剩 ${r.left}` : `${r.left} left`) : (r) => (z ? `优先级 ${r.prio}` : `priority ${r.prio}`);
    const parts = s.checks.map((c) => {
      const list = c.ranked.map((r) => `${N(r.i)}(${key(r)})`).join(z ? '、' : ', ');
      const act = c.why === 'preempt' ? (z ? `${N(c.pick)} 更优，抢占` : `${N(c.pick)} is better and preempts`) : c.why === 'continue' ? (z ? `没有更优的，${N(c.pick)} 继续` : `nothing better, ${N(c.pick)} continues`) : z ? `选 ${N(c.pick)}` : `pick ${N(c.pick)}`;
      return z ? `t=${c.t}：就绪 ${list}，${act}` : `t=${c.t}: ready ${list}; ${act}`;
    });
    return (z ? `${parts.join('；')}。${P.name} 一直运行到 t=${s.end}。` : `${parts.join('; ')}. ${P.name} runs until t=${s.end}.`) + fin;
  }
  const c = s.checks[0];
  let reason;
  if (sim.algo === 'FCFS') reason = z ? `就绪进程按到达先后排队：${c.ranked.map((r) => `${N(r.i)}(到达 ${r.arrive})`).join('、')}，最先到的 ${P.name} 先运行` : `Ready jobs in arrival order: ${c.ranked.map((r) => `${N(r.i)} (arr ${r.arrive})`).join(', ')}; ${P.name} came first`;
  if (sim.algo === 'SJF') reason = z ? `就绪的有 ${c.ranked.map((r) => `${N(r.i)}(运行 ${r.burst})`).join('、')}，选运行时间最短的 ${P.name}` : `Ready: ${c.ranked.map((r) => `${N(r.i)} (${r.burst})`).join(', ')}; ${P.name} is shortest`;
  if (sim.algo === 'PRIO') reason = z ? `就绪的有 ${c.ranked.map((r) => `${N(r.i)}(优先级 ${r.prio})`).join('、')}，选优先级最高的 ${P.name}` : `Ready: ${c.ranked.map((r) => `${N(r.i)} (priority ${r.prio})`).join(', ')}; ${P.name} ranks highest`;
  if (sim.algo === 'HRRN') reason = z ? `计算响应比：${c.ranked.map((r) => `${N(r.i)} = (${r.wait} + ${r.den}) ÷ ${r.den} = ${frac(r.num, r.den)}`).join('；')}，选最大的 ${P.name}` : `Response ratios: ${c.ranked.map((r) => `${N(r.i)} = (${r.wait} + ${r.den}) ÷ ${r.den} = ${frac(r.num, r.den)}`).join('; ')}; ${P.name} is highest`;
  return (z ? `t=${s.start}：${reason}，不抢占，一直运行到 t=${s.end}。` : `t=${s.start}: ${reason}. No preemption, so it runs until t=${s.end}.`) + fin;
}

const segTitle = (sim, s) =>
  s.pid == null
    ? T(`t=${s.start}～${s.end}：CPU 空闲`, `t=${s.start}–${s.end}: CPU idle`)
    : sim.procs[s.pid].finish === s.end
      ? T(`t=${s.start}～${s.end}：${nm(sim, s.pid)} 运行至完成`, `t=${s.start}–${s.end}: ${nm(sim, s.pid)} runs to completion`)
      : T(`t=${s.start}～${s.end}：${nm(sim, s.pid)} 运行`, `t=${s.start}–${s.end}: ${nm(sim, s.pid)} runs`);

const segWhy = (sim, s) => {
  if (s.pid == null) return T('无就绪进程', 'nothing ready');
  if (sim.algo === 'RR') return s.why === 'done' ? T('时间片内完成', 'done within quantum') : T('时间片用完', 'quantum expired');
  if (s.why === 'preempt' || s.checks.some((c) => c.why === 'preempt')) return T('抢占', 'preempts');
  return { FCFS: T('最先到达', 'earliest'), SJF: T('运行时间最短', 'shortest'), SRTF: T('剩余时间最短', 'least left'), HRRN: T('响应比最高', 'highest ratio'), PRIO: T('优先级最高', 'highest priority') }[sim.algo];
};

// ───────────────────────── 解析、表格、状态 ─────────────────────────

function decode(ev) {
  const { sim, s } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  const fields = [info(T('理由', 'Why'), both((z) => segText(sim, s, z)), { note: true })];
  const cand = (s.checks[0]?.ranked ?? []).map((r) => {
    const v =
      sim.algo === 'HRRN' ? `(${r.wait} + ${r.den}) ÷ ${r.den} = ${frac(r.num, r.den)}` : sim.algo === 'SRTF' ? T(`剩余 ${r.left}`, `${r.left} left`) : sim.algo === 'PRIO' ? T(`优先级 ${r.prio}`, `priority ${r.prio}`) : sim.algo === 'SJF' ? T(`运行 ${r.burst}`, `burst ${r.burst}`) : T(`到达 ${r.arrive}`, `arrived ${r.arrive}`);
    return info(nm(sim, r.i), v, { tone: r.i === s.pid ? 'green' : null });
  });
  const layers = [{ name: T('判断', 'Decision'), summary: L(segWhy(sim, s)), start: 0, end: 0, fields, open: true }];
  if (cand.length) layers.push({ name: T(`t=${s.start} 时的候选`, `Candidates at t=${s.start}`), summary: '', start: 0, end: 0, fields: cand, open: true });
  if (sim.algo === 'RR' && s.pid != null) layers.push({ name: T('就绪队列', 'Ready queue'), summary: '', start: 0, end: 0, fields: [info(T('开始时', 'Before'), s.queue.map((i) => nm(sim, i)).join(' → ') || '—'), info(T('结束时', 'After'), s.after.map((i) => nm(sim, i)).join(' → ') || '—')], open: true });
  return {
    label: T('调度解析', 'Scheduling decoder'),
    tag: { color: s.pid == null ? 'slate' : tone(s.pid), text: s.pid == null ? T('空闲', 'Idle') : nm(sim, s.pid) },
    title: L(segTitle(sim, s)),
    meta: [
      [T('算法', 'Algorithm'), L(NAME[sim.algo])],
      [T('时间段', 'Interval'), `${s.start} ~ ${s.end}`],
    ],
    hint: T('这一段为什么轮到这个进程。', 'Why this process got the CPU here.'),
    view: { kind: 'none' },
    layers,
  };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok) return '';
  const now = snap?.now ?? 0;
  const z = getLang() === 'zh';
  const pr = sim.algo === 'PRIO';
  const head = [z ? '进程' : 'Proc', z ? '到达' : 'Arr', z ? '运行' : 'Burst', ...(pr ? [z ? '优先级' : 'Prio'] : []), z ? '完成' : 'Finish', z ? '周转' : 'TAT', z ? '带权周转' : 'Weighted', z ? '等待' : 'Wait'];
  const rows = sim.procs.map((p, i) => {
    const d = p.finish <= now;
    return { cls: d ? '' : 'is-empty', cells: [`<b class="pc-text c-${tone(i)}">${p.name}</b>`, p.arrive, p.burst, ...(pr ? [p.prio] : []), d ? p.finish : '—', d ? p.tat : '—', d ? esc(frac(p.tat, p.burst)) : '—', d ? p.wait : '—'] };
  });
  const all = sim.procs.every((p) => p.finish <= now);
  if (all) {
    const wt = sim.procs.reduce((a, p) => a + p.tat / p.burst, 0) / sim.n;
    rows.push({ cls: 'is-target', cells: [z ? '平均' : 'Avg', '', '', ...(pr ? [''] : []), '', esc(frac(...sim.avg.tat)), (+wt.toFixed(2)).toString(), esc(frac(...sim.avg.wait))] });
  }
  return `<div class="ms ms-wide">${card(T('周转时间表', 'Turnaround table'), all ? T('全部完成', 'all done') : T(`当前 t=${now}`, `now t=${now}`), table(head, rows), 'ms-grid is-focus')}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('调度记录', 'Schedule'),
  stateName: T('周转时间', 'Turnaround'),
  emptyRows: T('按「播放」或「单步」，每一段 CPU 时间都会记在这里。点任意一行看为什么轮到这个进程。', 'Press Play or Step; every CPU interval is logged here. Click a row to see why that process ran.'),
  cols: [
    { label: T('时间段', 'Interval'), cls: 'col-no' },
    { label: T('进程', 'Process'), cls: 'col-op' },
    { label: T('依据', 'Reason'), cls: 'col-res' },
    { label: T('就绪队列', 'Ready queue'), cls: 'col-info' },
  ],
  cells: (ev) => {
    const { sim, s } = ev;
    const q = sim.algo === 'RR' ? s.queue.slice(1) : s.queue;
    return [`<i class="dot"></i>${s.start}–${s.end}`, s.pid == null ? (getLang() === 'zh' ? '空闲' : 'idle') : nm(sim, s.pid), res(s.pid == null ? 'info' : s.why === 'preempt' ? 'warn' : 'ok', segWhy(sim, s)), q.map((i) => nm(sim, i)).join(' → ') || '—'];
  },
  decode,
  renderState,
});

export const DEFAULTS = { algo: 'SJF', ...STALLINGS, prio: [3, 1, 4, 2, 5], q: 4, prioLow: true, preempt: false, newFirst: true };

function build(params) {
  const sim = simulate(params);
  if (sim.ok) Object.assign(sim, { q: params.q, preempt: params.preempt });
  const lesson = {
    id: 'cpu-sched',
    kit,
    principle: SCHED_PRINCIPLE,
    where: [['os', 'process']],
    tag: T('调度', 'CPU'),
    name: T('进程调度与甘特图', 'CPU scheduling'),
    full: T('FCFS · SJF · SRTF · HRRN · 优先级 · RR，算周转时间', 'FCFS · SJF · SRTF · HRRN · priority · RR'),
    title: T(`${params.algo}${params.algo === 'RR' ? ` q=${params.q}` : ''} · ${params.arrive?.length ?? 0} 个进程`, `${params.algo}${params.algo === 'RR' ? ` q=${params.q}` : ''} · ${params.arrive?.length ?? 0} processes`),
    badge: NAME[params.algo] ?? '',
    nodes: [],
    legend: TONES.slice(0, sim.ok ? sim.n : 0).map((c, i) => [c, `P${i + 1}`]),
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '几个进程先后到达，CPU 一次只能运行一个。调度算法决定每个时刻轮到谁，结果画成甘特图，再算出周转时间和带权周转时间。下面可以换算法、改到达时间和运行时间，甘特图每一段都是算出来的。',
        'Several processes arrive over time and the CPU runs one at a time. The scheduling algorithm decides who runs when; the result is a Gantt chart and turnaround times. Change the algorithm or the times; every segment is computed.',
      ),
      facts: sim.ok
        ? [
            [T('算法', 'Algorithm'), NAME[sim.algo]],
            [T('规则', 'Rule'), RULE[sim.algo]],
            [T('进程', 'Processes'), sim.procs.map((p) => `${p.name}(${p.arrive}, ${p.burst}${sim.algo === 'PRIO' ? `, ${p.prio}` : ''})`).join(' ')],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const boardEv = (k) => ({ type: 'board', items: boardAt(sim, k, true), itemsEn: boardAt(sim, k, false) });
  const g = geo(sim);
  lesson.start.events = [boardEv(-1), { type: 'snap', snap: { now: 0 } }];
  lesson.steps = sim.segs.map((s, k) => ({
    ref: schedRef(sim, s),
    title: segTitle(sim, s),
    desc: s.pid == null ? T('没有就绪进程', 'Nothing is ready') : segWhy(sim, s),
    detail: both((z) => segText(sim, s, z)),
    facts: [
      [T('时间段', 'Interval'), `${s.start} ~ ${s.end}`],
      [T('运行', 'Running'), s.pid == null ? T('空闲', 'idle') : nm(sim, s.pid)],
      [T('就绪队列', 'Ready'), (sim.algo === 'RR' ? s.queue.slice(1) : s.queue).map((i) => nm(sim, i)).join(' → ') || '—'],
    ],
    events: [
      boardEv(k),
      { type: 'note', at: [g.X((s.start + s.end) / 2), g.cpuY - 62], text: s.pid == null ? T('空闲', 'Idle') : sim.procs[s.pid].finish === s.end ? T(`${nm(sim, s.pid)} 完成`, `${nm(sim, s.pid)} done`) : T(`${nm(sim, s.pid)} 运行`, `${nm(sim, s.pid)} runs`), tone: s.pid == null ? 'info' : sim.procs[s.pid].finish === s.end ? 'ok' : 'info' },
      { type: 'row', color: s.pid == null ? 'slate' : tone(s.pid), s, sim },
      { type: 'snap', snap: { now: s.end } },
    ],
  }));
  const wt = sim.procs.reduce((a, p) => a + p.tat / p.burst, 0) / sim.n;
  lesson.steps.push({
    title: T('算周转时间', 'Compute the turnaround times'),
    ref: 'metric',
    desc: T(`平均周转时间 ${frac(...sim.avg.tat)}`, `Average turnaround ${frac(...sim.avg.tat)}`),
    detail: both((z) =>
      z
        ? `所有进程都运行完了。周转时间 = 完成时间 − 到达时间：${sim.procs.map((p) => `${p.name} ${p.finish}−${p.arrive}=${p.tat}`).join('，')}。平均周转时间 = ${sim.avg.tat[0]} ÷ ${sim.n} = ${frac(...sim.avg.tat)}；平均带权周转时间 ≈ ${+wt.toFixed(2)}；平均等待时间 = ${frac(...sim.avg.wait)}。完整的表在「周转时间」标签页。`
        : `Every process is done. Turnaround = finish − arrival: ${sim.procs.map((p) => `${p.name} ${p.finish}−${p.arrive}=${p.tat}`).join(', ')}. Average turnaround ${sim.avg.tat[0]} ÷ ${sim.n} = ${frac(...sim.avg.tat)}; average weighted ≈ ${+wt.toFixed(2)}; average waiting ${frac(...sim.avg.wait)}. The full table is in the Turnaround tab.`,
    ),
    facts: [
      [T('平均周转时间', 'Avg turnaround'), frac(...sim.avg.tat)],
      [T('平均带权周转', 'Avg weighted'), String(+wt.toFixed(2))],
      [T('平均等待时间', 'Avg waiting'), frac(...sim.avg.wait)],
    ],
    events: [{ type: 'tab', tab: 'state' }],
  });
  lesson.outro = {
    title: T('调度完成', 'Schedule complete'),
    text: T(
      '换一个算法再跑一遍同样的进程，对比平均周转时间：SJF / SRTF 通常最短，但长作业可能一直等；RR 响应快，周转时间却未必好；HRRN 兼顾了等待时间，不会让长作业饿死。',
      'Run the same processes with another algorithm and compare: SJF / SRTF usually give the shortest average turnaround but can starve long jobs; RR responds quickly but may not turn around faster; HRRN accounts for waiting so long jobs are not starved.',
    ),
    facts: [
      [T('总时长', 'Makespan'), String(sim.total)],
      [T('平均周转时间', 'Avg turnaround'), frac(...sim.avg.tat)],
      [T('平均带权周转', 'Avg weighted'), String(+wt.toFixed(2))],
      [T('平均等待时间', 'Avg waiting'), frac(...sim.avg.wait)],
    ],
  };
  return lesson;
}

export const makeSched = () => parametric('cpu-sched', DEFAULTS, build);
