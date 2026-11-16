// 练习页面：练习首页（按科目、章节列出题目和正确率）、做题、解析、结果页。
// 路由（都在 #/q 下）：
//   #/q                练习首页
//   #/q/l/课程id       这节课的题
//   #/q/c/科目/章      这一章的题
//   #/q/s/科目         这一科的题
//   #/q/all  #/q/wrong  #/q/star   全部 / 错题本 / 收藏
//   #/q/big            综合题（大题）
import { lessonById } from '../catalog.js';
import { L, T, esc, getLang } from '../core/i18n.js';
import { SUBJECTS, chapterOf, cnNo } from '../syllabus.js';
import { TYPE_NAME, idsFor, questionOf } from './bank.js';
import { gradeBig, judge, lessonHash } from './kit.js';
import { isStar, isWrong, record, statsOf, starIds, toggle, wrongIds } from './record.js';

const X = {
  hub: T('练习', 'Practice'),
  hubLead: T('每道题都连着课程：做错了，点解析里的「看动画」，就跳到那一步。计算题的数字可以换一组再练，答案由课程里同一份代码算出。', 'Every question links back to a lesson: open “watch” in the solution to jump to that step. Calculation questions can be regenerated with new numbers; answers come from the same code as the lessons.'),
  all: T('全部题目', 'All questions'),
  wrong: T('错题本', 'Mistakes'),
  star: T('收藏', 'Saved'),
  done: T('做过 {d} / {n} 题', '{d} of {n} done'),
  rate: T('正确率 {r}', '{r} correct'),
  noRate: T('还没做过', 'Not started'),
  practice: T('练习', 'Practice'),
  noQ: T('还没有题', 'No questions yet'),
  noQMore: T('另有 {n} 章的题还在准备中', '{n} more chapter(s) coming soon'),
  count: T('{n} 题', '{n} questions'),
  qOf: T('第 {i} / {n} 题', 'Question {i} of {n}'),
  exit: T('退出', 'Exit'),
  conv: T('约定', 'Convention'),
  submit: T('提交', 'Submit'),
  reveal: T('看解析', 'Show solution'),
  again: T('换一组数', 'New numbers'),
  starOn: T('已收藏', 'Saved'),
  starOff: T('收藏', 'Save'),
  wrongOn: T('在错题本里', 'In mistakes'),
  wrongOff: T('加入错题本', 'Add to mistakes'),
  prev: T('上一题', 'Previous'),
  next: T('下一题', 'Next'),
  finish: T('交卷看结果', 'Finish'),
  right: T('答对了', 'Correct'),
  wrongA: T('答错了', 'Not quite'),
  revealed: T('解析', 'Solution'),
  answer: T('正确答案：{a}', 'Answer: {a}'),
  steps: T('分步解析', 'Step by step'),
  watch: T('看动画', 'Watch'),
  read: T('看原理', 'Read'),
  related: T('相关课程', 'Related lessons'),
  inputNum: T('填一个数（可以写成分数）', 'Enter a number (fractions are fine)'),
  inputText: T('填写答案', 'Your answer'),
  yes: T('正确', 'True'),
  no: T('错误', 'False'),
  multiHint: T('多选题：选出所有正确的选项', 'Select every correct option'),
  result: T('本次结果', 'Results'),
  total: T('题数', 'Questions'),
  ok: T('答对', 'Correct'),
  bad: T('答错', 'Wrong'),
  skip: T('没作答', 'Skipped'),
  pct: T('正确率', 'Score'),
  time: T('用时', 'Time'),
  byChap: T('各章正确率', 'By chapter'),
  review: T('建议复习', 'Review these lessons'),
  redo: T('再做错题', 'Retry mistakes'),
  back: T('回到练习首页', 'Back to practice'),
  empty: T('这里还没有题。', 'Nothing here yet.'),
  emptyWrong: T('错题本是空的。答错的题会自动放进来，在这里答对就移出去。', 'No mistakes yet. Wrong answers land here and leave once you get them right here.'),
  emptyStar: T('还没有收藏的题。', 'No saved questions yet.'),
  diff: [T('基础', 'Basic'), T('中等', 'Medium'), T('较难', 'Hard')],
  fromLesson: T('{name} · 练习', '{name} · practice'),
  tabAnim: T('动画', 'Animation'),
  tabDoc: T('原理', 'Principle'),
  stepNo: T('解析第 {k} 步', 'Step {k}'),
  openLesson: T('在课程页打开', 'Open the full lesson'),
  big: T('综合题', 'Problems'),
  pts: T('{n} 分', '{n} pt'),
  score: T('得分 {g} / {t}', 'Score {g} / {t}'),
  selfNote: T('第 {list} 问是写思路或代码的题：对照参考答案和评分要点，做到了就打勾，分数会算进来。', 'Part {list} is written: tick the scoring points you covered and they count.'),
  essayPh: T('在这里写思路或代码（不自动判分，提交后对照参考答案和评分要点自己打分）', 'Write your idea or code here (self-graded after you submit)'),
  ref: T('参考答案', 'Reference answer'),
  rubric: T('评分要点：做到了就打勾', 'Scoring points: tick what you covered'),
  selfGot: T('自评 {g} / {t} 分', 'Self-graded {g} / {t}'),
  partAns: T('答案：{a}', 'Answer: {a}'),
};
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.replaceAll(`{${k}}`, x), s);
const tx = (k, v = {}) => fill(L(X[k]), v);
const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const pctOf = (x) => `${Math.round(x * 100)}%`;
const TAG = { 计算: T('计算', 'Calculation'), 概念: T('概念', 'Concept'), 易错点: T('易错点', 'Pitfall'), 过程推演: T('过程推演', 'Step by step') };
// 宽屏才分左右两栏
const WIDE = typeof matchMedia === 'function' ? matchMedia('(min-width: 1100px)') : { matches: false };
const LETTER ='ABCDEFGH';

export class QuizPage {
  constructor({ root, go }) {
    this.root = root;
    this.go = go; // 解析里「看动画」：go({ lesson, params, step, doc }, 回来的地址)
    this.s = null; // 当前这一轮
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    WIDE.addEventListener?.('change', () => this.view === 'q' && !root.hidden && this.renderQ());
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('.qz-input') && this.q?.type !== 'big') this.submit();
    });
  }

  /** 路由入口：path 是 #/q 后面的部分 */
  show(path) {
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return this.hub();
    const key = parts.join('/');
    // 从课程「看动画」回来时，接着上次那一题
    if (this.s && this.s.key === key && !this.s.finished) return this.renderQ();
    let ids;
    let title;
    let fromWrong = false;
    if (parts[0] === 'l') {
      ids = idsFor({ lesson: parts[1] });
      title = fill(L(X.fromLesson), { name: L(lessonById(parts[1])?.name ?? parts[1]) });
    } else if (parts[0] === 'c') {
      ids = idsFor({ subject: parts[1], chapter: parts[2] });
      const c = chapterOf(parts[1], parts[2]);
      title = c ? `${L(c.subject.short)} · ${L(c.chapter.name)}` : key;
    } else if (parts[0] === 's') {
      ids = idsFor({ subject: parts[1] });
      title = L(SUBJECTS.find((s) => s.id === parts[1])?.name ?? parts[1]);
    } else if (parts[0] === 'wrong') {
      ids = wrongIds().filter((id) => questionOf(id));
      title = L(X.wrong);
      fromWrong = true;
    } else if (parts[0] === 'star') {
      ids = starIds().filter((id) => questionOf(id));
      title = L(X.star);
    } else if (parts[0] === 'one') {
      ids = questionOf(parts[1]) ? [parts[1]] : [];
      title = L(questionOf(parts[1])?.topic ?? X.all);
    } else if (parts[0] === 'big') {
      ids = idsFor({ type: 'big' });
      title = L(X.big);
    } else if (parts[0] === 'redo') {
      ids = (this.lastWrong ?? []).filter((id) => questionOf(id));
      title = L(X.redo);
      fromWrong = true;
    } else {
      ids = idsFor();
      title = L(X.all);
    }
    if (!ids.length) return this.emptyPage(parts[0]);
    this.s = { key, title, fromWrong, items: ids.map((id) => ({ id, seed: undefined, input: null, marks: [], result: null, revealed: false })), i: 0, start: Date.now(), finished: false };
    this.renderQ();
  }

  refreshLang() {
    if (!this.root.isConnected || this.root.hidden) return;
    if (this.view === 'hub') this.hub();
    else if (this.view === 'result') this.result();
    else if (this.view === 'q') this.renderQ();
  }

  // ───── 练习首页 ─────
  hub() {
    this.view = 'hub';
    const zh = getLang() === 'zh';
    const all = idsFor();
    const st = statsOf(all);
    const subj = SUBJECTS.map((s) => {
      const sIds = idsFor({ subject: s.id });
      const rows = s.chapters
        .map((c, i) => {
          const ids = idsFor({ subject: s.id, chapter: c.id });
          const cs = statsOf(ids);
          const bar = cs.rate == null ? '' : `<i class="qz-bar"><i style="width:${cs.rate * 100}%"></i></i>`;
          return `<li class="qz-chap ${ids.length ? '' : 'is-empty'}">
            <span class="qz-cno">${zh ? cnNo(i + 1) : i + 1}</span>
            <span class="qz-cname">${esc(L(c.name))}</span>
            <span class="qz-cstat">${ids.length ? `${tx('count', { n: ids.length })}${cs.rate == null ? '' : ` · ${pctOf(cs.rate)}`}` : esc(L(X.noQ))}</span>
            ${bar}
            ${ids.length ? `<a class="qz-go" href="#/q/c/${s.id}/${c.id}">${esc(L(X.practice))}</a>` : ''}
          </li>`;
        })
        .join('');
      const empty = s.chapters.filter((c) => !idsFor({ subject: s.id, chapter: c.id }).length).length;
      const more = empty ? `<li class="qz-more">${esc(fill(L(X.noQMore), { n: empty }))}</li>` : '';
      return `<section class="qz-subj c-${s.tone}">
        <header><h3>${esc(L(s.name))}</h3><span>${tx('count', { n: sIds.length })}</span>${sIds.length ? `<a class="qz-go" href="#/q/s/${s.id}">${esc(L(X.practice))}</a>` : ''}</header>
        <ol>${rows}${more}</ol>
      </section>`;
    }).join('');
    this.root.innerHTML = `<div class="qz-inner">
      <section class="qz-hero">
        <h1>${esc(L(X.hub))}</h1>
        <p>${esc(L(X.hubLead))}</p>
        <div class="qz-sum">
          <span>${tx('done', { d: st.done, n: st.total })}</span>
          <span>${st.rate == null ? esc(L(X.noRate)) : tx('rate', { r: pctOf(st.rate) })}</span>
        </div>
        <div class="qz-hero-actions">
          <a class="cta" href="#/q/all">${esc(L(X.all))}</a>
          <a class="btn" href="#/q/big">${esc(L(X.big))}<b class="qz-n">${idsFor({ type: 'big' }).length}</b></a>
          <a class="btn" href="#/q/wrong">${esc(L(X.wrong))}<b class="qz-n">${wrongIds().length}</b></a>
          <a class="btn" href="#/q/star">${esc(L(X.star))}<b class="qz-n">${starIds().length}</b></a>
        </div>
      </section>
      <div class="qz-subjs">${subj}</div>
    </div>`;
  }

  emptyPage(kind) {
    this.view = 'empty';
    const msg = kind === 'wrong' ? X.emptyWrong : kind === 'star' ? X.emptyStar : X.empty;
    this.root.innerHTML = `<div class="qz-inner"><section class="qz-card qz-empty"><p>${esc(L(msg))}</p><a class="btn" href="#/q">${esc(L(X.back))}</a></section></div>`;
  }

  // ───── 做题 ─────
  get item() {
    return this.s.items[this.s.i];
  }

  renderQ() {
    this.view = 'q';
    const { s } = this;
    const it = this.item;
    const q = questionOf(it.id, it.seed);
    this.q = q;
    const c = chapterOf(q.subject, q.chapter);
    const n = s.items.length;
    const doneN = s.items.filter((x) => x.result != null || x.revealed).length;
    const shown = it.result != null || it.revealed;
    const diff = L(X.diff[q.difficulty - 1]);
    const tags = [`<span class="qz-tag">${esc(TYPE_NAME[q.type][getLang() === 'zh' ? 0 : 1])}</span>`, `<span class="qz-tag d${q.difficulty}">${esc(diff)}</span>`, `<span class="qz-tag">${esc(L(q.topic))}</span>`, ...q.tags.map((t) => `<span class="qz-tag soft">${esc(L(TAG[t] ?? t))}</span>`)].join('');
    // 宽屏上看解析时分成左右两栏：左边题目，右边是解析 / 动画 / 原理
    const split = shown && WIDE.matches;
    const key = `${it.id}:${it.seed ?? ''}`;
    const big = q.type === 'big';
    if (this.side?.key !== key) this.side = { key, tab: big && this.animSteps(q).length ? 'anim' : 'sol', k: null };
    const main = `
      <header class="qz-head c-${c.subject.tone}">
        <div class="qz-crumb"><b>${esc(s.title)}</b><span>${esc(L(c.subject.short))} · ${esc(L(c.chapter.name))}</span></div>
        <span class="qz-count">${tx('qOf', { i: s.i + 1, n })}</span>
        <a class="qz-exit" href="#/q">${esc(L(X.exit))}</a>
        <i class="qz-prog"><i style="width:${(doneN / n) * 100}%"></i></i>
      </header>
      <article class="qz-card">
        <div class="qz-tags">${tags}</div>
        <p class="qz-q">${rich(L(q.question))}</p>
        ${q.material ? `<figure class="qz-mat">${q.material.title ? `<figcaption>${esc(L(q.material.title))}</figcaption>` : ''}<pre>${esc(L(q.material.text))}</pre></figure>` : ''}
        ${q.conv ? `<p class="qz-conv"><b>${esc(L(X.conv))}</b>${rich(L(q.conv))}</p>` : ''}
        ${q.type === 'multi' && !big ? `<p class="qz-hint">${esc(L(X.multiHint))}</p>` : ''}
        <div class="qz-answer">${big ? this.partsHtml(q, it, shown) : this.inputHtml(q, it, shown)}</div>
        <div class="qz-actions">
          ${shown ? '' : `<button class="cta" data-q="submit">${esc(L(X.submit))}</button><button class="btn" data-q="reveal">${esc(L(X.reveal))}</button>`}
          ${q.generated ? `<button class="btn" data-q="again">${esc(L(X.again))}</button>` : ''}
          <span class="qz-sp"></span>
          <button class="btn qz-toggle ${isStar(q.id) ? 'on' : ''}" data-q="star">${esc(L(isStar(q.id) ? X.starOn : X.starOff))}</button>
          <button class="btn qz-toggle ${isWrong(q.id) ? 'on' : ''}" data-q="wrongbook">${esc(L(isWrong(q.id) ? X.wrongOn : X.wrongOff))}</button>
        </div>
        ${shown && !split && !big ? this.solutionHtml(q, it) : ''}
      </article>
      <nav class="qz-nav">
        <button class="btn" data-q="prev" ${s.i === 0 ? 'disabled' : ''}>← ${esc(L(X.prev))}</button>
        <span class="qz-dots">${s.items.map((x, k) => `<button class="qz-dot ${k === s.i ? 'cur' : ''} ${x.result === true ? 'ok' : x.result === false ? 'bad' : x.revealed ? 'seen' : ''}" data-q="jump" data-k="${k}" aria-label="${k + 1}">${k + 1}</button>`).join('')}</span>
        ${s.i === n - 1 ? `<button class="cta" data-q="finish">${esc(L(X.finish))}</button>` : `<button class="btn" data-q="next">${esc(L(X.next))} →</button>`}
      </nav>`;
    this.root.innerHTML = split
      ? `<div class="qz-inner qz-doing is-split"><div class="qz-main">${main}</div><aside class="qz-side">${this.sideHtml(q, it)}</aside></div>`
      : `<div class="qz-inner qz-doing">${main}</div>`;
    if (!shown) this.root.querySelector('.qz-input')?.focus({ preventScroll: true });
    this.root.scrollTo?.(0, 0);
  }

  // ───── 右边的面板：解析 / 动画 / 原理 ─────
  /** 解析里能「看动画」的步骤，和能「看原理」的那一处 */
  animSteps(q) {
    return q.steps.map((st, k) => (st.go && !st.go.doc ? k : -1)).filter((k) => k >= 0);
  }
  docGo(q) {
    return q.steps.find((st) => st.go?.doc)?.go ?? { lesson: q.lessons[0], doc: '_' };
  }
  frameSrc(go) {
    const lang = getLang();
    const theme = document.documentElement.dataset.theme ?? 'light';
    return location.href.split('#')[0] + lessonHash(go, { embed: '1', theme, lang });
  }

  sideHtml(q, it) {
    const sd = this.side;
    const anims = this.animSteps(q);
    if (sd.tab === 'anim' && sd.k == null) sd.k = anims[0] ?? null;
    const tabs = [
      ['sol', X.revealed],
      ['anim', X.tabAnim, !anims.length],
      ['doc', X.tabDoc],
    ]
      .map(([id, name, off]) => `<button class="qz-stab ${sd.tab === id ? 'on' : ''}" data-q="tab" data-t="${id}" ${off ? 'disabled' : ''}>${esc(L(name))}</button>`)
      .join('');
    let body;
    if (sd.tab === 'sol') body = `<div class="qz-side-sol">${this.solutionHtml(q, it)}</div>`;
    else if (sd.tab === 'anim') {
      const st = q.steps[sd.k];
      const pos = anims.indexOf(sd.k);
      body = `<div class="qz-strip">
          <button class="qz-arrow" data-q="sidestep" data-d="-1" ${pos <= 0 ? 'disabled' : ''} aria-label="${esc(L(X.prev))}">‹</button>
          <p><b>${tx('stepNo', { k: sd.k + 1 })}</b>${rich(L(st.text))}</p>
          <button class="qz-arrow" data-q="sidestep" data-d="1" ${pos >= anims.length - 1 ? 'disabled' : ''} aria-label="${esc(L(X.next))}">›</button>
        </div>
        <iframe class="qz-frame" title="${esc(L(X.tabAnim))}" src="${esc(this.frameSrc(st.go))}"></iframe>
        <button class="qz-open" data-q="open">${esc(L(X.openLesson))} ↗</button>`;
    } else {
      const go = sd.k != null && q.steps[sd.k]?.go?.doc ? q.steps[sd.k].go : this.docGo(q);
      body = `<iframe class="qz-frame doc" title="${esc(L(X.tabDoc))}" src="${esc(this.frameSrc(go))}"></iframe>
        <button class="qz-open" data-q="open">${esc(L(X.openLesson))} ↗</button>`;
    }
    return `<div class="qz-stabs">${tabs}</div>${body}`;
  }

  /** 只重画右边的面板。同一节课只换步数时，iframe 只改地址里 # 后面的部分，不会重新加载 */
  renderSide() {
    const side = this.root.querySelector('.qz-side');
    if (!side) return this.renderQ();
    const wrap = document.createElement('div');
    wrap.innerHTML = this.sideHtml(this.q, this.item);
    const frame = side.querySelector('.qz-frame');
    const next = wrap.querySelector('.qz-frame');
    if (frame && next && side.dataset.tab === this.side.tab) {
      // 同一个标签页里只换步数：iframe 留在原处、只改地址（移动 iframe 会让它整页重新加载）
      side.querySelector('.qz-stabs').replaceWith(wrap.querySelector('.qz-stabs'));
      const strip = side.querySelector('.qz-strip');
      const nstrip = wrap.querySelector('.qz-strip');
      if (strip && nstrip) strip.replaceWith(nstrip);
      const src = next.getAttribute('src');
      if (frame.getAttribute('src') !== src) frame.src = src;
    } else side.replaceChildren(...wrap.childNodes);
    side.dataset.tab = this.side.tab;
    side.querySelectorAll('.qz-steps li').forEach((li, k) => li.classList.toggle('cur', k === this.side.k));
  }

  inputHtml(q, it, shown, idx = '') {
    const mark = (k) => {
      if (!shown) return '';
      const right = q.type === 'multi' ? q.answer.includes(k) : q.answer === k;
      const picked = q.type === 'multi' ? (it.input ?? []).includes(k) : it.input === k;
      return right ? 'is-right' : picked ? 'is-wrong' : '';
    };
    if (q.type === 'single' || q.type === 'multi') {
      const kind = q.type === 'multi' ? 'checkbox' : 'radio';
      return `<div class="qz-opts">${q.options
        .map((o, k) => {
          const on = q.type === 'multi' ? (it.input ?? []).includes(k) : it.input === k;
          return `<label class="qz-opt ${on ? 'on' : ''} ${mark(k)}"><input type="${kind}" name="qz-opt${idx}" value="${k}" ${on ? 'checked' : ''} ${shown ? 'disabled' : ''}><span class="qz-letter">${LETTER[k]}</span><span>${rich(L(o))}</span></label>`;
        })
        .join('')}</div>`;
    }
    if (q.type === 'judge') {
      return `<div class="qz-opts two">${[true, false]
        .map((v) => `<label class="qz-opt ${it.input === v ? 'on' : ''} ${mark(v)}"><input type="radio" name="qz-opt${idx}" value="${v}" ${it.input === v ? 'checked' : ''} ${shown ? 'disabled' : ''}><span class="qz-letter">${v ? '✓' : '✕'}</span><span>${esc(L(v ? X.yes : X.no))}</span></label>`)
        .join('')}</div>`;
    }
    const ph = L(q.type === 'number' ? X.inputNum : X.inputText);
    const cls = it.result == null ? '' : it.result ? 'is-right' : 'is-wrong';
    return `<input class="qz-input ${cls}" data-part="${idx}" type="text" inputmode="${q.type === 'number' ? 'decimal' : 'text'}" autocomplete="off" spellcheck="false" placeholder="${esc(ph)}" value="${esc(it.input ?? '')}" ${shown ? 'disabled' : ''}>`;
  }

  answerText(q) {
    if (q.type === 'single') return `${LETTER[q.answer]}. ${L(q.options[q.answer])}`;
    if (q.type === 'multi') return q.answer.map((k) => LETTER[k]).join('、');
    if (q.type === 'judge') return L(q.answer ? X.yes : X.no);
    if (q.type === 'number') return q.answer.show ?? String(q.answer.value);
    return q.answer.show;
  }

  solutionHtml(q, it) {
    if (q.type === 'big') return this.bigSolutionHtml(q, it);
    const head = it.result == null ? `<b class="qz-verdict seen">${esc(L(X.revealed))}</b>` : `<b class="qz-verdict ${it.result ? 'ok' : 'bad'}">${esc(L(it.result ? X.right : X.wrongA))}</b>`;
    const steps = q.steps
      .map((st, k) => {
        const g = st.go;
        const btn = g ? `<button class="qz-watch" data-q="go" data-k="${k}">${esc(L(g.doc ? X.read : X.watch))} ▸</button>` : '';
        return `<li><span>${rich(L(st.text))}</span>${btn}</li>`;
      })
      .join('');
    const rel = q.lessons.map((id) => `<a href="#/l/${id}">${esc(L(lessonById(id)?.name ?? id))}</a>`).join('');
    return `<section class="qz-sol">
      <div class="qz-sol-head">${head}<span>${esc(fill(L(X.answer), { a: this.answerText(q) }))}</span></div>
      <h4>${esc(L(X.steps))}</h4>
      <ol class="qz-steps">${steps}</ol>
      <p class="qz-rel"><b>${esc(L(X.related))}</b>${rel}</p>
    </section>`;
  }

  // ───── 综合题 ─────
  partsHtml(q, it, shown) {
    const inputs = it.input ?? [];
    const g = shown ? gradeBig(q, inputs, it.marks) : null;
    const essays = q.parts.map((p, i) => (p.type === 'essay' ? i + 1 : 0)).filter(Boolean);
    const head = g ? `<div class="qz-score"><b data-score>${esc(fill(L(X.score), { g: g.got, t: g.total }))}</b>${essays.length ? `<span>${esc(fill(L(X.selfNote), { list: essays.join('、') }))}</span>` : ''}</div>` : '';
    const body = q.parts
      .map((p, i) => {
        const input =
          p.type === 'essay'
            ? `<textarea class="qz-essay" data-part="${i}" rows="6" spellcheck="false" placeholder="${esc(L(X.essayPh))}" ${shown ? 'disabled' : ''}>${esc(inputs[i] ?? '')}</textarea>`
            : this.inputHtml(p, { input: inputs[i] ?? null, result: g ? g.parts[i].ok : null }, shown, i);
        return `<section class="qz-part" data-part="${i}">
          <h5><span class="qz-pno">(${i + 1})</span><span class="qz-ask">${rich(L(p.ask))}</span><span class="qz-pts">${esc(fill(L(X.pts), { n: p.pts }))}</span></h5>
          ${p.type === 'multi' && !shown ? `<p class="qz-hint">${esc(L(X.multiHint))}</p>` : ''}
          ${input}
          ${g ? this.partSolHtml(p, i, it, g.parts[i]) : ''}
        </section>`;
      })
      .join('');
    return head + body;
  }

  partSolHtml(p, i, it, gp) {
    const verdict = gp.essay
      ? `<b class="qz-verdict seen" data-self="${i}">${esc(fill(L(X.selfGot), { g: gp.got, t: gp.pts }))}</b>`
      : gp.ok == null
        ? `<b class="qz-verdict seen">${esc(L(X.revealed))}</b>`
        : `<b class="qz-verdict ${gp.ok ? 'ok' : 'bad'}">${esc(L(gp.ok ? X.right : X.wrongA))}</b>`;
    let ans = '';
    if (gp.essay) {
      const marks = it.marks[i] ?? [];
      const ref = `${p.ref.text ? `<p>${rich(L(p.ref.text))}</p>` : ''}${p.ref.code ? `<pre class="qz-code">${esc(L(p.ref.code))}</pre>` : ''}`;
      const rub = p.rubric
        .map((r, j) => `<label class="qz-rub ${marks.includes(j) ? 'on' : ''}"><input type="checkbox" class="qz-rub-box" data-part="${i}" data-r="${j}" ${marks.includes(j) ? 'checked' : ''}><span>${rich(L(r.text))}</span><b>+${r.pts}</b></label>`)
        .join('');
      ans = `<div class="qz-ref"><h6>${esc(L(X.ref))}</h6>${ref}</div><div class="qz-rubric"><h6>${esc(L(X.rubric))}</h6>${rub}</div>`;
    } else ans = `<span>${esc(fill(L(X.partAns), { a: this.answerText(p) }))}</span>`;
    const steps = p.steps
      .map((st, j) => {
        const g = st.go;
        const btn = g ? `<button class="qz-watch" data-q="go" data-k="${p.k0 + j}">${esc(L(g.doc ? X.read : X.watch))} ▸</button>` : '';
        return `<li><span>${rich(L(st.text))}</span>${btn}</li>`;
      })
      .join('');
    return `<div class="qz-psol"><div class="qz-sol-head">${verdict}${gp.essay ? '' : ans}</div>${gp.essay ? ans : ''}<ol class="qz-steps">${steps}</ol></div>`;
  }

  bigSolutionHtml(q, it) {
    const g = gradeBig(q, it.input ?? [], it.marks);
    const steps = q.steps
      .map((st, k) => {
        const first = k === q.parts[st.part].k0;
        const btn = st.go ? `<button class="qz-watch" data-q="go" data-k="${k}">${esc(L(st.go.doc ? X.read : X.watch))} ▸</button>` : '';
        return `<li><span>${first ? `<b class="qz-pno">(${st.part + 1})</b> ` : ''}${rich(L(st.text))}</span>${btn}</li>`;
      })
      .join('');
    const rel = q.lessons.map((id) => `<a href="#/l/${id}">${esc(L(lessonById(id)?.name ?? id))}</a>`).join('');
    return `<section class="qz-sol">
      <div class="qz-sol-head"><b class="qz-verdict seen" data-score>${esc(fill(L(X.score), { g: g.got, t: g.total }))}</b></div>
      <h4>${esc(L(X.steps))}</h4>
      <ol class="qz-steps">${steps}</ol>
      <p class="qz-rel"><b>${esc(L(X.related))}</b>${rel}</p>
    </section>`;
  }

  readBig() {
    return this.q.parts.map((p, i) => {
      if (p.type === 'essay') return this.root.querySelector(`.qz-essay[data-part="${i}"]`)?.value ?? '';
      if (p.type === 'single') {
        const el = this.root.querySelector(`input[name="qz-opt${i}"]:checked`);
        return el ? Number(el.value) : null;
      }
      if (p.type === 'multi') return [...this.root.querySelectorAll(`input[name="qz-opt${i}"]:checked`)].map((e) => Number(e.value));
      if (p.type === 'judge') {
        const el = this.root.querySelector(`input[name="qz-opt${i}"]:checked`);
        return el ? el.value === 'true' : null;
      }
      return this.root.querySelector(`.qz-input[data-part="${i}"]`)?.value ?? '';
    });
  }

  readInput() {
    const q = this.q;
    if (q.type === 'big') return this.readBig();
    if (q.type === 'single') {
      const el = this.root.querySelector('input[name="qz-opt"]:checked');
      return el ? Number(el.value) : null;
    }
    if (q.type === 'multi') return [...this.root.querySelectorAll('input[name="qz-opt"]:checked')].map((e) => Number(e.value));
    if (q.type === 'judge') {
      const el = this.root.querySelector('input[name="qz-opt"]:checked');
      return el ? el.value === 'true' : null;
    }
    return this.root.querySelector('.qz-input')?.value ?? '';
  }

  submit() {
    const it = this.item;
    if (it.result != null || it.revealed) return;
    it.input = this.readInput();
    if (this.q.type === 'big') {
      const any = it.input.some((x) => x != null && x !== '' && !(Array.isArray(x) && !x.length));
      if (!any) {
        this.root.querySelector('.qz-answer')?.classList.add('shake');
        setTimeout(() => this.root.querySelector('.qz-answer')?.classList.remove('shake'), 400);
        return;
      }
      // 能自动判分的小问全对算「答对」；写思路、写代码的小问由自己对照要点打分，不影响这里
      const g = gradeBig(this.q, it.input, it.marks);
      it.result = g.autoOk === g.auto;
      record(this.q.id, it.result, { fromWrong: this.s.fromWrong });
      return this.renderQ();
    }
    const ok = judge(this.q, it.input);
    if (ok == null) {
      this.root.querySelector('.qz-answer')?.classList.add('shake');
      setTimeout(() => this.root.querySelector('.qz-answer')?.classList.remove('shake'), 400);
      return;
    }
    it.result = ok;
    record(this.q.id, ok, { fromWrong: this.s.fromWrong });
    this.renderQ();
  }

  // ───── 结果 ─────
  result() {
    this.view = 'result';
    const { s } = this;
    s.finished = true;
    const n = s.items.length;
    const ok = s.items.filter((x) => x.result === true).length;
    const bad = s.items.filter((x) => x.result === false).length;
    const sec = Math.round(((s.end ?? Date.now()) - s.start) / 1000);
    const time = sec >= 60 ? `${Math.floor(sec / 60)}′${String(sec % 60).padStart(2, '0')}″` : `${sec}″`;
    const chaps = new Map();
    for (const x of s.items) {
      const q = questionOf(x.id, x.seed);
      const k = `${q.subject}/${q.chapter}`;
      const c = chaps.get(k) ?? { q, n: 0, ok: 0 };
      c.n++;
      if (x.result === true) c.ok++;
      chaps.set(k, c);
    }
    const chapRows = [...chaps.values()]
      .map(({ q, n: cn, ok: co }) => {
        const c = chapterOf(q.subject, q.chapter);
        return `<li class="c-${c.subject.tone}"><span>${esc(L(c.subject.short))} · ${esc(L(c.chapter.name))}</span><i class="qz-bar"><i style="width:${(co / cn) * 100}%"></i></i><b>${co} / ${cn}</b></li>`;
      })
      .join('');
    const wrongItems = s.items.filter((x) => x.result !== true);
    this.lastWrong = wrongItems.map((x) => x.id);
    const lessons = [...new Set(wrongItems.flatMap((x) => questionOf(x.id).lessons))];
    this.root.innerHTML = `<div class="qz-inner">
      <section class="qz-card qz-result">
        <h2>${esc(L(X.result))} · ${esc(s.title)}</h2>
        <div class="qz-big">
          <div><b>${n}</b><span>${esc(L(X.total))}</span></div>
          <div class="ok"><b>${ok}</b><span>${esc(L(X.ok))}</span></div>
          <div class="bad"><b>${bad}</b><span>${esc(L(X.bad))}</span></div>
          <div><b>${n - ok - bad}</b><span>${esc(L(X.skip))}</span></div>
          <div><b>${pctOf(ok / n)}</b><span>${esc(L(X.pct))}</span></div>
          <div><b>${time}</b><span>${esc(L(X.time))}</span></div>
        </div>
        <h4>${esc(L(X.byChap))}</h4>
        <ul class="qz-chaps">${chapRows}</ul>
        ${lessons.length ? `<h4>${esc(L(X.review))}</h4><p class="qz-rel">${lessons.map((id) => `<a href="#/l/${id}">${esc(L(lessonById(id)?.name ?? id))}</a>`).join('')}</p>` : ''}
        <div class="qz-actions">
          ${wrongItems.length ? `<a class="cta" href="#/q/redo">${esc(L(X.redo))}</a>` : ''}
          <a class="btn" href="#/q">${esc(L(X.back))}</a>
        </div>
      </section>
    </div>`;
  }

  // ───── 事件 ─────
  onChange(e) {
    if (e.target.matches('.qz-rub-box')) return this.onRubric(e.target);
    if (!e.target.matches('input[name^="qz-opt"]')) return;
    for (const lab of this.root.querySelectorAll('.qz-opt')) lab.classList.toggle('on', lab.querySelector('input').checked);
  }

  /** 自评打勾：只更新分数，不重画（不然滚动位置会跳回顶部） */
  onRubric(box) {
    const it = this.item;
    const i = Number(box.dataset.part);
    const j = Number(box.dataset.r);
    const set = new Set(it.marks[i] ?? []);
    if (box.checked) set.add(j);
    else set.delete(j);
    it.marks[i] = [...set].sort((a, b) => a - b);
    box.closest('.qz-rub')?.classList.toggle('on', box.checked);
    const g = gradeBig(this.q, it.input ?? [], it.marks);
    for (const el of this.root.querySelectorAll('[data-score]')) el.textContent = fill(L(X.score), { g: g.got, t: g.total });
    const self = this.root.querySelector(`[data-self="${i}"]`);
    if (self) self.textContent = fill(L(X.selfGot), { g: g.parts[i].got, t: g.parts[i].pts });
  }

  onClick(e) {
    const b = e.target.closest('[data-q]');
    if (!b || !this.s) return;
    const act = b.dataset.q;
    const s = this.s;
    const it = this.item;
    if (act === 'submit') return this.submit();
    if (act === 'reveal') {
      it.input = this.readInput();
      it.revealed = true;
      return this.renderQ();
    }
    if (act === 'again') {
      it.seed = Math.floor(Math.random() * 2 ** 31);
      it.input = null;
      it.marks = [];
      it.result = null;
      it.revealed = false;
      return this.renderQ();
    }
    if (act === 'star' || act === 'wrongbook') {
      const on = toggle(act === 'star' ? 'star' : 'wrong', this.q.id);
      b.classList.toggle('on', on);
      b.textContent = L(act === 'star' ? (on ? X.starOn : X.starOff) : on ? X.wrongOn : X.wrongOff);
      return;
    }
    if (act === 'prev' || act === 'next' || act === 'jump') {
      s.i = act === 'jump' ? Number(b.dataset.k) : Math.max(0, Math.min(s.items.length - 1, s.i + (act === 'next' ? 1 : -1)));
      return this.renderQ();
    }
    if (act === 'finish') {
      s.end = Date.now();
      return this.result();
    }
    if (act === 'go') {
      const k = Number(b.dataset.k);
      const st = this.q.steps[k];
      if (!st?.go) return;
      // 宽屏：在右边的面板里看；窄屏：跳到课程页
      if (!this.root.querySelector('.qz-side')) return this.go(st.go, `#/q/${s.key}`);
      this.side.k = k;
      this.side.tab = st.go.doc ? 'doc' : 'anim';
      return this.renderSide();
    }
    if (act === 'tab') {
      this.side.tab = b.dataset.t;
      if (this.side.tab === 'anim' && !this.animSteps(this.q).includes(this.side.k)) this.side.k = null;
      return this.renderSide();
    }
    if (act === 'sidestep') {
      const list = this.animSteps(this.q);
      const pos = list.indexOf(this.side.k) + Number(b.dataset.d);
      if (pos >= 0 && pos < list.length) this.side.k = list[pos];
      return this.renderSide();
    }
    if (act === 'open') {
      const sd = this.side;
      const cur = sd.k != null ? this.q.steps[sd.k]?.go : null;
      const go = sd.tab === 'anim' ? cur : cur?.doc ? cur : this.docGo(this.q);
      if (go) this.go(go, `#/q/${s.key}`);
    }
  }
}
