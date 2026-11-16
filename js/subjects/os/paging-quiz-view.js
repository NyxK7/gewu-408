// 页面置换做题模式的界面：作答、点块、反馈、播放原动画、进入下一步。
// 判题只调用 paging-quiz.js，画板只调用课程自己的 quizBoardAt，动画复用 Player.playStep。
import { L, T, esc, getLang } from '../../core/i18n.js';
import { buildPagingLesson, quizBoardAt } from './paging-lesson.js';
import { QUIZ_FRAMES, correctAnswer, generateQuiz, judgeStep, quizFrom } from './paging-quiz.js';

const STAGE3_ALGOS = ['FIFO', 'LRU'];
const z = () => getLang() === 'zh';
const text = (zh, en) => esc(L(T(zh, en)));

export class PagingQuiz {
  constructor({ player, scene, root, load }) {
    this.player = player;
    this.scene = scene;
    this.root = root;
    this.load = load;
    this.active = false;
    this.session = 0;
    this.timer = null;
    this.quiz = null;
    this.lesson = null;
    this.t = 0;
    this.phase = 'idle';
    this.feedback = null;
    this.results = [];
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  get total() {
    return this.quiz?.sim.steps.length ?? 0;
  }

  get page() {
    return this.quiz?.refs[this.t] ?? '';
  }

  get correctCount() {
    return this.results.filter((r) => r?.ok).length;
  }

  close() {
    this.active = false;
    this.session++;
    clearTimeout(this.timer);
    this.timer = null;
    this.scene?.clearBoardPick();
    this.scene?.svg.classList.remove('is-picking');
    this.scene?.clearNotes();
    this.root.hidden = true;
    this.root.innerHTML = '';
    this.quiz = null;
    this.lesson = null;
    this.t = 0;
    this.phase = 'idle';
    this.blocked = null;
    this.feedback = null;
    this.results = [];
  }

  /** 用课程当前参数开始一道题；参数不合法时退回种子随机题 */
  async start(params = {}) {
    if (params.algo && !STAGE3_ALGOS.includes(params.algo)) {
      this.close();
      this.active = true;
      this.blocked = { type: 'unsupported', algo: params.algo };
      this.root.hidden = false;
      this.renderUnsupported(params.algo);
      return false;
    }
    const algo = STAGE3_ALGOS.includes(params.algo) ? params.algo : 'LRU';
    const frames = QUIZ_FRAMES.includes(params.frames) ? params.frames : 3;
    let quiz = Array.isArray(params.refs) && params.refs.length ? quizFrom({ algo, frames, refs: params.refs }) : null;
    if (!quiz?.ok) quiz = generateQuiz({ algo, frames, seed: 1 });
    if (!quiz?.ok) {
      this.close();
      this.active = true;
      this.blocked = { type: 'error' };
      this.root.hidden = false;
      this.renderError();
      return false;
    }
    const lesson = buildPagingLesson({ algo: quiz.algo, frames: quiz.frames, refs: quiz.refs });
    this.close();
    this.quiz = quiz;
    this.lesson = lesson;
    this.active = true;
    this.session++;
    this.t = 0;
    this.phase = 'answer';
    this.feedback = null;
    this.results = [];
    this.root.hidden = false;
    await this.load(lesson);
    if (!this.active) return false;
    await this.showPreview(0);
    return true;
  }

  /** 停在第 t 次访问之前；只高亮当前页，不暴露命中/缺页或换出块 */
  async showPreview(t) {
    if (!this.active) return;
    const session = this.session;
    this.t = t;
    this.phase = 'answer';
    this.feedback = null;
    this.scene.clearBoardPick();
    this.scene.svg.classList.remove('is-picking');
    this.scene.clearNotes();
    await this.scene.setBoard(quizBoardAt(this.quiz.sim, t, z()), null, false);
    if (!this.active || session !== this.session) return;
    this.render();
    if (matchMedia('(max-width: 760px)').matches) document.querySelector('.stage')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  submitKind(kind) {
    if (!this.active || this.phase !== 'answer') return;
    const r = judgeStep(this.quiz, this.t, { kind });
    if (r.error) return;
    if (r.pending) {
      this.phase = 'pick';
      this.scene.svg.classList.add('is-picking');
      this.scene.setBoardPick((slot) => this.submitSlot(slot));
      this.render();
      return;
    }
    this.finishStep(r, kind);
  }

  submitSlot(slot) {
    if (!this.active || this.phase !== 'pick') return;
    this.finishStep(judgeStep(this.quiz, this.t, { kind: 'fault', slot }), 'fault', slot);
  }

  backToAnswer() {
    if (this.phase !== 'pick') return;
    this.phase = 'answer';
    this.scene.clearBoardPick();
    this.scene.svg.classList.remove('is-picking');
    this.render();
  }

  finishStep(r, kind, slot = null) {
    this.scene.clearBoardPick();
    this.scene.svg.classList.remove('is-picking');
    this.phase = 'feedback';
    this.feedback = { ok: r.ok, kind, slot, correct: r.correct, reason: r.reason };
    this.results[this.t] = { ok: r.ok, kind, slot };
    this.render();
    if (r.ok) {
      const session = this.session;
      this.timer = setTimeout(() => {
        if (this.active && session === this.session) this.playCurrent();
      }, 700);
    }
  }

  async playCurrent() {
    if (!this.active || this.phase !== 'feedback') return;
    clearTimeout(this.timer);
    this.timer = null;
    const session = this.session;
    this.phase = 'playing';
    this.render();
    const ok = await this.player.playStep(this.t);
    if (!this.active || session !== this.session) return;
    if (!ok) {
      if (this.phase === 'playing') {
        this.phase = 'feedback';
        this.render();
      }
      return;
    }
    if (this.t >= this.total - 1) {
      this.phase = 'done';
      this.render();
      this.root.querySelector('.quiz-done')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    await this.showPreview(this.t + 1);
  }

  onClick(e) {
    const btn = e.target.closest('[data-quiz]');
    if (!btn || !this.root.contains(btn)) return;
    const act = btn.dataset.quiz;
    if (act === 'hit' || act === 'fault') this.submitKind(act);
    else if (act === 'slot') this.submitSlot(Number(btn.dataset.slot));
    else if (act === 'ack') this.playCurrent();
    else if (act === 'back') this.backToAnswer();
  }

  render() {
    if (!this.active) return;
    const { t, total, phase } = this;
    const step = this.quiz.sim.steps[t];
    const done = phase === 'done';
    const progress = Math.round(((done ? total : t) / total) * 100);
    let body = '';

    if (phase === 'answer') {
      body = `
        <div class="quiz-card">
          <span class="quiz-label">${text('当前访问', 'Current access')}</span>
          <div class="quiz-page">${this.page}</div>
          <p class="quiz-ask">${text('这一页在内存里吗？', 'Is this page in memory?')}</p>
        </div>
        <div class="quiz-choices">
          <button type="button" class="quiz-choice is-hit" data-quiz="hit"><b>${text('命中', 'Hit')}</b></button>
          <button type="button" class="quiz-choice is-fault" data-quiz="fault"><b>${text('缺页', 'Fault')}</b></button>
        </div>`;
    } else if (phase === 'pick') {
      const frames = step.before.frames;
      body = `
        <div class="quiz-card">
          <span class="quiz-label">${text('缺页 · 内存已满', 'Fault · memory is full')}</span>
          <p class="quiz-ask">${text('点一个要换出的块', 'Tap the frame to evict')}</p>
        </div>
        <div class="quiz-slots">
          ${frames
            .map(
              (p, j) => `<button type="button" class="quiz-slot" data-quiz="slot" data-slot="${j}">
                <span>${text(`块 ${j + 1}`, `Frame ${j + 1}`)}</span><b>${text(`页 ${p}`, `page ${p}`)}</b>
              </button>`,
            )
            .join('')}
        </div>
        <button type="button" class="quiz-back" data-quiz="back">${text('返回', 'Back')}</button>`;
    } else if (phase === 'feedback' || phase === 'playing') {
      const fb = this.feedback;
      body = `
        <div class="quiz-feedback ${fb.ok ? 'is-ok' : 'is-bad'}" aria-live="polite">
          <b>${fb.ok ? text('答对了', 'Correct') : text('答错了', 'Not quite')}</b>
          <p class="quiz-answer">${fb.ok ? esc(L(fb.correct)) : `<span>${text('正确答案', 'Answer')}</span>${esc(L(fb.correct))}`}</p>
          ${fb.ok ? '' : `<p class="quiz-why">${esc(L(fb.reason))}</p>`}
        </div>
        ${phase === 'playing' ? `<p class="quiz-playing">${text('正在播放这一步的动画…', 'Playing this step…')}</p>` : ''}
        ${!fb.ok && phase === 'feedback' ? `<button type="button" class="quiz-ack" data-quiz="ack">${text('明白了', 'Got it')}</button>` : ''}`;
    } else if (phase === 'done') {
      body = `
        <div class="quiz-done">
          <div class="kicker ok">${text('完成', 'Done')}</div>
          <h2>${text('本题做完了', 'Question complete')}</h2>
          <div class="quiz-done-score"><b>${this.correctCount}</b><span>${text(`/ ${total} 步答对`, `/ ${total} correct`)}</span></div>
          <a class="cta" href="#/l/${this.lesson.id}">${text('返回看动画', 'Back to animation')}</a>
        </div>`;
    }

    this.root.innerHTML = `
      <div class="quiz-top">
        <div class="kicker"><i></i>${text('做题模式', 'Practice')}</div>
        <a class="quiz-exit" href="#/l/${this.lesson.id}">${text('返回看动画', 'Back to animation')}</a>
      </div>
      <div class="quiz-meta">
        <span class="quiz-badge">${esc(this.quiz.algo)}</span>
        <span>${text(`${this.quiz.frames} 个内存块`, `${this.quiz.frames} frames`)}</span>
        ${done ? '' : `<span>${text(`第 ${t + 1} / ${total} 次访问`, `Access ${t + 1} of ${total}`)}</span>`}
      </div>
      <div class="quiz-track" aria-hidden="true"><i style="width:${progress}%"></i></div>
      ${body}`;
  }

  renderError() {
    this.root.innerHTML = `
      <div class="quiz-top">
        <div class="kicker"><i></i>${text('做题模式', 'Practice')}</div>
      </div>
      <p class="quiz-ask">${text('这道题暂时生成不了，请返回课程检查参数。', 'Could not build this question. Go back and check the lesson parameters.')}</p>
      <a class="cta" href="#/l/page-replace">${text('返回看动画', 'Back to animation')}</a>`;
  }

  renderUnsupported(algo) {
    this.root.innerHTML = `
      <div class="quiz-top">
        <div class="kicker"><i></i>${text('做题模式', 'Practice')}</div>
        <a class="quiz-exit" href="#/l/page-replace">${text('返回看动画', 'Back to animation')}</a>
      </div>
      <div class="quiz-card">
        <span class="quiz-label">${esc(algo)}</span>
        <p class="quiz-ask">${text('这张题暂时只支持 FIFO 和 LRU。请回到课程参数里换成这两种算法再试。', 'This question supports FIFO and LRU for now. Switch the lesson to one of them and try again.')}</p>
      </div>
      <a class="cta" href="#/l/page-replace">${text('返回看动画', 'Back to animation')}</a>`;
  }

  /** 语言切换后按当前阶段重建画板并重绘；作答/选块阶段仍只高亮当前页 */
  async refreshLang() {
    if (!this.active) return;
    if (this.blocked) {
      if (this.blocked.type === 'unsupported') this.renderUnsupported(this.blocked.algo);
      else this.renderError();
      return;
    }
    const phase = this.phase;
    const t = this.t;
    const session = this.session;
    if (phase === 'playing') {
      await this.player.rebuild(this.player.step);
      if (!this.active || session !== this.session) return;
      if (t >= this.total - 1) {
        this.phase = 'done';
        this.render();
      } else {
        await this.showPreview(t + 1);
      }
      return;
    }
    if (phase === 'answer' || phase === 'pick') {
      await this.player.rebuild(t - 1);
      if (!this.active || session !== this.session) return;
      await this.showPreview(t);
      if (!this.active || phase !== 'pick') return;
      this.phase = 'pick';
      this.scene.svg.classList.add('is-picking');
      this.scene.setBoardPick((slot) => this.submitSlot(slot));
      this.render();
      return;
    }
    await this.player.rebuild(phase === 'done' ? this.player.step : t - 1);
    if (!this.active || session !== this.session) return;
    if (phase === 'feedback') await this.scene.setBoard(quizBoardAt(this.quiz.sim, t, z()), null, false);
    this.render();
  }
}
