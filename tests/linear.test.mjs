// 线性表、栈、队列、数组。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalan, cqueue, infix, linked, matrix, stackSeq } from '../js/subjects/ds/linear.js';

test('出栈序列', () => {
  assert.equal(stackSeq({ push: '1 2 3 4 5', pop: '3 2 5 4 1' }).valid, true);
  // 3 出栈后栈顶是 2，要出 1 不可能
  const s = stackSeq({ push: '1 2 3', pop: '3 1 2' });
  assert.equal(s.valid, false);
  assert.deepEqual(s.fail, { want: '1', top: '2' });
  assert.equal(catalan(5), 42);
  assert.equal(catalan(3), 5);
});

test('中缀转后缀与求值', () => {
  assert.equal(infix({ expr: 'a+b*(c-d)-e/f' }).postfix.join(''), 'abcd-*+ef/-');
  const s = infix({ expr: '3+4*(5-2)-8/2' });
  assert.equal(s.postfix.join(' '), '3 4 5 2 - * + 8 2 / -');
  assert.equal(s.value, 11);
  assert.deepEqual(infix({ expr: '(a+b' }).errors, ['paren']);
  assert.deepEqual(infix({ expr: 'a+*b' }).errors, ['expr']);
});

test('循环队列', () => {
  // m = 5 最多放 4 个：第 5 个入队失败；出队两个后 front = 2，再入两个 rear 绕回到 1，长度 (1 − 2 + 5) % 5 = 4
  const s = cqueue({ m: 5, ops: '+1 +2 +3 +4 +5 - - +5 +6' });
  assert.equal(s.steps[4].fail, 'full');
  const last = s.steps.at(-1);
  assert.deepEqual([last.front, last.rear, last.len], [2, 1, 4]);
  assert.equal(cqueue({ m: 3, ops: '-' }).steps[0].fail, 'empty');
});

test('特殊矩阵：按行编号和课本公式一致', () => {
  for (const kind of ['sym', 'lower', 'upper', 'tri'])
    for (let n = 2; n <= 6; n++)
      for (let i = 1; i <= n; i++)
        for (let j = 1; j <= n; j++) {
          const s = matrix({ kind, n, i, j });
          if (s.k >= 0) assert.equal(s.k, s.formula, `${kind} n=${n} (${i},${j})`);
        }
  // 对称矩阵 a[2][5] 按 a[5][2] 存：5×4/2 + 2 − 1 = 11
  assert.equal(matrix({ kind: 'sym', n: 6, i: 2, j: 5 }).k, 11);
  // 三对角 a[3][4]：2×3 + 4 − 3 = 7
  assert.equal(matrix({ kind: 'tri', n: 5, i: 3, j: 4 }).k, 7);
});

test('单链表', () => {
  const s = linked({ init: '1 2 3 4', ops: 'ins 2 9, del 4, rev' });
  const vals = (L) => L.map((x) => x.v).join('');
  assert.deepEqual(s.steps.map((x) => vals(x.L)), ['19234', '1924', '4291']);
  assert.equal(linked({ init: '1', ops: 'del 3' }).steps[0].fail, true);
});
