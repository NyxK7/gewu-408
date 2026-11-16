// 中断、异常与系统调用：执行片段、返回地址、切换次数。期望值按规则手推。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProg, run } from '../js/subjects/os/intr.js';

const lanes = (s) => s.boxes.map((b) => b.lane).join('');

test('系统调用：返回到下一条指令', () => {
  // add(1) syscall(2) add(3)：用户 1、用户 2（陷入指令本身在用户态执行）、内核（返回 3）、用户 3
  const s = run({ prog: parseProg('add syscall add') });
  assert.equal(lanes(s), 'uuku');
  assert.equal(s.boxes[2].ret, 3);
  assert.equal(s.switches, 1);
  assert.equal(s.done, 3);
});

test('缺页：重新执行同一条指令', () => {
  // add(1) pf(2) add(3)：指令 2 没执行完 → 内核调页，断点仍是 2 → 重新执行 2 → 3
  const s = run({ prog: parseProg('add pf add') });
  assert.equal(lanes(s), 'uukuu');
  assert.equal(s.boxes[2].ret, 2);
  assert.equal(s.boxes[3].retry, true);
  assert.equal(s.done, 3);
});

test('外部中断：在指令执行完后检测，返回到下一条', () => {
  // add(1) irq add(2) add(3)：指令 1 执行完后进内核，返回 2
  const s = run({ prog: parseProg('add irq add add') });
  assert.equal(lanes(s), 'ukuu');
  assert.deepEqual([s.boxes[1].after, s.boxes[1].ret], [1, 2]);
  // 程序最后一条之后才来的中断：没有下一条指令
  assert.equal(run({ prog: ['add', 'irq'] }).boxes[1].ret, null);
});

test('用户态执行特权指令：终止进程，后面的指令不再执行', () => {
  const s = run({ prog: parseProg('add priv add add') });
  assert.equal(lanes(s), 'uuk');
  assert.deepEqual(s.killed, { i: 2, why: 'priv' });
  assert.equal(s.skipped, 2);
  assert.equal(s.boxes[2].back, false);
});

test('混合：进内核 3 次，但用户态 → 内核态只切换 2 次', () => {
  // add syscall irq pf add：陷入、外中断、缺页共 3 次进内核；外中断紧跟在系统调用处理之后，中间没回用户态
  const s = run({ prog: parseProg('add syscall irq pf add') });
  assert.deepEqual([s.entries, s.switches], [3, 2]);
  assert.equal(lanes(s), 'uukkukuu');
  // 两个内核片段连在一起：第一个不直接回用户态
  assert.deepEqual([s.boxes[2].back, s.boxes[3].back], [false, true]);
  assert.equal(parseProg('add foo'), null);
});
