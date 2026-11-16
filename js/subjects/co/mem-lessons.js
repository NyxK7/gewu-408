// 存储器层次结构的四节课：主存容量扩展、Cache 地址划分与总容量、Cache 写策略、多体交叉存储器。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, hex, hexIn, make, pit, shell } from './kit.js';
import { cacheAddr, cacheWrite, interleave, memExt, parseRW } from './memory.js';

const W = [['co', 'memory']];

// ═════════════════════════ 主存扩展 ═════════════════════════

const EXT_PRINCIPLE = {
  sections: [
    {
      id: 'chips',
      title: T('半导体存储器', 'Semiconductor memory'),
      blocks: [
        {
          table: {
            head: ['', 'SRAM', 'DRAM'],
            rows: [
              [T('存储原理', 'Cell'), T('双稳态触发器', 'flip-flop'), T('电容上的电荷', 'charge on a capacitor')],
              [T('是否要刷新', 'Refresh'), T('不要', 'no'), T('要（电荷会泄漏，一般 2 ms 内刷新一遍）', 'yes, every ~2 ms')],
              [T('读出', 'Read'), T('非破坏性', 'non-destructive'), T('破坏性，读后要再生', 'destructive, rewritten')],
              [T('速度 / 集成度 / 价格', 'Speed / density / cost'), T('快 / 低 / 贵', 'fast / low / high'), T('慢 / 高 / 便宜', 'slow / high / low')],
              [T('用途', 'Use'), 'Cache', T('主存', 'main memory')],
            ],
          },
        },
        { p: T('DRAM 常采用**地址复用**：行地址和列地址分两次从同一组引脚送入，地址线减半。刷新方式有集中刷新（有一段「死时间」）、分散刷新（每个存取周期都刷一行，周期变长）、异步刷新（把刷新均匀分散到 2 ms 里）。ROM 断电不丢失，有 MROM、PROM、EPROM、EEPROM、Flash 等。', 'DRAM multiplexes row and column addresses. Refresh can be burst, distributed or asynchronous. ROM keeps data without power.') },
        { formula: T('容量 = 2^地址线数 × 数据线数（位）', 'capacity = 2^(address lines) × data lines') },
      ],
    },
    {
      id: 'ext',
      title: T('三种扩展', 'Three expansions'),
      blocks: [
        {
          table: {
            head: [T('扩展', 'Expansion'), T('什么时候', 'When'), T('怎么接', 'Wiring')],
            rows: [
              [T('位扩展', 'Bit'), T('芯片的位数不够', 'chip too narrow'), T('几片芯片地址线、片选、读写线都并联，数据线各接一部分', 'parallel addresses and chip select; split data lines')],
              [T('字扩展', 'Word'), T('芯片的字数不够', 'chip too short'), T('地址线低位并联、数据线并联，高位地址经译码器产生各片的片选信号', 'shared low address and data; high address decoded to chip selects')],
              [T('字位同时扩展', 'Both'), T('都不够', 'both'), T('先位扩展成一组，再把若干组字扩展', 'build groups by bit expansion, then word-expand the groups')],
            ],
          },
        },
        { formula: T('芯片数 = (目标字数 ÷ 芯片字数) × (目标位数 ÷ 芯片位数)', 'chips = (words ratio) × (bits ratio)') },
      ],
    },
    {
      id: 'decode',
      title: T('片选与地址范围', 'Chip select and address ranges'),
      blocks: [
        { p: T('芯片内部的地址线接 CPU 的低位地址；多出来的高位地址送进译码器，它的每个输出接一组芯片的片选 CS。某一组的地址范围：高位固定为这一组的编号，低位从全 0 到全 1。', 'Low address lines go to every chip; the extra high lines feed a decoder whose outputs select each group. A group’s range fixes the high bits and sweeps the low bits.') },
        { tip: T('考题常给出地址范围，反过来问需要几片、接在译码器的哪个输出上。把地址范围写成二进制，看高位就知道。', 'Given a range, write it in binary: the high bits name the group.') },
      ],
    },
    pit([
      T('1K = 1024，地址线数 = log₂(字数)。', '1K = 1024; address lines = log₂(words).'),
      T('位扩展的几片芯片片选接同一个信号，它们同时工作。', 'Bit-expanded chips share one chip select.'),
      T('地址范围的结尾是起始地址 + 芯片字数 − 1。', 'The range ends at start + words − 1.'),
    ]),
  ],
};
const EXT_SPEC = {
  presets: [
    { label: T('1K×4 扩成 4K×8', '1K×4 → 4K×8'), set: { chipK: 1, chipBits: 4, memK: 4, memBits: 8, base: '0' } },
    { label: T('只做位扩展：8K×1 扩成 8K×8', 'Bits only: 8K×1 → 8K×8'), set: { chipK: 8, chipBits: 1, memK: 8, memBits: 8, base: '0' } },
    { label: T('只做字扩展，从 8000H 开始', 'Words only, from 8000H'), set: { chipK: 2, chipBits: 8, memK: 8, memBits: 8, base: '8000' } },
  ],
  groups: [{ legend: T('芯片和目标', 'Chips and target'), fields: [
    { name: 'chipK', label: T('芯片字数（K）', 'Chip words (K)'), type: 'select', options: [1, 2, 4, 8, 16, 32, 64].map((v) => [v, `${v}K`]) },
    { name: 'chipBits', label: T('芯片位数', 'Chip bits'), type: 'select', options: [1, 2, 4, 8].map((v) => [v, String(v)]) },
    { name: 'memK', label: T('目标字数（K）', 'Target words (K)'), type: 'select', options: [1, 2, 4, 8, 16, 32, 64, 128].map((v) => [v, `${v}K`]) },
    { name: 'memBits', label: T('目标位数', 'Target bits'), type: 'select', options: [1, 2, 4, 8, 16, 32].map((v) => [v, String(v)]) },
    { name: 'base', label: T('起始地址（十六进制）', 'Start address (hex)'), type: 'text', parse: hexIn },
  ] }],
  note: T('高位地址经译码器选组，每组的地址范围按顺序排列。组数和每组片数都不超过 8。', 'High address bits select a group through a decoder; at most 8 groups and 8 chips per group.'),
};
const EXT_ERR = { size: T('字数要是 2 的幂，位数在 1～32', 'Words must be powers of 2'), fit: T('目标的字数、位数要是芯片的整数倍', 'Target must be a multiple of the chip'), base: T('起始地址要是芯片字数的整数倍', 'Start must align to the chip size'), many: T('组数或每组片数超过 8，画不下', 'More than 8 groups or chips per group') };
function extBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const CX = 330;
  const CY = 150;
  const CHW = 86;
  const RH = 54;
  // 芯片阵列
  sim.groups.forEach((g, gi) => {
    let h = '';
    g.chips.forEach((c, j) => {
      const show = k >= (gi === 0 && j === 0 ? 0 : sim.wordN > 1 && gi > 0 ? 1 : 0);
      h += `<g transform="translate(${j * (CHW + 8)} 0)">${cell(CHW, 42, show ? `${sim.chipK}K×${sim.chipBits}` : '', { tone: show ? ['blue', 'violet', 'teal', 'amber', 'green', 'orange', 'rose', 'slate'][gi % 8] : '', size: 12, cls: show ? '' : 'dim' })}${show ? txt(CHW / 2, 56, `D${c.hi}${c.hi !== c.lo ? `–D${c.lo}` : ''}`, 'bt-idx') : ''}</g>`;
    });
    if (k >= 3) h += txt(g.chips.length * (CHW + 8) + 10, 26, `${hex(g.start, Math.ceil(sim.totalAddr / 4))} ～ ${hex(g.end, Math.ceil(sim.totalAddr / 4))}`, 'ar-mono', 'start');
    items.push({ k: `g${gi}`, x: CX, y: CY + gi * (RH + 14), html: h });
  });
  // 地址线和译码器
  if (k >= 2) {
    let h = txt(0, 0, z ? `CPU 地址线 A${sim.totalAddr - 1}～A0（${sim.totalAddr} 位）` : `Address A${sim.totalAddr - 1}–A0 (${sim.totalAddr} bits)`, 'bt-lab', 'start');
    h += txt(0, 26, z ? `低 ${sim.chipAddr} 位 A${sim.chipAddr - 1}～A0 → 每片芯片` : `Low ${sim.chipAddr} bits → every chip`, 'ar-note on', 'start');
    if (sim.sel) h += txt(0, 50, z ? `高 ${sim.sel} 位 A${sim.totalAddr - 1}～A${sim.chipAddr} → ${sim.sel}-${2 ** sim.sel} 译码器 → 各组片选` : `High ${sim.sel} bits → ${sim.sel}-to-${2 ** sim.sel} decoder → chip selects`, 'ar-note on', 'start');
    items.push({ k: 'addr', x: 40, y: 92, html: h });
    if (sim.sel) {
      const DY = CY + ((sim.wordN - 1) * (RH + 14)) / 2 + 21;
      const DH = Math.max(64, sim.wordN * 24 + 16);
      const oy = (gi) => DY - DH / 2 + 8 + (gi + 0.5) * ((DH - 16) / sim.wordN);
      let d = `<g transform="translate(150 ${DY - DH / 2})">${cell(90, DH, '', { tone: 'slate' })}</g>` + txt(185, DY + 5, z ? '译码器' : 'decoder', 'bt-lab');
      sim.groups.forEach((g, gi) => (d += txt(234, oy(gi) + 4, `Y${gi}`, 'bt-idx', 'end') + arrow(240, oy(gi), CX - 6, CY + gi * (RH + 14) + 21, 'acc')));
      items.push({ k: 'dec', x: 0, y: 0, html: d });
    }
  }
  return items;
}
function buildExt(p, kit, ERR) {
  let sim = memExt({ chipK: +p.chipK, chipBits: +p.chipBits, memK: +p.memK, memBits: +p.memBits, base: parseInt(String(p.base).replace(/^0x/i, ''), 16) });
  if (sim.ok && (sim.wordN > 8 || sim.bitN > 8)) sim = { ok: false, errors: ['many'] };
  const lesson = shell('mem-ext', kit, ERR, sim, {
    where: W,
    tag: T('扩展', 'Ext'),
    name: T('主存容量扩展', 'Expanding main memory'),
    full: T('SRAM 与 DRAM · 刷新 · 位扩展 · 字扩展 · 译码片选 · 地址范围', 'SRAM and DRAM · refresh · bit and word expansion · chip select · ranges'),
    title: T(`${p.chipK}K×${p.chipBits} → ${p.memK}K×${p.memBits}`, `${p.chipK}K×${p.chipBits} → ${p.memK}K×${p.memBits}`),
    legend: [['blue', T('同一组的芯片（同一个片选）', 'One group (one chip select)')]],
    principle: EXT_PRINCIPLE,
    desc: T('一片芯片的字数、位数不够，就要多片拼起来。位数不够横着拼（位扩展），字数不够竖着拼（字扩展），高位地址经译码器选出用哪一组。这节课把芯片阵列、地址线怎么分、每组的地址范围一步步画出来。', 'Too narrow: place chips side by side; too short: stack groups selected by a decoder. The chip array, address split and ranges are built step by step.'),
    rect: [20, 70, 330 + (sim.ok ? sim.bitN : 2) * 94 + 220, 150 + (sim.ok ? sim.wordN : 4) * 68 + 20],
  });
  if (!sim.ok) return lesson;
  const list = [
    { title: T(`位扩展：每组 ${sim.bitN} 片`, `Bit expansion: ${sim.bitN} per group`), desc: `${sim.memBits} ÷ ${sim.chipBits} = ${sim.bitN}`, detail: sim.bitN > 1 ? T(`目标要 ${sim.memBits} 位，一片只有 ${sim.chipBits} 位，${sim.bitN} 片并排成一组：地址线、片选、读写控制线都并联，数据线各接 ${sim.chipBits} 位。`, `${sim.bitN} chips side by side share address and select lines; each supplies ${sim.chipBits} data bits.`) : T('芯片位数够，不需要位扩展。', 'No bit expansion needed.'), ref: 'ext', st: { k: 0 }, row: { color: 'blue', what: T('位扩展', 'Bits'), result: `×${sim.bitN}`, tone: 'info' } },
    { title: T(`字扩展：${sim.wordN} 组，共 ${sim.chips} 片`, `Word expansion: ${sim.wordN} groups, ${sim.chips} chips`), desc: `${sim.memK}K ÷ ${sim.chipK}K = ${sim.wordN}`, detail: sim.wordN > 1 ? T(`目标要 ${sim.memK}K 字，一组只有 ${sim.chipK}K 字，要 ${sim.wordN} 组。一共 ${sim.wordN} × ${sim.bitN} = ${sim.chips} 片。`, `${sim.wordN} groups × ${sim.bitN} = ${sim.chips} chips.`) : T(`字数够，不需要字扩展，一共 ${sim.chips} 片。`, `No word expansion; ${sim.chips} chips.`), ref: 'ext', st: { k: 1 }, row: { color: 'violet', what: T('字扩展', 'Words'), result: `×${sim.wordN}`, tone: 'info' } },
    { title: T(`地址线：${sim.chipAddr} 位进芯片${sim.sel ? `，${sim.sel} 位进译码器` : ''}`, `Address: ${sim.chipAddr} to chips${sim.sel ? `, ${sim.sel} to the decoder` : ''}`), desc: T(`共 ${sim.totalAddr} 位`, `${sim.totalAddr} bits`), detail: T(`${sim.memK}K = 2^${sim.totalAddr}，需要 ${sim.totalAddr} 位地址；一片芯片 ${sim.chipK}K = 2^${sim.chipAddr}，低 ${sim.chipAddr} 位接每片芯片的地址端。${sim.sel ? `剩下高 ${sim.sel} 位送 ${sim.sel}-${2 ** sim.sel} 译码器，输出 Y0～Y${sim.wordN - 1} 分别接各组的片选。` : ''}`, `${sim.totalAddr} address bits: the low ${sim.chipAddr} go to every chip${sim.sel ? `, the high ${sim.sel} to the decoder` : ''}.`), ref: 'decode', st: { k: 2 }, row: { color: 'slate', what: T('地址线', 'Address'), result: `${sim.chipAddr}+${sim.sel}`, tone: 'info' } },
    { title: T('各组的地址范围', 'Address ranges'), desc: T(`第 0 组 ${hex(sim.groups[0].start)} 起`, `From ${hex(sim.groups[0].start)}`), detail: T(`每组 ${sim.chipK}K = ${sim.chipK * 1024} 个地址，按顺序排：${sim.groups.map((g) => `第 ${g.g} 组 ${hex(g.start)}～${hex(g.end)}`).join('；')}。`, sim.groups.map((g) => `group ${g.g}: ${hex(g.start)}–${hex(g.end)}`).join('; ')), ref: 'decode', st: { k: 3 }, row: { color: 'green', what: T('地址范围', 'Ranges'), result: `${hex(sim.groups[0].start)}～${hex(sim.groups.at(-1).end)}`, tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => extBoard(sim, st, z), T(`${sim.chips} 片芯片`, `${sim.chips} chips`), T('换一个起始地址，看每组的范围和译码器输入怎么变。', 'Change the start address and watch the ranges move.'));
}
export const makeMemExt = make('mem-ext', EXT_SPEC, EXT_ERR, buildExt);

// ═════════════════════════ Cache 地址划分与容量 ═════════════════════════

const CA_PRINCIPLE = {
  sections: [
    {
      id: 'split',
      title: T('主存地址怎么拆', 'Splitting the address'),
      blocks: [
        {
          table: {
            head: [T('映射', 'Mapping'), T('地址划分', 'Fields')],
            rows: [
              [T('直接映射', 'Direct'), T('标记 | 行号 | 块内地址', 'tag | line | offset')],
              [T('n 路组相联', 'n-way'), T('标记 | 组号 | 块内地址', 'tag | set | offset')],
              [T('全相联', 'Fully associative'), T('标记 | 块内地址', 'tag | offset')],
            ],
          },
        },
        {
          list: [
            T('块内地址位数 = log₂(块大小)；', 'offset bits = log₂(block size);'),
            T('组数 = Cache 行数 ÷ 路数，组号位数 = log₂(组数)（直接映射时组数就是行数）；', 'sets = lines ÷ ways; index bits = log₂(sets);'),
            T('标记位数 = 主存地址位数 − 组号位数 − 块内地址位数。', 'tag bits = address − index − offset.'),
          ],
        },
        { tip: T('路数越多，组号越短，标记越长，每次要同时比较的标记越多。', 'More ways: shorter index, longer tag, more comparators.') },
      ],
    },
    {
      id: 'total',
      title: T('Cache 的总容量', 'Total cache size'),
      blocks: [
        { formula: T('总容量 = 行数 × (有效位 + 脏位 + 替换控制位 + 标记位 + 数据位)', 'total = lines × (valid + dirty + replacement + tag + data bits)') },
        {
          list: [
            T('**有效位**：每行 1 位，一定有；', '**valid**: 1 bit per line, always;'),
            T('**脏位**（修改位）：采用写回法时才有，1 位；', '**dirty**: 1 bit with write-back;'),
            T('**替换控制位**：LRU 时每行 log₂(路数) 位（计数器）；直接映射不需要；', '**replacement**: log₂(ways) bits for LRU;'),
            T('**标记位**：上面算出的位数；', '**tag**;'),
            T('**数据位**：块大小 × 8。', '**data**: block size × 8.'),
          ],
        },
        { warn: T('题目说「Cache 的数据区容量」只算数据位；说「Cache 的总容量」要把标记、有效位等都算上。', '“Data capacity” excludes tags; “total capacity” includes them.') },
      ],
    },
    pit([
      T('地址位数按字节编址的主存容量算。', 'Address bits come from the byte-addressed memory size.'),
      T('全相联没有组号字段。', 'Fully associative has no index.'),
      T('写直达（全写法）不需要脏位。', 'Write-through needs no dirty bit.'),
    ]),
  ],
};
const CA_SPEC = {
  presets: [
    { label: T('4 路组相联、写回、LRU', '4-way, write-back, LRU'), set: { addrBits: 32, cacheKB: 16, blockB: 64, ways: 4, wb: true, lru: true, addr: '12345678' } },
    { label: T('直接映射、写直达', 'Direct mapped, write-through'), set: { addrBits: 32, cacheKB: 8, blockB: 32, ways: 1, wb: false, lru: false, addr: '0001F2A4' } },
    { label: T('全相联', 'Fully associative'), set: { addrBits: 24, cacheKB: 1, blockB: 16, ways: 0, wb: true, lru: true, addr: 'ABCDE' } },
  ],
  groups: [{ legend: 'Cache', fields: [
    { name: 'addrBits', label: T('主存地址位数', 'Address bits'), type: 'int', min: 12, max: 40 },
    { name: 'cacheKB', label: T('Cache 数据区（KB）', 'Cache data (KB)'), type: 'select', options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((v) => [v, `${v} KB`]) },
    { name: 'blockB', label: T('块大小（B）', 'Block (B)'), type: 'select', options: [4, 8, 16, 32, 64, 128].map((v) => [v, String(v)]) },
    { name: 'ways', label: T('映射方式', 'Mapping'), type: 'select', options: [[1, T('直接映射', 'direct')], [2, T('2 路组相联', '2-way')], [4, T('4 路组相联', '4-way')], [8, T('8 路组相联', '8-way')], [0, T('全相联', 'fully associative')]] },
    { name: 'wb', label: T('写回法（有脏位）', 'Write-back (dirty bit)'), type: 'check' },
    { name: 'lru', label: T('LRU 替换（有计数位）', 'LRU (counter bits)'), type: 'check' },
    { name: 'addr', label: T('要拆的主存地址（十六进制）', 'Address to split (hex)'), type: 'text', parse: hexIn },
  ] }],
  note: T('按字节编址。LRU 每行用 log₂(路数) 位计数器；直接映射不需要替换位。', 'Byte addressed; LRU uses log₂(ways) bits per line.'),
};
const CA_ERR = { addrBits: T('地址位数在 12～40', 'Address bits 12–40'), pow2: T('容量和块大小要是 2 的幂', 'Sizes must be powers of 2'), ways: T('路数不能超过行数', 'Too many ways'), small: T('地址位数太少', 'Too few address bits'), addr: T('地址超出了范围', 'Address out of range') };
const FIELD = { tag: 'violet', index: 'teal', offset: 'amber' };
function caBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const BW = Math.min(16, 640 / sim.addrBits);
  const X0 = 150;
  const segs = [['tag', sim.tag, z ? '标记' : 'tag'], ['index', sim.index, sim.full ? '' : sim.ways === 1 ? (z ? '行号' : 'line') : z ? '组号' : 'set'], ['offset', sim.offset, z ? '块内地址' : 'offset']].filter((s) => s[1] > 0);
  let x = 0;
  let h = txt(-14, 20, z ? '主存地址' : 'Address', 'ar-lab', 'end');
  let bx = 0;
  segs.forEach(([key, n, lab], si) => {
    const show = k >= ({ offset: 0, index: 1, tag: 2 })[key];
    h += `<g transform="translate(${x} 0)">${cell(n * BW - 3, 30, show ? `${lab} ${n}` : '?', { tone: show ? FIELD[key] : '', size: 12, cls: show ? '' : 'dim' })}</g>`;
    if (k >= 3) {
      const bits = sim.bin.slice(bx, bx + n);
      h += txt(x + (n * BW - 3) / 2, 52, bits.length > 24 ? bits.slice(0, 22) + '…' : bits, 'ca-bits');
      const val = key === 'tag' ? sim.tagVal : key === 'index' ? sim.set : sim.off;
      h += txt(x + (n * BW - 3) / 2, 72, `= ${hex(val)}`, 'bt-idx');
    }
    x += n * BW + 2;
    bx += n;
    void si;
  });
  items.push({ k: 'addr', x: X0, y: 120, html: h });
  if (k >= 3) items.push({ k: 'hex', x: X0, y: 104, html: txt(0, 0, `${hex(sim.a)} = ${z ? '块号' : 'block'} ${hex(sim.blockNo)}`, 'ar-mono', 'start') });
  if (k >= 4) {
    const parts = [[z ? '有效位' : 'valid', 1, 'green'], ...(sim.wb ? [[z ? '脏位' : 'dirty', 1, 'rose']] : []), ...(sim.repl ? [['LRU', sim.repl, 'blue']] : []), [z ? '标记' : 'tag', sim.tag, 'violet'], [z ? '数据' : 'data', sim.data, 'amber']];
    let r = txt(-14, 20, z ? '每一行' : 'Each line', 'ar-lab', 'end');
    let rx = 0;
    parts.forEach(([lab, n, tone]) => {
      const w = Math.max(56, Math.min(260, n * 3));
      r += `<g transform="translate(${rx} 0)">${cell(w - 3, 30, `${lab} ${n}`, { tone, size: 12 })}</g>`;
      rx += w;
    });
    items.push({ k: 'line', x: X0, y: 230, html: r });
    items.push({ k: 'total', x: X0, y: 300, html: txt(0, 0, z ? `总容量 = ${sim.lines} 行 × (${sim.perLine} + ${sim.data}) 位 = ${sim.total} 位 ≈ ${+(sim.total / 8 / 1024).toFixed(3)} KB` : `Total = ${sim.lines} × (${sim.perLine} + ${sim.data}) = ${sim.total} bits`, 'bt-formula cur', 'start') + txt(0, 26, z ? `其中标记等额外开销 ${sim.lines * sim.perLine} 位，占 ${+((sim.perLine / (sim.perLine + sim.data)) * 100).toFixed(2)}%` : `overhead ${sim.lines * sim.perLine} bits`, 'bt-cap', 'start') });
  }
  return items;
}
function buildCa(p, kit, ERR) {
  const sim = cacheAddr({ ...p, cacheKB: +p.cacheKB, blockB: +p.blockB, ways: +p.ways, wb: !!p.wb, lru: !!p.lru });
  const lesson = shell('cache-addr', kit, ERR, sim, {
    where: W,
    tag: T('地址', 'Addr'),
    name: T('Cache 地址划分与总容量', 'Cache address fields and size'),
    full: T('标记 / 组号 / 块内地址 · 有效位、脏位、替换位 · 总容量', 'Tag / index / offset · valid, dirty, replacement bits · total size'),
    title: T(`${p.cacheKB} KB，${sim.ok ? (sim.full ? '全相联' : sim.ways === 1 ? '直接映射' : `${sim.ways} 路`) : ''}`, `${p.cacheKB} KB`),
    legend: [['violet', T('标记', 'Tag')], ['teal', T('组号 / 行号', 'Index')], ['amber', T('块内地址', 'Offset')]],
    principle: CA_PRINCIPLE,
    desc: T('Cache 的大题几乎都要先把主存地址拆成「标记、组号、块内地址」三段，再算出 Cache 一共要多少位。这节课先一段段定出各字段的位数，再把一个具体地址拆开，最后画出一行 Cache 里有哪些位。', 'Split the address into tag, index and offset, apply it to one address, then lay out the bits of one cache line.'),
    rect: [30, 80, 150 + 680, 340],
  });
  if (!sim.ok) return lesson;
  const list = [
    { title: T(`块内地址 ${sim.offset} 位`, `Offset: ${sim.offset} bits`), desc: `log₂${sim.blockB} = ${sim.offset}`, detail: T(`块大小 ${sim.blockB} B = 2^${sim.offset}，块内地址要 ${sim.offset} 位。`, `${sim.blockB} B blocks need ${sim.offset} offset bits.`), ref: 'split', st: { k: 0 }, row: { color: 'amber', what: T('块内', 'Offset'), result: String(sim.offset), tone: 'info' } },
    { title: sim.full ? T('全相联：没有组号', 'Fully associative: no index') : T(`${sim.ways === 1 ? '行号' : '组号'} ${sim.index} 位`, `Index: ${sim.index} bits`), desc: T(`${sim.lines} 行 ÷ ${sim.ways} 路 = ${sim.sets} 组`, `${sim.lines} lines ÷ ${sim.ways} = ${sim.sets} sets`), detail: T(`行数 = ${sim.cacheKB} KB ÷ ${sim.blockB} B = ${sim.lines} 行；${sim.full ? '全相联只有 1 组，不需要组号。' : `${sim.ways === 1 ? '直接映射' : `${sim.ways} 路组相联`}共 ${sim.sets} 组，组号 log₂${sim.sets} = ${sim.index} 位。`}`, `${sim.lines} lines, ${sim.sets} sets, ${sim.index} index bits.`), ref: 'split', st: { k: 1 }, row: { color: 'teal', what: T('组号', 'Index'), result: String(sim.index), tone: 'info' } },
    { title: T(`标记 ${sim.tag} 位`, `Tag: ${sim.tag} bits`), desc: `${sim.addrBits} − ${sim.index} − ${sim.offset}`, detail: T(`标记 = ${sim.addrBits} − ${sim.index} − ${sim.offset} = ${sim.tag} 位。`, `Tag = ${sim.addrBits} − ${sim.index} − ${sim.offset} = ${sim.tag}.`), ref: 'split', st: { k: 2 }, row: { color: 'violet', what: T('标记', 'Tag'), result: String(sim.tag), tone: 'info' } },
    { title: T(`拆开 ${hex(sim.a)}`, `Split ${hex(sim.a)}`), desc: T(`标记 ${hex(sim.tagVal)}，组 ${sim.set}，块内 ${sim.off}`, `tag ${hex(sim.tagVal)}, set ${sim.set}, offset ${sim.off}`), detail: T(`写成 ${sim.addrBits} 位二进制，按 ${sim.tag} | ${sim.index} | ${sim.offset} 切开：标记 ${hex(sim.tagVal)}，${sim.full ? '' : `组号 ${sim.set}，`}块内地址 ${sim.off}。也就是主存第 ${hex(sim.blockNo)} 块，${sim.full ? '可以放进任何一行' : `只能放进第 ${sim.set} 组`}。`, `Tag ${hex(sim.tagVal)}, set ${sim.set}, offset ${sim.off}: memory block ${hex(sim.blockNo)}.`), ref: 'split', st: { k: 3 }, row: { color: 'blue', what: hex(sim.a), result: `${hex(sim.tagVal)}/${sim.set}/${sim.off}`, tone: 'info' } },
    { title: T(`总容量 ${sim.total} 位`, `Total ${sim.total} bits`), desc: T(`每行 ${sim.perLine} + ${sim.data} 位`, `${sim.perLine} + ${sim.data} per line`), detail: T(`每行：有效位 1${sim.wb ? ' + 脏位 1' : ''}${sim.repl ? ` + LRU ${sim.repl}` : ''} + 标记 ${sim.tag} = ${sim.perLine} 位，再加数据 ${sim.blockB} × 8 = ${sim.data} 位。总容量 = ${sim.lines} × ${sim.perLine + sim.data} = ${sim.total} 位。`, `Per line ${sim.perLine} + ${sim.data}; total ${sim.total} bits.`), ref: 'total', st: { k: 4 }, row: { color: 'green', what: T('总容量', 'Total'), result: `${sim.total}`, tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => caBoard(sim, st, z), T(`${sim.tag} | ${sim.index} | ${sim.offset}`, `${sim.tag} | ${sim.index} | ${sim.offset}`), T('把映射方式在直接映射、组相联、全相联之间切换，看标记和组号此消彼长。', 'Switch mappings and watch tag and index trade bits.'));
}
export const makeCacheAddr = make('cache-addr', CA_SPEC, CA_ERR, buildCa);

// ═════════════════════════ Cache 写策略 ═════════════════════════

const CW_PRINCIPLE = {
  sections: [
    {
      id: 'hit',
      title: T('写命中', 'Write hits'),
      blocks: [
        {
          table: {
            head: [T('策略', 'Policy'), T('做法', 'Action'), T('特点', 'Trade-off')],
            rows: [
              [T('全写法（写直达）', 'Write-through'), T('同时写 Cache 和主存', 'write both'), T('主存总是最新的；写得多，常配写缓冲', 'memory always current; many writes, so a write buffer helps')],
              [T('写回法', 'Write-back'), T('只写 Cache，把这一行标为「脏」；被换出时才整块写回主存', 'write the cache, mark dirty, write back on eviction'), T('访存少；要脏位；主存可能是旧的', 'fewer writes; needs a dirty bit')],
            ],
          },
        },
      ],
    },
    {
      id: 'miss',
      title: T('写不命中', 'Write misses'),
      blocks: [
        {
          table: {
            head: [T('策略', 'Policy'), T('做法', 'Action'), T('通常搭配', 'Usually with')],
            rows: [
              [T('写分配', 'Write-allocate'), T('先把主存块调进 Cache，再在 Cache 里写', 'load the block, then write'), T('写回法', 'write-back')],
              [T('非写分配', 'No-write-allocate'), T('只写主存，不调块', 'write memory only'), T('全写法', 'write-through')],
            ],
          },
        },
        { tip: T('写分配利用了空间局部性：写过的块接下来很可能还会被访问。', 'Allocation exploits locality.') },
      ],
    },
    {
      id: 'count',
      title: T('数访存次数', 'Counting memory traffic'),
      blocks: [
        { p: T('写回法：读不命中或写不命中都要调块（读一次主存块）；如果被换出的那一行是脏的，先把它写回（写一次主存块）。全写法：每次写都写一次主存（一个字）；读不命中调块；写不命中不调块。', 'Write-back: every miss loads a block, and evicting a dirty line writes it back. Write-through: every write goes to memory; only read misses load blocks.') },
        { warn: T('多级 Cache 中，L1 和 L2 之间常用全写法，L2 和主存之间常用写回法。', 'Multi-level caches often use write-through between L1 and L2, write-back to memory.') },
      ],
    },
    pit([
      T('写回法只在换出脏块时写主存，不是每次写都写。', 'Write-back writes only when a dirty line leaves.'),
      T('全写法不需要脏位。', 'Write-through needs no dirty bit.'),
    ]),
  ],
};
const CW_SPEC = {
  presets: [
    { label: T('写回法 + 写分配', 'Write-back + allocate'), set: { lines: 2, ops: 'R0 W0 W2 R0 W1 R3', policy: 'wb' } },
    { label: T('全写法 + 非写分配', 'Write-through + no-allocate'), set: { lines: 2, ops: 'R0 W0 W2 R0 W1 R3', policy: 'wt' } },
    { label: T('反复写同一块', 'Repeated writes'), set: { lines: 4, ops: 'W5 W5 W5 W5 R9 R5', policy: 'wb' } },
  ],
  groups: [{ legend: T('Cache', 'Cache'), fields: [
    { name: 'policy', label: T('写策略', 'Policy'), type: 'select', options: [['wb', T('写回法 + 写分配', 'write-back + allocate')], ['wt', T('全写法 + 非写分配', 'write-through + no-allocate')]], wide: true },
    { name: 'lines', label: T('Cache 行数（直接映射）', 'Lines (direct mapped)'), type: 'int', min: 1, max: 8 },
    { name: 'ops', label: T('访问序列：R3 读 3 号块，W3 写 3 号块', 'Accesses: R3 read block 3, W3 write'), type: 'text', wide: true, parse: (s) => (parseRW(s) ? s : NaN) },
  ] }],
  note: T('直接映射：块号 mod 行数决定放在哪一行。全写法每次写都写一个字到主存；写回法换出脏块时写回整块。', 'Direct mapped. Write-through writes a word per write; write-back writes a block per dirty eviction.'),
};
const CW_ERR = { lines: T('行数在 1～8', 'Use 1–8 lines'), ops: T('访问最多 16 次', 'At most 16 accesses') };
const ACT = { load: T('调块', 'load'), writeback: T('写回脏块', 'write back'), dirty: T('置脏', 'set dirty'), writeBoth: T('写 Cache 和主存', 'write both'), writeMemOnly: T('只写主存', 'memory only') };
// 画法：CPU、Cache、主存三列并排。每次访问只画这一次真正发生的数据流动：
// 调块（主存 → Cache）、写回脏块（Cache → 主存）、写直达（CPU → 主存）、置脏。
// 写回法下，Cache 里有脏副本的那一块在主存里是「旧」的。下面两排小方块就是读、写主存的次数。
function cwGeo(sim) {
  const blocks = [...new Set(sim.steps.map((s) => s.b))].sort((a, b) => a - b);
  const two = blocks.length > 8;
  const CY = (i) => 150 + i * 52;
  const MX = (j) => 600 + (two && j >= Math.ceil(blocks.length / 2) ? 132 : 0);
  const MY = (j) => 140 + (two ? j % Math.ceil(blocks.length / 2) : j) * 40;
  const bottom = Math.max(CY(sim.lines - 1) + 40, MY(two ? Math.ceil(blocks.length / 2) - 1 : blocks.length - 1) + 30, 270) + 34;
  return { blocks, CY, MX, MY, bottom, right: two ? 600 + 132 + 112 : 600 + 112 };
}
function cwBoard(sim, st, z) {
  const items = [];
  const g = cwGeo(sim);
  const k = st?.k ?? -1;
  const s = k >= 0 ? sim.steps[k] : null;
  const L = s ? s.L : Array(sim.lines).fill(null);
  const bj = (b) => g.blocks.indexOf(b);
  // CPU 和这一次的访问
  let cpu = cell(100, 56, 'CPU', { tone: 'slate', size: 15 });
  if (s) cpu += `<g transform="translate(0 -46)">${cell(100, 32, `${s.op === 'W' ? (z ? '写' : 'write') : z ? '读' : 'read'} ${z ? '块' : 'blk'} ${s.b}`, { tone: s.op === 'W' ? 'amber' : 'blue', size: 13, cls: 'hot' })}</g>`;
  items.push({ k: 'cpu', x: 40, y: 160, html: cpu });
  // Cache
  let ch = txt(0, -14, z ? `Cache（直接映射，${sim.lines} 行）` : `Cache (${sim.lines} lines)`, 'bt-cap', 'start');
  L.forEach((x, i) => {
    const cur = s && i === s.line;
    ch += `<g transform="translate(0 ${g.CY(i) - 150})">${txt(-10, 25, z ? `行 ${i}` : `L${i}`, 'bt-idx', 'end')}${cell(150, 40, x ? `${z ? '块' : 'blk'} ${x.b}${x.dirty ? (z ? ' · 脏' : ' · dirty') : ''}` : z ? '空' : 'empty', { tone: x ? (x.dirty ? 'rose' : 'teal') : '', size: 13, cls: cur ? (s.hit ? 'ok' : 'hot') : x ? '' : 'dim' })}</g>`;
  });
  items.push({ k: 'cache', x: 260, y: 150, html: ch });
  // 主存：写回法下，有脏副本的块在主存里是旧的
  const stale = new Set(sim.policy === 'wb' ? L.filter((x) => x?.dirty).map((x) => x.b) : []);
  let mh = '';
  g.blocks.forEach((b, j) => {
    const old = stale.has(b);
    const cur = s && (b === s.b || b === s.victim);
    mh += `<g transform="translate(${g.MX(j) - 600} ${g.MY(j) - 140})">${cell(112, 32, `${z ? '块' : 'blk'} ${b}${old ? (z ? ' · 旧' : ' · stale') : ''}`, { tone: old ? '' : 'violet', size: 12, cls: `${old ? 'stale' : ''} ${cur ? 'hot' : ''}` })}</g>`;
  });
  items.push({ k: 'mem', x: 600, y: 140, html: txt(0, -14, z ? '主存' : 'Memory', 'bt-cap', 'start') + mh });
  // 这一次的数据流动
  if (s) {
    let f = '';
    const cy = g.CY(s.line) + 20;
    const mem = (b) => [g.MX(bj(b)), g.MY(bj(b)) + 16];
    const toMem = (b, cls, lab) => {
      const [mx, my] = mem(b);
      const yb = g.bottom - 18;
      f += `<path class="cw-path ${cls}" d="M90 216 L90 ${yb} L${mx - 26} ${yb} L${mx - 26} ${my}"/>` + arrow(mx - 26, my, mx - 2, my, cls);
      if (lab) f += txt((90 + mx) / 2, yb - 6, lab, `cw-lab ${cls}`);
    };
    for (const a of s.acts) {
      if (a === 'writeback') {
        const [mx, my] = mem(s.victim);
        f += arrow(412, cy - 8, mx - 4, my - 4, 'bad') + txt((412 + mx) / 2, (cy + my) / 2 - 14, z ? `写回块 ${s.victim}` : `write back ${s.victim}`, 'cw-lab bad');
      }
      if (a === 'load') {
        const [mx, my] = mem(s.b);
        f += arrow(mx - 4, my + 4, 412, cy + 8, 'cs-a') + txt((412 + mx) / 2, (cy + my) / 2 + 22, z ? `调入块 ${s.b}` : `load ${s.b}`, 'cw-lab blue');
      }
      if (a === 'writeBoth') {
        f += arrow(140, 188, 258, cy, 'cw-w');
        toMem(s.b, 'cw-w', z ? '同时写主存' : 'also to memory');
      }
      if (a === 'writeMemOnly') toMem(s.b, 'cw-w', z ? '只写主存，不调块' : 'memory only, no allocate');
      if (a === 'dirty') f += arrow(140, 188, 258, cy, 'cw-w');
    }
    if (s.op === 'R') f += arrow(258, cy, 142, 196, 'ok');
    items.push({ k: `flow${k}`, x: 0, y: 0, html: f });
  }
  // 读、写主存的次数：一次一个小方块
  const prev = k > 0 ? sim.steps[k - 1] : { reads: 0, writes: 0 };
  const tally = (y, lab, n, before, tone) => {
    let h = txt(-12, 14, `${lab} ${n}`, 'bt-lab', 'end');
    for (let i = 0; i < n; i++) h += `<g transform="translate(${i * 24} 0)">${cell(20, 20, '', { tone, cls: i >= before ? 'hot' : '' })}</g>`;
    return { k: `t${lab}`, x: 150, y, html: h };
  };
  const R = s ? s.reads : 0;
  const Wr = s ? s.writes : 0;
  items.push(tally(g.bottom + 20, z ? '读主存' : 'reads', R, s ? prev.reads : 0, 'blue'));
  items.push(tally(g.bottom + 50, z ? '写主存' : 'writes', Wr, s ? prev.writes : 0, 'rose'));
  return items;
}
function buildCw(p, kit, ERR) {
  const sim = cacheWrite(p);
  const lesson = shell('cache-write', kit, ERR, sim, {
    where: W,
    tag: T('写', 'Wr'),
    name: T('Cache 写策略', 'Cache write policies'),
    full: T('全写法与写回法 · 写分配与非写分配 · 脏位 · 访存次数', 'Write-through vs write-back · allocation · dirty bits · memory traffic'),
    title: T(p.policy === 'wb' ? '写回法 + 写分配' : '全写法 + 非写分配', p.policy === 'wb' ? 'Write-back' : 'Write-through'),
    legend: [['teal', T('干净的行', 'Clean')], ['rose', T('脏行', 'Dirty')], ['blue', T('读主存（调块）', 'Memory read')]],
    principle: CW_PRINCIPLE,
    desc: T('写 Cache 时主存要不要同时写？写不命中要不要先调块？这节课用一串读写访问把两种组合各走一遍，右边的表格逐次记下调块、写回的次数，最后比一比哪种访存更少。', 'Run the same accesses under write-back and write-through and count the memory traffic step by step.'),
    rect: sim.ok ? [10, 90, cwGeo(sim).right + 30, cwGeo(sim).bottom + 80] : [10, 90, 760, 420],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => ({
    title: T(`${s.op === 'R' ? '读' : '写'} ${s.b} 号块：${s.hit ? '命中' : '不命中'}`, `${s.op === 'R' ? 'Read' : 'Write'} block ${s.b}: ${s.hit ? 'hit' : 'miss'}`),
    desc: T(`读主存 ${s.reads} 次，写主存 ${s.writes} 次`, `${s.reads} reads, ${s.writes} writes`),
    detail: T(`${s.b} mod ${sim.lines} = ${s.line}，看第 ${s.line} 行：${s.hit ? '正好是这一块，命中' : s.victim != null ? `里面是 ${s.victim} 号块，不命中` : '是空的，不命中'}。${s.acts.map((a) => ACT[a].zh).join('，')}${s.acts.includes('writeback') ? `（${s.victim} 号块是脏的，先整块写回）` : ''}${s.acts.includes('writeMemOnly') ? '（非写分配，不调块）' : ''}。`, `Line ${s.line}: ${s.hit ? 'hit' : 'miss'}; ${s.acts.map((a) => ACT[a].en).join(', ')}.`),
    ref: s.hit ? 'hit' : 'miss',
    st: { k },
    row: { color: s.hit ? 'green' : 'rose', what: `${s.op}${s.b}`, result: s.hit ? T('命中', 'hit') : T('不命中', 'miss'), tone: s.hit ? 'ok' : 'warn' },
  }));
  const other = cacheWrite({ ...p, policy: p.policy === 'wb' ? 'wt' : 'wb' });
  return finish(lesson, list, (st, z) => cwBoard(sim, st, z), T(`读主存 ${sim.reads} 次，写 ${sim.writes} 次`, `${sim.reads} reads, ${sim.writes} writes`), T(`同样的访问换成${p.policy === 'wb' ? '全写法' : '写回法'}：读 ${other.reads} 次、写 ${other.writes} 次。${sim.dirtyLeft ? `结束时还有 ${sim.dirtyLeft} 个脏行没写回。` : ''}`, `The other policy: ${other.reads} reads, ${other.writes} writes.`));
}
export const makeCacheWrite = make('cache-write', CW_SPEC, CW_ERR, buildCw);

// ═════════════════════════ 多体交叉 ═════════════════════════

const IL_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('提高主存带宽', 'Raising memory bandwidth'),
      blocks: [
        { list: [T('**双端口存储器**：两套独立的读写电路，两个端口可以同时访问（同一单元同时写会冲突）。', '**Dual-port memory**: two independent ports.'), T('**单体多字**：一次读出多个字，要求数据连续存放。', '**Wide memory**: several words per access.'), T('**多体并行**：m 个独立的存储体，各有自己的地址寄存器和数据寄存器，可以同时或轮流工作。', '**Multiple banks** working in parallel or in turn.')] },
      ],
    },
    {
      id: 'mode',
      title: T('高位交叉和低位交叉', 'High-order vs low-order interleaving'),
      blocks: [
        {
          table: {
            head: ['', T('高位交叉（顺序方式）', 'High-order'), T('低位交叉（交叉方式）', 'Low-order')],
            rows: [
              [T('体号', 'Bank'), T('地址的高位', 'high bits'), T('地址的低位：体号 = 地址 mod m', 'low bits: address mod m')],
              [T('连续地址', 'Consecutive addresses'), T('在同一个体里', 'same bank'), T('依次落在不同的体', 'rotate across banks')],
              [T('连续访问', 'Sequential access'), T('只能一个个来，不能并行', 'serial'), T('流水线方式轮流启动，提高带宽', 'pipelined')],
              [T('优点', 'Advantage'), T('容易扩充容量', 'easy to expand'), T('带宽高', 'high bandwidth')],
            ],
          },
        },
        { formula: T('低位交叉连续读 n 个字：T + (n − 1) × r，其中 r = T ÷ m', 'n consecutive words: T + (n − 1)r with r = T/m') },
        { p: T('总线每隔 r 启动一个体。要让流水线不断流，体数 m ≥ T ÷ r。如果相邻两次访问落在同一个体，后一次必须等这个体的存取周期结束——这就是**访存冲突**。', 'Each bank is started r apart; m ≥ T/r keeps the pipeline full. Two accesses to one bank within T conflict.') },
      ],
    },
    pit([
      T('高位交叉的存储器连续访问时并不能提速。', 'High-order interleaving does not speed sequential access.'),
      T('低位交叉的体号是地址 mod m，体内地址是地址 ÷ m。', 'Low-order: bank = address mod m, word = address ÷ m.'),
    ]),
  ],
};
const IL_SPEC = {
  presets: [
    { label: T('低位交叉，连续 8 个字', 'Low-order, 8 consecutive'), set: { m: 4, T: 200, addrs: [0, 1, 2, 3, 4, 5, 6, 7], mode: 'low', bankWords: 16 } },
    { label: T('高位交叉，连续 8 个字', 'High-order, 8 consecutive'), set: { m: 4, T: 200, addrs: [0, 1, 2, 3, 4, 5, 6, 7], mode: 'high', bankWords: 16 } },
    { label: T('低位交叉，有冲突', 'Low-order with conflicts'), set: { m: 4, T: 200, addrs: [0, 4, 1, 5, 2, 10, 3], mode: 'low', bankWords: 16 } },
  ],
  groups: [{ legend: T('存储器', 'Memory'), fields: [
    { name: 'mode', label: T('编址方式', 'Interleaving'), type: 'select', options: [['low', T('低位交叉', 'low-order')], ['high', T('高位交叉', 'high-order')]], wide: true },
    { name: 'm', label: T('体数 m', 'Banks m'), type: 'select', options: [[2, '2'], [4, '4'], [8, '8']] },
    { name: 'T', label: T('存取周期 T', 'Cycle T'), type: 'int', min: 2, max: 1000 },
    { name: 'bankWords', label: T('每个体的字数（高位交叉用）', 'Words per bank (high-order)'), type: 'int', min: 1, max: 1024 },
    { name: 'addrs', label: T('依次访问的地址', 'Addresses in order'), type: 'list', min: 0, max: 8192, maxLen: 12, wide: true },
  ] }],
  note: T('总线每隔 r = T ÷ m 才能启动一次新的访问；同一个体要等上一次访问结束。T 要能被 m 整除。', 'A new access may start every r = T/m; a busy bank must finish first.'),
};
const IL_ERR = { m: T('体数是 2、4、8', 'Banks: 2, 4 or 8'), T: T('T 要能被 m 整除', 'T must be divisible by m'), addrs: T('地址要 1～12 个', 'Give 1–12 addresses'), bankWords: T('每个体的字数要大于 0', 'Words per bank must be positive'), range: T('地址超出了 m × 每体字数', 'Address beyond the memory') };
const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'orange', 'rose', 'slate'];
function ilBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const X0 = 150;
  const LW = 600;
  const sc = LW / Math.max(sim.total, sim.T * 2);
  for (let b = 0; b < sim.m; b++) items.push({ k: `lane${b}`, x: X0, y: 130 + b * 40, html: txt(-14, 20, z ? `体 ${b}` : `bank ${b}`, 'bt-lab', 'end') + line(0, 34, LW, 34, 'bl-lane') });
  sim.acc.slice(0, k + 1).forEach((a, i) => items.push({ k: `a${i}`, x: X0 + a.start * sc, y: 130 + a.bank * 40 + 4, from: [X0 + a.start * sc, 100], html: cell(Math.max(3, sim.T * sc - 2), 26, String(a.a), { tone: TONES[i % 8], size: 11, cls: a.conflict && i === k ? 'bad' : i === k ? 'hot' : '' }) }));
  const AY = 130 + sim.m * 40 + 16;
  let ax = line(0, 0, LW, 0, 'bl-axis');
  const end = Math.max(sim.total, sim.T * 2);
  const stepT = sim.r * Math.max(1, Math.ceil(end / sim.r / 10));
  for (let t = 0; t <= end; t += stepT) ax += line(t * sc, -3, t * sc, 3, 'bl-axis') + txt(t * sc, 16, String(t), 'bt-idx');
  items.push({ k: 'axis', x: X0, y: AY, html: ax });
  if (k === sim.acc.length - 1) items.push({ k: 'sum', x: X0, y: AY + 44, html: txt(0, 0, z ? `一共 ${sim.total}（一个个串行要 ${sim.serial}，理想流水 ${sim.ideal}）` : `Total ${sim.total} (serial ${sim.serial}, ideal ${sim.ideal})`, 'bt-formula cur', 'start') });
  return items;
}
function buildIl(p, kit, ERR) {
  const sim = interleave({ ...p, m: +p.m });
  const lesson = shell('interleave', kit, ERR, sim, {
    where: W,
    tag: T('多体', 'Bank'),
    name: T('多体交叉存储器', 'Interleaved memory'),
    full: T('双端口 · 多体并行 · 高位交叉与低位交叉 · 流水线访问 · 访存冲突', 'Dual-port · banks · high vs low interleaving · pipelining · conflicts'),
    title: T(`${p.m} 体 ${p.mode === 'low' ? '低位' : '高位'}交叉`, `${p.m} banks, ${p.mode}-order`),
    legend: [['rose', T('访存冲突，要等', 'Conflict, waits')]],
    principle: IL_PRINCIPLE,
    desc: T('每个存储体都要一个完整的存取周期 T，但多个体可以轮流启动。这节课把每个体画成一条时间线：低位交叉时连续的地址分到不同的体，像流水线一样错开 T/m 启动；高位交叉时它们挤在同一个体里只能排队。', 'Each bank needs a full cycle T but banks can start in turn. Low-order interleaving staggers consecutive words by T/m; high-order queues them in one bank.'),
    rect: [40, 90, 150 + 640, 130 + (sim.ok ? sim.m : 4) * 40 + 80],
  });
  if (!sim.ok) return lesson;
  const list = sim.acc.map((a, i) => ({
    title: T(`访问 ${a.a}：体 ${a.bank}，${a.start} 开始`, `Address ${a.a}: bank ${a.bank} at ${a.start}`),
    desc: a.conflict ? T('这个体还在忙，要等', 'Bank busy: wait') : T(`${a.start} ～ ${a.end}`, `${a.start}–${a.end}`),
    detail: T(`${sim.mode === 'low' ? `${a.a} mod ${sim.m} = ${a.bank}，体内第 ${a.inBank} 个字` : `${a.a} ÷ ${sim.bankWords} = ${a.bank}，体内第 ${a.inBank} 个字`}。${i === 0 ? '第一次访问 0 时刻开始。' : `总线最早在上一次启动后 r = ${sim.r} 再启动，即 ${sim.acc[i - 1].start + sim.r}；${a.conflict ? `可体 ${a.bank} 要到 ${a.start} 才空出来，发生访存冲突。` : `体 ${a.bank} 这时空着，直接开始。`}`}`, `Bank ${a.bank}; ${a.conflict ? 'conflict, waits' : 'starts immediately'}.`),
    ref: 'mode',
    st: { k: i },
    row: { color: a.conflict ? 'rose' : 'blue', what: String(a.a), result: T(`体 ${a.bank}`, `bank ${a.bank}`), tone: a.conflict ? 'warn' : 'info' },
  }));
  return finish(lesson, list, (st, z) => ilBoard(sim, st, z), T(`共用 ${sim.total}`, `Total ${sim.total}`), T('把编址方式换成高位交叉，同样的连续地址就只能排队了。', 'Switch to high-order and consecutive addresses queue in one bank.'));
}
export const makeInterleave = make('interleave', IL_SPEC, IL_ERR, buildIl);
