// 「磁盘的结构与访问时间」：左边是一个盘面的俯视图（磁道、扇区、磁臂）和侧面的几个盘面（同一柱面），
// 右边是盘块号的拆分、一次读的时间条（寻道 + 旋转延迟 + 传输），最后和随机存放比较。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { diskTime, ms } from './disktime.js';

const W = [['os', 'io'], ['co', 'memory']];
const PX = 230; // 盘面圆心
const PY = 380;
const PR = 190;
const RINGS = 7; // 示意的磁道圈数
const WEDGES = 24; // 示意的扇区数
const SX = 490; // 侧视图
const RX = 610; // 右边的计算区
const RW = 380;
const f1 = (x) => Math.round(x * 10) / 10;

const PRINCIPLE = {
  sections: [
    {
      id: 'struct',
      title: T('盘面、磁道、扇区、柱面', 'Surfaces, tracks, sectors, cylinders'),
      blocks: [
        { list: [
          T('一个磁盘有几张**盘片**，每张两个**盘面**，每个盘面配一个**磁头**；盘面上的同心圆是**磁道**，磁道又分成若干**扇区**，扇区是读写的最小单位。', 'Platters have two surfaces, each with a head; tracks are rings, divided into sectors, the unit of transfer.'),
          T('所有盘面上半径相同的磁道组成一个**柱面**。磁头都装在同一个磁臂上一起移动，所以一次寻道定位的是一个柱面：同一柱面里换盘面只要切换磁头，不用移臂。', 'Same-radius tracks form a **cylinder**; all heads move together, so switching surfaces within a cylinder needs no seek.'),
          T('磁盘地址是（柱面号, 盘面号, 扇区号），也写作 CHS。', 'A disk address is (cylinder, head, sector): CHS.'),
          T('容量 = 柱面数 × 盘面数 × 每道扇区数 × 扇区大小。', 'Capacity = cylinders × heads × sectors per track × sector size.'),
        ] },
      ],
    },
    {
      id: 'addr',
      title: T('盘块号和（柱面, 盘面, 扇区）互换', 'Block number ↔ CHS'),
      blocks: [
        { p: T('按「柱面 → 盘面 → 扇区」的顺序连续编号（这样相邻的块尽量在同一柱面，读的时候不用移臂）。设每个柱面有 H 个盘面、每道 S 个扇区：', 'Numbering cylinder by cylinder, surface by surface keeps neighbours in one cylinder. With H heads and S sectors per track:') },
        { list: [
          T('盘块号 b = 柱面号 × (H × S) + 盘面号 × S + 扇区号', 'b = c × (H·S) + h × S + s'),
          T('柱面号 = ⌊b / (H × S)⌋；盘面号 = ⌊(b mod (H × S)) / S⌋；扇区号 = b mod S', 'c = ⌊b / (H·S)⌋; h = ⌊(b mod H·S) / S⌋; s = b mod S'),
        ] },
        { warn: T('题目里编号从 0 还是从 1 开始、一个盘块是一个扇区还是几个扇区，要先看清楚；从 1 开始时先减 1 再算。', 'Check whether numbers start at 0 or 1 and how many sectors a block has.') },
      ],
    },
    {
      id: 'time',
      title: T('一次读写的时间', 'Time of one access'),
      blocks: [
        {
          table: {
            head: [T('部分', 'Part'), T('是什么', 'What'), T('怎么算', 'How')],
            rows: [
              [T('寻道时间 Ts', 'Seek Ts'), T('磁臂移到目标柱面', 'move the arm'), T('题目给平均值；或 启动时间 s + 每跨一道 m × 跨越道数 n', 'given, or s + m × n')],
              [T('旋转延迟 Tr', 'Rotational latency Tr'), T('等目标扇区转到磁头下', 'wait for the sector'), T('平均转半圈：1 / (2r)', 'half a turn: 1/(2r)')],
              [T('传输时间 Tt', 'Transfer Tt'), T('扇区从磁头下经过', 'the sectors pass the head'), T('读 k 个扇区：k / 每道扇区数 × 转一圈的时间', 'k / S × one turn')],
            ],
          },
        },
        { p: T('转速 r 的单位常是「转 / 分」：转一圈 = 60000 / r 毫秒。例如 6000 转 / 分，一圈 10 ms，平均旋转延迟 5 ms。', 'r in rpm: one turn = 60000 / r ms; 6000 rpm → 10 ms, average latency 5 ms.') },
        { tip: T('寻道和旋转延迟都是「机械等待」，往往比传输时间大得多。所以同样的数据，连续存放（只寻道一次）比分散存放（每块都寻道）快得多。', 'Seek and latency dominate, so contiguous data is much faster than scattered data.') },
      ],
    },
    {
      id: 'format',
      title: T('格式化与分区', 'Formatting and partitioning'),
      blocks: [
        { list: [
          T('**低级格式化（物理格式化）**：把磁道划分成扇区，每个扇区写上头部（扇区号等）、数据区和校验码（ECC）。出厂时就做好了。', '**Low-level formatting** divides tracks into sectors with headers, data and ECC.'),
          T('**分区**：把磁盘分成一个或几个由连续柱面组成的区域，每个分区可以当作一个独立的逻辑磁盘。', '**Partitioning** splits the disk into regions of contiguous cylinders.'),
          T('**逻辑格式化（高级格式化）**：在分区上建立文件系统——写入引导块、超级块、空闲空间管理信息（如位示图）、根目录。', '**Logical formatting** creates a file system: boot block, superblock, free-space map, root directory.'),
          T('引导：计算机启动时先执行 ROM 里的自举程序，它从磁盘的引导块（主引导记录 MBR）读入更完整的引导程序，再装入操作系统。', 'Booting: the ROM bootstrap loads the boot block (MBR), which loads the OS.'),
          T('坏块：低级格式化时可以标记出来，用备用扇区替换（扇区备用），对上层透明。', 'Bad blocks are marked and replaced with spares.'),
        ] },
      ],
    },
    {
      id: 'faster',
      title: T('怎样让磁盘更快', 'Making disks faster'),
      blocks: [
        { list: [
          T('**磁盘调度**减少寻道时间（见「磁盘调度」那节课）。', '**Disk scheduling** cuts seek time.'),
          T('**交替编号**：相邻编号的扇区在磁道上隔开几个放，留出处理上一个扇区的时间，免得刚读完就要再等一整圈。', '**Interleaving** spaces consecutive sectors apart.'),
          T('**错位命名**：相邻盘面的 0 号扇区错开一点，换盘面继续读时不用等一整圈。', '**Skewing** offsets sector 0 on neighbouring surfaces.'),
          T('**连续存放、磁盘高速缓存、提前读、延迟写**都能减少访盘次数或等待。', 'Contiguous placement, disk caches, read-ahead and delayed write also help.'),
        ] },
      ],
    },
    pit([
      T('平均旋转延迟是**转半圈**的时间，不是一圈。', 'Average latency is **half** a turn.'),
      T('转速是「转 / 分」时先换算成每圈多少毫秒。', 'Convert rpm to milliseconds per turn first.'),
      T('传输时间按「读的扇区数占一圈的比例」算，与磁头从哪个扇区开始读无关。', 'Transfer time is the fraction of a turn covered by the sectors.'),
      T('同一柱面里换盘面不用寻道；跨柱面才要移臂。', 'Switching surfaces within a cylinder needs no seek.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('连续读 20 个扇区', 'Read 20 consecutive sectors'), set: { rpm: 6000, spt: 100, heads: 4, cyls: 1000, bytes: 512, b: 21037, k: 20, seek: 5 } },
    { label: T('7200 转、只读 1 个扇区', '7200 rpm, one sector'), set: { rpm: 7200, spt: 200, heads: 8, cyls: 2000, bytes: 512, b: 123456, k: 1, seek: 8 } },
    { label: T('读一整条磁道', 'Read a whole track'), set: { rpm: 10000, spt: 50, heads: 2, cyls: 500, bytes: 4096, b: 300, k: 50, seek: 4 } },
  ],
  groups: [
    {
      legend: T('磁盘', 'Disk'),
      fields: [
        { name: 'rpm', label: T('转速（转 / 分）', 'Speed (rpm)'), type: 'int', min: 1000, max: 20000 },
        { name: 'spt', label: T('每道扇区数', 'Sectors per track'), type: 'int', min: 4, max: 1000 },
        { name: 'heads', label: T('盘面数（磁头数）', 'Surfaces (heads)'), type: 'int', min: 1, max: 16 },
        { name: 'cyls', label: T('柱面数', 'Cylinders'), type: 'int', min: 2, max: 100000 },
        { name: 'bytes', label: T('扇区大小（B）', 'Sector size (B)'), type: 'select', options: [256, 512, 1024, 2048, 4096].map((v) => [v, String(v)]) },
        { name: 'seek', label: T('平均寻道时间（ms）', 'Average seek (ms)'), type: 'int', min: 0, max: 100 },
      ],
    },
    {
      legend: T('这次读', 'This read'),
      fields: [
        { name: 'b', label: T('起始盘块号（从 0 开始）', 'First block (from 0)'), type: 'int', min: 0, max: 1e8 },
        { name: 'k', label: T('连续读几个扇区', 'Sectors to read'), type: 'int', min: 1, max: 1000 },
      ],
    },
  ],
  note: T('一个盘块就是一个扇区，按「柱面 → 盘面 → 扇区」从 0 编号；一次读的扇区在同一条磁道上。', 'A block is a sector, numbered cylinder → surface → sector from 0; one read stays on one track.'),
};
const ERR = {
  rpm: T('转速 1000～20000', 'rpm 1000–20000'),
  spt: T('每道扇区数 4～1000', 'Sectors per track 4–1000'),
  heads: T('盘面数 1～16', 'Surfaces 1–16'),
  cyls: T('柱面数 2～100000', 'Cylinders 2–100000'),
  bytes: T('扇区大小选 256～4096', 'Sector size 256–4096'),
  seek: T('寻道时间 0～100 ms', 'Seek 0–100 ms'),
  b: T('盘块号最大 {max}', 'Block number at most {max}'),
  k: T('从这个扇区起，这条磁道上最多还能连续读 {max} 个', 'At most {max} sector(s) remain on this track'),
};

const pt = (r, deg) => [PX + r * Math.cos((deg * Math.PI) / 180), PY + r * Math.sin((deg * Math.PI) / 180)];
/** 环形扇区（两个半径、两个角度）的路径 */
function wedge(r0, r1, a0, a1) {
  const [x0, y0] = pt(r1, a0);
  const [x1, y1] = pt(r1, a1);
  const [x2, y2] = pt(r0, a1);
  const [x3, y3] = pt(r0, a0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${f1(x0)},${f1(y0)} A${r1},${r1} 0 ${big} 1 ${f1(x1)},${f1(y1)} L${f1(x2)},${f1(y2)} A${r0},${r0} 0 ${big} 0 ${f1(x3)},${f1(y3)} Z`;
}

function board(sim, st, z) {
  const items = [];
  const kind = st ? sim.steps[st.k].kind : 'pre';
  const at = (k) => ['addr', 'seek', 'rot', 'xfer', 'total', 'random'].indexOf(kind) >= ['addr', 'seek', 'rot', 'xfer', 'total', 'random'].indexOf(k);
  // 目标柱面画在第几圈（柱面 0 在最外）
  const ring = Math.round((sim.c / Math.max(1, sim.cyls - 1)) * (RINGS - 1));
  const rOf = (i) => PR - 18 - i * ((PR - 60) / (RINGS - 1));
  const tr = rOf(ring);
  const HEAD = -20; // 磁头所在的角度（右上方）
  const step = 360 / WEDGES;
  // 目标扇区在盘面上的角度：寻道时还在远处，旋转之后转到磁头下
  const sAng = at('rot') ? HEAD : HEAD + 150;
  const span = Math.max(step * 0.6, (sim.k / sim.spt) * 360);

  // ── 盘面俯视图 ──
  let d = txt(PX, PY - PR - 18, z ? '一个盘面（俯视）' : 'One surface (top view)', 'bt-lab');
  d += `<circle cx="${PX}" cy="${PY}" r="${PR}" style="fill:var(--panel-2);stroke:var(--line)"/>`;
  for (let i = 0; i < RINGS; i++) d += `<circle cx="${PX}" cy="${PY}" r="${f1(rOf(i))}" style="fill:none;stroke:var(--line);stroke-dasharray:${i === ring && at('seek') ? '0' : '3 3'};${i === ring && at('seek') ? 'stroke:var(--c-blue);stroke-width:2.5' : ''}"/>`;
  for (let i = 0; i < WEDGES; i++) {
    const [x, y] = pt(PR, i * step);
    d += `<line x1="${PX}" y1="${PY}" x2="${f1(x)}" y2="${f1(y)}" style="stroke:var(--line);stroke-width:0.6"/>`;
  }
  d += `<circle cx="${PX}" cy="${PY}" r="40" style="fill:var(--panel);stroke:var(--line)"/>` + txt(PX, PY + 4, z ? '主轴' : 'spindle', 'bt-idx');
  // 目标扇区（要读的那一段）
  if (at('addr')) d += `<path d="${wedge(tr - 9, tr + 9, sAng, sAng + span)}" style="fill:var(--c-amber);opacity:${at('xfer') ? 0.85 : 0.55}"/>`;
  // 旋转方向
  d += txt(PX - PR + 6, PY + PR - 4, z ? '↻ 逆时针转' : '↻ rotating', 'bt-idx', 'start');
  // 磁臂：从右下角的转轴伸到目标磁道
  const pivot = [PX + PR + 20, PY + PR - 10];
  const armR = at('seek') ? tr : rOf(0) + 10;
  const tip = pt(armR, HEAD);
  d += `<line x1="${pivot[0]}" y1="${pivot[1]}" x2="${f1(tip[0])}" y2="${f1(tip[1])}" style="stroke:var(--ink-2);stroke-width:5;stroke-linecap:round"/>`;
  d += `<circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="7" style="fill:var(--c-rose)"/>` + `<circle cx="${pivot[0]}" cy="${pivot[1]}" r="9" style="fill:var(--ink-2)"/>`;
  d += txt(tip[0] + 10, tip[1] - 10, z ? '磁头' : 'head', 'cw-lab bad l', 'start');
  if (at('seek')) d += txt(PX, PY + PR + 22, z ? `磁头停在 ${sim.c} 号柱面` : `Head at cylinder ${sim.c}`, 'cw-lab blue');
  items.push({ k: 'disk', x: 0, y: 0, html: d });

  // ── 侧视：同一柱面的几个盘面 ──
  let sv = txt(SX + 40, PY - PR - 18, z ? '同一柱面的盘面' : 'Surfaces in a cylinder', 'bt-lab');
  const gap = Math.min(40, 300 / sim.heads);
  for (let i = 0; i < sim.heads; i++) {
    const y = PY - (sim.heads - 1) * gap / 2 + i * gap;
    const on = at('addr') && i === sim.h;
    sv += `<g transform="translate(${SX} ${y - 11})">${cell(80, 22, z ? `盘面 ${i}` : `head ${i}`, { size: 11, tone: on ? 'amber' : '', cls: on ? 'hot' : 'dim' })}</g>`;
  }
  items.push({ k: 'side', x: 0, y: 0, html: sv });

  // ── 右边：拆地址 ──
  let r = txt(RX, 150, z ? '① 盘块号 → (柱面, 盘面, 扇区)' : '① Block → (cylinder, head, sector)', 'bt-lab', 'start');
  const per = `${sim.heads} × ${sim.spt} = ${sim.perCyl}`;
  if (at('addr')) {
    r += txt(RX, 176, z ? `每个柱面 ${per} 个扇区` : `${per} sectors per cylinder`, 'bt-cap', 'start');
    r += txt(RX, 200, `${z ? '柱面' : 'c'} = ⌊${sim.b} / ${sim.perCyl}⌋ = ${sim.c}`, 'ar-mono', 'start');
    r += txt(RX, 222, `${z ? '盘面' : 'h'} = ⌊${sim.b % sim.perCyl} / ${sim.spt}⌋ = ${sim.h}`, 'ar-mono', 'start');
    r += txt(RX, 244, `${z ? '扇区' : 's'} = ${sim.b} mod ${sim.spt} = ${sim.s}`, 'ar-mono', 'start');
  }
  // 时间条
  const parts = [
    ['seek', z ? '寻道' : 'seek', sim.seek, 'blue'],
    ['rot', z ? '旋转延迟' : 'latency', sim.tr, 'violet'],
    ['xfer', z ? '传输' : 'transfer', sim.tt, 'amber'],
  ];
  const scale = (RW - 10) / sim.ta; // 这次读的时间条占满一行
  const scaleR = (RW - 10) / Math.max(sim.random, sim.ta); // 对比时按随机存放的长度缩放
  r += txt(RX, 286, z ? '② 一次读的时间（ms）' : '② Time of this read (ms)', 'bt-lab', 'start');
  let x = RX;
  for (const [k, name, v, tone] of parts) {
    if (!at(k)) continue;
    const w = Math.max(3, v * scale);
    r += `<g transform="translate(${x} 296)">${cell(w, 26, '', { tone, cls: kind === k ? 'hot' : '' })}</g>`;
    r += txt(x + w / 2, 338 + (w < 70 && k !== 'seek' ? 14 : 0), `${name} ${ms(v)}`, 'bt-cap');
    x += w;
  }
  if (at('seek')) {
    const lines = [];
    if (at('seek')) lines.push(z ? `Ts = ${ms(sim.seek)}（平均寻道时间）` : `Ts = ${ms(sim.seek)} (average seek)`);
    if (at('rot')) lines.push(z ? `Tr = 60000 / ${sim.rpm} / 2 = ${ms(sim.tr)}（半圈）` : `Tr = 60000 / ${sim.rpm} / 2 = ${ms(sim.tr)}`);
    if (at('xfer')) lines.push(z ? `Tt = ${sim.k} / ${sim.spt} × ${ms(sim.rot)} = ${ms(sim.tt)}` : `Tt = ${sim.k} / ${sim.spt} × ${ms(sim.rot)} = ${ms(sim.tt)}`);
    if (at('total')) lines.push(z ? `合计 Ta = ${ms(sim.ta)} ms` : `Total Ta = ${ms(sim.ta)} ms`);
    lines.forEach((t, i) => (r += txt(RX, 392 + i * 22, t, i === 3 ? 'cw-lab acc l' : 'ar-mono', 'start')));
  }
  // 随机存放对比
  if (at('random')) {
    r += txt(RX, 500, z ? `③ 同样 ${sim.k} 个扇区随机分散存放` : `③ The same ${sim.k} sectors scattered`, 'bt-lab', 'start');
    r += `<g transform="translate(${RX} 510)">${cell(Math.max(3, sim.ta * scaleR), 20, '', { tone: 'green' })}</g>` + txt(RX + Math.max(3, sim.ta * scaleR) + 6, 525, z ? `连续：${ms(sim.ta)}` : `contiguous ${ms(sim.ta)}`, 'bt-cap', 'start');
    r += `<g transform="translate(${RX} 538)">${cell(Math.max(3, sim.random * scaleR), 20, '', { tone: 'rose', cls: 'hot' })}</g>`;
    r += txt(RX, 578, z ? `随机：${sim.k} × (${ms(sim.seek)} + ${ms(sim.tr)} + ${ms(sim.one)}) = ${ms(sim.random)}` : `scattered: ${sim.k} × (${ms(sim.seek)} + ${ms(sim.tr)} + ${ms(sim.one)}) = ${ms(sim.random)}`, 'ar-mono', 'start');
  }
  items.push({ k: 'calc', x: 0, y: 0, html: r });
  return items;
}

function build(p, kit, ERR) {
  const sim = diskTime(p);
  const lesson = shell('disk-time', kit, ERR, sim, {
    where: W,
    tag: T('访盘', 'Access'),
    name: T('磁盘的结构与访问时间', 'Disk structure and access time'),
    full: T('盘面 · 磁道 · 扇区 · 柱面 · （柱面, 盘面, 扇区）地址 · 寻道时间 · 旋转延迟 · 传输时间 · 连续与随机存放 · 格式化与分区', 'Surfaces, tracks, sectors, cylinders · CHS addresses · seek, latency, transfer · contiguous vs scattered · formatting and partitions'),
    title: SPEC.presets.find((x) => Object.entries(x.set).every(([k, v]) => p[k] === v))?.label ?? T('磁盘的访问时间', 'Disk access time'),
    legend: [['blue', T('寻道', 'Seek')], ['violet', T('旋转延迟', 'Latency')], ['amber', T('传输 / 目标扇区', 'Transfer / target')]],
    principle: PRINCIPLE,
    desc: T('读磁盘上的一块数据，先要把盘块号换成（柱面, 盘面, 扇区），再等三件事：磁臂移到那个柱面、扇区转到磁头下、扇区从磁头下经过。这节课把三段时间画成时间条，最后看看同样的数据连续存放和分散存放差多少。', 'Turn a block number into (cylinder, head, sector), then add seek, rotational latency and transfer; finally compare contiguous with scattered placement.'),
    rect: [0, 110, 1000, 620],
  });
  if (!sim.ok) return lesson;
  const D = {
    addr: [T('拆地址', 'Split the address'), T(`每个柱面有 ${sim.heads} 个盘面 × ${sim.spt} 个扇区 = ${sim.perCyl} 个扇区。盘块 ${sim.b} 在 ${sim.c} 号柱面、${sim.h} 号盘面、${sim.s} 号扇区；这次从这里起连续读 ${sim.k} 个扇区。`, `Block ${sim.b} → cylinder ${sim.c}, head ${sim.h}, sector ${sim.s}.`), 'addr'],
    seek: [T('寻道：磁臂移到柱面', 'Seek'), T(`所有磁头装在同一个磁臂上一起移动，移到 ${sim.c} 号柱面后，再接通 ${sim.h} 号盘面的磁头。平均寻道时间 ${ms(sim.seek)} ms。`, `The arm moves to cylinder ${sim.c}; head ${sim.h} is selected. ${ms(sim.seek)} ms.`), 'time'],
    rot: [T('旋转延迟：等扇区转过来', 'Rotational latency'), T(`转速 ${sim.rpm} 转 / 分，转一圈 60000 / ${sim.rpm} = ${ms(sim.rot)} ms。扇区可能刚过去也可能马上到，平均要等半圈：${ms(sim.tr)} ms。`, `One turn ${ms(sim.rot)} ms; on average half a turn: ${ms(sim.tr)} ms.`), 'time'],
    xfer: [T('传输：扇区从磁头下经过', 'Transfer'), T(`读 ${sim.k} 个扇区，占一圈的 ${sim.k} / ${sim.spt}，用时 ${sim.k} / ${sim.spt} × ${ms(sim.rot)} = ${ms(sim.tt)} ms。`, `${sim.k}/${sim.spt} of a turn: ${ms(sim.tt)} ms.`), 'time'],
    total: [T(`合计 ${ms(sim.ta)} ms`, `Total ${ms(sim.ta)} ms`), T(`Ta = 寻道 ${ms(sim.seek)} + 旋转延迟 ${ms(sim.tr)} + 传输 ${ms(sim.tt)} = ${ms(sim.ta)} ms。机械等待（寻道 + 旋转）占了 ${Math.round(((sim.seek + sim.tr) / sim.ta) * 100)}%。`, `Ta = ${ms(sim.ta)} ms; mechanical waiting is ${Math.round(((sim.seek + sim.tr) / sim.ta) * 100)}%.`), 'time'],
    random: [T('如果分散存放', 'If the sectors were scattered'), T(`同样 ${sim.k} 个扇区要是散在不同地方，每个都要寻道、等半圈、再传 1 个扇区：${sim.k} × (${ms(sim.seek)} + ${ms(sim.tr)} + ${ms(sim.one)}) = ${ms(sim.random)} ms，是连续存放的 ${ms(sim.random / sim.ta)} 倍。这就是文件尽量连续存放、磁盘要调度的原因。`, `Scattered: ${ms(sim.random)} ms, ${ms(sim.random / sim.ta)}× slower.`), 'faster'],
  };
  const list = sim.steps.map((s, k) => {
    const d = D[s.kind];
    return { title: d[0], desc: T(`盘块 ${sim.b} → (${sim.c}, ${sim.h}, ${sim.s})`, `block ${sim.b} → (${sim.c}, ${sim.h}, ${sim.s})`), detail: d[1], ref: d[2], st: { k }, row: { color: { addr: 'amber', seek: 'blue', rot: 'violet', xfer: 'amber', total: 'green', random: 'rose' }[s.kind], what: d[0], result: s.kind === 'addr' ? `(${sim.c}, ${sim.h}, ${sim.s})` : s.kind === 'random' ? `${ms(sim.random)} ms` : `${ms(s.kind === 'seek' ? sim.seek : s.kind === 'rot' ? sim.tr : s.kind === 'xfer' ? sim.tt : sim.ta)} ms`, tone: 'info' } };
  });
  const cap = sim.capacity >= 2 ** 30 ? `${ms(sim.capacity / 2 ** 30)} GB` : `${ms(sim.capacity / 2 ** 20)} MB`;
  return finish(lesson, list, (st, z) => board(sim, st, z), T(`一次读 ${ms(sim.ta)} ms`, `One read: ${ms(sim.ta)} ms`), T(`这块磁盘容量 ${sim.cyls} × ${sim.heads} × ${sim.spt} × ${sim.bytes} B = ${cap}，转一圈 ${ms(sim.rot)} ms，最大传输率 ${ms(sim.rate / 2 ** 20)} MB/s。寻道和旋转延迟是大头，所以要连续存放、要调度。`, `Capacity ${cap}; one turn ${ms(sim.rot)} ms; peak rate ${ms(sim.rate / 2 ** 20)} MB/s.`));
}

export const makeDiskTime = make('disk-time', SPEC, ERR, build);
