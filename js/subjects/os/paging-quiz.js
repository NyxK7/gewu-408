// 页面置换做题模式的纯逻辑：固定题 / 随机出题、判一步、生成理由。不碰 DOM，Node 里直接跑。
// 正确答案只来自 paging.js 的 simulate()；理由只用该步的 before / next / scan，不另算置换。
import { T } from '../../core/i18n.js';
import { ALGOS, simulate } from './paging.js';

export const QUIZ_FRAMES = [3, 4];

/** 用给定的算法、块数和访问串组一道题（参数可调的课程进入做题模式时用） */
export function quizFrom({ algo, frames, refs, seed = null }) {
  const sim = simulate({ algo, frames, refs });
  if (!sim.ok) return { ok: false, errors: sim.errors };
  return { ok: true, seed, algo: sim.algo, frames: sim.n, refs: [...sim.refs], sim };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 种子随机出题：访问串 12～18 个页号（0～7），块数 3 或 4，至少 3 次置换。
 * 同一个种子 + 同样的算法和块数，永远得到同一道题。
 */
export function generateQuiz({ algo, frames, seed = 1 }) {
  if (!ALGOS.includes(algo)) return { ok: false, errors: ['algo'] };
  if (!QUIZ_FRAMES.includes(frames)) return { ok: false, errors: ['frames'] };
  if (!Number.isInteger(seed)) return { ok: false, errors: ['seed'] };
  const s = seed >>> 0;
  const rand = mulberry32(s);
  for (let attempt = 0; attempt < 200; attempt++) {
    const n = 12 + Math.floor(rand() * 7);
    const refs = Array.from({ length: n }, () => Math.floor(rand() * 8));
    const quiz = quizFrom({ algo, frames, refs, seed: s });
    if (quiz.ok && quiz.sim.replacements >= 3) return quiz;
  }
  // 极端情况下退回一条必定产生置换的串（长度和页号范围仍符合要求）
  return quizFrom({ algo, frames, refs: [0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3], seed: s });
}

/** 这一步的正确答案（用于答错时显示） */
export function correctAnswer(quiz, t) {
  const s = quiz.sim.steps[t];
  if (s.hit) return T(`命中：页 ${s.page} 已在块 ${s.slot + 1} 中`, `Hit: page ${s.page} is already in frame ${s.slot + 1}`);
  if (s.victim == null) return T(`缺页：页 ${s.page} 不在内存，装入块 ${s.slot + 1}`, `Fault: page ${s.page} is not in memory; load it into frame ${s.slot + 1}`);
  return T(`缺页：换出页 ${s.victim}（块 ${s.slot + 1}），装入页 ${s.page}`, `Fault: evict page ${s.victim} from frame ${s.slot + 1} and load page ${s.page}`);
}

/** 这一步为什么是这个结果：FIFO 看装入时刻，LRU 看上次访问，OPT 看下次访问，CLOCK 写出扫描过程。 */
export function explainStep(quiz, t) {
  const s = quiz.sim.steps[t];
  const b = s.before;
  const n = quiz.frames;
  if (s.hit) {
    if (quiz.algo === 'LRU') {
      return T(
        `页 ${s.page} 已在块 ${s.slot + 1} 中，命中；它上次被访问是在第 ${b.lastUse[s.slot] + 1} 步，这次访问后更新。`,
        `Page ${s.page} is already in frame ${s.slot + 1}: a hit. It was last used at step ${b.lastUse[s.slot] + 1}, and that record is refreshed.`,
      );
    }
    if (quiz.algo === 'CLOCK') {
      return T(
        `页 ${s.page} 已在块 ${s.slot + 1} 中，命中；它的访问位置 1，指针不动。`,
        `Page ${s.page} is already in frame ${s.slot + 1}: a hit. Its use bit is set to 1 and the hand stays put.`,
      );
    }
    return T(`页 ${s.page} 已在块 ${s.slot + 1} 中，命中。`, `Page ${s.page} is already in frame ${s.slot + 1}: a hit.`);
  }

  if (s.victim == null) {
    return T(
      `页 ${s.page} 不在内存，发生缺页；还有空闲块，直接装入块 ${s.slot + 1}。`,
      `Page ${s.page} is not in memory (page fault). A frame is free, so it goes into frame ${s.slot + 1}.`,
    );
  }

  const head = `页 ${s.page} 不在内存，发生缺页；`;
  if (quiz.algo === 'FIFO') {
    return T(
      `${head}页 ${s.victim} 在第 ${b.loadedAt[s.slot] + 1} 步装入，是现在内存里最早装入的。`,
      `Page ${s.page} is not in memory (page fault). Page ${s.victim} was loaded at step ${b.loadedAt[s.slot] + 1}, the earliest of all pages in memory.`,
    );
  }
  if (quiz.algo === 'LRU') {
    return T(
      `${head}页 ${s.victim} 上次被访问是在第 ${b.lastUse[s.slot] + 1} 步，是这 ${n} 页里最久没用的。`,
      `Page ${s.page} is not in memory (page fault). Page ${s.victim} was last used at step ${b.lastUse[s.slot] + 1}, the least recently used of the ${n} pages in memory.`,
    );
  }
  if (quiz.algo === 'OPT') {
    const next = s.next[s.slot];
    if (next === Infinity) {
      return T(
        `${head}页 ${s.victim} 以后不会再被访问。`,
        `Page ${s.page} is not in memory (page fault). Page ${s.victim} is never used again.`,
      );
    }
    return T(
      `${head}页 ${s.victim} 下次访问在第 ${next + 1} 步，是这 ${n} 页里最远的。`,
      `Page ${s.page} is not in memory (page fault). Page ${s.victim} is next used at step ${next + 1}, the farthest away of the ${n} pages in memory.`,
    );
  }

  const traceZh = s.scan.map((x) => {
    if (x.action === 'clear') return `块 ${x.slot + 1} 访问位 1，清 0`;
    if (x.action === 'pick') return `块 ${x.slot + 1} 访问位 0，换出页 ${b.frames[x.slot]}`;
    return `块 ${x.slot + 1} 是空的，装入页 ${s.page}`;
  });
  const traceEn = s.scan.map((x) => {
    if (x.action === 'clear') return `frame ${x.slot + 1}: use 1 → 0`;
    if (x.action === 'pick') return `frame ${x.slot + 1}: use 0 → evict page ${b.frames[x.slot]}`;
    return `frame ${x.slot + 1}: empty → load page ${s.page}`;
  });
  return T(
    `${head}指针从块 ${b.ptr + 1} 开始：${traceZh.join('；')}。`,
    `Page ${s.page} is not in memory (page fault). The hand starts at frame ${b.ptr + 1}: ${traceEn.join('; ')}.`,
  );
}

/**
 * 判定一步作答。answer = { kind: 'hit' | 'fault', slot? }。
 * - 命中/缺页判对、且这一步要选换出块时，未给 slot 返回 pending，让界面继续问块；
 * - 答错时仍返回正确答案 correct 和理由 reason。
 */
export function judgeStep(quiz, t, answer = {}) {
  if (!quiz?.ok) return { ok: false, error: 'quiz' };
  if (!Number.isInteger(t) || t < 0 || t >= quiz.sim.steps.length) return { ok: false, error: 'step' };
  const s = quiz.sim.steps[t];
  const expected = { kind: s.hit ? 'hit' : 'fault', page: s.page, slot: s.slot, victim: s.victim };
  const result = {
    ok: false,
    step: t,
    expected,
    needsSlot: !s.hit && s.victim != null,
    pending: false,
    kindOk: false,
    slotOk: null,
    correct: correctAnswer(quiz, t),
    reason: explainStep(quiz, t),
  };
  if (answer.kind !== 'hit' && answer.kind !== 'fault') return { ...result, error: 'answer' };
  result.kindOk = answer.kind === expected.kind;
  if (!result.kindOk) return result;
  if (!result.needsSlot) return { ...result, ok: true };
  if (!Number.isInteger(answer.slot)) return { ...result, pending: true };
  result.slotOk = answer.slot === s.slot;
  result.ok = result.slotOk;
  return result;
}
