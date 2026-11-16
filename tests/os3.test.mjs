// 操作系统第三批：上下文切换、打开文件、硬链接与软链接、工作集与抖动。
import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonById } from '../js/catalog.js';
import { contextSwitch } from '../js/subjects/os/ctxsw.js';

const kinds = (r) => r.steps.map((s) => s.kind);

test('上下文切换：时间片用完，A 变就绪、排到队尾，B 上 CPU，换页表、TLB 失效', () => {
  const r = contextSwitch({ trigger: 'timer', target: 'process' });
  assert.ok(r.ok && r.switched);
  assert.deepEqual(kinds(r), ['run', 'enter', 'state', 'save', 'pick', 'space', 'restore', 'resume']);
  const last = r.steps.at(-1);
  assert.equal(last.A.state, 'ready');
  assert.deepEqual(last.ready, ['C', 'A']);
  assert.equal(last.B.state, 'running');
  assert.equal(last.cpu.PTBR, last.B.PTBR);
  assert.equal(last.cpu.PC, last.B.PC);
  assert.equal(last.cpu.mode, 'user');
  assert.equal(last.tlbValid, false);
  // 保存进 PCB 的 PC 是断点（下一条指令），不是中断处理程序的地址
  const save = r.steps.find((s) => s.kind === 'save');
  assert.equal(save.A.PC, r.steps[1].brk);
  assert.equal(save.A.PC, r.steps[0].cpu.PC + 4);
  assert.ok(r.cost.includes('tlb'));
});

test('上下文切换：读磁盘阻塞，A 进阻塞队列而不是就绪队列', () => {
  const r = contextSwitch({ trigger: 'block' });
  const last = r.steps.at(-1);
  assert.equal(last.A.state, 'blocked');
  assert.deepEqual(last.blocked, ['A']);
  assert.ok(!last.ready.includes('A'));
});

test('上下文切换：同一进程换线程，不换页表、TLB 仍有效', () => {
  const r = contextSwitch({ target: 'thread' });
  assert.ok(!kinds(r).includes('space'));
  const last = r.steps.at(-1);
  assert.equal(last.cpu.PTBR, r.steps[0].cpu.PTBR);
  assert.equal(last.tlbValid, true);
  assert.ok(!r.cost.includes('space') && !r.cost.includes('tlb'));
});

test('上下文切换：不阻塞的系统调用只切换模式，A 一直占着 CPU', () => {
  const r = contextSwitch({ trigger: 'syscall' });
  assert.equal(r.switched, false);
  assert.deepEqual(kinds(r), ['run', 'enter', 'serve', 'back']);
  assert.ok(r.steps.every((s) => s.A.state === 'running' && s.B.state === 'ready'));
  assert.equal(r.steps.at(-1).cpu.PC, r.steps[1].brk);
  assert.equal(r.steps.at(-1).cpu.mode, 'user');
});

test('上下文切换：参数检查和课程', () => {
  assert.equal(contextSwitch({ trigger: 'x' }).ok, false);
  assert.equal(contextSwitch({ target: 'x' }).ok, false);
  const l = lessonById('ctx-switch');
  assert.deepEqual(l.errors ?? [], []);
  assert.equal(l.steps.length, 8);
  assert.equal(l.update({ trigger: 'syscall' }).steps.length, 4);
  assert.equal(l.update({ target: 'thread' }).steps.length, 7);
  assert.ok(l.principle.sections.some((s) => s.id === 'not'));
});

import { FS, lookup, openFile } from '../js/subjects/os/openfile.js';

test('打开文件：/home/ming/notes.txt，open 访盘 1 + 2×2 + 1 = 6 次，fd 取 3', () => {
  const r = openFile({});
  assert.equal(r.fd, 3);
  assert.equal(r.openDisk, 6);
  assert.deepEqual(r.disk.slice(0, 6).map((d) => `${d.kind}${d.id}`), ['dir100', 'inode11', 'dir140', 'inode23', 'dir205', 'inode37']);
  // 读 1500 字节：逻辑块 0、1 → 物理块 310、311
  assert.deepEqual(r.steps.find((s) => s.kind === 'read').blocks.map((b) => b.pb), [310, 311]);
  assert.equal(r.readDisk, 2);
  const fdStep = r.steps.find((s) => s.kind === 'fd');
  assert.deepEqual(fdStep.fdt.at(-1), { fd: 3, to: 0, off: 0 });
  assert.equal(r.steps.find((s) => s.kind === 'read').fdt.at(-1).off, 1500);
  const close = r.steps.at(-1);
  assert.ok(close.freed && close.sys.length === 0 && close.fdt.length === 3);
});

test('打开文件：Q 已打开 → 不读文件 inode、计数 2，close 后剩 1', () => {
  const r = openFile({ opened: 'yes' });
  assert.equal(r.openDisk, 5);
  assert.ok(r.steps.some((s) => s.kind === 'cached'));
  assert.equal(r.steps.find((s) => s.kind === 'sys').sys[0].count, 2);
  const close = r.steps.at(-1);
  assert.equal(close.freed, false);
  assert.equal(close.sys[0].count, 1);
});

test('打开文件：权限、找不到、不是目录、是目录；读超过文件大小', () => {
  const deny = openFile({ who: 'hua' });
  assert.equal(deny.error, 'EACCES');
  assert.equal(deny.steps.at(-1).bits, '---'); // rw-r----- 的「其他人」三位
  assert.equal(openFile({ path: '/etc/hosts', who: 'hua' }).fd, 3);
  assert.equal(openFile({ path: '/home/ming/note.txt' }).error, 'ENOENT');
  assert.equal(openFile({ path: '/readme/x' }).error, 'ENOTDIR');
  assert.equal(openFile({ path: '/tmp' }).error, 'EISDIR');
  const big = openFile({ n: 5000 });
  assert.equal(big.got, FS[37].size);
  assert.equal(big.readDisk, 3);
  assert.equal(openFile({ path: '/etc/hosts' }).openDisk, 1 + 2 + 1);
  assert.equal(lookup('/home/hua/plan.txt'), 41);
  for (const bad of ['home', '/a/../b', '', '/x y']) assert.equal(openFile({ path: bad }).ok, false);
  assert.equal(openFile({ n: 0 }).ok, false);
});

test('打开文件：课程', () => {
  const l = lessonById('open-file');
  assert.deepEqual(l.errors ?? [], []);
  assert.equal(l.steps.length, 10);
  for (const id of ['layout', 'protect', 'mount', 'tables']) assert.ok(l.principle.sections.some((s) => s.id === id));
});

import { links } from '../js/subjects/os/links.js';

test('链接：硬链接加计数、软链接不加；删原文件后 b 能读、c 悬空', () => {
  const r = links({ scene: 'orig' });
  const at = (k) => r.steps.find((s) => s.kind === k);
  assert.equal(r.steps[0].inodes[37].nlink, 1);
  assert.equal(at('hard').inodes[37].nlink, 2);
  assert.equal(at('soft').inodes[37].nlink, 2);
  assert.equal(at('soft').inodes[52].type, 'link');
  const before = at('access').access;
  assert.ok(before.every((a) => a.ok && a.ino === 37));
  assert.equal(before[1].lookups, 2); // c 多查一轮
  assert.equal(at('rm').inodes[37].nlink, 1);
  assert.deepEqual(r.after.map((a) => a.ok), [true, false]);
});

test('链接：两个名字都删 → 回收 inode；重建同名文件 → c 指到新文件；只删 b → c 不受影响', () => {
  const both = links({ scene: 'both' });
  assert.equal(both.final[37], undefined);
  assert.deepEqual(both.freed, [{ ino: 37, blocks: [310, 311] }]);
  assert.deepEqual(both.after.map((a) => a.ok), [false, false]);
  const re = links({ scene: 'recreate' });
  assert.equal(re.after[0].ino, 37);
  assert.equal(re.after[1].ino, 60);
  const hard = links({ scene: 'hard' });
  assert.deepEqual(hard.after.map((a) => a.ok), [false, true]);
  assert.equal(hard.final[37].nlink, 1);
  assert.equal(links({ scene: 'x' }).ok, false);
  const l = lessonById('file-link');
  assert.deepEqual(l.errors ?? [], []);
  for (const s of ['orig', 'both', 'recreate', 'hard']) assert.ok(l.update({ scene: s }).steps.length >= 6);
});

import { workingSet } from '../js/subjects/os/wset.js';

test('工作集：手算 W(t, Δ)，大小不超过 Δ；超过页框数时 LRU 缺页', () => {
  const refs = [1, 2, 1, 3, 2, 1, 3, 2, 5, 6, 7, 5, 6, 8, 7, 5, 6, 8, 1, 2, 3, 1, 2];
  const r = workingSet({ refs, delta: 4, frames: 3 });
  assert.deepEqual(r.ws[3], [1, 2, 3]); // 1 2 1 3
  assert.deepEqual(r.ws[10], [2, 5, 6, 7]); // 2 5 6 7
  assert.deepEqual(r.enter[10], [7]);
  assert.deepEqual(r.leave[10], [3]);
  assert.equal(r.sizes.join(''), '12233333444334444444433');
  assert.ok(r.sizes.every((s) => s <= 4));
  assert.equal(r.maxW, 4);
  assert.equal(r.faults, 14);
  assert.equal(r.overT, 11);
  assert.equal(r.overFaults, 11);
  assert.equal(r.fitFaults, 10);
  // Δ = 1：工作集只有当前页
  assert.ok(workingSet({ refs, delta: 1, frames: 3 }).sizes.every((s) => s === 1));
  for (const bad of [{ refs: [1], delta: 2, frames: 2 }, { refs, delta: 0, frames: 2 }, { refs, delta: 2, frames: 9 }, { refs: [1, 99], delta: 2, frames: 2 }]) assert.equal(workingSet(bad).ok, false);
  const l = lessonById('working-set');
  assert.deepEqual(l.errors ?? [], []);
  assert.equal(l.steps.length, refs.length);
  assert.ok(l.principle.sections.some((s) => s.id === 'thrash'));
});
