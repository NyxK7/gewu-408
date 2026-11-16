// 数据结构：散列表 ASL、堆的计算核对。期望值为手算结果，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate as hash } from '../js/subjects/ds/hash.js';
import { simulate as heap } from '../js/subjects/ds/heap.js';

test('散列：线性探测，H = 3k mod 7，表长 10', () => {
  // 7→0  8→3  30→6  11→5  18→5 冲突→6 冲突→7（3 次）  9→6 冲突→7 冲突→8（3 次）  14→0 冲突→1（2 次）
  const s = hash({ keys: [7, 8, 30, 11, 18, 9, 14], m: 10, p: 7, a: 3, method: 'linear' });
  assert.deepEqual(s.table, [7, 14, null, 8, null, 11, 30, 18, 9, null]);
  assert.deepEqual(s.steps.map((x) => x.probes), [1, 1, 1, 1, 3, 3, 2]);
  // ASL成功 = (1+1+1+1+3+3+2)/7 = 12/7
  assert.deepEqual(s.succ, [12, 7]);
  // ASL失败：从 0..6 出发探到空位（含空位那次）：3 2 1 2 1 5 4 → 18/7
  assert.deepEqual(s.failRows.map((f) => f.count), [3, 2, 1, 2, 1, 5, 4]);
  assert.deepEqual(s.fail, [18, 7]);
});

test('散列：拉链法，H = k mod 13', () => {
  // 1 号链 14 1 27 79，3 号 68 55，6 号 19 84，7 号 20，10 号 23 10，11 号 11
  const s = hash({ keys: [19, 14, 23, 1, 68, 20, 84, 27, 55, 11, 10, 79], m: 13, p: 13, method: 'chain' });
  assert.deepEqual(s.chains[1], [14, 1, 27, 79]);
  assert.deepEqual(s.chains[3], [68, 55]);
  // ASL成功 = (1×6 + 2×4 + 3 + 4)/12 = 21/12；ASL失败 = 链长之和 12 / 13
  assert.deepEqual(s.succ, [21, 12]);
  assert.deepEqual(s.fail, [12, 13]);
});

test('散列：平方探测，H = k mod 11', () => {
  // 19→8  1→1  23→1 冲突 → 1+1=2（2 次）  14→3  55→0  68→2 冲突 → 3 冲突 → 1 冲突 → 2+4=6（4 次）
  const s = hash({ keys: [19, 1, 23, 14, 55, 68], m: 11, p: 11, method: 'quad' });
  assert.deepEqual(s.steps.map((x) => [x.key, x.slot, x.probes]), [[19, 8, 1], [1, 1, 1], [23, 2, 2], [14, 3, 1], [55, 0, 1], [68, 6, 4]]);
  assert.deepEqual(s.succ, [10, 6]);
  assert.ok(hash({ keys: [1, 1], m: 5, p: 5 }).ok === false);
});

const K = [53, 17, 78, 9, 45, 65, 87, 32];

test('堆：筛选法建大根堆', () => {
  // i=4：9 只有一个孩子 32，比 1 次，交换；i=3：65 与 87 比、87 与 78 比，交换（2 次）；
  // i=2：32 与 45 比、45 与 17 比，交换（2 次）；i=1：45 与 87、87 与 53 交换，再 65 与 78、78 与 53 交换（4 次）
  const s = heap({ keys: K, kind: 'max', op: 'build' });
  assert.deepEqual(s.heap, [87, 45, 78, 32, 17, 65, 53, 9]);
  assert.equal(s.total, 9);
  assert.deepEqual(s.steps.slice(1).map((x) => x.cmp), [1, 2, 2, 4]);
});

test('堆：筛选法建小根堆、逐个插入建堆', () => {
  // 小根堆：i=4 比 1 次不换；i=3 换 65（2 次）；i=2 换 9 后 17 与 32 比（3 次）；i=1 换 9、换 17、换 32（5 次）
  const s = heap({ keys: K, kind: 'min', op: 'build' });
  assert.deepEqual(s.heap, [9, 17, 65, 32, 45, 78, 87, 53]);
  assert.equal(s.total, 11);
  // 逐个插入大根堆：比较 0 1 1 1 2 2 2 2 次
  const t = heap({ keys: K, kind: 'max', op: 'insert' });
  assert.deepEqual(t.heap, [87, 45, 78, 32, 17, 53, 65, 9]);
  assert.deepEqual(t.steps.map((x) => x.cmp), [0, 1, 1, 1, 2, 2, 2, 2]);
});

test('堆排序', () => {
  const s = heap({ keys: K, kind: 'max', op: 'sort' });
  assert.deepEqual(s.sorted, [9, 17, 32, 45, 53, 65, 78, 87]);
  // 第一趟：87 和 9 交换，9 向下调整：与 78 交换、再与 65 交换 → 78 45 65 32 17 9 53 | 87
  const first = s.steps.find((x) => x.type === 'extract');
  assert.deepEqual(first.arr.slice(1).map((e) => e.key), [78, 45, 65, 32, 17, 9, 53, 87]);
  assert.deepEqual(heap({ keys: K, kind: 'min', op: 'sort' }).sorted, [87, 78, 65, 53, 45, 32, 17, 9]);
});
