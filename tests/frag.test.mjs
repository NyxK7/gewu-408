// IP 分片：每片数据长度、片偏移、MF；DF；二次分片。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frag } from '../js/subjects/net/frag.js';

const view = (fs) => fs.map((f) => [f.total, f.field, f.MF]);

test('4000 字节的数据报经过 MTU 1500 的链路', () => {
  // 数据 3980；每片 ⌊1480 ÷ 8⌋ × 8 = 1480：1480 + 1480 + 1020
  // 总长 1500、1500、1040；偏移 0、1480/8 = 185、2960/8 = 370；MF 1、1、0
  const s = frag({ total: 4000, mtu: 1500 });
  assert.equal(s.per, 1480);
  assert.deepEqual(view(s.frags), [
    [1500, 0, 1],
    [1500, 185, 1],
    [1040, 370, 0],
  ]);
});

test('每片数据要是 8 的倍数', () => {
  // 总长 3820（数据 3800），MTU 1420：(1420 − 20) = 1400，正好是 8 的倍数 → 1400、1400、1000，偏移 0、175、350
  let s = frag({ total: 3820, mtu: 1420 });
  assert.deepEqual(view(s.frags), [
    [1420, 0, 1],
    [1420, 175, 1],
    [1020, 350, 0],
  ]);
  // MTU 1000：980 不是 8 的倍数，只能放 ⌊980 ÷ 8⌋ × 8 = 976
  s = frag({ total: 3820, mtu: 1000 });
  assert.equal(s.per, 976);
  assert.deepEqual(s.frags.map((f) => f.len), [976, 976, 976, 872]);
  assert.deepEqual(s.frags.map((f) => f.field), [0, 122, 244, 366]);
});

test('不用分片、DF = 1', () => {
  assert.equal(frag({ total: 1200, mtu: 1500 }).need, false);
  const s = frag({ total: 4000, mtu: 1500, df: true });
  assert.equal(s.dropped, true);
  assert.deepEqual(s.frags, []);
});

test('分片再经过更小的 MTU：偏移按原始数据算', () => {
  // 第一跳 MTU 1500 得到 1480、1480、1020；第二跳 MTU 576：每片 ⌊556 ÷ 8⌋ × 8 = 552
  //   第 1 片 1480 = 552 + 552 + 376：偏移 0、69、138，MF 都是 1（后面还有原来的第 2、3 片）
  //   第 3 片 1020 = 552 + 468：偏移 370、370 + 69 = 439，MF 1、0
  const s = frag({ total: 4000, mtu: 1500, mtu2: 576 });
  assert.deepEqual(view(s.second[0].pieces), [
    [572, 0, 1],
    [572, 69, 1],
    [396, 138, 1],
  ]);
  assert.deepEqual(view(s.second[2].pieces), [
    [572, 370, 1],
    [488, 439, 0],
  ]);
  // 参数检查
  assert.deepEqual(frag({ total: 10, mtu: 1500 }).errors, ['total']);
  assert.deepEqual(frag({ total: 100, hdr: 22, mtu: 1500 }).errors, ['hdr']);
});
