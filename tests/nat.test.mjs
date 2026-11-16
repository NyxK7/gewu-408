// NAPT：出去改源地址和端口、回来查表改回、查不到丢弃。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nat } from '../js/subjects/net/nat.js';

test('两台内网主机共用一个公网地址', () => {
  const s = nat({
    pub: '172.38.1.5',
    base: 5001,
    events: `out 192.168.0.2:3345 → 202.10.1.1:80
out 192.168.0.3:3345 → 202.10.1.1:80
in 202.10.1.1:80 → :5002
out 192.168.0.2:3345 → 202.10.1.1:80
in 61.1.1.1:53 → :6000`,
  });
  // 第一台：分到 5001；第二台源端口也是 3345，但内网地址不同 → 新分 5002
  assert.deepEqual(s.steps[0].after, { sip: '172.38.1.5', sport: 5001, dip: '202.10.1.1', dport: 80 });
  assert.equal(s.steps[1].after.sport, 5002);
  // 回来的目的端口 5002 → 改回 192.168.0.3:3345
  assert.deepEqual(s.steps[2].after, { sip: '202.10.1.1', sport: 80, dip: '192.168.0.3', dport: 3345 });
  // 同一对再出去，沿用 5001
  assert.deepEqual([s.steps[3].fresh, s.steps[3].after.sport], [false, 5001]);
  // 表里没有 6000 → 丢弃
  assert.equal(s.steps[4].dropped, true);
  assert.equal(s.steps[4].table.length, 2);
});

test('参数检查', () => {
  assert.deepEqual(nat({ pub: '1.2.3', base: 5001, events: 'out 1.1.1.1:1 → 2.2.2.2:2' }).errors, ['pub']);
  assert.deepEqual(nat({ pub: '1.2.3.4', base: 5001, events: 'go 1.1.1.1:1' }).errors, [['event', { e: 'go 1.1.1.1:1' }]]);
});
