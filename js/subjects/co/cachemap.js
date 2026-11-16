// Cache 映射与命中率的纯计算：给定主存块号的访问序列，按直接映射 / 组相联 / 全相联逐次判断命中，
// 替换算法 LRU 或 FIFO。组号 = 块号 mod 组数；有空行先放空行（行号小的优先）。

export function simulate({ lines, ways = 1, policy = 'LRU', seq }) {
  const errors = [];
  if (!Number.isInteger(lines) || lines < 1 || lines > 16) errors.push('lines');
  const W = ways === 0 ? lines : ways;
  if (!Number.isInteger(W) || W < 1 || lines % W) errors.push('ways');
  if (!['LRU', 'FIFO'].includes(policy)) errors.push('policy');
  if (!Array.isArray(seq) || seq.length < 1 || seq.length > 30) errors.push('seq');
  if (errors.length) return { ok: false, errors };

  const sets = lines / W;
  const cache = Array.from({ length: sets }, () => Array(W).fill(null));
  const steps = [];
  let hits = 0;
  seq.forEach((b, t) => {
    const s = b % sets;
    const row = cache[s];
    const before = row.map((x) => (x ? { ...x } : null));
    const w = row.findIndex((x) => x && x.block === b);
    if (w >= 0) {
      hits++;
      row[w].lastUse = t;
      steps.push({ t, block: b, set: s, hit: true, way: w, victim: null, before, after: snap(), hits });
      return;
    }
    let way = row.findIndex((x) => x === null);
    if (way < 0) {
      const key = policy === 'LRU' ? 'lastUse' : 'loadedAt';
      way = 0;
      for (let i = 1; i < W; i++) if (row[i][key] < row[way][key]) way = i;
    }
    const victim = row[way]?.block ?? null;
    row[way] = { block: b, loadedAt: t, lastUse: t };
    steps.push({ t, block: b, set: s, hit: false, way, victim, before, after: snap(), hits });
  });
  function snap() {
    return cache.map((r) => r.map((x) => (x ? { ...x } : null)));
  }
  return { ok: true, lines, W, sets, policy, seq, steps, hits, misses: seq.length - hits };
}

/** 同一个序列在几种映射方式下的命中次数，给小结用 */
export function compare({ lines, policy, seq }) {
  const out = [];
  for (const w of [1, 2, 4, 0]) {
    const W = w === 0 ? lines : w;
    if (W > lines || lines % W || (w !== 0 && W === lines)) continue;
    const r = simulate({ lines, ways: w, policy, seq });
    if (r.ok) out.push({ ways: w, hits: r.hits });
  }
  return out;
}
