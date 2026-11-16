// 题库检查：每道题（生成题换 40 组数）都要格式正确、答案能被判对、选项不重复、中英文齐全，
// 解析里「回到动画」的每一处都能打开：课程存在、参数合法、步数没有越界、原理小节存在。
import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonById } from '../js/catalog.js';
import { DEFS, idsFor, questionOf } from '../js/quiz/bank.js';
import { gradeBig, judge } from '../js/quiz/kit.js';
import { simulate as pageSim } from '../js/subjects/os/paging.js';
import { SUBJECTS } from '../js/syllabus.js';

const isT = (v) => v && typeof v === 'object' && typeof v.zh === 'string' && v.zh && typeof v.en === 'string' && v.en;
const txt = (v) => (typeof v === 'string' ? v : v.zh);

function checkGo(go, where) {
  const base = lessonById(go.lesson);
  assert.ok(base, `${where}: 课程 ${go.lesson} 不存在`);
  const lesson = go.params ? base.update(go.params) : base;
  assert.deepEqual(lesson.errors ?? [], [], `${where}: 参数不合法 ${JSON.stringify(go.params)}`);
  if (go.step != null) assert.ok(go.step >= 0 && go.step < lesson.steps.length, `${where}: 第 ${go.step} 步越界（共 ${lesson.steps.length} 步）`);
  if (go.doc) assert.ok(lesson.principle?.sections.some((s) => s.id === go.doc), `${where}: 原理小节 ${go.doc} 不存在`);
}

function checkOne(q, where) {
  // 拼字符串时漏了字段，会在题面或解析里出现 undefined / NaN（只看中文，英文里可能正常地出现 undefined 这个词）
  const zhOnly = (k, v) => (v && typeof v === 'object' && typeof v.zh === 'string' && typeof v.en === 'string' ? v.zh : v);
  const shown = JSON.stringify([q.question, q.options, q.steps?.map((s) => s.text), q.parts?.map((p) => [p.ask, p.options, p.ref, p.rubric]), q.material], zhOnly);
  assert.ok(!/undefined|NaN/.test(shown), `${where}: 文字里出现 undefined 或 NaN`);
  assert.ok(isT(q.question), `${where}: 题干要有中英文`);
  assert.ok(isT(q.topic), `${where}: 考点要有中英文`);
  if (q.conv) assert.ok(isT(q.conv), `${where}: 约定要有中英文`);
  assert.ok(q.steps?.length, `${where}: 没有解析`);
  for (const [i, s] of q.steps.entries()) {
    assert.ok(isT(s.text), `${where} 解析第 ${i + 1} 步要有中英文`);
    if (s.go) checkGo(s.go, `${where} 解析第 ${i + 1} 步`);
  }
  if (q.type === 'single' || q.type === 'multi') {
    assert.ok(q.options.length >= 3, `${where}: 选项太少`);
    const texts = q.options.map(txt);
    assert.equal(new Set(texts).size, texts.length, `${where}: 选项重复 ${texts.join(' / ')}`);
    for (const o of q.options) assert.ok(typeof o === 'string' || isT(o), `${where}: 选项格式`);
  }
  if (q.type === 'single') {
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${where}: 单选答案越界`);
    assert.equal(judge(q, q.answer), true);
    assert.equal(judge(q, (q.answer + 1) % q.options.length), false);
  } else if (q.type === 'multi') {
    assert.ok(q.answer.length >= 2, `${where}: 多选至少两个正确项`);
    assert.deepEqual(q.answer, [...q.answer].sort((a, b) => a - b), `${where}: 多选答案要升序`);
    assert.ok(q.answer.every((a) => a >= 0 && a < q.options.length));
    assert.equal(judge(q, [...q.answer].reverse()), true);
    assert.equal(judge(q, q.answer.slice(1)), false);
  } else if (q.type === 'judge') {
    assert.equal(typeof q.answer, 'boolean');
    assert.equal(judge(q, q.answer), true);
    assert.equal(judge(q, !q.answer), false);
  } else if (q.type === 'number') {
    assert.ok(Number.isFinite(q.answer.value), `${where}: 数值答案`);
    assert.equal(judge(q, String(q.answer.value)), true);
    if (q.answer.show) assert.equal(judge(q, q.answer.show), true, `${where}: 「${q.answer.show}」应该算对`);
    assert.equal(judge(q, String(q.answer.value + 1)), false);
  } else if (q.type === 'text') {
    assert.ok(q.answer.accept.length && q.answer.show);
    assert.equal(judge(q, ` ${q.answer.show} `), true);
  } else if (q.type === 'big') {
    assert.ok(q.parts?.length >= 2, `${where}: 综合题至少两问`);
    const right = [];
    for (const [i, p] of q.parts.entries()) {
      const w = `${where}(${i + 1})`;
      assert.ok(isT(p.ask), `${w}: 小问要有中英文`);
      assert.ok(Number.isInteger(p.pts) && p.pts > 0, `${w}: 分值`);
      assert.ok(p.steps?.length, `${w}: 每一问都要有解析`);
      if (p.type === 'essay') {
        assert.ok(isT(p.ref?.text) || isT(p.ref?.code), `${w}: 参考答案`);
        assert.ok(p.rubric?.length && p.rubric.every((r) => isT(r.text) && r.pts > 0), `${w}: 评分要点`);
        assert.equal(p.rubric.reduce((a, r) => a + r.pts, 0), p.pts, `${w}: 评分要点的分数加起来要等于这一问的分值`);
        right.push('');
      } else {
        checkOne({ ...p, question: p.ask, topic: q.topic }, w);
        right.push(p.type === 'number' ? String(p.answer.value) : p.type === 'text' ? p.answer.show : p.answer);
      }
    }
    // 自动判分的小问全答对、要点全勾上，就是满分
    const marks = q.parts.map((p) => (p.type === 'essay' ? p.rubric.map((_, j) => j) : []));
    const g = gradeBig(q, right, marks);
    assert.equal(g.got, g.total, `${where}: 全对应该满分`);
    assert.equal(g.autoOk, g.auto);
    assert.equal(q.steps.length, q.parts.reduce((a, p) => a + p.steps.length, 0));
  } else assert.fail(`${where}: 未知题型 ${q.type}`);
}

test('题库：题号唯一，科目、章节、相关课程都存在', () => {
  const ids = DEFS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of DEFS) {
    const subj = SUBJECTS.find((s) => s.id === d.subject);
    assert.ok(subj, `${d.id}: 科目 ${d.subject}`);
    assert.ok(subj.chapters.some((c) => c.id === d.chapter), `${d.id}: 章 ${d.chapter}`);
    assert.ok(d.lessons.length && d.lessons.every((l) => lessonById(l)), `${d.id}: 相关课程`);
    assert.ok([1, 2, 3].includes(d.difficulty), `${d.id}: 难度`);
    assert.ok(Array.isArray(d.tags));
  }
});

test('题库：每道题（生成题换 40 组数）格式、答案、解析跳转都正确', () => {
  for (const d of DEFS) {
    const seeds = d.make ? Array.from({ length: 40 }, (_, i) => 1000 + i * 7919) : [undefined];
    for (const s of seeds) checkOne(questionOf(d.id, s), `${d.id}#${s ?? '-'}`);
  }
});

test('题库：同一个种子出同一道题，默认种子固定', () => {
  for (const d of DEFS.filter((x) => x.make)) {
    assert.deepEqual(JSON.stringify(questionOf(d.id)), JSON.stringify(questionOf(d.id)));
    assert.deepEqual(JSON.stringify(questionOf(d.id, 42)), JSON.stringify(questionOf(d.id, 42)));
  }
});

test('题库：按课程、章节、科目挑题', () => {
  assert.ok(idsFor({ lesson: 'cqueue' }).includes('ds-cq-01'));
  const mem = idsFor({ subject: 'os', chapter: 'memory' });
  assert.ok(mem.includes('os-page-01') && !mem.includes('os-bank-01'));
  assert.ok(mem.every((id) => DEFS.find((d) => d.id === id).chapter === 'memory'));
  assert.equal(idsFor().length, DEFS.length);
});

test('手算核对：Belady 异常的例子、判分的写法', () => {
  const refs = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
  assert.equal(pageSim({ algo: 'FIFO', frames: 3, refs }).faults, 9);
  assert.equal(pageSim({ algo: 'FIFO', frames: 4, refs }).faults, 10);
  const q = { type: 'number', answer: { value: 12 / 7, tol: 0.006 } };
  assert.equal(judge(q, '12/7'), true);
  assert.equal(judge(q, '1.71'), true);
  assert.equal(judge(q, '1.8'), false);
  assert.equal(judge(q, ''), null);
  assert.equal(judge({ type: 'text', answer: { accept: ['192.168.1.128'] } }, '192.168.1.128 '), true);
  assert.equal(judge({ type: 'number', answer: { value: 25 } }, '25%'), true);
});
