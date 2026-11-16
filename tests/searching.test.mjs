// 查找：折半查找与判定树、二叉排序树、B 树。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bsearch, bst, btree, keysInOrder } from '../js/subjects/ds/searching.js';
import { pre } from '../js/subjects/ds/tree.js';

const K = [7, 14, 18, 21, 23, 29, 31, 35, 38, 42, 46];

test('折半查找', () => {
  // 21：mid 6（29）→ 往左，mid 3（18）→ 往右，mid 4 找到，比较 3 次
  const s = bsearch({ keys: K, target: 21 });
  assert.deepEqual(s.steps.map((x) => x.mid), [6, 3, 4]);
  assert.equal(s.found, 4);
  // 11 个结点的判定树：各层 1、2、4、4；ASL 成功 = (1 + 4 + 12 + 16) / 11 = 33/11
  assert.deepEqual(s.levels, [1, 2, 4, 4]);
  assert.deepEqual(s.succ, [33, 11]);
  // 失败结点 12 个：4 个挂在第 3 层（比较 3 次），8 个挂在第 4 层（比较 4 次）：44/12
  assert.deepEqual(s.fail, [44, 12]);
  // 找不到
  assert.equal(bsearch({ keys: K, target: 22 }).found, 0);
  assert.deepEqual(bsearch({ keys: [3, 1], target: 1 }).errors, ['sorted']);
});

test('二叉排序树的删除', () => {
  const s = bst({ ops: '50 30 70 20 40 60 80 -20 -30 -50' });
  assert.deepEqual(s.steps.slice(-3).map((x) => x.kind), ['leaf', 'one', 'two']);
  assert.equal(s.steps.at(-1).succ, 60);
  assert.deepEqual(pre(s.root).map((n) => n.val), [60, 40, 70, 80]);
});

const BASE = '53 75 139 49 145 36 101';
const shape = (t) => [t.keys, ...t.kids.map(shape)];

test('B 树插入：逐层分裂', () => {
  const s = btree({ m: 3, ops: BASE });
  // 根 [75]，第二层 [49] [139]，叶子 [36] [53] [101] [145]
  assert.deepEqual(shape(s.tree), [[75], [[49], [[36]], [[53]]], [[139], [[101]], [[145]]]]);
  // 插入 101 时先分裂叶子（139 上移），父结点又上溢再分裂（75 上移成新根）
  const last = s.steps.filter((x) => x.k === 101);
  assert.deepEqual(last.map((x) => [x.kind, x.up ?? null, x.newRoot ?? null]), [['ins', null, null], ['split', 139, false], ['split', 75, true]]);
});

test('B 树删除：借和合并', () => {
  // 删 53：叶子空了，左兄弟 [36] 不够借，和它合并（49 下移）；父结点空了，再和右边的 [139] 合并（75 下移），根变成 [75 139]
  let s = btree({ m: 3, ops: `${BASE} -53` });
  assert.deepEqual(shape(s.tree), [[75, 139], [[36, 49]], [[101]], [[145]]]);
  assert.deepEqual(s.steps.filter((x) => x.k === 53 && x.op === 'del').map((x) => x.kind), ['del', 'merge', 'merge']);
  // 先插入 37 让左兄弟够借：删 53 时从左兄弟借，37 上移、49 下移
  s = btree({ m: 3, ops: `${BASE} 37 -53` });
  assert.equal(s.steps.at(-1).kind, 'borrowL');
  assert.deepEqual(shape(s.tree), [[75], [[37], [[36]], [[49]]], [[139], [[101]], [[145]]]]);
  // 删非叶结点的 75：用前驱 53 替代，再处理叶子的下溢
  s = btree({ m: 3, ops: `${BASE} -75` });
  assert.equal(s.steps.find((x) => x.k === 75 && x.op === 'del').pred, 53);
  assert.deepEqual(keysInOrder(s.tree), [36, 49, 53, 101, 139, 145]);
  assert.deepEqual(shape(s.tree), [[53, 139], [[36, 49]], [[101]], [[145]]]);
});
