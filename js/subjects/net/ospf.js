// 链路状态路由（OSPF 的思路）的纯计算：每台路由器先用 Hello 认识邻居，再把「我和哪些邻居相连、代价多少」
// 作为链路状态通告（LSA）洪泛给全网，于是每台路由器都有一份相同的链路状态数据库；然后各自以自己为根跑 Dijkstra，
// 由最短路径树得到转发表（目的、下一跳、代价）。可选让一条链路断开，重新洪泛、重新计算。
// 最短路径的计算直接用数据结构那节 Dijkstra 课的代码（距离相同时按名字顺序选）。
import { parseGraph, simulate as dijkstra } from '../ds/dijkstra.js';

const err = (errors) => ({ ok: false, errors });
const key = (a, b) => [a, b].sort().join('-');

function tableOf(d) {
  return d.V.filter((v) => v !== d.src).map((v) => {
    const p = d.paths[v];
    return { dest: v, next: p ? p[1] : null, cost: p ? d.dist[v] : Infinity, path: p };
  });
}

export const DEF_GRAPH = 'R1-R2 2, R1-R3 1, R2-R3 3, R2-R4 2, R3-R5 4, R4-R5 1, R4-R6 3, R5-R6 2';
export function ospf({ graph = DEF_GRAPH, src = 'R1', fail = '' }) {
  const g = parseGraph(graph, false);
  if (!g.ok) return err(['graph']);
  if (g.vertices.length < 3 || g.vertices.length > 8) return err(['count']);
  if (g.edges.some((e) => e.w < 1)) return err(['weight']);
  if (!g.vertices.includes(src)) return err(['src']);
  const d = dijkstra({ graph, src, directed: false });
  if (!d.ok) return err(['graph']);
  const lsdb = Object.fromEntries(g.vertices.map((v) => [v, g.adj[v].map((a) => ({ to: a.to, w: a.w }))]));
  const table = tableOf(d);
  let after = null;
  const f = String(fail ?? '').trim();
  if (f) {
    const m = f.match(/^([A-Za-z0-9]{1,3})\s*-\s*([A-Za-z0-9]{1,3})$/);
    if (!m) return err(['fail']);
    const k = key(m[1], m[2]);
    const rest = g.edges.filter((e) => key(e.u, e.v) !== k);
    if (rest.length === g.edges.length) return err(['fail']);
    const g2 = rest.map((e) => `${e.u}-${e.v} ${e.w}`).join(', ');
    const d2 = dijkstra({ graph: g2, src, directed: false });
    // 断开以后可能有路由器从图里消失（没有别的边了），转发表里记成不可达
    const t2 = g.vertices.filter((v) => v !== src).map((v) => {
      if (!d2.ok || !d2.V.includes(v)) return { dest: v, next: null, cost: Infinity, path: null };
      const p = d2.paths[v];
      return { dest: v, next: p ? p[1] : null, cost: p ? d2.dist[v] : Infinity, path: p };
    });
    after = { link: [m[1], m[2]], key: k, d: d2.ok ? d2 : null, table: t2, changed: t2.filter((r, i) => r.next !== table[i].next || r.cost !== table[i].cost).map((r) => r.dest) };
  }
  return { ok: true, src, V: g.vertices, edges: g.edges, adj: g.adj, lsdb, d, table, after, lsaCount: g.vertices.length };
}
export { key };
