// 做题记录：每道题最近一次对不对、对错次数，错题本和收藏。都存在浏览器本地。
const K = (k) => `408viz:qz:${k}`;
const get = (k, d) => {
  try {
    const v = localStorage.getItem(K(k));
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem(K(k), JSON.stringify(v));
  } catch {}
};

export const rec = () => get('rec', {});

/** 记一次作答。答错自动进错题本；在错题本里答对就移出去 */
export function record(id, ok, { fromWrong = false } = {}) {
  const r = rec();
  const x = r[id] ?? { ok: 0, bad: 0 };
  x[ok ? 'ok' : 'bad']++;
  x.last = ok;
  x.at = Date.now();
  r[id] = x;
  set('rec', r);
  const w = new Set(get('wrong', []));
  if (!ok) w.add(id);
  else if (fromWrong) w.delete(id);
  set('wrong', [...w]);
}

export const wrongIds = () => get('wrong', []);
export const starIds = () => get('star', []);
export const isWrong = (id) => wrongIds().includes(id);
export const isStar = (id) => starIds().includes(id);

export function toggle(list, id) {
  const s = new Set(get(list, []));
  if (s.has(id)) s.delete(id);
  else s.add(id);
  set(list, [...s]);
  return s.has(id);
}

/** 一组题的统计：做过几道、最近一次答对几道 */
export function statsOf(ids) {
  const r = rec();
  const done = ids.filter((id) => r[id]);
  const right = done.filter((id) => r[id].last).length;
  return { total: ids.length, done: done.length, right, rate: done.length ? right / done.length : null };
}
