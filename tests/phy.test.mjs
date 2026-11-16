// 物理层：编码的电平序列、奈氏准则与香农公式。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode, limits } from '../js/subjects/net/phy.js';

const s = (a) => a.join('');

test('四种编码', () => {
  // 比特 0110，开始前电平为低
  const e = encode({ bits: '0110', init: 0 });
  // NRZ：0 低 1 高
  assert.equal(s(e.codes.nrz), '00111100');
  // NRZI：0 翻转、1 不变：0 → 翻成高；1 → 高；1 → 高；0 → 翻成低
  assert.equal(s(e.codes.nrzi), '11111100');
  // 曼彻斯特（0 上跳、1 下跳）：0 = 01，1 = 10
  assert.equal(s(e.codes.man), '01101001');
  // 差分曼彻斯特：开始前低。0：开始跳变 → 前半高，中间跳 → 后半低；
  //   1：开始不跳 → 前半低，后半高；1：不跳 → 前半高，后半低；0：跳 → 前半高，后半低
  assert.equal(s(e.codes.diff), '10011010');
  // 以太网约定的曼彻斯特正好相反
  assert.equal(s(encode({ bits: '0110', manchester: 'up1' }).codes.man), '10010110');
  assert.deepEqual(encode({ bits: '012' }).errors, ['bits']);
});

test('奈氏准则与香农公式', () => {
  // 3 kHz、16 种电平：奈氏 2 × 3000 × log2 16 = 24000 b/s；信噪比 30 dB = 1000：香农 3000 × log2 1001 ≈ 29902 b/s
  let r = limits({ W: 3000, V: 16, snr: 30 });
  assert.equal(r.nyq, 24000);
  assert.equal(r.ratio, 1000);
  assert.ok(Math.abs(r.shannon - 3000 * Math.log2(1001)) < 1e-9);
  assert.equal(r.by, 'nyq');
  assert.equal(r.max, 24000);
  // 4 kHz、信噪比 15（不是分贝）：香农 4000 × log2 16 = 16000；电平 256 时奈氏 64000，受香农限制
  r = limits({ W: 4000, V: 256, snr: 15, db: false });
  assert.equal(r.shannon, 16000);
  assert.equal(r.by, 'shannon');
  assert.deepEqual(limits({ W: 0, V: 1, snr: -1 }).errors, ['W', 'V', 'snr']);
});
