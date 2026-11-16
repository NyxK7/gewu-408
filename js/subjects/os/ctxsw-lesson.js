// 「上下文切换」：中间是 CPU 的寄存器，左右是两个 PCB，上面一条时间线是「谁在用 CPU」，下面是就绪队列和阻塞队列。
// 保存时箭头从 CPU 指向 A 的 PCB，恢复时从 B 的 PCB 指向 CPU；换的是进程还是线程，看 PTBR 那一格动不动。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { contextSwitch } from './ctxsw.js';

const W = [['os', 'process']];
const hx = (v) => (v == null ? '' : '0x' + v.toString(16).toUpperCase()); // 文字表里所有场景都会先拼出来，没用到的值可能为空
const PX = { A: 60, CPU: 390, B: 720 }; // 三张表的左边
const TY = 210; // 表的顶部
const RH = 42;
const ROWS = [
  ['state', T('状态', 'State')],
  ['mode', T('模式', 'Mode')],
  ['PC', 'PC'],
  ['SP', 'SP'],
  ['R0', 'R0'],
  ['R1', 'R1'],
  ['PTBR', T('页表基址 PTBR', 'PTBR')],
];
const STATE = { running: T('运行', 'running'), ready: T('就绪', 'ready'), blocked: T('阻塞', 'blocked') };
const MODE = { user: T('用户态', 'user'), kernel: T('内核态', 'kernel') };
const COST = {
  mode: T('进出内核态', 'entering and leaving the kernel'),
  save: T('保存寄存器到 PCB', 'saving registers to the PCB'),
  sched: T('运行调度程序选下一个', 'running the scheduler'),
  space: T('切换地址空间（换 PTBR）', 'switching the address space'),
  tlb: T('TLB 失效，之后的访存先要查页表', 'TLB flush and refill'),
  restore: T('从 PCB 恢复寄存器', 'restoring registers'),
  cache: T('Cache 里多是旧进程的数据，刚切过来命中率低', 'a cold cache afterwards'),
};

const PRINCIPLE = {
  sections: [
    {
      id: 'what',
      title: T('什么是上下文', 'What “context” means'),
      blocks: [
        { p: T('进程的上下文就是让它「停下来以后还能接着跑」所需要的全部信息：通用寄存器、程序计数器 PC、程序状态字 PSW、栈指针，以及它的地址空间（页表基址等）。这些在进程不运行时都保存在它的 PCB 里。', 'A process’s context is everything needed to resume it: registers, PC, PSW, stack pointer and its address space. While it is not running, these live in its PCB.') },
        { p: T('**上下文切换**：把 CPU 从一个进程交给另一个进程——保存当前进程的上下文，恢复另一个进程的上下文。它一定在**内核态**完成。', '**A context switch** saves one context and restores another, always in **kernel mode**.') },
      ],
    },
    {
      id: 'steps',
      title: T('一次切换的过程', 'The steps of a switch'),
      blocks: [
        { steps: [
          T('发生时钟中断（或者进程执行了会阻塞的系统调用），硬件切到内核态，把断点 PC 和 PSW 压进内核栈；', 'A timer interrupt (or blocking system call) enters the kernel; the hardware pushes PC and PSW;'),
          T('内核把当前进程的状态改成就绪（时间片用完）或阻塞（等 I/O），放进相应的队列；', 'the kernel marks the process ready or blocked and queues it;'),
          T('把其余寄存器保存到它的 PCB；', 'the remaining registers are saved in its PCB;'),
          T('调度程序从就绪队列里选出下一个进程；', 'the scheduler picks the next process;'),
          T('如果是另一个进程，切换地址空间：装入新的页表基址，TLB 原来的表项作废；', 'for another process, switch address spaces: load its page-table base and invalidate the TLB;'),
          T('从新进程的 PCB 恢复寄存器，中断返回，回到用户态继续执行。', 'restore its registers and return to user mode.'),
        ] },
      ],
    },
    {
      id: 'not',
      title: T('不一定会切换的情况', 'When no switch happens'),
      blocks: [
        { list: [
          T('**系统调用不一定导致进程切换**：getpid、不需要等待的 read 等，内核办完事直接返回原来的进程，只是「模式切换」（用户态 ↔ 内核态），不是「进程切换」。', '**A system call need not switch processes**: a non-blocking call returns to the same process — a mode switch, not a process switch.'),
          T('**中断不一定导致调度**：键盘中断、I/O 完成中断处理完后，如果没有更高优先级的进程就绪（非抢占），还是回到被打断的进程。', '**An interrupt need not trigger scheduling**: after a device interrupt, the interrupted process usually resumes.'),
          T('模式切换的开销远小于进程切换：不用换地址空间，也不用调度。', 'A mode switch is much cheaper than a process switch.'),
        ] },
        { warn: T('不能进行进程切换的时机：处理中断的过程中、进程在操作系统内核的临界区里、原子操作（原语）执行过程中。', 'No switching inside interrupt handling, kernel critical sections or atomic primitives.') },
      ],
    },
    {
      id: 'thread',
      title: T('线程切换和进程切换', 'Thread vs process switches'),
      blocks: [
        {
          table: {
            head: ['', T('同一进程内的线程切换', 'Thread switch (same process)'), T('进程切换', 'Process switch')],
            rows: [
              [T('保存 / 恢复寄存器', 'Save / restore registers'), T('要（线程的 TCB）', 'yes (TCB)'), T('要（PCB）', 'yes (PCB)')],
              [T('切换地址空间', 'Switch address space'), T('不要：共享同一个页表', 'no: same page table'), T('要：换页表基址', 'yes: new page-table base')],
              [T('TLB、Cache', 'TLB and cache'), T('基本还能用', 'mostly still valid'), T('TLB 作废，Cache 变冷', 'TLB flushed, cache cold')],
              [T('开销', 'Cost'), T('小', 'small'), T('大', 'large')],
            ],
          },
        },
        { tip: T('用户级线程的切换甚至不用进内核，由线程库在用户态完成；但一个线程阻塞，整个进程都会被阻塞。', 'User-level threads switch without entering the kernel, but one blocking thread blocks the whole process.') },
      ],
    },
    {
      id: 'cost',
      title: T('切换的开销', 'The cost'),
      blocks: [
        { p: T('上下文切换本身不做「有用的工作」。直接开销是保存、恢复寄存器和运行调度程序；间接开销往往更大：换了地址空间，TLB 要重新装，Cache 里大多是上一个进程的数据，切过来以后一段时间缺失很多。时间片设得太短，切换开销占的比例就太大。', 'Switching does no useful work. Direct cost: saving, restoring and scheduling. Indirect cost is often larger: TLB refills and a cold cache. Very short time slices waste too much on switching.') },
      ],
    },
    pit([
      T('进程切换一定发生在内核态。', 'Process switches always happen in kernel mode.'),
      T('「模式切换」和「进程切换」不是一回事。', 'A mode switch is not a process switch.'),
      T('PCB 是进程存在的唯一标志，上下文就保存在 PCB 里。', 'The PCB is the sole sign that a process exists; the context is stored there.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('时间片用完，换到另一个进程', 'Time slice over, another process'), set: { trigger: 'timer', target: 'process' } },
    { label: T('读磁盘阻塞，换到另一个进程', 'Blocks on disk, another process'), set: { trigger: 'block', target: 'process' } },
    { label: T('同一进程里换线程', 'Another thread, same process'), set: { trigger: 'timer', target: 'thread' } },
    { label: T('系统调用但不切换', 'A system call without a switch'), set: { trigger: 'syscall', target: 'process' } },
  ],
  groups: [{ legend: T('场景', 'Scenario'), fields: [
    { name: 'trigger', label: T('什么让 A 进了内核', 'What brings A into the kernel'), type: 'select', options: [['timer', T('时钟中断：时间片用完', 'timer interrupt: slice over')], ['block', T('系统调用 read：要等磁盘', 'read(): waits for the disk')], ['syscall', T('系统调用 getpid：马上有结果', 'getpid(): answered at once')]], wide: true },
    { name: 'target', label: T('就绪队列最前面的是', 'At the head of the ready queue'), type: 'select', options: [['process', T('另一个进程 B', 'another process B')], ['thread', T('同一进程的另一个线程 A₂', 'another thread A₂ of A')]], wide: true },
  ] }],
  note: T('单 CPU。进入内核时硬件把断点压进内核栈，其余寄存器由内核保存到 PCB（线程是 TCB）。', 'One CPU. The hardware pushes the breakpoint; the kernel saves the rest into the PCB (or TCB).'),
};
const ERR = { trigger: T('触发原因不对', 'Unknown trigger'), target: T('切换对象不对', 'Unknown target') };

function table(name, title, data, z, hot, tone, rows) {
  let h = txt(0, -12, title, 'bt-lab', 'start');
  rows.forEach(([key, lab], i) => {
    const v = data[key];
    const show = key === 'state' ? (z ? STATE[v].zh : STATE[v].en) : key === 'mode' ? (z ? MODE[v].zh : MODE[v].en) : typeof v === 'number' && key !== 'R0' && key !== 'R1' ? hx(v) : String(v);
    h += `<g transform="translate(0 ${i * RH})">${cell(100, RH - 6, z ? lab.zh ?? lab : lab.en ?? lab, { size: 13, cls: 'dim' })}<g transform="translate(104 0)">${cell(118, RH - 6, show, { size: 15, tone: hot.includes(key) ? 'amber' : tone, cls: hot.includes(key) ? 'hot' : '' })}</g></g>`;
  });
  return { k: name, x: PX[name], y: TY, html: h };
}

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : sim.steps[0];
  const kind = st ? s.kind : 'run';
  const ch = new Set(s.changed ?? []);
  const cpuRows = ROWS.filter(([k]) => k !== 'state');
  const pcbRows = ROWS.filter(([k]) => k !== 'mode');
  const bName = s.B.name;
  items.push(table('A', z ? 'A 的 PCB' : 'PCB of A', s.A, z, kind === 'save' ? [...ch] : kind === 'state' ? ['state'] : [], s.A.state === 'running' ? 'blue' : '', pcbRows));
  items.push(table('CPU', 'CPU', s.cpu, z, ['save', 'state', 'pick'].includes(kind) ? [] : [...ch], 'slate', cpuRows));
  items.push(table('B', z ? `${bName} 的 ${sim.thread ? 'TCB' : 'PCB'}` : `${sim.thread ? 'TCB' : 'PCB'} of ${bName}`, s.B, z, kind === 'pick' ? ['state'] : [], s.B.state === 'running' ? 'violet' : '', pcbRows));
  // 保存、恢复的箭头
  const ay = TY + 2 * RH + 10;
  if (kind === 'save') items.push({ k: 'arr', x: 0, y: 0, html: arrow(PX.CPU - 6, ay, PX.A + 226, ay, 'acc') + txt((PX.CPU + PX.A + 222) / 2, ay - 10, z ? '保存' : 'save', 'cw-lab cw-w') });
  else if (kind === 'restore' || kind === 'space') items.push({ k: 'arr', x: 0, y: 0, html: arrow(PX.B - 6, kind === 'space' ? TY + 5 * RH + 12 : ay, PX.CPU + 226, kind === 'space' ? TY + 5 * RH + 12 : ay, 'acc') + txt((PX.B + PX.CPU + 222) / 2, (kind === 'space' ? TY + 5 * RH + 12 : ay) - 10, z ? (kind === 'space' ? '换页表' : '恢复') : kind === 'space' ? 'new page table' : 'restore', 'cw-lab blue') });
  else items.push({ k: 'arr', x: 0, y: 0, html: '' });
  // TLB 和内核栈
  let extra = '';
  if (s.brk != null && s.cpu.mode === 'kernel') extra += txt(0, 0, z ? `内核栈：断点 PC = ${hx(s.brk)}` : `kernel stack: PC = ${hx(s.brk)}`, 'ar-mono', 'start');
  extra += txt(0, 24, `TLB：${s.tlbValid ? (z ? '有效' : 'valid') : z ? '已作废，要重新装' : 'flushed'}`, s.tlbValid ? 'bt-cap' : 'cw-lab bad l', 'start');
  items.push({ k: 'extra', x: PX.CPU, y: TY + 6 * RH + 20, html: extra });
  // 时间线：谁在用 CPU
  const tone = (w) => (w === 'A' ? 'blue' : 'violet');
  let tl = txt(-12, 22, z ? '谁在用 CPU' : 'On the CPU', 'bt-lab', 'end');
  s.run.forEach((r, i) => {
    const lab = r.mode === 'kernel' ? (z ? '内核' : 'kernel') : `${r.who} ${z ? '用户态' : 'user'}`;
    tl += `<g transform="translate(${i * 170} 0)">${cell(164, 36, lab, { tone: r.mode === 'kernel' ? 'slate' : tone(r.who), size: 14, cls: i === s.run.length - 1 ? 'hot' : '' })}</g>`;
  });
  items.push({ k: 'tl', x: PX.A + 100, y: 92, html: tl });
  // 队列
  const q = (lab, arr, x) => {
    let h = txt(0, -10, lab, 'bt-cap', 'start');
    arr.forEach((n, i) => (h += `<g transform="translate(${i * 50} 0)">${cell(44, 34, n, { tone: n === 'A' ? 'blue' : n === bName ? 'violet' : 'slate', size: 13 })}</g>`));
    if (!arr.length) h += txt(0, 20, z ? '（空）' : '(empty)', 'bt-idx', 'start');
    return h;
  };
  items.push({ k: 'qs', x: PX.A, y: TY + 6 * RH + 60, html: q(z ? '就绪队列' : 'Ready queue', s.ready, 0) + `<g transform="translate(0 70)">${q(z ? '阻塞队列（等磁盘）' : 'Blocked (disk)', s.blocked, 0)}</g>` });
  return items;
}

function build(p, kit, ERR) {
  const sim = contextSwitch(p);
  const lesson = shell('ctx-switch', kit, ERR, sim, {
    where: W,
    tag: T('切换', 'Ctx'),
    name: T('上下文切换', 'Context switches'),
    full: T('上下文与 PCB · 保存与恢复 · 调度 · 切换地址空间 · 模式切换和进程切换 · 线程切换 · 开销', 'Context and PCB · save and restore · scheduling · address spaces · mode vs process switch · threads · cost'),
    title: SPEC.presets.find((x) => x.set.trigger === p.trigger && x.set.target === p.target)?.label ?? T('上下文切换', 'Context switch'),
    legend: [['amber', T('这一步改了的值', 'Changed this step')], ['slate', T('内核在运行', 'Kernel running')]],
    principle: PRINCIPLE,
    desc: T('CPU 怎样从一个进程换到另一个进程？中间是 CPU 的寄存器，左右是两个进程的 PCB。这节课一步步看：进内核、改状态、把寄存器存进 PCB、调度、换页表、恢复、回到用户态。也可以试试「系统调用但不切换」和「同一进程换线程」，看哪些步骤会省掉。', 'How the CPU moves from one process to another: enter the kernel, update states, save registers to the PCB, schedule, switch page tables, restore, return. Try the no-switch system call and the thread switch to see which steps disappear.'),
    rect: [20, 70, PX.B + 240, TY + 6 * RH + 150],
  });
  if (!sim.ok) return lesson;
  const bName = sim.steps[0].B.name;
  const cause = { timer: T('时钟中断：A 的时间片用完了', 'a timer interrupt: A’s slice is over'), block: T('A 调用 read 读磁盘，数据还没到', 'A calls read() and the data is not there yet'), syscall: T('A 调用 getpid', 'A calls getpid()') }[sim.trigger];
  const list = sim.steps.map((s, k) => {
    const d = {
      run: [T('A 在用户态运行', 'A runs in user mode'), T(`CPU 的寄存器里是 A 的值：PC = ${hx(s.cpu.PC)}，页表基址是 A 的 ${hx(s.cpu.PTBR)}。`, 'The CPU holds A’s registers.'), 'what'],
      enter: [T('进入内核', 'Enter the kernel'), T(`${cause.zh}。硬件切到内核态，把断点 PC = ${hx(s.brk)} 和 PSW 压进 A 的内核栈，PC 跳到${sim.trigger === 'timer' ? '时钟中断处理程序' : '系统调用入口'}。`, `${cause.en}. Kernel mode; breakpoint ${hx(s.brk)} pushed.`), 'steps'],
      serve: [T('内核执行 getpid，马上有结果', 'The kernel answers getpid()'), T('getpid 不需要等待，内核把结果放进 R0 就办完了。A 还是运行态，不需要改状态，也不需要调度。', 'No waiting: the result goes in R0; A stays running.'), 'not'],
      back: [T('返回用户态，还是 A', 'Back to A in user mode'), T(`从内核栈取回断点，PC = ${hx(s.cpu.PC)}，回到用户态接着执行 A。这只是一次「模式切换」，没有发生进程切换：没保存 PCB，也没换页表。`, 'Return to A: a mode switch only, no process switch.'), 'not'],
      state: [sim.trigger === 'timer' ? T('A：运行 → 就绪', 'A: running → ready') : T('A：运行 → 阻塞', 'A: running → blocked'), sim.trigger === 'timer' ? T('时间片用完，A 还能运行，只是轮到别人了：改成就绪态，排到就绪队列的末尾。', 'A is still runnable: it joins the end of the ready queue.') : T('A 要等磁盘，暂时不能运行：改成阻塞态，挂到这个磁盘的等待队列上。等 I/O 完成中断来了，才会被唤醒变回就绪。', 'A must wait: it is blocked on the disk queue until the I/O interrupt wakes it.'), 'steps'],
      save: [T('保存 A 的上下文', 'Save A’s context'), T(`把 PC（断点 ${hx(s.A.PC)}）、SP、R0、R1 存进 A 的 PCB。下次 A 再被调度，就从这里恢复。`, 'PC, SP, R0, R1 go into A’s PCB.'), 'steps'],
      pick: [T(`调度程序选中 ${bName}`, `The scheduler picks ${bName}`), T(`就绪队列最前面是 ${bName}，把它取出来，改成运行态。`, `${bName} leaves the ready queue and becomes running.`), 'steps'],
      space: [T('切换地址空间', 'Switch the address space'), T(`B 是另一个进程，有自己的页表：页表基址寄存器换成 B 的 ${hx(s.cpu.PTBR)}，TLB 里 A 的表项全部作废。`, `Load B’s page-table base ${hx(s.cpu.PTBR)}; the TLB is flushed.`), 'thread'],
      restore: [T(`恢复 ${bName} 的寄存器`, `Restore ${bName}’s registers`), sim.thread ? T(`A₂ 和 A 是同一个进程的线程，共享页表，所以页表基址不用换，TLB 也还有效，只要从 TCB 恢复 SP、R0、R1。`, 'Same process: no page-table change; restore SP, R0, R1 from the TCB.') : T('从 B 的 PCB 恢复 SP、R0、R1。', 'Restore SP, R0, R1 from B’s PCB.'), sim.thread ? 'thread' : 'steps'],
      resume: [T(`${bName} 回到用户态继续运行`, `${bName} resumes in user mode`), T(`PC 恢复为 ${bName} 上次停下的 ${hx(s.cpu.PC)}，中断返回到用户态，${bName} 接着执行，就好像从来没停过。`, `PC = ${hx(s.cpu.PC)}: ${bName} continues.`), 'steps'],
    }[s.kind];
    return { title: d[0], desc: MODE[s.cpu.mode], detail: d[1], ref: d[2], st: { k }, row: { color: s.cpu.mode === 'kernel' ? 'slate' : s.run.at(-1).who === 'A' ? 'blue' : 'violet', what: d[0], result: MODE[s.cpu.mode], tone: 'info' } };
  });
  const title = sim.switched ? T(`从 A 切换到 ${bName}`, `A → ${bName}`) : T('没有发生进程切换', 'No process switch');
  const text = sim.switched
    ? T(`这次切换的开销：${sim.cost.map((c) => COST[c].zh).join('；')}。${sim.thread ? '线程切换省掉了换页表和 TLB 失效。' : ''}`, `Costs: ${sim.cost.map((c) => COST[c].en).join('; ')}.`)
    : T('系统调用只引起了用户态和内核态之间的模式切换，A 一直占着 CPU。', 'Only a mode switch; A kept the CPU.');
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeCtxSwitch = make('ctx-switch', SPEC, ERR, build);
