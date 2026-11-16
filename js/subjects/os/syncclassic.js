// 经典同步问题的模拟：读者—写者（读者优先、读写公平）、哲学家进餐（都先拿左边、奇偶分开拿、最多 4 人上桌）。
// 每个进程真的按自己的程序执行 P、V（记录型信号量：value−− 后 < 0 就阻塞进队尾；V 时 value++，≤ 0 就唤醒队首），
// 读者—写者里的 count 是普通变量，由程序里的语句真的加减。
//
// 约定（界面上写明）：
//   · 读者—写者按给定的到达 / 离开顺序推进：「到达」= 一直执行到开始读（写）或者阻塞，「离开」= 读（写）完以后执行退出部分；
//   · 被唤醒的进程接着执行，直到开始读（写）或者再次阻塞；
//   · 哲学家进餐按「每人轮流做一步」推进：一步 = 拿一根筷子（一次 P）、或者吃完放下筷子（后面的 V 一起做）；
//     阻塞的人轮到时跳过；某一轮所有没吃完的人都阻塞了，就是死锁。

const err = (e) => ({ ok: false, errors: [e] });
export const PROBLEMS = ['rw-reader', 'rw-fair', 'dine-left', 'dine-odd', 'dine-room'];
export const N = 5; // 哲学家人数

// ───── 程序 ─────
// 指令：{ P: s } / { V: s }，可带 when(vars) 条件；{ set(vars) } 改变量；{ work: 'read' | 'write' | 'eat' }
const reader = (fair) => [
  ...(fair ? [{ P: 'w' }] : []),
  { P: 'mutex' },
  { P: 'rw', when: (v) => v.count === 0, why: 'first' },
  { set: (v) => v.count++, text: 'count++' },
  { V: 'mutex' },
  ...(fair ? [{ V: 'w' }] : []),
  { work: 'read' },
  { P: 'mutex' },
  { set: (v) => v.count--, text: 'count--' },
  { V: 'rw', when: (v) => v.count === 0, why: 'last' },
  { V: 'mutex' },
];
const writer = (fair) => [...(fair ? [{ P: 'w' }] : []), { P: 'rw' }, { work: 'write' }, { V: 'rw' }, ...(fair ? [{ V: 'w' }] : [])];
const chop = (i) => `c${i}`;
function philosopher(i, kind) {
  const L = chop(i);
  const R = chop((i + 1) % N);
  const [a, b] = kind === 'dine-odd' && i % 2 === 0 ? [R, L] : [L, R]; // 偶数号先拿右边
  return [...(kind === 'dine-room' ? [{ P: 'room' }] : []), { P: a, hand: a === L ? 'L' : 'R' }, { P: b, hand: b === L ? 'L' : 'R' }, { work: 'eat' }, { V: a }, { V: b }, ...(kind === 'dine-room' ? [{ V: 'room' }] : [])];
}

// 读者—写者的事件顺序：+ 到达，- 离开
const RW_EVENTS = {
  'rw-reader': ['+R1', '+R2', '+W1', '+R3', '-R1', '-R2', '-R3', '-W1'],
  'rw-fair': ['+R1', '+R2', '+W1', '+R3', '-R1', '-R2', '-W1', '-R3'],
};

/** 引擎：procs = { 名字: 程序 }；返回 run(名字, mode) 和快照 */
function engine(sems, procs) {
  const val = { ...sems };
  const queue = Object.fromEntries(Object.keys(sems).map((k) => [k, []]));
  const vars = { count: 0 };
  const st = Object.fromEntries(Object.keys(procs).map((p) => [p, { pc: 0, state: 'idle', on: null, held: [] }]));
  let log = [];
  /** 执行进程 p：mode 'work' 一直到开始工作 / 阻塞 / 结束；'one' 只执行一条 P（中间的条件、赋值不算）；'leave' 越过工作再执行到底 */
  const run = (p, mode) => {
    const s = st[p];
    const prog = procs[p];
    if (mode === 'leave') {
      if (s.state !== 'working') return false;
      s.pc++;
      log.push({ p, kind: 'done', what: prog[s.pc - 1].work });
    }
    s.state = 'running';
    let didP = false;
    while (s.pc < prog.length) {
      const ins = prog[s.pc];
      if (ins.work) {
        s.state = 'working';
        log.push({ p, kind: 'work', what: ins.work });
        return true;
      }
      if (ins.when && !ins.when(vars)) {
        log.push({ p, kind: 'skip', ins: ins.P ? `P(${ins.P})` : `V(${ins.V})`, why: ins.why, count: vars.count });
        s.pc++;
        continue;
      }
      if (ins.set) {
        ins.set(vars);
        log.push({ p, kind: 'set', text: ins.text, count: vars.count });
        s.pc++;
        continue;
      }
      if (ins.P) {
        if (mode === 'one' && didP) return true; // 已经做过一次 P，停下
        val[ins.P]--;
        s.pc++;
        didP = true;
        if (val[ins.P] < 0) {
          queue[ins.P].push(p);
          s.state = 'blocked';
          s.on = ins.P;
          log.push({ p, kind: 'P', s: ins.P, block: true, val: val[ins.P], why: ins.why, count: vars.count });
          return true;
        }
        if (ins.hand) s.held.push(ins.P);
        log.push({ p, kind: 'P', s: ins.P, block: false, val: val[ins.P], why: ins.why, count: vars.count });
        continue;
      }
      if (ins.V) {
        val[ins.V]++;
        s.pc++;
        s.held = s.held.filter((x) => x !== ins.V);
        let woke = null;
        if (val[ins.V] <= 0 && queue[ins.V].length) {
          woke = queue[ins.V].shift();
          const w = st[woke];
          w.state = 'ready';
          w.on = null;
          const prev = procs[woke][w.pc - 1];
          if (prev?.hand) w.held.push(prev.P);
          pending.push(woke);
        }
        log.push({ p, kind: 'V', s: ins.V, val: val[ins.V], woke, why: ins.why, count: vars.count });
      }
    }
    s.state = 'done';
    return true;
  };
  let pending = [];
  const snap = () => ({
    val: { ...val },
    queue: Object.fromEntries(Object.entries(queue).map(([k, q]) => [k, [...q]])),
    count: vars.count,
    st: Object.fromEntries(Object.entries(st).map(([k, s]) => [k, { ...s, held: [...s.held] }])),
  });
  const takeLog = () => {
    const l = log;
    log = [];
    return l;
  };
  /** 被唤醒的进程接着执行（按唤醒顺序） */
  const flush = (mode) => {
    while (pending.length) {
      const w = pending.shift();
      run(w, mode);
    }
  };
  return { st, run, snap, takeLog, flush };
}

export function syncClassic({ problem = 'rw-reader' }) {
  if (!PROBLEMS.includes(problem)) return err('problem');
  const steps = [];
  if (problem.startsWith('rw')) {
    const fair = problem === 'rw-fair';
    const procs = { R1: reader(fair), R2: reader(fair), W1: writer(fair), R3: reader(fair) };
    const sems = fair ? { rw: 1, mutex: 1, w: 1 } : { rw: 1, mutex: 1 };
    const e = engine(sems, procs);
    steps.push({ kind: 'init', ...e.snap(), log: [] });
    for (const ev of RW_EVENTS[problem]) {
      const p = ev.slice(1);
      const leave = ev[0] === '-';
      e.run(p, leave ? 'leave' : 'work');
      e.flush('work');
      steps.push({ kind: leave ? 'leave' : 'arrive', p, ...e.snap(), log: e.takeLog() });
    }
    const order = steps.flatMap((s) => s.log.filter((x) => x.kind === 'work').map((x) => x.p));
    return { ok: true, problem, family: 'rw', sems, procs: Object.keys(procs), steps, order, deadlock: false };
  }
  // 哲学家进餐
  const procs = Object.fromEntries(Array.from({ length: N }, (_, i) => [`Ph${i}`, philosopher(i, problem)]));
  const sems = Object.fromEntries(Array.from({ length: N }, (_, i) => [chop(i), 1]));
  if (problem === 'dine-room') sems.room = N - 1;
  const e = engine(sems, procs);
  steps.push({ kind: 'init', ...e.snap(), log: [] });
  const names = Object.keys(procs);
  let deadlock = false;
  for (let round = 1; round <= 12; round++) {
    let moved = false;
    for (const p of names) {
      const s = e.st[p];
      if (s.state === 'done' || s.state === 'blocked') continue;
      if (s.state === 'working') e.run(p, 'leave');
      else e.run(p, 'one');
      e.flush('one');
      moved = true;
    }
    const log = e.takeLog();
    const snap = e.snap();
    const left = names.filter((p) => snap.st[p].state !== 'done');
    if (!moved || (left.length && left.every((p) => snap.st[p].state === 'blocked'))) {
      deadlock = left.length > 0;
      steps.push({ kind: deadlock ? 'deadlock' : 'round', round, ...snap, log });
      if (deadlock) break;
    } else steps.push({ kind: 'round', round, ...snap, log });
    if (!left.length) break;
  }
  const order = steps.flatMap((s) => s.log.filter((x) => x.kind === 'work').map((x) => x.p));
  return { ok: true, problem, family: 'dine', sems, procs: names, steps, order, deadlock };
}
