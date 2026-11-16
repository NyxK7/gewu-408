// 工作集的纯计算：窗口 Δ 滑过访问串，每个时刻的工作集 W(t, Δ) = 最近 Δ 次访问里出现过的页；
// 同时用 LRU 在 F 个页框里跑一遍，看工作集比页框多的时候缺页怎样扎堆。
import { simulate } from './paging.js';

const err = (errors) => ({ ok: false, errors });

export function workingSet({ refs, delta, frames }) {
  const errors = [];
  if (!Array.isArray(refs) || refs.length < 2 || refs.length > 30 || !refs.every((p) => Number.isInteger(p) && p >= 0 && p <= 20)) errors.push('refs');
  if (!Number.isInteger(delta) || delta < 1 || delta > 12) errors.push('delta');
  if (!Number.isInteger(frames) || frames < 1 || frames > 8) errors.push('frames');
  if (errors.length) return err(errors);
  const ws = refs.map((_, t) => [...new Set(refs.slice(Math.max(0, t - delta + 1), t + 1))].sort((a, b) => a - b));
  const sizes = ws.map((w) => w.length);
  const enter = ws.map((w, t) => (t ? w.filter((p) => !ws[t - 1].includes(p)) : [...w]));
  const leave = ws.map((w, t) => (t ? ws[t - 1].filter((p) => !w.includes(p)) : []));
  const lru = simulate({ algo: 'LRU', frames, refs });
  const fault = lru.steps.map((s) => !s.hit);
  const maxW = Math.max(...sizes);
  const avgW = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  // 页框数取到最大工作集（最多 8）时 LRU 的缺页数，作对比
  const fit = Math.min(8, maxW);
  const fitFaults = simulate({ algo: 'LRU', frames: fit, refs }).faults;
  // 工作集超过页框数的时刻里，缺页的比例
  const over = sizes.map((w) => w > frames);
  const overT = over.filter(Boolean).length;
  const overFaults = fault.filter((f, t) => f && over[t]).length;
  return { ok: true, refs, delta, frames, ws, sizes, enter, leave, fault, faults: lru.faults, frameState: lru.steps.map((s) => s.after.frames), maxW, avgW, fit, fitFaults, overT, overFaults };
}
