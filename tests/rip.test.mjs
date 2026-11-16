// RIP 距离向量：五种处理情况。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rip } from '../js/subjects/net/rip.js';

test('收到 R3 的消息后更新路由表', () => {
  const s = rip({
    table: 'Net1 3 R2\nNet2 5 R3\nNet3 1 直接\nNet4 6 R4\nNet5 2 R3',
    from: 'R3',
    msg: 'Net1 1\nNet2 6\nNet3 3\nNet4 3\nNet5 15\nNet6 5',
  });
  const by = Object.fromEntries(s.rows.map((r) => [r.net, [r.neu.d, r.neu.hop, r.rule]]));
  // 加 1 后：Net1 2、Net2 7、Net3 4、Net4 4、Net5 16、Net6 6，下一跳都是 R3
  assert.deepEqual(by.Net1, [2, 'R3', 'better']); // 原来 3 经 R2，2 < 3，换
  assert.deepEqual(by.Net2, [7, 'R3', 'same']); // 原来就经 R3，以新消息为准，变成 7
  assert.deepEqual(by.Net3, [1, '直接', 'keep']); // 直接相连 1 < 4，不变
  assert.deepEqual(by.Net4, [4, 'R3', 'better']); // 4 < 6，换
  assert.deepEqual(by.Net5, [16, 'R3', 'same']); // 原来经 R3，现在 15 + 1 = 16，不可达
  assert.deepEqual(by.Net6, [6, 'R3', 'add']); // 新网络，添加
});

test('消息里没有的网络不变；参数检查', () => {
  const s = rip({ table: 'A 2 R1\nB 3 R2', from: 'R2', msg: 'A 4' });
  assert.deepEqual(s.rows.map((r) => [r.net, r.neu.d, r.neu.hop, r.rule]), [
    ['A', 2, 'R1', 'keep'], // 4 + 1 = 5 > 2
    ['B', 3, 'R2', 'none'],
  ]);
  assert.deepEqual(rip({ table: 'A x R1', from: 'R2', msg: 'A 4' }).errors, [['row', { r: 'A x R1' }]]);
  assert.deepEqual(rip({ table: 'A 2 R1', from: '', msg: 'A 4' }).errors, ['from']);
});
