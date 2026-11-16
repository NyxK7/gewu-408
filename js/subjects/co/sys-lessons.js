// 计算机系统概述：CPU 性能；数据的表示和运算：海明码。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from './kit.js';
import { hamming, perf } from './perf.js';

const f3 = (x) => String(+x.toFixed(3));

// ═════════════════════════ CPU 性能 ═════════════════════════

const PERF_PRINCIPLE = {
  sections: [
    {
      id: 'arch',
      title: T('计算机的组成与工作过程', 'Organisation'),
      blocks: [
        { p: T('冯·诺依曼计算机由**运算器、控制器、存储器、输入设备、输出设备**五部分组成，采用**存储程序**：指令和数据都用二进制存在存储器里，按地址访问，指令按顺序执行。现代计算机以存储器为中心，运算器和控制器合称 CPU。', 'A von Neumann machine has an ALU, control unit, memory, input and output, and **stores programs** in memory as binary.') },
        { p: T('一条指令的执行过程：取指令（PC → MAR → 存储器 → MDR → IR，PC 加 1）、分析指令（译码）、执行指令。**机器字长**是 CPU 一次能处理的二进制位数，一般等于通用寄存器的位数。', 'Each instruction is fetched (PC → MAR → memory → MDR → IR), decoded and executed. **Word length** is the number of bits processed at once.') },
        {
          table: {
            head: [T('层次', 'Level'), T('说明', 'Notes')],
            rows: [
              [T('高级语言', 'High-level language'), T('经编译成汇编（或直接成机器码）', 'compiled')],
              [T('汇编语言', 'Assembly'), T('经汇编成机器语言', 'assembled')],
              [T('操作系统', 'Operating system'), T('向上提供系统调用', 'system calls')],
              [T('机器语言（ISA）', 'Machine language (ISA)'), T('软件和硬件的分界面', 'the hardware/software interface')],
              [T('微程序 / 硬件', 'Microcode / hardware'), T('直接执行机器指令', 'executes instructions')],
            ],
          },
        },
      ],
    },
    {
      id: 'metric',
      title: T('性能指标', 'Metrics'),
      blocks: [
        { formula: T('CPU 执行时间 = 指令条数 × CPI × 时钟周期 = 指令条数 × CPI ÷ 主频', 'CPU time = IC × CPI × cycle time = IC × CPI ÷ f') },
        {
          list: [
            T('**主频** f：每秒多少个时钟周期；**时钟周期** = 1 / f。', '**Clock rate** f; **cycle time** = 1/f.'),
            T('**CPI**：执行一条指令平均要几个时钟周期。有多类指令时，CPI = Σ（该类指令所占比例 × 该类的 CPI）。', '**CPI**: average cycles per instruction, weighted by the instruction mix.'),
            T('**IPC** = 1 / CPI；**MIPS** = 每秒执行多少百万条指令 = 主频（MHz）÷ CPI。', '**MIPS** = f (MHz) ÷ CPI.'),
            T('**FLOPS**：每秒浮点运算次数（MFLOPS、GFLOPS、TFLOPS）。', '**FLOPS**: floating-point operations per second.'),
          ],
        },
        { warn: T('比较两台机器只看执行时间。MIPS 高不一定更快：不同机器的指令系统不同，完成同一个程序的指令条数也不同。', 'Only execution time is a fair comparison; MIPS ignores instruction count.') },
      ],
    },
    pit([
      T('主频的 M、G 是 10^6、10^9；存储容量的 K、M、G 是 2^10、2^20、2^30。', 'Rates use powers of 10, capacities powers of 2.'),
      T('CPI 加权时比例要用小数（百分比除以 100）。', 'Use fractions, not percentages, when weighting CPI.'),
      T('「快多少倍」= 慢的时间 ÷ 快的时间。', '“n times faster” = slow time ÷ fast time.'),
    ]),
  ],
};
const PERF_SPEC = {
  presets: [
    { label: T('两台机器比快慢', 'Which machine is faster'), set: { mix: [50, 30, 20], cpiA: [1, 2, 4], cpiB: [1, 1, 3], fA: 2000, fB: 1500, n: 1000 } },
    { label: T('主频高反而慢', 'Faster clock, slower machine'), set: { mix: [40, 40, 20], cpiA: [2, 3, 5], cpiB: [1, 2, 2], fA: 3000, fB: 2000, n: 500 } },
  ],
  groups: [
    { legend: T('程序', 'Program'), fields: [
      { name: 'mix', label: T('各类指令所占比例（%，和为 100）', 'Instruction mix (%)'), type: 'list', min: 1, max: 100, maxLen: 6, wide: true },
      { name: 'n', label: T('指令条数（百万条）', 'Instructions (millions)'), type: 'int', min: 1, max: 1e6 },
    ] },
    { legend: T('机器 A', 'Machine A'), fields: [
      { name: 'fA', label: T('主频（MHz）', 'Clock (MHz)'), type: 'int', min: 1, max: 10000 },
      { name: 'cpiA', label: T('各类指令的 CPI', 'CPI per class'), type: 'list', min: 1, max: 100, maxLen: 6 },
    ] },
    { legend: T('机器 B', 'Machine B'), fields: [
      { name: 'fB', label: T('主频（MHz）', 'Clock (MHz)'), type: 'int', min: 1, max: 10000 },
      { name: 'cpiB', label: T('各类指令的 CPI', 'CPI per class'), type: 'list', min: 1, max: 100, maxLen: 6 },
    ] },
  ],
  note: T('两台机器运行同一个程序（指令条数和比例相同），只是主频和各类指令的 CPI 不同。', 'Both machines run the same program; only clock and CPIs differ.'),
};
const PERF_ERR = { mix: T('比例要有 1～6 项', 'Give 1–6 classes'), sum: T('比例之和要等于 100', 'The mix must sum to 100'), cpi: T('CPI 的个数要和比例一样', 'One CPI per class'), f: T('主频和指令条数要大于 0', 'Clock and count must be positive') };
// 画法：执行时间 = 指令数 × CPI × 时钟周期。先画指令比例，再画每台机器的 CPI 条（按指令类分段，
// 每段 = 比例 × 这类的 CPI），最后把 CPI 条乘上各自的时钟周期变成「时间条」，两台机器一比就知道谁快。
const PT = ['blue', 'violet', 'teal', 'amber', 'rose', 'green'];
function perfBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const X = 200;
  const cls = (i) => (z ? `类${i + 1}` : `C${i + 1}`);
  const segBar = (vals, scale, fmt) => {
    let h = '';
    let x = 0;
    vals.forEach((v, i) => {
      const w = v * scale;
      h += `<g transform="translate(${x} 0)">${cell(Math.max(w - 2, 1.5), 30, w > 44 ? fmt(v, i) : '', { tone: PT[i % 6], size: 11 })}</g>`;
      x += w;
    });
    return { h, w: x };
  };
  // 指令比例
  const mixBar = segBar(sim.mix, 4.4, (v, i) => `${cls(i)} ${v}%`);
  items.push({ k: 'mix', x: X, y: 110, html: txt(-14, 20, z ? '指令比例' : 'mix', 'bt-lab', 'end') + mixBar.h });
  // CPI 条
  const maxCPI = Math.max(sim.A.CPI, sim.B.CPI);
  const cs = 360 / maxCPI;
  const cpiRow = (m, name, y, on, cur) => {
    if (!on) return;
    const b = segBar(m.terms, cs, (v, i) => `${cls(i)} ${f3(v)}`);
    items.push({ k: `c${name}`, x: X, y, html: txt(-14, 20, z ? `机器 ${name} 的 CPI` : `${name}: CPI`, 'bt-lab', 'end') + b.h + txt(b.w + 10, 20, `= ${f3(m.CPI)}`, cur ? 'bt-formula cur' : 'bt-formula', 'start') });
  };
  cpiRow(sim.A, 'A', 170, k >= 0, k === 0);
  cpiRow(sim.B, 'B', 214, k >= 1, k === 1);
  // 时间条：CPI × 指令数 × 时钟周期
  if (k >= 2) {
    const maxT = Math.max(sim.A.time, sim.B.time);
    const ts = 460 / maxT;
    const timeRow = (m, name, y) => {
      const segs = m.terms.map((t) => (sim.n * t) / m.f);
      const b = segBar(segs, ts, (v, i) => cls(i));
      const win = k >= 3 && sim.faster === name;
      items.push({ k: `t${name}`, x: X, y, html: txt(-14, 20, z ? `机器 ${name} 的时间` : `${name}: time`, 'bt-lab', 'end') + b.h + txt(b.w + 10, 20, `${f3(m.time)} s${win ? (z ? '  ← 更快' : '  ← faster') : ''}`, win ? 'bt-formula cur' : 'bt-formula', 'start') + txt(0, 46, z ? `${sim.n}×10^6 条 × ${f3(m.CPI)} 周期 × 1/${m.f} MHz；MIPS = ${m.f} ÷ ${f3(m.CPI)} = ${f3(m.mips)}` : `${sim.n}M × ${f3(m.CPI)} × 1/${m.f} MHz; MIPS = ${f3(m.mips)}`, 'bt-idx', 'start') });
    };
    items.push({ k: 'x', x: X, y: 270, html: txt(0, 0, z ? '再乘上指令条数和各自的时钟周期 →' : '× instructions × clock period →', 'bt-cap', 'start') });
    timeRow(sim.A, 'A', 290);
    timeRow(sim.B, 'B', 356);
  }
  if (k >= 3) items.push({ k: 'res', x: X, y: 440, html: txt(0, 0, z ? `机器 ${sim.faster} 快，是另一台的 ${f3(sim.ratio)} 倍` : `${sim.faster} is ${f3(sim.ratio)}× faster`, 'bt-formula cur', 'start') });
  return items;
}
function buildPerf(p, kit, ERR) {
  const sim = perf(p);
  const lesson = shell('cpu-perf', kit, ERR, sim, {
    where: [['co', 'overview']],
    tag: 'CPI',
    name: T('计算机性能：CPI、MIPS 与执行时间', 'Performance: CPI, MIPS and time'),
    full: T('冯·诺依曼结构 · 层次结构 · 主频与时钟周期 · CPI 加权 · MIPS · 比较快慢', 'Von Neumann · levels · clock · weighted CPI · MIPS · comparing machines'),
    title: T(`${p.fA} vs ${p.fB} MHz`, `${p.fA} vs ${p.fB} MHz`),
    principle: PERF_PRINCIPLE,
    desc: T('两台机器跑同一个程序，谁更快？先按指令比例把各类指令的 CPI 加权平均，再算 MIPS 和执行时间——主频高的机器不一定快。', 'Weight each machine’s CPI by the instruction mix, then compute MIPS and time: a faster clock does not guarantee a faster machine.'),
    rect: [30, 80, 840, 470],
  });
  if (!sim.ok) return lesson;
  const sum = (m) => sim.mix.map((q, i) => `${q / 100}×${m.cpi[i]}`).join(' + ');
  const list = [
    { title: T(`机器 A 的 CPI = ${f3(sim.A.CPI)}`, `CPI of A = ${f3(sim.A.CPI)}`), desc: T('按比例加权', 'Weighted by the mix'), detail: T(`CPI = ${sum(sim.A)} = ${f3(sim.A.CPI)}。`, `CPI = ${sum(sim.A)} = ${f3(sim.A.CPI)}.`), ref: 'metric', st: { k: 0 }, row: { color: 'blue', what: 'CPI A', result: f3(sim.A.CPI), tone: 'info' } },
    { title: T(`机器 B 的 CPI = ${f3(sim.B.CPI)}`, `CPI of B = ${f3(sim.B.CPI)}`), desc: T('按比例加权', 'Weighted by the mix'), detail: T(`CPI = ${sum(sim.B)} = ${f3(sim.B.CPI)}。`, `CPI = ${sum(sim.B)} = ${f3(sim.B.CPI)}.`), ref: 'metric', st: { k: 1 }, row: { color: 'blue', what: 'CPI B', result: f3(sim.B.CPI), tone: 'info' } },
    { title: T('MIPS 和执行时间', 'MIPS and time'), desc: T(`A ${f3(sim.A.time)} s，B ${f3(sim.B.time)} s`, `A ${f3(sim.A.time)} s, B ${f3(sim.B.time)} s`), detail: T(`MIPS = 主频（MHz）÷ CPI：A ${f3(sim.A.mips)}，B ${f3(sim.B.mips)}。执行时间 = 指令条数 × CPI ÷ 主频：A ${f3(sim.A.time)} s，B ${f3(sim.B.time)} s。`, `MIPS: A ${f3(sim.A.mips)}, B ${f3(sim.B.mips)}. Time: A ${f3(sim.A.time)} s, B ${f3(sim.B.time)} s.`), ref: 'metric', st: { k: 2 }, row: { color: 'violet', what: T('时间', 'Time'), result: `${f3(sim.A.time)} / ${f3(sim.B.time)}`, tone: 'info' } },
    { title: T(`机器 ${sim.faster} 快 ${f3(sim.ratio)} 倍`, `${sim.faster} is ${f3(sim.ratio)}× faster`), desc: T('只比较执行时间', 'Compare time only'), detail: T(`比较快慢只看执行时间：${f3(Math.max(sim.A.time, sim.B.time))} ÷ ${f3(Math.min(sim.A.time, sim.B.time))} = ${f3(sim.ratio)}。${(sim.faster === 'A') !== (sim.A.f >= sim.B.f) ? '注意：快的这台主频反而低，因为它的 CPI 小得多。' : ''}`, `Time ratio ${f3(sim.ratio)}.`), ref: 'metric', st: { k: 3 }, row: { color: 'green', what: T('结论', 'Verdict'), result: sim.faster, tone: 'ok' } },
  ];
  return finish(lesson, list, (st, z) => perfBoard(sim, st, z), T(`机器 ${sim.faster} 更快`, `${sim.faster} is faster`), T('把主频高的那台的 CPI 调大，看它什么时候反而变慢。', 'Raise the faster clock’s CPIs and watch it lose.'));
}
export const makePerf = make('cpu-perf', PERF_SPEC, PERF_ERR, buildPerf);

// ═════════════════════════ 海明码 ═════════════════════════

const HAM_PRINCIPLE = {
  sections: [
    {
      id: 'parity',
      title: T('奇偶校验', 'Parity'),
      blocks: [
        { p: T('在数据后加 1 位校验位，让 1 的个数为偶数（偶校验）或奇数（奇校验）。只能**发现奇数个位出错**，不能纠错，也不知道是哪一位错。', 'One parity bit detects an odd number of flipped bits but cannot locate them.') },
      ],
    },
    {
      id: 'k',
      title: T('海明码的校验位个数', 'How many check bits'),
      blocks: [
        { formula: T('2^k ≥ n + k + 1（n 位数据，k 位校验位）', '2^k ≥ n + k + 1') },
        { p: T('k 位校验位组成的「校验和」有 2^k 种取值，要能表示「没出错」和「n + k 位中的哪一位出错」这 n + k + 1 种情况。例如 n = 4 要 3 位，n = 8 要 4 位，n = 16 要 5 位。', 'The k-bit syndrome must name “no error” plus each of the n + k positions.') },
      ],
    },
    {
      id: 'encode',
      title: T('编码', 'Encoding'),
      blocks: [
        {
          steps: [
            T('校验位 Pᵢ 放在第 2^(i−1) 位（1、2、4、8……），数据位依次放在其余位置；', 'check bits go to positions 1, 2, 4, 8, …; data fills the rest;'),
            T('把每个位置号写成二进制：第 i 位为 1 的那些位置归 Pᵢ 管（P1 管 1、3、5、7……，P2 管 2、3、6、7……）；', 'Pᵢ covers the positions whose binary number has bit i set;'),
            T('Pᵢ = 它管的所有数据位异或（偶校验）。', 'Pᵢ = XOR of the data bits it covers (even parity).'),
          ],
        },
      ],
    },
    {
      id: 'check',
      title: T('检错与纠错', 'Detecting and correcting'),
      blocks: [
        { p: T('接收方重新把每组（包括校验位本身）异或，得到 Sᵢ。把 S 按位拼起来（…S₃S₂S₁）当成二进制数：0 表示没错，否则它的值就是**出错的那一位的位置**，把那一位取反就纠正了。', 'Recompute each group including its check bit; the syndrome read as a number is the **position of the error**, or 0.') },
        { warn: T('基本的海明码只能纠正 1 位错。两位同时出错时它会「纠」到错误的位置上。再加 1 位总的奇偶校验位，就能纠 1 位错、同时发现 2 位错（SEC-DED）。', 'Plain Hamming corrects one error; two errors are mis-corrected. An extra overall parity bit gives SEC-DED.') },
      ],
    },
    {
      id: 'crc',
      title: T('CRC', 'CRC'),
      blocks: [{ p: T('循环冗余校验适合检测成串的错误，用模 2 除法求冗余码，在计算机网络的「CRC 循环冗余校验」那节课里有完整的演示。', 'Cyclic redundancy checks are covered in the network lesson on CRC.') }],
    },
    pit([
      T('位置从 1 开始数，不是从 0。', 'Positions start at 1.'),
      T('数据位放进去的顺序各教材不同（有的从高位放起），看清题目。', 'Data order varies by textbook.'),
      T('校验时 Sᵢ 要把校验位 Pᵢ 本身也算进去。', 'Each Sᵢ includes Pᵢ itself.'),
    ]),
  ],
};
const HAM_SPEC = {
  presets: [
    { label: T('4 位数据，第 6 位出错', '4 data bits, error at 6'), set: { data: '1010', flip: 6 } },
    { label: T('8 位数据，没有出错', '8 data bits, no error'), set: { data: '11010110', flip: 0 } },
    { label: T('校验位本身出错', 'A check bit flips'), set: { data: '1011', flip: 4 } },
  ],
  groups: [{ legend: T('海明码', 'Hamming code'), fields: [
    { name: 'data', label: T('数据位（D1 D2 …）', 'Data bits'), type: 'text', parse: (s) => (/^[01]{1,16}$/.test(s) ? s : NaN) },
    { name: 'flip', label: T('传输中出错的位置（0 表示不出错）', 'Flipped position (0 = none)'), type: 'int', min: 0, max: 21 },
  ] }],
  note: T('校验位在 1、2、4、8……位，数据位按 D1、D2…… 从低位置往高位置放；偶校验。', 'Check bits at 1, 2, 4, 8…; data from low positions up; even parity.'),
};
const HAM_ERR = { data: T('数据位只能是 0、1，最多 16 位', 'Up to 16 bits of 0/1'), flip: T('出错位置超出了码字长度', 'Position beyond the codeword') };
const CW = 40;
function hamBoard(sim, st, z) {
  const items = [];
  const k = st?.k ?? -1;
  const isP = (p) => (p & (p - 1)) === 0;
  let h = '';
  for (let p = 1; p <= sim.m; p++) {
    const v = sim.code[p - 1];
    const known = !isP(p) || k >= 1 + Math.log2(p);
    const curP = k >= 1 && k <= sim.k && p === 2 ** (k - 1);
    const covered = k >= 1 && k <= sim.k && (p & (2 ** (k - 1))) && !isP(p);
    h += `<g transform="translate(${(p - 1) * CW} 0)">${txt((CW - 6) / 2, -8, String(p), 'bt-idx')}${cell(CW - 6, 30, known ? String(v) : '?', { size: 14, tone: isP(p) ? 'violet' : 'blue', cls: curP ? 'hot' : covered ? 'ok' : '' })}${txt((CW - 6) / 2, 46, isP(p) ? `P${Math.log2(p) + 1}` : `D${sim.dataPos.indexOf(p) + 1}`, 'bt-idx')}</g>`;
  }
  items.push({ k: 'code', x: 140, y: 130, html: txt(-14, 20, z ? '发送' : 'Sent', 'ar-lab', 'end') + h });
  if (k > sim.k) {
    let r = '';
    for (let p = 1; p <= sim.m; p++) {
      const s = k - sim.k - 1; // 第几个校验组
      const inG = s >= 0 && s < sim.k && p & (2 ** s);
      r += `<g transform="translate(${(p - 1) * CW} 0)">${cell(CW - 6, 30, String(sim.recv[p - 1]), { size: 14, cls: p === sim.flip ? 'bad' : inG ? 'hot' : '' })}</g>`;
    }
    items.push({ k: 'recv', x: 140, y: 220, html: txt(-14, 20, z ? '收到' : 'Received', 'ar-lab', 'end') + r });
    const shown = sim.syn.slice(0, Math.min(sim.k, k - sim.k));
    items.push({ k: 'syn', x: 140, y: 290, html: shown.map((s, i) => txt(0, i * 24, `S${i + 1} = ${s.cover.map((q) => sim.recv[q - 1]).join('⊕')} = ${s.v}`, 'ar-mono', 'start')).join('') });
    if (k >= 2 * sim.k + 1) items.push({ k: 'pos', x: 140, y: 300 + sim.k * 24, html: txt(0, 0, sim.pos ? (z ? `S = ${sim.syn.map((s) => s.v).reverse().join('')}₂ = ${sim.pos}：第 ${sim.pos} 位出错，取反纠正` : `Syndrome ${sim.pos}: flip position ${sim.pos}`) : z ? 'S = 0：没有出错' : 'Syndrome 0: no error', sim.pos ? 'ar-bad' : 'ar-ok', 'start') });
  }
  return items;
}
function buildHam(p, kit, ERR) {
  const sim = hamming(p);
  const lesson = shell('hamming', kit, ERR, sim, {
    where: [['co', 'data']],
    tag: T('海明', 'Ham'),
    name: T('校验码：奇偶校验与海明码', 'Parity and Hamming codes'),
    full: T('奇偶校验 · 校验位个数 · 分组与编码 · 校验和定位出错位 · SEC-DED', 'Parity · check bits · encoding · locating errors · SEC-DED'),
    title: T(`${p.data}（${sim.ok ? sim.k : '?'} 位校验）`, `${p.data} (${sim.ok ? sim.k : '?'} check bits)`),
    legend: [['blue', T('数据位', 'Data')], ['violet', T('校验位', 'Check bit')], ['green', T('这一组覆盖的位', 'Covered')]],
    principle: HAM_PRINCIPLE,
    desc: T('海明码把几个校验位放在 1、2、4、8 位上，每个校验位管一组位置。发送时算出校验位；接收时每组重新异或，几位结果拼起来正好就是出错的那一位的位置。', 'Check bits at 1, 2, 4, 8 each guard a group. Recomputing the groups on receipt yields the position of a single error.'),
    rect: [40, 90, 140 + (sim.ok ? sim.m : 7) * CW + 60, 330 + (sim.ok ? sim.k : 3) * 24 + 30],
  });
  if (!sim.ok) return lesson;
  const list = [{ title: T(`${sim.n} 位数据要 ${sim.k} 位校验位`, `${sim.k} check bits for ${sim.n} data bits`), desc: `2^${sim.k} = ${2 ** sim.k} ≥ ${sim.n} + ${sim.k} + 1`, detail: T(`找最小的 k 使 2^k ≥ ${sim.n} + k + 1：k = ${sim.k}。码字一共 ${sim.m} 位，校验位放在 ${sim.checks.map((c) => c.p).join('、')} 位，数据位依次放在其余位置。`, `Smallest k with 2^k ≥ n + k + 1 is ${sim.k}; the codeword has ${sim.m} bits.`), ref: 'k', st: { k: 0 }, row: { color: 'slate', what: 'k', result: String(sim.k), tone: 'info' } }];
  sim.checks.forEach((c, i) => list.push({ title: T(`P${i + 1} = ${c.v}`, `P${i + 1} = ${c.v}`), desc: T(`管第 ${c.cover.join('、')} 位`, `covers ${c.cover.join(', ')}`), detail: T(`位置号的二进制第 ${i + 1} 位为 1 的数据位是 ${c.cover.join('、')}（绿色），它们异或：${c.cover.map((q) => sim.code[q - 1]).join(' ⊕ ')} = ${c.v}。`, `XOR of positions ${c.cover.join(', ')} = ${c.v}.`), ref: 'encode', st: { k: i + 1 }, row: { color: 'violet', what: `P${i + 1}`, result: String(c.v), tone: 'info' } }));
  sim.syn.forEach((s, i) => list.push({ title: T(`S${i + 1} = ${s.v}`, `S${i + 1} = ${s.v}`), desc: T(`第 ${s.cover.join('、')} 位`, `positions ${s.cover.join(', ')}`), detail: T(`${sim.flip ? `传输中第 ${sim.flip} 位翻转了（红色）。` : ''}接收方把第 ${s.cover.join('、')} 位（含 P${i + 1}）异或：${s.cover.map((q) => sim.recv[q - 1]).join(' ⊕ ')} = ${s.v}。`, `XOR of received positions ${s.cover.join(', ')} = ${s.v}.`), ref: 'check', st: { k: sim.k + 1 + i }, row: { color: 'orange', what: `S${i + 1}`, result: String(s.v), tone: 'info' } }));
  list.push({ title: sim.pos ? T(`第 ${sim.pos} 位出错，取反纠正`, `Error at ${sim.pos}: corrected`) : T('没有出错', 'No error'), desc: T(`S = ${sim.syn.map((s) => s.v).reverse().join('')}₂`, `S = ${sim.syn.map((s) => s.v).reverse().join('')}`), detail: sim.pos ? T(`把 S 从高到低拼起来 ${sim.syn.map((s) => s.v).reverse().join('')}₂ = ${sim.pos}，正好是出错的位置，把它取反就恢复了正确的码字。`, `The syndrome is ${sim.pos}, the error position.`) : T('各组异或都是 0，说明没有出错。', 'All groups check out.'), ref: 'check', st: { k: 2 * sim.k + 1 }, row: { color: sim.pos ? 'rose' : 'green', what: 'S', result: String(sim.pos), tone: sim.pos ? 'warn' : 'ok' } });
  return finish(lesson, list, (st, z) => hamBoard(sim, st, z), T(`码字 ${sim.code.join('')}`, `Codeword ${sim.code.join('')}`), T('把出错位置改成校验位本身（1、2、4），看校验和是不是同样能定位。', 'Flip a check bit itself: the syndrome still points to it.'));
}
export const makeHamming = make('hamming', HAM_SPEC, HAM_ERR, buildHam);
