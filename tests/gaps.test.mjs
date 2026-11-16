// 补考纲缺口新增的两节课：进程的内存映像、磁盘的结构与访问时间。
import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonById } from '../js/catalog.js';
import { diskTime } from '../js/subjects/os/disktime.js';
import { ESP0, memimg, placeOf } from '../js/subjects/os/memimg.js';

test('内存映像：变量放在哪一段', () => {
  assert.equal(placeOf({ kind: 'func' }), '.text');
  assert.equal(placeOf({ kind: 'str' }), '.rodata');
  assert.equal(placeOf({ kind: 'global', cnst: true, init: true }), '.rodata');
  assert.equal(placeOf({ kind: 'global', init: true }), '.data');
  assert.equal(placeOf({ kind: 'global', init: false }), '.bss');
  assert.equal(placeOf({ kind: 'static', init: true }), '.data');
  assert.equal(placeOf({ kind: 'static', init: false }), '.bss');
  assert.equal(placeOf({ kind: 'local', cnst: true }), 'stack'); // const 局部变量仍在栈上
  assert.equal(placeOf({ kind: 'param' }), 'stack');
  assert.equal(placeOf({ kind: 'heap' }), 'heap');
});

test('内存映像：第一段程序各段的内容和栈帧', () => {
  const s = memimg({ prog: 'vars' });
  assert.ok(s.ok);
  const data = s.steps[1].seg;
  assert.deepEqual(data['.data'].map((x) => x.name), ['g', 'msg']);
  assert.deepEqual(data['.bss'].map((x) => x.name), ['h', 'calls']);
  assert.deepEqual(data['.rodata'].map((x) => x.name), ['MAX', '"hello"']);
  const call = s.steps.find((x) => x.kind === 'callAdd');
  assert.equal(call.frames.length, 2);
  // 参数从右往左压：先 b 后 a
  assert.deepEqual(call.frames[1].items.map((x) => x.name), ['b', 'a', 'ret', 'ebp', 's']);
  assert.equal(call.seg['.bss'].find((x) => x.name === 'calls').val, '1');
  // 返回后栈恢复，x 拿到返回值
  const back = s.steps.find((x) => x.kind === 'retAdd');
  assert.equal(back.frames.length, 1);
  assert.equal(back.esp, s.steps.find((x) => x.kind === 'malloc').esp);
  assert.equal(back.frames[0].items.find((x) => x.name === 'x').val, '11');
  assert.equal(s.steps.at(-1).esp, ESP0);
});

test('内存映像：递归最深时的栈', () => {
  for (let n = 1; n <= 6; n++) {
    const s = memimg({ prog: 'recur', n });
    assert.equal(ESP0 - s.deepest, 12 + 16 * n);
    assert.equal(Math.max(...s.steps.map((x) => x.frames.length)), n + 1);
    assert.equal(s.result, [1, 1, 2, 6, 24, 120, 720][n]);
    assert.equal(s.steps.at(-1).esp, ESP0);
  }
  assert.equal(memimg({ prog: 'recur', n: 7 }).ok, false);
  assert.equal(memimg({ prog: 'nope' }).ok, false);
});

test('磁盘：访问时间', () => {
  const d = diskTime({ rpm: 6000, spt: 100, heads: 4, cyls: 1000, bytes: 512, b: 21000, k: 20, seek: 5 });
  assert.equal(d.rot, 10);
  assert.equal(d.tr, 5);
  assert.equal(d.tt, 2);
  assert.equal(d.ta, 12);
  assert.equal(d.random, 20 * (5 + 5 + 0.1));
  assert.equal(d.rate, 100 * 512 * 100); // 每秒 100 圈
  const e = diskTime({ rpm: 7200, spt: 200, heads: 8, cyls: 2000, bytes: 512, b: 0, k: 1, seek: 8 });
  assert.ok(Math.abs(e.tr - 60000 / 7200 / 2) < 1e-9);
});

test('磁盘：盘块号和（柱面, 盘面, 扇区）互换', () => {
  const spt = 63;
  const heads = 6;
  for (const b of [0, 62, 63, 377, 378, 12345, 6 * 63 * 99 - 1]) {
    const d = diskTime({ rpm: 6000, spt, heads, cyls: 100, bytes: 512, b, k: 1, seek: 5 });
    assert.ok(d.h < heads && d.s < spt);
    assert.equal(d.c * heads * spt + d.h * spt + d.s, b);
  }
  // 越界、超出这条磁道
  assert.equal(diskTime({ rpm: 6000, spt: 10, heads: 2, cyls: 10, bytes: 512, b: 200, k: 1, seek: 5 }).ok, false);
  assert.equal(diskTime({ rpm: 6000, spt: 10, heads: 2, cyls: 10, bytes: 512, b: 8, k: 3, seek: 5 }).ok, false);
});

test('两节新课：都能建出来，参数出错时报错', () => {
  for (const id of ['mem-image', 'disk-time']) {
    const l = lessonById(id);
    assert.ok(l && l.steps.length && !l.errors.length, id);
    for (const p of l.spec?.presets ?? []) assert.deepEqual(l.update(p.set).errors, [], `${id} ${JSON.stringify(p.set)}`);
  }
  assert.ok(lessonById('disk-time').update({ ...lessonById('disk-time').params, b: 9e9 }).errors.length);
  assert.ok(lessonById('mem-image').update({ prog: 'recur', n: 0 }).errors.length);
});

test('文件的物理结构：四种分配方式读第 k 块的访盘次数', async () => {
  const { fileAlloc, fatSize, scatter, DISK } = await import('../js/subjects/os/filealloc.js');
  for (let n = 2; n <= 8; n++)
    for (let k = 0; k < n; k++) {
      const s = fileAlloc({ n, k, start: 0, seed: 11, pattern: 'one' });
      assert.deepEqual(s.counts, { contig: 1, linked: k + 1, fat: 1, index: 2 });
      const fat = s.lanes.find((l) => l.kind === 'fat');
      assert.equal(fat.mem.length, k); // 在内存里查 FAT k 次
      // 顺着 FAT 走 k 步正好到逻辑块 k 的盘块
      let b = s.data[0];
      for (let i = 0; i < k; i++) b = fat.fat[b];
      assert.equal(b, s.data[k]);
    }
  const all = fileAlloc({ n: 6, k: 0, start: 3, seed: 5, pattern: 'all' });
  assert.deepEqual(all.counts, { contig: 6, linked: 6, fat: 6, index: 7 });
  assert.deepEqual(all.lanes[0].reads, [3, 4, 5, 6, 7, 8]);
  // 打散的盘块互不相同、都在磁盘范围内，索引块不和数据块重复
  for (let seed = 1; seed <= 99; seed++) {
    const { data, index } = scatter(seed, 8);
    assert.equal(new Set([...data, index]).size, 9);
    assert.ok([...data, index].every((x) => x >= 0 && x < DISK));
  }
  assert.deepEqual(fatSize({ blocks: 2 ** 20 }), { bits: 20, entryBits: 24, bytes: 3 * 2 ** 20 });
  assert.equal(fatSize({ blocks: 2 ** 20, byte: false }).entryBits, 20);
  assert.equal(fileAlloc({ n: 6, k: 6 }).ok, false);
  assert.equal(fileAlloc({ n: 6, start: 19 }).ok, false);
});

test('经典同步问题：读者—写者和哲学家进餐的模拟结论', async () => {
  const { syncClassic } = await import('../js/subjects/os/syncclassic.js');
  // 读者优先：后到的 R3 抢在等着的写者前面
  const a = syncClassic({ problem: 'rw-reader' });
  assert.deepEqual(a.order, ['R1', 'R2', 'R3', 'W1']);
  const r3 = a.steps.find((s) => s.kind === 'arrive' && s.p === 'R3');
  assert.equal(r3.count, 3);
  assert.equal(r3.st.W1.state, 'blocked');
  assert.deepEqual(r3.queue.rw, ['W1']);
  // 读写公平：R3 排在写者后面
  const b = syncClassic({ problem: 'rw-fair' });
  assert.deepEqual(b.order, ['R1', 'R2', 'W1', 'R3']);
  assert.equal(b.steps.find((s) => s.kind === 'arrive' && s.p === 'R3').st.R3.on, 'w');
  // 结束时信号量回到初值、count 归 0
  for (const s of [a, b]) {
    const end = s.steps.at(-1);
    assert.equal(end.count, 0);
    for (const [k, v] of Object.entries(s.sems)) assert.equal(end.val[k], v);
  }
  // 哲学家：都先拿左边会死锁；另外两种都吃完、筷子都放回
  const d = syncClassic({ problem: 'dine-left' });
  assert.equal(d.deadlock, true);
  const last = d.steps.at(-1);
  for (let i = 0; i < 5; i++) {
    assert.equal(last.st[`Ph${i}`].state, 'blocked');
    assert.deepEqual(last.st[`Ph${i}`].held, [`c${i}`]);
  }
  for (const p of ['dine-odd', 'dine-room']) {
    const s = syncClassic({ problem: p });
    assert.equal(s.deadlock, false, p);
    assert.equal(new Set(s.order).size, 5, p);
    const end = s.steps.at(-1);
    for (const [k, v] of Object.entries(s.sems)) assert.equal(end.val[k], v, `${p} ${k}`);
  }
});
