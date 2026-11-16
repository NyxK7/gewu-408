// 快表与有效访问时间。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate } from '../js/subjects/os/eat.js';

test('串行查找：t = 20ns，m = 100ns', () => {
  // 命中 20 + 100 = 120；未命中 20 + 100 + 100 = 220
  // α = 80%：0.8 × 120 + 0.2 × 220 = 96 + 44 = 140
  let s = simulate({ t: 20, m: 100, alpha: 0.8 });
  assert.deepEqual([s.paths.hit.time, s.paths.miss.time, s.eat], [120, 220, 140]);
  // α = 98%：117.6 + 4.4 = 122；不用快表 200，加速比 200 / 122
  s = simulate({ t: 20, m: 100, alpha: 0.98 });
  assert.equal(s.eat, 122);
  assert.equal(s.noTlb, 200);
  // 两级页表：未命中 20 + 100 + 100 + 100 = 320；0.8 × 120 + 0.2 × 320 = 96 + 64 = 160
  s = simulate({ t: 20, m: 100, alpha: 0.8, levels: 2 });
  assert.deepEqual([s.paths.miss.time, s.eat, s.noTlb], [320, 160, 300]);
});

test('并行查找：未命中时查快表的时间被盖住', () => {
  // 命中 120；未命中 100 + 100 = 200；0.8 × 120 + 0.2 × 200 = 96 + 40 = 136
  const s = simulate({ t: 20, m: 100, alpha: 0.8, parallel: true });
  assert.deepEqual([s.paths.hit.time, s.paths.miss.time, s.eat], [120, 200, 136]);
});

test('缺页：处理时间 10^8 ns', () => {
  // 一次缺页的访存：查快表 10 + 查页表 100 + 处理 10^8 + 重新执行（快表命中）10 + 100 = 100000220
  let s = simulate({ t: 10, m: 100, alpha: 0.5, f: 0.001, T: 1e8 });
  assert.equal(s.paths.fault.time, 100000220);
  // 未命中且不缺页的概率 = 1 − 0.5 − 0.001 = 0.499
  assert.equal(s.paths.miss.p, 0.499);
  // EAT = 0.5 × 110 + 0.499 × 210 + 0.001 × 100000220 = 55 + 104.79 + 100000.22 = 100160.01
  assert.equal(s.eat, 100160.01);
  // 缺页处理不填快表：重新执行再走一遍未命中 10 + 100 + 100 → 100000320
  s = simulate({ t: 10, m: 100, alpha: 0.5, f: 0.001, T: 1e8, reHit: false });
  assert.equal(s.paths.fault.time, 100000320);
  assert.equal(simulate({ t: 10, m: 100, alpha: 0.9, f: 0.2, T: 5 }).ok, false);
});
