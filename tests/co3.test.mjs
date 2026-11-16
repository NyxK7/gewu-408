// 计算机组成第三批：整数类型转换、if 与循环的机器级表示、过程调用与栈帧、固态硬盘、总线事务与定时。
import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonById } from '../js/catalog.js';
import { TYPES, cast, hexOf, rangeOf } from '../js/subjects/co/cast.js';

test('整数类型转换：符号扩展、零扩展、截断、同宽换解释（手算）', () => {
  const c = (from, to, value) => cast({ from, to, value });
  assert.equal(c('short', 'uint', -1).result, 4294967295);
  assert.equal(hexOf(c('short', 'uint', -1).dst), '0xFFFFFFFF');
  assert.equal(c('ushort', 'int', 65535).result, 65535);
  assert.equal(c('int', 'short', 32768).result, -32768);
  assert.equal(c('int', 'char', -129).result, 127); // 0xFFFFFF7F → 0x7F
  assert.equal(c('short', 'ushort', -12345).result, 53191);
  assert.equal(c('char', 'int', -128).result, -128);
  assert.equal(c('uchar', 'int', 200).result, 200);
  assert.equal(c('char', 'uchar', -1).result, 255);
  // 和 JS 的定长数组对照：随机值在各类型之间转换
  const arr = { char: Int8Array, uchar: Uint8Array, short: Int16Array, ushort: Uint16Array, int: Int32Array, uint: Uint32Array };
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let t = 0; t < 3000; t++) {
    const ks = Object.keys(TYPES);
    const from = ks[Math.floor(rnd() * ks.length)];
    const to = ks[Math.floor(rnd() * ks.length)];
    const [lo, hi] = rangeOf(TYPES[from]);
    const v = lo + Math.floor(rnd() * (hi - lo + 1));
    // 先扩成 32 位（按原类型的符号），再放进目标类型的数组，等价于 C 的转换
    const wide = new Int32Array([v])[0];
    const want = new arr[to]([wide])[0];
    assert.equal(cast({ from, to, value: v }).result, want, `${from} ${v} → ${to}`);
  }
  assert.equal(c('char', 'int', 300).ok, false);
  assert.deepEqual(lessonById('int-cast').errors ?? [], []);
});

import { runCtrl } from '../js/subjects/co/ctrl.js';

test('if 与循环：结果、执行条数（手数）、转移偏移量', () => {
  const r = (p) => runCtrl(p);
  assert.equal(r({ prog: 'ifelse', a: 7, b: 3 }).result, 7);
  assert.equal(r({ prog: 'ifelse', a: -5, b: 2 }).result, 2);
  assert.equal(r({ prog: 'ifelse', a: 4, b: 4 }).result, 4);
  // if 成立：mov mov cmp jle mov jmp mov ret = 8 条；不成立：mov mov cmp jle mov mov ret = 7 条
  assert.equal(r({ prog: 'ifelse', a: 7, b: 3 }).count, 8);
  assert.equal(r({ prog: 'ifelse', a: -5, b: 2 }).count, 7);
  for (let n = -2; n <= 8; n++) {
    const s = n >= 1 ? (n * (n + 1)) / 2 : 0;
    const w = r({ prog: 'while', n });
    assert.equal(w.result, s);
    // 3 条 mov + jmp + 每次循环 4 条 + 最后一次测试 2 条 + ret
    assert.equal(w.count, 4 + 4 * Math.max(0, n) + 3);
    const d = r({ prog: 'dowhile', n });
    assert.equal(d.result, n >= 1 ? s : 1); // do-while 至少执行一次
  }
  const w = r({ prog: 'while', n: 3 });
  const jle = w.code.find((c) => c.op === 'jle');
  assert.equal(jle.disp, -7);
  assert.equal(jle.bytes, '7E F9');
  assert.equal(jle.target, jle.addr + 2 + jle.disp);
  assert.deepEqual(lessonById('ctrl-asm').errors ?? [], []);
});

import { frame } from '../js/subjects/co/frame.js';

test('过程调用与栈帧：参数位置、返回地址、栈帧恢复、被调用者保存 ebx', () => {
  for (const saveEbx of [false, true]) {
    const r = frame({ a: 3, b: 5, saveEbx });
    assert.equal(r.result, 8);
    const callStep = r.steps.find((s) => s.ins.k === 'call');
    assert.equal(callStep.regs.esp, 0xfe4);
    assert.equal(callStep.mem[0xfe4].v, r.retAddr); // 返回地址 = call 的下一条
    assert.equal(r.retAddr, callStep.ins.addr + 5);
    // add 建好栈帧后：[ebp+8] 是 x，[ebp+12] 是 y，[ebp+4] 是返回地址，[ebp] 是 caller 的 ebp
    const s = r.steps.find((x) => x.ins.fn === 'add' && x.ins.k === 'mov ebp, esp');
    const ebp = s.regs.ebp;
    assert.equal(s.mem[ebp + 8].v, 3);
    assert.equal(s.mem[ebp + 12].v, 5);
    assert.equal(s.mem[ebp + 4].v, r.retAddr);
    assert.equal(s.mem[ebp].v, 0xffc);
    const last = r.steps.at(-1).regs;
    assert.equal(last.esp, 0x1004);
    assert.equal(last.ebp, 0x1018);
    assert.equal(last.ebx, 0x77);
  }
  assert.equal(frame({ a: -20, b: 7 }).result, -13);
  assert.equal(frame({ a: 1.5 }).ok, false);
  assert.deepEqual(lessonById('call-frame').errors ?? [], []);
});

import { LOGICAL, NB, NP, ssd } from '../js/subjects/co/ssd.js';

test('固态硬盘：不原地改写、有效页数守恒、写放大 = 闪存写 / 主机写', () => {
  for (const writes of ['0 1 2 3 4 5 6 7 8 9 0 5 2 7 3 9 0 5 2 7', '0 1 2 3 4 5 6 7 8 9 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0', '0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9']) {
    const r = ssd({ writes });
    const written = new Set(r.list);
    for (const s of r.steps) {
      const pages = s.blocks.flatMap((b) => b.pages);
      // 每个写过的逻辑页恰好有一个有效副本，映射表指向它
      assert.equal(pages.filter((p) => p.s === 'valid').length, Object.keys(s.map).length);
      for (const [l, m] of Object.entries(s.map)) assert.deepEqual(s.blocks[m.b].pages[m.p], { s: 'valid', lpn: +l });
    }
    assert.equal(Object.keys(r.steps.at(-1).map).length, written.size);
    const moved = r.steps.filter((s) => s.kind === 'gc').reduce((a, s) => a + s.moved.length, 0);
    assert.equal(r.nand, r.host + moved);
    assert.equal(r.erases.reduce((a, b) => a + b, 0), r.gcCount);
  }
  // 默认的零散改写：手算前 10 页写满块 0、1 和块 2 的一半，之后的改写引出 7 次回收、20 次搬运
  const d = ssd({});
  assert.equal(d.host, 20);
  assert.equal(d.nand, 40);
  assert.equal(ssd({ writes: `0 ${LOGICAL}` }).ok, false);
  assert.equal(NB * NP - LOGICAL, 6);
  assert.deepEqual(lessonById('ssd').errors ?? [], []);
});

import { busTiming } from '../js/subjects/co/bustime.js';

test('总线定时：同步 (1 + w + n) × T；全互锁每字 a + 4d；半互锁 a + 2d', () => {
  for (const [n, w, T] of [[2, 1, 10], [4, 2, 10], [1, 0, 25]]) assert.equal(busTiming({ mode: 'sync', n, w, T }).total, (1 + w + n) * T);
  for (const n of [1, 2, 3]) assert.equal(busTiming({ mode: 'full', n, d: 5, a: 20 }).total, n * (20 + 4 * 5));
  const f = busTiming({ mode: 'full', n: 1, d: 5, a: 20 });
  assert.deepEqual(f.events.map((e) => `${e.kind}@${e.t}`), ['ready@0', 'ack@25', 'readyDown@30', 'ackDown@35', 'end@40']);
  const h = busTiming({ mode: 'half', n: 2, d: 5, a: 20, h: 15 });
  assert.equal(h.events.filter((e) => e.kind === 'ready')[1].t, 30); // 半互锁：看到回答撤请求后就开始下一个字
  assert.equal(h.perWord, 30);
  assert.equal(busTiming({ mode: 'half', d: 5, h: 3 }).missed, true);
  assert.equal(busTiming({ mode: 'sync', n: 2, w: 1, T: 10 }).bwMB, 200);
  assert.deepEqual(lessonById('bus-timing').errors ?? [], []);
});

test('IEEE 754：上溢的数能正常讲解（以前在「化成二进制」这一步崩溃）', async () => {
  const { lessonById } = await import('../js/catalog.js');
  const { encode, hexOf } = await import('../js/subjects/co/fp.js');
  const l = lessonById('ieee754');
  for (const [v, w, hex] of [['1e39', 32, '0x7F800000'], ['-1e39', 32, '0xFF800000'], ['1e309', 64, '0x7FF0000000000000'], ['3.4028236e38', 32, '0x7F800000'], ['3.4028235e38', 32, '0x7F7FFFFF']]) {
    assert.equal(hexOf(encode(v, w).bits, w), hex, v);
    const u = l.update({ ...l.params, mode: 'encode', width: w, value: v });
    assert.deepEqual(u.errors, [], v);
    assert.ok(u.steps.length >= 3, v);
  }
});
