// 「固态硬盘 SSD」：4 个闪存块排成 4 列，每块 4 页；页的状态是空、有效（存着逻辑页 Lx）、无效（旧版本）。
// 右边是闪存翻译层 FTL 的映射表，下面数主机写了几页、闪存实际写了几页（写放大），每块被擦了几次（磨损）。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from './kit.js';
import { LOGICAL, NB, NP, ssd } from './ssd.js';

const W = [['co', 'memory']];
const BX = 60;
const BW = 170;
const BG = 200;
const BY = 150;
const PH = 50;
const MX = 900;

const PRINCIPLE = {
  sections: [
    {
      id: 'flash',
      title: T('闪存和 FTL', 'Flash and the FTL'),
      blocks: [
        { p: T('固态硬盘用 NAND 闪存存数据。闪存芯片里分成很多**块**，每块又分成若干**页**（常见每页 4KB、每块 64～256 页）。', 'SSDs store data in NAND flash: **blocks** made of **pages**.') },
        { list: [
          T('**以页为单位读和写**；', '**Read and write by page**;'),
          T('**以块为单位擦除**；一页写过以后，必须等整块擦除才能再写——不能原地改写；', '**erase by block**; a written page cannot be rewritten until its block is erased;'),
          T('所以改写一个逻辑页时，新内容写到别的空页，旧页只标成**无效**。', 'so an update goes to a fresh page and the old one becomes **invalid**.'),
        ] },
        { p: T('**闪存翻译层 FTL** 维护「逻辑页号 → 物理页」的映射表，让上层看到的 SSD 仍然像一块普通的磁盘（按逻辑块号读写）。', 'The **flash translation layer** maps logical pages to physical pages so the SSD looks like an ordinary disk.') },
      ],
    },
    {
      id: 'gc',
      title: T('垃圾回收和写放大', 'Garbage collection and write amplification'),
      blocks: [
        { p: T('空页用得差不多时，要做**垃圾回收**：选一个无效页多的块，把里面还有效的页搬到别处，再把整块擦掉，变回空块。', '**Garbage collection** picks a block with many invalid pages, moves its valid pages and erases it.') },
        { formula: T('写放大 = 闪存实际写入的数据量 ÷ 主机要求写入的数据量（≥ 1）', 'write amplification = flash writes ÷ host writes (≥ 1)') },
        { list: [
          T('搬运有效页的那些写，主机并没有要求，却实实在在消耗了闪存的寿命和时间。', 'Copying valid pages costs time and wear though the host never asked for it.'),
          T('**预留空间**（盘上实际的闪存比标出的容量大）越多，回收时能挑到无效页越多的块，写放大越小。', 'More **over-provisioning** lowers write amplification.'),
          T('顺序写一大片再整体改写，旧数据整块失效，几乎不用搬；零散的随机写最容易造成写放大。', 'Sequential overwrites invalidate whole blocks; scattered writes amplify most.'),
        ] },
      ],
    },
    {
      id: 'wear',
      title: T('磨损均衡', 'Wear levelling'),
      blocks: [
        { p: T('每个块能擦写的次数有限（几千到几万次），某几块擦得太多会先坏掉。**磨损均衡**就是让擦除尽量平均地落到所有块上。', 'Blocks survive only a limited number of erases; **wear levelling** spreads them out.') },
        { list: [
          T('**动态磨损均衡**：写新数据时挑擦除次数少的空块来写。', '**Dynamic**: write new data to the least-erased free blocks.'),
          T('**静态磨损均衡**：还要把很久不改的「冷数据」从擦得少的块里搬走，让这些块也参与擦写；效果更好，但要额外搬数据。', '**Static**: also move cold data out of rarely erased blocks; better but costs extra copies.'),
        ] },
        { tip: T('动画最后看各块的擦除次数：存着冷数据（一直有效、从不改写）的块几乎没被擦过，而经常改写的数据所在的块被反复擦——只做动态均衡解决不了这种不均匀。', 'Blocks holding cold data are hardly ever erased: dynamic levelling alone cannot fix that.') },
      ],
    },
    {
      id: 'vs',
      title: T('SSD 和磁盘对比', 'SSD vs hard disk'),
      blocks: [
        {
          table: {
            head: ['', T('固态硬盘', 'SSD'), T('磁盘', 'Hard disk')],
            rows: [
              [T('机械部件', 'Moving parts'), T('没有', 'none'), T('盘片旋转、磁头移动', 'spinning platters, moving heads')],
              [T('随机读', 'Random reads'), T('很快，没有寻道和旋转延迟', 'fast: no seek or rotation'), T('慢，要寻道', 'slow: seeks')],
              [T('写', 'Writes'), T('比读慢；要先擦除，有写放大', 'slower than reads; erase first'), T('可以原地覆盖', 'in place')],
              [T('寿命', 'Lifetime'), T('受擦写次数限制', 'limited erase cycles'), T('机械磨损', 'mechanical wear')],
            ],
          },
        },
      ],
    },
    pit([
      T('闪存是「页读写、块擦除」，不能直接覆盖已经写过的页。', 'Pages are written, blocks are erased; no in-place overwrite.'),
      T('写放大是闪存实际写入量除以主机写入量，不是反过来。', 'WA = flash writes / host writes.'),
      T('对 SSD 来说磁盘调度算法（按磁道排序）基本没有意义。', 'Disk scheduling hardly matters for SSDs.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('零散改写：写放大 2', 'Scattered rewrites: WA 2'), set: { writes: '0 1 2 3 4 5 6 7 8 9 0 5 2 7 3 9 0 5 2 7' } },
    { label: T('反复改写同一页：有一块几乎不擦', 'One hot page: uneven wear'), set: { writes: '0 1 2 3 4 5 6 7 8 9 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0' } },
    { label: T('整体顺序改写', 'Sequential rewrites'), set: { writes: '0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9' } },
  ],
  groups: [{ legend: T('主机写入', 'Host writes'), fields: [
    { name: 'writes', label: T(`依次写的逻辑页号（0～${LOGICAL - 1}，最多 40 个）`, `Logical pages written (0–${LOGICAL - 1}, up to 40)`), type: 'text', parse: (s) => String(s).trim(), wide: true },
  ] }],
  note: T(`${NB} 块 × ${NP} 页；主机能用的逻辑页 0～${LOGICAL - 1}，其余 ${NB * NP - LOGICAL} 页是预留空间。活动块写满且只剩 1 个空块时做垃圾回收：选无效页最多的块。`, `${NB} blocks × ${NP} pages; logical pages 0–${LOGICAL - 1}. GC runs when only one free block remains, choosing the block with most invalid pages.`),
};
const ERR = { writes: T(`写逻辑页号 0～${LOGICAL - 1}，空格隔开，最多 40 个`, `Logical pages 0–${LOGICAL - 1}, up to 40`) };

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const s = k >= 0 ? sim.steps[k] : null;
  const blocks = s ? s.blocks : Array.from({ length: NB }, () => ({ erases: 0, pages: Array.from({ length: NP }, () => ({ s: 'free', lpn: null })) }));
  let h = '';
  blocks.forEach((b, bi) => {
    const x = BX + bi * BG;
    const isVictim = s?.kind === 'gc' && s.victim === bi;
    const isDest = s?.kind === 'gc' && s.dest === bi;
    h += txt(x + BW / 2, BY - 30, z ? `块 ${bi}` : `Block ${bi}`, 'bt-lab');
    h += txt(x + BW / 2, BY - 10, z ? `擦除 ${b.erases} 次` : `${b.erases} erases`, isVictim ? 'cw-lab bad' : 'bt-idx');
    if (s && s.active === bi) h += txt(x + BW / 2, BY + NP * PH + 22, z ? '← 当前写入的块' : 'active block', 'bt-idx');
    b.pages.forEach((p, pi) => {
      const cur = s?.kind === 'write' && s.b === bi && s.p === pi;
      const old = s?.kind === 'write' && s.old && s.old.b === bi && s.old.p === pi;
      const moved = isDest && p.s === 'valid' && s.moved.includes(p.lpn);
      const tone = cur ? 'amber' : moved ? 'green' : p.s === 'valid' ? 'blue' : p.s === 'invalid' ? 'rose' : '';
      const label = p.s === 'free' ? (isVictim ? (z ? '已擦除' : 'erased') : z ? '空' : 'free') : p.s === 'valid' ? `L${p.lpn}` : z ? `L${p.lpn} 无效` : `L${p.lpn} invalid`;
      h += `<g transform="translate(${x} ${BY + pi * PH})">${cell(BW, PH - 6, label, { size: 15, tone, cls: cur || old || moved ? 'hot' : isVictim ? 'dim' : '' })}</g>`;
    });
  });
  if (s?.kind === 'gc' && s.moved.length) h += arrow(BX + s.victim * BG + BW / 2, BY + NP * PH + 40, BX + s.dest * BG + BW / 2, BY + NP * PH + 40, 'ok') + txt((BX + s.victim * BG + BX + s.dest * BG + BW) / 2, BY + NP * PH + 60, z ? `搬 ${s.moved.length} 个有效页` : `move ${s.moved.length} valid pages`, 'bt-cap');
  // 计数
  const host = s?.host ?? 0;
  const nand = s?.nand ?? 0;
  h += txt(BX, BY + NP * PH + 100, z ? `主机写 ${host} 页，闪存实际写 ${nand} 页，写放大 ${host ? (nand / host).toFixed(2) : '—'}` : `host ${host}, flash ${nand}, WA ${host ? (nand / host).toFixed(2) : '—'}`, 'bt-lab', 'start');
  items.push({ k: 'blocks', x: 0, y: 0, html: h });
  // 映射表
  const map = s?.map ?? {};
  const rows = Array.from({ length: LOGICAL }, (_, l) => {
    const m = map[l];
    const tone = (s?.kind === 'write' && s.lpn === l) || (s?.kind === 'gc' && s.moved.includes(l)) ? 'amber' : '';
    return [{ t: `L${l}`, tone }, { t: m ? (z ? `块 ${m.b} 页 ${m.p}` : `blk ${m.b} pg ${m.p}`) : '—', tone }];
  });
  items.push({ k: 'map', x: MX, y: BY - 40, html: txt(0, -14, z ? 'FTL 映射表' : 'FTL map', 'bt-lab', 'start') + gridTable([z ? '逻辑页' : 'logical', z ? '物理位置' : 'physical'], rows, { cw: [64, 110], rh: 28 }) });
  return items;
}

function build(p, kit, ERR) {
  const sim = ssd(p);
  const lesson = shell('ssd', kit, ERR, sim, {
    where: W,
    tag: 'SSD',
    name: T('固态硬盘：页、块与写放大', 'SSDs: pages, blocks and write amplification'),
    full: T('NAND 闪存 · 页读写、块擦除 · 不能原地改写 · FTL 映射 · 垃圾回收 · 写放大 · 预留空间 · 磨损均衡 · 和磁盘对比', 'NAND flash · page writes, block erases · FTL · garbage collection · write amplification · over-provisioning · wear levelling'),
    title: SPEC.presets.find((x) => x.set.writes === p.writes)?.label ?? T('固态硬盘', 'SSD'),
    legend: [['blue', T('有效页', 'Valid page')], ['rose', T('无效页（旧版本）', 'Invalid page')], ['amber', T('这一步写的', 'Written now')], ['green', T('回收时搬过来的', 'Moved by GC')]],
    principle: PRINCIPLE,
    desc: T('闪存只能整页写、整块擦，写过的页不能直接改。所以改写一个逻辑页，只能写到新的空页，旧页作废；空页不够了就要垃圾回收——把有效页搬走再擦整块。看主机写的页数和闪存实际写的页数怎样拉开（写放大），以及各块擦除次数怎样不均。', 'Flash writes pages and erases blocks; updates go to new pages and GC copies valid pages before erasing: watch write amplification and uneven wear.'),
    rect: [20, 90, 1100, 470],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => {
    let d;
    if (s.kind === 'write') d = [T(`写逻辑页 L${s.lpn}`, `Write L${s.lpn}`), T(`写到块 ${s.b} 的第 ${s.p} 页，映射表 L${s.lpn} 改指这里。${s.old ? `原来的块 ${s.old.b} 第 ${s.old.p} 页不能原地改写，只标成无效。` : ''}`, `To block ${s.b} page ${s.p}.${s.old ? ` The old copy becomes invalid.` : ''}`), s.old ? 'flash' : 'flash'];
    else d = [T(`垃圾回收：擦除块 ${s.victim}`, `GC: erase block ${s.victim}`), T(`活动块写满了，只剩 1 个空块（块 ${s.dest}）。选无效页最多的块 ${s.victim}（${s.invalid} 个无效页），把它的 ${s.moved.length} 个有效页${s.moved.length ? `（${s.moved.map((x) => `L${x}`).join('、')}）` : ''}搬到块 ${s.dest}，再整块擦除块 ${s.victim}。${s.moved.length ? `这 ${s.moved.length} 次写是主机没要求的，算进写放大。` : '没有要搬的页，这次回收不额外写。'}`, `Move ${s.moved.length} valid pages from block ${s.victim} to ${s.dest}, then erase ${s.victim}.`), 'gc'];
    return { title: d[0], desc: T(`主机 ${s.host} · 闪存 ${s.nand}`, `host ${s.host} · flash ${s.nand}`), detail: d[1], ref: d[2], st: { k }, row: { color: s.kind === 'gc' ? 'rose' : 'blue', what: d[0], result: T(`写放大 ${(s.nand / Math.max(1, s.host)).toFixed(2)}`, `WA ${(s.nand / Math.max(1, s.host)).toFixed(2)}`), tone: s.kind === 'gc' ? 'bad' : 'info' } };
  });
  const title = T(`主机写 ${sim.host} 页，闪存写 ${sim.nand} 页，写放大 ${sim.wa.toFixed(2)}`, `Host ${sim.host}, flash ${sim.nand}: WA ${sim.wa.toFixed(2)}`);
  const text = T(`垃圾回收 ${sim.gcCount} 次；各块擦除次数 ${sim.erases.join('、')}${sim.spread >= 2 ? '，相差不少——这就是需要磨损均衡的原因' : ''}。`, `${sim.gcCount} GCs; erases ${sim.erases.join(', ')}.`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeSsd = make('ssd', SPEC, ERR, build);
