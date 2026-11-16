// 生成知识点覆盖报告：node tools/coverage.mjs  →  docs/覆盖报告.md
// 状态根据课程目录自动判断，同时检查覆盖表里引用的课程和原理小节是否真的存在。
import fs from 'node:fs';
import { CATALOG } from '../js/catalog.js';
import { COVERAGE, EXTRA_CHAPTERS } from '../js/coverage.js';
import { DEFS } from '../js/quiz/bank.js';
import { SUBJECTS } from '../js/syllabus.js';

const byId = new Map(CATALOG.map((l) => [l.id, l]));
const zh = (v) => (typeof v === 'string' ? v : v?.zh ?? '');
const nameOf = (id) => zh(byId.get(id)?.name) || id;
const problems = [];

const STATUS = {
  full: '完整（动画 + 原理 + 练习）',
  lesson: '动画 + 原理',
  doc: '只在原理页讲到',
  missing: '缺失',
};
const ICON = { full: '●', lesson: '◐', doc: '◔', missing: '○' };

function statusOf(topic) {
  for (const id of topic.l ?? []) if (!byId.has(id)) problems.push(`找不到课程 ${id}（${topic.t[0]}）`);
  for (const ref of topic.d ?? []) {
    const [id, sec] = ref.split('#');
    const l = byId.get(id);
    if (!l) problems.push(`找不到课程 ${id}（${topic.t[0]}）`);
    else if (!l.principle?.sections?.some((s) => s.id === sec)) problems.push(`课程 ${id} 的原理页没有小节 ${sec}（${topic.t[0]}）`);
  }
  const ls = (topic.l ?? []).map((id) => byId.get(id)).filter(Boolean);
  if (ls.length) {
    const anim = ls.some((l) => l.steps?.length);
    const doc = ls.some((l) => l.principle);
    const quiz = ls.some((l) => l.quizEntry || DEFS.some((d) => d.lessons.includes(l.id)));
    if (anim && doc && quiz) return 'full';
    return 'lesson';
  }
  if (topic.d?.length) return 'doc';
  return 'missing';
}

const used = new Set();
const out = [];
const summary = [];
const todo = { anim: [], doc: [] };
let total = { full: 0, lesson: 0, doc: 0, missing: 0, all: 0 };

out.push('# 知识点覆盖报告', '');
out.push('由 `node tools/coverage.mjs` 根据 `js/coverage.js` 和课程目录自动生成，不要手改。', '');
out.push(`图例：${Object.entries(STATUS).map(([k, v]) => `${ICON[k]} ${v}`).join('　')}`, '');
out.push('「计划」一列：**动画** 表示值得做成交互动画；**原理页** 表示写原理说明和对比表就够了。', '');

const body = [];
for (const subj of SUBJECTS) {
  const chapters = COVERAGE[subj.id] ?? [];
  const cnt = { full: 0, lesson: 0, doc: 0, missing: 0, all: 0 };
  body.push(`## ${zh(subj.name)}`, '');
  for (const ch of chapters) {
    const chName = zh(subj.chapters.find((c) => c.id === ch.ch)?.name) || (EXTRA_CHAPTERS[subj.id]?.[ch.ch]?.[0] ?? ch.ch) + '（侧栏目录里还没有这一章）';
    body.push(`### ${chName}`, '', '| | 考点 | 状态 | 对应课程 | 计划 / 备注 |', '| --- | --- | --- | --- | --- |');
    for (const t of ch.topics) {
      const st = statusOf(t);
      cnt[st]++;
      cnt.all++;
      (t.l ?? []).forEach((id) => used.add(id));
      const where = [...(t.l ?? []).map((id) => `${nameOf(id)}（\`${id}\`）`), ...(t.d ?? []).map((r) => `原理页 \`${r}\``)].join('<br>') || '—';
      const plan = st === 'lesson' || st === 'full' ? '' : t.need === 'anim' ? '**动画**' : '**原理页**';
      const note = [plan, t.note].filter(Boolean).join('：');
      body.push(`| ${ICON[st]} | ${t.t[0]} | ${STATUS[st]} | ${where} | ${note} |`);
      if (st === 'doc' || st === 'missing') todo[t.need === 'anim' ? 'anim' : 'doc'].push(`${zh(subj.short)} · ${chName.replace(/（.*）/, '')} · ${t.t[0]}${st === 'doc' ? '（原理页已提到）' : ''}`);
    }
    body.push('');
  }
  summary.push(`| ${zh(subj.name)} | ${cnt.all} | ${cnt.full} | ${cnt.lesson} | ${cnt.doc} | ${cnt.missing} | ${Math.round(((cnt.full + cnt.lesson) / cnt.all) * 100)}% |`);
  for (const k of Object.keys(total)) total[k] += cnt[k];
}

out.push('## 总览', '', '| 科目 | 考点 | 完整 | 动画 + 原理 | 只在原理页 | 缺失 | 有动画的比例 |', '| --- | --- | --- | --- | --- | --- | --- |', ...summary);
out.push(`| **合计** | ${total.all} | ${total.full} | ${total.lesson} | ${total.doc} | ${total.missing} | ${Math.round(((total.full + total.lesson) / total.all) * 100)}% |`, '');
out.push(`现有课程 ${CATALOG.length} 节；题库 ${DEFS.length} 道题，覆盖 ${new Set(DEFS.flatMap((d) => d.lessons)).size} 节课。`, '');
out.push(...body);
out.push('## 待补清单', '', `### 值得做成动画（${todo.anim.length} 个）`, '', ...todo.anim.map((x) => `- ${x}`), '', `### 写原理页就够（${todo.doc.length} 个）`, '', ...todo.doc.map((x) => `- ${x}`), '');

const orphans = CATALOG.filter((l) => !used.has(l.id)).map((l) => `${nameOf(l.id)}（\`${l.id}\`）`);
if (orphans.length) problems.push(`这些课程没有出现在覆盖表里：${orphans.join('、')}`);
if (problems.length) out.push('## 需要处理的问题', '', ...problems.map((p) => `- ${p}`), '');

fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/覆盖报告.md', out.join('\n'));
console.log(`考点 ${total.all}：完整 ${total.full}，动画+原理 ${total.lesson}，只在原理页 ${total.doc}，缺失 ${total.missing}；待做动画 ${todo.anim.length}，待写原理 ${todo.doc.length}`);
if (problems.length) {
  console.log('问题：\n' + problems.join('\n'));
  process.exitCode = 1;
}
