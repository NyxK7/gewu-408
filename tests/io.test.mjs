// I/O 管理：控制方式的 CPU 占比、单 / 双缓冲的时间线。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buffer, ctrl } from '../js/subjects/os/io.js';

test('I/O 控制方式：CPU 占比', () => {
  // 外设 2MB/s，按字（4B）传输，每次中断 0.5μs：每秒 2^21 / 4 = 524288 次，占比 524288 × 0.5μs = 0.262144 s = 26.2144%
  // DMA 每块 4KB，每次 5μs：每秒 2^21 / 4096 = 512 次，占比 512 × 5μs = 0.00256 = 0.256%
  const s = ctrl({ rate: 2 ** 21, word: 4, block: 4096, tInt: 0.5e-6, tDma: 5e-6 });
  assert.equal(s.intPerSec, 524288);
  assert.equal(s.intShare, 0.262144);
  assert.equal(s.dmaPerSec, 512);
  assert.equal(s.dmaShare, 0.00256);
  assert.equal(ctrl({ rate: 1, word: 4, block: 2, tInt: 1, tDma: 1 }).ok, false);
});

test('单缓冲：T = 100，M = 50，C = 50', () => {
  // 第 1 块：输入 0–100，传送 100–150，处理 150–200
  // 第 2 块：缓冲区在 150 空出 → 输入 150–250，传送 250–300（用户区 200 已空），处理 300–350
  // 每块平均 max(C, T) + M = 100 + 50 = 150；3 块：第 3 块输入 300–400，传送 400–450，处理 450–500
  const s = buffer({ mode: 'single', n: 3, T: 100, M: 50, C: 50 });
  assert.deepEqual(s.blocks.map((b) => [b.inStart, b.mvStart, b.cEnd]), [[0, 100, 200], [150, 250, 350], [300, 400, 500]]);
  assert.equal(s.per, 150);
  assert.equal(s.total, 500);
});

test('双缓冲：T = 100，M = 50，C = 50', () => {
  // 第 1 块：缓冲区 0 输入 0–100，传送 100–150，处理 150–200
  // 第 2 块：缓冲区 1 输入 100–200，传送 200–250，处理 250–300
  // 第 3 块：缓冲区 0（第 1 块已在 150 传走）输入 200–300，传送 300–350，处理 350–400
  // C + M = 100 ≤ T，每块平均 T = 100
  const s = buffer({ mode: 'double', n: 3, T: 100, M: 50, C: 50 });
  assert.deepEqual(s.blocks.map((b) => [b.inStart, b.mvStart, b.cEnd, b.buf]), [[0, 100, 200, 0], [100, 200, 300, 1], [200, 300, 400, 0]]);
  assert.equal(s.per, 100);
  assert.equal(s.total, 400);
  // CPU 慢：C = 120 时双缓冲每块 C + M = 170
  // 第 2 块传送要等第 1 块处理完（150 + 120 = 270），处理 320–440；第 3 块缓冲区 0 在 150 空出、设备在 200 空闲 → 输入 200–300，传送等到 440
  const t = buffer({ mode: 'double', n: 3, T: 100, M: 50, C: 120 });
  assert.equal(t.per, 170);
  assert.deepEqual(t.blocks.map((b) => [b.mvStart, b.cEnd]), [[100, 270], [270, 440], [440, 610]]);
});
