// 「总线事务与定时」：横轴是时间，每一行是一根（一组）信号线。同步方式画出时钟和每个周期送什么；
// 异步方式画出「请求」和「回答」两根握手线，箭头标出谁看到了谁才动作。竖线是这一步的时刻。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow } from '../../core/steps.js';
import { finish, make, pit, shell } from './kit.js';
import { WIDTH, busTiming } from './bustime.js';

const W = [['co', 'bus']];
const X0 = 160;
const XW = 760;
const Y0 = 150;
const RH = 64;

const PRINCIPLE = {
  sections: [
    {
      id: 'txn',
      title: T('总线事务', 'Bus transactions'),
      blocks: [
        { p: T('一次完整的总线操作叫一个**总线事务**（总线周期），一般分四个阶段：', 'A complete bus operation — a **bus transaction** — has four phases:') },
        { steps: [
          T('**申请分配**：主设备申请总线，仲裁后获得使用权；', '**Arbitration**: the master obtains the bus;'),
          T('**寻址**：主设备送出从设备的地址和读 / 写命令；', '**Addressing**: the master sends the address and command;'),
          T('**传输**：主、从设备之间交换数据（读：从 → 主；写：主 → 从）；', '**Transfer**: data moves between master and slave;'),
          T('**结束**：主设备撤掉信息，让出总线。', '**Release**: the master gives up the bus.'),
        ] },
        { tip: T('**突发传送**（猝发）：送一次首地址，后面连续传多个字，地址自动加 1，省掉每个字都送地址的时间。', '**Burst**: one address, many consecutive words.') },
      ],
    },
    {
      id: 'sync',
      title: T('同步定时', 'Synchronous timing'),
      blocks: [
        { p: T('所有设备由统一的时钟控制，每个动作在规定的时钟周期里完成。', 'A common clock times every action.') },
        { list: [
          T('优点：控制简单，速度快。', 'Simple and fast.'),
          T('缺点：时钟按最慢的设备设计，快设备也得等；总线不能太长（时钟偏移）；从设备来不及时只能插入等待周期。', 'The clock must suit the slowest device; long buses suffer skew; slow slaves add wait states.'),
        ] },
        { formula: T('一次读 = (1 个地址周期 + 等待周期 + n 个数据周期) × 时钟周期', 'read time = (1 + waits + n) × clock period') },
      ],
    },
    {
      id: 'async',
      title: T('异步定时：三种握手', 'Asynchronous handshakes'),
      blocks: [
        { p: T('没有统一时钟，主设备的「请求」信号和从设备的「回答」信号互相等待（握手），快慢设备都能接。', 'No common clock: **request** and **acknowledge** signals wait for each other.') },
        {
          table: {
            head: [T('方式', 'Kind'), T('请求怎么撤', 'Request drops'), T('回答怎么撤', 'Ack drops'), T('特点', 'Notes')],
            rows: [
              [T('不互锁', 'Non-interlocked'), T('保持一段时间后自己撤', 'after a fixed time'), T('保持一段时间后自己撤', 'after a fixed time'), T('最快，但不保证对方收到', 'fastest, unreliable')],
              [T('半互锁', 'Half-interlocked'), T('**收到回答后**才撤', '**after seeing ack**'), T('保持一段时间后自己撤', 'after a fixed time'), T('请求一定被收到；回答撤得太早主设备可能没看到', 'request guaranteed')],
              [T('全互锁', 'Fully interlocked'), T('**收到回答后**才撤', '**after seeing ack**'), T('**看到请求撤了**才撤', '**after seeing request drop**'), T('最可靠，速度最慢（每个字 4 次传播延迟）', 'most reliable, slowest')],
            ],
          },
        },
        { tip: T('**半同步**：同步时钟下增加一个「等待」信号，从设备没准备好就插入等待周期；**分离式**：读命令发出后让出总线，从设备准备好数据再申请总线送回，提高总线利用率。', '**Semi-synchronous** adds a wait signal; **split** transactions release the bus while the slave prepares data.') },
      ],
    },
    pit([
      T('同步总线的数据传输率 = 每周期传的字节数 ÷ 周期，但一次事务还要算上地址周期和等待周期。', 'Remember address and wait cycles in transaction time.'),
      T('全互锁一个字要经过 4 次信号传播（请求↑、回答↑、请求↓、回答↓）。', 'Full handshake: four propagation delays per word.'),
      T('异步不是「没有定时」，而是用握手信号代替公共时钟。', 'Asynchronous means handshakes instead of a clock.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('同步：等 1 个周期，读 2 个字', 'Synchronous: 1 wait, 2 words'), set: { mode: 'sync', n: 2, T: 10, w: 1, d: 5, a: 20, h: 15 } },
    { label: T('同步突发：读 4 个字', 'Synchronous burst: 4 words'), set: { mode: 'sync', n: 4, T: 10, w: 2, d: 5, a: 20, h: 15 } },
    { label: T('异步全互锁：读 2 个字', 'Fully interlocked: 2 words'), set: { mode: 'full', n: 2, T: 10, w: 1, d: 5, a: 20, h: 15 } },
    { label: T('异步半互锁：读 2 个字', 'Half-interlocked: 2 words'), set: { mode: 'half', n: 2, T: 10, w: 1, d: 5, a: 20, h: 15 } },
  ],
  groups: [{ legend: T('读事务', 'Read transaction'), fields: [
    { name: 'mode', label: T('定时方式', 'Timing'), type: 'select', options: [['sync', T('同步', 'Synchronous')], ['full', T('异步全互锁', 'Async, fully interlocked')], ['half', T('异步半互锁', 'Async, half-interlocked')]] },
    { name: 'n', label: T('读几个字（32 位）', 'Words (32-bit)'), type: 'int', min: 1, max: 4 },
    { name: 'T', label: T('时钟周期 T（ns）', 'Clock period T (ns)'), type: 'int', min: 1, max: 100, show: (p) => p.mode === 'sync' },
    { name: 'w', label: T('等待周期数', 'Wait cycles'), type: 'int', min: 0, max: 4, show: (p) => p.mode === 'sync' },
    { name: 'd', label: T('信号传播延迟 d（ns）', 'Propagation delay d (ns)'), type: 'int', min: 1, max: 50, show: (p) => p.mode !== 'sync' },
    { name: 'a', label: T('从设备取数时间 a（ns）', 'Slave access time a (ns)'), type: 'int', min: 0, max: 200, show: (p) => p.mode !== 'sync' },
    { name: 'h', label: T('半互锁时回答保持时间 h（ns）', 'Ack hold time h (ns)'), type: 'int', min: 1, max: 200, show: (p) => p.mode === 'half' },
  ] }],
  note: T('同步：第 1 周期送地址，等 w 个周期，之后每周期一个字。异步：请求、回答各经过传播延迟 d 才被对方看到；从设备看到请求后要 a 才能送出数据。', 'Sync: address cycle, w waits, one word per cycle. Async: each signal takes d to be seen; the slave needs a to supply data.'),
};
const ERR = { mode: T('方式不对', 'Unknown'), n: T('1～4 个字', '1–4 words'), T: T('时钟周期 1～100', 'Period 1–100'), w: T('等待周期 0～4', 'Waits 0–4'), d: T('延迟 1～50', 'Delay 1–50'), a: T('取数时间 0～200', 'Access 0–200'), h: T('保持时间 1～200', 'Hold 1–200') };

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const ev = k >= 0 ? sim.events[k] : null;
  const now = ev ? ev.t : 0;
  const sc = XW / sim.total;
  const X = (t) => X0 + t * sc;
  const rows = sim.mode === 'sync'
    ? [['CLK', T('时钟', 'Clock')], ['ADDR', T('地址线', 'Address')], ['RD', T('读命令', 'Read')], ['DATA', T('数据线', 'Data')]]
    : [['ADDR', T('地址线', 'Address')], ['RD', T('读命令', 'Read')], ['READY', T('请求（主）', 'Request (master)')], ['ACK', T('回答（从）', 'Ack (slave)')], ['DATA', T('数据线', 'Data')]];
  let h = '';
  const yOf = (name) => Y0 + rows.findIndex((r) => r[0] === name) * RH;
  rows.forEach(([name, lab], i) => {
    const y = Y0 + i * RH;
    h += txt(X0 - 14, y + 22, z ? lab.zh : lab.en, 'bt-lab', 'end');
    const segs = sim.sig[name];
    const upto = ev ? now + (ev.kind === 'data' ? sim.T : 0) : 0;
    if (name === 'ADDR' || name === 'DATA') {
      for (const s of segs) {
        if (s.from > upto && ev?.kind !== 'end') continue;
        const x1 = X(s.from);
        const x2 = X(Math.min(s.to, ev?.kind === 'end' ? s.to : Math.max(upto, s.from)));
        if (x2 - x1 < 1) continue;
        h += `<g class="barw"><path d="M${x1},${y + 18} L${x1 + 6},${y + 4} L${x2 - 6},${y + 4} L${x2},${y + 18} L${x2 - 6},${y + 32} L${x1 + 6},${y + 32} Z" style="fill:var(--c-${name === 'ADDR' ? 'violet' : 'blue'});fill-opacity:.18;stroke:var(--c-${name === 'ADDR' ? 'violet' : 'blue'})"/></g>`;
        h += txt((x1 + x2) / 2, y + 22, s.label, 'bt-cap');
      }
    } else {
      const end = ev?.kind === 'end' ? sim.total : upto;
      // 由高电平段拼出折线
      let pts = `${X(0)},${y + 32}`;
      for (const s of segs) {
        if (s.v !== 1 || s.from >= end) continue;
        const to = Math.min(s.to, end);
        pts += ` ${X(s.from)},${y + 32} ${X(s.from)},${y + 6} ${X(to)},${y + 6} ${X(to)},${y + 32}`;
      }
      pts += ` ${X(end)},${y + 32}`;
      h += `<g class="barw ${name === 'READY' ? 'acc' : name === 'ACK' ? 'ok' : ''}"><polyline points="${pts}" fill="none" style="stroke:currentColor"/></g>`;
      h += `<polyline points="${pts}" fill="none" stroke="var(--${name === 'READY' ? 'accent' : name === 'ACK' ? 'ok' : 'ink-2'})" stroke-width="2"/>`;
    }
  });
  // 时间轴
  const axY = Y0 + rows.length * RH + 10;
  h += `<g class="barw"><line x1="${X0}" y1="${axY}" x2="${X0 + XW}" y2="${axY}"/></g>`;
  const tick = sim.mode === 'sync' ? sim.T : sim.d;
  for (let t = 0; t <= sim.total + 0.001; t += tick) h += txt(X(t), axY + 18, String(t), 'bt-idx');
  h += txt(X0 + XW + 10, axY + 18, 'ns', 'bt-idx', 'start');
  // 握手的因果箭头
  if (sim.mode !== 'sync' && ev) {
    for (let i = 0; i < sim.n; i++) {
      const e = sim.events.filter((x) => x.i === i);
      const pairs = sim.mode === 'full' ? [['ready', 'READY', 'ack', 'ACK'], ['ack', 'ACK', 'readyDown', 'READY'], ['readyDown', 'READY', 'ackDown', 'ACK']] : [['ready', 'READY', 'ack', 'ACK'], ['ack', 'ACK', 'readyDown', 'READY']];
      for (const [a, ra, b, rb] of pairs) {
        const ea = e.find((x) => x.kind === a);
        const eb = e.find((x) => x.kind === b);
        if (!ea || !eb || eb.t > now) continue;
        const ya = yOf(ra) + (a === 'readyDown' || a === 'ackDown' ? 32 : 6);
        const yb = yOf(rb) + (b === 'readyDown' || b === 'ackDown' ? 32 : 6);
        h += arrow(X(ea.t) + 2, ya, X(eb.t) - 2, yb, 'dim');
      }
    }
  }
  // 当前时刻
  if (ev) h += `<g class="barw acc dash"><line x1="${X(now)}" y1="${Y0 - 10}" x2="${X(now)}" y2="${axY}"/></g>` + txt(X(now), Y0 - 16, `t = ${now} ns`, 'cw-lab acc');
  items.push({ k: 'wave', x: 0, y: 0, html: h });
  return items;
}

function build(p, kit, ERR) {
  const sim = busTiming(p);
  const lesson = shell('bus-timing', kit, ERR, sim, {
    where: W,
    tag: T('定时', 'Timing'),
    name: T('总线事务与定时', 'Bus transactions and timing'),
    full: T('总线事务的四个阶段 · 突发传送 · 同步定时与等待周期 · 异步握手：不互锁、半互锁、全互锁 · 半同步与分离式', 'Transaction phases · bursts · synchronous timing and waits · asynchronous handshakes · semi-synchronous and split'),
    title: SPEC.presets.find((x) => x.set.mode === p.mode && x.set.n === p.n && x.set.w === p.w)?.label ?? T('总线读事务', 'A bus read'),
    legend: [['violet', T('地址', 'Address')], ['blue', T('数据', 'Data')]],
    principle: PRINCIPLE,
    desc: T('主设备从从设备读几个字。同步方式下一切跟着时钟走：送地址、等待、每周期一个字；异步方式没有时钟，靠「请求」和「回答」两根线握手——看全互锁怎样每一步都等对方的信号，半互锁又省掉了哪一步。', 'Read a few words over the bus: synchronously by the clock, or asynchronously by request/acknowledge handshakes.'),
    rect: [0, 100, 980, 120 + (p.mode === 'sync' ? 4 : 5) * RH + 60],
  });
  if (!sim.ok) return lesson;
  const list = sim.events.map((e, k) => {
    let d;
    if (e.kind === 'addr') d = [T('第 1 个周期：送地址和读命令', 'Cycle 1: address and read'), T(`主设备把从设备的地址放上地址线，读命令置为有效。这一个周期 ${sim.T} ns。`, `Address and read command; one ${sim.T} ns cycle.`), 'sync'];
    else if (e.kind === 'wait') d = [T(`第 ${e.c + 1} 个周期：等待`, `Cycle ${e.c + 1}: wait`), T('从设备还没准备好数据，插入一个等待周期，数据线上没有有效数据。', 'The slave is not ready: a wait state.'), 'sync'];
    else if (e.kind === 'data') d = [T(`第 ${e.c + 1} 个周期：送第 ${e.i + 1} 个字`, `Cycle ${e.c + 1}: word ${e.i + 1}`), T(`从设备把第 ${e.i + 1} 个字放上数据线，主设备在 ${e.latch} ns 的时钟沿把它锁存。${e.i ? '突发传送：不用再送地址。' : ''}`, `Word ${e.i + 1}, latched at ${e.latch} ns.`), e.i ? 'txn' : 'sync'];
    else if (e.kind === 'ready') d = [T(`请求↑（第 ${e.i + 1} 个字）`, `Request ↑ (word ${e.i + 1})`), T(`主设备送出地址和读命令，把请求线拉高。从设备要过 d = ${sim.d} ns 才看得到。`, `The master raises request; the slave sees it after ${sim.d} ns.`), 'async'];
    else if (e.kind === 'ack') d = [T('回答↑：数据送上总线', 'Ack ↑: data on the bus'), T(`从设备看到请求（${e.t - sim.a} ns），用 a = ${sim.a} ns 取出数据放上数据线，再把回答线拉高。`, `The slave supplies data after ${sim.a} ns and raises ack.`), 'async'];
    else if (e.kind === 'readyDown') d = [T('主设备看到回答：锁存数据，请求↓', 'Master sees ack: latch, request ↓'), T(`又过 d 主设备看到回答，锁存数据，撤掉请求。${sim.mode === 'half' ? '半互锁：主设备到这里就可以开始下一个字了。' : ''}`, `The master latches and drops request.${sim.mode === 'half' ? ' Half-interlocked: the next word may start.' : ''}`), 'async'];
    else if (e.kind === 'ackDown') d = sim.mode === 'full' ? [T('从设备看到请求撤了：回答↓', 'Slave sees request drop: ack ↓'), T(`全互锁：从设备一定要等看到请求撤掉，才撤数据和回答。主设备再过 d 看到回答撤了，才能发下一个请求。每个字 a + 4d = ${sim.perWord} ns。`, `Full handshake: ${sim.perWord} ns per word.`), 'async'] : [T(`回答保持 ${sim.h} ns 后自己撤掉`, `Ack drops after ${sim.h} ns`), T(`半互锁：从设备不看请求，回答保持 h = ${sim.h} ns 就撤。${sim.missed ? 'h 比传播延迟还短，主设备可能根本没看到回答！' : '只要 h 足够长，主设备就来得及看到。'}`, `Half-interlocked: ack is held for ${sim.h} ns.`), 'async'];
    else d = [T(`读完 ${sim.n} 个字，共 ${sim.total} ns`, `${sim.n} words in ${sim.total} ns`), T(`传了 ${sim.n} × ${WIDTH} = ${sim.n * WIDTH} 字节，用了 ${sim.total} ns，数据传输率 ${sim.bwMB.toFixed(1)} MB/s。`, `${sim.n * WIDTH} bytes in ${sim.total} ns: ${sim.bwMB.toFixed(1)} MB/s.`), sim.mode === 'sync' ? 'sync' : 'async'];
    return { title: d[0], desc: T(`t = ${e.t} ns`, `t = ${e.t} ns`), detail: d[1], ref: d[2], st: { k }, row: { color: e.kind === 'ack' || e.kind === 'data' ? 'blue' : 'violet', what: d[0], result: T(`${e.t} ns`, `${e.t} ns`), tone: 'info' } };
  });
  const title = T(`${sim.total} ns 读完 ${sim.n} 个字，${sim.bwMB.toFixed(1)} MB/s`, `${sim.n} words in ${sim.total} ns: ${sim.bwMB.toFixed(1)} MB/s`);
  const text = sim.mode === 'sync' ? T(`(1 + ${sim.w} + ${sim.n}) × ${sim.T} = ${sim.total} ns。`, `(1 + ${sim.w} + ${sim.n}) × ${sim.T} = ${sim.total} ns.`) : T(`${sim.mode === 'full' ? '全互锁' : '半互锁'}每个字约 ${sim.perWord} ns（a = ${sim.a}，d = ${sim.d}）。`, `About ${sim.perWord} ns per word.`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeBusTiming = make('bus-timing', SPEC, ERR, build);
