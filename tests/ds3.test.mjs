// 数据结构第三批：串的模式匹配、红黑树、链栈链队、图的存储、计数排序、链表双指针。期望值手算。
import assert from 'node:assert/strict';
import test from 'node:test';
import { blackHeight, rbInsert } from '../js/subjects/ds/rbtree.js';
import { match, nextOf, nextvalOf, pmOf } from '../js/subjects/ds/string.js';
import { ino } from '../js/subjects/ds/tree.js';

test('KMP：next、nextval（教材常见的 abaabcac，从 1 开始的写法整体加 1）', () => {
  const plus1 = (a) => a.map((v) => v + 1);
  assert.deepEqual(plus1(nextOf('abaabcac')), [0, 1, 1, 2, 2, 3, 1, 2]);
  assert.deepEqual(plus1(nextvalOf('abaabcac')), [0, 1, 0, 2, 1, 3, 0, 2]);
  assert.deepEqual(pmOf('abaabcac'), [0, 0, 1, 1, 2, 0, 1, 0]);
  assert.deepEqual(nextOf('aaaab'), [-1, 0, 1, 2, 3]);
  assert.deepEqual(nextvalOf('aaaab'), [-1, -1, -1, -1, 3]);
  assert.deepEqual(nextOf('ababaa'), [-1, 0, 0, 1, 2, 3]);
});

test('KMP 与 BF：匹配位置和比较次数', () => {
  // 手算：BF 在 acabaabaabcacaabc 里找 abaabcac：每轮 2+1+6+1+1+... 次
  const bf = match({ text: 'acabaabaabcacaabc', pattern: 'abaabcac', algo: 'bf' });
  const kmp = match({ text: 'acabaabaabcacaabc', pattern: 'abaabcac', algo: 'kmp' });
  assert.equal(bf.found, 5);
  assert.equal(kmp.found, 5);
  assert.deepEqual(bf.rounds.map((r) => r.cmps.length), [2, 1, 6, 1, 2, 8]);
  assert.equal(bf.total, 20);
  // KMP：2（j=1 失配，j←0）、1（j=0 失配，i 后移）、6（j=5 失配，j←next[5]=2）、6（从 j=2 比到结束）
  assert.deepEqual(kmp.rounds.map((r) => r.cmps.length), [2, 1, 6, 6]);
  assert.equal(kmp.total, 15);
  // i 在 KMP 里从不后退
  const is = kmp.rounds.flatMap((r) => r.cmps.map((c) => c.i));
  for (let k = 1; k < is.length; k++) assert.ok(is[k] >= is[k - 1]);
  // nextval 能少比较
  assert.equal(match({ text: 'aaabaaaab', pattern: 'aaaab', algo: 'kmp' }).total, 12);
  assert.equal(match({ text: 'aaabaaaab', pattern: 'aaaab', algo: 'kmpval' }).total, 9);
  // 找不到
  const no = match({ text: 'abcde', pattern: 'xy', algo: 'kmp' });
  assert.equal(no.found, -1);
  // 随机：和 indexOf 一致
  for (let n = 0; n < 500; n++) {
    const t = Array.from({ length: 5 + (n % 20) }, () => 'ab'[Math.floor(Math.random() * 2)]).join('');
    const p = Array.from({ length: 1 + (n % 4) }, () => 'ab'[Math.floor(Math.random() * 2)]).join('');
    for (const algo of ['bf', 'kmp', 'kmpval']) assert.equal(match({ text: t, pattern: p, algo }).found, t.indexOf(p), `${algo} ${t} ${p}`);
  }
});

test('红黑树插入：每一步之后仍是二叉排序树，结束时满足全部性质', () => {
  const r = rbInsert([10, 20, 30, 15, 25, 5, 1]);
  assert.deepEqual(r.steps.map((s) => s.kind), ['insert', 'root', 'insert', 'insert', 'outer', 'insert', 'recolor', 'root', 'insert', 'insert', 'insert', 'recolor']);
  assert.equal(r.tree.val, 20);
  assert.equal(blackHeight(r.tree), 2);
  // 1～8 依次插入的结果（手画核对）：根 4 黑，2、6 红，8 是 7 的红色右孩子
  const t = rbInsert([1, 2, 3, 4, 5, 6, 7, 8]).tree;
  assert.equal(t.val, 4);
  assert.equal(t.red, false);
  assert.deepEqual([t.l.val, t.l.red, t.r.val, t.r.red], [2, true, 6, true]);
  assert.deepEqual([t.r.r.val, t.r.r.r.val, t.r.r.r.red], [7, 8, true]);
  // 内侧：先转再转
  assert.deepEqual(rbInsert([10, 5, 7]).steps.map((s) => s.kind), ['insert', 'root', 'insert', 'insert', 'inner', 'outer']);
  for (let n = 0; n < 2000; n++) {
    const keys = Array.from({ length: 1 + (n % 15) }, () => Math.floor(Math.random() * 50));
    const res = rbInsert(keys);
    assert.equal(res.tree.red, false);
    blackHeight(res.tree);
    const vals = ino(res.tree).map((x) => x.val);
    assert.deepEqual(vals, [...new Set(keys)].sort((a, b) => a - b));
  }
});

test('链栈与链队：指针改动和特殊情况', async () => {
  const { linkSQ } = await import('../js/subjects/ds/linkq.js');
  const st = linkSQ({ kind: 'stack', ops: '+a +b +c - +d - - - -' });
  assert.deepEqual(st.steps.map((s) => s.after.map((n) => n.v).join('')), ['a', 'ba', 'cba', 'ba', 'dba', 'ba', 'a', '', '']);
  assert.equal(st.steps.at(-1).fail, true);
  assert.deepEqual(st.steps[3].changed, ['top']);
  const qh = linkSQ({ kind: 'queue', head: true, ops: '+a +b - +c - - -' });
  assert.deepEqual(qh.steps.map((s) => s.after.map((n) => n.v).join('')), ['a', 'ab', 'b', 'bc', 'c', '', '']);
  // 最后一个结点出队：带头结点要把 rear 改回头结点（执行第 3 行）
  assert.equal(qh.steps[5].special, 'lastOut');
  assert.ok(qh.steps[5].lines.includes(3));
  assert.ok(!qh.steps[4].lines.includes(3));
  assert.equal(qh.steps[6].fail, true);
  const qn = linkSQ({ kind: 'queue', head: false, ops: '+a +b - - +c' });
  assert.equal(qn.steps[0].special, 'firstIn');
  assert.deepEqual(qn.steps[0].changed, ['front', 'rear']);
  assert.equal(qn.steps[3].special, 'lastOut');
  assert.equal(qn.steps[4].special, 'firstIn');
});

test('图的存储：邻接矩阵、头插法邻接表、度', async () => {
  const { graphStore } = await import('../js/subjects/ds/gstore.js');
  const g = graphStore({ directed: false, edges: 'A B, A C, B C, B D, C E, D E' });
  // 头插法：A 的链表是 C、B（后加的在前面）
  assert.deepEqual(g.states.at(-1).adj[0].map((x) => x.to), [2, 1]);
  assert.deepEqual(g.states.at(-1).adj[1].map((x) => x.to), [3, 2, 0]);
  assert.equal(g.states.at(-1).adj.flat().length, 12); // 无向图 2e
  assert.deepEqual(g.outDeg, [2, 3, 3, 2, 2]);
  const d = graphStore({ directed: true, edges: 'A B, A C, C A, C D, D A, D B' });
  assert.deepEqual(d.outDeg, [2, 0, 2, 2]);
  assert.deepEqual(d.inDeg, [2, 2, 1, 1]);
  assert.equal(d.states.at(-1).adj.flat().length, 6);
  assert.equal(graphStore({ directed: false, edges: 'A B, B A' }).ok, false);
});

test('计数排序：前缀和、从后往前放回、稳定', async () => {
  const { countingSort } = await import('../js/subjects/ds/csort.js');
  const s = countingSort([3, 1, 4, 1, 2, 3, 0, 3]);
  assert.deepEqual(s.cnt, [1, 2, 1, 3, 1]);
  assert.deepEqual(s.prefix, [1, 3, 4, 7, 8]);
  assert.deepEqual(s.sorted, [0, 1, 1, 2, 3, 3, 3, 4]);
  // 稳定：原下标 1 的 1 在下标 3 的 1 前面；三个 3 的原下标 0、5、7 依次排列
  assert.deepEqual(s.order, [6, 1, 3, 4, 0, 5, 7, 2]);
  assert.equal(s.fill[0].pos, 6); // 最后一个元素 3 放到 B[6]
  for (let n = 0; n < 300; n++) {
    const a = Array.from({ length: 1 + (n % 14) }, () => Math.floor(Math.random() * 13));
    const r = countingSort(a);
    assert.deepEqual(r.sorted, [...a].sort((x, y) => x - y));
    for (let i = 1; i < r.order.length; i++) if (a[r.order[i]] === a[r.order[i - 1]]) assert.ok(r.order[i] > r.order[i - 1]);
  }
});

test('链表双指针：中间、倒数第 k 个、合并、公共结点', async () => {
  const { twoPointer } = await import('../js/subjects/ds/llalgo.js');
  assert.equal(twoPointer({ mode: 'mid', a: '1 2 3 4 5' }).ans, 3);
  assert.equal(twoPointer({ mode: 'mid', a: '1 2 3 4 5 6' }).ans, 3); // 偶数取前一个
  assert.equal(twoPointer({ mode: 'mid', a: '7' }).ans, 1);
  assert.equal(twoPointer({ mode: 'kth', a: 'a b c d e f', k: 3 }).ans, 4);
  assert.equal(twoPointer({ mode: 'kth', a: 'a b c d e f', k: 6 }).ans, 1);
  assert.equal(twoPointer({ mode: 'kth', a: 'a b', k: 5 }).ans, null);
  const m = twoPointer({ mode: 'merge', a: '1 4 7 8', b: '2 4 5 9' });
  assert.deepEqual(m.C.map((x) => `${x.l}${x.i}`), ['A0', 'B0', 'A1', 'B1', 'B2', 'A2', 'A3', 'B3']); // 相等的 4 先取 A
  assert.equal(twoPointer({ mode: 'merge', a: '3 1', b: '2' }).ok, false);
  const t = twoPointer({ mode: 'intersect', a: 'l o a', b: 'b e', c: 'd i n g' });
  assert.equal(t.ans, 'd');
  assert.deepEqual(t.steps.find((s) => s.kind === 'ahead').p, { pa: 2, pb: 1 });
  for (let n = 0; n < 200; n++) {
    const len = 1 + (n % 9);
    const a = Array.from({ length: len }, (_, i) => `x${i}`).join(' ');
    for (let k = 1; k <= len; k++) assert.equal(twoPointer({ mode: 'kth', a, k }).ans, len - k + 1);
    assert.equal(twoPointer({ mode: 'mid', a }).ans, Math.ceil(len / 2));
  }
});
