// CRC：模 2 除法的商、余数和接收方检验。期望值手算；另用整数位运算独立算一遍对照。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc, toStr } from '../js/subjects/net/crc.js';

/** 独立实现：把比特串当成整数，按多项式模 2 求余 */
function polyMod(numStr, genStr) {
  let a = BigInt('0b' + numStr);
  const g = BigInt('0b' + genStr);
  const gl = genStr.length;
  for (let i = numStr.length - 1; i >= gl - 1; i--) if ((a >> BigInt(i)) & 1n) a ^= g << BigInt(i - gl + 1);
  return a.toString(2).padStart(gl - 1, '0');
}

test('教材例子：101001 ÷ 1101', () => {
  // 101001000 ÷ 1101：
  //   第 0 位 1：1010 ⊕ 1101 = 0111 → 011101000
  //   第 1 位 1：1110 ⊕ 1101 = 0011 → 000111000
  //   第 2 位 0：商 0
  //   第 3 位 1：1110 ⊕ 1101 = 0011 → 000001100
  //   第 4 位 0：商 0
  //   第 5 位 1：1100 ⊕ 1101 = 0001 → 000000001
  // 商 110101，余数 001，发送 101001001
  const s = crc({ data: '101001', gen: '1101' });
  assert.equal(s.r, 3);
  assert.equal(toStr(s.q), '110101');
  assert.equal(toStr(s.rem), '001');
  assert.equal(toStr(s.frame), '101001001');
  assert.deepEqual(s.xors.map((x) => x.pos), [0, 1, 3, 5]);
  assert.equal(toStr(s.xors[0].snap), '011101000');
  assert.equal(s.accepted, true);
});

test('和独立实现对照', () => {
  for (const [d, g] of [['1101011011', '10011'], ['11100110', '1001'], ['1', '11'], ['100100', '1101'], ['111111111111', '100000111']]) {
    const s = crc({ data: d, gen: g });
    assert.equal(toStr(s.rem), polyMod(d + '0'.repeat(g.length - 1), g), `${d} / ${g}`);
    // 发送的整串一定能被整除
    assert.equal(polyMod(toStr(s.frame), g), '0'.repeat(g.length - 1));
  }
});

test('接收方：出错能检测，错误模式是生成多项式的倍数时检测不出', () => {
  // 第 2 位翻转：101001001 → 100001001，余数不为 0
  let s = crc({ data: '101001', gen: '1101', flips: [2] });
  assert.equal(toStr(s.recvBits), '100001001');
  assert.equal(s.accepted, false);
  // 第 0～3 位分别按 1101 翻转（错误模式 = 生成多项式本身）：0,1,3 三位翻转 → 余数 0，漏检
  s = crc({ data: '101001', gen: '1101', flips: [0, 1, 3] });
  assert.equal(s.accepted, true);
  assert.equal(s.missed, true);
  // 参数检查
  assert.deepEqual(crc({ data: '1012', gen: '1101' }).errors, ['data']);
  assert.deepEqual(crc({ data: '101', gen: '0101' }).errors, ['gen']);
  assert.deepEqual(crc({ data: '101', gen: '11', flips: [9] }).errors, [['flip', { f: 9, max: 3 }]]);
});
