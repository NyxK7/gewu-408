// CPU 一章的四节课：单总线数据通路、微指令格式、流水线性能、控制冒险。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from './kit.js';
import { INSTR, branch, datapath, microword, pipePerf } from './cpu.js';
import { parseMem } from './isa.js';

const W = [['co', 'cpu']];
const STONE = { IF: 'blue', ID: 'teal', EX: 'amber', MEM: 'violet', WB: 'green' };
const r2 = (x) => +x.toFixed(2);

// ═════════════════════════ 单总线数据通路 ═════════════════════════

const DP_PRINCIPLE = {
  sections: [
    {
      id: 'regs',
      title: T('CPU 的组成', 'Inside the CPU'),
      blocks: [
        { p: T('CPU = 运算器 + 控制器。运算器有 ALU、暂存器、累加器、通用寄存器、程序状态字 PSW；控制器有程序计数器 PC、指令寄存器 IR、指令译码器、存储器地址寄存器 MAR、存储器数据寄存器 MDR、时序系统和微操作信号发生器。', 'CPU = datapath + control unit: ALU, registers and PSW; PC, IR, decoder, MAR, MDR and timing.') },
        {
          table: {
            head: [T('寄存器', 'Register'), T('作用', 'Role'), T('程序员可见？', 'Visible?')],
            rows: [
              ['PC', T('下一条指令的地址', 'next instruction address'), T('可见', 'yes')],
              ['IR', T('当前正在执行的指令', 'current instruction'), T('不可见', 'no')],
              ['MAR / MDR', T('访存的地址 / 数据', 'memory address / data'), T('不可见', 'no')],
              [T('通用寄存器、PSW', 'GPRs, PSW'), T('操作数、标志', 'operands, flags'), T('可见', 'yes')],
              [T('暂存器 Y、Z', 'Temporaries Y, Z'), T('ALU 的输入、输出缓冲', 'ALU buffers'), T('不可见', 'no')],
            ],
          },
        },
      ],
    },
    {
      id: 'cycle',
      title: T('指令周期', 'The instruction cycle'),
      blocks: [
        { steps: [
          T('取指周期：按 PC 取出指令送 IR，PC 指向下一条', 'Fetch: instruction into IR, PC advances'),
          T('间址周期：操作数是间接寻址时，先取有效地址', 'Indirect: fetch the effective address'),
          T('执行周期：完成指令规定的操作', 'Execute'),
          T('中断周期：有中断请求且允许时，保存断点，转去中断服务程序', 'Interrupt: save the PC and enter the handler'),
        ] },
        { p: T('取指周期对所有指令都一样：PC → MAR；读存储器，M(MAR) → MDR，PC + 1；MDR → IR。', 'Fetch is the same for all instructions: PC → MAR; read, PC + 1; MDR → IR.') },
      ],
    },
    {
      id: 'bus',
      title: T('单总线结构的规矩', 'Rules of the single bus'),
      blocks: [
        { list: [
          T('同一个节拍里，总线上只能有**一个**部件输出（xxout），但可以有多个部件同时接收（xxin）。', 'Only **one** source drives the bus per step; several may load from it.'),
          T('ALU 是两个输入：一个来自暂存器 Y，另一个来自总线；结果先放进暂存器 Z，下一个节拍再送出去。', 'The ALU takes Y and the bus; the result goes into Z first.'),
          T('所以「R0 + R1 → R0」在单总线上要三个节拍：R1 → Y；R0 + Y → Z；Z → R0。', 'So R0 + R1 → R0 takes three steps.'),
        ] },
        { tip: T('专用通路（多总线）结构里，部件之间有专门的连线，可以并行，但硬件多。', 'A dedicated datapath runs things in parallel at higher hardware cost.') },
      ],
    },
    pit([
      T('MemR 读出的数据先到 MDR，不能直接到寄存器。', 'Memory data always lands in MDR first.'),
      T('取指完成后 PC 已经指向下一条指令，相对转移要用这个 PC。', 'After fetch PC already points to the next instruction.'),
    ]),
  ],
};
const DP_SPEC = {
  presets: [
    { label: 'ADD R0, (R1)', set: { instr: 'addmem', PC: 100, R0: 5, R1: 300, A: 0, mem: '300:7' } },
    { label: 'ADD R0, R1', set: { instr: 'addrr', PC: 100, R0: 5, R1: 8, A: 0, mem: '' } },
    { label: 'LOAD R0, A', set: { instr: 'load', PC: 100, R0: 0, R1: 0, A: 50, mem: '50:42' } },
    { label: 'STORE R0, A', set: { instr: 'store', PC: 100, R0: 9, R1: 0, A: 50, mem: '' } },
    { label: 'JMP +A', set: { instr: 'jmp', PC: 100, R0: 0, R1: 0, A: 20, mem: '' } },
  ],
  groups: [{ legend: T('指令和初值', 'Instruction and values'), fields: [
    { name: 'instr', label: T('指令', 'Instruction'), type: 'select', options: Object.entries(INSTR).map(([k, v]) => [k, v]), wide: true },
    { name: 'PC', label: 'PC', type: 'int', min: 0, max: 999 },
    { name: 'R0', label: 'R0', type: 'int', min: -999, max: 999 },
    { name: 'R1', label: 'R1', type: 'int', min: -999, max: 999 },
    { name: 'A', label: T('地址码 A', 'Address A'), type: 'int', min: 0, max: 999 },
    { name: 'mem', label: T('内存「地址:内容」', 'Memory addr:value'), type: 'text', wide: true, allowEmpty: true, parse: (s) => (parseMem(s) && Object.keys(parseMem(s)).length <= 3 ? s : NaN) },
  ] }],
  note: T('单总线：一个节拍只能有一个 xxout；ALU 一端固定接 Y，结果进 Z；取指时 PC + 1 由专门电路完成。', 'One xxout per step; the ALU reads Y and the bus and writes Z.'),
};
const DP_ERR = { instr: T('没有这条指令', 'Unknown instruction'), mem: T('内存的格式是「地址:内容」', 'Use addr:value') };
const BUS_Y = 270;
const UP = { PC: [90, 160], IR: [200, 160], R0: [350, 160], R1: [460, 160], Y: [600, 160], Z: [820, 160] };
const DN = { MAR: [90, 330], MDR: [240, 330] };
const RW = (r) => (r === 'IR' ? 130 : 90);
function dpBoard(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : null;
  const reg = s ? s.reg : sim.init;
  const mem = s ? s.mem : sim.initMem;
  const outR = s?.out;
  const inR = s?.in ?? [];
  // 总线
  items.push({ k: 'bus', x: 0, y: 0, html: `<rect class="dp-bus ${s && s.out !== 'MEM' && !inR.includes('MEM') ? 'on' : ''}" x="60" y="${BUS_Y - 7}" width="860" height="14" rx="7"/>` + txt(930, BUS_Y + 5, z ? '内部总线' : 'bus', 'bt-cap', 'start') + (s && s.out !== 'MEM' && !inR.includes('MEM') ? txt(490, BUS_Y + 30, `${z ? '总线上' : 'bus'}：${s.bus}`, 'dp-busv') : '') });
  const box = (r, [x, y], up) => {
    const w = RW(r);
    const cls = outR === r ? 'hot' : inR.includes(r) ? 'ok' : '';
    let h = txt(w / 2, -8, r, 'bt-lab') + cell(w, 38, String(reg[r]), { size: r === 'IR' ? 11 : 13, tone: cls ? (cls === 'hot' ? 'amber' : 'green') : '', cls });
    if (outR === r) h += arrow(w / 2, up ? 38 : 0, w / 2, up ? BUS_Y - y - 8 : BUS_Y - y + 8, 'acc');
    if (inR.includes(r) && !(r === 'Z')) h += arrow(w / 2, up ? BUS_Y - y - 8 : BUS_Y - y + 8, w / 2, up ? 40 : -2, 'ok');
    items.push({ k: r, x, y, html: h });
  };
  for (const [r, p] of Object.entries(UP)) box(r, p, true);
  for (const [r, p] of Object.entries(DN)) box(r, p, false);
  // ALU：Y → ALU ← 总线，ALU → Z
  let alu = `<g transform="translate(710 156)">${cell(70, 46, 'ALU', { tone: 'slate', size: 13, cls: s?.alu ? 'hot' : '' })}</g>`;
  alu += arrow(690, 179, 708, 179, s?.alu ? 'acc' : '') + arrow(782, 179, 818, 179, s?.alu ? 'acc' : '');
  if (s?.alu) alu += arrow(745, BUS_Y - 8, 745, 204, 'acc') + txt(752, 228, s.alu, 'bt-lab', 'start');
  items.push({ k: 'alu', x: 0, y: 0, html: alu });
  // 存储器
  const ents = Object.entries(mem).slice(0, 4);
  let m = cell(240, 34 + ents.length * 22, '', { tone: 'slate' }) + txt(-10, 22, z ? '主存' : 'Memory', 'bt-lab', 'end');
  ents.forEach(([a, v], i) => (m += txt(14, 24 + i * 22, `${a}：${v}`, 'ar-mono', 'start')));
  items.push({ k: 'mem', x: 90, y: 420, html: m });
  const memOn = outR === 'MEM' || inR.includes('MEM');
  items.push({ k: 'mw', x: 0, y: 0, html: arrow(135, 370, 135, 418, s?.sig.some((x) => x.startsWith('Mem')) ? 'acc' : '') + (memOn ? (outR === 'MEM' ? arrow(285, 418, 285, 370, 'ok') : arrow(285, 370, 285, 418, 'ok')) : line(285, 370, 285, 418, 'bl-axis')) });
  // 控制信号
  if (s) {
    let sg = txt(0, 0, z ? (s.phase === 'fetch' ? '取指' : '执行') : s.phase, 'bt-cap', 'start');
    s.sig.forEach((x, i) => (sg += `<g transform="translate(${50 + i * 98} -16)">${cell(92, 26, x, { tone: 'rose', size: 12 })}</g>`));
    items.push({ k: `sig${st.k}`, x: 400, y: 440, html: sg });
  }
  return items;
}
function buildDp(p, kit, ERR) {
  const mem = parseMem(p.mem ?? '');
  const sim = mem ? datapath({ instr: p.instr, PC: p.PC, R0: p.R0, R1: p.R1, A: p.A, mem }) : { ok: false, errors: ['mem'] };
  if (sim.ok) {
    sim.init = { PC: p.PC, R0: p.R0, R1: p.R1, MAR: 0, MDR: 0, IR: '', Y: 0, Z: 0 };
    sim.initMem = { ...mem, [p.PC]: INSTR[p.instr] };
  }
  const lesson = shell('datapath', kit, ERR, sim, {
    where: W,
    tag: T('通路', 'Path'),
    name: T('单总线数据通路', 'Single-bus datapath'),
    full: T('CPU 的寄存器 · 指令周期 · 取指 · 微操作 · 控制信号', 'CPU registers · instruction cycle · fetch · micro-operations · control signals'),
    title: INSTR[p.instr] ?? '',
    legend: [['amber', T('这一拍往总线上送数的部件（xxout）', 'Drives the bus')], ['green', T('这一拍接收的部件（xxin）', 'Loads from the bus')]],
    principle: DP_PRINCIPLE,
    desc: T('一条指令在 CPU 里是怎么一拍一拍执行的？这节课把单总线 CPU 的寄存器、ALU、主存画在一起，每一拍只亮出这一拍的控制信号：谁往总线上送数，谁从总线上接收，寄存器里的值随之变化。先是所有指令都一样的取指，再是这条指令自己的执行。', 'Each step lights up the control signals of one clock beat: which register drives the bus, which ones load, and how the values change — fetch first, then execute.'),
    rect: [20, 110, 990, 520],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => ({
    title: T(s.zh, s.en),
    desc: s.sig.join('，'),
    detail: T(`${s.phase === 'fetch' ? '取指周期' : '执行周期'}第 ${s.phase === 'fetch' ? k + 1 : k - 2} 拍。控制信号 ${s.sig.join('、')}：${s.out === 'MEM' ? `读存储器 M(${s.reg.MAR}) = ${s.bus} 送进 MDR` : s.in[0] === 'MEM' ? `把 MDR 的 ${s.bus} 写进主存 ${s.reg.MAR}` : `${s.out} 把 ${s.bus} 送上总线，${s.in.join('、')} 接收${s.alu ? `（ALU 算 Y + 总线 = ${s.reg.Z}）` : ''}`}${s.pc1 ? `；同时 PC + 1 = ${s.reg.PC}` : ''}。`, `${s.sig.join(', ')}.`),
    ref: s.phase === 'fetch' ? 'cycle' : 'bus',
    st: { k },
    row: { color: s.phase === 'fetch' ? 'blue' : 'amber', what: s.sig[0], result: s.in.join(','), tone: 'info' },
  }));
  const last = sim.steps.at(-1).reg;
  return finish(lesson, list, (st, z) => dpBoard(sim, st, z), T(`${sim.steps.length} 拍`, `${sim.steps.length} steps`), T(`结束时 PC = ${last.PC}，R0 = ${last.R0}。换一条指令，看执行周期的节拍怎么变。`, `PC = ${last.PC}, R0 = ${last.R0}. Try another instruction.`));
}
export const makeDatapath = make('datapath', DP_SPEC, DP_ERR, buildDp);

// ═════════════════════════ 微指令格式 ═════════════════════════

const MW_PRINCIPLE = {
  sections: [
    {
      id: 'terms',
      title: T('几个概念', 'Terms'),
      blocks: [
        { list: [
          T('**微命令**：控制部件发出的最小控制信号（如 PCout）；**微操作**：它引起的动作。', '**Micro-command**: one control signal; **micro-operation**: the action it causes.'),
          T('**相容**的微命令可以同时出现，**互斥**的不能同时出现（如 ALU 的加和减）。', '**Compatible** commands may coexist; **mutually exclusive** ones may not.'),
          T('**微指令**：一组微命令加上下一条微指令的地址；**微程序**：一串微指令，对应一条机器指令。', '**Microinstruction**: commands plus a next address; **microprogram**: one per machine instruction.'),
          T('微程序放在 CPU 里的**控制存储器 CM**（ROM），由 CMAR 给地址，读出的微指令放进 CMDR。', 'Microprograms live in the control store CM, addressed by CMAR, read into CMDR.'),
        ] },
      ],
    },
    {
      id: 'encode',
      title: T('控制字段的编码', 'Encoding the control field'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Method'), T('做法', 'How'), T('特点', 'Trade-off')],
            rows: [
              [T('直接编码', 'Direct'), T('每一位代表一个微命令', 'one bit per command'), T('最快、最灵活，位数最多', 'fastest, widest')],
              [T('字段直接编码', 'Field encoding'), T('互斥的微命令放进同一字段，字段内二进制编码，再译码', 'mutually exclusive commands share a decoded field'), T('位数少，多一级译码', 'shorter, one decode delay')],
              [T('字段间接编码', 'Indirect field'), T('一个字段的含义还要看另一个字段', 'a field’s meaning depends on another'), T('更省位，更慢', 'even shorter, slower')],
            ],
          },
        },
        { formula: T('一个字段的位数 = ⌈log₂(互斥微命令数 + 1)⌉（+1 表示「什么都不做」）', 'field bits = ⌈log₂(commands + 1)⌉') },
      ],
    },
    {
      id: 'next',
      title: T('下一条微指令在哪', 'Sequencing'),
      blocks: [
        { p: T('**计数器法**：顺序执行时 CMAR + 1，转移时另给地址。**断定法**：微指令里直接写出下一条的地址（下地址字段），条件测试字段决定按哪个条件修改它。', '**Counter**: CMAR + 1 unless branching. **Next-address field**: the word names its successor; the condition field selects modifications.') },
        { formula: T('下地址字段位数 = ⌈log₂(控存字数)⌉；条件测试字段 = ⌈log₂(条件数 + 1)⌉', 'address bits = ⌈log₂ words⌉; condition bits = ⌈log₂(conditions + 1)⌉') },
      ],
    },
    {
      id: 'kind',
      title: T('水平型与垂直型，硬布线与微程序', 'Horizontal vs vertical; hardwired vs microprogrammed'),
      blocks: [
        { p: T('**水平型**微指令一次能发出多个并行的微命令，字长、速度快；**垂直型**像机器指令，一条只做一两个操作，字短、微程序长、慢。', '**Horizontal**: many parallel commands; **vertical**: one or two per word.') },
        {
          table: {
            head: ['', T('硬布线控制器', 'Hardwired'), T('微程序控制器', 'Microprogrammed')],
            rows: [
              [T('实现', 'Built from'), T('逻辑电路', 'logic gates'), T('控存里的微程序', 'microcode in ROM')],
              [T('速度', 'Speed'), T('快', 'fast'), T('慢（每条微指令要读控存）', 'slower')],
              [T('修改、扩充', 'Changes'), T('难', 'hard'), T('容易', 'easy')],
              [T('用于', 'Used in'), 'RISC', 'CISC'],
            ],
          },
        },
      ],
    },
    pit([
      T('字段编码时每个字段都要留一个「空操作」编码，所以是 log₂(n + 1)。', 'Each field reserves a no-op code: log₂(n + 1).'),
      T('取指微程序是所有机器指令公用的。', 'The fetch microprogram is shared.'),
    ]),
  ],
};
const MW_SPEC = {
  presets: [
    { label: T('4 组互斥命令，512 字控存，3 个条件', '4 groups, 512 words, 3 conditions'), set: { groups: [3, 7, 5, 12], words: 512, conds: 3 } },
    { label: T('6 组，1K 字，7 个条件', '6 groups, 1K words, 7 conditions'), set: { groups: [2, 4, 6, 8, 15, 3], words: 1024, conds: 7 } },
  ],
  groups: [{ legend: T('微指令', 'Microinstruction'), fields: [
    { name: 'groups', label: T('各互斥组的微命令数', 'Commands per exclusive group'), type: 'list', min: 1, max: 64, maxLen: 8, wide: true },
    { name: 'words', label: T('控制存储器字数', 'Control store words'), type: 'int', min: 2, max: 65536 },
    { name: 'conds', label: T('转移条件个数', 'Branch conditions'), type: 'int', min: 0, max: 16 },
  ] }],
  note: T('水平型微指令，控制字段用字段直接编码，后继地址用断定法（下地址字段）。', 'Horizontal format, field-encoded control, next-address field.'),
};
const MW_ERR = { groups: T('互斥组 1～8 个', 'Give 1–8 groups'), words: T('控存字数至少 2', 'At least 2 words'), conds: T('条件 0～16 个', '0–16 conditions') };
const GT = ['blue', 'violet', 'teal', 'amber', 'orange', 'rose', 'slate', 'green'];
// 画法：每个微命令先是一个独立的小方块（直接编码时就是一位）。一步一步把一组互斥的命令
// 「收」进一个编码字段，最后把直接编码和字段编码的字长按同一比例画出来对比。
const LET = 'ABCDEFGH';
const mwRows = (sim) => sim.fields.length + (sim.conds ? 1 : 0) + 1;
function mwBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const ng = sim.fields.length;
  const RY = (i) => 140 + i * 46;
  const FX = 600;
  const FB = 22; // 字段里每一位的宽度
  const chips = (n, tag, tone, folded, cur) => {
    const show = Math.min(n, 16);
    let h = '';
    for (let j = 0; j < show; j++) {
      const lab = j === 15 && n > 16 ? `+${n - 15}` : `${tag}${j + 1}`;
      h += `<g transform="translate(${j * 28} 0)">${cell(26, 26, lab, { tone: folded ? tone : '', size: 9, cls: cur ? 'hot' : folded ? '' : 'dim' })}</g>`;
    }
    return h;
  };
  sim.fields.forEach((f, i) => {
    const folded = k >= i;
    let h = txt(-12, 18, z ? `互斥组 ${i + 1}` : `group ${i + 1}`, 'bt-lab', 'end') + chips(f.g, LET[i], GT[i % 8], folded, k === i);
    if (folded) {
      h += arrow(Math.min(f.g, 16) * 28 + 6, 13, FX - 110 - 6, 13, k === i ? 'acc' : '');
      h += `<g transform="translate(${FX - 110} -2)">${cell(f.bits * FB, 30, `${f.bits} ${z ? '位' : 'b'}`, { tone: GT[i % 8], size: 12, cls: k === i ? 'hot' : '' })}</g>`;
      h += txt(FX - 110 + f.bits * FB + 8, 18, z ? `${f.g} 个命令 + 1 个「不操作」` : `${f.g} + no-op`, 'bt-idx', 'start');
    }
    items.push({ k: `g${i}`, x: 110, y: RY(i), html: h });
  });
  let r = ng;
  if (sim.conds) {
    const on = k >= ng;
    let h = txt(-12, 18, z ? '转移条件' : 'conditions', 'bt-lab', 'end') + chips(sim.conds, 'T', 'green', on, k === ng);
    if (on) h += arrow(Math.min(sim.conds, 16) * 28 + 6, 13, FX - 116, 13, k === ng ? 'acc' : '') + `<g transform="translate(${FX - 110} -2)">${cell(sim.condBits * FB, 30, `${sim.condBits} ${z ? '位' : 'b'}`, { tone: 'green', size: 12, cls: k === ng ? 'hot' : '' })}</g>`;
    items.push({ k: 'cond', x: 110, y: RY(r), html: h });
    r++;
  }
  {
    const on = k >= ng + 1;
    let h = txt(-12, 18, z ? '下地址' : 'next address', 'bt-lab', 'end') + txt(0, 18, z ? `控存 ${sim.words} 个字，要能指到任何一个` : `${sim.words} words in the control store`, on ? 'bt-cap' : 'bt-idx', 'start');
    if (on) h += `<g transform="translate(${FX - 110} -2)">${cell(sim.addrBits * FB, 30, `${sim.addrBits} ${z ? '位' : 'b'}`, { tone: 'teal', size: 12, cls: k === ng + 1 ? 'hot' : '' })}</g>`;
    items.push({ k: 'addr', x: 110, y: RY(r), html: h });
    r++;
  }
  // 两种编码的字长，同一比例
  const Y = RY(r) + 20;
  const BW = Math.min(14, 620 / sim.directTotal);
  if (k < 0) items.push({ k: 'direct0', x: 110, y: Y, html: txt(0, 0, z ? `直接编码：每个微命令占一位，控制字段要 ${sim.direct} 位` : `Direct: one bit per command, ${sim.direct} bits`, 'bt-cap', 'start') });
  if (k >= ng + 2) {
    const bar = (y, segs, lab) => {
      let h = txt(-12, 17, lab, 'bt-lab', 'end');
      let x = 0;
      for (const [n, tone] of segs) {
        if (!n) continue;
        h += `<g transform="translate(${x} 0)">${cell(n * BW - 2, 26, n * BW > 26 ? String(n) : '', { tone, size: 11 })}</g>`;
        x += n * BW;
      }
      return { html: h + txt(x + 10, 17, `${segs.reduce((a, s) => a + s[0], 0)} ${z ? '位' : 'bits'}`, 'bt-formula cur', 'start') };
    };
    const d = bar(0, [[sim.direct, 'slate'], [sim.condBits, 'green'], [sim.addrBits, 'teal']], z ? '直接编码' : 'direct');
    const e = bar(0, [...sim.fields.map((f, i) => [f.bits, GT[i % 8]]), [sim.condBits, 'green'], [sim.addrBits, 'teal']], z ? '字段编码' : 'field-encoded');
    items.push({ k: 'cmpd', x: 110, y: Y, html: d.html });
    items.push({ k: 'cmpe', x: 110, y: Y + 40, html: e.html });
  }
  return items;
}
function buildMw(p, kit, ERR) {
  const sim = microword(p);
  const lesson = shell('microword', kit, ERR, sim, {
    where: W,
    tag: T('微指令', 'μ'),
    name: T('控制器与微指令格式', 'Control unit and microinstructions'),
    full: T('硬布线与微程序 · 微命令的相容与互斥 · 字段直接编码 · 下地址字段', 'Hardwired vs microprogrammed · compatible and exclusive commands · field encoding · next address'),
    title: T(`${sim.ok ? sim.total : '?'} 位微指令`, `${sim.ok ? sim.total : '?'}-bit microinstruction`),
    legend: [['green', T('顺序控制字段', 'Sequencing fields')]],
    principle: MW_PRINCIPLE,
    desc: T('微程序控制器把每个节拍要发出的控制信号存成一条微指令。这节课按字段直接编码一段一段排出微指令：每个互斥组占几位、条件测试和下地址字段占几位，最后和直接编码比一比省了多少。', 'Lay out a horizontal microinstruction field by field and compare with direct encoding.'),
    rect: sim.ok ? [10, 100, 860, 140 + mwRows(sim) * 46 + 110] : [10, 100, 860, 420],
  });
  if (!sim.ok) return lesson;
  const ng = sim.fields.length;
  const list = sim.fields.map((f, i) => ({ title: T(`第 ${i + 1} 组：${f.bits} 位`, `Group ${i + 1}: ${f.bits} bits`), desc: `⌈log₂(${f.g} + 1)⌉ = ${f.bits}`, detail: T(`这一组有 ${f.g} 个互斥的微命令，再加一个「不发命令」的编码，共 ${f.g + 1} 种，需要 ${f.bits} 位。`, `${f.g} commands + 1 no-op = ${f.g + 1} codes, ${f.bits} bits.`), ref: 'encode', st: { k: i }, row: { color: GT[i % 8], what: T(`组 ${i + 1}`, `G${i + 1}`), result: String(f.bits), tone: 'info' } }));
  list.push({ title: T(`条件测试字段 ${sim.condBits} 位`, `Condition field: ${sim.condBits}`), desc: sim.conds ? `⌈log₂(${sim.conds} + 1)⌉` : T('没有条件', 'none'), detail: sim.conds ? T(`${sim.conds} 个转移条件，加上「不转移」，要 ${sim.condBits} 位。`, `${sim.conds} conditions + none: ${sim.condBits} bits.`) : T('没有转移条件，不需要这个字段。', 'No conditions.'), ref: 'next', st: { k: ng }, row: { color: 'green', what: T('条件', 'Cond'), result: String(sim.condBits), tone: 'info' } });
  list.push({ title: T(`下地址字段 ${sim.addrBits} 位`, `Next-address field: ${sim.addrBits}`), desc: `⌈log₂${sim.words}⌉ = ${sim.addrBits}`, detail: T(`控存有 ${sim.words} 个字，下地址要能指到其中任何一个：${sim.addrBits} 位。`, `${sim.words} words need ${sim.addrBits} address bits.`), ref: 'next', st: { k: ng + 1 }, row: { color: 'green', what: T('下地址', 'Next'), result: String(sim.addrBits), tone: 'info' } });
  list.push({ title: T(`字长 ${sim.total} 位`, `${sim.total} bits`), desc: T(`直接编码要 ${sim.directTotal} 位`, `Direct: ${sim.directTotal}`), detail: T(`${sim.ctrl} + ${sim.condBits} + ${sim.addrBits} = ${sim.total} 位。如果每个微命令占一位（直接编码），控制字段要 ${sim.direct} 位，字长 ${sim.directTotal} 位。`, `Total ${sim.total}; direct encoding would need ${sim.directTotal}.`), ref: 'encode', st: { k: ng + 2 }, row: { color: 'blue', what: T('字长', 'Total'), result: String(sim.total), tone: 'ok' } });
  return finish(lesson, list, (st, z) => mwBoard(sim, st, z), T(`${sim.total} 位`, `${sim.total} bits`), T('把某一组的命令数改成 7 或 8，看位数在哪里跳变。', 'Change a group from 7 to 8 commands and watch the field grow.'));
}
export const makeMicro = make('microword', MW_SPEC, MW_ERR, buildMw);

// ═════════════════════════ 流水线性能 ═════════════════════════

const PP_PRINCIPLE = {
  sections: [
    {
      id: 'clock',
      title: T('流水线的时钟周期', 'Pipeline clock'),
      blocks: [
        { p: T('把一条指令的执行分成 k 段，每段一个时钟周期。各段的时间不一样时，时钟周期要按**最慢的一段**来定，再加上流水段寄存器（锁存器）的延迟。', 'Split execution into k stages; the clock must fit the slowest stage plus the latch delay.') },
        { formula: 'Δt = max(t₁, …, t_k) + t_latch' },
      ],
    },
    {
      id: 'perf',
      title: T('三个指标', 'Three measures'),
      blocks: [
        { formula: T('n 条指令的总时间 T = (k + n − 1) × Δt', 'T = (k + n − 1)Δt') },
        { list: [
          T('**吞吐率** TP = n ÷ T，n 很大时趋近 1 ÷ Δt。', '**Throughput** TP = n / T → 1/Δt.'),
          T('**加速比** S = 不用流水线的时间 ÷ 用流水线的时间；各段相等时 n → ∞，S → k。', '**Speedup** S = serial / pipelined → k.'),
          T('**效率** E = n 条指令真正占用的时空区 ÷ k 段在 T 内的总时空区。', '**Efficiency** E = busy area / total area.'),
        ] },
        { tip: T('时空图里，开头的 k − 1 拍是「装入」，结尾的 k − 1 拍是「排空」，这两段流水线没有满载。', 'The first and last k − 1 cycles are fill and drain.') },
      ],
    },
    {
      id: 'hazard',
      title: T('影响流水线的因素', 'What breaks the flow'),
      blocks: [
        { table: { head: [T('冒险', 'Hazard'), T('原因', 'Cause'), T('解决', 'Fix')], rows: [
          [T('结构冒险', 'Structural'), T('争用同一个部件', 'resource conflict'), T('指令、数据存储器分开；阻塞', 'separate memories; stall')],
          [T('数据冒险', 'Data'), T('后一条要用前一条还没写回的结果', 'operand not yet written'), T('阻塞、转发（旁路）、编译调度', 'stall, forwarding, scheduling')],
          [T('控制冒险', 'Control'), T('转移指令改变了取指方向', 'branches'), T('阻塞、分支预测、延迟转移', 'stall, prediction, delay slots')],
        ] } },
        { p: T('**超标量**：每个时钟周期发射多条指令；**超流水**：把段分得更细、时钟更快；**超长指令字**：编译器把多条能并行的操作合成一条长指令。', '**Superscalar**: several issues per cycle; **superpipelining**: more, shorter stages; **VLIW**: the compiler bundles operations.') },
      ],
    },
    {
      id: 'multi',
      title: T('多处理器与并行', 'Multiprocessors and parallelism'),
      blocks: [
        {
          table: {
            head: [T('弗林分类', 'Flynn class'), T('意思', 'Meaning'), T('例子', 'Examples')],
            rows: [
              ['SISD', T('单指令流单数据流', 'single instruction, single data'), T('传统单处理器（可以有流水线）', 'a classic uniprocessor')],
              ['SIMD', T('单指令流多数据流：一条指令同时处理多个数据', 'one instruction, many data'), T('向量处理器、GPU、x86 的 SSE / AVX 指令', 'vector units, GPUs, SSE/AVX')],
              ['MISD', T('多指令流单数据流', 'many instructions, one data'), T('实际上没有', 'none in practice')],
              ['MIMD', T('多指令流多数据流', 'many instructions, many data'), T('多处理器、多核、多计算机', 'multiprocessors, multicores, clusters')],
            ],
          },
        },
        { list: [
          T('**多处理器**（共享存储）：多个 CPU 共享同一个主存，用同一个地址空间通信；**多计算机**（消息传递）：各有自己的存储器，靠网络发消息。', '**Multiprocessors** share memory; **multicomputers** pass messages.'),
          T('**多核**：一个芯片上集成多个处理器核，各有自己的 L1（常常还有 L2）Cache，共享 L3 和主存；要用 Cache 一致性协议保证各核看到的数据一致。', '**Multicore**: several cores on one chip with private L1 (and often L2) and shared L3; coherence protocols keep caches consistent.'),
          T('**硬件多线程**：一个核里复制多套寄存器和 PC，几个线程交替或同时使用功能部件，一个线程等访存时让别的线程用。细粒度（每个周期换线程）、粗粒度（遇到长等待才换）、同时多线程 SMT（一个周期里同时发射多个线程的指令，如超线程）。', '**Hardware multithreading** keeps several register sets in one core: fine-grained, coarse-grained, or simultaneous (SMT, e.g. Hyper-Threading).'),
        ] },
      ],
    },
    pit([
      T('Δt 要加锁存器延迟；不用流水线时没有锁存器。', 'Add latch delay to Δt only for the pipeline.'),
      T('k 段流水线完成第一条指令要 k 拍，以后每拍完成一条。', 'The first result after k cycles, then one per cycle.'),
    ]),
  ],
};
const PP_SPEC = {
  presets: [
    { label: T('四段不等长，锁存 10', 'Four unequal stages, latch 10'), set: { stages: [60, 100, 80, 70], latch: 10, n: 5 } },
    { label: T('五段等长', 'Five equal stages'), set: { stages: [100, 100, 100, 100, 100], latch: 0, n: 10 } },
    { label: T('指令很多', 'Many instructions'), set: { stages: [50, 50, 80, 50, 40], latch: 5, n: 1000 } },
  ],
  groups: [{ legend: T('流水线', 'Pipeline'), fields: [
    { name: 'stages', label: T('各段时间（ns）', 'Stage times (ns)'), type: 'list', min: 1, max: 1000, maxLen: 8, wide: true },
    { name: 'latch', label: T('锁存器延迟（ns）', 'Latch delay (ns)'), type: 'int', min: 0, max: 200 },
    { name: 'n', label: T('指令条数 n', 'Instructions n'), type: 'int', min: 1, max: 10000 },
  ] }],
  note: T('不考虑冒险，每拍流入一条指令。不用流水线时一条指令的时间 = 各段时间之和。', 'No hazards; one instruction per cycle. Unpipelined time = sum of the stages.'),
};
const PP_ERR = { stages: T('要 2～8 段，每段时间大于 0', 'Give 2–8 positive stage times'), latch: T('锁存器延迟不能为负', 'Latch must be non-negative'), n: T('n 在 1～10000', 'n in 1–10000') };
// 画法：每一段都被「拉长」到同一个时钟周期 Δt，彩色是真正在干活的时间，灰色是空等，深色细条是锁存器。
// 时空图按真实时间画，于是效率就是彩色面积占整块面积的比例，一眼能看出来。
function ppSlot(t, sim, sc, j, label) {
  const busy = t * sc;
  const latch = sim.latch * sc;
  const idle = (sim.clock - sim.latch - t) * sc;
  let h = cell(Math.max(busy - 1, 2), 26, busy > 30 ? label : '', { tone: GT[j % 8], size: 10 });
  if (idle > 0.5) h += `<g transform="translate(${busy} 0)">${cell(idle - 1, 26, idle > 26 ? (label ? '' : '') : '', { cls: 'pp-idle' })}</g>`;
  if (latch > 0.5) h += `<g transform="translate(${busy + idle} 0)">${cell(Math.max(latch - 1, 1.5), 26, '', { tone: 'slate' })}</g>`;
  return h;
}
function ppBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  // 第一行：每一段被拉长到 Δt
  const sc = Math.min(2.2, 620 / (sim.k * sim.clock));
  let h = txt(-12, 18, z ? '每一段' : 'stages', 'bt-lab', 'end');
  sim.stages.forEach((t, j) => {
    const x = j * sim.clock * sc;
    h += `<g transform="translate(${x} 0)">${k >= 0 ? ppSlot(t, sim, sc, j, `S${j + 1} ${t}`) : cell(t * sc - 1, 26, `S${j + 1} ${t}`, { tone: GT[j % 8], size: 10 })}</g>`;
    if (k >= 0 && t < sim.slow) h += txt(x + (t + (sim.clock - sim.latch - t) / 2) * sc, 44, z ? `空 ${sim.clock - sim.latch - t}` : `idle ${sim.clock - sim.latch - t}`, 'bt-idx');
    if (t === sim.slow) h += txt(x + (t * sc) / 2, -8, z ? '最慢' : 'slowest', 'cw-lab bad');
  });
  if (k >= 0) h += txt(0, 70, `Δt = ${sim.slow} + ${sim.latch} = ${sim.clock} ns`, k === 0 ? 'bt-formula cur' : 'bt-formula', 'start');
  items.push({ k: 'stages', x: 150, y: 130, html: h });
  // 时空图，按真实时间
  if (k >= 1) {
    const rows = Math.min(sim.n, 6);
    const cols = sim.k + rows - 1;
    const sc2 = Math.min(2.2, 600 / ((cols + (sim.n > rows ? 1 : 0)) * sim.clock));
    const cw = sim.clock * sc2;
    let g = '';
    for (let c = 0; c <= cols; c++) g += line(c * cw, -6, c * cw, rows * 32, 'pp-grid') + txt(c * cw, -12, String(c * sim.clock), 'bt-idx');
    for (let i = 0; i < rows; i++) {
      g += txt(-12, i * 32 + 18, `I${i + 1}`, 'bt-idx', 'end');
      sim.stages.forEach((t, j) => (g += `<g transform="translate(${(i + j) * cw} ${i * 32})">${ppSlot(t, sim, sc2, j, `S${j + 1}`)}</g>`));
    }
    if (sim.n > rows) g += txt(cols * cw + 10, rows * 32 - 10, z ? `… 共 ${sim.n} 条` : `… ${sim.n} in all`, 'bt-cap', 'start');
    g += txt(0, rows * 32 + 28, `T = (${sim.k} + ${sim.n} − 1) × ${sim.clock} = ${sim.total} ns`, k === 1 ? 'bt-formula cur' : 'bt-formula', 'start');
    items.push({ k: 'st', x: 150, y: 260, html: g });
  }
  const Y = 260 + Math.min(sim.n, 6) * 32 + 70;
  const lines = [
    [2, z ? `吞吐率 TP = ${sim.n} ÷ ${sim.total} ns ≈ ${r2(sim.tp * 1000)} 条/μs` : `TP = ${sim.n} / ${sim.total} ns ≈ ${r2(sim.tp * 1000)} per μs`],
    [3, z ? `加速比 S = ${sim.serial} ÷ ${sim.total} ≈ ${r2(sim.speedup)}（n → ∞ 时 → ${r2(sim.limit)}）` : `Speedup ≈ ${r2(sim.speedup)} (limit ${r2(sim.limit)})`],
    [4, z ? `效率 E = 彩色面积 ÷ 整块面积 = ${sim.serial} ÷ (${sim.k} × ${sim.total}) ≈ ${r2(sim.eff * 100)}%` : `Efficiency = coloured area / whole area ≈ ${r2(sim.eff * 100)}%`],
  ];
  lines.forEach(([at, t], i) => k >= at && items.push({ k: `m${at}`, x: 150, y: Y + i * 28, html: txt(0, 0, t, k === at ? 'bt-formula cur' : 'bt-formula', 'start') }));
  return items;
}
function buildPp(p, kit, ERR) {
  const sim = pipePerf(p);
  const lesson = shell('pipe-perf', kit, ERR, sim, {
    where: W,
    tag: T('性能', 'Perf'),
    name: T('流水线的性能指标', 'Pipeline performance'),
    full: T('时钟周期 · 时空图 · 吞吐率 · 加速比 · 效率 · 三种冒险', 'Clock · space-time diagram · throughput · speedup · efficiency · hazards'),
    title: T(`${sim.ok ? sim.k : '?'} 段，${p.n} 条指令`, `${sim.ok ? sim.k : '?'} stages, ${p.n} instructions`),
    legend: [['blue', T('这一段在干活', 'Stage busy')], ['slate', T('锁存器', 'Latch')]],
    principle: PP_PRINCIPLE,
    desc: T('流水线让多条指令重叠执行。这节课先由最慢的一段定出时钟周期，再画时空图算出总时间，最后算吞吐率、加速比和效率。', 'The slowest stage fixes the clock; the space-time diagram gives the total time; then throughput, speedup and efficiency.'),
    rect: [20, 90, 820, 260 + 6 * 32 + 70 + 90],
  });
  if (!sim.ok) return lesson;
  const list = [
    { title: T(`时钟周期 ${sim.clock} ns`, `Clock ${sim.clock} ns`), desc: `${sim.slow} + ${sim.latch}`, detail: T(`最慢的一段 ${sim.slow} ns，加上锁存器 ${sim.latch} ns，Δt = ${sim.clock} ns。其他段在一拍里会有空闲。`, `Slowest ${sim.slow} + latch ${sim.latch} = ${sim.clock} ns.`), ref: 'clock', st: { k: 0 }, row: { color: 'rose', what: 'Δt', result: `${sim.clock}`, tone: 'info' } },
    { title: T(`总时间 ${sim.total} ns`, `Total ${sim.total} ns`), desc: `(${sim.k} + ${sim.n} − 1) × ${sim.clock}`, detail: T(`第一条指令要 ${sim.k} 拍走完，之后每拍完成一条，一共 ${sim.k} + ${sim.n} − 1 = ${sim.k + sim.n - 1} 拍。`, `${sim.k + sim.n - 1} cycles in all.`), ref: 'perf', st: { k: 1 }, row: { color: 'blue', what: 'T', result: `${sim.total}`, tone: 'info' } },
    { title: T('吞吐率', 'Throughput'), desc: T(`≈ ${r2(sim.tp * 1000)} 条/μs`, `≈ ${r2(sim.tp * 1000)} per μs`), detail: T(`TP = n ÷ T = ${sim.n} ÷ ${sim.total} ns。n 很大时接近 1 ÷ Δt = ${r2(1000 / sim.clock)} 条/μs。`, `TP = ${sim.n} / ${sim.total} ns; limit 1/Δt.`), ref: 'perf', st: { k: 2 }, row: { color: 'teal', what: 'TP', result: r2(sim.tp * 1000) + '/μs', tone: 'info' } },
    { title: T(`加速比 ${r2(sim.speedup)}`, `Speedup ${r2(sim.speedup)}`), desc: T(`不用流水线要 ${sim.serial} ns`, `Serial ${sim.serial} ns`), detail: T(`不用流水线：每条 ${sim.seq} ns，共 ${sim.n} × ${sim.seq} = ${sim.serial} ns。S = ${sim.serial} ÷ ${sim.total} ≈ ${r2(sim.speedup)}。n → ∞ 时 S → ${sim.seq} ÷ ${sim.clock} ≈ ${r2(sim.limit)}${sim.limit < sim.k ? `，达不到段数 ${sim.k}，因为各段不等长或有锁存器延迟` : ''}。`, `S ≈ ${r2(sim.speedup)}, limit ${r2(sim.limit)}.`), ref: 'perf', st: { k: 3 }, row: { color: 'amber', what: 'S', result: String(r2(sim.speedup)), tone: 'info' } },
    { title: T(`效率 ${r2(sim.eff * 100)}%`, `Efficiency ${r2(sim.eff * 100)}%`), desc: T('真正在干活的比例', 'Busy fraction'), detail: T(`${sim.n} 条指令真正占用的时空区是 ${sim.n} × ${sim.seq} = ${sim.serial}，${sim.k} 段在 ${sim.total} ns 内的总时空区是 ${sim.k} × ${sim.total}，E ≈ ${r2(sim.eff * 100)}%。`, `E = ${sim.serial} / (${sim.k} × ${sim.total}).`), ref: 'perf', st: { k: 4 }, row: { color: 'green', what: 'E', result: `${r2(sim.eff * 100)}%`, tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => ppBoard(sim, st, z), T(`加速比 ${r2(sim.speedup)}`, `Speedup ${r2(sim.speedup)}`), T('把 n 改到 1000，看加速比和效率趋近多少。', 'Set n to 1000 and watch the limits.'));
}
export const makePipePerf = make('pipe-perf', PP_SPEC, PP_ERR, buildPp);

// ═════════════════════════ 控制冒险 ═════════════════════════

const BR_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么会有控制冒险', 'Why control hazards happen'),
      blocks: [
        { p: T('转移指令要到某一段（比如 EX 段末尾）才知道转不转、转到哪。在这之前，流水线已经按顺序取进了后面的指令。如果最后真的转移了，这些指令就取错了。', 'A branch resolves late; by then the following instructions are already in the pipeline.') },
        { formula: T('转移在第 r 段末尾确定 → 最多损失 r − 1 个时钟周期', 'resolved at the end of stage r → up to r − 1 lost cycles') },
      ],
    },
    {
      id: 'fix',
      title: T('处理办法', 'Remedies'),
      blocks: [
        { table: { head: [T('办法', 'Method'), T('做法', 'How'), T('代价', 'Cost')], rows: [
          [T('阻塞（冻结）', 'Stall'), T('取到转移指令后停止取指，等确定了再取', 'stop fetching until resolved'), T('每条转移固定损失 r − 1 拍', 'always r − 1')],
          [T('预测不转移', 'Predict not taken'), T('先按顺序取；真转移了就把取错的指令清掉', 'keep fetching; flush on taken'), T('不转移时没有损失，转移时损失 r − 1 拍', 'r − 1 only if taken')],
          [T('延迟转移', 'Delayed branch'), T('编译器在转移后面放一条无论如何都要执行的指令', 'fill the delay slot'), T('要能找到合适的指令', 'needs a useful instruction')],
          [T('动态预测', 'Dynamic prediction'), T('用转移历史表（如 2 位饱和计数器）预测', 'branch history, 2-bit counters'), T('预测错了才损失', 'only on mispredict')],
        ] } },
        { tip: T('把转移判断提前（比如提到 ID 段）也能减少损失。', 'Resolving earlier (e.g. in ID) reduces the penalty.') },
      ],
    },
    pit([
      T('被清除的指令没有写回任何结果，就像没执行过。', 'Flushed instructions write nothing back.'),
      T('预测不转移时，真转移的损失和阻塞一样。', 'A taken branch under predict-not-taken costs the same as a stall.'),
    ]),
  ],
};
const BR_SPEC = {
  presets: [
    { label: T('阻塞，在 EX 段确定', 'Stall, resolved in EX'), set: { n: 6, b: 2, taken: true, r: 3, strategy: 'stall' } },
    { label: T('预测不转移，实际转了', 'Predict not taken, taken'), set: { n: 6, b: 2, taken: true, r: 3, strategy: 'predict' } },
    { label: T('预测不转移，实际没转', 'Predict not taken, not taken'), set: { n: 6, b: 2, taken: false, r: 3, strategy: 'predict' } },
  ],
  groups: [{ legend: T('程序和流水线', 'Program and pipeline'), fields: [
    { name: 'n', label: T('一共执行几条指令', 'Instructions executed'), type: 'int', min: 3, max: 9 },
    { name: 'b', label: T('第几条是转移指令', 'Branch position'), type: 'int', min: 1, max: 8 },
    { name: 'taken', label: T('实际发生转移', 'Branch is taken'), type: 'check' },
    { name: 'r', label: T('转移在哪一段末尾确定', 'Resolved at the end of'), type: 'select', options: [[2, 'ID'], [3, 'EX'], [4, 'MEM']] },
    { name: 'strategy', label: T('处理办法', 'Strategy'), type: 'select', options: [['stall', T('阻塞', 'stall')], ['predict', T('预测不转移', 'predict not taken')]], wide: true },
  ] }],
  note: T('五段流水线 IF ID EX MEM WB。转移成功时，转移后面的指令记作 T1、T2…（目标处的指令）。', 'Five stages. When taken, the following instructions are T1, T2… at the target.'),
};
const BR_ERR = { n: T('指令 3～9 条', '3–9 instructions'), b: T('转移指令不能是最后一条', 'The branch cannot be last'), r: T('r 是 2、3、4', 'r is 2, 3 or 4') };
function brBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const CW = Math.min(46, 620 / sim.total);
  const X0 = 150;
  const Y0 = 140;
  let head = '';
  for (let c = 1; c <= sim.total; c++) head += txt((c - 0.5) * CW, 0, String(c), 'bt-idx');
  items.push({ k: 'head', x: X0, y: Y0 - 14, html: head });
  sim.rows.forEach((r, i) => {
    const vis = k >= 3 || (k >= 0 && r.start <= sim.b) || (k >= 2 && r.flushed);
    if (!vis) return;
    let h = txt(-12, 21, r.label, r.branch ? 'bt-lab' : 'bt-idx', 'end');
    sim.ST.forEach((s, j) => {
      const c = r.start + j;
      if (r.flushed && c > r.flushed) return;
      h += `<g transform="translate(${(c - 1) * CW} 0)">${cell(CW - 3, 30, s, { tone: r.flushed ? '' : STONE[s], size: 10, cls: r.flushed ? 'dim' : r.branch && j === sim.r - 1 && k >= 1 ? 'hot' : '' })}</g>`;
    });
    if (r.flushed) h += txt(r.flushed * CW + 6, 20, z ? '× 清除' : '× flushed', 'ar-note on', 'start');
    items.push({ k: `r${i}`, x: X0, y: Y0 + i * 36, html: h });
  });
  if (k >= 1) items.push({ k: 'res', x: X0, y: Y0, html: line(sim.resolved * CW - 1, -6, sim.resolved * CW - 1, sim.rows.length * 36, 'br-mark') + txt(sim.resolved * CW + 4, sim.rows.length * 36 + 14, z ? `第 ${sim.resolved} 拍末尾确定` : `resolved at ${sim.resolved}`, 'bt-cap', 'start') });
  if (k >= 4) items.push({ k: 'sum', x: X0, y: Y0 + sim.rows.length * 36 + 50, html: txt(0, 0, z ? `一共 ${sim.total} 拍，没有冒险时 ${sim.ideal} 拍，损失 ${sim.total - sim.ideal} 拍` : `${sim.total} cycles vs ${sim.ideal}; ${sim.total - sim.ideal} lost`, 'bt-formula cur', 'start') });
  return items;
}
function buildBr(p, kit, ERR) {
  const sim = branch({ ...p, r: +p.r, taken: !!p.taken });
  const lesson = shell('branch-hazard', kit, ERR, sim, {
    where: W,
    tag: T('转移', 'Br'),
    name: T('控制冒险与转移处理', 'Control hazards'),
    full: T('转移在第几段确定 · 阻塞 · 预测不转移 · 清除 · 延迟转移 · 动态预测', 'Resolution stage · stall · predict not taken · flush · delay slot · dynamic prediction'),
    title: T(p.strategy === 'stall' ? '阻塞' : `预测不转移，${p.taken ? '实际转移' : '实际不转移'}`, p.strategy === 'stall' ? 'Stall' : `Predict not taken, ${p.taken ? 'taken' : 'not taken'}`),
    legend: Object.entries(STONE).map(([s, c]) => [c, s]),
    principle: BR_PRINCIPLE,
    desc: T('转移指令要到流水线的某一段才知道转不转。这节课画出五段流水线的时空图：转移指令进来以后，阻塞策略会停下取指等结果；预测不转移会继续取，猜错了就把取错的指令清掉。最后数一数比理想情况多用了几拍。', 'A space-time diagram shows a branch: stalling waits, predicting keeps fetching and flushes on a wrong guess. Count the lost cycles.'),
    rect: [30, 90, 150 + 640, 140 + 12 * 36 + 60],
  });
  if (!sim.ok) return lesson;
  const flushed = sim.rows.filter((r) => r.flushed);
  const after = sim.rows.find((r) => r.start > sim.b && !r.flushed);
  const list = [
    { title: T(`I${sim.b} 是转移指令`, `I${sim.b} is the branch`), desc: T(`前 ${sim.b} 条按顺序进入`, `${sim.b} instructions enter`), detail: T(`I1～I${sim.b} 每拍进入一条，I${sim.b} 是转移指令。`, `I1–I${sim.b} enter one per cycle.`), ref: 'why', st: { k: 0 }, row: { color: 'blue', what: `I${sim.b}`, result: T('转移', 'branch'), tone: 'info' } },
    { title: T(`第 ${sim.resolved} 拍末尾确定`, `Resolved at cycle ${sim.resolved}`), desc: T(`在 ${sim.ST[sim.r - 1]} 段末尾`, `End of ${sim.ST[sim.r - 1]}`), detail: T(`I${sim.b} 在第 ${sim.b} 拍取指，到 ${sim.ST[sim.r - 1]} 段末尾（第 ${sim.resolved} 拍）才知道${sim.taken ? '要转移' : '不转移'}。中间有 ${sim.r - 1} 拍是「不知道该取哪条」的。`, `Known at the end of cycle ${sim.resolved}; ${sim.r - 1} uncertain cycles.`), ref: 'why', st: { k: 1 }, row: { color: 'amber', what: sim.ST[sim.r - 1], result: String(sim.resolved), tone: 'info' } },
    {
      title: sim.strategy === 'stall' ? T(`阻塞 ${sim.r - 1} 拍`, `Stall ${sim.r - 1} cycles`) : flushed.length ? T(`清除 ${flushed.length} 条`, `Flush ${flushed.length}`) : T('猜对了，没有损失', 'Guessed right'),
      desc: sim.strategy === 'stall' ? T('停止取指', 'No fetching') : flushed.length ? flushed.map((r) => r.label).join(' ') : T('继续顺序执行', 'Keep going'),
      detail: sim.strategy === 'stall' ? T(`阻塞策略：取到转移指令后不再取指，等到第 ${sim.resolved} 拍末尾，第 ${sim.resolved + 1} 拍再取下一条。白白空了 ${sim.r - 1} 拍。`, `Fetch waits until cycle ${sim.resolved + 1}.`) : flushed.length ? T(`预测不转移，于是 ${flushed.map((r) => r.label).join('、')} 已经按顺序取进来了；第 ${sim.resolved} 拍末尾发现要转移，把它们清除，第 ${sim.resolved + 1} 拍从目标处重新取指。`, `${flushed.map((r) => r.label).join(', ')} are flushed.`) : T('预测不转移，实际也没有转移，顺序取进来的指令都是对的，没有损失。', 'The guess was right; no loss.'),
      ref: 'fix',
      st: { k: 2 },
      row: { color: 'rose', what: sim.strategy === 'stall' ? T('阻塞', 'Stall') : T('预测', 'Predict'), result: T(`${sim.pen} 拍`, `${sim.pen}`), tone: sim.pen ? 'warn' : 'ok' },
    },
    { title: T(`${after?.label ?? ''} 在第 ${after?.start} 拍取指`, `${after?.label ?? ''} fetched at ${after?.start}`), desc: T('后面的指令接着流', 'The rest flows on'), detail: T(`剩下的指令从第 ${after?.start} 拍开始每拍进入一条。`, `From cycle ${after?.start} on, one per cycle.`), ref: 'fix', st: { k: 3 }, row: { color: 'teal', what: after?.label ?? '', result: String(after?.start ?? ''), tone: 'info' } },
    { title: T(`共 ${sim.total} 拍`, `${sim.total} cycles`), desc: T(`理想 ${sim.ideal} 拍`, `Ideal ${sim.ideal}`), detail: T(`最后一条指令在第 ${sim.total} 拍写回。没有冒险时 ${sim.n} 条指令要 5 + ${sim.n} − 1 = ${sim.ideal} 拍，损失 ${sim.total - sim.ideal} 拍。`, `${sim.total} vs ${sim.ideal}.`), ref: 'fix', st: { k: 4 }, row: { color: 'green', what: T('总拍数', 'Total'), result: String(sim.total), tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => brBoard(sim, st, z), T(`损失 ${sim.total - sim.ideal} 拍`, `${sim.total - sim.ideal} lost`), T('把确定转移的段改成 ID，看损失变成多少。', 'Resolve in ID and compare.'));
}
export const makeBranch = make('branch-hazard', BR_SPEC, BR_ERR, buildBr);
