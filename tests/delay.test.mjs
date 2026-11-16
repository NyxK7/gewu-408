// 报文交换与分组交换的总时间。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { switching } from '../js/subjects/net/delay.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≈ ${b}`);

test('不计传播时延', () => {
  // 12000 bit，1 Mb/s，3 段链路。报文交换：每段 12 ms，共 36 ms
  // 分组 3000 bit → 4 个，每个 3 ms：(4 + 3 − 1) × 3 = 18 ms
  const s = switching({ x: 12000, p: 3000, b: 1e6, k: 3 });
  near(s.msgTotal, 0.036);
  assert.equal(s.n, 4);
  near(s.pktTotal, 0.018);
  near(s.formula, 0.018);
});

test('加上首部和传播时延', () => {
  // 每个分组 1000 + 200 = 1200 bit，1.2 ms；12 个分组；2 段链路；每段传播 1 ms
  // 分组交换：(12 + 2 − 1) × 1.2 + 2 × 1 = 17.6 ms；报文交换：2 × (12 + 1) = 26 ms
  const s = switching({ x: 12000, p: 1000, h: 200, b: 1e6, d: 0.001, k: 2 });
  near(s.pktTotal, 0.0176);
  near(s.formula, 0.0176);
  near(s.msgTotal, 0.026);
});

test('最后一个分组不满', () => {
  // 10000 bit 按 3000 切：3000、3000、3000、1000；1 Mb/s；2 段，不计传播
  //   第 1 段：0–3、3–6、6–9、9–10 ms；第 2 段：3–6、6–9、9–12、12–13 ms（最后一个要等前一个发完）
  const s = switching({ x: 10000, p: 3000, b: 1e6, k: 2 });
  assert.deepEqual(s.sizes, [3000, 3000, 3000, 1000]);
  near(s.pktTotal, 0.013);
  assert.equal(s.formula, null);
  assert.deepEqual(switching({ x: 100, p: 1, b: 1, k: 1 }).errors, ['n']);
});
