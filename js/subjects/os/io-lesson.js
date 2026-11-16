// I/O 管理的两节课：「I/O 控制方式」（CPU 占比的对比）和「缓冲：单缓冲与双缓冲」（时间线）。
import { bar, line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { buffer, ctrl } from './io.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const pct = (x) => `${+(x * 100).toFixed(4)}%`;
const us = (s) => `${+(s * 1e6).toFixed(4)}μs`;

// ═════════════════════════ I/O 控制方式 ═════════════════════════

const CTRL_SPEC = {
  presets: [
    { label: T('2MB/s 外设', '2 MB/s device'), set: { rate: 2097152, word: 4, block: 4096, tInt: 0.5, tDma: 5 } },
    { label: T('慢速外设 4KB/s', 'Slow 4 KB/s device'), set: { rate: 4096, word: 1, block: 1024, tInt: 10, tDma: 20 } },
    { label: T('高速外设 40MB/s', 'Fast 40 MB/s device'), set: { rate: 41943040, word: 4, block: 8192, tInt: 0.5, tDma: 5 } },
  ],
  groups: [
    {
      legend: T('外设与开销', 'Device and overheads'),
      fields: [
        { name: 'rate', label: T('外设传输速率（B/s）', 'Device rate (B/s)'), type: 'int', min: 1, max: 1e10, wide: true },
        { name: 'word', label: T('中断方式每次传输（B）', 'Bytes per interrupt'), type: 'int', min: 1, max: 1024 },
        { name: 'block', label: T('DMA 每块大小（B）', 'DMA block (B)'), type: 'int', min: 1, max: 1048576 },
        { name: 'tInt', label: T('每次中断的 CPU 开销（μs）', 'CPU cost per interrupt (μs)'), type: 'text', parse: (s) => (/^\d+(\.\d+)?$/.test(s) && +s > 0 ? +s : NaN) },
        { name: 'tDma', label: T('每块 DMA 的 CPU 开销（μs）', 'CPU cost per DMA block (μs)'), type: 'text', parse: (s) => (/^\d+(\.\d+)?$/.test(s) && +s > 0 ? +s : NaN) },
      ],
    },
  ],
  note: T(
    '外设以给定速率连续传输。程序查询方式下 CPU 一直在查询，占用 100%。中断方式每传一个字中断一次，DMA 方式每传一块才中断一次；每次中断的开销里已经包括了中断响应和中断服务程序。占比 = 每秒的中断次数 × 每次的开销。',
    'The device streams at the given rate. Polling keeps the CPU busy 100% of the time. Interrupt-driven I/O interrupts once per word, DMA once per block; each cost includes response and service. Share = interrupts per second × cost each.',
  ),
};
const CTRL_ERR = {
  rate: T('传输速率要大于 0', 'The rate must be positive'),
  word: T('每次传输的字节数要大于 0', 'Bytes per interrupt must be positive'),
  block: T('DMA 块不能比一个字还小', 'The DMA block cannot be smaller than a word'),
  tInt: T('中断开销要大于 0', 'Interrupt cost must be positive'),
  tDma: T('DMA 开销要大于 0', 'DMA cost must be positive'),
};

// 画法：同一段时间（外设传完一个 DMA 块所需的时间）里，CPU 的时间线被 I/O 占去多少。
// 程序查询整条都占满；中断方式是密密麻麻的细条（每传一个字一次），下面再放大看开头几个字；
// DMA 只在最后有一条细线。占比就是彩色部分占整条的比例。
function ctrlBoard(sim, k, z) {
  const items = [];
  const W = 560;
  const X = 170;
  const win = sim.block / sim.rate; // 秒
  const nInt = sim.block / sim.word;
  const gap = sim.word / sim.rate; // 两次中断之间
  items.push({ k: 'win', x: X, y: 108, html: txt(0, 0, z ? `同一段时间：外设传完一块 ${sim.block} B 要 ${us(win)}，看 CPU 有多少时间花在这台外设上` : `Same window: ${us(win)} for one ${sim.block}-byte block`, 'bt-cap', 'start') });
  const row = (i, key, lab, tone, inner, share) => {
    if (i > k) return;
    const y = 150 + i * 120;
    let s = txt(-14, 22, lab, 'bt-lab', 'end') + `<rect class="memcol" x="0" y="0" width="${W}" height="34" rx="4"/>` + inner;
    s += txt(W + 14, 22, share > 1 ? (z ? `${pct(share)}：忙不过来` : `${pct(share)}: overloaded`) : pct(share), i === k ? 'bt-formula cur' : 'bt-formula', 'start');
    items.push({ k: `r-${key}`, x: X, y, cls: i === k ? 'is-cur' : '', html: s });
  };
  // 程序查询：整条
  row(0, 'poll', z ? '程序查询' : 'Polling', 'rose', cell(W, 34, z ? 'CPU 一直在查外设状态' : 'CPU polls all the time', { tone: 'rose', size: 12 }), 1);
  // 中断：细条，一条代表若干次中断
  {
    const show = Math.min(nInt, 120);
    const per = nInt / show;
    const slot = W / show;
    const busy = Math.min(1, sim.tInt / gap) * slot;
    let inner = '';
    for (let j = 0; j < show; j++) inner += `<rect class="io-int" x="${j * slot + slot - Math.max(busy, 1.2)}" y="0" width="${Math.max(busy, 1.2)}" height="34"/>`;
    row(1, 'int', z ? '中断' : 'Interrupt', 'amber', inner, sim.intShare);
    if (k >= 1) {
      // 放大：开头几个字
      const m = Math.min(6, nInt);
      const zs = W / (m * gap);
      let zh = txt(-14, 14, z ? `放大看` : `zoom`, 'bt-idx', 'end') + `<rect class="memcol" x="0" y="0" width="${W}" height="22" rx="3"/>`;
      for (let j = 0; j < m; j++) {
        const x1 = (j + 1) * gap * zs;
        const w = Math.min(sim.tInt, gap) * zs;
        zh += `<rect class="io-int" x="${x1 - w}" y="0" width="${w}" height="22"/>` + line(x1, -4, x1, 26, 'pp-grid');
        if (j === 0) zh += txt(W, 40, z ? `每传一个字 ${us(gap)}，其中中断处理 ${us(sim.tInt)}（琥珀色）` : `each word ${us(gap)}, of which ${us(sim.tInt)} interrupt`, 'cw-lab cw-w', 'end');
      }
      items.push({ k: 'zoom', x: X, y: 150 + 120 + 50, html: zh });
      items.push({ k: 'intn', x: X, y: 150 + 120 - 8, html: txt(0, 0, z ? `每 ${sim.word} B 中断一次，这段时间里中断 ${nInt} 次${per > 1 ? `（一条细线代表 ${+per.toFixed(2)} 次）` : ''}` : `${nInt} interrupts in this window`, 'bt-idx', 'start') });
    }
  }
  // DMA：最后一条细线
  {
    const w = Math.max((sim.tDma / win) * W, 1.5);
    row(2, 'dma', 'DMA', 'green', `<rect class="io-dma" x="${W - w}" y="0" width="${w}" height="34"/>`, sim.dmaShare);
    if (k >= 2) items.push({ k: 'dman', x: X, y: 150 + 240 + 52, html: txt(W, 0, z ? `整块传完才中断一次，${us(sim.tDma)}；数据不经过 CPU` : `one interrupt per block, ${us(sim.tDma)}`, 'cw-lab', 'end') });
  }
  return items;
}

export const CTRL_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么 I/O 控制方式一直在演进', 'Why I/O control evolved'),
      blocks: [
        { p: T('CPU 比外设快几个数量级。I/O 控制方式演进的方向只有一个：**让 CPU 少管 I/O**，把更多时间留给计算，让 CPU 和外设尽量并行工作。', 'The CPU is orders of magnitude faster than devices. I/O control evolved in one direction: **involve the CPU less**, leaving it free to compute in parallel with the device.') },
      ],
    },
    {
      id: 'modes',
      title: T('四种控制方式', 'Four methods'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Method'), T('CPU 什么时候介入', 'CPU involvement'), T('数据怎么走', 'Data path'), T('CPU 和外设并行', 'Parallel')],
            rows: [
              [T('程序直接控制（查询）', 'Programmed (polling)'), T('一直循环查询外设状态，直到传完', 'loops checking the status throughout'), T('外设 → CPU 寄存器 → 内存，每次一个字', 'device → register → memory, a word at a time'), T('不并行，CPU 忙等', 'no, busy waiting')],
              [T('中断驱动', 'Interrupt-driven'), T('每传完一个字中断一次', 'once per word'), T('外设 → CPU 寄存器 → 内存', 'device → register → memory'), T('部分并行', 'partly')],
              [T('DMA', 'DMA'), T('只在一块数据**开始和结束**时介入', 'only at the **start and end** of a block'), T('外设 → 内存，**不经过 CPU**', 'device → memory directly'), T('并行程度高', 'highly')],
              [T('通道', 'Channel'), T('只在一组数据块开始和结束时介入', 'once per group of blocks'), T('通道执行通道程序，直接控制外设和内存', 'the channel runs a channel program'), T('并行程度最高', 'most')],
            ],
          },
        },
        { tip: T('DMA 控制器里有：命令 / 状态寄存器 CR、内存地址寄存器 MAR、数据寄存器 DR、数据计数器 DC。DMA 传送一块之前，CPU 要告诉它读还是写、内存从哪个地址开始、传多少字节。', 'A DMA controller holds a command/status register, a memory-address register, a data register and a counter; the CPU sets direction, start address and byte count before each block.') },
        { warn: T('**通道**是一种专门做 I/O 的处理机，但它的指令单一、没有自己的内存（通道程序放在主存里），和 CPU 共享内存，所以不能完全独立工作。', 'A **channel** is a dedicated I/O processor with a limited instruction set and no memory of its own (its program lives in main memory).') },
      ],
    },
    {
      id: 'calc',
      title: T('CPU 占比怎么算', 'Computing the CPU share'),
      blocks: [
        { formula: T('CPU 占比 = 每秒中断次数 × 每次中断的 CPU 开销', 'share = interrupts per second × cost per interrupt') },
        {
          list: [
            T('中断方式：每秒中断次数 = 传输速率 ÷ 每次传输的字节数。', 'Interrupt-driven: interrupts/s = rate ÷ bytes per interrupt.'),
            T('DMA 方式：每秒中断次数 = 传输速率 ÷ 块大小。', 'DMA: interrupts/s = rate ÷ block size.'),
          ],
        },
        { p: T('因为 DMA 每次中断搬的数据多几百上千倍，所以即使每次开销更大，总占比也小得多。外设越快，中断方式的占比越高，甚至超过 100%（CPU 来不及处理，数据会丢），这时必须用 DMA。', 'DMA moves hundreds of times more data per interrupt, so its share is far smaller even with a higher cost each. Fast devices can push interrupt-driven I/O past 100% (data would be lost); DMA is then mandatory.') },
        { warn: T('单位要统一：MB/s 里的 M 在这里按 2^20 算还是 10^6 算，要看题目；μs、ns 换算成秒再乘。', 'Watch the units: whether M means 2^20 or 10^6 depends on the question; convert μs and ns to seconds.') },
      ],
    },
    {
      id: 'layers',
      title: T('I/O 软件的层次', 'Layers of I/O software'),
      blocks: [
        {
          steps: [
            T('**用户层 I/O 软件**：库函数、系统调用接口，例如 printf；', '**User-level**: libraries and system-call wrappers such as printf;'),
            T('**设备独立性软件**：逻辑设备名到物理设备的映射、缓冲、设备分配与回收、出错处理；', '**Device-independent software**: naming, buffering, allocation, error handling;'),
            T('**设备驱动程序**：把上层的命令翻译成具体设备能懂的操作，每类设备一个；', '**Device drivers**: translate commands for one kind of device;'),
            T('**中断处理程序**：I/O 完成后被中断唤醒，处理结果。', '**Interrupt handlers**: run when the I/O completes.'),
          ],
        },
        { tip: T('判断「某件事是哪一层做的」：和具体设备有关的（比如设置设备寄存器）是驱动程序；和设备无关的（比如逻辑名映射、缓冲管理）是设备独立性软件。', 'To place a task: device-specific work (writing device registers) is the driver; generic work (name mapping, buffering) is device-independent software.') },
      ],
    },
    {
      id: 'devices',
      title: T('I/O 设备的分类与接口', 'Device classes and interfaces'),
      blocks: [
        {
          table: {
            head: [T('分类方法', 'By'), T('类别', 'Classes')],
            rows: [
              [T('使用特性', 'Use'), T('人机交互设备（键盘、显示器）、存储设备（磁盘）、网络通信设备（网卡）', 'human interface, storage, network')],
              [T('传输速率', 'Speed'), T('低速（键盘、鼠标）、中速（打印机）、高速（磁盘、网卡）', 'low, medium, high')],
              [T('信息交换单位', 'Unit'), T('**块设备**：以数据块为单位，可寻址，如磁盘；**字符设备**：以字符为单位，不可寻址，常用中断方式，如键盘、打印机', '**block devices** (addressable, e.g. disks) and **character devices** (e.g. keyboards)')],
            ],
          },
        },
        { p: T('**设备控制器**（I/O 接口）在 CPU 和设备之间：对 CPU 一侧有**数据寄存器、控制寄存器、状态寄存器**；对设备一侧有设备接口；中间是 I/O 逻辑，负责识别地址、执行命令。', 'A **device controller** sits between CPU and device: **data, control and status registers** on the CPU side, a device interface on the other, and I/O logic between.') },
        { list: [
          T('**统一编址**（存储器映射 I/O）：控制器的寄存器占用内存地址，用普通的访存指令读写。', '**Memory-mapped I/O**: registers share the memory address space.'),
          T('**独立编址**：寄存器有单独的 I/O 端口号，要用专门的 I/O 指令（是特权指令）。', '**Port-mapped I/O**: separate port numbers and special (privileged) I/O instructions.'),
        ] },
      ],
    },
    {
      id: 'blocking',
      title: T('阻塞 I/O 与非阻塞 I/O', 'Blocking and non-blocking I/O'),
      blocks: [
        {
          table: {
            head: ['', T('阻塞 I/O', 'Blocking'), T('非阻塞 I/O', 'Non-blocking')],
            rows: [
              [T('数据还没准备好时', 'Data not ready'), T('进程被挂起（阻塞态），等 I/O 完成后被唤醒', 'the process blocks until completion'), T('系统调用立刻返回一个「还没好」的结果', 'the call returns at once with “not yet”')],
              [T('进程要做的', 'The process'), T('什么都不用做，等着', 'just waits'), T('过一会儿再问（轮询），期间可以干别的', 'polls later, doing other work meanwhile')],
              [T('典型用途', 'Typical'), T('大多数读写操作', 'most reads and writes'), T('同时照看很多连接（网络服务器）', 'servers watching many connections')],
            ],
          },
        },
        { tip: T('还有**异步 I/O**：发出请求后立即返回，I/O 全部完成后系统再通知进程（信号或回调），进程不用自己去问。', '**Asynchronous I/O** returns at once and notifies the process when everything is done.') },
      ],
    },
    {
      id: 'alloc',
      title: T('设备分配与回收', 'Allocating devices'),
      blocks: [
        { p: T('系统用四张表管理设备：**系统设备表 SDT**（整个系统一张，每个设备一项）、**设备控制表 DCT**（每个设备一张，记状态、指向控制器）、**控制器控制表 COCT**（每个控制器一张，指向通道）、**通道控制表 CHCT**（每个通道一张）。', 'Four tables: the **system device table**, a **device control table** per device, a **controller table** per controller and a **channel table** per channel.') },
        { steps: [
          T('按进程给的设备名在 SDT 里找到设备的 DCT；设备忙就把进程挂到设备的等待队列上，空闲且分配是安全的就分配设备；', 'Find the DCT through the SDT; if busy, queue; otherwise allocate if safe;'),
          T('由 DCT 找到控制器的 COCT，空闲就分配，否则排队；', 'then the controller via the COCT;'),
          T('由 COCT 找到通道的 CHCT，空闲就分配，否则排队。三样都分到了才能启动 I/O。', 'then the channel via the CHCT; only with all three can I/O start.'),
        ] },
        { list: [
          T('**设备独立性**：进程用**逻辑设备名**申请，系统通过**逻辑设备表 LUT** 映射到物理设备。好处是换设备不用改程序，也方便分配。', '**Device independence**: processes ask by logical name; the **logical unit table** maps it to a physical device.'),
          T('**分配方式**：静态分配（运行前一次分配全部设备，不会死锁，利用率低）、动态分配（运行中按需分配）。', '**Static** allocation (all at once, no deadlock) vs **dynamic** allocation.'),
          T('**安全分配**：进程发出 I/O 请求后就阻塞，直到完成才继续，破坏了「请求和保持」，不会死锁；**不安全分配**：发出请求后继续运行，还能再请求别的设备，效率高但可能死锁。', '**Safe** allocation blocks after each request (no deadlock); **unsafe** allocation lets the process keep requesting.'),
          T('**回收**：用完后释放通道、控制器、设备，并唤醒在队列里等的进程。', '**Release** frees the channel, controller and device and wakes waiters.'),
        ] },
        { tip: T('独占设备（打印机）分配给一个进程后别人不能用；共享设备（磁盘）可以同时分给多个进程，交替访问；用 SPOOLing 可以把独占设备变成「虚拟设备」。', 'Dedicated devices serve one process; shared devices interleave; SPOOLing makes dedicated devices virtual.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('DMA 的数据**不经过 CPU**，但 DMA 开始前和结束后 CPU 还是要介入（预处理和中断后处理）。', 'DMA data **bypasses the CPU**, but the CPU still sets it up and handles the completion interrupt.'),
            T('中断方式每个字中断一次，DMA 每个块中断一次。', 'Interrupt-driven: one interrupt per word; DMA: one per block.'),
            T('程序查询方式 CPU 和外设串行工作，占比 100%（不是 0）。', 'Polling is serial: 100% of the CPU, not 0.'),
          ],
        },
      ],
    },
  ],
};

const ctrlKit = stepKit({ spec: CTRL_SPEC, rowsName: T('计算步骤', 'Steps') });

function buildCtrl(params) {
  const sim = ctrl({ ...params, tInt: params.tInt * 1e-6, tDma: params.tDma * 1e-6 });
  const lesson = {
    id: 'io-ctrl',
    kit: ctrlKit,
    where: [['os', 'io'], ['co', 'bus']],
    tag: 'DMA',
    name: T('I/O 控制方式', 'I/O control methods'),
    full: T('程序查询 · 中断 · DMA · 通道 · CPU 占比 · I/O 软件层次', 'Polling · interrupts · DMA · channels · CPU share · software layers'),
    title: T(`外设 ${params.rate} B/s`, `${params.rate} B/s device`),
    badge: T('CPU 占比', 'CPU share'),
    nodes: [],
    legend: [
      ['rose', T('程序查询', 'Polling')],
      ['amber', T('中断', 'Interrupt')],
      ['green', 'DMA'],
    ],
    principle: CTRL_PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(CTRL_ERR, sim.errors),
    overview: {
      desc: T(
        '同一台外设，用程序查询、中断、DMA 三种方式控制，CPU 花在它身上的时间差别巨大。这节课取同一段时间（外设传完一块数据的时间），画出三种方式下 CPU 的时间线：查询方式整条被占满，中断方式被一次次打断，DMA 只在最后停一下。为什么高速外设一定要用 DMA，看一眼就明白。',
        'The same device driven by polling, interrupts or DMA costs the CPU wildly different amounts of time. Given the rate and per-interrupt costs, this lesson draws the CPU timeline over one block for each method and shows why fast devices need DMA.',
      ),
      facts: [],
    },
    start: { nodes: [], frame: { rect: [20, 80, 900, 480] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [
    {
      title: T('程序查询：CPU 占比 100%', 'Polling: 100% of the CPU'),
      desc: T('CPU 一直在查外设好了没有', 'The CPU keeps checking the device'),
      detail: T('程序查询方式下，CPU 发出 I/O 命令后就不停地读外设的状态寄存器，直到传完。整个传输期间 CPU 什么别的也干不了，占比 100%。', 'With polling the CPU reads the status register over and over until the transfer ends; it does nothing else, 100%.'),
      ref: 'modes',
      row: { color: 'rose', what: T('程序查询', 'Polling'), result: '100%', tone: 'warn' },
    },
    {
      title: T(`中断方式：${pct(sim.intShare)}`, `Interrupt-driven: ${pct(sim.intShare)}`),
      desc: T(`每秒中断 ${sim.intPerSec} 次`, `${sim.intPerSec} interrupts/s`),
      detail: T(`每传 ${sim.word} 字节中断一次：每秒 ${sim.rate} ÷ ${sim.word} = ${sim.intPerSec} 次；每次 ${us(sim.tInt)}，占比 = ${sim.intPerSec} × ${us(sim.tInt)} = ${pct(sim.intShare)}。${sim.intShare > 1 ? '超过 100%，说明 CPU 根本来不及响应，数据会丢失。' : ''}`, `One interrupt per ${sim.word} bytes: ${sim.rate} ÷ ${sim.word} = ${sim.intPerSec}/s; at ${us(sim.tInt)} each, ${pct(sim.intShare)}.${sim.intShare > 1 ? ' Over 100%: the CPU cannot keep up and data is lost.' : ''}`),
      ref: 'calc',
      facts: [[T('每秒中断', 'Interrupts/s'), String(sim.intPerSec)]],
      row: { color: 'amber', what: T('中断方式', 'Interrupt-driven'), result: pct(sim.intShare), tone: sim.intShare > 0.5 ? 'warn' : 'info' },
    },
    {
      title: T(`DMA 方式：${pct(sim.dmaShare)}`, `DMA: ${pct(sim.dmaShare)}`),
      desc: T(`每秒中断 ${sim.dmaPerSec} 次`, `${sim.dmaPerSec} interrupts/s`),
      detail: T(`DMA 每传完一块（${sim.block} 字节）才中断一次：每秒 ${sim.rate} ÷ ${sim.block} = ${sim.dmaPerSec} 次；每次 ${us(sim.tDma)}，占比 = ${sim.dmaPerSec} × ${us(sim.tDma)} = ${pct(sim.dmaShare)}。数据直接在外设和内存之间传，不经过 CPU。`, `DMA interrupts once per ${sim.block}-byte block: ${sim.dmaPerSec}/s at ${us(sim.tDma)} each, ${pct(sim.dmaShare)}. Data moves between device and memory without the CPU.`),
      ref: ['calc', 'modes'],
      facts: [[T('每秒中断', 'Interrupts/s'), String(sim.dmaPerSec)]],
      row: { color: 'green', what: 'DMA', result: pct(sim.dmaShare), tone: 'ok' },
    },
  ];
  const built = toSteps(list, (k, z) => ctrlBoard(sim, k, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: T('三种方式的对比', 'The three compared'),
    text: T('把外设速率调到 40MB/s 试试：中断方式的占比会超过 100%，而 DMA 仍然很小。', 'Raise the rate to 40 MB/s: interrupt-driven I/O exceeds 100% while DMA stays small.'),
    facts: [
      [T('中断方式', 'Interrupt-driven'), pct(sim.intShare)],
      ['DMA', pct(sim.dmaShare)],
    ],
  };
  return lesson;
}

export const makeIoCtrl = () => parametric('io-ctrl', CTRL_SPEC.presets[0].set, buildCtrl);

// ═════════════════════════ 缓冲 ═════════════════════════

const BUF_SPEC = {
  presets: [
    { label: T('单缓冲', 'Single buffer'), set: { mode: 'single', n: 4, T: 100, M: 50, C: 50 } },
    { label: T('双缓冲', 'Double buffer'), set: { mode: 'double', n: 4, T: 100, M: 50, C: 50 } },
    { label: T('CPU 慢：单缓冲', 'Slow CPU: single'), set: { mode: 'single', n: 4, T: 100, M: 50, C: 120 } },
    { label: T('CPU 慢：双缓冲', 'Slow CPU: double'), set: { mode: 'double', n: 4, T: 100, M: 50, C: 120 } },
  ],
  groups: [
    {
      legend: T('参数', 'Parameters'),
      fields: [
        { name: 'mode', label: T('缓冲方式', 'Buffering'), type: 'select', options: [['single', T('单缓冲', 'Single')], ['double', T('双缓冲', 'Double')]], wide: true },
        { name: 'n', label: T('数据块数', 'Blocks'), type: 'int', min: 1, max: 10 },
        { name: 'T', label: T('输入到缓冲区 T', 'Device → buffer T'), type: 'int', min: 1, max: 10000 },
        { name: 'M', label: T('缓冲区传到用户区 M', 'Buffer → user M'), type: 'int', min: 0, max: 10000 },
        { name: 'C', label: T('CPU 处理 C', 'CPU process C'), type: 'int', min: 1, max: 10000 },
      ],
    },
  ],
  note: T(
    '一块数据先由设备输入到缓冲区（T），再从缓冲区传送到用户区（M），最后 CPU 处理（C）。缓冲区要等里面的数据被传走才能接收下一块；用户区要等上一块处理完才能接收新数据；设备一次只能输入一块。',
    'A block is input to a buffer (T), moved to the user area (M) and processed (C). A buffer accepts new data only after its contents are moved out; the user area only after the previous block is processed; the device inputs one block at a time.',
  ),
};
const BUF_ERR = {
  mode: T('请选择缓冲方式', 'Pick a mode'),
  n: T('块数要在 1～10 之间', 'Use 1–10 blocks'),
  T: T('T 要大于 0', 'T must be positive'),
  M: T('M 不能为负', 'M cannot be negative'),
  C: T('C 要大于 0', 'C must be positive'),
};

function bufBoard(sim, k, z) {
  const items = [];
  const end = sim.total;
  const W = 660;
  const sc = W / end;
  const lanes = sim.mode === 'double'
    ? [{ id: 'in0', zh: '输入 → 缓冲区 1', en: 'in → buffer 1' }, { id: 'in1', zh: '输入 → 缓冲区 2', en: 'in → buffer 2' }, { id: 'mv', zh: '传送到用户区', en: 'move to user' }, { id: 'c', zh: 'CPU 处理', en: 'CPU' }]
    : [{ id: 'in0', zh: '输入 → 缓冲区', en: 'in → buffer' }, { id: 'mv', zh: '传送到用户区', en: 'move to user' }, { id: 'c', zh: 'CPU 处理', en: 'CPU' }];
  const Y = (id) => 130 + lanes.findIndex((l) => l.id === id) * 70;
  lanes.forEach((l) => items.push({ k: `lane-${l.id}`, x: 170, y: Y(l.id), html: txt(-14, -12, z ? l.zh : l.en, 'bt-lab', 'end') + line(0, 0, W, 0, 'bl-lane') }));
  const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate', 'blue', 'green'];
  sim.blocks.forEach((b, i) => {
    if (i > k) return;
    const seg = (id, a, e, tag) => (e > a ? items.push({ k: `${tag}-${i}`, x: 170 + a * sc, y: Y(id), from: [170 + a * sc, Y(id) + 20], cls: i === k ? 'is-cur' : '', html: bar((e - a) * sc, 30, { tone: TONES[i], d: 0, text: (e - a) * sc > 26 ? `${i + 1}` : '' }) }) : null);
    seg(sim.mode === 'double' ? `in${b.buf}` : 'in0', b.inStart, b.inEnd, 'in');
    seg('mv', b.mvStart, b.mvEnd, 'mv');
    seg('c', b.cStart, b.cEnd, 'c');
  });
  const ticks = [...new Set([0, ...sim.blocks.slice(0, k + 1).flatMap((b) => [b.inEnd, b.mvEnd, b.cEnd])])].sort((a, b) => a - b);
  let ax = line(0, 0, W, 0, 'bl-axis');
  let lastX = -99;
  for (const t of ticks) {
    const x = t * sc;
    if (x - lastX < 24) continue;
    lastX = x;
    ax += line(x, -4, x, 4, 'bl-axis') + txt(x, 18, String(t), 'bt-idx');
  }
  const ay = Y(lanes.at(-1).id) + 40;
  items.push({ k: 'axis', x: 170, y: ay, html: ax });
  if (k >= 0) items.push({ k: 'sum', x: 170, y: ay + 52, html: txt(0, 0, z ? `前 ${k + 1} 块处理完：${sim.blocks[k].cEnd}` : `First ${k + 1} block(s) done at ${sim.blocks[k].cEnd}`, 'bt-formula cur', 'start') });
  return items;
}

export const BUF_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要缓冲', 'Why buffer'),
      blocks: [
        {
          list: [
            T('**缓和 CPU 和外设速度不匹配**：CPU 处理得快，外设送得慢，中间放一块缓冲区，双方不用一直互相等。', '**Smooth the speed mismatch** between the fast CPU and slow devices.'),
            T('**减少中断次数**：外设攒满一个缓冲区才通知 CPU，而不是每个字符都中断。', '**Fewer interrupts**: notify the CPU once per full buffer, not per character.'),
            T('**解决数据粒度不一致**：比如外设按字节送，程序按块读。', '**Match data granularity**: devices send bytes, programs read blocks.'),
            T('**提高 CPU 和外设的并行性**。', '**More parallelism** between CPU and devices.'),
          ],
        },
        { tip: T('缓冲区的特点：缓冲区里**有数据时不能往里放**（要等被取走），**空的时候可以放**；取的时候要等它被放满。', 'A buffer can be filled only when empty and emptied only when full.') },
      ],
    },
    {
      id: 'single',
      title: T('单缓冲', 'Single buffering'),
      blocks: [
        { p: T('只有一个缓冲区。设备往缓冲区里输入（T）和 CPU 处理（C）可以并行；但把数据从缓冲区传到用户区（M）这段时间，缓冲区和用户区都被占着，既不能输入也不能处理。', 'One buffer. Input (T) and processing (C) can overlap, but while data moves from buffer to user area (M), neither can proceed.') },
        { formula: T('单缓冲每块数据的平均用时 = max(C, T) + M', 'single buffer: max(C, T) + M per block') },
        { p: T('推导：设初始时缓冲区空、用户区满（上一块刚传完）。下一轮里设备输入（T）和 CPU 处理（C）同时进行，等两者都结束（max(C, T)），才能做传送（M）。', 'Derivation: start with an empty buffer and a full user area. Input (T) and processing (C) run together; only when both finish (max(C, T)) can the move (M) happen.') },
      ],
    },
    {
      id: 'double',
      title: T('双缓冲', 'Double buffering'),
      blocks: [
        { p: T('有两个缓冲区。设备往一个缓冲区输入的同时，另一个缓冲区的数据可以传到用户区并被处理。两个缓冲区交替使用。', 'Two buffers alternate: the device fills one while the other is moved out and processed.') },
        { formula: T('双缓冲每块数据的平均用时 = max(T, C + M)', 'double buffer: max(T, C + M) per block') },
        { p: T('当 C + M < T 时，瓶颈在设备，每块平均就是 T，设备可以连续不停地输入；当 C + M > T 时，瓶颈在 CPU，设备要等。', 'If C + M < T the device is the bottleneck and runs continuously; otherwise the CPU is.') },
        { tip: T('两台机器之间通信，如果要**同时双向**传数据，每台机器都要设两个缓冲区（一个发送、一个接收），这叫双缓冲区通信。', 'For simultaneous two-way communication each machine needs two buffers, one to send and one to receive.') },
      ],
    },
    {
      id: 'more',
      title: T('循环缓冲和缓冲池', 'Circular buffers and pools'),
      blocks: [
        { p: T('**循环缓冲**：多个大小相同的缓冲区连成一个环，用 in 指针指向下一个可以放数据的空缓冲区，out 指针指向下一个可以取数据的满缓冲区。**缓冲池**：系统里所有缓冲区统一管理，分成空缓冲队列、输入队列、输出队列，按需取用，利用率更高。', 'A **circular buffer** chains equal buffers in a ring, with in and out pointers. A **buffer pool** manages all buffers centrally in empty, input and output queues.') },
      ],
    },
    {
      id: 'spool',
      title: T('SPOOLing（假脱机）', 'SPOOLing'),
      blocks: [
        { p: T('打印机这样的**独占设备**一次只能给一个进程用。SPOOLing 用磁盘模拟脱机输入输出：在磁盘上开辟**输入井**和**输出井**，内存里设输入 / 输出缓冲区，由输入进程和输出进程在后台把数据在外设和磁盘之间搬运。', 'Exclusive devices like printers serve one process at a time. SPOOLing simulates offline I/O on disk: **input and output wells** on the disk plus memory buffers, with background processes moving data between the devices and the disk.') },
        { p: T('效果：每个进程以为自己独占了一台打印机（其实只是把要打印的内容写到了输出井），所以**把独占设备变成了逻辑上的共享设备**，也提高了 I/O 速度。', 'Each process seems to own a printer (it only writes to the output well): **an exclusive device becomes logically shared**, and I/O speeds up.') },
        { warn: T('SPOOLing 需要多道程序设计和高速大容量外存（磁盘）的支持。它是「虚拟设备」技术，用来破坏死锁的「互斥」条件，但适用范围很有限。', 'SPOOLing needs multiprogramming and a fast disk. It is virtual-device technology that breaks the mutual-exclusion condition, though rarely applicable.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('单缓冲：max(C, T) + M；双缓冲：max(T, C + M)。M 的位置别放错。', 'Single: max(C, T) + M; double: max(T, C + M). Mind where M goes.'),
            T('平均用时是**稳定之后**每块的时间；第一块有启动开销，算总时间要按时间线一块块推。', 'The average is the steady-state cost; total time must be traced block by block.'),
            T('题目说「缓冲区到用户区的传送时间忽略」时，M = 0。', 'If the move time is negligible, M = 0.'),
          ],
        },
      ],
    },
  ],
};

const bufKit = stepKit({ spec: BUF_SPEC, rowsName: T('每一块', 'Blocks') });

function buildBuf(params) {
  const sim = buffer(params);
  const lesson = {
    id: 'io-buffer',
    kit: bufKit,
    where: [['os', 'io']],
    tag: T('缓冲', 'Buf'),
    name: T('缓冲：单缓冲与双缓冲', 'Single and double buffering'),
    full: T('缓冲的作用 · 单缓冲 · 双缓冲 · 循环缓冲 · SPOOLing', 'Why buffer · single · double · circular · SPOOLing'),
    title: params.mode === 'double' ? T('双缓冲', 'Double buffer') : T('单缓冲', 'Single buffer'),
    badge: params.mode === 'double' ? T('双缓冲', 'Double') : T('单缓冲', 'Single'),
    nodes: [],
    legend: [['blue', T('第几块数据', 'Block number')]],
    principle: BUF_PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(BUF_ERR, sim.errors),
    overview: {
      desc: T(
        '一块数据要经过三段：设备输入到缓冲区、缓冲区传到用户区、CPU 处理。这节课把每一块在三条（双缓冲是四条）时间线上的位置画出来，能看到单缓冲和双缓冲到底在哪里省下了时间，再和 max(C, T) + M、max(T, C + M) 两个公式对上。',
        'Each block goes through input, move and processing. Drawing every block on three (four for double buffering) time lanes shows exactly where double buffering saves time, matching max(C, T) + M and max(T, C + M).',
      ),
      facts: sim.ok ? [[T('稳定后每块平均', 'Steady-state per block'), String(sim.per)]] : [],
    },
    start: { nodes: [], frame: { rect: [0, 70, 870, 470] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.blocks.map((b, i) => {
    const prev = sim.blocks[i - 1];
    const waitIn = i === 0 ? '' : sim.mode === 'single' ? T(`缓冲区要等第 ${i} 块在 ${prev.mvEnd} 传走才能接收新数据。`, `The buffer frees at ${prev.mvEnd} when block ${i} is moved out.`) : T(`用缓冲区 ${b.buf + 1}；${i >= 2 ? `它在 ${sim.blocks[i - 2].mvEnd} 空出，` : ''}设备在 ${prev.inEnd} 空闲。`, `Uses buffer ${b.buf + 1}${i >= 2 ? `, free at ${sim.blocks[i - 2].mvEnd}` : ''}; the device is free at ${prev.inEnd}.`);
    const waitMv = i === 0 ? { zh: '', en: '' } : T(`传送要等用户区里第 ${i} 块在 ${prev.cEnd} 处理完。`, `The move waits for block ${i} to finish processing at ${prev.cEnd}.`);
    return {
      title: T(`第 ${i + 1} 块：${b.cEnd} 时处理完`, `Block ${i + 1}: done at ${b.cEnd}`),
      desc: T(`输入 ${b.inStart}–${b.inEnd}，传送 ${b.mvStart}–${b.mvEnd}，处理 ${b.cStart}–${b.cEnd}`, `in ${b.inStart}–${b.inEnd}, move ${b.mvStart}–${b.mvEnd}, CPU ${b.cStart}–${b.cEnd}`),
      detail: both((z) => (i === 0 ? (z ? `第 1 块：输入 0–${b.inEnd}，传送 ${b.mvStart}–${b.mvEnd}，处理 ${b.cStart}–${b.cEnd}。` : `Block 1: in 0–${b.inEnd}, move ${b.mvStart}–${b.mvEnd}, CPU ${b.cStart}–${b.cEnd}.`) : (z ? waitIn.zh + `输入 ${b.inStart}–${b.inEnd}。` + waitMv.zh + `传送 ${b.mvStart}–${b.mvEnd}，处理 ${b.cStart}–${b.cEnd}。` : waitIn.en + ` In ${b.inStart}–${b.inEnd}. ` + waitMv.en + ` Move ${b.mvStart}–${b.mvEnd}, CPU ${b.cStart}–${b.cEnd}.`))),
      ref: sim.mode === 'double' ? 'double' : 'single',
      facts: [[T('处理完', 'Done at'), String(b.cEnd)], ...(prev ? [[T('和上一块相隔', 'After previous'), String(b.cEnd - prev.cEnd)]] : [])],
      row: { color: 'blue', what: T(`第 ${i + 1} 块`, `Block ${i + 1}`), result: String(b.cEnd), tone: 'info', info: T(`输入 ${b.inStart}–${b.inEnd}，传送 ${b.mvStart}–${b.mvEnd}，处理 ${b.cStart}–${b.cEnd}`, `in ${b.inStart}–${b.inEnd}, move ${b.mvStart}–${b.mvEnd}, CPU ${b.cStart}–${b.cEnd}`) },
    };
  });
  const built = toSteps(list, (k, z) => bufBoard(sim, k, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  const gaps = sim.blocks.slice(1).map((b, i) => b.cEnd - sim.blocks[i].cEnd);
  lesson.outro = {
    title: T(`${sim.n} 块共用时 ${sim.total}`, `${sim.n} blocks take ${sim.total}`),
    text: both((z) => (z ? `稳定后每块相隔 ${gaps.at(-1) ?? sim.per}，和公式 ${sim.mode === 'single' ? `max(C, T) + M = max(${sim.C}, ${sim.T}) + ${sim.M}` : `max(T, C + M) = max(${sim.T}, ${sim.C} + ${sim.M})`} = ${sim.per} 一致。换成另一种缓冲方式比一比。` : `In steady state blocks finish every ${gaps.at(-1) ?? sim.per}, matching ${sim.mode === 'single' ? 'max(C, T) + M' : 'max(T, C + M)'} = ${sim.per}. Switch the mode to compare.`)),
    facts: [
      [T('总用时', 'Total'), String(sim.total)],
      [T('公式（稳定后每块）', 'Formula per block'), String(sim.per)],
    ],
  };
  return lesson;
}

export const makeIoBuf = () => parametric('io-buffer', BUF_SPEC.presets[0].set, buildBuf);
