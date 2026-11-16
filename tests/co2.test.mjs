// 计组其余各章：性能、海明码、存储器、指令系统、CPU、总线与 I/O。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { busArb, dma, interrupts } from '../js/subjects/co/bus.js';
import { branch, datapath, microword, pipePerf } from '../js/subjects/co/cpu.js';
import { addressing, cmpJump, opcode } from '../js/subjects/co/isa.js';
import { cacheAddr, cacheWrite, interleave, memExt } from '../js/subjects/co/memory.js';
import { hamming, perf } from '../js/subjects/co/perf.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('CPU 性能', () => {
  // CPI = 0.5×1 + 0.3×2 + 0.2×4 = 1.9；10 亿条、2 GHz：1000 × 1.9 / 2000 = 0.95 s
  const s = perf({ mix: [50, 30, 20], cpiA: [1, 2, 4], cpiB: [1, 1, 3], fA: 2000, fB: 1500, n: 1000 });
  near(s.A.CPI, 1.9);
  near(s.A.time, 0.95);
  near(s.A.mips, 2000 / 1.9);
  // B：0.5 + 0.3 + 0.6 = 1.4；1000 × 1.4 / 1500 = 0.9333 s，B 快
  near(s.B.CPI, 1.4);
  assert.equal(s.faster, 'B');
});

test('海明码', () => {
  // 1010：位置 3 5 6 7 放数据 1 0 1 0；P1 = 1⊕0⊕0 = 1，P2 = 1⊕1⊕0 = 0，P4 = 0⊕1⊕0 = 1
  const s = hamming({ data: '1010', flip: 6 });
  assert.deepEqual([s.k, s.code.join('')], [3, '1011010']);
  // 第 6 位出错：S1 = 0，S2 = 1，S4 = 1 → 110 = 6
  assert.equal(s.pos, 6);
  assert.equal(hamming({ data: '1010' }).pos, 0);
  assert.equal(hamming({ data: '11010110' }).k, 4); // 8 位数据：2^4 ≥ 8 + 4 + 1
});

test('存储器', () => {
  const m = memExt({ chipK: 1, chipBits: 4, memK: 4, memBits: 8, base: 0 });
  assert.deepEqual([m.chips, m.chipAddr, m.totalAddr, m.sel], [8, 10, 12, 2]);
  assert.deepEqual([m.groups[2].start, m.groups[2].end], [0x800, 0xbff]);
  const c = cacheAddr({ addrBits: 32, cacheKB: 16, blockB: 64, ways: 4, wb: true, lru: true, addr: '12345678' });
  assert.deepEqual([c.lines, c.sets, c.offset, c.index, c.tag, c.perLine, c.total], [256, 64, 6, 6, 20, 24, 256 * 536]);
  assert.deepEqual([c.tagVal, c.set, c.off], [0x12345, 25, 56]);
  let w = cacheWrite({ lines: 2, ops: 'R0 W0 W2 R0 W1 R3', policy: 'wb' });
  assert.deepEqual([w.reads, w.writes], [5, 3]);
  w = cacheWrite({ lines: 2, ops: 'R0 W0 W2 R0 W1 R3', policy: 'wt' });
  assert.deepEqual([w.reads, w.writes], [2, 3]);
  // 低位交叉 4 体 T = 200：连续 8 个字 200 + 7 × 50 = 550
  assert.equal(interleave({ m: 4, T: 200, addrs: [0, 1, 2, 3, 4, 5, 6, 7], mode: 'low' }).total, 550);
  // 高位交叉：连续地址都在同一个体，8 × 200 = 1600
  assert.equal(interleave({ m: 4, T: 200, addrs: [0, 1, 2, 3, 4, 5, 6, 7], mode: 'high', bankWords: 16 }).total, 1600);
  // 低位交叉 0 4 1：0、4 同在 0 号体，第二次要等到 200
  assert.deepEqual(interleave({ m: 4, T: 200, addrs: [0, 4, 1], mode: 'low' }).acc.map((x) => x.start), [0, 200, 250]);
});

test('指令系统', () => {
  const o = opcode({ L: 16, A: 4, counts: [15, 15, 15, 16] });
  assert.deepEqual(o.levels.map((l) => [l.w, l.first, l.last]), [[4, 0, 14], [8, 240, 254], [12, 4080, 4094], [16, 65520, 65535]]);
  assert.equal(opcode({ L: 16, A: 4, counts: [16, 1, 0, 0] }).ok, false);
  const a = addressing({ A: 200, R: 300, PC: 100, BR: 300, IX: 100, mem: '200:300 300:400 500:600' });
  assert.deepEqual(a.modes.map((m) => m.val), [200, 300, 400, 300, 400, 400, 600, 400]);
  const j = cmpJump({ a: -1, b: 1, n: 8, ip: '4005A0', len: 2, disp: 'F0' });
  const take = Object.fromEntries(j.conds.map((c) => [c.op, c.take]));
  assert.deepEqual([take.jl, take.ja, take.jb, take.jg], [true, true, false, false]);
  assert.equal(j.target, 0x400592);
});

test('CPU', () => {
  const d = datapath({ instr: 'addmem', PC: 100, R0: 5, R1: 300, A: 0, mem: { 300: 7 } });
  assert.equal(d.steps.at(-1).reg.R0, 12);
  assert.equal(d.steps.at(-1).reg.PC, 101);
  assert.equal(datapath({ instr: 'jmp', PC: 100, R0: 0, R1: 0, A: 20, mem: {} }).steps.at(-1).reg.PC, 121);
  assert.equal(datapath({ instr: 'store', PC: 100, R0: 9, R1: 0, A: 50, mem: {} }).steps.at(-1).mem[50], 9);
  const m = microword({ groups: [3, 7, 5, 12], words: 512, conds: 3 });
  assert.deepEqual([m.ctrl, m.condBits, m.addrBits, m.total, m.direct], [12, 2, 9, 23, 27]);
  const p = pipePerf({ stages: [100, 100, 100, 100], latch: 0, n: 10 });
  assert.deepEqual([p.clock, p.total], [100, 1300]);
  near(p.speedup, 4000 / 1300);
  near(p.eff, 4000 / 5200);
  assert.equal(pipePerf({ stages: [60, 100, 80, 70], latch: 10, n: 5 }).clock, 110);
  assert.equal(branch({ n: 6, b: 2, taken: true, r: 3, strategy: 'stall' }).total, 12);
  assert.equal(branch({ n: 6, b: 2, taken: true, r: 3, strategy: 'predict' }).total, 12);
  assert.equal(branch({ n: 6, b: 2, taken: false, r: 3, strategy: 'predict' }).total, 10);
});

test('总线与 I/O', () => {
  // 32 位、100 MHz、2 个时钟周期传一次：4 B × 100M / 2 = 200 MB/s
  const b = busArb({ width: 32, freq: 100, cycles: 2, n: 8, req: [5, 2, 6], last: 2 });
  assert.deepEqual([b.bw, b.chain, b.after, b.lines.counter], [200, 2, 5, 5]);
  // 响应 A>B>C>D，处理 A>D>C>B：B0 D1 A2，各 3 个单位
  const s = interrupts({ devs: 'A B C D', handle: 'A D C B', arrivals: 'B0 D1 A2', dur: 3 });
  assert.deepEqual(s.mask.B, [0, 1, 0, 0]);
  assert.deepEqual(s.mask.D, [0, 1, 1, 1]);
  assert.deepEqual(s.segs.map((x) => `${x.who}${x.start}-${x.end}`), ['B0-1', 'D1-2', 'A2-5', 'D5-7', 'B7-9']);
  const d = dma({ k: 4, interval: 3 });
  assert.deepEqual([d.lost.stop, d.lost.steal], [10, 4]);
});
