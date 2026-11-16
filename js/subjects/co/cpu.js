// CPU 一章的纯计算：单总线数据通路的微操作、水平型微指令字段、流水线性能、控制冒险。
//
// 约定（界面上写明）：
//   · 单总线 CPU：一个时钟节拍里总线上只能有一个寄存器输出（xxout），可以有多个寄存器输入（xxin）；
//     ALU 的一个输入固定来自暂存器 Y，结果送暂存器 Z；取指时 PC + 1 由专门的电路完成；
//   · 微指令：每个互斥组的字段用 ⌈log₂(组内微命令数 + 1)⌉ 位（留一个编码表示「不发命令」）；
//     条件测试字段用 ⌈log₂(条件数 + 1)⌉ 位，下地址字段用 ⌈log₂(控存字数)⌉ 位；
//   · 流水线：k 段，时钟周期 = 最慢一段 + 流水段寄存器延迟；
//   · 控制冒险：五段流水线 IF ID EX MEM WB，转移在第 r 段末尾确定。

const err = (e) => ({ ok: false, errors: [e] });

// ───── 数据通路 ─────
const FETCH = [
  { sig: ['PCout', 'MARin'], out: 'PC', in: ['MAR'], zh: '把 PC 送到 MAR', en: 'PC → MAR' },
  { sig: ['MemR', 'PC+1'], out: 'MEM', in: ['MDR'], pc1: true, zh: '读存储器，指令进 MDR；PC 加 1', en: 'Read memory into MDR; PC + 1' },
  { sig: ['MDRout', 'IRin'], out: 'MDR', in: ['IR'], zh: '指令从 MDR 送进 IR', en: 'MDR → IR' },
];
const EXEC = {
  addrr: [
    { sig: ['R1out', 'Yin'], out: 'R1', in: ['Y'], zh: 'R1 先送进暂存器 Y', en: 'R1 → Y' },
    { sig: ['R0out', 'ADD', 'Zin'], out: 'R0', in: ['Z'], alu: '+', zh: 'R0 上总线，ALU 算 Y + 总线，结果进 Z', en: 'R0 + Y → Z' },
    { sig: ['Zout', 'R0in'], out: 'Z', in: ['R0'], zh: '结果写回 R0', en: 'Z → R0' },
  ],
  addmem: [
    { sig: ['R1out', 'MARin'], out: 'R1', in: ['MAR'], zh: 'R1 里的地址送 MAR', en: 'R1 → MAR' },
    { sig: ['MemR'], out: 'MEM', in: ['MDR'], zh: '读出操作数', en: 'Read the operand' },
    { sig: ['MDRout', 'Yin'], out: 'MDR', in: ['Y'], zh: '操作数送 Y', en: 'MDR → Y' },
    { sig: ['R0out', 'ADD', 'Zin'], out: 'R0', in: ['Z'], alu: '+', zh: 'R0 + Y 进 Z', en: 'R0 + Y → Z' },
    { sig: ['Zout', 'R0in'], out: 'Z', in: ['R0'], zh: '结果写回 R0', en: 'Z → R0' },
  ],
  load: [
    { sig: ['Ad(IR)out', 'MARin'], out: 'IR', in: ['MAR'], zh: 'IR 里的地址码 A 送 MAR', en: 'A from IR → MAR' },
    { sig: ['MemR'], out: 'MEM', in: ['MDR'], zh: '读出 (A)', en: 'Read (A)' },
    { sig: ['MDRout', 'R0in'], out: 'MDR', in: ['R0'], zh: '送进 R0', en: 'MDR → R0' },
  ],
  store: [
    { sig: ['Ad(IR)out', 'MARin'], out: 'IR', in: ['MAR'], zh: '地址码 A 送 MAR', en: 'A → MAR' },
    { sig: ['R0out', 'MDRin'], out: 'R0', in: ['MDR'], zh: 'R0 的内容送 MDR', en: 'R0 → MDR' },
    { sig: ['MemW'], out: 'MDR', in: ['MEM'], zh: '写存储器', en: 'Write memory' },
  ],
  jmp: [
    { sig: ['PCout', 'Yin'], out: 'PC', in: ['Y'], zh: 'PC（已指向下一条）送 Y', en: 'PC → Y' },
    { sig: ['Ad(IR)out', 'ADD', 'Zin'], out: 'IR', in: ['Z'], alu: '+', zh: '位移量 A 上总线，和 Y 相加进 Z', en: 'A + Y → Z' },
    { sig: ['Zout', 'PCin'], out: 'Z', in: ['PC'], zh: '目标地址送 PC', en: 'Z → PC' },
  ],
};
export const INSTR = { addrr: 'ADD R0, R1', addmem: 'ADD R0, (R1)', load: 'LOAD R0, A', store: 'STORE R0, A', jmp: 'JMP +A' };
export function datapath({ instr, PC, R0, R1, A, mem }) {
  if (!EXEC[instr]) return err('instr');
  const M = { ...mem };
  const reg = { PC, R0, R1, MAR: 0, MDR: 0, IR: INSTR[instr], Y: 0, Z: 0 };
  M[PC] = INSTR[instr];
  const steps = [];
  const run = (list, phase) => {
    for (const s of list) {
      let bus = null;
      if (s.out === 'MEM') {
        const v = M[reg.MAR] ?? 0;
        reg.MDR = v;
        bus = v;
      } else if (s.in[0] === 'MEM') {
        M[reg.MAR] = reg.MDR;
        bus = reg.MDR;
      } else {
        bus = s.out === 'IR' ? A : reg[s.out];
        for (const t of s.in) reg[t] = t === 'Z' && s.alu ? reg.Y + bus : bus;
        if (s.in.includes('Z')) bus = s.out === 'IR' ? A : reg[s.out];
      }
      if (s.pc1) reg.PC += 1;
      steps.push({ ...s, phase, bus, reg: { ...reg }, mem: { ...M } });
    }
  };
  run(FETCH, 'fetch');
  run(EXEC[instr], 'exec');
  return { ok: true, instr, name: INSTR[instr], steps, A };
}

// ───── 微指令 ─────
export function microword({ groups, words, conds }) {
  if (!Array.isArray(groups) || !groups.length || groups.length > 8 || groups.some((g) => !(Number.isInteger(g) && g >= 1))) return err('groups');
  if (!(Number.isInteger(words) && words >= 2)) return err('words');
  if (!(Number.isInteger(conds) && conds >= 0 && conds <= 16)) return err('conds');
  const fields = groups.map((g) => ({ g, bits: Math.ceil(Math.log2(g + 1)) }));
  const ctrl = fields.reduce((a, f) => a + f.bits, 0);
  const condBits = conds ? Math.ceil(Math.log2(conds + 1)) : 0;
  const addrBits = Math.ceil(Math.log2(words));
  const direct = groups.reduce((a, b) => a + b, 0);
  return { ok: true, groups, words, conds, fields, ctrl, condBits, addrBits, total: ctrl + condBits + addrBits, direct, directTotal: direct + condBits + addrBits };
}

// ───── 流水线性能 ─────
export function pipePerf({ stages, latch, n }) {
  if (!Array.isArray(stages) || stages.length < 2 || stages.length > 8 || stages.some((t) => !(t > 0))) return err('stages');
  if (!(latch >= 0)) return err('latch');
  if (!(Number.isInteger(n) && n >= 1 && n <= 10000)) return err('n');
  const k = stages.length;
  const slow = Math.max(...stages);
  const clock = slow + latch;
  const seq = stages.reduce((a, b) => a + b, 0);
  const total = (k + n - 1) * clock;
  const serial = n * seq;
  return { ok: true, stages, latch, n, k, slow, clock, seq, total, serial, tp: n / total, speedup: serial / total, eff: serial / (k * total), limit: seq / clock };
}

// ───── 控制冒险 ─────
const ST = ['IF', 'ID', 'EX', 'MEM', 'WB'];
export function branch({ n, b, taken, r, strategy }) {
  if (!(Number.isInteger(n) && n >= 3 && n <= 9)) return err('n');
  if (!(Number.isInteger(b) && b >= 1 && b < n)) return err('b');
  if (![2, 3, 4].includes(r)) return err('r');
  const rows = [];
  for (let i = 1; i <= b; i++) rows.push({ label: `I${i}`, start: i, branch: i === b });
  const resolved = b + r - 1; // 第几个周期末尾确定转移方向
  const pen = strategy === 'stall' || taken ? r - 1 : 0;
  if (strategy === 'predict' && taken)
    for (let j = 1; j <= r - 1; j++) rows.push({ label: `I${b + j}`, start: b + j, flushed: resolved });
  const next = b + 1 + pen;
  for (let j = 0; j < n - b; j++) rows.push({ label: taken ? `T${j + 1}` : `I${b + 1 + j}`, start: next + j });
  const total = rows.at(-1).start + 4;
  return { ok: true, n, b, taken, r, strategy, rows, resolved, pen, total, ideal: 5 + n - 1, ST };
}
