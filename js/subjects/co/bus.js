// 总线和输入/输出系统的纯计算：总线带宽与仲裁、中断屏蔽与多重中断、DMA 的三种传送方式。
//
// 约定（界面上写明）：
//   · 链式查询：离仲裁器最近（编号最小）的请求设备得到总线；计数器查询：从计数值开始往后找第一个请求的设备；
//   · 中断：响应优先级按设备列表的顺序（左边最高），处理优先级按另给的顺序；
//     某个中断服务程序的屏蔽字屏蔽所有处理优先级不高于它的设备（包括它自己）；
//     时间以「单位」为步长，有多个未被屏蔽的请求时先按响应优先级响应，响应后如果别的请求没被它屏蔽，立刻嵌套；
//   · DMA：CPU 每个存储周期都要访存；设备每隔 interval 个存储周期准备好一个字。

const err = (e) => ({ ok: false, errors: [e] });

export function busArb({ width, freq, cycles, n, req, last }) {
  if (![8, 16, 32, 64].includes(width)) return err('width');
  if (!(freq > 0 && Number.isInteger(cycles) && cycles >= 1)) return err('freq');
  if (!(Number.isInteger(n) && n >= 2 && n <= 16)) return err('n');
  if (!Array.isArray(req) || !req.length || req.some((x) => !(Number.isInteger(x) && x >= 0 && x < n))) return err('req');
  if (!(Number.isInteger(last) && last >= -1 && last < n)) return err('last');
  const rs = [...new Set(req)].sort((a, b) => a - b);
  const bw = ((width / 8) * freq) / cycles;
  const chain = rs[0];
  const fromZero = rs[0];
  const after = Array.from({ length: n }, (_, i) => (last + 1 + i) % n).find((i) => rs.includes(i));
  return { ok: true, width, freq, cycles, bw, n, req: rs, last, chain, fromZero, after, lines: { chain: 3, counter: Math.ceil(Math.log2(n)) + 2, independent: 2 * n + 1 } };
}

export function parseArr(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[\s,，]+/).filter(Boolean)) {
    const m = it.match(/^([A-Za-z])(\d+)$/);
    if (!m) return null;
    out.push({ d: m[1].toUpperCase(), t: +m[2] });
  }
  return out;
}
export function interrupts({ devs, handle, arrivals, dur }) {
  const D = String(devs ?? '').toUpperCase().split(/[\s,，]+/).filter(Boolean);
  const H = String(handle ?? '').toUpperCase().split(/[\s,，]+/).filter(Boolean);
  if (D.length < 2 || D.length > 6 || new Set(D).size !== D.length || D.some((x) => !/^[A-Z]$/.test(x))) return err('devs');
  if (H.length !== D.length || [...H].sort().join() !== [...D].sort().join()) return err('handle');
  const A = parseArr(arrivals);
  if (!A || !A.length || A.length > 8 || A.some((x) => !D.includes(x.d))) return err('arr');
  if (!(Number.isInteger(dur) && dur >= 1 && dur <= 10)) return err('dur');
  const resp = (d) => D.indexOf(d);
  const hp = (d) => H.indexOf(d); // 越小越高
  const mask = Object.fromEntries(D.map((x) => [x, D.map((y) => (hp(y) >= hp(x) ? 1 : 0))]));
  const masked = (top, d) => (top ? mask[top.d][D.indexOf(d)] === 1 : false);
  const stack = [];
  const pending = [];
  const timeline = [];
  const events = [];
  const left = [...A].sort((x, y) => x.t - y.t);
  for (let t = 0; t < 200; t++) {
    while (left.length && left[0].t === t) {
      const a = left.shift();
      pending.push(a.d);
      events.push({ t, kind: 'req', d: a.d });
    }
    for (;;) {
      const top = stack.at(-1);
      const cand = pending.filter((d) => !masked(top, d)).sort((x, y) => resp(x) - resp(y));
      if (!cand.length) break;
      const d = cand[0];
      pending.splice(pending.indexOf(d), 1);
      if (top) events.push({ t, kind: 'nest', d, over: top.d });
      else events.push({ t, kind: 'resp', d });
      stack.push({ d, rem: dur });
    }
    const top = stack.at(-1);
    timeline.push({ t, who: top ? top.d : null, depth: stack.length });
    if (top) {
      top.rem--;
      if (!top.rem) {
        stack.pop();
        events.push({ t: t + 1, kind: 'done', d: top.d });
      }
    }
    if (!left.length && !pending.length && !stack.length) break;
  }
  // 合并成段
  const segs = [];
  for (const x of timeline) {
    const s = segs.at(-1);
    if (s && s.who === x.who && s.depth === x.depth) s.end = x.t + 1;
    else segs.push({ who: x.who, depth: x.depth, start: x.t, end: x.t + 1 });
  }
  return { ok: true, D, H, mask, arrivals: A, dur, segs, events, end: timeline.length };
}

export function dma({ k, interval }) {
  if (!(Number.isInteger(k) && k >= 1 && k <= 8)) return err('k');
  if (!(Number.isInteger(interval) && interval >= 1 && interval <= 6)) return err('interval');
  const L = (k - 1) * interval + 3;
  const ready = Array.from({ length: k }, (_, i) => i * interval);
  const stop = Array.from({ length: L }, (_, c) => (c <= (k - 1) * interval ? (ready.includes(c) ? 'dma' : 'idle') : 'cpu'));
  const steal = Array.from({ length: L }, (_, c) => (ready.includes(c) ? 'dma' : 'cpu'));
  const lost = { stop: (k - 1) * interval + 1, steal: k, alt: 0 };
  return { ok: true, k, interval, L, ready, stop, steal, lost };
}
