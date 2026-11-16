// CSMA/CD：争用期、最短帧长、碰撞时刻、二进制指数退避。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csma } from '../js/subjects/net/csma.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≈ ${b}`);

test('争用期与最短帧长', () => {
  // 1 km，2×10^8 m/s：τ = 1000 / 2e8 = 5 μs，争用期 10 μs；10 Mb/s 时最短帧长 = 10 μs × 10^7 = 100 bit → 13 字节
  const s = csma({ L: 1000, R: 1e7, d: 1000, tB: 3e-6, frame: 64 });
  near(s.tau, 5e-6);
  near(s.slot, 10e-6);
  assert.equal(s.minBits, 100);
  assert.equal(s.minBytes, 13);
  // 经典以太网：10 Mb/s、争用期 51.2 μs → 512 bit = 64 字节（总线长 = 25.6 μs × 2e8 = 5120 m）
  const e = csma({ L: 5120, R: 1e7, d: 5120, tB: 0, frame: 64 });
  assert.equal(e.minBits, 512);
  assert.equal(e.minBytes, 64);
});

test('碰撞的时刻和位置', () => {
  // A 在 0 时刻发，B 在 3 μs 发；A 的信号 5 μs 到 B。相遇：t = (5 + 3) / 2 = 4 μs，离 A 2e8 × 4e-6 = 800 m
  const s = csma({ L: 1000, R: 1e7, d: 1000, tB: 3e-6, frame: 64 });
  assert.equal(s.collide, true);
  near(s.tm, 4e-6);
  near(s.xm, 800);
  // B 在 5 μs 检测到，A 在 3 + 5 = 8 μs 检测到；A 已发 8 μs × 10 Mb/s = 80 bit，B 已发 (5 − 3) × 10 = 20 bit
  near(s.bDetect, 5e-6);
  near(s.aDetect, 8e-6);
  assert.equal(s.aBits, 80);
  assert.equal(s.bBits, 20);
  // 64 字节要发 51.2 μs，8 μs 时还没发完，能检测到
  assert.equal(s.hidden, false);
});

test('帧太短：A 发完了才碰撞，A 发现不了', () => {
  // 2 km、100 Mb/s：τ = 10 μs，最短帧长 = 20 μs × 10^8 = 2000 bit = 250 字节
  // 64 字节只要 5.12 μs 就发完；B 在 9 μs 发，A 在 9 + 10 = 19 μs 才会检测到
  const s = csma({ L: 2000, R: 1e8, d: 2000, tB: 9e-6, frame: 64 });
  assert.equal(s.minBytes, 250);
  assert.equal(s.hidden, true);
  assert.equal(s.aBits, 512);
});

test('B 听到信道忙就不发', () => {
  // A 的信号 5 μs 到 B；B 在 6 μs 想发，信道忙。A 的帧 51.2 μs 发完，帧尾 51.2 + 5 = 56.2 μs 经过 B
  const s = csma({ L: 1000, R: 1e7, d: 1000, tB: 6e-6, frame: 64 });
  assert.equal(s.collide, false);
  near(s.bStart, 56.2e-6);
});

test('二进制指数退避', () => {
  const p = { L: 1000, R: 1e7, d: 1000, tB: 3e-6, frame: 64 };
  // 第 1 次碰撞后 r ∈ {0, 1}：都取 1 → 再碰；第 2 次 r ∈ {0..3}：A 取 2、B 取 0 → B 先重传，等 0 个争用期
  let s = csma({ ...p, rA: [1, 2], rB: [1, 0] });
  assert.deepEqual(
    s.rounds.map((r) => [r.k, r.max, r.again ?? false, r.winner ?? null]),
    [
      [1, 1, true, null],
      [2, 3, false, 'B'],
    ],
  );
  // 第 1 次就不同：A 取 0、B 取 1 → A 先
  s = csma({ ...p, rA: [0], rB: [1] });
  assert.equal(s.rounds[0].winner, 'A');
  // 超出范围
  assert.deepEqual(csma({ ...p, rA: [2], rB: [0] }).errors, [['rRange', { k: 1, max: 1 }]]);
  // 随机数给少了
  assert.equal(csma({ ...p, rA: [1], rB: [1] }).rounds.at(-1).missing, true);
  // 第 10 次以后范围不再扩大：0 ～ 1023；一直相同，第 16 次后放弃
  const same = Array.from({ length: 16 }, () => 0);
  s = csma({ ...p, rA: same, rB: same });
  assert.equal(s.rounds[9].max, 1023);
  assert.equal(s.rounds[10].max, 1023);
  assert.equal(s.rounds.at(-1).giveUp, true);
  assert.equal(s.rounds.length, 17);
});
