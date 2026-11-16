// 题库：把各科的题目定义合在一起，按需「出题」（生成题用种子算出具体的数字和答案）。
import { CO_QUESTIONS } from './q-co.js';
import { CO_QUESTIONS2 } from './q-co2.js';
import { CO_QUESTIONS3 } from './q-co3.js';
import { DS_QUESTIONS } from './q-ds.js';
import { DS_QUESTIONS2 } from './q-ds2.js';
import { DS_QUESTIONS3 } from './q-ds3.js';
import { NET_QUESTIONS } from './q-net.js';
import { NET_QUESTIONS2 } from './q-net2.js';
import { NET_QUESTIONS3 } from './q-net3.js';
import { OS_QUESTIONS } from './q-os.js';
import { OS_QUESTIONS2 } from './q-os2.js';
import { OS_QUESTIONS3 } from './q-os3.js';
import { BIG_QUESTIONS } from './q-big.js';
import { BIG_QUESTIONS2 } from './q-big2.js';
import { FALLOC_QUESTIONS } from './q-falloc.js';
import { GAP_QUESTIONS } from './q-gaps.js';
import { SORT_QUESTIONS } from './q-sort.js';
import { SYNC_QUESTIONS } from './q-sync.js';
import { rng, seedOf } from './kit.js';

export const DEFS = [...DS_QUESTIONS, ...DS_QUESTIONS2, ...DS_QUESTIONS3, ...SORT_QUESTIONS, ...CO_QUESTIONS, ...CO_QUESTIONS2, ...CO_QUESTIONS3, ...OS_QUESTIONS, ...OS_QUESTIONS2, ...OS_QUESTIONS3, ...NET_QUESTIONS, ...NET_QUESTIONS2, ...NET_QUESTIONS3, ...GAP_QUESTIONS, ...FALLOC_QUESTIONS, ...SYNC_QUESTIONS, ...BIG_QUESTIONS, ...BIG_QUESTIONS2];
const byId = new Map(DEFS.map((d) => [d.id, d]));

export const TYPE_NAME = {
  single: ['单选', 'Single choice'],
  multi: ['多选', 'Multiple choice'],
  judge: ['判断', 'True / false'],
  number: ['填数', 'Number'],
  text: ['填空', 'Fill in'],
  big: ['综合题', 'Problem'],
  essay: ['简答', 'Written'],
};

/** 出一道具体的题。seed 不给时用题号算出的固定种子，同一道题总是同一组数 */
export function questionOf(id, seed) {
  const d = byId.get(id);
  if (!d) return null;
  const s = seed ?? seedOf(id);
  const body = d.make ? d.make(rng(s)) : {};
  const q = { ...d, ...body, seed: s, generated: !!d.make };
  if (q.type === 'big') {
    // 各小问的解析接成整道题的解析；k0 是这一问的第一步在整道题里的序号
    let k = 0;
    q.parts = q.parts.map((p, i) => {
      const r = { ...p, k0: k };
      k += p.steps.length;
      return r;
    });
    q.steps = q.parts.flatMap((p, i) => p.steps.map((st) => ({ ...st, part: i })));
  }
  return q;
}

export const defOf = (id) => byId.get(id);

/** 按范围挑题：{ lesson } / { subject, chapter } / { subject } / 全部 */
export function idsFor(scope = {}) {
  return DEFS.filter((d) => {
    if (scope.type && d.type !== scope.type) return false;
    if (scope.lesson) return d.lessons.includes(scope.lesson);
    if (scope.subject && d.subject !== scope.subject) return false;
    if (scope.chapter && d.chapter !== scope.chapter) return false;
    return true;
  }).map((d) => d.id);
}

export const countFor = (scope) => idsFor(scope).length;
