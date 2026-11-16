// 文件的物理结构（分配方式）：同一个 n 块的文件分别用连续分配、隐式链接、显式链接（FAT）、索引分配存放，
// 读逻辑块 k（或顺序读完整个文件）时各要读哪些盘块、访问几次磁盘。
//
// 约定（界面上写明）：
//   · 磁盘一共 24 个盘块，编号 0～23；文件的逻辑块从 0 编号；
//   · 文件已经打开，目录项（FCB）在内存里，不算访盘；
//   · 显式链接的 FAT 开机时读进内存，查 FAT 不访盘；
//   · 索引分配的索引块不在内存，要先读它一次；
//   · 链接分配和索引分配用的盘块是分散的，由「打散种子」决定；连续分配从起始块号开始占 n 块。

const err = (e) => ({ ok: false, errors: [e] });
export const DISK = 24;
export const KINDS = ['contig', 'linked', 'fat', 'index'];

/** 用种子把 0～23 打乱，取前 n + 1 个：前 n 个是数据块，最后一个当索引块 */
export function scatter(seed, n) {
  const a = Array.from({ length: DISK }, (_, i) => i);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = DISK - 1; i > 0; i--) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return { data: a.slice(0, n), index: a[n] };
}

export function fileAlloc({ n = 6, k = 4, start = 9, seed = 7, pattern = 'one' }) {
  if (!(Number.isInteger(n) && n >= 2 && n <= 8)) return err('n');
  if (!['one', 'all'].includes(pattern)) return err('pattern');
  if (pattern === 'one' && !(Number.isInteger(k) && k >= 0 && k < n)) return err(['k', { max: n - 1 }]);
  if (!(Number.isInteger(start) && start >= 0 && start + n <= DISK)) return err(['start', { max: DISK - n }]);
  if (!(Number.isInteger(seed) && seed >= 1 && seed <= 99)) return err('seed');
  const { data, index } = scatter(seed, n);
  const contig = Array.from({ length: n }, (_, i) => start + i);
  const upto = pattern === 'one' ? k : n - 1; // 要用到的最后一个逻辑块
  const want = pattern === 'one' ? [k] : Array.from({ length: n }, (_, i) => i);
  const fat = Array(DISK).fill(null);
  data.forEach((b, i) => (fat[b] = i + 1 < n ? data[i + 1] : -1));
  const lanes = [
    { kind: 'contig', blocks: contig, entry: { start, len: n }, reads: want.map((i) => contig[i]), mem: [] },
    // 隐式链接：下一块的指针在当前块里，要用到第 upto 块，就得把它之前的块都读一遍
    { kind: 'linked', blocks: data, entry: { first: data[0], last: data[n - 1] }, reads: data.slice(0, upto + 1), mem: [] },
    // 显式链接：顺着内存里的 FAT 找到盘块号，只读要的数据块
    { kind: 'fat', blocks: data, entry: { first: data[0] }, fat, reads: want.map((i) => data[i]), mem: data.slice(0, upto) },
    // 索引分配：先读索引块，再读数据块
    { kind: 'index', blocks: data, entry: { index }, index, reads: [index, ...want.map((i) => data[i])], mem: [] },
  ];
  const steps = [{ kind: 'intro' }, ...lanes.map((l) => ({ kind: l.kind })), { kind: 'compare' }];
  const best = Math.min(...lanes.map((l) => l.reads.length));
  return { ok: true, n, k, start, seed, pattern, data, index, lanes, steps, best, counts: Object.fromEntries(lanes.map((l) => [l.kind, l.reads.length])) };
}

/** FAT 的大小：盘块数 → 每个表项至少几位（按 halfByte 取整到 4 位，否则取整到字节）→ 表的字节数 */
export function fatSize({ blocks, byte = true }) {
  const bits = Math.ceil(Math.log2(blocks));
  const entryBits = byte ? Math.ceil(bits / 8) * 8 : Math.ceil(bits / 4) * 4;
  return { bits, entryBits, bytes: (blocks * entryBits) / 8 };
}
