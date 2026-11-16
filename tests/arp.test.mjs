// ARP：本网络 / 外网的判断、缓存命中、广播请求。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arp } from '../js/subjects/net/arp.js';

const NET = {
  me: { ip: '192.168.1.10', mac: 'AA' },
  prefix: 24,
  gateway: '192.168.1.1',
  hosts: [
    { name: 'B', ip: '192.168.1.20', mac: 'BB' },
    { name: 'R', ip: '192.168.1.1', mac: 'RR' },
  ],
};

test('本网络解析目的主机，外网解析网关；第二次命中缓存', () => {
  const s = arp({ ...NET, sends: ['192.168.1.20', '8.8.8.8', '192.168.1.20', '10.0.0.5'] });
  // 192.168.1.20 与 192.168.1.10 前 24 位相同 → 本网络，解析 B，缓存没有 → 广播
  assert.deepEqual([s.steps[0].local, s.steps[0].target, s.steps[0].hit, s.steps[0].mac], [true, '192.168.1.20', false, 'BB']);
  // 8.8.8.8 不在本网络 → 解析网关 192.168.1.1 的 MAC
  assert.deepEqual([s.steps[1].local, s.steps[1].target, s.steps[1].hit, s.steps[1].mac], [false, '192.168.1.1', false, 'RR']);
  // 再发给 B：缓存已有
  assert.equal(s.steps[2].hit, true);
  // 另一个外网地址：网关的 MAC 已经在缓存里
  assert.deepEqual([s.steps[3].target, s.steps[3].hit], ['192.168.1.1', true]);
  assert.equal(s.steps[3].cache.length, 2);
});

test('掩码决定是不是本网络；没人回应', () => {
  // /16 时 192.168.5.7 也算本网络，但没有这台主机 → 请求得不到响应
  const s = arp({ ...NET, prefix: 16, sends: ['192.168.5.7'] });
  assert.deepEqual([s.steps[0].local, s.steps[0].found], [true, false]);
  assert.deepEqual(arp({ ...NET, gateway: '10.0.0.1', sends: [] }).errors, ['gwNet']);
});
