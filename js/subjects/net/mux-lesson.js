// 「信道复用」：两种画法。
//   码分复用：左边是各站的码片序列和要发的比特，右边逐个比特时间算：各站送出什么、信道上叠加成什么、接收方怎样用内积还原；
//   时分复用：左边是各用户每一轮要发的数据，右边上下两条帧序列对比同步时分（空时隙也占着）和统计时分（按需装、带地址）。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { M, cdma, tdm } from './mux.js';

const W = [['net', 'phy']];
const CW = 44;
const sgn = (v) => (v > 0 ? `+${v}` : String(v));
const toneOf = (v) => (v > 0 ? 'blue' : v < 0 ? 'rose' : '');

const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么要复用', 'Why multiplex'),
      blocks: [
        { p: T('**复用**：让多个用户共享同一条传输线路，发送端用复用器把几路信号合到一条线路上，接收端用分用器分开。线路越贵、带宽越大，复用越划算。', '**Multiplexing** lets several users share one line: a multiplexer combines, a demultiplexer separates.') },
        {
          table: {
            head: [T('方式', 'Method'), T('怎么分', 'Split by'), T('特点', 'Notes')],
            rows: [
              [T('频分复用 FDM', 'FDM'), T('频率：每个用户占一段频带，所有时间都在用', 'frequency bands, all the time'), T('频带之间要留保护频带；适合模拟信号（广播电台）', 'guard bands; analogue signals')],
              [T('时分复用 TDM', 'TDM'), T('时间：每个用户轮流占用全部频带一小段时间', 'time slots, the whole band'), T('同步时分有空闲时隙浪费；统计时分按需分配', 'idle slots waste; STDM allocates on demand')],
              [T('波分复用 WDM', 'WDM'), T('光的波长（其实就是光的频分复用）', 'wavelengths of light'), T('一根光纤里传多路不同波长的光', 'many wavelengths in one fibre')],
              [T('码分复用 CDMA', 'CDMA'), T('码型：每个用户一个码片序列，同一时间用同一频带', 'chip sequences, same time and band'), T('抗干扰强；用在无线通信', 'robust; used in wireless')],
            ],
          },
        },
      ],
    },
    {
      id: 'tdm',
      title: T('同步时分和统计时分', 'Synchronous and statistical TDM'),
      blocks: [
        { list: [
          T('**同步时分**：时间分成等长的 TDM 帧，每帧里给每个用户固定一个时隙。用户这一轮没数据，时隙也空着，所以利用率可能很低。', '**Synchronous TDM** gives each user a fixed slot in every frame, used or not.'),
          T('**统计时分**（STDM，异步时分）：每帧的时隙数少于用户数，有数据的用户按到达先后装进时隙，时隙里必须带上**用户地址**，接收方才知道是谁的。线路利用率高，数据多时要排队。', '**Statistical TDM** has fewer slots than users and fills them on demand; each slot carries an **address**.'),
        ] },
        { tip: T('集中器常用统计时分；统计时分复用器的输出速率可以小于各输入速率之和。', 'Concentrators use STDM; the output rate can be below the sum of inputs.') },
      ],
    },
    {
      id: 'cdma',
      title: T('码分复用：码片和内积', 'CDMA: chips and inner products'),
      blocks: [
        { p: T('把每个比特时间再分成 m 个**码片**。每个站分配一个唯一的 m 位码片序列 S（常写成 +1 / −1）。发比特 1 就送出 S，发比特 0 就送出 S 的反码 −S，不发就是 0。', 'Each bit time is split into m **chips**. A station sends its sequence S for 1, −S for 0, nothing otherwise.') },
        { list: [
          T('各站的码片序列两两**正交**：规格化内积 S·T = (1/m) Σ SᵢTᵢ = 0，而 S·S = 1，S·(−S) = −1。', 'Sequences are pairwise **orthogonal**: S·T = 0, S·S = 1.'),
          T('信道上各站的信号**逐位相加**。接收方要收站 S 的数据，就用叠加后的信号和 S 做规格化内积：结果 1 表示 S 发了 1，−1 表示发了 0，0 表示 S 没发。', 'Signals **add chip by chip**. The receiver takes the inner product with S: 1, −1 or 0.'),
        ] },
        { formula: T('S·(aS + bT + cU) = a·(S·S) + b·(S·T) + c·(S·U) = a', 'S·(aS + bT + cU) = a') },
        { tip: T('发送的数据率是 b 比特/秒时，实际要发的码片速率是 m·b，所以码分复用需要更宽的频带（扩频）。', 'With m chips per bit the chip rate is m times the bit rate: spread spectrum.') },
      ],
    },
    pit([
      T('码片序列用 ±1 表示时，0 对应 −1；算内积前先把 0、1 写法换成 −1、+1。', 'Write chips as ±1 before taking inner products.'),
      T('规格化内积要除以码片数 m，不除的话结果是 ±m 或 0。', 'Divide by m to normalise.'),
      T('统计时分复用不是「每个用户固定时隙」；同步时分才是。', 'Only synchronous TDM has fixed slots.'),
    ]),
  ],
};

const split = (s) => (Array.isArray(s) ? s : String(s ?? '').split(/[,，;；]/).map((x) => x.trim()).filter(Boolean));
const SPEC = {
  presets: [
    { label: T('码分复用：三个站同时发', 'CDMA: three stations at once'), set: { mode: 'cdma', bits: ['101', '110', '0-1'], target: 1, users: ['ab.c', '..d.', 'e..f', '.g..'], k: 2 } },
    { label: T('码分复用：还原一个没发的站', 'CDMA: a silent station'), set: { mode: 'cdma', bits: ['10', '1-', '01', '--'], target: 4, users: ['ab.c', '..d.', 'e..f', '.g..'], k: 2 } },
    { label: T('时分：同步和统计对比', 'TDM: synchronous vs statistical'), set: { mode: 'tdm', bits: ['101', '110', '0-1'], target: 1, users: ['ab.c', '..d.', 'e..f', '.g..'], k: 2 } },
    { label: T('统计时分：时隙不够要排队', 'STDM: queueing'), set: { mode: 'tdm', bits: ['101', '110', '0-1'], target: 1, users: ['abc.', 'de..', 'fg.h'], k: 1 } },
  ],
  groups: [{ legend: T('复用方式', 'Method'), fields: [
    { name: 'mode', label: T('方式', 'Method'), type: 'select', options: [['cdma', T('码分复用 CDMA', 'CDMA')], ['tdm', T('时分复用（同步 / 统计）', 'TDM (sync / statistical)')]] },
    { name: 'bits', label: T('各站要发的比特（逗号隔开，- 表示这一位不发）', 'Bits per station (comma-separated, - = silent)'), type: 'text', parse: split, wide: true, show: (p) => p.mode === 'cdma' },
    { name: 'target', label: T('接收方要还原第几站', 'Recover station'), type: 'int', min: 1, max: 4, show: (p) => p.mode === 'cdma' },
    { name: 'users', label: T('各用户每一轮的数据（逗号隔开，. 表示这一轮没有）', 'Data per round (comma-separated, . = none)'), type: 'text', parse: split, wide: true, show: (p) => p.mode === 'tdm' },
    { name: 'k', label: T('统计时分每帧的时隙数', 'Slots per STDM frame'), type: 'int', min: 1, max: 4, show: (p) => p.mode === 'tdm' },
  ] }],
  note: T('码分复用：码片序列取 8 阶沃尔什矩阵的第 1～4 行（两两正交），各站比特串一样长，最多 4 位。时分复用：每个用户每轮至多一个数据单元，各用户的轮数一样，最多 8 轮。', 'CDMA: 8-chip Walsh codes; equal-length bit strings, up to 4. TDM: one unit per user per round, up to 8 rounds.'),
};
const ERR = { bits: T('每站写 1～4 位的 0、1、-，2～4 个站', '2–4 stations, 1–4 symbols of 0/1/-'), len: T('各站（各用户）的长度要一样', 'All entries must be the same length'), target: T('要还原的站号超出范围', 'Station out of range'), users: T('2～4 个用户，每个 1～8 轮，用字母和 .', '2–4 users, 1–8 rounds of letters and dots'), k: T('时隙数 1～用户数', 'Slots: 1 to the number of users') };

function cdmaBoard(sim, st, z) {
  const items = [];
  const s = st ? sim.list2[st.k] : null;
  const t = s ? s.t : -1;
  // 左：码片序列和要发的比特
  let h = txt(0, -14, z ? '各站的码片序列' : 'Chip sequences', 'bt-lab', 'start');
  sim.codes.forEach((c, i) => {
    const y = i * 40;
    h += txt(46, y + 21, `S${i + 1}`, 'bt-lab', 'end');
    c.forEach((v, j) => (h += `<g transform="translate(${56 + j * 36} ${y})">${cell(32, 30, sgn(v), { size: 12, tone: toneOf(v), cls: s?.kind === 'decode' && i === sim.target - 1 ? 'hot' : '' })}</g>`));
  });
  const by = sim.n * 40 + 40;
  h += txt(0, by - 14, z ? '各站要发的比特' : 'Bits to send', 'bt-lab', 'start');
  sim.list.forEach((b, i) => {
    const y = by + i * 40;
    h += txt(46, y + 21, `S${i + 1}`, 'bt-lab', 'end');
    b.forEach((x, j) => (h += `<g transform="translate(${56 + j * 40} ${y})">${cell(34, 30, x === '-' ? (z ? '不发' : '—') : x, { size: 13, tone: j === t ? 'amber' : j < t ? 'slate' : '', cls: j === t ? 'hot' : '' })}</g>`));
  });
  items.push({ k: 'left', x: 40, y: 130, html: h });
  // 右：这个比特时间的计算
  let r = '';
  if (s) {
    const tm = sim.times[t];
    r += txt(0, -14, z ? `第 ${t + 1} 个比特时间：各站送出的码片` : `Bit time ${t + 1}: chips sent`, 'bt-lab', 'start');
    tm.tx.forEach((v, i) => {
      const y = i * 40;
      const b = tm.bits[i];
      r += txt(96, y + 21, z ? `S${i + 1} ${b === '1' ? '发 1：S' : b === '0' ? '发 0：−S' : '不发：0'}` : `S${i + 1} ${b === '-' ? 'silent' : b}`, 'bt-cap', 'end');
      v.forEach((x, j) => (r += `<g transform="translate(${106 + j * (CW + 2)} ${y})">${cell(CW, 30, sgn(x), { size: 13, tone: toneOf(x) })}</g>`));
    });
    if (s.kind !== 'send') {
      const y = sim.n * 40 + 20;
      r += txt(96, y + 21, z ? '信道上叠加' : 'Sum on channel', 'bt-lab', 'end');
      tm.sum.forEach((x, j) => (r += `<g transform="translate(${106 + j * (CW + 2)} ${y})">${cell(CW, 34, sgn(x), { size: 14, tone: 'amber', cls: s.kind === 'sum' ? 'hot' : '' })}</g>`));
    }
    if (s.kind === 'decode') {
      const d = tm.decode[sim.target - 1];
      const y = sim.n * 40 + 80;
      r += txt(96, y + 21, z ? `× S${sim.target} 逐位相乘` : `× S${sim.target}`, 'bt-lab', 'end');
      d.prod.forEach((x, j) => (r += `<g transform="translate(${106 + j * (CW + 2)} ${y})">${cell(CW, 34, sgn(x), { size: 14, tone: 'violet', cls: 'hot' })}</g>`));
      r += txt(106, y + 64, z ? `求和 ${d.sum}，÷ ${M} = ${d.v}　→　S${sim.target} ${d.bit === '-' ? '这一位没发' : `发的是 ${d.bit}`}` : `sum ${d.sum} ÷ ${M} = ${d.v} → ${d.bit === '-' ? 'silent' : d.bit}`, 'bt-lab', 'start');
    }
  } else r += txt(0, 0, z ? '（点播放）' : '(press play)', 'bt-idx', 'start');
  items.push({ k: 'right', x: 440, y: 130, html: r });
  return items;
}

function tdmBoard(sim, st, z) {
  const items = [];
  const r = st ? st.r : -1;
  let h = txt(0, -14, z ? '各用户每一轮的数据' : 'Data per round', 'bt-lab', 'start');
  sim.qs.forEach((q, i) => {
    const y = i * 40;
    h += txt(30, y + 21, sim.names[i], 'bt-lab', 'end');
    q.forEach((c, j) => (h += `<g transform="translate(${40 + j * 38} ${y})">${cell(34, 30, c === '.' ? '' : c, { size: 14, tone: j === r ? 'amber' : c === '.' ? '' : j < r ? 'slate' : 'blue', cls: j === r ? 'hot' : '' })}</g>`));
  });
  items.push({ k: 'in', x: 40, y: 130, html: h });
  // 同步时分
  let s = txt(0, -14, z ? `同步时分：每帧 ${sim.n} 个时隙，空的也占着` : `Synchronous: ${sim.n} slots per frame`, 'bt-lab', 'start');
  const fw = sim.n * 40 + 14;
  sim.sync.forEach((f, i) => {
    if (i > r) return;
    const x = (i % 6) * fw;
    const y = Math.floor(i / 6) * 50;
    f.forEach((sl, j) => (s += `<g transform="translate(${x + j * 40} ${y})">${cell(36, 34, sl.d ? `${sl.d}` : '', { size: 13, tone: sl.d ? (i === r ? 'amber' : 'blue') : 'slate' })}</g>`));
    s += txt(x + (sim.n * 40) / 2, y + 48, z ? `帧 ${i + 1}` : `frame ${i + 1}`, 'bt-idx');
  });
  items.push({ k: 'sync', x: 40, y: 130 + sim.n * 40 + 60, html: s });
  // 统计时分
  let t = txt(0, -14, z ? `统计时分：每帧 ${sim.k} 个时隙，按需装，带地址` : `Statistical: ${sim.k} slots, addressed`, 'bt-lab', 'start');
  const gw = sim.k * 52 + 14;
  sim.stat.forEach((f, i) => {
    if (i > r) return;
    const x = (i % 8) * gw;
    const y = Math.floor(i / 8) * 50;
    for (let j = 0; j < sim.k; j++) {
      const sl = f.slots[j];
      t += `<g transform="translate(${x + j * 52} ${y})">${cell(48, 34, sl ? `${sl.u}:${sl.d}` : '', { size: 13, tone: sl ? (i === r ? 'amber' : 'violet') : 'slate' })}</g>`;
    }
    t += txt(x + (sim.k * 52) / 2, y + 48, z ? `帧 ${i + 1}` : `frame ${i + 1}`, 'bt-idx');
  });
  const cur = sim.stat[r];
  if (cur?.waiting.length) t += txt(0, Math.ceil(sim.stat.length / 8) * 50 + 30, z ? `排队等下一帧：${cur.waiting.map((w) => `${w.u}:${w.d}`).join('、')}` : `waiting: ${cur.waiting.map((w) => `${w.u}:${w.d}`).join(', ')}`, 'cw-lab bad l');
  items.push({ k: 'stat', x: 40, y: 130 + sim.n * 40 + 60 + Math.ceil(sim.R / 6) * 50 + 60, html: t });
  return items;
}

function build(p, kit, ERR) {
  const sim = p.mode === 'tdm' ? tdm({ users: split(p.users), k: p.k }) : cdma({ bits: split(p.bits), target: p.target });
  const lesson = shell('mux', kit, ERR, sim, {
    where: W,
    tag: T('复用', 'Mux'),
    name: T('信道复用：时分与码分', 'Multiplexing: TDM and CDMA'),
    full: T('频分、时分、波分、码分 · 同步时分与统计时分 · 码片序列与正交 · 规格化内积 · 扩频', 'FDM, TDM, WDM, CDMA · synchronous vs statistical TDM · chip sequences · inner products'),
    title: SPEC.presets.find((x) => x.set.mode === p.mode && (p.mode === 'tdm' ? split(x.set.users).join() === split(p.users).join() && x.set.k === p.k : split(x.set.bits).join() === split(p.bits).join() && x.set.target === p.target))?.label ?? T('信道复用', 'Multiplexing'),
    legend: p.mode === 'tdm' ? [['amber', T('这一轮', 'This round')], ['slate', T('空时隙', 'Idle slot')], ['violet', T('统计时分的时隙', 'STDM slot')]] : [['blue', '+1'], ['rose', '−1'], ['amber', T('信道上的叠加', 'Channel sum')]],
    principle: PRINCIPLE,
    desc: T('多个用户怎样共用一条线路？码分复用里，几个站在同一时间、同一频带上一起发，接收方用码片序列做内积，就能把某一站的比特单独「捞」出来；时分复用里，对比同步时分的空时隙浪费和统计时分的按需分配。', 'CDMA lets stations send at once and separates them by inner products; TDM compares fixed slots with on-demand slots.'),
    rect: p.mode === 'tdm' ? [20, 90, 860, 560] : [20, 90, 900, 420],
  });
  if (!sim.ok) return lesson;
  if (sim.mode === 'cdma') {
    const list2 = [];
    for (let t = 0; t < sim.T; t++) for (const kind of ['send', 'sum', 'decode']) list2.push({ t, kind });
    sim.list2 = list2;
    const list = list2.map((s, k) => {
      const tm = sim.times[s.t];
      const d = tm.decode[sim.target - 1];
      let x;
      if (s.kind === 'send') x = [T(`第 ${s.t + 1} 位：各站送出码片`, `Bit ${s.t + 1}: stations send chips`), T(`${tm.bits.map((b, i) => `S${i + 1} ${b === '1' ? '发 1，送出自己的码片序列' : b === '0' ? '发 0，送出反码' : '不发'}`).join('；')}。`, tm.bits.map((b, i) => `S${i + 1}: ${b}`).join('; ')), 'cdma'];
      else if (s.kind === 'sum') x = [T('信道上逐位相加', 'They add up on the channel'), T(`各站在同一时间、同一频带上发，信道上看到的是逐位的和：${tm.sum.map(sgn).join(' ')}。单看这一串，看不出谁发了什么。`, `Sum: ${tm.sum.map(sgn).join(' ')}.`), 'cdma'];
      else x = [T(`用 S${sim.target} 做内积：${d.bit === '-' ? '没发' : `是 ${d.bit}`}`, `Inner product with S${sim.target}: ${d.bit}`), T(`把叠加信号和 S${sim.target} 逐位相乘再相加得 ${d.sum}，除以 ${M} 得 ${d.v}。其他站的码片和 S${sim.target} 正交，内积是 0，被「抵消」了，只剩 S${sim.target} 自己的部分。`, `Sum ${d.sum} / ${M} = ${d.v}; the other stations cancel out.`), 'cdma'];
      return { title: x[0], desc: T(`比特时间 ${s.t + 1}`, `bit time ${s.t + 1}`), detail: x[1], ref: x[2], st: { k }, row: { color: s.kind === 'decode' ? 'violet' : 'blue', what: x[0], result: s.kind === 'decode' ? T(`${d.v}`, `${d.v}`) : T('—', '—'), tone: 'info' } };
    });
    const title = T(`S${sim.target} 发的是 ${sim.want}，还原出 ${sim.got}`, `S${sim.target} sent ${sim.want}; recovered ${sim.got}`);
    return finish(lesson, list, (st, z) => cdmaBoard(sim, st, z), title, T('「-」表示那一位没发。各站的码片序列两两正交，所以别的站发什么都不影响还原结果。', 'Orthogonal codes make the other stations cancel.'));
  }
  const rounds = Math.max(sim.R, sim.stat.length);
  const list = Array.from({ length: rounds }, (_, r) => {
    const f = sim.stat[r];
    const syncF = sim.sync[r];
    const used = syncF ? syncF.filter((x) => x.d).length : 0;
    const detail = T(
      `${syncF ? `同步时分：第 ${r + 1} 帧 ${sim.n} 个时隙，有数据的 ${used} 个，空着 ${sim.n - used} 个。` : '同步时分已经发完。'}${f ? `统计时分：这一帧装 ${f.slots.map((x) => `${x.u}:${x.d}`).join('、') || '（没有）'}${f.waiting.length ? `，还有 ${f.waiting.length} 个排队` : ''}。` : '统计时分已经发完。'}`,
      `${syncF ? `Sync frame ${r + 1}: ${used}/${sim.n} slots used.` : ''} ${f ? `STDM: ${f.slots.map((x) => `${x.u}:${x.d}`).join(', ')}.` : ''}`,
    );
    return { title: T(`第 ${r + 1} 轮`, `Round ${r + 1}`), desc: T(f?.waiting.length ? `排队 ${f.waiting.length}` : '—', f?.waiting.length ? `${f.waiting.length} queued` : '—'), detail, ref: 'tdm', st: { r }, row: { color: 'blue', what: T(`第 ${r + 1} 轮`, `Round ${r + 1}`), result: T(`同步 ${used}/${sim.n}`, `sync ${used}/${sim.n}`), tone: 'info' } };
  });
  const title = T(`线路利用率：同步时分 ${(sim.syncUse * 100).toFixed(1)}%，统计时分 ${(sim.statUse * 100).toFixed(1)}%`, `Utilisation: sync ${(sim.syncUse * 100).toFixed(1)}%, statistical ${(sim.statUse * 100).toFixed(1)}%`);
  const text = T(`共 ${sim.units} 个数据单元。同步时分用了 ${sim.R} 帧 × ${sim.n} 个时隙；统计时分用了 ${sim.stat.length} 帧 × ${sim.k} 个时隙（每个时隙还要带地址）。`, `${sim.units} units: sync ${sim.R}×${sim.n} slots, statistical ${sim.stat.length}×${sim.k}.`);
  return finish(lesson, list, (st, z) => tdmBoard(sim, st, z), title, text);
}

export const makeMux = make('mux', SPEC, ERR, build);
