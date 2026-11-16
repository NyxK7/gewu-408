// 指令系统的三节课：扩展操作码、寻址方式、x86 的 cmp 与条件转移。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, hex, hexIn, intIn, make, pit, shell } from './kit.js';
import { addressing, cmpJump, opcode, parseMem } from './isa.js';

const W = [['co', 'isa']];

// ═════════════════════════ 扩展操作码 ═════════════════════════

const OP_PRINCIPLE = {
  sections: [
    {
      id: 'format',
      title: T('指令格式', 'Instruction formats'),
      blocks: [
        { p: T('一条指令 = 操作码 + 地址码。按地址码的个数分为零地址、一地址、二地址、三地址指令。指令字长固定时，地址码越多，留给操作码的位就越少。', 'An instruction is an opcode plus address fields. With a fixed length, more addresses leave fewer opcode bits.') },
        {
          table: {
            head: [T('格式', 'Format'), T('例子', 'Example'), T('说明', 'Note')],
            rows: [
              [T('零地址', '0-address'), 'NOP、HALT', T('不需要操作数，或操作数在栈顶（隐含）', 'no operand, or implied stack top')],
              [T('一地址', '1-address'), '(ACC) OP (A1) → ACC', T('另一个操作数隐含在累加器里', 'the other operand is in ACC')],
              [T('二地址', '2-address'), '(A1) OP (A2) → A1', T('结果覆盖第一个操作数', 'the result overwrites A1')],
              [T('三地址', '3-address'), '(A1) OP (A2) → A3', ''],
            ],
          },
        },
      ],
    },
    {
      id: 'expand',
      title: T('扩展操作码', 'Expanding opcodes'),
      blocks: [
        { p: T('定长操作码浪费位数。扩展操作码让操作码的长度随地址数变化：地址少的指令把空出来的地址字段拿来当操作码。', 'Expanding opcodes let instructions with fewer addresses use the freed address fields as opcode bits.') },
        {
          steps: [
            T('三地址指令用最前面的 w 位操作码，取 2^w 个编码中的一部分', 'Three-address instructions take some of the 2^w codes'),
            T('剩下没用的编码作为「扩展标志」，后面接上一个地址字段，变成二地址指令的操作码', 'each unused code becomes a prefix; with one more field it gives two-address opcodes'),
            T('以此类推，直到零地址指令', 'and so on down to zero-address instructions'),
          ],
        },
        { formula: T('下一级可用编码数 = 上一级剩下的编码数 × 2^A', 'codes at the next level = codes left × 2^A') },
        { warn: T('每一级必须至少留一个编码给下一级扩展，否则下一级就没法区分了。短操作码不能是长操作码的前缀。', 'Each level must leave at least one code for the next; no short opcode may be a prefix of a longer one.') },
      ],
    },
    {
      id: 'risc',
      title: T('CISC 与 RISC', 'CISC and RISC'),
      blocks: [
        {
          table: {
            head: ['', T('复杂指令集 CISC', 'CISC'), T('精简指令集 RISC', 'RISC')],
            rows: [
              [T('指令条数', 'Instructions'), T('多，功能复杂', 'many, complex'), T('少，只保留常用的简单指令', 'few, simple and frequent ones')],
              [T('指令长度', 'Length'), T('不固定', 'variable'), T('固定（如 32 位），格式少', 'fixed, few formats')],
              [T('寻址方式', 'Addressing'), T('多', 'many'), T('少', 'few')],
              [T('访存', 'Memory access'), T('很多指令都能访存', 'many instructions'), T('只有取数 / 存数（load / store）指令访存', 'only load / store')],
              [T('寄存器', 'Registers'), T('较少', 'fewer'), T('多，大部分运算在寄存器之间进行', 'many; register-to-register')],
              [T('控制器', 'Control'), T('多用微程序控制', 'mostly microprogrammed'), T('多用硬布线控制', 'mostly hardwired')],
              [T('流水线', 'Pipelining'), T('难', 'hard'), T('容易，大多数指令一个时钟周期完成', 'easy; about one cycle per instruction')],
              [T('例子', 'Examples'), 'x86', 'ARM、MIPS、RISC-V'],
            ],
          },
        },
        { tip: T('「80—20 规律」：程序里 80% 的时间在执行 20% 的简单指令，这是 RISC 的出发点。现代 x86 处理器内部也把复杂指令拆成类似 RISC 的微操作来执行。', 'The 80–20 rule motivated RISC; modern x86 cores also split instructions into RISC-like micro-operations.') },
      ],
    },
    pit([
      T('某一级「最多能有多少条」= 上一级剩下的编码数 × 2^A − 下一级至少要留的扩展标志数。', 'Maximum at a level = available − codes reserved for the next level.'),
      T('算可用编码时一定要乘的是上一级「剩下的」编码数，不是全部。', 'Multiply the leftover codes, not all of them.'),
    ]),
  ],
};
const cnt = (name, label) => ({ name, label, type: 'int', min: -1, max: 1000000 });
const OP_SPEC = {
  presets: [
    { label: T('16 位，4 位地址：15/15/15/16', '16 bits, 4-bit fields: 15/15/15/16'), set: { L: 16, A: 4, c3: 15, c2: 15, c1: 15, c0: 16 } },
    { label: T('三地址只用 8 条', 'Only 8 three-address'), set: { L: 16, A: 4, c3: 8, c2: 100, c1: 0, c0: -1 } },
    { label: T('一地址能有多少条', 'How many one-address?'), set: { L: 16, A: 4, c3: 0, c2: 12, c1: -1, c0: 0 } },
  ],
  groups: [{ legend: T('指令字', 'Instruction word'), fields: [
    { name: 'L', label: T('指令字长', 'Length'), type: 'int', min: 8, max: 32 },
    { name: 'A', label: T('每个地址码的位数', 'Address field bits'), type: 'int', min: 2, max: 8 },
    cnt('c3', T('三地址指令条数', '3-address count')),
    cnt('c2', T('二地址指令条数', '2-address count')),
    cnt('c1', T('一地址指令条数', '1-address count')),
    cnt('c0', T('零地址指令条数', '0-address count')),
  ] }],
  note: T('填 −1 表示「这一级能有多少就要多少」（它必须是最后一级）。0 表示没有这一级。', '−1 means “as many as possible” (must be the last level); 0 skips the level.'),
};
const OP_ERR = { L: T('字长在 8～32', 'Length 8–32'), A: T('三个地址码要比字长短', 'Three fields must fit'), counts: T('至少要有一级指令', 'Give at least one level'), need: T('{k} 地址指令只有 {avail} 个编码可用，要 {want} 条不够（还得给后面留扩展标志）', 'Only {avail} codes for {k}-address, need {want}') };
const bin = (v, w) => v.toString(2).padStart(w, '0');
const group = (s, w0, A) => {
  const out = [s.slice(0, w0)];
  for (let i = w0; i < s.length; i += A) out.push(s.slice(i, i + A));
  return out.join(' ');
};
// 画法：每一级的操作码是一条「编码空间」。用掉的编码是紫色，剩下的编码作为扩展标志（琥珀色），
// 每一个剩下的编码后面再接 A 位，「展开」成下一级的整条编码空间。
const OPX = 300;
const OPW = 520;
const opY = (i) => 140 + i * 112;
function opSpace(lv, sim, i, k, last) {
  const used = lv.used;
  const left = lv.left;
  const ext = !last && left > 0;
  let h = '';
  if (lv.avail <= 64) {
    const w = OPW / lv.avail;
    for (let c = 0; c < lv.avail; c++) {
      const u = c < used;
      h += `<g transform="translate(${c * w} 0)">${cell(Math.max(w - 2, 1.5), 30, w > 22 ? String(c) : '', { tone: u ? 'violet' : ext ? 'amber' : last && k > i ? 'green' : '', size: 10, cls: u ? '' : 'dim-soft' })}</g>`;
    }
  } else {
    const uw = Math.max((used / lv.avail) * OPW, used ? 40 : 0);
    if (used) h += cell(uw - 2, 30, `${used}`, { tone: 'violet', size: 12 });
    if (left) h += `<g transform="translate(${uw} 0)">${cell(OPW - uw - 2, 30, `${left}`, { tone: ext ? 'amber' : last && k > i ? 'green' : '', size: 12, cls: 'dim-soft' })}</g>`;
  }
  return h;
}
function opLeftX(lv) {
  if (lv.avail <= 64) return [OPX + (lv.used * OPW) / lv.avail, OPX + OPW];
  const uw = Math.max((lv.used / lv.avail) * OPW, lv.used ? 40 : 0);
  return [OPX + uw, OPX + OPW];
}
function opBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const w0 = sim.levels[0].w;
  const n = sim.levels.length;
  sim.levels.forEach((lv, i) => {
    if (i > k) return;
    const last = i === n - 1;
    const y = opY(i);
    // 左边：指令格式
    const BW = 170 / sim.L;
    let f = txt(0, -10, z ? `${lv.k} 地址指令` : `${lv.k}-address`, 'bt-lab', 'start');
    f += cell(lv.w * BW - 2, 26, `OP ${lv.w}`, { tone: 'violet', size: 10 });
    for (let j = 0; j < lv.k; j++) f += `<g transform="translate(${(lv.w + j * sim.A) * BW} 0)">${cell(sim.A * BW - 2, 26, `A${j + 1}`, { tone: 'slate', size: 9 })}</g>`;
    items.push({ k: `f${i}`, x: 60, y: y + 2, html: f });
    // 右边：编码空间
    let h = txt(0, -10, i === 0 ? (z ? `操作码 ${lv.w} 位：2^${lv.w} = ${lv.avail} 个编码` : `${lv.w}-bit opcode: ${lv.avail} codes`) : z ? `${sim.levels[i - 1].left} 个扩展标志 × 2^${sim.A} = ${lv.avail} 个编码` : `${sim.levels[i - 1].left} prefixes × 2^${sim.A} = ${lv.avail}`, 'bt-cap', 'start');
    h += opSpace(lv, sim, i, k, last);
    h += txt(0, 48, `${z ? '用掉' : 'used'} ${lv.used}：${group(bin(lv.first, lv.w), w0, sim.A)} ～ ${group(bin(lv.last, lv.w), w0, sim.A)}`, 'bt-idx', 'start');
    if (lv.left) h += txt(OPW, 48, last ? (z ? `剩 ${lv.left} 个没用` : `${lv.left} unused`) : z ? `剩 ${lv.left} 个 → 扩展标志` : `${lv.left} left → prefixes`, last ? 'bt-idx' : 'cw-lab cw-w', 'end');
    items.push({ k: `s${i}`, x: OPX, y, html: h, cls: i === k ? 'is-cur' : '' });
    // 展开到下一级
    if (!last && k > i) {
      const [a, b] = opLeftX(lv);
      const ny = opY(i + 1) - 22;
      items.push({ k: `x${i}`, x: 0, y: 0, html: `<path class="op-fan" d="M${a} ${y + 31} L${b} ${y + 31} L${OPX + OPW} ${ny} L${OPX} ${ny} Z"/>` + txt(OPX + OPW + 12, (y + 31 + ny) / 2 + 4, `× 2^${sim.A}`, 'cw-lab cw-w', 'start') });
    }
  });
  if (k >= n) items.push({ k: 'spare', x: OPX, y: opY(n - 1) + 84, html: txt(0, 0, z ? `最后还剩 ${sim.spare} 个编码没用，可以留给以后扩展` : `${sim.spare} codes left for later`, 'bt-formula cur', 'start') });
  return items;
}
function buildOp(p, kit, ERR) {
  const sim = opcode({ L: p.L, A: p.A, counts: [p.c3, p.c2, p.c1, p.c0] });
  const lesson = shell('opcode', kit, ERR, sim, {
    where: W,
    tag: T('操作码', 'Op'),
    name: T('指令格式与扩展操作码', 'Formats and expanding opcodes'),
    full: T('零 / 一 / 二 / 三地址指令 · 扩展操作码 · 扩展标志 · 编码范围', '0–3 address formats · expanding opcodes · prefixes · code ranges'),
    title: T(`${p.L} 位指令，地址码 ${p.A} 位`, `${p.L}-bit instructions, ${p.A}-bit fields`),
    legend: [['violet', T('这一级用掉的编码', 'Codes used')], ['amber', T('留作扩展标志', 'Prefixes')], ['slate', T('地址码', 'Address field')]],
    principle: OP_PRINCIPLE,
    desc: T('指令字长固定，地址码越少，操作码就能越长。这节课从三地址指令开始一级级往下扩展：每一级用掉多少编码、剩下的怎样当作扩展标志、下一级能有多少条，都由程序算出，并写出每一级的二进制编码范围。', 'Starting from three-address instructions, each level uses some codes and passes the rest down as prefixes. The program computes every range.'),
    rect: [20, 90, OPX + OPW + 80, opY(sim.ok ? sim.levels.length - 1 : 3) + 110],
  });
  if (!sim.ok) return lesson;
  const list = sim.levels.map((lv, i) => {
    const prev = sim.levels[i - 1];
    return {
      title: T(`${lv.k} 地址指令：${lv.used} 条`, `${lv.k}-address: ${lv.used}`),
      desc: T(`操作码 ${lv.w} 位，可用 ${lv.avail} 个`, `${lv.w}-bit opcode, ${lv.avail} codes`),
      detail: i === 0
        ? T(`${lv.k} 个地址码占 ${lv.k} × ${sim.A} = ${lv.k * sim.A} 位，操作码 ${sim.L} − ${lv.k * sim.A} = ${lv.w} 位，共 2^${lv.w} = ${lv.avail} 个编码。用掉 ${lv.used} 个（${bin(lv.first, lv.w)}～${bin(lv.last, lv.w)}），剩下 ${lv.left} 个${lv.left ? '留作扩展标志' : ''}。`, `${lv.w}-bit opcode, ${lv.avail} codes; ${lv.used} used, ${lv.left} left.`)
        : T(`上一级剩下 ${prev.left} 个编码，每个后面再接 ${sim.A} 位，可用 ${prev.left} × 2^${sim.A} = ${lv.avail} 个。用掉 ${lv.used} 个，剩下 ${lv.left} 个。`, `${prev.left} × 2^${sim.A} = ${lv.avail} codes; ${lv.used} used, ${lv.left} left.`),
      ref: 'expand',
      st: { k: i },
      row: { color: 'violet', what: T(`${lv.k} 地址`, `${lv.k}-addr`), result: `${lv.used}`, tone: 'info' },
    };
  });
  list.push({ title: T(`还剩 ${sim.spare} 个编码`, `${sim.spare} codes left`), desc: T('可以留着以后扩展', 'Spare for later'), detail: T(`最后一级之后还剩 ${sim.spare} 个编码没有用。题目问「最多还能有多少条」时，就是这一级剩下的数。`, `${sim.spare} codes remain after the last level.`), ref: 'pitfall', st: { k: sim.levels.length }, row: { color: 'green', what: T('剩余', 'Spare'), result: String(sim.spare), tone: 'ok' } });
  return finish(lesson, list, (st, z) => opBoard(sim, st, z), T(`${sim.levels.map((l) => l.used).join(' / ')} 条`, sim.levels.map((l) => l.used).join(' / ')), T('把某一级填成 −1，看它最多能有多少条。', 'Set the last level to −1 to see the maximum.'));
}
export const makeOpcode = make('opcode', OP_SPEC, OP_ERR, buildOp);

// ═════════════════════════ 寻址方式 ═════════════════════════

const AD_PRINCIPLE = {
  sections: [
    {
      id: 'modes',
      title: T('数据寻址方式', 'Data addressing modes'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Mode'), T('有效地址 EA', 'EA'), T('访存次数（取操作数）', 'Memory accesses')],
            rows: [
              [T('立即寻址', 'Immediate'), T('没有，A 就是操作数', 'none; A is the operand'), '0'],
              [T('直接寻址', 'Direct'), 'EA = A', '1'],
              [T('间接寻址', 'Indirect'), 'EA = (A)', '2'],
              [T('寄存器寻址', 'Register'), T('没有，操作数在 R 里', 'none; operand in R'), '0'],
              [T('寄存器间接', 'Register indirect'), 'EA = (R)', '1'],
              [T('相对寻址', 'PC-relative'), 'EA = (PC) + A', '1'],
              [T('基址寻址', 'Base'), 'EA = (BR) + A', '1'],
              [T('变址寻址', 'Indexed'), 'EA = (IX) + A', '1'],
            ],
          },
        },
        { p: T('此外还有**堆栈寻址**：操作数在栈顶，地址由栈指针 SP 隐含给出。', '**Stack addressing**: the operand is at the top of the stack, given by SP.') },
      ],
    },
    {
      id: 'use',
      title: T('各自的用处', 'What each is for'),
      blocks: [
        {
          list: [
            T('**相对寻址**：程序在内存里搬家也不用改转移指令，常用于转移指令。注意 PC 此时已经指向下一条指令。', '**PC-relative**: position-independent branches; PC already points to the next instruction.'),
            T('**基址寻址**：基址寄存器由操作系统设置，面向系统，解决程序的重定位和扩大寻址空间。', '**Base**: set by the OS for relocation.'),
            T('**变址寻址**：变址寄存器由用户改动，面向用户，适合数组、循环（每次 IX 加 1）。', '**Indexed**: changed by the program, for arrays and loops.'),
            T('**间接寻址**：扩大寻址范围，可以实现子程序返回等，但要多访存一次。', '**Indirect**: larger range, one extra access.'),
          ],
        },
        { tip: T('访存次数这里只算「取操作数」，不算取指令。', 'Counts exclude the instruction fetch.') },
      ],
    },
    pit([
      T('相对寻址的 PC 是「取完这条指令以后」的 PC。', 'PC is the value after the fetch.'),
      T('基址寄存器的内容不变、A 可变；变址寄存器的内容可变、A 不变。', 'Base register fixed, A varies; index register varies, A fixed.'),
    ]),
  ],
};
const AD_SPEC = {
  presets: [
    { label: T('一组典型的寄存器和内存', 'A typical setup'), set: { A: 200, R: 300, PC: 100, BR: 300, IX: 100, mem: '200:300 300:400 500:600' } },
    { label: T('数组：变址寻址', 'Array: indexed'), set: { A: 1000, R: 1002, PC: 50, BR: 0, IX: 2, mem: '1000:7 1001:9 1002:4 1003:6' } },
  ],
  groups: [{ legend: T('指令和寄存器', 'Instruction and registers'), fields: [
    { name: 'A', label: T('形式地址 A', 'Address A'), type: 'int', min: 0, max: 9999 },
    { name: 'R', label: T('寄存器 R', 'Register R'), type: 'int', min: 0, max: 9999 },
    { name: 'PC', label: T('PC（已指向下一条）', 'PC (next instruction)'), type: 'int', min: 0, max: 9999 },
    { name: 'BR', label: T('基址寄存器 BR', 'Base BR'), type: 'int', min: 0, max: 9999 },
    { name: 'IX', label: T('变址寄存器 IX', 'Index IX'), type: 'int', min: 0, max: 9999 },
    { name: 'mem', label: T('内存「地址:内容」', 'Memory addr:value'), type: 'text', wide: true, parse: (s) => (parseMem(s) && Object.keys(parseMem(s)).length <= 8 ? s : NaN) },
  ] }],
  note: T('都按十进制。内存最多写 8 个单元，没写的单元读出来是「?」。', 'Decimal. At most 8 memory cells; unlisted cells read as “?”.'),
};
const AD_ERR = { mem: T('内存的格式是「地址:内容」', 'Use addr:value') };
const MODE = {
  imm: [T('立即寻址', 'Immediate'), T('操作数 = A', 'operand = A')],
  dir: [T('直接寻址', 'Direct'), 'EA = A'],
  ind: [T('间接寻址', 'Indirect'), 'EA = (A)'],
  reg: [T('寄存器寻址', 'Register'), T('操作数 = (R)', 'operand = (R)')],
  regind: [T('寄存器间接', 'Register indirect'), 'EA = (R)'],
  rel: [T('相对寻址', 'PC-relative'), 'EA = (PC) + A'],
  base: [T('基址寻址', 'Base'), 'EA = (BR) + A'],
  index: [T('变址寻址', 'Indexed'), 'EA = (IX) + A'],
};
const REG = { reg: 'R', regind: 'R', rel: 'PC', base: 'BR', index: 'IX' };
function adBoard(sim, st, z) {
  const items = [];
  const m = st ? sim.modes[st.k] : null;
  const L = (t) => (z ? t.zh : t.en);
  // 指令
  let ins = txt(0, -12, z ? '指令' : 'Instruction', 'bt-cap', 'start');
  ins += cell(60, 34, 'OP', { tone: 'violet', size: 12 }) + `<g transform="translate(62 0)">${cell(120, 34, m ? L(MODE[m.id][0]) : z ? '寻址方式' : 'mode', { tone: 'amber', size: 12 })}</g><g transform="translate(184 0)">${cell(90, 34, `A = ${sim.A}`, { tone: 'blue', size: 12, cls: m && ['imm', 'dir', 'ind', 'rel', 'base', 'index'].includes(m.id) ? 'hot' : '' })}</g>`;
  items.push({ k: 'ins', x: 60, y: 120, html: ins });
  // 寄存器
  const regs = ['R', 'PC', 'BR', 'IX'];
  let rh = txt(0, -12, z ? '寄存器' : 'Registers', 'bt-cap', 'start');
  regs.forEach((r, i) => (rh += `<g transform="translate(0 ${i * 40})">${cell(50, 32, r, { tone: 'slate', size: 12 })}<g transform="translate(52 0)">${cell(80, 32, String(sim[r]), { size: 13, cls: m && REG[m.id] === r ? 'hot' : '' })}</g></g>`));
  items.push({ k: 'regs', x: 60, y: 210, html: rh });
  // 内存
  const addrs = Object.keys(sim.mem).map(Number);
  if (m && m.ea != null && !addrs.includes(m.ea)) addrs.push(m.ea);
  addrs.sort((a, b) => a - b);
  const MY = (a) => 120 + addrs.indexOf(a) * 38;
  let mh = txt(0, -12, z ? '主存' : 'Memory', 'bt-cap', 'start');
  addrs.forEach((a) => {
    const hitEA = m && m.ea === a;
    const hitMid = m && m.id === 'ind' && m.mid === a;
    mh += `<g transform="translate(0 ${MY(a) - 120})">${txt(-10, 21, String(a), 'bt-idx', 'end')}${cell(90, 32, a in sim.mem ? String(sim.mem[a]) : '?', { size: 13, tone: hitEA ? 'green' : hitMid ? 'amber' : '', cls: hitEA ? 'hot' : '' })}</g>`;
  });
  items.push({ k: 'mem', x: 520, y: 120, html: mh });
  if (m) {
    const arr = [];
    const memL = (a) => [510 - 40, MY(a) + 16];
    if (m.id === 'dir') arr.push([334, 137, ...memL(m.ea)]);
    if (m.id === 'ind') {
      arr.push([334, 137, ...memL(m.mid)]);
      if (m.ea != null) arr.push([614, MY(m.mid) + 16, 614, MY(m.ea) + 16, 'side']);
    }
    if (REG[m.id] && m.id !== 'reg') arr.push([194, 226 + regs.indexOf(REG[m.id]) * 40, ...memL(m.ea)]);
    let h = '';
    for (const [x1, y1, x2, y2, side] of arr) {
      if (side) h += `<path d="M${x1} ${y1} C ${x1 + 44} ${y1}, ${x2 + 44} ${y2}, ${x2 + 14} ${y2}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>` + arrow(x2 + 14, y2, x2 + 2, y2, 'acc');
      else h += arrow(x1, y1, x2, y2, 'acc');
    }
    items.push({ k: `arr${st.k}`, x: 0, y: 0, html: h });
    let f = txt(0, 0, `${L(MODE[m.id][0])}：${typeof MODE[m.id][1] === 'string' ? MODE[m.id][1] : L(MODE[m.id][1])}`, 'bt-lab', 'start');
    const ea = m.id === 'rel' ? `= ${sim.PC} + ${sim.A} = ${m.ea}` : m.id === 'base' ? `= ${sim.BR} + ${sim.A} = ${m.ea}` : m.id === 'index' ? `= ${sim.IX} + ${sim.A} = ${m.ea}` : m.ea != null ? `= ${m.ea}` : '';
    if (ea) f += txt(0, 24, `EA ${ea}`, 'ar-mono', 'start');
    f += txt(0, 50, z ? `操作数 = ${m.val ?? '?'}，取操作数访存 ${m.acc} 次` : `Operand = ${m.val ?? '?'}, ${m.acc} memory access(es)`, 'bt-formula cur', 'start');
    items.push({ k: 'f', x: 60, y: 400, html: f });
  }
  return items;
}
function buildAd(p, kit, ERR) {
  const sim = addressing(p);
  const lesson = shell('addressing', kit, ERR, sim, {
    where: W,
    tag: T('寻址', 'Addr'),
    name: T('寻址方式', 'Addressing modes'),
    full: T('立即 · 直接 · 间接 · 寄存器 · 寄存器间接 · 相对 · 基址 · 变址', 'Immediate · direct · indirect · register · register indirect · relative · base · indexed'),
    title: T(`A = ${p.A}`, `A = ${p.A}`),
    legend: [['green', T('有效地址 EA 指向的单元', 'Cell at EA')], ['amber', T('间接寻址的中间单元', 'Indirect pointer')]],
    principle: AD_PRINCIPLE,
    desc: T('同一个形式地址 A，换一种寻址方式，取到的操作数就完全不一样。这节课把指令、寄存器和主存画在一起，八种寻址方式依次走一遍：有效地址怎么算、箭头指向哪个单元、取操作数要访存几次。', 'One address field A, eight modes: how EA is formed, which cell it points to, and how many memory accesses it takes.'),
    rect: [20, 80, 700, 470],
  });
  if (!sim.ok) return lesson;
  const list = sim.modes.map((m, i) => {
    const name = MODE[m.id][0];
    const how = {
      imm: T(`A 本身就是操作数 ${sim.A}，不访存。`, `A itself, ${sim.A}.`),
      dir: T(`EA = A = ${m.ea}，到主存 ${m.ea} 取出 ${m.val ?? '?'}。`, `EA = ${m.ea}; operand ${m.val ?? '?'}.`),
      ind: T(`先读主存 ${sim.A} 得到 EA = ${m.ea ?? '?'}，再读 ${m.ea ?? '?'} 得到 ${m.val ?? '?'}，访存两次。`, `(A) = ${m.ea ?? '?'}, then the operand ${m.val ?? '?'}.`),
      reg: T(`操作数就在寄存器 R 里：${sim.R}，不访存。`, `Operand in R: ${sim.R}.`),
      regind: T(`R 里存的是地址：EA = ${m.ea}，到主存取出 ${m.val ?? '?'}。`, `EA = (R) = ${m.ea}; operand ${m.val ?? '?'}.`),
      rel: T(`EA = (PC) + A = ${sim.PC} + ${sim.A} = ${m.ea}，取出 ${m.val ?? '?'}。`, `EA = ${sim.PC} + ${sim.A} = ${m.ea}.`),
      base: T(`EA = (BR) + A = ${sim.BR} + ${sim.A} = ${m.ea}，取出 ${m.val ?? '?'}。`, `EA = ${sim.BR} + ${sim.A} = ${m.ea}.`),
      index: T(`EA = (IX) + A = ${sim.IX} + ${sim.A} = ${m.ea}，取出 ${m.val ?? '?'}。`, `EA = ${sim.IX} + ${sim.A} = ${m.ea}.`),
    }[m.id];
    return { title: T(`${name.zh}：操作数 ${m.val ?? '?'}`, `${name.en}: ${m.val ?? '?'}`), desc: T(`访存 ${m.acc} 次`, `${m.acc} access(es)`), detail: how, ref: i >= 5 ? 'use' : 'modes', st: { k: i }, row: { color: m.acc === 2 ? 'amber' : m.acc ? 'blue' : 'green', what: name, result: String(m.val ?? '?'), tone: 'info' } };
  });
  return finish(lesson, list, (st, z) => adBoard(sim, st, z), T('八种寻址方式', 'Eight modes'), T('改一改 BR 或 IX，看基址、变址寻址指向哪里。', 'Change BR or IX and watch the arrows move.'));
}
export const makeAddressing = make('addressing', AD_SPEC, AD_ERR, buildAd);

// ═════════════════════════ cmp 与条件转移 ═════════════════════════

const CJ_PRINCIPLE = {
  sections: [
    {
      id: 'cmp',
      title: T('cmp 做的是减法', 'cmp subtracts'),
      blocks: [
        { p: T('`cmp a, b` 计算 a − b，只设置标志位，不保存结果。减法在加法器里做成 a + (b 取反) + 1。', '`cmp a, b` computes a − b only for the flags, as a + ~b + 1.') },
        {
          table: {
            head: [T('标志', 'Flag'), T('含义', 'Meaning'), T('怎么来', 'How')],
            rows: [
              ['ZF', T('结果为 0', 'zero'), T('结果全 0', 'result all zeros')],
              ['SF', T('结果为负', 'sign'), T('结果的最高位', 'top bit')],
              ['OF', T('有符号溢出', 'signed overflow'), T('最高位进位 ⊕ 次高位进位', 'Cn ⊕ Cn−1')],
              ['CF', T('无符号借位', 'unsigned borrow'), T('减法时：最高位进位 ⊕ 1', 'for subtraction: Cout ⊕ 1')],
            ],
          },
        },
      ],
    },
    {
      id: 'cond',
      title: T('条件转移看哪几个标志', 'Which flags each jump reads'),
      blocks: [
        {
          table: {
            head: [T('指令', 'Jump'), T('条件', 'Condition'), T('比较的是', 'Compares')],
            rows: [
              ['je / jne', 'ZF = 1 / ZF = 0', T('相等', 'equality')],
              ['jg / jge', T('ZF = 0 且 SF = OF / SF = OF', 'ZF = 0 and SF = OF / SF = OF'), T('有符号大于', 'signed >')],
              ['jl / jle', T('SF ≠ OF / ZF = 1 或 SF ≠ OF', 'SF ≠ OF / ZF = 1 or SF ≠ OF'), T('有符号小于', 'signed <')],
              ['ja / jae', T('CF = 0 且 ZF = 0 / CF = 0', 'CF = 0 and ZF = 0 / CF = 0'), T('无符号大于（above）', 'unsigned >')],
              ['jb / jbe', T('CF = 1 / CF = 1 或 ZF = 1', 'CF = 1 / CF = 1 or ZF = 1'), T('无符号小于（below）', 'unsigned <')],
            ],
          },
        },
        { tip: T('为什么有符号比较看 SF = OF？没有溢出时，结果的符号就是 a − b 的符号；溢出时符号反了，所以 SF 和 OF 都要看。', 'Without overflow the sign is right; with overflow it is flipped, hence SF = OF.') },
      ],
    },
    {
      id: 'target',
      title: T('转移目标地址', 'Branch target'),
      blocks: [
        { formula: T('目标地址 = 本条指令地址 + 指令长度 + 偏移量（补码）', 'target = address + length + signed displacement') },
        { p: T('x86 的短转移把 8 位偏移量当成补码，相对于「下一条指令」的地址。比如 F0H = −16。', 'Short jumps use an 8-bit signed displacement relative to the next instruction; F0H = −16.') },
      ],
    },
    pit([
      T('同一组比特，有符号比较和无符号比较的结论可以相反。', 'Signed and unsigned comparisons can disagree.'),
      T('偏移量是相对于下一条指令的地址，不是本条指令。', 'The displacement is relative to the next instruction.'),
    ]),
  ],
};
const CJ_SPEC = {
  presets: [
    { label: T('−1 和 1：有符号小，无符号大', '−1 vs 1'), set: { a: -1, b: 1, n: 8, ip: '4005A0', len: 2, disp: 'F0' } },
    { label: T('相等', 'Equal'), set: { a: 5, b: 5, n: 8, ip: '1000', len: 2, disp: '10' } },
    { label: T('减法溢出', 'Overflow'), set: { a: 100, b: -100, n: 8, ip: '2000', len: 2, disp: '80' } },
  ],
  groups: [
    { legend: 'cmp a, b', fields: [
      { name: 'a', label: 'a', type: 'text', parse: intIn(-32768, 32767) },
      { name: 'b', label: 'b', type: 'text', parse: intIn(-32768, 32767) },
      { name: 'n', label: T('位数', 'Bits'), type: 'select', options: [[4, '4'], [8, '8'], [16, '16']] },
    ] },
    { legend: T('转移指令', 'Jump'), fields: [
      { name: 'ip', label: T('转移指令地址（十六进制）', 'Jump address (hex)'), type: 'text', parse: hexIn },
      { name: 'len', label: T('指令长度（字节）', 'Length (bytes)'), type: 'int', min: 2, max: 6 },
      { name: 'disp', label: T('8 位偏移量（十六进制）', '8-bit displacement (hex)'), type: 'text', parse: (s) => (/^(0x)?[0-9a-fA-F]{1,2}$/.test(String(s).trim()) ? s : NaN) },
    ] },
  ],
  note: T('a、b 按 n 位补码表示，要在 n 位能表示的范围内。', 'a and b are n-bit two’s complement.'),
};
const CJ_ERR = { n: T('位数是 4、8、16', 'Bits: 4, 8 or 16'), range: T('a、b 超出了 n 位补码的范围', 'a or b out of range'), jump: T('转移指令的参数不对', 'Bad jump parameters') };
function cjBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const s = sim.s;
  const X = 170;
  const rows = [
    ['a', s.A, ''],
    [z ? '¬b' : '~b', s.B, ''],
    ['+1', '0'.repeat(s.n - 1) + '1', ''],
    ['a − b', s.R, 'cur'],
  ];
  let h = '';
  rows.forEach(([lab, b, cls], i) => {
    if (i === 3 && k < 0) return;
    h += txt(-14, i * 30 + 20, lab, 'bt-lab', 'end');
    [...b].forEach((c, j) => (h += `<g transform="translate(${j * 26} ${i * 30 + (i === 3 ? 8 : 0)})">${cell(24, 26, c, { size: 13, tone: i === 3 ? 'blue' : '', cls })}</g>`));
  });
  h += `<line x1="-30" y1="${3 * 30 + 3}" x2="${s.n * 26}" y2="${3 * 30 + 3}" class="bl-axis"/>`;
  if (k >= 0) h += txt(s.n * 26 + 16, 3 * 30 + 26, z ? `有符号 ${s.signed}，无符号 ${s.unsigned}` : `signed ${s.signed}, unsigned ${s.unsigned}`, 'bt-cap', 'start');
  items.push({ k: 'sub', x: X, y: 110, html: h });
  if (k >= 1) {
    let f = '';
    ['ZF', 'SF', 'OF', 'CF'].forEach((x, i) => (f += `<g transform="translate(${i * 74} 0)">${cell(68, 32, `${x} = ${s.flags[x]}`, { size: 13, tone: s.flags[x] ? 'amber' : '', cls: 'ok' })}</g>`));
    items.push({ k: 'flags', x: X, y: 260, html: f });
  }
  if (k >= 2) {
    const show = sim.conds.filter((c) => (k === 2 ? c.kind !== 'u' : true));
    const L = (c) => (z ? c.rule : c.rule.replace('且', 'and').replace('或', 'or'));
    const half = Math.ceil(show.length / 2);
    const tbl = (part) => gridTable([z ? '指令' : 'jump', z ? '条件' : 'condition', z ? '转移？' : 'taken?'], part.map((c) => [c.op, L(c), { t: c.take ? (z ? '转' : 'yes') : z ? '不转' : 'no', cls: c.take ? 'ok' : 'dim' }]), { cw: [56, 150, 60] });
    items.push({ k: 'c1', x: X - 100, y: 312, html: tbl(show.slice(0, half)) });
    items.push({ k: 'c2', x: X + 190, y: 312, html: tbl(show.slice(half)) });
  }
  if (k >= 4) {
    const t = txt(0, 0, `${hex(sim.ip)} + ${sim.len} = ${hex(sim.next)}`, 'ar-mono', 'start') + txt(0, 24, `${hex(sim.disp, 2)} = ${sim.d}`, 'ar-mono', 'start') + txt(0, 52, z ? `目标 = ${hex(sim.next)} ${sim.d < 0 ? '−' : '+'} ${Math.abs(sim.d)} = ${hex(sim.target)}` : `target = ${hex(sim.target)}`, 'bt-formula cur', 'start');
    items.push({ k: 'tg', x: X + 410, y: 120, html: t });
  }
  return items;
}
function buildCj(p, kit, ERR) {
  const sim = cmpJump({ a: +p.a, b: +p.b, n: +p.n, ip: p.ip, len: p.len, disp: p.disp });
  const lesson = shell('cmp-jump', kit, ERR, sim, {
    where: W,
    tag: 'cmp',
    name: T('cmp 与条件转移', 'cmp and conditional jumps'),
    full: T('减法设标志 · ZF SF OF CF · 有符号与无符号比较 · 相对转移的目标地址', 'Flags from subtraction · signed vs unsigned · branch targets'),
    title: T(`cmp ${p.a}, ${p.b}`, `cmp ${p.a}, ${p.b}`),
    legend: [['amber', T('为 1 的标志', 'Flag set')]],
    principle: CJ_PRINCIPLE,
    desc: T('x86 的 cmp 指令其实是做一次减法，然后条件转移指令看标志位决定跳不跳。这节课把减法按位做出来，得到四个标志，再列出每条条件转移指令的判断，最后算出转移目标地址。', 'cmp subtracts; the jumps read the flags. The subtraction, flags, every jump’s decision and the target address are worked out.'),
    rect: [20, 80, 170 + 410 + 260, 312 + 6 * 30 + 20],
  });
  if (!sim.ok) return lesson;
  const s = sim.s;
  const F = s.flags;
  const list = [
    { title: T(`算 ${s.a} − ${s.b}`, `${s.a} − ${s.b}`), desc: T(`结果 ${s.R}`, `Result ${s.R}`), detail: T(`a = ${s.A}，b 取反得 ${s.B}，再加 1。结果 ${s.R}：当有符号数看是 ${s.signed}，当无符号数看是 ${s.unsigned}。cmp 不保存这个结果，只设置标志。`, `a + ~b + 1 = ${s.R}: ${s.signed} signed, ${s.unsigned} unsigned.`), ref: 'cmp', st: { k: 0 }, row: { color: 'blue', what: 'a − b', result: s.R, tone: 'info' } },
    { title: T('设置标志', 'Set the flags'), desc: `ZF=${F.ZF} SF=${F.SF} OF=${F.OF} CF=${F.CF}`, detail: T(`结果${F.ZF ? '为 0' : '不为 0'}，ZF = ${F.ZF}；最高位 ${s.R[0]}，SF = ${F.SF}；最高位进位 ${s.Cn} ⊕ 次高位进位 ${s.Cn1}，OF = ${F.OF}；减法的 CF = 进位 ${s.Cn} ⊕ 1 = ${F.CF}${F.CF ? '，表示无符号数不够减，有借位' : ''}。`, `ZF=${F.ZF}, SF=${F.SF}, OF=${F.OF}, CF=${F.CF}.`), ref: 'cmp', st: { k: 1 }, row: { color: 'amber', what: T('标志', 'Flags'), result: `${F.ZF}${F.SF}${F.OF}${F.CF}`, tone: 'info' } },
    { title: T('有符号比较', 'Signed comparison'), desc: sim.conds.filter((c) => c.kind !== 'u' && c.take).map((c) => c.op).join(' ') || '—', detail: T(`看 ZF、SF、OF。SF ${F.SF === F.OF ? '=' : '≠'} OF，说明按有符号数 a ${F.ZF ? '=' : F.SF === F.OF ? '>' : '<'} b。会转移的：${sim.conds.filter((c) => c.kind !== 'u' && c.take).map((c) => c.op).join('、')}。`, `Signed: a ${F.ZF ? '=' : F.SF === F.OF ? '>' : '<'} b.`), ref: 'cond', st: { k: 2 }, row: { color: 'violet', what: T('有符号', 'Signed'), result: F.ZF ? '=' : F.SF === F.OF ? '>' : '<', tone: 'info' } },
    { title: T('无符号比较', 'Unsigned comparison'), desc: sim.conds.filter((c) => c.kind === 'u' && c.take).map((c) => c.op).join(' '), detail: T(`看 CF、ZF。CF = ${F.CF}，说明按无符号数 ${s.ua} ${F.ZF ? '=' : F.CF ? '<' : '>'} ${s.ub}。会转移的：${sim.conds.filter((c) => c.kind === 'u' && c.take).map((c) => c.op).join('、')}。${(F.SF !== F.OF) !== !!F.CF && !F.ZF ? '注意有符号和无符号的结论正好相反。' : ''}`, `Unsigned: ${s.ua} ${F.ZF ? '=' : F.CF ? '<' : '>'} ${s.ub}.`), ref: 'cond', st: { k: 3 }, row: { color: 'teal', what: T('无符号', 'Unsigned'), result: F.ZF ? '=' : F.CF ? '<' : '>', tone: 'info' } },
    { title: T(`转移目标 ${hex(sim.target)}`, `Target ${hex(sim.target)}`), desc: T(`偏移 ${sim.d}`, `disp ${sim.d}`), detail: T(`下一条指令地址 = ${hex(sim.ip)} + ${sim.len} = ${hex(sim.next)}；偏移量 ${hex(sim.disp, 2)} 当 8 位补码是 ${sim.d}；目标 = ${hex(sim.next)} ${sim.d < 0 ? '−' : '+'} ${Math.abs(sim.d)} = ${hex(sim.target)}。`, `${hex(sim.next)} + (${sim.d}) = ${hex(sim.target)}.`), ref: 'target', st: { k: 4 }, row: { color: 'green', what: T('目标', 'Target'), result: hex(sim.target), tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => cjBoard(sim, st, z), T(`目标 ${hex(sim.target)}`, `Target ${hex(sim.target)}`), T('试试 a、b 同号和异号，看有符号和无符号的结论什么时候不一样。', 'Try mixed signs and see when the two comparisons disagree.'));
}
export const makeCmpJump = make('cmp-jump', CJ_SPEC, CJ_ERR, buildCj);
