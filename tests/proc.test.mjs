// 进程管理：五状态转换、记录型信号量、银行家算法。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate as banker } from '../js/subjects/os/banker.js';
import { simulate as proc } from '../js/subjects/os/proc.js';
import { simulate as sem } from '../js/subjects/os/sem.js';

test('进程状态：一串事件', () => {
  // P1+ P2+ → 就绪 [P1, P2]；run → P1 运行；wait → P1 阻塞；run → P2 运行；P1! → 就绪 [P1]；tick → P2 回就绪 [P1, P2]
  const s = proc({ events: 'P1+ P2+ run wait run P1! tick run exit' });
  const at = (k) => [s.steps[k].running, s.steps[k].ready.join(','), s.steps[k].blocked.join(',')];
  assert.deepEqual(at(2), ['P1', 'P2', '']);
  assert.deepEqual(at(3), [null, 'P2', 'P1']);
  assert.deepEqual(at(5), ['P2', 'P1', '']);
  assert.deepEqual(at(6), [null, 'P1,P2', '']);
  // run → P1，exit → P1 终止
  assert.deepEqual(at(8), [null, 'P2', '']);
  assert.equal(s.steps[8].state.P1, 'done');
});

test('进程状态：不合法的转换', () => {
  // 就绪态的进程不能被「唤醒」；CPU 忙时不能再调度；没有运行的进程时不能 wait
  const s = proc({ events: 'P1+ P1! run run wait wait' });
  assert.deepEqual(s.steps.map((x) => x.kind), ['create', 'illegal', 'dispatch', 'illegal', 'block', 'illegal']);
  assert.deepEqual([s.steps[1].why, s.steps[3].why, s.steps[5].why], ['notBlocked', 'busy', 'idle']);
  assert.equal(proc({ events: 'P1+ go' }).ok, false);
});

test('信号量：互斥', () => {
  // mutex=1：P1 P → 0，进入临界区；P2 P → −1，阻塞；P1 V → 0，唤醒 P2；P2 V → 1
  const s = sem({ sems: 'mutex=1', ops: 'P1:P(mutex) P2:P(mutex) P1:V(mutex) P2:V(mutex)' });
  assert.deepEqual(s.steps.map((x) => x.after), [0, -1, 0, 1]);
  assert.equal(s.steps[1].block, true);
  assert.equal(s.steps[2].woke, 'P2');
  assert.deepEqual(s.stuck, []);
});

test('信号量：生产者消费者，缓冲区 2 格', () => {
  // empty=2 full=0 mutex=1。消费者 C 先来：P(full) → −1 阻塞
  // 生产者 A：P(empty) 1，P(mutex) 0，V(mutex) 1，V(full) 0 → 唤醒 C
  const s = sem({ sems: 'empty=2 full=0 mutex=1', ops: 'C:P(full) A:P(empty) A:P(mutex) A:V(mutex) A:V(full) C:P(mutex) C:V(mutex) C:V(empty)' });
  assert.equal(s.steps[0].block, true);
  assert.equal(s.steps[4].woke, 'C');
  assert.deepEqual(s.final, { empty: 2, full: 0, mutex: 1 });
  // 阻塞的进程再发操作是不合法的
  const t = sem({ sems: 's=0', ops: 'P1:P(s) P1:V(s)' });
  assert.deepEqual([t.steps[1].kind, t.steps[1].why], ['illegal', 'blocked']);
  assert.equal(sem({ sems: 's=0', ops: 'P1:P(x)' }).ok, false);
});

// 银行家算法的经典例子：5 个进程，资源 A B C 总量 10 5 7
const B = {
  avail: '3 3 2',
  max: '7 5 3; 3 2 2; 9 0 2; 2 2 2; 4 3 3',
  alloc: '0 1 0; 2 0 0; 3 0 2; 2 1 1; 0 0 2',
};

test('银行家：安全性检查', () => {
  const s = banker(B);
  // Need = Max − Allocation
  assert.deepEqual(s.need, [[7, 4, 3], [1, 2, 2], [6, 0, 0], [0, 1, 1], [4, 3, 1]]);
  // 第 1 轮：P0 743 > 332 不行；P1 122 ≤ 332 → Work 532；P2 600 不行；P3 011 → 743；P4 431 → 745
  // 第 2 轮：P0 743 ≤ 745 → 755；P2 600 → 10 5 7
  assert.equal(s.check.safe, true);
  assert.deepEqual(s.check.seq.map((x) => x.i), [1, 3, 4, 0, 2]);
  assert.deepEqual(s.check.work, [10, 5, 7]);
});

test('银行家：资源请求', () => {
  // P1 请求 (1,0,2)：≤ Need 122，≤ Available 332 → 试分配后 Available 230，安全序列 P1 P3 P4 P0 P2
  let s = banker({ ...B, req: '1 0 2', reqP: 1 });
  assert.equal(s.request.result, 'grant');
  assert.deepEqual(s.request.avail2, [2, 3, 0]);
  assert.deepEqual(s.check.seq.map((x) => x.i), [1, 3, 4, 0, 2]);
  // P4 请求 (3,3,0)：≤ Need 431，≤ Available 332 → 试分配后 Available 002，
  // 所有进程的 Need 都要至少 1 个 A 或 B（P3 要 011，B 已经是 0）→ 不安全，不分配
  s = banker({ ...B, req: '3 3 0', reqP: 4 });
  assert.equal(s.request.result, 'unsafe');
  // P0 请求 (0,2,0)：试分配后 Available 312，P0 Need 723
  // 第 1 轮：P0 723 不行，P1 122 不行（B 只有 1），P2 600 不行，P3 011 → 523，P4 431 不行（B 只有 2）
  // 第 2 轮：P0 不行，P1 122 → 723，P2 600 → 10 2 5，P4 不行；第 3 轮：P0 723 → 10 5 5，P4 → 10 5 7 → 安全
  s = banker({ ...B, req: '0 2 0', reqP: 0 });
  assert.equal(s.request.result, 'grant');
  assert.deepEqual(s.check.seq.map((x) => x.i), [3, 1, 2, 0, 4]);
  // 教材上的那一问：先批准 P1 的 (1,0,2)，此时 Available 230、P1 已分配 302；再来 P0 请求 (0,2,0)
  // 试分配后 Available 210：P0 723、P1 020（B 只有 1）、P2 600、P3 011、P4 431 都不行 → 不安全
  s = banker({ ...B, avail: '2 3 0', alloc: '0 1 0; 3 0 2; 3 0 2; 2 1 1; 0 0 2', req: '0 2 0', reqP: 0 });
  assert.equal(s.request.result, 'unsafe');
  // 请求超过 Need：出错
  assert.equal(banker({ ...B, req: '2 0 0', reqP: 3 }).request.result, 'overNeed');
  // 请求超过 Available：等待
  assert.equal(banker({ ...B, req: '6 0 0', reqP: 2 }).request.result, 'wait');
});
