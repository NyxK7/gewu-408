// 「指令流水线与数据冒险」这节课：一拍一拍画出时空图，阻塞的格子是灰色气泡，转发是一条旁路箭头。
import { PIPE_PRINCIPLE, pipeRef } from './co-principles.js';
import { boardKit, res, txt } from '../../core/board.js';
import { chip } from '../../core/steps.js';
import { L, T, esc, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { STAGES, simulate } from './pipe.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const TONE = { IF: 'blue', ID: 'teal', EX: 'amber', MEM: 'violet', WB: 'green' };

const P1 = 'add r1, r2, r3; sub r4, r1, r5; and r6, r1, r7; or r8, r2, r9';
const SPEC = {
  presets: [
    { label: T('相邻相关 · 无转发', 'RAW · no forwarding'), set: { prog: P1, forward: false, splitRF: true } },
    { label: T('同一段 · 有转发', 'Same · forwarding'), set: { prog: P1, forward: true, splitRF: true } },
    { label: T('load-use', 'Load-use'), set: { prog: 'lw r1, 0(r2); add r3, r1, r4; sw r3, 4(r2)', forward: true, splitRF: true } },
    { label: T('综合 5 条 · 无转发', 'Five instrs · no forwarding'), set: { prog: 'lw r2, 0(r1); add r3, r2, r2; sub r4, r3, r1; sw r4, 8(r1); add r5, r1, r1', forward: false, splitRF: true } },
  ],
  groups: [
    {
      legend: T('程序与选项', 'Program and options'),
      fields: [
        { name: 'prog', label: T('指令序列（分号分隔）', 'Instructions (separated by ;)'), type: 'text', wide: true, hint: T('支持 add sub and or xor slt addi andi ori lw sw nop，寄存器写 r0～r31', 'add sub and or xor slt addi andi ori lw sw nop; registers r0–r31') },
        { name: 'forward', label: T('有转发（旁路）', 'Forwarding'), type: 'check' },
        { name: 'splitRF', label: T('寄存器堆前半周期写、后半周期读', 'Register file: write first half, read second half'), type: 'check', wide: true },
      ],
    },
  ],
  note: T(
    '五段流水线 IF ID EX MEM WB，每段一个时钟周期；在 ID 段读寄存器、WB 段写回；指令和数据存储器分开，不考虑结构冒险和分支。阻塞时指令停在 ID，后面的指令停在 IF。有转发时，ALU 结果可从 EX 后直接送给下一条的 EX；load 的数据要到 MEM 后才有，紧随其后的指令仍要阻塞 1 拍。',
    'Five stages IF ID EX MEM WB, one cycle each; registers are read in ID and written in WB; separate instruction and data memories, no branches. A stalled instruction waits in ID and the ones behind it wait in IF. With forwarding an ALU result goes straight from EX to the next EX; load data only exists after MEM, so a dependent instruction right behind still stalls one cycle.',
  ),
};

const ERR = {
  line: T('第 {n} 条指令看不懂：{line}', 'Cannot parse instruction {n}: {line}'),
  count: T('请给出 1～8 条指令', 'Give 1–8 instructions'),
};

// ───────────────────────── 画板：时空图 ─────────────────────────

function geo(sim) {
  const cw = sim.total > 12 ? 40 : 48;
  const rh = 46;
  const x0 = 190;
  const y0 = 150;
  return { cw, rh, x0, y0, X: (c) => x0 + (c - 0.5) * cw, Y: (i) => y0 + i * rh, rect: [10, y0 - 70, x0 + sim.total * cw + 30, y0 + sim.prog.length * rh + 30] };
}

const iname = (i) => `I${i + 1}`;
// 停在 IF（hold）也算占着 IF，停在 ID 等待（stall）也算占着 ID
const inStage = (cell, st) => cell === st || (st === 'IF' && cell === 'hold') || (st === 'ID' && cell === 'stall');
const occupants = (sim, c, st) => sim.cells.map((cells, i) => (inStage(cells[c], st) ? iname(i) : null)).filter(Boolean);

function boardAt(sim, c, z) {
  const g = geo(sim);
  const items = [];
  // 表头：时钟周期
  let head = '';
  for (let k = 1; k <= sim.total; k++) head += txt((k - 0.5) * g.cw, 0, String(k), k === c ? 'bt-now' : 'bt-idx');
  items.push({ k: 'head', x: g.x0, y: g.y0 - 44, html: txt(-14, 0, z ? '周期' : 'cycle', 'bt-cap', 'end') + head });
  sim.prog.forEach((ins, i) => items.push({ k: `lab-${i}`, x: g.x0 - 14, y: g.Y(i) + 4, html: txt(0, 0, `${iname(i)}  ${ins.text}`, 'bt-code', 'end') }));
  // 已经走过的格子
  sim.cells.forEach((cells, i) => {
    for (const [cyc, st] of Object.entries(cells)) {
      const k = Number(cyc);
      if (k > c) continue;
      const stall = st === 'stall' || st === 'hold';
      const label = st === 'stall' ? (z ? '停' : '—') : st === 'hold' ? 'IF' : st;
      items.push({
        k: `c-${i}-${k}`,
        x: g.X(k),
        y: g.Y(i),
        from: [g.X(k), g.Y(i) - 14],
        cls: `${k === c ? 'is-cur' : ''} ${stall ? 'is-bubble' : ''}`,
        html: chip(g.cw - 6, 30, label, { tone: stall ? '' : TONE[st], size: label.length > 2 ? 10 : 11, cls: stall ? 'bubble' : '' }),
      });
    }
  });
  // 转发箭头（到了被转发的那一拍才画）
  sim.rows.forEach((r, i) =>
    r.fwd.forEach((f, j) => {
      if (r.ex > c) return;
      const x1 = g.X(f.at);
      const y1 = g.Y(f.from) + 8;
      const x2 = g.X(r.ex);
      const y2 = g.Y(i) - 12;
      items.push({ k: `fw-${i}-${j}`, x: 0, y: 0, html: `<path class="bfwd" d="M${x1},${y1} C${x1 + 16},${(y1 + y2) / 2} ${x2 - 16},${(y1 + y2) / 2} ${x2},${y2}"/><path class="bfwd-tip" d="M${x2},${y2} l-5,-7 l9,1 z"/>` });
    }),
  );
  items.push({ k: 'col', x: g.X(Math.max(c, 1)), y: g.y0 - 30, o: c >= 1 ? 1 : 0, html: `<rect class="bcol" x="${-g.cw / 2}" y="0" width="${g.cw}" height="${sim.prog.length * g.rh + 10}" rx="6"/>` });
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

function cycleText(sim, c, z) {
  const occ = STAGES.map((st) => {
    const who = occupants(sim, c, st);
    return who.length ? `${st} ${who.join(',')}` : null;
  }).filter(Boolean);
  const parts = [z ? `第 ${c} 拍：${occ.join('，')}。` : `Cycle ${c}: ${occ.join(', ')}. `];
  sim.rows.forEach((r, i) => {
    if (sim.cells[i][c] === 'stall' && r.cause) {
      const p = r.cause;
      const pj = sim.rows[p.from];
      const why = sim.forward ? (z ? `${iname(p.from)}（lw）要到第 ${pj.mem} 拍 MEM 结束才拿到数据` : `${iname(p.from)} (lw) only has the data after MEM in cycle ${pj.mem}`) : z ? `${iname(p.from)} 要到第 ${pj.wb} 拍 WB 才写回 r${p.reg}${sim.splitRF ? '（前半周期写、后半周期读，同一拍就能读到）' : '，下一拍才能读'}` : `${iname(p.from)} writes r${p.reg} back only in cycle ${pj.wb}${sim.splitRF ? ' (written in the first half, readable in the second)' : ', readable a cycle later'}`;
      parts.push(z ? `${iname(i)} 要读 r${p.reg}，但${why}，只能停在 ID 等待（插入气泡）。` : `${iname(i)} needs r${p.reg}, but ${why}, so it waits in ID (a bubble).`);
    }
    if (sim.cells[i][c] === 'hold') parts.push(z ? `${iname(i)} 已经取出，但前一条还占着 ID，只能停在 IF。` : `${iname(i)} has been fetched but the one ahead still holds ID, so it waits in IF.`);
    if (r.ex === c) for (const f of r.fwd) parts.push(z ? `转发：${iname(f.from)} 的 ${f.how === 'mem' ? 'MEM' : 'EX'} 结果经旁路直接送进 ${iname(i)} 的 EX（r${f.reg}），不用等写回。` : `Forwarding: ${iname(f.from)}'s ${f.how === 'mem' ? 'MEM' : 'EX'} result goes straight into ${iname(i)}'s EX (r${f.reg}) without waiting for write-back.`);
    if (r.wb === c && r.ins.dst != null) parts.push(z ? `${iname(i)} 在 WB 写回 r${r.ins.dst}。` : `${iname(i)} writes r${r.ins.dst} back.`);
  });
  return parts.join(z ? '' : ' ');
}

function decode(ev) {
  const { sim, c } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  return {
    label: T('流水线解析', 'Pipeline decoder'),
    tag: { color: 'amber', text: T(`第 ${c} 拍`, `Cycle ${c}`) },
    title: both((z) => (z ? `第 ${c} 个时钟周期` : `Clock cycle ${c}`)),
    meta: [
      [T('转发', 'Forwarding'), sim.forward ? T('有', 'on') : T('无', 'off')],
      [T('寄存器堆', 'Register file'), sim.splitRF ? T('前写后读', 'write/read split') : T('不分', 'no split')],
    ],
    hint: T('这一拍每个段里是哪条指令，以及为什么要停。', 'Which instruction sits in each stage this cycle, and why any wait.'),
    view: { kind: 'none' },
    layers: [
      { name: T('各段', 'Stages'), summary: '', start: 0, end: 0, open: true, fields: STAGES.map((st) => info(st, sim.cells.map((cells, i) => (inStage(cells[c], st) ? `${iname(i)} ${sim.prog[i].text}${cells[c] === 'stall' || cells[c] === 'hold' ? '（等待）' : ''}` : null)).filter(Boolean).join('；') || '—', { tone: TONE[st] })) },
      { name: T('说明', 'What happens'), summary: '', start: 0, end: 0, open: true, fields: [info(T('说明', 'Notes'), both((z) => cycleText(sim, c, z)), { note: true })] },
    ],
  };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok) return '';
  const c = snap?.c ?? 0;
  const z = getLang() === 'zh';
  const show = (k) => (k <= c ? k : '');
  const rows = sim.rows.map((r, i) => ({
    cls: r.stall ? 'm-fault' : '',
    cells: [`<b>${iname(i)}</b>`, esc(r.ins.text), show(r.fetch), show(r.id), show(r.ex), show(r.mem), show(r.wb), r.stall ? `<b>${r.stall}</b>` : '0', r.deps.map((d) => `r${d.reg}←${iname(d.from)}`).join(' ') || '—'],
  }));
  return `<div class="ms ms-wide">${card(T('指令时间表', 'Instruction timing'), T(`共 ${sim.total} 拍，阻塞 ${sim.stalls} 拍`, `${sim.total} cycles, ${sim.stalls} stalls`), table([z ? '指令' : 'Instr', '', 'IF', 'ID', 'EX', 'MEM', 'WB', z ? '阻塞' : 'Stalls', z ? '依赖' : 'Depends'], rows), 'ms-grid is-focus')}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('时钟周期', 'Cycles'),
  stateName: T('指令时间表', 'Timing'),
  emptyRows: T('按「播放」或「单步」，每个时钟周期都会记在这里。', 'Press Play or Step; every clock cycle is logged here.'),
  cols: [
    { label: T('周期', 'Cycle'), cls: 'col-no' },
    ...STAGES.map((s) => ({ label: s, cls: 'col-op' })),
    { label: T('事件', 'Events'), cls: 'col-info' },
  ],
  cells: (ev) => {
    const { sim, c } = ev;
    const z = getLang() === 'zh';
    const at = (st) => occupants(sim, c, st).join(',') || '·';
    const stalls = sim.cells.map((cells, i) => (cells[c] === 'stall' ? iname(i) : null)).filter(Boolean);
    const fw = sim.rows.filter((r) => r.ex === c && r.fwd.length).map((r) => iname(r.i));
    const ev2 = [...(stalls.length ? [res('warn', T(`${stalls.join(',')} 阻塞`, `${stalls.join(',')} stall`))] : []), ...(fw.length ? [res('ok', T(`转发→${fw.join(',')}`, `fwd→${fw.join(',')}`))] : [])];
    return [`<i class="dot"></i>${c}`, ...STAGES.map(at), ev2.join(' ') || (z ? '—' : '—')];
  },
  decode,
  renderState,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const n = sim.ok ? sim.prog.length : 0;
  const lesson = {
    id: 'pipeline',
    kit,
    where: [['co', 'cpu']],
    principle: PIPE_PRINCIPLE,
    tag: T('流水', 'Pipe'),
    name: T('指令流水线与数据冒险', 'Pipelining and data hazards'),
    full: T('五段流水线 · 时空图 · 阻塞 · 转发 · load-use', 'Five stages · space-time diagram · stalls · forwarding · load-use'),
    title: T(`${n} 条指令 · ${params.forward ? '有转发' : '无转发'}`, `${n} instructions · ${params.forward ? 'forwarding' : 'no forwarding'}`),
    badge: params.forward ? T('有转发', 'Forwarding') : T('无转发', 'No forwarding'),
    nodes: [],
    legend: STAGES.map((s) => [TONE[s], s]),
    sim,
    errors: sim.ok ? [] : sim.errors.map(([k, v]) => ({ zh: ERR[k].zh.replace('{n}', v?.n).replace('{line}', v?.line), en: ERR[k].en.replace('{n}', v?.n).replace('{line}', v?.line) })),
    overview: {
      desc: T(
        '流水线让几条指令同时处在不同的段里，理想情况下每拍完成一条。但后一条指令要用前一条的结果时（写后读相关），它可能在 ID 段读到旧值，只好停下来等，或者用转发把结果提前送过去。下面可以改指令序列、开关转发，看时空图怎么变。',
        'A pipeline keeps several instructions in different stages at once, ideally finishing one per cycle. When an instruction needs the result of the one before (read after write), it may have to wait in ID or receive the value early through forwarding. Edit the program or toggle forwarding and watch the space-time diagram change.',
      ),
      facts: sim.ok
        ? [
            [T('指令数', 'Instructions'), String(n)],
            [T('理想周期数', 'Ideal cycles'), both((z) => (z ? `5 + (${n} − 1) = ${sim.ideal}` : `5 + (${n} − 1) = ${sim.ideal}`))],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const boardEv = (c) => ({ type: 'board', items: boardAt(sim, c, true), itemsEn: boardAt(sim, c, false), ms: 420 });
  lesson.start.events = [boardEv(0), { type: 'snap', snap: { c: 0 } }];
  for (let c = 1; c <= sim.total; c++) {
    const stalls = sim.cells.filter((cells) => cells[c] === 'stall').length;
    const fw = sim.rows.some((r) => r.ex === c && r.fwd.length);
    lesson.steps.push({
      title: stalls ? T(`第 ${c} 拍：数据冒险，阻塞`, `Cycle ${c}: data hazard, stall`) : fw ? T(`第 ${c} 拍：转发`, `Cycle ${c}: forwarding`) : T(`第 ${c} 拍`, `Cycle ${c}`),
      desc: both(() => STAGES.map((st) => `${st}:${occupants(sim, c, st).join(',') || '·'}`).join(' ')),
      detail: both((z) => cycleText(sim, c, z)),
      facts: [],
      events: [boardEv(c), { type: 'row', color: stalls ? 'rose' : fw ? 'green' : 'slate', sim, c }, { type: 'snap', snap: { c } }],
    });
  }
  const cpi = sim.total / n;
  lesson.outro = {
    title: T(`共 ${sim.total} 个时钟周期`, `${sim.total} clock cycles`),
    text: both((z) =>
      z
        ? `理想情况下 ${n} 条指令需要 5 + (${n} − 1) = ${sim.ideal} 拍，这里因为数据冒险多阻塞了 ${sim.stalls} 拍，共 ${sim.total} 拍。${sim.forward ? '有转发时，只有 load 后面紧跟着用它的指令（load-use）还要阻塞。' : '试试打开转发：大部分阻塞都会消失，只剩 load-use 那一拍。'}`
        : `Ideally ${n} instructions take 5 + (${n} − 1) = ${sim.ideal} cycles; data hazards add ${sim.stalls} stall cycles here, for ${sim.total} in total. ${sim.forward ? 'With forwarding only a load followed by its user still stalls.' : 'Turn forwarding on: most stalls disappear except the load-use one.'}`,
    ),
    facts: [
      [T('总周期数', 'Total cycles'), String(sim.total)],
      [T('阻塞周期', 'Stall cycles'), String(sim.stalls)],
      [T('理想周期数', 'Ideal'), String(sim.ideal)],
      [T('平均每条指令', 'Cycles per instruction'), both((z) => `${sim.total} ÷ ${n} = ${+cpi.toFixed(2)}`)],
    ],
  };
  lesson.steps.forEach((s, i, all) => (s.ref ??= pipeRef(s, i, all)));
  return lesson;
}

export const makePipe = () => parametric('pipeline', DEFAULTS, build);
