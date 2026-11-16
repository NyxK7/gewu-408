// 应用入口：路由（首页 / 课程页）、播放器与界面渲染。
import { CATALOG, lessonById, lessonsIn, replaceLesson } from './catalog.js';
import { clock } from './core/clock.js';
import { L, T, esc, getLang, setLang, t } from './core/i18n.js';
import { docHtml, sectionOf } from './core/doc.js';
import { Inspector } from './core/inspector.js';
import { Player } from './core/player.js';
import { Scene } from './core/scene.js';
import { SeqView } from './core/sequence.js';
import { renderHome, switchSubject } from './home.js';
import { setupSearch } from './search.js';
import { setupWorkspace } from './workspace.js';
import { PagingQuiz } from './subjects/os/paging-quiz-view.js';
import { DEFS, countFor } from './quiz/bank.js';
import { lessonHash, unpackParams } from './quiz/kit.js';
import { QuizPage } from './quiz/page.js';
import { SUBJECTS, chapterOf, cnNo, subjectById } from './syllabus.js';

const $ = (s, r = document) => r.querySelector(s);

export const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('408viz:' + k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('408viz:' + k, JSON.stringify(v));
    } catch {}
  },
};

const ICON = {
  play: '<svg viewBox="0 0 12 14" width="12" height="14" aria-hidden="true"><path d="M1.5 1.2v11.6L11 7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 12 14" width="12" height="14" aria-hidden="true"><path d="M1.5 1.2h3.2v11.6H1.5zM7.3 1.2h3.2v11.6H7.3z" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.7-4M13.6 1.6v3.6H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.2 6.4l2.4 2.4 5.2-5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sun: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor"/><path d="M10 1.6v2.2M10 16.2v2.2M1.6 10h2.2M16.2 10h2.2M4.1 4.1l1.5 1.5M14.4 14.4l1.5 1.5M4.1 15.9l1.5-1.5M14.4 5.6l1.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  book: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 3.2c2.2-.9 4.2-.7 6 .8 1.8-1.5 3.8-1.7 6-.8v9.6c-2.2-.9-4.2-.7-6 .8-1.8-1.5-3.8-1.7-6-.8zM8 4v9.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 10 16" width="8" height="13" aria-hidden="true"><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const state = {
  page: 'home',
  mode: 'home',
  lesson: null,
  selected: -1,
  side: null,
  tab: 'rows',
  snap: null,
  view: store.get('view', 'net'),
  done: new Set(store.get('done', [])),
  resumeOnClose: false,
  backTo: null, // 从题目解析「看动画」过来时，回到那道题的地址
  itab: 'talk', // 右边面板：讲解 / 参数 / 过程
  paramsFor: null, // 参数页现在画的是哪一个课程对象
};

const scene = new Scene($('.net'));
const seq = new SeqView($('.seq'), { onSelect: (i) => openItem(i) });
const inspector = new Inspector($('.inspector'), { onNav: (d) => openItem(state.selected + d) });
const tbody = $('.pkt-table tbody');
const tableWrap = $('.table-wrap');

const player = new Player({
  scene,
  seq,
  ui: {
    render: () => renderAll(),
    clearRows() {
      tbody.replaceChildren();
      state.selected = -1;
      state.snap = null;
      renderTableMeta();
    },
    addRow,
    async custom(ev, tok, animate) {
      if (ev.type === 'tab') {
        // 课程可以在某一步把底部面板切到指定标签页（只在播放时，不影响上一步 / 跳转）
        if (animate) applyTab(ev.tab);
        return;
      }
      if (ev.type === 'snap') {
        state.snap = ev.snap;
        if (animate) renderState();
      }
    },
    finished(lesson) {
      state.done.add(lesson.id);
      store.set('done', [...state.done]);
      // 放完把「课程完成」卡片滚进讲解面板里看得见的地方；只滚面板，不滚整页
      requestAnimationFrame(() => {
        const o = $('.outro');
        scrollWithin(o?.closest('.ipane'), o);
      });
    },
  },
});

const quizView = new PagingQuiz({
  player,
  scene,
  root: $('.quiz'),
  load: async (lesson) => {
    state.lesson = lesson;
    state.tab = 'rows';
    applyKit();
    renderLegend();
    await player.load(lesson);
  },
});

const practice = new QuizPage({ root: $('.qz'), go: goLesson });

/** 题目解析里的「看动画」：用题目的参数打开那节课，停在那一步（或打开原理页的那一节） */
function goLesson(go, back) {
  if (!lessonById(go.lesson)) return;
  state.backTo = back;
  location.hash = lessonHash(go);
}

/** 给参数可调的课用：改了参数就重新生成整节课，回到开头 */
const ctx = {
  store,
  reload(lesson) {
    state.lesson = replaceLesson(lesson);
    if (inspector.isOpen) $('.inspector').close();
    renderLegend();
    player.load(state.lesson);
  },
};

// ───────────────────────── 路由 ─────────────────────────

function route() {
  const h = decodeURIComponent(location.hash);
  const qi = h.indexOf('?');
  const path = qi < 0 ? h : h.slice(0, qi);
  const q = new URLSearchParams(qi < 0 ? '' : h.slice(qi + 1));
  const m = path.match(/^#\/l\/([\w-]+)/);
  const lesson = m && lessonById(m[1]);
  // 嵌入模式：只留舞台和播放条（做题页右边的面板里用）
  const embed = !!lesson && q.get('embed') === '1';
  if (embed) document.body.dataset.embed = '1';
  else delete document.body.dataset.embed;
  if (embed && q.get('theme') && q.get('theme') !== document.documentElement.dataset.theme) applyTheme(q.get('theme'));
  if (embed && q.get('lang') && q.get('lang') !== getLang()) {
    setLang(q.get('lang'));
    applyStatic();
  }
  // 链接里带了参数（题目解析过来的）：临时用这组参数生成这节课，不覆盖用户保存的参数
  if (lesson && q.get('p') && lesson.preview) {
    const p = unpackParams(q.get('p'));
    if (p) replaceLesson(lesson.preview(p));
  }
  if (lesson) {
    if (q.get('mode') === 'quiz' && lesson.quizEntry) return showQuiz(lesson.id);
    return showLesson(lesson.id, { autoplay: q.get('play') === '1', step: q.get('step'), doc: q.get('doc') });
  }
  if (path === '#/q' || path.startsWith('#/q/')) return showPractice(path.slice(3));
  const s = path.match(/^#\/s\/(\w+)/);
  showHome(s?.[1]);
}

let ws = null; // 工作区（目录收起、分隔条、缩放和全屏），启动时创建

function showHome(subj) {
  ws?.exitFull();
  const wasHome = state.page === 'home' && !$('.home').hidden;
  if (state.page === 'lesson') player.cancel();
  quizView.close();
  if (inspector.isOpen) $('.inspector').close();
  state.backTo = null;
  $('.qz').hidden = true;
  state.page = 'home';
  state.mode = 'home';
  document.body.dataset.page = 'home';
  delete document.body.dataset.mode;
  document.body.classList.remove('drawer-open', 'is-running');
  $('.home').hidden = false;
  $('.layout').hidden = true;
  renderTopProgress();
  // 已经在首页时只换科目，不重画开场；课程区不在视野里才滚过去
  if (wasHome && subj && switchSubject($('.home'), subj, state.done)) {
    const top = $('#courses').getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.55) $('#courses').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  renderHome($('.home'), { done: state.done, last: store.get('lesson'), subj });
  if (subj) requestAnimationFrame(() => $('#courses')?.scrollIntoView({ block: 'start' }));
  else $('.home').scrollTo(0, 0);
}

function showPractice(rest) {
  ws?.exitFull();
  if (state.page === 'lesson') player.cancel();
  quizView.close();
  if (inspector.isOpen) $('.inspector').close();
  state.backTo = null;
  state.page = 'practice';
  state.mode = 'practice';
  document.body.dataset.page = 'practice';
  delete document.body.dataset.mode;
  document.body.classList.remove('drawer-open', 'is-running');
  $('.home').hidden = true;
  $('.layout').hidden = true;
  $('.qz').hidden = false;
  renderTopProgress();
  practice.show(rest);
  $('.qz').scrollTo(0, 0);
}

async function showLesson(id, { autoplay = false, step = null, doc = null } = {}) {
  const wasHome = state.page !== 'lesson';
  const wasQuiz = state.mode === 'quiz';
  quizView.close();
  state.page = 'lesson';
  state.mode = 'lesson';
  document.body.dataset.page = 'lesson';
  delete document.body.dataset.mode;
  $('.home').hidden = true;
  $('.qz').hidden = true;
  $('.layout').hidden = false;
  if (wasHome || wasQuiz || state.lesson?.id !== id || state.lesson !== lessonById(id)) await loadLesson(id);
  // 从题目解析过来：停在指定的那一步，或者打开原理页的那一节
  if (doc && state.lesson?.id === id) openDoc(doc === '_' ? null : doc);
  else if (document.body.dataset.embed && state.view === 'doc') applyView('net');
  else if (step != null && state.lesson?.id === id) {
    toScene();
    await player.goto(Math.min(Number(step), player.last));
  }
  // 从链接带 ?play=1 进来时直接开播，不用再点一次播放
  if (autoplay && state.lesson?.id === id && player.last >= 0 && !player.running) player.play();
}

async function showQuiz(id) {
  const lesson = lessonById(id);
  if (!lesson?.quizEntry) return showLesson(id);
  if (inspector.isOpen) $('.inspector').close();
  if (state.page === 'lesson') player.cancel();
  state.page = 'lesson';
  state.mode = 'quiz';
  document.body.dataset.page = 'lesson';
  document.body.dataset.mode = 'quiz';
  document.body.classList.remove('drawer-open', 'is-running');
  $('.home').hidden = true;
  $('.qz').hidden = true;
  $('.layout').hidden = false;
  state.side = lesson.where[0][0];
  renderTopProgress();
  await quizView.start(lesson.params ?? {});
}

function loadLesson(id) {
  if (inspector.isOpen) $('.inspector').close();
  state.lesson = lessonById(id);
  state.side = state.lesson.where[0][0];
  if (!document.body.dataset.embed) store.set('lesson', id);
  document.body.classList.remove('drawer-open');
  if (!state.lesson.kit.renderState) state.tab = 'rows';
  applyKit();
  renderLegend();
  return player.load(state.lesson);
}

// ───────────────────────── 表格 / 解析 ─────────────────────────

function addRow(p, idx, animate) {
  const kit = state.lesson.kit;
  const tr = document.createElement('tr');
  tr.className = `c-${p.color}${animate ? ' is-flight is-new' : ''}`;
  tr.dataset.idx = idx;
  tr.tabIndex = 0;
  tr.innerHTML = kit
    .cells(p, idx)
    .map((c, i) => `<td class="${kit.cols[i].cls ?? ''}">${c}</td>`)
    .join('');
  tbody.append(tr);
  renderTableMeta();
  if (animate && state.tab === 'rows') tableWrap.scrollTo({ top: tableWrap.scrollHeight, behavior: 'smooth' });
  return tr;
}

function renderTableMeta() {
  const n = player.items.length;
  $('.empty').hidden = n > 0;
  for (const el of document.querySelectorAll('.flow-count')) el.textContent = n ? String(n) : '';
}

function openItem(i) {
  const items = player.items;
  if (i < 0 || i >= items.length) return;
  state.selected = i;
  for (const tr of tbody.children) tr.classList.toggle('is-selected', Number(tr.dataset.idx) === i);
  seq.select(i);
  if (player.running && !clock.paused) {
    clock.pause();
    state.resumeOnClose = true;
    renderControls();
  }
  inspector.open(state.lesson.kit.decode(items[i], i), i, items.length);
}

$('.inspector').addEventListener('close', () => {
  if (state.resumeOnClose) {
    state.resumeOnClose = false;
    clock.resume();
    renderControls();
  }
});

tbody.addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (tr) openItem(Number(tr.dataset.idx));
});
tbody.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const tr = e.target.closest('tr');
    if (tr) openItem(Number(tr.dataset.idx));
  }
});

// ───────────────────────── 渲染 ─────────────────────────

const facts = (list) =>
  list?.length ? `<dl class="facts">${list.map(([k, v]) => `<div><dt>${esc(L(k))}</dt><dd>${esc(L(v))}</dd></div>`).join('')}</dl>` : '';

function renderAll() {
  if (state.page !== 'lesson' || state.mode === 'quiz') return;
  renderHeader();
  renderSidebar();
  renderInfo();
  renderParams();
  renderCaption();
  renderControls();
  renderState();
  markDoc();
}

function whereTags(lesson) {
  return lesson.where
    .map(([s, c]) => {
      const x = chapterOf(s, c);
      return `<span class="where-tag c-${x.subject.tone}"><b>${esc(L(x.subject.short))}</b>${esc(L(x.chapter.name))}</span>`;
    })
    .join('');
}

function renderTopProgress() {
  const d = CATALOG.filter((l) => state.done.has(l.id)).length;
  $('.prog-bar i').style.width = `${(d / CATALOG.length) * 100}%`;
  $('.prog-text').textContent = t('lessonsDone', { d, n: CATALOG.length });
}

function renderHeader() {
  const { lesson } = state;
  const n = lesson.steps.length;
  $('.now-title').textContent = `${L(lesson.name)} · ${L(lesson.title)}`;
  $('.now-steps').innerHTML = lesson.steps.map((_, i) => `<i class="${stepClass(i)}"></i>`).join('');
  $('.now-sub').textContent = player.step < 0 ? `${t('overview')} · ${t('steps', { n })}` : t('stepOf', { i: player.step + 1, n });
  $('.where-tags').innerHTML = whereTags(lesson);
  renderTopProgress();
}

function stepClass(i) {
  const { step, running } = player;
  if (i < step || (i === step && !running)) return 'is-done';
  if (i === step && running) return 'is-active';
  if (i === step + 1 && !running) return 'is-next';
  return '';
}

function lessonHtml(l) {
  const active = l.id === state.lesson.id;
  const done = state.done.has(l.id);
  const steps = '';
  return `<div class="lesson ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}">
    <button class="lesson-btn" data-lesson="${l.id}" aria-current="${active}">
      <span class="lesson-badge ${!done && L(l.tag).length > 3 ? 'is-long' : ''}">${done ? ICON.check : esc(L(l.tag))}</span>
      <span class="lesson-name"><b>${esc(L(l.name))}</b></span>
      ${ICON.chev}
    </button>${steps}
  </div>`;
}

function renderSidebar() {
  $('.chips').innerHTML = SUBJECTS.map(
    // 四门课排成两行两列，按钮一样宽；计算机组成原理太长，按钮上写「计算机组成」，悬停看全名
    (s) => `<button class="chip c-${s.tone} ${state.side === s.id ? 'is-on' : ''}" data-subj="${s.id}" title="${esc(L(s.name))}">${esc(L(s.id === 'co' ? T('计算机组成', 'CO') : s.short))}<span>${lessonsIn(s.id).length}</span></button>`,
  ).join('');
  const subj = subjectById(state.side);
  const zh = getLang() === 'zh';
  $('.lesson-list').innerHTML = subj.chapters
    .map((c, i) => {
      const ls = lessonsIn(subj.id, c.id);
      return `<section class="chap ${ls.length ? 'has-lessons' : ''}">
        <h3 class="chap-name"><i>${zh ? cnNo(i + 1) : i + 1}</i>${esc(L(c.name))}</h3>
        ${ls.map(lessonHtml).join('')}
      </section>`;
    })
    .join('');
}

function renderInfo() {
  const { lesson } = state;
  const { step } = player;
  const box = $('.info-main');
  if (step < 0) {
    const edit = lesson.kit.overview ? `<button class="link-btn" data-act="itab" data-tab="params">${esc(t('editParams'))} →</button>` : '';
    const errs = lesson.errors?.length ? `<p class="doc-warn">${lesson.errors.map((e) => esc(L(e))).join('<br>')}</p>` : '';
    box.innerHTML = `${backChip()}
      <div class="info-head"><h2>${esc(L(lesson.name))}</h2></div>
      <p class="info-full">${esc(L(lesson.full))}</p>
      <p class="info-text">${esc(L(lesson.overview.desc))}</p>
      ${errs}
      ${facts(lesson.overview.facts)}
      ${overviewActions(lesson)}
      ${edit}
      ${timeline(lesson)}`;
    box.scrollTop = 0;
    return;
  }
  const s = lesson.steps[step];
  let html = `${backChip()}
    <h2 class="step-title">${esc(L(s.title))}</h2>
    <p class="info-full">${esc(L(s.desc))}</p>
    <p class="info-text">${esc(L(s.detail))}</p>
    ${docRef(lesson, s.ref)}
    ${facts(s.facts)}`;
  if (player.finished) {
    const o = lesson.outro;
    html += `<div class="outro">
      <div class="kicker ok">${ICON.check}${t('complete')}</div>
      <h3>${esc(L(o.title))}</h3>
      <p class="info-text">${esc(L(o.text))}</p>
      ${facts(o.facts)}
      <div class="outro-actions">
        <button class="btn" data-act="replay">${ICON.replay}<span>${t('replay')}</span></button>
        <button class="btn primary" data-act="next"><span>${t('next')}</span> →</button>
      </div>
    </div>`;
  }
  box.innerHTML = html + timeline(lesson);
  // 当前这一步滚到看得见的地方
  const cur = box.querySelector('.tl .step.is-active, .tl .step.is-cur');
  if (cur && player.running) scrollWithin(box, cur);
}

/** 只在 box 自己能滚动时，把 el 滚进 box 的可见范围；box 不能滚（手机上是整页滚）就什么也不做 */
function scrollWithin(box, el) {
  if (!box || !el || box.scrollHeight <= box.clientHeight + 2) return;
  if (getComputedStyle(box).overflowY === 'visible') return;
  const b = box.getBoundingClientRect();
  const c = el.getBoundingClientRect();
  if (c.top < b.top + 8) box.scrollTop -= b.top + 8 - c.top;
  else if (c.bottom > b.bottom - 8) box.scrollTop += c.bottom - (b.bottom - 8);
}

/** 讲解页下面的步骤时间线 */
function timeline(lesson) {
  if (!lesson.steps.length) return '';
  const items = lesson.steps
    .map((s, i) => {
      const cls = stepClass(i);
      return `<li><button class="step ${cls} ${i === player.step ? 'is-cur' : ''}" data-step="${i}">
        <span class="num">${cls === 'is-done' && i !== player.step ? ICON.check : i + 1}</span>
        <span class="txt"><b>${esc(L(s.title))}</b></span>
      </button></li>`;
    })
    .join('');
  return `<h3 class="tl-head">${esc(t('stepsHead'))}<span>${lesson.steps.length}</span></h3><ol class="steps tl">${items}</ol>`;
}

/** 参数页：预设和输入框。只有换了课（或者改了参数生成了新课）才重画，免得打断输入 */
function renderParams() {
  const { lesson } = state;
  const box = $('.info-params');
  if (!lesson.kit.overview) {
    box.innerHTML = '';
    state.paramsFor = lesson;
    return;
  }
  if (state.paramsFor === lesson) return;
  state.paramsFor = lesson;
  const focused = box.contains(document.activeElement) ? document.activeElement.name : null;
  const scroll = box.scrollTop;
  box.innerHTML = lesson.kit.overview(lesson, ctx);
  lesson.kit.bindOverview?.(box, lesson, ctx);
  if (focused) box.querySelector(`[name="${focused}"]`)?.focus({ preventScroll: true });
  box.scrollTop = scroll;
}

/** 右边面板切换标签页 */
function applyItab(tab) {
  const hasParams = !!state.lesson?.kit.overview;
  state.itab = tab === 'params' && !hasParams ? 'talk' : tab;
  for (const b of document.querySelectorAll('.itab')) {
    const on = b.dataset.itab === state.itab;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', String(on));
  }
  for (const p of document.querySelectorAll('.ipane')) p.toggleAttribute('hidden', p.dataset.pane !== state.itab);
  // 看过程表格时面板加宽一些，表格列不挤
  $('.layout').classList.toggle('is-flow', state.itab === 'flow');
  if (state.itab === 'flow' && state.tab === 'state') renderState();
}

function backChip() {
  return state.backTo ? `<a class="qz-back" href="${esc(state.backTo)}">← ${esc(t('backToQuiz'))}</a>` : '';
}

function quizBtn(lesson) {
  const n = countFor({ lesson: lesson.id });
  return n ? `<a class="btn qz-entry" href="#/q/l/${lesson.id}">${esc(t('doQuiz', { n }))}</a>` : '';
}

function overviewActions(lesson) {
  const watch = `<button class="cta" data-act="play" ${lesson.steps.length ? '' : 'disabled'}>${ICON.play}<span>${esc(L(lesson.watchEntry ?? T('开始演示', 'Start')))}</span></button>`;
  const read = lesson.principle ? `<button class="btn doc-btn" data-act="doc">${ICON.book}<span>${t('readDoc')}</span></button>` : '';
  const more = read || quizBtn(lesson) ? `<div class="cta-more">${read}${quizBtn(lesson)}</div>` : '';
  if (!lesson.quizEntry) return watch + more;
  return `<div class="cta-row">${watch}<a class="cta cta-quiz" href="#/l/${lesson.id}?mode=quiz"><span>${esc(L(lesson.quizEntry))}</span></a></div>${more}`;
}

/** 步骤说明下面的「对应原理：③ 分配算法」链接 */
function docRef(lesson, ref) {
  const refs = (Array.isArray(ref) ? ref : ref ? [ref] : []).map((id) => [id, sectionOf(lesson.principle, id)]).filter(([, s]) => s);
  if (!refs.length) return '';
  return `<p class="doc-ref"><span>${t('docLink')}</span>${refs.map(([id, s]) => `<button data-act="doc" data-sec="${id}"><i>${s.no}</i>${esc(L(s.title))}</button>`).join('')}</p>`;
}

function renderCaption() {
  const { lesson } = state;
  const { step } = player;
  const c = $('.caption');
  // 概览时标题已经在顶栏里，舞台上不再重复
  c.toggleAttribute('hidden', step < 0);
  if (step >= 0) {
    const s = lesson.steps[step];
    c.innerHTML = `<em>${String(step + 1).padStart(2, '0')}</em><b>${esc(L(s.title))}</b><span>${esc(L(s.desc))}</span>`;
  }
}

function renderLegend() {
  $('.legend').innerHTML = state.lesson.legend.map(([c, txt]) => `<span class="lg"><i class="c-${c}"></i>${esc(L(txt))}</span>`).join('');
}

function renderControls() {
  const last = player.lesson ? player.last : 0;
  const play = $('.play-btn');
  const label = player.running ? (clock.paused ? t('resume') : t('pause')) : player.step >= last ? t('replay') : t('play');
  const icon = player.running && !clock.paused ? ICON.pause : player.step >= last && !player.running ? ICON.replay : ICON.play;
  play.innerHTML = `${icon}<span>${label}</span>`;
  play.classList.toggle('is-paused', player.running && clock.paused);
  play.disabled = last < 0;
  $('.prev-btn').disabled = player.step < 0;
  $('.step-btn').disabled = !player.running && player.step >= last;
  $('.speed-btn').textContent = `${clock.speed}×`;
  const n = player.lesson?.steps.length ?? 0;
  const track = $('.ptrack');
  if (track.childElementCount !== n || track.dataset.for !== state.lesson?.id) {
    track.dataset.for = state.lesson?.id ?? '';
    track.innerHTML = Array.from({ length: n }, (_, i) => `<button class="pt" data-step="${i}" aria-label="${i + 1}"><i></i></button>`).join('');
  }
  [...track.children].forEach((b, i) => {
    b.className = `pt ${stepClass(i)} ${i === player.step ? 'is-cur' : ''}`;
    b.title = L(state.lesson.steps[i].title);
  });
  $('.ppos').textContent = player.step < 0 ? t('steps', { n }) : `${player.step + 1} / ${n}`;
  document.body.classList.toggle('is-running', player.running && !clock.paused);
  ws?.sync();
}

function renderState() {
  const kit = state.lesson?.kit;
  if (!kit?.renderState) return;
  const wrap = $('.state-wrap');
  wrap.innerHTML = kit.renderState(state.snap, state.lesson);
  // 每张表里把这一步涉及的那一行滚到看得见的地方（只滚表格自己，不动页面）
  for (const box of wrap.querySelectorAll('.ms-scroll')) {
    const row = box.querySelector('tr[class*="m-"]') ?? box.querySelector('tr.is-target');
    if (row && (row.offsetTop < box.scrollTop + 24 || row.offsetTop > box.scrollTop + box.clientHeight - 24)) box.scrollTop = row.offsetTop - box.clientHeight / 2;
  }
}

function applyTab(tab) {
  const hasState = !!state.lesson?.kit.renderState;
  state.tab = hasState ? tab : 'rows';
  for (const b of document.querySelectorAll('.tab')) {
    b.classList.toggle('is-on', b.dataset.tab === state.tab);
    b.setAttribute('aria-selected', b.dataset.tab === state.tab);
  }
  tableWrap.toggleAttribute('hidden', state.tab !== 'rows');
  $('.state-wrap').toggleAttribute('hidden', state.tab !== 'state');
  if (state.tab === 'state') renderState();
}

/** 换课时，按课程的 kit 换掉视图名、表头、标签页 */
function applyKit() {
  const kit = state.lesson.kit;
  $('.view-name').textContent = L(kit.viewName);
  $('.net').setAttribute('aria-label', L(kit.diagramName));
  for (const el of document.querySelectorAll('.rows-name')) el.textContent = L(kit.rowsName);
  $('.itab[data-itab="params"]').hidden = !kit.overview;
  state.paramsFor = null;
  $('.empty').textContent = L(kit.emptyRows);
  $('.pkt-table thead').innerHTML = `<tr>${kit.cols.map((c) => `<th class="${c.cls ?? ''}">${esc(L(c.label))}</th>`).join('')}</tr>`;
  const st = $('.tab[data-tab="state"]');
  st.hidden = !kit.renderState;
  $('.state-name').textContent = L(kit.stateName ?? '');
  $('.flow').classList.toggle('one-tab', !kit.renderState);
  $('.layout').classList.toggle('is-wide', !!kit.wide);
  // 画板类课程没有「参与者」，不需要时序图
  $('.seg [data-view="seq"]').hidden = !!kit.noSeq;
  $('.seg [data-view="doc"]').hidden = !state.lesson.principle;
  renderDoc();
  applyTab(state.tab);
  applyItab(state.lesson.errors?.length ? 'params' : state.itab);
  showView();
}

function renderDoc() {
  $('.doc').innerHTML = docHtml(state.lesson?.principle, getLang() === 'zh');
  markDoc();
}

/** 原理页里高亮当前这一步对应的那一节 */
function markDoc() {
  const s = state.lesson?.steps[player.step];
  const refs = new Set(Array.isArray(s?.ref) ? s.ref : s?.ref ? [s.ref] : []);
  for (const sec of document.querySelectorAll('.doc [data-sec]')) sec.classList.toggle('is-cur', refs.has(sec.dataset.sec));
}

function openDoc(sec) {
  applyView('doc');
  const el = sec && $(`.doc .doc-sec[data-sec="${sec}"]`);
  const box = $('.doc');
  if (el) box.scrollTo({ top: el.offsetTop - 64, behavior: 'smooth' });
  else box.scrollTo(0, 0);
}

/** 播放、单步时如果停在原理页，先切回动画 */
function toScene() {
  if (state.view === 'doc') applyView(store.get('view', 'net'));
}

function applyStatic() {
  for (const e of document.querySelectorAll('[data-i18n]')) e.textContent = t(e.dataset.i18n);
  for (const e of document.querySelectorAll('[data-i18n-title]')) {
    e.title = t(e.dataset.i18nTitle);
    e.setAttribute('aria-label', e.title);
  }
  $('.lang-btn').textContent = getLang() === 'zh' ? 'EN' : '中文';
  $('.seq').setAttribute('aria-label', t('seqDiagram'));
  document.title = getLang() === 'zh' ? '格物 408 · 考研计算机综合动画讲解' : 'Gewu 408 · Animated CS fundamentals';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  store.set('theme', theme);
  $('.theme-btn').innerHTML = theme === 'dark' ? ICON.sun : ICON.moon;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = theme === 'dark' ? '#0d1513' : '#f3f1ea';
}

function applyView(view) {
  state.view = view === 'seq' || view === 'doc' ? view : 'net';
  // 原理页只是临时切过去看，不记住
  if (state.view !== 'doc') store.set('view', state.view);
  showView();
}

/** 实际显示哪个视图：用户的选择，但课程不支持时序图 / 没有原理页时退回场景图 */
function showView() {
  let v = state.view;
  if (v === 'seq' && state.lesson?.kit.noSeq) v = 'net';
  if (v === 'doc' && !state.lesson?.principle) v = 'net';
  $('.net').toggleAttribute('hidden', v !== 'net');
  $('.seq').toggleAttribute('hidden', v !== 'seq');
  $('.doc').toggleAttribute('hidden', v !== 'doc');
  $('.stage').classList.toggle('is-doc', v === 'doc');
  // 读原理时整块课程区都给原理页用（桌面端），切回示意图就恢复
  $('.layout').classList.toggle('is-reading', v === 'doc');
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('is-on', b.dataset.view === v);
  if (v === 'seq') seq.render();
}

// ───────────────────────── 事件绑定 ─────────────────────────

$('.play-btn').addEventListener('click', () => {
  toScene();
  player.play();
});
$('.step-btn').addEventListener('click', () => {
  toScene();
  player.stepOnce();
});
$('.prev-btn').addEventListener('click', () => player.prev());
$('.doc').addEventListener('click', (e) => {
  const a = e.target.closest('.doc-toc [data-sec]');
  if (!a) return;
  e.preventDefault();
  openDoc(a.dataset.sec);
});
$('.reset-btn').addEventListener('click', () => player.rebuild(-1));
$('.speed-btn').addEventListener('click', () => {
  const speeds = [0.5, 1, 2, 4];
  const next = speeds[(speeds.indexOf(clock.speed) + 1) % speeds.length];
  clock.setSpeed(next);
  store.set('speed', next);
  renderControls();
});
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => applyTab(b.dataset.tab));
for (const b of document.querySelectorAll('.itab')) b.addEventListener('click', () => applyItab(b.dataset.itab));
$('.ptrack').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  toScene();
  player.goto(Number(b.dataset.step));
});
$('.theme-btn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('.lang-btn').addEventListener('click', async () => {
  setLang(getLang() === 'zh' ? 'en' : 'zh');
  applyStatic();
  ws?.relabel();
  if (state.page === 'home') return showHome();
  if (state.page === 'practice') return practice.refreshLang();
  applyKit();
  renderLegend();
  if (state.mode === 'quiz') {
    await quizView.refreshLang();
    return;
  }
  await player.rebuild(player.step);
});
for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => applyView(b.dataset.view));
$('.menu-btn').addEventListener('click', () => document.body.classList.toggle('drawer-open'));
$('.side-close').addEventListener('click', () => document.body.classList.remove('drawer-open'));
$('.scrim').addEventListener('click', () => document.body.classList.remove('drawer-open'));

$('.sidebar').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-subj]');
  if (chip) {
    state.side = chip.dataset.subj;
    renderSidebar();
    return;
  }
  const lb = e.target.closest('[data-lesson]');
  if (lb) {
    if (lb.dataset.lesson !== state.lesson.id) location.hash = `#/l/${lb.dataset.lesson}`;
    else document.body.classList.remove('drawer-open');
    return;
  }
  const sb = e.target.closest('[data-step]');
  if (sb) {
    document.body.classList.remove('drawer-open');
    player.goto(Number(sb.dataset.step));
  }
});

$('.info').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  const sb = e.target.closest('[data-step]');
  if (sb && !el) {
    toScene();
    return player.goto(Number(sb.dataset.step));
  }
  const act = el?.dataset.act;
  if (act === 'itab') return applyItab(el.dataset.tab);
  if (act === 'doc') return openDoc(el.dataset.sec);
  if (act === 'play') {
    toScene();
    player.play();
  }
  if (act === 'replay') player.rebuild(-1).then(() => player.play());
  if (act === 'next') {
    const i = CATALOG.findIndex((l) => l.id === state.lesson.id);
    location.hash = `#/l/${CATALOG[(i + 1) % CATALOG.length].id}`;
  }
});

document.addEventListener('keydown', (e) => {
  if (state.page !== 'lesson' || state.mode === 'quiz' || inspector.isOpen || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (e.key === ' ' && (tag === 'BUTTON' || tag === 'TR' || tag === 'SUMMARY' || tag === 'A')) return;
  if (e.key === ' ') {
    e.preventDefault();
    toScene();
    player.play();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    toScene();
    player.stepOnce();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    player.prev();
  } else if (e.key === 'r' || e.key === 'R') {
    player.rebuild(-1);
  } else if (e.key === 'Escape') {
    document.body.classList.remove('drawer-open');
  }
});

window.addEventListener('hashchange', route);

// ───────────────────────── 启动 ─────────────────────────

// 字体用 JS 异步加载：拿不到 Google Fonts（比如国内网络）时不会卡住首屏，直接用系统字体。
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&family=Noto+Sans+SC:wght@400;500;700&display=swap';
document.head.append(fonts);

setLang(getLang());
clock.setSpeed(store.get('speed', 1));
applyStatic();
applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
applyView(state.view);
ws = setupWorkspace({ store, scene, player });
setupSearch({ catalog: CATALOG, subjects: SUBJECTS, questions: DEFS, getLang, open: openResult });
route();

/** 搜索结果：打开那节课；原理小节就打开原理页并滚到那一节，步骤就跳到那一步 */
async function openResult(x) {
  if (x.kind === 'quiz') {
    location.hash = `#/q/one/${x.qid}`;
    return;
  }
  if (decodeURIComponent(location.hash) !== `#/l/${x.id}`) location.hash = `#/l/${x.id}`;
  await showLesson(x.id);
  if (x.kind === 'doc') openDoc(x.sec);
  else if (x.kind === 'step') {
    toScene();
    await player.goto(x.step);
  }
}

// 调试 / 自动化截图用
window.__viz = { player, state, quiz: quizView, practice, openItem, applyTab, applyView, openDoc };
