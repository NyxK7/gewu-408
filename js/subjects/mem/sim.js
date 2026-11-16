// 「一次访存的全过程」的纯计算部分：不碰 DOM，Node 里也能跑（见 tests/mem.test.mjs）。
// 输入一组参数，输出：各段位宽、地址拆分、每一步硬件操作（ops），以及每一步之后各部件的状态快照。
// 所有结果都是按参数算出来的；开关只决定「初始时表里放了什么」，命中与否由真正查表得出。
//
// 本课约定（与常见 408 题目一致，界面上也会写明）：
//   · 单级页表，页表项格式为 [有效位 | 其余位 | 页框号]；查一次页表项算访问一次主存，不经过 Cache；
//   · Cache 用物理地址查找（PIPT），只做读访问，所以不涉及脏块写回；
//   · TLB / Cache 满了按 LRU 替换；缺页时假设有空闲页框，不做页面置换；
//   · 缺页处理完成后重新执行这条访存；处理程序是否顺带填 TLB 由 fillTlbOnFault 决定。

export const DEFAULTS = {
  vaBits: 32,
  paBits: 24,
  pageSize: 4096,
  pteSize: 4,
  tlbEntries: 16,
  tlbWays: 0, // 0 = 全相联
  cacheSize: 32768,
  blockSize: 64,
  cacheWays: 4, // 0 = 全相联，1 = 直接映射
  va: 0x00403a2c,
  inMem: true,
  tlbHit: false,
  cacheHit: false,
  fillTlbOnFault: true,
  frame: null, // 该页所在（或缺页时分配到）的页框号，null = 自动
  ptbr: null, // 页表起始物理地址，null = 自动
};

export const PRESETS = [
  { id: 'hit', set: { inMem: true, tlbHit: true, cacheHit: true } },
  { id: 'walk', set: { inMem: true, tlbHit: false, cacheHit: false } },
  { id: 'fault', set: { inMem: false, tlbHit: false, cacheHit: false } },
];

// ───────────────────────── 数值工具（地址可达 48 位，全部用安全整数运算，不用位运算） ─────────────────────────

const P2 = (n) => 2 ** n;
export const isPow2 = (n) => Number.isSafeInteger(n) && n > 0 && Number.isInteger(Math.log2(n));
export const log2 = (n) => Math.round(Math.log2(n));
export const shr = (v, n) => Math.floor(v / P2(n));
export const low = (v, n) => v % P2(n);
/** 取第 hi..lo 位（含两端） */
export const bits = (v, hi, lo) => low(shr(v, lo), hi - lo + 1);

export const hex = (v, nbits) => '0x' + v.toString(16).toUpperCase().padStart(Math.max(1, Math.ceil(nbits / 4)), '0');
export const bin = (v, nbits) => v.toString(2).padStart(nbits, '0');

export function sizeStr(n) {
  for (const [u, s] of [[2 ** 40, 'TB'], [2 ** 30, 'GB'], [2 ** 20, 'MB'], [2 ** 10, 'KB']]) {
    if (n >= u) {
      const v = n / u;
      return `${Number.isInteger(v) ? v : +v.toFixed(2)} ${s}`;
    }
  }
  return `${n} B`;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** [0, 2^n) 里的随机整数，n 可以超过 32 */
function randBits(r, n) {
  if (n <= 0) return 0;
  if (n <= 32) return Math.floor(r() * P2(n));
  return Math.floor(r() * P2(n - 32)) * P2(32) + Math.floor(r() * P2(32));
}

/** 在 [0, 2^n) 里取最多 count 个互不相同、且不在 exclude 里的数 */
function pickDistinct(r, count, n, exclude = () => false) {
  const space = P2(n);
  const out = [];
  const seen = new Set();
  if (space <= 4096) {
    const all = [];
    for (let v = 0; v < space; v++) if (!exclude(v)) all.push(v);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, count);
  }
  for (let tries = 0; out.length < count && tries < count * 50; tries++) {
    const v = randBits(r, n);
    if (seen.has(v) || exclude(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function permutation(r, n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────────────────── LRU：age 是 0..W-1 的一个排列，0 表示最近用过 ─────────────────────────

export function touch(set, w) {
  const a = set[w].age;
  for (const e of set) if (e.age < a) e.age++;
  set[w].age = 0;
}

/** 有空项先用空项，否则替换 age 最大（最久没用）的那一项 */
export function victim(set) {
  const free = set.findIndex((e) => !e.v);
  if (free >= 0) return free;
  let best = 0;
  for (let i = 1; i < set.length; i++) if (set[i].age > set[best].age) best = i;
  return best;
}

// ───────────────────────── 参数检查与位宽推导 ─────────────────────────

/** 检查参数并推导各段位宽。errors 里是 [错误键, 变量]，由界面翻译 */
export function derive(p) {
  const errors = [];
  const err = (k, v = {}) => errors.push([k, v]);
  const intIn = (v, a, b) => Number.isSafeInteger(v) && v >= a && v <= b;
  if (!intIn(p.vaBits, 8, 48)) err('vaBits');
  if (!intIn(p.paBits, 8, 48)) err('paBits');
  if (!isPow2(p.pageSize) || p.pageSize < 16) err('pageSize');
  if (![2, 4, 8].includes(p.pteSize)) err('pteSize');
  if (!isPow2(p.tlbEntries) || p.tlbEntries > 256) err('tlbEntries');
  if (!(p.tlbWays === 0 || isPow2(p.tlbWays))) err('tlbWays');
  if (!isPow2(p.cacheSize)) err('cacheSize');
  if (!isPow2(p.blockSize) || p.blockSize < 2) err('blockSize');
  if (!(p.cacheWays === 0 || isPow2(p.cacheWays))) err('cacheWays');
  if (errors.length) return { errors };

  const d = { errors };
  d.offBits = log2(p.pageSize);
  if (d.offBits >= p.vaBits) err('pageVsVa', { off: d.offBits });
  if (d.offBits >= p.paBits) err('pageVsPa', { off: d.offBits });
  d.vpnBits = p.vaBits - d.offBits;
  d.pfnBits = p.paBits - d.offBits;
  d.pages = P2(d.vpnBits);
  d.frames = P2(d.pfnBits);
  d.memBytes = P2(p.paBits);

  // 页表：2^虚页号位数 项，每项 pteSize 字节，整张表必须放得进物理内存（还要给数据页留地方）
  d.pteBits = p.pteSize * 8;
  if (d.pteBits < d.pfnBits + 1) err('pteSmall', { need: d.pfnBits + 1 });
  d.ptBytes = d.pages * p.pteSize;
  d.ptFrames = Math.ceil(d.ptBytes / p.pageSize);
  if (d.ptFrames > d.frames - 4) err('ptBig', { pt: sizeStr(d.ptBytes), mem: sizeStr(d.memBytes) });

  // TLB：组相联时虚页号 = TLB 标记 | TLB 组号
  d.tlbWays = p.tlbWays === 0 || p.tlbWays >= p.tlbEntries ? p.tlbEntries : p.tlbWays;
  d.tlbFull = d.tlbWays === p.tlbEntries;
  d.tlbSets = p.tlbEntries / d.tlbWays;
  d.tlbIdxBits = log2(d.tlbSets);
  if (d.tlbIdxBits >= d.vpnBits) err('tlbSets');
  d.tlbTagBits = d.vpnBits - d.tlbIdxBits;

  // Cache：物理地址 = 标记 | 组号 | 块内偏移
  if (p.blockSize > p.cacheSize) err('blockVsCache');
  d.lines = p.cacheSize / p.blockSize;
  d.cacheWays = p.cacheWays === 0 || p.cacheWays >= d.lines ? d.lines : p.cacheWays;
  d.cacheFull = d.cacheWays === d.lines && d.lines > 1;
  d.direct = d.cacheWays === 1;
  d.cacheSets = d.lines / d.cacheWays;
  d.cOffBits = log2(p.blockSize);
  d.cIdxBits = log2(d.cacheSets);
  d.cTagBits = p.paBits - d.cIdxBits - d.cOffBits;
  if (d.cTagBits < 1) err('cacheBig');
  if (d.lines > 65536) err('cacheLines');

  if (!Number.isSafeInteger(p.va) || p.va < 0 || p.va >= P2(p.vaBits)) err('va', { max: hex(P2(p.vaBits) - 1, p.vaBits) });

  // 页表放在哪：PTBR 给定就用它，否则自动放在一个「整齐」的位置
  if (p.ptbr != null) {
    if (!Number.isSafeInteger(p.ptbr) || p.ptbr < 0 || p.ptbr % p.pteSize) err('ptbr', { n: p.pteSize });
    else if (p.ptbr + d.ptBytes > d.memBytes) err('ptbrFit');
    d.ptbr = p.ptbr;
  } else if (!errors.length) {
    let start = 1;
    while (start < d.ptFrames) start *= 2;
    if (start + d.ptFrames > d.frames) start = d.frames - d.ptFrames;
    d.ptbr = start * p.pageSize;
  }
  if (d.ptbr != null) {
    d.ptFirst = Math.floor(d.ptbr / p.pageSize);
    d.ptLast = Math.ceil((d.ptbr + d.ptBytes) / p.pageSize) - 1;
  }
  if (p.frame != null && !errors.length) {
    if (!Number.isSafeInteger(p.frame) || p.frame < 0 || p.frame >= d.frames) err('frame', { max: hex(d.frames - 1, d.pfnBits) });
    else if (p.frame >= d.ptFirst && p.frame <= d.ptLast) err('frameInPt');
  }
  return d;
}

// ───────────────────────── 模拟一次访存 ─────────────────────────

/** 地址拆分：VA → 虚页号 | 页内偏移；虚页号 → TLB 标记 | TLB 组号；PA → 标记 | 组号 | 块内偏移 */
export function splitVa(d, va) {
  const vpn = shr(va, d.offBits);
  return { vpn, off: low(va, d.offBits), tlbIdx: low(vpn, d.tlbIdxBits), tlbTag: shr(vpn, d.tlbIdxBits) };
}

export function splitPa(d, pa) {
  return {
    pfn: shr(pa, d.offBits),
    off: low(pa, d.offBits),
    cOff: low(pa, d.cOffBits),
    cIdx: bits(pa, d.cOffBits + d.cIdxBits - 1, d.cOffBits) || 0,
    cTag: shr(pa, d.cOffBits + d.cIdxBits),
    blockNo: shr(pa, d.cOffBits),
  };
}

export function simulate(input) {
  const p = { ...DEFAULTS, ...input };
  if (!p.inMem) {
    p.tlbHit = false;
    p.cacheHit = false;
  }
  const d = derive(p);
  if (d.errors.length) return { ok: false, p, d, errors: d.errors };

  const r = rng(hashStr(JSON.stringify([p.vaBits, p.paBits, p.pageSize, p.pteSize, p.tlbEntries, p.tlbWays, p.cacheSize, p.blockSize, p.cacheWays, p.va, p.inMem, p.tlbHit, p.cacheHit, p.frame, p.ptbr])));
  const v = splitVa(d, p.va);
  const { vpn } = v;

  // ── 物理页框：0 号留给操作系统，页表占用的页框也不能用 ──
  const taken = new Set([0]);
  const reserved = (f) => taken.has(f) || (f >= d.ptFirst && f <= d.ptLast);
  const freeCount = d.frames - 1 - (d.ptLast - d.ptFirst + 1);
  const pickFrame = () => {
    let [f] = pickDistinct(r, 1, d.pfnBits, reserved);
    if (f == null) {
      // 随机没抽中（空闲页框很少时）就从一个随机起点顺序找
      const s0 = randBits(r, d.pfnBits);
      for (let i = 0; i < d.frames && f == null; i++) if (!reserved((s0 + i) % d.frames)) f = (s0 + i) % d.frames;
    }
    if (f == null) return null;
    taken.add(f);
    return f;
  };
  if (p.frame != null) taken.add(p.frame);
  const pageFrame = p.frame ?? pickFrame(); // 在主存时：该页所在页框；缺页时：OS 分配到的空闲页框
  const diskAddr = () => randBits(r, 20);

  // ── 页表（只记录用得到的几项）──
  const pt = new Map();
  pt.set(vpn, p.inMem ? { v: 1, pfn: pageFrame } : { v: 0, disk: diskAddr() });
  for (const k of [-2, -1, 1, 2]) {
    const n = vpn + k;
    if (n < 0 || n >= d.pages) continue;
    if (r() < 0.6 && taken.size < freeCount - 2) pt.set(n, { v: 1, pfn: pickFrame() });
    else pt.set(n, { v: 0, disk: diskAddr() });
  }

  // ── TLB：只需要「目标所在的那一组」。稳定运行的系统里 TLB 一般是满的 ──
  const tlb = [];
  const ages = permutation(r, d.tlbWays);
  const otherTags = pickDistinct(r, d.tlbWays, d.tlbTagBits, (tag) => {
    if (tag === v.tlbTag) return true;
    const e = pt.get(tag * d.tlbSets + v.tlbIdx);
    return e != null && !e.v; // 页表里标着「不在主存」的页不可能出现在 TLB 里
  });
  for (let w = 0; w < d.tlbWays; w++) {
    const tag = otherTags[w];
    let e = tag == null ? null : pt.get(tag * d.tlbSets + v.tlbIdx);
    if (tag != null && !e && taken.size < freeCount - 2) {
      e = { v: 1, pfn: pickFrame() };
      pt.set(tag * d.tlbSets + v.tlbIdx, e);
    }
    tlb.push(e ? { v: 1, tag, vpn: tag * d.tlbSets + v.tlbIdx, pfn: e.pfn, age: ages[w] } : { v: 0, tag: 0, vpn: null, pfn: 0, age: ages[w] });
  }
  let tlbInit = null;
  if (p.tlbHit) {
    tlbInit = Math.floor(r() * d.tlbWays);
    Object.assign(tlb[tlbInit], { v: 1, tag: v.tlbTag, vpn, pfn: pageFrame });
  }

  // ── 最终的物理地址是确定的（缺页时 OS 会把这一页放进 pageFrame），先算出来好准备 Cache 的那一组 ──
  const pa = pageFrame * p.pageSize + v.off;
  const a = splitPa(d, pa);
  const blockFrame = (tag) => Math.floor(((tag * d.cacheSets + a.cIdx) * p.blockSize) / p.pageSize);
  const cache = [];
  const cAges = permutation(r, d.cacheWays);
  const cTags = pickDistinct(r, d.cacheWays, d.cTagBits, (tag) => tag === a.cTag || (!p.inMem && blockFrame(tag) === pageFrame));
  for (let w = 0; w < d.cacheWays; w++) cache.push(cTags[w] == null ? { v: 0, tag: 0, age: cAges[w] } : { v: 1, tag: cTags[w], age: cAges[w] });
  let cacheInit = null;
  if (p.cacheHit) {
    cacheInit = Math.floor(r() * d.cacheWays);
    Object.assign(cache[cacheInit], { v: 1, tag: a.cTag });
  }
  const data = hashStr(`data@${pa}`) & 0xff;

  // ── 快照：每步之后各部件（只取目标相关的那一组 / 那几项）的样子 ──
  // 页表片段：目标虚页号前后各两项
  const ptRows = () =>
    [...pt.keys()]
      .filter((n) => Math.abs(n - vpn) <= 2)
      .sort((x, y) => x - y)
      .map((n) => ({ vpn: n, ...pt.get(n) }));
  const regs = { va: p.va, pa: null, data: null };
  // 全相联的大 Cache 可能有上万行：快照里只留前 8 行和这一步涉及的行
  const cacheRows = (marks) => {
    const all = cache.map((e, w) => ({ ...e, way: w }));
    if (all.length <= 64) return all;
    const keep = new Set([0, 1, 2, 3, 4, 5, 6, 7, cacheInit, ...Object.keys(marks.cache ?? {}).map(Number)]);
    cache.forEach((e, w) => e.v && e.tag === a.cTag && keep.add(w));
    return all.filter((e) => keep.has(e.way));
  };
  const snap = (marks = {}, focus = null) => ({
    tlb: tlb.map((e, w) => ({ ...e, way: w })),
    pt: ptRows(),
    cache: cacheRows(marks),
    cacheTotal: cache.length,
    regs: { ...regs },
    marks,
    focus,
  });
  const init = snap();

  // ── 逐步执行 ──
  const ops = [];
  const count = { mem: 0, disk: 0, tlb: 0, cache: 0 };
  const push = (op, marks, focus) => {
    op.snap = snap(marks, focus);
    op.memNo = count.mem;
    ops.push(op);
    return op;
  };

  function lookupTlb(again) {
    count.tlb++;
    const w = tlb.findIndex((e) => e.v && e.tag === v.tlbTag);
    if (w >= 0) {
      touch(tlb, w);
      push({ kind: 'tlb', at: 'tlb', hit: true, way: w, pfn: tlb[w].pfn, again }, { tlb: { [w]: 'hit' } }, 'tlb');
      return tlb[w].pfn;
    }
    push({ kind: 'tlb', at: 'tlb', hit: false, again }, { tlb: { all: 'miss' } }, 'tlb');
    count.mem++;
    const pteAddr = d.ptbr + vpn * p.pteSize;
    push({ kind: 'pteReq', from: 'tlb', to: 'pt', pteAddr }, { pt: { [vpn]: 'read' } }, 'pt');
    const e = pt.get(vpn);
    push({ kind: 'pteRet', from: 'pt', to: 'tlb', pteAddr, pte: { ...e } }, { pt: { [vpn]: e.v ? 'ok' : 'fault' } }, 'pt');
    if (!e.v) return null;
    fillTlb(e.pfn, false);
    return e.pfn;
  }

  function fillTlb(pfn, byOs) {
    const w = victim(tlb);
    const old = { ...tlb[w] };
    Object.assign(tlb[w], { v: 1, tag: v.tlbTag, vpn, pfn });
    touch(tlb, w);
    push({ kind: 'tlbFill', from: byOs ? 'pt' : 'tlb', to: 'tlb', way: w, old, pfn, byOs }, { tlb: { [w]: 'new' } }, 'tlb');
  }

  push({ kind: 'va', from: 'cpu', to: 'tlb', va: p.va }, {}, 'regs');
  let pfn = lookupTlb(false);
  let fault = null;
  if (pfn == null) {
    const disk = pt.get(vpn).disk;
    fault = { frame: pageFrame, disk };
    push({ kind: 'fault', from: 'tlb', to: 'cpu' }, { pt: { [vpn]: 'fault' } }, 'pt');
    count.disk++;
    push({ kind: 'pageIn', from: 'disk', to: 'mem', vpn, frame: pageFrame, disk }, { pt: { [vpn]: 'fault' } }, 'pt');
    pt.set(vpn, { v: 1, pfn: pageFrame });
    push({ kind: 'ptUpdate', at: 'pt', vpn, frame: pageFrame, disk }, { pt: { [vpn]: 'new' } }, 'pt');
    if (p.fillTlbOnFault) fillTlb(pageFrame, true);
    push({ kind: 'reissue', from: 'cpu', to: 'tlb', va: p.va }, {}, 'regs');
    pfn = lookupTlb(true);
  }

  regs.pa = pa;
  push({ kind: 'pa', from: 'tlb', to: 'cache', pa, pfn }, {}, 'regs');
  count.cache++;
  const cw = cache.findIndex((e) => e.v && e.tag === a.cTag);
  let cacheHitWay = null;
  let cacheFill = null;
  if (cw >= 0) {
    cacheHitWay = cw;
    touch(cache, cw);
    push({ kind: 'cache', at: 'cache', hit: true, way: cw }, { cache: { [cw]: 'hit' } }, 'cache');
  } else {
    push({ kind: 'cache', at: 'cache', hit: false }, { cache: { all: 'miss' } }, 'cache');
    count.mem++;
    push({ kind: 'memReq', from: 'cache', to: 'mem', blockNo: a.blockNo }, {}, 'cache');
    const w = victim(cache);
    const old = { ...cache[w] };
    Object.assign(cache[w], { v: 1, tag: a.cTag });
    touch(cache, w);
    cacheFill = { way: w, old };
    push({ kind: 'block', from: 'mem', to: 'cache', blockNo: a.blockNo, way: w, old }, { cache: { [w]: 'new' } }, 'cache');
  }
  regs.data = data;
  push({ kind: 'data', from: 'cache', to: 'cpu', data }, cacheHitWay != null ? { cache: { [cacheHitWay]: 'hit' } } : { cache: { [cacheFill.way]: 'hit' } }, 'regs');

  return {
    ok: true,
    p,
    d,
    va: p.va,
    ...v,
    pteAddr: d.ptbr + vpn * p.pteSize,
    pfn,
    pa,
    ...a,
    data,
    fault,
    tlbInit,
    cacheInit,
    outcome: {
      tlbHit: ops.find((o) => o.kind === 'tlb').hit,
      pageFault: !!fault,
      cacheHit: cacheHitWay != null,
    },
    count,
    init,
    ops,
  };
}
