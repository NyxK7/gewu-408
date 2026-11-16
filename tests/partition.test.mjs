// 动态分区分配：四种算法、回收的四种合并情况、外部碎片与紧凑。期望值手算，过程写在注释里。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freeList, parseOps, simulate } from '../js/subjects/os/partition.js';

// 内存 640K，低端 40K 是操作系统；A+120 B+50 C+70 D+80 之后：
// A[40,160) B[160,210) C[210,280) D[280,360)，空闲 [360,640) 280K
// A- 和 C- 之后空闲分区：120K@40、70K@210、280K@360
const S = 'A+120, B+50, C+70, D+80, A-, C-, E+60, F+100, G+150';
const fl = (blocks) => freeList(blocks).map((b) => [b.start, b.size]);
const at = (s, name) => {
  const b = s.final.find((x) => x.owner === name);
  return b ? [b.start, b.size] : null;
};

test('首次适应：按地址找第一个够大的', () => {
  // E+60 → 120K@40 → E[40,100)，剩 60K@100
  // F+100 → 60@100 不够、70@210 不够、280@360 → F[360,460)，剩 180K@460
  // G+150 → 60、70 不够，180@460 → G[460,610)，剩 30K@610
  const s = simulate({ algo: 'FF', ops: S });
  assert.deepEqual(at(s, 'E'), [40, 60]);
  assert.deepEqual(at(s, 'F'), [360, 100]);
  assert.deepEqual(at(s, 'G'), [460, 150]);
  assert.deepEqual(fl(s.final), [[100, 60], [210, 70], [610, 30]]);
  const f = s.steps.find((x) => x.op?.name === 'F' && x.kind === 'alloc');
  assert.deepEqual(f.checks.map((c) => [c.start, c.fit]), [[100, false], [210, false], [360, true]]);
});

test('最佳适应：按大小递增找第一个够大的', () => {
  // E+60 → 顺序 70、120、280 → 70K@210 → E[210,270)，剩 10K@270
  // F+100 → 顺序 10、120、280 → 120K@40 → F[40,140)，剩 20K@140
  // G+150 → 顺序 10、20、280 → G[360,510)，剩 130K@510
  const s = simulate({ algo: 'BF', ops: S });
  assert.deepEqual(at(s, 'E'), [210, 60]);
  assert.deepEqual(at(s, 'F'), [40, 100]);
  assert.deepEqual(at(s, 'G'), [360, 150]);
  assert.deepEqual(fl(s.final), [[140, 20], [270, 10], [510, 130]]);
});

test('最坏适应：选最大的，最后出现外部碎片', () => {
  // E+60 → 280K@360 → E[360,420)，剩 220K@420
  // F+100 → 220K@420 → F[420,520)，剩 640 − 520 = 120K@520
  // G+150 → 最大的只有 120K（@40 和 @520 各一块），失败；但总空闲 120+70+120 = 310K ≥ 150K → 外部碎片
  const s = simulate({ algo: 'WF', ops: S });
  assert.deepEqual(at(s, 'E'), [360, 60]);
  assert.deepEqual(at(s, 'F'), [420, 100]);
  const g = s.steps.at(-1);
  assert.equal(g.kind, 'fail');
  assert.deepEqual([g.totalFree, g.maxFree, g.external], [310, 120, true]);
  assert.equal(s.fails, 1);
});

test('邻近适应：从上次分配结束的地方接着找', () => {
  // D 分配完指针在 360；E+60 从 360 往后找 → 280K@360 → E[360,420)，指针 420
  // F+100 从 420 → 220K@420 → F[420,520)，指针 520
  // G+150 从 520：120K@520 不够，绕回 120K@40、70K@210 都不够 → 失败
  const s = simulate({ algo: 'NF', ops: S });
  assert.deepEqual(at(s, 'E'), [360, 60]);
  assert.deepEqual(at(s, 'F'), [420, 100]);
  const g = s.steps.at(-1);
  assert.deepEqual(g.checks.map((c) => c.start), [520, 40, 210]);
  assert.equal(g.kind, 'fail');
});

test('紧凑：把进程挪到低端后重新分配', () => {
  // 最坏适应失败时进程是 B[160,210) D[280,360) E[360,420) F[420,520)
  // 紧凑后 B[40,90) D[90,170) E[170,230) F[230,330)，空闲 [330,640) 310K → G[330,480)
  const s = simulate({ algo: 'WF', ops: S, compactOnFail: true });
  const c = s.steps.find((x) => x.kind === 'compact');
  assert.deepEqual(c.moves.map((m) => [m.owner, m.from, m.to]), [['B', 160, 40], ['D', 280, 90], ['E', 360, 170], ['F', 420, 230]]);
  assert.deepEqual(at(s, 'G'), [330, 150]);
  assert.deepEqual(fl(s.final), [[480, 160]]);
  assert.equal(s.steps.at(-1).retry, true);
});

test('回收的四种情况', () => {
  // A~E 各 100K 占满 [40,540)，剩 100K@540
  // B- 前后都是进程 → 不合并（空闲分区数 +1）
  // C- 前面 B 空闲 → 和前一块合并成 [140,340)
  // E- 后面 [540,640) 空闲 → 和后一块合并成 [440,640)
  // D- 前后都空闲 → 三块合成 [140,640)（空闲分区数 −1）
  // A- 前面是操作系统，后面空闲 → 和后一块合并成 [40,640)
  const s = simulate({ algo: 'FF', ops: 'A+100 B+100 C+100 D+100 E+100 B- C- E- D- A-' });
  const fr = s.steps.filter((x) => x.kind === 'free');
  assert.deepEqual(fr.map((x) => x.case), ['none', 'prev', 'next', 'both', 'next']);
  assert.deepEqual(fr.map((x) => [x.merged.start, x.merged.size]), [[140, 100], [140, 200], [440, 200], [140, 500], [40, 600]]);
  assert.deepEqual(fr.map((x) => x.freeCountDelta), [1, 0, 0, -1, 0]);
});

test('剩余太小时整块分配（内部碎片），以及输入检查', () => {
  // 最小分割 20K：E+110 落在 120K@40 上，剩 10K < 20K → 整个 120K 都给 E，内部碎片 10K
  const s = simulate({ algo: 'FF', ops: 'A+120 B+50 A- E+110', minFrag: 20 });
  const e = s.steps.at(-1);
  assert.deepEqual([e.part.start, e.part.size, e.internal], [40, 120, 10]);
  assert.equal(parseOps('A+10 B- c+5').ok, true);
  assert.equal(parseOps('A*3').ok, false);
  assert.equal(simulate({ ops: 'A+10 A+20' }).ok, false);
  assert.equal(simulate({ ops: 'B-' }).ok, false);
  assert.equal(simulate({ ops: 'A+10', os: 640 }).ok, false);
});
