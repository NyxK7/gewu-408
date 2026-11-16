// 解析弹窗：左边字段树，右边（或上方）是最小单元 —— 字节（十六进制）或位（位格子）。
// 每个字段记录 [start, end) 单元范围：悬停字段高亮对应单元，悬停单元高亮包含它的最小字段。
// 弹窗只负责显示，内容由各课程的 kit.decode(ev) 生成：
//   { tag: {color, text}, title, meta: [[k, v]], hint, unit: 'byte' | 'bit',
//     layers: [{ name, summary, start, end, fields, open }],
//     view: { kind: 'hex', bytes } | { kind: 'bits', regs: [{ name, value, width, start, segs, note }] } }
import { L, esc, getLang, t } from './i18n.js';
import { textWidth } from './scene.js';

const label = (lab) => {
  if (!lab || typeof lab !== 'object') return esc(lab ?? '');
  if (getLang() === 'zh' && lab.zh !== lab.en) return `${esc(lab.zh)} <small>${esc(lab.en)}</small>`;
  return esc(lab.en);
};

const sizeOf = (n, unit) => (unit === 'bit' ? t('nBits', { n }) : `${n}B`);

function fieldHtml(f, depth, unit) {
  const val = f.value != null && f.value !== '' ? `<span class="v">${esc(L(f.value))}</span>` : '';
  const range = `data-s="${f.start}" data-e="${f.end}"`;
  if (f.children?.length) {
    return `<details class="fld-group" ${depth < 1 || f.open ? 'open' : ''}>
      <summary class="fld" ${range}><span class="k">${label(f.label)}</span>${val}</summary>
      <div class="fld-kids">${f.children.map((c) => fieldHtml(c, depth + 1, unit)).join('')}</div>
    </details>`;
  }
  const cls = ['fld', f.note ? 'is-note' : '', f.dim ? 'is-dim' : '', f.tone ? `c-${f.tone} has-tone` : ''].join(' ');
  const size = f.end > f.start ? `<span class="b">${sizeOf(f.end - f.start, unit)}</span>` : '';
  return `<div class="${cls}" ${range}><span class="k">${label(f.label)}</span>${val}${size}</div>`;
}

// ───── 位格子（SVG）：多个寄存器按最低位右对齐，页内偏移这种「原样拷贝」的关系一眼可见 ─────

const CW = 17;
const CH = 24;
const GAP = 5;
const PAD = 8;

// 超过 53 位的值（比如 64 位页表项）用 bits 字符串直接给出，避免精度丢失
const bitOf = (r, b) => (r.bits ? r.bits[r.width - 1 - b] : Math.floor(r.value / 2 ** b) % 2);
const rowW = (w) => w * CW + Math.floor((w - 1) / 4) * GAP;

export function bitsSvg(regs) {
  const maxW = Math.max(...regs.map((r) => rowW(r.width)));
  const W = maxW + PAD * 2;
  const xOf = (b) => PAD + maxW - (b + 1) * CW - Math.floor(b / 4) * GAP;
  let y = 4;
  let s = '';
  for (const r of regs) {
    const left = xOf(r.width - 1);
    s += `<text class="bits-name" x="${left}" y="${y + 13}">${esc(L(r.name))}${r.note ? `<tspan class="bits-note" dx="10">${esc(L(r.note))}</tspan>` : ''}</text>`;
    const iy = y + 30;
    const cy = y + 34;
    for (let j = 0; j < r.width; j++) {
      const b = r.width - 1 - j;
      const x = xOf(b);
      const seg = r.segs.find((sg) => b <= sg.hi && b >= sg.lo);
      if (b % 4 === 0 || b === r.width - 1) s += `<text class="bits-idx" x="${x + CW / 2}" y="${iy}" text-anchor="middle">${b}</text>`;
      s += `<g class="bit ${seg ? `c-${seg.tone}` : 'c-slate'}" data-i="${r.start + j}">
        <rect x="${x + 0.5}" y="${cy}" width="${CW - 1}" height="${CH}" rx="2"/>
        <text x="${x + CW / 2}" y="${cy + 16.5}" text-anchor="middle">${bitOf(r, b)}</text>
      </g>`;
    }
    const sy = cy + CH + 4;
    for (const sg of r.segs) {
      const x0 = xOf(sg.hi);
      const x1 = xOf(sg.lo) + CW;
      const w = x1 - x0;
      const lab = L(sg.label);
      const s0 = r.start + (r.width - 1 - sg.hi);
      const s1 = r.start + (r.width - sg.lo);
      s += `<g class="seg c-${sg.tone}" data-s="${s0}" data-e="${s1}">
        <rect x="${x0 + 0.5}" y="${sy}" width="${w - 1}" height="20" rx="3"/>
        ${textWidth(lab, 10.5) + 8 < w ? `<text x="${x0 + w / 2}" y="${sy + 14}" text-anchor="middle">${esc(lab)}</text>` : ''}
      </g>`;
    }
    y = sy + 20 + 16;
  }
  return `<svg class="bits-svg" viewBox="0 0 ${W} ${y}" width="${W}" height="${y}" style="min-width:${Math.round(W * 0.62)}px">${s}</svg>`;
}

export class Inspector {
  constructor(dialog, { onNav }) {
    this.d = dialog;
    this.onNav = onNav;
    this.body = dialog.querySelector('.ins-body');
    this.tree = dialog.querySelector('.ins-tree');
    this.hex = dialog.querySelector('.ins-hex');
    dialog.querySelector('.ins-close').addEventListener('click', () => dialog.close());
    dialog.querySelector('.ins-prev').addEventListener('click', () => this.onNav(-1));
    dialog.querySelector('.ins-next').addEventListener('click', () => this.onNav(1));
    dialog.addEventListener('click', (e) => e.target === dialog && dialog.close());
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') this.onNav(1);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') this.onNav(-1);
    });

    this.tree.addEventListener('mouseover', (e) => {
      const f = e.target.closest('[data-s]');
      if (f) this.highlight(+f.dataset.s, +f.dataset.e, f);
    });
    this.tree.addEventListener('mouseleave', () => this.highlight(-1, -1));
    this.hex.addEventListener('mouseover', (e) => {
      const seg = e.target.closest('.seg[data-s]');
      if (seg) return this.focusRange(+seg.dataset.s, +seg.dataset.e, true);
      const b = e.target.closest('[data-i]');
      if (b) this.focusRange(+b.dataset.i, +b.dataset.i + 1, false);
    });
    this.hex.addEventListener('mouseleave', () => this.highlight(-1, -1));
  }

  get isOpen() {
    return this.d.open;
  }

  /** 找到覆盖 [s, e) 的最小字段（exact 时要求范围完全相同），展开它并高亮 */
  focusRange(s, e, exact) {
    let best = null;
    for (const f of this.tree.querySelectorAll('[data-s]')) {
      const fs = +f.dataset.s;
      const fe = +f.dataset.e;
      if (fe <= fs) continue;
      const ok = exact ? fs === s && fe === e : s >= fs && e <= fe;
      if (ok && (!best || fe - fs < best.e - best.s)) best = { el: f, s: fs, e: fe };
    }
    if (!best) return this.highlight(s, e);
    let p = best.el.parentElement?.closest('details');
    while (p) {
      p.open = true;
      p = p.parentElement?.closest('details');
    }
    this.highlight(best.s, best.e, best.el);
    best.el.scrollIntoView({ block: 'nearest' });
  }

  open(m, index, total) {
    this.unit = m.unit ?? 'byte';
    this.d.querySelector('.ins-label').textContent = L(m.label) ?? t('inspector');
    this.d.querySelector('.ins-no').textContent = `#${index + 1}`;
    this.d.querySelector('.ins-title').innerHTML = `${m.tag ? `<span class="proto-tag c-${m.tag.color}">${esc(L(m.tag.text))}</span> ` : ''}${esc(L(m.title))}`;
    this.d.querySelector('.ins-meta').innerHTML = (m.meta ?? []).map(([k, v]) => `<div><dt>${esc(L(k))}</dt><dd>${esc(L(v))}</dd></div>`).join('');
    this.d.querySelector('.ins-hint').textContent = L(m.hint) ?? '';
    this.d.querySelector('.ins-prev').disabled = index <= 0;
    this.d.querySelector('.ins-next').disabled = index >= total - 1;

    const last = m.layers.length - 1;
    this.tree.innerHTML = m.layers
      .map(
        (ly, i) => `<details class="layer" ${(ly.open ?? i === last) ? 'open' : ''}>
          <summary class="fld layer-sum" data-s="${ly.start}" data-e="${ly.end}">
            <span class="k">${label(ly.name)}</span><span class="v">${esc(L(ly.summary ?? ''))}</span>${ly.end > ly.start ? `<span class="b">${sizeOf(ly.end - ly.start, this.unit)}</span>` : ''}
          </summary>
          <div class="fld-kids">${ly.fields.map((x) => fieldHtml(x, 0, this.unit)).join('')}</div>
        </details>`,
      )
      .join('');

    const kind = m.view?.kind ?? 'none';
    const bits = kind === 'bits';
    this.body.classList.toggle('is-bits', bits || kind === 'html');
    this.body.classList.toggle('is-plain', kind === 'none');
    if (bits) {
      this.hex.innerHTML = bitsSvg(m.view.regs);
    } else if (kind === 'html') {
      this.hex.innerHTML = m.view.html;
    } else if (kind === 'none') {
      this.hex.innerHTML = '';
    } else {
      const bytes = m.view.bytes;
      const rows = [];
      for (let o = 0; o < bytes.length; o += 16) {
        const chunk = [...bytes.slice(o, o + 16)];
        const hx = chunk.map((b, j) => `<i data-i="${o + j}">${b.toString(16).padStart(2, '0')}</i>`).join('');
        const asc = chunk.map((b, j) => `<i data-i="${o + j}">${b >= 32 && b < 127 ? esc(String.fromCharCode(b)) : '·'}</i>`).join('');
        rows.push(`<div class="hx-row"><span class="hx-off">${o.toString(16).padStart(4, '0')}</span><span class="hx-bytes">${hx}</span><span class="hx-asc">${asc}</span></div>`);
      }
      this.hex.innerHTML = rows.join('');
    }
    this.cells = [...this.hex.querySelectorAll('[data-i]')];
    if (!this.d.open) this.d.showModal();
    this.d.querySelector('.ins-close').focus({ preventScroll: true });
  }

  highlight(s, e, fieldEl) {
    for (const b of this.cells ?? []) {
      const i = +b.dataset.i;
      b.classList.toggle('is-hl', i >= s && i < e);
    }
    for (const x of this.d.querySelectorAll('.is-hl:not([data-i])')) x.classList.remove('is-hl');
    fieldEl?.classList.add('is-hl');
    if (s >= 0) for (const sg of this.hex.querySelectorAll('.seg')) if (+sg.dataset.s === s && +sg.dataset.e === e) sg.classList.add('is-hl');
  }
}
