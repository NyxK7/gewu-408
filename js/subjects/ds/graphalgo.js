// 图的几个算法的纯计算：最小生成树（Prim / Kruskal）、拓扑排序、关键路径、DFS / BFS、Floyd。
// 选择有并列时一律按顶点名（或边的两个端点名）从小到大，保证结果唯一、可以对答案。
import { nameCmp, parseEdges } from './graph.js';

const err = (e) => ({ ok: false, errors: [e] });
function load(text, { weighted = true, min = 2, max = 10 } = {}) {
  const g = parseEdges(text, { weighted });
  if (!g.ok) return { error: ['edge', { e: g.bad }] };
  if (g.V.length < min || g.V.length > max) return { error: ['count'] };
  if (g.edges.length > 30) return { error: ['edges'] };
  return g;
}

// ───── 最小生成树 ─────
export function mst({ graph, algo = 'prim', start }) {
  const g = load(graph);
  if (g.error) return err(g.error);
  const { V, edges } = g;
  if (edges.some((e) => e.w < 0)) return err('negative');
  const key = (e) => [e.u, e.v].sort(nameCmp).join('-');
  const steps = [];
  const chosen = [];
  if (algo === 'prim') {
    const s = start && V.includes(start) ? start : V[0];
    const inT = new Set([s]);
    while (inT.size < V.length) {
      // 树内到树外的所有边里取最小
      const cand = edges.filter((e) => inT.has(e.u) !== inT.has(e.v)).map((e) => ({ ...e, out: inT.has(e.u) ? e.v : e.u, inn: inT.has(e.u) ? e.u : e.v }));
      if (!cand.length) break;
      cand.sort((a, b) => a.w - b.w || nameCmp(a.out, b.out) || nameCmp(a.inn, b.inn));
      // 每个树外顶点到树的最短边（lowcost 表）
      const low = Object.fromEntries(V.filter((v) => !inT.has(v)).map((v) => {
        const c = cand.filter((x) => x.out === v);
        return [v, c.length ? { w: c[0].w, from: c[0].inn } : null];
      }));
      const pick = cand[0];
      inT.add(pick.out);
      chosen.push(key(pick));
      steps.push({ pick, low, tree: [...inT], chosen: [...chosen] });
    }
    return { ok: true, algo, V, edges, start: s, steps, total: steps.reduce((a, x) => a + x.pick.w, 0), connected: inT.size === V.length };
  }
  // Kruskal
  const parent = Object.fromEntries(V.map((v) => [v, v]));
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const sorted = [...edges].sort((a, b) => a.w - b.w || nameCmp(key(a), key(b)));
  let total = 0;
  for (const e of sorted) {
    if (chosen.length === V.length - 1) break;
    const a = find(e.u);
    const b = find(e.v);
    const ok = a !== b;
    if (ok) {
      parent[a] = b;
      chosen.push(key(e));
      total += e.w;
    }
    const comps = {};
    for (const v of V) (comps[find(v)] ??= []).push(v);
    steps.push({ pick: e, ok, chosen: [...chosen], comps: Object.values(comps) });
  }
  return { ok: true, algo, V, edges, sorted, steps, total, connected: chosen.length === V.length - 1 };
}

// ───── 拓扑排序（Kahn，入度为 0 的里选名字最小的） ─────
export function topo({ graph }) {
  const g = load(graph, { weighted: false });
  if (g.error) return err(g.error);
  const { V, edges } = g;
  const indeg = Object.fromEntries(V.map((v) => [v, 0]));
  for (const e of edges) indeg[e.v]++;
  const done = new Set();
  const order = [];
  const steps = [];
  const init = { ...indeg };
  while (order.length < V.length) {
    const zero = V.filter((v) => !done.has(v) && indeg[v] === 0);
    if (!zero.length) {
      steps.push({ cycle: true, indeg: { ...indeg }, left: V.filter((v) => !done.has(v)) });
      break;
    }
    const u = zero[0];
    done.add(u);
    order.push(u);
    const dec = [];
    for (const e of edges.filter((x) => x.u === u)) {
      indeg[e.v]--;
      dec.push(e.v);
    }
    steps.push({ u, zero, dec, indeg: { ...indeg }, order: [...order], unique: zero.length === 1 });
  }
  return { ok: true, V, edges, init, steps, order, cycle: order.length < V.length, unique: steps.every((s) => s.cycle || s.unique) };
}

// ───── 关键路径（AOE 网：边是活动，权是持续时间） ─────
export function critical({ graph }) {
  const g = load(graph);
  if (g.error) return err(g.error);
  const { V, edges } = g;
  if (edges.some((e) => e.w < 0)) return err('negative');
  const t = topo({ graph: edges.map((e) => `${e.u}>${e.v}`).join(',') });
  if (t.cycle) return err('cycle');
  const order = t.order;
  const sources = V.filter((v) => !edges.some((e) => e.v === v));
  const sinks = V.filter((v) => !edges.some((e) => e.u === v));
  if (sources.length !== 1 || sinks.length !== 1) return err('ends');
  const ve = Object.fromEntries(V.map((v) => [v, 0]));
  for (const u of order) for (const e of edges.filter((x) => x.v === u)) ve[u] = Math.max(ve[u], ve[e.u] + e.w);
  const end = ve[sinks[0]];
  const vl = Object.fromEntries(V.map((v) => [v, end]));
  for (const u of [...order].reverse()) for (const e of edges.filter((x) => x.u === u)) vl[u] = Math.min(vl[u], vl[e.v] - e.w);
  const acts = edges.map((e) => ({ ...e, e: ve[e.u], l: vl[e.v] - e.w, d: vl[e.v] - e.w - ve[e.u] }));
  return { ok: true, V, edges, order, source: sources[0], sink: sinks[0], ve, vl, acts, length: end, critical: acts.filter((a) => a.d === 0) };
}

// ───── DFS / BFS（邻接表按顶点名排序） ─────
export function search({ graph, start, directed = false, mode = 'dfs' }) {
  const g = load(graph, { weighted: false });
  if (g.error) return err(g.error);
  const { V, edges } = g;
  if (!V.includes(start)) return err(['start', { s: start }]);
  const adj = Object.fromEntries(V.map((v) => [v, []]));
  for (const e of edges) {
    adj[e.u].push(e.v);
    if (!directed) adj[e.v].push(e.u);
  }
  for (const v of V) adj[v] = [...new Set(adj[v])].sort(nameCmp);
  const seen = new Set();
  const order = [];
  const tree = [];
  const steps = [];
  const roots = [];
  const run = (s) => {
    roots.push(s);
    if (mode === 'bfs') {
      const q = [s];
      seen.add(s);
      order.push(s);
      steps.push({ v: s, from: null, q: [...q], order: [...order] });
      while (q.length) {
        const u = q.shift();
        for (const w of adj[u]) {
          if (seen.has(w)) continue;
          seen.add(w);
          order.push(w);
          tree.push([u, w]);
          q.push(w);
          steps.push({ v: w, from: u, q: [...q], order: [...order], tree: [...tree] });
        }
      }
    } else {
      const stack = [];
      const go = (u, from) => {
        seen.add(u);
        order.push(u);
        stack.push(u);
        if (from) tree.push([from, u]);
        steps.push({ v: u, from, stack: [...stack], order: [...order], tree: [...tree] });
        for (const w of adj[u]) if (!seen.has(w)) go(w, u);
        stack.pop();
      };
      go(s, null);
    }
  };
  run(start);
  for (const v of V) if (!seen.has(v)) run(v);
  return { ok: true, V, edges, adj, directed, mode, start, order, tree, steps, roots };
}

// ───── Floyd ─────
export function floyd({ graph }) {
  const g = load(graph, { max: 6 });
  if (g.error) return err(g.error);
  const { V, edges } = g;
  const n = V.length;
  const I = Object.fromEntries(V.map((v, i) => [v, i]));
  const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  const path = Array.from({ length: n }, () => Array(n).fill(-1));
  for (const e of edges) A[I[e.u]][I[e.v]] = Math.min(A[I[e.u]][I[e.v]], e.w);
  const init = A.map((r) => [...r]);
  const steps = [];
  for (let k = 0; k < n; k++) {
    const changed = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        if (A[i][k] + A[k][j] < A[i][j]) {
          changed.push({ i, j, from: A[i][j], to: A[i][k] + A[k][j] });
          A[i][j] = A[i][k] + A[k][j];
          path[i][j] = k;
        }
    steps.push({ k, changed, A: A.map((r) => [...r]), path: path.map((r) => [...r]) });
  }
  const neg = A.some((r, i) => r[i] < 0);
  return { ok: true, V, edges, init, steps, A, path, neg };
}
