// 文件管理的纯计算：
//   index：混合索引（UNIX inode）——每个索引块能放多少地址、文件最大多大、某个字节落在哪一级索引、要读几次磁盘；
//   bitmap：位示图——盘块号和（行, 列）互换，按行优先找空闲块分配，回收盘块。
//
// 混合索引的约定：
//   · 每个索引块能放 k = 盘块大小 ÷ 地址项大小 个地址；
//   · 直接地址 d 个、一级间接 s 个、二级间接 dd 个、三级间接 t 个；
//   · 文件的逻辑块号 L = 字节偏移 ÷ 盘块大小；先用直接地址，再一级、二级、三级；
//   · 读这个字节要访问的磁盘次数（inode 已在内存时）：直接 1 次，一级间接 2 次，二级 3 次，三级 4 次；
//     inode 不在内存时再加 1 次。
// 位示图的约定：
//   · 每行 n 位（字长），按行优先排列；base 为 0 时盘块号、行号、列号都从 0 开始，为 1 时都从 1 开始；
//   · 0 表示空闲，1 表示已分配；分配时按行优先找最前面的空闲位。

export function index({ block, addr, d, s, dd, t, offset, inodeInMem = true }) {
  const errors = [];
  if (!(Number.isInteger(block) && block >= 64)) errors.push('block');
  if (!(Number.isInteger(addr) && addr >= 1 && block % addr === 0)) errors.push('addr');
  if (![d, s, dd, t].every((x) => Number.isInteger(x) && x >= 0 && x <= 32)) errors.push('count');
  if (errors.length) return { ok: false, errors };
  const k = block / addr;
  const cap = [d, s * k, dd * k ** 2, t * k ** 3];
  const maxBlocks = cap.reduce((a, b) => a + b, 0);
  const out = { ok: true, block, addr, d, s, dd, t, k, cap, maxBlocks, maxBytes: maxBlocks * block, inodeInMem };
  if (offset == null) return out;
  if (!(Number.isSafeInteger(offset) && offset >= 0)) return { ok: false, errors: ['offset'] };
  const L = Math.floor(offset / block);
  const inBlock = offset % block;
  if (L >= maxBlocks) return { ...out, offset, L, inBlock, level: -1 };
  let rest = L;
  let level = 0;
  while (rest >= cap[level]) {
    rest -= cap[level];
    level++;
  }
  // 在这一级里：用第几个指针，各级索引块里的第几项
  const per = k ** level;
  const ptr = level === 0 ? rest : Math.floor(rest / per);
  const path = [];
  let r = level === 0 ? 0 : rest % per;
  for (let lv = level - 1; lv >= 0; lv--) {
    const span = k ** lv;
    path.push(Math.floor(r / span));
    r %= span;
  }
  const reads = level + 1 + (inodeInMem ? 0 : 1);
  return { ...out, offset, L, inBlock, level, rest, ptr, path, reads };
}

export function bitmap({ rows, n, base = 0, used = [], ops = [] }) {
  const errors = [];
  if (!(Number.isInteger(rows) && rows >= 1 && rows <= 12)) errors.push('rows');
  if (!(Number.isInteger(n) && [8, 16, 32].includes(n))) errors.push('n');
  if (![0, 1].includes(base)) errors.push('base');
  if (errors.length) return { ok: false, errors };
  const total = rows * n;
  const toRC = (b) => ({ i: Math.floor((b - base) / n) + base, j: ((b - base) % n) + base });
  const toB = (i, j) => n * (i - base) + (j - base) + base;
  const bits = Array(total).fill(0);
  for (const b of used) {
    if (!(Number.isInteger(b) && b >= base && b < total + base)) return { ok: false, errors: [['usedRange', { b }]] };
    bits[b - base] = 1;
  }
  const steps = [];
  for (const op of ops) {
    if (op.type === 'alloc') {
      const got = [];
      for (let x = 0; x < total && got.length < op.k; x++) if (!bits[x]) got.push(x);
      if (got.length < op.k) {
        steps.push({ ...op, fail: true, free: got.length, bits: [...bits] });
        continue;
      }
      for (const x of got) bits[x] = 1;
      steps.push({ ...op, blocks: got.map((x) => ({ b: x + base, ...toRC(x + base) })), bits: [...bits] });
    } else {
      const b = op.b;
      if (!(Number.isInteger(b) && b >= base && b < total + base)) {
        steps.push({ ...op, fail: true, why: 'range', bits: [...bits] });
        continue;
      }
      const was = bits[b - base];
      bits[b - base] = 0;
      steps.push({ ...op, rc: toRC(b), was, bits: [...bits] });
    }
  }
  return { ok: true, rows, n, base, total, init: (() => { const a = Array(total).fill(0); for (const b of used) a[b - base] = 1; return a; })(), steps, toRC, toB };
}

/** 位示图操作：「+3」分配 3 块，「-17」回收 17 号盘块 */
export function parseBitOps(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[\s,，;；]+/).filter(Boolean)) {
    const m = it.match(/^([+-])(\d+)$/);
    if (!m) return null;
    out.push(m[1] === '+' ? { type: 'alloc', k: Number(m[2]) } : { type: 'free', b: Number(m[2]) });
  }
  return out;
}
