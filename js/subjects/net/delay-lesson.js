// 「时延：报文交换与分组交换」：上下两组泳道共用一条时间轴，每条泳道是一段链路，
// 上面整个报文一段一段地存储转发，下面各个分组像流水线一样同时占着不同的链路。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { switching } from './delay.js';

const ms = (s) => `${+(s * 1e3).toFixed(3)} ms`;
const num = (s) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);
const rate = (b) => (b >= 1e9 ? `${b / 1e9} Gb/s` : b >= 1e6 ? `${b / 1e6} Mb/s` : `${b / 1e3} kb/s`);
const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'orange', 'rose', 'slate'];

const SPEC = {
  presets: [
    { label: T('3 段链路，不计传播', '3 links, no propagation'), set: { x: 12000, p: 3000, h: 0, b: 1e6, d: '0', k: 3 } },
    { label: T('带首部和传播时延', 'With headers and propagation'), set: { x: 12000, p: 1000, h: 200, b: 1e6, d: '1', k: 2 } },
    { label: T('最后一个分组不满', 'A short last packet'), set: { x: 10000, p: 3000, h: 0, b: 1e6, d: '0', k: 2 } },
  ],
  groups: [
    {
      legend: T('数据', 'Data'),
      fields: [
        { name: 'x', label: T('报文长度（bit）', 'Message (bits)'), type: 'int', min: 1, max: 1e9 },
        { name: 'p', label: T('每个分组的数据（bit）', 'Data per packet (bits)'), type: 'int', min: 1, max: 1e9 },
        { name: 'h', label: T('每个分组的首部（bit）', 'Header per packet (bits)'), type: 'int', min: 0, max: 1e6 },
      ],
    },
    {
      legend: T('链路', 'Links'),
      fields: [
        { name: 'k', label: T('链路段数（经过 k − 1 个路由器）', 'Links (k − 1 routers)'), type: 'int', min: 1, max: 6 },
        { name: 'b', label: T('数据率', 'Data rate'), type: 'select', options: [[1e5, '100 kb/s'], [1e6, '1 Mb/s'], [1e7, '10 Mb/s'], [1e8, '100 Mb/s']] },
        { name: 'd', label: T('每段传播时延（ms）', 'Propagation per link (ms)'), type: 'text', parse: (s) => (Number.isNaN(num(s)) ? NaN : s) },
      ],
    },
  ],
  note: T(
    '只计发送时延（数据长度 ÷ 数据率）和传播时延（每段 d），不计排队和处理时延。结点采用存储转发：收完一个完整的报文（或分组）才往下一段发。一段链路同一时间只能发一个分组。',
    'Only transmission delay (length ÷ rate) and propagation delay (d per link) count; no queueing or processing. Nodes store and forward whole messages or packets; a link sends one packet at a time.',
  ),
};
const ERR = {
  x: T('报文长度要是正整数', 'Message length must be positive'),
  p: T('分组长度要是正整数', 'Packet size must be positive'),
  h: T('首部不能为负', 'Header cannot be negative'),
  b: T('数据率不对', 'Invalid rate'),
  d: T('传播时延不能为负', 'Propagation delay cannot be negative'),
  k: T('链路段数在 1～6 之间', 'Use 1–6 links'),
  n: T('分组太多了（最多 16 个），把分组调大一些', 'Too many packets (max 16)'),
};

// ───── 画板 ─────
const X0 = 200;
const W = 640;
const LH = 34;
const MY = 140;

function board(sim, st, z) {
  const items = [];
  const end = Math.max(sim.msgTotal, sim.pktTotal) * 1.04;
  const X = (t) => X0 + (t / end) * W;
  const PY = MY + sim.k * LH + 70;
  const lanes = (y0, title) => {
    let h = txt(X0 - 16, -14, title, 'bt-lab', 'end');
    for (let j = 0; j < sim.k; j++) h += txt(X0 - 16, j * LH + LH / 2 + 4, z ? `第 ${j + 1} 段` : `link ${j + 1}`, 'bt-cap', 'end') + line(X0, j * LH + LH - 2, X0 + W, j * LH + LH - 2, 'bl-lane');
    return { k: `lanes-${y0}`, x: 0, y: y0, html: h };
  };
  if (st.msg) {
    items.push(lanes(MY, z ? '报文交换' : 'Message'));
    sim.msg.forEach((s) => items.push({ k: `m${s.link}`, x: X(s.start), y: MY + s.link * LH + 4, from: [X(s.start) - 20, MY + s.link * LH + 4], html: cell(Math.max(3, X(s.end) - X(s.start)), LH - 10, X(s.end) - X(s.start) > 60 ? (z ? '整个报文' : 'message') : '', { tone: 'slate', size: 11 }) }));
    items.push({ k: 'mt', x: X(sim.msgTotal), y: MY - 26, html: `<line class="dl-end" x1="0" y1="0" x2="0" y2="${sim.k * LH + 28}"/>` + txt(4, 6, ms(sim.msgTotal), 'bt-acc', 'start') });
  }
  if (st.pk > 0) {
    items.push(lanes(PY, z ? '分组交换' : 'Packets'));
    sim.segs.filter((s) => s.pkt < st.pk).forEach((s) => items.push({ k: `p${s.pkt}-${s.link}`, x: X(s.start), y: PY + s.link * LH + 4, from: [X(s.start) - 20, PY + s.link * LH + 4], html: cell(Math.max(3, X(s.end) - X(s.start) - 1), LH - 10, X(s.end) - X(s.start) > 22 ? String(s.pkt + 1) : '', { tone: TONES[s.pkt % 8], size: 11 }) }));
    if (st.pk >= sim.n) items.push({ k: 'pt', x: X(sim.pktTotal), y: PY - 26, html: `<line class="dl-end" x1="0" y1="0" x2="0" y2="${sim.k * LH + 28}"/>` + txt(4, 6, ms(sim.pktTotal), 'bt-acc', 'start') });
  }
  // 时间轴
  const AY = PY + sim.k * LH + 26;
  let ax = line(X0, 0, X0 + W, 0, 'bl-axis') + txt(X0 - 16, 4, z ? '时间' : 'time', 'bt-cap', 'end');
  // 刻度取 1、2、5 × 10^n 毫秒
  const raw = (end * 1e3) / 8;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const stepT = ([1, 2, 5, 10].find((m) => m * mag >= raw) * mag) / 1e3;
  for (let t = 0; t <= end + 1e-12; t += stepT) ax += line(X(t), -4, X(t), 4, 'bl-axis') + txt(X(t), 18, String(+(t * 1e3).toFixed(3)), 'bt-idx');
  items.push({ k: 'axis', x: 0, y: AY, html: ax + txt(X0 + W + 8, 18, 'ms', 'bt-idx', 'start') });
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'delay',
      title: T('四种时延', 'The four delays'),
      blocks: [
        {
          table: {
            head: [T('时延', 'Delay'), T('是什么', 'What'), T('怎么算', 'How')],
            rows: [
              [T('发送时延（传输时延）', 'Transmission'), T('把数据的所有比特推上链路所用的时间', 'pushing every bit onto the link'), T('数据长度 ÷ 数据率', 'length ÷ rate')],
              [T('传播时延', 'Propagation'), T('电磁波在链路上走完这段距离的时间', 'signal travel time'), T('链路长度 ÷ 传播速率', 'distance ÷ speed')],
              [T('处理时延', 'Processing'), T('结点分析首部、查表等', 'header processing'), T('题目一般忽略', 'usually ignored')],
              [T('排队时延', 'Queueing'), T('在路由器队列里等待', 'waiting in queues'), T('取决于网络负载', 'depends on load')],
            ],
          },
        },
        { formula: T('总时延 = 发送时延 + 传播时延 + 处理时延 + 排队时延', 'total = transmission + propagation + processing + queueing') },
        { warn: T('发送时延和数据长度、数据率有关，与距离无关；传播时延和距离有关，与数据率无关。「提高数据率」只能缩短发送时延。', 'Transmission delay depends on size and rate, not distance; propagation depends on distance only.') },
      ],
    },
    {
      id: 'perf',
      title: T('其他性能指标', 'Other metrics'),
      blocks: [
        {
          list: [
            T('**带宽**：在计算机网络里指最高数据率，单位 b/s（注意 k、M、G 在速率里按 10³、10⁶、10⁹）。', '**Bandwidth**: the highest data rate, in b/s (k, M, G are powers of 10).'),
            T('**吞吐量**：单位时间内实际通过某个网络（或接口）的数据量，受带宽限制。', '**Throughput**: data actually delivered per unit time.'),
            T('**时延带宽积** = 传播时延 × 带宽：链路上「正在路上」的比特数。', '**Delay–bandwidth product**: bits in flight.'),
            T('**往返时间 RTT**：从发送方发出数据到收到确认的时间。', '**RTT**: from sending to receiving the acknowledgment.'),
            T('**利用率**：信道利用率越高，排队时延越大；利用率接近 100% 时时延急剧增大。', '**Utilization**: delay soars as it nears 100%.'),
          ],
        },
      ],
    },
    {
      id: 'switch',
      title: T('三种交换方式', 'Three kinds of switching'),
      blocks: [
        {
          table: {
            head: ['', T('电路交换', 'Circuit'), T('报文交换', 'Message'), T('分组交换', 'Packet')],
            rows: [
              [T('建立连接', 'Setup'), T('先建立一条专用的物理通路', 'a dedicated path first'), T('不需要', 'none'), T('不需要（数据报方式）', 'none (datagrams)')],
              [T('资源', 'Resources'), T('通话期间一直独占', 'reserved throughout'), T('逐段占用', 'link by link'), T('逐段占用，按需使用', 'link by link, on demand')],
              [T('转发单位', 'Unit'), T('—', '—'), T('整个报文', 'whole message'), T('分组', 'packet')],
              [T('特点', 'Traits'), T('时延小、实时，但线路利用率低', 'low delay, poor utilization'), T('结点要能存下整个报文，时延大', 'needs big buffers, slow'), T('流水线传输，时延小、灵活；有首部开销', 'pipelined, flexible, header overhead')],
            ],
          },
        },
      ],
    },
    {
      id: 'calc',
      title: T('报文交换和分组交换的时间', 'Timing message vs packet switching'),
      blocks: [
        { formula: T('报文交换：k × (x ÷ b) + k × d', 'message: k × (x ÷ b) + k × d') },
        { formula: T('分组交换（n 个分组一样大）：(n + k − 1) × (分组长 ÷ b) + k × d', 'packets (n equal): (n + k − 1) × (packet ÷ b) + k × d') },
        { p: T('理解分组交换的公式：源点把 n 个分组一个接一个发完要 n 个分组时间；最后一个分组还要再经过 k − 1 个路由器各转发一次，每次一个分组时间；再加上每段的传播时延。中间那些分组在不同的链路上同时传，所以比报文交换快。', 'The source needs n packet times; the last packet then needs k − 1 more forwards; add the propagation delays. Packets overlap on different links, which is why it is faster.') },
        { tip: T('分组越小，流水线越细、总时间越短；但每个分组都要带首部，分组太小时首部开销就占了大头。', 'Smaller packets pipeline better, but every one carries a header.') },
      ],
    },
    {
      id: 'vc',
      title: T('数据报和虚电路', 'Datagrams and virtual circuits'),
      blocks: [
        { p: T('分组交换的网络层可以提供两种服务：', 'A packet-switched network layer can offer two services:') },
        {
          table: {
            head: ['', T('数据报（无连接）', 'Datagram (connectionless)'), T('虚电路（面向连接）', 'Virtual circuit (connection-oriented)')],
            rows: [
              [T('先建连接吗', 'Setup first'), T('不用', 'no'), T('要，建立一条逻辑连接（不独占线路）', 'yes, a logical path (no reserved line)')],
              [T('分组带什么地址', 'Address in packets'), T('每个分组带完整的目的地址', 'the full destination'), T('只带短的虚电路号', 'a short circuit number')],
              [T('怎样走', 'Route'), T('每个分组独立选路，可能走不同的路', 'each packet routed independently'), T('都沿建立好的那条路走', 'all follow the circuit')],
              [T('到达顺序', 'Order'), T('可能乱序', 'may arrive out of order'), T('按发送顺序', 'in order')],
              [T('一个结点坏了', 'Node failure'), T('绕开它，影响小', 'route around it'), T('经过它的虚电路都断了', 'circuits through it break')],
              [T('可靠性由谁保证', 'Reliability'), T('主机（端到端）', 'the hosts'), T('网络（也可以交给主机）', 'the network (or hosts)')],
              [T('例子', 'Examples'), T('因特网的 IP', 'IP'), T('X.25、帧中继、ATM', 'X.25, frame relay, ATM')],
            ],
          },
        },
        { tip: T('虚电路和电路交换不同：虚电路只是「定好了路」，线路仍然是统计复用的，分组照样要存储转发。', 'A virtual circuit fixes the route but still shares links and stores-and-forwards.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('k 段链路、k − 1 个路由器；源点发完不算转发。', 'k links mean k − 1 routers.'),
            T('分组交换的公式里是 n + k − 1，别写成 n × k。', 'It is n + k − 1, not n × k.'),
            T('每个分组都要加首部，报文交换通常只算一份。', 'Every packet carries a header.'),
            T('数据率的 k = 10³，存储容量的 K = 2¹⁰，单位别混。', 'Rates use powers of 10, memory sizes powers of 2.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('计算', 'Steps') });

function build(params) {
  const sim = switching({ x: params.x, p: params.p, h: params.h, b: Number(params.b), d: num(params.d) / 1000, k: params.k });
  const lesson = {
    id: 'delay',
    kit,
    where: [['net', 'arch']],
    tag: T('时延', 'Delay'),
    name: T('时延：报文交换与分组交换', 'Delay: message vs packet switching'),
    full: T('发送 / 传播 / 处理 / 排队时延 · 带宽与吞吐量 · 电路 / 报文 / 分组交换 · 存储转发', 'Four delays · bandwidth and throughput · circuit / message / packet switching · store and forward'),
    title: sim.ok ? T(`${sim.k} 段链路 · ${sim.n} 个分组`, `${sim.k} links · ${sim.n} packets`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['slate', T('整个报文', 'Message')],
      ['blue', T('各个分组', 'Packets')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('同一个报文经过几段链路送到目的地：一次整个发（报文交换），还是切成小分组接力发（分组交换）？这节课把两种方式画在同一条时间轴上，每条泳道是一段链路，能直接看到分组交换为什么快——不同的分组同时在不同的链路上传。', 'Send a message over several links whole, or cut into packets? Both are drawn on one time axis with a lane per link, showing why packets win: different packets occupy different links at the same time.'),
      facts: [],
    },
    start: { nodes: [], frame: { rect: [20, 90, X0 + W + 90, sim.ok ? MY + sim.k * LH * 2 + 140 : 500] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const dTxt = sim.d ? T(`，每段传播 ${ms(sim.d)}`, `, ${ms(sim.d)} propagation per link`) : { zh: '', en: '' };
  const list = [
    {
      title: T(`发送时延：报文 ${ms(sim.tm)}，分组 ${ms(sim.tp)}`, `Transmission: message ${ms(sim.tm)}, packet ${ms(sim.tp)}`),
      desc: T(`数据长度 ÷ ${rate(sim.b)}`, `length ÷ ${rate(sim.b)}`),
      detail: { zh: `整个报文 ${sim.x} bit ÷ ${rate(sim.b)} = ${ms(sim.tm)}；切成 ${sim.n} 个分组，每个 ${sim.p}${sim.h ? ` + ${sim.h}（首部）` : ''} bit，发送一个要 ${ms(sim.tp)}${dTxt.zh}。`, en: `Message ${sim.x} bit ÷ ${rate(sim.b)} = ${ms(sim.tm)}; ${sim.n} packets of ${sim.p + sim.h} bit take ${ms(sim.tp)} each${dTxt.en}.` },
      ref: 'delay',
      st: {},
      row: { color: 'slate', what: T('发送时延', 'Transmission'), result: `${ms(sim.tm)} / ${ms(sim.tp)}`, tone: 'info' },
    },
    {
      title: T(`报文交换：${ms(sim.msgTotal)}`, `Message switching: ${ms(sim.msgTotal)}`),
      desc: T(`${sim.k} × ${ms(sim.tm)}${sim.d ? ` + ${sim.k} × ${ms(sim.d)}` : ''}`, `${sim.k} × ${ms(sim.tm)}${sim.d ? ` + ${sim.k} × ${ms(sim.d)}` : ''}`),
      detail: T(`每个路由器都要收完整个报文才往下一段发，所以 ${sim.k} 段链路上一段接一段，谁也没法提前：${sim.k} × ${ms(sim.tm)}${sim.d ? ` + ${sim.k} × ${ms(sim.d)}` : ''} = ${ms(sim.msgTotal)}。`, `Each router must receive the whole message first, so the links work strictly one after another: ${ms(sim.msgTotal)}.`),
      ref: 'calc',
      st: { msg: true },
      row: { color: 'slate', what: T('报文交换', 'Message'), result: ms(sim.msgTotal), tone: 'info' },
    },
    {
      title: T('第 1 个分组先走', 'The first packet leads'),
      desc: T(`它到达时 ${ms(sim.segs.find((s) => s.pkt === 0 && s.link === sim.k - 1).end + sim.d)}`, `arrives at ${ms(sim.segs.find((s) => s.pkt === 0 && s.link === sim.k - 1).end + sim.d)}`),
      detail: T(`第 1 个分组只要 ${ms(sim.tp)} 就发完，第 1 个路由器收完它马上转发，同时源点已经在发第 2 个分组了——这就是流水线。`, `The first packet is out after ${ms(sim.tp)}; the first router forwards it while the source already sends packet 2: a pipeline.`),
      ref: 'calc',
      st: { msg: true, pk: 1 },
      row: { color: 'blue', what: T('第 1 个分组', 'Packet 1'), result: ms(sim.segs.find((s) => s.pkt === 0 && s.link === sim.k - 1).end + sim.d), tone: 'info' },
    },
    {
      title: T(`分组交换：${ms(sim.pktTotal)}`, `Packet switching: ${ms(sim.pktTotal)}`),
      desc: sim.equal ? T(`(${sim.n} + ${sim.k} − 1) × ${ms(sim.tp)}${sim.d ? ` + ${sim.k} × ${ms(sim.d)}` : ''}`, `(${sim.n} + ${sim.k} − 1) × ${ms(sim.tp)}${sim.d ? ` + ${sim.k}d` : ''}`) : T('最后一个分组不满，按时间线推算', 'Short last packet: traced on the timeline'),
      detail: sim.equal
        ? T(`源点把 ${sim.n} 个分组发完要 ${sim.n} × ${ms(sim.tp)}；最后一个分组还要被 ${sim.k - 1} 个路由器各转发一次；再加 ${sim.k} 段传播时延：(${sim.n} + ${sim.k} − 1) × ${ms(sim.tp)}${sim.d ? ` + ${sim.k} × ${ms(sim.d)}` : ''} = ${ms(sim.pktTotal)}。`, `The source needs ${sim.n} packet times, the last packet ${sim.k - 1} more forwards, plus propagation: ${ms(sim.pktTotal)}.`)
        : T(`分组大小是 ${sim.sizes.join('、')} bit，不完全一样，不能直接套公式。按时间线推算：每段链路上一个分组要等前一个分组发完才能发，最后一个分组在 ${ms(sim.pktTotal)} 到达目的地。`, `Packet sizes ${sim.sizes.join(', ')} differ, so the timeline is traced packet by packet: the last one arrives at ${ms(sim.pktTotal)}.`),
      ref: 'calc',
      st: { msg: true, pk: sim.n },
      row: { color: 'blue', what: T('分组交换', 'Packets'), result: ms(sim.pktTotal), tone: 'ok' },
    },
  ];
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  const faster = sim.pktTotal < sim.msgTotal;
  lesson.outro = {
    title: faster ? T(`分组交换快 ${ms(sim.msgTotal - sim.pktTotal)}`, `Packets save ${ms(sim.msgTotal - sim.pktTotal)}`) : T('这次报文交换不慢', 'Message switching holds up'),
    text: T('把分组调小、首部调大，看什么时候首部开销会把分组交换的优势吃掉；把链路段数调成 1，看两种方式是不是就差不多了。', 'Shrink the packets and grow the header to see the overhead win; set one link and the two converge.'),
    facts: [[T('报文交换', 'Message'), ms(sim.msgTotal)], [T('分组交换', 'Packets'), ms(sim.pktTotal)]],
  };
  return lesson;
}

export const makeDelay = () => parametric('delay', SPEC.presets[0].set, build);
