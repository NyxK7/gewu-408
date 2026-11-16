// 排序选择题里「快速排序第二趟」用到的判定，和真的跑两趟快排是否一致。
import assert from 'node:assert/strict';
import test from 'node:test';
import { questionOf } from '../js/quiz/bank.js';
import { rng } from '../js/quiz/kit.js';
import { afterTwo, canBeSecond, fixedOf } from '../js/quiz/q-sort.js';

test('快排第二趟：真的跑出来的结果都满足判定，且元素不多不少', () => {
  const r = rng(7);
  for (let t = 0; t < 2000; t++) {
    const keys = r.distinct(r.int(5, 10), 1, 60);
    const a = afterTwo(keys);
    assert.deepEqual([...a].sort((x, y) => x - y), [...keys].sort((x, y) => x - y));
    assert.ok(canBeSecond(a), `${keys} → ${a}`);
    assert.ok(fixedOf(a).length >= 2);
  }
});

test('快排第二趟：判定的几个典型情况', () => {
  assert.equal(canBeSecond([2, 1, 3, 5, 4, 6]), true); // 3、6 到位，3 不在端点但两边各有到位的
  assert.equal(canBeSecond([1, 3, 2, 4]), true); // 1 在端点，右边 4 到位
  assert.equal(canBeSecond([3, 1, 2, 4, 6, 5]), false); // 只有 4 到位
  assert.equal(canBeSecond([2, 1, 3, 6, 5, 4]), false); // 只有 3 到位，两边都没有
});

test('快排第二趟的题：四个选项元素相同，恰好一个不可能', () => {
  for (let i = 0; i < 200; i++) {
    const q = questionOf('ds-qs-02', 1 + i * 31);
    const arrs = q.options.map((o) => o.split(' ').map(Number));
    const sorted = arrs.map((a) => [...a].sort((x, y) => x - y).join());
    assert.equal(new Set(sorted).size, 1);
    assert.deepEqual(arrs.map((a, k) => (canBeSecond(a) ? -1 : k)).filter((k) => k >= 0), [q.answer]);
  }
});
