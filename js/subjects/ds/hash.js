// 散列表的纯计算：H(key) = (a × key) mod p，冲突处理用线性探测、平方探测或拉链法；算 ASL 成功 / 失败。
// 约定（与 408 常见答案一致，界面上写明）：
//   · 开放定址法的探测在表长 m 内循环；平方探测的增量序列为 0, +1², −1², +2², −2², …；
//   · 查找成功的比较次数 = 插入时探测到它所在位置用的次数；ASL成功 = 各关键字比较次数之和 ÷ 关键字个数；
//   · 开放定址法查找失败：从 H = 0 … p−1 各自出发，一直探测到空位置为止，和空位置的那次比较也算；ASL失败 = 总和 ÷ p；
//   · 拉链法：新关键字接在链尾；查找失败只数和关键字的比较（空指针不算），ASL失败 = 各链长度之和 ÷ p。

export const METHODS = ['linear', 'quad', 'chain'];

const mod = (x, m) => ((x % m) + m) % m;

/** 平方探测的第 i 个增量：0, 1, -1, 4, -4, 9, -9, … */
export const quadInc = (i) => {
  if (i === 0) return 0;
  const k = Math.ceil(i / 2);
  return i % 2 ? k * k : -k * k;
};

export function probeSeq(h, i, m, method) {
  return method === 'quad' ? mod(h + quadInc(i), m) : mod(h + i, m);
}

export function simulate({ keys, m, p, a = 1, method = 'linear' }) {
  const errors = [];
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 15) errors.push('keys');
  if (!(m >= 2 && m <= 20)) errors.push('m');
  if (!(p >= 1 && p <= m)) errors.push('p');
  if (!(a >= 1 && a <= 99)) errors.push('a');
  if (keys && new Set(keys).size !== keys.length) errors.push('dup');
  if (method !== 'chain' && keys?.length > m) errors.push('tooMany');
  if (errors.length) return { ok: false, errors };

  const H = (k) => mod(a * k, p);
  const table = Array(m).fill(null);
  const chains = Array.from({ length: m }, () => []);
  const steps = [];
  for (const k of keys) {
    const h = H(k);
    if (method === 'chain') {
      chains[h].push(k);
      steps.push({ key: k, h, slot: h, probes: chains[h].length, path: [h], chainPos: chains[h].length - 1 });
      continue;
    }
    const path = [];
    let placed = null;
    for (let i = 0; i < m; i++) {
      const d = probeSeq(h, i, m, method);
      path.push(d);
      if (table[d] === null) {
        table[d] = k;
        placed = d;
        break;
      }
    }
    if (placed === null) return { ok: false, errors: ['full'], failKey: k };
    steps.push({ key: k, h, slot: placed, probes: path.length, path });
  }

  // ASL 成功
  const succ = steps.map((s) => s.probes);
  const succSum = succ.reduce((x, y) => x + y, 0);
  // ASL 失败：H = 0 … p−1
  const fail = [];
  for (let h = 0; h < p; h++) {
    if (method === 'chain') {
      fail.push({ h, count: chains[h].length, path: [] });
      continue;
    }
    const path = [];
    for (let i = 0; i < m; i++) {
      const d = probeSeq(h, i, m, method);
      path.push(d);
      if (table[d] === null) break;
    }
    fail.push({ h, count: path.length, path });
  }
  const failSum = fail.reduce((x, f) => x + f.count, 0);
  return { ok: true, method, m, p, a, keys, table, chains, steps, succ: [succSum, keys.length], fail: [failSum, p], failRows: fail, load: [keys.length, m] };
}
