// 图：最小生成树、拓扑排序、关键路径、DFS / BFS、Floyd。期望值手算。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { critical, floyd, mst, search, topo } from '../js/subjects/ds/graphalgo.js';

const G = 'A-B 6, A-C 1, A-D 5, B-C 5, B-E 3, C-D 5, C-E 6, C-F 4, D-F 2, E-F 6';

test('最小生成树', () => {
  // Prim 从 A：A-C 1 → C-F 4 → F-D 2 → C-B 5（B 的候选 A-B 6、C-B 5）→ B-E 3，总 15
  const p = mst({ graph: G, algo: 'prim', start: 'A' });
  assert.deepEqual(p.steps.map((s) => `${s.pick.inn}${s.pick.out}${s.pick.w}`), ['AC1', 'CF4', 'FD2', 'CB5', 'BE3']);
  assert.equal(p.total, 15);
  // Kruskal：1、2、3、4 依次加入；权 5 的 A-D 会成环被丢弃，B-C 加入，共 6 次判断
  const k = mst({ graph: G, algo: 'kruskal' });
  assert.deepEqual(k.steps.map((s) => `${s.pick.u}${s.pick.v}:${s.ok ? 1 : 0}`), ['AC:1', 'DF:1', 'BE:1', 'CF:1', 'AD:0', 'BC:1']);
  assert.equal(k.total, 15);
});

test('拓扑排序', () => {
  const t = topo({ graph: 'A>B, A>C, B>D, C>D, C>E, D>F, E>F' });
  assert.deepEqual(t.order, ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.equal(t.unique, false); // 第二步 B、C 入度都是 0
  const c = topo({ graph: 'D>A, A>B, B>C, C>A' });
  assert.equal(c.cycle, true);
  assert.deepEqual(c.steps.at(-1).left, ['A', 'B', 'C']);
});

test('关键路径', () => {
  const s = critical({ graph: 'A>B 3, A>C 2, B>D 2, B>E 3, C>D 4, C>F 3, D>F 2, E>F 1' });
  // ve：A0 B3 C2 D6 E6 F8；vl：F8 E7 D6 C2 B4 A0
  assert.deepEqual(s.V.map((v) => s.ve[v]), [0, 3, 2, 6, 6, 8]);
  assert.deepEqual(s.V.map((v) => s.vl[v]), [0, 4, 2, 6, 7, 8]);
  assert.deepEqual(s.critical.map((a) => a.u + a.v), ['AC', 'CD', 'DF']);
  assert.equal(s.length, 8);
  assert.deepEqual(critical({ graph: 'A>B 1, B>A 1' }).errors, ['cycle']);
});

test('DFS / BFS', () => {
  const g = 'A-B, A-C, B-D, B-E, C-F, E-F';
  assert.deepEqual(search({ graph: g, start: 'A', mode: 'dfs' }).order, ['A', 'B', 'D', 'E', 'F', 'C']);
  assert.deepEqual(search({ graph: g, start: 'A', mode: 'bfs' }).order, ['A', 'B', 'C', 'D', 'E', 'F']);
  // 不连通：从剩下最小的顶点再开始
  const s = search({ graph: 'A-B, C-D', start: 'A', mode: 'dfs' });
  assert.deepEqual(s.roots, ['A', 'C']);
});

test('Floyd', () => {
  const s = floyd({ graph: 'A>B 4, A>C 11, B>A 6, B>C 2, C>A 3' });
  assert.deepEqual(s.A, [[0, 4, 6], [5, 0, 2], [3, 7, 0]]);
  assert.deepEqual(s.steps.map((x) => x.changed.map((c) => `${c.i}${c.j}`)), [['21'], ['02'], ['10']]);
});
