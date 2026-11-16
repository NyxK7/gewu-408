// 串的模式匹配的纯计算：部分匹配值（最长相等前后缀）、next、nextval，BF 与 KMP 的逐次比较。
//
// 约定（界面上写明）：
//   · 程序内部下标从 0 开始；显示 next 时可以选「从 0 开始」或「从 1 开始」两种教材写法：
//       从 0 开始：next[0] = −1，next[j] = P[0..j−1] 的最长相等前后缀长度；
//       从 1 开始：next[1] = 0，next[j] = P[1..j−1] 的最长相等前后缀长度 + 1（就是上一种整体加 1）；
//   · 失配时：KMP 让 j = next[j]（从 0 开始的写法里 j = −1 表示主串指针后移、j 回到 0）；
//   · 比较次数 = 字符比较的次数（每比较一对字符算一次）。

const err = (e) => ({ ok: false, errors: [e] });

/** 部分匹配值 PM[j]：P[0..j] 的最长相等前后缀长度 */
export function pmOf(p) {
  const pm = Array(p.length).fill(0);
  let k = 0;
  for (let j = 1; j < p.length; j++) {
    while (k > 0 && p[j] !== p[k]) k = pm[k - 1];
    if (p[j] === p[k]) k++;
    pm[j] = k;
  }
  return pm;
}

/** next（从 0 开始）：next[0] = −1，next[j] = PM[j − 1] */
export function nextOf(p) {
  const pm = pmOf(p);
  return p.split('').map((_, j) => (j === 0 ? -1 : pm[j - 1]));
}

/** nextval（从 0 开始）：失配后要比较的字符和当前字符相同，就继续往前跳 */
export function nextvalOf(p) {
  const nx = nextOf(p);
  const nv = [...nx];
  for (let j = 1; j < p.length; j++) nv[j] = p[j] === p[nx[j]] ? nv[nx[j]] : nx[j];
  return nv;
}

/** 前 j 个字符 P[0..j−1] 的最长相等前后缀（给动画画框用） */
export function borderOf(p, j) {
  const s = p.slice(0, j);
  for (let k = j - 1; k > 0; k--) if (s.slice(0, k) === s.slice(j - k)) return k;
  return 0;
}

/**
 * 匹配过程。algo：'bf' | 'kmp' | 'kmpval'
 * 返回 rounds：每一「轮」是一段连续比较，直到失配或全部匹配；
 *   { start: 这一轮开始时模式串在主串上的位置, cmps: [{ i, j, eq }], end: 'match' | 'fail' | 'shift', nextJ, nextI }
 */
export function match({ text, pattern, algo = 'kmp' }) {
  if (!text || !pattern) return err('empty');
  if (text.length > 40 || pattern.length > 14) return err('long');
  if (pattern.length > text.length) return err('order');
  const t = text;
  const p = pattern;
  const nx = algo === 'kmpval' ? nextvalOf(p) : nextOf(p);
  const rounds = [];
  let i = 0;
  let j = 0;
  let total = 0;
  let found = -1;
  while (i < t.length && rounds.length < 200) {
    const r = { start: i - j, i0: i, j0: j, cmps: [] };
    while (i < t.length && j < p.length) {
      const eq = t[i] === p[j];
      r.cmps.push({ i, j, eq });
      total++;
      if (!eq) break;
      i++;
      j++;
    }
    if (j === p.length) {
      r.end = 'match';
      found = i - j;
      rounds.push(r);
      break;
    }
    if (i >= t.length) {
      r.end = 'fail';
      rounds.push(r);
      break;
    }
    // 失配
    r.badI = i;
    r.badJ = j;
    if (algo === 'bf') {
      i = i - j + 1;
      j = 0;
    } else {
      const k = nx[j];
      if (k === -1) {
        i++;
        j = 0;
      } else j = k;
    }
    r.end = 'shift';
    r.nextI = i;
    r.nextJ = j;
    if (i - j + p.length > t.length) {
      // 剩下的主串已经不够长，后面不可能匹配
      r.end = 'fail';
      rounds.push(r);
      break;
    }
    rounds.push(r);
  }
  return { ok: true, text: t, pattern: p, algo, next: nextOf(p), nextval: nextvalOf(p), pm: pmOf(p), rounds, total, found };
}
