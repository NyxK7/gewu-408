// 等距（isometric）绘图基础：一切设备都由「盒子」拼成。
// 投影：iso(x, y, z) = [ax + (x - y)·cos30°, ay + (x + y)·sin30° - z]
// x 轴朝右下，y 轴朝左下，z 轴朝上。盒子可见的三个面：顶面、左前面（y 最大）、右前面（x 最大）。

export const C = Math.cos(Math.PI / 6);

export const proj = (ax, ay) => (x, y, z = 0) => [ax + (x - y) * C, ay + (x + y) * 0.5 - z];

const pt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;
export const poly = (pts, attrs = '') => `<polygon points="${pts.map(pt).join(' ')}" ${attrs}/>`;
export const pline = (pts, attrs = '') => `<polyline points="${pts.map(pt).join(' ')}" fill="none" ${attrs}/>`;

/** 在某个面的局部坐标系 f(u, v) 里画矩形 */
export const quad = (f, u, v, w, h, attrs = '') => poly([f(u, v), f(u + w, v), f(u + w, v + h), f(u, v + h)], attrs);

/** 一个盒子：返回三个面 + 三个面的局部坐标函数 */
export function box(P, x, y, z, w, d, h, cls = '') {
  const top = [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const left = [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)];
  const right = [P(x + w, y + d, z), P(x + w, y, z), P(x + w, y, z + h), P(x + w, y + d, z + h)];
  const c = cls ? ` ${cls}` : '';
  return {
    svg: poly(top, `class="f-top${c}"`) + poly(left, `class="f-left${c}"`) + poly(right, `class="f-right${c}"`),
    top: (u, v) => P(x + u, y + v, z + h),
    left: (u, v) => P(x + u, y + d, z + v),
    right: (u, v) => P(x + w, y + d - u, z + v),
  };
}

/** 落在地面（或台面 z）上的投影阴影 */
export const shadow = (P, x, y, w, d, len, z = 0) =>
  poly([P(x + len, y, z), P(x + w + len, y, z), P(x + w + len, y + d, z), P(x + len, y + d, z)], 'class="shadow"');

export function isoCircle(f, cu, cv, r, attrs, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(f(cu + r * Math.cos(a), cv + r * Math.sin(a)));
  }
  return poly(pts, attrs);
}

/** 飞行的数据块：一个小立方体 */
export function packetCube(size = 10) {
  const P = proj(0, 0);
  return box(P, -size / 2, -size / 2, 0, size, size, size).svg;
}

/** 等距网格 pattern：两组 30° 斜线 */
export function gridDefs() {
  const s = 40;
  const W = 2 * C * s;
  return `<pattern id="iso-grid" width="${W.toFixed(3)}" height="${s}" patternUnits="userSpaceOnUse">
      <path d="M0,0 L${W.toFixed(3)},${s} M${W.toFixed(3)},0 L0,${s}" class="grid-line"/>
    </pattern>
    <pattern id="flat-grid" width="100" height="100" patternUnits="userSpaceOnUse">
      <path d="M20,0 V100 M40,0 V100 M60,0 V100 M80,0 V100 M0,20 H100 M0,40 H100 M0,60 H100 M0,80 H100" class="grid-line minor"/>
      <path d="M0,0 V100 M0,0 H100" class="grid-line"/>
    </pattern>`;
}
