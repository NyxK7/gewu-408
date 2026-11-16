// 计算机网络：TCP 拥塞控制、子网划分的计算核对。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { simulate as cc } from '../js/subjects/net/cc.js';
import { simulate as subnet, toInt, toIp } from '../js/subjects/net/subnet.js';

const cw = (s) => s.rows.map((r) => r.cwnd);

test('拥塞控制：教材例（ssthresh 16，第 13 轮超时，第 22 轮 3 个重复确认）', () => {
  const s = cc({ ssthresh0: 16, rounds: 25, timeouts: [13], dup3: [22] });
  // 慢开始 1 2 4 8 16（到达门限），拥塞避免 17…24；第 13 轮 cwnd = 24 超时 → ssthresh = 12，cwnd = 1
  // 再慢开始 1 2 4 8，8×2 = 16 > 12 只增到 12，然后 13 14 15 16；第 22 轮 cwnd = 16 收到 3 个重复确认
  // → ssthresh = 8，快恢复 cwnd = 8，之后 9 10
  assert.deepEqual(cw(s), [1, 2, 4, 8, 16, 17, 18, 19, 20, 21, 22, 23, 24, 1, 2, 4, 8, 12, 13, 14, 15, 16, 8, 9, 10]);
  assert.equal(s.rows[13].ssthresh, 12);
  assert.equal(s.rows[22].ssthresh, 8);
  // Tahoe 没有快恢复：第 23 轮 cwnd = 1
  assert.equal(cc({ ssthresh0: 16, rounds: 25, timeouts: [13], dup3: [22], variant: 'tahoe' }).rows[22].cwnd, 1);
});

test('拥塞控制：超时后再经过 4 个 RTT 的窗口', () => {
  // cwnd = 16 时超时 → ssthresh = 8，cwnd = 1；接下来 4 轮 1 2 4 8 都成功，第 4 轮全部确认后 cwnd = 9
  const s = cc({ ssthresh0: 32, rounds: 10, timeouts: [5] });
  assert.equal(s.rows[4].cwnd, 16);
  assert.deepEqual(cw(s).slice(5, 9), [1, 2, 4, 8]);
  assert.equal(s.rows[8].next, 9);
});

test('拥塞控制：接收窗口限制发送窗口；奇数减半向下取整', () => {
  const s = cc({ ssthresh0: 64, rounds: 8, rwnd: 10 });
  assert.deepEqual(s.rows.map((r) => r.win), [1, 2, 4, 8, 10, 10, 10, 10]);
  // cwnd = 5 时超时：⌊5/2⌋ = 2
  const t = cc({ ssthresh0: 4, rounds: 6, timeouts: [4] });
  assert.deepEqual(cw(t), [1, 2, 4, 5, 1, 2]);
  assert.equal(t.rows[4].ssthresh, 2);
});

test('子网：192.168.1.130/26', () => {
  // 130 = 1000 0010，/26 掩码最后一字节 1100 0000 = 192 → 网络 1000 0000 = 128，广播 1011 1111 = 191
  const s = subnet({ ip: '192.168.1.130', prefix: 26 });
  assert.equal(toIp(s.mask), '255.255.255.192');
  assert.equal(toIp(s.net), '192.168.1.128');
  assert.equal(toIp(s.bcast), '192.168.1.191');
  assert.equal(toIp(s.first), '192.168.1.129');
  assert.equal(toIp(s.last), '192.168.1.190');
  assert.equal(s.hosts, 62);
  assert.equal(s.klass, 'C');
  assert.equal(s.private, true);
});

test('子网：172.16.45.14/20 跨字节', () => {
  // 第三字节 45 = 0010 1101，/20 只保留高 4 位 0010 → 32；广播把低 4 位置 1 → 0010 1111 = 47
  const s = subnet({ ip: '172.16.45.14', prefix: 20 });
  assert.equal(toIp(s.mask), '255.255.240.0');
  assert.equal(toIp(s.net), '172.16.32.0');
  assert.equal(toIp(s.bcast), '172.16.47.255');
  assert.equal(s.hosts, 4094);
  assert.equal(subnet({ ip: '10.1.2.3', prefix: 8 }).bcast, toInt('10.255.255.255'));
  assert.equal(subnet({ ip: '8.8.8.8', prefix: 32 }).hosts, 0);
});

test('子网：VLSM 192.168.10.0/24 需要 60、30、12、6 台主机', () => {
  // 60+2 → 64 (/26)，30+2 → 32 (/27)，12+2 → 16 (/28)，6+2 → 8 (/29)，从大到小依次分
  const s = subnet({ ip: '192.168.10.0', prefix: 24, needs: [12, 60, 6, 30] });
  assert.ok(s.ok);
  assert.deepEqual(s.subnets.map((x) => [x.need, x.prefix, toIp(x.net), toIp(x.bcast)]), [
    [60, 26, '192.168.10.0', '192.168.10.63'],
    [30, 27, '192.168.10.64', '192.168.10.95'],
    [12, 28, '192.168.10.96', '192.168.10.111'],
    [6, 29, '192.168.10.112', '192.168.10.119'],
  ]);
  assert.equal(s.free, 256 - 120);
  // /26 只有 64 个地址，60 + 30 放不下
  assert.equal(subnet({ ip: '192.168.10.0', prefix: 26, needs: [60, 30] }).ok, false);
});
