// 各科第三个考点：Dijkstra、Cache 映射与命中率、磁盘调度、滑动窗口。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, simulate as cache } from '../js/subjects/co/cachemap.js';
import { simulate as dij } from '../js/subjects/ds/dijkstra.js';
import { simulate as sw } from '../js/subjects/net/sw.js';
import { simulate as disk } from '../js/subjects/os/disk.js';

test('Dijkstra：有向图（CLRS 图 24.6 的结构，顶点改名为 A～E）', () => {
  const g = 'A>B 10, A>E 5, B>C 1, B>E 2, C>D 4, E>B 3, E>C 9, E>D 2, D>A 7, D>C 6';
  const s = dij({ graph: g, src: 'A', directed: true });
  // 初始 B=10 E=5；第 1 轮选 E(5)：B→8，C→14，D→7；第 2 轮选 D(7)：C→13；第 3 轮选 B(8)：C→9；第 4 轮选 C(9)
  assert.deepEqual(s.rounds.map((r) => [r.pick, r.d]), [['E', 5], ['D', 7], ['B', 8], ['C', 9]]);
  assert.deepEqual(s.dist, { A: 0, B: 8, C: 9, D: 7, E: 5 });
  assert.deepEqual(s.paths.C, ['A', 'E', 'B', 'C']);
  assert.deepEqual(s.rounds[1].before.dist, { A: 0, B: 8, C: 14, D: 7, E: 5 });
});

test('Dijkstra：无向图、不可达、负权', () => {
  // A-C 1 先定；经 C 到 B 是 1+2=3 < 4；D 经 B 是 3+5=8 < 经 C 的 9
  const s = dij({ graph: 'A-B 4, A-C 1, C-B 2, B-D 5, C-D 8', src: 'A', directed: false });
  assert.deepEqual(s.dist, { A: 0, B: 3, C: 1, D: 8 });
  assert.deepEqual(s.paths.D, ['A', 'C', 'B', 'D']);
  const u = dij({ graph: 'A>B 1, C>A 2', src: 'A', directed: true });
  assert.equal(u.dist.C, Infinity);
  assert.deepEqual(u.rounds.at(-1).unreachable, ['C']);
  assert.equal(dij({ graph: 'A-B -1', src: 'A', directed: false }).ok, false);
});

const SEQ = [0, 4, 8, 2, 0, 6, 8, 6, 4, 8];

test('Cache 映射：4 行，块号序列 0 4 8 2 0 6 8 6 4 8', () => {
  // 直接映射：组号 = 块号 mod 4，0 4 8 都抢第 0 行，只有第二次访问 6 命中 → 1 次
  assert.equal(cache({ lines: 4, ways: 1, seq: SEQ }).hits, 1);
  // 2 路组相联：全是偶数块，都进第 0 组的 2 行，LRU 下也只有 6 命中 → 1 次
  assert.equal(cache({ lines: 4, ways: 2, seq: SEQ }).hits, 1);
  // 全相联 LRU：0 命中；6 换出 4；8、6 命中；4 换出 2；8 命中 → 4 次
  const f = cache({ lines: 4, ways: 0, seq: SEQ });
  assert.equal(f.hits, 4);
  assert.equal(f.steps[5].victim, 4);
  assert.equal(f.steps[8].victim, 2);
  // 全相联 FIFO：6 换出最早装入的 0，之后 8 6 4 8 全命中 → 5 次
  assert.equal(cache({ lines: 4, ways: 0, policy: 'FIFO', seq: SEQ }).hits, 5);
  assert.deepEqual(compare({ lines: 4, policy: 'LRU', seq: SEQ }), [{ ways: 1, hits: 1 }, { ways: 2, hits: 1 }, { ways: 0, hits: 4 }]);
});

// 磁盘调度：磁头在 100，向磁道号增大的方向移动，请求 55 58 39 18 90 160 150 38 184，最大磁道 199
const R = { head: 100, reqs: [55, 58, 39, 18, 90, 160, 150, 38, 184], max: 199 };

test('磁盘调度：六种算法的总移动距离', () => {
  // FCFS：45+3+19+21+72+70+10+112+146 = 498
  assert.equal(disk({ algo: 'FCFS', ...R }).total, 498);
  // SSTF：90 58 55 39 38 18 150 160 184 → 10+32+3+16+1+20+132+10+24 = 248
  const s = disk({ algo: 'SSTF', ...R });
  assert.deepEqual(s.order, [90, 58, 55, 39, 38, 18, 150, 160, 184]);
  assert.equal(s.total, 248);
  // LOOK：150 160 184 掉头 90 58 55 39 38 18 → 50+10+24+94+32+3+16+1+20 = 250
  assert.equal(disk({ algo: 'LOOK', ...R }).total, 250);
  // SCAN：多走到 199 再掉头 → 50+10+24+15+109+32+3+16+1+20 = 280
  assert.equal(disk({ algo: 'SCAN', ...R }).total, 280);
  // C-LOOK：184 跳到 18（166，计入）→ 50+10+24+166+20+1+16+3+32 = 322；不计回程 156
  assert.equal(disk({ algo: 'CLOOK', ...R }).total, 322);
  assert.equal(disk({ algo: 'CLOOK', ...R, countReturn: false }).total, 156);
  // C-SCAN：到 199（15），跳回 0（199），再 18 38 39 55 58 90 → 50+10+24+15+199+90 = 388；不计回程 189
  assert.equal(disk({ algo: 'CSCAN', ...R }).total, 388);
  assert.equal(disk({ algo: 'CSCAN', ...R, countReturn: false }).total, 189);
  // 向磁道号减小的方向 LOOK：90 58 55 39 38 18 掉头 150 160 184 → 10+32+3+16+1+20+132+10+24 = 248
  assert.equal(disk({ algo: 'LOOK', ...R, dir: 'down' }).total, 248);
});

test('滑动窗口：GBN 第 2 帧丢失', () => {
  // N=6 W=4 D=2 T=6。0 1 2(丢) 3 依次在 t=0..3 发出；ACK0 在 t=4 到达，窗口右移发 4；ACK1 在 t=5 到达，发 5
  // 3 4 5 到达接收方时期望的是 2，全部丢弃并重发 ACK1；计时器从 t=5 起，t=11 超时，重传 2 3 4 5（t=11..14）
  // ACK2～ACK5 在 t=15..18 到达，t=18 全部确认
  const s = sw({ proto: 'GBN', bits: 3, W: 4, N: 6, D: 2, T: 6, lostF: [2] });
  assert.deepEqual(s.frames.map((f) => [f.k, f.t, f.lost, f.retx]), [[0, 0, false, false], [1, 1, false, false], [2, 2, true, false], [3, 3, false, false], [4, 4, false, false], [5, 5, false, false], [2, 11, false, true], [3, 12, false, true], [4, 13, false, true], [5, 14, false, true]]);
  assert.equal(s.finish, 18);
  assert.equal(s.retx, 4);
});

test('滑动窗口：SR 第 2 帧丢失；GBN 丢一个确认不用重传', () => {
  // SR：3 4 5 被缓存并逐个确认；帧 2 在 t=2 发出，t=8 超时只重传它，t=10 到达后 2～5 一起交付，ACK2 在 t=12 到达
  const s = sw({ proto: 'SR', bits: 3, W: 4, N: 6, D: 2, T: 6, lostF: [2] });
  assert.deepEqual(s.frames.filter((f) => f.retx).map((f) => [f.k, f.t]), [[2, 8]]);
  assert.equal(s.finish, 12);
  assert.deepEqual(s.delivered, [0, 1, 2, 3, 4, 5]);
  // GBN 累积确认：ACK1 丢了，但 ACK2 已经说明 0～2 都收到 → 不重传，t=5 全部确认
  const g = sw({ proto: 'GBN', bits: 3, W: 4, N: 4, D: 1, T: 5, lostA: [1] });
  assert.equal(g.retx, 0);
  assert.equal(g.finish, 5);
  // 窗口上限：GBN W ≤ 2^n − 1，SR W ≤ 2^(n−1)
  assert.equal(sw({ proto: 'GBN', bits: 2, W: 4, N: 4 }).warn, true);
  assert.equal(sw({ proto: 'GBN', bits: 2, W: 3, N: 4 }).warn, false);
  assert.equal(sw({ proto: 'SR', bits: 3, W: 5, N: 4 }).warn, true);
});
