// 「CRC 循环冗余校验」：照课本竖式的样子做模 2 除法——上面是商，下面一层层异或，最后得到冗余码；
// 再看接收方怎么检验，以及什么样的错误检测不出来。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { crc, toStr } from './crc.js';

const SPEC = {
  presets: [
    { label: T('课本例子：101001 ÷ 1101', 'Textbook: 101001 ÷ 1101'), set: { data: '101001', gen: '1101', flips: [] } },
    { label: T('x⁴ + x + 1', 'x⁴ + x + 1'), set: { data: '1101011011', gen: '10011', flips: [] } },
    { label: T('传输出错：能查出来', 'An error is caught'), set: { data: '101001', gen: '1101', flips: [2] } },
    { label: T('检测不出的错误', 'An error slips through'), set: { data: '101001', gen: '1101', flips: [0, 1, 3] } },
  ],
  groups: [
    {
      legend: T('发送方', 'Sender'),
      fields: [
        { name: 'data', label: T('要发送的数据（比特串）', 'Data bits'), type: 'text', parse: (s) => (/^[01]{1,24}$/.test(s) ? s : NaN) },
        { name: 'gen', label: T('生成多项式（比特串）', 'Generator (bits)'), type: 'text', parse: (s) => (/^1[01]{1,8}$/.test(s) ? s : NaN), hint: T('例：x³ + x² + 1 写成 1101', 'e.g. x³ + x² + 1 is 1101') },
      ],
    },
    {
      legend: T('传输', 'Channel'),
      fields: [{ name: 'flips', label: T('传输中翻转的位（从 0 数，可空）', 'Bits flipped in transit (from 0, optional)'), type: 'list', min: 0, max: 40, maxLen: 8, allowEmpty: true, wide: true }],
    },
  ],
  note: T(
    '模 2 运算：加减都是按位异或，不进位也不借位。生成多项式的阶数 r = 位数 − 1，冗余码就是 r 位余数。接收方把收到的整串除以同一个生成多项式，余数为 0 就接受。',
    'Modulo-2 arithmetic: addition and subtraction are XOR, with no carries. With a degree-r generator the check value is the r-bit remainder. The receiver divides the whole frame by the same generator and accepts on a zero remainder.',
  ),
};
const ERR = {
  data: T('数据只能是 0 和 1，最多 24 位', 'Data must be 0s and 1s, up to 24 bits'),
  gen: T('生成多项式以 1 开头，2～9 位', 'The generator starts with 1 and has 2–9 bits'),
  flip: T('第 {f} 位不存在（只有 0～{max}）', 'Bit {f} does not exist (0–{max})'),
};

const poly = (g) => {
  const r = g.length - 1;
  const terms = g.map((b, i) => (b ? r - i : null)).filter((e) => e != null);
  const sup = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸' };
  return terms.map((e) => (e === 0 ? '1' : e === 1 ? 'x' : `x${sup[e]}`)).join(' + ');
};

// ───── 画板 ─────
const CW = 30;
const RH = 36;
const X0 = 150;
const QY = 92; // 商
const DY = 134; // 被除数
const LY = 186; // 竖式第一行
const KEEP = 4; // 竖式只留最近 4 次异或

function board(sim, st, z) {
  const items = [];
  const len = sim.dividend.length;
  const n = sim.data.length;
  const X = (i) => X0 + i * CW;
  const row = (arr, from, cls, tone) => arr.map((b, j) => `<g transform="translate(${(from + j) * CW} 0)">${cell(CW - 4, RH - 8, String(b), { cls: typeof cls === 'function' ? cls(from + j) : cls, tone: typeof tone === 'function' ? tone(from + j) : tone, size: 14 })}</g>`).join('');
  const lab = (y, s) => txt(X0 - 14, y + RH / 2 - 2, s, 'bt-cap', 'end');

  // 商：做到第几次异或，就显示到那一位
  const shownX = Math.min(st.x ?? 0, sim.xors.length);
  const qUpTo = st.x == null ? -1 : shownX >= sim.xors.length ? n - 1 : sim.xors[shownX - 1]?.pos ?? -1;
  let qh = lab(0, z ? '商' : 'quotient');
  qh += `<g transform="translate(${X0} 0)">${row(sim.q.slice(0, qUpTo + 1), 0, '', (i) => (sim.q[i] ? 'violet' : ''))}</g>`;
  items.push({ k: 'q', x: 0, y: QY, html: qh });

  // 被除数：数据 + r 个 0
  let dh = lab(0, z ? '数据 + r 个 0' : 'data + r zeros');
  dh += `<g transform="translate(${X0} 0)">${row(sim.dividend, 0, '', (i) => (i < n ? 'blue' : 'amber'))}</g>`;
  dh += txt(X(len) + 14, RH / 2 - 2, `÷ ${toStr(sim.gen)}`, 'cr-div', 'start');
  items.push({ k: 'd', x: 0, y: DY, html: dh });
  items.push({ k: 'dline', x: 0, y: DY + RH - 4, html: `<line class="bl bl-axis" x1="${X0 - 4}" y1="0" x2="${X(len)}" y2="0"/>` });

  // 竖式：每次异或两行（⊕ 生成多项式、异或结果并「落下」下一位）
  const first = Math.max(0, shownX - KEEP);
  for (let k = first; k < shownX; k++) {
    const x = sim.xors[k];
    const y = LY + (k - first) * 2 * RH;
    const cur = k === shownX - 1;
    let g = txt(X(x.pos) - 10, RH / 2 - 2, '⊕', 'cr-op', 'end') + `<g transform="translate(${X0} 0)">${row(sim.gen, x.pos, cur ? 'hot' : '', 'violet')}</g>`;
    items.push({ k: `xg${k}`, x: 0, y, from: [0, y + RH], html: g });
    // 结果：异或后剩下的 r 位，加上落下来的下一位
    const end = Math.min(len, x.pos + sim.gen.length + 1);
    const res = x.snap.slice(x.pos + 1, end);
    let r = `<line class="bl bl-axis" x1="${X(x.pos) - 4}" y1="-4" x2="${X(x.pos + sim.gen.length)}" y2="-4"/>`;
    r += `<g transform="translate(${X0} 0)">${row(res, x.pos + 1, (i) => (i === x.pos + sim.gen.length ? 'dim' : cur ? 'ok' : ''), '')}</g>`;
    items.push({ k: `xr${k}`, x: 0, y: y + RH, from: [0, y + 2 * RH], html: r });
  }
  if (first > 0) items.push({ k: 'more', x: X0, y: LY - 12, html: txt(0, 0, z ? `（前面还有 ${first} 次异或）` : `(${first} earlier XORs)`, 'bt-dim', 'start') });

  // 余数和发送的帧
  const FY = LY + KEEP * 2 * RH + 20;
  if (st.done) {
    let f = lab(0, z ? '余数 = 冗余码' : 'remainder = FCS') + `<g transform="translate(${X0} 0)">${row(sim.rem, n, 'hot', 'rose')}</g>`;
    items.push({ k: 'rem', x: 0, y: FY, html: f });
    let fr = lab(0, z ? '发送的帧' : 'frame sent') + `<g transform="translate(${X0} 0)">${row(sim.frame, 0, '', (i) => (i < n ? 'blue' : 'rose'))}</g>`;
    items.push({ k: 'frame', x: 0, y: FY + RH + 6, html: fr });
  }
  // 接收方
  if (st.recv) {
    const RY = FY + 2 * RH + 34;
    let h = lab(0, z ? '收到的帧' : 'frame received') + `<g transform="translate(${X0} 0)">${row(sim.recvBits, 0, (i) => (sim.flips.includes(i) ? 'bad' : ''), (i) => (sim.flips.includes(i) ? '' : i < n ? 'blue' : 'rose'))}</g>`;
    h += txt(X(len) + 14, RH / 2 - 2, `÷ ${toStr(sim.gen)}`, 'cr-div', 'start');
    items.push({ k: 'recv', x: 0, y: RY, html: h });
    const okCls = sim.accepted ? (sim.missed ? 'bad' : 'ok') : 'bad';
    let rr = lab(0, z ? '余数' : 'remainder') + `<g transform="translate(${X0} 0)">${row(sim.recvRem, len - sim.r, okCls, '')}</g>`;
    rr += txt(X(len) + 14, RH / 2 - 2, sim.accepted ? (sim.missed ? (z ? '余数为 0，可帧是错的：漏检' : 'zero, yet corrupted: missed') : z ? '余数为 0：接受' : 'zero: accept') : z ? '余数不为 0：有错，丢弃' : 'non-zero: discard', `cr-verdict ${okCls}`, 'start');
    items.push({ k: 'rrem', x: 0, y: RY + RH + 6, html: rr });
  }
  return items;
}

// ───── 原理 ─────
export const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('差错从哪来，怎么检测', 'Where errors come from'),
      blocks: [
        { p: T('信号在线路上会受到噪声干扰，接收端可能把 0 判成 1、把 1 判成 0，这叫**比特差错**。数据链路层常用**检错编码**：发送方按规则在数据后面加上冗余位，接收方用同样的规则检查，对不上就说明出错了。', 'Noise can flip bits in transit. Link layers add **redundant bits** by a fixed rule; the receiver checks the rule and knows when something went wrong.') },
        {
          table: {
            head: [T('方法', 'Method'), T('做法', 'How'), T('能力', 'Power')],
            rows: [
              [T('奇偶校验', 'Parity'), T('加 1 位，让 1 的个数为奇数（或偶数）', 'one bit making the count of 1s odd or even'), T('只能查出奇数个比特错', 'catches only an odd number of flips')],
              [T('循环冗余校验 CRC', 'CRC'), T('数据后加 r 位余数，使整串能被生成多项式整除', 'append r remainder bits so the frame divides evenly'), T('检错能力强，硬件实现简单，以太网等广泛使用', 'strong, cheap in hardware, used by Ethernet')],
              [T('海明码', 'Hamming code'), T('多个校验位，各管一组数据位', 'several parity bits over overlapping groups'), T('能纠正 1 位错（纠错码）', 'corrects single-bit errors')],
            ],
          },
        },
      ],
    },
    {
      id: 'mod2',
      title: T('模 2 运算与生成多项式', 'Modulo-2 arithmetic and the generator'),
      blocks: [
        { p: T('CRC 用的是**模 2 运算**：加法和减法都等于按位异或（0⊕0 = 0，0⊕1 = 1，1⊕1 = 0），没有进位和借位。除法就是一次次「对齐、异或」。', 'CRC uses **modulo-2 arithmetic**: addition and subtraction are both XOR, with no carries or borrows. Division is repeated align-and-XOR.') },
        { p: T('**生成多项式** G(x) 的系数就是一串比特。例如 G(x) = x³ + x² + 1，各项系数从高到低是 1、1、0、1，写成 1101。它的阶数 r = 3，冗余码就有 3 位。', 'The **generator** G(x) is a bit string of coefficients: x³ + x² + 1 is 1101. Its degree r = 3 gives a 3-bit check value.') },
      ],
    },
    {
      id: 'send',
      title: T('发送方：求冗余码', 'Sender: computing the check value'),
      blocks: [
        {
          steps: [
            T('在数据后面补 r 个 0（相当于乘以 2^r）；', 'Append r zeros to the data (multiply by 2^r);'),
            T('用生成多项式对它做模 2 除法：被除数当前最高位是 1，商记 1，和生成多项式异或；是 0，商记 0，直接往后移一位；', 'Divide by the generator modulo 2: a leading 1 means quotient bit 1 and an XOR, a leading 0 means quotient bit 0 and a shift;'),
            T('最后剩下的 r 位余数就是**冗余码（FCS）**，接在数据后面一起发送。', 'The final r-bit remainder is the **FCS**, appended to the data.'),
          ],
        },
        { tip: T('余数一定要写满 r 位，前面的 0 不能省。例如 r = 3、余数为 1，冗余码要写成 001。', 'Always write r bits: a remainder of 1 with r = 3 is 001.') },
        { warn: T('商在 CRC 里没有用，只用余数。', 'The quotient is discarded; only the remainder matters.') },
      ],
    },
    {
      id: 'recv',
      title: T('接收方：检验', 'Receiver: checking'),
      blocks: [
        { p: T('发送的帧 = 数据 × 2^r + 余数，它一定能被 G 整除。接收方把收到的整串（不再补 0）直接除以 G：余数为 0 就认为没错、接受；不为 0 就说明出错，**丢弃**这一帧。', 'The frame equals data × 2^r + remainder, so it divides evenly by G. The receiver divides the frame as received (no extra zeros): zero means accept, anything else means **discard**.') },
        { p: T('只要错误模式（发送的和收到的按位异或）不是 G 的倍数，就一定能查出来。所以 CRC 不是百分之百可靠，但选好生成多项式后，漏检的概率极小。', 'An error goes unnoticed only when the error pattern is a multiple of G, which is very unlikely with a well-chosen generator.') },
        { warn: T('CRC 只能**检错**，不能纠错；而且数据链路层用了 CRC 只是做到「无比特差错」，不等于「可靠传输」——帧丢失、重复、失序要靠确认和重传来解决。', 'CRC only **detects** errors. A link with CRC has no undetected bit errors, but that is not reliable delivery: lost, duplicated or reordered frames need acknowledgements and retransmission.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('补 0 的个数是生成多项式的**阶数** r，等于位数减 1，不是位数。', 'Append r zeros, the **degree**, which is one less than the bit count.'),
            T('多项式写比特串时，缺的项要补 0：x⁴ + x + 1 是 10011。', 'Missing terms are 0 bits: x⁴ + x + 1 is 10011.'),
            T('接收方不再补 0，直接用收到的整串去除。', 'The receiver does not append zeros.'),
            T('异或时只看当前最高位：最高位是 0 就商 0、不异或。', 'Only the leading bit decides: 0 means no XOR.'),
          ],
        },
      ],
    },
  ],
};

const kit = stepKit({ spec: SPEC, rowsName: T('除法过程', 'Division') });

function build(params) {
  const sim = crc({ data: params.data, gen: params.gen, flips: params.flips ?? [] });
  const lesson = {
    id: 'crc',
    kit,
    where: [['net', 'link']],
    tag: 'CRC',
    name: T('CRC 循环冗余校验', 'Cyclic redundancy check'),
    full: T('检错编码 · 模 2 除法 · 生成多项式 · 冗余码 · 接收方检验', 'Error detection · modulo-2 division · generator · FCS · checking'),
    title: sim.ok ? T(`${params.data} ÷ ${params.gen}`, `${params.data} ÷ ${params.gen}`) : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: [
      ['blue', T('数据', 'Data')],
      ['amber', T('补的 0', 'Zeros')],
      ['violet', T('生成多项式', 'Generator')],
      ['rose', T('冗余码', 'FCS')],
    ],
    principle: PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: {
      desc: T(
        '发送方在数据后面补 0，用生成多项式做模 2 除法，余数就是冗余码；接收方把收到的整串再除一次，余数为 0 才接受。这节课照课本竖式一步步做除法，再故意翻转几位，看哪些错误能查出来、哪些查不出来。',
        'The sender appends zeros, divides by the generator modulo 2 and sends the remainder as the check value; the receiver divides again and accepts only a zero remainder. The lesson works the long division step by step, then flips bits to see which errors are caught.',
      ),
      facts: sim.ok ? [[T('生成多项式', 'Generator'), `${poly(sim.gen)}（${toStr(sim.gen)}）`], [T('阶数 r', 'Degree r'), String(sim.r)]] : [],
    },
    start: { nodes: [], frame: { rect: [10, 10, X0 + (sim.ok ? sim.dividend.length : 12) * CW + 230, LY + KEEP * 2 * RH + 20 + 4 * RH + 60] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const n = sim.data.length;
  const list = [
    {
      title: T(`补 ${sim.r} 个 0`, `Append ${sim.r} zeros`),
      desc: T(`G = ${poly(sim.gen)}，阶数 ${sim.r}`, `G = ${poly(sim.gen)}, degree ${sim.r}`),
      detail: T(`生成多项式 ${poly(sim.gen)} 写成比特串是 ${toStr(sim.gen)}，共 ${sim.gen.length} 位，阶数 r = ${sim.r}。数据 ${toStr(sim.data)} 后面补 ${sim.r} 个 0，得到被除数 ${toStr(sim.dividend)}。`, `G = ${poly(sim.gen)} is ${toStr(sim.gen)}, ${sim.gen.length} bits, degree r = ${sim.r}. Appending ${sim.r} zeros gives ${toStr(sim.dividend)}.`),
      ref: 'mod2',
      st: { x: 0 },
      row: { color: 'amber', what: T('补 0', 'Append zeros'), result: toStr(sim.dividend), tone: 'info' },
    },
  ];
  let lastPos = -1;
  sim.xors.forEach((x, k) => {
    const from = lastPos + 1;
    const to = x.pos - 1;
    lastPos = x.pos;
    const pre = to < from ? { zh: '', en: '' } : to === from ? T(`第 ${from} 位是 0，商记 0，不异或。`, `Bit ${from} is 0: quotient 0, no XOR. `) : T(`第 ${from}～${to} 位都是 0，商记 0，不异或。`, `Bits ${from}–${to} are 0: quotient 0, no XOR. `);
    const body = T(`第 ${x.pos} 位是 1，商记 1：${toStr(x.before)} ⊕ ${toStr(sim.gen)} = ${toStr(x.after)}。整串变成 ${toStr(x.snap)}。`, `Bit ${x.pos} is 1, quotient 1: ${toStr(x.before)} ⊕ ${toStr(sim.gen)} = ${toStr(x.after)}. Now ${toStr(x.snap)}.`);
    list.push({
      title: T(`第 ${k + 1} 次异或：第 ${x.pos} 位`, `XOR ${k + 1}: at bit ${x.pos}`),
      desc: T(`${toStr(x.before)} ⊕ ${toStr(sim.gen)} = ${toStr(x.after)}`, `${toStr(x.before)} ⊕ ${toStr(sim.gen)} = ${toStr(x.after)}`),
      detail: { zh: pre.zh + body.zh, en: pre.en + body.en },
      ref: 'send',
      st: { x: k + 1 },
      row: { color: 'violet', what: T(`异或 @${x.pos}`, `XOR @${x.pos}`), result: toStr(x.after), tone: 'info' },
    });
  });
  const tailZeros = n - 1 - lastPos;
  list.push({
    title: T(`余数 ${toStr(sim.rem)} 就是冗余码`, `Remainder ${toStr(sim.rem)} is the FCS`),
    desc: T(`发送 ${toStr(sim.frame)}`, `Send ${toStr(sim.frame)}`),
    detail: T(`${tailZeros > 0 ? `最后 ${tailZeros} 位商为 0。` : ''}商是 ${toStr(sim.q)}（不用），余数是 ${toStr(sim.rem)}，写满 ${sim.r} 位。把它接在数据后面，发送的帧是 ${toStr(sim.data)} ${toStr(sim.rem)}。`, `${tailZeros > 0 ? `The last ${tailZeros} quotient bit(s) are 0. ` : ''}Quotient ${toStr(sim.q)} (unused), remainder ${toStr(sim.rem)} (${sim.r} bits). The frame sent is ${toStr(sim.data)} ${toStr(sim.rem)}.`),
    ref: 'send',
    st: { x: sim.xors.length, done: true },
    facts: [[T('商', 'Quotient'), toStr(sim.q)], [T('冗余码', 'FCS'), toStr(sim.rem)]],
    row: { color: 'rose', what: T('冗余码', 'FCS'), result: toStr(sim.rem), tone: 'ok' },
  });
  const flipTxt = sim.flips.length ? T(`传输中第 ${sim.flips.join('、')} 位翻转了，收到 ${toStr(sim.recvBits)}。`, `Bits ${sim.flips.join(', ')} flipped; received ${toStr(sim.recvBits)}. `) : T('传输中没有出错，收到的就是发送的帧。', 'No errors in transit. ');
  const verdict = sim.accepted
    ? sim.missed
      ? T(`余数是 ${toStr(sim.recvRem)}，接收方以为没错——可这一帧其实坏了。错误模式恰好是生成多项式的倍数，CRC 检测不出来。`, `Remainder ${toStr(sim.recvRem)}: the receiver accepts a corrupted frame, because the error pattern is a multiple of the generator.`)
      : T(`余数是 ${toStr(sim.recvRem)}，全为 0，接受这一帧。`, `Remainder ${toStr(sim.recvRem)}: accepted.`)
    : T(`余数是 ${toStr(sim.recvRem)}，不为 0，说明出错，丢弃这一帧。`, `Remainder ${toStr(sim.recvRem)} is non-zero: the frame is discarded.`);
  list.push({
    title: sim.accepted ? (sim.missed ? T('余数为 0，但错误没查出来', 'Zero remainder, error missed') : T('接收方检验：余数为 0，接受', 'Receiver: zero, accept')) : T('接收方检验：余数不为 0，丢弃', 'Receiver: non-zero, discard'),
    desc: T(`余数 ${toStr(sim.recvRem)}`, `Remainder ${toStr(sim.recvRem)}`),
    detail: { zh: flipTxt.zh + `接收方不补 0，把整串除以 ${toStr(sim.gen)}。` + verdict.zh, en: flipTxt.en + `It divides the whole frame by ${toStr(sim.gen)}. ` + verdict.en },
    ref: 'recv',
    st: { x: sim.xors.length, done: true, recv: true },
    row: { color: sim.accepted && !sim.missed ? 'green' : 'rose', what: T('接收方检验', 'Receiver check'), result: sim.accepted ? (sim.missed ? T('漏检', 'missed') : T('接受', 'accept')) : T('丢弃', 'discard'), tone: sim.accepted && !sim.missed ? 'ok' : 'warn' },
  });
  const built = toSteps(list, (k, z) => board(sim, k < 0 ? {} : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = {
    title: T(`冗余码 ${toStr(sim.rem)}`, `FCS ${toStr(sim.rem)}`),
    text: T('在「传输中翻转的位」里填几个位置再看一遍：大多数错误都能查出来，只有错误模式是生成多项式倍数的那些会漏掉。', 'Flip some bits and run it again: almost every error is caught, except patterns that are multiples of the generator.'),
    facts: [[T('发送的帧', 'Frame'), toStr(sim.frame)], [T('接收方', 'Receiver'), sim.accepted ? (sim.missed ? T('漏检', 'missed') : T('接受', 'accept')) : T('丢弃', 'discard')]],
  };
  return lesson;
}

export const makeCrc = () => parametric('crc', SPEC.presets[0].set, build);
