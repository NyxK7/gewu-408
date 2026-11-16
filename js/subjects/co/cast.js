// C 语言整数类型转换的纯计算（按 32 位机器、补码表示）：
//   · 宽度相同：位不变，只是换一种解释（有符号 ↔ 无符号）；
//   · 变宽：看**原类型**——有符号就符号扩展（高位补符号位），无符号就零扩展（高位补 0）；
//   · 变窄：直接截断，只留低位，再按新类型解释。
// 有符号和无符号之间、宽度不同的转换（如 short → unsigned int）先按原类型扩展，再按新类型解释。

const err = (e) => ({ ok: false, errors: [e] });
export const TYPES = {
  char: { w: 8, s: true, name: 'char' },
  uchar: { w: 8, s: false, name: 'unsigned char' },
  short: { w: 16, s: true, name: 'short' },
  ushort: { w: 16, s: false, name: 'unsigned short' },
  int: { w: 32, s: true, name: 'int' },
  uint: { w: 32, s: false, name: 'unsigned int' },
};
export const rangeOf = (t) => (t.s ? [-(2 ** (t.w - 1)), 2 ** (t.w - 1) - 1] : [0, 2 ** t.w - 1]);
export const bitsOf = (v, w) => {
  const u = v < 0 ? 2 ** w + v : v;
  return u.toString(2).padStart(w, '0');
};
export const valueOf = (bits, signed) => {
  const u = parseInt(bits, 2);
  return signed && bits[0] === '1' ? u - 2 ** bits.length : u;
};
export const hexOf = (bits) => '0x' + parseInt(bits, 2).toString(16).toUpperCase().padStart(bits.length / 4, '0');

export function cast({ from = 'short', to = 'uint', value = -1 }) {
  const F = TYPES[from];
  const D = TYPES[to];
  if (!F) return err('from');
  if (!D) return err('to');
  const [lo, hi] = rangeOf(F);
  if (!Number.isInteger(value) || value < lo || value > hi) return err('value');
  const src = bitsOf(value, F.w);
  let op;
  let dst;
  let fill = null;
  if (D.w === F.w) {
    op = 'same';
    dst = src;
  } else if (D.w > F.w) {
    fill = F.s ? src[0] : '0';
    op = F.s ? 'sext' : 'zext';
    dst = fill.repeat(D.w - F.w) + src;
  } else {
    op = 'trunc';
    dst = src.slice(F.w - D.w);
  }
  const result = valueOf(dst, D.s);
  const other = valueOf(dst, !D.s); // 同一串位换一种解释
  const lost = op === 'trunc' ? src.slice(0, F.w - D.w) : '';
  return { ok: true, from, to, F, D, value, src, dst, op, fill, result, other, lost, changed: result !== value };
}
