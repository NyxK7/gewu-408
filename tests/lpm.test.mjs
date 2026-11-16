// 最长前缀匹配：每个目的地址匹配哪几行、选哪一行。期望值手算（看第三个字节的二进制）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lpm } from '../js/subjects/net/lpm.js';

const TABLE = `172.16.0.0/16 接口0
172.16.128.0/17 接口1
172.16.160.0/19 R2
172.16.168.0/21 R3
0.0.0.0/0 R4`;

test('最长前缀匹配', () => {
  const s = lpm({ table: TABLE, dests: '172.16.170.5 172.16.150.1 172.16.33.7 10.0.0.1' });
  assert.equal(s.ok, true);
  // 170 = 1010 1010：/17 要求 1xxxxxxx ✓，/19 要求 101xxxxx（160～191）✓，/21 要求 10101xxx（168～175）✓ → 最长 /21 → R3
  assert.deepEqual([s.dests[0].hits, s.dests[0].hop], [[0, 1, 2, 3, 4], 'R3']);
  // 150 = 1001 0110：/17 ✓，/19 ✗（100 ≠ 101）→ 最长 /17 → 接口1
  assert.deepEqual([s.dests[1].hits, s.dests[1].hop], [[0, 1, 4], '接口1']);
  // 33 = 0010 0001：只有 /16 和默认路由 → 接口0
  assert.deepEqual([s.dests[2].hits, s.dests[2].hop], [[0, 4], '接口0']);
  // 10.0.0.1：只有默认路由
  assert.deepEqual([s.dests[3].hits, s.dests[3].hop], [[4], 'R4']);
  // 比对：170 和 172.16.160.0 从高位起前 20 位相同（第三字节 10101010 vs 10100000，第 21 位起不同），截到前缀长度 19
  assert.equal(s.dests[0].checks[2].same, 19);
});

test('没有默认路由时丢弃；参数检查', () => {
  const s = lpm({ table: '192.168.1.0/24 接口0', dests: '192.168.2.1' });
  assert.equal(s.dests[0].best, null);
  assert.deepEqual(lpm({ table: '192.168.1.5/24 接口0', dests: '1.1.1.1' }).errors, [['hostBits', { r: '192.168.1.5/24 接口0' }]]);
  assert.deepEqual(lpm({ table: '192.168.1.0/24 接口0', dests: '300.1.1.1' }).errors, [['dest', { d: '300.1.1.1' }]]);
});
