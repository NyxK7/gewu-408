// 数据的表示和运算的六节课：四种编码、补码加减与溢出、定点乘法、定点除法、浮点数加减、大端小端与边界对齐。
// 都画成平面的位格子和寄存器表。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { addsub, divide, encodings, endian, floatAdd, mantStr, multiply, parseMant, parseStruct, tc } from './arith.js';

const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
function make(id, spec, ERR, build) {
  const kit = stepKit({ spec, rowsName: T('过程', 'Steps') });
  return () => parametric(id, spec.presets[0].set, (p) => build(p, kit, ERR));
}
function shell(id, kit, ERR, sim, o) {
  return { id, kit, where: [['co', 'data']], tag: o.tag, name: o.name, full: o.full, title: o.title, nodes: [], legend: o.legend, principle: o.principle, sim, errors: sim.ok ? [] : errOf(ERR, sim.errors), overview: { desc: o.desc, facts: o.facts ?? [] }, start: { nodes: [], frame: { rect: o.rect ?? [0, 40, 900, 520] }, events: [] }, steps: [], outro: { title: '', text: '', facts: [] } };
}
function finish(lesson, list, board, title, text, facts = []) {
  const b = toSteps(list, board);
  lesson.steps = b.steps;
  lesson.start.events = b.start;
  lesson.outro = { title, text, facts };
  return lesson;
}
const BW = 30;
/** 一排位格子；cls(i, ch) 给每一位上色；dot 在第几位后面画小数点 */
const bitRow = (s, cls = () => ({}), { w = BW, dot = -1, gapAt = [] } = {}) => {
  let x = 0;
  let h = '';
  [...s].forEach((ch, i) => {
    if (gapAt.includes(i)) x += 8;
    h += `<g transform="translate(${x} 0)">${cell(w - 4, 28, ch, { size: 14, ...cls(i, ch) })}</g>`;
    x += w;
    if (i === dot) {
      h += txt(x - 1, 24, '.', 'ar-dot');
      x += 8;
    }
  });
  return h;
};
const label = (s, cls = 'bt-cap') => txt(-14, 19, s, cls, 'end');
const intIn = (lo, hi) => (s) => (/^-?\d+$/.test(s) && +s >= lo && +s <= hi ? +s : NaN);

// ═════════════════════════ 四种编码 ═════════════════════════

const ENC_PRINCIPLE = {
  sections: [
    {
      id: 'num',
      title: T('真值和机器数', 'True values and machine numbers'),
      blocks: [
        { p: T('带正负号的数叫**真值**，把符号也用 0（正）、1（负）表示后存进机器里的叫**机器数**。定点整数的小数点约定在最低位之后，定点小数约定在符号位之后。n 位机器数有 2^n 种状态，四种编码只是「怎样把这些状态分给正数和负数」不同。', 'A signed value is the **true value**; with the sign stored as 0/1 it becomes a **machine number**. The four encodings differ only in how the 2^n patterns are assigned.') },
      ],
    },
    {
      id: 'four',
      title: T('四种编码怎么写', 'Writing the four codes'),
      blocks: [
        {
          table: {
            head: [T('编码', 'Code'), T('正数', 'Positive'), T('负数', 'Negative'), T('0', 'Zero')],
            rows: [
              [T('原码', 'Sign-magnitude'), T('符号 0 + 绝对值', '0 + magnitude'), T('符号 1 + 绝对值', '1 + magnitude'), T('+0 和 −0 两种', 'two zeros')],
              [T('反码', 'Ones’ complement'), T('同原码', 'same'), T('原码符号位不变、数值位取反', 'invert magnitude bits'), T('两种', 'two zeros')],
              [T('补码', 'Two’s complement'), T('同原码', 'same'), T('反码末位加 1（或：2^n + 真值）', 'ones’ complement + 1 (or 2^n + x)'), T('唯一', 'one zero')],
              [T('移码', 'Excess (biased)'), T('真值 + 偏置值 2^(n−1)', 'x + 2^(n−1)'), T('同左', 'same'), T('唯一', 'one zero')],
            ],
          },
        },
        { tip: T('补码求法的快捷方式：从右往左找到第一个 1，它和它右边的位不变，左边的数值位全部取反（符号位为 1）。移码就是补码的符号位取反。', 'Shortcut: keep bits up to and including the rightmost 1, invert the rest. Excess code = two’s complement with the sign bit flipped.') },
      ],
    },
    {
      id: 'range',
      title: T('表示范围', 'Ranges'),
      blocks: [
        {
          table: {
            head: [T('n 位整数', 'n-bit integers'), T('范围', 'Range'), T('8 位时', 'For n = 8')],
            rows: [
              [T('原码、反码', 'Sign-magnitude, ones’'), '−(2^(n−1) − 1) ～ 2^(n−1) − 1', '−127 ～ 127'],
              [T('补码、移码', 'Two’s, excess'), '−2^(n−1) ～ 2^(n−1) − 1', '−128 ～ 127'],
              [T('无符号数', 'Unsigned'), '0 ～ 2^n − 1', '0 ～ 255'],
            ],
          },
        },
        { p: T('补码比原码多表示一个数：1000…0 在补码里是 −2^(n−1)，在原码里是 −0。', 'Two’s complement gains one value: 100…0 is −2^(n−1) instead of −0.') },
      ],
    },
    {
      id: 'why',
      title: T('为什么用补码', 'Why two’s complement'),
      blocks: [
        { p: T('补码让减法变成加法：[A − B]补 = [A]补 + [−B]补，符号位也一起参加运算，加法器不用区分正负。**移码**的大小顺序和真值一致（全 0 最小、全 1 最大），所以浮点数的阶码用移码，比较大小方便。**无符号数和补码**用的是同一套加法电路，只是解释位串的方式不同。', 'Subtraction becomes addition and the sign bit joins in. **Excess code** preserves order, so floating-point exponents use it. Unsigned and signed share the adder; only interpretation differs.') },
        { tip: T('C 语言里 int 转 unsigned（或反过来）时位串不变，只是换一种解释：例如 8 位的 −1 当成无符号数就是 255。', 'C casts between int and unsigned keep the bits: −1 in 8 bits reads as 255.') },
      ],
    },
    pit([
      T('反码、补码的「取反」只对数值位，符号位不变。', 'Only magnitude bits are inverted.'),
      T('移码的偏置值一般是 2^(n−1)；IEEE 754 的阶码偏置值是 2^(n−1) − 1，不一样。', 'IEEE 754 uses bias 2^(n−1) − 1.'),
      T('[−x]补 不是 [x]补 的符号位取反，而是连同符号位一起取反末位加 1。', '[−x] is all bits inverted plus 1.'),
    ]),
  ],
};
const ENC_SPEC = {
  presets: [
    { label: T('−5，8 位', '−5, 8 bits'), set: { x: -5, n: 8 } },
    { label: T('−128：只有补码能表示', '−128: two’s complement only'), set: { x: -128, n: 8 } },
    { label: T('+37', '+37'), set: { x: 37, n: 8 } },
  ],
  groups: [{ legend: T('真值', 'Value'), fields: [
    { name: 'x', label: T('整数真值', 'Integer'), type: 'text', parse: intIn(-32768, 32767) },
    { name: 'n', label: T('位数 n（含符号位）', 'Bits n (with sign)'), type: 'int', min: 4, max: 16 },
  ] }],
  note: T('都是 n 位定点整数，移码的偏置值取 2^(n−1)。', 'n-bit integers; the excess code uses bias 2^(n−1).'),
};
const ENC_ERR = { n: T('位数在 4～16', 'Use 4–16 bits'), x: T('超出 n 位补码的范围', 'Out of the n-bit range') };
/** 绝对值的二进制：放得进 n − 1 位数值位就写 n − 1 位，放不下（比如 8 位的 −128）就照实写 n 位 */
const magBin = (sim) => (sim.mag <= 2 ** (sim.n - 1) - 1 ? tc(sim.mag, sim.n - 1) : tc(sim.mag, sim.n));
function encBoard(sim, st, z) {
  const items = [];
  const rows = [
    ['mag', z ? '绝对值' : '|x|', magBin(sim).padStart(sim.n, '0')],
    ['sm', z ? '原码' : 'Sign-mag', sim.sm],
    ['oc', z ? '反码' : 'Ones’', sim.oc],
    ['two', z ? '补码' : 'Two’s', sim.two],
    ['ex', z ? '移码' : 'Excess', sim.ex],
  ];
  rows.forEach(([key, lab, s], i) => {
    if (i > st.k) return;
    const prev = i > 1 ? rows[i - 1][2] : null;
    const html = s == null ? label(lab) + cell(sim.n * BW - 4, 28, z ? '表示不了' : 'not representable', { cls: 'bad', size: 12 }) : label(lab, i === st.k ? 'ar-lab on' : 'ar-lab') + bitRow(s, (j, ch) => ({ tone: j === 0 && key !== 'mag' ? 'violet' : '', cls: i === st.k && prev && prev[j] !== ch ? 'hot' : '' }), { gapAt: key === 'mag' && sim.mag > 2 ** (sim.n - 1) - 1 ? [] : [1] }); // 放不下时这一行没有符号位，不留空
    items.push({ k: key, x: 160, y: 120 + i * 50, html });
  });
  if (st.k >= 5) {
    const R = sim.ranges;
    items.push({ k: 'range', x: 160, y: 380, html: txt(0, 0, z ? `${sim.n} 位：原码 / 反码 ${R.sm[0]} ～ ${R.sm[1]}，补码 / 移码 ${R.tc[0]} ～ ${R.tc[1]}，无符号 0 ～ ${R.u[1]}` : `${sim.n} bits: sign-mag ${R.sm[0]}…${R.sm[1]}, two’s ${R.tc[0]}…${R.tc[1]}, unsigned 0…${R.u[1]}`, 'bt-lab', 'start') + txt(0, 26, z ? `补码 ${sim.two} 当作无符号数是 ${sim.unsigned}` : `${sim.two} read unsigned is ${sim.unsigned}`, 'bt-cap', 'start') });
  }
  return items;
}
function buildEnc(p, kit, ERR) {
  const sim = encodings(p);
  const lesson = shell('encodings', kit, ERR, sim, {
    tag: T('编码', 'Code'),
    name: T('原码、反码、补码、移码', 'Number encodings'),
    full: T('真值与机器数 · 四种编码的求法 · 表示范围 · 无符号数', 'True values · four codes · ranges · unsigned'),
    title: sim.ok ? T(`${p.x}，${p.n} 位`, `${p.x}, ${p.n} bits`) : T('参数有误', 'Invalid parameters'),
    legend: [['violet', T('符号位', 'Sign bit')], ['orange', T('和上一行相比变了的位', 'Changed from the row above')]],
    principle: ENC_PRINCIPLE,
    desc: T('同一个整数，四种编码写出来不一样。这节课从绝对值出发，一行行写出原码、反码、补码、移码，每一行和上一行相比变了的位会标出来，最后对比几种编码的表示范围。', 'One integer, four encodings. Each row derives from the one above with the changed bits highlighted, ending with the ranges.'),
    rect: [40, 90, 160 + (sim.ok ? sim.n : 8) * BW + 260, 420],
  });
  if (!sim.ok) return lesson;
  const neg = sim.neg;
  const list = [
    { title: T(`|${sim.x}| = ${sim.mag} = ${magBin(sim)}₂`, `|x| = ${sim.mag} = ${magBin(sim)}₂`), desc: T(`${sim.n - 1} 位数值位`, `${sim.n - 1} magnitude bits`), detail: sim.mag > 2 ** (sim.n - 1) - 1 ? T(`绝对值 ${sim.mag} 化成二进制是 ${magBin(sim)}，要 ${sim.n} 位；而 ${sim.n} 位的原码、反码除去符号位只有 ${sim.n - 1} 位数值位，放不下，所以这两种编码表示不了 ${sim.x}。`, `${sim.mag} needs ${sim.n} bits, but sign-magnitude and ones’ complement have only ${sim.n - 1}.`) : T(`先把绝对值 ${sim.mag} 化成 ${sim.n - 1} 位二进制：${magBin(sim)}。`, `Write ${sim.mag} in ${sim.n - 1} bits.`), ref: 'num', st: { k: 0 }, row: { color: 'slate', what: T('绝对值', '|x|'), result: magBin(sim), tone: 'info' } },
    { title: sim.sm ? T(`原码 ${sim.sm}`, `Sign-magnitude ${sim.sm}`) : T('原码表示不了', 'No sign-magnitude form'), desc: T(`符号位 ${neg ? 1 : 0}`, `Sign ${neg ? 1 : 0}`), detail: sim.sm ? T(`符号位写 ${neg ? '1（负）' : '0（正）'}，后面接绝对值。`, `Sign bit then magnitude.`) : T(`原码最小只能到 ${sim.ranges.sm[0]}，${sim.x} 表示不了。`, `Out of range.`), ref: 'four', st: { k: 1 }, row: { color: 'violet', what: T('原码', 'Sign-mag'), result: sim.sm ?? '—', tone: sim.sm ? 'info' : 'warn' } },
    { title: sim.oc ? T(`反码 ${sim.oc}`, `Ones’ ${sim.oc}`) : T('反码表示不了', 'No ones’ form'), desc: neg ? T('数值位取反', 'Invert magnitude') : T('正数和原码一样', 'Same as sign-mag'), detail: sim.oc ? (neg ? T('负数：符号位不变，数值位逐位取反（标出的位）。', 'Negative: invert the magnitude bits.') : T('正数的反码、补码都和原码相同。', 'Positive: same as sign-magnitude.')) : T('和原码一样表示不了。', 'Same range as sign-magnitude.'), ref: 'four', st: { k: 2 }, row: { color: 'violet', what: T('反码', 'Ones’'), result: sim.oc ?? '—', tone: sim.oc ? 'info' : 'warn' } },
    { title: T(`补码 ${sim.two}`, `Two’s ${sim.two}`), desc: neg ? T('反码末位加 1', 'Ones’ + 1') : T('和原码一样', 'Same'), detail: neg ? T(`负数：反码末位加 1，或者直接算 2^${sim.n} + (${sim.x}) = ${2 ** sim.n + sim.x}，写成二进制 ${sim.two}。也可以从右往左找到第一个 1，它和右边不变、左边的数值位取反。`, `Ones’ complement plus 1, i.e. 2^${sim.n} + (${sim.x}) = ${2 ** sim.n + sim.x}.`) : T('正数的补码就是原码。', 'Positive: unchanged.'), ref: 'four', st: { k: 3 }, row: { color: 'violet', what: T('补码', 'Two’s'), result: sim.two, tone: 'ok' } },
    { title: T(`移码 ${sim.ex}`, `Excess ${sim.ex}`), desc: T('补码符号位取反', 'Flip the sign bit'), detail: T(`移码 = 真值 + 偏置值 2^${sim.n - 1} = ${sim.x} + ${sim.bias} = ${sim.x + sim.bias}，写成 ${sim.ex}。它正好是补码的符号位取反。移码越大真值越大，所以浮点数的阶码用它。`, `x + ${sim.bias} = ${sim.x + sim.bias}: two’s complement with the sign flipped.`), ref: 'why', st: { k: 4 }, row: { color: 'violet', what: T('移码', 'Excess'), result: sim.ex, tone: 'info' } },
    { title: T('表示范围', 'Ranges'), desc: T(`补码 ${sim.ranges.tc[0]} ～ ${sim.ranges.tc[1]}`, `Two’s ${sim.ranges.tc[0]}…${sim.ranges.tc[1]}`), detail: T(`${sim.n} 位：原码、反码 ${sim.ranges.sm[0]} ～ ${sim.ranges.sm[1]}（0 有两种表示）；补码、移码 ${sim.ranges.tc[0]} ～ ${sim.ranges.tc[1]}（多出一个 ${sim.ranges.tc[0]}）；无符号数 0 ～ ${sim.ranges.u[1]}。`, `Sign-mag ${sim.ranges.sm[0]}…${sim.ranges.sm[1]}; two’s ${sim.ranges.tc[0]}…${sim.ranges.tc[1]}; unsigned 0…${sim.ranges.u[1]}.`), ref: 'range', st: { k: 5 }, row: { color: 'green', what: T('范围', 'Range'), result: `${sim.ranges.tc[0]}～${sim.ranges.tc[1]}`, tone: 'ok' } },
  ];
  return finish(lesson, list, (k, z) => encBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), T(`补码 ${sim.two}`, `Two’s ${sim.two}`), T('试试 −128（8 位）：只有补码和移码写得出来。', 'Try −128 in 8 bits: only two’s and excess work.'));
}
export const makeEncodings = make('encodings', ENC_SPEC, ENC_ERR, buildEnc);

// ═════════════════════════ 补码加减与溢出 ═════════════════════════

const ADD_PRINCIPLE = {
  sections: [
    {
      id: 'adder',
      title: T('加法器', 'Adders'),
      blocks: [
        { p: T('一位**全加器**：Sᵢ = Aᵢ ⊕ Bᵢ ⊕ Cᵢ，Cᵢ₊₁ = AᵢBᵢ + (Aᵢ ⊕ Bᵢ)Cᵢ。n 个全加器串起来，低位的进位传给高位，就是**串行进位加法器**——要等进位一位一位传过去，慢。**先行进位**（并行进位）用 Gᵢ = AᵢBᵢ、Pᵢ = Aᵢ ⊕ Bᵢ 直接算出各位进位，快得多。', 'A **full adder**: S = A ⊕ B ⊕ C, C′ = AB + (A ⊕ B)C. Chaining n gives a **ripple-carry** adder; **carry-lookahead** computes carries from G = AB and P = A ⊕ B in parallel.') },
      ],
    },
    {
      id: 'sub',
      title: T('减法变加法', 'Subtraction by addition'),
      blocks: [
        { formula: T('[A − B]补 = [A]补 + [−B]补 = [A]补 + [B]补 取反 + 1', '[A − B] = [A] + ~[B] + 1') },
        { p: T('加法器里有一个控制端 Sub：做减法时把 B 的每一位取反（和 1 异或），同时让最低位的进位输入 Cin = 1，就完成了「取反加 1」。所以一套电路同时做加和减，有符号数和无符号数也共用。', 'A Sub control inverts B (XOR with 1) and sets Cin = 1, so one circuit adds and subtracts, signed or unsigned.') },
      ],
    },
    {
      id: 'flags',
      title: T('标志位', 'Flags'),
      blocks: [
        {
          table: {
            head: [T('标志', 'Flag'), T('含义', 'Meaning'), T('怎么得到', 'How')],
            rows: [
              ['OF', T('有符号数溢出', 'signed overflow'), 'OF = Cn ⊕ Cn−1'],
              ['SF', T('结果为负（有符号）', 'negative'), T('结果的最高位', 'top bit of the result')],
              ['ZF', T('结果为 0', 'zero'), T('结果全 0 时为 1', '1 if all bits are 0')],
              ['CF', T('无符号数的进位 / 借位', 'unsigned carry / borrow'), 'CF = Cn ⊕ Cin'],
            ],
          },
        },
        { tip: T('有符号数看 OF、SF；无符号数看 CF。无符号减法 A − B 时 CF = 1 表示 A < B（不够减，有借位）。', 'Signed comparisons use OF and SF; unsigned use CF. For A − B, CF = 1 means A < B.') },
      ],
    },
    {
      id: 'overflow',
      title: T('溢出的三种判断方法', 'Three overflow tests'),
      blocks: [
        {
          list: [
            T('**看符号**：两个同号数相加，结果的符号和它们不同，就溢出（正 + 正 得负、负 + 负 得正）；异号相加不会溢出。', '**Signs**: like-signed operands giving an opposite-signed result overflow.'),
            T('**一位符号位看进位**：符号位的进位 Cn 和最高数值位的进位 Cn−1 不同，就溢出：OF = Cn ⊕ Cn−1。', '**Carries**: OF = Cn ⊕ Cn−1.'),
            T('**双符号位（变形补码）**：用两位符号位运算，结果符号位是 00 正、11 负、**01 正溢出、10 负溢出**；最高的那一位才是真正的符号。', '**Double sign bits**: 01 positive overflow, 10 negative overflow.'),
          ],
        },
        { warn: T('溢出是针对有符号数说的。无符号数的「溢出」看 CF，两者没有关系：可以 OF = 1 而 CF = 0，也可以反过来。', 'Overflow (OF) is about signed numbers; CF is unsigned carry. They are independent.') },
      ],
    },
    pit([
      T('减法时 CF = Cn ⊕ 1，不是直接等于 Cn。', 'For subtraction CF = Cn ⊕ 1.'),
      T('补码加法最高位产生的进位要丢掉，它不是溢出。', 'The carry out of the top bit is discarded, not overflow.'),
      T('判断溢出要按有符号数来看，即使题目问的是 unsigned 变量的位串。', 'Overflow is a signed notion.'),
    ]),
  ],
};
const ADD_SPEC = {
  presets: [
    { label: T('正溢出：100 + 50', 'Overflow: 100 + 50'), set: { a: 100, b: 50, op: 'add', n: 8 } },
    { label: T('减法有借位：5 − 7', 'Borrow: 5 − 7'), set: { a: 5, b: 7, op: 'sub', n: 8 } },
    { label: T('负溢出：−100 − 50', 'Negative overflow'), set: { a: -100, b: 50, op: 'sub', n: 8 } },
    { label: T('不溢出：−20 + 35', 'No overflow'), set: { a: -20, b: 35, op: 'add', n: 8 } },
  ],
  groups: [{ legend: T('运算', 'Operation'), fields: [
    { name: 'a', label: 'A', type: 'text', parse: intIn(-32768, 32767) },
    { name: 'op', label: T('运算', 'Op'), type: 'select', options: [['add', 'A + B'], ['sub', 'A − B']] },
    { name: 'b', label: 'B', type: 'text', parse: intIn(-32768, 32767) },
    { name: 'n', label: T('位数 n', 'Bits n'), type: 'int', min: 4, max: 16 },
  ] }],
  note: T('A、B 是 n 位补码能表示的整数。减法按「加上 B 取反、末位进位输入 1」做。', 'A and B fit in n-bit two’s complement; subtraction adds ~B with carry-in 1.'),
};
const ADD_ERR = { n: T('位数在 4～16', 'Use 4–16 bits'), range: T('A、B 超出了 n 位补码的范围', 'A or B is out of range') };
function addBoard(sim, st, z) {
  const items = [];
  const n = sim.n;
  const X = 200;
  // 进位行
  if (st.k >= 2) {
    const c = sim.carries;
    let h = label('C', 'ar-lab');
    for (let i = 0; i <= n; i++) {
      const col = n - i; // 第 i 位进位画在第 i 位上方偏左
      const hot = (i === n || i === n - 1) && st.k >= 3;
      h += txt(col * BW + 13 - BW / 2, 18, String(c[i]), `ar-carry ${hot ? 'on' : ''}`);
    }
    items.push({ k: 'c', x: X, y: 110, html: h });
  }
  items.push({ k: 'a', x: X, y: 140, html: label(`[A]补 ${sim.a}`, 'ar-lab') + bitRow(sim.A) });
  const bLab = sim.op === 'sub' ? (st.k >= 1 ? (z ? `[B]补 取反` : '~[B]') : `[B]补 ${sim.b}`) : `[B]补 ${sim.b}`;
  items.push({ k: 'b', x: X, y: 180, html: label(bLab, 'ar-lab') + bitRow(sim.op === 'sub' && st.k >= 1 ? sim.B : sim.Bin, () => ({ cls: sim.op === 'sub' && st.k === 1 ? 'hot' : '' })) + txt(n * BW + 10, 19, sim.op === 'sub' && st.k >= 1 ? (z ? '+ 1（Cin）' : '+ 1 (Cin)') : '+', 'ar-op', 'start') });
  items.push({ k: 'line', x: X, y: 216, html: `<line class="bl bl-axis" x1="-4" y1="0" x2="${n * BW}" y2="0"/>` });
  if (st.k >= 2) items.push({ k: 'r', x: X, y: 224, html: label(z ? '结果' : 'Result', 'ar-lab on') + bitRow(sim.R, (i) => ({ tone: i === 0 ? 'violet' : 'teal' })) + txt(n * BW + 10, 19, z ? `有符号 ${sim.signed}，无符号 ${sim.unsigned}` : `signed ${sim.signed}, unsigned ${sim.unsigned}`, 'ar-op', 'start') });
  if (st.k >= 3) {
    const f = sim.flags;
    const box = (name, v, i, hot) => `<g transform="translate(${i * 76} 0)">${cell(70, 44, '', { cls: hot ? (v ? 'bad' : 'ok') : '' })}${txt(35, 18, name, 'ar-flag')}${txt(35, 36, String(v), 'ar-flagv')}</g>`;
    items.push({ k: 'flags', x: X, y: 290, html: box('OF', f.OF, 0, true) + box('SF', f.SF, 1) + box('ZF', f.ZF, 2) + box('CF', f.CF, 3, st.k >= 4) });
  }
  if (st.k >= 5) {
    const d = sim.double;
    items.push({ k: 'dbl', x: X, y: 370, html: txt(-14, 0, z ? '双符号位' : 'Double sign', 'bt-cap', 'end') + txt(0, 0, `${d.a} ${sim.op === 'sub' ? '+' : '+'} ${d.b} = ${d.s}`, 'ar-mono', 'start') + txt(0, 24, d.over ? (z ? `两个符号位 ${d.s.slice(0, 2)} 不同：${d.s[0] === '0' ? '正溢出' : '负溢出'}` : `sign bits ${d.s.slice(0, 2)} differ: overflow`) : z ? `两个符号位 ${d.s.slice(0, 2)} 相同：没有溢出` : 'sign bits agree: no overflow', d.over ? 'ar-bad' : 'ar-ok', 'start') });
  }
  return items;
}
function buildAdd(p, kit, ERR) {
  const sim = addsub(p);
  const lesson = shell('addsub', kit, ERR, sim, {
    tag: T('加减', 'Add'),
    name: T('补码加减与溢出', 'Two’s complement add / sub and overflow'),
    full: T('全加器 · 减法变加法 · 进位链 · OF / SF / ZF / CF · 三种溢出判断', 'Full adders · subtraction · carry chain · flags · overflow tests'),
    title: sim.ok ? T(`${p.a} ${p.op === 'sub' ? '−' : '+'} ${p.b}，${p.n} 位`, `${p.a} ${p.op === 'sub' ? '−' : '+'} ${p.b}, ${p.n} bits`) : T('参数有误', 'Invalid parameters'),
    legend: [['violet', T('符号位', 'Sign bit')], ['orange', T('这一步变的', 'Changed')]],
    principle: ADD_PRINCIPLE,
    desc: T('加法器只会做加法：减法就把减数取反、最低位再加 1。这节课一位一位写出进位链，算出结果和四个标志位，再用双符号位核对有没有溢出——同一个位串当有符号数和无符号数看，结论可能完全不同。', 'The adder only adds: subtraction inverts B and adds 1. The carry chain, result and four flags are worked out, then double sign bits confirm overflow; signed and unsigned readings can disagree.'),
    rect: [20, 90, 200 + (sim.ok ? sim.n : 8) * BW + 260, 410],
  });
  if (!sim.ok) return lesson;
  const f = sim.flags;
  const list = [
    { title: T(`写出补码：A = ${sim.A}，B = ${sim.Bin}`, `Encode: A = ${sim.A}, B = ${sim.Bin}`), desc: T(`${sim.n} 位补码`, `${sim.n}-bit two’s complement`), detail: T(`[${sim.a}]补 = ${sim.A}，[${sim.b}]补 = ${sim.Bin}。`, `[${sim.a}] = ${sim.A}, [${sim.b}] = ${sim.Bin}.`), ref: 'sub', st: { k: 0 }, row: { color: 'slate', what: T('操作数', 'Operands'), result: `${sim.A} ${sim.Bin}`, tone: 'info' } },
    sim.op === 'sub'
      ? { title: T(`减法：B 取反 → ${sim.B}，Cin = 1`, `Subtract: ~B = ${sim.B}, Cin = 1`), desc: T('A − B = A + ~B + 1', 'A + ~B + 1'), detail: T(`做减法时加法器把 B 每一位取反（${sim.Bin} → ${sim.B}），并让最低位进位输入 Cin = 1，合起来就是 [−B]补。`, `Invert B and set Cin = 1: together they form [−B].`), ref: 'sub', st: { k: 1 }, row: { color: 'orange', what: '~B', result: sim.B, tone: 'info' } }
      : { title: T('加法：B 不变，Cin = 0', 'Add: B as is, Cin = 0'), desc: T('直接相加', 'Plain addition'), detail: T('做加法时 B 原样送进加法器，最低位进位输入 Cin = 0。', 'B goes in unchanged with Cin = 0.'), ref: 'adder', st: { k: 1 }, row: { color: 'slate', what: 'B', result: sim.B, tone: 'info' } },
    { title: T(`逐位相加：${sim.R}`, `Add bit by bit: ${sim.R}`), desc: T(`Cn = ${sim.Cn}，Cn−1 = ${sim.Cn1}`, `Cn = ${sim.Cn}, Cn−1 = ${sim.Cn1}`), detail: T(`从最低位开始，每位 Sᵢ = Aᵢ ⊕ Bᵢ ⊕ Cᵢ，进位传给高一位（第一行是各位的进位）。结果 ${sim.R}，当有符号数是 ${sim.signed}，当无符号数是 ${sim.unsigned}。最高位的进位 Cn = ${sim.Cn} 被丢掉。`, `Ripple through the full adders; result ${sim.R} (signed ${sim.signed}, unsigned ${sim.unsigned}).`), ref: 'adder', st: { k: 2 }, row: { color: 'teal', what: T('结果', 'Result'), result: sim.R, tone: 'info' } },
    { title: f.OF ? T(`OF = ${sim.Cn} ⊕ ${sim.Cn1} = 1：溢出`, `OF = 1: overflow`) : T(`OF = ${sim.Cn} ⊕ ${sim.Cn1} = 0：没有溢出`, `OF = 0`), desc: T(`真正的结果是 ${sim.exact}`, `True result ${sim.exact}`), detail: f.OF ? T(`符号位的进位 Cn = ${sim.Cn} 和最高数值位的进位 Cn−1 = ${sim.Cn1} 不同，有符号数溢出。真正的结果 ${sim.exact} 超出了 ${sim.n} 位补码的范围，机器里得到的 ${sim.signed} 是错的。SF = ${f.SF}，ZF = ${f.ZF}。`, `Cn and Cn−1 differ: ${sim.exact} does not fit; the stored ${sim.signed} is wrong.`) : T(`Cn = Cn−1 = ${sim.Cn}，没有溢出，${sim.signed} 就是正确结果。SF = ${f.SF}（${f.SF ? '负' : '非负'}），ZF = ${f.ZF}。`, `No overflow: ${sim.signed} is correct.`), ref: 'flags', st: { k: 3 }, row: { color: f.OF ? 'rose' : 'green', what: 'OF SF ZF', result: `${f.OF} ${f.SF} ${f.ZF}`, tone: f.OF ? 'warn' : 'ok' } },
    { title: T(`CF = ${sim.Cn} ⊕ ${sim.cin} = ${f.CF}`, `CF = ${f.CF}`), desc: T('无符号数的进位 / 借位', 'Unsigned carry / borrow'), detail: sim.op === 'sub' ? T(`当无符号数看：${sim.ua} − ${sim.ub}。${f.CF ? `${sim.ua} < ${sim.ub}，不够减，有借位，CF = 1。` : '够减，没有借位，CF = 0。'}`, `Unsigned ${sim.ua} − ${sim.ub}: ${f.CF ? 'borrow' : 'no borrow'}.`) : T(`当无符号数看：${sim.ua} + ${sim.ub} = ${sim.ua + sim.ub}，${f.CF ? `超过了 ${2 ** sim.n - 1}，有进位，CF = 1。` : '没有超过范围，CF = 0。'}`, `Unsigned ${sim.ua} + ${sim.ub}: ${f.CF ? 'carry' : 'no carry'}.`), ref: 'flags', st: { k: 4 }, row: { color: 'blue', what: 'CF', result: String(f.CF), tone: 'info' } },
    { title: T('用双符号位核对', 'Check with double sign bits'), desc: T(`符号位 ${sim.double.s.slice(0, 2)}`, `Sign bits ${sim.double.s.slice(0, 2)}`), detail: T(`把两个数扩成 ${sim.n + 1} 位（两位符号位）再算：${sim.double.a} + ${sim.double.b} = ${sim.double.s}。${sim.double.over ? `两个符号位不同，是${sim.double.s[0] === '0' ? '正' : '负'}溢出，和 OF 的结论一致。` : '两个符号位相同，没有溢出。'}`, `With two sign bits the result is ${sim.double.s}: ${sim.double.over ? 'overflow' : 'no overflow'}.`), ref: 'overflow', st: { k: 5 }, row: { color: 'violet', what: T('双符号位', 'Double sign'), result: sim.double.s.slice(0, 2), tone: sim.double.over ? 'warn' : 'ok' } },
  ];
  return finish(lesson, list, (k, z) => addBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), f.OF ? T('有符号数溢出', 'Signed overflow') : T('没有溢出', 'No overflow'), T('同一个位串，OF 和 CF 说的是两件事：一个管有符号数，一个管无符号数。', 'OF and CF answer different questions: signed versus unsigned.'), [['OF SF ZF CF', `${f.OF} ${f.SF} ${f.ZF} ${f.CF}`]]);
}
export const makeAddSub = make('addsub', ADD_SPEC, ADD_ERR, buildAdd);

// ═════════════════════════ 定点乘法 ═════════════════════════

const MUL_PRINCIPLE = {
  sections: [
    {
      id: 'idea',
      title: T('乘法就是「加 + 右移」', 'Multiplication is add and shift'),
      blocks: [
        { p: T('手算乘法是把被乘数按乘数的每一位错位相加。机器里只用一个 n 位加法器：从乘数最低位开始，每看一位，就决定部分积要不要加上被乘数，然后把部分积和乘数一起**右移**一位。n 步之后，部分积寄存器 A 和乘数寄存器 Q 拼起来就是 2n 位的乘积。', 'Look at one multiplier bit at a time, add the multiplicand to the partial product if needed, then shift right. After n steps A:Q holds the 2n-bit product.') },
      ],
    },
    {
      id: 'sm',
      title: T('原码一位乘', 'Sign-magnitude multiplication'),
      blocks: [
        {
          steps: [
            T('符号单独算：乘积符号 = 两数符号异或；下面只算绝对值；', 'sign = XOR of the signs; work with magnitudes;'),
            T('A 清 0，Q 放乘数，X 放被乘数；', 'A = 0, Q = multiplier, X = multiplicand;'),
            T('看 Q 的最低位：是 1 就 A = A + X（进位放在 C 里），是 0 就加 0；', 'if Q’s lowest bit is 1, A = A + X (carry into C);'),
            T('C、A、Q 一起**逻辑右移**一位；', 'shift C, A, Q right **logically**;'),
            T('重复 n 次。', 'repeat n times.'),
          ],
        },
      ],
    },
    {
      id: 'booth',
      title: T('补码一位乘（Booth 算法）', 'Booth’s algorithm'),
      blocks: [
        { p: T('补码乘法连符号一起算。在乘数最低位后面添一位 Q₋₁ = 0，每步看最低两位 Q₀Q₋₁：', 'Append Q₋₁ = 0 and look at Q₀Q₋₁ each step:') },
        {
          table: {
            head: ['Q₀ Q₋₁', T('操作', 'Action')],
            rows: [
              ['0 0', T('只右移', 'shift only')],
              ['0 1', T('A = A + [X]补，再右移', 'A += X, shift')],
              ['1 0', T('A = A + [−X]补，再右移', 'A −= X, shift')],
              ['1 1', T('只右移', 'shift only')],
            ],
          },
        },
        { p: T('右移是**算术右移**（最高位保持符号）。A 用双符号位防止中间结果溢出。Booth 的道理：一串连续的 1 等于「高位 + 1、低位 − 1」，所以只在 01、10 交界处做加减。', 'Shifts are **arithmetic**; A has a double sign bit. A run of 1s equals +1 at its top and −1 at its bottom, hence add or subtract only at 01 and 10 boundaries.') },
        { warn: T('教材常用定点小数做 Booth，要做 n + 1 次加减、n 次移位（最后一步不移位）。本课用整数，n 步都「判断 + 移位」，得到的是同一个乘积。', 'Textbooks often use fractions with n + 1 additions and n shifts; this lesson uses integers with n add-and-shift steps — the product is the same.') },
      ],
    },
    {
      id: 'hw',
      title: T('硬件与阵列乘法器', 'Hardware'),
      blocks: [
        { p: T('乘法器需要：加法器、部分积寄存器 A、乘数寄存器 Q、被乘数寄存器 X、计数器（控制 n 次）。阵列乘法器用很多个全加器排成阵列，一次算出全部部分积，速度快但硬件多。', 'A multiplier needs an adder, registers A, Q, X and a counter; array multipliers trade hardware for speed.') },
        { tip: T('乘积有 2n 位。C 语言里两个 int 相乘只保留低 n 位，高 n 位不全是符号位时就溢出了。', 'The product has 2n bits; C keeps only the low n, overflowing when the high half is not a sign extension.') },
      ],
    },
    pit([
      T('原码一位乘是逻辑右移，Booth 是算术右移。', 'Sign-magnitude shifts logically; Booth arithmetically.'),
      T('Booth 看的是 Q₀Q₋₁ 两位，「10 减、01 加」别记反。', 'Booth: 10 subtracts, 01 adds.'),
    ]),
  ],
};
const MUL_SPEC = {
  presets: [
    { label: T('原码一位乘：13 × 11', 'Sign-mag: 13 × 11'), set: { x: 13, y: 11, n: 4, method: 'sm' } },
    { label: T('Booth：−3 × 5', 'Booth: −3 × 5'), set: { x: -3, y: 5, n: 4, method: 'booth' } },
    { label: T('Booth：5 × −6', 'Booth: 5 × −6'), set: { x: 5, y: -6, n: 4, method: 'booth' } },
  ],
  groups: [{ legend: T('乘法', 'Multiplication'), fields: [
    { name: 'method', label: T('方法', 'Method'), type: 'select', options: [['sm', T('原码一位乘', 'sign-magnitude')], ['booth', T('Booth（补码一位乘）', 'Booth (two’s complement)')]], wide: true },
    { name: 'x', label: T('被乘数 X', 'Multiplicand X'), type: 'text', parse: intIn(-255, 255) },
    { name: 'y', label: T('乘数 Y', 'Multiplier Y'), type: 'text', parse: intIn(-255, 255) },
    { name: 'n', label: T('位数 n', 'Bits n'), type: 'int', min: 3, max: 8 },
  ] }],
  note: T('原码一位乘：n 是数值位数，符号另算。Booth：X、Y 是 n 位补码，A 用 n + 1 位（双符号位）。', 'Sign-magnitude: n magnitude bits. Booth: n-bit two’s complement, A has n + 1 bits.'),
};
const MUL_ERR = { n: T('位数在 3～8', 'Use 3–8 bits'), range: T('X、Y 超出了 n 位能表示的范围', 'X or Y is out of range') };
function mulBoard(sim, k, z) {
  const items = [];
  const n = sim.n;
  const sm = sim.method === 'sm';
  const cols = sm ? ['C', 'A', 'Q'] : ['A', 'Q', 'Q₋₁'];
  const w = sm ? [30, n * 18 + 16, n * 18 + 16] : [(n + 1) * 18 + 16, n * 18 + 16, 40];
  const xs = [0, w[0] + 8, w[0] + w[1] + 16];
  const X0 = 260;
  let head = cols.map((c, i) => txt(xs[i] + w[i] / 2, 0, c, 'bt-cap')).join('') + txt(xs[2] + w[2] + 20, 0, z ? '说明' : 'Note', 'bt-cap', 'start');
  items.push({ k: 'head', x: X0, y: 120, html: head });
  const fmt = (st) => (sm ? [String(st.C ?? 0), tc(st.A, n), tc(st.Q, n)] : [tc(st.A, n + 1), tc(st.Q, n), String(st.q1)]);
  const rows = [{ vals: sm ? ['0', tc(0, n), tc(Math.abs(sim.y), n)] : [tc(0, n + 1), tc(sim.y, n), '0'], note: z ? '初始' : 'start' }];
  sim.steps.slice(0, k + 1).forEach((s) => {
    if (s.op !== 'none') rows.push({ vals: sm ? [String(s.added.C), tc(s.added.A, n), tc(s.added.Q, n)] : [tc(s.added.A, n + 1), tc(s.added.Q, n), String(s.added.q1)], note: sm ? `+X（Q₀ = 1）` : s.op === 'add' ? `${s.pair}：+[X]补` : `${s.pair}：+[−X]补`, add: true, i: s.i });
    rows.push({ vals: fmt(sm ? { C: 0, A: s.A, Q: s.Q } : s), note: (s.op === 'none' ? (sm ? 'Q₀ = 0，' : `${s.pair}，`) : '') + (z ? (sm ? '逻辑右移' : '算术右移') : sm ? 'shift right' : 'arith. shift'), shift: true, i: s.i });
  });
  const KEEP = 11;
  rows.slice(-KEEP).forEach((r, j) => {
    const cur = r.i === k;
    let h = r.vals.map((v, i) => `<g transform="translate(${xs[i]} 0)">${cell(w[i], 26, v, { size: 13, cls: cur ? (r.add ? 'hot' : 'ok') : '' })}</g>`).join('');
    h += txt(xs[2] + w[2] + 20, 18, r.note, cur ? 'ar-note on' : 'ar-note', 'start');
    items.push({ k: `r${rows.length - Math.min(rows.length, KEEP) + j}`, x: X0, y: 134 + j * 32, html: h });
  });
  const X = sm ? sim.X : sim.x;
  items.push({ k: 'x', x: X0, y: 96, html: txt(-14, 0, '', 'bt-cap') + txt(0, 0, sm ? `X = ${tc(X, n)}（|${sim.x}|）` : `[X]补 = ${tc(sim.x, n + 1)}，[−X]补 = ${tc(-sim.x, n + 1)}`, 'ar-mono', 'start') });
  if (k === sim.steps.length - 1) {
    const last = sim.steps.at(-1);
    const prod = sm ? `${sim.sign ? '1' : '0'}，${tc(last.A, n)} ${tc(last.Q, n)}` : `${tc(last.A, n + 1).slice(1)} ${tc(last.Q, n)}`;
    items.push({ k: 'res', x: X0, y: 134 + Math.min(rows.length, KEEP) * 32 + 16, html: txt(0, 0, z ? `乘积 ${prod} = ${sim.product}` : `Product ${prod} = ${sim.product}`, 'bt-formula cur', 'start') });
  }
  return items;
}
function buildMul(p, kit, ERR) {
  const sim = multiply({ ...p, x: +p.x, y: +p.y });
  const lesson = shell('multiply', kit, ERR, sim, {
    tag: T('乘法', 'Mul'),
    name: T('定点乘法：原码一位乘与 Booth', 'Fixed-point multiplication'),
    full: T('加和右移 · 原码一位乘 · 补码一位乘（Booth）· 乘法器硬件', 'Add and shift · sign-magnitude · Booth · hardware'),
    title: sim.ok ? T(`${p.x} × ${p.y}`, `${p.x} × ${p.y}`) : T('参数有误', 'Invalid parameters'),
    legend: [['orange', T('加法之后', 'After adding')], ['green', T('右移之后', 'After shifting')]],
    principle: MUL_PRINCIPLE,
    desc: T('机器做乘法只有一个加法器：每一步看乘数的最低位（Booth 看最低两位），决定部分积加不加被乘数，再右移一位。这节课照课本的寄存器表一行行写下 A、Q 的变化，n 步之后拼出乘积。', 'With one adder: inspect the multiplier’s low bit (two bits for Booth), add or not, shift. The register table records A and Q until the product appears.'),
    rect: [40, 70, 260 + (sim.ok ? sim.n : 4) * 40 + 280, 134 + 12 * 32 + 30],
  });
  if (!sim.ok) return lesson;
  const n = sim.n;
  const list = sim.steps.map((s, k) => ({
    title: sim.method === 'sm' ? T(`第 ${k + 1} 步：Q₀ = ${s.q0}，${s.q0 ? '加 X' : '不加'}，右移`, `Step ${k + 1}: Q₀ = ${s.q0}`) : T(`第 ${k + 1} 步：${s.pair} → ${s.op === 'add' ? '加 [X]补' : s.op === 'sub' ? '加 [−X]补' : '不加'}，右移`, `Step ${k + 1}: ${s.pair} → ${s.op}`),
    desc: sim.method === 'sm' ? T(`A ${tc(s.A, n)}，Q ${tc(s.Q, n)}`, `A ${tc(s.A, n)}, Q ${tc(s.Q, n)}`) : T(`A ${tc(s.A, n + 1)}，Q ${tc(s.Q, n)}，Q₋₁ ${s.q1}`, `A ${tc(s.A, n + 1)}, Q ${tc(s.Q, n)}`),
    detail: sim.method === 'sm' ? T(`乘数寄存器 Q 的最低位是 ${s.q0}，${s.q0 ? `部分积 A 加上被乘数 X = ${tc(sim.X, n)}` : '部分积不变'}；然后 C、A、Q 一起逻辑右移一位，Q 移出去的那一位已经用过了。`, `Q₀ = ${s.q0}: ${s.q0 ? 'add X' : 'no add'}, then shift C, A, Q right.`) : T(`Q₀Q₋₁ = ${s.pair}：${s.op === 'add' ? `A 加上 [X]补` : s.op === 'sub' ? `A 加上 [−X]补（也就是减 X）` : '不加不减'}；然后 A、Q、Q₋₁ 一起算术右移一位（A 的最高位复制一份）。`, `Q₀Q₋₁ = ${s.pair}: ${s.op}; then arithmetic shift.`),
    ref: sim.method === 'sm' ? 'sm' : 'booth',
    row: { color: s.op === 'none' ? 'slate' : 'orange', what: T(`第 ${k + 1} 步`, `Step ${k + 1}`), result: s.op === 'none' ? T('只移位', 'shift') : s.op === 'add' ? '+X' : '−X', tone: 'info' },
  }));
  const last = sim.steps.at(-1);
  return finish(lesson, list, (k, z) => mulBoard(sim, k, z), T(`${sim.x} × ${sim.y} = ${sim.product}`, `${sim.x} × ${sim.y} = ${sim.product}`), sim.method === 'sm' ? T(`符号位单独算：${sim.x < 0 ? 1 : 0} ⊕ ${sim.y < 0 ? 1 : 0} = ${sim.sign ? 1 : 0}；A、Q 拼起来是绝对值 ${sim.mag}。`, `Sign ${sim.sign ? 1 : 0}; A:Q is ${sim.mag}.`) : T(`A 去掉一位符号后和 Q 拼成 ${2 * n} 位补码 ${tc(last.A, n + 1).slice(1)}${tc(last.Q, n)}，就是 ${sim.product}。`, `A:Q gives ${sim.product} in ${2 * n} bits.`));
}
export const makeMultiply = make('multiply', MUL_SPEC, MUL_ERR, buildMul);

// ═════════════════════════ 定点除法 ═════════════════════════

const DIV_PRINCIPLE = {
  sections: [
    {
      id: 'idea',
      title: T('除法就是「左移 + 试减」', 'Division is shift and subtract'),
      blocks: [
        { p: T('手算除法每次把余数后面落下一位，看够不够减除数。机器里同样：余数寄存器 A 和商寄存器 Q 一起**左移**一位，再用 A 减去除数 Y——结果不为负就「够减」，商上 1；为负就「不够减」，商上 0。n 步得到 n 位商，A 里剩下的是余数。符号位单独异或。', 'Shift A:Q left, subtract the divisor: non-negative means quotient bit 1, negative means 0. After n steps Q holds the quotient and A the remainder; signs are XORed separately.') },
      ],
    },
    {
      id: 'restore',
      title: T('恢复余数法', 'Restoring division'),
      blocks: [
        { p: T('试减后余数为负，说明减多了，要再把除数**加回去**恢复原来的余数，然后商上 0。每次不够减都要多做一次加法，而且次数不固定，控制复杂。', 'If the trial remainder is negative, **add the divisor back** and record 0; the extra additions make timing irregular.') },
      ],
    },
    {
      id: 'nonrestore',
      title: T('加减交替法（不恢复余数法）', 'Non-restoring division'),
      blocks: [
        { p: T('不恢复余数：余数为负时先不加回去，下一步左移后改成**加**除数。因为「加回 Y 再左移再减 Y」等于「左移后加 Y」（2(R + Y) − Y = 2R + Y）。规则：', 'Skip the restore: after a negative remainder, the next step **adds** instead, since 2(R + Y) − Y = 2R + Y. Rule:') },
        {
          list: [
            T('余数 ≥ 0：商上 1，左移，减 Y；', 'remainder ≥ 0: quotient 1, shift, subtract Y;'),
            T('余数 < 0：商上 0，左移，加 Y；', 'remainder < 0: quotient 0, shift, add Y;'),
            T('最后一步余数为负时，要加一次 Y 恢复成正确的余数。', 'if the final remainder is negative, add Y once.'),
          ],
        },
        { tip: T('加减交替法每一步都是一次加或减加一次移位，步数固定，硬件好做，是实际用的方法。', 'Every step is one add/subtract and one shift: regular and practical.') },
      ],
    },
    pit([
      T('定点小数除法要求 |被除数| < |除数|，否则商会溢出。本课用整数演示，不受这个限制。', 'Fraction division needs |dividend| < |divisor|; this lesson uses integers.'),
      T('除数为 0 时硬件要报异常（除法错）。', 'Division by zero raises an exception.'),
    ]),
  ],
};
const DIV_SPEC = {
  presets: [
    { label: T('恢复余数法：13 ÷ 4', 'Restoring: 13 ÷ 4'), set: { x: 13, y: 4, n: 4, method: 'restore' } },
    { label: T('加减交替法：13 ÷ 4', 'Non-restoring: 13 ÷ 4'), set: { x: 13, y: 4, n: 4, method: 'nonrestore' } },
    { label: T('加减交替法：−11 ÷ 3', 'Non-restoring: −11 ÷ 3'), set: { x: -11, y: 3, n: 4, method: 'nonrestore' } },
  ],
  groups: [{ legend: T('除法', 'Division'), fields: [
    { name: 'method', label: T('方法', 'Method'), type: 'select', options: [['restore', T('恢复余数法', 'restoring')], ['nonrestore', T('加减交替法', 'non-restoring')]], wide: true },
    { name: 'x', label: T('被除数', 'Dividend'), type: 'text', parse: intIn(-255, 255) },
    { name: 'y', label: T('除数', 'Divisor'), type: 'text', parse: intIn(-255, 255) },
    { name: 'n', label: T('数值位数 n', 'Bits n'), type: 'int', min: 3, max: 8 },
  ] }],
  note: T('只演示绝对值部分（原码除法），商的符号 = 两数符号异或，余数的符号和被除数相同。', 'Magnitudes only; the quotient sign is the XOR, the remainder takes the dividend’s sign.'),
};
const DIV_ERR = { n: T('位数在 3～8', 'Use 3–8 bits'), range: T('超出 n 位的范围', 'Out of range'), zero: T('除数不能为 0', 'Divisor cannot be 0') };
function divBoard(sim, k, z) {
  const items = [];
  const n = sim.n;
  const X0 = 260;
  const W = [(n + 1) * 18 + 16, n * 18 + 16];
  items.push({ k: 'y', x: X0, y: 96, html: txt(0, 0, `Y = ${tc(sim.Y, n + 1)}，−Y = ${tc(-sim.Y, n + 1)}`, 'ar-mono', 'start') });
  items.push({ k: 'head', x: X0, y: 120, html: txt(W[0] / 2, 0, z ? 'A（余数）' : 'A (rem)', 'bt-cap') + txt(W[0] + 8 + W[1] / 2, 0, z ? 'Q（商）' : 'Q (quot)', 'bt-cap') + txt(W[0] + W[1] + 30, 0, z ? '说明' : 'Note', 'bt-cap', 'start') });
  const rows = [{ A: 0, Q: sim.X, note: z ? '初始' : 'start' }];
  let Q = sim.X;
  sim.steps.slice(0, k + 1).forEach((s) => {
    Q = (Q << 1) & (2 ** n - 1);
    rows.push({ A: s.trial, Q, note: `${z ? '左移，' : 'shift, '}${s.op === 'sub' ? '−Y' : '+Y'} → ${s.trial < 0 ? (z ? '负' : 'neg') : z ? '非负' : 'non-neg'}`, i: s.i, kind: 'trial' });
    Q |= s.q;
    if (s.restored) rows.push({ A: s.A, Q, note: z ? `加回 Y 恢复，商上 0` : 'restore, q = 0', i: s.i, kind: 'restore' });
    else rows.push({ A: s.A, Q, note: z ? `商上 ${s.q}` : `q = ${s.q}`, i: s.i, kind: 'q' });
  });
  if (k === sim.steps.length - 1 && sim.fix) rows.push({ A: sim.r, Q: sim.q, note: z ? '余数为负，加 Y 修正' : 'fix the remainder', i: k, kind: 'restore' });
  const KEEP = 11;
  rows.slice(-KEEP).forEach((r, j) => {
    const cur = r.i === k;
    const h = `${cell(W[0], 26, tc(r.A, n + 1), { size: 13, cls: cur ? (r.A < 0 ? 'bad' : 'hot') : '' })}<g transform="translate(${W[0] + 8} 0)">${cell(W[1], 26, tc(r.Q, n), { size: 13, cls: cur && r.kind !== 'trial' ? 'ok' : '' })}</g>` + txt(W[0] + W[1] + 30, 18, r.note, cur ? 'ar-note on' : 'ar-note', 'start');
    items.push({ k: `r${rows.length - Math.min(rows.length, KEEP) + j}`, x: X0, y: 134 + j * 32, html: h });
  });
  if (k === sim.steps.length - 1) items.push({ k: 'res', x: X0, y: 134 + Math.min(rows.length, KEEP) * 32 + 16, html: txt(0, 0, z ? `商 ${sim.sign ? '−' : ''}${sim.q}，余数 ${sim.x < 0 ? '−' : ''}${sim.r}` : `Quotient ${sim.sign ? '−' : ''}${sim.q}, remainder ${sim.x < 0 ? '−' : ''}${sim.r}`, 'bt-formula cur', 'start') });
  return items;
}
function buildDiv(p, kit, ERR) {
  const sim = divide({ ...p, x: +p.x, y: +p.y });
  const lesson = shell('divide', kit, ERR, sim, {
    tag: T('除法', 'Div'),
    name: T('定点除法：恢复余数与加减交替', 'Fixed-point division'),
    full: T('左移试减 · 恢复余数法 · 加减交替法 · 商和余数的符号', 'Shift and subtract · restoring · non-restoring · signs'),
    title: sim.ok ? T(`${p.x} ÷ ${p.y}`, `${p.x} ÷ ${p.y}`) : T('参数有误', 'Invalid parameters'),
    legend: [['orange', T('试减后的余数', 'Trial remainder')], ['rose', T('余数为负', 'Negative')], ['green', T('上商', 'Quotient bit')]],
    principle: DIV_PRINCIPLE,
    desc: T('除法每一步把余数和商一起左移一位，再试着减去除数：够减商上 1，不够减商上 0。恢复余数法不够减时要把除数加回去；加减交替法不加回去，下一步改成加。寄存器表一行行写下来，比一比两种方法。', 'Each step shifts A:Q left and tries subtracting the divisor. Restoring adds it back on failure; non-restoring adds next time instead.'),
    rect: [40, 70, 260 + (sim.ok ? sim.n : 4) * 36 + 300, 134 + 12 * 32 + 30],
  });
  if (!sim.ok) return lesson;
  const n = sim.n;
  const list = sim.steps.map((s, k) => ({
    title: T(`第 ${k + 1} 步：${s.op === 'sub' ? '减' : '加'} Y → ${s.trial < 0 ? '负' : '非负'}，商上 ${s.q}`, `Step ${k + 1}: ${s.op} Y → q = ${s.q}`),
    desc: T(`余数 ${tc(s.A, n + 1)}`, `A = ${tc(s.A, n + 1)}`),
    detail: sim.method === 'restore'
      ? T(`A、Q 左移一位后 A = ${tc(s.shifted, n + 1)}，减去 Y 得 ${tc(s.trial, n + 1)}（${s.trial}）。${s.restored ? `为负，不够减：商上 0，再加回 Y 恢复成 ${tc(s.A, n + 1)}。` : '非负，够减：商上 1。'}`, `Shift: A = ${s.shifted}; minus Y gives ${s.trial}: ${s.restored ? 'restore, q = 0' : 'q = 1'}.`)
      : T(`上一步余数${k === 0 || sim.steps[k - 1].A >= 0 ? '非负' : '为负'}，所以这一步左移后${s.op === 'sub' ? '减' : '加'} Y：${tc(s.shifted, n + 1)} ${s.op === 'sub' ? '−' : '+'} Y = ${tc(s.trial, n + 1)}（${s.trial}）。${s.trial < 0 ? '为负，商上 0，不恢复。' : '非负，商上 1。'}`, `Previous remainder ${k === 0 || sim.steps[k - 1].A >= 0 ? '≥ 0' : '< 0'}, so ${s.op} Y: ${s.trial}; q = ${s.q}.`),
    ref: sim.method === 'restore' ? 'restore' : 'nonrestore',
    row: { color: s.q ? 'green' : 'rose', what: T(`第 ${k + 1} 步`, `Step ${k + 1}`), result: T(`商 ${s.q}`, `q ${s.q}`), tone: s.q ? 'ok' : 'info' },
  }));
  const restores = sim.steps.filter((s) => s.restored).length;
  return finish(lesson, list, (k, z) => divBoard(sim, k, z), T(`商 ${sim.sign ? '−' : ''}${sim.q}，余数 ${sim.x < 0 ? '−' : ''}${sim.r}`, `q = ${sim.sign ? '−' : ''}${sim.q}, r = ${sim.x < 0 ? '−' : ''}${sim.r}`), sim.method === 'restore' ? T(`这次一共恢复了 ${restores} 次余数。换成加减交替法再看一遍，每一步都只做一次加或减。`, `${restores} restores; try non-restoring.`) : T(sim.fix ? '最后余数为负，多加了一次 Y 修正。' : '最后余数非负，不用修正。', sim.fix ? 'A final correction was needed.' : 'No correction needed.'));
}
export const makeDivide = make('divide', DIV_SPEC, DIV_ERR, buildDiv);

// ═════════════════════════ 浮点数加减 ═════════════════════════

const FADD_PRINCIPLE = {
  sections: [
    {
      id: 'five',
      title: T('浮点加减的五步', 'Five steps'),
      blocks: [
        {
          steps: [
            T('**对阶**：求阶差 ΔE，**小阶向大阶看齐**：阶小的那个数尾数右移 |ΔE| 位、阶码加 |ΔE|；', '**align**: the smaller exponent catches up; its mantissa shifts right;'),
            T('**尾数加减**：对阶后的两个尾数按定点小数补码加减；', '**add** the mantissas;'),
            T('**规格化**：尾数溢出（双符号位 01 或 10）就**右规**一次（尾数右移、阶码加 1）；尾数不是规格化形式就**左规**（尾数左移、阶码减 1），直到规格化；', '**normalise**: right once on overflow, left until normalised;'),
            T('**舍入**：对阶和右规时右移出去的位，按 0 舍 1 入（或恒置 1）处理；', '**round** the bits shifted out (round half up here);'),
            T('**判溢出**：阶码超出最大值是上溢（要报异常），小于最小值是下溢（按机器零处理）。', '**check** the exponent: overflow raises an exception, underflow becomes zero.'),
          ],
        },
        { warn: T('对阶时是**小阶**向大阶对齐，因为右移尾数只丢掉低位（精度），左移会丢高位（出大错）。', 'Always align the **smaller** exponent: shifting right loses only precision.') },
      ],
    },
    {
      id: 'norm',
      title: T('补码尾数的规格化', 'Normalised two’s complement mantissas'),
      blocks: [
        { p: T('原码尾数规格化：小数点后第一位是 1。补码尾数规格化：**符号位和小数点后第一位不同**，即正数 0.1xx…，负数 1.0xx…。所以 −1/2（1.100…）在补码里**不是**规格化数，−1（1.000…）是。', 'Two’s complement mantissas are normalised when **the sign bit differs from the first fraction bit**: 0.1… or 1.0…; −1/2 is not normalised, −1 is.') },
        { formula: T('双符号位 00.1… / 11.0…：已规格化；01.… / 10.…：右规；00.0… / 11.1…：左规', '00.1 / 11.0 normalised; 01 / 10 shift right; 00.0 / 11.1 shift left') },
      ],
    },
    {
      id: 'round',
      title: T('舍入', 'Rounding'),
      blocks: [
        { p: T('**0 舍 1 入**：看移出去的最高一位，是 1 就在尾数末位加 1（可能因此再溢出，需再右规）。**恒置 1**：不管移出什么，尾数末位都置 1。IEEE 754 默认是就近舍入（偶数优先）。', '**Round half up**: add 1 if the first lost bit is 1 (may require another right shift). **Jamming** forces the last bit to 1. IEEE 754 rounds to nearest even.') },
      ],
    },
    pit([
      T('右规只需要一次，左规可能要好几次。', 'Right normalisation happens at most once; left may repeat.'),
      T('舍入后可能又要右规。', 'Rounding can trigger another right shift.'),
      T('浮点数的溢出看阶码，不看尾数——尾数溢出只要右规。', 'Overflow is decided by the exponent.'),
    ]),
  ],
};
const FADD_SPEC = {
  presets: [
    { label: T('对阶、舍入后右规', 'Align, round, renormalise'), set: { ex: 3, mx: '0.1101', ey: 1, my: '0.1011', op: 'add', e: 4, m: 4 } },
    { label: T('相减后左规 3 次', 'Subtract, normalise left'), set: { ex: 2, mx: '0.1010', ey: 2, my: '0.1001', op: 'sub', e: 4, m: 4 } },
    { label: T('一正一负', 'Mixed signs'), set: { ex: 2, mx: '0.10110', ey: 4, my: '-0.11001', op: 'add', e: 4, m: 5 } },
    { label: T('阶码上溢', 'Exponent overflow'), set: { ex: 7, mx: '0.1100', ey: 7, my: '0.1100', op: 'add', e: 4, m: 4 } },
  ],
  groups: [
    { legend: 'X', fields: [
      { name: 'ex', label: T('阶码（真值）', 'Exponent'), type: 'text', parse: intIn(-32, 31) },
      { name: 'mx', label: T('尾数（二进制小数，如 -0.1011）', 'Mantissa (binary fraction)'), type: 'text' },
    ] },
    { legend: 'Y', fields: [
      { name: 'ey', label: T('阶码（真值）', 'Exponent'), type: 'text', parse: intIn(-32, 31) },
      { name: 'my', label: T('尾数', 'Mantissa'), type: 'text' },
    ] },
    { legend: T('格式', 'Format'), fields: [
      { name: 'op', label: T('运算', 'Op'), type: 'select', options: [['add', 'X + Y'], ['sub', 'X − Y']] },
      { name: 'e', label: T('阶码位数（含符号）', 'Exponent bits'), type: 'int', min: 3, max: 6 },
      { name: 'm', label: T('尾数数值位数', 'Mantissa bits'), type: 'int', min: 3, max: 8 },
    ] },
  ],
  note: T('X = 2^阶码 × 尾数。阶码用 e 位补码，尾数用补码定点小数（m 位数值位），运算时都用双符号位，舍入用 0 舍 1 入。', 'X = 2^E × M; e-bit two’s complement exponent, two’s complement fraction with m bits, double sign bits, round half up.'),
};
const FADD_ERR = { e: T('阶码位数在 3～6', 'Exponent bits 3–6'), m: T('尾数位数在 3～8', 'Mantissa bits 3–8'), mant: T('尾数要写成 0.xxx 或 -0.xxx，位数不超过 m', 'Mantissa must look like 0.xxx with at most m bits'), exp: T('阶码超出 e 位补码的范围', 'Exponent out of range') };
function faddBoard(sim, k, z) {
  const items = [];
  const X0 = 210;
  const s = sim.steps;
  const rows = [];
  const mx = parseMant(sim.mx, sim.m);
  const my0 = parseMant(sim.my, sim.m);
  const my = sim.op === 'sub' ? -my0 : my0;
  rows.push(['X', `2^${sim.ex} × ${mantStr(mx, sim.m)}`, 0]);
  rows.push([sim.op === 'sub' ? '−Y' : 'Y', `2^${sim.ey} × ${mantStr(my, sim.m)}`, 0]);
  const shown = s.slice(0, k + 1);
  for (const st of shown) {
    if (st.kind === 'align') rows.push([z ? '对阶后' : 'Aligned', `2^${st.E} × ${st.x}　　2^${st.E} × ${st.y}`, 1]);
    if (st.kind === 'add') rows.push([z ? '尾数相加' : 'Sum', `${st.S}${st.over ? (z ? '　（溢出）' : '  (overflow)') : ''}`, 2]);
    if (st.kind === 'norm') rows.push([z ? '规格化' : 'Normalised', st.S ? `2^${st.E} × ${st.S}` : z ? '结果为 0' : 'zero', 3]);
    if (st.kind === 'round') rows.push([z ? '舍入' : 'Rounded', st.lost ? `${st.S}　（${z ? '舍掉' : 'lost'} ${st.lost}${st.first ? (z ? '，进 1' : ', +1') : ''}）` : `${st.S}　（${z ? '没有移出的位' : 'nothing lost'}）`, 4]);
    if (st.kind === 'renorm') rows.push([z ? '再右规' : 'Renormalised', `2^${st.E} × ${st.S}`, 5]);
    if (st.kind === 'check') rows.push([z ? '判溢出' : 'Check', st.over ? (z ? `阶码 ${st.E} ${st.over === 'up' ? `> ${st.emax}，上溢` : `< ${st.emin}，下溢（当作 0）`}` : `exponent ${st.E}: ${st.over}flow`) : z ? `阶码 ${st.E} 在 ${st.emin}～${st.emax} 之内，没有溢出` : `exponent ${st.E} in range`, 6]);
  }
  rows.forEach(([lab, val, kind], i) => items.push({ k: `f${i}`, x: X0, y: 110 + i * 38, html: txt(-14, 18, lab, i === rows.length - 1 && k >= 0 ? 'ar-lab on' : 'ar-lab', 'end') + `<rect class="ar-row ${i === rows.length - 1 && k >= 0 ? 'on' : ''}" x="-6" y="-2" width="${Math.max(260, val.length * 9.5 + 20)}" height="30" rx="5"/>` + txt(4, 19, val, 'ar-mono', 'start') }));
  return items;
}
function buildFadd(p, kit, ERR) {
  const sim = floatAdd({ ...p, ex: +p.ex, ey: +p.ey });
  const lesson = shell('float-add', kit, ERR, sim, {
    tag: T('浮加', 'FAdd'),
    name: T('浮点数加减运算', 'Floating-point addition'),
    full: T('对阶 · 尾数加减 · 规格化（左规 / 右规）· 舍入 · 判溢出', 'Align · add · normalise · round · overflow'),
    title: sim.ok ? T(`2^${p.ex}×${p.mx} ${p.op === 'sub' ? '−' : '+'} 2^${p.ey}×${p.my}`, `2^${p.ex}×${p.mx} ${p.op === 'sub' ? '−' : '+'} 2^${p.ey}×${p.my}`) : T('参数有误', 'Invalid parameters'),
    legend: [['orange', T('这一步的结果', 'This step')]],
    principle: FADD_PRINCIPLE,
    desc: T('浮点数不能直接把尾数相加，要先让阶码一样。这节课按课本的五步——对阶、尾数加减、规格化、舍入、判溢出——一行行写出双符号位补码尾数的变化，最后和精确值对照。', 'Exponents must match first. The five textbook steps are written out with double-sign two’s complement mantissas, then checked against the exact value.'),
    rect: [40, 80, 210 + 520, 110 + 9 * 38 + 20],
  });
  if (!sim.ok) return lesson;
  const st = (kind) => sim.steps.find((x) => x.kind === kind);
  const list = [];
  const al = st('align');
  list.push({ title: al.d ? T(`对阶：${al.big === 'x' ? 'Y' : 'X'} 的尾数右移 ${al.d} 位`, `Align: shift ${al.big === 'x' ? 'Y' : 'X'} right by ${al.d}`) : T('阶码相同，不用对阶', 'Exponents already equal'), desc: T(`ΔE = ${sim.ex} − ${sim.ey} = ${al.dE}`, `ΔE = ${al.dE}`), detail: al.d ? T(`阶差 ΔE = ${al.dE}，${al.big === 'x' ? 'Y' : 'X'} 的阶码小。小阶向大阶看齐：它的尾数右移 ${al.d} 位、阶码变成 ${al.E}。右移出去的位先保留着，后面舍入时再处理。`, `The smaller exponent catches up: shift its mantissa right by ${al.d}.`) : T('两个数阶码一样，直接加尾数。', 'Same exponent.'), ref: 'five', k: 0 });
  const ad = st('add');
  list.push({ title: T(`尾数${sim.op === 'sub' ? '相减' : '相加'}：${ad.S}`, `Mantissa sum: ${ad.S}`), desc: ad.over ? T('双符号位不同：尾数溢出', 'Mantissa overflow') : T('用双符号位补码', 'Double-sign two’s complement'), detail: T(`${sim.op === 'sub' ? '减法就是加上 −Y 的尾数补码。' : ''}两个尾数按补码定点小数相加，得 ${ad.S}。${ad.over ? '两个符号位不同，说明尾数绝对值 ≥ 1，要右规——这不是浮点数溢出。' : ''}`, `Add the mantissas: ${ad.S}.${ad.over ? ' The sign bits differ: right-normalise.' : ''}`), ref: 'five', k: 1 });
  const no = st('norm');
  const nh = no.how;
  list.push({ title: nh === 'right' ? T('右规一次', 'Normalise right once') : nh.startsWith('left') ? T(`左规 ${nh.slice(4)} 次`, `Normalise left ${nh.slice(4)} times`) : nh === 'zero' ? T('尾数为 0', 'Zero mantissa') : T('已经是规格化数', 'Already normalised'), desc: no.S ? T(`2^${no.E} × ${no.S}`, `2^${no.E} × ${no.S}`) : T('结果为 0', 'Result is zero'), detail: nh === 'right' ? T('双符号位不同，尾数右移一位、阶码加 1。', 'Shift the mantissa right, exponent + 1.') : nh.startsWith('left') ? T(`尾数的符号位和小数点后第一位相同，不是规格化形式。每左移一位、阶码减 1，一共左移 ${nh.slice(4)} 次，阶码变成 ${no.E}。`, `Shift left ${nh.slice(4)} times; exponent ${no.E}.`) : nh === 'zero' ? T('尾数为 0，结果就是 0。', 'The result is zero.') : T('符号位和小数点后第一位不同，已经规格化。', 'Already normalised.'), ref: 'norm', k: 2 });
  if (nh !== 'zero') {
    const ro = st('round');
    list.push({ title: ro.lost ? (ro.first ? T('舍入：0 舍 1 入，进 1', 'Round up') : T('舍入：0 舍 1 入，舍去', 'Round down')) : T('不需要舍入', 'No rounding'), desc: T(`尾数 ${ro.S}`, `Mantissa ${ro.S}`), detail: ro.lost ? T(`尾数只能保留 ${sim.m} 位，多出来的 ${ro.lost} 要舍掉。第一个舍掉的位是 ${ro.first}，${ro.first ? '所以末位加 1' : '直接舍去'}：${ro.S}。`, `Keep ${sim.m} bits; the first lost bit is ${ro.first}: ${ro.S}.`) : T('没有移出去的位。', 'Nothing was shifted out.'), ref: 'round', k: 3 });
    if (st('renorm')) list.push({ title: T('舍入后又溢出：再右规', 'Rounding overflowed: shift right again'), desc: T(`2^${st('renorm').E} × ${st('renorm').S}`, `2^${st('renorm').E} × ${st('renorm').S}`), detail: T('末位加 1 后尾数变成了 1.000…，又溢出了，再右规一次、阶码加 1。', 'The +1 made the mantissa overflow; shift right once more.'), ref: 'round', k: 4 });
    const ch = st('check');
    list.push({ title: ch.over ? T(`阶码${ch.over === 'up' ? '上溢' : '下溢'}`, `Exponent ${ch.over}flow`) : T(`结果 = ${sim.value}`, `Result = ${sim.value}`), desc: T(`阶码 ${ch.E}，范围 ${ch.emin}～${ch.emax}`, `Exponent ${ch.E}, range ${ch.emin}…${ch.emax}`), detail: ch.over ? T(`${sim.e} 位补码阶码只能表示 ${ch.emin}～${ch.emax}，结果的阶码 ${ch.E} ${ch.over === 'up' ? '太大，上溢，要报异常' : '太小，下溢，按机器零处理'}。`, `${ch.over}flow.`) : T(`阶码 ${ch.E} 在范围内。结果 2^${ch.E} × ${sim.Mstr} = ${sim.value}；精确值是 ${sim.check}${sim.value !== sim.check ? '，差别来自舍入' : '，一致'}。`, `Result ${sim.value}; exact ${sim.check}.`), ref: 'five', k: 5 });
  }
  const kinds = sim.steps.map((x) => x.kind);
  const at = (kind) => kinds.indexOf(kind);
  const idx = [at('align'), at('add'), at('norm'), at('round'), ...(st('renorm') ? [at('renorm')] : []), at('check')];
  const WHAT = [T('对阶', 'Align'), T('尾数加减', 'Add'), T('规格化', 'Normalise'), T('舍入', 'Round'), ...(st('renorm') ? [T('再右规', 'Renormalise')] : []), T('判溢出', 'Check')];
  const steps = list.map((x, i) => ({ ...x, row: { color: 'orange', what: WHAT[i], result: '', tone: 'info', info: x.desc } }));
  steps.forEach((x, i) => (x.st = { k: idx[i] }));
  return finish(lesson, steps, (k, z) => faddBoard(sim, k < 0 ? -1 : steps[k].st.k, z), sim.over ? T('阶码溢出', 'Exponent overflow') : T(`结果 ${sim.value}`, `Result ${sim.value}`), T('试试一正一负的预设：负数尾数的规格化形式是 1.0xx。', 'Try the mixed-sign preset: negative mantissas normalise to 1.0….'), [[T('精确值', 'Exact'), String(sim.check)]]);
}
export const makeFloatAdd = make('float-add', FADD_SPEC, FADD_ERR, buildFadd);

// ═════════════════════════ 大端小端与边界对齐 ═════════════════════════

const END_PRINCIPLE = {
  sections: [
    {
      id: 'endian',
      title: T('大端和小端', 'Big and little endian'),
      blocks: [
        { p: T('一个多字节的数据占几个连续的字节，用**最低的那个地址**作为它的地址。字节在里面怎么排有两种方式：**大端**——最高有效字节放在最低地址（和书写顺序一致）；**小端**——最低有效字节放在最低地址。x86 是小端，网络字节序是大端。', 'A multi-byte value is addressed by its lowest byte. **Big endian** stores the most significant byte first; **little endian** the least. x86 is little endian; network order is big endian.') },
        { tip: T('判断方法：看最低地址存的是「最高位那个字节」还是「最低位那个字节」。只影响字节的顺序，一个字节里面的 8 位顺序不变。', 'Look at what sits at the lowest address; bit order within a byte never changes.') },
      ],
    },
    {
      id: 'align',
      title: T('边界对齐', 'Alignment'),
      blocks: [
        { p: T('存储器按字（如 4 字节）访问时，一个数据如果跨了两个字，就要访问两次。**边界对齐**要求：数据的起始地址是它大小的整数倍（short 是 2 的倍数，int 是 4 的倍数，double 是 8 的倍数），这样一次就能读完。', 'Word-oriented memory reads a straddling value twice. **Alignment** places each value at a multiple of its size.') },
        {
          steps: [
            T('结构体里每个成员的偏移量必须是这个成员大小的整数倍，不够就在前面补空字节；', 'each member’s offset is a multiple of its size, padding as needed;'),
            T('整个结构体的大小必须是最大成员大小的整数倍，不够就在末尾补；', 'the total is a multiple of the largest member;'),
            T('数组成员按元素大小对齐。', 'arrays align by element size.'),
          ],
        },
        { tip: T('把成员按大小从大到小排列，通常能让结构体最省空间。', 'Ordering members from largest to smallest usually minimises padding.') },
      ],
    },
    pit([
      T('小端里「低地址存低字节」，但一个字节内部的位顺序不变。', 'Endianness reorders bytes, not bits.'),
      T('结构体末尾也可能有填充。', 'Structs may have tail padding.'),
      T('long 在 32 位和 64 位系统上大小不同，本课按 8 字节算。', 'long varies; it is 8 bytes here.'),
    ]),
  ],
};
const END_SPEC = {
  presets: [
    { label: T('int 和三个成员的结构体', 'An int and a small struct'), set: { value: '12345678', addr: '100', width: 4, struct: 'char a; int b; short c' } },
    { label: T('double 和填充', 'A double and padding'), set: { value: '0123456789ABCDEF', addr: '8000', width: 8, struct: 'char c; double d; short s; int i; char t[3]' } },
  ],
  groups: [{ legend: T('数据', 'Data'), fields: [
    { name: 'value', label: T('十六进制数值', 'Hex value'), type: 'text' },
    { name: 'width', label: T('字节数', 'Bytes'), type: 'select', options: [[4, T('4（int）', '4 (int)')], [8, T('8（long long）', '8 (long long)')]] },
    { name: 'addr', label: T('起始地址（十六进制）', 'Start address (hex)'), type: 'text' },
    { name: 'struct', label: T('结构体成员（char / short / int / float / long / double，可写数组 c[3]）', 'Struct members'), type: 'text', wide: true, parse: (s) => (parseStruct(s) ? s : NaN) },
  ] }],
  note: T('类型大小：char 1，short 2，int / float 4，long / long long / double 8。每个成员按自身大小对齐，结构体大小是最大成员大小的整数倍。', 'Sizes: char 1, short 2, int/float 4, long/double 8; each member aligns to its size.'),
};
const END_ERR = { width: T('字节数是 4 或 8', 'Use 4 or 8 bytes'), value: T('数值要是十六进制，且不超过字节数', 'Hex value too long or invalid'), addr: T('地址要是十六进制', 'Address must be hex'), struct: T('结构体成员写得不对', 'Invalid struct members') };
const MTONES = ['blue', 'green', 'amber', 'violet', 'teal', 'orange', 'rose', 'slate'];
function endBoard(sim, st, z) {
  const items = [];
  const BX = 48;
  const memRow = (key, y, lab, mem, show) => {
    let h = txt(-14, 22, lab, 'ar-lab', 'end');
    mem.forEach((m, i) => (h += `<g transform="translate(${i * BX} 0)">${cell(BX - 4, 30, show ? m.b : '', { size: 14, tone: show ? 'teal' : '', cls: show && i === 0 ? 'hot' : '' })}${txt((BX - 4) / 2, 46, m.addr, 'bt-idx')}</g>`));
    items.push({ k: key, x: 190, y, html: h });
  };
  items.push({ k: 'val', x: 190, y: 100, html: txt(0, 0, (z ? '数值 ' : 'Value ') + `0x${sim.hex}　` + (z ? `起始地址 0x${sim.base.toString(16).toUpperCase()}` : `at 0x${sim.base.toString(16).toUpperCase()}`), 'ar-mono', 'start') });
  if (st.k >= 0) memRow('big', 130, z ? '大端' : 'Big', sim.big, true);
  if (st.k >= 1) memRow('little', 200, z ? '小端' : 'Little', sim.little, true);
  const layoutRow = (key, y, lab, lay) => {
    const CW = Math.min(28, 560 / Math.max(lay.total, 8));
    let h = txt(-14, 22, lab, 'ar-lab', 'end');
    const owner = Array(lay.total).fill(null);
    lay.rows.forEach((r, i) => {
      for (let b = 0; b < r.bytes; b++) owner[r.offset + b] = i;
    });
    owner.forEach((o, b) => {
      h += `<g transform="translate(${b * CW} 0)">${cell(CW - 2, 30, '', { tone: o == null ? '' : MTONES[o % 8], cls: o == null ? 'pad' : '' })}</g>`;
      if (b % 4 === 0) h += txt(b * CW, 46, String(b), 'bt-idx', 'start');
    });
    lay.rows.forEach((r, i) => (h += txt(r.offset * CW + 3, 20, r.name, 'ar-mem', 'start')));
    h += txt(lay.total * CW + 10, 22, z ? `共 ${lay.total} 字节` : `${lay.total} bytes`, 'ar-op', 'start');
    items.push({ k: key, x: 190, y, html: h });
  };
  if (st.k >= 2) layoutRow('lay', 290, z ? '结构体' : 'Struct', sim.lay);
  if (st.k >= 3) layoutRow('best', 370, z ? '重新排序' : 'Reordered', sim.best);
  return items;
}
function buildEnd(p, kit, ERR) {
  const sim = endian({ ...p, width: Number(p.width) });
  const lesson = shell('endian', kit, ERR, sim, {
    tag: T('端序', 'End'),
    name: T('大端小端与边界对齐', 'Endianness and alignment'),
    full: T('多字节数据的存放 · 大端与小端 · 边界对齐 · 结构体大小', 'Multi-byte storage · big and little endian · alignment · struct size'),
    title: sim.ok ? T(`0x${sim.hex}`, `0x${sim.hex}`) : T('参数有误', 'Invalid parameters'),
    legend: [['teal', T('数据字节', 'Data byte')], ['slate', T('填充字节（空白）', 'Padding (blank)')]],
    principle: END_PRINCIPLE,
    desc: T('一个 int 占 4 个字节，按什么顺序放进内存？结构体的大小为什么常常比各成员之和大？这节课先把一个数按大端、小端各摆一遍，再把结构体按对齐规则摆进内存，空出来的就是填充。', 'How are an int’s four bytes ordered in memory, and why is a struct often bigger than its members? Both orders are laid out, then the struct with its padding.'),
    rect: [30, 70, 190 + Math.max(sim.ok ? sim.width * 48 : 400, 600) + 100, 430],
  });
  if (!sim.ok) return lesson;
  const L = sim.lay;
  const pads = L.rows.filter((r) => r.pad).map((r) => (r.pad ? `${r.name} 前补 ${r.pad}` : ''));
  const list = [
    { title: T(`大端：最低地址放 ${sim.hex.slice(0, 2)}`, `Big endian: ${sim.hex.slice(0, 2)} first`), desc: T('高字节在低地址', 'Most significant first'), detail: T(`大端把最高有效字节 ${sim.hex.slice(0, 2)} 放在最低地址 0x${sim.big[0].addr}，顺序和平时写数的顺序一样。`, `The most significant byte goes to the lowest address.`), ref: 'endian', st: { k: 0 }, row: { color: 'teal', what: T('大端', 'Big'), result: sim.big.map((x) => x.b).join(' '), tone: 'info' } },
    { title: T(`小端：最低地址放 ${sim.hex.slice(-2)}`, `Little endian: ${sim.hex.slice(-2)} first`), desc: T('低字节在低地址', 'Least significant first'), detail: T(`小端把最低有效字节 ${sim.hex.slice(-2)} 放在最低地址，字节顺序正好反过来（x86 就是这样）。${sim.aligned ? `起始地址 0x${sim.base.toString(16).toUpperCase()} 是 ${sim.width} 的倍数，对齐了。` : `起始地址不是 ${sim.width} 的倍数，没有对齐，按字访问要读两次。`}`, `Bytes reversed; ${sim.aligned ? 'aligned' : 'not aligned'}.`), ref: 'endian', st: { k: 1 }, row: { color: 'teal', what: T('小端', 'Little'), result: sim.little.map((x) => x.b).join(' '), tone: 'info' } },
    { title: T(`结构体占 ${L.total} 字节`, `The struct takes ${L.total} bytes`), desc: T(`成员本身 ${L.rows.reduce((a, r) => a + r.bytes, 0)} 字节`, `${L.rows.reduce((a, r) => a + r.bytes, 0)} bytes of members`), detail: T(`各成员偏移：${L.rows.map((r) => `${r.name} ${r.offset}`).join('，')}。${pads.length ? `${pads.join('，')} 个字节对齐；` : ''}${L.tail ? `末尾再补 ${L.tail} 个字节，凑成最大成员 ${L.maxA} 的倍数。` : `总大小正好是 ${L.maxA} 的倍数。`}`, `Offsets ${L.rows.map((r) => `${r.name} ${r.offset}`).join(', ')}; total ${L.total}.`), ref: 'align', st: { k: 2 }, row: { color: 'violet', what: T('结构体', 'Struct'), result: `${L.total} B`, tone: 'info' } },
    { title: T(`按大小重排：${sim.best.total} 字节`, `Reordered: ${sim.best.total} bytes`), desc: T('从大到小排列成员', 'Largest first'), detail: sim.best.total < L.total ? T(`把成员按大小从大到小重新排列，填充少了，只要 ${sim.best.total} 字节，省下 ${L.total - sim.best.total} 字节。`, `Largest-first ordering saves ${L.total - sim.best.total} bytes.`) : T('重新排列后大小不变，原来的顺序已经很紧凑。', 'Reordering does not help here.'), ref: 'align', st: { k: 3 }, row: { color: 'green', what: T('重排', 'Reordered'), result: `${sim.best.total} B`, tone: 'ok' } },
  ];
  return finish(lesson, list, (k, z) => endBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), T(`结构体 ${L.total} 字节`, `Struct ${L.total} bytes`), T('改一下成员的顺序或类型，看填充怎么变。', 'Change the member order or types and watch the padding.'));
}
export const makeEndian = make('endian', END_SPEC, END_ERR, buildEnd);
