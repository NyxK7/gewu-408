// 基本分页 / 分段 / 段页式地址变换。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTables, simulate } from '../js/subjects/os/addr.js';

test('分页：页大小 1KB，页表 [2, 3, 8, 5]', () => {
  // 2500 ÷ 1024 = 2 余 452 → 页 2 → 块 8 → 8 × 1024 + 452 = 8644
  let s = simulate({ mode: 'page', pageSize: 1024, frames: [2, 3, 8, 5], addr: 2500, tableBase: 6000, entrySize: 4 });
  assert.deepEqual([s.P, s.W, s.b, s.E, s.accesses], [2, 452, 8, 8644, 2]);
  // 页表项地址 = 6000 + 2 × 4 = 6008
  assert.equal(s.entryAddr, 6008);
  // 0x0A5C = 2652 = 0000 10 | 10 0101 1100 → 页 2，偏移 0x25C = 604 → 0x2000 + 0x25C = 0x225C
  s = simulate({ mode: 'page', pageSize: 1024, frames: [2, 3, 8, 5], addr: 0x0a5c });
  assert.deepEqual([s.P, s.W, s.E], [2, 0x25c, 0x225c]);
  // 5000 → 页 4，页表只有 4 项（0～3）→ 越界中断
  s = simulate({ mode: 'page', pageSize: 1024, frames: [2, 3, 8, 5], addr: 5000 });
  assert.deepEqual([s.P, s.fault], [4, 'page']);
});

test('分段：经典段表（基址, 段长）', () => {
  const T = { mode: 'seg', bases: [219, 2300, 90, 1327, 1952], lens: [600, 14, 100, 580, 96] };
  // (0, 430) → 219 + 430 = 649；(1, 10) → 2310；(3, 400) → 1727
  assert.equal(simulate({ ...T, s: 0, w: 430 }).E, 649);
  assert.equal(simulate({ ...T, s: 1, w: 10 }).E, 2310);
  assert.equal(simulate({ ...T, s: 3, w: 400 }).E, 1727);
  // (2, 500)：段长 100 → 越界；(4, 112)：段长 96 → 越界；(5, 1)：段号超出段表长度
  assert.equal(simulate({ ...T, s: 2, w: 500 }).fault, 'len');
  assert.equal(simulate({ ...T, s: 4, w: 112 }).fault, 'len');
  assert.equal(simulate({ ...T, s: 5, w: 1 }).fault, 'seg');
  // 段在内存里重叠是不合法的段表
  assert.equal(simulate({ mode: 'seg', bases: [0, 50], lens: [100, 10], s: 0, w: 1 }).ok, false);
});

test('段页式：页大小 1KB，段 0 的页表 [3, 7]，段 1 的页表 [5, 2, 8]', () => {
  const T = { mode: 'segpage', pageSize: 1024, tables: parseTables('3 7 | 5 2 8') };
  // (1, 2100)：2100 ÷ 1024 = 2 余 52 → 段 1 页 2 → 块 8 → 8 × 1024 + 52 = 8244，访存 3 次
  const s = simulate({ ...T, s: 1, w: 2100 });
  assert.deepEqual([s.p, s.d, s.b, s.E, s.accesses], [2, 52, 8, 8244, 3]);
  // (0, 2100)：段 0 只有 2 页 → 页号 2 越界
  assert.equal(simulate({ ...T, s: 0, w: 2100 }).fault, 'page');
  assert.equal(simulate({ ...T, s: 2, w: 0 }).fault, 'seg');
  assert.deepEqual(parseTables('1, 2 | 3'), [[1, 2], [3]]);
  assert.equal(parseTables('1 x'), null);
  assert.equal(simulate({ ...T, tables: [[1, 2], [2]], s: 0, w: 0 }).ok, false);
});
