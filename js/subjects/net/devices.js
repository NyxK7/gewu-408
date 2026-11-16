// 网络课的设备：笔记本、路由器、互联网、DNS 机柜、Web 服务器、小服务器。全部由等距盒子拼成。
import { box, isoCircle, pline, poly, proj, quad, shadow } from '../../core/iso.js';

// ───────────────────────── 设备 ─────────────────────────

function laptop(ax, ay) {
  const P = proj(ax, ay);
  const w = 66;
  const d = 46;
  const x0 = -w / 2;
  const y0 = -d / 2;
  const sh = 46;
  let s = shadow(P, x0, y0, w, d, 16);

  // 屏幕：立在底座后沿的一块薄板
  const scr = box(P, x0, y0 - 3, 3, w, 3, sh);
  s += scr.svg;
  const S = scr.left;
  s += quad(S, 4, 4, w - 8, sh - 8, 'class="scr-glass"');
  s += '<g class="scr-ui">';
  s += quad(S, 4, sh - 12, w - 8, 8, 'class="scr-bar"');
  s += pline([S(9, sh - 8), S(36, sh - 8)], 'class="scr-url"');
  s += '</g><g class="scr-page">';
  s += pline([S(9, 29), S(34, 29)], 'class="scr-h1"');
  s += quad(S, 9, 9, 18, 14, 'class="scr-hero"');
  for (let i = 0; i < 3; i++) s += pline([S(31, 21 - i * 5), S(w - 9, 21 - i * 5)], 'class="scr-text"');
  s += '</g>';

  // 底座 + 键盘 + 触控板
  const base = box(P, x0, y0, 0, w, d, 4);
  s += base.svg;
  const K = base.top;
  s += quad(K, 6, 5, w - 12, 21, 'class="kbd"');
  for (let u = 12; u < w - 6; u += 6) s += pline([K(u, 5), K(u, 26)], 'class="kbd-line"');
  for (let v = 10; v < 26; v += 5) s += pline([K(6, v), K(w - 6, v)], 'class="kbd-line"');
  s += quad(K, w / 2 - 11, 30, 22, 11, 'class="pad"');
  return s;
}

function router(ax, ay) {
  const P = proj(ax, ay);
  const w = 60;
  const d = 42;
  const h = 15;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 12);
  for (const u of [9, w - 9]) {
    const [bx, by] = P(x0 + u, y0 + 5, h);
    s += `<line x1="${bx}" y1="${by}" x2="${bx}" y2="${by - 34}" class="ant"/>`;
    s += `<circle cx="${bx}" cy="${by - 36}" r="3.4" class="ant-tip"/>`;
  }
  const b = box(P, x0, y0, 0, w, d, h);
  s += b.svg;
  for (let i = 0; i < 5; i++) s += quad(b.left, 9 + i * 9, 5, 5, 4.6, `class="led" style="--i:${i}"`);
  for (let i = 0; i < 3; i++) s += quad(b.right, 7 + i * 11, 4, 7.5, 6.5, 'class="port"');
  for (let v = 10; v < d - 6; v += 5) s += pline([b.top(14, v), b.top(w - 14, v)], 'class="vent"');
  return s;
}

function cloud(ax, ay) {
  const rx = 78;
  const ry = 45;
  const th = 10;
  const gy = ay - th - 66;
  const R = 33;
  let s = `<ellipse cx="${ax + 10}" cy="${ay + 5}" rx="${rx + 6}" ry="${ry + 4}" class="shadow"/>`;
  s += `<path class="f-left" d="M${ax - rx},${ay - th} V${ay} A${rx},${ry} 0 0 0 ${ax + rx},${ay} V${ay - th} Z"/>`;
  s += `<ellipse cx="${ax}" cy="${ay - th}" rx="${rx}" ry="${ry}" class="f-top"/>`;
  s += `<ellipse cx="${ax}" cy="${ay - th}" rx="${rx * 0.7}" ry="${ry * 0.7}" class="ring"/>`;
  s += `<ellipse cx="${ax}" cy="${ay - th}" rx="24" ry="9" class="shadow"/>`;
  s += `<line x1="${ax}" y1="${ay - th}" x2="${ax}" y2="${gy + R}" class="pole"/>`;
  s += `<circle cx="${ax}" cy="${gy}" r="${R}" class="globe"/>`;
  s += `<g class="globe-lines">
    <ellipse cx="${ax}" cy="${gy}" rx="${R * 0.42}" ry="${R}"/>
    <ellipse cx="${ax}" cy="${gy}" rx="${R}" ry="${R * 0.3}"/>
    <line x1="${ax}" y1="${gy - R}" x2="${ax}" y2="${gy + R}"/>
    <path d="M${ax - R * 0.87},${gy - R * 0.5} H${ax + R * 0.87} M${ax - R * 0.87},${gy + R * 0.5} H${ax + R * 0.87}"/>
  </g>`;
  const orbit = `M${ax - R * 1.6},${gy} a${R * 1.6},${R * 0.46} 0 1,0 ${R * 3.2},0 a${R * 1.6},${R * 0.46} 0 1,0 ${-R * 3.2},0`;
  s += `<g transform="rotate(-16 ${ax} ${gy})"><path d="${orbit}" class="orbit"/>
    <circle r="4" class="sat"><animateMotion dur="9s" repeatCount="indefinite" path="${orbit}"/></circle></g>`;
  return s;
}

function dnsCabinet(ax, ay) {
  const P = proj(ax, ay);
  const w = 48;
  const d = 48;
  const h = 60;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 22);
  const b = box(P, x0, y0, 0, w, d, h);
  s += b.svg;
  for (let i = 0; i < 3; i++) {
    const v = 5 + i * 18.5;
    s += quad(b.left, 5, v, w - 10, 15, 'class="drawer"');
    s += quad(b.left, 17, v + 8, 14, 4.5, 'class="card"');
    s += pline([b.left(19, v + 4), b.left(29, v + 4)], 'class="handle"');
    s += quad(b.right, 5, v, d - 10, 15, 'class="drawer"');
    s += pline([b.right(19, v + 4), b.right(29, v + 4)], 'class="handle"');
  }
  // 顶上露出的索引卡片
  for (let i = 0; i < 4; i++) {
    const c = box(P, x0 + 10 + i * 8, y0 + 12, h, 2.4, 24, 7 + (i % 2) * 4, 'index-card');
    s += c.svg;
  }
  return s;
}

function webServer(ax, ay) {
  const P = proj(ax, ay);
  const w = 46;
  const d = 46;
  const h = 90;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 30);
  const b = box(P, x0, y0, 0, w, d, h);
  s += b.svg;
  for (let i = 0; i < 4; i++) {
    const v = 7 + i * 20.5;
    s += quad(b.left, 5, v, w - 10, 15, 'class="blade"');
    s += quad(b.left, 9, v + 5, 4, 4.4, `class="led" style="--i:${i}"`);
    for (let k = 0; k < 5; k++) s += pline([b.left(19 + k * 4.5, v + 3.5), b.left(19 + k * 4.5, v + 11.5)], 'class="vent"');
  }
  s += quad(b.right, d - 12, 8, 4, h - 16, 'class="strip"');
  for (let i = 0; i < 6; i++) s += pline([b.right(7, 12 + i * 12), b.right(d - 18, 12 + i * 12)], 'class="vent"');
  s += isoCircle(b.top, w / 2, d / 2, 15, 'class="fan"');
  s += isoCircle(b.top, w / 2, d / 2, 4.5, 'class="fan-hub"', 16);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    s += pline([b.top(w / 2 + 5 * Math.cos(a), d / 2 + 5 * Math.sin(a)), b.top(w / 2 + 14 * Math.cos(a), d / 2 + 14 * Math.sin(a))], 'class="fan-blade"');
  }
  return s;
}

function miniServer(ax, ay, tone) {
  const P = proj(ax, ay);
  const w = 38;
  const d = 38;
  const h = 48;
  const x0 = -w / 2;
  const y0 = -d / 2;
  let s = shadow(P, x0, y0, w, d, 18);
  const b = box(P, x0, y0, 0, w, d, h);
  s += b.svg;
  for (let i = 0; i < 2; i++) {
    const v = 7 + i * 19;
    s += quad(b.left, 5, v, w - 10, 13, 'class="blade"');
    s += quad(b.left, 9, v + 4.5, 4, 4, `class="led" style="--i:${i}"`);
  }
  s += quad(b.right, 6, 8, d - 12, 30, 'class="drawer"');
  s += quad(b.top, 7, 7, w - 14, d - 14, `class="tag tag-${tone}"`);
  return s;
}

export function drawDevice(node) {
  const { kind, x, y, tone } = node;
  switch (kind) {
    case 'laptop':
      return laptop(x, y);
    case 'router':
      return router(x, y);
    case 'cloud':
      return cloud(x, y);
    case 'dns':
      return dnsCabinet(x, y);
    case 'server':
      return webServer(x, y);
    case 'mini':
      return miniServer(x, y, tone);
    default:
      return '';
  }
}
