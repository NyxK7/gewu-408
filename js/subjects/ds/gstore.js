// 图的四种存储结构的纯计算：一条条加边，记下邻接矩阵、邻接表、十字链表、邻接多重表各自的样子。
//
// 约定（界面上写明）：
//   · 顶点按第一次出现的顺序编号 0、1、2…；边写成「A B」（有向图表示 A→B）；
//   · 邻接表用头插法：新边结点插在链表最前面，所以链表顺序和输入顺序相反；
//   · 十字链表（有向图）、邻接多重表（无向图）里每条边只有一个结点；为了画得清楚，
//     同一个顶点的链按顶点编号顺序画（真实的链顺序取决于插入方式，链上有哪些结点不变）。

const err = (e) => ({ ok: false, errors: [e] });

export function parseEdges(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[,，;；\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = it.match(/^(\w)\s*[\s\-–>→]+\s*(\w)$/);
    if (!m) return null;
    out.push([m[1].toUpperCase(), m[2].toUpperCase()]);
  }
  return out;
}

export function graphStore({ directed = false, edges }) {
  const E0 = parseEdges(edges);
  if (!E0 || !E0.length) return err('edges');
  const V = [];
  for (const [a, b] of E0) for (const x of [a, b]) if (!V.includes(x)) V.push(x);
  if (V.length > 6) return err('many');
  if (E0.length > 10) return err('many');
  const E = [];
  for (const [a, b] of E0) {
    if (a === b) return err('loop');
    const u = V.indexOf(a);
    const v = V.indexOf(b);
    const dup = E.some(([x, y]) => (x === u && y === v) || (!directed && x === v && y === u));
    if (dup) return err('dup');
    E.push([u, v]);
  }
  const n = V.length;
  const states = [];
  const M = Array.from({ length: n }, () => Array(n).fill(0));
  const adj = Array.from({ length: n }, () => []); // 每个顶点的边结点（头插）：{ to, e }
  E.forEach(([u, v], k) => {
    M[u][v] = 1;
    if (!directed) M[v][u] = 1;
    adj[u].unshift({ to: v, e: k });
    if (!directed) adj[v].unshift({ to: u, e: k });
    states.push({ k, M: M.map((r) => [...r]), adj: adj.map((l) => l.map((x) => ({ ...x }))) });
  });
  const outDeg = M.map((r) => r.reduce((a, b) => a + b, 0));
  const inDeg = V.map((_, j) => M.reduce((a, r) => a + r[j], 0));
  return { ok: true, directed, V, E, n, states, outDeg, inDeg };
}
