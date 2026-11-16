// 数据结构板块：快速排序划分、二叉树遍历、由遍历序列还原、AVL 插入。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avl } from '../js/subjects/ds/avl.js';
import { quicksort } from '../js/subjects/ds/qsort.js';
import { rebuild } from '../js/subjects/ds/rebuild.js';
import { fromLevel, height, ino, level, post, pre } from '../js/subjects/ds/tree.js';

const vals = (a) => a.map((n) => n.val).join('');

test('快速排序：第一次划分和递归顺序', () => {
  // 49 38 65 97 76 13 27 49，枢轴 49：
  //   high 从 7 往左：49 ≥ 49 跳过，27 < 49 → 放到 0；low 从 1：38 ≤ 49，65 > 49 → 放到 6；
  //   high 从 6：65、... 13 < 49 → 放到 2；low 从 3：97 > 49 → 放到 5；high 从 5 移到 3 与 low 相遇，49 放到 3
  const s = quicksort([49, 38, 65, 97, 76, 13, 27, 49]);
  assert.deepEqual(s.parts[0].after, [27, 38, 13, 49, 76, 97, 65, 49]);
  assert.equal(s.parts[0].pos, 3);
  assert.deepEqual(s.parts[0].moves.map((m) => [m.val, m.to]), [[27, 0], [65, 6], [13, 2], [97, 5]]);
  // 之后先左 [0..2]，再右 [4..7]，右边划分后还剩 [4..5]
  assert.deepEqual(s.parts.map((p) => [p.lo, p.hi, p.pos]), [[0, 7, 3], [0, 2, 1], [4, 7, 6], [4, 5, 4]]);
  assert.deepEqual(s.parts[2].after.slice(4), [49, 65, 76, 97]);
  assert.deepEqual(s.sorted, [13, 27, 38, 49, 49, 65, 76, 97]);
  assert.deepEqual(quicksort([1]).errors, ['keys']);
});

test('二叉树遍历', () => {
  // 层序 A B C D E # F：A 的孩子 B、C；B 的孩子 D、E；C 只有右孩子 F
  const t = fromLevel('A B C D E # F');
  assert.equal(vals(pre(t)), 'ABDECF');
  assert.equal(vals(ino(t)), 'DBEACF');
  assert.equal(vals(post(t)), 'DEBFCA');
  assert.equal(vals(level(t)), 'ABCDEF');
  assert.equal(height(t), 3);
  // 多余的结点挂不上去
  assert.equal(fromLevel('A # # B'), null);
});

test('由遍历序列还原', () => {
  let s = rebuild({ mode: 'pre', order: 'A B D E C F', inorder: 'D B E A C F' });
  assert.equal(vals(post(s.root)), 'DEBFCA');
  assert.deepEqual(s.steps.map((x) => x.root), ['A', 'B', 'D', 'E', 'C', 'F']);
  s = rebuild({ mode: 'post', order: 'D E B F C A', inorder: 'D B E A C F' });
  assert.equal(vals(pre(s.root)), 'ABDECF');
  // 后序 + 中序：先确定根，再先建右子树（从后往前取根），这里记录的是递归建树的顺序
  assert.equal(s.steps[0].root, 'A');
  assert.deepEqual(rebuild({ mode: 'pre', order: 'A B C', inorder: 'B C D' }).errors, ['mismatch']);
  assert.deepEqual(rebuild({ mode: 'pre', order: 'A B C', inorder: 'C A B' }).errors, ['conflict']);
});

test('AVL：四种旋转', () => {
  const top = (ks) => avl(ks).root.val;
  assert.equal(top([3, 2, 1]), 2); // LL
  assert.equal(top([1, 2, 3]), 2); // RR
  assert.equal(top([3, 1, 2]), 2); // LR
  assert.equal(top([1, 3, 2]), 2); // RL
  // 20 10 30 5 15 12：插入 12 后 20 的平衡因子为 2，12 在 20 的左孩子的右子树 → LR，15 成为根
  const s = avl([20, 10, 30, 5, 15, 12]);
  const ins = s.steps.find((x) => x.key === 12 && x.kind === 'insert');
  assert.deepEqual([ins.A, ins.type], [20, 'LR']);
  assert.equal(vals(pre(s.root)), [15, 10, 5, 12, 20, 30].join(''));
  // 重复关键字不插入
  assert.equal(avl([5, 5]).steps[1].kind, 'dup');
});
