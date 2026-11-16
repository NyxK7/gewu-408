// 「一次访存的全过程」计算核对。每组参数的期望值都是手算的，算式写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, PRESETS, derive, simulate, touch, victim } from '../js/subjects/mem/sim.js';

const kinds = (s) => s.ops.map((o) => o.kind + (o.kind === 'tlb' || o.kind === 'cache' ? (o.hit ? '+' : '-') : ''));
const preset = (id) => PRESETS.find((x) => x.id === id).set;

// ── 用例 A：32 位 VA、24 位 PA、4 KB 页；TLB 16 项全相联；Cache 32 KB、64 B 块、4 路 ──
// 页内偏移 = log2 4096 = 12 位，虚页号 = 32 − 12 = 20 位，页框号 = 24 − 12 = 12 位
// 页表 = 2^20 项 × 4 B = 4 MB = 1024 个页框；自动 PTBR：从 1 开始翻倍到 ≥ 1024 → 第 1024 页框 = 0x400000
// Cache：32 KB / 64 B = 512 行，/ 4 路 = 128 组 → 组号 7 位，块内偏移 6 位，标记 24 − 7 − 6 = 11 位
const A = { ...DEFAULTS, va: 0x00403a2c, frame: 0x2a7 };

test('A：位宽推导', () => {
  const d = derive(A);
  assert.deepEqual(d.errors, []);
  assert.equal(d.offBits, 12);
  assert.equal(d.vpnBits, 20);
  assert.equal(d.pfnBits, 12);
  assert.equal(d.ptBytes, 4 * 1024 * 1024);
  assert.equal(d.ptbr, 0x400000);
  assert.equal(d.tlbSets, 1);
  assert.equal(d.tlbIdxBits, 0);
  assert.equal(d.tlbTagBits, 20);
  assert.equal(d.lines, 512);
  assert.equal(d.cacheSets, 128);
  assert.equal(d.cIdxBits, 7);
  assert.equal(d.cOffBits, 6);
  assert.equal(d.cTagBits, 11);
});

test('A：地址拆分与物理地址', () => {
  const s = simulate({ ...A, ...preset('walk') });
  assert.ok(s.ok);
  // VA 0x00403A2C → 虚页号 0x00403，偏移 0xA2C
  assert.equal(s.vpn, 0x00403);
  assert.equal(s.off, 0xa2c);
  // 页表项地址 = 0x400000 + 0x403 × 4 = 0x400000 + 0x100C = 0x40100C
  assert.equal(s.pteAddr, 0x40100c);
  // PA = 0x2A7 ∥ 0xA2C = 0x2A7A2C = 2783788
  assert.equal(s.pa, 0x2a7a2c);
  // 0x2A7A2C = 0b 0010_1010_011 | 1_1010_00 | 10_1100 → 标记 0x153，组号 0x68 = 104，块内偏移 0x2C = 44
  assert.equal(s.cTag, 0x153);
  assert.equal(s.cIdx, 104);
  assert.equal(s.cOff, 44);
  // 主存块号 = PA / 64 = 43496 = 0xA9E8
  assert.equal(s.blockNo, 0xa9e8);
});

test('A：三个预设走的路径', () => {
  const hit = simulate({ ...A, ...preset('hit') });
  assert.deepEqual(kinds(hit), ['va', 'tlb+', 'pa', 'cache+', 'data']);
  assert.equal(hit.count.mem, 0);
  assert.deepEqual(hit.outcome, { tlbHit: true, pageFault: false, cacheHit: true });

  const walk = simulate({ ...A, ...preset('walk') });
  assert.deepEqual(kinds(walk), ['va', 'tlb-', 'pteReq', 'pteRet', 'tlbFill', 'pa', 'cache-', 'memReq', 'block', 'data']);
  assert.equal(walk.count.mem, 2); // 读页表项 1 次 + 调块 1 次

  const fault = simulate({ ...A, ...preset('fault') });
  assert.deepEqual(kinds(fault), ['va', 'tlb-', 'pteReq', 'pteRet', 'fault', 'pageIn', 'ptUpdate', 'tlbFill', 'reissue', 'tlb+', 'pa', 'cache-', 'memReq', 'block', 'data']);
  assert.equal(fault.count.mem, 2);
  assert.equal(fault.count.disk, 1);
  assert.equal(fault.pfn, 0x2a7); // 缺页时 frame 表示 OS 分配到的页框

  // 缺页处理程序不填 TLB：重新执行时 TLB 仍未命中，要再查一次页表，共访问主存 3 次
  const f2 = simulate({ ...A, ...preset('fault'), fillTlbOnFault: false });
  assert.deepEqual(kinds(f2).slice(6), ['ptUpdate', 'reissue', 'tlb-', 'pteReq', 'pteRet', 'tlbFill', 'pa', 'cache-', 'memReq', 'block', 'data']);
  assert.equal(f2.count.mem, 3);
  assert.equal(f2.ops.find((o) => o.kind === 'pteRet' && o.pte.v).pte.pfn, 0x2a7);
});

// ── 用例 B：14 位 VA、12 位 PA、64 B 页；TLB 16 项 4 路；Cache 64 B 直接映射、4 B 块 ──
// 偏移 6 位，虚页号 8 位，页框号 6 位；TLB 16 / 4 = 4 组 → 组号 2 位，标记 6 位
// 页表 2^8 × 4 B = 1 KB = 16 个页框，自动 PTBR = 第 16 页框 = 16 × 64 = 0x400（占第 16～31 页框）
// Cache 64 / 4 = 16 行 = 16 组 → 组号 4 位，块内偏移 2 位，标记 12 − 4 − 2 = 6 位
const B = {
  ...DEFAULTS,
  vaBits: 14,
  paBits: 12,
  pageSize: 64,
  tlbEntries: 16,
  tlbWays: 4,
  cacheSize: 64,
  blockSize: 4,
  cacheWays: 1,
  va: 0x2b7c,
  frame: 0x2a,
};

test('B：小地址空间、组相联 TLB、直接映射 Cache', () => {
  const d = derive(B);
  assert.deepEqual(d.errors, []);
  assert.deepEqual([d.offBits, d.vpnBits, d.pfnBits], [6, 8, 6]);
  assert.deepEqual([d.tlbSets, d.tlbIdxBits, d.tlbTagBits], [4, 2, 6]);
  assert.deepEqual([d.cacheSets, d.cIdxBits, d.cOffBits, d.cTagBits], [16, 4, 2, 6]);
  assert.equal(d.ptbr, 0x400);

  const s = simulate({ ...B, ...preset('walk') });
  // 0x2B7C = 11132 → 虚页号 = 11132 / 64 = 173 = 0xAD，偏移 = 11132 − 173 × 64 = 60 = 0x3C
  assert.equal(s.vpn, 0xad);
  assert.equal(s.off, 0x3c);
  // 0xAD = 1010_1101 → TLB 组号 = 低 2 位 01 = 1，TLB 标记 = 101011 = 0x2B
  assert.equal(s.tlbIdx, 1);
  assert.equal(s.tlbTag, 0x2b);
  // 页表项地址 = 0x400 + 173 × 4 = 1024 + 692 = 1716 = 0x6B4
  assert.equal(s.pteAddr, 0x6b4);
  // PA = 42 × 64 + 60 = 2748 = 0xABC = 1010_1011_1100 → 标记 101010 = 0x2A，组号 1111 = 15，偏移 00
  assert.equal(s.pa, 0xabc);
  assert.deepEqual([s.cTag, s.cIdx, s.cOff], [0x2a, 15, 0]);
  // 直接映射：调块只能放进第 15 组唯一的那一行
  const fill = s.ops.find((o) => o.kind === 'block');
  assert.equal(fill.way, 0);
  // 装入 TLB 的那一项：标记 0x2B → 页框 0x2A
  const tf = s.ops.find((o) => o.kind === 'tlbFill');
  const e = tf.snap.tlb[tf.way];
  assert.deepEqual([e.v, e.tag, e.vpn, e.pfn], [1, 0x2b, 0xad, 0x2a]);
});

test('全相联 Cache 没有组号；直接映射大 Cache 的位宽', () => {
  // PA 20 位，Cache 4 KB、32 B 块、全相联：128 行 1 组 → 组号 0 位，偏移 5 位，标记 15 位
  const d1 = derive({ ...DEFAULTS, paBits: 20, vaBits: 20, va: 0x3a2c, cacheSize: 4096, blockSize: 32, cacheWays: 0 });
  assert.deepEqual(d1.errors, []);
  assert.deepEqual([d1.cacheSets, d1.cIdxBits, d1.cOffBits, d1.cTagBits], [1, 0, 5, 15]);
  // PA 32 位，Cache 64 KB、32 B 块、直接映射：2048 行 → 组号 11 位，偏移 5 位，标记 16 位
  const d2 = derive({ ...DEFAULTS, paBits: 32, cacheSize: 65536, blockSize: 32, cacheWays: 1 });
  assert.deepEqual([d2.cacheSets, d2.cIdxBits, d2.cOffBits, d2.cTagBits], [2048, 11, 5, 16]);
});

test('参数不合法时给出对应错误', () => {
  const keys = (p) => derive({ ...DEFAULTS, ...p }).errors.map((e) => e[0]);
  // 单级页表 4 MB，放不进 1 MB 的物理内存
  assert.ok(keys({ paBits: 20 }).includes('ptBig'));
  // 页大小 256 B = 8 位偏移，物理地址只有 8 位，页框号位数为 0
  assert.ok(keys({ vaBits: 12, paBits: 8, pageSize: 256 }).includes('pageVsPa'));
  // PA 32 位、4 KB 页 → 页框号 20 位，加有效位 21 位 > 2 B 页表项
  assert.ok(keys({ paBits: 32, pteSize: 2 }).includes('pteSmall'));
  // 1 MB 直接映射 Cache 配 1 MB 物理内存：标记位数为 0
  assert.ok(keys({ vaBits: 24, paBits: 20, pageSize: 65536, cacheSize: 1 << 20, cacheWays: 1 }).includes('cacheBig'));
  assert.ok(keys({ va: 2 ** 32 }).includes('va'));
  assert.ok(keys({ pageSize: 3000 }).includes('pageSize'));
  // 指定的页框落在页表里（自动 PTBR 让页表占第 1024～2047 页框）
  assert.ok(keys({ frame: 1500 }).includes('frameInPt'));
});

test('LRU：替换最久没用的，命中后更新计数', () => {
  const set = [2, 0, 1, 3].map((age) => ({ v: 1, age }));
  assert.equal(victim(set), 3);
  touch(set, 0); // 原来 age 2：比它新的两项各 +1
  assert.deepEqual(set.map((e) => e.age), [0, 1, 2, 3]);
  set[2].v = 0;
  assert.equal(victim(set), 2); // 有空项先用空项
});

test('随机参数下的不变量', () => {
  const pick = (a, i) => a[i % a.length];
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const p = {
      ...DEFAULTS,
      vaBits: pick([16, 20, 24, 32, 36, 48], i),
      paBits: pick([16, 20, 24, 30, 32], i * 7),
      pageSize: pick([256, 1024, 4096, 8192], i * 3),
      pteSize: pick([4, 8], i),
      tlbEntries: pick([4, 8, 16, 32, 64], i * 5),
      tlbWays: pick([0, 1, 2, 4], i * 11),
      cacheSize: pick([1024, 8192, 32768, 262144], i * 13),
      blockSize: pick([16, 32, 64, 128], i * 17),
      cacheWays: pick([0, 1, 2, 4, 8], i * 19),
      ...pick(PRESETS, i).set,
      fillTlbOnFault: i % 2 === 0,
    };
    p.va = Math.floor(((i * 2654435761) % 4294967296) / 4294967296 * 2 ** p.vaBits);
    const s = simulate(p);
    if (!s.ok) continue;
    n++;
    const { d } = s;
    assert.equal(s.pa, s.pfn * p.pageSize + s.off, 'PA = 页框号 × 页大小 + 偏移');
    assert.equal(s.va, s.vpn * p.pageSize + s.off, 'VA = 虚页号 × 页大小 + 偏移');
    assert.equal(s.vpn, s.tlbTag * d.tlbSets + s.tlbIdx, '虚页号 = TLB 标记 | TLB 组号');
    assert.equal(s.pa, (s.cTag * d.cacheSets + s.cIdx) * p.blockSize + s.cOff, 'PA = 标记 | 组号 | 块内偏移');
    assert.equal(s.ops.at(-1).kind, 'data');
    const set = PRESETS[i % 3].id;
    if (set === 'hit') assert.deepEqual(s.outcome, { tlbHit: true, pageFault: false, cacheHit: true });
    if (set === 'walk') assert.deepEqual(s.outcome, { tlbHit: false, pageFault: false, cacheHit: false });
    if (set === 'fault') assert.equal(s.outcome.pageFault, true);
    // TLB 里的每一项都必须和页表一致（不可能缓存一个不在主存的页）
    for (const op of s.ops) {
      for (const e of op.snap.tlb) {
        if (!e.v) continue;
        const row = op.snap.pt.find((x) => x.vpn === e.vpn);
        if (row) assert.ok(row.v === 1 && row.pfn === e.pfn, 'TLB 与页表一致');
      }
    }
    assert.ok(s.pfn < d.frames && (s.pfn < d.ptFirst || s.pfn > d.ptLast), '页不能放进页表占用的页框');
  }
  assert.ok(n > 150, `有效样本太少：${n}`);
});
