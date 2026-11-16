// 「C 语言整数类型转换」：上下两行按位对齐画出转换前、后的二进制（同一列就是同一个位权），
// 扩展出来的高位标成橙色，截掉的高位标成红色；最后同一串位分别按有符号、无符号读一遍。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { finish, make, pit, shell } from './kit.js';
import { TYPES, bitsOf, cast, hexOf, rangeOf, valueOf } from './cast.js';

const W = [['co', 'data']];
const CW = 24;
const X0 = 140;
const xOf = (i) => X0 + (31 - i) * CW + Math.floor((31 - i) / 4) * 6; // 第 i 位（0 是最低位）的横坐标
const Y1 = 170;
const Y2 = 330;

// 有符号和无符号混在一起比较：由代码算
const MIX = (() => {
  const a = -1;
  const asU = valueOf(bitsOf(a, 32), false);
  return { a, asU, cmp: asU < 0 };
})();

const PRINCIPLE = {
  sections: [
    {
      id: 'rules',
      title: T('三条规则', 'Three rules'),
      blocks: [
        {
          table: {
            head: [T('情况', 'Case'), T('位怎么变', 'Bits'), T('例子（32 位机器）', 'Example')],
            rows: [
              [T('宽度相同，有符号 ↔ 无符号', 'Same width, signed ↔ unsigned'), T('位**不变**，只是换一种解释', 'bits **unchanged**, reinterpreted'), T('short −1（0xFFFF）→ unsigned short 65535', 'short −1 → unsigned short 65535')],
              [T('变宽，原类型有符号', 'Widen a signed type'), T('**符号扩展**：高位全部补原来的符号位', '**sign extension**'), T('char −128（0x80）→ int −128（0xFFFFFF80）', 'char −128 → int −128')],
              [T('变宽，原类型无符号', 'Widen an unsigned type'), T('**零扩展**：高位全部补 0', '**zero extension**'), T('unsigned short 65535 → int 65535（0x0000FFFF）', 'unsigned short 65535 → int 65535')],
              [T('变窄', 'Narrow'), T('**截断**：只留低位，再按新类型解释', '**truncate** to the low bits'), T('int 32768（0x00008000）→ short −32768', 'int 32768 → short −32768')],
            ],
          },
        },
        { warn: T('扩展方式看的是**原来的类型**有没有符号，不看目标类型。short −1 转成 unsigned int：先按 short 符号扩展成 0xFFFFFFFF，再当无符号数读，是 4294967295。', 'The extension depends on the **source** type: short −1 → unsigned int is 0xFFFFFFFF = 4294967295.') },
      ],
    },
    {
      id: 'range',
      title: T('各类型的取值范围', 'Ranges'),
      blocks: [
        {
          table: {
            head: [T('类型', 'Type'), T('位数', 'Bits'), T('范围', 'Range')],
            rows: Object.values(TYPES).map((t) => {
              const [lo, hi] = rangeOf(t);
              return [t.name, String(t.w), `${lo} ～ ${hi}`];
            }),
          },
        },
        { tip: T('n 位补码的范围是 −2ⁿ⁻¹ ～ 2ⁿ⁻¹ − 1，最小负数没有对应的正数；n 位无符号数是 0 ～ 2ⁿ − 1。', 'n-bit two’s complement: −2ⁿ⁻¹ to 2ⁿ⁻¹ − 1; unsigned: 0 to 2ⁿ − 1.') },
      ],
    },
    {
      id: 'mix',
      title: T('有符号和无符号混在一起', 'Mixing signed and unsigned'),
      blocks: [
        { p: T('C 语言里，一个运算的两边一个是 int、一个是 unsigned int 时，int 会先**转成 unsigned int** 再算（位不变）。比较大小时就会出现「反直觉」的结果。', 'When int meets unsigned int, the int is **converted to unsigned** first, which surprises comparisons.') },
        { formula: T(`-1 < 0u：-1 的位是 0xFFFFFFFF，当无符号数是 ${MIX.asU}，所以表达式的值是 ${MIX.cmp ? 1 : 0}（假）。`, `-1 < 0u: −1 becomes ${MIX.asU}, so the result is ${MIX.cmp ? 1 : 0}.`) },
        { list: [
          T('char、short 参加运算前先提升为 int（整型提升）。', 'char and short are promoted to int first.'),
          T('无符号数的循环 for (unsigned i = n; i >= 0; i--) 永远不会结束：i 减到 0 再减就变成最大值。', 'for (unsigned i = n; i >= 0; i--) never ends.'),
        ] },
      ],
    },
    pit([
      T('强制类型转换不改变机器数的位（同宽时），改变的是解释方式。', 'Same-width casts keep the bits.'),
      T('扩展看原类型的符号，截断后看新类型的符号。', 'Extension follows the source; truncation is read with the target type.'),
      T('大小端只影响字节在内存里的排列，和这里的转换规则无关。', 'Endianness is unrelated.'),
    ]),
  ],
};

const tOpt = Object.entries(TYPES).map(([k, t]) => [k, t.name]);
const SPEC = {
  presets: [
    { label: T('short −1 → unsigned int', 'short −1 → unsigned int'), set: { from: 'short', to: 'uint', value: -1 } },
    { label: T('unsigned short 65535 → int（零扩展）', 'unsigned short 65535 → int'), set: { from: 'ushort', to: 'int', value: 65535 } },
    { label: T('int 32768 → short（截断变负数）', 'int 32768 → short'), set: { from: 'int', to: 'short', value: 32768 } },
    { label: T('short −12345 → unsigned short', 'short −12345 → unsigned short'), set: { from: 'short', to: 'ushort', value: -12345 } },
    { label: T('char −128 → int（符号扩展）', 'char −128 → int'), set: { from: 'char', to: 'int', value: -128 } },
    { label: T('int −129 → char', 'int −129 → char'), set: { from: 'int', to: 'char', value: -129 } },
  ],
  groups: [{ legend: T('转换', 'Cast'), fields: [
    { name: 'from', label: T('原类型', 'From'), type: 'select', options: tOpt },
    { name: 'value', label: T('原来的值（十进制）', 'Value (decimal)'), type: 'text', parse: (s) => (/^-?\d+$/.test(String(s).trim()) ? +s : NaN) },
    { name: 'to', label: T('转换成', 'To'), type: 'select', options: tOpt },
  ] }],
  note: T('32 位机器：char 8 位、short 16 位、int 32 位，都用补码。', '32-bit machine: char 8, short 16, int 32 bits, two’s complement.'),
};
const ERR = { from: T('类型不对', 'Unknown type'), to: T('类型不对', 'Unknown type'), value: T('值超出了原类型的范围', 'Value out of range for the source type') };

function bitRow(bits, z, { tone = () => '', hot = () => false } = {}) {
  let h = '';
  const w = bits.length;
  for (let j = 0; j < w; j++) {
    const i = w - 1 - j; // 位号
    h += `<g transform="translate(${xOf(i)} 0)">${cell(CW - 2, 34, bits[j], { size: 14, tone: tone(i, bits[j]), cls: hot(i) ? 'hot' : '' })}</g>`;
  }
  return h;
}

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const kind = k >= 0 ? sim.kinds[k] : 'pre';
  const { F, D } = sim;
  let h = '';
  for (const i of [31, 24, 23, 16, 15, 8, 7, 0]) h += txt(xOf(i) + CW / 2 - 1, Y1 - 40, String(i), 'bt-idx');
  // 原值
  h += txt(X0 - 12, Y1 + 22, F.name, 'bt-lab', 'end');
  h += `<g transform="translate(0 ${Y1})">` + bitRow(sim.src, z, {
    tone: (i) => (kind !== 'pre' && sim.op === 'trunc' && i >= D.w && kind !== 'src' ? 'rose' : i === F.w - 1 && F.s ? 'violet' : 'blue'),
    hot: (i) => (kind === 'op' && sim.op === 'trunc' && i >= D.w) || (kind === 'op' && sim.op === 'sext' && i === F.w - 1),
  }) + '</g>';
  h += txt(xOf(F.w - 1), Y1 + 58, z ? `${sim.value}　= ${hexOf(sim.src)}${sim.value < 0 ? `（2^${F.w} − ${-sim.value} = ${2 ** F.w + sim.value}）` : ''}` : `${sim.value} = ${hexOf(sim.src)}`, 'ar-mono', 'start');
  // 转换后
  if (kind !== 'pre' && kind !== 'src') {
    h += txt(X0 - 12, Y2 + 22, D.name, 'bt-lab', 'end');
    h += `<g transform="translate(0 ${Y2})">` + bitRow(sim.dst, z, {
      tone: (i) => (i >= F.w ? 'amber' : i === D.w - 1 && D.s ? 'violet' : 'green'),
      hot: (i) => kind === 'op' && i >= F.w,
    }) + '</g>';
    const opText = { same: T('宽度相同：位原样不动', 'same width: bits kept'), sext: T(`符号扩展：高 ${D.w - F.w} 位补符号位 ${sim.fill}`, `sign-extend with ${sim.fill}`), zext: T(`零扩展：高 ${D.w - F.w} 位补 0`, 'zero-extend'), trunc: T(`截断：去掉高 ${F.w - D.w} 位，只留低 ${D.w} 位`, `truncate to ${D.w} bits`) }[sim.op];
    h += txt(xOf(31), (Y1 + Y2) / 2 + 16, z ? opText.zh : opText.en, 'cw-lab acc l');
    if (kind === 'dst' || kind === 'other') h += txt(xOf(D.w - 1), Y2 + 58, z ? `按 ${D.name} 读：${hexOf(sim.dst)} = ${sim.result}` : `as ${D.name}: ${sim.result}`, 'ar-mono', 'start');
    if (kind === 'other') h += txt(xOf(D.w - 1), Y2 + 84, z ? `同一串位当${D.s ? '无符号数' : '有符号数（补码）'}读是 ${sim.other}` : `the same bits as ${D.s ? 'unsigned' : 'signed'}: ${sim.other}`, 'bt-cap', 'start');
  }
  items.push({ k: 'rows', x: 0, y: 0, html: h });
  return items;
}

function build(p, kit, ERR) {
  const sim = cast(p);
  const lesson = shell('int-cast', kit, ERR, sim, {
    where: W,
    tag: T('转换', 'Cast'),
    name: T('C 语言整数类型转换', 'C integer conversions'),
    full: T('有符号与无符号 · 符号扩展 · 零扩展 · 截断 · 各类型范围 · 混合运算时转成无符号', 'Signed and unsigned · sign and zero extension · truncation · ranges · mixed arithmetic'),
    title: SPEC.presets.find((x) => x.set.from === p.from && x.set.to === p.to && x.set.value === p.value)?.label ?? T('整数类型转换', 'Integer conversion'),
    legend: [['amber', T('扩展出来的高位', 'Extended bits')], ['rose', T('被截掉的高位', 'Truncated bits')], ['violet', T('符号位', 'Sign bit')]],
    principle: PRINCIPLE,
    desc: T('short 的 −1 赋给 unsigned int 变成多少？int 的 32768 截成 short 呢？这节课把转换前后的二进制按位对齐：变宽时看原类型补符号位或 0，变窄时直接截掉高位，最后再按新类型读出来。', 'Line up the bits before and after: widen with the sign or zeros, narrow by truncation, then read with the new type.'),
    rect: [0, 100, 980, 420],
  });
  if (!sim.ok) return lesson;
  sim.kinds = ['src', 'op', 'dst', 'other'];
  const { F, D } = sim;
  const list = sim.kinds.map((kind, k) => {
    let d;
    if (kind === 'src') d = [T(`${F.name} ${sim.value} 的机器数`, `${F.name} ${sim.value} in bits`), T(`${F.name} 是 ${F.w} 位${F.s ? '补码' : '无符号数'}。${sim.value < 0 ? `负数的补码 = 2^${F.w} + (${sim.value}) = ${2 ** F.w + sim.value}，` : ''}写成二进制是 ${sim.src}，即 ${hexOf(sim.src)}。`, `${F.w}-bit ${F.s ? 'two’s complement' : 'unsigned'}: ${hexOf(sim.src)}.`), 'range'];
    else if (kind === 'op') d = sim.op === 'same'
      ? [T('宽度一样：位不变', 'Same width: bits unchanged'), T(`${F.name} 和 ${D.name} 都是 ${F.w} 位，转换时机器数一位都不变，只是以后按 ${D.name} 来解释。`, 'Only the interpretation changes.'), 'rules']
      : sim.op === 'trunc'
        ? [T(`截断成 ${D.w} 位`, `Truncate to ${D.w} bits`), T(`${D.name} 只有 ${D.w} 位，直接丢掉高 ${F.w - D.w} 位（${sim.lost}），只留低 ${D.w} 位 ${sim.dst}。截断不管原来的值是正是负。`, `Drop the high bits ${sim.lost}.`), 'rules']
        : [T(sim.op === 'sext' ? '符号扩展' : '零扩展', sim.op === 'sext' ? 'Sign-extend' : 'Zero-extend'), T(`变宽到 ${D.w} 位，看原类型 ${F.name}：${F.s ? `有符号，高位补符号位 ${sim.fill}` : '无符号，高位补 0'}，得 ${hexOf(sim.dst)}。${F.s && !D.s ? `注意目标类型是无符号的，但扩展方式只看原类型。` : ''}`, `${F.s ? 'Signed source: copy the sign' : 'Unsigned source: zeros'} → ${hexOf(sim.dst)}.`), 'rules'];
    else if (kind === 'dst') d = [T(`按 ${D.name} 读出：${sim.result}`, `Read as ${D.name}: ${sim.result}`), T(`${D.s ? `最高位是 ${sim.dst[0]}，${sim.dst[0] === '1' ? `是负数：${parseInt(sim.dst, 2)} − 2^${D.w} = ${sim.result}` : `是正数 ${sim.result}`}` : `无符号数直接按二进制算：${sim.result}`}。${sim.changed ? `和原来的 ${sim.value} 不一样了。` : '值没变。'}`, `${D.name}: ${sim.result}${sim.changed ? ' — changed.' : '.'}`), 'rules'];
    else d = [T('同一串位，换种解释', 'Same bits, other reading'), T(`${hexOf(sim.dst)} 如果当作${D.s ? '无符号数' : '补码有符号数'}，值是 ${sim.other}。机器里存的只是位，有没有符号是程序（类型）说了算。`, `As ${D.s ? 'unsigned' : 'signed'}: ${sim.other}.`), 'mix'];
    return { title: d[0], desc: T(['机器数', '转换', '结果', '另一种解释'][k], kind), detail: d[1], ref: d[2], st: { k }, row: { color: 'blue', what: d[0], result: T(kind === 'dst' ? String(sim.result) : '—', kind === 'dst' ? String(sim.result) : '—'), tone: 'info' } };
  });
  const title = T(`(${D.name}) ${sim.value} = ${sim.result}`, `(${D.name}) ${sim.value} = ${sim.result}`);
  const text = T(`${hexOf(sim.src)} → ${hexOf(sim.dst)}，${{ same: '位不变', sext: '符号扩展', zext: '零扩展', trunc: '截断' }[sim.op]}。`, `${hexOf(sim.src)} → ${hexOf(sim.dst)} (${sim.op}).`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeIntCast = make('int-cast', SPEC, ERR, build);
