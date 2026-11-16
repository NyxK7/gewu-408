// 「编码与波形」：同一串比特画成 NRZ、NRZI、曼彻斯特、差分曼彻斯特四种波形，上下对齐，
// 每个码元的边界画虚线，曼彻斯特类编码在码元中间的跳变处打点。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { encode } from './phy.js';

const SPEC = {
  presets: [
    { label: T('01001110', '01001110'), set: { bits: '01001110', init: 0, manchester: 'up0' } },
    { label: T('全 0 和全 1', 'All 0s and all 1s'), set: { bits: '00001111', init: 0, manchester: 'up0' } },
    { label: T('以太网的曼彻斯特', 'Ethernet Manchester'), set: { bits: '10110010', init: 0, manchester: 'up1' } },
  ],
  groups: [
    {
      legend: T('数据', 'Data'),
      fields: [
        { name: 'bits', label: T('比特串（最多 16 位）', 'Bits (up to 16)'), type: 'text', parse: (s) => (/^[01]{1,16}$/.test(s) ? s : NaN) },
        { name: 'init', label: T('开始前的电平', 'Level before the first bit'), type: 'select', options: [[0, T('低', 'Low')], [1, T('高', 'High')]] },
        { name: 'manchester', label: T('曼彻斯特的约定', 'Manchester convention'), type: 'select', options: [['up0', T('中间上跳 = 0，下跳 = 1', 'rising mid = 0, falling = 1')], ['up1', T('中间上跳 = 1，下跳 = 0（以太网）', 'rising mid = 1, falling = 0 (Ethernet)')]], wide: true },
      ],
    },
  ],
  note: T(
    'NRZ：1 高 0 低。NRZI：电平翻转表示 0，不变表示 1。曼彻斯特：每个码元中间都跳变，跳变方向表示 0 或 1（两种约定都有，可切换）。差分曼彻斯特：中间一定跳变，只用来同步；码元开始处有跳变表示 0，没有跳变表示 1。各教材对 NRZI 和曼彻斯特的约定不完全一样，做题时以题目为准。',
    'NRZ: 1 high, 0 low. NRZI: a transition means 0, none means 1. Manchester: always a mid-bit transition whose direction encodes the bit (both conventions exist). Differential Manchester: the mid-bit transition is only for clocking; a transition at the start means 0, none means 1. Textbooks differ on NRZI and Manchester, so follow the question.',
  ),
};
const ERR = { bits: T('只能是 0 和 1，最多 16 位', 'Only 0s and 1s, up to 16') };

const CODES = [
  { key: 'nrz', zh: '不归零 NRZ', en: 'NRZ', tone: 'blue' },
  { key: 'nrzi', zh: '反向不归零 NRZI', en: 'NRZI', tone: 'teal' },
  { key: 'man', zh: '曼彻斯特', en: 'Manchester', tone: 'violet' },
  { key: 'diff', zh: '差分曼彻斯特', en: 'Diff. Manchester', tone: 'amber' },
];

// ───── 画板 ─────
const X0 = 210;
const BW = 60;
const H = 34;
const Y0 = 150;
const RG = 84;

function wave(levels, init, withInit) {
  const half = BW / 2;
  const y = (l) => (l ? 0 : H);
  let d = '';
  let prev = withInit ? init : levels[0];
  let x = 0;
  if (withInit) d += `M${-14},${y(init)} L0,${y(init)} `;
  else d += `M0,${y(levels[0])} `;
  levels.forEach((l, i) => {
    if (l !== prev) d += `L${x},${y(l)} `;
    x = (i + 1) * half;
    d += `L${x},${y(l)} `;
    prev = l;
  });
  return `<path class="en-wave" d="${d}"/>`;
}

function board(sim, st, z) {
  const items = [];
  const n = sim.bits.length;
  // 比特和码元边界
  let head = txt(X0 - 16, 4, z ? '比特' : 'bits', 'bt-cap', 'end');
  sim.bits.forEach((b, i) => {
    head += `<g transform="translate(${i * BW + 4} -16)">${cell(BW - 8, 28, String(b), { tone: b ? 'blue' : '', size: 15 })}</g>`;
  });
  items.push({ k: 'bits', x: X0, y: 96, html: head });
  let grid = '';
  for (let i = 0; i <= n; i++) grid += `<line class="en-grid" x1="${X0 + i * BW}" y1="${120}" x2="${X0 + i * BW}" y2="${Y0 + CODES.length * RG}"/>`;
  items.push({ k: 'grid', x: 0, y: 0, html: grid });

  CODES.forEach((c, ci) => {
    if (ci > (st.k ?? -1)) return;
    const y = Y0 + ci * RG;
    const lv = sim.codes[c.key];
    const withInit = c.key === 'nrzi' || c.key === 'diff';
    let h = txt(-16, H / 2 + 4, z ? c.zh : c.en, `bt-lab c-${c.tone}`, 'end');
    h += `<g class="c-${c.tone}">${wave(lv, sim.init, withInit)}</g>`;
    // 标记：曼彻斯特类的中间跳变；差分曼彻斯特在码元开始处有没有跳变
    if (c.key === 'man' || c.key === 'diff') {
      for (let i = 0; i < n; i++) h += `<circle class="en-mid" cx="${i * BW + BW / 2}" cy="${H / 2}" r="3"/>`;
    }
    if (c.key === 'diff' || c.key === 'nrzi') {
      let prev = sim.init;
      for (let i = 0; i < n; i++) {
        const first = lv[2 * i];
        const jump = first !== prev;
        h += txt(i * BW + (c.key === 'diff' ? 8 : BW / 2), H + 16, jump ? (z ? '跳' : 'flip') : '—', `en-note ${jump ? 'on' : ''}`, c.key === 'diff' ? 'start' : 'middle');
        prev = lv[2 * i + 1];
      }
    }
    items.push({ k: `c-${c.key}`, x: X0, y, cls: ci === st.k ? 'is-cur' : '', html: h });
  });
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'basic',
      title: T('物理层要解决什么', 'What the physical layer does'),
      blocks: [
        { p: T('物理层考虑怎样在各种传输媒体上传输**比特流**，屏蔽媒体的差异。它的接口有四个特性：**机械特性**（接头形状、引脚）、**电气特性**（电压范围）、**功能特性**（某个电平代表什么）、**过程特性**（各种事件出现的顺序）。', 'The physical layer moves a **bit stream** over a medium. Its interface has mechanical, electrical, functional and procedural characteristics.') },
        {
          list: [
            T('**码元**：用一个固定时长的信号波形表示一位 k 进制数字，这个时长叫码元宽度。一个码元可以携带多个比特。', 'A **symbol** is a fixed-length waveform carrying one k-ary digit, possibly several bits.'),
            T('**波特率**（码元速率，单位 Baud）：每秒传几个码元。**比特率**（信息速率，单位 b/s）：每秒传几个比特。比特率 = 波特率 × log₂(码元的状态数)。', '**Baud** is symbols per second; **bit rate** = baud × log₂(number of levels).'),
            T('**通信方式**：单工（只能一个方向）、半双工（双向但不能同时）、全双工（双向同时）。', 'Simplex, half duplex and full duplex.'),
          ],
        },
      ],
    },
    {
      id: 'codes',
      title: T('常用编码', 'Common line codes'),
      blocks: [
        {
          table: {
            head: [T('编码', 'Code'), T('规则', 'Rule'), T('能否自同步', 'Self-clocking'), T('说明', 'Notes')],
            rows: [
              [T('不归零 NRZ', 'NRZ'), T('高电平 1，低电平 0', 'high 1, low 0'), T('不能', 'no'), T('连续多个相同比特时没有跳变，接收方分不清码元边界', 'long runs have no transitions')],
              [T('归零 RZ', 'RZ'), T('每个码元中间回到零电平', 'returns to zero mid-bit'), T('能', 'yes'), T('浪费带宽', 'wastes bandwidth')],
              [T('反向不归零 NRZI', 'NRZI'), T('电平翻转表示 0，不变表示 1', 'transition = 0, none = 1'), T('连续 1 时不能', 'not for runs of 1s'), T('USB 用，配合位填充', 'used by USB with bit stuffing')],
              [T('曼彻斯特', 'Manchester'), T('码元中间一定跳变，方向表示 0 或 1', 'mid-bit transition, direction is the bit'), T('能', 'yes'), T('10 Mb/s 以太网用；调制速率是数据率的 2 倍', '10 Mb/s Ethernet; baud is twice the bit rate')],
              [T('差分曼彻斯特', 'Diff. Manchester'), T('中间一定跳变；开始处跳变为 0，不跳为 1', 'always mid-bit; start transition = 0'), T('能', 'yes'), T('抗干扰更好，令牌环用', 'more robust; token ring')],
            ],
          },
        },
        { tip: T('判断曼彻斯特编码：只看每个码元**中间**的跳变方向。判断差分曼彻斯特：只看每个码元**开始处**有没有跳变，中间的跳变不用管。', 'For Manchester, read the **mid-bit** direction; for differential Manchester, read only whether the **start** has a transition.') },
        { warn: T('曼彻斯特编码每个码元被分成两半，信号变化频率是数据率的两倍：传 10 Mb/s 需要 20 MBaud。', 'Manchester doubles the signalling rate: 10 Mb/s needs 20 MBaud.') },
      ],
    },
    {
      id: 'mod',
      title: T('调制', 'Modulation'),
      blocks: [
        { p: T('把数字信号直接用电平表示叫**编码**（基带传输）；用数字信号去改变载波的某个参数叫**调制**（带通传输）。', '**Encoding** represents data as levels (baseband); **modulation** varies a carrier (passband).') },
        {
          list: [
            T('**调幅 ASK**：用载波的振幅表示 0 和 1；', '**ASK**: amplitude;'),
            T('**调频 FSK**：用载波的频率表示；', '**FSK**: frequency;'),
            T('**调相 PSK**：用载波的相位表示；', '**PSK**: phase;'),
            T('**正交振幅调制 QAM**：振幅和相位一起变，一个码元可以有很多种状态。例如 4 种相位 × 4 种振幅 = 16 种状态，每个码元 4 比特。', '**QAM** combines amplitude and phase: 4 phases × 4 amplitudes = 16 states, 4 bits per symbol.'),
          ],
        },
      ],
    },
    {
      id: 'media',
      title: T('传输媒体与物理层设备', 'Media and devices'),
      blocks: [
        { p: T('导引型媒体：双绞线（绞合减少电磁干扰）、同轴电缆、光纤（多模、单模，带宽大、损耗小、抗干扰）。非导引型媒体：无线电波、微波、红外、激光。', 'Guided media: twisted pair, coax, fibre. Unguided: radio, microwave, infrared.') },
        { p: T('**中继器**把信号整形放大，延长距离；**集线器**是多端口中继器。它们都工作在物理层，只转发比特，**不能隔离冲突域**，连接的所有设备仍在同一个冲突域里。', '**Repeaters** and **hubs** regenerate bits at the physical layer and do **not** split collision domains.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('曼彻斯特和差分曼彻斯特的 0、1 约定各教材不同，先看题目怎么规定。', 'Check the question’s Manchester convention.'),
            T('差分曼彻斯特看的是码元开始处，不是中间。', 'Differential Manchester is read at the bit start.'),
            T('波特和比特不能混用：只有二进制码元时两者数值才相等。', 'Baud equals bit rate only for binary symbols.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('编码', 'Codes') });

function build(params) {
  const sim = encode({ bits: params.bits, init: Number(params.init), manchester: params.manchester });
  const lesson = {
    id: 'encoding',
    kit,
    where: [['net', 'phy']],
    tag: T('编码', 'Code'),
    name: T('编码与波形', 'Line codes and waveforms'),
    full: T('码元与波特 · NRZ · NRZI · 曼彻斯特 · 差分曼彻斯特 · 调制 · 传输媒体', 'Symbols and baud · NRZ · NRZI · Manchester · differential Manchester · modulation · media'),
    title: sim.ok ? T(params.bits, params.bits) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: CODES.map((c) => [c.tone, T(c.zh, c.en)]),
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '同一串比特，用不同的编码规则会画出完全不同的波形。这节课把四种常用编码上下对齐画在同一组码元边界里：NRZ 看电平高低，NRZI 看有没有翻转，曼彻斯特看码元中间的跳变方向，差分曼彻斯特看码元开始处有没有跳变。',
        'One bit string, four waveforms. With every code aligned on the same bit boundaries you can compare the rules directly: NRZ by level, NRZI by transitions, Manchester by the mid-bit direction, differential Manchester by the transition at the start.',
      ),
      facts: sim.ok ? [[T('比特', 'Bits'), params.bits]] : [],
    },
    start: { nodes: [], frame: { rect: [20, 60, X0 + (sim.ok ? sim.bits.length : 8) * BW + 30, Y0 + CODES.length * RG] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const bs = params.bits;
  const manRule = sim.manchester === 'up0' ? T('中间向上跳表示 0、向下跳表示 1', 'rising mid = 0, falling = 1') : T('中间向上跳表示 1、向下跳表示 0（以太网）', 'rising mid = 1, falling = 0 (Ethernet)');
  const list = [
    { title: T('不归零 NRZ', 'NRZ'), desc: T('1 高电平，0 低电平', '1 high, 0 low'), detail: T(`每个码元整段保持一个电平：1 高、0 低。${/0000|1111/.test(bs) ? '连着几个相同的比特时波形是一条直线，接收方很难判断有几位——NRZ 不能自同步。' : '如果出现一长串相同的比特，波形就成了一条直线，接收方难以分清有几位，所以 NRZ 不能自同步。'}`, 'Each bit holds one level. A long run of equal bits becomes a flat line, so NRZ cannot clock itself.'), ref: 'codes', st: { k: 0 }, row: { color: 'blue', what: 'NRZ', result: T('电平', 'level'), tone: 'info' } },
    { title: T('反向不归零 NRZI', 'NRZI'), desc: T('翻转表示 0，不变表示 1', 'transition = 0'), detail: T(`从开始前的${sim.init ? '高' : '低'}电平出发：遇到 0 就翻转一次，遇到 1 保持不变。下面每个码元标出了「跳」或「—」。连续的 0 会不断翻转，但连续的 1 仍是一条直线。`, 'From the initial level, flip on every 0 and hold on every 1. Runs of 0s keep flipping; runs of 1s are still flat.'), ref: 'codes', st: { k: 1 }, row: { color: 'teal', what: 'NRZI', result: T('翻转', 'transitions'), tone: 'info' } },
    { title: T('曼彻斯特', 'Manchester'), desc: manRule, detail: { zh: `每个码元从中间分成两半，中间一定有一次跳变（图中的点）。本课约定${manRule.zh}。因为每位都有跳变，接收方可以从中提取时钟，能自同步；代价是信号变化频率是数据率的两倍。`, en: `Every bit has a mid-bit transition (the dots); here ${manRule.en}. The transitions carry the clock, at the cost of doubling the signalling rate.` }, ref: 'codes', st: { k: 2 }, row: { color: 'violet', what: T('曼彻斯特', 'Manchester'), result: T('中间跳变', 'mid-bit'), tone: 'info' } },
    { title: T('差分曼彻斯特', 'Differential Manchester'), desc: T('开始处跳变表示 0', 'start transition = 0'), detail: T('中间也一定跳变，但只用来同步，不表示数据。数据看每个码元开始处：和上一个码元结尾相比有跳变就是 0，没有就是 1（图中标「跳」或「—」）。它只关心「变没变」，不关心电平高低，所以线路接反了也能正确解码。', 'The mid-bit transition is for clocking only. Data is read at the **start**: a transition means 0, none means 1. Only changes matter, so swapped wires still decode correctly.'), ref: 'codes', st: { k: 3 }, row: { color: 'amber', what: T('差分曼彻斯特', 'Diff. Manchester'), result: T('开始处', 'at start'), tone: 'info' } },
  ];
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T('四种编码对比', 'Four codes compared'), text: T('换一串全 0 或全 1 的比特，看哪几种编码会出现一长段没有跳变的直线。', 'Try all 0s or all 1s and see which codes go flat.'), facts: [] };
  return lesson;
}

export const makeEncoding = () => parametric('encoding', SPEC.presets[0].set, build);
