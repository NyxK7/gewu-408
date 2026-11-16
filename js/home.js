// 首页：像一个小网站——顶栏里的科目导航、开场、「150 分怎么分」的分值条（同时也是科目切换），
// 下面一次只展示一门课：左边章节、右边课程卡片。
import { lessonById, lessonsIn } from './catalog.js';
import { countFor, idsFor } from './quiz/bank.js';
import { statsOf, wrongIds } from './quiz/record.js';
import { L, T, esc, getLang, t } from './core/i18n.js';
import { memArt } from './subjects/mem/index.js';
import { SUBJECTS, cnNo } from './syllabus.js';

const TXT = {
  eyebrow: T('考研 · 计算机学科专业基础（408）', 'Graduate entrance exam · Computer science fundamentals (408)'),
  h1: T('把 408 的考点<br>一步步演出来', 'Watch the 408 syllabus<br>happen, step by step'),
  lead: T(
    '每节课都是一段可以逐步播放的动画：能暂停、能后退，能点开看每一步的细节。计算类考点可以填入自己的参数，结果全部由代码算出来。',
    'Every lesson is an animation you can play, pause and rewind, opening up any step for details. Calculation topics take your own parameters, and every result is computed.',
  ),
  heroCta: T('30 秒看懂一次访存', 'See one memory access in 30 seconds'),
  resume: T('接着学：{name}', 'Continue: {name}'),
  browse: T('浏览全部课程', 'Browse all lessons'),
  featTitle: T('一次访存的全过程', 'One memory access, end to end'),
  featText: T(
    '虚拟地址 → TLB → 页表 → 物理地址 → Cache → 主存，缺页时从磁盘调页。',
    'Virtual address → TLB → page table → physical address → cache → memory, with a page fault from disk when needed.',
  ),
  featCta: T('开始这节课', 'Start the lesson'),
  courses: T('全部课程', 'All lessons'),
  nq: T('{n} 题', '{n} Q'),
  goOn: T('接着学', 'Continue'),
  startHere: T('从这里开始', 'Start here'),
  lessonsDone: T('已学完 {d} / {n} 节课', '{d} of {n} lessons done'),
  wrongBook: T('错题本', 'Mistakes'),
  wrongN: T('{n} 道', '{n}'),
  qRate: T('练习正确率', 'Practice score'),
  qNone: T('还没做过题', 'No practice yet'),
  split: T('150 分的试卷按分值分给四门课，点一门课看它的课程。', 'The 150-point paper split by subject. Pick one to see its lessons.'),
};

const PLAY = '<svg viewBox="0 0 12 14" width="11" height="13" aria-hidden="true"><path d="M1.5 1.2v11.6L11 7z" fill="currentColor"/></svg>';
const CHECK = '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true"><path d="M2.5 7.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let current = null; // 当前展示的科目
let grown = false; // 分值条只在第一次打开首页时「长出来」

const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.replaceAll(`{${k}}`, x), s);

function nav(sel) {
  const el = document.querySelector('.home-nav');
  if (!el) return;
  el.innerHTML = SUBJECTS.map(
    (s) => `<a class="hn-link c-${s.tone} ${s.id === sel ? 'is-on' : ''}" href="#/s/${s.id}" ${s.id === sel ? 'aria-current="true"' : ''}><i></i>${esc(L(s.short))}</a>`,
  ).join('');
}

function strip(sel, done) {
  return SUBJECTS.map((s, i) => {
    const ls = lessonsIn(s.id);
    const d = ls.filter((l) => done.has(l.id)).length;
    const on = s.id === sel;
    return `<a class="ps-seg c-${s.tone} ${on ? 'is-on' : ''}" href="#/s/${s.id}" style="flex:${s.score};--i:${i}" ${on ? 'aria-current="true"' : ''}>
      <b>${esc(L(s.short))}</b><span>${t('points', { n: s.score })}</span>
      <i class="ps-prog" aria-hidden="true"><i style="width:${ls.length ? (d / ls.length) * 100 : 0}%"></i></i>
    </a>`;
  }).join('');
}

/** 这一章有题时，章名下面的「练习 n 题」 */
function qn(subj, chap) {
  const n = countFor({ subject: subj, chapter: chap });
  return n ? `<a class="cp-quiz" href="#/q/c/${subj}/${chap}">${esc(t('practice'))} · ${n}</a>` : '';
}

function panel(sel, done) {
  const s = SUBJECTS.find((x) => x.id === sel);
  const zh = getLang() === 'zh';
  const chaps = s.chapters
    .map((c, i) => {
      const ls = lessonsIn(s.id, c.id);
      const cards = ls
        .map((l) => {
          const ok = done.has(l.id);
          const nq = countFor({ lesson: l.id });
          return `<a class="lc ${ok ? 'is-done' : ''}" href="#/l/${l.id}">
            <span class="lc-tag">${ok ? CHECK : esc(L(l.tag))}</span>
            <b>${esc(L(l.name))}</b>
            ${nq ? `<span class="lc-q">${esc(fill(L(TXT.nq), { n: nq }))}</span>` : ''}
          </a>`;
        })
        .join('');
      return `<li class="cp-chap ${ls.length ? '' : 'is-empty'}">
        <h4 class="cp-name"><i>${zh ? cnNo(i + 1) : i + 1}</i><span>${esc(L(c.name))}</span>${qn(s.id, c.id)}</h4>
        ${ls.length ? `<div class="cp-grid">${cards}</div>` : ''}
      </li>`;
    })
    .join('');
  return `<div class="cp c-${s.tone}" aria-label="${esc(L(s.name))}">
    <ol class="cp-chaps">${chaps}</ol>
  </div>`;
}

/** 开场下面的一栏：接着学哪节课、学了多少、错题本、练习正确率 */
function resume(lastLesson, done) {
  // 有几节课同时属于两门课，按课程本身去重再数
  const total = new Set(SUBJECTS.flatMap((s) => lessonsIn(s.id).map((l) => l.id))).size;
  const d = done.size;
  const st = statsOf(idsFor());
  const nw = wrongIds().length;
  const first = lessonById('complexity');
  const go = lastLesson ?? first;
  return `<section class="resume">
    <a class="rs-item rs-main" href="#/l/${go.id}">
      <small>${esc(L(lastLesson ? TXT.goOn : TXT.startHere))}</small>
      <b>${esc(L(go.name))}</b>
    </a>
    <div class="rs-item">
      <small>${esc(fill(L(TXT.lessonsDone), { d, n: total }))}</small>
      <i class="rs-bar"><i style="width:${total ? (d / total) * 100 : 0}%"></i></i>
    </div>
    <a class="rs-item" href="#/q/wrong">
      <small>${esc(L(TXT.wrongBook))}</small>
      <b>${esc(fill(L(TXT.wrongN), { n: nw }))}</b>
    </a>
    <a class="rs-item" href="#/q">
      <small>${esc(L(TXT.qRate))}</small>
      <b>${st.rate == null ? esc(L(TXT.qNone)) : `${Math.round(st.rate * 100)}%`}</b>
    </a>
  </section>`;
}

export function renderHome(root, { done, last, subj }) {
  // 科目：路由指定的 > 上次看的 > 有课最多的那门
  if (subj && SUBJECTS.some((s) => s.id === subj)) current = subj;
  if (!current) current = [...SUBJECTS].sort((a, b) => lessonsIn(b.id).length - lessonsIn(a.id).length)[0].id;
  const lastLesson = last && last !== 'vm-access' ? lessonById(last) : null;
  // 「接着学」放在下面那一栏里，这里固定是浏览全部课程
  const second = `<button type="button" class="btn-ghost" data-go="courses">${esc(L(TXT.browse))}</button>`;

  root.innerHTML = `<div class="home-inner">
    <section class="hero">
      <div class="hero-text">
        <p class="eyebrow">${esc(L(TXT.eyebrow))}</p>
        <h1>${L(TXT.h1)}</h1>
        <p class="lead">${esc(L(TXT.lead))}</p>
        <div class="hero-actions">
          <a class="hero-cta" href="#/l/vm-access?play=1">${PLAY}<span>${esc(L(TXT.heroCta))}</span></a>
          ${second}
        </div>
      </div>
      <a class="feature" href="#/l/vm-access">
        <div class="feature-art">${memArt()}</div>
        <div class="feature-body">
          <h2>${esc(L(TXT.featTitle))}</h2>
          <p>${esc(L(TXT.featText))}</p>
          <span class="feature-cta">${esc(L(TXT.featCta))}</span>
        </div>
      </a>
    </section>
    ${resume(lastLesson, done)}
    <section class="courses" id="courses">
      <div class="courses-head">
        <h2>${esc(L(TXT.courses))}</h2>
        <p>${esc(L(TXT.split))}</p>
      </div>
      <nav class="paper ${grown ? '' : 'is-growing'}">${strip(current, done)}</nav>
      <div class="cp-wrap">${panel(current, done)}</div>
    </section>
  </div>`;
  grown = true;
  nav(current);
  root.querySelector('[data-go="courses"]')?.addEventListener('click', () => root.querySelector('#courses').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** 只换科目，不重画开场（点分值条或顶栏导航时用） */
export function switchSubject(root, subj, done) {
  if (!SUBJECTS.some((s) => s.id === subj)) return false;
  current = subj;
  const paper = root.querySelector('.paper');
  const wrap = root.querySelector('.cp-wrap');
  if (!paper || !wrap) return false;
  paper.classList.remove('is-growing');
  paper.innerHTML = strip(current, done);
  wrap.innerHTML = panel(current, done);
  wrap.firstElementChild.classList.add('is-in');
  nav(current);
  return true;
}
