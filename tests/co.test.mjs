// 计算机组成：IEEE 754、流水线数据冒险的计算核对。期望值为手算结果，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decode, encode, hexOf } from '../js/subjects/co/fp.js';
import { simulate as pipe } from '../js/subjects/co/pipe.js';

const h32 = (s) => hexOf(encode(s, 32).bits, 32);

test('IEEE 754 单精度：手算的几个数', () => {
  // -8.25 = -1000.01₂ = -1.00001 × 2^3 → S=1，E=3+127=130=1000 0010，M=0000 1000…
  // 1 10000010 00001000000000000000000 = 1100 0001 0000 0100 0… = 0xC1040000
  assert.equal(h32('-8.25'), '0xC1040000');
  // 0.75 = 0.11₂ = 1.1 × 2^-1 → E = 126 = 0111 1110 → 0 01111110 1000… = 0x3F400000
  assert.equal(h32('0.75'), '0x3F400000');
  assert.equal(h32('-0.75'), '0xBF400000');
  // 100.25 = 1100100.01₂ = 1.10010001 × 2^6 → E = 133 = 1000 0101 → 0x42C88000
  assert.equal(h32('100.25'), '0x42C88000');
  assert.equal(h32('1'), '0x3F800000');
  assert.equal(h32('0'), '0x00000000');
  assert.equal(h32('-0'), '0x80000000');
  // 0.1 是无限循环小数 0.000110011…，第 24 位之后是 1100…，大于一半，向上舍入 → …CCCD
  const t = encode('0.1', 32);
  assert.equal(hexOf(t.bits, 32), '0x3DCCCCCD');
  assert.equal(t.exact, false);
  assert.equal(t.round, 'up');
});

test('IEEE 754：非规格化、上溢、特殊值、双精度', () => {
  // 最小的非规格化数是 2^-149 ≈ 1.401e-45；1e-45 离它比离 0 近 → 0x00000001
  assert.equal(h32('1e-45'), '0x00000001');
  assert.equal(encode('1e-45', 32).kind, 'subnormal');
  // 单精度最大有限值 (2 − 2^-23) × 2^127 ≈ 3.4028235e38
  assert.equal(h32('3.4028235e38'), '0x7F7FFFFF');
  assert.equal(encode('3.5e38', 32).kind, 'overflow');
  assert.equal(h32('3.5e38'), '0x7F800000');
  assert.equal(h32('-inf'), '0xFF800000');
  assert.equal(h32('nan'), '0x7FC00000');
  assert.equal(hexOf(encode('0.1', 64).bits, 64), '0x3FB999999999999A');
  assert.equal(hexOf(encode('-8.25', 64).bits, 64), '0xC020800000000000');
});

test('IEEE 754：和 JS 的 DataView 对照（双精度的十进制解析本身就是正确舍入的）', () => {
  const dv = new DataView(new ArrayBuffer(8));
  for (const s of ['3.14159', '1e300', '2.5e-310', '123456789.125', '-0.0001', '6.02214076e23', '5e-324']) {
    dv.setFloat64(0, Number(s));
    assert.equal(hexOf(encode(s, 64).bits, 64), '0x' + dv.getBigUint64(0).toString(16).toUpperCase().padStart(16, '0'), s);
  }
  // 单精度：整数和二进制有限小数不会有双重舍入问题，可以直接和 Math.fround 对照
  for (const s of ['16777217', '0.375', '-1234.5', '1048576.25', '3']) {
    dv.setFloat32(0, Math.fround(Number(s)));
    assert.equal(h32(s), '0x' + dv.getUint32(0).toString(16).toUpperCase().padStart(8, '0'), s);
  }
});

test('IEEE 754：位模式 → 数值', () => {
  const d = decode('C1040000', 32);
  assert.equal(d.exactStr, '-8.25');
  assert.equal(d.e, 3);
  assert.equal(decode('0x3DCCCCCD').exactStr, '0.100000001490116119384765625');
  assert.equal(decode('7FC00000').kind, 'nan');
  assert.equal(decode('FF800000').kind, 'inf');
  assert.equal(decode('00000001').kind, 'subnormal');
  assert.equal(decode('00000001').exactStr.slice(0, 20), '0.000000000000000000');
});

test('流水线：相邻 RAW，有无转发、寄存器堆是否分前后半周期', () => {
  const P = 'add r1, r2, r3; sub r4, r1, r5';
  // 无转发、前写后读：I1 的 WB 在第 5 拍，I2 的 ID 最早在第 5 拍读到 → 原本第 3 拍，阻塞 2 拍，共 8 拍
  let s = pipe({ prog: P });
  assert.deepEqual([s.rows[1].id, s.rows[1].stall, s.total], [5, 2, 8]);
  // 不分前后半周期：要等到第 6 拍 → 阻塞 3 拍，共 9 拍
  s = pipe({ prog: P, splitRF: false });
  assert.deepEqual([s.rows[1].stall, s.total], [3, 9]);
  // 有转发：EX→EX 旁路，不阻塞，共 6 拍
  s = pipe({ prog: P, forward: true });
  assert.deepEqual([s.rows[1].stall, s.total, s.rows[1].fwd.length], [0, 6, 1]);
});

test('流水线：load-use 必须阻塞 1 拍；阻塞会把后面的指令挡在 IF', () => {
  // lw 的数据在 MEM（第 4 拍）末才有，下一条的 EX 最早第 5 拍 → 阻塞 1 拍，共 7 拍
  const s = pipe({ prog: 'lw r1, 0(r2); add r3, r1, r4', forward: true });
  assert.deepEqual([s.rows[1].stall, s.total], [1, 7]);
  // 无转发：I2 在 3、4 拍阻塞（第 5 拍 ID），I3 第 3 拍取指、4 5 拍停在 IF、第 6 拍 ID，I3 本身不再阻塞
  const t = pipe({ prog: 'add r1, r2, r3; sub r4, r1, r5; and r6, r1, r7' });
  assert.deepEqual(t.rows.map((r) => [r.fetch, r.id, r.wb, r.stall]), [[1, 2, 5, 0], [2, 5, 8, 2], [3, 6, 9, 0]]);
  assert.deepEqual(t.cells[2], { 3: 'IF', 4: 'hold', 5: 'hold', 6: 'ID', 7: 'EX', 8: 'MEM', 9: 'WB' });
  // 没有相关的指令：5 条指令共 5 + 4 = 9 拍
  assert.equal(pipe({ prog: 'add r1,r2,r3; add r4,r5,r6; add r7,r8,r9; sub r10,r11,r12; or r13,r14,r15' }).total, 9);
  assert.equal(pipe({ prog: 'add r1, r2' }).ok, false);
});
