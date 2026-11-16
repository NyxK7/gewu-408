// 等距场景：设备、连线、镜头、数据块飞行、气泡提示。
// 拓扑（节点坐标、连线）和设备造型都由课程的 kit 提供，引擎本身与学科无关。
import { tween, easeInOut, easeQuad } from './clock.js';
import { gridDefs, packetCube } from './iso.js';
import { L, esc } from './i18n.js';
import { hops, offsetPolyline, pointAt, polyLength, trimPolyline } from './route.js';

const NS = 'http://www.w3.org/2000/svg';
const LANE = 6;
const MIN_W = 400;

/** 估算文本宽度（中文按 1 个字号，英文按 0.6 个字号） */
export const textWidth = (s, size) => [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.6), 0);

function el(tag, attrs = {}, html = '') {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

export class Scene {
  constructor(svg) {
    this.svg = svg;
    this.vb = [0, 0, 1000, 640];
    // 用户手动缩放：在镜头取景（vb）之上再放大 uz 倍、平移 pan（以取景宽高为单位）。镜头动画照常进行。
    this.uz = 1;
    this.pan = [0, 0];
    this.onZoom = null;
    this.frameIds = null;
    this.boardPick = null;
    this.boardItems = new Map();
    new ResizeObserver(() => this.frameIds && this.setViewBox(this.frameFor(this.frameIds))).observe(svg);
    // 做题模式：内存块可以直接点选；用事件委托，避免每次重画画板都重新绑定
    this.svg.addEventListener('click', (e) => this.boardPickAt(e.target));
    this.svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!e.target.closest?.('.bi.is-pickable')) return;
      e.preventDefault();
      this.boardPickAt(e.target);
    });
  }

  /** 背景网格：画了立体设备（拓扑结点）或标了 grid: 'iso' 的课用等距网格，其余用平面方格 */
  gridOf(lesson) {
    if (lesson.grid) return lesson.grid === 'iso' ? 'iso-grid' : 'flat-grid';
    return lesson.nodes?.length ? 'iso-grid' : 'flat-grid';
  }

  build(lesson) {
    this.lesson = lesson;
    this.kit = lesson.kit;
    this.NODES = this.kit.topo.nodes;
    this.EDGES = this.kit.topo.edges;
    this.subs = {};
    const ids = lesson.nodes;
    const edges = this.EDGES.filter(([a, b]) => ids.includes(a) && ids.includes(b));
    const order = [...ids].sort((a, b) => this.NODES[a].y - this.NODES[b].y);
    this.uz = 1;
    this.pan = [0, 0];
    this.onZoom?.(1);
    this.svg.innerHTML = `
      <defs>${gridDefs()}</defs>
      <rect x="-2000" y="-2000" width="5000" height="5000" fill="url(#${this.gridOf(lesson)})" class="grid"/>
      <g class="decors">${this.kit.decor?.(lesson) ?? ''}</g>
      <g class="links">${edges.map((e) => this.linkSvg(e)).join('')}</g>
      <g class="trails"></g>
      <g class="nodes">${order.map((id) => this.nodeSvg(id)).join('')}</g>
      <g class="board"></g>
      <g class="packets"></g>
      <g class="notes"></g>`;
    this.boardItems = new Map();
    this.layers = {
      board: this.svg.querySelector('.board'),
      trails: this.svg.querySelector('.trails'),
      packets: this.svg.querySelector('.packets'),
      notes: this.svg.querySelector('.notes'),
    };
    this.visible = new Set();
  }

  linkSvg([a, b]) {
    const A = this.NODES[a];
    const B = this.NODES[b];
    const fwd = offsetPolyline([[A.x, A.y], [B.x, B.y]], LANE);
    const back = offsetPolyline([[B.x, B.y], [A.x, A.y]], LANE);
    const ln = ([[x1, y1], [x2, y2]]) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    return `<g class="link" data-a="${a}" data-b="${b}">${ln(fwd)}${ln(back)}</g>`;
  }

  nodeSvg(id) {
    const n = this.NODES[id];
    const lx = n.x + n.label.dx;
    const ly = n.y + n.label.dy;
    return `<g class="node node-${n.kind}" data-node="${id}" style="transform-origin:${n.x}px ${n.y}px">
      <g class="device">${this.kit.drawDevice?.(n) ?? ''}</g>
      <ellipse class="pulse" cx="${n.x}" cy="${n.y - (n.pulseZ ?? 0)}" rx="40" ry="23"/>
      <g class="node-label a-${n.label.anchor}">
        <text class="node-name" x="${lx}" y="${ly}" text-anchor="${n.label.anchor}">${esc(L(n.name))}</text>
        <text class="node-ip" x="${lx}" y="${ly + 17}" text-anchor="${n.label.anchor}">${esc(L(n.sub ?? n.ip ?? ''))}</text>
      </g>
    </g>`;
  }

  nodeEl(id) {
    return this.svg.querySelector(`.node[data-node="${id}"]`);
  }

  /** 改节点名下面那一行小字（网络课是 IP 地址，访存课是部件参数） */
  setSub(id, text) {
    this.subs[id] = text;
    const t = this.nodeEl(id)?.querySelector('.node-ip');
    if (t) t.textContent = L(text);
  }

  show(ids, animate) {
    ids.forEach((id, i) => {
      const g = this.nodeEl(id);
      if (!g) return;
      this.visible.add(id);
      g.style.transitionDelay = animate ? `${i * 120}ms` : '0ms';
      g.classList.toggle('no-anim', !animate);
      g.classList.add('is-on');
    });
    for (const link of this.svg.querySelectorAll('.link')) {
      if (this.visible.has(link.dataset.a) && this.visible.has(link.dataset.b)) {
        link.classList.toggle('no-anim', !animate);
        link.classList.add('is-on');
      }
    }
    // 装饰（比如主存的底板）跟着它所属的节点一起出现
    for (const d of this.svg.querySelectorAll('.decor')) {
      if (d.dataset.for.split(' ').some((id) => this.visible.has(id))) {
        d.classList.toggle('no-anim', !animate);
        d.classList.add('is-on');
      }
    }
  }

  /** 给节点挂一个状态类，例如笔记本屏幕 scr-page */
  screen(id, state) {
    const g = this.nodeEl(id);
    if (!g) return;
    g.classList.remove('scr-browser', 'scr-page', 'scr-lock');
    g.classList.add(`scr-${state}`);
  }

  /** 一步之内的强调：部件发光（ok / warn / info），每步开始时清掉 */
  mark(id, tone = 'info') {
    const g = this.nodeEl(id);
    if (!g) return;
    g.classList.remove('mark-ok', 'mark-warn', 'mark-info');
    g.classList.add('is-marked', `mark-${tone}`);
  }

  // ───── 镜头：可见节点的包围盒 → viewBox ─────

  /** ids 可以是节点 id 的数组，也可以是 { rect: [x0, y0, x1, y1] }（画板类课程直接给出取景范围） */
  frameFor(ids) {
    let [x0, y0, x1, y1] = ids?.rect ?? [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of ids?.rect ? [] : ids) {
      const n = this.NODES[id];
      if (!n) continue;
      const [l, t, r, b] = n.extent;
      x0 = Math.min(x0, n.x + l);
      y0 = Math.min(y0, n.y + t);
      x1 = Math.max(x1, n.x + r);
      y1 = Math.max(y1, n.y + b);
    }
    // 顶部留出视图切换条，底部留出字幕条
    x0 -= 40;
    x1 += 40;
    y0 -= 74;
    y1 += 64;
    let w = x1 - x0;
    let h = y1 - y0;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const rect = this.svg.getBoundingClientRect();
    const aspect = rect.width > 10 && rect.height > 10 ? rect.width / rect.height : 1.6;
    if (w < MIN_W) {
      h *= MIN_W / w;
      w = MIN_W;
    }
    if (w / h < aspect) w = h * aspect;
    else h = w / aspect;
    return [cx - w / 2, cy - h / 2, w, h];
  }

  setViewBox(vb) {
    this.vb = vb;
    this.applyView();
  }

  /** 镜头取景 + 用户缩放 → 实际的 viewBox */
  applyView() {
    const [x, y, w, h] = this.vb;
    const z = this.uz;
    const m = (1 - 1 / z) / 2;
    this.pan = this.pan.map((p) => Math.max(-m, Math.min(m, p)));
    const W = w / z;
    const H = h / z;
    const vb = [x + w / 2 + this.pan[0] * w - W / 2, y + h / 2 + this.pan[1] * h - H / 2, W, H];
    this.svg.setAttribute('viewBox', vb.map((v) => v.toFixed(1)).join(' '));
    // 镜头拉远（或屏幕很窄）时，把文字和数据块放大，保证屏幕上至少约 12px
    const rect = this.svg.getBoundingClientRect();
    if (rect.width > 10) {
      const k = Math.min(rect.width / vb[2], rect.height / vb[3]);
      const s = Math.max(1, Math.min(2.6, 0.92 / k));
      this.svg.style.setProperty('--s', s.toFixed(3));
      // 拉得很远时（手机竖屏）只留部件名，副标题让给画面
      this.svg.classList.toggle('is-far', s > 1.9);
    }
  }

  /** 以屏幕上的 (px, py) 为中心缩放到 z 倍（1～5） */
  zoomTo(z, px, py) {
    z = Math.max(1, Math.min(5, z));
    const r = this.svg.getBoundingClientRect();
    const fx = px == null || r.width < 10 ? 0 : (px - r.left) / r.width - 0.5;
    const fy = py == null || r.height < 10 ? 0 : (py - r.top) / r.height - 0.5;
    // 光标下的那一点缩放前后保持不动
    this.pan = [this.pan[0] + fx * (1 / this.uz - 1 / z), this.pan[1] + fy * (1 / this.uz - 1 / z)];
    this.uz = z;
    if (z === 1) this.pan = [0, 0];
    this.applyView();
    this.onZoom?.(z);
  }

  /** 拖动画面：dx、dy 是屏幕像素 */
  panBy(dx, dy) {
    const r = this.svg.getBoundingClientRect();
    if (r.width < 10 || this.uz === 1) return;
    this.pan = [this.pan[0] - dx / r.width / this.uz, this.pan[1] - dy / r.height / this.uz];
    this.applyView();
  }

  async camera(ids, tok, animate) {
    this.frameIds = ids;
    const target = this.frameFor(ids);
    if (!animate) return this.setViewBox(target);
    const from = [...this.vb];
    if (from.every((v, i) => Math.abs(v - target[i]) < 1)) return;
    await tween(850, tok, (k) => {
      const e = easeInOut(k);
      this.setViewBox(from.map((v, i) => v + (target[i] - v) * e));
    });
  }

  // ───── 数据块 ─────

  route(from, to) {
    const ids = hops(this.EDGES, from, to);
    const pts = offsetPolyline(ids.map((id) => [this.NODES[id].x, this.NODES[id].y]), LANE);
    return trimPolyline(pts, this.NODES[from].r, this.NODES[to].r);
  }

  flightMs(p) {
    return Math.max(900, polyLength(p.path ?? this.route(p.from, p.to)) / 0.3);
  }

  /** 让数据块沿路由飞过去；from === to 表示部件内部的一次操作，只闪一下。onProgress(k) 让时序图同步画箭头 */
  async packet(p, tok, animate, onProgress = () => {}) {
    if (!animate) return true;
    if (p.from === p.to && !p.path) {
      this.pulse(p.to, p.color);
      const ok = await tween(700, tok, onProgress);
      return ok;
    }
    const pts = p.path ?? this.route(p.from, p.to);
    const len = polyLength(pts);
    const color = `c-${p.color}`;
    const d = 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
    const trail = el('path', { d, class: `trail ${color}`, 'stroke-dasharray': `${len} ${len}`, 'stroke-dashoffset': len });
    this.layers.trails.append(trail);

    const label = L(p.label);
    const lw = textWidth(label, 11) + (p.locked ? 30 : 18);
    const g = el(
      'g',
      { class: `pkt ${color}` },
      `<g class="pkt-cube">${packetCube(11)}</g>
       <g class="pkt-chip"><g class="pkt-chip-body">
         <rect x="${-lw / 2}" y="-10" width="${lw}" height="20" rx="3"/>
         ${p.locked ? `<path class="pkt-lock" transform="translate(${-lw / 2 + 11} -1)" d="M-3 -1.5v-2a3 3 0 0 1 6 0v2M-4.2 -1.5h8.4v6h-8.4z"/>` : ''}
         <text x="${p.locked ? 7 : 0}" y="4" text-anchor="middle">${esc(label)}</text>
       </g></g>`,
    );
    this.layers.packets.append(g);
    const place = (e) => {
      const [x, y] = pointAt(pts, len * e);
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      trail.setAttribute('stroke-dashoffset', (len * (1 - e)).toFixed(1));
    };
    place(0);
    const ok = await tween(this.flightMs(p), tok, (k) => {
      const e = easeQuad(k);
      place(e);
      onProgress(e);
    });
    if (ok) this.pulse(p.to, p.color);
    g.classList.add('is-gone');
    trail.classList.add('is-gone');
    setTimeout(() => {
      g.remove();
      trail.remove();
    }, 700);
    return ok;
  }

  // ───── 画板：按 key 增量更新的一组图元（数组格子、页面、堆结点……） ─────
  // items: [{ k, x, y, html, cls, o, from: [x, y] }]。同一个 k 的图元从旧位置补间到新位置，
  // 新出现的淡入（可以从 from 飞过来），消失的淡出。补间走统一时钟，倍速和暂停同样生效。
  async setBoard(items, tok, animate, ms = 650) {
    const layer = this.layers.board;
    const next = new Set(items.map((it) => it.k));
    const moves = [];
    for (const [k, el] of this.boardItems) {
      if (next.has(k)) continue;
      this.boardItems.delete(k);
      if (animate) moves.push({ el, x0: el.x, y0: el.y, x1: el.x, y1: el.y, o0: el.o, o1: 0, remove: true });
      else el.g.remove();
    }
    for (const it of items) {
      let el = this.boardItems.get(it.k);
      if (!el) {
        const g = document.createElementNS(NS, 'g');
        const [fx, fy] = it.from ?? [it.x, it.y];
        el = { g, x: fx, y: fy, o: animate ? 0 : 1, html: null };
        this.boardItems.set(it.k, el);
      }
      if (el.html !== it.html) {
        el.g.innerHTML = it.html;
        el.html = it.html;
      }
      el.g.setAttribute('class', `bi ${it.cls ?? ''}`);
      el.g.dataset.k = it.k;
      layer.append(el.g);
      moves.push({ el, x0: el.x, y0: el.y, x1: it.x, y1: it.y, o0: el.o, o1: it.o ?? 1 });
    }
    const apply = (m, e) => {
      const x = m.x0 + (m.x1 - m.x0) * e;
      const y = m.y0 + (m.y1 - m.y0) * e;
      m.el.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      m.el.g.style.opacity = (m.o0 + (m.o1 - m.o0) * e).toFixed(3);
    };
    const settle = () => {
      for (const m of moves) {
        apply(m, 1);
        Object.assign(m.el, { x: m.x1, y: m.y1, o: m.o1 });
        if (m.remove) m.el.g.remove();
      }
    };
    if (!animate || moves.every((m) => m.x0 === m.x1 && m.y0 === m.y1 && m.o0 === m.o1)) {
      settle();
      return true;
    }
    const ok = await tween(ms, tok, (k) => {
      const e = easeInOut(k);
      for (const m of moves) apply(m, e);
    });
    if (ok) settle();
    return ok;
  }

  /** 让画板上的内存块（key = slot-N）可点选；点中后回调 slot 序号 */
  setBoardPick(onPick) {
    this.boardPick = onPick;
    for (const [k, el] of this.boardItems) {
      const m = /^slot-(\d+)$/.exec(k);
      if (!m) continue;
      el.g.dataset.slot = m[1];
      el.g.classList.add('is-pickable');
      el.g.setAttribute('role', 'button');
      el.g.setAttribute('tabindex', '0');
    }
  }

  clearBoardPick() {
    this.boardPick = null;
    for (const el of this.boardItems.values()) {
      el.g.classList.remove('is-pickable');
      el.g.removeAttribute('role');
      el.g.removeAttribute('tabindex');
      delete el.g.dataset.slot;
    }
  }

  boardPickAt(target) {
    const g = target?.closest?.('.bi.is-pickable');
    if (!g || !this.boardPick) return;
    const slot = Number(g.dataset.slot);
    if (Number.isInteger(slot)) this.boardPick(slot);
  }

  pulse(id, color) {
    const ring = this.nodeEl(id)?.querySelector('.pulse');
    if (!ring) return;
    ring.setAttribute('class', `pulse c-${color}`);
    void ring.getBoundingClientRect();
    ring.classList.add('is-on');
  }

  // ───── 气泡提示 ─────

  /** 每一步开始时调用：清掉上一步的气泡和强调 */
  clearNotes() {
    this.layers?.notes.replaceChildren();
    for (const g of this.svg.querySelectorAll('.node.is-marked')) g.classList.remove('is-marked', 'mark-ok', 'mark-warn', 'mark-info');
  }

  async note(id, text, { typewriter = false, tone = 'info', at = null } = {}, tok, animate) {
    const n = this.NODES[id];
    const x = at ? at[0] : n.x + n.note.dx;
    const y = at ? at[1] : n.y + n.note.dy;
    const w = textWidth(text, 12.5) + 26;
    const g = el(
      'g',
      { class: `note tone-${tone}`, transform: `translate(${x} ${y})` },
      `<g class="note-body"><rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="4"/>
       <path class="note-tip" d="M-6,15 L0,22 L6,15 Z"/>
       <text x="0" y="4.5" text-anchor="middle"></text></g>`,
    );
    this.layers.notes.append(g);
    const t = g.querySelector('text');
    if (!animate) {
      t.textContent = text;
      g.classList.add('is-on', 'no-anim');
      return;
    }
    requestAnimationFrame(() => g.classList.add('is-on'));
    if (!typewriter) {
      t.textContent = text;
      await tween(500, tok);
      return;
    }
    const chars = [...text];
    await tween(chars.length * 55, tok, (k) => {
      t.textContent = chars.slice(0, Math.round(k * chars.length)).join('') + (k < 1 ? '▍' : '');
    });
    await tween(300, tok);
  }
}
