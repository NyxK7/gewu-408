// 「磁盘调度」这节课：上面一条磁道轴，下面是磁头一步步走过的折线（经典的磁头移动图），每步标出移动距离。
import { boardKit, frac, line, res, txt } from '../../core/board.js';
import { L, T, getLang } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { chip } from '../../core/steps.js';
import { ALGOS, simulate } from './disk.js';
import { DISK_PRINCIPLE } from './disk-principle.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const BOOK = { head: 100, reqs: [55, 58, 39, 18, 90, 160, 150, 38, 184], max: 199, dir: 'up', countReturn: true };
const NAME = {
  FCFS: T('FCFS 先来先服务', 'FCFS'),
  SSTF: T('SSTF 最短寻找时间优先', 'SSTF (shortest seek first)'),
  SCAN: T('SCAN 扫描（电梯）', 'SCAN (elevator)'),
  CSCAN: T('C-SCAN 循环扫描', 'C-SCAN'),
  LOOK: T('LOOK', 'LOOK'),
  CLOOK: T('C-LOOK', 'C-LOOK'),
};
const RULE = {
  FCFS: T('按请求到达的先后顺序服务。', 'Serve requests in arrival order.'),
  SSTF: T('每次去离磁头最近的请求。', 'Always go to the nearest request.'),
  SCAN: T('沿一个方向走到磁盘端点，途中服务请求，再掉头。', 'Sweep to the end of the disk, serving requests, then reverse.'),
  CSCAN: T('只沿一个方向服务；到端点后直接回到另一端再接着扫。', 'Serve in one direction only; at the end jump back to the other end.'),
  LOOK: T('像 SCAN，但走到这个方向最远的请求就掉头，不去端点。', 'Like SCAN, but reverse at the last request instead of the end.'),
  CLOOK: T('像 C-SCAN，但只走到最远的请求，再跳到另一侧最远的请求。', 'Like C-SCAN, but jump from the last request to the farthest one on the other side.'),
};

const SPEC = {
  presets: ALGOS.map((a) => ({ label: T(a === 'CSCAN' ? 'C-SCAN' : a === 'CLOOK' ? 'C-LOOK' : a, a === 'CSCAN' ? 'C-SCAN' : a === 'CLOOK' ? 'C-LOOK' : a), set: { algo: a, ...BOOK } })),
  groups: [
    {
      legend: T('算法', 'Algorithm'),
      fields: [
        { name: 'algo', label: T('调度算法', 'Algorithm'), type: 'select', options: ALGOS.map((a) => [a, NAME[a]]), wide: true },
        { name: 'dir', label: T('磁头当前方向', 'Head direction'), type: 'select', options: [['up', T('向磁道号增大', 'toward higher tracks')], ['down', T('向磁道号减小', 'toward lower tracks')]] },
        { name: 'countReturn', label: T('C-SCAN / C-LOOK 回程计入距离', 'Count the C-SCAN / C-LOOK return'), type: 'check', wide: true, show: (p) => p.algo === 'CSCAN' || p.algo === 'CLOOK' },
      ],
    },
    {
      legend: T('磁盘与请求', 'Disk and requests'),
      fields: [
        { name: 'head', label: T('磁头位置', 'Head at'), type: 'int', min: 0, max: 9999 },
        { name: 'max', label: T('最大磁道号', 'Last track'), type: 'int', min: 1, max: 9999 },
        { name: 'reqs', label: T('请求队列（按到达顺序）', 'Request queue (arrival order)'), type: 'list', min: 0, max: 9999, maxLen: 16, wide: true },
      ],
    },
  ],
  note: T(
    '各教材对 SCAN、C-SCAN 的说法不一：本课的 SCAN / C-SCAN 走到磁盘端点（0 或最大磁道号）才掉头或跳回，LOOK / C-LOOK 只走到最远的请求。C-SCAN / C-LOOK 跳回去的那段距离是否计入，用上面的开关切换。SSTF 距离相同时沿当前方向优先。平均寻道长度 = 总移动距离 ÷ 请求个数。',
    'Textbooks differ on SCAN and C-SCAN: here SCAN / C-SCAN go all the way to the end of the disk, LOOK / C-LOOK only to the last request. Whether the C-SCAN / C-LOOK return counts is a switch above. SSTF breaks ties in the current direction. Average seek = total distance ÷ number of requests.',
  ),
};

const ERR = {
  algo: T('请选择算法', 'Pick an algorithm'),
  max: T('最大磁道号要在 1～9999 之间', 'Last track must be 1–9999'),
  head: T('磁头位置超出范围', 'Head position out of range'),
  reqs: T('请求要有 1～16 个', 'Give 1–16 requests'),
  reqRange: T('有请求的磁道号超出范围', 'A request is out of range'),
};

// ───────────────────────── 画板 ─────────────────────────

function geo(sim) {
  const x0 = 120;
  const AW = 640;
  const X = (tr) => x0 + (tr / sim.max) * AW;
  const axisY = 150;
  const row = Math.max(22, Math.min(34, 330 / sim.path.length));
  const Y = (i) => axisY + 46 + i * row;
  return { x0, AW, X, Y, axisY, rect: [0, axisY - 100, x0 + AW + 130, Y(sim.path.length) + 30] };
}

function boardAt(sim, k, z) {
  const g = geo(sim);
  const items = [];
  // 磁道轴
  const ticks = [...new Set([0, sim.max, sim.head, ...sim.reqs])].sort((a, b) => a - b);
  let ax = line(0, 0, g.AW, 0, 'bl-axis');
  // 挨得太近的刻度数字错开两层，免得叠在一起
  let lastX = -99;
  let lift = false;
  for (const tr of ticks) {
    const x = g.X(tr) - g.x0;
    lift = x - lastX < 24 ? !lift : false;
    lastX = x;
    ax += line(x, -4, x, 4, 'bl-axis') + txt(x, lift ? -22 : -10, String(tr), tr === sim.head ? 'bt-now' : 'bt-idx');
  }
  items.push({ k: 'axis', x: g.x0, y: g.axisY, html: ax + txt(-16, 4, z ? '磁道' : 'track', 'bt-cap', 'end') });
  // 请求：还没服务的是红色小方格，服务过的变绿
  const served = new Set(sim.path.slice(0, k + 1).filter((p) => p.kind === 'req').map((p) => p.track));
  sim.reqs.forEach((r, i) => items.push({ k: `rq-${i}`, x: g.X(r), y: g.axisY + 22, html: chip(14, 14, '', { tone: served.has(r) ? 'green' : 'rose' }) }));
  // 磁头走过的折线
  let d = `M${g.X(sim.head)},${g.Y(0) - 20}`;
  let segs = '';
  let cum = 0;
  sim.path.slice(0, k + 1).forEach((p, i) => {
    const y = g.Y(i);
    const cls = p.kind === 'jump' ? (p.counted ? 'jump' : 'jump free') : p.kind === 'end' ? 'end' : '';
    segs += `<path class="bpath ${cls}" d="${d.replace(/^M/, 'M')} L${g.X(p.track)},${y}"/>`;
    d = `M${g.X(p.track)},${y}`;
    if (p.counted) cum += p.dist;
    // 靠左边的点标签放左侧，其余放右侧，都朝外，避开折线
    const leftSide = p.track < sim.max * 0.2;
    segs += `<circle class="bdot ${cls}" cx="${g.X(p.track)}" cy="${y}" r="3.6"/>` + txt(g.X(p.track) + (leftSide ? -8 : 8), y + 4, `${p.track}${p.kind === 'req' ? '' : p.kind === 'end' ? (z ? '（端点）' : ' (end)') : z ? '（跳转）' : ' (jump)'}  +${p.counted ? p.dist : 0}`, 'bt-step', leftSide ? 'end' : 'start');
  });
  items.push({ k: 'path', x: 0, y: 0, html: `<path class="bpath start" d="M${g.X(sim.head)},${g.axisY + 30} L${g.X(sim.head)},${g.Y(0) - 20}"/>` + segs });
  const at = k >= 0 ? sim.path[k].track : sim.head;
  items.push({ k: 'head', x: g.X(at), y: g.axisY - 30, html: `<path class="bhead" d="M0,0 L-8,-12 L8,-12 Z"/>` + txt(0, -16, z ? '磁头' : 'head', 'bt-now') });
  items.push({ k: 'sum', x: g.x0 + g.AW, y: g.axisY - 60, html: txt(0, 0, z ? `累计 ${cum}` : `total ${cum}`, 'bt-formula cur', 'end') });
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

function stepText(sim, k, z) {
  const p = sim.path[k];
  const from = p.from;
  if (p.kind === 'end') return z ? `沿这个方向已经没有请求了，但 SCAN / C-SCAN 要一直走到磁盘端点 ${p.track}，移动 ${p.dist}。` : `No requests remain in this direction, but SCAN / C-SCAN still runs to the end of the disk, ${p.track}: ${p.dist} tracks.`;
  if (p.kind === 'jump') return z ? `${sim.algo === 'CSCAN' ? '到了端点，' : '这个方向最远的请求已服务，'}磁头直接跳到 ${p.track}，途中不服务请求。这段距离 ${p.dist} ${p.counted ? '计入总移动距离' : '按本课设置不计入'}。` : `${sim.algo === 'CSCAN' ? 'At the end, ' : 'With the farthest request served, '}the head jumps to ${p.track} without serving anything. This ${p.dist}-track return ${p.counted ? 'counts' : 'is not counted here'}.`;
  const move = z ? `从 ${from} 移到 ${p.track}，移动 ${p.dist}。` : `Move from ${from} to ${p.track}: ${p.dist} tracks.`;
  if (sim.algo === 'FCFS') return (z ? `按到达顺序，下一个请求是 ${p.track}。` : `Next in arrival order is ${p.track}. `) + move;
  if (sim.algo === 'SSTF') {
    const ds = remaining(sim, k).map((r) => `${r}(${Math.abs(r - from)})`).join(z ? '、' : ', ');
    return (z ? `还没服务的请求离磁头 ${from} 的距离：${ds}，最近的是 ${p.track}。` : `Distances from ${from}: ${ds}; ${p.track} is nearest. `) + move;
  }
  return (z ? `沿磁道号${p.track >= from ? '增大' : '减小'}的方向，下一个请求是 ${p.track}。` : `Heading toward ${p.track >= from ? 'higher' : 'lower'} tracks, the next request is ${p.track}. `) + move;
}

/** 第 k 步之前还没服务的请求（重复的磁道号按个数算） */
function remaining(sim, k) {
  const left = [...sim.reqs];
  for (const p of sim.path.slice(0, k)) {
    if (p.kind !== 'req') continue;
    const i = left.indexOf(p.track);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

function decode(ev) {
  const { sim, k } = ev;
  const p = sim.path[k];
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  return {
    label: T('磁头移动解析', 'Seek decoder'),
    tag: { color: p.kind === 'req' ? 'green' : 'slate', text: String(p.track) },
    title: both((z) => (z ? `第 ${k + 1} 步：${p.from} → ${p.track}` : `Step ${k + 1}: ${p.from} → ${p.track}`)),
    meta: [[T('算法', 'Algorithm'), L(NAME[sim.algo])]],
    hint: '',
    view: { kind: 'none' },
    layers: [
      { name: T('这一步', 'This step'), summary: '', start: 0, end: 0, open: true, fields: [info(T('说明', 'Notes'), both((z) => stepText(sim, k, z)), { note: true }), info(T('还没服务的请求', 'Still waiting'), remaining(sim, k).join(' ') || '—')] },
    ],
  };
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('磁头移动', 'Seeks'),
  emptyRows: T('按「播放」或「单步」，磁头每移动一次都会记在这里。', 'Press Play or Step; every seek is logged here.'),
  cols: [
    { label: '#', cls: 'col-no' },
    { label: T('下一磁道', 'Next track'), cls: 'col-op' },
    { label: T('移动距离', 'Distance'), cls: 'col-op' },
    { label: T('累计', 'Total'), cls: 'col-info' },
  ],
  cells: (ev, idx) => {
    const p = ev.sim.path[ev.k];
    const cum = ev.sim.path.slice(0, ev.k + 1).reduce((a, q) => a + (q.counted ? q.dist : 0), 0);
    const tag = p.kind === 'req' ? '' : ` ${res('info', p.kind === 'end' ? T('端点', 'end') : p.counted ? T('跳转', 'jump') : T('跳转 · 不计', 'jump · free'))}`;
    return [`<i class="dot"></i>${idx + 1}`, String(p.track) + tag, String(p.counted ? p.dist : 0), String(cum)];
  },
  decode,
});

export const DEFAULTS = { algo: 'SSTF', ...BOOK };

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'disk-sched',
    kit,
    principle: DISK_PRINCIPLE,
    where: [['os', 'io']],
    tag: T('磁盘', 'Disk'),
    name: T('磁盘调度', 'Disk scheduling'),
    full: T('FCFS · SSTF · SCAN · C-SCAN · LOOK · C-LOOK，算平均寻道长度', 'FCFS · SSTF · SCAN · C-SCAN · LOOK · C-LOOK, average seek length'),
    title: T(`${params.algo} · 磁头 ${params.head}`, `${params.algo} · head ${params.head}`),
    badge: NAME[params.algo] ?? '',
    nodes: [],
    legend: [
      ['rose', T('待服务', 'Waiting')],
      ['green', T('已服务', 'Served')],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '磁盘读写前磁头要先移到目标磁道，寻道是最慢的一步。多个请求排着队时，按什么顺序去决定了磁头总共要走多远。下面可以换算法、改磁头位置和请求队列，磁头移动图和平均寻道长度都是算出来的。',
        'Before reading, the head must seek to the right track, the slowest part of a disk access. With a queue of requests, the order decides how far the head travels. Change the algorithm, head position or queue; the seek chart and average are computed.',
      ),
      facts: sim.ok ? [[T('算法', 'Algorithm'), NAME[sim.algo]], [T('规则', 'Rule'), RULE[sim.algo]]] : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const g = geo(sim);
  const boardEv = (k) => ({ type: 'board', items: boardAt(sim, k, true), itemsEn: boardAt(sim, k, false), ms: 480 });
  lesson.start.events = [boardEv(-1)];
  lesson.steps = sim.path.map((p, k) => ({
    ref: 'algo',
    title: p.kind === 'req' ? T(`移到 ${p.track}（+${p.dist}）`, `To ${p.track} (+${p.dist})`) : p.kind === 'end' ? T(`走到端点 ${p.track}`, `To the end, ${p.track}`) : T(`跳到 ${p.track}`, `Jump to ${p.track}`),
    desc: T(`${p.from} → ${p.track}`, `${p.from} → ${p.track}`),
    detail: both((z) => stepText(sim, k, z)),
    facts: [[T('移动距离', 'Distance'), String(p.counted ? p.dist : 0)]],
    events: [boardEv(k), { type: 'note', at: [g.X(p.track), g.Y(k) - 30], text: `+${p.counted ? p.dist : 0}`, tone: p.kind === 'req' ? 'ok' : 'info' }, { type: 'row', color: p.kind === 'req' ? 'green' : 'slate', sim, k }],
  }));
  lesson.outro = {
    title: T(`总移动距离 ${sim.total}`, `Total seek ${sim.total}`),
    text: T('换一个算法再走一遍同样的队列：SSTF 通常走得最少，但远处的请求可能一直等（饥饿）；SCAN 类算法用扫描保证每个请求都轮得到；C-SCAN 只朝一个方向服务，各位置的等待时间更均匀。', 'Run the same queue with another algorithm: SSTF usually travels least but can starve distant requests; SCAN-type sweeps guarantee service; C-SCAN serves one direction only, evening out waits.'),
    facts: [
      [T('服务顺序', 'Order'), sim.order.join(' → ')],
      [T('总移动距离', 'Total'), String(sim.total)],
      [T('平均寻道长度', 'Average seek'), frac(...sim.avg)],
    ],
  };
  return lesson;
}

export const makeDisk = () => parametric('disk-sched', DEFAULTS, build);
