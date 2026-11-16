// 总线和输入/输出系统的三节课：总线带宽与仲裁、中断屏蔽与多重中断、DMA 的三种传送方式。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from './kit.js';
import { busArb, dma, interrupts, parseArr } from './bus.js';

const W = [['co', 'bus']];
const r2 = (x) => +x.toFixed(2);

// ═════════════════════════ 总线与仲裁 ═════════════════════════

const BA_PRINCIPLE = {
  sections: [
    {
      id: 'basic',
      title: T('总线是什么', 'What a bus is'),
      blocks: [
        { p: T('总线是多个部件分时共享的一组信号线。同一时刻只能有一个部件发送，但可以有多个部件接收。', 'A bus is a set of shared lines: one sender at a time, many receivers.') },
        {
          table: {
            head: [T('分类', 'Kind'), T('例子', 'Examples')],
            rows: [
              [T('片内总线', 'On-chip'), T('CPU 内部寄存器、ALU 之间', 'between registers and ALU')],
              [T('系统总线', 'System'), T('数据总线、地址总线、控制总线', 'data, address and control buses')],
              [T('通信总线（外部总线）', 'Communication'), 'USB、SATA、PCIe'],
            ],
          },
        },
        { p: T('按结构分：单总线（CPU、主存、I/O 都挂在一条总线上，简单但会争用）、双总线（主存总线 + I/O 总线，用通道连接）、三总线（主存总线、I/O 总线、DMA 总线）。', 'Single, dual and triple bus structures.') },
      ],
    },
    {
      id: 'perf',
      title: T('总线带宽', 'Bandwidth'),
      blocks: [
        { formula: T('带宽 = 总线宽度（字节）× 总线频率 ÷ 每次传送占用的时钟周期数', 'bandwidth = width (bytes) × frequency ÷ cycles per transfer') },
        { list: [
          T('**总线宽度**：数据线的根数；**总线周期**：一次总线操作的时间，可能包含多个时钟周期。', '**Width**: data lines; **bus cycle**: one transaction, possibly several clocks.'),
          T('**突发（猝发）传送**：送一次地址，连续传多个数据，提高带宽。', '**Burst**: one address, several data words.'),
          T('**复用**：地址和数据分时使用同一组线，省线但慢。', '**Multiplexing** shares lines between address and data.'),
        ] },
      ],
    },
    {
      id: 'arb',
      title: T('集中式仲裁', 'Centralized arbitration'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Method'), T('做法', 'How'), T('控制线', 'Lines'), T('特点', 'Trait')],
            rows: [
              [T('链式查询', 'Daisy chain'), T('总线允许信号 BG 从仲裁器出发，一个个往下传，遇到第一个请求的设备就停下', 'BG passes device to device, stops at the first requester'), T('3 根（BS、BR、BG）', '3 (BS, BR, BG)'), T('离仲裁器越近优先级越高；对电路故障敏感', 'position = priority; fragile')],
              [T('计数器查询', 'Counter polling'), T('仲裁器用计数器依次发出设备地址，地址与请求设备一致就停', 'a counter polls device addresses'), T('⌈log₂n⌉ + 2 根', '⌈log₂n⌉ + 2'), T('从 0 开始计数是固定优先级；从上次停下的下一个开始是循环优先级', 'reset to 0: fixed; continue: round-robin')],
              [T('独立请求', 'Independent requests'), T('每个设备有自己的 BR 和 BG', 'each device has its own BR and BG'), T('2n + 1 根', '2n + 1'), T('最快，优先级可编程，线多', 'fastest, most lines')],
            ],
          },
        },
      ],
    },
    {
      id: 'timing',
      title: T('总线定时', 'Bus timing'),
      blocks: [
        { list: [
          T('**同步**：统一时钟，速度快，适合速度相近的部件。', '**Synchronous**: one clock.'),
          T('**异步**：用「请求—回答」握手，分不互锁、半互锁、全互锁三种。', '**Asynchronous**: request/acknowledge handshakes — non-, half- and fully interlocked.'),
          T('**半同步**：同步的基础上加一根「等待」信号。', '**Semi-synchronous**: a WAIT line.'),
          T('**分离式**：一个总线周期拆成两个子周期，中间释放总线，让别的部件用。', '**Split transaction**: the bus is released between request and reply.'),
        ] },
      ],
    },
    pit([
      T('带宽要按「每次传送几个时钟周期」除下去。', 'Divide by the cycles per transfer.'),
      T('MB/s 里的 M 按 10⁶ 算（频率的 MHz）。', 'Here MB/s uses 10⁶ (from MHz).'),
    ]),
  ],
};
const BA_SPEC = {
  presets: [
    { label: T('32 位、100 MHz、2 个时钟一次', '32 bits, 100 MHz, 2 clocks'), set: { width: 32, freq: 100, cycles: 2, n: 8, req: [5, 2, 6], last: 2 } },
    { label: T('64 位、66 MHz、每个时钟一次', '64 bits, 66 MHz, 1 clock'), set: { width: 64, freq: 66, cycles: 1, n: 6, req: [4, 1], last: 4 } },
  ],
  groups: [
    { legend: T('总线', 'Bus'), fields: [
      { name: 'width', label: T('数据线宽度（位）', 'Width (bits)'), type: 'select', options: [8, 16, 32, 64].map((v) => [v, String(v)]) },
      { name: 'freq', label: T('总线频率（MHz）', 'Frequency (MHz)'), type: 'int', min: 1, max: 2000 },
      { name: 'cycles', label: T('每次传送几个时钟', 'Clocks per transfer'), type: 'int', min: 1, max: 16 },
    ] },
    { legend: T('仲裁', 'Arbitration'), fields: [
      { name: 'n', label: T('设备数', 'Devices'), type: 'int', min: 2, max: 12 },
      { name: 'req', label: T('正在请求的设备号', 'Requesting devices'), type: 'list', min: 0, max: 11, maxLen: 12, wide: true },
      { name: 'last', label: T('上次计数停在几号（−1 表示没有）', 'Last counter stop (−1 none)'), type: 'int', min: -1, max: 11 },
    ] },
  ],
  note: T('设备编号 0 离仲裁器最近；链式查询和独立请求都按编号小优先。', 'Device 0 is nearest the arbiter; lower numbers win.'),
};
const BA_ERR = { width: T('宽度是 8、16、32、64', 'Width: 8/16/32/64'), freq: T('频率和时钟数要大于 0', 'Positive frequency and clocks'), n: T('设备 2～12 个', '2–12 devices'), req: T('请求的设备号要在 0～n−1', 'Device numbers 0..n−1'), last: T('上次停的位置要小于 n', 'Last stop must be < n') };
function baBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  if (k < 1) {
    let h = '';
    const parts = [[`${sim.width / 8} B`, z ? '宽度' : 'width'], [`× ${sim.freq} MHz`, z ? '频率' : 'freq'], [`÷ ${sim.cycles}`, z ? '时钟/次' : 'clocks'], [`= ${r2(sim.bw)} MB/s`, z ? '带宽' : 'bandwidth']];
    parts.forEach(([v, lab], i) => (h += `<g transform="translate(${i * 130} 0)">${cell(120, 44, v, { tone: i === 3 ? 'green' : 'blue', size: 15, cls: i === 3 && k === 0 ? 'hot' : '' })}${txt(60, 64, lab, 'bt-cap')}</g>`));
    items.push({ k: 'bw', x: 200, y: 200, html: h });
    return items;
  }
  const DX = 210;
  const DW = Math.min(62, 560 / sim.n);
  const Y = 210;
  const dx = (i) => DX + i * DW;
  let arb = cell(100, 46, z ? '仲裁器' : 'arbiter', { tone: 'slate', size: 13 });
  items.push({ k: 'arb', x: 70, y: Y, html: arb });
  // 设备
  let dv = '';
  for (let i = 0; i < sim.n; i++) {
    const rq = sim.req.includes(i);
    const win = (k === 2 && i === sim.chain) || (k === 3 && i === sim.fromZero) || (k === 4 && i === sim.after) || (k === 5 && i === sim.chain);
    dv += `<g transform="translate(${i * DW} 0)">${cell(DW - 6, 46, String(i), { tone: rq ? 'amber' : '', size: 14, cls: win ? 'hot' : rq ? '' : 'dim' })}${rq ? txt((DW - 6) / 2, 62, 'BR', 'bt-idx') : ''}</g>`;
  }
  items.push({ k: 'devs', x: DX, y: Y, html: dv });
  items.push({ k: 'busl', x: 0, y: 0, html: `<rect class="dp-bus" x="70" y="${Y + 102}" width="${DX + sim.n * DW - 70}" height="10" rx="5"/>` + txt(70, Y + 134, z ? '系统总线' : 'system bus', 'bt-cap', 'start') });
  let h = '';
  if (k === 2) {
    h += arrow(170, Y - 20, dx(0) + (DW - 6) / 2, Y - 20, 'acc');
    for (let i = 0; i < sim.chain; i++) h += arrow(dx(i) + (DW - 6) / 2, Y - 20, dx(i + 1) + (DW - 6) / 2, Y - 20, 'acc');
    h += arrow(dx(sim.chain) + (DW - 6) / 2, Y - 20, dx(sim.chain) + (DW - 6) / 2, Y - 2, 'acc') + txt(120, Y - 28, 'BG', 'bt-lab');
  }
  if (k === 3 || k === 4) {
    const start = k === 3 ? 0 : (sim.last + 1) % sim.n;
    const stop = k === 3 ? sim.fromZero : sim.after;
    const seq = [];
    for (let i = start; ; i = (i + 1) % sim.n) {
      seq.push(i);
      if (i === stop) break;
    }
    seq.forEach((i, j) => (h += txt(dx(i) + (DW - 6) / 2, Y - 14, String(j + 1), i === stop ? 'bt-now' : 'bt-idx')));
    h += txt(70, Y - 36, z ? `计数器从 ${start} 开始：${seq.join(' → ')}` : `counter from ${start}: ${seq.join(' → ')}`, 'bt-lab', 'start');
  }
  if (k === 5) {
    for (const i of sim.req) h += `<path d="M${dx(i) + (DW - 6) / 2} ${Y} C ${dx(i) + (DW - 6) / 2} ${Y - 60}, 160 ${Y - 60}, 150 ${Y - 4}" fill="none" stroke="var(--ink-3)" stroke-width="1.4" stroke-dasharray="4 3"/>`;
    const wx = dx(sim.chain) + (DW - 6) / 2 + 12;
    h += `<path d="M120 ${Y + 46} L120 ${Y + 76} L${wx} ${Y + 76} L${wx} ${Y + 58}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>` + arrow(wx, Y + 66, wx, Y + 48, 'acc') + txt(130, Y + 70, `BG${sim.chain}`, 'bt-lab', 'start');
  }
  if (k >= 6) {
    const rows = [
      [z ? '链式查询' : 'Daisy chain', String(sim.lines.chain), String(sim.chain)],
      [z ? '计数器查询' : 'Counter', String(sim.lines.counter), `${sim.fromZero} / ${sim.after}`],
      [z ? '独立请求' : 'Independent', String(sim.lines.independent), String(sim.chain)],
    ];
    items.push({ k: 'tbl', x: 210, y: Y + 150, html: gridTable([z ? '方式' : 'method', z ? '控制线' : 'lines', z ? '得到总线' : 'winner'], rows, { cw: [110, 80, 110] }) });
  }
  items.push({ k: `h${k}`, x: 0, y: 0, html: h });
  return items;
}
function buildBa(p, kit, ERR) {
  const sim = busArb({ ...p, width: +p.width });
  const lesson = shell('bus-arb', kit, ERR, sim, {
    where: W,
    tag: T('总线', 'Bus'),
    name: T('总线带宽与仲裁', 'Bus bandwidth and arbitration'),
    full: T('总线分类与结构 · 带宽 · 链式查询 · 计数器查询 · 独立请求 · 总线定时', 'Bus kinds · bandwidth · daisy chain · counter polling · independent requests · timing'),
    title: T(`${p.width} 位 ${p.freq} MHz`, `${p.width}-bit ${p.freq} MHz`),
    legend: [['amber', T('正在请求总线的设备', 'Requesting')]],
    principle: BA_PRINCIPLE,
    desc: T('总线一次只能给一个设备用。这节课先算出总线带宽，再让几个设备同时请求总线，看链式查询、计数器查询、独立请求三种集中式仲裁分别把总线给谁，各要几根控制线。', 'Compute the bandwidth, then let several devices request the bus and see who wins under each arbitration scheme.'),
    rect: [40, 120, 210 + 12 * 62 + 20, 470],
  });
  if (!sim.ok) return lesson;
  const list = [
    { title: T(`带宽 ${r2(sim.bw)} MB/s`, `Bandwidth ${r2(sim.bw)} MB/s`), desc: `${sim.width / 8} B × ${sim.freq} MHz ÷ ${sim.cycles}`, detail: T(`一次传 ${sim.width} 位 = ${sim.width / 8} 字节，每 ${sim.cycles} 个时钟传一次，频率 ${sim.freq} MHz：${sim.width / 8} × ${sim.freq} ÷ ${sim.cycles} = ${r2(sim.bw)} MB/s。`, `${sim.width / 8} × ${sim.freq} / ${sim.cycles} = ${r2(sim.bw)} MB/s.`), ref: 'perf', st: { k: 0 }, row: { color: 'green', what: T('带宽', 'Bandwidth'), result: `${r2(sim.bw)}`, tone: 'info' } },
    { title: T(`${sim.req.length} 个设备请求总线`, `${sim.req.length} devices request`), desc: sim.req.join('、'), detail: T(`设备 ${sim.req.join('、')} 同时发出总线请求 BR。仲裁器要从中选一个。`, `Devices ${sim.req.join(', ')} raise BR.`), ref: 'arb', st: { k: 1 }, row: { color: 'amber', what: 'BR', result: sim.req.join(','), tone: 'info' } },
    { title: T(`链式查询：给 ${sim.chain} 号`, `Daisy chain: device ${sim.chain}`), desc: T('BG 一个个往下传', 'BG ripples down'), detail: T(`仲裁器发出 BG，从 0 号往后传，${sim.chain === 0 ? '0 号本身就在请求' : `0～${sim.chain - 1} 号没有请求就往下传`}，到 ${sim.chain} 号停下。离仲裁器近的优先。`, `BG stops at device ${sim.chain}.`), ref: 'arb', st: { k: 2 }, row: { color: 'blue', what: T('链式', 'Chain'), result: String(sim.chain), tone: 'info' } },
    { title: T(`计数器从 0 开始：给 ${sim.fromZero} 号`, `Counter from 0: ${sim.fromZero}`), desc: T('固定优先级', 'Fixed priority'), detail: T(`每次都从 0 开始计数，和链式查询的结果一样，编号小的优先。`, `Starting at 0 every time gives fixed priority.`), ref: 'arb', st: { k: 3 }, row: { color: 'violet', what: T('计数 0', 'Count 0'), result: String(sim.fromZero), tone: 'info' } },
    { title: T(`从上次的下一个开始：给 ${sim.after} 号`, `Round-robin: ${sim.after}`), desc: T(`上次停在 ${sim.last}`, `Last stop ${sim.last}`), detail: T(`计数器从 ${(sim.last + 1) % sim.n} 开始往后数，第一个请求的是 ${sim.after} 号。这样每个设备的机会均等。`, `Counting from ${(sim.last + 1) % sim.n}, the first requester is ${sim.after}.`), ref: 'arb', st: { k: 4 }, row: { color: 'teal', what: T('循环', 'Round'), result: String(sim.after), tone: 'info' } },
    { title: T(`独立请求：给 ${sim.chain} 号`, `Independent: device ${sim.chain}`), desc: T('仲裁器同时看到所有请求', 'All requests seen at once'), detail: T(`每个设备有自己的 BR、BG 线，仲裁器内部的排队电路一次就选出优先级最高的 ${sim.chain} 号，回送 BG${sim.chain}。`, `The arbiter sees every BR and grants BG${sim.chain}.`), ref: 'arb', st: { k: 5 }, row: { color: 'rose', what: T('独立', 'Indep.'), result: String(sim.chain), tone: 'info' } },
    { title: T('控制线比一比', 'Line counts'), desc: `3 / ${sim.lines.counter} / ${sim.lines.independent}`, detail: T(`链式查询 3 根；计数器查询 ⌈log₂${sim.n}⌉ + 2 = ${sim.lines.counter} 根；独立请求 2 × ${sim.n} + 1 = ${sim.lines.independent} 根。`, `3, ${sim.lines.counter} and ${sim.lines.independent} lines.`), ref: 'arb', st: { k: 6 }, row: { color: 'green', what: T('控制线', 'Lines'), result: `3/${sim.lines.counter}/${sim.lines.independent}`, tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => baBoard(sim, st, z), T(`${r2(sim.bw)} MB/s`, `${r2(sim.bw)} MB/s`), T('改一改「上次停在几号」，看循环优先级的结果怎么变。', 'Change the last stop to see round-robin move.'));
}
export const makeBusArb = make('bus-arb', BA_SPEC, BA_ERR, buildBa);

// ═════════════════════════ 中断屏蔽与多重中断 ═════════════════════════

const IM_PRINCIPLE = {
  sections: [
    {
      id: 'resp',
      title: T('中断响应', 'Responding to an interrupt'),
      blocks: [
        { p: T('CPU 响应中断要同时满足三个条件：有中断请求、CPU 允许中断（开中断）、一条指令执行完了。响应时由硬件执行「中断隐指令」：', 'Three conditions: a request, interrupts enabled, and the end of an instruction. Hardware then runs the implicit interrupt instruction:') },
        { steps: [
          T('关中断', 'Disable interrupts'),
          T('保存断点（PC、PSW）', 'Save PC and PSW'),
          T('找到中断服务程序的入口（向量中断：由中断向量表给出）', 'Locate the handler (vector table)'),
        ] },
        { p: T('多个请求同时到达时，硬件按**响应优先级**（排队电路决定）选一个先响应。', 'Simultaneous requests are ordered by the hardware **response priority**.') },
      ],
    },
    {
      id: 'isr',
      title: T('中断服务程序与多重中断', 'Handlers and nesting'),
      blocks: [
        { steps: [
          T('保护现场（保存要用到的寄存器），设置新的屏蔽字', 'Save registers; load the new mask'),
          T('开中断：允许更高的中断打断自己（多重中断才有这一步）', 'Enable interrupts (for nesting)'),
          T('执行中断服务', 'Service the device'),
          T('关中断，恢复现场和原来的屏蔽字', 'Disable, restore registers and mask'),
          T('开中断，中断返回', 'Enable and return'),
        ] },
        { tip: T('单重中断在服务过程中不开中断，任何新请求都要等它做完。', 'Without nesting, interrupts stay disabled during service.') },
      ],
    },
    {
      id: 'mask',
      title: T('屏蔽字', 'Mask words'),
      blocks: [
        { p: T('每个中断服务程序有自己的屏蔽字，每一位对应一个中断源，**1 表示屏蔽**。设备 X 的屏蔽字把所有处理优先级不高于 X 的设备（包括 X 自己）都置 1。这样就能用软件把「处理优先级」改得和硬件的「响应优先级」不一样。', 'Each handler has a mask; **1 masks** the device. X’s mask masks every device whose handling priority is not above X’s, itself included. Software thus sets a handling order different from the hardware response order.') },
        { warn: T('响应优先级决定「同时到达时先响应谁」；处理优先级决定「谁能打断谁」。', 'Response priority picks among simultaneous requests; handling priority decides who may interrupt whom.') },
      ],
    },
    pit([
      T('屏蔽字里自己那一位也是 1。', 'A handler masks itself too.'),
      T('被屏蔽的请求不会丢，等屏蔽解除后还会被响应。', 'Masked requests wait, they are not lost.'),
    ]),
  ],
};
const IM_SPEC = {
  presets: [
    { label: T('响应 A>B>C>D，处理 A>D>C>B', 'Response A>B>C>D, handling A>D>C>B'), set: { devs: 'A B C D', handle: 'A D C B', arrivals: 'B0 D1 A2', dur: 3 } },
    { label: T('同时到达', 'Simultaneous'), set: { devs: 'A B C', handle: 'C B A', arrivals: 'A0 B0 C0', dur: 2 } },
    { label: T('处理和响应一样', 'Same order'), set: { devs: 'A B C D', handle: 'A B C D', arrivals: 'D0 C1 B2 A3', dur: 3 } },
  ],
  groups: [{ legend: T('中断源', 'Sources'), fields: [
    { name: 'devs', label: T('设备，按响应优先级从高到低', 'Devices by response priority'), type: 'text', wide: true, parse: (s) => s },
    { name: 'handle', label: T('处理优先级从高到低', 'Handling priority'), type: 'text', wide: true, parse: (s) => s },
    { name: 'arrivals', label: T('请求：B0 表示 B 在时刻 0 请求', 'Requests: B0 = B at time 0'), type: 'text', wide: true, parse: (s) => (parseArr(s) ? s : NaN) },
    { name: 'dur', label: T('每个中断服务的时间', 'Service time'), type: 'int', min: 1, max: 10 },
  ] }],
  note: T('设备用单个字母。忽略中断响应本身和保护现场的时间；有未被屏蔽的请求就立刻响应（嵌套）。', 'Single-letter devices. Response and context-saving time ignored.'),
};
const IM_ERR = { devs: T('设备 2～6 个，用不重复的单个字母', '2–6 distinct letters'), handle: T('处理优先级要把同样的设备排一遍', 'Handling order must list the same devices'), arr: T('请求写成「字母+时刻」，最多 8 个', 'Requests as letter+time, at most 8'), dur: T('服务时间 1～10', 'Service time 1–10') };
const DT = ['blue', 'amber', 'violet', 'teal', 'rose', 'green'];
function imBoard(sim, st, z) {
  const items = [];
  const now = st?.t ?? -1;
  const showAll = st?.all;
  // 屏蔽字表
  const rows = sim.D.map((x) => [z ? `${x} 的程序` : `${x}’s ISR`, ...sim.mask[x].map((b) => ({ t: String(b), cls: b ? 'hot' : 'dim' }))]);
  items.push({ k: 'mask', x: 70, y: 120, html: txt(0, -12, z ? '屏蔽字（1 = 屏蔽）' : 'Masks (1 = masked)', 'bt-cap', 'start') + gridTable(['', ...sim.D], rows, { cw: [80, ...sim.D.map(() => 34)] }) });
  if (now < 0) return items;
  // CPU 轨迹：纵向按处理优先级分层，主程序在最下面
  const lanes = [...sim.H, null];
  const LY = (who) => 120 + lanes.indexOf(who) * 34;
  const X0 = 360;
  const sc = Math.min(40, 480 / sim.end);
  let h = '';
  lanes.forEach((who) => (h += txt(-12, LY(who) - 120 + 20, who ?? (z ? '主程序' : 'main'), 'bt-lab', 'end') + line(0, LY(who) - 120 + 30, sim.end * sc, LY(who) - 120 + 30, 'bl-lane')));
  for (let t = 0; t <= sim.end; t++) h += txt(t * sc, lanes.length * 34 + 16, String(t), 'bt-idx');
  items.push({ k: 'lanes', x: X0, y: 120, html: h });
  let tr = '';
  let prev = null;
  for (const s of sim.segs) {
    if (!showAll && s.start >= now) break;
    const end = showAll ? s.end : Math.min(s.end, now);
    const y = LY(s.who) + 4;
    tr += `<g transform="translate(${X0 + s.start * sc} ${y})">${cell((end - s.start) * sc - 1, 22, (end - s.start) * sc > 18 ? s.who ?? '' : '', { tone: s.who ? DT[sim.D.indexOf(s.who) % 6] : 'slate', size: 11 })}</g>`;
    if (prev) tr += line(X0 + s.start * sc, LY(prev.who) + 15, X0 + s.start * sc, y + 11, 'im-jump');
    prev = s;
  }
  for (const a of sim.arrivals) if (showAll || a.t <= st.cur) tr += txt(X0 + a.t * sc, 112, `${a.d}↓`, 'bt-now');
  items.push({ k: 'trace', x: 0, y: 0, html: tr });
  return items;
}
function mergeEvents(ev) {
  const out = [];
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    const n = ev[i + 1];
    if (e.kind === 'req' && n && n.d === e.d && n.t === e.t && (n.kind === 'resp' || n.kind === 'nest')) {
      out.push({ ...n, direct: true });
      i++;
    } else out.push(e);
  }
  return out;
}
function buildIm(p, kit, ERR) {
  const sim = interrupts(p);
  const lesson = shell('int-mask', kit, ERR, sim, {
    where: W,
    tag: T('屏蔽', 'Mask'),
    name: T('中断屏蔽与多重中断', 'Interrupt masks and nesting'),
    full: T('中断响应条件 · 中断隐指令 · 中断服务程序 · 屏蔽字 · 响应优先级与处理优先级 · CPU 运行轨迹', 'Response conditions · implicit instruction · handlers · masks · response vs handling priority · CPU trace'),
    title: T(`处理顺序 ${String(p.handle).toUpperCase().split(/\s+/).join('>')}`, `Handling ${String(p.handle).toUpperCase().split(/\s+/).join('>')}`),
    legend: [['slate', T('主程序', 'Main program')]],
    principle: IM_PRINCIPLE,
    desc: T('硬件决定同时到达的请求先响应谁，软件用屏蔽字决定谁能打断谁。这节课先由处理优先级写出每个中断服务程序的屏蔽字，再让请求按时刻到达，一步步画出 CPU 在主程序和各个中断服务程序之间的运行轨迹。', 'Masks derived from the handling order decide who may interrupt whom. Requests arrive over time and the CPU trace is drawn step by step.'),
    rect: [20, 90, 360 + 500, 120 + 7 * 34 + 40],
  });
  if (!sim.ok) return lesson;
  const ev = mergeEvents(sim.events);
  const list = [
    { title: T('写出屏蔽字', 'Mask words'), desc: T(`处理优先级 ${sim.H.join(' > ')}`, `Handling ${sim.H.join(' > ')}`), detail: T(`每个设备的屏蔽字，把处理优先级不高于它的设备都置 1：${sim.D.map((x) => `${x}：${sim.mask[x].join('')}`).join('；')}。`, sim.D.map((x) => `${x}: ${sim.mask[x].join('')}`).join('; ')), ref: 'mask', st: { t: -1 }, row: { color: 'slate', what: T('屏蔽字', 'Masks'), result: sim.D.map((x) => sim.mask[x].join('')).join(' '), tone: 'info' } },
  ];
  ev.forEach((e, i) => {
    const last = i === ev.length - 1;
    const zh = {
      req: `${e.d} 在时刻 ${e.t} 发出请求，但被当前程序屏蔽了，只能等`,
      resp: `${e.direct ? `${e.d} 在时刻 ${e.t} 请求，` : ''}CPU 在运行主程序，响应 ${e.d}`,
      nest: `${e.direct ? `${e.d} 在时刻 ${e.t} 请求，` : ''}${e.over} 的屏蔽字里 ${e.d} 那一位是 0，${e.d} 打断 ${e.over}（嵌套）`,
      done: `${e.d} 服务完，时刻 ${e.t} 返回${(() => { const nx = sim.segs.find((s) => s.start === e.t); return nx ? (nx.who ? `到 ${nx.who}` : '主程序') : ''; })()}`,
    }[e.kind];
    const back = (() => { const nx = sim.segs.find((x) => x.start === e.t); return nx ? (nx.who ? ` to ${nx.who}` : ' to the main program') : ''; })();
    const en = {
      req: `${e.d} requests at ${e.t} but is masked by the running program, so it waits`,
      resp: `${e.direct ? `${e.d} requests at ${e.t}; ` : ''}the CPU is in the main program and serves ${e.d}`,
      nest: `${e.direct ? `${e.d} requests at ${e.t}; ` : ''}bit ${e.d} of ${e.over}’s mask is 0, so ${e.d} preempts ${e.over}`,
      done: `${e.d} finishes and returns at ${e.t}${back}`,
    }[e.kind];
    list.push({
      title: T({ req: `${e.d} 请求，被屏蔽`, resp: `响应 ${e.d}`, nest: `${e.d} 打断 ${e.over}`, done: `${e.d} 返回` }[e.kind], { req: `${e.d} masked`, resp: `Serve ${e.d}`, nest: `${e.d} preempts ${e.over}`, done: `${e.d} returns` }[e.kind]),
      desc: T(`时刻 ${e.t}`, `t = ${e.t}`),
      detail: T(zh + '。', en + '.'),
      ref: e.kind === 'nest' || e.kind === 'req' ? 'mask' : e.kind === 'resp' ? 'resp' : 'isr',
      st: last ? { t: sim.end, all: true, cur: e.t } : { t: ev[i + 1].t, cur: e.t },
      row: { color: e.kind === 'req' ? 'rose' : e.kind === 'done' ? 'green' : 'blue', what: `${e.d}@${e.t}`, result: T({ req: '等待', resp: '响应', nest: '嵌套', done: '返回' }[e.kind], e.kind), tone: e.kind === 'req' ? 'warn' : 'info' },
    });
  });
  const order = sim.segs.filter((s) => s.who).map((s) => s.who);
  const finishOrder = sim.events.filter((e) => e.kind === 'done').map((e) => e.d);
  return finish(lesson, list, (st, z) => imBoard(sim, st, z), T(`完成顺序 ${finishOrder.join(' → ')}`, `Finished ${finishOrder.join(' → ')}`), T(`CPU 依次运行 ${order.join(' → ')}，在时刻 ${sim.end} 回到主程序。`, `Trace ${order.join(' → ')}; back to main at ${sim.end}.`));
}
export const makeIntMask = make('int-mask', IM_SPEC, IM_ERR, buildIm);

// ═════════════════════════ DMA ═════════════════════════

const DMA_PRINCIPLE = {
  sections: [
    {
      id: 'io',
      title: T('I/O 方式', 'I/O methods'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Method'), T('数据怎么走', 'Data path'), T('CPU 的负担', 'CPU load')],
            rows: [
              [T('程序查询', 'Polling'), T('CPU 不断查询设备状态，由 CPU 传送', 'CPU polls and moves data'), T('一直在等，串行', 'busy-waits')],
              [T('程序中断', 'Interrupt-driven'), T('设备准备好后发中断，CPU 在中断服务程序里传送一个字', 'device interrupts; CPU moves each word'), T('每个字都要中断一次', 'one interrupt per word')],
              [T('DMA', 'DMA'), T('DMA 控制器直接在设备和主存之间传送一整块', 'the controller moves a block directly'), T('只在开始和结束时介入', 'only at start and end')],
              [T('通道', 'Channel'), T('专门的 I/O 处理器执行通道程序', 'an I/O processor runs channel programs'), T('更少', 'even less')],
            ],
          },
        },
        { p: T('I/O 接口的作用：地址译码和设备选择、数据缓冲、信号格式转换、传送控制命令和状态。I/O 端口有**统一编址**（和主存共用地址空间，用访存指令）和**独立编址**（专门的 I/O 指令）两种。', 'An I/O interface decodes addresses, buffers data and converts signals. Ports are memory-mapped or use separate I/O instructions.') },
      ],
    },
    {
      id: 'flow',
      title: T('DMA 的过程', 'A DMA transfer'),
      blocks: [
        { steps: [
          T('预处理：CPU 设置主存起始地址、传送字数、方向，启动设备', 'Set up: CPU loads address, count and direction'),
          T('数据传送：每准备好一个字，DMA 控制器申请总线，直接写入主存，地址 + 1，计数 − 1', 'Transfer: each word goes straight to memory'),
          T('后处理：计数到 0，DMA 控制器发中断，CPU 做收尾', 'Finish: an interrupt tells the CPU'),
        ] },
        { p: T('DMA 控制器里有主存地址计数器、传送长度计数器、数据缓冲寄存器、DMA 请求触发器、控制/状态逻辑和中断机构。', 'The controller holds an address counter, length counter, data buffer, request flip-flop, control logic and interrupt logic.') },
        { warn: T('中断要在一条指令执行完才响应；DMA 请求在一个**存储周期**结束就能响应，而且不需要保护现场。', 'Interrupts wait for an instruction to end; DMA requests are served at the end of a memory cycle, without saving context.') },
      ],
    },
    {
      id: 'mode',
      title: T('DMA 和 CPU 怎么分主存', 'Sharing memory with the CPU'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Mode'), T('做法', 'How'), T('特点', 'Trait')],
            rows: [
              [T('停止 CPU 访存', 'CPU halt'), T('整块传送期间 CPU 都不能访存', 'CPU locked out for the whole block'), T('简单，CPU 白等很久', 'simple, wasteful')],
              [T('周期挪用（窃取）', 'Cycle stealing'), T('每传一个字挪用一个存储周期；冲突时 DMA 优先', 'take one cycle per word; DMA wins conflicts'), T('最常用', 'most common')],
              [T('DMA 与 CPU 交替访存', 'Alternating'), T('把一个存储周期分成两半，一半给 CPU，一半给 DMA', 'each cycle split between them'), T('不冲突，但要求 CPU 周期比存储周期长', 'no conflicts; needs a slow CPU cycle')],
            ],
          },
        },
      ],
    },
    pit([
      T('DMA 不是不占用主存，而是不占用 CPU 去搬数据。', 'DMA still uses memory; it frees the CPU.'),
      T('一块数据传完 DMA 才发一次中断，不是每个字一次。', 'One interrupt per block, not per word.'),
    ]),
  ],
};
const DMA_SPEC = {
  presets: [
    { label: T('传 4 个字，每 3 个存储周期一个', '4 words, one every 3 cycles'), set: { k: 4, interval: 3 } },
    { label: T('设备很快', 'Fast device'), set: { k: 6, interval: 1 } },
    { label: T('设备很慢', 'Slow device'), set: { k: 3, interval: 6 } },
  ],
  groups: [{ legend: 'DMA', fields: [
    { name: 'k', label: T('要传几个字', 'Words'), type: 'int', min: 1, max: 8 },
    { name: 'interval', label: T('每隔几个存储周期准备好一个', 'Cycles per word'), type: 'int', min: 1, max: 6 },
  ] }],
  note: T('CPU 每个存储周期都想访存；「停止 CPU 访存」从第一个字开始到最后一个字传完，CPU 都不能访存。', 'The CPU wants memory every cycle. In halt mode it is locked out from the first word to the last.'),
};
const DMA_ERR = { k: T('1～8 个字', '1–8 words'), interval: T('间隔 1～6', 'Interval 1–6') };
function dmaBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const CW = Math.min(44, 600 / sim.L);
  const X0 = 210;
  let hd = '';
  for (let c = 0; c < sim.L; c++) hd += txt(c * CW + CW / 2, 0, String(c + 1), 'bt-idx');
  items.push({ k: 'hd', x: X0, y: 116, html: hd });
  // 设备准备好
  let rd = txt(-14, 18, z ? '设备准备好' : 'device ready', 'bt-lab', 'end');
  sim.ready.forEach((c, i) => (rd += `<g transform="translate(${c * CW} 0)">${cell(CW - 3, 26, `W${i + 1}`, { tone: 'amber', size: 10 })}</g>`));
  items.push({ k: 'rd', x: X0, y: 126, html: rd });
  const row = (key, y, lab, seq, on) => {
    if (!on) return;
    let h = txt(-14, 20, lab, 'bt-lab', 'end');
    seq.forEach((s, c) => {
      const m = { dma: ['DMA', 'rose', ''], cpu: ['CPU', 'blue', ''], idle: [z ? '空闲' : 'idle', '', 'dim'] }[s];
      h += `<g transform="translate(${c * CW} 0)">${cell(CW - 3, 30, m[0], { tone: m[1], size: 9, cls: m[2] })}</g>`;
    });
    items.push({ k: key, x: X0, y, html: h });
  };
  row('stop', 186, z ? '停止 CPU 访存' : 'CPU halt', sim.stop, k >= 1);
  row('steal', 236, z ? '周期挪用' : 'Cycle stealing', sim.steal, k >= 2);
  if (k >= 3) {
    let h = txt(-14, 20, z ? '交替访存' : 'Alternating', 'bt-lab', 'end');
    for (let c = 0; c < sim.L; c++) {
      h += `<g transform="translate(${c * CW} 0)">${cell(CW / 2 - 2, 30, 'C', { tone: 'blue', size: 9 })}</g>`;
      h += `<g transform="translate(${c * CW + CW / 2 - 1} 0)">${cell(CW / 2 - 2, 30, sim.ready.includes(c) ? 'D' : '', { tone: sim.ready.includes(c) ? 'rose' : '', size: 9, cls: sim.ready.includes(c) ? '' : 'dim' })}</g>`;
    }
    items.push({ k: 'alt', x: X0, y: 286, html: h });
  }
  if (k >= 4) {
    const rows = [
      [z ? '停止 CPU 访存' : 'CPU halt', String(sim.lost.stop)],
      [z ? '周期挪用' : 'Cycle stealing', String(sim.lost.steal)],
      [z ? '交替访存' : 'Alternating', String(sim.lost.alt)],
    ];
    items.push({ k: 'lost', x: X0, y: 346, html: gridTable([z ? '方式' : 'mode', z ? 'CPU 损失的周期' : 'CPU cycles lost'], rows, { cw: [130, 130] }) });
  }
  return items;
}
function buildDma(p, kit, ERR) {
  const sim = dma(p);
  const lesson = shell('dma', kit, ERR, sim, {
    where: W,
    tag: 'DMA',
    name: T('I/O 方式与 DMA', 'I/O methods and DMA'),
    full: T('程序查询 · 程序中断 · DMA · 通道 · DMA 的过程 · 停止 CPU 访存 · 周期挪用 · 交替访存', 'Polling · interrupts · DMA · channels · DMA steps · halt · cycle stealing · alternating'),
    title: T(`${p.k} 个字，每 ${p.interval} 个周期一个`, `${p.k} words, every ${p.interval} cycles`),
    legend: [['rose', T('DMA 占用主存', 'DMA uses memory')], ['blue', T('CPU 访存', 'CPU uses memory')]],
    principle: DMA_PRINCIPLE,
    desc: T('DMA 控制器直接在设备和主存之间搬数据，但主存只有一个，CPU 也要用。这节课把同一批数据分别用三种方式传送，按存储周期画成时间线，比较 CPU 各损失几个周期。', 'One block, three ways of sharing memory with the CPU, drawn cycle by cycle; compare the CPU cycles lost.'),
    rect: [30, 90, 210 + 640, 460],
  });
  if (!sim.ok) return lesson;
  const list = [
    { title: T(`设备每 ${sim.interval} 个周期准备好一个字`, `A word every ${sim.interval} cycles`), desc: T(`共 ${sim.k} 个`, `${sim.k} words`), detail: T(`第 ${sim.ready.map((c) => c + 1).join('、')} 个存储周期各有一个字准备好，要写入主存。`, `Words ready at cycles ${sim.ready.map((c) => c + 1).join(', ')}.`), ref: 'flow', st: { k: 0 }, row: { color: 'amber', what: T('设备', 'Device'), result: `${sim.k}`, tone: 'info' } },
    { title: T(`停止 CPU 访存：CPU 停 ${sim.lost.stop} 个周期`, `Halt: CPU loses ${sim.lost.stop}`), desc: T('整块传完才放开', 'Locked until done'), detail: T(`从第 1 个字到第 ${sim.k} 个字传完，共 ${sim.lost.stop} 个存储周期 CPU 都不能访存，其中 ${sim.lost.stop - sim.k} 个周期主存其实是空着的。`, `${sim.lost.stop} cycles lost, ${sim.lost.stop - sim.k} of them idle.`), ref: 'mode', st: { k: 1 }, row: { color: 'rose', what: T('停止', 'Halt'), result: String(sim.lost.stop), tone: 'warn' } },
    { title: T(`周期挪用：CPU 停 ${sim.lost.steal} 个周期`, `Stealing: CPU loses ${sim.lost.steal}`), desc: T('每个字挪一个周期', 'One cycle per word'), detail: T(`每准备好一个字，DMA 挪用一个存储周期；其余周期 CPU 照常访存。CPU 只损失 ${sim.lost.steal} 个周期。`, `Only ${sim.lost.steal} cycles are taken.`), ref: 'mode', st: { k: 2 }, row: { color: 'blue', what: T('挪用', 'Steal'), result: String(sim.lost.steal), tone: 'info' } },
    { title: T('交替访存：互不影响', 'Alternating: no loss'), desc: T('一个周期一分为二', 'Each cycle split'), detail: T('每个存储周期前半给 CPU（C），后半给 DMA（D），CPU 不损失周期，但要求 CPU 的工作周期至少是存储周期的两倍。', 'C and D halves; no loss, but needs a CPU cycle twice the memory cycle.'), ref: 'mode', st: { k: 3 }, row: { color: 'teal', what: T('交替', 'Alternate'), result: '0', tone: 'ok' } },
    { title: T('比一比', 'Compare'), desc: `${sim.lost.stop} / ${sim.lost.steal} / 0`, detail: T(`CPU 损失的存储周期：停止 CPU 访存 ${sim.lost.stop}，周期挪用 ${sim.lost.steal}，交替访存 0。传完以后 DMA 控制器发一次中断，CPU 做后处理。`, `Lost: ${sim.lost.stop}, ${sim.lost.steal}, 0. One interrupt at the end.`), ref: 'flow', st: { k: 4 }, row: { color: 'green', what: T('损失', 'Lost'), result: `${sim.lost.stop}/${sim.lost.steal}/0`, tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => dmaBoard(sim, st, z), T(`周期挪用只损失 ${sim.lost.steal} 个周期`, `Stealing loses ${sim.lost.steal}`), T('把设备改慢一些，看停止 CPU 访存浪费得更多。', 'Slow the device down and watch halt mode waste more.'));
}
export const makeDma = make('dma', DMA_SPEC, DMA_ERR, buildDma);
