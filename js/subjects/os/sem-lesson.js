// 「信号量与 PV 操作」：每个信号量是一根柱子，上面是值，下面是等待队列；进程在顶上，阻塞时掉进对应信号量的队列。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, chip, errOf, stepKit, toSteps } from '../../core/steps.js';
import { simulate } from './sem.js';

const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'];

const SPEC = {
  presets: [
    { label: T('互斥', 'Mutual exclusion'), set: { sems: 'mutex=1', ops: 'P1:P(mutex) P2:P(mutex) P3:P(mutex) P1:V(mutex) P2:V(mutex) P3:V(mutex)' } },
    { label: T('同步：前 V 后 P', 'Synchronisation'), set: { sems: 's=0', ops: 'P2:P(s) P1:V(s)' } },
    { label: T('生产者—消费者', 'Producer–consumer'), set: { sems: 'empty=2 full=0 mutex=1', ops: 'C:P(full) A:P(empty) A:P(mutex) A:V(mutex) A:V(full) C:P(mutex) C:V(mutex) C:V(empty) A:P(empty) A:P(mutex) A:V(mutex) A:V(full)' } },
    { label: T('P 的顺序写反：死锁', 'Wrong P order: deadlock'), set: { sems: 'empty=0 full=0 mutex=1', ops: 'A:P(mutex) A:P(empty) C:P(mutex)' } },
  ],
  groups: [
    {
      legend: T('信号量与操作', 'Semaphores and operations'),
      fields: [
        { name: 'sems', label: T('信号量初值（如 mutex=1 empty=3）', 'Initial values (e.g. mutex=1 empty=3)'), type: 'text', wide: true },
        { name: 'ops', label: T('操作序列（如 P1:P(mutex) P2:V(full)）', 'Operations (e.g. P1:P(mutex) P2:V(full))'), type: 'text', wide: true, hint: T('「进程:P(信号量)」或「进程:V(信号量)」，空格隔开，最多 24 个', '“proc:P(sem)” or “proc:V(sem)”, up to 24') },
      ],
    },
  ],
  note: T(
    '记录型信号量：P(S) 先 S.value − 1，若小于 0 就阻塞，排到 S 的等待队列队尾；V(S) 先 S.value + 1，若仍 ≤ 0 就唤醒等待队列队首的进程。S.value 为负时，它的绝对值就是正在等的进程数。阻塞中的进程不能再执行操作。',
    'Record semaphores: P(S) decrements and blocks (joining the queue tail) if the value drops below 0; V(S) increments and wakes the queue head if the value is still ≤ 0. A negative value counts the waiting processes. A blocked process cannot issue operations.',
  ),
};
const ERR = {
  sems: T('信号量初值的写法不对（如 mutex=1）', 'Write initial values like mutex=1'),
  semCount: T('信号量最多 5 个', 'At most 5 semaphores'),
  op: T('看不懂这个操作：{e}', 'Cannot read this operation: {e}'),
  count: T('操作要有 1～24 个', 'Give 1–24 operations'),
  noSem: T('没有定义信号量 {s}', 'Semaphore {s} is not defined'),
};

function board(sim, k, z) {
  const items = [];
  const cur = k >= 0 ? sim.steps[k] : null;
  const val = cur ? cur.val : sim.init;
  const queue = cur ? cur.queue : Object.fromEntries(sim.sems.map((s) => [s, []]));
  const blockedOn = cur ? cur.blockedOn : {};
  const tone = (p) => TONES[sim.procs.indexOf(p) % 8];
  const X = (i) => 170 + i * 220;
  const PX = (i) => 140 + i * 90;
  items.push({ k: 'plab', x: 40, y: 92, html: txt(0, 4, z ? '进程' : 'Processes', 'bt-cap', 'start') });
  sim.procs.forEach((p, i) => {
    const b = blockedOn[p];
    if (b) return;
    items.push({ k: `p-${p}`, x: PX(i), y: 96, cls: cur?.p === p ? 'is-cur' : '', html: chip(44, 34, p, { tone: tone(p), size: 13 }) + txt(0, 36, z ? '可运行' : 'runnable', 'bt-dim') });
  });
  sim.sems.forEach((s, i) => {
    const v = val[s];
    const hot = cur?.s === s;
    items.push({ k: `s-${s}`, x: X(i) - 60, y: 210, html: txt(80, -12, s, 'bt-lab') + cell(160, 46, `value = ${v}`, { cls: hot ? (cur.block ? 'bad' : 'hot') : v < 0 ? 'bad' : '', size: 15 }) + txt(80, 66, v < 0 ? (z ? `${-v} 个进程在等` : `${-v} waiting`) : z ? `还剩 ${v} 个` : `${v} available`, 'bt-dim') + txt(80, 96, z ? '等待队列 ↓' : 'queue ↓', 'bt-cap') });
    queue[s].forEach((p, j) => items.push({ k: `p-${p}`, x: X(i) + 20, y: 350 + j * 52, cls: cur?.p === p ? 'is-cur' : '', html: chip(44, 34, p, { tone: tone(p), size: 13 }) + txt(32, 5, z ? '阻塞' : 'blocked', 'bt-mark bad', 'start') }));
  });
  if (cur) {
    const t = cur.kind === 'illegal' ? (z ? `${cur.p}:${cur.op}(${cur.s}) 不合法` : `${cur.p}:${cur.op}(${cur.s}) illegal`) : `${cur.p}: ${cur.op}(${cur.s})   ${cur.s}.value ${cur.before} → ${cur.after}`;
    items.push({ k: 'op', x: 40, y: 560, html: txt(0, 0, t, 'bt-formula cur', 'start') });
  }
  return items;
}

// ───────────────────────── 原理 ─────────────────────────

const code = (lines) => ({ list: lines.map((l) => ({ zh: `\`${l}\``, en: `\`${l}\`` })) });

export const PRINCIPLE = {
  sections: [
    {
      id: 'cs',
      title: T('临界资源与临界区', 'Critical resources and sections'),
      blocks: [
        { p: T('多个进程并发执行时，有些资源一次只允许一个进程使用，比如打印机、共享变量，叫**临界资源**。访问临界资源的那段代码叫**临界区**。两个进程同时修改同一个共享变量，结果可能出错（比如两个进程都执行 count++，最后只加了 1）。', 'Some resources allow one user at a time (a printer, a shared variable): **critical resources**. The code touching them is the **critical section**. Two processes updating the same variable at once can corrupt it (two count++ may add only 1).') },
        { p: T('访问临界资源的代码分成四部分：**进入区**（检查能不能进，能进就上锁）→ **临界区** → **退出区**（解锁）→ 剩余区。', 'The code splits into an **entry section** (check and lock) → **critical section** → **exit section** (unlock) → remainder.') },
        {
          table: {
            head: [T('同步机制要遵循的原则', 'Rules'), T('含义', 'Meaning')],
            rows: [
              [T('空闲让进', 'Progress'), T('临界区空着，有进程想进就让它进', 'if free, let someone in')],
              [T('忙则等待', 'Mutual exclusion'), T('已经有进程在里面，别的进程要等', 'if occupied, others wait')],
              [T('有限等待', 'Bounded waiting'), T('想进的进程要在有限时间内进入，不能饿死', 'entry within finite time')],
              [T('让权等待', 'No busy waiting'), T('进不去时要释放 CPU（阻塞），不要原地空转「忙等」', 'release the CPU while waiting')],
            ],
          },
        },
      ],
    },
    {
      id: 'impl',
      title: T('实现互斥的几种方法', 'Ways to achieve mutual exclusion'),
      blocks: [
        {
          table: {
            head: [T('方法', 'Method'), T('思路', 'Idea'), T('问题', 'Issue')],
            rows: [
              [T('单标志法', 'Single flag'), T('turn 表示轮到谁', 'turn says whose go it is'), T('必须轮流进入，违反「空闲让进」', 'forced alternation breaks progress')],
              [T('双标志先检查', 'Two flags, check first'), T('先看对方想不想进，再设自己的标志', 'check the other, then set own flag'), T('检查和设置不是一气呵成，可能两个都进去，违反「忙则等待」', 'both may enter')],
              [T('双标志后检查', 'Two flags, set first'), T('先设自己的标志，再看对方', 'set own flag, then check'), T('可能两个都进不去，违反「空闲让进」「有限等待」', 'both may wait forever')],
              [T('Peterson 算法', 'Peterson'), T('双标志 + turn「孔融让梨」', 'two flags plus turn'), T('满足前三条，**不满足让权等待**（忙等）', 'busy-waits: **no yield**')],
              [T('关中断', 'Disable interrupts'), T('进临界区前关中断，出来再开', 'disable interrupts around it'), T('只适合内核、单处理机', 'kernel and uniprocessor only')],
              [T('TestAndSet / Swap 指令', 'TestAndSet / Swap'), T('硬件保证「检查并上锁」是原子的', 'atomic test-and-lock in hardware'), T('**不满足让权等待**（忙等）', 'busy-waits')],
              [T('信号量', 'Semaphores'), T('见下一节', 'next section'), T('记录型信号量满足全部四条', 'record semaphores meet all four')],
            ],
          },
        },
      ],
    },
    {
      id: 'sem',
      title: T('信号量和 PV 操作', 'Semaphores and P / V'),
      blocks: [
        { p: T('**信号量**是一个整数变量（加上一个等待队列），只能用两个原语来访问：**P 操作**（wait，申请资源）和 **V 操作**（signal，释放资源）。原语是原子的，执行中不会被打断。', 'A **semaphore** is an integer plus a waiting queue, accessed only by two atomic primitives: **P** (wait, acquire) and **V** (signal, release).') },
        {
          cols: [
            [{ p: T('**整型信号量**：P 操作在 S ≤ 0 时一直循环检查，进程在原地空转（忙等），**不满足让权等待**。', '**Integer semaphore**: P loops while S ≤ 0, busy-waiting: **no yield**.') }],
            [{ p: T('**记录型信号量**：S 不够时进程阻塞，进入 S 的等待队列，释放 CPU；V 操作时如果有人在等，就唤醒一个。**满足让权等待**，考试默认指它。', '**Record semaphore**: a process blocks in S’s queue and yields the CPU; V wakes one waiter. **Yields properly**; this is the default meaning.') }],
          ],
        },
        code(['P(S): S.value--; if (S.value < 0) block(S.L);', 'V(S): S.value++; if (S.value <= 0) wakeup(S.L);']),
        { tip: T('S.value > 0 表示还有几个资源可用；S.value < 0 时，|S.value| 是等待队列里的进程数；V 之后 S.value ≤ 0 说明之前有人在等，所以要唤醒一个。', 'S.value > 0: resources left; S.value < 0: |S.value| processes waiting; after V, S.value ≤ 0 means someone was waiting, so one is woken.') },
      ],
    },
    {
      id: 'pattern',
      title: T('用信号量实现互斥与同步', 'Mutual exclusion and synchronisation'),
      blocks: [
        {
          table: {
            head: ['', T('互斥', 'Mutual exclusion'), T('同步（先后顺序）', 'Synchronisation (ordering)')],
            rows: [
              [T('初值', 'Initial value'), T('mutex = 1（资源有几个就设几）', 'mutex = 1 (or the number of resources)'), T('S = 0', 'S = 0')],
              [T('写法', 'Pattern'), T('临界区前 P(mutex)，后 V(mutex)，**在同一个进程里成对出现**', 'P before and V after the section, **in the same process**'), T('**前 V 后 P**：先做的那件事做完 V(S)，后做的那件事开始前 P(S)', '**V after the first, P before the second**')],
            ],
          },
        },
        { p: T('前驱关系（A 做完才能做 B、C……）就是多个同步：每一条前驱边设一个初值为 0 的信号量，前面的进程结束时 V，后面的进程开始前 P。', 'Precedence graphs are many synchronisations: one semaphore initialised to 0 per edge, V at the end of the predecessor, P at the start of the successor.') },
      ],
    },
    {
      id: 'classic',
      title: T('经典同步问题', 'Classic problems'),
      blocks: [
        { p: T('**生产者—消费者**（缓冲区 n 格）：empty = n（空位数），full = 0（产品数），mutex = 1（互斥访问缓冲区）。', '**Producer–consumer** (n slots): empty = n, full = 0, mutex = 1.') },
        {
          cols: [
            [{ p: T('生产者', 'Producer') }, code(['P(empty);', 'P(mutex);', '放入产品;', 'V(mutex);', 'V(full);'])],
            [{ p: T('消费者', 'Consumer') }, code(['P(full);', 'P(mutex);', '取出产品;', 'V(mutex);', 'V(empty);'])],
          ],
        },
        { warn: T('**两个 P 的顺序不能颠倒**：必须先 P(empty)/P(full)（同步），再 P(mutex)（互斥）。如果生产者先 P(mutex) 再 P(empty)，缓冲区满时它会拿着 mutex 阻塞，消费者又拿不到 mutex 取产品 —— 死锁。本课的「P 的顺序写反」预设演示了这种情况。V 的顺序可以换。', '**Never swap the two Ps**: first the synchronising P(empty)/P(full), then P(mutex). A producer taking mutex first blocks holding it when the buffer is full and the consumer can never get in: deadlock (see the preset). The Vs may be swapped.') },
        {
          list: [
            T('**读者—写者**：多个读者可以同时读；写者和任何人都互斥。用 count 记读者数（count 本身要用 mutex 保护），第一个读者 P(rw)、最后一个读者 V(rw)。这种写法读者优先，写者可能饿死；再加一个信号量可以实现写者优先 / 读写公平。', '**Readers–writers**: readers share, writers exclude everyone. A counter (protected by its own mutex) lets the first reader lock rw and the last unlock it; that favours readers, and an extra semaphore gives writer priority / fairness.'),
            T('**哲学家进餐**：5 个人 5 根筷子，每人都先拿左边再拿右边会死锁。解决：最多允许 4 人同时拿筷子；或者奇数号先拿左、偶数号先拿右；或者两根都能拿到时才一起拿（用 mutex 保证）。', '**Dining philosophers**: everyone taking the left fork first deadlocks. Fixes: at most four at the table; odd/even take opposite sides first; or take both forks atomically.'),
            T('**吸烟者**：一个供应者、三个吸烟者，本质是「一个生产者生产多种产品，各自对应一个消费者」，用多个同步信号量 + 一个 finish 信号量。', '**Smokers**: one producer of three kinds of item, each with its own consumer: several sync semaphores plus a finish semaphore.'),
          ],
        },
      ],
    },
    {
      id: 'monitor',
      title: T('管程', 'Monitors'),
      blocks: [
        { p: T('信号量用起来容易出错（P、V 写漏、写反）。**管程**把共享数据和对它的操作封装在一起，**同一时刻只允许一个进程在管程里**，互斥由编译器保证；需要等待时用**条件变量**的 wait / signal。条件变量没有值，signal 时如果没人等就什么也不发生 —— 这一点和信号量的 V 不同。', 'Semaphores are error-prone. A **monitor** wraps shared data with its operations; **one process at a time** is inside, enforced by the compiler; waiting uses **condition variables** with wait / signal. A condition variable has no value: a signal with no waiter is lost, unlike V.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('互斥信号量初值一般是 1，同步信号量初值一般是 0；资源信号量初值是资源个数。', 'Mutex semaphores start at 1, synchronising ones at 0, resource counters at the number of resources.'),
            T('互斥的 P、V 在同一进程里；同步的 P、V 在不同进程里。', 'Mutual-exclusion P and V are in one process; synchronisation P and V in different ones.'),
            T('多个 P 操作时，**同步的 P 在前，互斥的 P 在后**，否则可能死锁。', 'With several Ps, put **the synchronising P before the mutex P**, or risk deadlock.'),
            T('V 操作只唤醒**一个**等待的进程，不是全部。', 'V wakes **one** waiter, not all.'),
            T('Peterson 算法、硬件指令和整型信号量都不满足「让权等待」。', 'Peterson, hardware instructions and integer semaphores all busy-wait.'),
          ],
        },
      ],
    },
  ],
};

// ───────────────────────── 生成课程 ─────────────────────────

const kit = stepKit({ spec: SPEC, rowsName: T('PV 操作', 'Operations') });

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'semaphore',
    kit,
    where: [['os', 'process']],
    tag: 'PV',
    name: T('信号量与 PV 操作', 'Semaphores and P / V'),
    full: T('临界区 · 互斥 · 同步 · 生产者—消费者 · 读者—写者 · 哲学家', 'Critical sections · mutual exclusion · synchronisation · classic problems'),
    title: T(`${sim.ok ? sim.sems.join(' ') : ''}`, `${sim.ok ? sim.sems.join(' ') : ''}`),
    badge: T('记录型信号量', 'Record semaphores'),
    nodes: [],
    legend: [
      ['rose', T('阻塞', 'Blocked')],
      ['green', T('可运行', 'Runnable')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '信号量是一个计数器加一个等待队列。P 操作申请资源，不够就阻塞排队；V 操作释放资源，有人在等就唤醒一个。这节课按你给的一串 PV 操作一步步执行，能看到信号量的值怎么变、谁被阻塞、谁被唤醒。预设里有互斥、同步、生产者—消费者，还有一个把 P 的顺序写反导致死锁的例子。',
        'A semaphore is a counter plus a queue. P acquires and blocks when nothing is left; V releases and wakes a waiter. This lesson runs your sequence of P and V operations one by one, showing the values, who blocks and who wakes. Presets cover mutual exclusion, ordering, producer–consumer and a deadlock caused by swapping the Ps.',
      ),
      facts: sim.ok ? [[T('初值', 'Initial values'), Object.entries(sim.init).map(([k, v]) => `${k}=${v}`).join('  ')]] : [],
    },
    start: { nodes: [], frame: { rect: [20, 40, 120 + Math.max(sim.ok ? sim.sems.length : 1, 3) * 220, 590] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s) => {
    const name = `${s.p}: ${s.op}(${s.s})`;
    if (s.kind === 'illegal') {
      const w = T(`${s.p} 正阻塞在 ${s.on} 上，阻塞的进程不能执行任何操作，要等别人 V(${s.on}) 把它唤醒。`, `${s.p} is blocked on ${s.on} and can do nothing until someone performs V(${s.on}).`);
      return { title: T(`${name}：不合法`, `${name}: illegal`), desc: w, detail: w, ref: 'sem', row: { color: 'rose', what: name, result: T('不执行', 'skipped'), tone: 'warn' } };
    }
    if (s.kind === 'P') {
      return {
        title: s.block ? T(`${name}：不够，${s.p} 阻塞`, `${name}: ${s.p} blocks`) : T(`${name}：通过`, `${name}: proceeds`),
        desc: T(`${s.s}.value ${s.before} → ${s.after}`, `${s.s}.value ${s.before} → ${s.after}`),
        detail: s.block
          ? T(`${s.s}.value 先减 1：${s.before} − 1 = ${s.after} < 0，说明没有可用的资源。${s.p} 调用阻塞原语，进入 ${s.s} 的等待队列（现在排着 ${s.queue[s.s].join('、')}），并让出 CPU —— 这就是「让权等待」。`, `${s.s}.value: ${s.before} − 1 = ${s.after} < 0, nothing available. ${s.p} blocks in ${s.s}'s queue (${s.queue[s.s].join(', ')}) and yields the CPU.`)
          : T(`${s.s}.value 先减 1：${s.before} − 1 = ${s.after} ≥ 0，资源够用，${s.p} 继续往下执行。`, `${s.s}.value: ${s.before} − 1 = ${s.after} ≥ 0, so ${s.p} continues.`),
        ref: 'sem',
        facts: [[`${s.s}.value`, `${s.before} → ${s.after}`]],
        row: { color: s.block ? 'rose' : 'green', what: name, result: s.block ? T('阻塞', 'blocks') : T('通过', 'proceeds'), tone: s.block ? 'warn' : 'ok' },
      };
    }
    return {
      title: s.woke ? T(`${name}：唤醒 ${s.woke}`, `${name}: wakes ${s.woke}`) : T(`${name}：释放`, `${name}: releases`),
      desc: T(`${s.s}.value ${s.before} → ${s.after}`, `${s.s}.value ${s.before} → ${s.after}`),
      detail: s.woke
        ? T(`${s.s}.value 先加 1：${s.before} + 1 = ${s.after} ≤ 0，说明还有进程在等这个资源。唤醒等待队列队首的 ${s.woke}，它从当初的 P 操作之后继续执行（变成就绪）。`, `${s.s}.value: ${s.before} + 1 = ${s.after} ≤ 0, someone is waiting. The head of the queue, ${s.woke}, is woken and continues after its P.`)
        : T(`${s.s}.value 加 1：${s.before} + 1 = ${s.after} > 0，没有人在等，资源数加一就行。`, `${s.s}.value: ${s.before} + 1 = ${s.after} > 0, nobody waits.`),
      ref: 'sem',
      facts: [[`${s.s}.value`, `${s.before} → ${s.after}`]],
      row: { color: 'teal', what: name, result: s.woke ? T(`唤醒 ${s.woke}`, `wakes ${s.woke}`) : T('释放', 'releases'), tone: 'ok' },
    };
  });
  const built = toSteps(list, (k, z) => board(sim, k, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: sim.stuck.length ? T(`还有进程阻塞：${sim.stuck.join('、')}`, `Still blocked: ${sim.stuck.join(', ')}`) : T('所有进程都没有阻塞', 'Nobody is blocked'),
    text: sim.stuck.length
      ? T('如果没有别的进程会再对这些信号量做 V，它们就永远等下去。看看「P 的顺序写反」那个预设：两个进程都在等对方释放资源，这就是死锁。', 'If nobody will V these semaphores again they wait forever. The “wrong P order” preset shows two processes each waiting for the other: deadlock.')
      : T('改一下操作序列：把生产者的两个 P 交换顺序，看看会发生什么。', 'Swap the producer’s two Ps and see what happens.'),
    facts: [[T('最终值', 'Final values'), Object.entries(sim.final).map(([k, v]) => `${k}=${v}`).join('  ')]],
  };
  return lesson;
}

export const makeSem = () => parametric('semaphore', DEFAULTS, build);
