// 时序图：每个参与者一条竖直生命线，每次传送一根斜箭头（斜度代表传输耗时）。
// from === to 的事件是部件内部的一次操作，画成生命线上的一个小方块。
import { L, esc } from './i18n.js';
import { textWidth } from './scene.js';

const ROW = 50;
const TOP = 26;
const LEFT = 120;
const RIGHT = 80;

export class SeqView {
  constructor(root, { onSelect }) {
    this.root = root;
    this.onSelect = onSelect;
    this.head = root.querySelector('.seq-head');
    this.scroll = root.querySelector('.seq-scroll');
    this.svg = root.querySelector('.seq-svg');
    this.items = [];
    this.lanes = [];
    new ResizeObserver(() => this.render()).observe(this.scroll);
    this.svg.addEventListener('click', (e) => {
      const a = e.target.closest('[data-idx]');
      if (a) this.onSelect(Number(a.dataset.idx));
    });
  }

  build(lesson) {
    this.NODES = lesson.kit.topo.nodes;
    const used = new Set();
    for (const s of lesson.steps) for (const e of s.events) if (e.type === 'packet') used.add(e.from).add(e.to);
    this.lanes = lesson.nodes.filter((n) => used.has(n));
    this.items = [];
    this.subs = {};
    this.render();
  }

  setSub(id, text) {
    this.subs[id] = text;
    this.renderHead();
  }

  laneX() {
    const w = Math.max(this.scroll.clientWidth, 320);
    const n = this.lanes.length;
    const span = w - LEFT - RIGHT;
    const xs = {};
    this.lanes.forEach((id, i) => (xs[id] = n === 1 ? LEFT + span / 2 : LEFT + (span * i) / (n - 1)));
    return { xs, w };
  }

  renderHead() {
    const { xs } = this.laneX();
    this.head.innerHTML = this.lanes
      .map((id) => {
        const n = this.NODES[id];
        const sub = this.subs[id] ?? n.sub ?? n.ip ?? '';
        return `<div class="seq-lane" style="left:${xs[id]}px"><b>${esc(L(n.name))}</b><span>${esc(L(sub))}</span></div>`;
      })
      .join('');
  }

  render() {
    if (!this.lanes.length) return;
    const { xs, w } = this.laneX();
    const h = Math.max(this.scroll.clientHeight - 4, TOP + this.items.length * ROW + 30);
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.renderHead();
    let s = this.lanes.map((id) => `<line class="seq-life" x1="${xs[id]}" y1="0" x2="${xs[id]}" y2="${h}"/>`).join('');
    this.items.forEach((it, i) => (s += this.arrowSvg(it, i, xs, w)));
    this.svg.innerHTML = s;
    this.items.forEach((it, i) => this.progress(i, it.k));
  }

  arrowSvg(it, i, xs, w) {
    const { p, idx } = it;
    const x1 = xs[p.from];
    const x2 = xs[p.to];
    const y1 = TOP + i * ROW;
    const label = L(p.label);
    const lw = textWidth(label, 10.5) + (p.locked ? 26 : 14);
    const time = `<text class="seq-time" x="${LEFT - 14}" y="${y1 + 4}" text-anchor="end">${esc(p.time ?? '')}</text>`;
    if (x1 === x2) {
      // 部件内部操作：生命线上一个小方块，标签放在空的一侧
      const right = x1 + lw + 24 < w;
      const cx = right ? x1 + 12 + lw / 2 : x1 - 12 - lw / 2;
      return `<g class="seq-arrow seq-op c-${p.color}" data-idx="${idx}" data-geo="${x1} ${y1} ${x2} ${y1}">
        ${time}
        <rect class="seq-box" x="${x1 - 5}" y="${y1 - 5}" width="10" height="10" rx="2"/>
        <line class="seq-line" x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1}"/>
        <path class="seq-head-tip" d=""/>
        <g class="seq-chip" transform="translate(${cx} ${y1})">
          <rect x="${-lw / 2}" y="-9" width="${lw}" height="17" rx="3"/>
          <text x="0" y="3.6" text-anchor="middle">${esc(label)}</text>
        </g>
        <rect class="seq-hit" x="${Math.min(x1, cx - lw / 2) - 8}" y="${y1 - 20}" width="${lw + 30}" height="40"/>
      </g>`;
    }
    const y2 = y1 + 18;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - 11;
    return `<g class="seq-arrow c-${p.color}" data-idx="${idx}" data-geo="${x1} ${y1} ${x2} ${y2}">
      ${time}
      <circle class="seq-dot" cx="${x1}" cy="${y1}" r="2.8"/>
      <line class="seq-line" x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1}"/>
      <path class="seq-head-tip" d=""/>
      <g class="seq-chip" transform="translate(${mx} ${my})">
        <rect x="${-lw / 2}" y="-9" width="${lw}" height="17" rx="3"/>
        ${p.locked ? `<path class="seq-lock" transform="translate(${-lw / 2 + 9} -1)" d="M-2.6 -1.2v-1.8a2.6 2.6 0 0 1 5.2 0v1.8M-3.6 -1.2h7.2v5h-7.2z"/>` : ''}
        <text x="${p.locked ? 6 : 0}" y="3.6" text-anchor="middle">${esc(label)}</text>
      </g>
      <rect class="seq-hit" x="${Math.min(x1, x2)}" y="${y1 - 22}" width="${Math.abs(x2 - x1) || 10}" height="44"/>
    </g>`;
  }

  /** 第 i 根箭头画到 k（0..1） */
  progress(i, k) {
    const it = this.items[i];
    if (!it) return;
    it.k = k;
    const g = this.svg.children[this.lanes.length + i];
    if (!g) return;
    g.classList.toggle('is-done', k >= 1);
    g.querySelector('.seq-chip').style.opacity = Math.min(1, k * 3);
    const [x1, y1, x2, y2] = g.dataset.geo.split(' ').map(Number);
    if (x1 === x2) return;
    const x = x1 + (x2 - x1) * k;
    const y = y1 + (y2 - y1) * k;
    const line = g.querySelector('.seq-line');
    line.setAttribute('x2', x);
    line.setAttribute('y2', y);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
    const tip = g.querySelector('.seq-head-tip');
    tip.setAttribute('d', k > 0.02 ? `M${x},${y} L${x - ux * 9 - uy * 4.5},${y - uy * 9 + ux * 4.5} L${x - ux * 9 + uy * 4.5},${y - uy * 9 - ux * 4.5} Z` : '');
  }

  /** 新增一根箭头，返回推进函数 */
  add(p, idx, done) {
    this.items.push({ p, idx, k: done ? 1 : 0 });
    this.render();
    const i = this.items.length - 1;
    const y = TOP + i * ROW;
    if (y > this.scroll.scrollTop + this.scroll.clientHeight - ROW * 1.5) this.scroll.scrollTo({ top: y - this.scroll.clientHeight / 2, behavior: done ? 'auto' : 'smooth' });
    return (k) => this.progress(i, k);
  }

  select(idx) {
    for (const g of this.svg.querySelectorAll('.seq-arrow')) g.classList.toggle('is-selected', Number(g.dataset.idx) === idx);
  }
}
