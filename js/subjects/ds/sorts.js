// 排序这一章其余的纯计算：直接插入、折半插入、希尔、冒泡、简单选择、二路归并、基数排序每一趟的结果；
// 外部排序的置换—选择、最佳归并树；时间复杂度的循环计数。
//
// 约定（界面上写明）：都排成递增；
//   · 「一趟」：插入排序插入一个元素；希尔排序用一个增量做完一轮；冒泡从后往前把最小的冒到前面；
//     简单选择选出一个最小的放到前面；归并是一轮两两归并（自底向上）；基数排序是一次分配加收集（从最低位起）；
//   · 冒泡某一趟没有交换就提前结束；希尔增量默认 n/2、n/4…… 直到 1。

const err = (e) => ({ ok: false, errors: [e] });
const R = (a, extra = {}) => ({ a: [...a], ...extra });

export function passes({ keys, algo, gaps }) {
  if (!Array.isArray(keys) || keys.length < 2 || keys.length > 14) return err('keys');
  const a = [...keys];
  const n = a.length;
  const out = [];
  let cmp = 0;
  let mov = 0;
  if (algo === 'insert' || algo === 'binsert') {
    for (let i = 1; i < n; i++) {
      const x = a[i];
      let j = i - 1;
      if (algo === 'insert') {
        while (j >= 0 && (cmp++, a[j] > x)) {
          a[j + 1] = a[j];
          mov++;
          j--;
        }
      } else {
        let lo = 0;
        let hi = i - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          cmp++;
          if (a[mid] > x) hi = mid - 1;
          else lo = mid + 1;
        }
        for (j = i - 1; j >= lo; j--) {
          a[j + 1] = a[j];
          mov++;
        }
      }
      a[j + 1] = x;
      out.push(R(a, { sorted: [0, i], hot: [j + 1], note: x }));
    }
  } else if (algo === 'shell') {
    const G = gaps?.length ? gaps : (() => { const g = []; for (let d = n >> 1; d >= 1; d >>= 1) g.push(d); return g; })();
    for (const d of G) {
      for (let i = d; i < n; i++) {
        const x = a[i];
        let j = i - d;
        while (j >= 0 && (cmp++, a[j] > x)) {
          a[j + d] = a[j];
          mov++;
          j -= d;
        }
        a[j + d] = x;
      }
      out.push(R(a, { gap: d }));
    }
  } else if (algo === 'bubble') {
    for (let i = 0; i < n - 1; i++) {
      let swapped = false;
      for (let j = n - 1; j > i; j--) {
        cmp++;
        if (a[j - 1] > a[j]) {
          [a[j - 1], a[j]] = [a[j], a[j - 1]];
          mov += 3;
          swapped = true;
        }
      }
      out.push(R(a, { sorted: [0, i], hot: [i], swapped }));
      if (!swapped) break;
    }
  } else if (algo === 'select') {
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      for (let j = i + 1; j < n; j++) if ((cmp++, a[j] < a[m])) m = j;
      if (m !== i) {
        [a[i], a[m]] = [a[m], a[i]];
        mov += 3;
      }
      out.push(R(a, { sorted: [0, i], hot: [i, m] }));
    }
  } else if (algo === 'merge') {
    for (let w = 1; w < n; w *= 2) {
      const b = [];
      for (let lo = 0; lo < n; lo += 2 * w) {
        const mid = Math.min(lo + w, n);
        const hi = Math.min(lo + 2 * w, n);
        let i = lo;
        let j = mid;
        while (i < mid && j < hi) {
          cmp++;
          b.push(a[i] <= a[j] ? a[i++] : a[j++]);
        }
        while (i < mid) b.push(a[i++]);
        while (j < hi) b.push(a[j++]);
      }
      b.forEach((v, k) => (a[k] = v));
      mov += n;
      out.push(R(a, { width: Math.min(2 * w, n) }));
    }
  } else if (algo === 'radix') {
    if (keys.some((k) => !Number.isInteger(k) || k < 0)) return err('radix');
    const digits = String(Math.max(...keys)).length;
    let cur = [...a];
    for (let d = 0; d < digits; d++) {
      const buckets = Array.from({ length: 10 }, () => []);
      for (const x of cur) buckets[Math.floor(x / 10 ** d) % 10].push(x);
      cur = buckets.flat();
      out.push(R(cur, { digit: d, buckets }));
    }
    a.splice(0, n, ...cur);
  } else return err('algo');
  return { ok: true, keys, algo, passes: out, sorted: a, cmp, mov };
}

/** 外部排序：置换—选择生成初始归并段（工作区 w 个记录） */
export function replaceSelect({ keys, w }) {
  if (!Array.isArray(keys) || keys.length < 2 || keys.length > 24) return err('keys');
  if (!(Number.isInteger(w) && w >= 2 && w <= 6)) return err('w');
  const input = [...keys];
  let wa = input.splice(0, w);
  const runs = [[]];
  const steps = [];
  let minimax = -Infinity;
  while (wa.length) {
    // 能放进当前段的：≥ MINIMAX
    const ok = wa.filter((x) => x >= minimax);
    if (!ok.length) {
      runs.push([]);
      minimax = -Infinity;
      steps.push({ kind: 'newrun', wa: [...wa], run: runs.length - 1 });
      continue;
    }
    const x = Math.min(...ok);
    wa.splice(wa.indexOf(x), 1);
    runs.at(-1).push(x);
    minimax = x;
    const nx = input.length ? input.shift() : null;
    if (nx != null) wa.push(nx);
    steps.push({ kind: 'out', x, in: nx, wa: [...wa], run: runs.length - 1, runs: runs.map((r) => [...r]) });
  }
  return { ok: true, keys, w, runs, steps };
}

/** 最佳归并树：k 路归并，归并段长度 lens；不够时补长度为 0 的虚段 */
export function bestMerge({ lens, k }) {
  if (!Array.isArray(lens) || lens.length < 2 || lens.length > 14 || lens.some((x) => !(x > 0))) return err('lens');
  if (!(Number.isInteger(k) && k >= 2 && k <= 5)) return err('k');
  const n = lens.length;
  const u = (n - 1) % (k - 1);
  const dummies = u === 0 ? 0 : k - 1 - u;
  let seq = 0;
  let pool = [...lens.map((v, i) => ({ id: `r${i}`, val: v, leaf: true, seq: seq++, kids: [] })), ...Array.from({ length: dummies }, (_, i) => ({ id: `d${i}`, val: 0, leaf: true, dummy: true, seq: seq++, kids: [] }))];
  const steps = [];
  while (pool.length > 1) {
    pool.sort((a, b) => a.val - b.val || a.seq - b.seq);
    const take = pool.slice(0, k);
    const node = { id: `m${seq}`, val: take.reduce((s, x) => s + x.val, 0), seq: seq++, kids: take };
    pool = [...pool.slice(k), node];
    steps.push({ take: take.map((x) => x.val), sum: node.val, forest: [...pool] });
  }
  // WPL = 各段长度 × 深度；读写次数 = 2 × WPL
  let wpl = 0;
  (function walk(t, d) {
    if (t.leaf) wpl += t.val * d;
    else t.kids.forEach((c) => walk(c, d + 1));
  })(pool[0], 0);
  return { ok: true, lens, k, dummies, steps, root: pool[0], wpl, io: 2 * wpl };
}

/** 时间复杂度：几种典型循环，数基本语句执行次数 */
export function countLoop({ kind, n }) {
  if (!(Number.isInteger(n) && n >= 1 && n <= 4096)) return err('n');
  let c = 0;
  const trace = [];
  if (kind === 'double') {
    for (let i = 1; i <= n; i *= 2) {
      c++;
      trace.push(i);
    }
  } else if (kind === 'tri') {
    for (let i = 1; i <= n; i++) for (let j = 1; j <= i; j++) c++;
  } else if (kind === 'nested') {
    for (let i = 1; i <= n; i++) for (let j = 1; j <= n; j *= 2) c++;
  } else if (kind === 'sqrt') {
    let i = 0;
    let s = 0;
    while (s < n) {
      i++;
      s += i;
      c++;
      trace.push(s);
    }
  } else return err('kind');
  return { ok: true, kind, n, count: c, trace };
}
