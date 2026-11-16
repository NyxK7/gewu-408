// 「Dijkstra 最短路径」这节课：顶点摆在等距地面的一圈上，每轮把距离最小的顶点放进集合 S，再用它更新邻居。
import { DIJKSTRA_PRINCIPLE, dijkstraRef } from './ds-principles.js';
import { boardKit, txt } from '../../core/board.js';
import { chip, node } from '../../core/steps.js';
import { L, T, esc, getLang } from '../../core/i18n.js';
import { proj } from '../../core/iso.js';
import { card, parametric, table } from '../../core/params.js';
import { pathIn, simulate } from './dijkstra.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const inf = (d) => (d === Infinity ? '∞' : String(d));
const CLRS = 'A>B 10, A>E 5, B>C 1, B>E 2, C>D 4, E>B 3, E>C 9, E>D 2, D>A 7, D>C 6';

const SPEC = {
  presets: [
    { label: T('有向图 5 个顶点', 'Directed, 5 vertices'), set: { graph: CLRS, src: 'A', directed: true } },
    { label: T('无向图 6 个顶点', 'Undirected, 6 vertices'), set: { graph: 'A-B 7, A-C 9, A-F 14, B-C 10, B-D 15, C-D 11, C-F 2, D-E 6, E-F 9', src: 'A', directed: false } },
    { label: T('有不可达的顶点', 'With an unreachable vertex'), set: { graph: 'A>B 2, A>C 6, B>C 3, C>D 1, E>A 4', src: 'A', directed: true } },
  ],
  groups: [
    {
      legend: T('图', 'Graph'),
      fields: [
        { name: 'graph', label: T('边（A-B 4 无向，A>B 4 有向）', 'Edges (A-B 4 undirected, A>B 4 directed)'), type: 'text', wide: true, hint: T('用逗号或分号隔开，顶点名最多 3 个字母或数字，最多 10 个顶点', 'Separate with commas; vertex names up to 3 letters/digits; at most 10 vertices') },
        { name: 'directed', label: T('有向图', 'Directed'), type: 'check' },
        { name: 'src', label: T('源点', 'Source'), type: 'text' },
      ],
    },
  ],
  note: T(
    '权值必须非负（有负权时 Dijkstra 会出错，要用 Bellman-Ford）。初始时源点放进集合 S，到其余顶点的距离取直接相连的边，没有边记 ∞。每轮从 S 以外选距离最小的顶点，距离相同时按顶点名顺序选。无向图里 A-B 4 表示两个方向都有一条权为 4 的边。',
    'Weights must be non-negative (negative weights need Bellman-Ford). Start with the source in S and every other distance equal to the direct edge, or ∞. Each round picks the closest vertex outside S, breaking ties by name. In an undirected graph A-B 4 means an edge of weight 4 both ways.',
  ),
};

const ERR = {
  edge: T('看不懂这条边：{e}', 'Cannot read this edge: {e}'),
  count: T('顶点数要在 2～10 之间', 'Use 2–10 vertices'),
  edges: T('边最多 30 条', 'At most 30 edges'),
  negative: T('有负权的边，Dijkstra 不适用', 'Negative weights: Dijkstra does not apply'),
  src: T('源点 {s} 不在图里', 'Source {s} is not in the graph'),
};

// ───────────────────────── 画板 ─────────────────────────

function geo(sim) {
  const n = sim.V.length;
  const P = proj(420, 300);
  const R = n <= 4 ? 150 : 190;
  const pos = {};
  sim.V.forEach((v, i) => {
    const a = -Math.PI * 0.75 + (2 * Math.PI * i) / n;
    pos[v] = P(R * Math.cos(a), R * Math.sin(a));
  });
  const xs = Object.values(pos).map((p) => p[0]);
  const ys = Object.values(pos).map((p) => p[1]);
  return { pos, rect: [Math.min(...xs) - 70, Math.min(...ys) - 90, Math.max(...xs) + 70, Math.max(...ys) + 60] };
}

/** k = -1 开始前；0 初始化之后；k ≥ 1 第 k 轮之后；final = 画出最短路径树 */
function boardAt(sim, k, z, final = false) {
  const g = geo(sim);
  const st = k <= 0 ? sim.start : sim.rounds[k - 1].after;
  const round = k >= 1 ? sim.rounds[k - 1] : null;
  const S = new Set(k < 0 ? [] : st.S);
  const items = [];
  // 边：同一对顶点的两个方向画成一条弧的两侧
  const seen = new Set();
  for (const e of sim.edges) {
    const key = sim.directed ? `${e.u}>${e.v}` : [e.u, e.v].sort().join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    const [x1, y1] = g.pos[e.u];
    const [x2, y2] = g.pos[e.v];
    const twin = sim.directed && sim.edges.some((f) => f.u === e.v && f.v === e.u);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [nx, ny] = [-(y2 - y1) / len, (x2 - x1) / len];
    const off = twin ? 9 : 0;
    const shrink = 26;
    const ax = x1 + ((x2 - x1) / len) * shrink + nx * off;
    const ay = y1 + ((y2 - y1) / len) * shrink + ny * off - 10;
    const bx = x2 - ((x2 - x1) / len) * shrink + nx * off;
    const by = y2 - ((y2 - y1) / len) * shrink + ny * off - 10;
    const inTree = k >= 0 && (st.prev[e.v] === e.u || (!sim.directed && st.prev[e.u] === e.v));
    const up = round?.updates.find((u) => (u.v === e.v && round.pick === e.u) || (!sim.directed && u.v === e.u && round.pick === e.v));
    const cls = up ? (up.better ? 'better' : 'tried') : inTree ? 'tree' : '';
    const tip = sim.directed ? `<path class="bedge-tip ${cls}" d="M${bx},${by} l${(-(bx - ax) / len) * 10 + nx * 4},${(-(by - ay) / len) * 10 + ny * 4} l${-nx * 8},${-ny * 8} z"/>` : '';
    const mx = (ax + bx) / 2 + nx * 10;
    const my = (ay + by) / 2 + ny * 10;
    items.push({ k: `e-${key}`, x: 0, y: 0, html: `<line class="bedge ${cls}" x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}"/>${tip}<g class="bw ${cls}"><rect x="${(mx - 11).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="22" height="16" rx="4"/>${txt(mx, my + 3, String(e.w), 'bt-w')}</g>` });
  }
  for (const v of sim.V) {
    const [x, y] = g.pos[v];
    const d = k < 0 ? (v === sim.src ? 0 : Infinity) : st.dist[v];
    const tone = v === sim.src ? 'amber' : S.has(v) ? 'green' : round?.pick === v ? 'amber' : '';
    const lab = k < 0 ? '' : txt(0, -46, `d=${inf(d)}`, `bt-dist ${S.has(v) ? 'fixed' : ''}`);
    items.push({ k: `v-${v}`, x, y, cls: round?.pick === v ? 'is-cur' : '', html: node(v, { tone, dy: -10, r: 21, size: 15 }) + lab });
  }
  if (final) {
    let s = '';
    sim.V.filter((v) => v !== sim.src).forEach((v, i) => {
      const p = sim.paths[v];
      s += txt(0, i * 20, `${v}: ${p ? `${p.join('→')} = ${sim.dist[v]}` : z ? '不可达' : 'unreachable'}`, 'bt-code', 'start');
    });
    items.push({ k: 'paths', x: g.rect[2] + 20, y: g.rect[1] + 40, html: s });
  }
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

function roundText(sim, r, z) {
  const b = r.before;
  if (!r.pick) return z ? `S 以外的顶点 ${r.unreachable.join('、')} 距离都是 ∞，从源点到不了，算法结束。` : `The vertices left outside S (${r.unreachable.join(', ')}) are all at ∞: unreachable, so the algorithm stops.`;
  const cand = sim.V.filter((v) => !b.S.includes(v)).map((v) => `${v}=${inf(b.dist[v])}`);
  const head = z ? `S 以外各顶点的当前距离：${cand.join('，')}。最小的是 ${r.pick}（${r.d}），它的最短路径确定为 ${pathIn(r.after.prev, r.pick).join('→')}，放进 S。` : `Current distances outside S: ${cand.join(', ')}. The smallest is ${r.pick} (${r.d}); its shortest path ${pathIn(r.after.prev, r.pick).join('→')} is final, so it joins S. `;
  if (!r.updates.length) return head + (z ? `它没有通往 S 以外顶点的边，不用更新。` : `It has no edges to vertices outside S, so nothing changes.`);
  const ups = r.updates.map((u) =>
    z
      ? `${u.v}：${r.d} + ${u.w} = ${u.via} ${u.better ? `< ${inf(u.old)}，更新为 ${u.via}` : `≥ ${inf(u.old)}，不变`}`
      : `${u.v}: ${r.d} + ${u.w} = ${u.via} ${u.better ? `< ${inf(u.old)}, now ${u.via}` : `≥ ${inf(u.old)}, unchanged`}`,
  );
  return head + (z ? `再看从 ${r.pick} 出发的边能不能让别的顶点更近：${ups.join('；')}。` : `Then check whether ${r.pick}'s edges bring others closer: ${ups.join('; ')}.`);
}

// ───────────────────────── 解析、表格、状态 ─────────────────────────

function decode(ev) {
  const { sim, r } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  const layers = [];
  if (r) {
    layers.push({ name: T(`第 ${r.k} 轮`, `Round ${r.k}`), summary: r.pick ? T(`选 ${r.pick}`, `pick ${r.pick}`) : T('结束', 'stop'), start: 0, end: 0, open: true, fields: [info(T('过程', 'Process'), both((z) => roundText(sim, r, z)), { note: true })] });
    layers.push({ name: T('这一轮之后的距离', 'Distances after'), summary: '', start: 0, end: 0, open: true, fields: sim.V.map((v) => info(v, `${inf(r.after.dist[v])}${r.after.dist[v] < Infinity && v !== sim.src ? ` · ${pathIn(r.after.prev, v).join('→')}` : ''}`, { tone: r.after.S.includes(v) ? 'green' : null })) });
  } else {
    layers.push({ name: T('初始化', 'Initialisation'), summary: '', start: 0, end: 0, open: true, fields: sim.V.map((v) => info(v, inf(sim.start.dist[v]))) });
  }
  return { label: T('最短路径解析', 'Shortest-path decoder'), tag: { color: 'green', text: r?.pick ?? sim.src }, title: L(ev.what), meta: [[T('源点', 'Source'), sim.src]], hint: '', view: { kind: 'none' }, layers };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok) return '';
  const k = snap?.k ?? -1;
  const z = getLang() === 'zh';
  const rounds = sim.rounds.filter((r) => r.pick);
  const others = sim.V.filter((v) => v !== sim.src);
  const head = [z ? '终点' : 'To', ...rounds.map((r) => (z ? `第 ${r.k} 轮` : `R${r.k}`))];
  const rows = others.map((v) => ({
    cells: [`<b>${esc(v)}</b>`, ...rounds.map((r) => {
      if (r.k > k) return '';
      if (r.before.S.includes(v)) return '<span class="dim">—</span>';
      const d = r.before.dist[v];
      const s = d === Infinity ? '∞' : `${d} <span class="dim">${esc(pathIn(r.before.prev, v).join('→'))}</span>`;
      return r.pick === v ? `<b class="pick">${s}</b>` : s;
    })],
  }));
  rows.push({ cls: 'row-ref', cells: [z ? '选中' : 'Pick', ...rounds.map((r) => (r.k <= k ? `<b>${esc(r.pick)}</b>` : ''))] });
  rows.push({ cells: [z ? '集合 S' : 'Set S', ...rounds.map((r) => (r.k <= k ? `{${esc(r.after.S.join(','))}}` : ''))] });
  return `<div class="ms ms-wide">${card(T('Dijkstra 过程表', 'Dijkstra table'), T('每列是这一轮开始时的距离与路径，加粗的是被选中的顶点', 'Each column: distances when the round starts; bold = picked'), table(head, rows), 'ms-grid is-focus')}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('每一轮', 'Rounds'),
  stateName: T('过程表', 'Table'),
  emptyRows: T('按「播放」或「单步」，每一轮选了谁、更新了谁都会记在这里。', 'Press Play or Step; every round is logged here.'),
  cols: [
    { label: T('轮次', 'Round'), cls: 'col-no' },
    { label: T('选中', 'Pick'), cls: 'col-op' },
    { label: T('更新', 'Updates'), cls: 'col-info' },
  ],
  cells: (ev, idx) => {
    if (!ev.r) return [`<i class="dot"></i>0`, ev.sim.src, ev.sim.init.map((x) => `${x.v}=${x.d}`).join(' ') || '—'];
    const r = ev.r;
    return [`<i class="dot"></i>${r.k}`, r.pick ? `${r.pick} (${r.d})` : '—', r.updates.filter((u) => u.better).map((u) => `${u.v}: ${inf(u.old)}→${u.via}`).join(' ') || '—'];
  },
  decode,
  renderState,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'dijkstra',
    kit,
    where: [['ds', 'graph']],
    principle: DIJKSTRA_PRINCIPLE,
    tag: T('最短', 'SP'),
    name: T('Dijkstra 最短路径', 'Dijkstra shortest paths'),
    full: T('单源最短路径 · 集合 S · 松弛 · 过程表', 'Single-source shortest paths · set S · relaxation'),
    title: T(`${params.directed ? '有向图' : '无向图'} · 源点 ${params.src}`, `${params.directed ? 'Directed' : 'Undirected'} · source ${params.src}`),
    badge: params.directed ? T('有向图', 'Directed') : T('无向图', 'Undirected'),
    nodes: [],
    legend: [
      ['amber', T('源点 / 本轮选中', 'Source / picked')],
      ['green', T('已在 S 中', 'In S')],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map(([k, v]) => ({ zh: ERR[k].zh.replace('{e}', v?.e ?? '').replace('{s}', v?.s ?? ''), en: ERR[k].en.replace('{e}', v?.e ?? '').replace('{s}', v?.s ?? '') })),
    overview: {
      desc: T(
        'Dijkstra 算法从源点出发，每轮把「目前离源点最近、还没确定」的顶点确定下来，再看经过它能不能让其他顶点更近（松弛）。因为边权非负，被选中的那个顶点不可能再被别的路径超过。下面可以改图、改源点，过程表和动画都是算出来的。',
        'Dijkstra grows a set of settled vertices: each round settles the closest unsettled vertex, then relaxes its edges. With non-negative weights nothing can later beat the vertex just settled. Edit the graph or source; the table and animation are computed.',
      ),
      facts: sim.ok
        ? [
            [T('顶点', 'Vertices'), sim.V.join(' ')],
            [T('边数', 'Edges'), String(sim.edges.length)],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const g = geo(sim);
  const boardEv = (k, final) => ({ type: 'board', items: boardAt(sim, k, true, final), itemsEn: boardAt(sim, k, false, final), ms: 520 });
  lesson.start.events = [boardEv(-1), { type: 'snap', snap: { k: 0 } }];
  lesson.start.frame = { rect: [g.rect[0], g.rect[1], g.rect[2] + 150, g.rect[3]] };
  lesson.steps.push({
    title: T(`初始化：S = {${sim.src}}`, `Start: S = {${sim.src}}`),
    desc: T('到各顶点的距离取直接相连的边', 'Distances = direct edges'),
    detail: both((z) => (z ? `把源点 ${sim.src} 放进集合 S，dist[${sim.src}] = 0。从 ${sim.src} 直接有边到的顶点，距离取边的权值：${sim.init.map((x) => `${x.v}=${x.d}`).join('，') || '没有'}；其余顶点记为 ∞。` : `Put the source ${sim.src} in S with distance 0. Vertices adjacent to it start at the edge weight: ${sim.init.map((x) => `${x.v}=${x.d}`).join(', ') || 'none'}; the rest at ∞.`)),
    facts: [[T('集合 S', 'Set S'), `{${sim.src}}`]],
    events: [boardEv(0), { type: 'row', color: 'amber', sim, what: T('初始化', 'Initialise') }, { type: 'snap', snap: { k: 0 } }],
  });
  for (const r of sim.rounds) {
    lesson.steps.push({
      title: r.pick ? T(`第 ${r.k} 轮：选 ${r.pick}（${r.d}）`, `Round ${r.k}: pick ${r.pick} (${r.d})`) : T(`第 ${r.k} 轮：剩下的不可达`, `Round ${r.k}: the rest is unreachable`),
      desc: r.pick ? T(`S = {${r.after.S.join(', ')}}`, `S = {${r.after.S.join(', ')}}`) : T('算法结束', 'Done'),
      detail: both((z) => roundText(sim, r, z)),
      facts: r.pick ? [[T('选中', 'Picked'), `${r.pick} = ${r.d}`], [T('路径', 'Path'), pathIn(r.after.prev, r.pick).join('→')]] : [],
      events: [boardEv(r.k), ...(r.pick ? [{ type: 'note', at: [g.pos[r.pick][0], g.pos[r.pick][1] - 78], text: T(`${r.pick} 确定：${r.d}`, `${r.pick} settled: ${r.d}`), tone: 'ok' }] : []), { type: 'row', color: r.pick ? 'green' : 'slate', sim, r, what: r.pick ? T(`第 ${r.k} 轮：选 ${r.pick}`, `Round ${r.k}: ${r.pick}`) : T('不可达', 'Unreachable') }, { type: 'snap', snap: { k: r.k } }],
    });
  }
  const last = sim.rounds.length;
  lesson.steps.push({
    title: T('最短路径树', 'Shortest-path tree'),
    desc: T('每个顶点沿 prev 回到源点', 'Follow prev back to the source'),
    detail: both((z) => (z ? `每个顶点记下了「最后一次更新它的顶点」，顺着它倒推回源点就是最短路径：${sim.V.filter((v) => v !== sim.src).map((v) => `${v} ${sim.paths[v] ? `${sim.paths[v].join('→')}（${sim.dist[v]}）` : '不可达'}`).join('；')}。这些边合起来是一棵最短路径树。` : `Each vertex remembers who last improved it; following that back gives the path: ${sim.V.filter((v) => v !== sim.src).map((v) => `${v} ${sim.paths[v] ? `${sim.paths[v].join('→')} (${sim.dist[v]})` : 'unreachable'}`).join('; ')}. Together the edges form a shortest-path tree.`)),
    facts: [],
    events: [boardEv(last, true), { type: 'tab', tab: 'state' }],
  });
  lesson.outro = {
    title: T('最短路径都找到了', 'All shortest paths found'),
    text: T('Dijkstra 的时间复杂度用邻接矩阵是 O(n²)。它要求边权非负：有负权边时，已经放进 S 的顶点可能被后来的负边「抄近路」，结果就错了。改一条边的权值试试，看哪一轮的选择会变。', 'With an adjacency matrix Dijkstra runs in O(n²). It needs non-negative weights: a negative edge could later undercut a settled vertex. Change a weight and see which round changes.'),
    facts: sim.V.filter((v) => v !== sim.src).map((v) => [v, sim.paths[v] ? `${sim.dist[v]} · ${sim.paths[v].join('→')}` : T('不可达', 'unreachable')]),
  };
  lesson.steps.forEach((s, i, all) => (s.ref ??= dijkstraRef(s, i, all)));
  return lesson;
}

export const makeDijkstra = () => parametric('dijkstra', DEFAULTS, build);
