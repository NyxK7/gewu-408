// 路由与折线工具：在课程给出的拓扑上做 BFS，并把折线做成「双车道」。

/** 在拓扑图上做 BFS，返回节点序列，例如 client → router → internet → web */
export function hops(edges, from, to) {
  if (from === to) return [from];
  const adj = {};
  for (const [a, b] of edges) {
    (adj[a] ??= []).push(b);
    (adj[b] ??= []).push(a);
  }
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const n = queue.shift();
    if (n === to) break;
    for (const m of adj[n] ?? []) {
      if (!(m in prev)) {
        prev[m] = n;
        queue.push(m);
      }
    }
  }
  if (!(to in prev)) return [from, to];
  const out = [];
  for (let n = to; n !== null; n = prev[n]) out.unshift(n);
  return out;
}

/** 把折线向行进方向的右侧平移 off（尖角处用斜接），得到「双车道」 */
export function offsetPolyline(pts, off) {
  const n = pts.length;
  const norms = [];
  for (let i = 0; i < n - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    norms.push([-(y2 - y1) / len, (x2 - x1) / len]);
  }
  return pts.map(([x, y], i) => {
    if (i === 0) return [x + norms[0][0] * off, y + norms[0][1] * off];
    if (i === n - 1) return [x + norms[n - 2][0] * off, y + norms[n - 2][1] * off];
    const [ax, ay] = norms[i - 1];
    const [bx, by] = norms[i];
    let mx = ax + bx;
    let my = ay + by;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const scale = off / Math.max(0.35, mx * ax + my * ay);
    return [x + mx * scale, y + my * scale];
  });
}

export const polyLength = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

export function pointAt(pts, dist) {
  let rest = dist;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const seg = Math.hypot(x2 - x1, y2 - y1);
    if (rest <= seg || i === pts.length - 2) {
      const k = seg ? Math.min(1, rest / seg) : 0;
      return [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k];
    }
    rest -= seg;
  }
  return pts[pts.length - 1];
}

/** 掐掉折线头尾各一段，让数据块从设备边缘出发 */
export function trimPolyline(pts, d0, d1) {
  const total = polyLength(pts);
  if (total <= d0 + d1 + 4) return pts;
  const out = [pointAt(pts, d0)];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc > d0 && acc < total - d1) out.push(pts[i]);
  }
  out.push(pointAt(pts, total - d1));
  return out;
}
