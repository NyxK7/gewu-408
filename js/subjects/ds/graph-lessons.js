// 图这一章的五节课：最小生成树、拓扑排序、关键路径、图的遍历、Floyd。都用平面的圆点和连线画图，旁边配表格。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { boundsOf, circleLayout, graphItems, gridTable, layerLayout, nameCmp } from './graph.js';
import { critical, floyd, mst, search, topo } from './graphalgo.js';

const ERR = {
  edge: T('这条边看不懂：{e}', 'Cannot read this edge: {e}'),
  count: T('顶点数不对（2～10 个，Floyd 最多 6 个）', 'Wrong number of vertices'),
  edges: T('边最多 30 条', 'At most 30 edges'),
  negative: T('权值不能为负', 'Weights cannot be negative'),
  cycle: T('图里有回路，不是 AOE 网', 'The graph has a cycle'),
  ends: T('AOE 网要有唯一的源点和唯一的汇点', 'An AOE network needs one source and one sink'),
  start: T('起点 {s} 不在图里', 'Start {s} is not in the graph'),
};
const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
const key = (u, v) => [u, v].sort(nameCmp).join('-');
const inf = (x) => (x === Infinity ? '∞' : String(x));
const right = (pos) => boundsOf(pos)[2] + 40;

// ═════════════════════════ 最小生成树 ═════════════════════════

const MST_PRINCIPLE = {
  sections: [
    {
      id: 'def',
      title: T('最小生成树', 'Minimum spanning trees'),
      blocks: [
        { p: T('连通图的**生成树**包含全部 n 个顶点和其中 n − 1 条边，不能有回路。带权连通无向图里，边权之和最小的生成树叫**最小生成树（MST）**。MST 可能不唯一，但权值之和唯一；各边权值都不相同时 MST 唯一。', 'A **spanning tree** has all n vertices and n − 1 edges without cycles; the one of least total weight is the **MST**. It may not be unique, but its weight is.') },
        { tip: T('两种算法都基于同一个性质：把顶点分成两部分，跨越两部分的最小权边一定在某棵 MST 里。', 'Both algorithms rely on the cut property: the lightest edge across a cut belongs to some MST.') },
      ],
    },
    {
      id: 'prim',
      title: T('Prim 算法：加点', 'Prim: grow by vertices'),
      blocks: [
        {
          steps: [
            T('从任一顶点开始，它自己构成一棵树；', 'start from any vertex;'),
            T('在「一端在树内、一端在树外」的边里选权值最小的，把它和树外的那个顶点加入树；', 'add the cheapest edge from the tree to an outside vertex;'),
            T('重复 n − 1 次。', 'repeat n − 1 times.'),
          ],
        },
        { p: T('实现时维护 lowcost 数组：每个树外顶点到树的最短边。时间 O(n²)，与边数无关，适合**稠密图**。', 'Keep lowcost for each outside vertex. O(n²), independent of edges: good for **dense** graphs.') },
      ],
    },
    {
      id: 'kruskal',
      title: T('Kruskal 算法：加边', 'Kruskal: grow by edges'),
      blocks: [
        {
          steps: [
            T('开始时每个顶点各自是一个连通分量；', 'every vertex starts as its own component;'),
            T('把边按权值从小到大排序，依次考察；', 'take edges in increasing weight;'),
            T('边的两个端点在不同分量里就选它（两个分量合并）；在同一个分量里就丢弃——会形成回路；', 'accept an edge joining two components, reject one inside a component (it would close a cycle);'),
            T('选够 n − 1 条边为止。', 'stop at n − 1 edges.'),
          ],
        },
        { p: T('判断两端是否同一分量用**并查集**。时间 O(e log e)（主要是排序），适合**稀疏图**。', 'Use **union-find** for the component test. O(e log e): good for **sparse** graphs.') },
      ],
    },
    pit([
      T('Prim 比的是到「整棵树」的最短边，不是到上一个加入的顶点。', 'Prim compares edges to the whole tree, not the last vertex.'),
      T('Kruskal 丢弃的是会成环的边，不是权值大的边。', 'Kruskal rejects cycle-making edges, not heavy ones.'),
      T('题目问「依次选中的边」时，两种算法的顺序一般不同，但总权值相同。', 'The two orders differ; the total does not.'),
    ]),
  ],
};

function mstBoard(sim, st, z) {
  const pos = circleLayout(sim.V, {}, sim.edges);
  const s = st.k >= 0 ? sim.steps[st.k] : null;
  const chosen = new Set(s?.chosen ?? []);
  const inT = sim.algo === 'prim' ? new Set(s ? s.tree : [sim.start]) : null;
  const items = graphItems(sim.V, sim.edges, pos, {
    edgeCls: (e) => (s && key(e.u, e.v) === key(s.pick.u, s.pick.v) ? (s.ok === false ? 'bad' : 'on') : chosen.has(key(e.u, e.v)) ? 'tree' : st.done ? 'dim' : ''),
    tone: (v) => (sim.algo === 'prim' ? (inT.has(v) ? 'green' : '') : ''),
    cls: (v) => (s && (s.pick.out === v || (sim.algo === 'kruskal' && (s.pick.u === v || s.pick.v === v))) ? 'hot' : ''),
  });
  const X = right(pos);
  if (sim.algo === 'prim' && s) {
    const outs = Object.keys(s.low);
    const head = [z ? '树外顶点' : 'outside', ...outs];
    const rows = [[z ? '最短边' : 'lowcost', ...outs.map((v) => ({ t: s.low[v] ? `${s.low[v].from}-${v} ${s.low[v].w}` : '∞', cls: v === s.pick.out ? 'hot' : '' }))]];
    items.push({ k: 'low', x: X, y: 120, html: txt(0, -12, z ? '选这一条之前：每个树外顶点到树的最短边' : 'Before this pick: cheapest edge to the tree', 'bt-cap', 'start') + gridTable(head, rows, { cw: 62, first: 70 }) });
  }
  if (sim.algo === 'kruskal') {
    const status = new Map(sim.steps.slice(0, (st.k ?? -1) + 1).map((x) => [key(x.pick.u, x.pick.v), x.ok]));
    let h = txt(0, -12, z ? '按权值排好序的边' : 'Edges by weight', 'bt-cap', 'start');
    sim.sorted.forEach((e, i) => {
      const k2 = key(e.u, e.v);
      const stt = status.get(k2);
      const cur = s && k2 === key(s.pick.u, s.pick.v);
      h += `<g transform="translate(${(i % 2) * 120} ${Math.floor(i / 2) * 30})">${cell(112, 26, `${e.u}-${e.v}  ${e.w}  ${stt === true ? '✓' : stt === false ? (z ? '✗ 成环' : '✗ cycle') : ''}`, { size: 12, cls: cur ? (stt ? 'hot' : 'bad') : stt === true ? 'ok' : stt === false ? 'dim' : '' })}</g>`;
    });
    items.push({ k: 'sorted', x: X, y: 120, html: h });
  }
  return items;
}

const MST_SPEC = {
  presets: [
    { label: T('Prim，从 A 开始', 'Prim from A'), set: { graph: 'A-B 6, A-C 1, A-D 5, B-C 5, B-E 3, C-D 5, C-E 6, C-F 4, D-F 2, E-F 6', algo: 'prim', start: 'A' } },
    { label: T('Kruskal，同一张图', 'Kruskal, same graph'), set: { graph: 'A-B 6, A-C 1, A-D 5, B-C 5, B-E 3, C-D 5, C-E 6, C-F 4, D-F 2, E-F 6', algo: 'kruskal', start: 'A' } },
    { label: T('Prim，从 E 开始', 'Prim from E'), set: { graph: 'A-B 6, A-C 1, A-D 5, B-C 5, B-E 3, C-D 5, C-E 6, C-F 4, D-F 2, E-F 6', algo: 'prim', start: 'E' } },
  ],
  groups: [
    {
      legend: T('带权无向图', 'Weighted undirected graph'),
      fields: [
        { name: 'graph', label: T('边：A-B 6，逗号隔开', 'Edges: A-B 6, comma-separated'), type: 'text', wide: true, multiline: true, rows: 3 },
        { name: 'algo', label: T('算法', 'Algorithm'), type: 'select', options: [['prim', 'Prim'], ['kruskal', 'Kruskal']] },
        { name: 'start', label: T('Prim 的起点', 'Prim start'), type: 'text' },
      ],
    },
  ],
  note: T('权值相同时，Prim 先选名字小的树外顶点，Kruskal 先选端点名字小的边，这样结果唯一。', 'Ties go to the smaller vertex or edge name, so the result is unique.'),
};

function buildMst(params) {
  const sim = mst(params);
  const lesson = base('mst', [['ds', 'graph']], T('MST', 'MST'), T('最小生成树（Prim / Kruskal）', 'Minimum spanning trees'), T('生成树 · Prim 加点 · Kruskal 加边 · 并查集判环', 'Spanning trees · Prim · Kruskal · union-find'), sim, MST_PRINCIPLE, [['green', T('选中的边 / 树内顶点', 'Chosen')], ['rose', T('成环，丢弃', 'Rejected')]], T('最小生成树有两种求法：Prim 从一个顶点出发，每次把离树最近的顶点拉进来；Kruskal 把边从小到大排好，能加就加、成环就丢。两种算法用同一张图都能演示，总权值一定相同。', 'Prim grows a tree from one vertex by the nearest outside vertex; Kruskal takes edges in order of weight and skips those that close a cycle. Same graph, same total weight.'));
  if (!sim.ok) return lesson;
  const pos = circleLayout(sim.V, {}, sim.edges);
  lesson.start.frame = { rect: [boundsOf(pos)[0], boundsOf(pos)[1], right(pos) + (sim.algo === 'prim' ? 70 + (sim.V.length - 1) * 62 : 250), boundsOf(pos)[3]] };
  const list = sim.steps.map((s, k) =>
    sim.algo === 'prim'
      ? {
          title: T(`选 ${s.pick.inn}-${s.pick.out}（${s.pick.w}）`, `Pick ${s.pick.inn}-${s.pick.out} (${s.pick.w})`),
          desc: T(`${s.pick.out} 加入树`, `${s.pick.out} joins`),
          detail: T(`树里现在有 ${sim.steps[k - 1]?.tree.join('、') ?? sim.start}。看每个树外顶点到树的最短边（右边的表），最小的是 ${s.pick.inn}-${s.pick.out}，权值 ${s.pick.w}，把 ${s.pick.out} 加进来。`, `Among the outside vertices’ cheapest edges, ${s.pick.inn}-${s.pick.out} (${s.pick.w}) is the smallest.`),
          ref: 'prim',
          st: { k },
          row: { color: 'green', what: `${s.pick.inn}-${s.pick.out}`, result: String(s.pick.w), tone: 'ok' },
        }
      : {
          title: s.ok ? T(`加入 ${s.pick.u}-${s.pick.v}（${s.pick.w}）`, `Accept ${s.pick.u}-${s.pick.v} (${s.pick.w})`) : T(`丢弃 ${s.pick.u}-${s.pick.v}：会成环`, `Reject ${s.pick.u}-${s.pick.v}: cycle`),
          desc: T(`连通分量 ${s.comps.map((c) => `{${c.join('')}}`).join(' ')}`, `Components ${s.comps.map((c) => `{${c.join('')}}`).join(' ')}`),
          detail: s.ok ? T(`${s.pick.u} 和 ${s.pick.v} 原来在不同的连通分量里，选这条边，两个分量合并。`, `${s.pick.u} and ${s.pick.v} were in different components; accept and merge.`) : T(`${s.pick.u} 和 ${s.pick.v} 已经在同一个连通分量里了，再加这条边会形成回路，丢弃。`, `${s.pick.u} and ${s.pick.v} are already connected; this edge would close a cycle.`),
          ref: 'kruskal',
          st: { k },
          row: { color: s.ok ? 'green' : 'rose', what: `${s.pick.u}-${s.pick.v} ${s.pick.w}`, result: s.ok ? T('加入', 'accept') : T('成环', 'cycle'), tone: s.ok ? 'ok' : 'warn' },
        },
  );
  list.push({ title: T(`最小生成树：总权值 ${sim.total}`, `MST weight ${sim.total}`), desc: sim.connected ? T(`${sim.V.length - 1} 条边`, `${sim.V.length - 1} edges`) : T('图不连通', 'Disconnected'), detail: sim.connected ? T(`选了 ${sim.V.length - 1} 条边，所有顶点都连通了，权值之和 ${sim.total}。`, `${sim.V.length - 1} edges connect everything; total ${sim.total}.`) : T('图不连通，只能得到最小生成森林。', 'The graph is disconnected: a minimum spanning forest.'), ref: 'def', st: { k: sim.steps.length - 1, done: true }, row: { color: 'green', what: T('总权值', 'Total'), result: String(sim.total), tone: 'ok' } });
  return finish(lesson, list, (k, z) => mstBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), T(`总权值 ${sim.total}`, `Total ${sim.total}`), T('把算法换一下再走一遍：选边的顺序不同，但总权值一样。', 'Switch algorithms: a different order, the same total.'));
}
export const makeMst = () => parametric('mst', MST_SPEC.presets[0].set, buildMst);

// ═════════════════════════ 拓扑排序 ═════════════════════════

const TOPO_PRINCIPLE = {
  sections: [
    {
      id: 'aov',
      title: T('AOV 网', 'AOV networks'),
      blocks: [
        { p: T('用顶点表示活动、有向边 <A, B> 表示「A 必须先于 B」的有向图叫 **AOV 网**（如课程的先修关系）。它必须是**有向无环图（DAG）**，否则活动之间互相等待，谁也做不了。', 'An **AOV network** has activities as vertices and precedence as edges; it must be a **DAG**.') },
        { p: T('**拓扑排序**：把所有顶点排成一个序列，使得每条边 <A, B> 中 A 都排在 B 前面。', 'A **topological order** puts every edge’s tail before its head.') },
      ],
    },
    {
      id: 'kahn',
      title: T('算法', 'The algorithm'),
      blocks: [
        {
          steps: [
            T('从图中选一个**入度为 0** 的顶点输出；', 'output a vertex of **in-degree 0**;'),
            T('删去它和它的所有出边（这些出边指向的顶点入度减 1）；', 'delete it and its out-edges (decrementing their heads);'),
            T('重复，直到输出全部顶点——或者再也找不到入度为 0 的顶点，这时图里**有回路**。', 'repeat until all vertices are out, or none has in-degree 0: then there is a **cycle**.'),
          ],
        },
        { p: T('用栈或队列存放入度为 0 的顶点，邻接表实现时间 O(n + e)。', 'With a stack or queue of zero-in-degree vertices: O(n + e).') },
        { tip: T('某一步有多个入度为 0 的顶点可选时，拓扑序列就**不唯一**。本课约定每次选名字最小的。', 'Several candidates at once make the order **non-unique**; here the smallest name goes first.') },
        { p: T('另一种做法：DFS，每个顶点在它的所有后继都访问完、退出递归时记下，得到的序列反过来就是拓扑序列（逆拓扑序列就是这个记录顺序）。', 'Alternatively record vertices as DFS finishes them; the reversed list is a topological order.') },
      ],
    },
    pit([
      T('拓扑排序可以用来判断有向图有没有回路。', 'It detects cycles in directed graphs.'),
      T('邻接矩阵是三角矩阵（按某种编号）的有向图一定存在拓扑序列。', 'A DAG’s matrix can be made triangular.'),
      T('无向图没有拓扑排序的说法。', 'Undirected graphs have no topological order.'),
    ]),
  ],
};

function topoBoard(sim, st, z) {
  const pos = layerLayout(sim.V, sim.edges);
  const s = st.k >= 0 ? sim.steps[st.k] : null;
  const done = new Set(s?.order ?? []);
  const indeg = s ? s.indeg : sim.init;
  const items = graphItems(sim.V, sim.edges, pos, {
    directed: true,
    weight: false,
    edgeCls: (e) => (s && e.u === s.u ? 'on' : done.has(e.u) ? 'dim' : ''),
    tone: (v) => (done.has(v) ? 'green' : s?.cycle && s.left.includes(v) ? 'rose' : ''),
    cls: (v) => (s && v === s.u ? 'hot' : ''),
    note: (v) => (done.has(v) && v !== s?.u ? null : `${z ? '入度' : 'in'} ${indeg[v]}`),
  });
  const b = boundsOf(pos);
  let h = txt(0, -12, z ? '拓扑序列' : 'Order', 'bt-cap', 'start');
  (s?.order ?? []).forEach((v, i) => (h += `<g transform="translate(${i * 42} 0)">${cell(36, 30, v, { tone: 'green', size: 14 })}</g>`));
  if (s && !s.cycle) h += txt(0, 54, z ? `这一步入度为 0：${s.zero.join('、')}${s.zero.length > 1 ? `（选 ${s.u}）` : ''}` : `In-degree 0 now: ${s.zero.join(', ')}`, 'bt-lab', 'start');
  items.push({ k: 'order', x: b[0] + 30, y: b[3] + 30, html: h });
  return items;
}

const TOPO_SPEC = {
  presets: [
    { label: T('课程先修关系', 'Course prerequisites'), set: { graph: 'A>B, A>C, B>D, C>D, C>E, D>F, E>F' } },
    { label: T('有回路', 'With a cycle'), set: { graph: 'D>A, A>B, B>C, C>A, C>E' } },
  ],
  groups: [{ legend: T('有向图', 'Directed graph'), fields: [{ name: 'graph', label: T('边：A>B，逗号隔开', 'Edges: A>B'), type: 'text', wide: true, multiline: true, rows: 3 }] }],
  note: T('每次在入度为 0 的顶点里选名字最小的输出。', 'Among zero-in-degree vertices the smallest name goes first.'),
};

function buildTopo(params) {
  const sim = topo(params);
  const lesson = base('topo', [['ds', 'graph']], T('拓扑', 'Topo'), T('拓扑排序', 'Topological sort'), T('AOV 网 · 入度 · 判断回路 · 序列是否唯一', 'AOV networks · in-degree · cycles · uniqueness'), sim, TOPO_PRINCIPLE, [['green', T('已输出', 'Output')], ['rose', T('回路上的顶点', 'On a cycle')]], T('拓扑排序反复做一件事：找一个入度为 0 的顶点输出，再把它的出边删掉。每个顶点上方写着当前入度，一步步看它们减到 0；如果中途找不到入度为 0 的顶点，图里就有回路。', 'Repeatedly output a vertex of in-degree 0 and delete its edges. Each vertex shows its current in-degree; if none reaches 0, there is a cycle.'));
  if (!sim.ok) return lesson;
  const pos = layerLayout(sim.V, sim.edges);
  const b = boundsOf(pos);
  lesson.start.frame = { rect: [b[0], b[1], Math.max(b[2], b[0] + sim.V.length * 42 + 60), b[3] + 100] };
  const list = sim.steps.map((s, k) =>
    s.cycle
      ? { title: T('找不到入度为 0 的顶点：有回路', 'No vertex of in-degree 0: a cycle'), desc: T(`剩下 ${s.left.join('、')}`, `Left: ${s.left.join(', ')}`), detail: T(`还剩 ${s.left.join('、')} 没输出，但它们的入度都不为 0——它们互相等待，构成回路。这张图不是 DAG，没有拓扑序列。`, `${s.left.join(', ')} remain, none with in-degree 0: they wait on each other in a cycle.`), ref: 'kahn', st: { k }, row: { color: 'rose', what: T('回路', 'Cycle'), result: s.left.join(''), tone: 'warn' } }
      : { title: T(`输出 ${s.u}`, `Output ${s.u}`), desc: s.dec.length ? T(`${s.dec.join('、')} 入度减 1`, `${s.dec.join(', ')} lose one`) : T('没有出边', 'No out-edges'), detail: T(`入度为 0 的顶点有 ${s.zero.join('、')}${s.zero.length > 1 ? `，按约定选名字最小的 ${s.u}（这里选哪个都行，所以拓扑序列不唯一）` : `，只有 ${s.u}`}。输出它，删掉它的出边${s.dec.length ? `，${s.dec.join('、')} 的入度各减 1` : ''}。`, `In-degree 0: ${s.zero.join(', ')}; output ${s.u} and delete its out-edges.`), ref: 'kahn', st: { k }, row: { color: 'green', what: T(`输出 ${s.u}`, `Output ${s.u}`), result: s.order.join(' '), tone: 'ok' } },
  );
  return finish(lesson, list, (k, z) => topoBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), sim.cycle ? T('有回路', 'Cycle found') : T(`拓扑序列 ${sim.order.join(' ')}`, `Order ${sim.order.join(' ')}`), sim.cycle ? T('去掉回路上的一条边再试试。', 'Remove an edge of the cycle and try again.') : sim.unique ? T('每一步都只有一个入度为 0 的顶点，这个拓扑序列是唯一的。', 'Only one choice at each step: the order is unique.') : T('中途有几步可以选不同的顶点，所以拓扑序列不唯一。', 'Some steps had several choices: the order is not unique.'));
}
export const makeTopo = () => parametric('topo', TOPO_SPEC.presets[0].set, buildTopo);

// ═════════════════════════ 关键路径 ═════════════════════════

const CP_PRINCIPLE = {
  sections: [
    {
      id: 'aoe',
      title: T('AOE 网', 'AOE networks'),
      blocks: [
        { p: T('**AOE 网**：用**边**表示活动、边上的权值表示活动持续的时间，顶点表示**事件**（之前的活动都已完成，之后的活动可以开始）。只有一个入度为 0 的**源点**（开始）和一个出度为 0 的**汇点**（结束）。', 'In an **AOE network** edges are activities with durations and vertices are **events**; one **source** and one **sink**.') },
        { p: T('从源点到汇点的路径中，**长度最长**的叫**关键路径**，它的长度就是完成整个工程的**最短时间**。关键路径上的活动叫**关键活动**。', 'The **longest** source-to-sink path is the **critical path**; its length is the **shortest** time to finish. Its activities are **critical**.') },
      ],
    },
    {
      id: 'four',
      title: T('四个量', 'Four quantities'),
      blocks: [
        {
          table: {
            head: [T('量', 'Quantity'), T('含义', 'Meaning'), T('怎么算', 'How')],
            rows: [
              [T('ve(k) 事件最早发生时间', 've(k) earliest event'), T('从源点到 k 的最长路径长度', 'longest path from the source'), T('按拓扑序：ve(源) = 0，ve(k) = max{ ve(j) + 活动<j,k>时间 }', 'forward: max over predecessors')],
              [T('vl(k) 事件最迟发生时间', 'vl(k) latest event'), T('不推迟整个工程的前提下最晚何时发生', 'latest without delaying the project'), T('按逆拓扑序：vl(汇) = ve(汇)，vl(j) = min{ vl(k) − 活动<j,k>时间 }', 'backward: min over successors')],
              [T('e(i) 活动最早开始', 'e(i) earliest start'), T('活动 <j, k> 最早何时开始', '—'), 'e = ve(j)'],
              [T('l(i) 活动最迟开始', 'l(i) latest start'), T('活动 <j, k> 最迟何时开始', '—'), T('l = vl(k) − 活动时间', 'l = vl(k) − duration')],
            ],
          },
        },
        { formula: T('d(i) = l(i) − e(i)；d = 0 的活动是关键活动', 'd = l − e; activities with d = 0 are critical') },
      ],
    },
    {
      id: 'speed',
      title: T('缩短工期', 'Shortening the project'),
      blocks: [
        { p: T('只有缩短**关键活动**才可能缩短工期；但缩短到一定程度，关键活动可能变成非关键活动。网里可能有**多条关键路径**，这时只缩短其中一条上的活动不能缩短工期，必须缩短所有关键路径共有的活动。', 'Only critical activities can shorten the project, and with **several critical paths** you must shorten activities they all share.') },
      ],
    },
    pit([
      T('关键路径是**最长**路径，不是最短。', 'The critical path is the **longest**.'),
      T('算 vl 要从汇点倒着往前，取 min；算 ve 从源点往后，取 max。', 've uses max going forward; vl uses min going backward.'),
      T('d 是活动（边）的余量，ve、vl 是事件（顶点）的时间，别混。', 'd belongs to activities; ve and vl to events.'),
    ]),
  ],
};

function cpBoard(sim, st, z) {
  const pos = layerLayout(sim.V, sim.edges);
  const crit = new Set(sim.critical.map((a) => a.u + a.v));
  const items = graphItems(sim.V, sim.edges, pos, {
    directed: true,
    edgeCls: (e) => (st.phase >= 4 && crit.has(e.u + e.v) ? 'tree' : ''),
    tone: (v) => (st.phase >= 4 && sim.critical.some((a) => a.u === v || a.v === v) ? 'green' : ''),
    note: (v) => (st.phase >= 1 ? `ve=${sim.ve[v]}` : null),
    under: (v) => (st.phase >= 2 ? `vl=${sim.vl[v]}` : null),
  });
  const b = boundsOf(pos);
  if (st.phase >= 0) items.push({ k: 'ord', x: b[0] + 20, y: b[1] - 8, html: txt(0, 0, (z ? '拓扑序列：' : 'Topological order: ') + sim.order.join(' '), 'bt-lab', 'start') });
  if (st.phase >= 3) {
    const head = [z ? '活动' : 'act', ...sim.acts.map((a) => `${a.u}→${a.v}`)];
    const mk = (lab, f) => [lab, ...sim.acts.map((a) => ({ t: f(a), cls: a.d === 0 && st.phase >= 4 ? 'ok' : '' }))];
    items.push({ k: 'acts', x: b[0] + 20, y: b[3] + 20, html: gridTable(head, [mk(z ? '时间' : 'dur', (a) => a.w), mk('e', (a) => a.e), mk('l', (a) => a.l), mk('d = l − e', (a) => a.d)], { cw: 52, first: 82 }) });
  }
  return items;
}

const CP_SPEC = {
  presets: [
    { label: T('一条关键路径', 'One critical path'), set: { graph: 'A>B 3, A>C 2, B>D 2, B>E 3, C>D 4, C>F 3, D>F 2, E>F 1' } },
    { label: T('两条关键路径', 'Two critical paths'), set: { graph: 'A>B 2, A>C 3, B>D 4, C>D 3, D>E 2' } },
  ],
  groups: [{ legend: T('AOE 网', 'AOE network'), fields: [{ name: 'graph', label: T('活动：A>B 3（从事件 A 到事件 B，持续 3）', 'Activities: A>B 3'), type: 'text', wide: true, multiline: true, rows: 3 }] }],
  note: T('要有唯一的源点和汇点。顶点是事件，边是活动，边上的数是活动的持续时间。', 'One source and one sink; vertices are events, edges activities with durations.'),
};

function buildCp(params) {
  const sim = critical(params);
  const lesson = base('critical-path', [['ds', 'graph']], T('关键', 'CP'), T('关键路径', 'Critical paths'), T('AOE 网 · ve / vl · e / l / d · 关键活动 · 缩短工期', 'AOE · ve / vl · e / l / d · critical activities'), sim, CP_PRINCIPLE, [['green', T('关键活动', 'Critical')]], T('工程至少要多久？要看最长的那条路。这节课先按拓扑序列从前往后算每个事件的最早时间 ve，再从后往前算最迟时间 vl，最后算出每个活动的余量 d = l − e，余量为 0 的就是关键活动，连起来是关键路径。', 'How short can the project be? Compute ve forward, vl backward and each activity’s slack d = l − e; zero-slack activities form the critical path.'));
  if (!sim.ok) return lesson;
  const pos = layerLayout(sim.V, sim.edges);
  const b = boundsOf(pos);
  lesson.start.frame = { rect: [b[0], b[1] - 30, Math.max(b[2], b[0] + 110 + sim.acts.length * 52), b[3] + 180] };
  const veTxt = sim.order.map((v) => {
    const inn = sim.edges.filter((e) => e.v === v);
    return inn.length ? `ve(${v}) = max{${inn.map((e) => `${sim.ve[e.u]}+${e.w}`).join(', ')}} = ${sim.ve[v]}` : `ve(${v}) = 0`;
  });
  const vlTxt = [...sim.order].reverse().map((v) => {
    const out = sim.edges.filter((e) => e.u === v);
    return out.length ? `vl(${v}) = min{${out.map((e) => `${sim.vl[e.v]}−${e.w}`).join(', ')}} = ${sim.vl[v]}` : `vl(${v}) = ${sim.vl[v]}`;
  });
  const path = sim.critical.map((a) => `${a.u}→${a.v}`).join('，');
  const list = [
    { title: T(`拓扑序列：${sim.order.join(' ')}`, `Topological order: ${sim.order.join(' ')}`), desc: T('先排好次序', 'Order the events'), detail: T('ve 要按拓扑序列从前往后算（每个事件的前驱都先算好），vl 按逆拓扑序列从后往前算。', 've goes forward in topological order, vl backward.'), ref: 'four', st: { phase: 0 }, row: { color: 'slate', what: T('拓扑序列', 'Order'), result: sim.order.join(' '), tone: 'info' } },
    { title: T('事件最早发生时间 ve', 'Earliest event times ve'), desc: T(`ve(${sim.sink}) = ${sim.length}`, `ve(${sim.sink}) = ${sim.length}`), detail: T(`源点 ve = 0，其余取「前驱的 ve + 活动时间」的最大值（所有前面的活动都完成，事件才能发生）：${veTxt.join('；')}。`, `ve = max over incoming of ve + duration: ${veTxt.join('; ')}.`), ref: 'four', st: { phase: 1 }, row: { color: 'blue', what: 've', result: sim.V.map((v) => sim.ve[v]).join(' '), tone: 'info' } },
    { title: T('事件最迟发生时间 vl', 'Latest event times vl'), desc: T(`vl(${sim.sink}) = ve(${sim.sink})`, `vl(sink) = ve(sink)`), detail: T(`汇点 vl = ve = ${sim.length}，往前取「后继的 vl − 活动时间」的最小值（不能耽误任何一个后继）：${vlTxt.join('；')}。`, `vl = min over outgoing of vl − duration: ${vlTxt.join('; ')}.`), ref: 'four', st: { phase: 2 }, row: { color: 'violet', what: 'vl', result: sim.V.map((v) => sim.vl[v]).join(' '), tone: 'info' } },
    { title: T('每个活动的 e、l、d', 'e, l and d for each activity'), desc: T('d = l − e', 'd = l − e'), detail: T(`活动 <j, k>：e = ve(j)，l = vl(k) − 时间，余量 d = l − e。下面的表列出了全部 ${sim.acts.length} 个活动。`, `For <j, k>: e = ve(j), l = vl(k) − duration, d = l − e.`), ref: 'four', st: { phase: 3 }, row: { color: 'amber', what: T('活动余量', 'Slack'), result: sim.acts.map((a) => a.d).join(' '), tone: 'info' } },
    { title: T(`关键路径长 ${sim.length}`, `Critical path length ${sim.length}`), desc: T(`关键活动 ${path}`, `Critical ${path}`), detail: T(`d = 0 的活动是 ${path}，它们一点也不能耽误。由它们组成的路径就是关键路径，长度 ${sim.length}，也就是整个工程最短需要的时间。`, `Zero-slack activities ${path} form the critical path of length ${sim.length}.`), ref: 'speed', st: { phase: 4 }, row: { color: 'green', what: T('关键路径', 'Critical path'), result: String(sim.length), tone: 'ok' } },
  ];
  return finish(lesson, list, (k, z) => cpBoard(sim, k < 0 ? { phase: -1 } : list[k].st, z), T(`工期 ${sim.length}`, `Duration ${sim.length}`), T('把某个关键活动的时间改小一点，看关键路径会不会换成另一条。', 'Shorten a critical activity and see whether another path becomes critical.'));
}
export const makeCritical = () => parametric('critical-path', CP_SPEC.presets[0].set, buildCp);

// ═════════════════════════ DFS / BFS ═════════════════════════

const SEARCH_PRINCIPLE = {
  sections: [
    {
      id: 'bfs',
      title: T('广度优先搜索 BFS', 'Breadth-first search'),
      blocks: [
        { p: T('从起点出发，先访问它的**所有**邻接点，再依次从这些邻接点出发访问它们的邻接点……一层一层向外扩展，类似树的层序遍历，要用**队列**。', 'Visit **all** neighbours first, then theirs, layer by layer, using a **queue**, like level-order traversal.') },
        { p: T('BFS 可以求**无权图**的单源最短路径（按边数），得到的生成树叫广度优先生成树。', 'BFS gives shortest paths by edge count in **unweighted** graphs.') },
      ],
    },
    {
      id: 'dfs',
      title: T('深度优先搜索 DFS', 'Depth-first search'),
      blocks: [
        { p: T('从起点出发，访问一个未访问的邻接点，再从它出发继续往深处走；走不下去时**回退**到上一个顶点，看它还有没有未访问的邻接点。类似树的先序遍历，用递归（或**栈**）。', 'Go deep along an unvisited neighbour; **backtrack** when stuck. Like preorder, with recursion or a **stack**.') },
      ],
    },
    {
      id: 'cost',
      title: T('复杂度与唯一性', 'Cost and uniqueness'),
      blocks: [
        {
          table: {
            head: ['', T('邻接矩阵', 'Matrix'), T('邻接表', 'List')],
            rows: [
              [T('时间', 'Time'), 'O(n²)', 'O(n + e)'],
              [T('遍历序列', 'Order'), T('唯一', 'unique'), T('不唯一（取决于表中结点的顺序）', 'depends on list order')],
            ],
          },
        },
        { p: T('一次遍历只能访问到起点所在连通分量的顶点；对非连通图要从未访问的顶点再开始，调用 BFS / DFS 的次数等于连通分量数。', 'One call covers one component; the number of calls equals the number of components.') },
        { tip: T('判断有向图有没有回路：DFS 时遇到一条指向「还在递归栈里」的顶点的边，就有回路；也可以用拓扑排序。', 'A DFS edge back to a vertex still on the stack reveals a cycle.') },
      ],
    },
    pit([
      T('BFS 用队列，DFS 用栈（递归）。', 'BFS queue, DFS stack.'),
      T('邻接表表示时，遍历序列取决于邻接表里结点的顺序（本课按名字排序）。', 'With lists the order depends on list order (sorted by name here).'),
    ]),
  ],
};

function searchBoard(sim, st, z) {
  const pos = circleLayout(sim.V, {}, sim.edges);
  const s = st.k >= 0 ? sim.steps[st.k] : null;
  const seen = new Set(s?.order ?? []);
  const tree = new Set((s?.tree ?? []).map(([a, b]) => (sim.directed ? a + '>' + b : key(a, b))));
  const no = new Map((s?.order ?? []).map((v, i) => [v, i + 1]));
  const items = graphItems(sim.V, sim.edges, pos, {
    directed: sim.directed,
    weight: false,
    edgeCls: (e) => (tree.has(sim.directed ? e.u + '>' + e.v : key(e.u, e.v)) ? 'tree' : ''),
    tone: (v) => (seen.has(v) ? 'green' : ''),
    cls: (v) => (s && v === s.v ? 'hot' : ''),
    note: (v) => no.get(v) ?? null,
  });
  const X = right(pos);
  let h = txt(0, -12, z ? '邻接表（按名字排序）' : 'Adjacency lists', 'bt-cap', 'start');
  sim.V.forEach((v, i) => (h += txt(0, i * 22 + 8, `${v} → ${sim.adj[v].join(' ') || '∧'}`, 'gs-adj', 'start')));
  const AY = 120 + sim.V.length * 22 + 40;
  if (s) {
    const ds = sim.mode === 'bfs' ? s.q : s.stack;
    h += txt(0, AY - 120, sim.mode === 'bfs' ? (z ? '队列' : 'Queue') : z ? '递归栈（栈底 → 栈顶）' : 'Recursion stack', 'bt-cap', 'start');
    ds.forEach((v, i) => (h += `<g transform="translate(${i * 40} ${AY - 108})">${cell(34, 28, v, { tone: sim.mode === 'bfs' ? 'blue' : 'violet', size: 13 })}</g>`));
    h += txt(0, AY - 52, (z ? '访问序列：' : 'Order: ') + s.order.join(' '), 'bt-lab', 'start');
  }
  items.push({ k: 'side', x: X, y: 120, html: h });
  return items;
}

const SEARCH_SPEC = {
  presets: [
    { label: T('DFS', 'DFS'), set: { graph: 'A-B, A-C, B-D, B-E, C-F, E-F', start: 'A', directed: false, mode: 'dfs' } },
    { label: T('BFS，同一张图', 'BFS, same graph'), set: { graph: 'A-B, A-C, B-D, B-E, C-F, E-F', start: 'A', directed: false, mode: 'bfs' } },
    { label: T('非连通图', 'Disconnected'), set: { graph: 'A-B, B-C, D-E, E-F', start: 'A', directed: false, mode: 'dfs' } },
  ],
  groups: [
    {
      legend: T('图', 'Graph'),
      fields: [
        { name: 'graph', label: T('边：A-B（有向写 A>B）', 'Edges: A-B (A>B if directed)'), type: 'text', wide: true, multiline: true, rows: 3 },
        { name: 'start', label: T('起点', 'Start'), type: 'text' },
        { name: 'mode', label: T('遍历方式', 'Traversal'), type: 'select', options: [['dfs', T('深度优先 DFS', 'DFS')], ['bfs', T('广度优先 BFS', 'BFS')]] },
        { name: 'directed', label: T('有向图', 'Directed'), type: 'check' },
      ],
    },
  ],
  note: T('邻接表里的邻接点按名字排序，遍历时按这个顺序访问。访问不到的顶点从剩下名字最小的再开始。', 'Neighbours are taken in name order; unreached vertices restart from the smallest name.'),
};

function buildSearch(params) {
  const sim = search({ ...params, directed: !!params.directed });
  const lesson = base('graph-search', [['ds', 'graph']], T('遍历', 'BFS'), T('图的遍历（DFS / BFS）', 'Graph traversal (DFS / BFS)'), T('邻接表 · 深度优先与栈 · 广度优先与队列 · 生成树 · 连通分量', 'Adjacency lists · DFS and stacks · BFS and queues · spanning trees · components'), sim, SEARCH_PRINCIPLE, [['green', T('已访问 / 生成树的边', 'Visited / tree edges')]], T('同一张图，深度优先一条路走到底再回退，广度优先一圈一圈往外扩。这节课按邻接表的顺序访问，每个顶点上标出访问次序，绿色的边连起来就是遍历生成树；右边是递归栈（或队列）的变化。', 'DFS goes deep then backtracks; BFS spreads in rings. Visiting order is numbered, green edges form the spanning tree, and the stack or queue is shown on the right.'));
  if (!sim.ok) return lesson;
  const pos = circleLayout(sim.V, {}, sim.edges);
  lesson.start.frame = { rect: [boundsOf(pos)[0], boundsOf(pos)[1], right(pos) + 260, Math.max(boundsOf(pos)[3], 120 + sim.V.length * 22 + 60)] };
  const list = sim.steps.map((s, k) => {
    const restart = s.from == null && k > 0;
    return {
      title: s.from ? T(`访问 ${s.v}（从 ${s.from}）`, `Visit ${s.v} (from ${s.from})`) : restart ? T(`从 ${s.v} 重新开始`, `Restart at ${s.v}`) : T(`从 ${s.v} 出发`, `Start at ${s.v}`),
      desc: T(`序列 ${s.order.join(' ')}`, `Order ${s.order.join(' ')}`),
      detail: restart
        ? T(`前面的顶点能到达的都访问完了，${s.v} 还没访问——图不连通。从 ${s.v} 开始新的一次遍历。`, `Everything reachable is done but ${s.v} is not: the graph is disconnected; restart.`)
        : sim.mode === 'bfs'
          ? s.from
            ? T(`队头是 ${s.from}，按邻接表顺序看它的邻接点，${s.v} 还没访问，访问它并入队。`, `Dequeue side: ${s.from}’s next unvisited neighbour ${s.v} is visited and enqueued.`)
            : T(`访问起点 ${s.v} 并入队。`, `Visit ${s.v} and enqueue it.`)
          : s.from
            ? T(`在 ${s.from} 的邻接表里找第一个没访问的邻接点，是 ${s.v}，访问它并继续往深处走。${s.stack.length < (sim.steps[k - 1]?.stack.length ?? 0) + 1 ? '（中间有顶点的邻接点都访问过了，先回退到了 ' + s.from + '）' : ''}`, `${s.v} is ${s.from}’s first unvisited neighbour; go deeper.`)
            : T(`访问起点 ${s.v}。`, `Visit ${s.v}.`),
      ref: sim.mode,
      st: { k },
      row: { color: 'green', what: T(`访问 ${s.v}`, `Visit ${s.v}`), result: s.order.join(' '), tone: 'ok' },
    };
  });
  return finish(lesson, list, (k, z) => searchBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), T(`${sim.mode === 'bfs' ? 'BFS' : 'DFS'} 序列 ${sim.order.join(' ')}`, `Order ${sim.order.join(' ')}`), sim.roots.length > 1 ? T(`调用了 ${sim.roots.length} 次遍历，说明有 ${sim.roots.length} 个连通分量。`, `${sim.roots.length} calls: ${sim.roots.length} components.`) : T('把遍历方式换一下，看同一张图的两种序列和两棵生成树。', 'Switch the traversal to compare the sequences and spanning trees.'));
}
export const makeSearch = () => parametric('graph-search', SEARCH_SPEC.presets[0].set, buildSearch);

// ═════════════════════════ Floyd ═════════════════════════

const FLOYD_PRINCIPLE = {
  sections: [
    {
      id: 'idea',
      title: T('Floyd 算法', 'Floyd’s algorithm'),
      blocks: [
        { p: T('求**每一对顶点之间**的最短路径。用矩阵 A 记录当前的最短距离，初值 A⁽⁻¹⁾ 就是邻接矩阵（没有边为 ∞，对角线为 0）。然后依次让每个顶点 k 作「中转站」：', 'All-pairs shortest paths. Start with the adjacency matrix and let each vertex k in turn act as a stopover:') },
        { formula: T('A⁽ᵏ⁾[i][j] = min{ A⁽ᵏ⁻¹⁾[i][j]，A⁽ᵏ⁻¹⁾[i][k] + A⁽ᵏ⁻¹⁾[k][j] }', 'A[i][j] = min(A[i][j], A[i][k] + A[k][j])') },
        { p: T('A⁽ᵏ⁾[i][j] 的含义：中间只经过编号不超过 k 的顶点时，i 到 j 的最短路径长度。n 轮之后就是最终答案。同时用 path 矩阵记下中转点，可以还原路径。', 'After round k, A[i][j] allows stopovers among the first k vertices; after n rounds it is final. A path matrix records stopovers.') },
      ],
    },
    {
      id: 'cost',
      title: T('复杂度和适用范围', 'Cost and scope'),
      blocks: [
        { p: T('三重循环，时间 O(n³)，空间 O(n²)。允许有负权边，但**不允许有负权回路**（回路越绕越短，没有最短）。', 'O(n³) time, O(n²) space. Negative edges are fine, **negative cycles** are not.') },
        { tip: T('每一轮 k 里，第 k 行和第 k 列不会变（经过 k 去 k 不会更短）。所以手算时先把第 k 行、第 k 列抄下来，只需检查其余格子。', 'Row k and column k never change in round k, which speeds up hand calculation.') },
      ],
    },
    pit([
      T('k 必须放在最外层循环。', 'k must be the outermost loop.'),
      T('对 Dijkstra 用 n 次也能求每对顶点的最短路径，时间也是 O(n³)，但不能有负权边。', 'n runs of Dijkstra also cost O(n³) but forbid negative edges.'),
    ]),
  ],
};

function floydBoard(sim, st, z) {
  const pos = circleLayout(sim.V, { cx: 200, cy: 280, R: 120 }, sim.edges);
  const items = graphItems(sim.V, sim.edges, pos, { directed: true, cls: (v) => (st.k >= 0 && sim.V[st.k] === v ? 'hot' : '') });
  const s = st.k >= 0 ? sim.steps[st.k] : null;
  const A = s ? s.A : sim.init;
  const ch = new Set((s?.changed ?? []).map((c) => `${c.i},${c.j}`));
  const head = [s ? `A(${sim.V[st.k]})` : 'A', ...sim.V];
  const rows = sim.V.map((v, i) => [v, ...sim.V.map((_, j) => ({ t: inf(A[i][j]), cls: ch.has(`${i},${j}`) ? 'hot' : s && (i === st.k || j === st.k) ? 'kline' : '' }))]);
  items.push({ k: 'mat', x: 400, y: 150, html: txt(0, -14, s ? (z ? `以 ${sim.V[st.k]} 为中转之后` : `After stopover ${sim.V[st.k]}`) : z ? '初始：邻接矩阵' : 'Initial matrix', 'bt-cap', 'start') + gridTable(head, rows, { cw: 50, first: 56 }) });
  return items;
}

const FLOYD_SPEC = {
  presets: [
    { label: T('三个顶点', 'Three vertices'), set: { graph: 'A>B 4, A>C 11, B>A 6, B>C 2, C>A 3' } },
    { label: T('四个顶点', 'Four vertices'), set: { graph: 'A>B 1, A>D 4, B>C 9, B>D 2, C>A 3, C>B 5, C>D 8, D>C 6' } },
  ],
  groups: [{ legend: T('带权有向图', 'Weighted directed graph'), fields: [{ name: 'graph', label: T('边：A>B 4（最多 6 个顶点）', 'Edges: A>B 4 (up to 6 vertices)'), type: 'text', wide: true, multiline: true, rows: 3 }] }],
  note: T('依次以 A、B、C…… 为中转点更新矩阵。表格里橙色的格子是这一轮变小的，浅色的是中转点所在的行和列（这一轮不会变）。', 'Each vertex in turn is the stopover. Orange cells shrank this round; the shaded row and column cannot change.'),
};

function buildFloyd(params) {
  const sim = floyd(params);
  const lesson = base('floyd', [['ds', 'graph']], 'Floyd', T('Floyd 最短路径', 'Floyd’s algorithm'), T('每对顶点之间的最短路径 · 中转点 · 矩阵逐轮更新', 'All pairs · stopovers · matrix rounds'), sim, FLOYD_PRINCIPLE, [['orange', T('这一轮变小的', 'Shrank this round')]], T('Floyd 依次把每个顶点当作中转站：如果「i 到 k 再到 j」比原来 i 到 j 更短，就更新。这节课一轮一轮更新距离矩阵，变小的格子高亮，中转点所在的行和列标浅色。', 'Floyd lets each vertex act as a stopover: if i → k → j beats i → j, update. Each round’s changes are highlighted in the matrix.'));
  if (!sim.ok) return lesson;
  lesson.start.frame = { rect: [40, 100, 400 + 56 + sim.V.length * 50 + 30, Math.max(420, 150 + (sim.V.length + 1) * 30 + 40)] };
  const list = sim.steps.map((s, k) => {
    const v = sim.V[k];
    const ch = s.changed.map((c) => `${sim.V[c.i]}→${sim.V[c.j]}：${inf(c.from)} → ${c.to}（${sim.V[c.i]}→${v} ${sim.steps[k - 1]?.A[c.i][k] ?? sim.init[c.i][k]} + ${v}→${sim.V[c.j]} ${sim.steps[k - 1]?.A[k][c.j] ?? sim.init[k][c.j]}）`);
    return {
      title: T(`以 ${v} 为中转：更新 ${s.changed.length} 处`, `Via ${v}: ${s.changed.length} update(s)`),
      desc: T(`矩阵 A(${v})`, `Matrix A(${v})`),
      detail: s.changed.length ? T(`对每一对 i、j，看经过 ${v} 会不会更短：${ch.join('；')}。`, `Pairs improved via ${v}: ${s.changed.map((c) => `${sim.V[c.i]}→${sim.V[c.j]} ${inf(c.from)}→${c.to}`).join(', ')}.`) : T(`经过 ${v} 不能让任何一对顶点更近，矩阵不变。`, `No pair improves via ${v}.`),
      ref: 'idea',
      st: { k },
      row: { color: s.changed.length ? 'orange' : 'slate', what: T(`中转 ${v}`, `Via ${v}`), result: String(s.changed.length), tone: 'info' },
    };
  });
  return finish(lesson, list, (k, z) => floydBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), T('最短距离矩阵', 'Final distances'), T('第 k 轮里第 k 行、第 k 列从来不变，手算时可以利用这一点。', 'Row k and column k never change in round k.'));
}
export const makeFloyd = () => parametric('floyd', FLOYD_SPEC.presets[0].set, buildFloyd);

// ───── 公共 ─────
const KITS = new Map();
function base(id, where, tag, name, full, sim, principle, legend, desc) {
  const spec = { mst: MST_SPEC, topo: TOPO_SPEC, 'critical-path': CP_SPEC, 'graph-search': SEARCH_SPEC, floyd: FLOYD_SPEC }[id];
  if (!KITS.has(id)) KITS.set(id, stepKit({ spec, rowsName: T('过程', 'Steps') }));
  return {
    id,
    kit: KITS.get(id),
    where,
    tag,
    name,
    full,
    title: sim.ok ? T(`${sim.V.length} 个顶点`, `${sim.V.length} vertices`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend,
    principle,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: { desc, facts: [] },
    start: { nodes: [], frame: { rect: [0, 60, 900, 520] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
}
function finish(lesson, list, board, title, text) {
  const built = toSteps(list, board);
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title, text, facts: [] };
  return lesson;
}
