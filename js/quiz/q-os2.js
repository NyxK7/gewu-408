// 操作系统第二批题：每一章都有。生成题的答案由课程同一份计算代码算出（通过课程的 update 拿到 sim，参数格式和课程完全一样）。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const frac = ([num, den]) => {
  const v = num / den;
  return Number.isInteger(v) ? { value: v } : { value: v, tol: 0.006, show: v.toFixed(2) };
};
const hx = (v) => String(v);

function procs(r, n) {
  const arrive = [0];
  while (arrive.length < n) arrive.push(arrive.at(-1) + r.int(0, 3));
  const burst = arrive.map(() => r.int(1, 8));
  return { arrive, burst };
}
const SCHED_BASE = { prio: [1, 2, 3, 4], q: 2, prioLow: true, preempt: false, newFirst: true };
const segText = (sim) => sim.segs.map((s) => `${s.start}–${s.end} ${s.pid == null ? (s.why === 'idle' ? '空闲' : '—') : sim.procs[s.pid].name}`).join('，');
const segTextEn = (sim) => sim.segs.map((s) => `${s.start}–${s.end} ${s.pid == null ? 'idle' : sim.procs[s.pid].name}`).join(', ');

export const OS_QUESTIONS2 = [
  // ───── 进程与线程 ─────
  {
    id: 'os-sched-01',
    subject: 'os',
    chapter: 'process',
    topic: T('调度算法', 'Scheduling algorithms'),
    type: 'number',
    difficulty: 2,
    lessons: ['cpu-sched'],
    tags: ['过程推演'],
    conv: T('非抢占；同等条件下先到达的优先，再按编号；不计切换开销。', 'Non-preemptive; ties go to the earlier arrival, then the lower number; no switch cost.'),
    make(r) {
      const algo = r.pick(['FCFS', 'SJF', 'HRRN']);
      const { arrive, burst } = procs(r, 4);
      const params = { algo, arrive, burst, ...SCHED_BASE };
      const l = L('cpu-sched', params);
      const sim = l.sim;
      const name = { FCFS: T('先来先服务 FCFS', 'FCFS'), SJF: T('短作业优先 SJF', 'SJF'), HRRN: T('高响应比优先 HRRN', 'HRRN') }[algo];
      return {
        question: T(`4 个进程 P1～P4 的到达时间为 ${arrive.join('、')}，运行时间为 ${burst.join('、')}。采用${name.zh} 调度，平均周转时间是多少？`, `P1–P4 arrive at ${arrive.join(', ')} and need ${burst.join(', ')}. Under ${name.en}, what is the mean turnaround time?`),
        answer: frac(sim.avg.tat),
        steps: [
          { text: T(`执行顺序：${segText(sim)}。`, `Order: ${segTextEn(sim)}.`), go: { lesson: 'cpu-sched', params, step: last(l) } },
          { text: T(`周转时间 = 完成时间 − 到达时间：${sim.procs.map((p) => `${p.name} ${p.finish} − ${p.arrive} = ${p.tat}`).join('，')}。`, `Turnaround: ${sim.procs.map((p) => `${p.name} ${p.tat}`).join(', ')}.`), go: { lesson: 'cpu-sched', doc: 'metric' } },
          { text: T(`平均 = (${sim.procs.map((p) => p.tat).join(' + ')}) / 4 = ${sim.avg.tat[0]}/${sim.avg.tat[1]}${Number.isInteger(sim.avg.tat[0] / sim.avg.tat[1]) ? ` = ${sim.avg.tat[0] / sim.avg.tat[1]}` : ` ≈ ${(sim.avg.tat[0] / sim.avg.tat[1]).toFixed(2)}`}。`, `Mean = ${sim.avg.tat[0]}/${sim.avg.tat[1]}.`) },
        ],
      };
    },
  },
  {
    id: 'os-sched-02',
    subject: 'os',
    chapter: 'process',
    topic: T('时间片轮转', 'Round robin'),
    type: 'number',
    difficulty: 2,
    lessons: ['cpu-sched'],
    tags: ['过程推演'],
    conv: T('时间片用完的进程排到就绪队列队尾；如果同一时刻有新进程到达，新到达的先入队。不计切换开销。', 'A preempted process goes to the tail; a process arriving at the same moment queues first. No switch cost.'),
    make(r) {
      const q = r.pick([2, 3]);
      const { arrive, burst } = procs(r, 4);
      const params = { algo: 'RR', arrive, burst, ...SCHED_BASE, q };
      const l = L('cpu-sched', params);
      const sim = l.sim;
      const k = r.int(0, 3);
      const p = sim.procs[k];
      return {
        question: T(`P1～P4 的到达时间为 ${arrive.join('、')}，运行时间为 ${burst.join('、')}，时间片轮转调度，时间片为 ${q}。P${k + 1} 在什么时刻完成？`, `P1–P4 arrive at ${arrive.join(', ')} and need ${burst.join(', ')}. Round robin with q = ${q}: when does P${k + 1} finish?`),
        answer: { value: p.finish },
        steps: [
          { text: T(`按时间片画出甘特图：${segText(sim)}。`, `Gantt chart: ${segTextEn(sim)}.`), go: { lesson: 'cpu-sched', params, step: last(l) } },
          { text: T(`P${k + 1} 的最后一段在 ${p.finish} 结束，所以完成时刻是 ${p.finish}（周转时间 ${p.tat}）。`, `P${k + 1} finishes at ${p.finish}.`) },
        ],
      };
    },
  },
  {
    id: 'os-sched-03',
    subject: 'os',
    chapter: 'process',
    topic: T('调度算法', 'Scheduling algorithms'),
    type: 'single',
    difficulty: 1,
    lessons: ['cpu-sched'],
    tags: ['概念'],
    question: T('下列调度算法中，不会让某个进程长期得不到运行（饥饿）的是：', 'Which algorithm cannot starve a process?'),
    options: [T('先来先服务', 'FCFS'), T('短作业优先', 'Shortest job first'), T('静态优先级调度', 'Static priority'), T('最短剩余时间优先', 'Shortest remaining time first')],
    answer: 0,
    steps: [
      { text: T('先来先服务按到达顺序运行，排在前面的总会运行完，后面的迟早轮到。', 'FCFS runs jobs in arrival order; everyone eventually runs.'), go: { lesson: 'cpu-sched', doc: 'algo' } },
      { text: T('短作业优先、最短剩余时间优先：短进程源源不断到来时，长进程一直被插队；静态优先级：低优先级进程可能一直等。高响应比优先、时间片轮转也不会饥饿。', 'SJF / SRTF starve long jobs; static priority starves low priorities. HRRN and RR do not starve.') },
    ],
  },
  {
    id: 'os-sem-01',
    subject: 'os',
    chapter: 'process',
    topic: T('信号量', 'Semaphores'),
    type: 'number',
    difficulty: 1,
    lessons: ['semaphore'],
    tags: ['计算'],
    make(r) {
      const k = r.int(1, 3);
      const n = k + r.int(1, 4);
      const ops = Array.from({ length: n }, (_, i) => `P${i + 1}:P(S)`).join(' ');
      const params = { sems: `S=${k}`, ops };
      const l = L('semaphore', params);
      const sim = l.sim;
      const fin = sim.steps.at(-1).after;
      return {
        question: T(`信号量 S 的初值为 ${k}，${n} 个进程先后各执行一次 P(S)，之后没有进程执行 V(S)。此时 S 的值是多少？`, `S starts at ${k}; ${n} processes each execute P(S) once and nobody signals. What is S now?`),
        answer: { value: fin },
        steps: [
          ...sim.steps.map((s, i) => ({ text: T(`P${i + 1} 执行 P(S)：S 从 ${s.before} 减到 ${s.after}${s.after < 0 ? '，小于 0，进程阻塞' : '，不小于 0，继续运行'}。`, `P${i + 1}: S ${s.before} → ${s.after}${s.after < 0 ? ', blocks' : ''}.`), go: { lesson: 'semaphore', params, step: Math.min(i, last(l)) } })),
          { text: T(`S = ${k} − ${n} = ${fin}。S 为负时，它的绝对值 ${-fin} 就是在 S 上阻塞的进程数。`, `S = ${fin}; |S| = ${-fin} processes are waiting.`), go: { lesson: 'semaphore', doc: 'sem' } },
        ],
      };
    },
  },
  {
    id: 'os-sem-02',
    subject: 'os',
    chapter: 'process',
    topic: T('信号量', 'Semaphores'),
    type: 'number',
    difficulty: 2,
    lessons: ['semaphore'],
    tags: ['计算'],
    make(r) {
      const n = r.int(3, 8);
      return {
        question: T(`${n} 个进程用信号量 mutex 互斥地进入同一临界区，mutex 初值为 1。mutex 可能取到的最小值是多少？`, `${n} processes use mutex (initially 1) for one critical section. What is the smallest value mutex can reach?`),
        answer: { value: 1 - n },
        steps: [
          { text: T('最坏情况：一个进程在临界区里，其余进程都执行了 P(mutex) 在等。', 'Worst case: one process inside, all others waiting after P(mutex).'), go: { lesson: 'semaphore', params: { sems: 'mutex=1', ops: Array.from({ length: n }, (_, i) => `P${i + 1}:P(mutex)`).join(' ') }, step: n - 1 } },
          { text: T(`每次 P 减 1：1 − ${n} = ${1 - n}。所以取值范围是 ${1 - n} ～ 1。`, `1 − ${n} = ${1 - n}; the range is ${1 - n} to 1.`), go: { lesson: 'semaphore', doc: 'sem' } },
        ],
      };
    },
  },
  {
    id: 'os-ctx-01',
    subject: 'os',
    chapter: 'process',
    topic: T('上下文切换', 'Context switches'),
    type: 'single',
    difficulty: 2,
    lessons: ['ctx-switch'],
    tags: ['概念'],
    question: T('关于进程的上下文切换，下列说法正确的是：', 'Which statement about context switches is true?'),
    options: [
      T('进程切换一定是在内核态完成的', 'A process switch always happens in kernel mode'),
      T('进程每执行一次系统调用，都会引起一次进程切换', 'Every system call causes a process switch'),
      T('同一进程内的两个线程切换，也必须重新装入页表基址寄存器', 'Switching threads of one process reloads the page-table base'),
      T('保存到 PCB 里的 PC 是中断服务程序的入口地址', 'The PC saved in the PCB is the handler’s entry address'),
    ],
    answer: 0,
    steps: [
      { text: T('保存、恢复上下文和调度都由内核完成，所以一定在内核态。', 'Saving, scheduling and restoring are kernel work.'), go: { lesson: 'ctx-switch', doc: 'steps' } },
      { text: T('不阻塞的系统调用（如 getpid）办完就回到原进程，只是模式切换。', 'A non-blocking call returns to the same process: only a mode switch.'), go: { lesson: 'ctx-switch', params: { trigger: 'syscall', target: 'process' }, step: 3 } },
      { text: T('同一进程的线程共享地址空间，不用换页表；保存的 PC 是断点（被打断的下一条指令）。', 'Threads share the page table; the saved PC is the breakpoint.'), go: { lesson: 'ctx-switch', params: { trigger: 'timer', target: 'thread' }, step: 5 } },
    ],
  },
  {
    id: 'os-ctx-02',
    subject: 'os',
    chapter: 'process',
    topic: T('上下文切换', 'Context switches'),
    type: 'judge',
    difficulty: 2,
    lessons: ['ctx-switch'],
    tags: ['过程推演'],
    make(r) {
      const trigger = r.pick(['timer', 'block', 'syscall']);
      const target = r.pick(['process', 'thread']);
      const params = { trigger, target };
      const l = L('ctx-switch', params);
      const sim = l.sim;
      const space = sim.steps.findIndex((s) => s.kind === 'space');
      const truth = space >= 0;
      const what = { timer: T('时钟中断到来，A 的时间片用完', 'a timer interrupt ends A’s slice'), block: T('A 调用 read 读磁盘，数据还没准备好', 'A calls read() and must wait for the disk'), syscall: T('A 调用 getpid', 'A calls getpid()') }[trigger];
      const next = target === 'thread' ? T('同一进程中的另一个线程', 'another thread of A') : T('另一个进程 B', 'another process B');
      return {
        question: T(`进程 A 正在用户态运行，${what.zh}。就绪队列最前面是${next.zh}。判断：接下来 CPU 的页表基址寄存器会被改写。`, `A runs in user mode; ${what.en}. The ready queue starts with ${next.en}. True or false: the page-table base register will be reloaded.`),
        answer: truth,
        steps: [
          trigger === 'syscall'
            ? { text: T('getpid 马上有结果，内核直接返回 A，根本没有进程切换，页表基址不变。', 'getpid returns to A at once: no switch.'), go: { lesson: 'ctx-switch', params, step: last(l) } }
            : { text: T(`A ${trigger === 'timer' ? '变成就绪' : '被阻塞'}，内核保存 A 的上下文，调度选中队首。`, `A is ${trigger === 'timer' ? 'ready' : 'blocked'}; the kernel saves it and picks the head.`), go: { lesson: 'ctx-switch', params, step: 3 } },
          trigger === 'syscall'
            ? { text: T('所以说法错误。', 'So false.'), go: { lesson: 'ctx-switch', doc: 'not' } }
            : target === 'thread'
              ? { text: T('切到的是同一进程的线程，共享地址空间，页表基址不用换，所以说法错误。', 'Same process: no page-table change. False.'), go: { lesson: 'ctx-switch', doc: 'thread' } }
              : { text: T('切到另一个进程，要换成 B 的页表基址，TLB 也失效，所以说法正确。', 'Another process: B’s page table is loaded. True.'), go: { lesson: 'ctx-switch', params, step: space } },
        ],
      };
    },
  },
  {
    id: 'os-proc-01',
    subject: 'os',
    chapter: 'process',
    topic: T('进程状态', 'Process states'),
    type: 'single',
    difficulty: 1,
    lessons: ['proc-state'],
    tags: ['概念'],
    question: T('下列进程状态转换中，不可能直接发生的是：', 'Which transition cannot happen directly?'),
    options: [T('运行 → 阻塞', 'running → blocked'), T('阻塞 → 就绪', 'blocked → ready'), T('就绪 → 运行', 'ready → running'), T('阻塞 → 运行', 'blocked → running')],
    answer: 3,
    steps: [
      { text: T('阻塞的进程等到的事件发生后，只是被唤醒变成就绪，还要等调度程序选中才能运行。', 'A woken process becomes ready and must still be scheduled.'), go: { lesson: 'proc-state', doc: 'states' } },
      { text: T('运行 → 阻塞是进程自己请求等待；就绪 → 运行是被调度选中。', 'running → blocked is the process’s own wait; ready → running is dispatch.') },
    ],
  },
  // ───── 内存管理 ─────
  {
    id: 'os-part-01',
    subject: 'os',
    chapter: 'memory',
    topic: T('动态分区分配', 'Dynamic partitioning'),
    type: 'number',
    difficulty: 2,
    lessons: ['partition'],
    tags: ['过程推演'],
    conv: T('内存 640KB，低端 40KB 是操作系统；分配时从空闲分区的低地址一端切出所需大小。', '640 KB memory, the lowest 40 KB for the OS; allocations take the low end of a free block.'),
    make(r) {
      const algo = r.pick(['FF', 'BF', 'WF']);
      const a = r.int(6, 15) * 10;
      const b = r.int(6, 12) * 10;
      const c = r.int(4, 12) * 10;
      const d = r.int(2, b / 10 - 1) * 10;
      const ops = `A+${a}, B+${b}, C+${c}, B-, D+${d}`;
      const params = { algo, mem: 640, os: 40, ops, minFrag: 0, compactOnFail: false };
      const l = L('partition', params);
      const sim = l.sim;
      const blk = sim.final.find((x) => x.owner === 'D');
      const before = sim.steps.at(-1).before.filter((x) => x.owner == null);
      const name = { FF: T('首次适应', 'first fit'), BF: T('最佳适应', 'best fit'), WF: T('最坏适应', 'worst fit') }[algo];
      return {
        question: T(`采用${name.zh}算法，依次执行：A 申请 ${a}KB、B 申请 ${b}KB、C 申请 ${c}KB、B 释放、D 申请 ${d}KB。D 分到的分区起始地址是多少 KB？`, `Under ${name.en}: A ${a} KB, B ${b} KB, C ${c} KB, free B, D ${d} KB. Where does D start (KB)?`),
        answer: { value: blk.start },
        steps: [
          { text: T(`A、B、C 依次从 40KB 起紧挨着分配；B 释放后，空闲分区为 ${before.map((x) => `${x.start}KB 起 ${x.size}KB`).join('，')}。`, `Free blocks before D: ${before.map((x) => `${x.start} (+${x.size})`).join(', ')}.`), go: { lesson: 'partition', params, step: Math.min(3, last(l)) } },
          { text: T(`${name.zh}：${algo === 'FF' ? '按地址从低到高找第一个够大的' : algo === 'BF' ? '找够大的里面最小的' : '找最大的'}，选中 ${blk.start}KB 开始的那一块，D 的起始地址是 ${blk.start}KB。`, `${name.en} picks the block at ${blk.start} KB.`), go: { lesson: 'partition', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'os-addr-01',
    subject: 'os',
    chapter: 'memory',
    topic: T('分页地址变换', 'Paging address translation'),
    type: 'number',
    difficulty: 1,
    lessons: ['addr-trans'],
    tags: ['计算'],
    make(r) {
      const L0 = r.pick([1024, 2048, 4096]);
      const frames = r.distinct(r.int(4, 6), 1, 15);
      const P = r.int(0, frames.length - 1);
      const W = r.int(0, L0 - 1);
      const A = P * L0 + W;
      const params = { mode: 'page', pageSize: L0, frames, addr: String(A), tableBase: 6000, entrySize: 4 };
      const l = L('addr-trans', params);
      const sim = l.sim;
      return {
        question: T(`页面大小 ${L0}B，页表中第 0、1、2… 页依次放在物理块 ${frames.join('、')}。逻辑地址 ${A}（十进制）对应的物理地址是多少？`, `Pages of ${L0} B; pages 0, 1, 2… are in frames ${frames.join(', ')}. What physical address does logical ${A} map to?`),
        answer: { value: sim.E },
        steps: [
          { text: T(`页号 P = ⌊${A} / ${L0}⌋ = ${sim.P}，页内偏移 W = ${A} mod ${L0} = ${sim.W}。`, `P = ${sim.P}, W = ${sim.W}.`), go: { lesson: 'addr-trans', params, step: 1 } },
          { text: T(`查页表：第 ${sim.P} 页在物理块 ${sim.b}。`, `Page ${sim.P} is in frame ${sim.b}.`), go: { lesson: 'addr-trans', params, step: Math.min(3, last(l)) } },
          { text: T(`物理地址 = ${sim.b} × ${L0} + ${sim.W} = ${sim.E}。`, `Physical = ${sim.b} × ${L0} + ${sim.W} = ${sim.E}.`), go: { lesson: 'addr-trans', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'os-addr-02',
    subject: 'os',
    chapter: 'memory',
    topic: T('多级页表', 'Multi-level page tables'),
    type: 'number',
    difficulty: 2,
    lessons: ['addr-trans'],
    tags: ['计算'],
    conv: T('每一级页表都要正好装进一页。', 'Every level of the page table must fit in one page.'),
    make(r) {
      const bits = r.pick([32, 36, 40, 48]);
      const page = r.pick([4096, 8192]);
      const entry = r.pick([4, 8]);
      const off = Math.log2(page);
      const per = Math.log2(page / entry);
      const levels = Math.ceil((bits - off) / per);
      return {
        question: T(`逻辑地址 ${bits} 位，页面大小 ${page / 1024}KB，页表项 ${entry}B。若每一级页表都不超过一页，至少要几级页表？`, `${bits}-bit logical addresses, ${page / 1024} KB pages, ${entry} B entries, each level within one page. How many levels at least?`),
        answer: { value: levels },
        steps: [
          { text: T(`页内偏移 log₂${page} = ${off} 位，页号 ${bits} − ${off} = ${bits - off} 位。`, `Offset ${off} bits; page number ${bits - off} bits.`), go: { lesson: 'addr-trans', doc: 'multi' } },
          { text: T(`一页能放 ${page} / ${entry} = ${page / entry} = 2^${per} 个页表项，每级最多管 ${per} 位页号。`, `${page / entry} = 2^${per} entries per page: ${per} bits per level.`) },
          { text: T(`级数 = ⌈${bits - off} / ${per}⌉ = ${levels}。`, `Levels = ⌈${bits - off} / ${per}⌉ = ${levels}.`) },
        ],
      };
    },
  },
  {
    id: 'os-eat-01',
    subject: 'os',
    chapter: 'memory',
    topic: T('快表与有效访问时间', 'TLB and effective access time'),
    type: 'number',
    difficulty: 2,
    lessons: ['tlb-eat'],
    tags: ['计算'],
    conv: T('先查快表，命中就直接访存；不命中再访问内存中的页表，然后访存。查快表和查页表是先后进行的；不考虑缺页。', 'Search the TLB first; on a miss read the page table, then memory. Sequential; no page faults.'),
    make(r) {
      const t = r.pick([10, 20, 30]);
      const m = r.pick([100, 150, 200]);
      const alpha = r.pick([80, 85, 90, 95, 98]);
      const params = { t, m, alpha, f: 0, T: 0, parallel: false, levels: 1, reHit: true };
      const l = L('tlb-eat', params);
      const sim = l.sim;
      const v = sim.eat;
      return {
        question: T(`查快表需 ${t}ns，访问一次内存需 ${m}ns，快表命中率 ${alpha}%。有效访问时间是多少 ns？`, `TLB ${t} ns, memory ${m} ns, hit rate ${alpha}%. What is the effective access time (ns)?`),
        answer: Number.isInteger(v) ? { value: v } : { value: v, tol: 0.06, show: v.toFixed(1) },
        steps: [
          { text: T(`命中：${t} + ${m} = ${sim.paths.hit.time}ns；不命中：${t} + ${m} + ${m} = ${sim.paths.miss.time}ns。`, `Hit ${sim.paths.hit.time} ns; miss ${sim.paths.miss.time} ns.`), go: { lesson: 'tlb-eat', params, step: Math.min(1, last(l)) } },
          { text: T(`EAT = ${alpha / 100} × ${sim.paths.hit.time} + ${(100 - alpha) / 100} × ${sim.paths.miss.time} = ${Number.isInteger(v) ? v : v.toFixed(1)}ns。`, `EAT = ${Number.isInteger(v) ? v : v.toFixed(1)} ns.`), go: { lesson: 'tlb-eat', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'os-ws-01',
    subject: 'os',
    chapter: 'memory',
    topic: T('工作集', 'Working sets'),
    type: 'number',
    difficulty: 1,
    lessons: ['working-set'],
    tags: ['计算'],
    conv: T('W(t, Δ) 取包括第 t 次在内的最近 Δ 次访问。', 'W(t, Δ) covers the last Δ references including reference t.'),
    make(r) {
      const pool = r.distinct(5, 0, 9);
      const refs = Array.from({ length: 12 }, () => r.pick(pool));
      const delta = r.int(3, 6);
      const t = r.int(delta, 11);
      const params = { refs, delta, frames: 3 };
      const l = L('working-set', params);
      const sim = l.sim;
      const win = refs.slice(t - delta + 1, t + 1);
      return {
        question: T(`页面访问串为 ${refs.join(' ')}，工作集窗口 Δ = ${delta}。第 ${t + 1} 次访问之后，工作集的大小是多少？`, `References ${refs.join(' ')}, window Δ = ${delta}. What is the working-set size after reference ${t + 1}?`),
        answer: { value: sim.sizes[t] },
        steps: [
          { text: T(`窗口是第 ${t - delta + 2}～${t + 1} 次访问：${win.join(' ')}。`, `Window: ${win.join(' ')}.`), go: { lesson: 'working-set', params, step: t } },
          { text: T(`去掉重复，工作集 = {${sim.ws[t].join(', ')}}，大小 ${sim.sizes[t]}。`, `W = {${sim.ws[t].join(', ')}}, size ${sim.sizes[t]}.`), go: { lesson: 'working-set', doc: 'ws' } },
        ],
      };
    },
  },
  {
    id: 'os-ws-02',
    subject: 'os',
    chapter: 'memory',
    topic: T('抖动', 'Thrashing'),
    type: 'single',
    difficulty: 1,
    lessons: ['working-set', 'page-replace'],
    tags: ['概念'],
    question: T('系统发生抖动（颠簸）的根本原因是：', 'The root cause of thrashing is:'),
    options: [T('同时运行的进程太多，分给每个进程的页框少于它的工作集', 'too many processes: each has fewer frames than its working set'), T('页面置换算法选得不好', 'a poor replacement algorithm'), T('磁盘的传输速率太低', 'a slow disk'), T('页面大小设得太大', 'pages that are too large')],
    answer: 0,
    steps: [
      { text: T('页框不够装下工作集，刚换出的页马上又要用。动画里工作集柱子冒过页框线的地方，缺页就扎堆。', 'Too few frames for the working set: just-evicted pages are needed again. Faults cluster where the bars exceed F.'), go: { lesson: 'working-set', params: { refs: [1, 2, 1, 3, 2, 1, 3, 2, 5, 6, 7, 5, 6, 8, 7, 5, 6, 8, 1, 2, 3, 1, 2], delta: 4, frames: 3 }, step: 13 } },
      { text: T('换更好的算法、更快的磁盘都治标不治本；要减少同时运行的进程，或者增加内存。', 'Better algorithms or disks do not fix it; reduce multiprogramming or add memory.'), go: { lesson: 'working-set', doc: 'thrash' } },
    ],
  },
  // ───── 文件管理 ─────
  {
    id: 'os-file-01',
    subject: 'os',
    chapter: 'file',
    topic: T('打开文件的过程', 'Opening a file'),
    type: 'number',
    difficulty: 2,
    lessons: ['open-file'],
    tags: ['计算'],
    conv: T('根目录的 inode 已在内存；每个目录的内容正好占一个磁盘块；读一个 inode 或一个块各算一次访盘；没有缓冲。', 'The root inode is in memory; each directory fits in one block; each inode or block read is one access; no cache.'),
    make(r) {
      const path = r.pick(['/home/ming/notes.txt', '/home/ming/todo.md', '/etc/hosts', '/readme']);
      const opened = r.pick(['no', 'yes']);
      const params = { path, who: 'ming', opened, n: 1500 };
      const l = L('open-file', params);
      const sim = l.sim;
      const depth = sim.parts.length;
      return {
        question: T(`进程打开文件 ${path}${opened === 'yes' ? '（另一个进程已经打开了这个文件，它的 inode 在内存里）' : ''}。open 过程中一共要访问磁盘几次？`, `A process opens ${path}${opened === 'yes' ? ' (another process already has it open)' : ''}. How many disk accesses does open() make?`),
        answer: { value: sim.openDisk },
        steps: [
          { text: T(`要查 ${depth} 个目录：根目录只读目录块（1 次），其余 ${depth - 1} 个各读 inode 和目录块（${2 * (depth - 1)} 次）。`, `${depth} directories: 1 read for the root, 2 for each of the other ${depth - 1}.`), go: { lesson: 'open-file', params, step: depth } },
          { text: opened === 'yes' ? T('文件的 inode 已经在内存，不用再读。', 'The file inode is already in memory.') : T('再读文件自己的 inode（1 次）。', 'Then read the file inode (1).'), go: { lesson: 'open-file', params, step: depth + 1 } },
          { text: T(`合计 ${sim.openDisk} 次。open 不读文件内容。`, `Total ${sim.openDisk}; open() reads no file data.`), go: { lesson: 'open-file', doc: 'open' } },
        ],
      };
    },
  },
  {
    id: 'os-file-02',
    subject: 'os',
    chapter: 'file',
    topic: T('混合索引', 'Combined indexing'),
    type: 'number',
    difficulty: 2,
    lessons: ['file-index'],
    tags: ['计算'],
    conv: T('inode 已在内存；每次读一个索引块或数据块都算一次访盘。', 'The inode is in memory; each index or data block read is one access.'),
    make(r) {
      const block = r.pick([1024, 2048, 4096]);
      const k = block / 4;
      const lvl = r.pick([0, 1, 2]);
      const lo = [0, 10, 10 + k][lvl];
      const hi = [10, 10 + k, 10 + k + k * k][lvl];
      const lb = r.int(lo, Math.min(hi - 1, lo + 5000));
      const offset = lb * block + r.int(0, block - 1);
      const params = { block, addr: 4, d: 10, s: 1, dd: 1, t: 1, offset: String(offset), inodeInMem: true };
      const l = L('file-index', params);
      const sim = l.sim;
      const where = [T('直接地址', 'a direct pointer'), T('一次间接', 'the single indirect block'), T('二次间接', 'the double indirect block')][sim.level];
      return {
        question: T(`inode 里有 10 个直接地址、1 个一次间接、1 个二次间接、1 个三次间接地址；块大小 ${block}B，地址项 4B。读文件中偏移 ${offset} 处的那个字节，要访问磁盘几次？`, `10 direct, 1 single, 1 double, 1 triple indirect pointers; ${block} B blocks, 4 B addresses. How many disk reads to read byte ${offset}?`),
        answer: { value: sim.reads },
        steps: [
          { text: T(`逻辑块号 = ⌊${offset} / ${block}⌋ = ${sim.L}。每个索引块能放 ${block}/4 = ${k} 个地址。`, `Logical block ${sim.L}; ${k} addresses per index block.`), go: { lesson: 'file-index', params, step: 0 } },
          { text: T(`直接地址管 0～9，一次间接管 10～${9 + k}，二次间接管 ${10 + k}～${9 + k + k * k}：块 ${sim.L} 落在${where.zh}。`, `Block ${sim.L} is reached through ${where.en}.`), go: { lesson: 'file-index', params, step: Math.min(1, last(l)) } },
          { text: T(`要读 ${sim.level} 个索引块，再读 1 个数据块，共 ${sim.reads} 次。`, `${sim.level} index block(s) plus the data block: ${sim.reads}.`), go: { lesson: 'file-index', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'os-link-01',
    subject: 'os',
    chapter: 'file',
    topic: T('硬链接与软链接', 'Hard and symbolic links'),
    type: 'single',
    difficulty: 2,
    lessons: ['file-link'],
    tags: ['过程推演'],
    make(r) {
      const scene = r.pick(['orig', 'both', 'recreate', 'hard']);
      const params = { scene };
      const l = L('file-link', params);
      const [b, c] = l.sim.after;
      const ops = { orig: T('rm a.txt', 'rm a.txt'), both: T('rm a.txt，再 rm b', 'rm a.txt; rm b'), recreate: T('rm a.txt，然后新建一个文件 a.txt', 'rm a.txt; create a new a.txt'), hard: T('rm b', 'rm b') }[scene];
      const opts = [T('b 和 c 都能读到原来 a.txt 的内容', 'both b and c read the original content'), T('只有 b 能读到原来的内容', 'only b reads the original content'), T('只有 c 能读到原来的内容', 'only c reads the original content'), T('b、c 都读不到原来的内容', 'neither reads the original content')];
      const okB = b.ok && b.ino === 37;
      const okC = c.ok && c.ino === 37;
      const answer = okB && okC ? 0 : okB ? 1 : okC ? 2 : 3;
      return {
        question: T(`目录里有文件 a.txt。执行 ln a.txt b（硬链接）和 ln -s a.txt c（软链接）后，又执行 ${ops.zh}。这时：`, `After ln a.txt b and ln -s a.txt c, run ${ops.en}. Then:`),
        options: opts,
        answer,
        steps: [
          { text: T('b 和 a.txt 指向同一个 inode，计数 2；c 是新的 inode，里面存的是路径「a.txt」。', 'b shares the inode (count 2); c holds the path.'), go: { lesson: 'file-link', params, step: 2 } },
          { text: T(`最后：读 b ${b.ok ? `到 inode ${b.ino}` : '失败（目录项已删）'}；读 c ${c.ok ? `按名字找到 inode ${c.ino}${c.ino === 37 ? '' : '（是新文件，不是原来的）'}` : '按路径找不到 a.txt，悬空'}。`, `b ${b.ok ? `→ inode ${b.ino}` : 'is gone'}; c ${c.ok ? `→ inode ${c.ino}` : 'dangles'}.`), go: { lesson: 'file-link', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'os-link-02',
    subject: 'os',
    chapter: 'file',
    topic: T('硬链接与软链接', 'Hard and symbolic links'),
    type: 'number',
    difficulty: 1,
    lessons: ['file-link'],
    tags: ['计算'],
    make(r) {
      const h = r.int(2, 5);
      const s = r.int(1, 3);
      const d = r.int(1, h);
      const count = 1 + h - d;
      return {
        question: T(`文件 f 刚建立时链接计数为 1。之后为它建立了 ${h} 个硬链接和 ${s} 个符号链接，又删除了其中 ${d} 个硬链接。此时 f 的 inode 中链接计数是多少？`, `File f starts with link count 1. Then ${h} hard links and ${s} symbolic links are made, and ${d} of the hard links are removed. What is f’s link count?`),
        answer: { value: count },
        steps: [
          { text: T(`每个硬链接是一个指向同一 inode 的目录项，计数加 1；删除一个减 1：1 + ${h} − ${d} = ${count}。`, `Hard links count: 1 + ${h} − ${d} = ${count}.`), go: { lesson: 'file-link', doc: 'hard' } },
          { text: T(`符号链接是另外的文件，有自己的 inode，不影响 f 的计数，所以那 ${s} 个不算。`, `Symbolic links have their own inodes and do not count.`), go: { lesson: 'file-link', doc: 'soft' } },
        ],
      };
    },
  },
  // ───── 输入 / 输出 ─────
  {
    id: 'os-disk-01',
    subject: 'os',
    chapter: 'io',
    topic: T('磁盘调度', 'Disk scheduling'),
    type: 'number',
    difficulty: 2,
    lessons: ['disk-sched'],
    tags: ['过程推演'],
    conv: T('磁道号 0～199，磁头正向磁道号增大的方向移动。SCAN 走到端点 199 才掉头；LOOK 走到最远的请求就掉头。SSTF 距离相同时沿当前方向优先。', 'Tracks 0–199; the head moves toward higher tracks. SCAN turns at 199, LOOK at the farthest request. SSTF ties follow the current direction.'),
    make(r) {
      const algo = r.pick(['FCFS', 'SSTF', 'SCAN', 'LOOK']);
      const head = r.int(50, 150);
      const reqs = r.distinct(6, 0, 199).filter((x) => x !== head);
      while (reqs.length < 6) {
        const x = r.int(0, 199);
        if (x !== head && !reqs.includes(x)) reqs.push(x);
      }
      const params = { algo, head, reqs, max: 199, dir: 'up', countReturn: true };
      const l = L('disk-sched', params);
      const sim = l.sim;
      return {
        question: T(`磁头当前在 ${head} 号磁道，请求队列依次为 ${reqs.join('、')}。采用 ${algo} 算法，磁头移动的总距离是多少个磁道？`, `Head at ${head}; requests ${reqs.join(', ')}. Under ${algo}, how many tracks does the head travel in total?`),
        answer: { value: sim.total },
        steps: [
          { text: T(`访问顺序：${head} → ${sim.path.map((p) => p.track).join(' → ')}。`, `Order: ${head} → ${sim.path.map((p) => p.track).join(' → ')}.`), go: { lesson: 'disk-sched', params, step: last(l) } },
          { text: T(`各段距离 ${sim.path.filter((p) => p.counted).map((p) => p.dist).join(' + ')} = ${sim.total}。`, `${sim.path.filter((p) => p.counted).map((p) => p.dist).join(' + ')} = ${sim.total}.`), go: { lesson: 'disk-sched', doc: 'algo' } },
        ],
      };
    },
  },
  {
    id: 'os-io-01',
    subject: 'os',
    chapter: 'io',
    topic: T('缓冲区', 'Buffering'),
    type: 'number',
    difficulty: 2,
    lessons: ['io-buffer'],
    tags: ['计算'],
    conv: T('T：把一块数据从磁盘读进缓冲区；M：从缓冲区送到用户区；C：CPU 处理一块。缓冲区空了才能往里读，送走以后才算空。', 'T: disk → buffer; M: buffer → user area; C: processing. A buffer can be refilled only after it is emptied.'),
    make(r) {
      const mode = r.pick(['single', 'double']);
      const n = r.int(3, 6);
      const T0 = r.int(5, 15) * 10;
      const M = r.int(1, 5) * 10;
      const C = r.int(3, 15) * 10;
      const params = { mode, n, T: T0, M, C };
      const l = L('io-buffer', params);
      const sim = l.sim;
      return {
        question: T(`${mode === 'single' ? '单缓冲' : '双缓冲'}，T = ${T0}μs，M = ${M}μs，C = ${C}μs。连续处理 ${n} 块数据（从读第 1 块开始，到第 ${n} 块处理完）一共要多少 μs？`, `${mode === 'single' ? 'Single' : 'Double'} buffering, T = ${T0}, M = ${M}, C = ${C} μs. How long to process ${n} blocks from the first read to the last computation?`),
        answer: { value: sim.total },
        steps: [
          { text: mode === 'single' ? T(`单缓冲：稳定后每块用时 max(C, T) + M = ${Math.max(C, T0) + M}μs。`, `Single: max(C, T) + M per block.`) : T(`双缓冲：稳定后每块用时 max(C + M, T) = ${Math.max(C + M, T0)}μs。`, `Double: max(C + M, T) per block.`), go: { lesson: 'io-buffer', doc: mode } },
          { text: T(`按时间线逐块排：最后一块在 ${sim.total}μs 处理完。`, `Timeline: the last block finishes at ${sim.total} μs.`), go: { lesson: 'io-buffer', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'os-io-02',
    subject: 'os',
    chapter: 'io',
    topic: T('I/O 软件层次', 'I/O software layers'),
    type: 'single',
    difficulty: 1,
    lessons: ['io-ctrl'],
    tags: ['概念'],
    make(r) {
      const items = [
        [T('把逻辑设备名映射为物理设备', 'mapping a logical device name to a physical device'), 1],
        [T('向设备控制器的寄存器写入命令', 'writing commands into a controller’s registers'), 2],
        [T('为用户程序提供 printf 这样的库函数', 'providing library functions such as printf'), 0],
        [T('I/O 完成后唤醒等待的进程', 'waking the waiting process when I/O completes'), 3],
        [T('设备的分配与回收', 'allocating and releasing devices'), 1],
      ];
      const [what, k] = r.pick(items);
      const layers = [T('用户层 I/O 软件', 'user-level I/O software'), T('设备独立性软件', 'device-independent software'), T('设备驱动程序', 'device drivers'), T('中断处理程序', 'interrupt handlers')];
      return {
        question: T(`「${what.zh}」由 I/O 软件的哪一层完成？`, `Which layer does “${what.en}”?`),
        options: layers,
        answer: k,
        steps: [{ text: T(`和具体设备有关的是驱动程序，和设备无关的通用工作是设备独立性软件。所以是「${layers[k].zh}」。`, `Device-specific work is the driver’s; generic work is device-independent. Answer: ${layers[k].en}.`), go: { lesson: 'io-ctrl', doc: 'layers' } }],
      };
    },
  },
  {
    id: 'os-io-03',
    subject: 'os',
    chapter: 'io',
    topic: T('设备分配', 'Device allocation'),
    type: 'single',
    difficulty: 2,
    lessons: ['io-ctrl'],
    tags: ['概念'],
    question: T('设备分配采用「安全分配方式」（进程发出 I/O 请求后立即阻塞，直到 I/O 完成）时，破坏了死锁的哪个必要条件？', 'Safe device allocation (a process blocks right after each I/O request) breaks which deadlock condition?'),
    options: [T('互斥', 'Mutual exclusion'), T('请求并保持', 'Hold and wait'), T('不可剥夺', 'No preemption'), T('循环等待', 'Circular wait')],
    answer: 1,
    steps: [
      { text: T('进程阻塞期间不能再提出新的请求，也就不会「拿着一个设备再要另一个」。', 'While blocked it cannot request more, so it never holds one device while asking for another.'), go: { lesson: 'io-ctrl', doc: 'alloc' } },
      { text: T('代价是进程推进慢、CPU 和设备并行程度低。', 'The price is slower progress.'), go: { lesson: 'banker', doc: 'cond' } },
    ],
  },
  // ───── 概述 ─────
  {
    id: 'os-intr-01',
    subject: 'os',
    chapter: 'basics',
    topic: T('特权指令', 'Privileged instructions'),
    type: 'multi',
    difficulty: 1,
    lessons: ['interrupt'],
    tags: ['概念'],
    make(r) {
      const priv = [T('设置时钟（定时器）', 'set the timer'), T('关中断', 'disable interrupts'), T('装入页表基址寄存器', 'load the page-table base register'), T('I/O 指令', 'I/O instructions')];
      const non = [T('陷入指令（访管指令）', 'the trap instruction'), T('读时钟', 'read the clock'), T('整数加法', 'integer addition'), T('从内存取数', 'load from memory')];
      const right = r.shuffle(priv).slice(0, r.int(2, 3));
      const wrong = r.shuffle(non).slice(0, 5 - right.length);
      const all = r.shuffle([...right, ...wrong]);
      const answer = all.map((o, i) => (right.includes(o) ? i : -1)).filter((i) => i >= 0);
      return {
        question: T('下列指令中，只能在内核态执行的有：', 'Which can run only in kernel mode?'),
        options: all,
        answer,
        steps: [
          { text: T(`特权指令：${right.map((o) => o.zh).join('、')}。它们会影响整个系统，用户程序不能直接执行。`, `Privileged: ${right.map((o) => o.en).join(', ')}.`), go: { lesson: 'interrupt', doc: 'mode' } },
          { text: T(`${wrong.map((o) => o.zh).join('、')} 都能在用户态执行；陷入指令正是在用户态执行、用来进入内核的。`, `${wrong.map((o) => o.en).join(', ')} run in user mode; the trap instruction is how user code enters the kernel.`) },
        ],
      };
    },
  },
];
