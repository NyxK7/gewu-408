// 操作系统基础：「中断、异常与系统调用」——一段用户程序在用户态 / 内核态两条泳道上怎么来回走。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { parseProg, run } from './intr.js';

const SPEC = {
  presets: [
    { label: T('系统调用', 'System call'), set: { prog: 'add syscall add' } },
    { label: T('外部中断', 'External interrupt'), set: { prog: 'add irq add add' } },
    { label: T('缺页故障', 'Page fault'), set: { prog: 'add pf add' } },
    { label: T('用户态执行特权指令', 'Privileged instruction in user mode'), set: { prog: 'add priv add add' } },
    { label: T('混在一起', 'All together'), set: { prog: 'syscall irq pf div0 add' } },
  ],
  groups: [
    {
      legend: T('用户程序', 'User program'),
      fields: [
        {
          name: 'prog',
          label: T('指令序列（最多 8 条，irq 不算）', 'Instructions (up to 8, irq not counted)'),
          type: 'text',
          wide: true,
          parse: (s) => (parseProg(s) ? s : NaN),
          hint: T('add 普通指令 · syscall 陷入指令 · pf 缺页 · priv 特权指令 · div0 除以 0 · irq 外部中断', 'add normal · syscall trap · pf page fault · priv privileged · div0 divide by zero · irq external interrupt'),
        },
      ],
    },
  ],
  note: T(
    '记号：add 普通指令；syscall 陷入指令（系统调用）；pf 访问的页不在内存；priv 特权指令；div0 整数除以 0；irq 不是指令，表示前一条指令执行期间来了外部中断请求。CPU 只在一条指令执行完后的中断周期检查外部中断。两个中断 / 异常紧挨着时，内核处理完一个接着处理下一个，中间不回用户态（简化）。',
    'Tokens: add normal; syscall trap instruction; pf touches a page not in memory; priv privileged instruction; div0 integer divide by zero; irq is not an instruction but an external interrupt arriving during the previous one. External interrupts are checked only after an instruction completes. Back-to-back events are handled one after another in kernel mode (simplified).',
  ),
};
const ERR = {
  prog: T('只能用 add、syscall、pf、priv、div0、irq 这几个记号', 'Use only add, syscall, pf, priv, div0 and irq'),
  len: T('指令最多 8 条', 'At most 8 instructions'),
};

const INS = {
  add: T('普通指令', 'normal'),
  syscall: T('陷入指令', 'trap'),
  pf: T('访存·缺页', 'page fault'),
  priv: T('特权指令', 'privileged'),
  div0: T('除以 0', 'divide by 0'),
};
const CAUSE = {
  trap: { name: T('系统调用处理', 'System call'), kind: T('陷入（trap）', 'Trap'), tone: 'amber' },
  irq: { name: T('外部中断处理', 'Interrupt'), kind: T('外中断', 'External interrupt'), tone: 'blue' },
  fault: { name: T('缺页处理', 'Page fault'), kind: T('故障（fault）', 'Fault'), tone: 'violet' },
  abort: { name: T('终止进程', 'Kill process'), kind: T('终止（abort）', 'Abort'), tone: 'rose' },
};

const X0 = 130;
const SLOT = 98;
const BW = 88;
const YU = 150;
const YK = 300;

function board(sim, k, z) {
  const items = [];
  const W = sim.boxes.length * SLOT;
  const lane = (y, zh, en, tone) => txt(-14, y + 30, z ? zh : en, `bt-lab c-${tone}`, 'end') + `<rect class="memcol" x="0" y="${y - 12}" width="${W + 10}" height="82" rx="6"/>`;
  items.push({ k: 'lanes', x: X0, y: 0, html: lane(YU, '用户态', 'User mode', 'slate') + lane(YK, '内核态', 'Kernel mode', 'violet') });
  const at = (b) => ({ x: X0 + 5 + b * SLOT, y: sim.boxes[b].lane === 'u' ? YU : YK });
  let saved = null;
  let mode = 'u';
  for (let b = 0; b <= k && b < sim.boxes.length; b++) {
    const x = sim.boxes[b];
    const p = at(b);
    let html;
    if (x.lane === 'u') {
      const bad = !x.ok;
      html = cell(BW, 44, z ? `指令 ${x.i}` : `instr ${x.i}`, { tone: bad ? '' : 'slate', cls: `${bad ? 'bad' : ''} ${b === k ? 'hot' : ''}`, size: 13 }) + txt(BW / 2, 60, x.retry ? (z ? '重新执行' : 're-run') : z ? INS[x.t].zh : INS[x.t].en, 'bt-cap');
    } else {
      const c = CAUSE[x.cause];
      html = cell(BW, 44, z ? c.name.zh : c.name.en, { tone: c.tone, cls: b === k ? 'hot' : '', size: 12 }) + txt(BW / 2, 60, x.ret ? (z ? `→ 指令 ${x.ret}` : `→ instr ${x.ret}`) : x.cause === 'abort' ? (z ? '不再返回' : 'no return') : z ? '程序结束' : 'end', 'bt-cap');
      saved = x.ret;
    }
    if (b > 0) {
      const q = at(b - 1);
      const tone = x.lane === 'k' ? 'bad' : sim.boxes[b - 1].lane === 'k' ? 'ok' : '';
      html = arrow(q.x + BW - p.x, q.y + 22 - p.y, -3, 22, tone) + html;
    }
    items.push({ k: `b${b}`, x: p.x, y: p.y, from: [p.x, p.y + 20], html });
    mode = x.lane;
  }
  if (k >= 0) {
    const cur = sim.boxes[k];
    const entered = sim.boxes.slice(0, k + 1).filter((x) => x.lane === 'k').length;
    const sw = sim.boxes.slice(0, k + 1).filter((x, b) => x.lane === 'k' && sim.boxes[b - 1]?.lane !== 'k').length;
    const lines = [
      [z ? `PSW 模式位：${mode === 'u' ? '用户态' : '内核态'}` : `PSW mode bit: ${mode === 'u' ? 'user' : 'kernel'}`, mode === 'u' ? 'bt-lab' : 'bt-lab c-violet'],
      [cur.lane === 'k' ? (z ? `断点（保存的 PC）：${cur.ret ? `指令 ${cur.ret}` : cur.cause === 'abort' ? '用不上了' : '程序末尾'}` : `Saved PC: ${cur.ret ? `instr ${cur.ret}` : cur.cause === 'abort' ? 'unused' : 'end of program'}`) : saved ? (z ? `上次保存的断点：指令 ${saved}` : `Last saved PC: instr ${saved}`) : (z ? '还没有进过内核' : 'Not yet in the kernel'), 'bt-lab'],
      [z ? `进入内核 ${entered} 次，用户态 → 内核态切换 ${sw} 次` : `${entered} kernel entries, ${sw} user → kernel switches`, 'bt-acc'],
    ];
    items.push({ k: 'state', x: X0, y: YK + 110, html: lines.map(([s, c], i) => txt(0, i * 24, s, c, 'start')).join('') });
  }
  return items;
}

export const PRINCIPLE = {
  sections: [
    {
      id: 'os',
      title: T('操作系统是什么', 'What an OS is'),
      blocks: [
        { p: T('操作系统是管理计算机硬件和软件资源、合理组织调度计算机工作、为用户和其他软件提供接口的系统软件。它对上提供**命令接口**（联机命令、脚本）和**程序接口**（系统调用），对下管理处理机、存储器、文件和设备。', 'An OS manages hardware and software resources, schedules work and provides interfaces: **command interfaces** for users and **program interfaces** (system calls) for software, on top of the processor, memory, files and devices.') },
        {
          list: [
            T('**并发**：一段时间内多个程序同时推进（单核上是交替执行）；**并行**是同一时刻真的同时执行，需要多个处理器。', '**Concurrency**: several programs progress over a period (interleaved on one core); **parallelism** needs several processors.'),
            T('**共享**：资源可供多个并发进程使用，分为互斥共享（打印机）和同时共享（磁盘文件）。并发和共享是最基本的两个特征，互为存在条件。', '**Sharing**: mutually exclusive (printers) or simultaneous (disk files). Concurrency and sharing depend on each other.'),
            T('**虚拟**：把一个物理实体变成若干逻辑对应物，时分复用（虚拟处理器）、空分复用（虚拟存储器）。', '**Virtualisation**: time-division (virtual CPUs) and space-division (virtual memory).'),
            T('**异步**：进程走走停停，以不可预知的速度推进。', '**Asynchrony**: processes advance at unpredictable speeds.'),
          ],
        },
      ],
    },
    {
      id: 'mode',
      title: T('内核态、用户态与特权指令', 'Kernel mode, user mode and privileged instructions'),
      blocks: [
        { p: T('CPU 用程序状态字 PSW 里的一个**模式位**区分当前运行在内核态（核心态、管态）还是用户态（目态）。**特权指令**只能在内核态执行，否则会产生异常。', 'A **mode bit** in the PSW tells kernel mode from user mode. **Privileged instructions** run only in kernel mode; otherwise an exception occurs.') },
        {
          table: {
            head: [T('', ''), T('例子', 'Examples')],
            rows: [
              [T('特权指令', 'Privileged'), T('I/O 指令、开 / 关中断、设置时钟（定时器）、修改 PSW、加载页表基址寄存器、中断返回', 'I/O instructions, enable/disable interrupts, set the timer, write the PSW, load the page-table base, return from interrupt')],
              [T('非特权指令', 'Non-privileged'), T('算术逻辑运算、取数存数、**陷入指令（访管指令）**、读时钟', 'arithmetic, loads/stores, the **trap instruction**, reading the clock')],
            ],
          },
        },
        {
          list: [
            T('**用户态 → 内核态**：只能通过中断或异常（包括执行陷入指令）。这是硬件完成的，用户程序不能自己改模式位。', '**User → kernel**: only through an interrupt or exception (including the trap instruction); the hardware switches.'),
            T('**内核态 → 用户态**：内核执行一条特权指令（修改 PSW，通常就是中断返回指令）。', '**Kernel → user**: the kernel executes a privileged instruction (writing the PSW, usually return-from-interrupt).'),
          ],
        },
        { warn: T('陷入指令本身**不是**特权指令，它是在用户态执行的，执行后才进入内核态。', 'The trap instruction itself is **not** privileged; it runs in user mode and causes the switch.') },
      ],
    },
    {
      id: 'kinds',
      title: T('中断和异常的分类', 'Interrupts and exceptions'),
      blocks: [
        {
          table: {
            head: [T('类别', 'Kind'), T('来源', 'Source'), T('例子', 'Examples'), T('处理完返回到', 'Returns to')],
            rows: [
              [T('外中断（中断）', 'External interrupt'), T('CPU 外部，和当前指令无关', 'outside the CPU, unrelated to the instruction'), T('I/O 完成、时钟中断', 'I/O completion, timer'), T('下一条指令', 'the next instruction')],
              [T('陷入（trap）', 'Trap'), T('程序有意安排', 'deliberate'), T('系统调用（陷入指令）、断点', 'system calls, breakpoints'), T('下一条指令', 'the next instruction')],
              [T('故障（fault）', 'Fault'), T('错误条件，可能被内核修复', 'an error the kernel may fix'), T('缺页', 'page fault'), T('**引起故障的那条指令**（重新执行）', '**the faulting instruction** (re-executed)')],
              [T('终止（abort）', 'Abort'), T('致命错误，内核无法修复', 'fatal, unrecoverable'), T('硬件故障；用户态执行特权指令、整数除以 0 也是终止进程', 'hardware errors; illegal privileged use and divide-by-zero also kill the process'), T('不返回，终止进程', 'never returns')],
            ],
          },
        },
        { p: T('陷入、故障、终止都来自 CPU 内部、和当前指令有关，合称**内中断（异常）**。外中断是在每条指令执行完后的**中断周期**检查的；异常是在指令执行过程中发现的，可以立刻处理。', 'Traps, faults and aborts arise inside the CPU from the current instruction: **exceptions**. External interrupts are checked in the **interrupt cycle** after each instruction; exceptions are detected during execution.') },
        { warn: T('分类口径有差别：Intel 手册把除法错误归为 fault，但操作系统一般无法修复，结果都是终止进程；国内不少教材把除以 0、非法使用特权指令放在「终止」一类。做题时看清题目采用的说法。', 'Classifications vary: Intel lists divide errors as faults, but the OS cannot repair them and kills the process either way; many textbooks list them under aborts.') },
      ],
    },
    {
      id: 'flow',
      title: T('中断处理过程', 'Handling an interrupt'),
      blocks: [
        {
          steps: [
            T('**关中断**：保存断点和现场时不能被新的中断打断（硬件完成）；', '**Disable interrupts** while saving state (hardware);'),
            T('**保存断点**：把 PC（返回地址）和 PSW 保存起来（硬件完成）；', '**Save the PC and PSW** (hardware);'),
            T('**引出中断服务程序**：按中断类型号查中断向量表，把服务程序入口送进 PC，模式位置为内核态（硬件完成）；', '**Jump to the handler** through the interrupt vector table, entering kernel mode (hardware);'),
            T('**保存现场和屏蔽字**：保存通用寄存器等（服务程序完成）；', '**Save registers and the mask** (software);'),
            T('**开中断**：允许更高优先级的中断打断（多重中断才有这一步）；', '**Enable interrupts** to allow nesting (multi-level only);'),
            T('**执行中断服务**；', '**Service the interrupt**;'),
            T('**关中断 → 恢复现场和屏蔽字 → 开中断 → 中断返回**（返回指令恢复 PC 和 PSW，回到用户态）。', '**Disable → restore → enable → return** (restoring PC and PSW, back to user mode).'),
          ],
        },
        { tip: T('前三步由硬件一次完成，叫**中断隐指令**（不是一条真实的指令）。单重中断在执行服务时不开中断；多重中断在保存现场后开中断。', 'The first three steps are done by hardware as the **implicit interrupt instruction**. Single-level handlers keep interrupts off; multi-level ones re-enable after saving state.') },
      ],
    },
    {
      id: 'syscall',
      title: T('系统调用', 'System calls'),
      blocks: [
        { p: T('系统调用是操作系统给应用程序的接口：凡是和共享资源有关的操作（设备、文件、进程控制、进程通信、内存分配），都要通过系统调用请求内核完成，保证系统的稳定和安全。', 'System calls are the OS’s program interface: anything touching shared resources — devices, files, processes, IPC, memory — goes through the kernel.') },
        {
          steps: [
            T('用户程序把**系统调用号和参数**放到寄存器（或栈）里；', 'Put the **call number and arguments** in registers or on the stack;'),
            T('执行**陷入指令**（用户态），引起内中断；', 'Execute the **trap instruction** (in user mode);'),
            T('CPU 进入内核态，按调用号找到对应的处理程序并执行；', 'The CPU enters kernel mode and runs the handler for that number;'),
            T('处理完后返回用户态，从陷入指令的**下一条**继续。', 'Return to user mode at the **next** instruction.'),
          ],
        },
        { tip: T('**库函数和系统调用**：库函数是语言或应用程序的一部分，运行在用户态；有的库函数内部会使用系统调用（例如输出函数最终要调用写文件的系统调用），有的根本不用（例如求平方根）。', '**Library functions vs system calls**: libraries run in user mode; some wrap system calls (output functions call write), others never do (square root).') },
      ],
    },
    {
      id: 'link',
      title: T('程序的链接与装入', 'Linking and loading'),
      blocks: [
        { p: T('源程序经过**编译**得到目标模块，**链接**把目标模块和库函数合成装入模块，**装入**把它放进内存运行。', '**Compile** to object modules, **link** them with libraries into a load module, **load** it into memory.') },
        {
          table: {
            head: [T('链接方式', 'Linking'), T('什么时候', 'When')],
            rows: [
              [T('静态链接', 'Static'), T('运行前就链接成一个完整的装入模块，以后不再拆开', 'before running, into one complete module')],
              [T('装入时动态链接', 'Load-time dynamic'), T('装入内存时边装入边链接', 'while loading')],
              [T('运行时动态链接', 'Run-time dynamic'), T('运行中需要某个模块时才链接，便于修改和共享', 'when a module is first needed; easy to update and share')],
            ],
          },
        },
        {
          table: {
            head: [T('装入方式', 'Loading'), T('地址什么时候变成物理地址', 'When addresses become physical'), T('特点', 'Notes')],
            rows: [
              [T('绝对装入', 'Absolute'), T('编译时', 'at compile time'), T('只适合单道程序环境', 'single-program systems only')],
              [T('可重定位装入（静态重定位）', 'Relocatable (static relocation)'), T('装入时一次性修改', 'once, at load time'), T('要一次分配全部连续空间，运行中不能移动', 'needs all space at once; cannot move later')],
              [T('动态运行时装入（动态重定位）', 'Dynamic run-time (dynamic relocation)'), T('执行时借助重定位寄存器转换', 'at run time via a relocation register'), T('程序可以在内存中移动，可以不连续分配', 'programs can move; non-contiguous allocation possible')],
            ],
          },
        },
      ],
    },
    {
      id: 'struct',
      title: T('操作系统的结构与引导', 'Structure and booting'),
      blocks: [
        {
          list: [
            T('**宏内核（大内核）**：主要功能都在内核里运行，模块间直接调用，性能高，但内核庞大、不易维护。', '**Monolithic kernels** keep most services in kernel mode: fast but large.'),
            T('**微内核**：内核只保留最基本的功能（时钟、中断、进程通信、底层内存管理等），其余作为用户态的服务进程，通过消息传递交互；可靠、易扩展，但用户态和内核态切换频繁，性能较低。', '**Microkernels** keep only the essentials (clock, interrupts, IPC, low-level memory) and run the rest as user-mode servers; robust but slower due to frequent switches.'),
            T('**分层结构、模块化结构、外核**：分层便于调试验证但效率低；模块化各模块可以直接通信。', '**Layered, modular and exokernel** designs trade structure against efficiency.'),
            T('**引导**：开机后 CPU 执行 ROM 里的引导程序（BIOS 或 UEFI，含自检）→ 读磁盘的主引导记录 → 找到活动分区，执行分区引导记录 → 加载操作系统内核。', '**Booting**: firmware in ROM (BIOS/UEFI with self-test) → master boot record → active partition’s boot record → load the kernel.'),
          ],
        },
      ],
    },
    {
      id: 'history',
      title: T('操作系统的发展与分类', 'History and kinds of operating systems'),
      blocks: [
        {
          table: {
            head: [T('阶段', 'Stage'), T('做法', 'How it works'), T('好处 / 问题', 'Gains / problems')],
            rows: [
              [T('手工操作', 'Manual operation'), T('用户自己装纸带、卡片，独占整台机器', 'one user owns the machine'), T('人慢机器快，资源大量闲置', 'the machine idles while people work')],
              [T('单道批处理', 'Single-stream batch'), T('监督程序把一批作业自动依次装入运行，内存里只有一道', 'a monitor runs jobs one after another'), T('省掉了人工操作；但作业等 I/O 时 CPU 只能空等', 'no manual steps, but the CPU waits during I/O')],
              [T('多道批处理', 'Multiprogrammed batch'), T('内存里同时放几道作业，一道等 I/O 时 CPU 去运行另一道', 'several jobs in memory; the CPU switches when one waits'), T('宏观并行、微观串行，利用率和吞吐量高；但不能交互，周转时间长', 'high utilisation; no interaction, long turnaround')],
              [T('分时系统', 'Time-sharing'), T('CPU 按时间片轮流给多个终端用户服务', 'time slices rotate among terminal users'), T('同时性、交互性、独立性、及时性；但不适合紧急任务', 'interactive and responsive; not for hard deadlines')],
              [T('实时系统', 'Real-time'), T('在规定的时限内必须完成处理；分硬实时和软实时', 'work must finish within deadlines (hard or soft)'), T('及时性、可靠性第一，资源利用率其次', 'timeliness and reliability come first')],
            ],
          },
        },
        { p: T('此外还有网络操作系统、分布式操作系统、个人计算机操作系统和嵌入式操作系统等。', 'There are also network, distributed, personal and embedded systems.') },
        { tip: T('多道程序设计要靠两样硬件：**中断**（让 CPU 能在作业之间切换）和**通道 / DMA**（让 I/O 和 CPU 并行）。', 'Multiprogramming needs **interrupts** and **channels / DMA**.') },
      ],
    },
    {
      id: 'vm',
      title: T('虚拟机', 'Virtual machines'),
      blocks: [
        { p: T('虚拟机把一台物理机器虚拟成几台，每台上面可以运行自己的操作系统。做这件事的软件叫**虚拟机管理程序**（VMM，Hypervisor）。', 'A virtual machine monitor (hypervisor) makes one machine look like several, each running its own OS.') },
        {
          table: {
            head: ['', T('第一类 VMM（裸机型）', 'Type 1 (bare metal)'), T('第二类 VMM（寄居型）', 'Type 2 (hosted)')],
            rows: [
              [T('运行在哪里', 'Runs on'), T('直接运行在硬件上，相当于一个操作系统', 'the hardware, like an OS'), T('作为普通进程运行在宿主操作系统上', 'a host OS, as a process')],
              [T('谁控制硬件', 'Controls hardware'), T('VMM 自己，运行在最高特权级', 'the VMM, at the highest privilege'), T('宿主操作系统', 'the host OS')],
              [T('性能', 'Performance'), T('好', 'good'), T('差一些，多一层转手', 'worse: one more layer')],
              [T('迁移', 'Migration'), T('要和硬件配合', 'tied to the hardware'), T('方便，搬一个文件就行', 'easy: move a file')],
            ],
          },
        },
        { warn: T('客户操作系统的内核以为自己在内核态，其实运行在用户态（虚拟内核态）。它执行特权指令时会陷入 VMM，由 VMM 模拟执行。', 'Guest kernels run in user mode (virtual kernel mode); their privileged instructions trap to the VMM, which emulates them.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('陷入指令在用户态执行，不是特权指令；「执行系统调用的处理程序」才是在内核态。', 'The trap instruction runs in user mode; the handler runs in kernel mode.'),
            T('缺页属于故障，返回后重新执行引起缺页的那条指令；系统调用返回到下一条。', 'A page fault returns to the same instruction; a system call to the next.'),
            T('外中断要等当前指令执行完才响应；异常在指令执行中就发现。', 'External interrupts wait for the instruction to finish; exceptions are found during it.'),
            T('中断隐指令保存的是 PC 和 PSW；通用寄存器由中断服务程序保存。', 'The hardware saves PC and PSW; the handler saves the general registers.'),
            T('进程切换一定发生在内核态；但从用户态进入内核态不一定会切换进程。', 'Process switches happen in kernel mode, but entering the kernel does not imply a switch.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('执行过程', 'Execution') });

function stepOf(sim, b) {
  const x = sim.boxes[b];
  const next = sim.boxes[b + 1];
  if (x.lane === 'u') {
    if (x.retry) return { title: T(`重新执行指令 ${x.i}`, `Re-run instruction ${x.i}`), desc: T('这次页已在内存', 'The page is now present'), detail: T(`回到用户态后，CPU 从断点——也就是指令 ${x.i} 本身——重新开始，这次需要的页已经在内存里，指令正常执行完。`, `Back in user mode the CPU restarts at the saved PC, instruction ${x.i} itself; the page is present now and it completes.`), ref: 'kinds', row: { color: 'green', what: T(`指令 ${x.i}`, `Instr ${x.i}`), result: T('重新执行', 're-run'), tone: 'ok' } };
    if (x.t === 'add') return { title: T(`执行指令 ${x.i}`, `Execute instruction ${x.i}`), desc: T('用户态 · 普通指令', 'User mode · normal'), detail: T(`用户态下执行普通指令。执行完后在中断周期检查有没有外部中断请求，没有就接着取下一条。`, 'A normal instruction in user mode. Afterwards the interrupt cycle checks for pending interrupts.'), ref: 'mode', row: { color: 'slate', what: T(`指令 ${x.i}`, `Instr ${x.i}`), result: T('用户态', 'user'), tone: 'info' } };
    if (x.t === 'syscall') return { title: T(`指令 ${x.i}：陷入指令`, `Instruction ${x.i}: trap`), desc: T('在用户态执行，引起内中断', 'Runs in user mode, raises an exception'), detail: T('程序先把系统调用号和参数放进寄存器，再执行陷入指令（访管指令）。陷入指令本身不是特权指令，在用户态执行；它的作用就是引起一次内中断，让 CPU 转入内核态。', 'The program loads the call number and arguments, then executes the trap instruction. It is not privileged and runs in user mode; its job is to raise an exception that enters the kernel.'), ref: ['syscall', 'mode'], row: { color: 'amber', what: T(`指令 ${x.i}`, `Instr ${x.i}`), result: T('陷入', 'trap'), tone: 'info' } };
    if (x.t === 'pf') return { title: T(`指令 ${x.i}：访问的页不在内存`, `Instruction ${x.i}: page not present`), desc: T('指令没执行完就产生缺页异常', 'Faults before completing'), detail: T('访存时查页表，发现这一页的存在位为 0，产生缺页异常。注意这条指令没有执行完。', 'The page-table entry’s present bit is 0, so a page fault is raised. The instruction has not completed.'), ref: 'kinds', row: { color: 'violet', what: T(`指令 ${x.i}`, `Instr ${x.i}`), result: T('缺页', 'page fault'), tone: 'warn' } };
    return x.t === 'priv'
      ? { title: T(`指令 ${x.i}：用户态执行特权指令`, `Instruction ${x.i}: privileged in user mode`), desc: T('非法操作，产生异常', 'Illegal: exception'), detail: T('CPU 译码时发现这是特权指令，而 PSW 的模式位是用户态，于是不执行它，产生一个异常。', 'The CPU sees a privileged instruction while the PSW says user mode, refuses it and raises an exception.'), ref: 'mode', row: { color: 'rose', what: T(`指令 ${x.i}`, `Instr ${x.i}`), result: T('非法', 'illegal'), tone: 'warn' } }
      : { title: T(`指令 ${x.i}：整数除以 0`, `Instruction ${x.i}: divide by zero`), desc: T('运算出错，产生异常', 'Arithmetic error: exception'), detail: T('运算部件发现除数为 0，产生异常。', 'The ALU detects a zero divisor and raises an exception.'), ref: 'kinds', row: { color: 'rose', what: T(`指令 ${x.i}`, `Instr ${x.i}`), result: T('除以 0', 'divide by 0'), tone: 'warn' } };
  }
  const chain = next?.lane === 'k' ? T('处理完先不回用户态，接着处理下一个。', ' Then it handles the next event before returning.') : null;
  const back = (r) => (r ? T(`执行中断返回指令（特权指令），恢复 PC 和 PSW，回到用户态，从指令 ${r} 继续。`, ` Return-from-interrupt restores PC and PSW: back to user mode at instruction ${r}.`) : T('程序已经没有下一条指令，返回后就结束了。', ' The program has no further instructions.'));
  const tail = chain ?? back(x.ret);
  const join = (a, c) => ({ zh: a.zh + c.zh, en: a.en + c.en });
  if (x.cause === 'trap') return { title: T(`进入内核：系统调用（返回 → 指令 ${x.ret ?? '—'}）`, `Kernel: system call (→ ${x.ret ?? '—'})`), desc: T(`陷入 · 断点是下一条指令 ${x.ret ?? '（无）'}`, `Trap · saved PC = next instruction ${x.ret ?? '(none)'}`), detail: join(T(`陷入属于内中断：硬件保存断点（下一条指令 ${x.ret ?? '——程序末尾'}）和 PSW，把模式位置为内核态，按中断向量转到系统调用的总入口，再按调用号找到具体的处理程序完成服务。`, `A trap is an exception: hardware saves the PC (the next instruction) and PSW, switches to kernel mode and jumps to the system-call entry, which dispatches on the call number.`), tail), ref: ['syscall', 'flow'], facts: [[T('类别', 'Kind'), CAUSE.trap.kind], [T('断点', 'Saved PC'), x.ret ? T(`指令 ${x.ret}`, `instr ${x.ret}`) : '—']], row: { color: 'amber', what: T('系统调用', 'System call'), result: T('内核态', 'kernel'), tone: 'info' } };
  if (x.cause === 'irq') {
    const when = x.after ? T(`中断请求在指令 ${x.after} 执行期间到达，但 CPU 只在一条指令执行完后的中断周期检查中断，所以指令 ${x.after} 先执行完。`, `The request arrived during instruction ${x.after}, but interrupts are checked only after an instruction completes, so ${x.after} finishes first.`) : T('程序第一条指令之前就有中断请求，在第一次检查时响应。', 'The request was already pending before the first instruction.');
    return { title: T(`外部中断：在指令 ${x.after || '—'} 执行完后响应`, `Interrupt after instruction ${x.after || '—'}`), desc: T(`外中断 · 断点是指令 ${x.ret ?? '（无）'}`, `External · saved PC = ${x.ret ?? '(none)'}`), detail: join(join(when, T('随后关中断、保存断点和 PSW、转到中断服务程序，处理 I/O 完成或时钟到时等事件。', ' Then interrupts are disabled, PC and PSW saved, and the handler runs (I/O completion, timer).')), tail), ref: ['kinds', 'flow'], facts: [[T('类别', 'Kind'), CAUSE.irq.kind], [T('断点', 'Saved PC'), x.ret ? T(`指令 ${x.ret}`, `instr ${x.ret}`) : '—']], row: { color: 'blue', what: T('外部中断', 'Interrupt'), result: T('内核态', 'kernel'), tone: 'info' } };
  }
  if (x.cause === 'fault') return { title: T(`缺页处理：调页后返回指令 ${x.ret}`, `Page fault: load the page, return to ${x.ret}`), desc: T(`故障 · 断点是指令 ${x.ret} 本身`, `Fault · saved PC = instruction ${x.ret} itself`), detail: join(T(`缺页属于故障：断点保存的是引起缺页的这条指令（指令 ${x.ret}）的地址，而不是下一条。内核找一个空闲页框（没有就按置换算法换出一页），从外存把页调入，修改页表。`, `A page fault is a fault: the saved PC is the faulting instruction ${x.ret} itself. The kernel finds a frame (evicting if needed), reads the page and updates the page table.`), tail), ref: 'kinds', facts: [[T('类别', 'Kind'), CAUSE.fault.kind], [T('断点', 'Saved PC'), T(`指令 ${x.ret}`, `instr ${x.ret}`)]], row: { color: 'violet', what: T('缺页处理', 'Page fault'), result: T(`返回 ${x.ret}`, `→ ${x.ret}`), tone: 'info' } };
  return { title: T('终止进程', 'Process terminated'), desc: T('无法修复，不再返回', 'Unrecoverable, no return'), detail: T(`这种错误内核没法修复，不会再回到这个程序：内核终止该进程，回收它的资源，再调度别的进程运行。${sim.skipped ? `后面的 ${sim.skipped} 条指令不会再执行。` : ''}`, `The kernel cannot repair this, so it never returns: the process is terminated, its resources reclaimed, and another process scheduled.${sim.skipped ? ` The remaining ${sim.skipped} instruction(s) never run.` : ''}`), ref: 'kinds', facts: [[T('类别', 'Kind'), CAUSE.abort.kind]], row: { color: 'rose', what: T('终止进程', 'Kill'), result: T('不返回', 'no return'), tone: 'warn' } };
}

function build(params) {
  const prog = parseProg(params.prog);
  const sim = run({ prog });
  const lesson = {
    id: 'interrupt',
    kit,
    where: [['os', 'basics'], ['co', 'cpu']],
    tag: T('中断', 'IRQ'),
    name: T('中断、异常与系统调用', 'Interrupts, exceptions and system calls'),
    full: T('内核态 / 用户态 · 特权指令 · 中断分类 · 中断处理过程 · 系统调用 · 链接与装入', 'Modes · privileged instructions · interrupt kinds · handling · system calls · linking and loading'),
    title: T(`${sim.ok ? sim.total : '?'} 条指令`, `${sim.ok ? sim.total : '?'} instructions`),
    badge: T('用户态 ⇄ 内核态', 'User ⇄ kernel'),
    nodes: [],
    legend: [
      ['amber', T('陷入', 'Trap')],
      ['blue', T('外中断', 'Interrupt')],
      ['violet', T('故障', 'Fault')],
      ['rose', T('终止', 'Abort')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '用户程序一条条执行，遇到系统调用、外部中断、缺页、非法操作时，CPU 要从用户态进入内核态。这节课把程序画在「用户态」「内核态」两条泳道上，一步步看每次进内核的原因、断点保存的是哪条指令、处理完回到哪里（或者再也回不来）。',
        'A user program runs instruction by instruction; system calls, interrupts, page faults and illegal operations send the CPU into kernel mode. Two lanes, user and kernel, show why each entry happens, which PC is saved and where execution resumes — if at all.',
      ),
      facts: sim.ok ? [[T('指令序列', 'Program'), sim.prog.join(' ')]] : [],
    },
    start: { nodes: [], frame: { rect: [0, 120, X0 + Math.max(sim.ok ? sim.boxes.length : 4, 5) * SLOT + 30, YK + 190] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.boxes.map((_, b) => stepOf(sim, b));
  const built = toSteps(list, (k, z) => board(sim, k, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: sim.killed ? T('进程被终止', 'Process terminated') : T('程序执行完', 'Program finished'),
    text: T('改一下指令序列：把 irq 挪到不同位置，或者把 pf 换成 syscall，看断点和返回位置怎么变。', 'Edit the program: move irq around or swap pf for syscall and watch the saved PC change.'),
    facts: [
      [T('执行完的指令', 'Completed'), `${sim.done} / ${sim.total}`],
      [T('进入内核', 'Kernel entries'), String(sim.entries)],
      [T('用户态 → 内核态', 'User → kernel'), String(sim.switches)],
    ],
  };
  return lesson;
}

export const makeInterrupt = () => parametric('interrupt', SPEC.presets[0].set, build);
