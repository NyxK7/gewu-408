// IEEE 754 的纯计算：十进制 → 单 / 双精度位模式（用 BigInt 有理数精确舍入，就近舍入到偶数），以及位模式 → 数值。
// 不经过 JS 的 Number 中转，所以不会有「先舍入成双精度再舍入成单精度」的双重舍入误差。

export const FMT = {
  32: { bits: 32, eBits: 8, mBits: 23, bias: 127 },
  64: { bits: 64, eBits: 11, mBits: 52, bias: 1023 },
};

const B = BigInt;
const bitLen = (n) => (n === 0n ? 0 : n.toString(2).length);

/** 解析十进制字符串为 { neg, num, den }（BigInt），或特殊值 inf / nan */
export function parseDecimal(s) {
  const t = String(s).trim().toLowerCase().replace(/_/g, '');
  const sp = t.match(/^([+-]?)(inf|infinity|∞|nan)$/);
  if (sp) return { neg: sp[1] === '-', special: sp[2] === 'nan' ? 'nan' : 'inf' };
  const m = t.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
  if (!m || (!m[2] && !m[3])) return null;
  const digits = (m[2] || '') + (m[3] || '');
  let exp10 = -(m[3] || '').length + Number(m[4] || 0);
  if (Math.abs(exp10) > 400) return null;
  let num = B(digits || '0');
  let den = 1n;
  if (exp10 >= 0) num *= 10n ** B(exp10);
  else den = 10n ** B(-exp10);
  return { neg: m[1] === '-', num, den };
}

/** 有理数 → 二进制展开的文字（整数部分全写，小数部分最多 maxFrac 位，未尽加 …） */
export function binaryExpansion(num, den, maxFrac = 32) {
  const ip = num / den;
  let r = num % den;
  let frac = '';
  while (r !== 0n && frac.length < maxFrac) {
    r *= 2n;
    frac += r >= den ? '1' : '0';
    if (r >= den) r -= den;
  }
  return { int: ip.toString(2), frac, more: r !== 0n };
}

/** 十进制 → 位模式 */
export function encode(str, width = 32) {
  const f = FMT[width];
  const p = parseDecimal(str);
  if (!p) return { ok: false, errors: ['parse'] };
  const sign = p.neg ? 1 : 0;
  const maxE = (1 << f.eBits) - 1;
  const pack = (E, M) => (B(sign) << B(width - 1)) | (B(E) << B(f.mBits)) | M;
  if (p.special) {
    const M = p.special === 'nan' ? 1n << B(f.mBits - 1) : 0n;
    return { ok: true, width, f, sign, kind: p.special, E: maxE, M, bits: pack(maxE, M), input: str };
  }
  const { num, den } = p;
  if (num === 0n) return { ok: true, width, f, sign, kind: 'zero', E: 0, M: 0n, bits: pack(0, 0n), input: str, exact: true };

  // e = ⌊log2(num/den)⌋
  let e = bitLen(num) - bitLen(den);
  const geq = (a, b) => a >= b;
  const ge2 = (k) => (k >= 0 ? geq(num, den << B(k)) : geq(num << B(-k), den));
  if (!ge2(e)) e--;
  const eMin = 1 - f.bias;
  let kind = 'normal';
  let shift; // 有效数字 = x × 2^shift
  if (e < eMin) {
    kind = 'subnormal';
    shift = f.mBits - eMin;
  } else shift = f.mBits - e;
  // q = round(x × 2^shift)，就近舍入，平局取偶
  const n2 = shift >= 0 ? num << B(shift) : num;
  const d2 = shift >= 0 ? den : den << B(-shift);
  let q = n2 / d2;
  const r = n2 % d2;
  const exact = r === 0n;
  let round = 'exact';
  if (!exact) {
    const twice = 2n * r;
    if (twice > d2 || (twice === d2 && q % 2n === 1n)) {
      q += 1n;
      round = twice === d2 ? 'tie-up' : 'up';
    } else round = twice === d2 ? 'tie-down' : 'down';
  }
  const one = 1n << B(f.mBits);
  let E;
  let M;
  if (kind === 'subnormal') {
    if (q >= one) {
      kind = 'normal';
      E = 1;
      M = q - one;
    } else {
      E = 0;
      M = q;
      if (q === 0n) kind = 'zero';
    }
  } else {
    if (q >= one << 1n) {
      q >>= 1n;
      e++;
    }
    E = e + f.bias;
    M = q - one;
  }
  if (E >= maxE) return { ok: true, width, f, sign, kind: 'overflow', E: maxE, M: 0n, bits: pack(maxE, 0n), input: str, e, exact: false, round, num, den };
  return { ok: true, width, f, sign, kind, e, E, M, q, bits: pack(E, M), input: str, exact, round, num, den };
}

/** 位模式 → 数值（精确的十进制字符串 + 类别） */
export function decode(hexStr, width = 32) {
  const f = FMT[width];
  const t = String(hexStr).trim().replace(/^0x/i, '').replace(/h$/i, '').replace(/[\s_]/g, '');
  if (!new RegExp(`^[0-9a-f]{1,${width / 4}}$`, 'i').test(t)) return { ok: false, errors: ['hex'] };
  const bits = B('0x' + t);
  const sign = Number(bits >> B(width - 1));
  const E = Number((bits >> B(f.mBits)) & B((1 << f.eBits) - 1));
  const M = bits & ((1n << B(f.mBits)) - 1n);
  const maxE = (1 << f.eBits) - 1;
  let kind;
  let sig;
  let exp;
  if (E === maxE) kind = M === 0n ? 'inf' : 'nan';
  else if (E === 0) {
    kind = M === 0n ? 'zero' : 'subnormal';
    sig = M;
    exp = 1 - f.bias - f.mBits;
  } else {
    kind = 'normal';
    sig = M | (1n << B(f.mBits));
    exp = E - f.bias - f.mBits;
  }
  let exactStr = null;
  if (kind === 'normal' || kind === 'subnormal' || kind === 'zero') exactStr = (sign ? '-' : '') + exactDecimal(sig, exp);
  return { ok: true, width, f, bits, sign, E, M, kind, e: kind === 'normal' ? E - f.bias : kind === 'subnormal' ? 1 - f.bias : null, exactStr };
}

/** sig × 2^exp 的精确十进制表示 */
export function exactDecimal(sig, exp) {
  if (sig === 0n) return '0';
  if (exp >= 0) return (sig << B(exp)).toString();
  const k = -exp;
  const n = sig * 5n ** B(k); // sig × 2^-k = sig × 5^k / 10^k
  let s = n.toString().padStart(k + 1, '0');
  s = `${s.slice(0, s.length - k)}.${s.slice(s.length - k)}`.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

export const hexOf = (bits, width) => '0x' + bits.toString(16).toUpperCase().padStart(width / 4, '0');
export const binOf = (v, n) => v.toString(2).padStart(n, '0');
