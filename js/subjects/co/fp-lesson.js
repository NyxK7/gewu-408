// 「IEEE 754 浮点数」这节课：一个 32（或 64）位的寄存器，符号、阶码、尾数一段一段填进去；也可以反过来，从十六进制解出数值。
import { FP_PRINCIPLE, fpRef } from './co-principles.js';
import { boardKit, txt } from '../../core/board.js';
import { chip } from '../../core/steps.js';
import { L, T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { binOf, binaryExpansion, decode as dec, encode, hexOf } from './fp.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const TONE = { S: 'rose', E: 'amber', M: 'blue' };

const SPEC = {
  presets: [
    { label: T('-8.25 → 单精度', '-8.25 → single'), set: { mode: 'encode', width: 32, value: '-8.25' } },
    { label: T('0.1（需要舍入）', '0.1 (rounded)'), set: { mode: 'encode', width: 32, value: '0.1' } },
    { label: T('100.25', '100.25'), set: { mode: 'encode', width: 32, value: '100.25' } },
    { label: T('1e-45（非规格化）', '1e-45 (subnormal)'), set: { mode: 'encode', width: 32, value: '1e-45' } },
    { label: T('解码 C1040000H', 'Decode C1040000H'), set: { mode: 'decode', width: 32, hex: 'C1040000' } },
    { label: T('解码 7FC00000H', 'Decode 7FC00000H'), set: { mode: 'decode', width: 32, hex: '7FC00000' } },
    { label: T('双精度 0.1', 'Double 0.1'), set: { mode: 'encode', width: 64, value: '0.1' } },
  ],
  groups: [
    {
      legend: T('方向与格式', 'Direction and format'),
      fields: [
        { name: 'mode', label: T('方向', 'Direction'), type: 'select', options: [['encode', T('十进制 → 位模式', 'decimal → bits')], ['decode', T('位模式 → 十进制', 'bits → decimal')]] },
        { name: 'width', label: T('格式', 'Format'), type: 'select', options: [[32, T('单精度 float（32 位）', 'single (32-bit)')], [64, T('双精度 double（64 位）', 'double (64-bit)')]] },
        { name: 'value', label: T('十进制数', 'Decimal value'), type: 'text', wide: true, hint: T('例如 -8.25、0.1、1e-45、inf、nan', 'e.g. -8.25, 0.1, 1e-45, inf, nan'), show: (p) => p.mode === 'encode' },
        { name: 'hex', label: T('十六进制位模式', 'Hex bit pattern'), type: 'text', wide: true, hint: T('例如 C1040000（可带 0x 或 H）', 'e.g. C1040000 (0x or H allowed)'), show: (p) => p.mode === 'decode' },
      ],
    },
  ],
  note: T(
    '单精度：1 位符号 + 8 位阶码（偏置 127）+ 23 位尾数；双精度：1 + 11（偏置 1023）+ 52。规格化数隐含最高位的 1。阶码全 0 是 0 或非规格化数（指数固定为 1 − 偏置，没有隐含的 1），全 1 是无穷大或 NaN。舍入采用默认的「就近舍入，平局取偶」。',
    'Single: 1 sign + 8 exponent bits (bias 127) + 23 fraction bits; double: 1 + 11 (bias 1023) + 52. Normal numbers hide a leading 1. An all-zero exponent means zero or a subnormal (exponent fixed at 1 − bias, no hidden 1); all ones means infinity or NaN. Rounding is the default round-to-nearest, ties-to-even.',
  ),
};

const ERR = { parse: T('十进制数的格式不对', 'Not a valid decimal number'), hex: T('十六进制位模式的格式不对（位数也不能超）', 'Not a valid hex pattern for this width') };

// ───────────────────────── 画板：一排位 ─────────────────────────

function geo(width) {
  const BW = width === 32 ? 23 : 12.5;
  const x0 = 70;
  const W = width * BW;
  return { BW, x0, regY: 280, W, rect: [20, 100, x0 + W + 40, 390] };
}

/** shown：已经揭示的字段集合；cur：当前强调的字段 */
function boardAt(r, shown, cur, lines, z, hexShown) {
  const { f } = r;
  const g = geo(f.bits);
  const items = [];
  const bits = binOf(r.bits, f.bits);
  const field = (i) => (i === 0 ? 'S' : i <= f.eBits ? 'E' : 'M');
  let s = '';
  for (let i = 0; i < f.bits; i++) {
    const k = field(i);
    const on = shown.has(k);
    const size = f.bits === 32 ? 13 : 7;
    // 平面的位格子
    s += `<g transform="translate(${(i + 0.5) * g.BW} 0)">${chip(g.BW - 2, f.bits === 32 ? 26 : 20, on ? bits[i] : '?', { tone: on ? TONE[k] : '', size: f.bits === 32 ? 12 : 8, cls: on ? '' : 'dim' })}</g>`;
  }
  items.push({ k: 'reg', x: g.x0, y: g.regY, html: s });
  // 字段说明
  const segs = [
    ['S', 0, 1, z ? '符号 S' : 'sign S'],
    ['E', 1, 1 + f.eBits, z ? `阶码 E（${f.eBits} 位）` : `exponent E (${f.eBits})`],
    ['M', 1 + f.eBits, f.bits, z ? `尾数 M（${f.mBits} 位）` : `fraction M (${f.mBits})`],
  ];
  for (const [k, a, b, lab] of segs) {
    const xa = a * g.BW;
    const xb = b * g.BW;
    items.push({
      k: `seg-${k}`,
      x: g.x0,
      y: g.regY + 26,
      cls: cur === k ? 'is-cur' : '',
      html: `<path class="bseg c-${TONE[k]} ${shown.has(k) ? '' : 'off'}" d="M${xa + 2},0 V8 H${xb - 2} V0"/>` + txt((xa + xb) / 2, 26, lab, `bt-seg c-${TONE[k]} ${shown.has(k) ? '' : 'off'}`),
    });
  }
  if (hexShown) {
    const hx = r.bits.toString(16).toUpperCase().padStart(f.bits / 4, '0');
    items.push({ k: 'hex', x: g.x0, y: g.regY - 34, html: [...hx].map((c, j) => txt((j * 4 + 2) * g.BW, 0, c, 'bt-hex')).join('') });
  }
  // 算式在位格子上方往上排，行数多时整体上移，不会压到十六进制那一行
  const top = g.regY - 60 - lines.length * 24;
  lines.forEach((ln, j) => items.push({ k: `ln-${j}`, x: g.x0, y: top + j * 24, html: txt(0, 0, ln, j === lines.length - 1 ? 'bt-formula cur' : 'bt-formula', 'start') }));
  return items;
}

// ───────────────────────── 文案 ─────────────────────────

const sup = (n) => `2^${n}`;
const cut = (s) => (s.length > 34 ? s.slice(0, 32) + '…' : s);
const trimBits = (s) => s.replace(/0+$/, '') || '0';

function expText(num, den) {
  const ex = binaryExpansion(num, den, 40);
  const int = ex.int.length > 40 ? `${ex.int.slice(0, 24)}…（${ex.int.length} 位）` : ex.int;
  return `${int}${ex.frac ? '.' + ex.frac : ''}${ex.more ? '…' : ''}`;
}

function encodeSteps(r, z) {
  const { f } = r;
  const sgn = r.sign ? '-' : '';
  const steps = [];
  const val = String(r.input).trim();
  const lines = [];
  // 1. 符号
  steps.push({
    title: z ? `符号位：S = ${r.sign}` : `Sign bit: S = ${r.sign}`,
    detail: z ? `${val} 是${r.sign ? '负数' : '正数（或 +0）'}，符号位 S = ${r.sign}。IEEE 754 用原码表示符号：数值部分都按绝对值处理。` : `${val} is ${r.sign ? 'negative' : 'non-negative'}, so S = ${r.sign}. IEEE 754 stores sign and magnitude separately; everything below works on the absolute value.`,
    shown: ['S'],
    cur: 'S',
    lines: [...lines],
  });
  if (r.kind === 'inf' || r.kind === 'nan') {
    lines.push(r.kind === 'inf' ? (z ? `${sgn}∞：阶码全 1，尾数全 0` : `${sgn}∞: exponent all ones, fraction zero`) : z ? 'NaN：阶码全 1，尾数不为 0' : 'NaN: exponent all ones, fraction non-zero');
    steps.push({ title: z ? '特殊值' : 'A special value', detail: z ? `${r.kind === 'inf' ? '无穷大' : 'NaN（非数）'}没有对应的二进制小数，按规定：阶码全 1，尾数${r.kind === 'inf' ? '全 0' : '不为 0（这里取最高位为 1 的「安静 NaN」）'}。` : `${r.kind === 'inf' ? 'Infinity' : 'NaN'} has no binary expansion; by definition the exponent is all ones and the fraction ${r.kind === 'inf' ? 'is zero' : 'is non-zero (here the quiet NaN with its top bit set)'}.`, shown: ['S', 'E', 'M'], cur: 'E', lines: [...lines] });
  } else if (r.kind === 'zero' && r.num == null) {
    lines.push(z ? `${sgn}0：阶码、尾数全 0` : `${sgn}0: exponent and fraction all zero`);
    steps.push({ title: z ? '零' : 'Zero', detail: z ? '0 没法写成 1.xxx × 2^e，规定阶码和尾数全为 0；符号位区分 +0 和 −0。' : 'Zero cannot be written as 1.xxx × 2^e, so exponent and fraction are all zero; the sign bit tells +0 from −0.', shown: ['S', 'E', 'M'], cur: 'M', lines: [...lines] });
  } else {
    // 2. 二进制
    const bin = expText(r.num, r.den);
    lines.push(`${val} = ${sgn}${bin}₂`);
    steps.push({
      title: z ? '化成二进制' : 'Convert to binary',
      detail: z ? `整数部分除 2 取余、小数部分乘 2 取整：|${val}| = ${bin}₂${binaryExpansion(r.num, r.den, 40).more ? '（是无限位的二进制小数，后面还没写完）' : ''}。` : `Integer part by repeated division by 2, fraction by repeated doubling: |${val}| = ${bin}₂${binaryExpansion(r.num, r.den, 40).more ? ' (the binary fraction never ends)' : ''}.`,
      shown: ['S'],
      cur: null,
      lines: [...lines],
    });
    if (r.kind === 'overflow') {
      lines.push(z ? `指数太大，超出范围 → ${sgn}∞` : `exponent too large → ${sgn}∞`);
      steps.push({ title: z ? '上溢：变成无穷大' : 'Overflow: infinity', detail: z ? `规格化后指数 e = ${r.e} 已经超过最大值 ${f.bias}，${f.bits === 32 ? '单精度' : '双精度'}能表示的最大有限数约 ${f.bits === 32 ? '3.4028235e38' : '1.7976931348623157e308'}。按就近舍入，结果是 ${sgn}∞：阶码全 1，尾数全 0。` : `After normalising, e = ${r.e} exceeds the maximum ${f.bias}; the result rounds to ${sgn}∞ (exponent all ones, fraction zero).`, shown: ['S', 'E', 'M'], cur: 'E', lines: [...lines] });
    } else {
      // 3. 规格化
      const q = binOf(r.q ?? 0n, f.mBits + 1);
      const isSub = r.kind === 'subnormal' || (r.kind === 'zero' && r.E === 0);
      const norm = isSub ? `0.${trimBits(binOf(r.M, f.mBits))} × ${sup(1 - f.bias)}` : `1.${trimBits(q.slice(1))} × ${sup(r.e)}`;
      lines.push(`= ${sgn}${norm}`);
      steps.push({
        title: isSub ? (z ? '太小了：非规格化' : 'Too small: subnormal') : z ? '规格化' : 'Normalise',
        detail: isSub
          ? z
            ? `把小数点移到第一个 1 后面，指数会小于 ${1 - f.bias}，规格化数表示不了。只能用非规格化形式：指数固定为 ${1 - f.bias}，写成 0.xxx × ${sup(1 - f.bias)}（没有隐含的 1），阶码字段全 0。`
            : `Moving the point after the first 1 would need an exponent below ${1 - f.bias}, which normal numbers cannot hold. The subnormal form is used: exponent fixed at ${1 - f.bias}, value 0.xxx × ${sup(1 - f.bias)} with no hidden 1, exponent field all zero.`
          : z
            ? `移动小数点，让它紧跟在第一个 1 后面：${norm}。小数点左移一位指数加 1、右移一位减 1。`
            : `Move the binary point to just after the first 1: ${norm}. Each place to the left adds 1 to the exponent.`,
        shown: ['S'],
        cur: null,
        lines: [...lines],
      });
      // 4. 阶码
      steps.push({
        title: z ? `阶码：E = ${r.E}` : `Exponent: E = ${r.E}`,
        detail: isSub ? (z ? `非规格化数的阶码字段规定为全 0：${binOf(BigInt(r.E), f.eBits)}。` : `A subnormal's exponent field is all zero: ${binOf(BigInt(r.E), f.eBits)}.`) : z ? `阶码用移码存储，加上偏置 ${f.bias}：E = ${r.e} + ${f.bias} = ${r.E} = ${binOf(BigInt(r.E), f.eBits)}₂。` : `The exponent is stored with a bias of ${f.bias}: E = ${r.e} + ${f.bias} = ${r.E} = ${binOf(BigInt(r.E), f.eBits)}₂.`,
        shown: ['S', 'E'],
        cur: 'E',
        lines: [...lines],
      });
      // 5. 尾数
      const rnd = {
        exact: z ? '后面没有剩余的位，不需要舍入。' : 'Nothing is left over, so no rounding.',
        up: z ? '后面剩下的部分大于最低位的一半，向上舍入（最低位加 1）。' : 'The remainder is more than half a unit in the last place, so it rounds up.',
        down: z ? '后面剩下的部分小于最低位的一半，直接舍去。' : 'The remainder is less than half a unit, so it is dropped.',
        'tie-up': z ? '剩下的恰好是一半，按「平局取偶」向上舍入成偶数。' : 'Exactly half: ties-to-even rounds up to make the last bit even.',
        'tie-down': z ? '剩下的恰好是一半，按「平局取偶」舍去（最低位已是偶数）。' : 'Exactly half: ties-to-even drops it, the last bit already being even.',
      }[r.round];
      steps.push({
        title: z ? '尾数' : 'Fraction',
        detail: (isSub ? (z ? `尾数就是 0. 后面的 ${f.mBits} 位：` : `The fraction is the ${f.mBits} bits after "0.": `) : z ? `隐含的最高位 1 不存，只存小数点后的 ${f.mBits} 位：` : `The leading 1 is implied; only the ${f.mBits} bits after the point are stored: `) + `${binOf(r.M, f.mBits)}。` + rnd,
        shown: ['S', 'E', 'M'],
        cur: 'M',
        lines: [...lines],
      });
    }
  }
  // 最后：拼接
  const hx = hexOf(r.bits, f.bits);
  const all = binOf(r.bits, f.bits);
  lines.push(`= ${all.slice(0, 1)} ${all.slice(1, 1 + f.eBits)} ${all.slice(1 + f.eBits, f.bits === 32 ? 33 : 1 + f.eBits + 20)}${f.bits === 64 ? '…' : ''} = ${hx}`);
  const back = dec(hx, f.bits);
  steps.push({
    title: z ? `拼起来：${hx}` : `Put together: ${hx}`,
    detail: z ? `符号、阶码、尾数依次拼接，每 4 位写成一个十六进制数：${hx}（也常写成 ${hx.slice(2)}H）。${back.exactStr && !r.exact ? `注意它实际表示的是 ${back.exactStr}，和 ${val} 有舍入误差。` : ''}` : `Sign, exponent and fraction side by side, read 4 bits per hex digit: ${hx}. ${back.exactStr && !r.exact ? `It actually stores ${back.exactStr}, a rounding error away from ${val}.` : ''}`,
    shown: ['S', 'E', 'M'],
    cur: null,
    hex: true,
    lines: [...lines],
  });
  return steps;
}

function decodeSteps(r, z) {
  const { f } = r;
  const all = binOf(r.bits, f.bits);
  const Es = all.slice(1, 1 + f.eBits);
  const Ms = all.slice(1 + f.eBits);
  const lines = [`${hexOf(r.bits, f.bits)} = ${all.slice(0, 1)} ${Es} ${f.bits === 32 ? Ms : Ms.slice(0, 20) + '…'}`];
  const steps = [
    { title: z ? '拆成三段' : 'Split the fields', detail: z ? `把十六进制展开成 ${f.bits} 位二进制，按 1 + ${f.eBits} + ${f.mBits} 拆开：S = ${r.sign}，E = ${Es}₂ = ${r.E}，M = ${f.bits === 32 ? Ms : Ms.slice(0, 20) + '…'}。` : `Expand to ${f.bits} bits and split 1 + ${f.eBits} + ${f.mBits}: S = ${r.sign}, E = ${Es}₂ = ${r.E}, M = ${f.bits === 32 ? Ms : Ms.slice(0, 20) + '…'}.`, shown: ['S', 'E', 'M'], cur: null, hex: true, lines: [...lines] },
  ];
  const maxE = (1 << f.eBits) - 1;
  let cls;
  if (r.kind === 'inf' || r.kind === 'nan') cls = z ? `阶码全 1（${maxE}），尾数${r.kind === 'inf' ? '全 0 → 无穷大' : '不为 0 → NaN'}` : `exponent all ones (${maxE}), fraction ${r.kind === 'inf' ? 'zero → infinity' : 'non-zero → NaN'}`;
  else if (r.kind === 'zero') cls = z ? '阶码和尾数全 0 → 零' : 'exponent and fraction zero → zero';
  else if (r.kind === 'subnormal') cls = z ? `阶码全 0、尾数不为 0 → 非规格化数：(−1)^S × 0.M × 2^${1 - f.bias}` : `exponent zero, fraction non-zero → subnormal: (−1)^S × 0.M × 2^${1 - f.bias}`;
  else cls = z ? `阶码不是全 0 也不是全 1 → 规格化数：(−1)^S × 1.M × 2^(E − ${f.bias})` : `exponent neither all zeros nor all ones → normal: (−1)^S × 1.M × 2^(E − ${f.bias})`;
  lines.push(cls);
  steps.push({ title: z ? '判断是哪一类' : 'Which kind?', detail: cls + (z ? '。' : '.'), shown: ['S', 'E', 'M'], cur: 'E', hex: true, lines: [...lines] });
  if (r.kind === 'normal' || r.kind === 'subnormal') {
    const m = trimBits(Ms);
    const expr = r.kind === 'normal' ? `${r.sign ? '-' : ''}1.${m}₂ × 2^${r.e}` : `${r.sign ? '-' : ''}0.${m}₂ × 2^${1 - f.bias}`;
    lines.push(`= ${expr}`);
    steps.push({ title: z ? '算出指数和有效数字' : 'Exponent and significand', detail: r.kind === 'normal' ? (z ? `指数 = E − ${f.bias} = ${r.E} − ${f.bias} = ${r.e}；有效数字补上隐含的 1：1.${m}₂。所以数值 = ${expr}。` : `Exponent = E − ${f.bias} = ${r.e}; restore the hidden 1: 1.${m}₂. Value = ${expr}.`) : z ? `非规格化数指数固定为 ${1 - f.bias}，有效数字没有隐含的 1：0.${m}₂。` : `Subnormals use exponent ${1 - f.bias} and no hidden 1: 0.${m}₂.`, shown: ['S', 'E', 'M'], cur: 'M', hex: true, lines: [...lines] });
  }
  const res = r.kind === 'inf' ? `${r.sign ? '-' : '+'}∞` : r.kind === 'nan' ? 'NaN' : r.exactStr;
  lines.push(`= ${res.length > 48 ? res.slice(0, 46) + '…' : res}`);
  const approx = r.exactStr != null && r.exactStr.length > 18 ? Number(r.exactStr).toPrecision(f.bits === 32 ? 9 : 17) : null;
  steps.push({ title: z ? `结果：${res.length > 24 ? res.slice(0, 22) + '…' : res}` : `Result: ${res.length > 24 ? res.slice(0, 22) + '…' : res}`, detail: z ? `这个位模式精确表示的值是 ${res}${approx ? `（约 ${approx}）` : ''}。` : `This pattern stands for exactly ${res}${approx ? ` (≈ ${approx})` : ''}.`, shown: ['S', 'E', 'M'], cur: null, hex: true, lines: [...lines] });
  return steps;
}

// ───────────────────────── 解析 ─────────────────────────

function decodeRow(ev) {
  const { r } = ev;
  const { f } = r;
  const w = f.bits;
  const reg = { name: T(`${w} 位位模式`, `${w}-bit pattern`), value: 0, bits: binOf(r.bits, w), width: w, start: 0, note: hexOf(r.bits, w), segs: [{ hi: w - 1, lo: w - 1, tone: 'rose', label: 'S' }, { hi: w - 2, lo: f.mBits, tone: 'amber', label: T('阶码 E', 'Exponent') }, { hi: f.mBits - 1, lo: 0, tone: 'blue', label: T('尾数 M', 'Fraction') }] };
  const fld = (hi, lo, label, value, tone) => ({ label, value, start: w - 1 - hi, end: w - lo, tone });
  return {
    label: T('浮点数解析', 'Float decoder'),
    tag: { color: 'amber', text: w === 32 ? 'float' : 'double' },
    title: L(ev.what),
    meta: [[T('位模式', 'Bits'), hexOf(r.bits, w)]],
    hint: T('悬停字段，位格子里对应的位会高亮。', 'Hover a field to light up its bits.'),
    unit: 'bit',
    view: { kind: 'bits', regs: [reg] },
    layers: [
      {
        name: T('IEEE 754', 'IEEE 754'),
        summary: hexOf(r.bits, w),
        start: 0,
        end: w,
        open: true,
        fields: [
          fld(w - 1, w - 1, T('符号 S', 'Sign'), String(r.sign), 'rose'),
          fld(w - 2, f.mBits, T('阶码 E', 'Exponent'), `${binOf(BigInt(r.E), f.eBits)} = ${r.E}${r.e != null && r.kind === 'normal' ? ` → ${r.E} − ${f.bias} = ${r.e}` : ''}`, 'amber'),
          fld(f.mBits - 1, 0, T('尾数 M', 'Fraction'), binOf(r.M, f.mBits), 'blue'),
          { label: T('步骤说明', 'This step'), value: ev.detail, start: 0, end: 0, note: true },
        ],
      },
    ],
  };
}

const kit = boardKit({
  spec: SPEC,
  rowsName: T('转换步骤', 'Steps'),
  emptyRows: T('按「播放」或「单步」，每一步都会记在这里。点任意一行看按位拆分。', 'Press Play or Step; each step is logged here. Click a row for its bits.'),
  cols: [
    { label: T('序号', 'No.'), cls: 'col-no' },
    { label: T('步骤', 'Step'), cls: 'col-op' },
    { label: T('说明', 'Detail'), cls: 'col-info' },
  ],
  cells: (ev, idx) => [`<i class="dot"></i>${idx + 1}`, L(ev.what), L(ev.detail)],
  decode: decodeRow,
});

export const DEFAULTS = { mode: 'encode', width: 32, value: '-8.25', hex: 'C1040000' };

function build(params) {
  const width = Number(params.width) === 64 ? 64 : 32;
  const r = params.mode === 'decode' ? dec(params.hex ?? '', width) : encode(params.value ?? '', width);
  const lesson = {
    id: 'ieee754',
    kit,
    where: [['co', 'data']],
    principle: FP_PRINCIPLE,
    tag: '754',
    name: T('IEEE 754 浮点数', 'IEEE 754 floats'),
    full: T('符号 · 阶码（移码）· 尾数（隐含 1）· 舍入', 'Sign · biased exponent · fraction with hidden 1 · rounding'),
    title: params.mode === 'decode' ? T(`解码 ${params.hex}H`, `Decode ${params.hex}H`) : T(`${params.value} → ${width === 32 ? '单精度' : '双精度'}`, `${params.value} → ${width === 32 ? 'single' : 'double'}`),
    badge: width === 32 ? 'float' : 'double',
    nodes: [],
    legend: [
      ['rose', T('符号', 'Sign')],
      ['amber', T('阶码', 'Exponent')],
      ['blue', T('尾数', 'Fraction')],
    ],
    errors: r.ok ? [] : r.errors.map((e) => ERR[e] ?? e),
    overview: {
      desc: T(
        '计算机里的实数用「科学计数法」存：符号、指数、有效数字各占一段。IEEE 754 规定了每段多少位、指数怎么偏置、最高位的 1 为什么不存。下面可以输入任意十进制数，或者反过来输入一个十六进制位模式，看每一位是怎么来的。',
        'Real numbers are stored in scientific notation: sign, exponent and significand each get a field. IEEE 754 fixes the widths, the exponent bias and why the leading 1 is not stored. Enter any decimal, or a hex pattern to go the other way, and see where every bit comes from.',
      ),
      facts: [
        [T('格式', 'Format'), width === 32 ? T('1 + 8 + 23 位，偏置 127', '1 + 8 + 23 bits, bias 127') : T('1 + 11 + 52 位，偏置 1023', '1 + 11 + 52 bits, bias 1023')],
        [T('规格化数', 'Normal'), '(−1)^S × 1.M × 2^(E − bias)'],
      ],
    },
    start: { nodes: [], frame: { rect: geo(width).rect }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!r.ok) return lesson;
  const zh = params.mode === 'decode' ? decodeSteps(r, true) : encodeSteps(r, true);
  const en = params.mode === 'decode' ? decodeSteps(r, false) : encodeSteps(r, false);
  const board = (s, e) => ({ type: 'board', items: boardAt(r, new Set(s.shown), s.cur, s.lines, true, s.hex), itemsEn: boardAt(r, new Set(e.shown), e.cur, e.lines, false, e.hex), ms: 500 });
  lesson.start.events = [{ type: 'board', items: boardAt(r, new Set(params.mode === 'decode' ? ['S', 'E', 'M'] : []), null, [], true, params.mode === 'decode'), itemsEn: boardAt(r, new Set(params.mode === 'decode' ? ['S', 'E', 'M'] : []), null, [], false, params.mode === 'decode') }];
  lesson.steps = zh.map((s, i) => {
    const e = en[i];
    const what = { zh: s.title, en: e.title };
    const detail = { zh: s.detail, en: e.detail };
    return {
      title: what,
      desc: { zh: cut(s.lines.at(-1) ?? ''), en: cut(e.lines.at(-1) ?? '') },
      detail,
      facts: [],
      events: [board(s, e), { type: 'row', color: s.cur ? TONE[s.cur] : 'slate', r, what, detail }],
    };
  });
  const hx = hexOf(r.bits, width);
  const back = r.kind === 'nan' || r.kind === 'inf' || r.kind === 'overflow' ? null : dec(hx, width).exactStr;
  lesson.outro = {
    title: T('转换完成', 'Done'),
    text: T('考试里常见的变化：给一个 float 变量的十六进制机器码求真值；比较两种格式能表示的范围和精度；判断某个十进制小数能不能精确表示（只有分母是 2 的幂的分数才能）。', 'Common exam twists: give a float’s hex and ask for its value; compare range and precision of the two formats; decide whether a decimal is exactly representable (only fractions with a power-of-two denominator are).'),
    facts: [
      [T('位模式', 'Bits'), hx],
      [T('二进制', 'Binary'), `${binOf(r.bits, width).slice(0, 1)} ${binOf(r.bits, width).slice(1, 1 + r.f.eBits)} ${binOf(r.bits, width).slice(1 + r.f.eBits, width === 32 ? 33 : 1 + r.f.eBits + 16)}${width === 64 ? '…' : ''}`],
      ...(back != null ? [[T('精确值', 'Exact value'), back.length > 60 ? back.slice(0, 58) + '…' : back]] : []),
      ...(params.mode === 'encode' && r.exact === false && back != null ? [[T('是否精确', 'Exact?'), T('否，有舍入误差', 'no, rounded')]] : []),
    ],
  };
  lesson.steps.forEach((s, i, all) => (s.ref ??= fpRef(params.mode)(s, i, all)));
  return lesson;
}

export const makeFp = () => parametric('ieee754', DEFAULTS, build);
