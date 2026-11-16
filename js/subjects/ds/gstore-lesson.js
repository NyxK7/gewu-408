// 「图的存储结构」：同一张图，切换邻接矩阵、邻接表、十字链表、邻接多重表，一条条加边，看边落在哪里。
// 画法：左边是图，右边是存储结构。十字链表和邻接多重表把边结点按「行 = 一个顶点、列 = 另一个顶点」
// 摆成稀疏矩阵的样子，于是同一个顶点的链就是一行、一列上的箭头。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { graphStore } from './gstore.js';

const W = [['ds', 'graph']];
const GX = 150; // 图的中心
const GY = 270;
const GR = 100;
const SX = 330; // 存储结构的左边
const TONES = ['blue', 'violet', 'teal', 'amber', 'rose', 'green'];

const NAME = {
  matrix: T('邻接矩阵', 'Adjacency matrix'),
  adj: T('邻接表', 'Adjacency list'),
  cross: T('十字链表', 'Orthogonal list'),
  multi: T('邻接多重表', 'Adjacency multilist'),
};

const PRINCIPLE = {
  sections: [
    {
      id: 'matrix',
      title: T('邻接矩阵', 'Adjacency matrix'),
      blocks: [
        { p: T('用一个 n × n 的二维数组 A：有边 (i, j) 就 A[i][j] = 1（带权图存权值，没边存 ∞），否则为 0。无向图的邻接矩阵是对称的，可以只存上三角或下三角。', 'An n × n array with A[i][j] = 1 for an edge (weights for weighted graphs); symmetric for undirected graphs.') },
        { list: [
          T('无向图：第 i 行（或第 i 列）非零元素个数 = 顶点 i 的度；', 'Undirected: nonzeros in row i = degree of i;'),
          T('有向图：第 i 行非零元素个数 = 出度，第 i 列 = 入度；', 'Directed: row i = out-degree, column i = in-degree;'),
          T('Aⁿ 的元素 [i][j] 等于从 i 到 j 长度为 n 的路径条数。', 'Entry [i][j] of Aⁿ counts paths of length n.'),
        ] },
      ],
    },
    {
      id: 'adj',
      title: T('邻接表', 'Adjacency list'),
      blocks: [
        { p: T('每个顶点一个**顶点表结点**（数据 + 指向第一条边的指针），每条边一个**边表结点**（邻接点的下标 adjvex + 指向下一条边的指针）。顶点 i 的所有邻接点串成一条单链表。', 'Each vertex has a list of edge nodes (adjvex + next).') },
        { list: [
          T('无向图每条边存两次，边表结点共 2e 个；有向图共 e 个；', 'Undirected: 2e edge nodes; directed: e;'),
          T('有向图的邻接表求出度容易（链表长度），求入度要扫描全部边表；为此有「逆邻接表」；', 'Out-degree is easy; in-degree needs a full scan (hence the inverse list);'),
          T('邻接表不唯一：链表里边结点的顺序取决于建表顺序和插入方法。', 'Not unique: order depends on construction.'),
        ] },
      ],
    },
    {
      id: 'cross',
      title: T('十字链表（有向图）', 'Orthogonal list (directed)'),
      blocks: [
        { p: T('把邻接表和逆邻接表合在一起。每条弧一个结点：**tailvex**（弧尾）、**headvex**（弧头）、**hlink**（指向弧头相同的下一条弧）、**tlink**（指向弧尾相同的下一条弧）。顶点结点有 firstin（第一条入弧）和 firstout（第一条出弧）。', 'Merges the adjacency and inverse lists: arc nodes have tailvex, headvex, hlink (same head) and tlink (same tail); vertices have firstin and firstout.') },
        { tip: T('沿着 firstout 和 tlink 走就是全部出弧，沿着 firstin 和 hlink 走就是全部入弧。求出度、入度都方便，每条弧只存一次。', 'Follow tlink for out-arcs and hlink for in-arcs; each arc is stored once.') },
      ],
    },
    {
      id: 'multi',
      title: T('邻接多重表（无向图）', 'Adjacency multilist (undirected)'),
      blocks: [
        { p: T('邻接表里无向图的每条边存了两次，删边时两处都要改。邻接多重表每条边只有一个结点：**ivex、jvex**（两个顶点）、**ilink**（指向依附于 ivex 的下一条边）、**jlink**（指向依附于 jvex 的下一条边），可以再加一个访问标记 mark。', 'Each edge appears once with ivex, jvex, ilink (next edge at ivex) and jlink (next edge at jvex), plus a mark.') },
        { tip: T('一条边同时在两个顶点的链上，所以一个结点被两条链共用。', 'Each edge node sits on two chains at once.') },
      ],
    },
    {
      id: 'cost',
      title: T('怎么选：空间和各种操作', 'Choosing: space and operations'),
      blocks: [
        {
          table: {
            head: [T('操作', 'Operation'), T('邻接矩阵', 'Matrix'), T('邻接表', 'List')],
            rows: [
              [T('空间', 'Space'), 'O(n²)', T('O(n + e)（无向图边结点 2e 个）', 'O(n + e)')],
              [T('判断 (i, j) 有没有边', 'Is (i, j) an edge?'), 'O(1)', T('O(顶点 i 的度)', 'O(deg i)')],
              [T('找 i 的所有邻接点', 'Neighbours of i'), 'O(n)', T('O(顶点 i 的度)', 'O(deg i)')],
              [T('BFS / DFS 遍历', 'BFS / DFS'), 'O(n²)', 'O(n + e)'],
              [T('加一条边', 'Add an edge'), 'O(1)', T('O(1)（头插）', 'O(1) with head insertion')],
              [T('删一条边', 'Remove an edge'), 'O(1)', T('O(度)，无向图两处都要删', 'O(deg); twice if undirected')],
              [T('求有向图的入度', 'In-degree (directed)'), T('O(n)：数一列', 'O(n): a column'), T('O(n + e)：扫描全部边表', 'O(n + e): scan everything')],
            ],
          },
        },
        { p: T('**稠密图**（边多，接近 n²）用邻接矩阵；**稀疏图**（边少）用邻接表更省空间。有向图常要同时求出度和入度时用十字链表；无向图常要删边或标记边时用邻接多重表。', 'Dense graphs suit a matrix, sparse graphs a list. Use the orthogonal list for in/out degrees, the multilist for edge-centred work on undirected graphs.') },
      ],
    },
    pit([
      T('邻接矩阵是唯一的，邻接表不唯一。', 'The matrix is unique; the list is not.'),
      T('无向图邻接表的边结点个数是 2e，不是 e。', 'An undirected adjacency list has 2e edge nodes.'),
      T('十字链表只用于有向图，邻接多重表只用于无向图。', 'Orthogonal lists are for directed graphs, multilists for undirected ones.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('无向图 · 邻接表', 'Undirected · list'), set: { directed: false, edges: 'A B, A C, B C, B D, C E, D E', store: 'adj' } },
    { label: T('无向图 · 邻接多重表', 'Undirected · multilist'), set: { directed: false, edges: 'A B, A C, B C, B D, C E, D E', store: 'multi' } },
    { label: T('有向图 · 十字链表', 'Directed · orthogonal list'), set: { directed: true, edges: 'A B, A C, C A, C D, D A, D B', store: 'cross' } },
    { label: T('有向图 · 邻接矩阵', 'Directed · matrix'), set: { directed: true, edges: 'A B, A C, C A, C D, D A, D B', store: 'matrix' } },
  ],
  groups: [{ legend: T('图和存储方式', 'Graph and storage'), fields: [
    { name: 'store', label: T('存储结构', 'Storage'), type: 'select', options: Object.entries(NAME).map(([k, v]) => [k, v]), wide: true },
    { name: 'directed', label: T('有向图', 'Directed'), type: 'check' },
    { name: 'edges', label: T('边：A B 表示一条边（有向图是 A→B），用逗号隔开', 'Edges: “A B” (A→B if directed), comma-separated'), type: 'text', wide: true },
  ] }],
  note: T('顶点按第一次出现的顺序编号 0、1、2……；邻接表用头插法建表。十字链表只能用于有向图，邻接多重表只能用于无向图。最多 6 个顶点、10 条边。', 'Vertices are numbered by first appearance; lists use head insertion. Orthogonal lists need a directed graph, multilists an undirected one. Up to 6 vertices and 10 edges.'),
};
const ERR = { edges: T('边写成「A B」，用逗号隔开', 'Write edges as “A B”, comma-separated'), many: T('最多 6 个顶点、10 条边', 'At most 6 vertices and 10 edges'), loop: T('不能有自环', 'No self-loops'), dup: T('有重复的边', 'Duplicate edge'), crossDir: T('十字链表只用于有向图，请勾选「有向图」', 'Orthogonal lists need a directed graph'), multiDir: T('邻接多重表只用于无向图，请取消「有向图」', 'Multilists need an undirected graph') };

const vpos = (sim, i) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / sim.n;
  return [GX + GR * Math.cos(a), GY + GR * Math.sin(a)];
};

function graphItems(sim, k, z) {
  let h = txt(GX, GY - GR - 46, z ? (sim.directed ? '有向图' : '无向图') : sim.directed ? 'directed' : 'undirected', 'bt-cap');
  sim.E.forEach(([u, v], e) => {
    if (e > k) return;
    const [x1, y1] = vpos(sim, u);
    const [x2, y2] = vpos(sim, v);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const cls = e === k ? 'acc' : '';
    // 有向图里一对互相指向的弧，各往一边错开一点，免得画在同一条线上
    const both = sim.directed && sim.E.some(([a, b]) => a === v && b === u);
    const ox = both ? -uy * 7 : 0;
    const oy = both ? ux * 7 : 0;
    h += sim.directed ? arrow(x1 + ux * 20 + ox, y1 + uy * 20 + oy, x2 - ux * 21 + ox, y2 - uy * 21 + oy, cls) : `<line class="te ${e === k ? 'gs-new' : ''}" x1="${x1 + ux * 20}" y1="${y1 + uy * 20}" x2="${x2 - ux * 20}" y2="${y2 - uy * 20}"/>`;
  });
  sim.V.forEach((name, i) => {
    const [x, y] = vpos(sim, i);
    const cur = k >= 0 && k < sim.E.length && sim.E[k].includes(i);
    h += `<g transform="translate(${x} ${y})"><g class="tn c-${TONES[i]} has-tone ${cur ? 'hot' : ''}"><circle r="19"/>${txt(0, 5, name, 'tn-t')}</g>${txt(0, 36, String(i), 'bt-idx')}</g>`;
  });
  return { k: 'graph', x: 0, y: 0, html: h };
}

function matrixItems(sim, st, k) {
  const C = 42;
  const x0 = SX + 40;
  const y0 = 150;
  const M = st.M;
  const [eu, ev] = k >= 0 && k < sim.E.length ? sim.E[k] : [-1, -1];
  let h = '';
  sim.V.forEach((name, i) => {
    h += txt(x0 + i * C + (C - 4) / 2, y0 - 10, name, 'bt-lab');
    h += txt(x0 - 12, y0 + i * C + 26, name, 'bt-lab', 'end');
  });
  for (let i = 0; i < sim.n; i++)
    for (let j = 0; j < sim.n; j++) {
      const isNew = (i === eu && j === ev) || (!sim.directed && i === ev && j === eu);
      h += `<g transform="translate(${x0 + j * C} ${y0 + i * C})">${cell(C - 4, C - 4, String(M[i][j]), { tone: M[i][j] ? TONES[i] : '', size: 14, cls: isNew ? 'hot' : M[i][j] ? '' : 'dim' })}</g>`;
    }
  if (st.final) {
    sim.V.forEach((_, i) => (h += txt(x0 + sim.n * C + 12, y0 + i * C + 26, sim.directed ? `${sim.outDeg[i]}` : `${sim.outDeg[i]}`, 'gs-deg', 'start')));
    h += txt(x0 + sim.n * C + 12, y0 - 10, sim.directed ? 'out' : 'deg', 'bt-idx', 'start');
    if (sim.directed) {
      sim.V.forEach((_, j) => (h += txt(x0 + j * C + (C - 4) / 2, y0 + sim.n * C + 18, String(sim.inDeg[j]), 'gs-deg in')));
      h += txt(x0 - 12, y0 + sim.n * C + 18, 'in', 'bt-idx', 'end');
    }
  }
  return { k: 'store', x: 0, y: 0, html: h };
}

function adjItems(sim, st, k) {
  const y0 = 140;
  const RH = 50;
  const x0 = SX + 30;
  let h = '';
  st.adj.forEach((lst, i) => {
    const y = y0 + i * RH;
    h += txt(x0 - 10, y + 22, String(i), 'bt-idx', 'end');
    h += `<g transform="translate(${x0} ${y})">${cell(34, 34, sim.V[i], { tone: TONES[i], size: 14 })}<g transform="translate(34 0)">${cell(18, 34, '', { cls: 'dim' })}</g></g>`;
    let px = x0 + 52;
    lst.forEach((nd, q) => {
      const nx = x0 + 80 + q * 74;
      h += arrow(px - 9, y + 17, nx - 2, y + 17, nd.e === k ? 'acc' : '');
      h += `<g transform="translate(${nx} ${y})">${cell(30, 34, String(nd.to), { tone: TONES[nd.to], size: 14, cls: nd.e === k ? 'hot' : '' })}<g transform="translate(30 0)">${cell(16, 34, '', { cls: 'dim' })}</g></g>`;
      px = nx + 46;
    });
    h += txt(px + 4, y + 23, '∧', 'll-nil', 'start');
    if (st.final) h += txt(px + 30, y + 23, `${lst.length}`, 'gs-deg', 'start');
  });
  return { k: 'store', x: 0, y: 0, html: h };
}

/** 十字链表 / 邻接多重表：边结点按 (行, 列) 摆成稀疏矩阵 */
function gridItems(sim, k, multi, z) {
  const CWd = 74;
  const CH = 56;
  const x0 = SX + 70;
  const y0 = 170;
  const done = sim.E.slice(0, k + 1).map(([u, v], e) => (multi ? [Math.min(u, v), Math.max(u, v), e] : [u, v, e]));
  const cx = (j) => x0 + j * CWd + CWd / 2;
  const cy = (i) => y0 + i * CH + CH / 2;
  let h = '';
  // 表头：上面一排、左边一列都是顶点结点
  sim.V.forEach((name, i) => {
    h += `<g transform="translate(${cx(i) - 17} ${y0 - 52})">${cell(34, 30, name, { tone: TONES[i], size: 13 })}</g>`;
    if (!multi) h += `<g transform="translate(${x0 - 56} ${cy(i) - 15})">${cell(34, 30, name, { tone: TONES[i], size: 13 })}</g>`;
  });
  h += txt(x0 - 56, y0 - 62, multi ? '' : 'firstout →', 'gs-hd', 'start') + txt(cx(sim.n - 1) + 24, y0 - 34, multi ? 'firstedge ↓' : 'firstin ↓', 'gs-hd', 'start');
  // 网格底线
  for (let i = 0; i < sim.n; i++) for (let j = 0; j < sim.n; j++) if (!multi || j > i) h += `<rect class="gs-slot" x="${cx(j) - 30}" y="${cy(i) - 15}" width="60" height="30" rx="4"/>`;
  if (multi) for (let i = 0; i < sim.n; i++) h += `<circle class="gs-diag" cx="${cx(i)}" cy="${cy(i)}" r="4"/>`;
  // 边结点
  for (const [i, j, e] of done) {
    const lab = multi ? `${i}–${j}` : `${i}→${j}`;
    h += `<g transform="translate(${cx(j) - 30} ${cy(i) - 15})">${cell(60, 30, lab, { tone: e === k ? 'orange' : 'slate', size: 12, cls: e === k ? 'hot' : '' })}</g>`;
  }
  // 链
  if (!multi) {
    for (let i = 0; i < sim.n; i++) {
      // 出弧：沿第 i 行（tlink）
      const row = done.filter(([a]) => a === i).sort((p, q) => p[1] - q[1]);
      let px = x0 - 22;
      for (const [, j, e] of row) {
        h += arrow(px + 2, cy(i) - 4, cx(j) - 32, cy(i) - 4, e === k ? 'acc' : 'gs-out');
        px = cx(j) + 30;
      }
      // 入弧：沿第 i 列（hlink）
      const col = done.filter(([, b]) => b === i).sort((p, q) => p[0] - q[0]);
      let py = y0 - 22;
      for (const [r, , e] of col) {
        h += arrow(cx(i) + 8, py + 2, cx(i) + 8, cy(r) - 17, e === k ? 'acc' : 'gs-in');
        py = cy(r) + 15;
      }
    }
  } else {
    for (let v = 0; v < sim.n; v++) {
      const colPart = done.filter(([, b]) => b === v).sort((p, q) => p[0] - q[0]);
      const rowPart = done.filter(([a]) => a === v).sort((p, q) => p[1] - q[1]);
      if (!colPart.length && !rowPart.length) continue;
      const cls = `gs-v c-${TONES[v]}`;
      let px = cx(v);
      let py = y0 - 22;
      for (const [r] of colPart) {
        h += arrow(px, py + 2, px, cy(r) - 17, cls);
        py = cy(r) + 15;
      }
      if (rowPart.length) {
        // 往下走到第 v 行，再拐弯往右
        h += `<path class="gs-elbow c-${TONES[v]}" d="M${px} ${py + 2} L${px} ${cy(v)}"/>`;
        let x = px;
        for (const [, j] of rowPart) {
          h += arrow(x, cy(v), cx(j) - 32, cy(v), cls);
          x = cx(j) + 30;
        }
      }
    }
  }
  if (!multi) h += txt(x0, y0 + sim.n * CH + 20, z ? '蓝：沿 tlink 是同一个弧尾的出弧；绿：沿 hlink 是同一个弧头的入弧' : 'blue: tlink (same tail); green: hlink (same head)', 'bt-cap', 'start');
  else h += txt(x0, y0 + sim.n * CH + 20, z ? '每个顶点一种颜色：从上面的顶点往下走（jlink），到自己那一行再往右走（ilink）' : 'one colour per vertex: down the column (jlink), then right along its row (ilink)', 'bt-cap', 'start');
  return { k: 'store', x: 0, y: 0, html: h };
}

function board(sim, st, z) {
  const k = st ? st.k : -1;
  const s = st ? (st.final ? sim.states.at(-1) : sim.states[k]) : { M: sim.states[0].M.map((r) => r.map(() => 0)), adj: sim.V.map(() => []) };
  const kk = st?.final ? sim.E.length : k;
  const items = [graphItems(sim, st?.final ? sim.E.length : k, z)];
  const store = sim.store;
  if (store === 'matrix') items.push(matrixItems(sim, { ...s, final: st?.final }, kk));
  else if (store === 'adj') items.push(adjItems(sim, { ...s, final: st?.final }, kk));
  else items.push(gridItems(sim, st?.final ? sim.E.length - 1 : k, store === 'multi', z));
  items.push({ k: 'title', x: SX + 30, y: 92, html: txt(0, 0, `${z ? NAME[store].zh : NAME[store].en}`, 'bt-lab', 'start') });
  return items;
}

function build(p, kit, ERR) {
  let sim = graphStore({ directed: !!p.directed, edges: p.edges });
  if (sim.ok && p.store === 'cross' && !sim.directed) sim = { ok: false, errors: ['crossDir'] };
  if (sim.ok && p.store === 'multi' && sim.directed) sim = { ok: false, errors: ['multiDir'] };
  if (sim.ok) sim.store = p.store;
  const lesson = shell('graph-store', kit, ERR, sim, {
    where: W,
    tag: T('存储', 'Store'),
    name: T('图的存储结构', 'Storing a graph'),
    full: T('邻接矩阵 · 邻接表 · 十字链表 · 邻接多重表 · 度的计算 · 稠密图和稀疏图怎么选', 'Matrix · list · orthogonal list · multilist · degrees · dense vs sparse'),
    title: NAME[p.store] ?? T('', ''),
    legend: [['orange', T('刚加的边', 'New edge')]],
    principle: PRINCIPLE,
    desc: T('同一张图可以有四种存法。这节课一条条加边，看每条边落在邻接矩阵的哪一格、挂到邻接表的哪条链上；十字链表和邻接多重表里每条边只有一个结点，却同时串在两条链上。换一种存储结构再走一遍，比较空间和查找的方便程度。', 'One graph, four storages. Add edges one by one and see where each lands; in the orthogonal list and multilist each edge is one node on two chains.'),
    rect: [20, 70, SX + 70 + 6 * 74 + 60, 170 + 6 * 56 + 50],
  });
  if (!sim.ok) return lesson;
  const name = (i) => sim.V[i];
  const list = sim.E.map(([u, v], k) => {
    const e = sim.directed ? `${name(u)}→${name(v)}` : `(${name(u)}, ${name(v)})`;
    let detail;
    if (p.store === 'matrix') detail = sim.directed ? T(`弧 ${e}：A[${u}][${v}] = 1。`, `A[${u}][${v}] = 1.`) : T(`边 ${e}：A[${u}][${v}] = A[${v}][${u}] = 1，无向图的矩阵是对称的。`, `A[${u}][${v}] = A[${v}][${u}] = 1.`);
    else if (p.store === 'adj') detail = sim.directed ? T(`弧 ${e}：新建边结点（adjvex = ${v}），用头插法挂到顶点 ${name(u)} 的链表最前面。`, `Edge node ${v} at the head of ${name(u)}'s list.`) : T(`边 ${e}：建两个边结点，adjvex = ${v} 的挂到 ${name(u)} 的链表前面，adjvex = ${u} 的挂到 ${name(v)} 的链表前面——无向图的每条边存两次。`, `Two edge nodes, one in each list.`);
    else if (p.store === 'cross') detail = T(`弧 ${e}：只建一个弧结点（tailvex = ${u}，headvex = ${v}），它既串在 ${name(u)} 的出弧链（第 ${u} 行，tlink）上，也串在 ${name(v)} 的入弧链（第 ${v} 列，hlink）上。`, `One arc node on ${name(u)}'s out-chain and ${name(v)}'s in-chain.`);
    else detail = T(`边 ${e}：只建一个边结点（ivex = ${Math.min(u, v)}，jvex = ${Math.max(u, v)}），它同时在顶点 ${name(Math.min(u, v))} 和 ${name(Math.max(u, v))} 的链上——邻接表要存两个结点，这里只要一个。`, `One edge node shared by both vertices’ chains.`);
    return { title: T(`加入${sim.directed ? '弧' : '边'} ${e}`, `Add ${e}`), desc: NAME[p.store], detail, ref: p.store, st: { k }, row: { color: TONES[u], what: e, result: T(`第 ${k + 1} 条`, `#${k + 1}`), tone: 'info' } };
  });
  const n = sim.n;
  const e = sim.E.length;
  const space = { matrix: T(`${n} × ${n} = ${n * n} 个元素`, `${n * n} cells`), adj: T(`${n} 个顶点结点 + ${sim.directed ? e : 2 * e} 个边结点`, `${n} + ${sim.directed ? e : 2 * e} nodes`), cross: T(`${n} 个顶点结点 + ${e} 个弧结点`, `${n} + ${e} nodes`), multi: T(`${n} 个顶点结点 + ${e} 个边结点`, `${n} + ${e} nodes`) }[p.store];
  const degText = sim.directed ? sim.V.map((x, i) => `${x}：出 ${sim.outDeg[i]} 入 ${sim.inDeg[i]}`).join('，') : sim.V.map((x, i) => `${x}：${sim.outDeg[i]}`).join('，');
  const howDeg = {
    matrix: sim.directed ? T('第 i 行 1 的个数是出度，第 i 列是入度', 'row = out, column = in') : T('第 i 行 1 的个数就是度', 'row sum = degree'),
    adj: sim.directed ? T('链表长度是出度；入度要扫描所有链表数 adjvex = i 的结点', 'list length = out-degree; in-degree needs a full scan') : T('链表长度就是度', 'list length = degree'),
    cross: T('沿第 i 行（tlink）数出度，沿第 i 列（hlink）数入度', 'tlink along the row = out, hlink down the column = in'),
    multi: T('沿顶点 i 的链（先往下、再往右）数结点个数就是度', 'count nodes along the vertex’s chain'),
  }[p.store];
  list.push({ title: T('存储空间和度', 'Space and degrees'), desc: space, detail: T(`空间：${space.zh}。求度：${howDeg.zh}。各顶点的度：${degText}。`, `Space: ${space.en}. Degrees: ${howDeg.en}.`), ref: 'cost', st: { final: true }, row: { color: 'green', what: T('小结', 'Summary'), result: space, tone: 'ok' } });
  return finish(lesson, list, (st, z) => board(sim, st, z), T(`${NAME[p.store].zh}：${space.zh}`, `${NAME[p.store].en}: ${space.en}`), T('换一种存储结构再看一遍同一张图。', 'Switch the storage and replay the same graph.'));
}

export const makeGraphStore = make('graph-store', SPEC, ERR, build);
