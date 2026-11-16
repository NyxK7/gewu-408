// 「散列表」这节课：关键字一个个落进表里，冲突时沿探测序列跳格子（拉链法则挂在链上），最后算 ASL。
import { HASH_PRINCIPLE, hashRef } from './ds-principles.js';
import { boardKit, frac, line, res, txt } from '../../core/board.js';
import { chip, node } from '../../core/steps.js';
import { L, T, getLang } from '../../core/i18n.js';
import { card, parametric, table } from '../../core/params.js';
import { METHODS, quadInc, simulate } from './hash.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const NAME = { linear: T('线性探测法', 'Linear probing'), quad: T('平方探测法', 'Quadratic probing'), chain: T('拉链法', 'Separate chaining') };

const SPEC = {
  presets: [
    { label: T('线性探测 · H = 3k mod 7', 'Linear · H = 3k mod 7'), set: { keys: [7, 8, 30, 11, 18, 9, 14], m: 10, p: 7, a: 3, method: 'linear' } },
    { label: T('拉链法 · H = k mod 13', 'Chaining · H = k mod 13'), set: { keys: [19, 14, 23, 1, 68, 20, 84, 27, 55, 11, 10, 79], m: 13, p: 13, a: 1, method: 'chain' } },
    { label: T('平方探测 · H = k mod 11', 'Quadratic · H = k mod 11'), set: { keys: [19, 1, 23, 14, 55, 68], m: 11, p: 11, a: 1, method: 'quad' } },
  ],
  groups: [
    {
      legend: T('散列函数 H(key) = (a × key) mod p', 'Hash H(key) = (a × key) mod p'),
      fields: [
        { name: 'method', label: T('冲突处理', 'Collisions'), type: 'select', options: METHODS.map((m) => [m, NAME[m]]), wide: true },
        { name: 'a', label: T('乘数 a', 'Multiplier a'), type: 'int', min: 1, max: 99 },
        { name: 'p', label: T('模 p', 'Modulus p'), type: 'int', min: 1, max: 20 },
        { name: 'm', label: T('表长 m', 'Table size m'), type: 'int', min: 2, max: 20 },
        { name: 'keys', label: T('关键字（按插入顺序）', 'Keys (insertion order)'), type: 'list', min: 0, max: 9999, maxLen: 15, wide: true },
      ],
    },
  ],
  note: T(
    '开放定址法在表长 m 内循环探测；平方探测的增量为 0, +1², −1², +2², −2², …。查找成功的比较次数等于插入时的探测次数。查找失败：分别从 H = 0 … p−1 出发探测到空位置为止，和空位置的比较也算一次，ASL失败 = 总和 ÷ p。拉链法新关键字接在链尾，查找失败只数和关键字的比较。',
    'Open addressing wraps around the table size m; quadratic increments are 0, +1², −1², +2², −2², …. A successful search costs as many probes as the insertion did. For an unsuccessful search, start from each H = 0 … p−1 and probe until an empty slot, counting that empty slot; ASL = total ÷ p. Chaining appends at the tail and an unsuccessful search counts only key comparisons.',
  ),
};

const ERR = {
  keys: T('关键字要有 1～15 个', 'Give 1–15 keys'),
  m: T('表长要在 2～20 之间', 'Table size must be 2–20'),
  p: T('模 p 要在 1～表长之间', 'p must be between 1 and m'),
  a: T('乘数要在 1～99 之间', 'a must be 1–99'),
  dup: T('关键字不能重复', 'Keys must be distinct'),
  tooMany: T('开放定址法的关键字个数不能超过表长', 'Open addressing needs m ≥ number of keys'),
  full: T('平方探测找不到空位（这正是平方探测要求表长取 4k+3 素数的原因）', 'Quadratic probing found no free slot (why the table size should be a 4k+3 prime)'),
};

// ───────────────────────── 画板 ─────────────────────────

function geo(sim) {
  const S = Math.max(42, Math.min(62, 720 / sim.m));
  const x0 = 70;
  const slotY = 300;
  const depth = sim.method === 'chain' ? Math.max(1, ...sim.chains.map((c) => c.length)) : 0;
  const failH = sim.method === 'chain' ? 0 : 40 + sim.p * 22;
  const bottom = slotY + 96 + depth * 44 + failH;
  return { S, x0, slotY, X: (j) => x0 + j * S, keyY: 150, failY: (h) => slotY + 92 + h * 22, rect: [10, 90, x0 + sim.m * S + 90, bottom] };
}

/** 第 k 个关键字插入之后；phase：'insert' | 'succ' | 'fail' */
function boardAt(sim, k, phase, z) {
  const g = geo(sim);
  const items = [];
  const st = k >= 0 ? sim.steps[k] : null;
  items.push({ k: 'lab-q', x: g.X(0) - 30, y: g.keyY + 4, html: txt(0, 0, z ? '待插入' : 'to insert', 'bt-cap', 'end') });
  for (let j = 0; j < sim.m; j++) {
    const probed = st && phase === 'insert' ? st.path.indexOf(j) : -1;
    const isFinal = st && phase === 'insert' && st.slot === j;
    // 拉链法的链挂在格子下面，地址号写到格子上方
    let extra = txt(0, sim.method === 'chain' ? -30 : 50, String(j), 'bt-lab');
    if (phase === 'fail' && j < sim.p && sim.method === 'chain') extra += txt(0, 68, String(sim.failRows[j].count), 'bt-fail');
    const empty = phase === 'fail' && sim.method !== 'chain' && sim.table[j] == null;
    items.push({ k: `slot-${j}`, x: g.X(j), y: g.slotY, cls: isFinal ? 'is-hit' : probed >= 0 ? 'is-new' : '', html: chip(40, 40, empty ? (z ? '空' : '∅') : '', { cls: `slot ${empty ? 'hs-empty' : ''}`, size: 11 }) + extra });
  }
  if (phase === 'fail' && sim.method === 'chain') items.push({ k: 'lab-fail', x: g.X(0) - 30, y: g.slotY + 72, html: txt(0, 0, z ? '失败比较' : 'miss cost', 'bt-cap', 'end') });
  if (phase === 'succ') items.push({ k: 'lab-succ', x: g.X(0) - 30, y: g.slotY - 50, html: txt(0, 0, z ? '每格 = 比较一次' : 'one square = one probe', 'bt-cap', 'end') });
  hashExtras(sim, g, st, phase, z, items);
  // 关键字
  sim.keys.forEach((key, i) => {
    const s = sim.steps[i];
    const tone = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'orange', 'slate'][i % 8];
    if (i > k) {
      const q = i - k - 1;
      items.push({ k: `key-${key}`, x: g.X(0) + q * 46, y: g.keyY, html: chip(32, 32, key, { tone, size: 12 }) });
      return;
    }
    const y = sim.method === 'chain' ? g.slotY + 44 + s.chainPos * 44 : g.slotY - 3;
    const lab = phase === 'succ' ? (sim.method === 'chain' ? hsStack(s.probes, 30, 8, 'h', tone) : hsStack(s.probes, -7, -36, 'v', tone)) : '';
    items.push({ k: `key-${key}`, x: g.X(s.slot), y, cls: i === k && phase === 'insert' ? 'is-cur' : '', html: `<g transform="translate(0 3)">${chip(32, 32, key, { tone, size: 12 })}</g>` + lab });
  });
  // 拉链的指针
  if (sim.method === 'chain') {
    let links = '';
    sim.chains.forEach((ch, j) => {
      const n = sim.steps.slice(0, k + 1).filter((s) => s.slot === j).length;
      for (let q = 0; q < n; q++) links += line(g.X(j), g.slotY + 20 + q * 44, g.X(j), g.slotY + 28 + q * 44, 'bl-chain');
    });
    items.push({ k: 'links', x: 0, y: 0, html: links });
  }
  return items;
}

/** 一摞比较方块：n 个，每个代表一次比较 */
function hsStack(n, x, y, dir, tone) {
  let h = '';
  for (let i = 0; i < n; i++) h += `<g transform="translate(${dir === 'v' ? x : x + i * 13} ${dir === 'v' ? y - i * 13 : y - 6})">${chip(11, 11, '', { tone })}</g>`;
  return h + (dir === 'v' ? txt(x + 16, y - (n - 1) * 13 + 4, String(n), 'bt-succ', 'start') : txt(x + n * 13 + 4, y - 2, String(n), 'bt-succ', 'start'));
}
/** 探测路径的弧线、失败查找的一行行探测 */
function hashExtras(sim, g, st, phase, z, items) {
  if (sim.method === 'chain') return;
  if (st && phase === 'insert' && st.path.length > 1) {
    let h = '';
    for (let i = 0; i + 1 < st.path.length; i++) {
      const a = g.X(st.path[i]);
      const b = g.X(st.path[i + 1]);
      const last = i + 2 === st.path.length;
      const top = g.slotY - 30 - Math.min(Math.abs(b - a) * 0.35, 90) - i * 6;
      const cls = last ? 'ok' : 'bad';
      h += `<path class="hs-hop ${cls}" d="M${a} ${g.slotY - 24} Q${(a + b) / 2} ${top} ${b} ${g.slotY - 26}"/>`;
      h += `<circle class="hs-tip ${cls}" cx="${b}" cy="${g.slotY - 25}" r="3.5"/>`;
      h += txt((a + b) / 2, (g.slotY - 24 + top) / 2 - 4, sim.method === 'quad' ? `${quadInc(i + 1) < 0 ? '−' : '+'}${Math.abs(quadInc(i + 1))}` : '+1', `bt-probe ${cls}`);
    }
    h += txt(g.X(st.path[0]), g.slotY - 30, 'H', 'bt-probe bad');
    items.push({ k: `hop${st.key}`, x: 0, y: 0, html: h });
  }
  if (phase === 'fail') {
    let h = txt(g.X(0) - 30, g.failY(0) - 22, z ? '从每个地址出发，一直探测到空位：' : 'From each address, probe until an empty slot:', 'bt-cap', 'start');
    sim.failRows.forEach((r) => {
      const y = g.failY(r.h);
      h += txt(g.X(0) - 30, y + 4, `H=${r.h}`, 'bt-idx', 'end');
      r.path.forEach((d, i) => {
        const end = i === r.path.length - 1;
        if (i > 0 && sim.method === 'linear' && d > r.path[i - 1]) h += line(g.X(r.path[i - 1]) + 6, y, g.X(d) - 6, y, 'hs-run');
        h += `<circle class="hs-dot ${end ? 'end' : ''}" cx="${g.X(d)}" cy="${y}" r="${end ? 6 : 5}"/>`;
      });
      h += txt(g.X(sim.m - 1) + 34, y + 4, String(r.count), 'bt-fail', 'start');
    });
    items.push({ k: 'failrows', x: 0, y: 0, html: h });
  }
}

// ───────────────────────── 文案 ─────────────────────────

function insertText(sim, s, z) {
  const hx = sim.a === 1 ? `${s.key} mod ${sim.p}` : `${sim.a} × ${s.key} mod ${sim.p} = ${sim.a * s.key} mod ${sim.p}`;
  const head = z ? `H(${s.key}) = ${hx} = ${s.h}。` : `H(${s.key}) = ${hx} = ${s.h}. `;
  if (sim.method === 'chain') return head + (z ? `接到 ${s.h} 号链表的末尾，是这条链上第 ${s.chainPos + 1} 个结点，以后查它要比较 ${s.probes} 次。` : `It goes to the tail of chain ${s.h} as node ${s.chainPos + 1}, so finding it later takes ${s.probes} comparison(s).`);
  const parts = s.path.map((d, i) => {
    const inc = sim.method === 'quad' ? quadInc(i) : i;
    const expr = i === 0 ? `${d}` : sim.method === 'quad' ? `(${s.h} ${inc < 0 ? '−' : '+'} ${Math.abs(inc)}) mod ${sim.m} = ${d}` : `(${s.h} + ${i}) mod ${sim.m} = ${d}`;
    const occ = i < s.path.length - 1;
    const who = occ ? sim.table[d] : null;
    return z ? `${expr}${occ ? `（已被 ${whoAt(sim, d, s)} 占用）` : '（空，放入）'}` : `${expr}${occ ? ` (taken by ${whoAt(sim, d, s)})` : ' (free, placed)'}` + (who === null ? '' : '');
  });
  return head + (z ? `依次探测：${parts.join(' → ')}。共比较 ${s.probes} 次。` : `Probes: ${parts.join(' → ')}. ${s.probes} comparison(s).`);
}

/** 插入 s 时 d 号位置上已经是谁 */
function whoAt(sim, d, s) {
  const idx = sim.steps.indexOf(s);
  return sim.steps.slice(0, idx).find((x) => x.slot === d)?.key ?? '?';
}

function decode(ev) {
  const { sim } = ev;
  const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });
  const layers = [];
  if (ev.s) {
    const s = ev.s;
    layers.push({ name: T(`插入 ${s.key}`, `Insert ${s.key}`), summary: T(`比较 ${s.probes} 次`, `${s.probes} probes`), start: 0, end: 0, open: true, fields: [info('H(key)', String(s.h)), info(T('探测序列', 'Probe sequence'), s.path.join(' → ')), info(T('放入', 'Placed at'), String(s.slot)), info(T('过程', 'Details'), both((z) => insertText(sim, s, z)), { note: true })] });
  } else if (ev.asl === 'succ') {
    layers.push({ name: T('ASL 成功', 'ASL (hit)'), summary: frac(...sim.succ), start: 0, end: 0, open: true, fields: sim.steps.map((s) => info(String(s.key), T(`${s.probes} 次`, `${s.probes}`))) });
  } else {
    layers.push({ name: T('ASL 失败', 'ASL (miss)'), summary: frac(...sim.fail), start: 0, end: 0, open: true, fields: sim.failRows.map((f) => info(T(`H = ${f.h}`, `H = ${f.h}`), sim.method === 'chain' ? T(`链长 ${f.count}`, `chain ${f.count}`) : T(`${f.path.join(' → ')}，${f.count} 次`, `${f.path.join(' → ')}: ${f.count}`))) });
  }
  return { label: T('散列解析', 'Hashing decoder'), tag: { color: 'teal', text: NAME[sim.method] }, title: L(ev.what), meta: [['H(key)', `(${sim.a} × key) mod ${sim.p}`], [T('表长', 'Size'), String(sim.m)]], hint: '', view: { kind: 'none' }, layers };
}

function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok) return '';
  const k = snap?.k ?? -1;
  const z = getLang() === 'zh';
  const done = sim.steps.slice(0, k + 1);
  const rows = Array.from({ length: sim.m }, (_, j) => {
    const here = done.filter((s) => s.slot === j);
    return { cls: here.length ? '' : 'is-empty', cells: [j, here.map((s) => s.key).join(' → ') || '—', here.map((s) => s.probes).join(', ') || '—', j < sim.p && snap?.fail ? sim.failRows[j].count : ''] };
  });
  return `<div class="ms ms-wide">${card(T('散列表', 'Table'), NAME[sim.method], table([z ? '地址' : 'Slot', z ? '关键字' : 'Keys', z ? '成功比较' : 'Hit cost', z ? '失败比较' : 'Miss cost'], rows), 'ms-grid is-focus')}</div>`;
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('插入记录', 'Insertions'),
  stateName: T('散列表', 'Table'),
  emptyRows: T('按「播放」或「单步」，每个关键字的探测过程都会记在这里。', 'Press Play or Step; each insertion is logged here.'),
  cols: [
    { label: T('序号', 'No.'), cls: 'col-no' },
    { label: T('操作', 'Step'), cls: 'col-op' },
    { label: T('探测 / 计算', 'Probes / formula'), cls: 'col-info' },
    { label: T('比较', 'Cost'), cls: 'col-res' },
  ],
  cells: (ev, idx) => [`<i class="dot"></i>${idx + 1}`, L(ev.what), L(ev.value), ev.cost != null ? res(ev.cost > 1 ? 'warn' : 'ok', String(ev.cost)) : ''],
  decode,
  renderState,
});

export const DEFAULTS = SPEC.presets[0].set;

function build(params) {
  const sim = simulate(params);
  const lesson = {
    id: 'hashing',
    kit,
    where: [['ds', 'search']],
    principle: HASH_PRINCIPLE,
    tag: 'Hash',
    name: T('散列表与 ASL', 'Hash tables and ASL'),
    full: T('线性探测 · 平方探测 · 拉链法 · 平均查找长度', 'Linear · quadratic · chaining · average search length'),
    title: T(`${NAME[params.method]?.zh ?? ''} · H = ${params.a === 1 ? '' : params.a}k mod ${params.p}`, `${NAME[params.method]?.en ?? ''} · H = ${params.a === 1 ? '' : params.a}k mod ${params.p}`),
    badge: NAME[params.method] ?? '',
    nodes: [],
    legend: [
      ['green', T('放入位置', 'Placed')],
      ['rose', T('冲突', 'Collision')],
    ],
    sim,
    errors: sim.ok ? [] : sim.errors.map((e) => (e === 'full' ? { zh: `${sim.failKey} ` + ERR.full.zh, en: `${sim.failKey}: ` + ERR.full.en } : ERR[e] ?? e)),
    overview: {
      desc: T(
        '散列函数把关键字直接算成地址，理想情况下一次就能找到。但不同关键字可能算出同一个地址（冲突），这时开放定址法沿着探测序列找下一个空位，拉链法则把它们挂在同一条链上。查找要比较几次，就看冲突有多严重：ASL 量化了这一点。',
        'A hash function turns a key straight into an address, ideally found in one probe. Different keys may collide; open addressing then walks a probe sequence to a free slot, while chaining hangs them on one list. The average search length (ASL) measures how much the collisions cost.',
      ),
      facts: sim.ok
        ? [
            ['H(key)', `(${sim.a} × key) mod ${sim.p}`],
            [T('表长 m', 'Size m'), String(sim.m)],
            [T('装填因子', 'Load factor'), `${sim.keys.length} / ${sim.m}`],
          ]
        : [],
    },
    start: { nodes: [], frame: { rect: sim.ok ? geo(sim).rect : [0, 0, 600, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const g = geo(sim);
  const boardEv = (k, phase) => ({ type: 'board', items: boardAt(sim, k, phase, true), itemsEn: boardAt(sim, k, phase, false) });
  lesson.start.events = [boardEv(-1, 'insert'), { type: 'snap', snap: { k: -1 } }];
  const n = sim.keys.length;
  lesson.steps = sim.steps.map((s, k) => ({
    title: sim.method === 'chain' ? T(`插入 ${s.key}：挂到 ${s.slot} 号链`, `Insert ${s.key}: chain ${s.slot}`) : s.probes === 1 ? T(`插入 ${s.key}：直接放入 ${s.slot} 号`, `Insert ${s.key}: slot ${s.slot}`) : T(`插入 ${s.key}：冲突 ${s.probes - 1} 次，放入 ${s.slot} 号`, `Insert ${s.key}: ${s.probes - 1} collision(s), slot ${s.slot}`),
    desc: T(`H(${s.key}) = ${s.h}`, `H(${s.key}) = ${s.h}`),
    detail: both((z) => insertText(sim, s, z)),
    facts: [
      ['H(key)', String(s.h)],
      [T('探测序列', 'Probes'), s.path.join(' → ')],
      [T('比较次数', 'Comparisons'), String(s.probes)],
    ],
    events: [boardEv(k, 'insert'), { type: 'note', at: [g.X(s.slot), g.slotY - 76], text: sim.method === 'chain' ? T(`${s.key} 挂到 ${s.slot} 号链尾`, `${s.key} → end of chain ${s.slot}`) : s.probes === 1 ? T(`${s.key} → ${s.slot}`, `${s.key} → ${s.slot}`) : T(`冲突 ${s.probes - 1} 次 → ${s.slot}`, `${s.probes - 1} collision(s) → ${s.slot}`), tone: s.probes === 1 || sim.method === 'chain' ? 'ok' : 'warn' }, { type: 'row', color: s.probes === 1 ? 'green' : 'rose', sim, s, what: T(`插入 ${s.key}`, `Insert ${s.key}`), value: { zh: sim.method === 'chain' ? `H=${s.h}，链上第 ${s.chainPos + 1} 个` : s.path.join(' → '), en: sim.method === 'chain' ? `H=${s.h}, node ${s.chainPos + 1}` : s.path.join(' → ') }, cost: s.probes }, { type: 'snap', snap: { k } }],
  }));
  const succList = sim.steps.map((s) => `${s.key}:${s.probes}`).join(' ');
  lesson.steps.push({
    title: T(`ASL 成功 = ${frac(...sim.succ)}`, `ASL (hit) = ${frac(...sim.succ)}`),
    desc: T('每个关键字的比较次数取平均', 'Average the hit costs'),
    detail: both((z) => (z ? `查找每个关键字时走的路和插入它时一样，比较次数分别是 ${succList}。在等概率下，ASL成功 = (${sim.steps.map((s) => s.probes).join(' + ')}) ÷ ${n} = ${frac(...sim.succ)}。` : `Finding a key retraces its insertion: ${succList}. With equal probabilities ASL = (${sim.steps.map((s) => s.probes).join(' + ')}) ÷ ${n} = ${frac(...sim.succ)}.`)),
    facts: [[T('ASL 成功', 'ASL hit'), frac(...sim.succ)]],
    events: [boardEv(n - 1, 'succ'), { type: 'row', color: 'green', sim, asl: 'succ', what: T('ASL 成功', 'ASL (hit)'), value: { zh: `${sim.succ[0]} ÷ ${n} = ${frac(...sim.succ)}`, en: `${sim.succ[0]} ÷ ${n} = ${frac(...sim.succ)}` } }],
  });
  lesson.steps.push({
    title: T(`ASL 失败 = ${frac(...sim.fail)}`, `ASL (miss) = ${frac(...sim.fail)}`),
    desc: T(`从 H = 0 … ${sim.p - 1} 出发`, `From H = 0 … ${sim.p - 1}`),
    detail: both((z) =>
      sim.method === 'chain'
        ? z
          ? `查找一个不在表中的关键字，算出的 H 可能是 0～${sim.p - 1} 中任一个；要和那条链上的每个关键字都比一次，空指针不算。各链长度为 ${sim.failRows.map((f) => f.count).join('、')}，ASL失败 = ${sim.fail[0]} ÷ ${sim.p} = ${frac(...sim.fail)}。`
          : `A missing key hashes to any of 0–${sim.p - 1} and is compared with every key on that chain (the null pointer is free). Chain lengths ${sim.failRows.map((f) => f.count).join(', ')} give ASL = ${sim.fail[0]} ÷ ${sim.p} = ${frac(...sim.fail)}.`
        : z
          ? `查找一个不在表中的关键字，H 可能是 0～${sim.p - 1}（注意是模 p 的范围，不是表长）。从每个地址出发，一直探测到空位置才能确定失败，和空位置的比较也算一次：${sim.failRows.map((f) => `${f.h}:${f.count}`).join(' ')}。ASL失败 = ${sim.fail[0]} ÷ ${sim.p} = ${frac(...sim.fail)}。`
          : `A missing key hashes to 0–${sim.p - 1} (the range of mod p, not the table size). From each address probe until an empty slot, counting it: ${sim.failRows.map((f) => `${f.h}:${f.count}`).join(' ')}. ASL = ${sim.fail[0]} ÷ ${sim.p} = ${frac(...sim.fail)}.`,
    ),
    facts: [[T('ASL 失败', 'ASL miss'), frac(...sim.fail)]],
    events: [boardEv(n - 1, 'fail'), { type: 'row', color: 'rose', sim, asl: 'fail', what: T('ASL 失败', 'ASL (miss)'), value: { zh: `${sim.fail[0]} ÷ ${sim.p} = ${frac(...sim.fail)}`, en: `${sim.fail[0]} ÷ ${sim.p} = ${frac(...sim.fail)}` } }, { type: 'snap', snap: { k: n - 1, fail: true } }],
  });
  lesson.outro = {
    title: T('散列表建好了', 'Table built'),
    text: T('ASL 失败的分母是散列函数能算出的地址个数（这里是 p），不是表长，也不是关键字个数，这是最容易错的地方。换成拉链法再算一遍，比较一下两种冲突处理的 ASL。', 'The miss-ASL denominator is the number of addresses the hash can produce (p here), neither the table size nor the key count; this is the classic trap. Switch to chaining and compare.'),
    facts: [
      [T('ASL 成功', 'ASL hit'), frac(...sim.succ)],
      [T('ASL 失败', 'ASL miss'), frac(...sim.fail)],
      [T('装填因子', 'Load factor'), frac(...sim.load)],
    ],
  };
  lesson.steps.forEach((s, i, all) => (s.ref ??= hashRef(sim.method)(s, i, all)));
  return lesson;
}

export const makeHash = () => parametric('hashing', DEFAULTS, build);
