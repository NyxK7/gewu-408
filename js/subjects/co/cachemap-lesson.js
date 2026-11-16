// 「Cache 映射方式与命中率」这节课：主存块号一个个访问，先算组号，再到那一组里找，没找到就调入（满了按 LRU / FIFO 替换）。
import { CACHE_PRINCIPLE, cacheRef } from './co-principles.js';
import { boardKit, frac, res, txt } from '../../core/board.js';
import { chip } from '../../core/steps.js';
import { L, T, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { compare, simulate } from './cachemap.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'];
const toneOf = (b) => TONES[b % 8];
const SEQ = [0, 4, 8, 2, 0, 6, 8, 6, 4, 8];
const MAP = (w, lines) => (w === 1 ? T('直接映射', 'Direct-mapped') : w === 0 || w === lines ? T('全相联', 'Fully associative') : T(`${w} 路组相联`, `${w}-way set associative`));

const SPEC = {
  presets: [
    { label: T('直接映射', 'Direct-mapped'), set: { lines: 4, ways: 1, policy: 'LRU', seq: SEQ } },
    { label: T('2 路组相联', '2-way'), set: { lines: 4, ways: 2, policy: 'LRU', seq: SEQ } },
    { label: T('全相联 · LRU', 'Fully assoc. · LRU'), set: { lines: 4, ways: 0, policy: 'LRU', seq: SEQ } },
    { label: T('全相联 · FIFO', 'Fully assoc. · FIFO'), set: { lines: 4, ways: 0, policy: 'FIFO', seq: SEQ } },
  ],
  groups: [
    {
      legend: T('Cache', 'Cache'),
      fields: [
        { name: 'lines', label: T('Cache 行数', 'Lines'), type: 'select', options: [1, 2, 4, 8, 16].map((n) => [n, String(n)]) },
        { name: 'ways', label: T('映射方式', 'Mapping'), type: 'select', options: [[1, T('直接映射', 'Direct-mapped')], [2, T('2 路组相联', '2-way')], [4, T('4 路组相联', '4-way')], [0, T('全相联', 'Fully associative')]] },
        { name: 'policy', label: T('替换算法', 'Replacement'), type: 'select', options: [['LRU', 'LRU'], ['FIFO', 'FIFO']] },
        { name: 'seq', label: T('访问的主存块号', 'Memory block numbers'), type: 'list', min: 0, max: 9999, maxLen: 30, wide: true, hint: T('题目给的是地址时，先除以块大小取整得到块号', 'If you are given addresses, divide by the block size first') },
      ],
    },
  ],
  note: T(
    '组号 = 主存块号 mod 组数（直接映射时组数 = 行数，全相联只有 1 组）。到这一组的各行里比较标记，有就命中；没有就把块调入，组里有空行先放空行，满了按替换算法换出一行。命中率 = 命中次数 ÷ 访问次数。',
    'Set = block number mod number of sets (direct-mapped: sets = lines; fully associative: one set). Compare the tags in that set; a match is a hit. Otherwise load the block into a free line, or evict one by the replacement policy. Hit rate = hits ÷ accesses.',
  ),
};

const ERR = {
  lines: T('行数要在 1～16 之间', 'Use 1–16 lines'),
  ways: T('相联度要能整除行数', 'Associativity must divide the number of lines'),
  seq: T('访问序列要有 1～30 个块号', 'Give 1–30 block numbers'),
};

// ───────────────────────── 画板 ─────────────────────────

function geo(sim) {
  const N = sim.seq.length;
  const per = N > 15 ? Math.ceil(N / 2) : N;
  const RS = 40;
  const oneRow = sim.sets === 1;
  const cols = oneRow ? sim.W : sim.sets;
  const SX = Math.max(70, Math.min(110, 640 / cols));
  const W = Math.max(per * RS + 140, cols * SX + 160);
  const refX = (i) => W / 2 - ((per - 1) * RS) / 2 + (i % per) * RS;
  const refY = (i) => 110 + (i < per ? 0 : 74);
  const rows = N > per ? 2 : 1;
  const cy0 = 110 + rows * 74 + (oneRow ? 90 : 112);
  const RH = 118;
  const lineXY = (s, w) => (oneRow ? [W / 2 - ((cols - 1) * SX) / 2 + w * SX, cy0] : [W / 2 - ((cols - 1) * SX) / 2 + s * SX, cy0 + w * RH]);
  const bottom = cy0 + (oneRow ? 1 : sim.W) * RH - 20;
  return { W, refX, refY, lineXY, cy0, oneRow, fy: cy0 - (oneRow ? 112 : 134), out: [W - 50, cy0 - 70], rect: [10, 60, W - 10, bottom] };
}

function serials(sim, t) {
  const ser = Array.from({ length: sim.sets }, () => Array(sim.W).fill(null));
  let k = 0;
  for (let i = 0; i <= t; i++) {
    const s = sim.steps[i];
    if (!s.hit) ser[s.set][s.way] = k++;
  }
  return ser;
}

function boardAt(sim, t, z) {
  const g = geo(sim);
  const items = [];
  const s = t >= 0 ? sim.steps[t] : null;
  const cache = s ? s.after : Array.from({ length: sim.sets }, () => Array(sim.W).fill(null));
  items.push({ k: 'lab-seq', x: g.refX(0) - 34, y: g.refY(0) + 4, html: txt(0, 0, z ? '块号' : 'blocks', 'bt-cap', 'end') });
  sim.seq.forEach((b, i) => {
    const done = i <= t;
    const st = done ? sim.steps[i] : null;
    items.push({
      k: `ref-${i}`,
      x: g.refX(i),
      y: g.refY(i) - (i === t ? 10 : 0),
      cls: `${i === t ? 'is-cur' : ''} ${done ? '' : 'is-future'}`,
      html: chip(30, 30, String(b), { tone: !done ? '' : st.hit ? 'green' : 'rose', size: 12 }) + txt(0, -30, String(i + 1), 'bt-idx') + (done ? txt(0, 26, st.hit ? '✓' : '✗', `bt-mark ${st.hit ? 'ok' : 'bad'}`) : ''),
    });
  });
  const ser = serials(sim, t);
  for (let set = 0; set < sim.sets; set++) {
    for (let w = 0; w < sim.W; w++) {
      const [x, y] = g.lineXY(set, w);
      const hot = s && s.set === set;
      const lineNo = set * sim.W + w;
      const lab = g.oneRow || sim.W === 1 ? (z ? `行 ${lineNo}` : `line ${lineNo}`) : z ? `第 ${w} 路` : `way ${w}`;
      items.push({ k: `ln-${set}-${w}`, x, y, cls: hot && s.way === w ? (s.hit ? 'is-hit' : 'is-new') : '', html: chip(64, 64, '', { cls: 'cm-slot' }) + txt(0, 52, lab, `bt-lab ${hot ? 'hot' : ''}`) });
      const c = cache[set][w];
      if (c) items.push({ k: `blk-${ser[set][w]}`, x, y, from: s ? [g.refX(s.t), g.refY(s.t)] : undefined, html: chip(50, 50, String(c.block), { tone: toneOf(c.block), size: 16 }) });
    }
    if (!g.oneRow && sim.W > 1) {
      const [x, y] = g.lineXY(set, 0);
      items.push({ k: `set-${set}`, x, y: y - 58, cls: s?.set === set ? 'is-cur' : '', html: txt(0, 0, z ? `第 ${set} 组` : `set ${set}`, 'bt-cap') });
    }
  }
  if (s && !s.hit && s.victim != null) {
    const prev = serials(sim, t - 1);
    items.push({ k: `blk-${prev[s.set][s.way]}`, x: g.out[0], y: g.out[1], o: 0, html: chip(50, 50, String(s.victim), { tone: toneOf(s.victim), size: 16 }) });
  }
  if (s) items.push({ k: 'formula', x: 30, y: g.fy, html: txt(0, 0, sim.sets === 1 ? (z ? `全相联：块 ${s.block} 可以放进任何一行` : `fully associative: block ${s.block} may go anywhere`) : z ? `组号 = ${s.block} mod ${sim.sets} = ${s.set}` : `set = ${s.block} mod ${sim.sets} = ${s.set}`, 'bt-formula cur', 'start') });
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

function why(sim, s, z) {
  const where = sim.sets === 1 ? (z ? '全相联只有一组，所有行都要比较。' : 'Fully associative: one set, every line is checked. ') : z ? `组号 = ${s.block} mod ${sim.sets} = ${s.set}，只在第 ${s.set} 组的 ${sim.W} 行里找。` : `Set = ${s.block} mod ${sim.sets} = ${s.set}; only its ${sim.W} line(s) are checked. `;
  if (s.hit) return where + (z ? `第 ${s.way} 路里正是块 ${s.block}，命中。${sim.policy === 'LRU' ? `记下它最近一次被访问是第 ${s.t + 1} 次。` : 'FIFO 不因命中而改变顺序。'}` : `Way ${s.way} holds block ${s.block}: a hit.${sim.policy === 'LRU' ? ` Its last use becomes access ${s.t + 1}.` : ' FIFO order does not change on a hit.'}`);
  const head = z ? `组里没有块 ${s.block}，缺失。` : `Block ${s.block} is not there: a miss. `;
  if (s.victim == null) return where + head + (z ? `这一组还有空行，放进第 ${s.way} 路。` : `A free line is available: way ${s.way}.`);
  if (sim.W === 1) return where + head + (z ? `直接映射没有选择余地，块 ${s.victim} 被换出。` : `Direct mapping leaves no choice: block ${s.victim} is evicted.`);
  const key = sim.policy === 'LRU' ? 'lastUse' : 'loadedAt';
  const list = s.before.map((c, w) => `${c.block}（${sim.policy === 'LRU' ? (z ? '最近' : 'last') : z ? '装入' : 'in'} ${c[key] + 1}）`);
  return where + head + (z ? `这一组满了：${list.join('、')}，按 ${sim.policy} 换出块 ${s.victim}。` : `The set is full: ${list.join(', ')}; ${sim.policy} evicts block ${s.victim}.`);
}

function decode(ev) {
  const { sim, s } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  return {
    label: T('Cache 访问解析', 'Cache access decoder'),
    tag: { color: s.hit ? 'green' : 'rose', text: s.hit ? T('命中', 'Hit') : T('缺失', 'Miss') },
    title: both((z) => (z ? `第 ${s.t + 1} 次访问 · 块 ${s.block}` : `Access ${s.t + 1} · block ${s.block}`)),
    meta: [[T('映射', 'Mapping'), L(MAP(sim.W === sim.lines ? 0 : sim.W, sim.lines))], [T('组号', 'Set'), String(s.set)]],
    hint: '',
    view: { kind: 'none' },
    layers: [
      { name: T('访问前这一组', 'Set before'), summary: '', start: 0, end: 0, open: true, fields: s.before.map((c, w) => info(T(`第 ${w} 路`, `Way ${w}`), c ? T(`块 ${c.block} · 装入 ${c.loadedAt + 1} · 最近 ${c.lastUse + 1}`, `block ${c.block} · in ${c.loadedAt + 1} · last ${c.lastUse + 1}`) : T('空', 'empty'), { tone: w === s.way ? (s.hit ? 'green' : 'rose') : null })) },
      { name: T('判断', 'Decision'), summary: '', start: 0, end: 0, open: true, fields: [info(T('理由', 'Why'), both((z) => why(sim, s, z)), { note: true })] },
    ],
  };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok) return '';
  const t = snap?.t ?? -1;
  const z = getLang() === 'zh';
  const head = ['', ...sim.seq.map((_, i) => `${i + 1}`)];
  const cell = (i, v) => (i <= t ? `<span class="${i === t ? 'is-cur' : ''}">${v}</span>` : '');
  const rows = [{ cls: 'row-ref', cells: [z ? '块号' : 'block', ...sim.seq.map((b, i) => cell(i, b))] }];
  for (let set = 0; set < sim.sets; set++)
    for (let w = 0; w < sim.W; w++) rows.push({ cells: [sim.W === 1 || sim.sets === 1 ? (z ? `行 ${set * sim.W + w}` : `L${set * sim.W + w}`) : `${set}-${w}`, ...sim.steps.map((s, i) => cell(i, s.after[set][w]?.block ?? ''))] });
  rows.push({ cls: 'row-fault', cells: [z ? '命中' : 'hit', ...sim.steps.map((s, i) => cell(i, s.hit ? '✓' : ''))] });
  const done = sim.steps.slice(0, t + 1);
  const h = done.filter((s) => s.hit).length;
  return `<div class="ms ms-wide">${card(T('统计', 'Tally'), MAP(sim.W === sim.lines ? 0 : sim.W, sim.lines), `<dl class="ms-kv"><div><dt>${z ? '已访问' : 'Accesses'}</dt><dd>${done.length} / ${sim.seq.length}</dd></div><div><dt>${z ? '命中' : 'Hits'}</dt><dd>${h}</dd></div><div><dt>${z ? '命中率' : 'Hit rate'}</dt><dd>${done.length ? frac(h, done.length) : '—'}</dd></div></dl>`, 'ms-regs')}${card(T('Cache 内容表', 'Cache contents'), T('列 = 第几次访问', 'columns = accesses'), table(head, rows), 'ms-grid is-focus')}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('访问记录', 'Accesses'),
  stateName: T('内容表', 'Table'),
  emptyRows: T('按「播放」或「单步」，每次访问会记在这里。', 'Press Play or Step; each access is logged here.'),
  cols: [
    { label: '#', cls: 'col-no' },
    { label: T('块号', 'Block'), cls: 'col-op' },
    { label: T('组号', 'Set'), cls: 'col-op' },
    { label: T('结果', 'Result'), cls: 'col-res' },
    { label: T('换出', 'Evicted'), cls: 'col-info' },
  ],
  cells: (ev) => {
    const s = ev.s;
    return [`<i class="dot"></i>${s.t + 1}`, String(s.block), String(s.set), s.hit ? res('ok', T('命中', 'Hit')) : res('warn', T('缺失', 'Miss')), s.victim == null ? '—' : String(s.victim)];
  },
  decode,
  renderState,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'cache-map',
    kit,
    where: [['co', 'memory']],
    principle: CACHE_PRINCIPLE,
    tag: 'Map',
    name: T('Cache 映射与命中率', 'Cache mapping and hit rate'),
    full: T('直接映射 · 组相联 · 全相联 · LRU / FIFO', 'Direct · set associative · fully associative · LRU / FIFO'),
    title: T(`${params.lines} 行 · ${MAP(params.ways, params.lines).zh} · ${params.policy}`, `${params.lines} lines · ${MAP(params.ways, params.lines).en} · ${params.policy}`),
    badge: MAP(params.ways, params.lines),
    nodes: [],
    legend: [
      ['green', T('命中', 'Hit')],
      ['rose', T('缺失', 'Miss')],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '同一串主存块的访问，换一种映射方式，命中率可能差很多：直接映射时几个块抢同一行会反复冲突，全相联则只要 Cache 装得下就不冲突。下面可以改行数、映射方式、替换算法和访问序列，逐次看命中还是缺失。',
        'The same access sequence can hit very differently under different mappings: in a direct-mapped cache blocks fight over one line, while a fully associative cache only misses when it is full. Change lines, mapping, policy and sequence, and watch each access.',
      ),
      facts: sim.ok
        ? [
            [T('组数', 'Sets'), both((z) => (z ? `${sim.lines} 行 ÷ ${sim.W} 路 = ${sim.sets} 组` : `${sim.lines} lines ÷ ${sim.W} ways = ${sim.sets} sets`))],
            [T('组号', 'Set index'), sim.sets === 1 ? T('全相联不分组', 'no sets') : `block mod ${sim.sets}`],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const g = geo(sim);
  const boardEv = (t) => ({ type: 'board', items: boardAt(sim, t, true), itemsEn: boardAt(sim, t, false) });
  lesson.start.events = [boardEv(-1), { type: 'snap', snap: { t: -1 } }];
  lesson.steps = sim.steps.map((s) => {
    const [x, y] = g.lineXY(s.set, s.way);
    return {
      title: s.hit ? T(`访问块 ${s.block}：命中`, `Block ${s.block}: hit`) : s.victim == null ? T(`访问块 ${s.block}：缺失，调入`, `Block ${s.block}: miss, load`) : T(`访问块 ${s.block}：缺失，换出 ${s.victim}`, `Block ${s.block}: miss, evict ${s.victim}`),
      desc: sim.sets === 1 ? T('全相联', 'Fully associative') : T(`组号 ${s.set}`, `Set ${s.set}`),
      detail: both((z) => why(sim, s, z)),
      facts: [
        [T('块号', 'Block'), String(s.block)],
        [T('组号', 'Set'), String(s.set)],
        [T('累计命中', 'Hits so far'), `${s.hits} / ${s.t + 1}`],
      ],
      // 组相联时几路上下叠着，气泡放在这一组的最上方，免得压住上面那一路
      events: [boardEv(s.t), { type: 'note', at: [x, g.oneRow ? y - 70 : g.cy0 - 96], text: s.hit ? T('命中', 'Hit') : s.victim == null ? T('缺失 · 调入', 'Miss · load') : T(`缺失 · 换出 ${s.victim}`, `Miss · evict ${s.victim}`), tone: s.hit ? 'ok' : 'warn' }, { type: 'row', color: s.hit ? 'green' : 'rose', sim, s }, { type: 'snap', snap: { t: s.t } }],
    };
  });
  const cmp = compare(params);
  lesson.outro = {
    title: T(`命中率 ${frac(sim.hits, sim.seq.length)}`, `Hit rate ${frac(sim.hits, sim.seq.length)}`),
    text: T('同一个序列在其他映射方式下的命中次数也列在下面。相联度越高冲突越少，但每次要比较的标记也越多，硬件更贵、更慢。', 'The hit counts of the same sequence under other mappings are listed below. Higher associativity means fewer conflicts but more tag comparisons, costing hardware and time.'),
    facts: [
      [T('命中 / 访问', 'Hits / accesses'), `${sim.hits} / ${sim.seq.length}`],
      ...cmp.map((c) => [MAP(c.ways, sim.lines), both((z) => (z ? `命中 ${c.hits} 次（${frac(c.hits, sim.seq.length)}）` : `${c.hits} hits (${frac(c.hits, sim.seq.length)})`))]),
    ],
  };
  lesson.steps.forEach((s, i, all) => (s.ref ??= cacheRef(s, i, all)));
  return lesson;
}

export const makeCacheMap = () => parametric('cache-map', DEFAULTS, build);
