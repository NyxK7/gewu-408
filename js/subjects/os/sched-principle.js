// 「进程调度」这节课的原理：调度层次、时机、评价指标、各算法对比、多级反馈队列。
import { T } from '../../core/i18n.js';

export const SCHED_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要调度', 'Why schedule'),
      blocks: [
        { p: T('就绪的进程往往比 CPU 多，CPU 每次只能运行一个。**处理机调度**就是按某种规则，从就绪队列里选一个进程把 CPU 分给它。选得好，CPU 一直有活干，进程等得也少；选得不好，短作业被长作业堵住，或者有的进程一直轮不到。', 'Ready processes usually outnumber CPUs. **CPU scheduling** picks one from the ready queue by some rule. Good choices keep the CPU busy and waiting short; bad ones let long jobs block short ones or starve some processes.') },
      ],
    },
    {
      id: 'levels',
      title: T('调度的三个层次', 'Three levels of scheduling'),
      blocks: [
        {
          table: {
            head: [T('层次', 'Level'), T('做什么', 'What'), T('频率', 'Frequency')],
            rows: [
              [T('高级调度（作业调度）', 'Long-term (job)'), T('从外存的后备队列里选作业装入内存，建立进程', 'admit jobs from disk, creating processes'), T('最低', 'lowest')],
              [T('中级调度（内存调度）', 'Medium-term'), T('把暂时不能运行的进程换到外存（挂起），条件满足时再调回', 'swap processes out (suspend) and back in'), T('中等', 'medium')],
              [T('低级调度（进程调度）', 'Short-term (CPU)'), T('从就绪队列里选一个进程，把 CPU 分给它', 'pick a ready process for the CPU'), T('最高', 'highest')],
            ],
          },
        },
        { tip: T('本节课的甘特图讲的都是**低级调度**：同一时刻只有一个进程在 CPU 上运行。', 'The Gantt charts here are all **short-term** scheduling: one process on the CPU at a time.') },
      ],
    },
    {
      id: 'when',
      title: T('什么时候调度：抢占与非抢占', 'When: preemptive or not'),
      blocks: [
        {
          list: [
            T('**非抢占式**：进程一旦拿到 CPU，就一直运行到完成或主动放弃（阻塞、结束）为止。', '**Non-preemptive**: once running, a process keeps the CPU until it finishes or blocks.'),
            T('**抢占式**：有更重要的进程到来（优先级更高、剩余时间更短）或时间片用完时，可以把 CPU 收回来。', '**Preemptive**: the CPU can be taken back when a more important process arrives or a quantum expires.'),
          ],
        },
        { p: T('**不能进行进程调度与切换**的情况：在处理中断的过程中；进程在操作系统内核程序的临界区中；在原子操作（原语）的执行过程中。', '**No switching** while handling an interrupt, inside an OS-kernel critical section, or during an atomic primitive.') },
      ],
    },
    {
      id: 'impl',
      title: T('调度的实现', 'How scheduling is implemented'),
      blocks: [
        { p: T('**调度时机**：当前进程运行结束、阻塞（等 I/O、P 操作）、主动让出时一定要调度；抢占式系统里，新进程到达、时间片用完、更高优先级的进程就绪时也要调度。具体动作通常在中断或系统调用处理完、**返回用户态之前**检查要不要换进程。', '**When**: on exit, blocking or yielding; with preemption also on arrivals, quantum expiry or higher priority. The check usually happens just before returning to user mode.') },
        { list: [
          T('**调度程序（调度器）**：排队器把就绪进程按策略排好；分派器从就绪队列里取出选中的进程，把 CPU 交给它；上下文切换器保存旧进程、恢复新进程的现场。', '**Scheduler**: the queuer orders ready processes, the dispatcher hands the CPU to the chosen one, the context switcher saves and restores state.'),
          T('**闲逛进程（idle）**：没有别的就绪进程时运行它。它优先级最低，不需要 CPU 之外的资源，永远不会阻塞；它运行时可以执行节能指令。', '**Idle process**: runs when nothing else is ready; lowest priority, never blocks.'),
          T('**用户级线程**：内核不知道线程的存在，调度的单位是进程；一个线程阻塞，整个进程都阻塞。**内核级线程**：内核直接调度线程，同一进程的线程可以分别运行在不同 CPU 上，切换开销比用户级线程大。', '**User-level threads** are invisible to the kernel (one blocks, all block); **kernel-level threads** are scheduled individually.'),
          T('**多处理机调度**：可以所有 CPU 共用一个就绪队列（自然负载均衡，但要互斥访问队列），也可以每个 CPU 一个私有就绪队列（要做负载均衡：推送或拉取进程）；尽量让进程留在原来的 CPU 上运行（**处理机亲和性**），缓存里的数据还能用。', '**Multiprocessor**: one shared ready queue (balanced but locked) or per-CPU queues (needs migration); prefer **processor affinity** to keep caches warm.'),
          T('**调度目标**：提高 CPU 利用率和吞吐量，缩短周转时间、等待时间和响应时间，兼顾公平；不同系统侧重点不同（批处理看吞吐量和周转时间，分时看响应时间，实时看截止时间）。', '**Goals**: utilisation, throughput, turnaround, waiting and response time, fairness; batch, time-sharing and real-time systems weigh them differently.'),
        ] },
      ],
    },
    {
      id: 'metric',
      title: T('评价指标', 'Metrics'),
      blocks: [
        {
          table: {
            head: [T('指标', 'Metric'), T('定义', 'Definition')],
            rows: [
              [T('CPU 利用率', 'CPU utilisation'), T('CPU 忙的时间 ÷ 总时间', 'busy time ÷ total time')],
              [T('吞吐量', 'Throughput'), T('单位时间内完成的作业数', 'jobs completed per unit time')],
              [T('周转时间', 'Turnaround'), T('完成时间 − 到达（提交）时间', 'finish − arrival')],
              [T('带权周转时间', 'Weighted turnaround'), T('周转时间 ÷ 实际运行时间，总是 ≥ 1', 'turnaround ÷ burst, always ≥ 1')],
              [T('等待时间', 'Waiting'), T('在就绪队列里等的时间 = 周转时间 − 运行时间（不考虑 I/O 时）', 'time in the ready queue = turnaround − burst (no I/O)')],
              [T('响应时间', 'Response'), T('从提交请求到首次产生响应（首次运行）的时间', 'from request to first response')],
            ],
          },
        },
      ],
    },
    {
      id: 'algo',
      title: T('调度算法对比', 'The algorithms compared'),
      blocks: [
        {
          table: {
            head: [T('算法', 'Algorithm'), T('选谁', 'Picks'), T('抢占', 'Preemptive'), T('饥饿', 'Starvation'), T('特点', 'Notes')],
            rows: [
              ['FCFS', T('最先到达的', 'earliest arrival'), T('否', 'no'), T('不会', 'no'), T('公平、简单；对长作业有利，对短作业不利', 'simple; favours long jobs')],
              ['SJF / SPF', T('运行时间最短的', 'shortest burst'), T('否', 'no'), T('会（长作业）', 'yes (long jobs)')
                , T('平均等待、平均周转时间最短（同时到达时）；运行时间要预估', 'minimal average wait (all arriving together); bursts must be estimated')],
              ['SRTF / SRTN', T('剩余时间最短的', 'least remaining'), T('是', 'yes'), T('会', 'yes'), T('SJF 的抢占版本，新到进程剩余时间更短就抢占', 'preemptive SJF')],
              ['HRRN', T('响应比最高的', 'highest response ratio'), T('否', 'no'), T('不会', 'no'), T('响应比 = (等待 + 要求服务) ÷ 要求服务，兼顾短作业和等得久的长作业', 'ratio = (wait + service) ÷ service balances both')],
              [T('优先级', 'Priority'), T('优先级最高的', 'highest priority'), T('两种都有', 'both'), T('会（低优先级）', 'yes (low priority)'), T('静态 / 动态优先级；可以用「老化」防饥饿', 'static or dynamic; ageing prevents starvation')],
              ['RR', T('就绪队列队首，运行一个时间片', 'queue head for one quantum'), T('是', 'yes'), T('不会', 'no'), T('适合分时系统，响应快；时间片太大退化成 FCFS，太小切换开销大', 'good response; too large becomes FCFS, too small wastes switches')],
              [T('多级反馈队列', 'Multilevel feedback'), T('见下一节', 'see next section'), T('是', 'yes'), T('会', 'yes'), T('综合了以上优点，是比较理想的通用算法', 'combines the strengths above')],
            ],
          },
        },
      ],
    },
    {
      id: 'mlfq',
      title: T('多级反馈队列', 'Multilevel feedback queue'),
      blocks: [
        {
          list: [
            T('设多个就绪队列，**优先级从高到低**，**时间片从小到大**（越往下越大）。', 'Several ready queues: **priority high to low**, **quantum small to large**.'),
            T('新进程先进第 1 级队列队尾；在本级时间片内没运行完，就降到下一级队尾；到最后一级就按 RR 轮转。', 'New processes enter level 1; one not finishing in its quantum drops a level; the last level is round robin.'),
            T('只有上一级队列空了，才调度下一级的进程。下级进程运行时有新进程进入上级队列，就抢占 CPU，被抢占的进程放回本级队尾。', 'A lower level runs only when all higher ones are empty; a newcomer to a higher level preempts it, and the preempted process returns to the tail of its level.'),
          ],
        },
        { tip: T('效果：短作业在高级队列里很快完成，响应好；长作业逐级下沉，用大时间片减少切换。但如果一直有新进程来，最低级的长作业可能饥饿。', 'Short jobs finish quickly near the top; long ones sink and use big quanta. Constant arrivals can still starve the bottom.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('周转时间从**到达**算起，不是从开始运行算起。', 'Turnaround counts from **arrival**, not from first run.'),
            T('SJF 是非抢占的；SRTF 才会在新进程到达时比较剩余时间并抢占。', 'SJF never preempts; SRTF compares remaining times on arrivals.'),
            T('HRRN 是非抢占的，响应比只在 CPU 空出来时才计算。', 'HRRN is non-preemptive: ratios are computed only when the CPU frees up.'),
            T('RR 中时间片用完的进程和同一时刻新到达的进程谁先入队，各教材说法不一，做题要看题目约定（本课默认新到达的先入队，可以切换）。', 'In RR, whether a newcomer or the preempted job queues first differs between texts; check the question (newcomer first by default here).'),
            T('带权周转时间 ≥ 1；等于 1 说明进程一到就运行、没有等待。', 'Weighted turnaround is ≥ 1; exactly 1 means no waiting at all.'),
          ],
        },
      ],
    },
  ],
};

export const schedRef = (sim, s) => {
  if (s.pid == null) return 'when';
  return 'algo';
};
