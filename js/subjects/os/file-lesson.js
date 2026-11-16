// 文件管理的两节课：「混合索引」（inode 的地址项一级级往下找）和「位示图」（盘块号和行列互换、分配回收）。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { bitmap, index, parseBitOps } from './file.js';

const UNITS = [[2 ** 40, 'TB'], [2 ** 30, 'GB'], [2 ** 20, 'MB'], [2 ** 10, 'KB'], [1, 'B']];
// 能整除就写精确值；不能整除时再补一个大单位的近似值
const size = (b) => {
  const [u, s] = UNITS.find(([u]) => b >= u && b % u === 0) ?? [1, 'B'];
  const big = UNITS.find(([v]) => b >= v);
  const exact = `${b / u} ${s}`;
  return big && big[0] > u ? `${exact} ≈ ${+(b / big[0]).toFixed(2)} ${big[1]}` : exact;
};
const LV = [T('直接地址', 'Direct'), T('一级间接', 'Single indirect'), T('二级间接', 'Double indirect'), T('三级间接', 'Triple indirect')];

// ═════════════════════════ 混合索引 ═════════════════════════

const IDX_SPEC = {
  presets: [
    { label: T('第 4 块：直接地址', 'Block 4: direct'), set: { block: 1024, addr: 4, d: 10, s: 1, dd: 1, t: 1, offset: '5000', inodeInMem: true } },
    { label: T('第 100 块：一级间接', 'Block 100: single'), set: { block: 1024, addr: 4, d: 10, s: 1, dd: 1, t: 1, offset: '102400', inodeInMem: true } },
    { label: T('第 300 块：二级间接', 'Block 300: double'), set: { block: 1024, addr: 4, d: 10, s: 1, dd: 1, t: 1, offset: '307207', inodeInMem: true } },
    { label: T('4KB 块、8 字节地址', '4 KB blocks, 8-byte addresses'), set: { block: 4096, addr: 8, d: 12, s: 1, dd: 1, t: 0, offset: '4194304', inodeInMem: false } },
  ],
  groups: [
    {
      legend: T('索引结构', 'Index structure'),
      fields: [
        { name: 'block', label: T('盘块大小（B）', 'Block size (B)'), type: 'select', options: [512, 1024, 2048, 4096, 8192].map((v) => [v, String(v)]) },
        { name: 'addr', label: T('地址项大小（B）', 'Address size (B)'), type: 'select', options: [2, 4, 8].map((v) => [v, String(v)]) },
        { name: 'd', label: T('直接地址项', 'Direct'), type: 'int', min: 0, max: 32 },
        { name: 's', label: T('一级间接', 'Single indirect'), type: 'int', min: 0, max: 4 },
        { name: 'dd', label: T('二级间接', 'Double indirect'), type: 'int', min: 0, max: 4 },
        { name: 't', label: T('三级间接', 'Triple indirect'), type: 'int', min: 0, max: 4 },
      ],
    },
    {
      legend: T('要读的位置', 'Position to read'),
      fields: [
        { name: 'offset', label: T('文件内的字节偏移（可写 100K、2M）', 'Byte offset in the file (100K, 2M allowed)'), type: 'text', wide: true, parse: (s) => (Number.isNaN(parseSize(s)) ? NaN : s) },
        { name: 'inodeInMem', label: T('索引结点已经读进内存', 'The inode is already in memory'), type: 'check', wide: true },
      ],
    },
  ],
  note: T(
    '每个索引块能放的地址数 = 盘块大小 ÷ 地址项大小。逻辑块号 = 字节偏移 ÷ 盘块大小，先用完直接地址，再依次用一级、二级、三级间接。读一个数据块要访问的磁盘次数：直接 1 次，一级间接 2 次，二级 3 次，三级 4 次；索引结点不在内存时再加 1 次。',
    'Addresses per index block = block size ÷ address size. Logical block = offset ÷ block size; direct addresses come first, then single, double, triple indirect. Disk reads for one data block: direct 1, single 2, double 3, triple 4; plus 1 if the inode is not in memory.',
  ),
};
const IDX_ERR = {
  block: T('盘块大小不对', 'Invalid block size'),
  addr: T('地址项大小要能整除盘块大小', 'The address size must divide the block size'),
  count: T('地址项个数不对', 'Invalid pointer counts'),
  offset: T('字节偏移不对', 'Invalid offset'),
};

function parseSize(s) {
  const m = String(s ?? '').trim().match(/^(\d+)\s*([KMG]?)B?$/i);
  if (!m) return NaN;
  return Number(m[1]) * { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2].toUpperCase()];
}

// 版面：上面一行是计算式；左边一列是索引结点，右上是「每一级能管的块数」，右下是顺着索引找下去的路径
const IX = { ino: 40, cap: 230, top: 130, RH: 26, pathY: 300 };
const idxHeight = (sim) => Math.max(IX.top + (sim.d + sim.s + sim.dd + sim.t) * IX.RH, IX.pathY + 120);

function idxBoard(sim, st, z) {
  const items = [];
  const { RH } = IX;
  let ino = txt(65, -14, z ? '索引结点（inode）' : 'inode', 'bt-cap');
  let r = 0;
  const rowY = [];
  [sim.d, sim.s, sim.dd, sim.t].forEach((n, lv) => {
    for (let i = 0; i < n; i++) {
      const hot = st.level === lv && st.ptr === i && st.show >= 1;
      const lab = lv === 0 ? `${z ? '直接' : 'direct'} ${i}` : `${z ? LV[lv].zh : LV[lv].en}${n > 1 ? ` ${i}` : ''}`;
      ino += `<g transform="translate(0 ${r * RH})">${cell(130, RH - 4, lab, { tone: ['slate', 'blue', 'violet', 'rose'][lv], cls: hot ? 'hot' : '', size: 12 })}</g>`;
      rowY.push({ lv, i, y: r * RH });
      r++;
    }
  });
  items.push({ k: 'inode', x: IX.ino, y: IX.top, html: ino });
  if (st.show >= 0) {
    let cap = txt(0, -14, z ? '每一级能管的块数（k = 每个索引块的地址数）' : 'Blocks per level (k = addresses per index block)', 'bt-cap', 'start');
    let y = 8;
    sim.cap.forEach((c, lv) => {
      const n = [sim.d, sim.s, sim.dd, sim.t][lv];
      if (!n) return;
      const expr = lv === 0 ? `${n}` : `${n} × ${sim.k}${lv > 1 ? `^${lv}` : ''}`;
      cap += txt(0, y, `${z ? LV[lv].zh : LV[lv].en}：${expr} = ${c}`, `bt-lab ${st.level === lv ? 'c-violet' : ''}`, 'start');
      y += 22;
    });
    cap += txt(0, y + 6, z ? `最大文件 = ${sim.maxBlocks} 块 × ${sim.block}B = ${size(sim.maxBytes)}` : `Max file = ${sim.maxBlocks} × ${sim.block}B = ${size(sim.maxBytes)}`, 'bt-acc', 'start');
    items.push({ k: 'cap', x: IX.cap, y: IX.top, html: cap });
  }
  if (st.show >= 1) {
    items.push({ k: 'calc', x: IX.ino, y: 82, html: txt(0, 0, z ? `逻辑块号 L = ${sim.offset} ÷ ${sim.block} = ${sim.L}，块内偏移 ${sim.inBlock}` : `Logical block L = ${sim.offset} ÷ ${sim.block} = ${sim.L}, offset ${sim.inBlock}`, 'bt-formula cur', 'start') });
  }
  if (st.show >= 1 && sim.level >= 0) {
    const start = rowY.find((x) => x.lv === sim.level && x.i === sim.ptr);
    const W = 150;
    const GAP = 36;
    const y = IX.pathY;
    let html = '';
    let px = IX.ino + 130;
    let py = IX.top + start.y + (RH - 4) / 2;
    let x = IX.cap;
    sim.path.forEach((e, lvl) => {
      if (st.show < 2 + lvl) return;
      html += arrow(px, py, x - 4, y + 16, 'acc') + `<g transform="translate(${x} ${y})">${cell(W, 32, z ? `索引块 · 第 ${e} 项` : `index · entry ${e}`, { tone: 'violet', size: 12 })}</g>`;
      html += txt(x + W / 2, y + 50, z ? `第 ${lvl + 1} 层` : `level ${lvl + 1}`, 'bt-idx');
      px = x + W;
      py = y + 16;
      x += W + GAP;
    });
    if (st.show >= 2 + sim.path.length) {
      html += arrow(px, py, x - 4, y + 16, 'ok') + `<g transform="translate(${x} ${y})">${cell(W, 32, z ? `数据块 · 第 ${sim.inBlock} 字节` : `data · byte ${sim.inBlock}`, { tone: 'green', size: 12 })}</g>`;
    }
    if (st.reads) html += txt(IX.cap, y + 90, z ? `访问磁盘 ${sim.reads} 次 = ${sim.inodeInMem ? '' : '索引结点 1 + '}${sim.level ? `索引块 ${sim.level} + ` : ''}数据块 1` : `${sim.reads} disk reads = ${sim.inodeInMem ? '' : 'inode 1 + '}${sim.level ? `index ${sim.level} + ` : ''}data 1`, 'bt-acc', 'start');
    items.push({ k: 'path', x: 0, y: 0, html });
  }
  return items;
}

export const IDX_PRINCIPLE = {
  sections: [
    {
      id: 'struct',
      title: T('文件的逻辑结构与物理结构', 'Logical and physical structure'),
      blocks: [
        { p: T('**逻辑结构**是用户看到的文件组织方式：无结构的流式文件，或者由记录组成的有结构文件（顺序文件、索引文件、索引顺序文件、散列文件）。**物理结构**（文件分配方式）是文件在磁盘上怎么放：连续分配、链接分配、索引分配。', 'The **logical structure** is what users see: an unstructured byte stream, or records (sequential, indexed, indexed-sequential, hashed). The **physical structure** (allocation) is how blocks sit on disk: contiguous, linked or indexed.') },
      ],
    },
    {
      id: 'alloc',
      title: T('三种文件分配方式', 'Three allocation methods'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Method'), T('怎么放', 'Layout'), T('随机访问', 'Random access'), T('碎片 / 缺点', 'Drawbacks')],
            rows: [
              [T('连续分配', 'Contiguous'), T('占一组相邻的盘块，目录里记起始块号和长度', 'adjacent blocks; directory keeps start and length'), T('支持，最快', 'yes, fastest'), T('外部碎片；文件不好变长', 'external fragmentation; hard to grow')],
              [T('隐式链接', 'Implicit linked'), T('每块末尾放下一块的指针', 'each block points to the next'), T('不支持，只能顺序访问', 'sequential only'), T('指针占空间；一个指针坏了后面全丢', 'pointer overhead; fragile')],
              [T('显式链接（FAT）', 'Explicit linked (FAT)'), T('所有指针集中放在一张文件分配表 FAT 里，开机读进内存', 'all pointers in one File Allocation Table in memory'), T('支持（在内存里查 FAT）', 'yes, via the in-memory FAT'), T('FAT 占内存', 'the FAT uses memory')],
              [T('索引分配', 'Indexed'), T('每个文件一个索引块，记录各逻辑块对应的盘块号', 'one index block per file listing its blocks'), T('支持', 'yes'), T('索引块占空间；大文件一个索引块放不下', 'index overhead; large files need more')],
            ],
          },
        },
      ],
    },
    {
      id: 'mixed',
      title: T('多级索引与混合索引', 'Multi-level and mixed indexing'),
      blocks: [
        { p: T('一个索引块只能放 k = 盘块大小 ÷ 地址项大小 个盘块号。文件更大时，可以让索引块指向的不是数据块而是下一层索引块，这就是**多级索引**。但小文件也要多读几次盘，不划算。', 'An index block holds k = block size ÷ address size entries. Bigger files point to further index blocks (**multi-level indexing**), but then even small files pay extra reads.') },
        { p: T('**混合索引**（UNIX 的 inode）把几种方式混在一起：索引结点里放若干个**直接地址**（直接指向数据块）、一个**一级间接地址**（指向一个索引块）、一个**二级间接地址**、一个**三级间接地址**。小文件只用直接地址，读得快；大文件才用到间接地址。', '**Mixed indexing** (the UNIX inode) combines them: several **direct** addresses, one **single indirect**, one **double indirect** and one **triple indirect**. Small files stay fast; only large ones use indirection.') },
        { formula: T('最大文件 = (直接地址数 + k + k² + k³) × 盘块大小', 'max file = (direct + k + k² + k³) × block size') },
        { p: T('例：盘块 1KB、地址项 4B → k = 256。10 个直接地址管 10 块，一级间接管 256 块，二级管 256² = 65536 块，三级管 256³ 块。', 'Example: 1 KB blocks, 4-byte addresses → k = 256. Ten direct addresses cover 10 blocks, single 256, double 65,536, triple 256³.') },
      ],
    },
    {
      id: 'find',
      title: T('某个字节在哪一级、要读几次盘', 'Which level, how many reads'),
      blocks: [
        {
          steps: [
            T('逻辑块号 L = 字节偏移 ÷ 盘块大小（取整）；', 'logical block L = offset ÷ block size;'),
            T('L < 直接地址数 → 直接地址；否则减去直接地址数，再和 k 比 → 一级间接；再减去 k，和 k² 比 → 二级间接……', 'below the direct count → direct; otherwise subtract and compare with k (single), then k² (double)…'),
            T('读盘次数 = 间接级数 + 1（最后读数据块本身）；如果索引结点还没读进内存，再加 1。', 'reads = indirection levels + 1 for the data, plus 1 if the inode is not in memory.'),
          ],
        },
        { warn: T('逻辑块号从 0 开始：10 个直接地址管的是第 0～9 块，第 10 块已经要用一级间接。', 'Blocks count from 0: ten direct addresses cover blocks 0–9; block 10 already needs the single indirect.') },
      ],
    },
    {
      id: 'dir',
      title: T('目录与文件共享', 'Directories and sharing'),
      blocks: [
        {
          list: [
            T('**文件控制块 FCB**：存放文件名、类型、地址等，一个 FCB 就是一个目录项。为了让目录查找快，UNIX 把文件名以外的信息放进**索引结点**，目录项里只放文件名和索引结点号。', 'The **FCB** holds a file’s name, type and addresses; one FCB is one directory entry. UNIX moves everything but the name into the **inode** so directories stay small.'),
            T('**目录结构**：单级目录（不能重名）→ 两级目录（每个用户一个）→ 树形目录（绝对路径、相对路径）→ 无环图目录（可以共享）。', '**Directory structures**: single-level → two-level → tree (absolute and relative paths) → acyclic graph (sharing).'),
            T('**硬链接**：多个目录项指向同一个索引结点，索引结点里有计数 count，count 减到 0 才真正删除文件。**软链接（符号链接）**：新建一个文件，内容是被链接文件的路径名；原文件删除后软链接就失效。', '**Hard links** point several entries at one inode with a reference count; the file goes when it reaches 0. **Soft links** are files holding a path name and break when the target is deleted.'),
          ],
        },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('k 是一个索引块能放的地址数，不是盘块数。', 'k is addresses per index block, not a block count.'),
            T('算最大文件长度时别漏掉直接地址那部分。', 'Do not forget the direct addresses in the maximum size.'),
            T('读一个字节的磁盘次数要看题目说索引结点是否已在内存。', 'Check whether the inode is already in memory.'),
            T('隐式链接不支持随机访问；FAT 是显式链接，在内存里查表，支持随机访问。', 'Implicit linking is sequential only; a FAT supports random access.'),
          ],
        },
      ],
    },
  ],
};

const idxKit = stepKit({ spec: IDX_SPEC, rowsName: T('计算步骤', 'Steps') });

function buildIdx(params) {
  const sim = index({ ...params, block: Number(params.block), addr: Number(params.addr), offset: parseSize(params.offset) });
  const lesson = {
    id: 'file-index',
    kit: idxKit,
    where: [['os', 'file']],
    tag: T('索引', 'Idx'),
    name: T('文件分配与混合索引', 'File allocation and the inode'),
    full: T('连续 / 链接 / 索引分配 · 混合索引 · 最大文件 · 读盘次数 · 目录', 'Contiguous / linked / indexed · inode · max size · disk reads · directories'),
    title: T(`盘块 ${params.block}B · 地址 ${params.addr}B`, `${params.block}B blocks · ${params.addr}B addresses`),
    badge: T('混合索引', 'Mixed index'),
    nodes: [],
    legend: [
      ['slate', T('直接', 'Direct')],
      ['blue', T('一级间接', 'Single')],
      ['violet', T('二级间接', 'Double')],
      ['rose', T('三级间接', 'Triple')],
    ],
    principle: IDX_PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(IDX_ERR, sim.errors),
    overview: {
      desc: T(
        'UNIX 的索引结点里有几个直接地址和几个间接地址。这节课先算出每一级能管多少块、文件最大能多大，再给一个字节偏移，看它落在哪一级、要顺着几层索引块找下去、一共读几次磁盘。',
        'A UNIX inode has a few direct and indirect addresses. The lesson first computes how many blocks each level covers and the maximum file size, then follows a byte offset down the index levels and counts the disk reads.',
      ),
      facts: sim.ok ? [[T('每个索引块的地址数', 'Addresses per block'), `${sim.block} ÷ ${sim.addr} = ${sim.k}`]] : [],
    },
    start: { nodes: [], frame: { rect: [0, 50, sim.ok ? Math.max(IX.cap + 420, IX.cap + ((sim.path?.length ?? 0) + 1) * 186) + 20 : 900, sim.ok ? idxHeight(sim) + 20 : 500] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = [
    {
      title: T(`每个索引块能放 ${sim.k} 个地址`, `${sim.k} addresses per index block`),
      desc: T(`最大文件 ${size(sim.maxBytes)}`, `Max file ${size(sim.maxBytes)}`),
      detail: T(`k = ${sim.block} ÷ ${sim.addr} = ${sim.k}。直接地址管 ${sim.cap[0]} 块，一级间接管 ${sim.cap[1]} 块，二级间接管 ${sim.cap[2]} 块，三级间接管 ${sim.cap[3]} 块，合计 ${sim.maxBlocks} 块，最大文件 ${sim.maxBlocks} × ${sim.block}B = ${size(sim.maxBytes)}。`, `k = ${sim.block} ÷ ${sim.addr} = ${sim.k}. Direct ${sim.cap[0]}, single ${sim.cap[1]}, double ${sim.cap[2]}, triple ${sim.cap[3]} blocks: ${sim.maxBlocks} in all, a maximum of ${size(sim.maxBytes)}.`),
      ref: 'mixed',
      st: { show: 0 },
      row: { color: 'slate', what: T('最大文件长度', 'Maximum file size'), result: size(sim.maxBytes), tone: 'info' },
    },
  ];
  if (sim.level < 0) {
    list.push({ title: T('超出了最大文件长度', 'Beyond the maximum size'), desc: T(`第 ${sim.L} 块`, `Block ${sim.L}`), detail: T(`逻辑块号 ${sim.L} ≥ ${sim.maxBlocks}，这个文件结构存不下这么大的文件。`, `Block ${sim.L} ≥ ${sim.maxBlocks}: this structure cannot hold it.`), ref: 'find', st: { show: 1 }, row: { color: 'rose', what: T('定位', 'Locate'), result: T('超出', 'too far'), tone: 'warn' } });
  } else {
    const before = sim.cap.slice(0, sim.level).reduce((a, b) => a + b, 0);
    list.push({
      title: T(`第 ${sim.L} 块落在${LV[sim.level].zh}`, `Block ${sim.L} is ${LV[sim.level].en}`),
      desc: T(`L = ${sim.offset} ÷ ${sim.block} = ${sim.L}`, `L = ${sim.L}`),
      detail: T(`逻辑块号 L = ${sim.offset} ÷ ${sim.block} = ${sim.L}，块内偏移 ${sim.inBlock}。${sim.level === 0 ? `L < ${sim.d}，用直接地址第 ${sim.ptr} 项。` : `前面各级一共管 ${before} 块，${sim.L} − ${before} = ${sim.rest}，落在${LV[sim.level].zh}里。`}`, `L = ${sim.offset} ÷ ${sim.block} = ${sim.L}, offset ${sim.inBlock}. ${sim.level === 0 ? `L < ${sim.d}: direct entry ${sim.ptr}.` : `Earlier levels cover ${before}; ${sim.L} − ${before} = ${sim.rest}, inside the ${LV[sim.level].en.toLowerCase()} level.`}`),
      ref: 'find',
      st: { show: 1, level: sim.level, ptr: sim.ptr },
      row: { color: ['slate', 'blue', 'violet', 'rose'][sim.level], what: T('定位逻辑块', 'Locate the block'), result: LV[sim.level], tone: 'info' },
    });
    sim.path.forEach((e, i) => {
      const span = sim.k ** (sim.path.length - 1 - i);
      list.push({
        title: T(`读第 ${i + 1} 层索引块：第 ${e} 项`, `Index level ${i + 1}: entry ${e}`),
        desc: span > 1 ? T(`每项管 ${span} 块`, `${span} blocks per entry`) : T('这一项直接给出数据块号', 'This entry names the data block'),
        detail: span > 1 ? T(`这一层每一项管 ${span} 块，${i === 0 ? sim.rest : '剩下的'} ÷ ${span} → 第 ${e} 项，读出下一层索引块的盘块号。读一次磁盘。`, `Each entry covers ${span} blocks → entry ${e}, giving the next index block. One disk read.`) : T(`最后一层索引块的第 ${e} 项就是数据块的盘块号。读一次磁盘。`, `Entry ${e} of the last index block is the data block number. One disk read.`),
        ref: 'find',
        st: { show: 2 + i, level: sim.level, ptr: sim.ptr },
        row: { color: 'violet', what: T(`第 ${i + 1} 层索引`, `Index level ${i + 1}`), result: T(`第 ${e} 项`, `entry ${e}`), tone: 'info' },
      });
    });
    list.push({
      title: T(`读数据块：共读盘 ${sim.reads} 次`, `Read the data: ${sim.reads} disk reads`),
      desc: T(`间接 ${sim.level} 级 + 数据 1 次${sim.inodeInMem ? '' : ' + 索引结点 1 次'}`, `${sim.level} indirect + 1 data${sim.inodeInMem ? '' : ' + 1 inode'}`),
      detail: T(`${sim.inodeInMem ? '索引结点已在内存，不用读。' : '索引结点不在内存，先读它：1 次。'}${sim.level ? `${sim.level} 层索引块各读 1 次，` : ''}最后读数据块 1 次，共 ${sim.reads} 次。`, `${sim.inodeInMem ? 'The inode is in memory. ' : 'Reading the inode: 1. '}${sim.level ? `${sim.level} index block(s), ` : ''}then the data block: ${sim.reads} reads in all.`),
      ref: 'find',
      st: { show: 2 + sim.path.length, level: sim.level, ptr: sim.ptr, reads: true },
      row: { color: 'green', what: T('读数据块', 'Read data'), result: T(`${sim.reads} 次`, `${sim.reads} reads`), tone: 'ok' },
    });
  }
  const built = toSteps(list, (k, z) => idxBoard(sim, k < 0 ? { show: -1 } : list[k].st, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T('定位完成', 'Located'), text: T('改一下字节偏移，看它在哪一级；把直接地址改多改少，看最大文件长度怎么变。', 'Change the offset or the number of direct addresses and watch the level and maximum size change.'), facts: [[T('最大文件', 'Max file'), size(sim.maxBytes)], ...(sim.reads ? [[T('读盘次数', 'Disk reads'), String(sim.reads)]] : [])] };
  return lesson;
}

export const makeFileIndex = () => parametric('file-index', IDX_SPEC.presets[2].set, buildIdx);

// ═════════════════════════ 位示图 ═════════════════════════

const BIT_SPEC = {
  presets: [
    { label: T('从 0 编号', 'Numbered from 0'), set: { rows: 6, n: 16, base: 0, used: [0, 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15, 16, 17, 19, 33, 40], ops: '+4 -17 +2' } },
    { label: T('从 1 编号', 'Numbered from 1'), set: { rows: 6, n: 16, base: 1, used: [1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15, 16, 17, 18, 20, 34, 41], ops: '+4 -18 +2' } },
    { label: T('空间不够', 'Not enough space'), set: { rows: 2, n: 8, base: 0, used: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], ops: '+3 -4 +3' } },
  ],
  groups: [
    {
      legend: T('位示图', 'Bitmap'),
      fields: [
        { name: 'rows', label: T('行数', 'Rows'), type: 'int', min: 1, max: 12 },
        { name: 'n', label: T('每行位数（字长）', 'Bits per row (word)'), type: 'select', options: [[8, '8'], [16, '16'], [32, '32']] },
        { name: 'base', label: T('编号起点', 'Numbering starts at'), type: 'select', options: [[0, T('从 0 开始', 'From 0')], [1, T('从 1 开始', 'From 1')]], hint: T('盘块号、行号、列号用同一个起点', 'Blocks, rows and columns share the origin') },
        { name: 'used', label: T('已分配的盘块号', 'Allocated blocks'), type: 'list', min: 0, max: 400, maxLen: 64, allowEmpty: true, wide: true },
        { name: 'ops', label: T('操作：+3 分配 3 块，-9 回收 9 号', 'Operations: +3 allocate 3, -9 free block 9'), type: 'text', wide: true, parse: (s) => (parseBitOps(s) ? s : NaN) },
      ],
    },
  ],
  note: T(
    '位示图每一位对应一个盘块：0 空闲、1 已分配，按行优先排列，每行的位数是字长 n。分配时按行优先找最前面的空闲位；回收时把对应位清 0。注意盘块号和行列号的换算公式取决于从 0 还是从 1 编号。',
    'Each bit is a block: 0 free, 1 used, laid out row-major with n bits per row. Allocation takes the first free bits in row-major order; freeing clears the bit. The conversion formulas depend on whether numbering starts at 0 or 1.',
  ),
};
const BIT_ERR = {
  rows: T('行数要在 1～12 之间', 'Use 1–12 rows'),
  n: T('字长是 8、16 或 32', 'Word length must be 8, 16 or 32'),
  base: T('编号起点是 0 或 1', 'Numbering starts at 0 or 1'),
  usedRange: T('盘块号 {b} 超出了位示图的范围', 'Block {b} is outside the bitmap'),
};

function bitBoard(sim, k, z) {
  const items = [];
  const bits = k >= 0 ? sim.steps[k].bits : sim.init;
  const cur = k >= 0 ? sim.steps[k] : null;
  const hot = new Set(cur?.blocks?.map((x) => x.b - sim.base) ?? (cur?.type === 'free' && !cur.fail ? [cur.b - sim.base] : []));
  const CW = sim.n === 32 ? 22 : 34;
  const RH = 30;
  let g = '';
  for (let j = 0; j < sim.n; j++) g += txt(j * CW + CW / 2, -8, String(j + sim.base), 'bt-idx');
  for (let i = 0; i < sim.rows; i++) {
    g += txt(-10, i * RH + 18, String(i + sim.base), 'bt-idx', 'end');
    for (let j = 0; j < sim.n; j++) {
      const x = i * sim.n + j;
      g += `<g transform="translate(${j * CW} ${i * RH})">${cell(CW - 3, RH - 4, String(bits[x]), { tone: bits[x] ? 'blue' : '', cls: hot.has(x) ? (cur.type === 'free' ? 'ok' : 'hot') : bits[x] ? '' : 'dim', size: 11 })}</g>`;
    }
  }
  items.push({ k: 'grid', x: 90, y: 130, html: txt(-10, -24, z ? '行＼列' : 'row\\col', 'bt-cap', 'end') + g });
  if (cur && !cur.fail) {
    const lines = cur.type === 'alloc' ? cur.blocks.map((x) => z ? `第 ${x.i} 行第 ${x.j} 列 → 盘块 ${x.b} = ${sim.n} × ${sim.base ? `(${x.i} − 1)` : x.i} + ${sim.base ? `${x.j}` : x.j} = ${x.b}` : `row ${x.i}, col ${x.j} → block ${x.b}`) : [z ? `盘块 ${cur.b} → 行 ${cur.rc.i}、列 ${cur.rc.j}` : `block ${cur.b} → row ${cur.rc.i}, col ${cur.rc.j}`];
    items.push({ k: 'calc', x: 90, y: 130 + sim.rows * RH + 30, html: lines.map((l, i) => txt(0, i * 22, l, 'bt-formula cur', 'start')).join('') });
  }
  return items;
}

export const BIT_PRINCIPLE = {
  sections: [
    {
      id: 'methods',
      title: T('空闲空间怎么管', 'Free-space management'),
      blocks: [
        {
          table: {
            head: [T('方法', 'Method'), T('做法', 'How'), T('特点', 'Notes')],
            rows: [
              [T('空闲表法', 'Free table'), T('每个连续的空闲区占一项：起始块号、块数', 'one entry per free run: start, length'), T('适合连续分配，回收时要考虑合并', 'suits contiguous allocation; merge on free')],
              [T('空闲链表法', 'Free list'), T('空闲盘块（或空闲盘区）用指针串起来', 'chain free blocks or runs with pointers'), T('分配回收简单，但链很长时效率低', 'simple but slow for long chains')],
              [T('位示图法', 'Bitmap'), T('每个盘块用一位表示是否空闲', 'one bit per block'), T('小，容易找到连续的空闲块', 'compact; finding runs is easy')],
              [T('成组链接法', 'Grouping (UNIX)'), T('空闲块分成若干组，每组的第一块记下一组的块号和块数，第一组放在超级块里', 'free blocks in groups; each group’s first block lists the next group; the first group is in the superblock'), T('UNIX 使用；适合大文件系统', 'used by UNIX; scales well')],
            ],
          },
        },
      ],
    },
    {
      id: 'bitmap',
      title: T('位示图', 'The bitmap'),
      blocks: [
        { p: T('用一个二维数组表示，每行 n 位（通常就是字长），**按行优先**对应盘块 0、1、2……一位为 0 表示空闲，为 1 表示已分配（有的题目反过来，要看清）。', 'A 2-D bit array with n bits per row (usually the word length), mapped to blocks 0, 1, 2… **row-major**. 0 means free, 1 used (some questions reverse it).') },
        {
          table: {
            head: ['', T('从 0 开始编号', 'Numbered from 0'), T('从 1 开始编号', 'Numbered from 1')],
            rows: [
              [T('(行 i, 列 j) → 盘块 b', '(row i, col j) → block b'), 'b = n × i + j', 'b = n × (i − 1) + j'],
              [T('盘块 b → 行 i', 'block b → row i'), 'i = b ÷ n', 'i = (b − 1) ÷ n + 1'],
              [T('盘块 b → 列 j', 'block b → column j'), 'j = b mod n', 'j = (b − 1) mod n + 1'],
            ],
          },
        },
        { warn: T('这三个公式里的 ÷ 都是整除。从 1 编号时一定要先减 1 再除，最后加 1，否则会差一行。', 'Every ÷ here is integer division. With 1-based numbering subtract 1 first and add 1 at the end, or you are off by a row.') },
      ],
    },
    {
      id: 'ops',
      title: T('分配与回收', 'Allocating and freeing'),
      blocks: [
        {
          steps: [
            T('**分配**：按行顺序扫描位示图，找到值为 0 的位；把 (行, 列) 换算成盘块号分配出去；把这一位置 1。', '**Allocate**: scan row by row for 0 bits, convert (row, col) to a block number, set the bit to 1.'),
            T('**回收**：把盘块号换算成 (行, 列)；把这一位清 0。', '**Free**: convert the block number to (row, col) and clear the bit.'),
          ],
        },
        { p: T('位示图的大小 = 盘块数 ÷ 8 字节。例：磁盘 16GB、盘块 4KB，共 2^22 块，位示图要 2^22 ÷ 8 = 512KB。', 'Bitmap size = blocks ÷ 8 bytes. A 16 GB disk with 4 KB blocks has 2^22 blocks: a 512 KB bitmap.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('先看清编号从 0 还是从 1 开始，盘块号、行号、列号是否一致。', 'Check whether blocks, rows and columns start at 0 or 1.'),
            T('位示图大小按位算，换成字节要除以 8。', 'The bitmap counts bits; divide by 8 for bytes.'),
            T('题目可能规定 1 表示空闲，和本课相反。', 'Some questions use 1 for free.'),
          ],
        },
      ],
    },
  ],
};

const bitKit = stepKit({ spec: BIT_SPEC, rowsName: T('操作', 'Operations') });

function buildBit(params) {
  const sim = bitmap({ rows: params.rows, n: Number(params.n), base: Number(params.base), used: params.used ?? [], ops: parseBitOps(params.ops) ?? [] });
  const lesson = {
    id: 'bitmap',
    kit: bitKit,
    where: [['os', 'file']],
    tag: T('位图', 'Bit'),
    name: T('空闲空间管理：位示图', 'Free space: the bitmap'),
    full: T('空闲表 · 空闲链 · 位示图 · 成组链接 · 盘块号与行列换算', 'Free tables · lists · bitmaps · grouping · conversions'),
    title: T(`${params.rows} × ${params.n} · 从 ${params.base} 编号`, `${params.rows} × ${params.n} · from ${params.base}`),
    badge: T(`从 ${params.base} 编号`, `From ${params.base}`),
    nodes: [],
    legend: [
      ['blue', T('已分配（1）', 'Used (1)')],
      ['slate', T('空闲（0）', 'Free (0)')],
    ],
    principle: BIT_PRINCIPLE,
    sim,
    errors: sim.ok ? [] : errOf(BIT_ERR, sim.errors),
    overview: {
      desc: T(
        '位示图用一位表示一个盘块是否空闲。这节课按你给的操作分配和回收盘块：分配时按行优先找空闲位，再把行列号换算成盘块号；回收时反过来。换一下编号起点（0 或 1），看公式怎么变。',
        'A bitmap uses one bit per block. Here blocks are allocated (scanning row by row and converting row/column to a block number) and freed (the reverse). Switch the numbering origin between 0 and 1 to see the formulas change.',
      ),
      facts: sim.ok ? [[T('换算公式', 'Formula'), sim.base ? 'b = n × (i − 1) + j' : 'b = n × i + j']] : [],
    },
    start: { nodes: [], frame: { rect: [0, 70, 120 + (Number(params.n) === 32 ? 22 : 34) * Number(params.n) + 40, 130 + params.rows * 30 + 110] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s) => {
    if (s.type === 'alloc') {
      if (s.fail) return { title: T(`分配 ${s.k} 块：空间不够`, `Allocate ${s.k}: not enough`), desc: T(`只剩 ${s.free} 块空闲`, `Only ${s.free} free`), detail: T(`扫描整个位示图只找到 ${s.free} 个 0，不够 ${s.k} 块，分配失败，位示图不变。`, `Only ${s.free} free bits for ${s.k} blocks: allocation fails.`), ref: 'ops', row: { color: 'rose', what: T(`分配 ${s.k} 块`, `Allocate ${s.k}`), result: T('失败', 'fails'), tone: 'warn' } };
      const bl = s.blocks.map((x) => x.b).join('、');
      return {
        title: T(`分配 ${s.k} 块：${bl}`, `Allocate ${s.k}: ${bl}`),
        desc: T('按行优先找最前面的 0', 'First free bits, row-major'),
        detail: T(`按行扫描，最前面的 ${s.k} 个 0 在 ${s.blocks.map((x) => `(${x.i}, ${x.j})`).join('、')}。换算成盘块号：${s.blocks.map((x) => `${sim.n} × ${sim.base ? `(${x.i} − 1)` : x.i} + ${x.j} = ${x.b}`).join('；')}。把这些位置 1。`, `The first ${s.k} zeros are at ${s.blocks.map((x) => `(${x.i}, ${x.j})`).join(', ')}, i.e. blocks ${bl}. They are set to 1.`),
        ref: ['bitmap', 'ops'],
        row: { color: 'blue', what: T(`分配 ${s.k} 块`, `Allocate ${s.k}`), result: bl, tone: 'ok' },
      };
    }
    if (s.fail) return { title: T(`回收 ${s.b}：超出范围`, `Free ${s.b}: out of range`), desc: '', detail: T(`盘块号 ${s.b} 不在这个位示图里。`, `Block ${s.b} is not in this bitmap.`), ref: 'bitmap', row: { color: 'rose', what: T(`回收 ${s.b}`, `Free ${s.b}`), result: T('超出范围', 'out of range'), tone: 'warn' } };
    return {
      title: T(`回收盘块 ${s.b} → 第 ${s.rc.i} 行第 ${s.rc.j} 列`, `Free block ${s.b} → row ${s.rc.i}, col ${s.rc.j}`),
      desc: sim.base ? T(`i = (${s.b} − 1) ÷ ${sim.n} + 1，j = (${s.b} − 1) mod ${sim.n} + 1`, `i = (b−1) ÷ n + 1, j = (b−1) mod n + 1`) : T(`i = ${s.b} ÷ ${sim.n}，j = ${s.b} mod ${sim.n}`, `i = b ÷ n, j = b mod n`),
      detail: sim.base ? T(`从 1 编号：i = (${s.b} − 1) ÷ ${sim.n} + 1 = ${s.rc.i}，j = (${s.b} − 1) mod ${sim.n} + 1 = ${s.rc.j}。把这一位清 0。${s.was ? '' : '（它本来就是空闲的。）'}`, `From 1: i = (${s.b} − 1) ÷ ${sim.n} + 1 = ${s.rc.i}, j = ${s.rc.j}. The bit is cleared.${s.was ? '' : ' (It was already free.)'}`) : T(`从 0 编号：i = ${s.b} ÷ ${sim.n} = ${s.rc.i}，j = ${s.b} mod ${sim.n} = ${s.rc.j}。把这一位清 0。${s.was ? '' : '（它本来就是空闲的。）'}`, `From 0: i = ${s.b} ÷ ${sim.n} = ${s.rc.i}, j = ${s.rc.j}. The bit is cleared.${s.was ? '' : ' (It was already free.)'}`),
      ref: ['bitmap', 'ops'],
      row: { color: 'green', what: T(`回收 ${s.b}`, `Free ${s.b}`), result: `(${s.rc.i}, ${s.rc.j})`, tone: 'ok' },
    };
  });
  const built = toSteps(list, (k, z) => bitBoard(sim, k, z));
  lesson.steps = built.steps;
  lesson.start.events = built.start;
  lesson.outro = { title: T('操作完成', 'Done'), text: T('把编号起点从 0 改成 1，用同一个盘块号再换算一次，看行号差在哪里。', 'Switch the origin from 0 to 1 and convert the same block again to see the difference.'), facts: [] };
  return lesson;
}

export const makeBitmap = () => parametric('bitmap', BIT_SPEC.presets[0].set, buildBit);
