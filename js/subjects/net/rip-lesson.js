// 「RIP 距离向量算法」：四张平面表格从左到右——自己原来的路由表、邻居发来的消息、加 1 改下一跳之后、更新后的路由表，
// 一行一行按规则处理，每行旁边写着用的是哪条规则。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { rip } from './rip.js';

const SPEC = {
  presets: [
    {
      label: T('五种情况都有', 'Every case'),
      set: { table: 'Net1 3 R2\nNet2 5 R3\nNet3 1 直接\nNet4 6 R4\nNet5 2 R3', from: 'R3', msg: 'Net1 1\nNet2 6\nNet3 3\nNet4 3\nNet5 15\nNet6 5' },
    },
    {
      label: T('邻居带来新网络', 'New networks arrive'),
      set: { table: 'Net1 1 直接\nNet2 1 直接', from: 'R2', msg: 'Net2 1\nNet3 1\nNet4 2' },
    },
  ],
  groups: [
    {
      legend: T('本路由器', 'This router'),
      fields: [{ name: 'table', label: T('路由表：每行「目的网络 距离 下一跳」', 'Table: "network distance next-hop" per line'), type: 'text', wide: true, multiline: true, rows: 5 }],
    },
    {
      legend: T('收到的 RIP 报文', 'RIP message received'),
      fields: [
        { name: 'from', label: T('发来消息的相邻路由器', 'Neighbor that sent it'), type: 'text' },
        { name: 'msg', label: T('消息：每行「目的网络 距离」', 'Message: "network distance" per line'), type: 'text', wide: true, multiline: true, rows: 5 },
      ],
    },
  ],
  note: T(
    '距离就是跳数：直接相连的网络距离为 1，每经过一个路由器加 1，最大 15，16 表示不可达。收到相邻路由器 X 的消息后，先把每项距离加 1、下一跳改为 X，再逐项比较更新；消息里没提到的网络保持不变。',
    'Distance is hop count: 1 for a directly attached network, +1 per router, at most 15, with 16 meaning unreachable. On a message from neighbor X, add 1 to every distance and set the next hop to X, then compare row by row; networks not mentioned stay as they are.',
  ),
};
const ERR = {
  row: T('路由表这一行看不懂：{r}', 'Cannot read this table row: {r}'),
  msg: T('消息这一行看不懂：{r}', 'Cannot read this message row: {r}'),
  from: T('请填写发来消息的相邻路由器', 'Name the neighbor'),
  count: T('路由表和消息都要有 1～10 行', 'Give 1–10 rows each'),
};

const RULE = {
  add: T('原来没有 → 添加', 'new → add'),
  same: T('下一跳就是它 → 以新消息为准', 'same next hop → take the update'),
  better: T('更短 → 替换', 'shorter → replace'),
  keep: T('不更短 → 不变', 'not shorter → keep'),
  none: T('消息里没有 → 不变', 'not in message → unchanged'),
};

// ───── 画板 ─────
const RH = 36;
const Y0 = 450;
const COL = { old: 40, msg: 300, mod: 480, neu: 720 };
const NW = 78;
const DW = 46;
const HW = 66;

function board(sim, st, z) {
  const items = [];
  const k = st.k ?? -1; // 处理到第几行
  const d = (v) => (v >= sim.INF ? '16' : String(v));
  const head = (x, title, cols) => txt(x, -38, title, 'bt-lab', 'start') + cols.map(([lab, w, off]) => txt(x + off + w / 2, -12, lab, 'bt-cap')).join('');
  items.push({
    k: 'heads',
    x: 0,
    y: Y0,
    html:
      head(COL.old, z ? '原来的路由表' : 'Old table', [[z ? '目的' : 'Net', NW, 0], [z ? '距离' : 'Dist', DW, NW + 4], [z ? '下一跳' : 'Next', HW, NW + DW + 8]]) +
      head(COL.msg, z ? `${sim.from} 发来的` : `From ${sim.from}`, [[z ? '目的' : 'Net', NW, 0], [z ? '距离' : 'Dist', DW, NW + 4]]) +
      (st.mod ? head(COL.mod, z ? '距离 + 1，下一跳改为 ' + sim.from : `+1, next = ${sim.from}`, [[z ? '目的' : 'Net', NW, 0], [z ? '距离' : 'Dist', DW, NW + 4], [z ? '下一跳' : 'Next', HW, NW + DW + 8]]) : '') +
      (k >= 0 ? head(COL.neu, z ? '更新后的路由表' : 'New table', [[z ? '目的' : 'Net', NW, 0], [z ? '距离' : 'Dist', DW, NW + 4], [z ? '下一跳' : 'Next', HW, NW + DW + 8]]) : ''),
  });
  const three = (x, a, b, c, cls = '', tone = '') => `<g transform="translate(${x} 0)">${cell(NW, RH - 8, a, { cls, size: 13 })}<g transform="translate(${NW + 4} 0)">${cell(DW, RH - 8, b, { cls, tone, size: 13 })}</g>${c != null ? `<g transform="translate(${NW + DW + 8} 0)">${cell(HW, RH - 8, c, { cls, tone, size: 12 })}</g>` : ''}</g>`;
  sim.rows.forEach((r, i) => {
    const y = Y0 + i * RH;
    const cur = i === k;
    let h = r.old ? three(COL.old, r.net, d(r.old.d), r.old.hop, cur ? 'hot' : '') : '';
    if (r.msg) h += three(COL.msg, r.net, d(r.msg.d), null, cur ? 'hot' : '', 'blue');
    if (st.mod && r.mod) h += three(COL.mod, r.net, d(r.mod.d), r.mod.hop, cur ? 'hot' : '', r.mod.d >= sim.INF ? 'rose' : 'violet');
    if (i <= k) {
      const tone = r.rule === 'none' || r.rule === 'keep' ? '' : r.neu.d >= sim.INF ? 'rose' : 'green';
      h += three(COL.neu, r.net, d(r.neu.d), r.neu.hop, cur ? 'hot' : r.changed ? '' : 'dim', tone);
      h += txt(COL.neu + NW + DW + HW + 20, RH / 2, z ? RULE[r.rule].zh : RULE[r.rule].en, `rp-rule ${r.changed ? 'on' : ''}`, 'start');
    }
    items.push({ k: `r${i}`, x: 0, y, html: h });
  });
  return [...race(sim, st, z), ...items];
}

/**
 * 上方的「两条路」图：本路由器要去某个网络，原来那条路（经原来的下一跳）和经 X 的新路摆在一起，
 * 短的那条亮起来。第 0 步画 X 把整张距离向量发过来。
 */
function race(sim, st, z) {
  const items = [];
  const k = st.k ?? -1;
  const d = (v) => (v >= sim.INF ? '16' : String(v));
  const RX = 140;
  const MX = 520;
  const NX = 900;
  const CY = 200;
  const UY = 100;
  const LY = 300;
  const me = z ? '本路由器' : 'this router';
  const node = (x, y, text, tone, cls = '') => `<g transform="translate(${x - 70} ${y - 23})">${cell(140, 46, text, { tone, size: 17, cls })}</g>`;
  if (k < 0) {
    if (!st.mod) return items;
    let h = node(RX, CY, me, 'slate') + node(NX, CY, sim.from, 'blue');
    h += arrow(NX - 74, CY, RX + 74, CY, 'cs-a') + txt((RX + NX) / 2, CY - 18, z ? `${sim.from} 发来它的整张距离向量` : `${sim.from} sends its whole distance vector`, 'rp-step0');
    h += txt((RX + NX) / 2, CY + 52, z ? `经 ${sim.from} 去任何网络都要多走一跳：每项距离 + 1，下一跳记作 ${sim.from}` : `Via ${sim.from} every network is one hop further: +1, next hop ${sim.from}`, 'rp-big rp-mid');
    items.push({ k: 'race', x: 0, y: 0, html: h });
    return items;
  }
  const r = sim.rows[k];
  let h = node(RX, CY, me, 'slate') + node(NX, CY, r.net, 'teal');
  const win = (which) => {
    if (r.rule === 'add' || r.rule === 'same' || r.rule === 'better') return which === 'new';
    return which === 'old';
  };
  const path = (y, via, dist, label, which, sub) => {
    const on = win(which);
    const cls = on ? 'rp-win' : 'rp-lose';
    let p = '';
    if (via === '直接' || via === 'direct') {
      p += `<path class="rp-path ${cls}" d="M${RX + 70} ${CY - 6} L${NX - 70} ${CY - 6}"/>`;
      p += txt((RX + NX) / 2, CY - 16, `${label}：${dist}`, `rp-lab ${on ? 'on' : ''}`);
      return p;
    }
    p += `<path class="rp-path ${cls}" d="M${RX + 60} ${CY + (y < CY ? -23 : 23)} L${MX - 70} ${y} M${MX + 70} ${y} L${NX - 60} ${CY + (y < CY ? -23 : 23)}"/>`;
    p += node(MX, y, via, which === 'new' ? 'blue' : 'slate', on ? '' : 'dim');
    p += txt(MX, y + (y < CY ? -34 : 50), `${label}：${dist}`, `rp-lab ${on ? 'on' : ''}`);
    if (sub) p += txt(MX, y + (y < CY ? -56 : 72), sub, 'bt-idx');
    return p;
  };
  if (r.rule === 'same') {
    h += path(LY, sim.from, `${d(r.old.d)} → ${d(r.mod.d)}`, z ? `原来就经 ${sim.from}` : `already via ${sim.from}`, 'new', z ? `${sim.from} 说现在是 ${d(r.msg.d)}，以最新为准` : `latest from ${sim.from}: ${d(r.msg.d)}`);
  } else {
    if (r.old) h += path(UY, r.old.hop, d(r.old.d), z ? '原来的路' : 'old route', 'old');
    else h += txt(MX, UY, z ? '原来的表里没有这个网络' : 'not in the old table', 'bt-idx');
    if (r.mod) h += path(LY, sim.from, `${d(r.msg.d)} + 1 = ${d(r.mod.d)}`, z ? `经 ${sim.from}` : `via ${sim.from}`, 'new');
    else h += txt(MX, LY, z ? `${sim.from} 没提到这个网络` : `${sim.from} did not mention it`, 'bt-idx');
  }
  h += txt(NX - 70, CY + 52, z ? RULE[r.rule].zh : RULE[r.rule].en, `rp-big ${r.changed ? 'on' : ''}`, 'start');
  items.push({ k: 'race', x: 0, y: 0, html: h });
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'routing',
      title: T('路由选择协议的分类', 'Kinds of routing protocols'),
      blocks: [
        { p: T('互联网划分成许多**自治系统（AS）**，各自管理内部路由。AS 内部用**内部网关协议 IGP**（RIP、OSPF），AS 之间用**外部网关协议 EGP**（BGP）。', 'The Internet is split into **autonomous systems**. Inside one AS an **IGP** runs (RIP, OSPF); between ASes an **EGP** (BGP).') },
        {
          table: {
            head: ['', 'RIP', 'OSPF', 'BGP'],
            rows: [
              [T('类型', 'Type'), T('距离向量', 'distance vector'), T('链路状态', 'link state'), T('路径向量', 'path vector')],
              [T('和谁交换', 'With whom'), T('只和相邻路由器', 'neighbors only'), T('洪泛给本区域所有路由器', 'flooded to the whole area'), T('BGP 发言人之间', 'BGP speakers')],
              [T('交换什么', 'What'), T('自己的整张路由表', 'its whole table'), T('与本路由器相邻的链路状态', 'its own link states'), T('到达各网络的完整路径', 'full AS paths')],
              [T('什么时候', 'When'), T('周期性（30 秒）', 'every 30 s'), T('链路状态变化时', 'on change'), T('有变化时（增量）', 'on change')],
              [T('运行在', 'Runs over'), 'UDP 520', T('直接用 IP（协议号 89）', 'IP directly (protocol 89)'), 'TCP 179'],
              [T('算法', 'Algorithm'), T('距离向量（Bellman-Ford）', 'Bellman-Ford'), T('Dijkstra 最短路径', 'Dijkstra'), T('—', '—')],
            ],
          },
        },
      ],
    },
    {
      id: 'rip',
      title: T('RIP 的距离', 'Distance in RIP'),
      blocks: [
        { p: T('RIP 的「距离」就是**跳数**：直接相连的网络距离为 1，每多经过一个路由器加 1。RIP 认为距离短的路由就是好路由，最大距离 15，**16 表示不可达**，所以 RIP 只适合小型网络。', 'RIP’s distance is the **hop count**: 1 for a directly attached network, +1 per router. The maximum is 15 and **16 means unreachable**, so RIP suits only small networks.') },
        { p: T('每个路由器只和**相邻**路由器交换信息，交换的是**自己当前的整张路由表**，每 30 秒一次。经过若干次交换，所有路由器最终都知道到达本自治系统中任何一个网络的最短距离和下一跳，这叫**收敛**。', 'Routers exchange their **whole table** with **neighbors** every 30 seconds; after enough rounds everyone knows the shortest distance and next hop to every network: **convergence**.') },
      ],
    },
    {
      id: 'update',
      title: T('距离向量算法：收到消息后怎么更新', 'The distance-vector update'),
      blocks: [
        {
          steps: [
            T('收到相邻路由器 X 的 RIP 报文，先把其中每一项的**距离加 1**，**下一跳改为 X**（因为要先到 X 再走 X 的路）；', 'For every row of the message from neighbor X, **add 1** and set the next hop to **X**;'),
            T('对修改后的每一项：自己的表里**没有**这个目的网络 → 添加；', 'If the network is **new** → add it;'),
            T('有，并且**下一跳就是 X** → 用新的替换（不管距离变大还是变小，都以 X 最新的消息为准）；', 'If the next hop is **already X** → replace it, better or worse, since X’s latest word counts;'),
            T('有，但下一跳不是 X → 新距离**更小**才替换，否则不变；', 'If the next hop is someone else → replace only when **shorter**;'),
            T('若 3 分钟没收到某相邻路由器的更新，就把经过它的路由都记为不可达（距离 16）。', 'If a neighbor is silent for 3 minutes, mark its routes unreachable (16).'),
          ],
        },
        { tip: T('这就是 Bellman-Ford 的思想：到某网络的最短距离 = min（到邻居的距离 + 邻居到该网络的距离）。RIP 中到邻居的距离都是 1。', 'This is Bellman-Ford: distance = min over neighbors of (1 + neighbor’s distance).') },
      ],
    },
    {
      id: 'count',
      title: T('好消息传得快，坏消息传得慢', 'Good news travels fast, bad news slowly'),
      blocks: [
        { p: T('某个网络断了，离它最近的路由器把距离记为 16，可这个消息要等到下一次交换才发出去。在这之前，它可能先收到邻居发来的「我到那个网络距离 2」（其实邻居的路正是经过它的），于是它误以为可以经邻居到达，记成 3；邻居再据此改成 4……两边互相抬高，直到 16 才都确认不可达。这叫**无穷计数**问题。', 'When a network fails, the nearest router marks it 16, but before it tells anyone it may hear a neighbor claim distance 2 (via itself!), record 3, and the two keep raising each other until 16: **count to infinity**.') },
        { p: T('缓解办法：**水平分割**（从某个邻居学来的路由不再告诉这个邻居）、**毒性逆转**、**触发更新**（路由变化时立即发送，不等 30 秒）。', 'Mitigations: **split horizon**, **poison reverse**, **triggered updates**.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('先给邻居的每一项**距离加 1**，再比较；直接拿邻居的距离比是错的。', 'Add 1 to the neighbor’s distances **before** comparing.'),
            T('下一跳已经是 X 时，即使新距离更大也要更新。', 'With next hop already X, take the update even if it is worse.'),
            T('直接相连的网络距离是 1（有的教材写 0，看清题目约定）。', 'Directly attached networks are 1 here (some books use 0).'),
            T('RIP 用 UDP，OSPF 直接用 IP，BGP 用 TCP。', 'RIP over UDP, OSPF over IP, BGP over TCP.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('逐项更新', 'Row by row') });

function build(params) {
  const sim = rip({ table: params.table, from: params.from, msg: params.msg });
  const lesson = {
    id: 'rip',
    kit,
    where: [['net', 'network']],
    tag: 'RIP',
    name: T('RIP 距离向量算法', 'RIP and distance vectors'),
    full: T('IGP / EGP · 跳数 · 距离向量更新规则 · 无穷计数 · RIP / OSPF / BGP 对比', 'IGP / EGP · hop count · update rules · count to infinity · RIP / OSPF / BGP'),
    title: sim.ok ? T(`收到 ${sim.from} 的消息`, `Message from ${sim.from}`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['blue', T('邻居发来的', 'Received')],
      ['violet', T('加 1 之后', 'After +1')],
      ['green', T('更新了', 'Updated')],
      ['rose', T('不可达', 'Unreachable')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        'RIP 路由器每 30 秒把自己的整张路由表发给相邻路由器。收到以后怎么更新自己的表，是距离向量算法的核心。这节课上面画「两条路」：本路由器去某个网络，原来那条路和经邻居的新路摆在一起，短的那条胜出；下面是考试要写的四张表，一行一行按规则更新。',
        'Every 30 seconds a RIP router sends its whole table to its neighbors. How the receiver updates its own table is the heart of distance-vector routing. The old table, the message, the message after +1, and the new table sit side by side, processed row by row.',
      ),
      facts: sim.ok ? [[T('相邻路由器', 'Neighbor'), sim.from], [T('涉及的网络', 'Networks'), String(sim.rows.length)]] : [],
    },
    start: { nodes: [], frame: { rect: [20, 60, COL.neu + NW + DW + HW + 230, Y0 + (sim.ok ? sim.rows.length : 5) * RH + 30] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const d = (v) => (v >= sim.INF ? T('16（不可达）', '16 (unreachable)') : T(String(v), String(v)));
  const list = [
    {
      title: T(`把 ${sim.from} 的每一项距离加 1`, `Add 1 to each of ${sim.from}’s rows`),
      desc: T(`下一跳都改为 ${sim.from}`, `Next hop becomes ${sim.from}`),
      detail: T(`经过 ${sim.from} 去这些网络，要先走一跳到 ${sim.from}，所以每项距离加 1、下一跳都写 ${sim.from}：${sim.rows.filter((r) => r.mod).map((r) => `${r.net} ${r.msg.d}→${r.mod.d}`).join('，')}。`, `Reaching them via ${sim.from} costs one more hop: ${sim.rows.filter((r) => r.mod).map((r) => `${r.net} ${r.msg.d}→${r.mod.d}`).join(', ')}.`),
      ref: 'update',
      st: { mod: true },
      row: { color: 'violet', what: T('距离加 1', 'Add 1'), result: T(`下一跳 ${sim.from}`, `via ${sim.from}`), tone: 'info' },
    },
  ];
  sim.rows.forEach((r, i) => {
    let detail;
    if (r.rule === 'add') detail = T(`原来的表里没有 ${r.net}，直接添加：距离 ${r.mod.d}，下一跳 ${sim.from}。`, `${r.net} is new: add it at ${r.mod.d} via ${sim.from}.`);
    else if (r.rule === 'same') detail = T(`原来到 ${r.net} 就是经 ${sim.from}（距离 ${r.old.d}）。${sim.from} 现在说它的距离是 ${r.msg.d}，以最新消息为准，改成 ${r.mod.d >= 16 ? '16，不可达' : r.mod.d}${r.mod.d > r.old.d ? '——即使变大了也要改' : ''}。`, `${r.net} already went via ${sim.from} (${r.old.d}); take the new value ${r.mod.d}${r.mod.d > r.old.d ? ', even though it is worse' : ''}.`);
    else if (r.rule === 'better') detail = T(`原来到 ${r.net} 经 ${r.old.hop}，距离 ${r.old.d}；经 ${sim.from} 只要 ${r.mod.d}，更短，替换。`, `Old route via ${r.old.hop} is ${r.old.d}; via ${sim.from} is ${r.mod.d}, shorter: replace.`);
    else if (r.rule === 'keep') detail = T(`原来到 ${r.net} 经 ${r.old.hop}，距离 ${r.old.d}；经 ${sim.from} 要 ${r.mod.d}，不更短，保持不变。`, `Old route via ${r.old.hop} is ${r.old.d}; via ${sim.from} is ${r.mod.d}, not shorter: keep.`);
    else detail = T(`${sim.from} 的消息里没有 ${r.net}，这一项保持不变。`, `${sim.from} did not mention ${r.net}: unchanged.`);
    list.push({
      title: T(`${r.net}：${RULE[r.rule].zh}`, `${r.net}: ${RULE[r.rule].en}`),
      desc: T(`→ 距离 ${d(r.neu.d).zh}，下一跳 ${r.neu.hop}`, `→ ${d(r.neu.d).en} via ${r.neu.hop}`),
      detail,
      ref: 'update',
      st: { mod: true, k: i },
      row: { color: r.changed ? (r.neu.d >= 16 ? 'rose' : 'green') : 'slate', what: r.net, result: `${r.neu.d >= 16 ? 16 : r.neu.d} · ${r.neu.hop}`, tone: r.changed ? 'ok' : 'info', info: RULE[r.rule] },
    });
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  const n = sim.rows.filter((r) => r.changed).length;
  lesson.outro = {
    title: T(`更新了 ${n} 项`, `${n} rows changed`),
    text: T('把某一项的下一跳改成别的路由器再走一遍，看「下一跳就是它」和「更短才替换」两条规则的区别。', 'Change a next hop and run it again to see the difference between “same next hop” and “replace only if shorter”.'),
    facts: [[T('更新后的表', 'New table'), sim.rows.map((r) => `${r.net} ${r.neu.d} ${r.neu.hop}`).join('；')]],
  };
  return lesson;
}

export const makeRip = () => parametric('rip', SPEC.presets[0].set, build);
