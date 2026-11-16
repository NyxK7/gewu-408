// 操作系统：页面置换、进程调度的计算核对。期望值为手算或教材经典例题的公认结果，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate as paging } from '../js/subjects/os/paging.js';
import { simulate as sched } from '../js/subjects/os/sched.js';

// 经典访问串（Silberschatz《操作系统概念》），3 个内存块：FIFO 15 次、LRU 12 次、OPT 9 次缺页
const CLASSIC = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

test('页面置换：经典访问串', () => {
  assert.equal(paging({ algo: 'FIFO', frames: 3, refs: CLASSIC }).faults, 15);
  assert.equal(paging({ algo: 'LRU', frames: 3, refs: CLASSIC }).faults, 12);
  assert.equal(paging({ algo: 'OPT', frames: 3, refs: CLASSIC }).faults, 9);
  // 最初 3 次缺页是装入空闲块，不算置换
  assert.equal(paging({ algo: 'FIFO', frames: 3, refs: CLASSIC }).replacements, 12);
  // OPT 的过程：t=3 访问 2 时，7 下次在 t=17、0 在 t=4、1 在 t=13 → 换出 7
  const opt = paging({ algo: 'OPT', frames: 3, refs: CLASSIC });
  assert.equal(opt.steps[3].victim, 7);
});

test('页面置换：Belady 异常（FIFO 多给一块反而多缺页）', () => {
  assert.equal(paging({ algo: 'FIFO', frames: 3, refs: BELADY }).faults, 9);
  assert.equal(paging({ algo: 'FIFO', frames: 4, refs: BELADY }).faults, 10);
  // LRU 3 块：1 2 3 缺，4 换 1，1 换 2，2 换 3，5 换 4，1 2 命中，3 换 5，4 换 1，5 换 2 → 10 次
  assert.equal(paging({ algo: 'LRU', frames: 3, refs: BELADY }).faults, 10);
});

test('页面置换：简单 CLOCK 手算', () => {
  // 3 块，访问串 1 2 3 4 1 2 5 1 2 3 4 5：
  // 1 2 3 依次装入（访问位都为 1，指针回到块 0）；
  // 4：块0、1、2 的访问位依次清 0，回到块 0 换出 1 → [4,2,3]，指针 → 1
  // 1：块1 访问位 0，换出 2 → [4,1,3]，指针 → 2；2：块2 换出 3 → [4,1,2]，指针 → 0
  // 5：三块访问位都是 1，清一圈后换出块0 的 4 → [5,1,2]，指针 → 1
  // 1、2 命中（访问位置 1）；3：块1、2、0 清 0，换出块1 的 1 → [5,3,2]，指针 → 2
  // 4：块2 访问位 0，换出 2 → [5,3,4]，指针 → 0；5 命中。共 9 次缺页
  const s = paging({ algo: 'CLOCK', frames: 3, refs: BELADY });
  assert.equal(s.faults, 9);
  assert.deepEqual(s.steps[3].after.frames, [4, 2, 3]);
  assert.deepEqual(s.steps[6].after.frames, [5, 1, 2]);
  assert.deepEqual(s.steps[9].after.frames, [5, 3, 2]);
  assert.deepEqual(s.steps[11].after.frames, [5, 3, 4]);
  assert.deepEqual(s.steps[3].scan.map((x) => [x.slot, x.action]), [[0, 'clear'], [1, 'clear'], [2, 'clear'], [0, 'pick']]);
});

// 进程调度：Stallings《操作系统：精髓与设计原理》的经典例子
// P1(0,3) P2(2,6) P3(4,4) P4(6,5) P5(8,2)
const S = { arrive: [0, 2, 4, 6, 8], burst: [3, 6, 4, 5, 2] };
const fin = (r) => r.procs.map((p) => p.finish);
const avgTat = (r) => r.avg.tat[0] / r.avg.tat[1];

test('进程调度：FCFS / SJF / SRTF / HRRN / RR(q=4)', () => {
  // FCFS：3 9 13 18 20，平均周转 (3+7+9+12+12)/5 = 8.6
  let r = sched({ algo: 'FCFS', ...S });
  assert.deepEqual(fin(r), [3, 9, 13, 18, 20]);
  assert.equal(avgTat(r), 8.6);
  // SJF（非抢占）：P1 0-3，P2 3-9，t=9 就绪 P3(4) P4(5) P5(2) → P5 9-11，P3 11-15，P4 15-20
  r = sched({ algo: 'SJF', ...S });
  assert.deepEqual(fin(r), [3, 9, 15, 20, 11]);
  assert.equal(avgTat(r), 7.6);
  // SRTF：P1 0-3，P2 3-4，P3 4-8（t=4 剩 5 > 4 被抢占），P5 8-10，P2 10-15，P4 15-20
  r = sched({ algo: 'SRTF', ...S });
  assert.deepEqual(fin(r), [3, 15, 8, 20, 10]);
  assert.deepEqual(r.segs.map((g) => [g.pid, g.start, g.end]), [[0, 0, 3], [1, 3, 4], [2, 4, 8], [4, 8, 10], [1, 10, 15], [3, 15, 20]]);
  assert.equal(avgTat(r), 7.2);
  // HRRN：t=9 时 P3 (5+4)/4=2.25 > P4 (3+5)/5=1.6 > P5 (1+2)/2=1.5 → P3；t=13 时 P5 (5+2)/2=3.5 > P4 (7+5)/5=2.4 → P5
  r = sched({ algo: 'HRRN', ...S });
  assert.deepEqual(fin(r), [3, 9, 13, 20, 15]);
  assert.equal(avgTat(r), 8);
  // RR q=4（新到达的先入队）：P1 0-3，P2 3-7，P3 7-11，P4 11-15，P2 15-17，P5 17-19，P4 19-20
  r = sched({ algo: 'RR', q: 4, ...S });
  assert.deepEqual(fin(r), [3, 17, 11, 20, 19]);
  assert.equal(avgTat(r), 10);
});

test('进程调度：优先级（数值小的优先）', () => {
  // P1(0,4,3) P2(1,3,1) P3(2,2,2)
  const P = { arrive: [0, 1, 2], burst: [4, 3, 2], prio: [3, 1, 2] };
  // 非抢占：P1 0-4，然后 P2 4-7，P3 7-9
  assert.deepEqual(fin(sched({ algo: 'PRIO', ...P })), [4, 7, 9]);
  // 抢占：P1 0-1，P2 1-4（优先级 1 最高），P3 4-6，P1 6-9
  const r = sched({ algo: 'PRIO', preempt: true, ...P });
  assert.deepEqual(fin(r), [9, 4, 6]);
  assert.deepEqual(r.segs.map((g) => [g.pid, g.start, g.end]), [[0, 0, 1], [1, 1, 4], [2, 4, 6], [0, 6, 9]]);
});

test('进程调度：RR 同时刻入队顺序、CPU 空闲', () => {
  // P1(0,3) P2(2,2)，q=2：P1 0-2 用完时间片，此刻 P2 恰好到达
  // 新到达的先入队：队列 [P2, P1] → P2 2-4，P1 4-5；否则 [P1, P2] → P1 2-3，P2 3-5
  const A = { arrive: [0, 2], burst: [3, 2], q: 2 };
  assert.deepEqual(fin(sched({ algo: 'RR', ...A })), [5, 4]);
  assert.deepEqual(fin(sched({ algo: 'RR', ...A, newFirst: false })), [3, 5]);
  // 中间有空闲：P1(0,2) P2(5,1) → P1 0-2，空闲 2-5，P2 5-6
  const r = sched({ algo: 'FCFS', arrive: [0, 5], burst: [2, 1] });
  assert.deepEqual(r.segs.map((g) => [g.pid, g.start, g.end]), [[0, 0, 2], [null, 2, 5], [1, 5, 6]]);
});
