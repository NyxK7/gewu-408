// 操作系统的试点题：页面置换、死锁与银行家算法。
import { T } from '../core/i18n.js';
import { simulate as bankSim } from '../subjects/os/banker.js';
import { simulate as pageSim } from '../subjects/os/paging.js';

const PAGE_CONV = T('开始时内存块都是空的；装入空闲块也算一次缺页。OPT 中如果有几页以后都不再访问，换出最早装入的那一页。', 'Frames start empty and filling an empty frame counts as a fault. OPT breaks ties by evicting the earliest-loaded page.');

function refsOf(r) {
  const pool = r.distinct(r.int(5, 6), 0, 7);
  const refs = [];
  for (let i = 0; i < 12; i++) {
    let p = r.pick(pool);
    if (refs.length && p === refs.at(-1)) p = r.pick(pool);
    refs.push(p);
  }
  return refs;
}

function pageSteps(sim, params) {
  return sim.steps.map((s) => ({
    text: s.hit
      ? T(`访问 ${s.page}：已在内存，命中。内存 [${s.after.frames.map((x) => x ?? '·').join(' ')}]。`, `Page ${s.page}: hit. Frames [${s.after.frames.map((x) => x ?? '·').join(' ')}].`)
      : s.victim == null
        ? T(`访问 ${s.page}：缺页（第 ${s.faults} 次），装入空闲块。内存 [${s.after.frames.map((x) => x ?? '·').join(' ')}]。`, `Page ${s.page}: fault #${s.faults}, into a free frame.`)
        : T(`访问 ${s.page}：缺页（第 ${s.faults} 次），换出 ${s.victim}。内存 [${s.after.frames.map((x) => x ?? '·').join(' ')}]。`, `Page ${s.page}: fault #${s.faults}, evict ${s.victim}.`),
    go: { lesson: 'page-replace', params, step: s.t },
  }));
}

const vec = (v) => `(${v.join(', ')})`;
const mtx = (m) => m.map((r) => r.join(' ')).join('; ');

export const OS_QUESTIONS = [
  {
    id: 'os-page-01',
    subject: 'os',
    chapter: 'memory',
    topic: T('页面置换算法', 'Page replacement'),
    type: 'number',
    difficulty: 2,
    lessons: ['page-replace'],
    tags: ['过程推演'],
    conv: PAGE_CONV,
    make(r) {
      const algo = r.pick(['FIFO', 'LRU']);
      const frames = 3;
      const refs = refsOf(r);
      const params = { algo, frames, refs };
      const sim = pageSim(params);
      return {
        question: T(`某进程分到 ${frames} 个内存块，页面访问串为 ${refs.join(', ')}。采用 ${algo} 置换算法，一共发生多少次缺页？`, `A process has ${frames} frames and references ${refs.join(', ')}. How many page faults under ${algo}?`),
        answer: { value: sim.faults },
        steps: [...pageSteps(sim, params), { text: T(`一共缺页 ${sim.faults} 次，缺页率 ${sim.faults}/${refs.length}。`, `${sim.faults} faults, rate ${sim.faults}/${refs.length}.`) }],
      };
    },
  },
  {
    id: 'os-page-02',
    subject: 'os',
    chapter: 'memory',
    topic: T('页面置换算法', 'Page replacement'),
    type: 'number',
    difficulty: 2,
    lessons: ['page-replace'],
    tags: ['过程推演'],
    conv: PAGE_CONV,
    make(r) {
      const frames = r.pick([3, 4]);
      const refs = refsOf(r);
      const params = { algo: 'OPT', frames, refs };
      const sim = pageSim(params);
      return {
        question: T(`内存块数为 ${frames}，访问串 ${refs.join(', ')}。用最佳置换算法 OPT 时，发生多少次「页面置换」（换出某一页，不含装入空闲块）？`, `${frames} frames, references ${refs.join(', ')}. Under OPT, how many replacements (evictions, not counting filling free frames)?`),
        answer: { value: sim.replacements },
        steps: [...pageSteps(sim, params), { text: T(`缺页 ${sim.faults} 次，其中前 ${sim.faults - sim.replacements} 次是装入空闲块，真正换出页面的是 ${sim.replacements} 次。`, `${sim.faults} faults, of which ${sim.replacements} evict a page.`) }],
      };
    },
  },
  {
    id: 'os-page-03',
    subject: 'os',
    chapter: 'memory',
    topic: T('页面置换算法', 'Page replacement'),
    type: 'single',
    difficulty: 1,
    lessons: ['page-replace'],
    tags: ['概念'],
    question: T('给进程多分配内存块，缺页次数反而可能增加。这种现象可能出现在哪种置换算法中？', 'Giving a process more frames can sometimes cause more faults. Which algorithm can show this?'),
    options: ['FIFO', 'LRU', 'OPT', T('三种都可能', 'All three')],
    answer: 0,
    steps: [
      { text: T('这叫 Belady 异常，只有 FIFO 会出现。课程里的预设串 1 2 3 4 1 2 5 1 2 3 4 5，3 块缺页 9 次，4 块反而 10 次。', 'This is Belady’s anomaly, only possible with FIFO: 1 2 3 4 1 2 5 1 2 3 4 5 gives 9 faults with 3 frames and 10 with 4.'), go: { lesson: 'page-replace', params: { algo: 'FIFO', frames: 4, refs: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5] }, step: 11 } },
      { text: T('LRU 和 OPT 是「栈算法」：块多时内存里的页面集合总包含块少时的集合，不会出现这种情况。', 'LRU and OPT are stack algorithms: more frames always keep a superset of pages.'), go: { lesson: 'page-replace', doc: 'algo' } },
    ],
  },
  {
    id: 'os-bank-01',
    subject: 'os',
    chapter: 'process',
    topic: T('银行家算法', "Banker's algorithm"),
    type: 'judge',
    difficulty: 3,
    lessons: ['banker'],
    tags: ['过程推演'],
    conv: T('安全性检查：从 P0 起按编号依次检查，Need ≤ Work 的进程就让它运行完、收回资源；一轮查完再从头查，直到全部完成或者一轮里谁也满足不了。', 'Safety check: scan P0, P1, … in order; any process with Need ≤ Work runs to completion and releases; repeat rounds until all finish or a round makes no progress.'),
    make(r) {
      const n = 4;
      const m = 3;
      const want = r.next() < 0.5; // 安全和不安全各占一半，答案不偏
      let max, alloc, avail, params, sim;
      for (let tries = 0; ; tries++) {
        max = Array.from({ length: n }, () => Array.from({ length: m }, () => r.int(2, 8)));
        alloc = max.map((row) => row.map((x) => r.int(0, x)));
        avail = Array.from({ length: m }, () => r.int(0, 3));
        params = { avail: avail.join(' '), max: mtx(max), alloc: mtx(alloc), req: '', reqP: 0 };
        sim = bankSim(params);
        if (sim.check.safe === want || tries > 300) break;
      }
      const c = sim.check;
      const steps = [
        { text: T(`Need = Max − Allocation：${sim.need.map((v, i) => `P${i} ${vec(v)}`).join('，')}。`, `Need: ${sim.need.map((v, i) => `P${i} ${vec(v)}`).join(', ')}.`), go: { lesson: 'banker', params, step: 0 } },
        { text: T(`Work = Available = ${vec(avail)}。`, `Work = ${vec(avail)}.`), go: { lesson: 'banker', params, step: 1 } },
        ...c.seq.map((s, k) => ({ text: T(`P${s.i}：Need ${vec(sim.need[s.i])} ≤ Work ${vec(s.before)}，让它运行完并收回资源，Work 变成 ${vec(s.after)}。`, `P${s.i} fits; Work becomes ${vec(s.after)}.`), go: { lesson: 'banker', params, step: 2 + k } })),
        c.safe
          ? { text: T(`全部进程都能完成，安全序列 ${c.seq.map((s) => 'P' + s.i).join(' → ')}，系统安全。`, `All finish: ${c.seq.map((s) => 'P' + s.i).join(' → ')}. Safe.`), go: { lesson: 'banker', params, step: 2 + c.seq.length } }
          : { text: T(`剩下 ${c.stuck.map((i) => 'P' + i).join('、')} 的 Need 都大于 Work ${vec(c.work)}，谁也完成不了，系统不安全。`, `${c.stuck.map((i) => 'P' + i).join(', ')} cannot fit Work ${vec(c.work)}: unsafe.`), go: { lesson: 'banker', params, step: 2 + c.seq.length } },
      ];
      return {
        question: T(`系统有 3 类资源，4 个进程。Available = ${vec(avail)}；Max：${max.map((v, i) => `P${i} ${vec(v)}`).join('，')}；Allocation：${alloc.map((v, i) => `P${i} ${vec(v)}`).join('，')}。当前状态是安全的。`, `3 resource types, 4 processes. Available ${vec(avail)}; Max ${max.map((v, i) => `P${i} ${vec(v)}`).join(', ')}; Allocation ${alloc.map((v, i) => `P${i} ${vec(v)}`).join(', ')}. The state is safe.`),
        answer: c.safe,
        steps,
      };
    },
  },
  {
    id: 'os-bank-02',
    subject: 'os',
    chapter: 'process',
    topic: T('死锁', 'Deadlock'),
    type: 'number',
    difficulty: 2,
    lessons: ['banker'],
    tags: ['计算'],
    make(r) {
      const n = r.int(3, 6);
      const k = r.int(2, 5);
      const ans = n * (k - 1) + 1;
      return {
        question: T(`${n} 个进程共享同一类资源，每个进程最多同时需要 ${k} 个。系统至少要有多少个这种资源，才保证不会发生死锁？`, `${n} processes share one resource type; each needs at most ${k} at once. What is the fewest units that guarantees no deadlock?`),
        answer: { value: ans },
        steps: [
          { text: T(`最坏的情况：每个进程都拿到了 ${k} − 1 = ${k - 1} 个，都还差 1 个，互相等待。这时一共用掉 ${n} × ${k - 1} = ${n * (k - 1)} 个。`, `Worst case: each holds ${k - 1} and waits for one more: ${n * (k - 1)} units in use.`), go: { lesson: 'banker', doc: 'calc' } },
          { text: T(`只要再多 1 个，就能让其中一个进程拿满 ${k} 个运行完，再释放资源给别人。所以至少 ${n * (k - 1)} + 1 = ${ans} 个。`, `One more unit lets someone finish and release: ${ans}.`) },
        ],
      };
    },
  },
  {
    id: 'os-bank-03',
    subject: 'os',
    chapter: 'process',
    topic: T('死锁', 'Deadlock'),
    type: 'multi',
    difficulty: 1,
    lessons: ['banker'],
    tags: ['概念'],
    question: T('下列哪些是产生死锁的必要条件？', 'Which are necessary conditions for deadlock?'),
    options: [T('互斥', 'Mutual exclusion'), T('请求并保持', 'Hold and wait'), T('不可剥夺', 'No preemption'), T('循环等待', 'Circular wait'), T('系统资源总数不足', 'Too few resources in total'), T('进程优先级各不相同', 'Processes have different priorities')],
    answer: [0, 1, 2, 3],
    steps: [
      { text: T('四个必要条件：互斥、请求并保持、不可剥夺、循环等待，缺一个就不会死锁。', 'Four necessary conditions: mutual exclusion, hold and wait, no preemption, circular wait.'), go: { lesson: 'banker', doc: 'cond' } },
      { text: T('资源总数不足只是可能引起死锁的原因之一，并不是必要条件：资源再多，推进顺序不当也可能死锁。优先级和死锁无关。', 'Too few resources is a cause, not a condition; priorities are irrelevant.'), go: { lesson: 'banker', doc: 'what' } },
    ],
  },
];
