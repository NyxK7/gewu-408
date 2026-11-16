// 页面置换做题模式：判题、理由、出题约束。期望值全部来自 simulate() 的手工核对。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALGOS } from '../js/subjects/os/paging.js';
import {
  QUIZ_FRAMES,
  correctAnswer,
  explainStep,
  generateQuiz,
  judgeStep,
  quizFrom,
} from '../js/subjects/os/paging-quiz.js';

const CLASSIC = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
const BELADY = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

const quiz = (algo, refs, frames = 3) => quizFrom({ algo, frames, refs });

test('做题：固定题用 simulate 的结果出题', () => {
  const q = quiz('FIFO', CLASSIC);
  assert.equal(q.ok, true);
  assert.equal(q.seed, null);
  assert.equal(q.algo, 'FIFO');
  assert.equal(q.frames, 3);
  assert.deepEqual(q.refs, CLASSIC);
  assert.notEqual(q.refs, CLASSIC, 'refs 应复制，不能和传入数组共用');
  assert.equal(q.sim.faults, 15);
  assert.equal(q.sim.replacements, 12);
  // 参数不合法时原样带回 simulate 的错误
  assert.deepEqual(quiz('NOPE', CLASSIC), { ok: false, errors: ['algo'] });
  assert.deepEqual(quizFrom({ algo: 'FIFO', frames: 3, refs: [] }), { ok: false, errors: ['refs'] });
});

test('做题：FIFO 的命中、空闲块与换出理由', () => {
  const q = quiz('FIFO', CLASSIC);
  // t=3 访问 2：7/0/1 在第 1/2/3 步装入，换出最早装入的 7（块 1）
  assert.equal(q.sim.steps[3].victim, 7);
  assert.equal(judgeStep(q, 3, { kind: 'fault', slot: 0 }).ok, true);
  assert.equal(judgeStep(q, 3, { kind: 'fault', slot: 1 }).slotOk, false);
  assert.equal(judgeStep(q, 3, { kind: 'fault' }).pending, true);
  assert.equal(
    explainStep(q, 3).zh,
    '页 2 不在内存，发生缺页；页 7 在第 1 步装入，是现在内存里最早装入的。',
  );
  // t=0 还有空闲块：只判缺页，不用选块
  const first = judgeStep(q, 0, { kind: 'fault' });
  assert.equal(first.ok, true);
  assert.equal(first.needsSlot, false);
  assert.equal(first.pending, false);
  assert.equal(explainStep(q, 0).zh, '页 7 不在内存，发生缺页；还有空闲块，直接装入块 1。');
  // t=4 访问 0：命中块 2
  const hit = judgeStep(q, 4, { kind: 'hit' });
  assert.equal(hit.ok, true);
  assert.equal(hit.expected.slot, 1);
  assert.equal(explainStep(q, 4).zh, '页 0 已在块 2 中，命中。');
  // 命中题点缺页：判错，但给出正确答案和理由
  const wrong = judgeStep(q, 4, { kind: 'fault' });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.kindOk, false);
  assert.match(wrong.correct.zh, /命中：页 0 已在块 2 中/);
});

test('做题：LRU 看上次访问', () => {
  const q = quiz('LRU', CLASSIC);
  // t=3 换出 7（第 1 步访问）
  assert.equal(q.sim.steps[3].victim, 7);
  assert.equal(
    explainStep(q, 3).zh,
    '页 2 不在内存，发生缺页；页 7 上次被访问是在第 1 步，是这 3 页里最久没用的。',
  );
  // t=5 访问 3：内存 [2,0,1]，上次访问分别是第 4/5/3 步 → 换出 1（块 3）
  assert.equal(q.sim.steps[5].victim, 1);
  assert.equal(q.sim.steps[5].slot, 2);
  assert.equal(
    explainStep(q, 5).zh,
    '页 3 不在内存，发生缺页；页 1 上次被访问是在第 3 步，是这 3 页里最久没用的。',
  );
  assert.equal(judgeStep(q, 5, { kind: 'fault', slot: 2 }).ok, true);
  assert.equal(judgeStep(q, 5, { kind: 'fault', slot: 0 }).ok, false);
  assert.equal(judgeStep(q, 5, { kind: 'hit' }).ok, false);
  // 命中时理由带上次访问步号：t=4 访问 0，上次在第 2 步
  assert.equal(
    explainStep(q, 4).zh,
    '页 0 已在块 2 中，命中；它上次被访问是在第 2 步，这次访问后更新。',
  );
});

test('做题：OPT 看下次访问', () => {
  const q = quiz('OPT', CLASSIC);
  // t=3 访问 2：7 下次在第 18 步、0 在第 5 步、1 在第 14 步 → 换出 7
  assert.equal(q.sim.steps[3].victim, 7);
  assert.equal(
    explainStep(q, 3).zh,
    '页 2 不在内存，发生缺页；页 7 下次访问在第 18 步，是这 3 页里最远的。',
  );
  // t=17 访问 7：2 以后不再访问 → 换出 2（块 1）
  assert.equal(q.sim.steps[17].victim, 2);
  assert.equal(q.sim.steps[17].slot, 0);
  assert.equal(
    explainStep(q, 17).zh,
    '页 7 不在内存，发生缺页；页 2 以后不会再被访问。',
  );
  assert.equal(judgeStep(q, 17, { kind: 'fault', slot: 0 }).ok, true);
  assert.equal(judgeStep(q, 17, { kind: 'fault', slot: 2 }).ok, false);
});

test('做题：CLOCK 的理由写出扫描过程', () => {
  const q = quiz('CLOCK', BELADY);
  // t=3 访问 4：三块访问位都是 1，清一圈后换出块 1 的页 1
  assert.deepEqual(q.sim.steps[3].scan, [
    { slot: 0, action: 'clear' },
    { slot: 1, action: 'clear' },
    { slot: 2, action: 'clear' },
    { slot: 0, action: 'pick' },
  ]);
  assert.equal(
    explainStep(q, 3).zh,
    '页 4 不在内存，发生缺页；指针从块 1 开始：块 1 访问位 1，清 0；块 2 访问位 1，清 0；块 3 访问位 1，清 0；块 1 访问位 0，换出页 1。',
  );
  assert.equal(judgeStep(q, 3, { kind: 'fault', slot: 0 }).ok, true);
  assert.equal(judgeStep(q, 3, { kind: 'fault', slot: 1 }).ok, false);
  // t=4 访问 1：指针已到块 2，访问位 0，直接换出页 2
  assert.equal(q.sim.steps[4].victim, 2);
  assert.equal(
    explainStep(q, 4).zh,
    '页 1 不在内存，发生缺页；指针从块 2 开始：块 2 访问位 0，换出页 2。',
  );
  // t=7 访问 1 命中，访问位置 1，指针不动
  assert.equal(q.sim.steps[7].hit, true);
  assert.equal(
    explainStep(q, 7).zh,
    '页 1 已在块 2 中，命中；它的访问位置 1，指针不动。',
  );
});

test('做题：四种算法答错都给正确答案和双语理由', () => {
  for (const [algo, refs] of [['FIFO', CLASSIC], ['LRU', CLASSIC], ['OPT', CLASSIC], ['CLOCK', BELADY]]) {
    const q = quiz(algo, refs);
    const t = q.sim.steps.findIndex((s) => s.victim != null);
    assert.ok(t >= 0, `${algo} 应有置换步`);
    const s = q.sim.steps[t];
    const r = judgeStep(q, t, { kind: 'hit' });
    assert.equal(r.ok, false);
    assert.equal(r.kindOk, false);
    assert.equal(r.expected.victim, s.victim);
    assert.match(r.correct.zh, new RegExp(`换出页 ${s.victim}`));
    assert.match(r.correct.en, new RegExp(`evict page ${s.victim}`));
    assert.ok(r.reason.zh.length > 0);
    assert.ok(r.reason.en.length > 0);
    assert.notEqual(r.reason.zh, r.reason.en);
  }
});

test('做题：非法判题输入不抛异常', () => {
  const q = quiz('FIFO', CLASSIC);
  assert.deepEqual(judgeStep(null, 0), { ok: false, error: 'quiz' });
  assert.equal(judgeStep(q, -1).error, 'step');
  assert.equal(judgeStep(q, CLASSIC.length).error, 'step');
  assert.equal(judgeStep(q, 1.5).error, 'step');
  assert.equal(judgeStep(q, 0, {}).error, 'answer');
  assert.equal(judgeStep(q, 0, { kind: 'maybe' }).error, 'answer');
  assert.equal(judgeStep(q, 3, { kind: 'fault', slot: '0' }).pending, true);
});

test('做题：种子出题满足比赛约束且可复现', () => {
  assert.deepEqual(QUIZ_FRAMES, [3, 4]);
  for (const algo of ALGOS) {
    for (const frames of QUIZ_FRAMES) {
      for (const seed of [1, 2, 7, 42, 2026]) {
        const q = generateQuiz({ algo, frames, seed });
        assert.equal(q.ok, true);
        assert.equal(q.seed, seed);
        assert.equal(q.algo, algo);
        assert.equal(q.frames, frames);
        assert.ok(q.refs.length >= 12 && q.refs.length <= 18, `${algo}/${frames}/${seed} 长度 ${q.refs.length}`);
        assert.ok(q.refs.every((p) => Number.isInteger(p) && p >= 0 && p <= 7));
        assert.ok(q.sim.replacements >= 3, `${algo}/${frames}/${seed} 置换 ${q.sim.replacements}`);
        // 每一步都能按 simulate 的结果判对，说明题目与答案一致
        q.sim.steps.forEach((s, t) => {
          const r = judgeStep(q, t, { kind: s.hit ? 'hit' : 'fault', slot: s.slot });
          assert.equal(r.ok, true, `${algo}/${frames}/${seed} 第 ${t + 1} 步`);
        });
        // 同一个种子必定是同一道题
        const again = generateQuiz({ algo, frames, seed });
        assert.deepEqual(again.refs, q.refs);
        assert.equal(again.sim.faults, q.sim.faults);
      }
    }
  }
});

test('做题：出题参数校验', () => {
  assert.deepEqual(generateQuiz({ algo: 'NOPE', frames: 3, seed: 1 }), { ok: false, errors: ['algo'] });
  assert.deepEqual(generateQuiz({ algo: 'FIFO', frames: 5, seed: 1 }), { ok: false, errors: ['frames'] });
  assert.deepEqual(generateQuiz({ algo: 'FIFO', frames: 3, seed: 1.5 }), { ok: false, errors: ['seed'] });
  assert.deepEqual(generateQuiz({ algo: 'FIFO', frames: 3, seed: '1' }), { ok: false, errors: ['seed'] });
  // 默认 seed = 1
  assert.equal(generateQuiz({ algo: 'FIFO', frames: 3 }).seed, 1);
  // 随机题只产生 0～7 的页号
  const q = generateQuiz({ algo: 'FIFO', frames: 3, seed: 99 });
  assert.ok(q.refs.every((p) => p >= 0 && p <= 7));
});
