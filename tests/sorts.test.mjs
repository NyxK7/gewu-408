// 排序：各算法每一趟的结果、外部排序、时间复杂度计数。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestMerge, countLoop, passes, replaceSelect } from '../js/subjects/ds/sorts.js';

const K = [49, 38, 65, 97, 76, 13, 27];
const P = (algo, extra) => passes({ keys: K, algo, ...extra }).passes.map((p) => p.a.join(' '));

test('插入、冒泡、选择每一趟', () => {
  assert.deepEqual(P('insert').slice(0, 3), ['38 49 65 97 76 13 27', '38 49 65 97 76 13 27', '38 49 65 97 76 13 27']);
  assert.equal(P('insert')[3], '38 49 65 76 97 13 27');
  // 冒泡从后往前，第一趟把 13 冒到最前
  assert.equal(P('bubble')[0], '13 49 38 65 97 76 27');
  assert.equal(P('bubble')[1], '13 27 49 38 65 97 76');
  // 简单选择第一趟：13 和 49 交换
  assert.equal(P('select')[0], '13 38 65 97 76 49 27');
  // 有序时冒泡一趟就结束
  assert.equal(passes({ keys: [1, 2, 3, 4], algo: 'bubble' }).passes.length, 1);
});

test('希尔、归并、基数', () => {
  // 增量 3：各组 (49,97,27) (38,76) (65,13)：→ 27 38 13 49 76 65 97；增量 1 排好
  assert.deepEqual(P('shell'), ['27 38 13 49 76 65 97', '13 27 38 49 65 76 97']);
  // 归并：两两 → 四四 → 全部
  assert.deepEqual(P('merge'), ['38 49 65 97 13 76 27', '38 49 65 97 13 27 76', '13 27 38 49 65 76 97']);
  // 基数：个位分配收集 → 十位
  const r = passes({ keys: [278, 109, 63, 930, 589, 184, 505, 269, 8, 83], algo: 'radix' }).passes;
  assert.equal(r[0].a.join(' '), '930 63 83 184 505 278 8 109 589 269');
  assert.equal(r.at(-1).a.join(' '), '8 63 83 109 184 269 278 505 589 930');
});

test('置换—选择', () => {
  // 工作区 3：51 49 39 46 38 29 14 61 15 30 1 48 52 3 63 27 4 13 89 24 46 58 33 76
  const s = replaceSelect({ keys: [51, 49, 39, 46, 38, 29, 14, 61, 15, 30, 1, 48, 52, 3, 63, 27, 4, 13, 89, 24, 46, 58, 33, 76], w: 3 });
  // 输出 39、46、49、51 后工作区是 38 29 14，都比 51 小，第一段结束
  assert.deepEqual(s.runs[0], [39, 46, 49, 51]);
  assert.equal(s.runs.flat().length, 24);
  for (const run of s.runs) for (let i = 1; i < run.length; i++) assert.ok(run[i] >= run[i - 1]);
});

test('最佳归并树', () => {
  // 3 路，9 个段：(9 − 1) % 2 = 0，不用补虚段
  const s = bestMerge({ lens: [9, 30, 12, 18, 3, 17, 2, 6, 24], k: 3 });
  assert.equal(s.dummies, 0);
  assert.equal(s.wpl, 223);
  assert.equal(s.io, 446);
  // 8 个段 3 路：(8 − 1) % 2 = 1，补 1 个虚段
  assert.equal(bestMerge({ lens: [2, 3, 6, 9, 12, 17, 18, 24], k: 3 }).dummies, 1);
});

test('时间复杂度计数', () => {
  assert.equal(countLoop({ kind: 'double', n: 100 }).count, 7); // 1 2 4 8 16 32 64
  assert.equal(countLoop({ kind: 'tri', n: 10 }).count, 55);
  assert.equal(countLoop({ kind: 'nested', n: 8 }).count, 32); // 8 × 4
  assert.equal(countLoop({ kind: 'sqrt', n: 100 }).count, 14); // 1+…+14 = 105 ≥ 100
});
