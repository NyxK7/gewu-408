// 数据的表示和运算的纯计算：四种编码、补码加减与标志位、原码一位乘与 Booth 乘法、恢复余数与加减交替除法、
// 浮点数加减、大端小端与结构体对齐。
//
// 约定（界面上写明）：
//   · 编码、加减、乘除都用 n 位整数（不是定点小数）；移码的偏置值是 2^(n−1)；
//   · 加减：减法 = 加上「减数取反末位加 1」，进位输入 1；OF = Cn ⊕ Cn−1，CF = Cn ⊕ Cin（无符号数的进位 / 借位），
//     SF 是结果最高位，ZF 是结果是否为 0；
//   · 原码一位乘：数值部分 n 位，C、A、Q 一起逻辑右移；Booth：A 用 n + 1 位（双符号位）、Q 用 n 位、附加位 Q−1，算术右移；
//   · 除法只演示数值部分（无符号），商的符号单独异或；
//   · 浮点数：阶码 e 位补码，尾数 m 位补码定点小数（另有符号位），运算时都用双符号位；舍入用 0 舍 1 入；
//   · 结构体对齐：每个成员的偏移是自身大小的整数倍，整个结构体的大小是最大成员大小的整数倍。

const err = (e) => ({ ok: false, errors: [e] });
const bits = (v, n) => (((v % 2 ** n) + 2 ** n) % 2 ** n).toString(2).padStart(n, '0');
export const tc = (v, n) => bits(v, n); // 补码位串
const toSigned = (u, n) => (u >= 2 ** (n - 1) ? u - 2 ** n : u);

// ───── 四种编码 ─────
export function encodings({ x, n }) {
  if (!(Number.isInteger(n) && n >= 4 && n <= 16)) return err('n');
  if (!Number.isInteger(x) || x < -(2 ** (n - 1)) || x > 2 ** (n - 1) - 1) return err('x');
  const mag = Math.abs(x);
  const neg = x < 0;
  const smOk = mag <= 2 ** (n - 1) - 1;
  const sm = smOk ? (neg ? '1' : '0') + bits(mag, n - 1) : null;
  const oc = smOk ? (neg ? '1' + [...bits(mag, n - 1)].map((b) => (b === '1' ? '0' : '1')).join('') : sm) : null;
  const two = bits(x, n);
  const bias = 2 ** (n - 1);
  const ex = bits(x + bias, n);
  return {
    ok: true,
    x,
    n,
    neg,
    mag,
    sm,
    oc,
    two,
    ex,
    bias,
    ranges: {
      sm: [-(2 ** (n - 1) - 1), 2 ** (n - 1) - 1],
      tc: [-(2 ** (n - 1)), 2 ** (n - 1) - 1],
      u: [0, 2 ** n - 1],
    },
    unsigned: parseInt(two, 2),
  };
}

// ───── 补码加减 ─────
export function addsub({ a, b, op = 'add', n }) {
  if (!(Number.isInteger(n) && n >= 4 && n <= 16)) return err('n');
  const lo = -(2 ** (n - 1));
  const hi = 2 ** (n - 1) - 1;
  if (![a, b].every((v) => Number.isInteger(v) && v >= lo && v <= hi)) return err('range');
  const A = parseInt(bits(a, n), 2);
  const Bin = parseInt(bits(b, n), 2);
  const sub = op === 'sub';
  const B = sub ? ~Bin & (2 ** n - 1) : Bin;
  const cin = sub ? 1 : 0;
  const c = [cin];
  const s = [];
  for (let i = 0; i < n; i++) {
    const ai = (A >> i) & 1;
    const bi = (B >> i) & 1;
    s[i] = ai ^ bi ^ c[i];
    c[i + 1] = (ai & bi) | (ai & c[i]) | (bi & c[i]);
  }
  const R = s.reduce((acc, bit, i) => acc + bit * 2 ** i, 0);
  const Cn = c[n];
  const Cn1 = c[n - 1];
  const OF = Cn ^ Cn1;
  const CF = Cn ^ cin;
  const SF = s[n - 1];
  const ZF = R === 0 ? 1 : 0;
  const exact = sub ? a - b : a + b;
  // 双符号位：把两个数扩成 n + 1 位相加
  const dA = bits(a, n + 1);
  const dB = bits(sub ? -b : b, n + 1);
  const dS = bits(exact, n + 2).slice(1); // n + 1 位，最高两位就是双符号
  return {
    ok: true,
    a,
    b,
    op,
    n,
    A: bits(A, n),
    Bin: bits(Bin, n),
    B: bits(B, n),
    cin,
    carries: c,
    R: bits(R, n),
    signed: toSigned(R, n),
    unsigned: R,
    ua: A,
    ub: Bin,
    exact,
    flags: { OF, CF, SF, ZF },
    Cn,
    Cn1,
    double: { a: dA, b: dB, s: dS, over: dS[0] !== dS[1] },
  };
}

// ───── 乘法 ─────
export function multiply({ x, y, n, method = 'sm' }) {
  if (!(Number.isInteger(n) && n >= 3 && n <= 8)) return err('n');
  const steps = [];
  if (method === 'sm') {
    const lim = 2 ** n - 1;
    if (![x, y].every((v) => Number.isInteger(v) && Math.abs(v) <= lim)) return err('range');
    const X = Math.abs(x);
    let A = 0;
    let Q = Math.abs(y);
    let C = 0;
    for (let i = 0; i < n; i++) {
      const q0 = Q & 1;
      if (q0) {
        const s = A + X;
        C = s >> n;
        A = s & lim;
      } else C = 0;
      const added = { C, A, Q };
      // C、A、Q 一起逻辑右移一位
      Q = (Q >> 1) | ((A & 1) << (n - 1));
      A = (A >> 1) | (C << (n - 1));
      C = 0;
      steps.push({ i, q0, op: q0 ? 'add' : 'none', added, A, Q });
    }
    const sign = (x < 0) ^ (y < 0);
    const mag = A * 2 ** n + Q;
    return { ok: true, method, x, y, n, X, steps, sign, mag, product: sign ? -mag : mag, check: x * y };
  }
  // Booth：x、y 都是 n 位补码
  const lo = -(2 ** (n - 1));
  const hi = 2 ** (n - 1) - 1;
  if (![x, y].every((v) => Number.isInteger(v) && v >= lo && v <= hi)) return err('range');
  let A = 0;
  let Q = parseInt(bits(y, n), 2);
  let q1 = 0;
  for (let i = 0; i < n; i++) {
    const pair = `${Q & 1}${q1}`;
    const op = pair === '10' ? 'sub' : pair === '01' ? 'add' : 'none';
    if (op === 'sub') A -= x;
    if (op === 'add') A += x;
    const added = { A, Q, q1 };
    q1 = Q & 1;
    Q = (Q >> 1) | ((((A % 2) + 2) % 2) << (n - 1));
    A = Math.floor(A / 2);
    steps.push({ i, pair, op, added, A, Q, q1 });
  }
  const product = A * 2 ** n + Q;
  return { ok: true, method, x, y, n, steps, product, check: x * y };
}

// ───── 除法（数值部分） ─────
export function divide({ x, y, n, method = 'restore' }) {
  if (!(Number.isInteger(n) && n >= 3 && n <= 8)) return err('n');
  const lim = 2 ** n - 1;
  if (![x, y].every((v) => Number.isInteger(v) && Math.abs(v) <= lim)) return err('range');
  if (y === 0) return err('zero');
  const X = Math.abs(x);
  const Y = Math.abs(y);
  let A = 0;
  let Q = X;
  const steps = [];
  for (let i = 0; i < n; i++) {
    // 左移 A、Q
    const shifted = A * 2 + ((Q >> (n - 1)) & 1);
    Q = (Q << 1) & lim;
    if (method === 'restore') {
      const t = shifted - Y;
      if (t < 0) steps.push({ i, shifted, op: 'sub', trial: t, restored: true, A: shifted, q: 0 });
      else steps.push({ i, shifted, op: 'sub', trial: t, restored: false, A: t, q: 1 });
      A = t < 0 ? shifted : t;
      Q |= t < 0 ? 0 : 1;
    } else {
      const op = A >= 0 ? 'sub' : 'add';
      const t = op === 'sub' ? shifted - Y : shifted + Y;
      const q = t >= 0 ? 1 : 0;
      steps.push({ i, shifted, op, trial: t, A: t, q });
      A = t;
      Q |= q;
    }
  }
  let fix = false;
  if (method !== 'restore' && A < 0) {
    A += Y;
    fix = true;
  }
  const sign = (x < 0) ^ (y < 0);
  return { ok: true, method, x, y, n, X, Y, steps, fix, q: Q, r: A, sign, check: [Math.trunc(X / Y), X % Y] };
}

// ───── 浮点加减 ─────
const FRAC = /^\s*([+-]?)0?\.([01]+)\s*$/;
export function parseMant(s, m) {
  const t = String(s ?? '').match(FRAC);
  if (!t || t[2].length > m) return null;
  const v = parseInt(t[2].padEnd(m, '0'), 2);
  return t[1] === '-' ? -v : v;
}
/** 补码定点小数（scale 位小数）的位串，带双符号位 */
export const mantStr = (v, scale, double = true) => {
  const b = bits(v, scale + 2);
  return `${double ? b.slice(0, 2) : b[1]}.${b.slice(2)}`;
};
const isNorm = (v, scale) => {
  // 补码规格化：符号位和小数点后第一位不同；即 v ≥ 1/2 或 −1 ≤ v < −1/2
  const one = 2 ** scale;
  return v >= one / 2 || (v < -one / 2 && v >= -one);
};
export function floatAdd({ ex, mx, ey, my, op = 'add', e, m }) {
  if (!(Number.isInteger(e) && e >= 3 && e <= 6)) return err('e');
  if (!(Number.isInteger(m) && m >= 3 && m <= 8)) return err('m');
  const emax = 2 ** (e - 1) - 1;
  const emin = -(2 ** (e - 1));
  let Mx = parseMant(mx, m);
  let My = parseMant(my, m);
  if (Mx == null || My == null) return err('mant');
  if (![ex, ey].every((v) => Number.isInteger(v) && v >= emin && v <= emax)) return err('exp');
  if (op === 'sub') My = -My;
  const steps = [];
  // 1. 对阶：小阶向大阶看齐
  const dE = ex - ey;
  const d = Math.abs(dE);
  const big = dE >= 0 ? 'x' : 'y';
  let E = Math.max(ex, ey);
  // 用 m + d 位小数精确保存右移出去的位
  let scale = m + d;
  const Lx = big === 'x' ? Mx * 2 ** d : Mx;
  const Ly = big === 'y' ? My * 2 ** d : My;
  steps.push({ kind: 'align', dE, d, big, E, x: mantStr(Lx, scale), y: mantStr(Ly, scale), scale });
  // 2. 尾数相加
  let S = Lx + Ly;
  steps.push({ kind: 'add', S: mantStr(S, scale), scale, over: S >= 2 ** scale || S < -(2 ** scale) });
  // 3. 规格化
  const norm = () => {
    if (S === 0) return 'zero';
    if (S >= 2 ** scale || S < -(2 ** scale)) {
      // 双符号位不同：右规
      scale += 1;
      E += 1;
      return 'right';
    }
    let left = 0;
    while (!isNorm(S, scale)) {
      S *= 2;
      E -= 1;
      left++;
    }
    return left ? `left${left}` : 'ok';
  };
  const n1 = norm();
  steps.push({ kind: 'norm', how: n1, S: S === 0 ? null : mantStr(S, scale), E, scale });
  if (n1 === 'zero') return { ok: true, e, m, ex, mx, ey, my, op, steps, zero: true, E: 0, M: 0, value: 0, check: (Mx / 2 ** m) * 2 ** ex + (My / 2 ** m) * 2 ** ey };
  // 4. 舍入：0 舍 1 入
  let rounded = false;
  if (scale > m) {
    const drop = scale - m;
    const q = Math.floor(S / 2 ** drop);
    const first = Math.floor(S / 2 ** (drop - 1)) - q * 2;
    const lost = bits(S, scale + 2).slice(-drop);
    const R = first ? q + 1 : q;
    rounded = !!first;
    steps.push({ kind: 'round', lost, first, before: mantStr(S, scale), S: mantStr(R, m) });
    S = R;
    scale = m;
    // 舍入可能导致尾数溢出，再右规一次
    if (S >= 2 ** m || S < -(2 ** m) || !isNorm(S, m)) {
      const how = norm();
      if (scale > m) {
        S = Math.floor(S / 2);
        scale = m;
      }
      steps.push({ kind: 'renorm', how, S: mantStr(S, m), E });
    }
  } else steps.push({ kind: 'round', lost: '', first: 0, before: mantStr(S, scale), S: mantStr(S, scale) });
  // 5. 判溢出
  const over = E > emax ? 'up' : E < emin ? 'down' : null;
  steps.push({ kind: 'check', E, over, emax, emin });
  const value = (S / 2 ** scale) * 2 ** E;
  return { ok: true, e, m, ex, mx, ey, my, op, steps, E, M: S, Mstr: mantStr(S, scale, false), Estr: bits(E, e), value, over, rounded, check: (Mx / 2 ** m) * 2 ** ex + (My / 2 ** m) * 2 ** ey };
}

// ───── 大端小端、结构体对齐 ─────
export const SIZES = { char: 1, short: 2, int: 4, float: 4, long: 8, 'long long': 8, double: 8 };
export function parseStruct(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[;；\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = it.match(/^(char|short|int|float|double|long long|long)\s+([A-Za-z_]\w*)(?:\s*\[(\d+)\])?$/);
    if (!m) return null;
    out.push({ type: m[1], name: m[2], count: m[3] ? Number(m[3]) : 1, size: SIZES[m[1]] });
  }
  return out.length ? out : null;
}
export function layout(members) {
  let off = 0;
  const rows = members.map((mb) => {
    const pad = (mb.size - (off % mb.size)) % mb.size;
    off += pad;
    const r = { ...mb, offset: off, pad, bytes: mb.size * mb.count };
    off += r.bytes;
    return r;
  });
  const maxA = Math.max(...members.map((mb) => mb.size));
  const tail = (maxA - (off % maxA)) % maxA;
  return { rows, used: off, tail, total: off + tail, maxA };
}
export function endian({ value, addr, width, struct }) {
  if (![4, 8].includes(width)) return err('width');
  if (!/^[0-9a-fA-F]+$/.test(value ?? '') || value.length > width * 2) return err('value');
  if (!/^[0-9a-fA-F]+$/.test(addr ?? '')) return err('addr');
  const hex = value.toUpperCase().padStart(width * 2, '0');
  const bytes = hex.match(/../g);
  const base = parseInt(addr, 16);
  const mem = (order) => order.map((b, i) => ({ addr: (base + i).toString(16).toUpperCase(), b }));
  const members = parseStruct(struct);
  if (!members) return err('struct');
  const lay = layout(members);
  const best = layout([...members].sort((p, q) => q.size - p.size));
  return { ok: true, hex, width, base, big: mem(bytes), little: mem([...bytes].reverse()), aligned: base % width === 0, members, lay, best };
}
