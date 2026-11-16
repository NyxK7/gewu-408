// 文件管理：混合索引、位示图。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bitmap, index, parseBitOps } from '../js/subjects/os/file.js';

const I = { block: 1024, addr: 4, d: 10, s: 1, dd: 1, t: 1 };

test('混合索引：最大文件长度', () => {
  // 每块 1024 ÷ 4 = 256 个地址；10 + 256 + 256² + 256³ = 10 + 256 + 65536 + 16777216 = 16843018 块
  const s = index(I);
  assert.equal(s.k, 256);
  assert.equal(s.maxBlocks, 16843018);
  assert.equal(s.maxBytes, 16843018 * 1024);
  // 只有 10 个直接 + 1 个一级间接：(10 + 256) × 1KB = 266KB
  assert.equal(index({ ...I, dd: 0, t: 0 }).maxBytes, 266 * 1024);
});

test('混合索引：某个字节落在哪里、读几次盘', () => {
  // 5000 ÷ 1024 = 4 → 直接地址第 4 项，读 1 次
  let s = index({ ...I, offset: 5000 });
  assert.deepEqual([s.L, s.level, s.ptr, s.reads, s.inBlock], [4, 0, 4, 1, 904]);
  // 100KB → 第 100 块，100 − 10 = 90 → 一级间接块的第 90 项，读 2 次
  s = index({ ...I, offset: 100 * 1024 });
  assert.deepEqual([s.L, s.level, s.path, s.reads], [100, 1, [90], 2]);
  // 第 300 块：300 − 10 = 290 ≥ 256 → 290 − 256 = 34 → 二级间接：一级索引块第 0 项、二级索引块第 34 项，读 3 次
  s = index({ ...I, offset: 300 * 1024 + 7 });
  assert.deepEqual([s.L, s.level, s.path, s.reads], [300, 2, [0, 34], 3]);
  // 第 10 + 256 + 300 = 566 块：二级里第 300 项 → 300 ÷ 256 = 1 余 44；inode 不在内存再加 1 次
  s = index({ ...I, offset: 566 * 1024, inodeInMem: false });
  assert.deepEqual([s.level, s.path, s.reads], [2, [1, 44], 4]);
  // 超过最大长度
  assert.equal(index({ ...I, dd: 0, t: 0, offset: 266 * 1024 }).level, -1);
});

test('位示图：盘块号与行列互换', () => {
  // 字长 16，从 0 编号：100 = 6 × 16 + 4 → 第 6 行第 4 列
  let s = bitmap({ rows: 8, n: 16, base: 0 });
  assert.deepEqual(s.toRC(100), { i: 6, j: 4 });
  assert.equal(s.toB(6, 4), 100);
  // 从 1 编号：b = 16 × (i − 1) + j；100 → i = ⌊99 ÷ 16⌋ + 1 = 7，j = 99 mod 16 + 1 = 4
  s = bitmap({ rows: 8, n: 16, base: 1 });
  assert.deepEqual(s.toRC(100), { i: 7, j: 4 });
  assert.equal(s.toB(7, 4), 100);
});

test('位示图：分配与回收', () => {
  // 0 号起，前 3 块已用：分配 2 块拿到 3、4；回收 1；再分配 2 块拿到 1、5
  const s = bitmap({ rows: 2, n: 8, base: 0, used: [0, 1, 2], ops: parseBitOps('+2 -1 +2') });
  assert.deepEqual(s.steps[0].blocks.map((x) => x.b), [3, 4]);
  assert.equal(s.steps[1].was, 1);
  assert.deepEqual(s.steps[2].blocks.map((x) => [x.b, x.i, x.j]), [[1, 0, 1], [5, 0, 5]]);
  // 不够分：16 块里用了 15 块，要 2 块 → 失败
  const t = bitmap({ rows: 2, n: 8, used: Array.from({ length: 15 }, (_, i) => i), ops: [{ type: 'alloc', k: 2 }] });
  assert.equal(t.steps[0].fail, true);
  assert.equal(parseBitOps('+x'), null);
});
