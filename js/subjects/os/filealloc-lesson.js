// 「文件的物理结构」：同一个文件四种放法并排成四条泳道（连续、隐式链接、显式链接 FAT、索引），
// 每条泳道左边是目录项，中间是 24 个盘块（FAT 泳道上面多一排 FAT），右边数这次读要访问几次磁盘。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { DISK, fileAlloc } from './filealloc.js';

const W = [['os', 'file']];
const Y0 = 150;
const LH = 124; // 泳道高度
const DX = 60; // 盘块条的起点
const BW = 28; // 盘块宽
const BG = 1;
const RX = DX + DISK * (BW + BG) + 20; // 右边的计数
const NAME = {
  contig: T('连续分配', 'Contiguous'),
  linked: T('隐式链接', 'Implicit linked'),
  fat: T('显式链接（FAT）', 'Explicit linked (FAT)'),
  index: T('索引分配', 'Indexed'),
};
const TONE = { contig: 'blue', linked: 'green', fat: 'violet', index: 'amber' };
const bx = (b) => DX + b * (BW + BG);
const CIRC = '①②③④⑤⑥⑦⑧⑨';

/** 盘块上方的弧形箭头（链接指针） */
function curve(x1, x2, y, h, cls = '') {
  const mx = (x1 + x2) / 2;
  const cy = y - h;
  // 末端切线方向：从控制点指向终点
  const dx = x2 - mx;
  const dy = y - cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const hx = x2 - ux * 8;
  const hy = y - uy * 8;
  return `<g class="barw ${cls}"><path d="M${x1},${y} Q${mx},${cy} ${hx.toFixed(1)},${hy.toFixed(1)}" style="fill:none;stroke:${cls === 'acc' ? 'var(--accent)' : 'var(--ink-3)'};stroke-width:${cls === 'acc' ? 2 : 1.3}"/><path d="M${x2},${y} L${(hx - uy * 4).toFixed(1)},${(hy + ux * 4).toFixed(1)} L${(hx + uy * 4).toFixed(1)},${(hy - ux * 4).toFixed(1)} Z"/></g>`;
}

const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('文件的物理结构要解决什么', 'What physical structure decides'),
      blocks: [
        { p: T('文件在用户眼里是连续的逻辑块 0、1、2……，在磁盘上却要落到一个个盘块里。**物理结构（分配方式）**决定：一个文件占哪些盘块、怎样从逻辑块号找到盘块号。好坏看三点：读写快不快（尤其是随机读第 k 块）、磁盘空间利用率（碎片）、文件能不能方便地变长。', 'The **allocation method** maps logical blocks to disk blocks. Judge it by access speed (especially random access), space use (fragmentation) and how easily files grow.') },
      ],
    },
    {
      id: 'contig',
      title: T('连续分配', 'Contiguous allocation'),
      blocks: [
        { list: [
          T('文件占一组**相邻**的盘块，目录项里记起始块号 s 和长度 n。逻辑块 k 就在盘块 s + k，算一下就知道，读它只要 1 次访盘。', 'Adjacent blocks; the entry stores start s and length n. Block k is at s + k: one access.'),
          T('顺序读也最快：盘块挨着，磁头几乎不用移动。', 'Sequential reads are fastest: hardly any seeking.'),
          T('缺点：要事先知道文件多大；文件难以增长（后面的块可能已被占用）；反复分配回收后产生**外部碎片**，要紧凑才能利用。', 'Drawbacks: size must be known; growth is hard; **external fragmentation**.'),
        ] },
      ],
    },
    {
      id: 'link',
      title: T('链接分配：隐式与显式（FAT）', 'Linked allocation: implicit and FAT'),
      blocks: [
        { list: [
          T('**隐式链接**：每个盘块末尾放下一块的盘块号，目录项记首块和末块。要读第 k 块，必须从第 0 块开始一块块读出指针，共 k + 1 次访盘——**只适合顺序访问**。指针占用每块的一点空间；一个指针坏了，后面的块全找不到。', '**Implicit**: each block holds the next block number. Reading block k needs k + 1 accesses: sequential access only.'),
          T('**显式链接**：把所有块的「下一块」指针集中放在一张**文件分配表 FAT** 里，表项个数 = 盘块数，FAT[b] 是盘块 b 的下一块（−1 表示文件结束）。FAT 开机读进内存，查表不访盘，所以读第 k 块只访盘 1 次——**支持随机访问**。', '**Explicit (FAT)**: all next pointers live in one table with one entry per disk block, kept in memory: one access for block k.'),
          T('两种链接分配都没有外部碎片，文件可以随时变长。', 'Neither has external fragmentation; files grow easily.'),
        ] },
        { formula: T('FAT 表项至少 ⌈log₂(盘块数)⌉ 位（通常再取整到半字节或字节）；FAT 大小 = 盘块数 × 表项长度', 'FAT entry ≥ ⌈log₂ blocks⌉ bits (rounded to 4 or 8); FAT size = blocks × entry size') },
        { p: T('例：磁盘 2²⁰ 个盘块，表项至少 20 位，按字节取整是 3 字节，FAT 共 2²⁰ × 3 B = 3 MB。', 'Example: 2²⁰ blocks → 20 bits → 3 bytes → 3 MB.') },
      ],
    },
    {
      id: 'index',
      title: T('索引分配', 'Indexed allocation'),
      blocks: [
        { list: [
          T('每个文件有一个**索引块**，第 i 项记逻辑块 i 所在的盘块号；目录项里记索引块号。', 'Each file has an **index block** whose entry i is the disk block of logical block i.'),
          T('读第 k 块：先读索引块（不在内存时 1 次访盘），查到盘块号，再读数据块，共 2 次。支持随机访问，没有外部碎片。', 'Read the index block, then the data block: two accesses; random access, no external fragmentation.'),
          T('缺点：索引块本身占空间，小文件也要一整块；一个索引块放不下时要用链接索引、多级索引或混合索引（见「文件分配与混合索引」那节课）。', 'The index block costs space; large files need linked, multi-level or mixed indexes.'),
        ] },
      ],
    },
    {
      id: 'compare',
      title: T('对比', 'Comparison'),
      blocks: [
        {
          table: {
            head: ['', T('读第 k 块访盘', 'Accesses for block k'), T('随机访问', 'Random access'), T('外部碎片', 'External fragmentation'), T('文件变长', 'Growth')],
            rows: [
              [T('连续', 'Contiguous'), '1', T('支持', 'yes'), T('有', 'yes'), T('难', 'hard')],
              [T('隐式链接', 'Implicit linked'), 'k + 1', T('不支持', 'no'), T('无', 'no'), T('容易', 'easy')],
              [T('显式链接 FAT', 'FAT'), T('1（FAT 在内存）', '1 (FAT in memory)'), T('支持', 'yes'), T('无', 'no'), T('容易', 'easy')],
              [T('索引', 'Indexed'), T('2（索引块不在内存）', '2 (index not in memory)'), T('支持', 'yes'), T('无', 'no'), T('容易', 'easy')],
            ],
          },
        },
        { tip: T('题目里算访盘次数时，先看清：目录项 / FCB 在不在内存，FAT 在不在内存，索引块在不在内存；在内存的就不算访盘。', 'Check what is already in memory (FCB, FAT, index block) before counting accesses.') },
      ],
    },
    pit([
      T('隐式链接读第 k 块（从 0 编号）要 k + 1 次，不是 k 次：第 k 块本身也要读。', 'Implicit linking needs k + 1 reads, including block k itself.'),
      T('FAT 的表项个数等于整个磁盘的盘块数，不是某个文件的块数；整个磁盘只有一张 FAT。', 'A FAT has one entry per disk block; there is one FAT per disk.'),
      T('连续分配会产生外部碎片；链接和索引分配没有外部碎片，但都有块内的内部碎片。', 'Contiguous allocation fragments externally; the others do not.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('读逻辑块 4', 'Read logical block 4'), set: { n: 6, k: 4, start: 9, seed: 7, pattern: 'one' } },
    { label: T('读逻辑块 0', 'Read logical block 0'), set: { n: 6, k: 0, start: 9, seed: 7, pattern: 'one' } },
    { label: T('顺序读完整个文件', 'Read the whole file'), set: { n: 6, k: 0, start: 9, seed: 7, pattern: 'all' } },
    { label: T('8 块的文件，读最后一块', '8 blocks, read the last'), set: { n: 8, k: 7, start: 4, seed: 23, pattern: 'one' } },
  ],
  groups: [
    {
      legend: T('文件和这次读', 'File and access'),
      fields: [
        { name: 'n', label: T('文件有几块（2～8）', 'Blocks in the file (2–8)'), type: 'int', min: 2, max: 8 },
        { name: 'pattern', label: T('怎么读', 'Access'), type: 'select', options: [['one', T('随机读一块', 'read one block')], ['all', T('顺序读完整个文件', 'read the whole file')]], wide: true },
        { name: 'k', label: T('读逻辑块 k（从 0 起）', 'Logical block k (from 0)'), type: 'int', min: 0, max: 7, show: (p) => p.pattern === 'one' },
        { name: 'start', label: T('连续分配的起始块号', 'Contiguous start block'), type: 'int', min: 0, max: 22 },
        { name: 'seed', label: T('链接 / 索引分配的打散种子（1～99）', 'Scatter seed (1–99)'), type: 'int', min: 1, max: 99 },
      ],
    },
  ],
  note: T('磁盘 24 块；目录项（FCB）和 FAT 都在内存，索引块不在内存。', '24 disk blocks; FCB and FAT in memory, index block on disk.'),
};
const ERR = {
  n: T('文件块数 2～8', 'File size 2–8 blocks'),
  k: T('逻辑块号 0～{max}', 'Logical block 0–{max}'),
  start: T('起始块号 0～{max}，文件要放得下', 'Start 0–{max} so the file fits'),
  seed: T('种子 1～99', 'Seed 1–99'),
  pattern: T('读法不对', 'Unknown access'),
};

function board(sim, st, z) {
  const items = [];
  const kind = st ? sim.steps[st.k].kind : 'pre';
  const order = ['intro', 'contig', 'linked', 'fat', 'index', 'compare'];
  const reached = (lk) => kind === 'compare' || order.indexOf(kind) >= order.indexOf(lk);
  // 顶上一把「盘块号」尺子，四条泳道共用
  let ruler = txt(DX - 6, Y0 - 10, z ? '盘块号' : 'block', 'bt-idx', 'end');
  for (let b = 0; b < DISK; b++) ruler += txt(bx(b) + BW / 2, Y0 - 10, String(b), 'bt-idx');
  items.push({ k: 'ruler', x: 0, y: 0, html: ruler });
  sim.lanes.forEach((ln, i) => {
    const y0 = Y0 + i * LH;
    const on = kind === ln.kind;
    const done = reached(ln.kind);
    const dy = ln.kind === 'fat' ? 64 : 38; // 盘块条的纵坐标（FAT 泳道上面留一排 FAT）
    let h = '';
    h += `<g transform="translate(${DX - 12} ${y0 - 4})">${cell(RX + 180 - DX, LH - 8, '', { tone: on ? TONE[ln.kind] : '', cls: on ? 'hot' : 'dim' })}</g>`;
    // 标题行：名字 + 目录项
    h += txt(DX, y0 + 18, `${'ABCD'[i]}. ${z ? NAME[ln.kind].zh : NAME[ln.kind].en}`, 'bt-lab', 'start');
    const e = ln.entry;
    const entry = ln.kind === 'contig' ? (z ? `目录项：起始 ${e.start}，长度 ${e.len}` : `entry: start ${e.start}, len ${e.len}`) : ln.kind === 'linked' ? (z ? `目录项：首块 ${e.first}，末块 ${e.last}` : `entry: first ${e.first}, last ${e.last}`) : ln.kind === 'fat' ? (z ? `目录项：首块 ${e.first}` : `entry: first ${e.first}`) : z ? `目录项：索引块 ${e.index}` : `entry: index block ${e.index}`;
    h += `<g transform="translate(${DX + 150} ${y0 + 4})">${cell(230, 22, entry, { size: 12, tone: TONE[ln.kind] })}</g>`;
    h += txt(DX + 390, y0 + 19, z ? '（目录项在内存）' : '(entry in memory)', 'bt-idx', 'start');
    // FAT 一排（在内存）
    if (ln.kind === 'fat') {
      h += txt(DX - 6, y0 + 50, 'FAT', 'bt-idx', 'end');
      for (let b = 0; b < DISK; b++) {
        const v = ln.fat[b];
        const look = on && ln.mem.includes(b);
        h += `<g transform="translate(${bx(b)} ${y0 + 36})">${cell(BW, 20, v == null ? '' : v < 0 ? 'EOF' : String(v), { size: 10, tone: v == null ? '' : 'violet', cls: look ? 'hot' : v == null ? 'dim' : '' })}</g>`;
      }
    }
    // 盘块条
    const logical = new Map(ln.blocks.map((b, j) => [b, j]));
    const readIdx = done && kind !== 'intro' ? ln.reads : [];
    h += txt(DX - 6, y0 + dy + 19, z ? '磁盘' : 'disk', 'bt-idx', 'end');
    for (let b = 0; b < DISK; b++) {
      const j = logical.get(b);
      const isIdx = ln.kind === 'index' && b === ln.index;
      const r = readIdx.indexOf(b);
      const label = isIdx ? (z ? '索引' : 'idx') : j == null ? '' : String(j);
      const tone = isIdx ? 'amber' : j == null ? '' : TONE[ln.kind];
      h += `<g transform="translate(${bx(b)} ${y0 + dy})">${cell(BW, 28, label, { size: isIdx ? 10 : 13, tone, cls: r >= 0 && on ? 'hot' : j == null && !isIdx ? 'dim' : '' })}</g>`;
      if (r >= 0) h += txt(bx(b) + BW / 2, y0 + dy - 3, CIRC[r] ?? String(r + 1), on ? 'cw-lab acc' : 'cw-lab');
    }
    // 隐式链接：块与块之间的指针弧，画在盘块条下面
    if (ln.kind === 'linked')
      for (let j = 0; j + 1 < ln.blocks.length; j++) {
        const a = bx(ln.blocks[j]) + BW / 2;
        const b = bx(ln.blocks[j + 1]) + BW / 2;
        h += curve(a, b, y0 + dy + 30, -(10 + Math.abs(b - a) / 16), on && j < ln.reads.length - 1 ? 'acc' : '');
      }
    // 一句说明
    const note = {
      contig: z ? `逻辑块 k 就在盘块 ${ln.entry.start} + k` : `Block k is at ${ln.entry.start} + k`,
      linked: z ? '弧线：每块末尾记着下一块的盘块号' : 'Arcs: each block stores the next block number',
      fat: z ? 'FAT[b] = 盘块 b 的下一块，FAT 在内存里' : 'FAT[b] = the block after b; the FAT is in memory',
      index: z ? `索引块 ${ln.index} 里记着：${ln.blocks.map((b, j) => `${j}→${b}`).join('  ')}` : `Index block ${ln.index}: ${ln.blocks.map((b, j) => `${j}→${b}`).join('  ')}`,
    }[ln.kind];
    h += txt(DX, y0 + LH - 18, note, 'bt-cap', 'start');
    // 右边：访盘次数
    if (done && kind !== 'intro') {
      const best = kind === 'compare' && ln.reads.length === sim.best;
      h += txt(RX, y0 + 22, z ? `访盘 ${ln.reads.length} 次${best ? ' ✓' : ''}` : `${ln.reads.length} read(s)${best ? ' ✓' : ''}`, 'bt-lab', 'start');
      h += txt(RX, y0 + 46, ln.reads.join('→'), 'ar-mono', 'start');
      if (ln.mem.length) h += txt(RX, y0 + 68, z ? `另查 FAT ${ln.mem.length} 次（内存）` : `+${ln.mem.length} FAT lookups`, 'bt-cap', 'start');
    }
    items.push({ k: `lane${i}`, x: 0, y: 0, html: h });
  });
  return items;
}

function build(p, kit, ERR) {
  const sim = fileAlloc(p);
  const lesson = shell('file-alloc', kit, ERR, sim, {
    where: W,
    tag: T('分配', 'Alloc'),
    name: T('文件的物理结构', 'Physical structure of files'),
    full: T('连续分配 · 隐式链接 · 显式链接与 FAT · 索引分配 · 读第 k 块的访盘次数 · 随机访问与顺序访问 · 外部碎片', 'Contiguous · implicit linked · FAT · indexed · disk reads for block k · random vs sequential · fragmentation'),
    title: SPEC.presets.find((x) => Object.entries(x.set).every(([k, v]) => p[k] === v || (k === 'k' && p.pattern === 'all')))?.label ?? (p.pattern === 'all' ? T('顺序读完整个文件', 'Read the whole file') : T(`读逻辑块 ${p.k}`, `Read logical block ${p.k}`)),
    legend: [['blue', T('连续', 'Contiguous')], ['green', T('隐式链接', 'Implicit')], ['violet', T('FAT', 'FAT')], ['amber', T('索引', 'Indexed')]],
    principle: PRINCIPLE,
    desc: T('同一个文件，用四种方式放到磁盘上：连续分配、隐式链接、显式链接（FAT）、索引分配。读它的某一块时，各要读哪些盘块、访问几次磁盘？四条泳道并排走一遍，差别一目了然。', 'One file, four layouts. Which disk blocks does each read, and how many accesses does it take?'),
    rect: [0, 120, RX + 180, Y0 + 4 * LH],
  });
  if (!sim.ok) return lesson;
  const [c, l, f, x] = sim.lanes;
  const what = sim.pattern === 'one' ? T(`读逻辑块 ${sim.k}`, `read logical block ${sim.k}`) : T('顺序读完整个文件', 'read the whole file');
  const D = {
    intro: [T(`文件有 ${sim.n} 块，要${what.zh}`, `${sim.n} blocks; ${what.en}`), T(`四条泳道是同一个文件的四种放法。蓝色格子里的数字是逻辑块号，格子下面是盘块号。文件已经打开，目录项在内存里。`, 'Four layouts of the same file; numbers in cells are logical blocks, below them disk blocks.'), 'why'],
    contig: [T(`连续分配：${c.reads.length} 次`, `Contiguous: ${c.reads.length}`), sim.pattern === 'one' ? T(`目录项给出起始块 ${c.entry.start}，逻辑块 ${sim.k} 就在 ${c.entry.start} + ${sim.k} = ${c.reads[0]} 号盘块，直接读，1 次访盘。`, `Block ${sim.k} is at ${c.entry.start} + ${sim.k} = ${c.reads[0]}: one read.`) : T(`从 ${c.entry.start} 号起连续读 ${sim.n} 块，${sim.n} 次访盘，而且盘块相邻，几乎不用寻道。`, `${sim.n} adjacent reads.`), 'contig'],
    linked: [T(`隐式链接：${l.reads.length} 次`, `Implicit linked: ${l.reads.length}`), sim.pattern === 'one' ? T(`只知道首块 ${l.entry.first}。下一块在哪写在当前块里，所以要从逻辑块 0 读起：${l.reads.join(' → ')}，读到逻辑块 ${sim.k} 一共 ${sim.k} + 1 = ${l.reads.length} 次访盘。`, `Follow the chain from the first block: ${l.reads.join(' → ')}: ${l.reads.length} reads.`) : T(`顺着指针一块块读完：${l.reads.length} 次。顺序读时链接分配并不吃亏，但盘块分散，寻道多。`, `${l.reads.length} reads following the chain.`), 'link'],
    fat: [T(`显式链接（FAT）：${f.reads.length} 次`, `FAT: ${f.reads.length}`), sim.pattern === 'one' ? (f.mem.length ? T(`指针都在内存里的 FAT 中：从首块 ${f.entry.first} 起查 FAT ${f.mem.length} 次（${f.mem.map((b) => `FAT[${b}]`).join('、')}），得到逻辑块 ${sim.k} 在 ${f.reads[0]} 号盘块；只读这一块，1 次访盘。`, `Look up FAT ${f.mem.length} times in memory, then one read of block ${f.reads[0]}.`) : T(`逻辑块 0 就是首块 ${f.entry.first}，不用查 FAT，直接读，1 次访盘。`, 'Block 0 is the first block: one read.')) : T(`查 FAT 得到各块的盘块号，读 ${f.reads.length} 次数据块；查 FAT 都在内存里。`, `${f.reads.length} reads; FAT lookups are in memory.`), 'link'],
    index: [T(`索引分配：${x.reads.length} 次`, `Indexed: ${x.reads.length}`), sim.pattern === 'one' ? T(`先读索引块 ${x.index}（1 次），查到逻辑块 ${sim.k} 在 ${x.reads[1]} 号盘块，再读它（1 次），共 2 次。`, `Read index block ${x.index}, then block ${x.reads[1]}: two reads.`) : T(`先读索引块 ${x.index}，再读 ${sim.n} 个数据块，共 ${x.reads.length} 次。`, `Index block plus ${sim.n} data blocks: ${x.reads.length}.`), 'index'],
    compare: [T('对比', 'Compare'), T(`访盘次数：连续 ${c.reads.length}、隐式链接 ${l.reads.length}、FAT ${f.reads.length}、索引 ${x.reads.length}。${sim.pattern === 'one' ? '随机读一块时，隐式链接要从头顺着读，最慢；连续分配和 FAT 只要 1 次；索引多读一次索引块。' : '顺序读完时差别不大，索引多读一次索引块；但连续分配的盘块相邻，实际寻道时间最少。'}`, `Reads: ${c.reads.length}, ${l.reads.length}, ${f.reads.length}, ${x.reads.length}.`), 'compare'],
  };
  const list = sim.steps.map((s, k) => {
    const d = D[s.kind];
    return { title: d[0], desc: what, detail: d[1], ref: d[2], st: { k }, row: { color: s.kind === 'intro' || s.kind === 'compare' ? 'slate' : TONE[s.kind], what: d[0], result: s.kind === 'intro' || s.kind === 'compare' ? '' : T(`${sim.counts[s.kind]} 次`, `${sim.counts[s.kind]}`), tone: 'info' } };
  });
  return finish(lesson, list, (st, z) => board(sim, st, z), T(`访盘：${c.reads.length} / ${l.reads.length} / ${f.reads.length} / ${x.reads.length}`, `Reads: ${c.reads.length} / ${l.reads.length} / ${f.reads.length} / ${x.reads.length}`), T('连续分配随机访问最快但有外部碎片、难以增长；隐式链接只能顺序访问；FAT 把指针集中放进内存，随机访问也快；索引分配多一次读索引块，但灵活。', 'Contiguous is fastest but fragments; implicit linking is sequential only; FAT keeps pointers in memory; indexing costs one extra read but is flexible.'));
}

export const makeFileAlloc = make('file-alloc', SPEC, ERR, build);
