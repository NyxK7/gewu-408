// 树：哈夫曼树、并查集、线索二叉树、森林与二叉树的转换。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forestPost, forestPre, huffman, parseForest, thread, toBinary, unionFind } from '../js/subjects/ds/trees2.js';
import { fromLevel, ino, pre } from '../js/subjects/ds/tree.js';

test('哈夫曼树', () => {
  // 7 5 2 4：2+4=6；5+6=11；7+11=18。WPL = 7×1 + 5×2 + 2×3 + 4×3 = 35
  const s = huffman({ weights: [7, 5, 2, 4] });
  assert.deepEqual(s.steps.map((x) => [x.a, x.b, x.sum]), [[2, 4, 6], [5, 6, 11], [7, 11, 18]]);
  assert.deepEqual(s.codes, ['0', '10', '110', '111']);
  assert.equal(s.wpl, 35);
});

test('并查集：按大小合并、路径压缩', () => {
  const s = unionFind({ n: 6, ops: 'U 0 1, U 2 3, U 1 3, U 4 5, U 5 3, F 5' });
  // 第三次合并：两棵都是 2 个，3 所在的根 2 并到 1 所在的根 0 下
  assert.deepEqual(s.steps[2].S, [-4, 0, 0, 2, -1, -1]);
  // 第五次：{4,5} 只有 2 个，并到 0 下
  assert.deepEqual(s.steps[4].S, [-6, 0, 0, 2, 0, 4]);
  // 查找 5：路径 5 → 4 → 0，压缩后 5 直接挂到 0
  assert.deepEqual(s.steps[5].path, [5, 4, 0]);
  assert.deepEqual(s.steps[5].S, [-6, 0, 0, 2, 0, 0]);
});

test('中序线索二叉树', () => {
  const t = fromLevel('A B C D E # F');
  const { threads } = thread(t, 'in');
  // n + 1 = 7 个空指针；D 的左线索为空，F 的右线索为空
  assert.equal(threads.length, 7);
  const m = Object.fromEntries(threads.map((x) => [x.from.val + x.side, x.to?.val ?? null]));
  assert.deepEqual(m, { Dl: null, Dr: 'B', El: 'B', Er: 'A', Cl: 'A', Fl: 'C', Fr: null });
});

test('森林转二叉树', () => {
  const f = parseForest('A(B,C(D)) E(F,G) H');
  const b = toBinary(f);
  // 先序一致；森林的后序（中序）对应二叉树的中序
  assert.deepEqual(pre(b).map((n) => n.val), forestPre(f));
  assert.deepEqual(ino(b).map((n) => n.val), forestPost(f));
  assert.deepEqual(forestPre(f), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.deepEqual(forestPost(f), ['B', 'D', 'C', 'A', 'F', 'G', 'E', 'H']);
  // A 的右孩子是下一棵树的根 E
  assert.equal(b.r.val, 'E');
  assert.equal(parseForest('A(B'), null);
});
