// 「进程的状态与转换」：五个状态是平面的框，进程是小格子，在状态之间移动；就绪队列、阻塞队列是状态下面的一排格子。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, chip, errOf, stepKit, toSteps } from '../../core/steps.js';
import { simulate } from './proc.js';

const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'];
const ST = {
  new: { zh: '创建态', en: 'New', x: 110, y: 170, tone: 'slate' },
  ready: { zh: '就绪态', en: 'Ready', x: 330, y: 170, tone: 'teal' },
  running: { zh: '运行态', en: 'Running', x: 570, y: 170, tone: 'green' },
  done: { zh: '终止态', en: 'Terminated', x: 790, y: 170, tone: 'slate' },
  blocked: { zh: '阻塞态', en: 'Blocked', x: 450, y: 400, tone: 'rose' },
};
const EDGE = {
  create: ['new', 'ready', T('创建完成，进入就绪', 'admitted')],
  dispatch: ['ready', 'running', T('被调度', 'dispatched')],
  timeout: ['running', 'ready', T('时间片到 / 被抢占', 'quantum expired / preempted')],
  block: ['running', 'blocked', T('请求 I/O、等待事件', 'waits for I/O or an event')],
  wakeup: ['blocked', 'ready', T('等待的事件发生', 'the event occurs')],
  exit: ['running', 'done', T('运行结束', 'finishes')],
};

const SPEC = {
  presets: [
    { label: T('一个完整的例子', 'A full example'), set: { events: 'P1+ P2+ run wait run P1! tick run exit run exit' } },
    { label: T('三个进程轮转', 'Three in rotation'), set: { events: 'P1+ P2+ P3+ run tick run tick run tick run exit run exit run exit' } },
    { label: T('不合法的转换', 'Illegal transitions'), set: { events: 'P1+ P2+ P1! run run wait P1! wait run' } },
  ],
  groups: [
    {
      legend: T('事件序列', 'Events'),
      fields: [
        { name: 'events', label: T('P1+ 创建；run 调度；tick 时间片到；wait 等待 I/O；P1! P1 的事件发生；exit 结束', 'P1+ create; run dispatch; tick quantum; wait block; P1! wake P1; exit finish'), type: 'text', wide: true, hint: T('用空格隔开，最多 24 个事件', 'Space-separated, up to 24 events') },
      ],
    },
  ],
  note: T(
    '只有一个 CPU：同一时刻最多一个进程处于运行态。run 从就绪队列队首取进程；时间片到和被唤醒的进程都排到就绪队列队尾。不合法的操作不会执行，会单独记一步并说明原因。',
    'One CPU: at most one process runs at a time. run takes the head of the ready queue; preempted and woken processes join its tail. Illegal operations are not performed but logged as a step with the reason.',
  ),
};
const ERR = { event: T('看不懂这个事件：{e}', 'Cannot read this event: {e}'), count: T('事件要有 1～24 个', 'Give 1–24 events') };

function board(sim, k, z) {
  const items = [];
  const st = k >= 0 ? sim.steps[k] : { state: {}, ready: [], blocked: [], running: null, order: [] };
  const cur = k >= 0 ? sim.steps[k] : null;
  const BW = 132; // 状态框
  const BH = 54;
  for (const [id, n] of Object.entries(ST)) {
    const hot = cur && cur.kind !== 'illegal' && (cur.to === id || (cur.from === id && id !== 'new'));
    items.push({ k: `st-${id}`, x: n.x, y: n.y, cls: hot ? 'is-cur' : '', html: chip(BW, BH, z ? n.zh : n.en, { tone: n.tone, cls: hot ? 'hot' : '', size: 15 }) });
  }
  // 状态转换箭头：从框边到框边，旁边写上转换的原因
  let arrows = '';
  const edge = (from, to, off) => {
    const a = ST[from];
    const b = ST[to];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len];
    const cut = Math.min(BW / 2 / Math.abs(ux || 1e-9), BH / 2 / Math.abs(uy || 1e-9)) + 6;
    const [px, py] = [-uy * off, ux * off];
    return [a.x + ux * cut + px, a.y + uy * cut + py, b.x - ux * cut + px, b.y - uy * cut + py];
  };
  const pairs = [
    ['create', 0, 0, -12],
    ['dispatch', -12, 0, -10],
    ['timeout', 12, 0, 22],
    ['block', 0, 74, 0],
    ['wakeup', 0, -78, 0],
    ['exit', 0, 0, -12],
  ];
  for (const [kind, off, lx, ly] of pairs) {
    const [a, b, lab] = EDGE[kind];
    const [x1, y1, x2, y2] = edge(a, b, off);
    const on = cur && cur.kind === kind;
    arrows += arrow(x1, y1, x2, y2, on ? 'acc' : 'dash');
    arrows += txt((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, z ? lab.zh : lab.en, on ? 'bt-acc' : 'bt-dim');
  }
  // 不合法的转换：画一条红色虚线
  if (cur?.kind === 'illegal' && cur.why === 'notBlocked' && cur.st && cur.st !== 'ready') {
    const [x1, y1, x2, y2] = edge(cur.st, 'ready', 26);
    arrows += arrow(x1, y1, x2, y2, 'bad dash');
  }
  items.push({ k: 'arrows', x: 0, y: 0, html: arrows });

  // 队列画成一排空格子，进程是会移动的小格子
  const SW = 40;
  const slots = (key, x, y, n, label) => {
    let h = txt(-10, 4, label, 'bt-cap', 'end');
    for (let i = 0; i < n; i++) h += `<g transform="translate(${i * SW} -15)">${cell(SW - 6, 30, '', { cls: 'dim' })}</g>`;
    items.push({ k: key, x, y, html: h });
  };
  const QN = Math.max(3, sim.procs.length);
  slots('q-ready', ST.ready.x - 60, ST.ready.y + 84, QN, z ? '就绪队列' : 'ready queue');
  slots('q-blocked', ST.blocked.x - 60, ST.blocked.y + 84, QN, z ? '阻塞队列' : 'blocked queue');
  const tone = (p) => TONES[sim.procs.indexOf(p) % 8];
  const place = (p, x, y) => items.push({ k: `p-${p}`, x, y, from: [ST.new.x, ST.new.y + 84], cls: cur?.p === p ? 'is-cur' : '', html: chip(SW - 6, 30, p, { tone: tone(p), cls: cur?.p === p ? 'hot' : '', size: 12 }) });
  st.ready.forEach((p, i) => place(p, ST.ready.x - 60 + i * SW + (SW - 6) / 2, ST.ready.y + 84));
  st.blocked.forEach((p, i) => place(p, ST.blocked.x - 60 + i * SW + (SW - 6) / 2, ST.blocked.y + 84));
  // CPU：运行态上方的一格
  items.push({ k: 'cpu', x: ST.running.x, y: ST.running.y - 82, html: chip(120, 44, '', { cls: st.running ? 'ok' : 'dim' }) + txt(-50, 4, 'CPU', 'bt-lab', 'start') + (st.running ? '' : txt(26, 4, z ? '空闲' : 'idle', 'bt-dim')) });
  if (st.running) place(st.running, ST.running.x + 26, ST.running.y - 82);
  st.order.filter((p) => st.state[p] === 'done').forEach((p, i) => place(p, ST.done.x - 40 + i * SW, ST.done.y + 84));
  return items;
}

// ───────────────────────── 原理 ─────────────────────────

function stateFig(z) {
  const n = (x, y, zh, en, cls = '') => `<rect class="df-box ${cls}" x="${x - 50}" y="${y - 18}" width="100" height="36" rx="18"/><text class="df-t" x="${x}" y="${y + 5}" text-anchor="middle">${z ? zh : en}</text>`;
  const a = (x1, y1, x2, y2, zh, en, lx, ly, cls = '') => `<line class="df-line ${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#ps-arr)"/><text class="df-note" x="${lx}" y="${ly}" text-anchor="middle">${z ? zh : en}</text>`;
  return `<svg class="doc-svg" viewBox="0 0 680 230" role="img"><defs><marker id="ps-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="df-arrow"/></marker></defs>
    ${n(70, 60, '创建态', 'New')}${n(260, 60, '就绪态', 'Ready', 'acc')}${n(470, 60, '运行态', 'Running', 'acc')}${n(620, 60, '终止态', 'Exit')}${n(365, 190, '阻塞态', 'Blocked')}
    ${a(120, 60, 208, 60, '创建完成', 'admit', 164, 50)}
    ${a(310, 52, 418, 52, '调度', 'dispatch', 364, 42)}
    ${a(420, 70, 312, 70, '时间片到 / 被抢占', 'timeout / preempt', 364, 90)}
    ${a(520, 60, 568, 60, '结束', 'exit', 545, 50)}
    ${a(455, 78, 395, 172, '等待事件（主动）', 'wait (active)', 470, 140)}
    ${a(335, 172, 275, 78, '事件发生（被动）', 'wake (passive)', 250, 140)}
  </svg>`;
}

export const PRINCIPLE = {
  sections: [
    {
      id: 'concept',
      title: T('进程与 PCB', 'Processes and the PCB'),
      blocks: [
        { p: T('程序是一段静态的代码；为了让多个程序**并发**执行、互不干扰，操作系统给每个正在执行的程序建立一个**进程**：它是程序的一次执行过程，是系统进行**资源分配和调度的独立单位**（引入线程后，调度单位变成线程）。', 'A program is static code. To run several concurrently without interference the OS creates a **process** for each execution: one run of a program and the **unit of resource allocation and scheduling** (scheduling moves to threads once they exist).') },
        { p: T('进程由**程序段、数据段和 PCB（进程控制块）**组成。**PCB 是进程存在的唯一标志**：创建进程就是建立 PCB，撤销进程就是回收 PCB。', 'A process consists of **code, data and a PCB (process control block)**. **The PCB is the only proof a process exists**: creating one builds the PCB, destroying it reclaims the PCB.') },
        {
          table: {
            head: [T('PCB 里存什么', 'PCB contents'), T('例子', 'Examples')],
            rows: [
              [T('进程标识', 'Identification'), T('进程号 PID、用户号 UID', 'PID, UID')],
              [T('处理机状态（现场）', 'CPU state'), T('通用寄存器、PC、PSW 等，切换时保存和恢复', 'registers, PC, PSW, saved and restored on a switch')],
              [T('调度信息', 'Scheduling'), T('进程状态、优先级、等待的事件', 'state, priority, awaited event')],
              [T('控制信息', 'Control'), T('程序和数据的地址、打开的文件、占用的资源', 'memory addresses, open files, resources')],
            ],
          },
        },
      ],
    },
    {
      id: 'states',
      title: T('五种状态与转换', 'Five states and their transitions'),
      blocks: [
        { fig: (z) => stateFig(z), caption: T('就绪态和运行态是核心；阻塞态只能回到就绪态，不能直接去运行态', 'Ready and running are the core; blocked can only go back to ready, never straight to running') },
        {
          table: {
            head: [T('状态', 'State'), T('含义', 'Meaning')],
            rows: [
              [T('运行态', 'Running'), T('正在 CPU 上运行（单 CPU 时最多一个）', 'on the CPU (one at most with one CPU)')],
              [T('就绪态', 'Ready'), T('除了 CPU 什么都具备了，只等调度', 'has everything but the CPU')],
              [T('阻塞态（等待态）', 'Blocked'), T('在等某个事件（I/O 完成、资源、信号），这时就算给它 CPU 也运行不了', 'waiting for an event; could not run even with the CPU')],
              [T('创建态', 'New'), T('正在建立 PCB、分配资源', 'PCB and resources being set up')],
              [T('终止态', 'Terminated'), T('运行结束，等待系统回收资源', 'finished, resources being reclaimed')],
            ],
          },
        },
        { warn: T('**阻塞态 → 运行态**、**就绪态 → 阻塞态**都不可能发生：被唤醒的进程要先回到就绪队列等调度；就绪的进程没有在运行，就不可能主动去等待什么事件。', '**Blocked → running** and **ready → blocked** never happen: a woken process queues as ready first, and a ready process is not running, so it cannot start waiting.') },
        { tip: T('**运行 → 阻塞是主动的**（进程自己请求 I/O 或资源，调用阻塞原语）；**阻塞 → 就绪是被动的**（由别的进程或中断处理程序调用唤醒原语）。', '**Running → blocked is active** (the process asks for I/O and calls block); **blocked → ready is passive** (another process or an interrupt handler calls wake-up).') },
      ],
    },
    {
      id: 'control',
      title: T('进程控制原语', 'Process-control primitives'),
      blocks: [
        { p: T('状态转换由操作系统内核里的**原语**完成。原语执行期间不能被中断（原子操作），否则 PCB 和各个队列可能处在一半改好、一半没改的状态。', 'Transitions are done by kernel **primitives** that run atomically; an interruption could leave the PCB and queues half updated.') },
        {
          list: [
            T('**创建原语**：申请空白 PCB，分配资源，初始化 PCB，插入就绪队列。', '**Create**: get a blank PCB, allocate resources, initialise it, add to the ready queue.'),
            T('**撤销原语**：回收资源，撤销 PCB；它的子进程一般也要处理。', '**Destroy**: reclaim resources and the PCB (and handle children).'),
            T('**阻塞原语** / **唤醒原语**：在运行态和阻塞队列、阻塞队列和就绪队列之间移动 PCB。阻塞和唤醒要**成对使用**。', '**Block** / **wake-up** move the PCB between running, the blocked queue and the ready queue; they come **in pairs**.'),
            T('**切换**：保存当前进程的现场到 PCB，从选中进程的 PCB 恢复现场。', '**Switch**: save the current context into its PCB, restore the chosen one’s.'),
          ],
        },
      ],
    },
    {
      id: 'ipc',
      title: T('进程通信', 'Inter-process communication'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Method'), T('怎么做', 'How')],
            rows: [
              [T('共享存储', 'Shared memory'), T('划出一块双方都能访问的共享区，读写要自己用 PV 等手段同步互斥', 'a shared region; the processes synchronise themselves')],
              [T('消息传递', 'Message passing'), T('通过操作系统提供的发送 / 接收原语交换格式化的消息；直接通信（发到对方的消息队列）或间接通信（经过信箱）', 'send/receive primitives; directly to a process or via a mailbox')],
              [T('管道', 'Pipe'), T('一个固定大小的缓冲区，半双工；写满时写进程阻塞，读空时读进程阻塞', 'a fixed-size half-duplex buffer; writers block when full, readers when empty')],
            ],
          },
        },
      ],
    },
    {
      id: 'thread',
      title: T('线程', 'Threads'),
      blocks: [
        { p: T('进程切换要换掉整套资源（地址空间等），开销大。**线程**是进程里的一条执行流：同一进程的线程**共享进程的资源**，各自只有很少的私有部分（寄存器、栈、线程控制块 TCB）。引入线程后，**进程是资源分配的单位，线程是调度的单位**。', 'Switching processes swaps a whole set of resources. A **thread** is a flow of execution inside a process: threads **share the process’s resources** and keep only registers, a stack and a TCB. Then **processes own resources, threads are scheduled**.') },
        {
          table: {
            head: ['', T('用户级线程', 'User-level threads'), T('内核级线程', 'Kernel-level threads')],
            rows: [
              [T('谁管理', 'Managed by'), T('用户空间的线程库，内核不知道它们存在', 'a user-space library; the kernel is unaware'), T('操作系统内核', 'the kernel')],
              [T('切换', 'Switch'), T('不用进内核，快', 'no kernel entry, fast'), T('要进内核，慢一些', 'needs the kernel, slower')],
              [T('一个线程阻塞', 'One blocks'), T('整个进程都阻塞', 'the whole process blocks'), T('别的线程照样运行', 'others keep running')],
              [T('多处理机', 'Multiprocessor'), T('一个进程的多个线程不能并行', 'no parallelism within a process'), T('可以并行', 'parallel')],
            ],
          },
        },
        { p: T('**多线程模型**：多对一（多个用户线程映射到一个内核线程）、一对一（每个用户线程一个内核线程）、多对多。', '**Models**: many-to-one, one-to-one, many-to-many (user threads to kernel threads).') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('PCB 是进程存在的**唯一**标志，程序段和数据段不是。', 'The PCB, not the code or data, is the **only** sign a process exists.'),
            T('阻塞态的进程被唤醒后进入**就绪态**，不是直接运行。', 'A woken process becomes **ready**, not running.'),
            T('就绪态不可能直接变成阻塞态。', 'Ready never turns directly into blocked.'),
            T('时间片用完是运行 → 就绪，不是运行 → 阻塞（进程并没有在等什么）。', 'An expired quantum is running → ready, not blocked: nothing is awaited.'),
            T('引入线程后，同一进程内的线程切换不会引起进程切换；不同进程的线程切换会。', 'Switching threads inside one process is not a process switch; across processes it is.'),
          ],
        },
      ],
    },
  ],
};

// ───────────────────────── 生成课程 ─────────────────────────

const kit = stepKit({ spec: SPEC, rowsName: T('事件', 'Events') });

const WHY = {
  exists: (s) => T(`${s.p} 已经存在，不能重复创建。`, `${s.p} already exists.`),
  busy: (s) => T(`CPU 正在运行 ${s.p}，单 CPU 同一时刻只能运行一个进程，先要等它让出 CPU（时间片到、等待或结束）。`, `The CPU is running ${s.p}; with one CPU it must give up the CPU first.`),
  noReady: () => T('就绪队列是空的，没有可以调度的进程，CPU 空闲。', 'The ready queue is empty: nothing to dispatch, the CPU idles.'),
  idle: () => T('现在没有进程在运行。只有运行态的进程才能时间片到、等待事件或结束。', 'Nothing is running; only a running process can time out, wait or exit.'),
  notBlocked: (s) => T(`${s.p} 现在处于${{ ready: '就绪态', running: '运行态', done: '终止态', new: '创建态' }[s.st]}，不在阻塞态，没有在等事件，不能被唤醒。`, `${s.p} is ${s.st}, not blocked, so there is nothing to wake it from.`),
  noProc: (s) => T(`${s.p} 还没有创建。`, `${s.p} does not exist.`),
};

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'proc-state',
    kit,
    where: [['os', 'process']],
    tag: 'PCB',
    name: T('进程的状态与转换', 'Process states'),
    full: T('五状态 · PCB · 原语 · 线程 · 进程通信', 'Five states · PCB · primitives · threads · IPC'),
    title: T(`${sim.ok ? sim.procs.length : 0} 个进程`, `${sim.ok ? sim.procs.length : 0} processes`),
    badge: T('单 CPU', 'One CPU'),
    nodes: [],
    legend: [
      ['teal', T('就绪', 'Ready')],
      ['green', T('运行', 'Running')],
      ['rose', T('阻塞', 'Blocked')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '进程在运行过程中会在就绪、运行、阻塞几种状态之间来回转换。这节课按一串事件（创建、调度、时间片到、等待 I/O、事件发生、结束）一步步移动进程，能看到就绪队列和阻塞队列怎么变；也故意放了几个不合法的操作，看看为什么不行。',
        'A process moves between ready, running and blocked. Here a sequence of events (create, dispatch, timeout, wait, wake, exit) moves processes step by step, showing the ready and blocked queues; a preset includes illegal operations to show why they fail.',
      ),
      facts: [],
    },
    start: { nodes: [], frame: { rect: [20, 30, 880, 540] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s) => {
    if (s.kind === 'illegal') {
      const w = WHY[s.why](s);
      return { title: T('不合法的操作', 'Illegal operation'), desc: w, detail: w, ref: 'states', row: { color: 'rose', what: T('不合法', 'Illegal'), result: T('不执行', 'skipped'), tone: 'warn', info: w } };
    }
    const [from, to, how] = EDGE[s.kind];
    const title = T(`${s.p}：${ST[from].zh} → ${ST[to].zh}`, `${s.p}: ${ST[from].en} → ${ST[to].en}`);
    const extra = {
      create: T(`建立 ${s.p} 的 PCB、分配资源，进入就绪队列队尾。`, `${s.p}'s PCB is built and it joins the ready queue.`),
      dispatch: T(`进程调度从就绪队列队首取出 ${s.p}，恢复它的现场，把 CPU 交给它。`, `The scheduler takes ${s.p} from the head of the ready queue and gives it the CPU.`),
      timeout: T(`${s.p} 的时间片用完（或被抢占），保存现场，回到就绪队列队尾。它并没有在等什么，所以是就绪而不是阻塞。`, `${s.p}'s quantum ends; its context is saved and it rejoins the ready queue. It awaits nothing, so it is ready, not blocked.`),
      block: T(`${s.p} 请求 I/O（或等待资源），自己调用阻塞原语，进入阻塞队列，让出 CPU。这是主动的。`, `${s.p} asks for I/O and blocks itself, giving up the CPU. This is active.`),
      wakeup: T(`${s.p} 等待的事件发生了（比如 I/O 完成的中断），由别人调用唤醒原语把它移回就绪队列 —— 它不能直接去运行，要排队等调度。这是被动的。`, `${s.p}'s event occurs (e.g. an I/O interrupt); someone else wakes it into the ready queue. It cannot run directly. This is passive.`),
      exit: T(`${s.p} 运行结束，进入终止态，系统回收它的资源和 PCB。`, `${s.p} finishes; its resources and PCB are reclaimed.`),
    }[s.kind];
    return {
      title,
      desc: how,
      detail: extra,
      ref: s.kind === 'create' || s.kind === 'exit' ? 'control' : 'states',
      facts: [[T('就绪队列', 'Ready queue'), s.ready.join(' → ') || '—'], [T('阻塞队列', 'Blocked queue'), s.blocked.join(' → ') || '—']],
      row: { color: ST[to].tone, what: title, result: how, tone: s.kind === 'block' ? 'warn' : 'ok', info: s.ready.length ? T(`就绪：${s.ready.join(' ')}`, `ready: ${s.ready.join(' ')}`) : '' },
    };
  });
  const built = toSteps(list, (k, z) => board(sim, k, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: T('事件走完了', 'All events done'),
    text: T('改一下事件序列试试：比如让进程在阻塞时直接 run，看看为什么它不能被调度。', 'Edit the events, e.g. try to run a blocked process, and see why it cannot be dispatched.'),
    facts: [],
  };
  return lesson;
}

export const makeProc = () => parametric('proc-state', DEFAULTS, build);
