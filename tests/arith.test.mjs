// 数据的表示和运算：编码、补码加减、乘除、浮点加减、大小端与对齐。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addsub, divide, encodings, endian, floatAdd, multiply } from '../js/subjects/co/arith.js';

test('原码、反码、补码、移码', () => {
  const s = encodings({ x: -5, n: 8 });
  assert.deepEqual([s.sm, s.oc, s.two, s.ex], ['10000101', '11111010', '11111011', '01111011']);
  // −128 只有补码和移码能表示
  const t = encodings({ x: -128, n: 8 });
  assert.deepEqual([t.sm, t.oc, t.two, t.ex], [null, null, '10000000', '00000000']);
  assert.equal(encodings({ x: 5, n: 8 }).ex, '10000101');
});

test('补码加减与标志位', () => {
  // 100 + 50 = 150 超出 8 位范围：01100100 + 00110010 = 10010110（−106），OF = 1
  let s = addsub({ a: 100, b: 50, op: 'add', n: 8 });
  assert.deepEqual([s.R, s.signed, s.flags.OF, s.flags.CF, s.flags.SF], ['10010110', -106, 1, 0, 1]);
  assert.equal(s.double.s.slice(0, 2), '01'); // 双符号位 01：正溢出
  // 5 − 7：00000101 + 11111000 + 1 = 11111110（−2）；Cn = 0，CF = Cn ⊕ 1 = 1（无符号 5 < 7 有借位）
  s = addsub({ a: 5, b: 7, op: 'sub', n: 8 });
  assert.deepEqual([s.R, s.signed, s.flags.OF, s.flags.CF, s.flags.ZF], ['11111110', -2, 0, 1, 0]);
  // −100 − 50 = −150 负溢出：结果 01101010（106）
  s = addsub({ a: -100, b: 50, op: 'sub', n: 8 });
  assert.deepEqual([s.signed, s.flags.OF], [106, 1]);
  assert.equal(s.double.s.slice(0, 2), '10');
});

test('原码一位乘、Booth', () => {
  // 13 × 11 = 143，4 位：1101 × 1011
  let s = multiply({ x: 13, y: 11, n: 4, method: 'sm' });
  assert.equal(s.product, 143);
  assert.deepEqual(s.steps.map((x) => x.op), ['add', 'add', 'none', 'add']);
  s = multiply({ x: -13, y: 11, n: 4, method: 'sm' });
  assert.equal(s.product, -143);
  // Booth：y = 0101，附加位 0：依次 10 减、01 加、10 减、01 加
  s = multiply({ x: -3, y: 5, n: 4, method: 'booth' });
  assert.deepEqual(s.steps.map((x) => x.op), ['sub', 'add', 'sub', 'add']);
  assert.equal(s.product, -15);
  for (const [x, y] of [[-8, -8], [7, -8], [-8, 7], [0, 5], [6, 6]]) assert.equal(multiply({ x, y, n: 4, method: 'booth' }).product, x * y);
});

test('恢复余数法、加减交替法', () => {
  for (const method of ['restore', 'nonrestore']) {
    const s = divide({ x: 13, y: 4, n: 4, method });
    assert.deepEqual([s.q, s.r], [3, 1], method);
  }
  // 恢复余数：1101 ÷ 0100，前两步试减为负要恢复，后两步够减
  assert.deepEqual(divide({ x: 13, y: 4, n: 4 }).steps.map((x) => x.q), [0, 0, 1, 1]);
  for (let x = 0; x < 16; x++) for (let y = 1; y < 16; y++) {
    const s = divide({ x, y, n: 4, method: 'nonrestore' });
    assert.deepEqual([s.q, s.r], [Math.trunc(x / y), x % y]);
  }
});

test('浮点加减', () => {
  // 2^3 × 0.1101 + 2^1 × 0.1011：对阶右移 2 位 → 0.001011；和 0.111111；
  // 舍入时第一个舍掉的位是 1，进 1 → 1.0000，尾数溢出再右规 → 0.1000 × 2^4 = 8
  let s = floatAdd({ ex: 3, mx: '0.1101', ey: 1, my: '0.1011', e: 4, m: 4 });
  assert.equal(s.value, 8);
  assert.deepEqual([s.E, s.Mstr], [4, '0.1000']);
  // 2^2 × 0.1010 − 2^2 × 0.1001 = 2^2 × 0.0001 → 左规 3 次 → 0.1000 × 2^−1 = 0.25
  s = floatAdd({ ex: 2, mx: '0.1010', ey: 2, my: '0.1001', op: 'sub', e: 4, m: 4 });
  assert.equal(s.value, 0.25);
  assert.equal(s.E, -1);
  assert.equal(s.steps.find((x) => x.kind === 'norm').how, 'left3');
  // 阶码溢出：4 位补码最大 7
  s = floatAdd({ ex: 7, mx: '0.1100', ey: 7, my: '0.1100', e: 4, m: 4 });
  assert.equal(s.over, 'up');
});

test('大小端与对齐', () => {
  const s = endian({ value: '12345678', addr: '100', width: 4, struct: 'char a; int b; short c' });
  assert.deepEqual(s.little.map((x) => x.b), ['78', '56', '34', '12']);
  assert.deepEqual(s.big.map((x) => x.b), ['12', '34', '56', '78']);
  assert.deepEqual(s.lay.rows.map((r) => r.offset), [0, 4, 8]);
  assert.equal(s.lay.total, 12);
  assert.equal(s.best.total, 8);
  assert.equal(endian({ value: '1', addr: '0', width: 4, struct: 'double d; char c' }).lay.total, 16);
});
