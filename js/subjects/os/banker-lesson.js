// 「死锁与银行家算法」：Max / Allocation / Need 三个矩阵和 Work 向量，一行一行找能满足的进程，拼出安全序列。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { simulate } from './banker.js';

const BASE = { avail: '3 3 2', max: '7 5 3; 3 2 2; 9 0 2; 2 2 2; 4 3 3', alloc: '0 1 0; 2 0 0; 3 0 2; 2 1 1; 0 0 2' };
const SPEC = {
  presets: [
    { label: T('安全性检查', 'Safety check'), set: { ...BASE, req: '', reqP: 0 } },
    { label: T('P1 请求 (1,0,2)：批准', 'P1 asks (1,0,2): granted'), set: { ...BASE, req: '1 0 2', reqP: 1 } },
    { label: T('P4 请求 (3,3,0)：不安全', 'P4 asks (3,3,0): unsafe'), set: { ...BASE, req: '3 3 0', reqP: 4 } },
    { label: T('请求超过 Available：等待', 'Over Available: wait'), set: { ...BASE, req: '6 0 0', reqP: 2 } },
  ],
  groups: [
    {
      legend: T('资源状态（矩阵每行一个进程，用 ; 分隔）', 'State (one process per row, rows split by ;)'),
      fields: [
        { name: 'avail', label: 'Available', type: 'text', wide: true },
        { name: 'max', label: 'Max', type: 'text', wide: true },
        { name: 'alloc', label: 'Allocation', type: 'text', wide: true },
      ],
    },
    {
      legend: T('资源请求（可空）', 'A request (optional)'),
      fields: [
        { name: 'reqP', label: T('请求的进程 Pi 的 i', 'Requesting process i'), type: 'int', min: 0, max: 7 },
        { name: 'req', label: T('请求向量 Request（空 = 只做安全性检查）', 'Request vector (empty = safety check only)'), type: 'text', wide: true },
      ],
    },
  ],
  note: T(
    'Need = Max − Allocation。安全性算法按 P0、P1、P2…… 的顺序一轮一轮扫描，同一轮里遇到 Need ≤ Work 的进程就让它运行完、归还资源（Work 加上它的 Allocation），再接着看后面的进程。安全序列可能不止一个，按其他顺序找到的合法序列同样正确。',
    'Need = Max − Allocation. The safety algorithm scans P0, P1, P2… in rounds; whenever Need ≤ Work the process runs to completion and returns its allocation (Work += Allocation), then the scan continues. Several safe sequences may exist; any valid one is correct.',
  ),
};
const ERR = {
  avail: T('Available 的写法不对（如 3 3 2）', 'Write Available like 3 3 2'),
  matrix: T('矩阵的写法不对（如 7 5 3; 3 2 2）', 'Write matrices like 7 5 3; 3 2 2'),
  size: T('最多 8 个进程、5 类资源', 'At most 8 processes and 5 resource types'),
  shape: T('Max、Allocation 的行列数要和进程数、资源种类数一致', 'Max and Allocation must match in shape'),
  allocMax: T('某个进程的 Allocation 超过了它的 Max', 'An allocation exceeds its maximum'),
  req: T('请求向量的写法或长度不对', 'The request vector is malformed'),
  reqP: T('请求的进程不存在', 'No such process'),
};

const vec = (v) => `(${v.join(', ')})`;

function board(sim, st, z) {
  const items = [];
  const m = sim.m;
  const CW = 30;
  const colW = m * CW + 10;
  const X = { p: 40, max: 110, alloc: 110 + colW, need: 110 + colW * 2, fin: 110 + colW * 3 };
  const y0 = 170;
  const RH = 40;
  const alloc = st.alloc ?? sim.alloc;
  const need = st.need ?? sim.need;
  const vcells = (v, cls = '') => v.map((x, j) => `<g transform="translate(${j * CW} 0)">${cell(CW - 3, 30, String(x), { cls, size: 12 })}</g>`).join('');
  const head = (x, t) => items.push({ k: `h-${t}`, x, y: y0 - 34, html: txt((m * CW) / 2, 0, t, 'bt-cap') });
  head(X.max, 'Max');
  head(X.alloc, 'Allocation');
  if (st.needShown) head(X.need, 'Need');
  head(X.fin, 'Finish');
  for (let i = 0; i < sim.n; i++) {
    const y = y0 + i * RH;
    const hot = st.hot === i;
    const done = st.done?.includes(i);
    items.push({ k: `r-${i}`, x: 0, y, cls: hot ? 'is-cur' : '', html: `<g transform="translate(${X.p} 0)">${cell(54, 30, `P${i}`, { cls: hot ? (st.ok === false ? 'bad' : 'hot') : done ? 'ok' : '', tone: '' })}</g><g transform="translate(${X.max} 0)">${vcells(sim.max[i], 'dim')}</g><g transform="translate(${X.alloc} 0)">${vcells(alloc[i], st.reqRow === i ? 'hot' : '')}</g>${st.needShown ? `<g transform="translate(${X.need} 0)">${vcells(need[i], hot ? (st.ok === false ? 'bad' : 'ok') : st.reqRow === i ? 'hot' : '')}</g>` : ''}<g transform="translate(${X.fin} 0)">${cell(70, 30, done ? 'true' : 'false', { cls: done ? 'ok' : 'dim', size: 11 })}</g>` });
  }
  // Available / Work
  items.push({ k: 'work', x: X.max, y: 60, html: txt(-10, 20, st.workLabel ?? 'Available', 'bt-lab', 'end') + vcells(st.work ?? sim.avail, st.workHot ? 'hot' : '') });
  if (st.req) items.push({ k: 'req', x: X.need + 60, y: 60, html: txt(-10, 20, `Request${st.reqRow != null ? ` (P${st.reqRow})` : ''}`, 'bt-lab', 'end') + vcells(st.req, st.reqBad ? 'bad' : 'hot') });
  // 安全序列
  const seq = st.seq ?? [];
  items.push({ k: 'seq', x: 40, y: y0 + sim.n * RH + 30, html: txt(0, 0, z ? `安全序列：${seq.length ? seq.map((i) => `P${i}`).join(' → ') : '（还没有）'}${st.verdict ? '　安全' : ''}` : `Safe sequence: ${seq.length ? seq.map((i) => `P${i}`).join(' → ') : '(none yet)'}${st.verdict ? '   safe' : ''}`, 'bt-formula cur', 'start') });
  return items;
}

// ───────────────────────── 原理 ─────────────────────────

export const PRINCIPLE = {
  sections: [
    {
      id: 'what',
      title: T('什么是死锁', 'What deadlock is'),
      blocks: [
        { p: T('多个进程因为**互相等待对方占着的资源**，谁也无法向前推进，如果没有外力介入，就永远等下去 —— 这就是**死锁**。比如 P1 拿着打印机等扫描仪，P2 拿着扫描仪等打印机。', '**Deadlock**: processes each hold a resource the other needs and wait forever. P1 holds the printer and wants the scanner; P2 holds the scanner and wants the printer.') },
        { p: T('死锁的原因：**系统资源不够**（竞争不可剥夺的资源），加上**进程推进顺序不当**（比如 PV 操作的顺序写错）。', 'Causes: **contention for non-preemptible resources** plus an **unlucky order of progress** (e.g. P operations in the wrong order).') },
        { tip: T('死锁、饥饿、死循环的区别：死锁至少两个进程，都在阻塞；饥饿可以只有一个进程，它一直等不到资源（比如 SJF 里的长作业），但可能处于就绪态；死循环是程序自己的逻辑错误，进程一直在运行。', 'Deadlock involves at least two blocked processes; starvation may affect one (even a ready one, like a long job under SJF); an infinite loop is a running process’s own bug.') },
      ],
    },
    {
      id: 'cond',
      title: T('死锁的四个必要条件', 'Four necessary conditions'),
      blocks: [
        {
          table: {
            head: [T('条件', 'Condition'), T('含义', 'Meaning')],
            rows: [
              [T('互斥', 'Mutual exclusion'), T('资源一次只能给一个进程用', 'a resource serves one process at a time')],
              [T('不剥夺', 'No preemption'), T('进程用完之前，资源不能被强行拿走', 'resources cannot be taken away')],
              [T('请求并保持', 'Hold and wait'), T('已经拿着一些资源，又去申请新的，申请不到也不放手', 'holding some while waiting for more')],
              [T('循环等待', 'Circular wait'), T('存在一个进程—资源的循环等待链', 'a cycle of processes each waiting for the next')],
            ],
          },
        },
        { warn: T('四个条件**同时满足**才可能死锁，缺一个就不会；但满足了也不一定死锁（是必要条件，不是充分条件）。有循环等待不一定死锁（比如某类资源有多个，环外的进程可能释放一个）。', 'All four must hold for deadlock, but holding all four does not guarantee it (necessary, not sufficient). A cycle need not deadlock when a resource type has several instances.') },
      ],
    },
    {
      id: 'handle',
      title: T('处理死锁的三类办法', 'Three strategies'),
      blocks: [
        {
          table: {
            head: [T('策略', 'Strategy'), T('怎么做', 'How'), T('代价', 'Cost')],
            rows: [
              [T('预防', 'Prevention'), T('破坏四个条件之一：SPOOLing 让独占设备变共享（破坏互斥，适用面很窄）；拿不到就释放已有的（破坏不剥夺）；一次申请全部资源（破坏请求并保持）；资源编号、按编号递增顺序申请（破坏循环等待）', 'break a condition: SPOOLing; release on failure; ask for everything at once; order the resources'), T('限制严，资源利用率低', 'strict, poor utilisation')],
              [T('避免', 'Avoidance'), T('每次分配前先判断，分了之后系统还**安全**才分 —— **银行家算法**', 'grant only if the state stays **safe**: **banker’s algorithm**'), T('要事先知道每个进程的最大需求，计算开销大', 'needs maximum demands in advance; costly checks')],
              [T('检测与解除', 'Detection and recovery'), T('不加限制，定期化简**资源分配图**检测死锁；发现后剥夺资源、撤销进程或进程回退', 'allow it, reduce the **resource-allocation graph** periodically, then preempt, kill or roll back'), T('解除时有损失', 'recovery loses work')],
            ],
          },
        },
        { p: T('**资源分配图的化简**：找一个既不阻塞也不是孤点的进程（它的所有申请都能满足），去掉它的所有边（相当于它运行完、释放资源），重复；能把所有边都去掉，图就是**可完全简化**的，没有死锁；化简不了就是死锁（**死锁定理**）。', '**Graph reduction**: repeatedly pick a process whose requests can all be met, remove its edges (it finishes and releases); if every edge disappears the graph is **completely reducible**: no deadlock (the **deadlock theorem**).') },
      ],
    },
    {
      id: 'safe',
      title: T('安全状态', 'Safe states'),
      blocks: [
        { p: T('如果能找到一个进程顺序 <P1, P2, …, Pn>，按这个顺序给每个进程分配它还需要的全部资源，每个进程都能顺利运行完（运行完会归还资源，给后面的用），系统就处于**安全状态**，这个顺序叫**安全序列**。', 'A state is **safe** if some order <P1, …, Pn> lets each process get its remaining needs and finish (returning its resources for the next). That order is a **safe sequence**.') },
        { formula: T('安全状态 → 一定不会死锁　　不安全状态 → 可能死锁，但不一定已经死锁　　死锁 → 一定是不安全状态', 'safe → no deadlock    unsafe → deadlock possible, not certain    deadlock → unsafe') },
      ],
    },
    {
      id: 'banker',
      title: T('银行家算法', 'The banker’s algorithm'),
      blocks: [
        {
          table: {
            head: [T('数据结构', 'Structure'), T('含义', 'Meaning')],
            rows: [
              ['Available', T('每类资源还剩多少可用', 'free units of each type')],
              ['Max', T('每个进程对每类资源的最大需求', 'maximum demand per process')],
              ['Allocation', T('每个进程已经分到多少', 'currently allocated')],
              ['Need', T('还需要多少 = Max − Allocation', 'still needed = Max − Allocation')],
            ],
          },
        },
        {
          steps: [
            T('进程 Pi 发出请求 Request。先检查 **Request ≤ Need[i]**，否则出错（要的比声明的最大需求还多）；', 'Process Pi sends Request. Check **Request ≤ Need[i]**, or it is an error (more than declared);'),
            T('再检查 **Request ≤ Available**，否则资源不够，Pi 等待；', 'check **Request ≤ Available**, otherwise Pi waits;'),
            T('**试分配**：Available −= Request，Allocation[i] += Request，Need[i] −= Request；', '**tentatively allocate**: Available −= Request, Allocation[i] += Request, Need[i] −= Request;'),
            T('对新状态执行**安全性算法**：安全就正式分配；不安全就撤销试分配，Pi 等待。', 'run the **safety algorithm** on the new state: if safe, grant; if not, undo and make Pi wait.'),
          ],
        },
        { p: T('**安全性算法**：Work = Available，所有 Finish = false。找一个 Finish[i] = false 且 Need[i] ≤ Work 的进程，假设它运行完、归还资源：Work += Allocation[i]，Finish[i] = true。重复，直到所有进程都 Finish（安全），或者再也找不到这样的进程（不安全）。', '**Safety algorithm**: Work = Available, all Finish = false. Find i with Finish[i] = false and Need[i] ≤ Work; it finishes and returns its resources: Work += Allocation[i], Finish[i] = true. Repeat until all finish (safe) or none qualifies (unsafe).') },
      ],
    },
    {
      id: 'calc',
      title: T('常见计算：至少要多少资源才不会死锁', 'How many resources rule out deadlock'),
      blocks: [
        { p: T('n 个进程共享 m 个同类资源，每个进程最多需要 k 个。最坏情况：每个进程都拿到 k − 1 个，谁也凑不齐。只要再多 1 个，就有一个进程能运行完、释放资源。', 'n processes share m identical units, each needing at most k. Worst case: everyone holds k − 1 and none can finish. One more unit lets someone complete.') },
        { formula: T('不会死锁的最少资源数 m = n × (k − 1) + 1', 'minimum m = n(k − 1) + 1') },
        { p: T('例：3 个进程，每个最多要 4 台打印机，至少要 3 × 3 + 1 = 10 台才保证不死锁。', 'Example: 3 processes needing up to 4 printers each need at least 3 × 3 + 1 = 10.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('Need 是 Max − Allocation，不是 Max − Available。', 'Need is Max − Allocation, not Max − Available.'),
            T('安全性检查时，进程运行完归还的是它的 **Allocation**（加到 Work 上），不是 Need 也不是 Max。', 'A finishing process returns its **Allocation**, not its Need or Max.'),
            T('Request > Need 是出错；Request > Available 是等待；两个检查别搞反。', 'Request > Need is an error; Request > Available means wait.'),
            T('不安全状态不等于死锁，只是有可能死锁。', 'Unsafe is not deadlocked, only at risk.'),
            T('安全序列可能有多个，写出任意一个合法的都对。', 'Any valid safe sequence is accepted.'),
            T('银行家算法属于**避免**，资源有序分配属于**预防**，资源分配图化简属于**检测**。', 'Banker’s algorithm is **avoidance**; ordered allocation is **prevention**; graph reduction is **detection**.'),
          ],
        },
      ],
    },
  ],
};

// ───────────────────────── 生成课程 ─────────────────────────

const kit = stepKit({ spec: SPEC, rowsName: T('计算步骤', 'Steps') });

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const hasReq = String(params.req ?? '').trim() !== '';
  const lesson = {
    id: 'banker',
    kit,
    where: [['os', 'process']],
    tag: T('死锁', 'DL'),
    name: T('死锁与银行家算法', 'Deadlock and the banker’s algorithm'),
    full: T('四个必要条件 · 预防 / 避免 / 检测 · 安全序列 · 资源请求', 'Four conditions · prevention / avoidance / detection · safe sequences'),
    title: hasReq ? T(`P${params.reqP} 请求 (${String(params.req).trim().split(/\s+/).join(',')})`, `P${params.reqP} requests (${String(params.req).trim().split(/\s+/).join(',')})`) : T('安全性检查', 'Safety check'),
    badge: hasReq ? T('资源请求', 'Request') : T('安全性检查', 'Safety check'),
    nodes: [],
    legend: [
      ['green', T('满足 / 已完成', 'Fits / finished')],
      ['rose', T('不满足', 'Does not fit')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '死锁是一组进程互相等待对方的资源，谁也走不动。银行家算法在分配之前先「假装分配」，再检查系统还能不能找到一个让所有进程都跑完的顺序（安全序列），找得到才真的分配。这节课把 Max、Allocation、Need 和 Work 摆成表，一行一行找。',
        'Deadlock is a set of processes waiting on each other forever. The banker’s algorithm pretends to grant a request, then checks whether some order still lets everyone finish (a safe sequence); only then is the request granted. Here Max, Allocation, Need and Work are laid out and searched row by row.',
      ),
      facts: sim.ok ? [[T('进程 / 资源', 'Processes / types'), `${sim.n} / ${sim.m}`]] : [],
    },
    start: { nodes: [], frame: { rect: [0, 20, 140 + (sim.ok ? sim.m : 3) * 30 * 3 + 220, 170 + (sim.ok ? sim.n : 5) * 40 + 60] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [];
  const S = { needShown: false };
  const push = (st, s) => {
    Object.assign(S, st);
    list.push({ ...s, st: { ...S } });
  };
  push({ needShown: true }, {
    title: T('算出 Need = Max − Allocation', 'Need = Max − Allocation'),
    desc: T('每个进程还需要多少', 'What each process still needs'),
    detail: T(`逐项相减：${sim.need.map((r, i) => `P${i} ${vec(r)}`).join('，')}。`, `Subtract element by element: ${sim.need.map((r, i) => `P${i} ${vec(r)}`).join(', ')}.`),
    ref: 'banker',
    row: { color: 'slate', what: 'Need', result: T('算出', 'done'), tone: 'info' },
  });
  const rq = sim.request;
  if (rq) {
    const okNeed = rq.result !== 'overNeed';
    push({ req: rq.req, reqRow: rq.p, hot: rq.p, ok: okNeed, reqBad: !okNeed }, {
      title: okNeed ? T(`Request ${vec(rq.req)} ≤ Need${rq.p} ${vec(sim.need[rq.p])}`, `Request ≤ Need${rq.p}`) : T('Request 超过 Need：出错', 'Request exceeds Need: error'),
      desc: T('检查 1：不能超过声明的最大需求', 'Check 1: within the declared maximum'),
      detail: okNeed ? T(`P${rq.p} 请求 ${vec(rq.req)}，没有超过它还需要的 ${vec(sim.need[rq.p])}，通过。`, `P${rq.p} asks for ${vec(rq.req)}, within its need ${vec(sim.need[rq.p])}.`) : T(`P${rq.p} 请求 ${vec(rq.req)}，超过了它还需要的 ${vec(sim.need[rq.p])}，也就是超过了它自己声明的最大需求，这是出错，直接拒绝。`, `P${rq.p} asks for more than its need ${vec(sim.need[rq.p])}: an error.`),
      ref: 'banker',
      row: { color: okNeed ? 'green' : 'rose', what: T('Request ≤ Need', 'Request ≤ Need'), result: okNeed ? T('通过', 'OK') : T('出错', 'error'), tone: okNeed ? 'ok' : 'warn' },
    });
    if (okNeed) {
      const okAv = rq.result !== 'wait';
      push({ ok: okAv, reqBad: !okAv, workHot: true }, {
        title: okAv ? T(`Request ≤ Available ${vec(sim.avail)}`, 'Request ≤ Available') : T('Request 超过 Available：等待', 'Request exceeds Available: wait'),
        desc: T('检查 2：现在有没有这么多', 'Check 2: is that much free now'),
        detail: okAv ? T(`现在可用 ${vec(sim.avail)}，够分。`, `Available ${vec(sim.avail)} suffices.`) : T(`现在只有 ${vec(sim.avail)}，不够 ${vec(rq.req)}，P${rq.p} 只能等待，不用再做安全性检查。`, `Only ${vec(sim.avail)} is free, less than ${vec(rq.req)}: P${rq.p} waits.`),
        ref: 'banker',
        row: { color: okAv ? 'green' : 'rose', what: T('Request ≤ Available', 'Request ≤ Available'), result: okAv ? T('通过', 'OK') : T('等待', 'wait'), tone: okAv ? 'ok' : 'warn' },
      });
      if (okAv) {
        push({ alloc: rq.alloc2, need: rq.need2, work: rq.avail2, workHot: true, hot: rq.p, ok: true }, {
          title: T('试分配', 'Tentative allocation'),
          desc: T(`Available → ${vec(rq.avail2)}`, `Available → ${vec(rq.avail2)}`),
          detail: T(`先假装分给 P${rq.p}：Available = ${vec(sim.avail)} − ${vec(rq.req)} = ${vec(rq.avail2)}；Allocation${rq.p} = ${vec(rq.alloc2[rq.p])}；Need${rq.p} = ${vec(rq.need2[rq.p])}。接下来检查这个新状态是否安全。`, `Pretend: Available = ${vec(rq.avail2)}, Allocation${rq.p} = ${vec(rq.alloc2[rq.p])}, Need${rq.p} = ${vec(rq.need2[rq.p])}. Now check safety.`),
          ref: 'banker',
          row: { color: 'amber', what: T('试分配', 'Pretend'), result: vec(rq.avail2), tone: 'info' },
        });
      }
    }
  }
  const ck = sim.check;
  if (ck) {
    const need = rq?.need2 ?? sim.need;
    const alloc = rq?.alloc2 ?? sim.alloc;
    const seq = [];
    push({ workLabel: 'Work', hot: null }, {
      title: T('安全性检查：Work = Available', 'Safety check: Work = Available'),
      desc: T(`Work = ${vec(ck.seq[0]?.before ?? ck.work)}`, `Work = ${vec(ck.seq[0]?.before ?? ck.work)}`),
      detail: T('把当前可用资源记作 Work，所有进程 Finish = false，从 P0 开始找 Need ≤ Work 的进程。', 'Set Work to the available vector and every Finish to false; scan from P0 for Need ≤ Work.'),
      ref: 'banker',
      row: { color: 'slate', what: T('开始安全性检查', 'Start safety check'), result: vec(ck.seq[0]?.before ?? (rq?.avail2 ?? sim.avail)), tone: 'info' },
    });
    for (const s of ck.seq) {
      seq.push(s.i);
      const fail = s.failed.length ? T(`（这一轮里 ${s.failed.map((i) => `P${i}`).join('、')} 的 Need 超过 Work，跳过）`, ` (in this round ${s.failed.map((i) => `P${i}`).join(', ')} did not fit)`) : { zh: '', en: '' };
      push({ hot: s.i, ok: true, work: s.after, done: [...seq], seq: [...seq], workHot: true }, {
        title: T(`P${s.i}：Need ${vec(need[s.i])} ≤ Work ${vec(s.before)}`, `P${s.i}: Need ≤ Work`),
        desc: T(`Work = ${vec(s.before)} + ${vec(alloc[s.i])} = ${vec(s.after)}`, `Work = ${vec(s.after)}`),
        detail: { zh: `第 ${s.pass} 轮${fail.zh}：P${s.i} 还需要 ${vec(need[s.i])}，现在 Work = ${vec(s.before)} 够用。假设它运行完，归还它占着的 ${vec(alloc[s.i])}：Work = ${vec(s.after)}，Finish${s.i} = true。`, en: `Round ${s.pass}${fail.en}: P${s.i} needs ${vec(need[s.i])} and Work ${vec(s.before)} suffices. It finishes and returns ${vec(alloc[s.i])}: Work = ${vec(s.after)}.` },
        ref: 'banker',
        row: { color: 'green', what: `P${s.i}`, result: `Work ${vec(s.after)}`, tone: 'ok' },
      });
    }
    if (ck.safe) {
      push({ hot: null, verdict: true }, {
        title: T('所有进程都能完成：安全', 'Everyone finishes: safe'),
        desc: T(`安全序列 ${seq.map((i) => `P${i}`).join(' → ')}`, `Safe sequence ${seq.map((i) => `P${i}`).join(' → ')}`),
        detail: rq ? T(`找到了安全序列 ${seq.map((i) => `P${i}`).join(' → ')}，所以试分配后的状态是安全的，正式把资源分给 P${rq.p}。`, `A safe sequence exists, so the request of P${rq.p} is granted.`) : T(`找到了安全序列 ${seq.map((i) => `P${i}`).join(' → ')}，当前状态安全。安全序列不一定唯一。`, `Safe sequence ${seq.map((i) => `P${i}`).join(' → ')}; the state is safe. It need not be unique.`),
        ref: 'safe',
        row: { color: 'green', what: T('结论', 'Verdict'), result: rq ? T('批准', 'granted') : T('安全', 'safe'), tone: 'ok' },
      });
    } else {
      push({ hot: ck.stuck[0], ok: false, verdict: false }, {
        title: T('找不到能满足的进程：不安全', 'Nobody fits: unsafe'),
        desc: T(`${ck.stuck.map((i) => `P${i}`).join('、')} 的 Need 都超过 Work`, `${ck.stuck.map((i) => `P${i}`).join(', ')} exceed Work`),
        detail: rq ? T(`Work = ${vec(ck.work)}，剩下的 ${ck.stuck.map((i) => `P${i} 需要 ${vec(need[i])}`).join('、')}，都不够。试分配后的状态不安全，撤销试分配，P${rq.p} 等待。注意：不安全不等于已经死锁，只是可能死锁。`, `Work ${vec(ck.work)} satisfies none of ${ck.stuck.map((i) => `P${i}`).join(', ')}. The tentative state is unsafe: undo it and make P${rq.p} wait.`) : T(`Work = ${vec(ck.work)}，剩下的进程都不够。当前状态不安全（可能死锁，但不一定已经死锁）。`, `Work ${vec(ck.work)} satisfies no remaining process: unsafe.`),
        ref: 'safe',
        row: { color: 'rose', what: T('结论', 'Verdict'), result: rq ? T('不分配', 'denied') : T('不安全', 'unsafe'), tone: 'warn' },
      });
    }
  }
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  const verdict = rq ? { overNeed: T('出错：超过最大需求', 'Error: exceeds maximum'), wait: T('资源不够：等待', 'Not enough: wait'), grant: T('安全：批准', 'Safe: granted'), unsafe: T('不安全：不分配', 'Unsafe: denied') }[rq.result] : ck.safe ? T('安全', 'Safe') : T('不安全', 'Unsafe');
  lesson.outro = {
    title: verdict,
    text: T('试试别的请求：比如先批准 P1 的 (1,0,2)，再把 Available 和 Allocation 改成新的状态，看 P0 请求 (0,2,0) 还能不能批准。', 'Try other requests: grant P1’s (1,0,2), update Available and Allocation, then see whether P0’s (0,2,0) can still be granted.'),
    facts: ck?.safe ? [[T('安全序列', 'Safe sequence'), ck.seq.map((x) => `P${x.i}`).join(' → ')]] : [],
  };
  return lesson;
}

export const makeBanker = () => parametric('banker', DEFAULTS, build);
