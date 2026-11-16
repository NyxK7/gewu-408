// 图的通用小件：读边、平面布局（圆周或按拓扑层次）、画成画板图元。
// 边写成「A-B 4」「A>B 4」「A B」，权值可省略（默认 1）；用逗号、分号或换行隔开。是否有向由调用方决定。
import { txt } from '../../core/board.js';
import { node } from '../../core/steps.js';

export const nameCmp = (a, b) => a.localeCompare(b, 'en', { numeric: true });

export function parseEdges(text, { weighted = true } = {}) {
  const items = String(text ?? '').split(/[,，;；\n]+/).map((s) => s.trim()).filter(Boolean);
  const edges = [];
  const names = new Set();
  for (const it of items) {
    const m = it.match(/^([A-Za-z0-9]{1,3})\s*(?:->|-|>|→|\s)\s*([A-Za-z0-9]{1,3})(?:\s+(-?\d+))?$/);
    if (!m || m[1] === m[2]) return { ok: false, bad: it };
    if (weighted && m[3] == null) return { ok: false, bad: it };
    edges.push({ u: m[1], v: m[2], w: m[3] == null ? 1 : Number(m[3]) });
    names.add(m[1]).add(m[2]);
  }
  return { ok: true, V: [...names].sort(nameCmp), edges };
}

/** 在圆周上摆顶点的次序：给了边就在所有次序里找交叉最少的（8 个顶点以内），交叉数相同取字典序最小的 */
function bestOrder(V, edges) {
  const n = V.length;
  if (!edges?.length || n < 4 || n > 8) return V;
  const pairs = [];
  const seen = new Set();
  for (const e of edges) {
    const k = [e.u, e.v].sort(nameCmp).join('-');
    if (!seen.has(k)) {
      seen.add(k);
      pairs.push([V.indexOf(e.u), V.indexOf(e.v)]);
    }
  }
  const pos = new Array(n);
  let best = null;
  let bestCross = Infinity;
  const rest = V.slice(1).map((_, i) => i + 1);
  const cross = () => {
    let c = 0;
    for (let i = 0; i < pairs.length; i++) {
      let [a, b] = [pos[pairs[i][0]], pos[pairs[i][1]]];
      if (a > b) [a, b] = [b, a];
      for (let j = i + 1; j < pairs.length; j++) {
        const x = pos[pairs[j][0]];
        const y = pos[pairs[j][1]];
        if (x === a || x === b || y === a || y === b) continue;
        if ((x > a && x < b) !== (y > a && y < b)) c++;
      }
    }
    return c;
  };
  pos[0] = 0;
  (function perm(k, used) {
    if (k === n) {
      const c = cross();
      if (c < bestCross) {
        bestCross = c;
        best = [...pos];
      }
      return;
    }
    for (const v of rest) {
      if (used & (1 << v)) continue;
      pos[v] = k;
      perm(k + 1, used | (1 << v));
    }
  })(1, 1);
  const out = new Array(n);
  best.forEach((slot, vi) => (out[slot] = V[vi]));
  return out;
}

/** 圆周布局（给了 edges 时自动减少交叉） */
export function circleLayout(V, { cx = 330, cy = 290, R } = {}, edges) {
  V = bestOrder(V, edges);
  const n = V.length;
  const r = R ?? (n <= 4 ? 140 : n <= 7 ? 170 : 200);
  return Object.fromEntries(V.map((v, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [v, [cx + r * Math.cos(a), cy + r * Math.sin(a)]];
  }));
}

/** 有向无环图按「最长路径层次」从左往右摆；有回路时退回圆周布局 */
export function layerLayout(V, edges, { x0 = 90, y0 = 140, dx = 150, dy = 110 } = {}) {
  const indeg = Object.fromEntries(V.map((v) => [v, 0]));
  for (const e of edges) indeg[e.v]++;
  const level = Object.fromEntries(V.map((v) => [v, 0]));
  const q = V.filter((v) => indeg[v] === 0);
  let seen = 0;
  while (q.length) {
    const u = q.shift();
    seen++;
    for (const e of edges.filter((x) => x.u === u)) {
      level[e.v] = Math.max(level[e.v], level[u] + 1);
      if (--indeg[e.v] === 0) q.push(e.v);
    }
  }
  if (seen < V.length) return circleLayout(V, {}, edges);
  const cols = {};
  for (const v of V) (cols[level[v]] ??= []).push(v);
  const maxRows = Math.max(...Object.values(cols).map((c) => c.length));
  const pos = {};
  for (const [lv, vs] of Object.entries(cols)) vs.forEach((v, i) => (pos[v] = [x0 + lv * dx, y0 + (i + (maxRows - vs.length) / 2) * dy]));
  return pos;
}

export const boundsOf = (pos, pad = 60) => {
  const xs = Object.values(pos).map((p) => p[0]);
  const ys = Object.values(pos).map((p) => p[1]);
  return [Math.min(...xs) - pad, Math.min(...ys) - pad - 20, Math.max(...xs) + pad, Math.max(...ys) + pad];
};

/**
 * 画成画板图元：所有边合成一个图元（key 'g-edges'），每个顶点一个图元（key 'gv-名字'）。
 * opt: { directed, weight, edgeCls(e), tone(v), cls(v), note(v), under(v) }
 */
export function graphItems(V, edges, pos, opt = {}) {
  const R = 21;
  let h = '';
  const seen = new Set();
  for (const e of edges) {
    const key = opt.directed ? `${e.u}>${e.v}` : [e.u, e.v].sort(nameCmp).join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    const [ax, ay] = pos[e.u];
    const [bx, by] = pos[e.v];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    // 有向图里两个方向都有边时，各往一侧偏开
    const both = opt.directed && edges.some((f) => f.u === e.v && f.v === e.u);
    const off = both ? 6 : 0;
    const nx = -uy * off;
    const ny = ux * off;
    const x1 = ax + ux * R + nx;
    const y1 = ay + uy * R + ny;
    const x2 = bx - ux * (R + (opt.directed ? 3 : 0)) + nx;
    const y2 = by - uy * (R + (opt.directed ? 3 : 0)) + ny;
    const cls = opt.edgeCls?.(e) ?? '';
    h += `<line class="ge ${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    if (opt.directed) {
      const hx = x2 - ux * 10;
      const hy = y2 - uy * 10;
      h += `<path class="ge-tip ${cls}" d="M${x2.toFixed(1)},${y2.toFixed(1)} L${(hx - uy * 5).toFixed(1)},${(hy + ux * 5).toFixed(1)} L${(hx + uy * 5).toFixed(1)},${(hy - ux * 5).toFixed(1)} Z"/>`;
    }
    if (opt.weight !== false) {
      const mx = (x1 + x2) / 2 + (both ? nx * 2.2 : -uy * 11);
      const my = (y1 + y2) / 2 + (both ? ny * 2.2 : ux * 11);
      const t = opt.label ? opt.label(e) : String(e.w);
      const w = Math.max(20, t.length * 7 + 8);
      h += `<g class="gw ${cls}"><rect x="${(mx - w / 2).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="${w}" height="17" rx="4"/>${txt(mx, my + 4, t, 'gw-t')}</g>`;
    }
  }
  const items = [{ k: 'g-edges', x: 0, y: 0, html: h }];
  for (const v of V) {
    const [x, y] = pos[v];
    const note = opt.note?.(v);
    const under = opt.under?.(v);
    items.push({
      k: `gv-${v}`,
      x,
      y,
      html: node(v, { tone: opt.tone?.(v) ?? '', cls: opt.cls?.(v) ?? '', r: R, size: 15 }) + (note != null ? txt(0, -R - 8, String(note), 'gv-note') : '') + (under != null ? txt(0, R + 17, String(under), 'gv-under') : ''),
    });
  }
  return items;
}

/** 平面表格：head 是表头，rows 是二维数组（每格是字符串或 { t, cls, tone }） */
export function gridTable(head, rows, { cw = 54, rh = 30, first = 64 } = {}) {
  // cw 可以是数组：逐列给出宽度（这时忽略 first）
  const W = (j) => (Array.isArray(cw) ? cw[j] : j === 0 ? first : cw);
  const X = (j) => (Array.isArray(cw) ? cw.slice(0, j).reduce((a, b) => a + b, 0) : j === 0 ? 0 : first + (j - 1) * cw);
  const cellHtml = (x, y, w, c, extra = '') => {
    const o = typeof c === 'object' && c ? c : { t: c };
    return `<g transform="translate(${x} ${y})"><rect class="gt-c ${o.cls ?? ''} ${o.tone ? `c-${o.tone} has-tone` : ''} ${extra}" width="${w - 3}" height="${rh - 3}" rx="3"/>${txt((w - 3) / 2, rh / 2 + 3, String(o.t ?? ''), `gt-t ${o.cls ?? ''}`)}</g>`;
  };
  let h = head.map((c, j) => cellHtml(X(j), 0, W(j), c, 'head')).join('');
  rows.forEach((r, i) => (h += r.map((c, j) => cellHtml(X(j), (i + 1) * rh, W(j), c, j === 0 ? 'head' : '')).join('')));
  return h;
}
