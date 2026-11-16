// 基本分页 / 基本分段 / 段页式的地址变换：纯计算，Node 里也能跑（见 tests/addr.test.mjs）。
// 约定（界面上写明）：
//   · 分页：页号 P = A ÷ L（取整），页内偏移 W = A mod L；P ≥ 页表长度 M 时越界中断；物理地址 = b × L + W；
//   · 分段：逻辑地址直接给成 (段号 s, 段内地址 w)；s ≥ 段表长度、w ≥ 段长都会越界中断；物理地址 = 基址 + w；
//   · 段页式：段内地址 w 再拆成 段内页号 p = w ÷ L、页内偏移 d = w mod L；s ≥ 段表长度、p ≥ 该段页表长度都越界；
//   · 页表项 / 段表项地址 = 表始址 + 号 × 表项长度，只用来说明「查表也要访问一次内存」；
//   · 访存次数：分页、分段都是 2 次（查表 1 次 + 取数据 1 次），段页式 3 次；本课不考虑快表。

export const MODES = ['page', 'seg', 'segpage'];

const isPow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

export function simulate(p) {
  const errors = [];
  const { mode } = p;
  if (!MODES.includes(mode)) return { ok: false, errors: ['mode'] };
  const L = p.pageSize;
  const entry = p.entrySize ?? 4;
  const base = p.tableBase ?? 0;
  if (mode !== 'seg' && !isPow2(L)) errors.push('pageSize');
  if (!(entry >= 1 && entry <= 16)) errors.push('entrySize');
  if (!(base >= 0)) errors.push('tableBase');

  if (mode === 'page') {
    const table = p.frames ?? [];
    const A = p.addr;
    if (!table.length || table.length > 16) errors.push('frames');
    if (!Number.isSafeInteger(A) || A < 0) errors.push('addr');
    if (errors.length) return { ok: false, errors };
    const P = Math.floor(A / L);
    const W = A % L;
    const out = { ok: true, mode, L, entry, base, table, A, P, W, M: table.length, k: Math.log2(L) };
    if (P >= table.length) return { ...out, fault: 'page', accesses: 0 };
    const entryAddr = base + P * entry;
    const b = table[P];
    return { ...out, entryAddr, b, E: b * L + W, accesses: 2 };
  }

  if (mode === 'seg') {
    const bases = p.bases ?? [];
    const lens = p.lens ?? [];
    const { s, w } = p;
    if (!bases.length || bases.length > 10) errors.push('bases');
    if (bases.length !== lens.length) errors.push('lens');
    if (!Number.isInteger(s) || s < 0) errors.push('s');
    if (!Number.isInteger(w) || w < 0) errors.push('w');
    if (errors.length) return { ok: false, errors };
    // 段在内存里不能重叠（否则就不是合法的段表）
    const segs = bases.map((b, i) => ({ i, base: b, len: lens[i] })).sort((a, b) => a.base - b.base);
    for (let i = 1; i < segs.length; i++) if (segs[i].base < segs[i - 1].base + segs[i - 1].len) return { ok: false, errors: [['overlap', { a: segs[i - 1].i, b: segs[i].i }]] };
    const out = { ok: true, mode, entry, base, bases, lens, s, w, n: bases.length };
    if (s >= bases.length) return { ...out, fault: 'seg', accesses: 0 };
    const entryAddr = base + s * entry;
    const segBase = bases[s];
    const len = lens[s];
    if (w >= len) return { ...out, entryAddr, segBase, len, fault: 'len', accesses: 1 };
    return { ...out, entryAddr, segBase, len, E: segBase + w, accesses: 2 };
  }

  // 段页式
  const tables = p.tables ?? [];
  const { s, w } = p;
  if (!tables.length || tables.length > 8 || tables.some((t) => !t.length || t.length > 8)) errors.push('tables');
  if (!Number.isInteger(s) || s < 0) errors.push('s');
  if (!Number.isInteger(w) || w < 0) errors.push('w');
  if (errors.length) return { ok: false, errors };
  const used = tables.flat();
  if (new Set(used).size !== used.length) return { ok: false, errors: ['dupFrame'] };
  const pd = { p: Math.floor(w / L), d: w % L };
  const out = { ok: true, mode, L, entry, base, tables, s, w, ...pd, n: tables.length, k: Math.log2(L) };
  if (s >= tables.length) return { ...out, fault: 'seg', accesses: 0 };
  const entryAddr = base + s * entry;
  const t = tables[s];
  if (pd.p >= t.length) return { ...out, entryAddr, ptLen: t.length, fault: 'page', accesses: 1 };
  const b = t[pd.p];
  return { ...out, entryAddr, ptLen: t.length, b, E: b * L + pd.d, accesses: 3 };
}

/** 段页式的页表文字：「3 7 | 5 2 8」→ [[3,7],[5,2,8]] */
export function parseTables(text) {
  const parts = String(text ?? '').split('|').map((x) => x.trim());
  const out = [];
  for (const part of parts) {
    const nums = part.split(/[\s,，、]+/).filter(Boolean);
    if (!nums.length || nums.some((x) => !/^\d+$/.test(x))) return null;
    out.push(nums.map(Number));
  }
  return out;
}
