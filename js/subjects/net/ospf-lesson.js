// 「链路状态路由与 OSPF」：左边是路由器和链路（边上是代价），右边随步骤换成：链路状态数据库 → Dijkstra 的距离表 → 转发表。
// 先每台路由器把自己的 LSA 洪泛出去（数据库一行行填满），再以源路由器为根跑 Dijkstra，最后从最短路径树读出下一跳。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { circleLayout, gridTable, graphItems } from '../ds/graph.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { DEF_GRAPH, key, ospf } from './ospf.js';

const W = [['net', 'network']];
const PX = 560;
const PY = 130;
const inf = (v) => (v === Infinity ? '∞' : String(v));

const PRINCIPLE = {
  sections: [
    {
      id: 'ls',
      title: T('链路状态和距离向量', 'Link state vs distance vector'),
      blocks: [
        {
          table: {
            head: ['', T('距离向量（RIP）', 'Distance vector (RIP)'), T('链路状态（OSPF）', 'Link state (OSPF)')],
            rows: [
              [T('和谁交换', 'With whom'), T('只和相邻路由器', 'neighbours only'), T('洪泛给本区域所有路由器', 'flooded to every router in the area')],
              [T('交换什么', 'What'), T('自己的整张路由表（到各网络的距离）', 'its whole distance table'), T('只有和自己相邻的链路状态', 'only its own links')],
              [T('什么时候', 'When'), T('周期性（30 秒）', 'periodically (30 s)'), T('链路状态变化时（另有长周期刷新）', 'on change (plus slow refresh)')],
              [T('怎样算路由', 'How routes are computed'), T('邻居给的距离 + 1，取最小（Bellman-Ford）', 'neighbour distance + 1'), T('每台路由器有全网拓扑，自己跑 Dijkstra', 'each runs Dijkstra on the full map')],
              [T('收敛', 'Convergence'), T('慢，坏消息传得慢（无穷计数）', 'slow; count to infinity'), T('快', 'fast')],
            ],
          },
        },
      ],
    },
    {
      id: 'ospf',
      title: T('OSPF 的要点', 'OSPF in brief'),
      blocks: [
        { list: [
          T('OSPF（开放最短路径优先）是**内部网关协议**，用链路状态算法；报文直接封装在 **IP 数据报**里（协议号 89），不用 UDP 或 TCP。', 'OSPF is an **interior** link-state protocol carried directly in **IP** (protocol 89).'),
          T('「代价」可以按距离、时延、带宽等设定，不只是跳数；到同一目的有多条代价相同的路径时可以分摊流量。', 'Costs can reflect delay or bandwidth; equal-cost paths share load.'),
          T('五种分组：问候（Hello，发现和维持邻居）、数据库描述、链路状态请求、链路状态更新（LSU，真正洪泛 LSA）、链路状态确认。', 'Five packet types: Hello, database description, LS request, LS update, LS ack.'),
          T('大的自治系统可以划分成若干**区域**，洪泛只在区域内进行；区域之间通过**主干区域**（区域 0）连接，由区域边界路由器汇总。', 'Large ASes are split into **areas** joined by the **backbone** (area 0).'),
        ] },
        { tip: T('所有路由器的链路状态数据库最终一样（同步），但各自以自己为根算最短路径树，所以转发表各不相同。', 'Databases are identical, but each router roots its own shortest-path tree.') },
      ],
    },
    {
      id: 'hier',
      title: T('分层次的路由和 BGP', 'Hierarchical routing and BGP'),
      blocks: [
        { p: T('因特网分成许多**自治系统**（AS）。AS 内部用**内部网关协议** IGP（RIP、OSPF），AS 之间用**外部网关协议** EGP（BGP）。', 'The Internet is made of **autonomous systems**: IGPs (RIP, OSPF) inside, an EGP (BGP) between.') },
        {
          table: {
            head: ['', 'RIP', 'OSPF', 'BGP'],
            rows: [
              [T('类型', 'Type'), T('内部，距离向量', 'interior, distance vector'), T('内部，链路状态', 'interior, link state'), T('外部，路径向量', 'exterior, path vector')],
              [T('封装在', 'Carried in'), T('UDP，端口 520', 'UDP 520'), T('IP，协议号 89', 'IP, protocol 89'), T('TCP，端口 179', 'TCP 179')],
              [T('选路依据', 'Chooses by'), T('跳数最少（16 为不可达）', 'fewest hops (16 = ∞)'), T('代价最小', 'lowest cost'), T('能到达且符合策略，不追求最短', 'reachable and policy-compliant, not shortest')],
            ],
          },
        },
        { list: [
          T('BGP 由每个 AS 的 **BGP 发言人**互相建立 TCP 连接交换信息，交换的是到某个网络要经过的**完整 AS 路径**，便于检测环路、执行策略。', 'BGP speakers exchange **whole AS paths** over TCP, which avoids loops and enforces policy.'),
          T('BGP 只在开始时交换整个路由表，以后只在变化时发送更新；报文有 OPEN、UPDATE、KEEPALIVE、NOTIFICATION 四种。', 'Full tables at start, then updates only: OPEN, UPDATE, KEEPALIVE, NOTIFICATION.'),
        ] },
      ],
    },
    pit([
      T('OSPF 报文直接用 IP 传，不是 UDP；RIP 用 UDP，BGP 用 TCP。', 'OSPF over IP, RIP over UDP, BGP over TCP.'),
      T('链路状态路由器洪泛的是「与自己相邻的链路」，而不是整张路由表。', 'A router floods its own links, not its routing table.'),
      T('转发表只记下一跳，不记完整路径；完整路径在最短路径树里。', 'The forwarding table keeps only the next hop.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('6 台路由器，从 R1 算', 'Six routers, from R1'), set: { graph: DEF_GRAPH, src: 'R1', fail: '' } },
    { label: T('链路 R2—R4 断开以后', 'After link R2–R4 fails'), set: { graph: DEF_GRAPH, src: 'R1', fail: 'R2-R4' } },
    { label: T('换成从 R5 算', 'Computed at R5'), set: { graph: DEF_GRAPH, src: 'R5', fail: '' } },
  ],
  groups: [{ legend: T('拓扑', 'Topology'), fields: [
    { name: 'graph', label: T('链路和代价（如 R1-R2 2）', 'Links and costs (e.g. R1-R2 2)'), type: 'text', parse: (s) => String(s).trim(), wide: true },
    { name: 'src', label: T('在哪台路由器上算', 'Compute at'), type: 'text', parse: (s) => String(s).trim() },
    { name: 'fail', label: T('之后断开的链路（如 R2-R4，可空）', 'Link that fails later (optional)'), type: 'text', parse: (s) => String(s).trim() },
  ] }],
  note: T('链路是双向的，两个方向代价相同；Dijkstra 距离相同时按名字顺序选。3～8 台路由器。', 'Links are symmetric; ties go by name. 3–8 routers.'),
};
const ERR = { graph: T('链路写成「R1-R2 2」，用逗号隔开', 'Write links as R1-R2 2'), count: T('3～8 台路由器', '3–8 routers'), weight: T('代价至少为 1', 'Costs must be at least 1'), src: T('拓扑里没有这台路由器', 'No such router'), fail: T('要断开的链路不在拓扑里', 'That link is not in the topology') };

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.list[st.k] : null;
  const kind = s?.kind ?? 'pre';
  const pos = sim.pos;
  const failK = sim.after && ['fail', 'table2'].includes(kind) ? sim.after.key : null;
  const d = kind === 'table2' ? sim.after.d : sim.d;
  // 树边
  const tree = new Set();
  let snapPrev = null;
  if (kind === 'spf') snapPrev = s.round.after.prev;
  else if (kind === 'table') snapPrev = sim.d.prev;
  else if (kind === 'table2' && d) snapPrev = d.prev;
  if (snapPrev) for (const [v, p] of Object.entries(snapPrev)) if (p) tree.add(key(v, p));
  const inS = kind === 'spf' ? new Set(s.round.after.S) : kind === 'table' || kind === 'table2' ? new Set(Object.keys(d?.dist ?? {})) : new Set();
  items.push(...graphItems(sim.V, sim.edges, pos, {
    edgeCls: (e) => {
      const k = key(e.u, e.v);
      if (k === failK) return 'bad';
      if (kind === 'lsa' && (e.u === s.v || e.v === s.v)) return 'on';
      if (kind === 'hello') return 'on';
      if (tree.has(k)) return 'tree';
      return kind === 'spf' || kind.startsWith('table') ? 'dim' : '';
    },
    tone: (v) => (v === sim.src ? 'amber' : kind === 'lsa' && v === s.v ? 'violet' : kind === 'spf' && v === s.round.pick ? 'green' : inS.has(v) && kind !== 'pre' ? 'blue' : ''),
    cls: (v) => (kind === 'lsa' && v === s.v) || (kind === 'spf' && v === s.round.pick) ? 'hot' : '',
    under: (v) => (kind === 'spf' ? inf(s.round.after.dist[v]) : kind.startsWith('table') && d ? inf(d.dist?.[v] ?? Infinity) : null),
  }));
  // 右边面板
  let h = '';
  if (kind === 'hello' || kind === 'lsa' || kind === 'fail') {
    const got = kind === 'hello' ? [] : kind === 'fail' ? sim.V : sim.V.slice(0, s.i + 1);
    const lsdb = kind === 'fail' ? sim.lsdb2 : sim.lsdb;
    h += txt(0, -14, z ? `${sim.src} 的链路状态数据库` : `${sim.src}’s link-state database`, 'bt-lab', 'start');
    const rows = sim.V.map((v) => {
      const have = kind === 'hello' ? v === sim.src : got.includes(v);
      const tone = (kind === 'lsa' && v === s.v) || (kind === 'fail' && sim.after.link.includes(v)) ? 'amber' : '';
      return [{ t: v, tone }, { t: have ? lsdb[v].map((a) => `${a.to}:${a.w}`).join('  ') : '…', tone }];
    });
    h += gridTable([z ? '谁的 LSA' : 'LSA of', z ? '相邻链路（邻居:代价）' : 'links (neighbour:cost)'], rows, { cw: [80, 270], rh: 32 });
  } else if (kind === 'spf') {
    const r = s.round;
    h += txt(0, -14, z ? `Dijkstra 第 ${r.k} 轮：选 ${r.pick}（距离 ${r.d}）` : `Dijkstra round ${r.k}: pick ${r.pick} (${r.d})`, 'bt-lab', 'start');
    const rows = sim.V.filter((v) => v !== sim.src).map((v) => {
      const up = r.updates.find((u) => u.v === v && u.better);
      const tone = v === r.pick ? 'green' : up ? 'amber' : '';
      return [{ t: v, tone }, { t: inf(r.after.dist[v]), tone }, { t: r.after.prev[v] ?? '—', tone }, { t: r.after.S.includes(v) ? '✓' : '', tone }];
    });
    h += gridTable([z ? '目的' : 'dest', z ? '距离' : 'dist', z ? '前驱' : 'prev', z ? '已确定' : 'done'], rows, { cw: [70, 70, 70, 70], rh: 32 });
  } else if (kind === 'table' || kind === 'table2') {
    const t = kind === 'table' ? sim.table : sim.after.table;
    h += txt(0, -14, z ? `${sim.src} 的转发表${kind === 'table2' ? '（链路断开后）' : ''}` : `${sim.src}’s forwarding table${kind === 'table2' ? ' (after the failure)' : ''}`, 'bt-lab', 'start');
    const rows = t.map((r) => {
      const tone = kind === 'table2' && sim.after.changed.includes(r.dest) ? 'amber' : '';
      return [{ t: r.dest, tone }, { t: r.next ?? (z ? '不可达' : 'unreachable'), tone }, { t: inf(r.cost), tone }, { t: r.path ? r.path.join('→') : '—', tone }];
    });
    h += gridTable([z ? '目的' : 'dest', z ? '下一跳' : 'next hop', z ? '代价' : 'cost', z ? '最短路径' : 'path'], rows, { cw: [64, 76, 60, 170], rh: 32 });
  } else h += txt(0, 0, z ? '（点播放）' : '(press play)', 'bt-idx', 'start');
  items.push({ k: 'panel', x: PX, y: PY, html: h });
  return items;
}

function build(p, kit, ERR) {
  const sim = ospf(p);
  const lesson = shell('ospf', kit, ERR, sim, {
    where: W,
    tag: 'OSPF',
    name: T('链路状态路由与 OSPF', 'Link-state routing and OSPF'),
    full: T('Hello 发现邻居 · LSA 洪泛 · 链路状态数据库 · 各自跑 Dijkstra · 最短路径树与转发表 · 链路断开后重算 · RIP、OSPF、BGP 对比', 'Hello · LSA flooding · the link-state database · Dijkstra · shortest-path tree · reconvergence · RIP vs OSPF vs BGP'),
    title: SPEC.presets.find((x) => x.set.graph === p.graph && x.set.src === p.src && x.set.fail === (p.fail ?? ''))?.label ?? T('链路状态路由', 'Link-state routing'),
    legend: [['amber', T('源路由器 / 这一步变了的', 'Source / changed')], ['violet', T('正在洪泛 LSA', 'Flooding its LSA')], ['green', T('这一轮确定的', 'Settled this round')]],
    principle: PRINCIPLE,
    desc: T('链路状态路由分两步：先让每台路由器把「我连着谁、代价多少」洪泛给全网，大家得到同一张地图；再各自以自己为根跑 Dijkstra，从最短路径树读出下一跳。最后试试断开一条链路，看转发表怎样变。', 'Flood each router’s links so all share one map, then each runs Dijkstra and reads next hops off its tree. Then break a link.'),
    rect: [40, 90, 960, 520],
  });
  if (!sim.ok) return lesson;
  sim.pos = circleLayout(sim.V, { cx: 280, cy: 320, R: 180 }, sim.edges);
  if (sim.after) {
    const [a, b] = sim.after.link;
    sim.lsdb2 = Object.fromEntries(sim.V.map((v) => [v, sim.lsdb[v].filter((x) => !(v === a && x.to === b) && !(v === b && x.to === a))]));
  }
  const list = [{ kind: 'hello' }, ...sim.V.map((v, i) => ({ kind: 'lsa', v, i })), ...sim.d.rounds.filter((r) => r.pick).map((round) => ({ kind: 'spf', round })), { kind: 'table' }];
  if (sim.after) list.push({ kind: 'fail' }, { kind: 'table2' });
  sim.list = list;
  const lines = list.map((s, k) => {
    let d;
    if (s.kind === 'hello') d = [T('Hello：认识邻居', 'Hello: meet the neighbours'), T(`每台路由器周期性地向相邻路由器发问候分组，知道了自己连着谁、每条链路的代价。比如 ${sim.src} 连着 ${sim.lsdb[sim.src].map((a) => `${a.to}（${a.w}）`).join('、')}。`, `${sim.src} learns its neighbours: ${sim.lsdb[sim.src].map((a) => `${a.to} (${a.w})`).join(', ')}.`), 'ospf'];
    else if (s.kind === 'lsa') d = [T(`${s.v} 洪泛自己的 LSA`, `${s.v} floods its LSA`), T(`${s.v} 把「${sim.lsdb[s.v].map((a) => `到 ${a.to} 代价 ${a.w}`).join('，')}」装进链路状态通告，发给所有邻居，邻居再转发给自己的邻居……很快全网每台路由器都收到。${s.i === sim.V.length - 1 ? '到这里所有路由器的数据库都一样了，等于有了一张全网地图。' : ''}`, `${s.v} advertises its links to everyone.`), 'ls'];
    else if (s.kind === 'spf') {
      const r = s.round;
      const ups = r.updates.filter((u) => u.better);
      d = [T(`第 ${r.k} 轮：确定 ${r.pick}，距离 ${r.d}`, `Round ${r.k}: ${r.pick} at ${r.d}`), T(`没确定的路由器里 ${r.pick} 的距离最小（${r.d}），把它加入最短路径树。${ups.length ? `经过 ${r.pick} 更新：${ups.map((u) => `${u.v} ${inf(u.old)} → ${u.via}`).join('，')}。` : `经过 ${r.pick} 没有更短的路。`}`, `Settle ${r.pick}; ${ups.map((u) => `${u.v} → ${u.via}`).join(', ') || 'no updates'}.`), 'ls'];
    } else if (s.kind === 'table') d = [T(`${sim.src} 的转发表`, `${sim.src}’s forwarding table`), T(`最短路径树（深色边）定了。每个目的的下一跳就是路径上 ${sim.src} 后面的那台：${sim.table.map((r) => `${r.dest} 走 ${r.next}`).join('，')}。转发表只记下一跳。`, sim.table.map((r) => `${r.dest} via ${r.next}`).join(', ')), 'ospf'];
    else if (s.kind === 'fail') d = [T(`链路 ${sim.after.link.join('—')} 断开`, `Link ${sim.after.link.join('–')} fails`), T(`${sim.after.link.join(' 和 ')} 发现链路断了，各自洪泛新的 LSA（不再含这条链路）。全网数据库更新后，每台路由器重新跑 Dijkstra。只在变化时洪泛，所以收敛很快。`, 'Both ends flood new LSAs; everyone recomputes.'), 'ls'];
    else d = [T('重新计算后的转发表', 'The recomputed table'), T(sim.after.changed.length ? `变了的表项（橙色）：${sim.after.table.filter((r) => sim.after.changed.includes(r.dest)).map((r) => `${r.dest} 改走 ${r.next ?? '不可达'}，代价 ${inf(r.cost)}`).join('；')}。` : '这条链路不在最短路径树上，转发表没有变化。', sim.after.changed.length ? `Changed: ${sim.after.changed.join(', ')}.` : 'No change.'), 'ls'];
    return { title: d[0], desc: T({ hello: '准备', lsa: '洪泛', spf: '最短路径', table: '转发表', fail: '链路变化', table2: '转发表' }[s.kind], s.kind), detail: d[1], ref: d[2], st: { k }, row: { color: s.kind === 'spf' ? 'green' : s.kind === 'lsa' ? 'violet' : 'blue', what: d[0], result: T(s.kind === 'spf' ? `${s.round.pick}=${s.round.d}` : '—', s.kind === 'spf' ? `${s.round.pick}=${s.round.d}` : '—'), tone: 'info' } };
  });
  const title = T(`${sim.V.length} 个 LSA 洪泛后，${sim.src} 跑了 ${sim.d.rounds.length} 轮 Dijkstra`, `${sim.V.length} LSAs, ${sim.d.rounds.length} Dijkstra rounds at ${sim.src}`);
  const text = T(`转发表：${sim.table.map((r) => `${r.dest} → ${r.next}（${inf(r.cost)}）`).join('，')}。${sim.after ? `链路断开后变了 ${sim.after.changed.length} 项。` : ''}`, sim.table.map((r) => `${r.dest} → ${r.next}`).join(', '));
  return finish(lesson, lines, (st, z) => board(sim, st, z), title, text);
}

export const makeOspf = make('ospf', SPEC, ERR, build);
