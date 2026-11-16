// 进程调度的纯计算：FCFS / SJF / SRTF / HRRN / 优先级（抢占或非抢占）/ RR。
// 约定（界面上写明）：
//   · 不计切换开销；没有进程就绪时 CPU 空闲；
//   · 同等条件下先到达的优先，再按编号；
//   · SRTF 和抢占式优先级：新到达的进程只有「严格更优」才抢占；
//   · RR：时间片用完的进程排到就绪队列队尾；若此刻恰好有新进程到达，按 newFirst 决定谁先入队（默认新到达的先入队）；
//   · HRRN 响应比 = (等待时间 + 要求服务时间) / 要求服务时间，非抢占；
//   · 周转时间 = 完成时间 − 到达时间，带权周转时间 = 周转时间 / 运行时间，等待时间 = 周转时间 − 运行时间。

export const ALGOS = ['FCFS', 'SJF', 'SRTF', 'HRRN', 'PRIO', 'RR'];

export function simulate({ algo, arrive, burst, prio = [], q = 2, prioLow = true, preempt = false, newFirst = true }) {
  const errors = [];
  const n = arrive?.length ?? 0;
  if (!ALGOS.includes(algo)) errors.push('algo');
  if (n < 1 || n > 8) errors.push('count');
  if (!burst || burst.length !== n) errors.push('burstLen');
  if (algo === 'PRIO' && (!prio || prio.length !== n)) errors.push('prioLen');
  if (burst?.some((b) => b < 1)) errors.push('burstPos');
  if (arrive?.some((a) => a < 0)) errors.push('arrivePos');
  if (algo === 'RR' && !(q >= 1)) errors.push('q');
  if (errors.length) return { ok: false, errors };
  if ((burst.reduce((a, b) => a + b, 0) + Math.max(...arrive)) > 200) return { ok: false, errors: ['tooLong'] };

  const P = arrive.map((a, i) => ({ i, name: `P${i + 1}`, arrive: a, burst: burst[i], prio: prio[i] ?? 0, left: burst[i], finish: null, first: null }));
  const better = (a, b) => (prioLow ? a < b : a > b);
  // 「谁更优先」：返回负数表示 x 排在 y 前面
  const cmp = {
    FCFS: (x, y) => x.arrive - y.arrive || x.i - y.i,
    SJF: (x, y) => x.burst - y.burst || x.arrive - y.arrive || x.i - y.i,
    SRTF: (x, y) => x.left - y.left || x.arrive - y.arrive || x.i - y.i,
    PRIO: (x, y) => (x.prio === y.prio ? x.arrive - y.arrive || x.i - y.i : better(x.prio, y.prio) ? -1 : 1),
  };
  const segs = [];
  const push = (seg) => {
    const last = segs.at(-1);
    // 同一进程不间断地连续运行时合并成一段（抢占式算法在到达时刻会重新判断）
    if (last && last.pid === seg.pid && last.end === seg.start && seg.pid != null && seg.merge) {
      last.end = seg.end;
      last.checks.push(...seg.checks);
    } else segs.push(seg);
  };
  const snapQueue = (list) => list.map((p) => p.i);
  let t = Math.min(...arrive);
  if (t > 0) segs.push({ pid: null, start: 0, end: t, why: 'idle', queue: [], checks: [] });
  const doneCount = () => P.filter((p) => p.finish != null).length;

  if (algo === 'RR') {
    const queue = [];
    const enq = (upto, inclusive) => {
      for (const p of [...P].sort((a, b) => a.arrive - b.arrive || a.i - b.i)) {
        if (p.queued || p.finish != null) continue;
        if (p.arrive < upto || (inclusive && p.arrive === upto)) {
          p.queued = true;
          queue.push(p);
        }
      }
    };
    enq(t, true);
    while (doneCount() < n) {
      if (!queue.length) {
        const nt = Math.min(...P.filter((p) => !p.queued && p.finish == null).map((p) => p.arrive));
        segs.push({ pid: null, start: t, end: nt, why: 'idle', queue: [], checks: [] });
        t = nt;
        enq(t, true);
        continue;
      }
      const qBefore = snapQueue(queue);
      const p = queue.shift();
      if (p.first == null) p.first = t;
      const run = Math.min(q, p.left);
      const start = t;
      t += run;
      p.left -= run;
      let why;
      if (p.left === 0) {
        p.finish = t;
        enq(t, true);
        why = 'done';
      } else if (newFirst) {
        enq(t, true);
        queue.push(p);
        why = 'slice';
      } else {
        enq(t, false);
        queue.push(p);
        enq(t, true);
        why = 'slice';
      }
      segs.push({ pid: p.i, start, end: t, why, queue: qBefore, after: snapQueue(queue), checks: [] });
    }
  } else if (algo === 'SRTF' || (algo === 'PRIO' && preempt)) {
    const c = cmp[algo];
    while (doneCount() < n) {
      const ready = P.filter((p) => p.arrive <= t && p.finish == null);
      if (!ready.length) {
        const nt = Math.min(...P.filter((p) => p.finish == null).map((p) => p.arrive));
        segs.push({ pid: null, start: t, end: nt, why: 'idle', queue: [], checks: [] });
        t = nt;
        continue;
      }
      const last = segs.at(-1);
      const cur = last && last.end === t && last.pid != null && P[last.pid].finish == null ? P[last.pid] : null;
      let pick = [...ready].sort(c)[0];
      // 只有主关键字严格更优才抢占（剩余时间更短 / 优先级更高），平局时当前进程继续
      if (cur && pick !== cur && !(algo === 'SRTF' ? pick.left < cur.left : better(pick.prio, cur.prio))) pick = cur;
      if (pick.first == null) pick.first = t;
      const arrivals = P.filter((p) => p.arrive > t).map((p) => p.arrive);
      const nextArr = arrivals.length ? Math.min(...arrivals) : Infinity;
      const end = Math.min(t + pick.left, nextArr);
      const why = cur && cur !== pick ? 'preempt' : cur ? 'continue' : 'pick';
      const ranked = [...ready].sort(c).map((p) => ({ i: p.i, left: p.left, prio: p.prio }));
      pick.left -= end - t;
      if (pick.left === 0) pick.finish = end;
      push({ pid: pick.i, start: t, end, why, queue: snapQueue(ready.filter((p) => p !== pick).sort(c)), checks: [{ t, ranked, pick: pick.i, why }], merge: why === 'continue' });
      t = end;
    }
  } else {
    while (doneCount() < n) {
      const ready = P.filter((p) => p.arrive <= t && p.finish == null);
      if (!ready.length) {
        const nt = Math.min(...P.filter((p) => p.finish == null).map((p) => p.arrive));
        segs.push({ pid: null, start: t, end: nt, why: 'idle', queue: [], checks: [] });
        t = nt;
        continue;
      }
      let pick;
      let ranked;
      if (algo === 'HRRN') {
        // 响应比用分数比较，避免浮点误差：(w + s) / s
        const rr = ready.map((p) => ({ p, num: t - p.arrive + p.burst, den: p.burst }));
        rr.sort((a, b) => b.num * a.den - a.num * b.den || a.p.arrive - b.p.arrive || a.p.i - b.p.i);
        pick = rr[0].p;
        ranked = rr.map((x) => ({ i: x.p.i, num: x.num, den: x.den, wait: t - x.p.arrive }));
      } else {
        const sorted = [...ready].sort(cmp[algo]);
        pick = sorted[0];
        ranked = sorted.map((p) => ({ i: p.i, burst: p.burst, prio: p.prio, arrive: p.arrive }));
      }
      pick.first = t;
      const start = t;
      t += pick.left;
      pick.left = 0;
      pick.finish = t;
      segs.push({ pid: pick.i, start, end: t, why: 'pick', queue: snapQueue(ready.filter((p) => p !== pick).sort(cmp.FCFS)), checks: [{ t: start, ranked, pick: pick.i }] });
    }
  }

  const rows = P.map((p) => {
    const tat = p.finish - p.arrive;
    return { ...p, tat, wtat: tat / p.burst, wait: tat - p.burst, response: p.first - p.arrive };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  // 平均带权周转时间用分数累加，最后再除，避免误差
  return {
    ok: true,
    algo,
    n,
    procs: rows,
    segs,
    total: segs.at(-1).end,
    avg: { tat: [sum('tat'), n], wait: [sum('wait'), n], wtat: sum('wtat') / n },
  };
}
