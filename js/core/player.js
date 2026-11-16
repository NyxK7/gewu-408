// 播放引擎：课程是一串 steps，每步是一串 events。
// rebuild(target) 瞬间重建到「第 target 步结束」的状态（-1 表示课程开头），上一步、跳转都靠它；
// runLoop 负责播放（auto）和单步。所有动画挂在同一个取消令牌上，切换时整体作废。
import { clock, token, wait } from './clock.js';
import { L, getLang } from './i18n.js';

export class Player {
  /**
   * @param ui 界面钩子：render() 重绘、clearRows()、addRow(ev, idx, animate) → 行元素、
   *           custom(ev, tok, animate) 处理课程自定义事件、finished(lesson)
   */
  constructor({ scene, seq, ui }) {
    this.scene = scene;
    this.seq = seq;
    this.ui = ui;
    this.lesson = null;
    this.step = -1;
    this.running = false;
    this.auto = false;
    this.finished = false;
    this.tok = token();
    this.items = [];
  }

  get last() {
    return this.lesson.steps.length - 1;
  }

  cancel() {
    this.tok.cancelled = true;
    this.tok = token();
    this.running = false;
    this.auto = false;
    clock.resume();
  }

  load(lesson) {
    this.lesson = lesson;
    return this.rebuild(-1);
  }

  async rebuild(target) {
    this.cancel();
    // 课程被重新生成后步数可能变少：跳转目标超出就停在最后一步
    target = Math.min(target, this.lesson.steps.length - 1);
    const lesson = this.lesson;
    const tok = this.tok;
    this.step = -1;
    this.finished = false;
    this.items = [];
    this.scene.build(lesson);
    this.seq.build(lesson);
    this.ui.clearRows();
    const st = lesson.start;
    this.scene.show(st.nodes, false);
    for (const [id, sub] of Object.entries(st.subs ?? st.ips ?? {})) {
      this.scene.setSub(id, sub);
      this.seq.setSub(id, sub);
    }
    for (const ev of st.events ?? []) await this.doEvent(ev, tok, false);
    await this.scene.camera(st.frame, tok, false);
    for (let i = 0; i <= target; i++) await this.runStep(i, tok, false);
    if (target >= this.last) this.finished = true;
    this.ui.render();
  }

  async runStep(i, tok, animate) {
    this.step = i;
    this.scene.clearNotes();
    if (animate) this.ui.render();
    for (const ev of this.lesson.steps[i].events) {
      if (tok.cancelled) return false;
      await this.doEvent(ev, tok, animate);
    }
    return !tok.cancelled;
  }

  async doEvent(ev, tok, animate) {
    switch (ev.type) {
      case 'show':
        this.scene.show(ev.nodes, animate);
        if (ev.frame) await this.scene.camera(ev.frame, tok, animate);
        break;
      case 'camera':
        await this.scene.camera(ev.frame, tok, animate);
        break;
      case 'note':
        await this.scene.note(ev.node, L(ev.text), ev, tok, animate);
        break;
      case 'screen':
        this.scene.screen(ev.node, ev.state);
        break;
      case 'mark':
        this.scene.mark(ev.node, ev.tone);
        break;
      case 'ip':
      case 'sub':
        this.scene.setSub(ev.node, ev.ip ?? ev.text);
        this.seq.setSub(ev.node, ev.ip ?? ev.text);
        break;
      case 'packet': {
        const idx = this.items.length;
        this.items.push(ev);
        const row = this.ui.addRow(ev, idx, animate);
        const advance = this.seq.add(ev, idx, !animate);
        const ok = await this.scene.packet(ev, tok, animate, advance);
        if (ok) {
          advance(1);
          row?.classList.remove('is-flight');
          if (animate) await wait(ev.from === ev.to ? 160 : 240, tok);
        }
        break;
      }
      case 'board':
        // 画板里有文字时，课程会给出中英两份图元
        await this.scene.setBoard(getLang() === 'en' && ev.itemsEn ? ev.itemsEn : ev.items, tok, animate, ev.ms);
        break;
      case 'row': {
        // 只记一行表格，不在场景里飞（画板类课程用）
        const idx = this.items.length;
        this.items.push(ev);
        this.ui.addRow(ev, idx, animate)?.classList.remove('is-flight');
        break;
      }
      case 'wait':
        if (animate) await wait(ev.ms, tok);
        break;
      default:
        await this.ui.custom?.(ev, tok, animate);
    }
  }

  async runLoop() {
    const tok = this.tok;
    this.running = true;
    this.ui.render();
    while (this.step < this.last) {
      const ok = await this.runStep(this.step + 1, tok, true);
      if (!ok || tok.cancelled) return;
      if (!this.auto) break;
      this.ui.render();
      if (this.step < this.last && !(await wait(1300, tok))) return;
    }
    if (tok.cancelled) return;
    this.running = false;
    if (this.step === this.last) {
      this.finished = true;
      this.ui.finished?.(this.lesson);
    }
    this.ui.render();
  }

  /** 只播放第 i 步（做题模式判对后重播这一步的原始动画），不自动往下走 */
  async playStep(i) {
    if (!this.lesson || i < 0 || i > this.last) return false;
    if (this.running) this.cancel();
    if (i !== this.step + 1) await this.rebuild(i - 1);
    const tok = this.tok;
    this.auto = false;
    this.running = true;
    this.ui.render();
    const ok = await this.runStep(i, tok, true);
    if (tok.cancelled || !ok) return false;
    this.running = false;
    this.ui.render();
    return true;
  }

  play() {
    if (this.running) {
      clock.paused ? clock.resume() : clock.pause();
      this.ui.render();
      return;
    }
    if (this.step >= this.last) {
      this.rebuild(-1).then(() => {
        this.auto = true;
        this.runLoop();
      });
      return;
    }
    this.auto = true;
    this.runLoop();
  }

  stepOnce() {
    if (this.running) {
      this.auto = false;
      if (clock.paused) clock.resume();
      this.ui.render();
      return;
    }
    if (this.step >= this.last) return;
    this.auto = false;
    this.runLoop();
  }

  prev() {
    if (this.step < 0) return;
    this.rebuild(this.step - 1);
  }

  async goto(i) {
    await this.rebuild(i - 1);
    this.auto = false;
    this.runLoop();
  }
}
