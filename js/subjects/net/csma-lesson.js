// 「CSMA/CD 与最短帧长」：横轴是总线上的位置（A 在左端），纵轴是时间（往下走）。
// 两个站的信号前沿是两条斜线，交点就是碰撞；每个站什么时候「听到」碰撞、帧长够不够，都在图上量得出来。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { csma } from './csma.js';

const us = (t) => `${+(t * 1e6).toFixed(3)} μs`;
const m = (x) => `${+x.toFixed(1)} m`;
const rate = (R) => (R >= 1e9 ? `${R / 1e9} Gb/s` : `${R / 1e6} Mb/s`);
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sci = (v) => {
  const e = Math.floor(Math.log10(v));
  return `${+(v / 10 ** e).toFixed(2)}×10${[...String(e)].map((c) => SUP[c]).join('')}`;
};
const num = (s) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);

const SPEC = {
  presets: [
    { label: T('一般情形', 'Typical'), set: { L: 1000, v: 2e8, R: 10, d: 1000, tB: '3', frame: 64, rA: [1, 2], rB: [1, 0] } },
    { label: T('最坏情况：接近 2τ', 'Worst case: almost 2τ'), set: { L: 1000, v: 2e8, R: 10, d: 1000, tB: '4.9', frame: 64, rA: [0], rB: [1] } },
    { label: T('帧太短，发现不了碰撞', 'Frame too short to notice'), set: { L: 2000, v: 2e8, R: 100, d: 2000, tB: '9', frame: 64, rA: [], rB: [] } },
    { label: T('B 先听到信道忙', 'B hears a busy channel'), set: { L: 1000, v: 2e8, R: 10, d: 1000, tB: '6', frame: 64, rA: [], rB: [] } },
    { label: T('连续碰撞后退避', 'Repeated collisions'), set: { L: 1000, v: 2e8, R: 10, d: 600, tB: '1', frame: 64, rA: [1, 3, 0], rB: [1, 3, 2] } },
  ],
  groups: [
    {
      legend: T('总线', 'Bus'),
      fields: [
        { name: 'L', label: T('总线长度（m）', 'Bus length (m)'), type: 'int', min: 1, max: 100000 },
        { name: 'v', label: T('信号传播速率', 'Propagation speed'), type: 'select', options: [[2e8, '2×10⁸ m/s'], [3e8, '3×10⁸ m/s']] },
        { name: 'R', label: T('数据率', 'Data rate'), type: 'select', options: [[1, '1 Mb/s'], [10, '10 Mb/s'], [100, '100 Mb/s'], [1000, '1 Gb/s']] },
      ],
    },
    {
      legend: T('两个站', 'Two stations'),
      fields: [
        { name: 'd', label: T('B 离 A 的距离（m）', 'Distance from A to B (m)'), type: 'int', min: 1, max: 100000 },
        { name: 'tB', label: T('B 想发送的时刻（μs）', 'B wants to send at (μs)'), type: 'text', parse: (s) => (Number.isNaN(num(s)) ? NaN : s) },
        { name: 'frame', label: T('A 的帧长（字节）', 'A’s frame (bytes)'), type: 'int', min: 1, max: 1518 },
      ],
    },
    {
      legend: T('退避时取的随机数 r', 'Random r for backoff'),
      fields: [
        { name: 'rA', label: T('A 每次取的 r', 'A’s r each time'), type: 'list', min: 0, max: 1023, maxLen: 16, allowEmpty: true },
        { name: 'rB', label: T('B 每次取的 r', 'B’s r each time'), type: 'list', min: 0, max: 1023, maxLen: 16, allowEmpty: true },
      ],
    },
  ],
  note: T(
    'A 在总线左端、t = 0 开始发送；B 在 tB 时刻想发送，先监听信道。τ 是总线两端之间的单程传播时延，争用期 = 2τ。B 听到信道忙时按 1-坚持等 A 的帧尾过去再发。退避简化成以争用期为单位的时隙：两站取的 r 相同就再次碰撞，不同就 r 小的先重传成功。',
    'A sits at the left end and starts at t = 0; B wants to send at tB and listens first. τ is the end-to-end one-way delay; the contention period is 2τ. A busy B waits (1-persistent) for A’s frame to pass. Backoff is simplified to slots of one contention period: equal r values collide again, otherwise the smaller r goes first.',
  ),
};
const ERR = {
  L: T('总线长度要大于 0', 'The bus length must be positive'),
  v: T('传播速率不对', 'Invalid speed'),
  R: T('数据率不对', 'Invalid rate'),
  d: T('B 要在总线上：0 < 距离 ≤ 总线长度', 'B must be on the bus: 0 < distance ≤ length'),
  tB: T('B 的时刻不能是负数', 'B’s time cannot be negative'),
  frame: T('帧长要是正整数', 'The frame length must be a positive integer'),
  rRange: T('第 {k} 次碰撞后 r 只能取 0～{max}', 'After collision {k}, r must be 0–{max}'),
};

// ───── 画板 ─────
const X0 = 170;
const W = 440;
const Y0 = 150;
const H = 290;
const BY = 486; // 图下方：算式，退避时换成退避表

function board(sim, st, z) {
  const items = [];
  const end = sim.collide ? Math.max(sim.aDetect, sim.slot, sim.hidden ? sim.sendA : 0) * 1.18 : Math.max(sim.slot, sim.tB) * 1.45;
  const px = (x) => X0 + (x / sim.L) * W;
  const ty = (t) => Y0 + (Math.min(t, end) / end) * H;
  const xA = px(0);
  const xB = px(sim.d);

  // 总线和两个站
  let bus = line(X0, 96, X0 + W, 96, 'bl-axis') + line(X0, 88, X0, 104, 'bl-axis') + line(X0 + W, 88, X0 + W, 104, 'bl-axis');
  bus += `<g transform="translate(${xA - 26} 40)">${cell(52, 34, 'A', { tone: 'blue', size: 15 })}</g>` + line(xA, 74, xA, 96, 'bl-axis');
  bus += `<g transform="translate(${xB - 26} 40)">${cell(52, 34, 'B', { tone: 'violet', size: 15 })}</g>` + line(xB, 74, xB, 96, 'bl-axis');
  bus += txt(X0 + W / 2, 122, z ? `总线 ${sim.L} m　·　A、B 相距 ${sim.d} m` : `Bus ${sim.L} m · A–B ${sim.d} m`, 'bt-cap');
  items.push({ k: 'bus', x: 0, y: 0, html: bus });

  // 时间轴：两站下面各一条竖线，左边是刻度
  let ax = line(xA, Y0, xA, Y0 + H, 'bl-lane') + line(xB, Y0, xB, Y0 + H, 'bl-lane') + txt(X0 - 12, Y0 - 14, z ? '时间 ↓' : 'time ↓', 'bt-cap', 'end');
  const ticks = [[0, '0']];
  if (st.show >= 0) ticks.push([sim.slot, `2τ = ${us(sim.slot)}`], [sim.tau, `τ = ${us(sim.tau)}`]);
  if (st.show >= 2) ticks.push([sim.tB, `tB = ${us(sim.tB)}`]);
  if (st.show >= 4 && sim.collide) ticks.push([sim.bDetect, us(sim.bDetect)]);
  if (st.show >= 5 && sim.collide) ticks.push([sim.aDetect, us(sim.aDetect)]);
  let last = -99;
  for (const [t, lab] of ticks.filter(([t]) => t <= end).sort((a, b) => a[0] - b[0])) {
    const y = ty(t);
    if (y - last < 15) continue;
    last = y;
    ax += line(X0 - 8, y, X0 - 2, y, 'bl-axis') + txt(X0 - 12, y + 4, lab, 'bt-idx', 'end');
  }
  if (st.show >= 0 && sim.slot <= end) ax += line(X0, ty(sim.slot), X0 + W, ty(sim.slot), 'bl-lane cs-slot') + txt(X0 + W + 8, ty(sim.slot) + 4, z ? '争用期' : 'contention', 'bt-cap', 'start');
  items.push({ k: 'axes', x: 0, y: 0, html: ax });

  // A 发送的时段和信号前沿
  if (st.show >= 1) {
    const aEnd = sim.collide ? (sim.hidden ? sim.sendA : st.show >= 5 ? sim.aDetect : end) : sim.sendA;
    let a = `<rect class="cs-band c-blue" x="${xA - 5}" y="${Y0}" width="10" height="${(ty(aEnd) - Y0).toFixed(1)}" rx="3"/>`;
    a += arrow(xA, Y0, px(sim.L), ty(sim.L / sim.v), 'cs-a');
    if (!sim.collide || sim.hidden) a += txt(xA + 12, ty(Math.min(aEnd, end)) + (aEnd > end ? -6 : 4), aEnd > end ? (z ? `A 一直发到 ${us(sim.sendA)} …` : `A sends until ${us(sim.sendA)} …`) : z ? `A 发完（${us(sim.sendA)}）` : `A done (${us(sim.sendA)})`, 'bt-cap', 'start');
    items.push({ k: 'a', x: 0, y: 0, html: a });
  }
  // B
  if (st.show >= 2) {
    let b = '';
    if (sim.collide) {
      const bEnd = st.show >= 4 ? sim.bDetect : end;
      b += `<rect class="cs-band c-violet" x="${xB - 5}" y="${ty(sim.tB).toFixed(1)}" width="10" height="${(ty(bEnd) - ty(sim.tB)).toFixed(1)}" rx="3"/>`;
      b += arrow(xB, ty(sim.tB), px(0), ty(sim.tB + sim.dt), 'cs-b');
      // 两个标注靠得太近时，把「听到空闲」往上挪
      const gap = ty(sim.bDetect) - ty(sim.tB);
      b += txt(xB + 12, ty(sim.tB) + 4 - (st.show >= 4 && gap < 18 ? 18 - gap : 0), z ? 'B 听到空闲，发送' : 'B hears idle, sends', 'bt-cap', 'start');
    } else {
      b += `<circle class="cs-dot c-violet" cx="${xB}" cy="${ty(sim.tB).toFixed(1)}" r="5"/>` + txt(xB + 12, ty(sim.tB) + 4, z ? 'B 听到信道忙，推迟' : 'B hears busy, defers', 'bt-cap', 'start');
      if (st.show >= 3) b += txt(xB + 12, Y0 + H - 4, z ? `B 在 ${us(sim.bStart)} 才发送 ↓` : `B sends at ${us(sim.bStart)} ↓`, 'bt-cap', 'start');
    }
    items.push({ k: 'b', x: 0, y: 0, html: b });
  }
  // 碰撞点、两站检测到碰撞
  if (sim.collide && st.show >= 3) {
    const cx = px(sim.xm);
    const cy = ty(sim.tm);
    // 碰撞点靠近 B 时，标注放到左边，免得压住 B 的标注
    const right = cx > X0 + W * 0.62;
    items.push({ k: 'hit', x: 0, y: 0, html: `<circle class="cs-hit" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9"/>` + txt(right ? cx - 16 : cx, right ? cy + 22 : cy - 16, z ? `碰撞：${m(sim.xm)}，${us(sim.tm)}` : `Collision: ${m(sim.xm)}, ${us(sim.tm)}`, 'bt-acc', right ? 'end' : 'middle') });
  }
  if (sim.collide && st.show >= 4) items.push({ k: 'bdet', x: 0, y: 0, html: `<circle class="cs-dot c-violet" cx="${xB}" cy="${ty(sim.bDetect).toFixed(1)}" r="5"/>` + txt(xB + 12, ty(sim.bDetect) + 4, z ? 'B 检测到碰撞，停发' : 'B detects, stops', 'bt-cap', 'start') });
  if (sim.collide && st.show >= 5) {
    const y = ty(sim.aDetect);
    items.push({ k: 'adet', x: 0, y: 0, html: `<circle class="cs-dot ${sim.hidden ? 'c-rose' : 'c-blue'}" cx="${xA}" cy="${y.toFixed(1)}" r="5"/>` + txt(xA + 12, y + 4, sim.hidden ? (z ? 'B 的信号这时才到 A，A 早已不再检测' : 'B’s signal arrives; A stopped listening') : z ? 'A 检测到碰撞，停发' : 'A detects, stops', 'bt-cap', 'start') });
  }

  // 图下方：算式（两栏）；进入退避后换成退避表
  const shown = sim.rounds?.slice(0, Math.max(0, st.round ?? 0)) ?? [];
  if (st.show >= 0 && !shown.length) {
    const rows = [
      [`τ = ${sim.L} m ÷ ${sci(sim.v)} m/s = ${us(sim.tau)}`, ''],
      [z ? `最短帧长 = 2τ × ${rate(sim.R)} = ${sim.minBits} bit（${sim.minBytes} B）` : `Min frame = 2τ × ${rate(sim.R)} = ${sim.minBits} bit (${sim.minBytes} B)`, 'hl'],
      [z ? `争用期 2τ = ${us(sim.slot)}` : `Contention period 2τ = ${us(sim.slot)}`, ''],
      [z ? `A 的帧 ${sim.frame} B，要发 ${us(sim.sendA)}` : `A’s ${sim.frame} B frame takes ${us(sim.sendA)}`, ''],
    ];
    let html = rows.map(([t, c], i) => txt((i % 2) * 330, Math.floor(i / 2) * 28, t, `cs-calc ${c}`, 'start')).join('');
    if (st.show >= 6 && sim.collide) html += txt(0, 62, sim.hidden ? (z ? `${sim.frame} B < ${sim.minBytes} B：帧太短，A 发现不了碰撞` : `${sim.frame} B < ${sim.minBytes} B: too short, A misses the collision`) : z ? `A 发出 ${sim.aBits} bit 时检测到碰撞，帧还没发完` : `A detects after ${sim.aBits} bit, mid-frame`, `cs-calc ${sim.hidden ? 'hl' : 'ok'}`, 'start');
    items.push({ k: 'calc', x: 60, y: BY, html });
  }

  // 退避表：只留最近 3 行
  if (shown.length) {
    const head = z ? ['碰撞', 'r 的范围', 'A', 'B', '结果'] : ['#', 'range', 'A', 'B', 'result'];
    const CW = [52, 86, 44, 44, 120];
    const row = (cells, y, cls) => {
      let x = 0;
      return cells.map((c, i) => {
        const g = `<g transform="translate(${x} ${y})">${cell(CW[i] - 4, 26, String(c), { cls, size: 11.5 })}</g>`;
        x += CW[i];
        return g;
      }).join('');
    };
    let tb = txt(0, -12, z ? '二进制指数退避' : 'Binary exponential backoff', 'bt-cap', 'start') + row(head, 0, 'head');
    const tail = shown.slice(-3);
    tail.forEach((r, i) => {
      const res = r.giveUp ? (z ? '放弃，报错' : 'give up') : r.missing ? (z ? '随机数不够' : 'need more r') : r.again ? (z ? '再次碰撞' : 'collide again') : z ? `${r.winner} 先重传` : `${r.winner} goes first`;
      tb += row(r.giveUp ? [16, '—', '—', '—', res] : [r.k, `0～${r.max}`, r.a ?? '?', r.b ?? '?', res], (i + 1) * 30, i === tail.length - 1 ? 'hot' : '');
    });
    items.push({ k: 'bo', x: 60, y: BY - 6, html: tb });
  }
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'mac',
      title: T('为什么要介质访问控制', 'Why medium access control'),
      blocks: [
        { p: T('总线、无线这类**广播信道**上，一个站发的信号所有站都能收到。两个站同时发，信号叠在一起就都坏了，所以要有规则决定「谁、什么时候」可以发。这就是介质访问控制（MAC）。', 'On **broadcast channels** such as a bus or radio, everyone hears every transmission. Two senders at once garble each other, so medium access control decides who may send and when.') },
        {
          table: {
            head: [T('类别', 'Kind'), T('做法', 'Idea'), T('例子', 'Examples')],
            rows: [
              [T('信道划分', 'Channel partitioning'), T('事先把信道按频率、时间、波长或码型分给各站，不会冲突', 'split the channel in advance; no collisions'), T('频分、时分、波分、码分多路复用', 'FDM, TDM, WDM, CDMA')],
              [T('随机访问', 'Random access'), T('想发就发，冲突了再想办法', 'send when ready; recover from collisions'), T('ALOHA、CSMA、CSMA/CD、CSMA/CA', 'ALOHA, CSMA, CSMA/CD, CSMA/CA')],
              [T('轮询访问', 'Taking turns'), T('按顺序轮流发，或者持有令牌才能发', 'poll in turn or pass a token'), T('轮询、令牌传递', 'polling, token passing')],
            ],
          },
        },
      ],
    },
    {
      id: 'csma',
      title: T('CSMA：先听后发', 'CSMA: listen before talking'),
      blocks: [
        { p: T('载波监听多路访问（CSMA）：发送前先监听信道，有别人在发就先不发。监听到「忙」之后怎么办，有三种做法：', 'Carrier sense multiple access listens before sending. What to do on a busy channel:') },
        {
          table: {
            head: [T('方式', 'Variant'), T('信道空闲', 'Idle'), T('信道忙', 'Busy'), T('特点', 'Trade-off')],
            rows: [
              [T('1-坚持', '1-persistent'), T('立即发送', 'send now'), T('一直监听，一空闲就发', 'keep listening, send once idle'), T('不浪费时间，但几个站同时等待时一空闲就会撞', 'no idle time, but waiting stations collide')],
              [T('非坚持', 'Non-persistent'), T('立即发送', 'send now'), T('等一段随机时间再监听', 'wait a random time, listen again'), T('碰撞少，但信道可能白白空着', 'fewer collisions, more idle time')],
              [T('p-坚持', 'p-persistent'), T('以概率 p 发送，1 − p 推迟到下一时隙', 'send with probability p, else defer a slot'), T('一直监听', 'keep listening'), T('用于时隙信道，折中', 'slotted channels; a compromise')],
            ],
          },
        },
        { warn: T('先听后发也避免不了碰撞：信号传播需要时间，B 听到「空闲」时，A 的信号可能正在路上。', 'Listening cannot prevent every collision: A’s signal may still be on its way when B hears silence.') },
      ],
    },
    {
      id: 'cd',
      title: T('CSMA/CD：边发边听，碰撞就停', 'CSMA/CD: listen while talking'),
      blocks: [
        {
          steps: [
            T('**先听后发**：信道空闲才发送（以太网用 1-坚持）；', '**Listen first**: send only on an idle channel (Ethernet is 1-persistent);'),
            T('**边发边听**：发送的同时检测信道上的电压，判断有没有别人也在发；', '**Listen while sending**: watch the line for another signal;'),
            T('**碰撞就停**：一旦检测到碰撞立即停止发送，再发一段人为干扰信号（jam），让所有站都知道发生了碰撞；', '**Stop on collision**: stop at once and send a jam signal so everyone knows;'),
            T('**随机重发**：按二进制指数退避等待一段随机时间，再回到第 1 步。', '**Back off**: wait a random time chosen by binary exponential backoff, then start over.'),
          ],
        },
        { p: T('因为发送时还要同时监听，CSMA/CD 只能是**半双工**。现在的交换式以太网是全双工、点对点的，不会碰撞，也就不用 CSMA/CD 了。', 'Because it listens while sending, CSMA/CD is **half-duplex**. Switched full-duplex Ethernet has no collisions and does not use it.') },
      ],
    },
    {
      id: 'slot',
      title: T('争用期与最短帧长', 'Contention period and minimum frame'),
      blocks: [
        { p: T('设总线两端的单程传播时延为 τ。最坏的情况：A 发出的信号快到另一端的 B 时，B 刚好听到空闲也开始发送。碰撞几乎就发生在 B 身边，B 马上发现；但碰撞信号还要再走 τ 才回到 A。所以 A 最多要经过 **2τ** 才能确定自己没有碰撞，2τ 叫**争用期**。', 'Let τ be the end-to-end delay. Worst case: B starts just before A’s signal reaches it. B notices at once, but the news takes another τ to reach A, so A may need **2τ** to be sure. 2τ is the **contention period**.') },
        { formula: T('最短帧长 = 2τ × 数据率', 'minimum frame = 2τ × data rate') },
        { p: T('A 只有在发送时才能检测碰撞。如果帧太短，2τ 还没到就发完了，碰撞信号回来时 A 已经不听了，它会以为发送成功。所以帧至少要发 2τ 那么久。', 'A can only detect collisions while sending. A frame shorter than 2τ ends before the news returns, and A wrongly believes it succeeded.') },
        { tip: T('10 Mb/s 以太网规定争用期为 51.2 μs，也就是 512 bit 的发送时间，所以最短帧长是 **64 字节**；短于 64 字节的帧都是碰撞留下的无效帧，收到就丢弃。', '10 Mb/s Ethernet fixes the contention period at 51.2 μs, 512 bit times, hence the **64-byte** minimum frame; anything shorter is a collision fragment and is discarded.') },
        { p: T('由公式可见：数据率提高后，要么加大最短帧长，要么缩短网络的最大距离。', 'Raising the data rate means either a longer minimum frame or a shorter network.') },
      ],
    },
    {
      id: 'backoff',
      title: T('二进制指数退避', 'Binary exponential backoff'),
      blocks: [
        {
          steps: [
            T('确定参数 k = min(重传次数, 10)；', 'k = min(number of retransmissions, 10);'),
            T('从 {0, 1, …, 2^k − 1} 中随机取一个整数 r；', 'pick r at random from {0, 1, …, 2^k − 1};'),
            T('等待 r × 争用期（10 Mb/s 以太网是 r × 51.2 μs）后再监听、发送；', 'wait r contention periods (51.2 μs each on 10 Mb/s Ethernet), then try again;'),
            T('重传 16 次仍不成功就丢弃这一帧，向上层报告。', 'after 16 failed attempts, drop the frame and report an error.'),
          ],
        },
        { p: T('碰撞越多，r 的取值范围越大，几个站再次选到同一时刻的概率就越小。这样网络忙时自动「错开」，空闲时又能很快重发。', 'The more collisions, the wider the range, so stations spread out under load yet retry quickly when the network is quiet.') },
      ],
    },
    {
      id: 'calc',
      title: T('常见计算', 'Typical calculations'),
      blocks: [
        {
          list: [
            T('**最短帧长**：2τ × R。τ 要用总线两端（最远两站）之间的距离算。', '**Minimum frame**: 2τ × R, with τ over the longest distance.'),
            T('**最远距离**：已知最短帧长 Lmin、数据率 R、传播速率 v，最远距离 = (Lmin ÷ R) ÷ 2 × v。', '**Maximum distance**: (Lmin ÷ R) ÷ 2 × v.'),
            T('**检测到碰撞的时间**：A 在 0 时刻、B 在 tB 时刻（tB 小于 A 的信号到 B 的时间）发送，B 在 d / v 时检测到，A 在 tB + d / v 时检测到。', '**Detection times**: with A at 0 and B at tB (before A’s signal arrives), B notices at d / v and A at tB + d / v.'),
            T('**发送时延和传播时延别混**：发送时延 = 帧长 ÷ 数据率，传播时延 = 距离 ÷ 传播速率。', '**Transmission vs propagation delay**: frame ÷ rate versus distance ÷ speed.'),
          ],
        },
      ],
    },
    {
      id: 'ca',
      title: T('无线局域网为什么用 CSMA/CA', 'Why wireless LANs use CSMA/CA'),
      blocks: [
        { p: T('无线网卡发送时自己的信号太强，听不到别人的信号；还有「隐蔽站」问题（两个站互相听不到，却都能到达同一个接入点）。所以 802.11 没法边发边检测碰撞，只能**尽量避免**碰撞：发送前信道空闲还要再等一段帧间间隔并随机退避，必要时先用 RTS / CTS 预约信道，收方正确收到后回 ACK，没收到 ACK 就重传。', 'A radio cannot hear others while transmitting, and hidden stations may not hear each other at all. 802.11 therefore **avoids** collisions: waits an inter-frame space plus random backoff, optionally reserves with RTS/CTS, and relies on ACKs with retransmission.') },
      ],
    },
    {
      id: 'aloha',
      title: T('信道划分、随机访问和轮询', 'Channel partitioning, random access, polling'),
      blocks: [
        {
          table: {
            head: [T('类别', 'Kind'), T('做法', 'How'), T('例子', 'Examples')],
            rows: [
              [T('静态划分信道', 'Static partitioning'), T('事先把信道分给各站，不会冲突', 'channels assigned in advance'), T('频分、时分、波分、码分复用', 'FDM, TDM, WDM, CDMA')],
              [T('随机访问', 'Random access'), T('想发就发，冲突了再随机退避重发', 'send when ready; back off after collisions'), T('ALOHA、CSMA、CSMA/CD、CSMA/CA', 'ALOHA, CSMA family')],
              [T('轮询访问', 'Taking turns'), T('按顺序轮流发，不会冲突', 'stations take turns'), T('轮询协议、令牌传递', 'polling, token passing')],
            ],
          },
        },
        { list: [
          T('**纯 ALOHA**：想发就发，发现冲突后随机等一段时间重发。吞吐量最高约 18.4%。', '**Pure ALOHA**: send at will; at most about 18.4% throughput.'),
          T('**时隙 ALOHA**：时间分成等长的时隙，只能在时隙开始时发，冲突的机会减半，吞吐量最高约 36.8%。', '**Slotted ALOHA**: send only at slot starts; about 36.8%.'),
          T('**令牌传递**：一个特殊的短帧「令牌」沿环依次传递，拿到令牌的站才能发数据，发完把令牌传下去。不会冲突，负载重时效率高；但令牌丢失或站点故障要专门处理，负载轻时也要等令牌。', '**Token passing**: only the token holder sends; no collisions, but token loss needs handling and light loads still wait.'),
        ] },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('τ 是单程端到端传播时延，争用期是 2τ，不是 τ。', 'τ is one-way; the contention period is 2τ.'),
            T('数据率不变时，最短帧长和最大距离成正比；最短帧长不变时，数据率越高，网络的最大距离越短。', 'At a fixed rate the minimum frame grows with distance; at a fixed frame size a faster rate means a shorter network.'),
            T('退避的 k 最大取 10，但重传次数上限是 16。', 'k is capped at 10, but the retry limit is 16.'),
            T('CSMA/CD 只用于半双工的共享介质；交换机的全双工端口不用。', 'CSMA/CD applies only to half-duplex shared media.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('过程', 'Steps') });

function build(params) {
  const sim = csma({ L: params.L, v: Number(params.v), R: Number(params.R) * 1e6, d: params.d, tB: num(params.tB) * 1e-6, frame: params.frame, rA: params.rA ?? [], rB: params.rB ?? [] });
  const lesson = {
    id: 'csma-cd',
    kit,
    where: [['net', 'link']],
    tag: 'CD',
    name: T('CSMA/CD 与最短帧长', 'CSMA/CD and the minimum frame'),
    full: T('介质访问控制 · 三种坚持 · 争用期 2τ · 最短帧长 · 二进制指数退避 · CSMA/CA', 'MAC · persistence · contention period · minimum frame · backoff · CSMA/CA'),
    title: sim.ok ? T(`${sim.L} m · ${rate(sim.R)}`, `${sim.L} m · ${rate(sim.R)}`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['blue', T('A 发送', 'A sending')],
      ['violet', T('B 发送', 'B sending')],
      ['rose', T('碰撞', 'Collision')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '总线上的站「先听后发」，可信号传播需要时间，B 听到空闲时 A 的信号可能还在路上。这节课把总线画成横轴、时间画成往下走的竖轴，两个站的信号前沿是两条斜线：交点就是碰撞，再往下能量出每个站什么时候发现碰撞、为什么最多要 2τ、帧为什么不能太短，最后看碰撞后怎么退避。',
        'Stations listen before talking, but signals take time to travel. With the bus across and time running down, each station’s signal front is a slanted line: where they cross is the collision. From there you can read when each station notices, why it can take up to 2τ, why frames need a minimum size, and how backoff works.',
      ),
      facts: sim.ok ? [[T('争用期', 'Contention period'), us(sim.slot)], [T('最短帧长', 'Minimum frame'), `${sim.minBits} bit`]] : [],
    },
    start: { nodes: [], frame: { rect: [20, 20, 800, BY + 120] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;

  const list = [
    {
      title: T(`争用期 2τ = ${us(sim.slot)}`, `Contention period 2τ = ${us(sim.slot)}`),
      desc: T(`最短帧长 ${sim.minBits} bit`, `Minimum frame ${sim.minBits} bit`),
      detail: T(`总线两端单程传播时延 τ = ${sim.L} m ÷ ${sci(sim.v)} m/s = ${us(sim.tau)}，争用期 2τ = ${us(sim.slot)}。最短帧长 = 2τ × ${rate(sim.R)} = ${sim.minBits} bit，约 ${sim.minBytes} 字节。`, `τ = ${sim.L} m ÷ ${sci(sim.v)} m/s = ${us(sim.tau)}; 2τ = ${us(sim.slot)}. Minimum frame = 2τ × ${rate(sim.R)} = ${sim.minBits} bit, about ${sim.minBytes} bytes.`),
      ref: 'slot',
      st: { show: 0 },
      row: { color: 'slate', what: T('争用期与最短帧长', 'Contention period'), result: `${sim.minBits} bit`, tone: 'info' },
    },
    {
      title: T('A 听到空闲，开始发送', 'A hears idle and starts'),
      desc: T(`帧长 ${sim.frame} B，要发 ${us(sim.sendA)}`, `${sim.frame} B takes ${us(sim.sendA)}`),
      detail: T(`t = 0 时 A 监听到信道空闲，开始发送 ${sim.frame} 字节的帧，发完要 ${sim.frame * 8} bit ÷ ${rate(sim.R)} = ${us(sim.sendA)}。A 的信号沿总线以 ${sci(sim.v)} m/s 传播，${us(sim.dt)} 后才到达 B。`, `At t = 0 A hears an idle bus and starts a ${sim.frame}-byte frame, ${us(sim.sendA)} long. Its signal reaches B after ${us(sim.dt)}.`),
      ref: 'csma',
      st: { show: 1 },
      row: { color: 'blue', what: T('A 发送', 'A sends'), result: '0', tone: 'info' },
    },
  ];
  if (!sim.collide) {
    list.push(
      {
        title: T(`B 在 ${us(sim.tB)} 听到信道忙`, `B hears a busy bus at ${us(sim.tB)}`),
        desc: T('A 的信号已经到了 B', 'A’s signal has arrived'),
        detail: T(`A 的信号在 ${us(sim.dt)} 到达 B，B 在 ${us(sim.tB)} 监听时信道已经忙，所以 B 不发送。这就是「先听后发」起作用的情况。`, `A’s signal reached B at ${us(sim.dt)}; at ${us(sim.tB)} B hears it and holds back.`),
        ref: 'csma',
        st: { show: 2 },
        row: { color: 'violet', what: T('B 监听', 'B listens'), result: T('忙', 'busy'), tone: 'info' },
      },
      {
        title: T(`B 等到 ${us(sim.bStart)} 再发送`, `B sends at ${us(sim.bStart)}`),
        desc: T('1-坚持：一空闲就发', '1-persistent: send once idle'),
        detail: T(`以太网用 1-坚持：B 一直监听，A 的帧在 ${us(sim.sendA)} 发完，帧尾再经过 ${us(sim.dt)} 才经过 B，所以 B 在 ${us(sim.bStart)} 听到空闲后立即发送，没有碰撞。`, `1-persistent: B keeps listening. A’s frame ends at ${us(sim.sendA)} and its tail passes B ${us(sim.dt)} later, so B sends at ${us(sim.bStart)} without a collision.`),
        ref: 'csma',
        st: { show: 3 },
        row: { color: 'green', what: T('B 发送', 'B sends'), result: us(sim.bStart), tone: 'ok' },
      },
    );
  } else {
    list.push(
      {
        title: T(`B 在 ${us(sim.tB)} 听到空闲，也发送`, `B hears idle at ${us(sim.tB)} and sends too`),
        desc: T(`A 的信号 ${us(sim.dt)} 才到`, `A’s signal arrives at ${us(sim.dt)}`),
        detail: T(`A 的信号要到 ${us(sim.dt)} 才到达 B，B 在 ${us(sim.tB)} 监听时以为信道空闲，于是也开始发送。先听后发避免不了这种碰撞。`, `A’s signal only reaches B at ${us(sim.dt)}, so at ${us(sim.tB)} B thinks the bus is idle and sends.`),
        ref: 'csma',
        st: { show: 2 },
        row: { color: 'violet', what: T('B 发送', 'B sends'), result: us(sim.tB), tone: 'warn' },
      },
      {
        title: T(`两路信号在 ${m(sim.xm)} 处相遇`, `The signals meet at ${m(sim.xm)}`),
        desc: T(`t = ${us(sim.tm)}`, `t = ${us(sim.tm)}`),
        detail: T(`A 的信号前沿在 v·t 处，B 的在 d − v·(t − tB) 处。两者相等时 t = (d/v + tB) ÷ 2 = (${us(sim.dt)} + ${us(sim.tB)}) ÷ 2 = ${us(sim.tm)}，位置离 A ${m(sim.xm)}。碰撞发生在总线上，但两个站都还不知道。`, `A’s front is at v·t, B’s at d − v·(t − tB). They meet at t = (d/v + tB) ÷ 2 = ${us(sim.tm)}, ${m(sim.xm)} from A. Neither station knows yet.`),
        ref: 'slot',
        st: { show: 3 },
        row: { color: 'rose', what: T('碰撞', 'Collision'), result: m(sim.xm), tone: 'warn' },
      },
      {
        title: T(`B 在 ${us(sim.bDetect)} 检测到碰撞`, `B notices at ${us(sim.bDetect)}`),
        desc: T(`B 只发了 ${sim.bBits} bit`, `B sent only ${sim.bBits} bit`),
        detail: T(`A 的信号在 ${us(sim.dt)} 到达 B，B 边发边听，立刻发现碰撞，停止发送并发出干扰信号。B 一共发了 (${us(sim.dt)} − ${us(sim.tB)}) × ${rate(sim.R)} = ${sim.bBits} bit。`, `A’s signal reaches B at ${us(sim.dt)}; B stops and sends a jam signal after ${sim.bBits} bit.`),
        ref: 'cd',
        st: { show: 4 },
        row: { color: 'violet', what: T('B 检测到碰撞', 'B detects'), result: us(sim.bDetect), tone: 'info' },
      },
      sim.hidden
        ? {
            title: T('A 已经发完，发现不了碰撞', 'A has finished and never notices'),
            desc: T(`${us(sim.sendA)} 就发完了`, `Done at ${us(sim.sendA)}`),
            detail: T(`B 的信号要到 ${us(sim.tB)} + ${us(sim.dt)} = ${us(sim.aDetect)} 才回到 A，可 A 的帧在 ${us(sim.sendA)} 就发完了，A 不再检测，会以为发送成功，帧其实已经坏了。`, `B’s signal returns at ${us(sim.aDetect)}, but A finished at ${us(sim.sendA)} and stopped listening; it thinks the frame got through.`),
            ref: 'slot',
            st: { show: 5 },
            row: { color: 'rose', what: T('A 检测', 'A detects'), result: T('检测不到', 'missed'), tone: 'warn' },
          }
        : {
            title: T(`A 在 ${us(sim.aDetect)} 检测到碰撞`, `A notices at ${us(sim.aDetect)}`),
            desc: T(`A 已发 ${sim.aBits} bit`, `A sent ${sim.aBits} bit`),
            detail: T(`B 的信号在 ${us(sim.tB)} + ${us(sim.dt)} = ${us(sim.aDetect)} 回到 A，A 这时帧还没发完，检测到碰撞后停止发送、发出干扰信号。A 发现碰撞用了 ${us(sim.aDetect)}，不超过争用期 ${us(sim.slot)}。`, `B’s signal reaches A at ${us(sim.aDetect)} while A is still sending; A stops and jams. It took ${us(sim.aDetect)}, within the ${us(sim.slot)} contention period.`),
            ref: 'cd',
            st: { show: 5 },
            row: { color: 'blue', what: T('A 检测到碰撞', 'A detects'), result: us(sim.aDetect), tone: 'info' },
          },
      {
        title: sim.hidden ? T(`帧至少要 ${sim.minBytes} 字节`, `Frames need ${sim.minBytes} bytes`) : T('帧够长，碰撞能被发现', 'Long enough to notice'),
        desc: sim.hidden ? T(`${sim.frame} B < 最短帧长`, `${sim.frame} B < minimum`) : T(`${sim.frame} B ≥ ${sim.minBytes} B`, `${sim.frame} B ≥ ${sim.minBytes} B`),
        detail: sim.hidden
          ? T(`最坏情况下 A 要等 2τ = ${us(sim.slot)} 才能确定没有碰撞，所以帧至少要发 ${us(sim.slot)}，即 ${sim.minBits} bit（${sim.minBytes} 字节）。这里只有 ${sim.frame} 字节，太短。要么加长帧，要么缩短总线。`, `In the worst case A needs 2τ = ${us(sim.slot)}, so a frame must last at least ${sim.minBits} bit (${sim.minBytes} bytes). ${sim.frame} bytes is too short; lengthen the frame or shorten the bus.`)
          : T(`A 的帧要发 ${us(sim.sendA)}，不短于争用期 ${us(sim.slot)}，所以无论 B 什么时候开始发送，碰撞信号都能在 A 发完之前回到 A。`, `A’s frame lasts ${us(sim.sendA)}, at least the ${us(sim.slot)} contention period, so any collision news returns while A is still sending.`),
        ref: 'slot',
        st: { show: 6 },
        row: { color: sim.hidden ? 'rose' : 'green', what: T('帧长检查', 'Frame check'), result: sim.hidden ? T('太短', 'too short') : T('够长', 'OK'), tone: sim.hidden ? 'warn' : 'ok' },
      },
    );
    sim.rounds.forEach((r, i) => {
      const st = { show: 6, round: i + 1 };
      if (r.giveUp) {
        list.push({ title: T('碰撞 16 次，放弃这一帧', 'Gave up after 16 collisions'), desc: T('向上层报告出错', 'Report an error'), detail: T('已经重传 16 次仍然碰撞，以太网丢弃这一帧，向上层报告发送失败。', 'After 16 attempts Ethernet drops the frame and reports failure.'), ref: 'backoff', st, row: { color: 'rose', what: T('放弃', 'Give up'), result: '16', tone: 'warn' } });
      } else if (r.missing) {
        list.push({ title: T(`第 ${r.k} 次碰撞后：需要随机数`, `After collision ${r.k}: need r`), desc: T(`r 取 0～${r.max}`, `r in 0–${r.max}`), detail: T(`第 ${r.k} 次碰撞后各自要从 0～${r.max} 里取 r。参数里给的随机数不够，在「A 每次取的 r」「B 每次取的 r」里再填一个就能接着看。`, `Each station now picks r in 0–${r.max}. Add more values to the r lists to continue.`), ref: 'backoff', st, row: { color: 'slate', what: T(`第 ${r.k} 次退避`, `Backoff ${r.k}`), result: T('待填', 'needs r'), tone: 'info' } });
      } else {
        const kk = Math.min(r.k, 10);
        const head = T(`第 ${r.k} 次碰撞后 k = min(${r.k}, 10) = ${kk}，r 从 0～2^${kk} − 1 = 0～${r.max} 里取。A 取 ${r.a}，B 取 ${r.b}。`, `After collision ${r.k}, k = ${kk}, r in 0–${r.max}. A picks ${r.a}, B picks ${r.b}.`);
        const tail = r.again
          ? T('两站等的时间一样，会同时重传，再次碰撞。', ' They retry at the same moment and collide again.')
          : T(`${r.winner} 等 ${Math.min(r.a, r.b)} × ${us(sim.slot)} = ${us(r.wait)} 后先重传；另一站的时隙到时监听到信道忙，就推迟，不会再碰撞。`, ` ${r.winner} waits ${us(r.wait)} and goes first; the other finds the bus busy when its turn comes and defers.`);
        list.push({
          title: r.again ? T(`第 ${r.k} 次退避：都取 ${r.a}，又碰撞`, `Backoff ${r.k}: both ${r.a}, collide again`) : T(`第 ${r.k} 次退避：${r.winner} 先重传`, `Backoff ${r.k}: ${r.winner} goes first`),
          desc: T(`r ∈ 0～${r.max}，A ${r.a}、B ${r.b}`, `r in 0–${r.max}, A ${r.a}, B ${r.b}`),
          detail: { zh: head.zh + tail.zh, en: head.en + tail.en },
          ref: 'backoff',
          st,
          row: { color: r.again ? 'rose' : 'green', what: T(`第 ${r.k} 次退避`, `Backoff ${r.k}`), result: r.again ? T('再碰撞', 'again') : T(`${r.winner} 先`, `${r.winner} first`), tone: r.again ? 'warn' : 'ok' },
        });
      }
    });
  }
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? { show: -1 } : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: !sim.collide ? T('没有碰撞', 'No collision') : sim.hidden ? T('碰撞没被发现', 'Collision missed') : T('碰撞被发现并处理', 'Collision handled'),
    text: T('改一下 B 开始发送的时刻、两站的距离或者数据率，看碰撞点和发现碰撞的时间怎么变；把帧长改小，看什么时候会发现不了碰撞。', 'Change B’s start time, the distance or the rate and watch the collision move; shrink the frame to see when the collision goes unnoticed.'),
    facts: [
      [T('争用期', 'Contention period'), us(sim.slot)],
      [T('最短帧长', 'Minimum frame'), `${sim.minBits} bit`],
      ...(sim.collide && !sim.hidden ? [[T('A 发现碰撞', 'A notices'), us(sim.aDetect)]] : []),
    ],
  };
  return lesson;
}

export const makeCsma = () => parametric('csma-cd', SPEC.presets[0].set, build);
