// 页面置换算法的纯计算：FIFO / LRU / OPT / CLOCK。Node 里也能跑（见 tests/os.test.mjs）。
// 约定（与常见 408 题目一致）：
//   · 开始时内存块都是空的，最初装入的几页也算缺页；缺页率 = 缺页次数 / 访问次数；
//   · 有空闲块时按块号顺序装入，不发生置换；
//   · OPT 若有多页以后都不再访问，换出其中最早装入的（不影响缺页次数）；
//   · 简单 CLOCK：页面装入或被访问时访问位置 1；缺页时从指针处循环扫描，访问位为 1 则清 0 并前进，
//     为 0 则换出该页；新页装入后指针指向下一块。命中不移动指针。

export const ALGOS = ['FIFO', 'LRU', 'OPT', 'CLOCK'];

export function simulate({ algo, frames: n, refs }) {
  const errors = [];
  if (!ALGOS.includes(algo)) errors.push('algo');
  if (!Number.isInteger(n) || n < 1 || n > 8) errors.push('frames');
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 30) errors.push('refs');
  if (errors.length) return { ok: false, errors };

  const frames = Array(n).fill(null);
  const loadedAt = Array(n).fill(-1);
  const lastUse = Array(n).fill(-1);
  const use = Array(n).fill(0);
  let ptr = 0;
  const nextUse = (p, t) => {
    for (let j = t + 1; j < refs.length; j++) if (refs[j] === p) return j;
    return Infinity;
  };
  const state = () => ({ frames: [...frames], loadedAt: [...loadedAt], lastUse: [...lastUse], use: [...use], ptr });

  const steps = [];
  let faults = 0;
  let replacements = 0;
  refs.forEach((page, t) => {
    const before = state();
    const next = frames.map((p) => (p == null ? null : nextUse(p, t)));
    const hitSlot = frames.indexOf(page);
    if (hitSlot >= 0) {
      lastUse[hitSlot] = t;
      if (algo === 'CLOCK') use[hitSlot] = 1;
      steps.push({ t, page, hit: true, slot: hitSlot, victim: null, before, next, after: state(), faults, replacements });
      return;
    }
    faults++;
    let slot;
    const scan = [];
    if (algo === 'CLOCK') {
      for (;;) {
        if (frames[ptr] == null) {
          scan.push({ slot: ptr, action: 'empty' });
          slot = ptr;
          break;
        }
        if (use[ptr] === 0) {
          scan.push({ slot: ptr, action: 'pick' });
          slot = ptr;
          break;
        }
        use[ptr] = 0;
        scan.push({ slot: ptr, action: 'clear' });
        ptr = (ptr + 1) % n;
      }
    } else {
      const empty = frames.indexOf(null);
      if (empty >= 0) slot = empty;
      else {
        const idx = [...frames.keys()];
        if (algo === 'FIFO') slot = idx.reduce((a, b) => (loadedAt[b] < loadedAt[a] ? b : a));
        if (algo === 'LRU') slot = idx.reduce((a, b) => (lastUse[b] < lastUse[a] ? b : a));
        if (algo === 'OPT') slot = idx.reduce((a, b) => (next[b] > next[a] || (next[b] === next[a] && loadedAt[b] < loadedAt[a]) ? b : a));
      }
    }
    const victim = frames[slot];
    if (victim != null) replacements++;
    frames[slot] = page;
    loadedAt[slot] = t;
    lastUse[slot] = t;
    use[slot] = 1;
    if (algo === 'CLOCK') ptr = (slot + 1) % n;
    steps.push({ t, page, hit: false, slot, victim, before, next, scan, after: state(), faults, replacements });
  });
  return { ok: true, algo, n, refs, steps, faults, replacements, rate: faults / refs.length };
}
