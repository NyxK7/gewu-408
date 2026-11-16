// Dijkstra 单源最短路径的纯计算。边写成 "A-B 4"（无向）或 "A>B 4"（有向），用逗号、分号或换行隔开。
// 约定：权值必须非负（Dijkstra 不能处理负权）；每轮从未确定的顶点里选当前距离最小的，
// 距离相同时按顶点名的顺序选；初始时先把源点放进集合 S，到其余顶点的距离取直接相连的边（没有边记 ∞）。

const nameCmp = (a, b) => a.localeCompare(b, 'en', { numeric: true });

export function parseGraph(text, directed) {
  const items = String(text).split(/[,，;；\n]+/).map((s) => s.trim()).filter(Boolean);
  const edges = [];
  const names = new Set();
  for (const it of items) {
    const m = it.match(/^([A-Za-z0-9]{1,3})\s*(?:->|-|>|→|\s)\s*([A-Za-z0-9]{1,3})\s+(-?\d+)$/);
    if (!m) return { ok: false, bad: it };
    const [, u, v, w] = m;
    if (u === v) return { ok: false, bad: it };
    edges.push({ u, v, w: Number(w) });
    names.add(u).add(v);
  }
  const adj = {};
  for (const n of names) adj[n] = [];
  for (const e of edges) {
    adj[e.u].push({ to: e.v, w: e.w });
    if (!directed) adj[e.v].push({ to: e.u, w: e.w });
  }
  return { ok: true, vertices: [...names].sort(nameCmp), edges, adj };
}

export function simulate({ graph, src, directed = true }) {
  const g = parseGraph(graph, directed);
  if (!g.ok) return { ok: false, errors: [['edge', { e: g.bad }]] };
  const V = g.vertices;
  if (V.length < 2 || V.length > 10) return { ok: false, errors: [['count']] };
  if (g.edges.length > 30) return { ok: false, errors: [['edges']] };
  if (g.edges.some((e) => e.w < 0)) return { ok: false, errors: [['negative']] };
  if (!V.includes(src)) return { ok: false, errors: [['src', { s: src }]] };

  const dist = Object.fromEntries(V.map((v) => [v, Infinity]));
  const prev = Object.fromEntries(V.map((v) => [v, null]));
  const inS = new Set([src]);
  dist[src] = 0;
  const init = [];
  for (const { to, w } of g.adj[src]) {
    if (w < dist[to]) {
      dist[to] = w;
      prev[to] = src;
    }
  }
  for (const v of V) if (v !== src && dist[v] < Infinity) init.push({ v, d: dist[v] });
  const snap = () => ({ dist: { ...dist }, prev: { ...prev }, S: [...inS] });
  const rounds = [];
  const start = snap();
  for (let k = 1; k < V.length; k++) {
    const before = snap();
    const cand = V.filter((v) => !inS.has(v));
    let u = null;
    for (const v of cand) if (dist[v] < Infinity && (u === null || dist[v] < dist[u])) u = v;
    if (u === null) {
      rounds.push({ k, pick: null, before, updates: [], after: snap(), unreachable: cand });
      break;
    }
    inS.add(u);
    const updates = [];
    for (const { to, w } of g.adj[u]) {
      if (inS.has(to)) continue;
      const nd = dist[u] + w;
      const old = dist[to];
      updates.push({ v: to, old, via: nd, w, better: nd < old });
      if (nd < old) {
        dist[to] = nd;
        prev[to] = u;
      }
    }
    rounds.push({ k, pick: u, d: dist[u], before, updates, after: snap() });
  }
  const pathTo = (v) => {
    if (dist[v] === Infinity) return null;
    const p = [];
    for (let x = v; x !== null; x = prev[x]) p.unshift(x);
    return p;
  };
  return { ok: true, directed, src, V, edges: g.edges, adj: g.adj, start, init, rounds, dist: { ...dist }, prev: { ...prev }, paths: Object.fromEntries(V.map((v) => [v, pathTo(v)])) };
}

/** 某个快照里从源点到 v 的路径 */
export function pathIn(snapPrev, v) {
  const p = [];
  for (let x = v, guard = 0; x !== null && guard < 20; x = snapPrev[x], guard++) p.unshift(x);
  return p;
}
