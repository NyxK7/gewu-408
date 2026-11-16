// 题库的公共工具：可复现的随机数、题目判分、答案的显示。
//
// 一道题（定义）：
//   id, subject, chapter, topic: T, type, difficulty: 1 | 2 | 3, lessons: [课程 id], tags: [string]
//   conv: T          这道题依赖的约定（下标从几开始、按字节还是按字编址……），会显示在题干下面
//   静态题直接写 question / options / answer / steps；
//   生成题写 make(rng)，返回 { question, options?, answer, steps, ... }，答案由课程的计算代码算出。
//
// type：
//   single  单选，answer 是选项下标
//   multi   多选，answer 是下标数组（升序）
//   judge   判断，answer 是 true / false
//   number  填数，answer = { value, tol?, show? }；show 是给人看的写法（比如分数 12/7）
//   text    填空，answer = { accept: [可接受的写法], show }，比较时忽略空格和大小写
//
//   big     综合题（大题）：题干 question，可选的材料 material = { title: T, text }（等宽显示，比如报文的十六进制），
//           小问 parts = [{ ask: T, pts, type, answer / options / steps … }]。小问的 type 是上面几种之一，
//           或者 essay（写思路、写代码，不能自动判分）：ref = { text?: T, code?: T } 是参考答案，
//           rubric = [{ text: T, pts }] 是评分要点，看完参考答案后自己对照打勾。
//           出题时（bank.js 的 questionOf）把各小问的 steps 依次接成整道题的 steps，每步带上 part 小问序号。
//
// steps：分步解析 [{ text: T, go?: { lesson, params?, step?, doc? } }]
//   go 让这一步可以「回到动画」：打开某节课，用这组参数，停在第几步（或打开原理页的某一节）。

export function rng(seed) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle(arr) {
      const a2 = [...arr];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
    /** lo..hi 里不重复的 n 个整数 */
    distinct(n, lo, hi) {
      const s = new Set();
      while (s.size < n) s.add(int(lo, hi));
      return [...s];
    },
  };
}

/** 题号 → 稳定的种子：同一道生成题默认总是同一组数 */
export function seedOf(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** 把正确选项和干扰项打乱，返回 { options, answer } */
export function shuffled(r, right, wrongs) {
  const all = r.shuffle([right, ...wrongs]);
  return { options: all, answer: all.indexOf(right) };
}

const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();

/** 判分：给出用户的作答，返回 true / false；没作答返回 null */
export function judge(q, input) {
  if (input == null || input === '' || (Array.isArray(input) && !input.length)) return null;
  switch (q.type) {
    case 'single':
      return input === q.answer;
    case 'multi':
      return JSON.stringify([...input].sort((a, b) => a - b)) === JSON.stringify(q.answer);
    case 'judge':
      return input === q.answer;
    case 'number': {
      const s = String(input).trim();
      let v;
      const fr = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
      if (fr) v = Number(fr[1]) / Number(fr[2]);
      else v = Number(s.replace(/%$/, ''));
      if (!Number.isFinite(v)) return false;
      return Math.abs(v - q.answer.value) <= (q.answer.tol ?? 1e-9);
    }
    case 'text':
      return q.answer.accept.some((a) => norm(a) === norm(input));
    default:
      return false;
  }
}

/** 综合题的得分。inputs：各小问的作答；marks：essay 小问里勾上的评分要点（下标数组）。
 *  返回 { got, total, auto, autoOk, parts: [{ ok: true | false | null, got, pts }] }；ok 为 null 表示没作答或要自评 */
export function gradeBig(q, inputs = [], marks = []) {
  const parts = q.parts.map((p, i) => {
    if (p.type === 'essay') {
      const got = (marks[i] ?? []).reduce((a, j) => a + (p.rubric[j]?.pts ?? 0), 0);
      return { ok: null, got, pts: p.pts, essay: true };
    }
    const ok = judge(p, inputs[i]);
    return { ok, got: ok ? p.pts : 0, pts: p.pts };
  });
  const auto = parts.filter((x) => !x.essay);
  return { got: parts.reduce((a, x) => a + x.got, 0), total: parts.reduce((a, x) => a + x.pts, 0), auto: auto.length, autoOk: auto.filter((x) => x.ok).length, parts };
}

export const r2 = (x) => Math.round(x * 100) / 100;

// ───── 题目 → 课程的链接 ─────
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const packParams = (o) => b64(JSON.stringify(o));
export function unpackParams(s) {
  try {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(t + '='.repeat((4 - (t.length % 4)) % 4)))));
  } catch {
    return null;
  }
}

/** go = { lesson, params?, step?, doc? } → 课程链接；extra 是附加的查询参数 */
export function lessonHash(go, extra = {}) {
  const q = new URLSearchParams();
  if (go.params) q.set('p', packParams(go.params));
  if (go.doc) q.set('doc', go.doc);
  else if (go.step != null) q.set('step', String(go.step));
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return `#/l/${go.lesson}${s ? '?' + s : ''}`;
}
