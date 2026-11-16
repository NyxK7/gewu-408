// 「奈氏准则与香农公式」：两条极限各算一遍，画成两根横条，实际能达到的最高数据率取两者中小的那个。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { limits } from './phy.js';

const num = (s) => (/^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN);
const rate = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(3)} Mb/s` : v >= 1e3 ? `${+(v / 1e3).toFixed(3)} kb/s` : `${+v.toFixed(3)} b/s`);
const hz = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(3)} MHz` : v >= 1e3 ? `${+(v / 1e3).toFixed(3)} kHz` : `${v} Hz`);

const SPEC = {
  presets: [
    { label: T('电话线：3 kHz、30 dB', 'Phone line: 3 kHz, 30 dB'), set: { W: '3000', V: 16, snr: '30', db: true } },
    { label: T('受香农限制', 'Shannon-limited'), set: { W: '4000', V: 256, snr: '15', db: false } },
    { label: T('二进制码元', 'Binary symbols'), set: { W: '3000', V: 2, snr: '20', db: true } },
  ],
  groups: [
    {
      legend: T('信道', 'Channel'),
      fields: [
        { name: 'W', label: T('带宽 W（Hz）', 'Bandwidth W (Hz)'), type: 'text', parse: (s) => (num(s) > 0 ? s : NaN) },
        { name: 'V', label: T('码元的离散电平数 V', 'Signal levels V'), type: 'int', min: 2, max: 4096 },
        { name: 'snr', label: T('信噪比', 'Signal-to-noise ratio'), type: 'text', parse: (s) => (Number.isNaN(num(s)) ? NaN : s) },
        { name: 'db', label: T('信噪比单位是分贝（dB）', 'SNR is in dB'), type: 'check' },
      ],
    },
  ],
  note: T(
    '奈氏准则：理想低通信道（无噪声）的最高码元速率是 2W Baud，每个码元携带 log₂V 比特。香农公式：带宽受限、有高斯白噪声的信道，极限信息速率 C = W·log₂(1 + S/N)。信噪比给的是分贝时，S/N = 10^(dB/10)。',
    'Nyquist: a noiseless low-pass channel carries at most 2W baud, log₂V bits each. Shannon: with Gaussian noise the limit is C = W·log₂(1 + S/N). Convert decibels with S/N = 10^(dB/10).',
  ),
};
const ERR = { W: T('带宽要大于 0', 'Bandwidth must be positive'), V: T('电平数至少是 2', 'At least 2 levels'), snr: T('信噪比不能为负', 'SNR cannot be negative'), snrBig: T('信噪比大得离谱，换算成比值已经超出了数的表示范围，请填一个合理的值（比如 30 dB）', 'The SNR is far too large to compute; try something like 30 dB') };

// ───── 画板 ─────
const X0 = 220;
const BW = 560;

function board(sim, st, z) {
  const items = [];
  const top = Math.max(sim.nyq, sim.shannon) * 1.32;
  const w = (v) => Math.max(4, (v / top) * BW);
  const row = (k, y, show, lab, v, tone, sub, hot) =>
    show &&
    items.push({
      k,
      x: X0,
      y,
      html: txt(-16, 22, lab, `bt-lab c-${tone}`, 'end') + `<rect class="memcol" x="0" y="0" width="${BW}" height="36" rx="5"/>` + cell(w(v), 36, '', { tone, cls: hot ? 'hot' : '' }) + txt(w(v) + 12, 23, rate(v), 'bt-acc', 'start') + txt(0, 58, sub, 'lm-sub', 'start'),
    });
  row('nyq', 150, st.k >= 0, z ? '奈氏准则' : 'Nyquist', sim.nyq, 'blue', `2 × ${hz(sim.W)} × log₂${sim.V} = ${sim.baud} Baud × ${+sim.bitsPer.toFixed(3)} bit`, st.k === 2 && sim.by === 'nyq');
  row('sha', 260, st.k >= 1, z ? '香农公式' : 'Shannon', sim.shannon, 'violet', `${hz(sim.W)} × log₂(1 + ${+sim.ratio.toFixed(3)})`, st.k === 2 && sim.by === 'shannon');
  if (st.k >= 2) {
    const x = w(sim.max);
    items.push({ k: 'lim', x: X0, y: 120, html: `<line class="lm-line" x1="${x}" y1="0" x2="${x}" y2="210"/>` + txt(x, 236, z ? `最高 ${rate(sim.max)}` : `max ${rate(sim.max)}`, 'bt-acc') });
  }
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'distort',
      title: T('信号为什么会失真', 'Why signals distort'),
      blocks: [
        { p: T('信道的带宽有限，码元传得越快，信号的高频分量损失越多，接收端的波形就越「圆」，相邻码元互相干扰（码间串扰），最后分不清。另外信道里还有噪声。两个极限分别回答这两个问题。', 'Limited bandwidth smears fast symbols into each other (inter-symbol interference), and noise adds errors. The two limits address these two problems.') },
      ],
    },
    {
      id: 'nyquist',
      title: T('奈氏准则', 'The Nyquist limit'),
      blocks: [
        { formula: T('最高码元速率 = 2W（Baud）；极限数据率 = 2W·log₂V（b/s）', 'max baud = 2W; max rate = 2W·log₂V b/s') },
        { p: T('在**理想低通（无噪声）**信道中，为了避免码间串扰，码元速率不能超过 2W Baud（W 是带宽，单位 Hz）。每个码元有 V 种状态时，能携带 log₂V 个比特，所以提高电平数可以提高数据率。', 'In an **ideal noiseless** low-pass channel the symbol rate cannot exceed 2W; with V levels each symbol carries log₂V bits.') },
        { warn: T('奈氏准则限制的是**码元速率**，没有限制每个码元带几个比特。只看奈氏准则，似乎电平数越多数据率越高——但有噪声时，电平越多越难分辨，这就要看香农公式。', 'Nyquist bounds the **symbol rate**, not bits per symbol; noise is what limits the number of levels.') },
      ],
    },
    {
      id: 'shannon',
      title: T('香农公式', 'Shannon’s formula'),
      blocks: [
        { formula: T('C = W · log₂(1 + S/N)（b/s）', 'C = W · log₂(1 + S/N) b/s') },
        { p: T('带宽受限、有高斯白噪声干扰的信道，无论采用多少电平、多么巧妙的编码，信息传输速率都不可能超过 C。S/N 是信号平均功率和噪声平均功率之比。', 'Whatever the coding, a band-limited channel with Gaussian noise cannot exceed C. S/N is the ratio of signal to noise power.') },
        { formula: T('信噪比（dB）= 10 · log₁₀(S/N)', 'SNR (dB) = 10 · log₁₀(S/N)') },
        { tip: T('常用换算：10 dB = 10，20 dB = 100，30 dB = 1000，40 dB = 10000。', 'Handy: 10 dB = 10, 20 dB = 100, 30 dB = 1000.') },
      ],
    },
    {
      id: 'both',
      title: T('两者一起用', 'Using both'),
      blocks: [
        { p: T('题目同时给了电平数和信噪比时，两个极限都要算，**取较小的那个**作为信道的最高数据率：奈氏准则说「码元速率最多这么快」，香农公式说「无论怎么编码最多这么多比特」，两个限制同时成立。', 'When both levels and SNR are given, compute both and take the **smaller**.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('奈氏准则是 2W，不是 W；香农公式前面是 W，不是 2W。', 'Nyquist uses 2W; Shannon uses W.'),
            T('信噪比给的是 dB 要先换算成比值再代入香农公式。', 'Convert dB to a ratio before using Shannon.'),
            T('香农公式里是 1 + S/N，不是 S/N。', 'It is 1 + S/N.'),
            T('kHz 是 1000 Hz（不是 1024）。', 'kHz means 1000 Hz.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('计算', 'Steps') });

function build(params) {
  const sim = limits({ W: num(params.W), V: params.V, snr: num(params.snr), db: !!params.db });
  const lesson = {
    id: 'nyquist',
    kit,
    where: [['net', 'phy']],
    tag: T('极限', 'Max'),
    name: T('奈氏准则与香农公式', 'Nyquist and Shannon'),
    full: T('码间串扰 · 奈氏准则 · 信噪比与分贝 · 香农公式 · 取较小值', 'ISI · Nyquist · SNR and decibels · Shannon · take the smaller'),
    title: sim.ok ? T(`${hz(sim.W)} · ${sim.V} 级`, `${hz(sim.W)} · ${sim.V} levels`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['blue', T('奈氏准则', 'Nyquist')],
      ['violet', T('香农公式', 'Shannon')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T('一条信道最快能传多快？奈氏准则从码间串扰出发，限制码元速率；香农公式从噪声出发，给出无论怎么编码都超不过的极限。两个都算出来，实际最高数据率取小的那个。', 'How fast can a channel go? Nyquist bounds the symbol rate because of inter-symbol interference; Shannon bounds any coding because of noise. The real maximum is the smaller.'),
      facts: [],
    },
    start: { nodes: [], frame: { rect: [20, 80, X0 + BW + 150, 400] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [
    {
      title: T(`奈氏准则：${rate(sim.nyq)}`, `Nyquist: ${rate(sim.nyq)}`),
      desc: T(`2 × ${sim.W} × log₂${sim.V}`, `2 × ${sim.W} × log₂${sim.V}`),
      detail: T(`码元速率最高 2W = 2 × ${sim.W} = ${sim.baud} Baud；${sim.V} 种电平，每个码元 log₂${sim.V} = ${+sim.bitsPer.toFixed(3)} 比特；极限数据率 ${sim.baud} × ${+sim.bitsPer.toFixed(3)} = ${rate(sim.nyq)}。`, `Max baud 2W = ${sim.baud}; ${sim.V} levels carry ${+sim.bitsPer.toFixed(3)} bits; ${rate(sim.nyq)}.`),
      ref: 'nyquist',
      st: { k: 0 },
      row: { color: 'blue', what: T('奈氏准则', 'Nyquist'), result: rate(sim.nyq), tone: 'info' },
    },
    {
      title: T(`香农公式：${rate(sim.shannon)}`, `Shannon: ${rate(sim.shannon)}`),
      desc: T(`S/N = ${+sim.ratio.toFixed(3)}`, `S/N = ${+sim.ratio.toFixed(3)}`),
      detail: T(`${sim.db ? `信噪比 ${sim.snr} dB 先换成比值：S/N = 10^(${sim.snr}/10) = ${+sim.ratio.toFixed(3)}。` : `信噪比 S/N = ${sim.snr}。`}C = ${sim.W} × log₂(1 + ${+sim.ratio.toFixed(3)}) = ${rate(sim.shannon)}。`, `${sim.db ? `${sim.snr} dB → S/N = ${+sim.ratio.toFixed(3)}. ` : ''}C = ${sim.W} × log₂(1 + ${+sim.ratio.toFixed(3)}) = ${rate(sim.shannon)}.`),
      ref: 'shannon',
      st: { k: 1 },
      row: { color: 'violet', what: T('香农公式', 'Shannon'), result: rate(sim.shannon), tone: 'info' },
    },
    {
      title: T(`取较小值：${rate(sim.max)}`, `Take the smaller: ${rate(sim.max)}`),
      desc: sim.by === 'nyq' ? T('受奈氏准则（码元速率）限制', 'Limited by Nyquist') : T('受香农公式（噪声）限制', 'Limited by Shannon'),
      detail: sim.by === 'nyq' ? T(`${rate(sim.nyq)} < ${rate(sim.shannon)}。噪声还允许更快，但电平数只有 ${sim.V} 种，码元速率又最多 ${sim.baud} Baud，所以最高 ${rate(sim.nyq)}。想更快可以增加电平数，直到碰到香农极限。`, `${rate(sim.nyq)} < ${rate(sim.shannon)}: more levels would help, up to the Shannon limit.`) : T(`${rate(sim.shannon)} < ${rate(sim.nyq)}。按电平数算可以更快，但噪声使这么多电平无法可靠区分，最高只能 ${rate(sim.shannon)}。`, `${rate(sim.shannon)} < ${rate(sim.nyq)}: noise prevents using that many levels reliably.`),
      ref: 'both',
      st: { k: 2 },
      row: { color: 'green', what: T('最高数据率', 'Max rate'), result: rate(sim.max), tone: 'ok' },
    },
  ];
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? { k: -1 } : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T(`最高 ${rate(sim.max)}`, `Max ${rate(sim.max)}`), text: T('把电平数一直往上调，看奈氏准则那根条越来越长，最后被香农公式挡住。', 'Keep raising the level count and watch Nyquist grow until Shannon caps it.'), facts: [[T('奈氏准则', 'Nyquist'), rate(sim.nyq)], [T('香农公式', 'Shannon'), rate(sim.shannon)]] };
  return lesson;
}

export const makeNyquist = () => parametric('nyquist', SPEC.presets[0].set, build);
