// 「机器级表示：if 与循环」：左边 C 代码，中间对应的汇编（地址、跳转指令的机器码），右边寄存器和标志位。
// 一步执行一条指令；条件转移看标志位决定跳不跳，跳的时候在汇编旁边画出跳向哪里。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from './kit.js';
import { runCtrl } from './ctrl.js';

const W = [['co', 'isa']];
const CX = 20;
const AX = 400;
const RX = 880;
const Y0 = 130;
const LH = 34;
const hx = (v) => v.toString(16).toUpperCase();
const insText = (ins) => (ins.op in { jmp: 1, jle: 1, jl: 1, jg: 1, jge: 1, je: 1, jne: 1 } ? `${ins.op} ${hx(ins.target)}` : ins.a.length ? `${ins.op} ${ins.a.join(', ')}` : ins.op);

const PRINCIPLE = {
  sections: [
    {
      id: 'if',
      title: T('if 语句怎样变成指令', 'Compiling if'),
      blocks: [
        { p: T('高级语言的选择结构，在机器级就是「比较 + 条件转移」：先用 cmp（做减法、只改标志位）比较，再用条件转移指令按标志位决定跳不跳。', 'An if becomes a compare (cmp sets flags) followed by a conditional jump.') },
        { list: [
          T('编译器通常对**相反的条件**跳转：if (a > b) 写成 cmp a, b 之后 jle else —— 条件不成立就跳过 then 部分。', 'Compilers jump on the **opposite** condition: if (a > b) becomes cmp; jle else.'),
          T('then 部分末尾要有一条无条件转移 jmp，跳过 else 部分。', 'The then-part ends with jmp over the else-part.'),
        ] },
        {
          table: {
            head: [T('指令', 'Jump'), T('有符号比较：转移条件', 'Signed condition'), T('对应的无符号指令', 'Unsigned')],
            rows: [
              ['jg / jnle', T('ZF = 0 且 SF = OF（大于）', 'ZF = 0 and SF = OF'), 'ja'],
              ['jge / jnl', T('SF = OF（大于等于）', 'SF = OF'), 'jae'],
              ['jl / jnge', T('SF ≠ OF（小于）', 'SF ≠ OF'), 'jb'],
              ['jle / jng', T('ZF = 1 或 SF ≠ OF（小于等于）', 'ZF = 1 or SF ≠ OF'), 'jbe'],
              ['je / jz', 'ZF = 1', 'je'],
              ['jne / jnz', 'ZF = 0', 'jne'],
            ],
          },
        },
      ],
    },
    {
      id: 'loop',
      title: T('循环怎样变成指令', 'Compiling loops'),
      blocks: [
        { list: [
          T('**do-while**：循环体在前，末尾一条条件转移跳回开头。循环体至少执行一次。', '**do-while**: body first, a conditional jump back at the end; runs at least once.'),
          T('**while**：常见写法是先 jmp 到末尾的条件测试，测试成立再跳回循环体（「跳到中间」）；条件一开始就不成立时，循环体一次也不执行。', '**while**: jump to the test at the bottom first; the body may run zero times.'),
          T('**for (初始化; 条件; 更新)** 等价于「初始化; while (条件) { 循环体; 更新; }」。', '**for** is init + while with the update at the end of the body.'),
        ] },
        { tip: T('数指令条数时注意：while 循环执行 n 次，条件测试要做 n + 1 次（最后一次不成立才退出）。', 'A while loop that runs n times tests its condition n + 1 times.') },
      ],
    },
    {
      id: 'jump',
      title: T('相对转移的目标地址', 'Relative jump targets'),
      blocks: [
        { formula: T('目标地址 = 转移指令的下一条指令的地址 + 偏移量', 'target = address of the next instruction + offset') },
        { p: T('短转移指令 2 字节：操作码 1 字节 + 偏移量 1 字节（补码，−128～127）。往回跳（循环）时偏移量是负数，例如 F9 = −7。', 'Short jumps are 2 bytes: opcode + an 8-bit two’s-complement offset; backward jumps are negative (F9 = −7).') },
      ],
    },
    pit([
      T('cmp a, b 算的是 a − b，只改标志位，不保存结果。', 'cmp a, b computes a − b for the flags only.'),
      T('有符号数比较用 jg / jl 一类（看 SF、OF），无符号数用 ja / jb 一类（看 CF）。', 'Signed: jg/jl (SF, OF); unsigned: ja/jb (CF).'),
      T('偏移量相对的是转移指令的下一条，不是转移指令本身。', 'Offsets are relative to the next instruction.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('if-else：a = 7, b = 3', 'if-else: a = 7, b = 3'), set: { prog: 'ifelse', a: 7, b: 3, n: 3 } },
    { label: T('if-else：a = −5, b = 2', 'if-else: a = −5, b = 2'), set: { prog: 'ifelse', a: -5, b: 2, n: 3 } },
    { label: T('while 求和：n = 3', 'while sum: n = 3'), set: { prog: 'while', a: 7, b: 3, n: 3 } },
    { label: T('while：n = 0，一次也不执行', 'while: n = 0, never runs'), set: { prog: 'while', a: 7, b: 3, n: 0 } },
    { label: T('do-while：n = 0，也要执行一次', 'do-while: n = 0 runs once'), set: { prog: 'dowhile', a: 7, b: 3, n: 0 } },
  ],
  groups: [{ legend: T('程序', 'Program'), fields: [
    { name: 'prog', label: T('哪一段', 'Program'), type: 'select', options: [['ifelse', T('if-else 求较大值', 'if-else: max')], ['while', T('while 求 1+…+n', 'while: 1+…+n')], ['dowhile', T('do-while 求 1+…+n', 'do-while: 1+…+n')]] },
    { name: 'a', label: 'a', type: 'int', min: -1000, max: 1000, show: (p) => p.prog === 'ifelse' },
    { name: 'b', label: 'b', type: 'int', min: -1000, max: 1000, show: (p) => p.prog === 'ifelse' },
    { name: 'n', label: 'n', type: 'int', min: -2, max: 8, show: (p) => p.prog !== 'ifelse' },
  ] }],
  note: T('参数事先装进寄存器；32 位有符号比较；跳转都是 2 字节短转移。代码从 0x401000 开始。', 'Arguments are preloaded in registers; signed 32-bit compares; 2-byte short jumps from 0x401000.'),
};
const ERR = { prog: T('程序不对', 'Unknown program'), a: T('a 取 −1000～1000', 'a: −1000 to 1000'), b: T('b 取 −1000～1000', 'b: −1000 to 1000'), n: T('n 取 −2～8', 'n: −2 to 8') };

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const t = k >= 0 ? sim.trace[k] : null;
  const cur = t?.ins;
  let h = '';
  // C 代码
  h += txt(CX, Y0 - 18, z ? 'C 代码' : 'C code', 'bt-lab', 'start');
  sim.c.forEach((line, i) => {
    const on = cur && cur.c === i;
    h += `<g transform="translate(${CX} ${Y0 + i * LH})">${cell(300, LH - 4, line.replace(/^ +/, (m) => ' '.repeat(m.length * 2)), { size: 13, tone: on ? 'amber' : '', cls: on ? 'hot' : '', anchor: 'start' })}</g>`;
  });
  // 汇编
  h += txt(AX, Y0 - 18, z ? '汇编（地址 · 机器码 · 指令）' : 'Assembly (address · bytes · instruction)', 'bt-lab', 'start');
  const rowOf = (addr) => sim.code.findIndex((c) => c.addr === addr);
  sim.code.forEach((ins, i) => {
    const on = cur === ins;
    const done = sim.trace.slice(0, k + 1).some((x) => x.ins === ins);
    const y = Y0 + i * LH;
    if (ins.label) h += txt(AX - 6, y + 20, `${ins.label}:`, 'bt-idx', 'end');
    h += `<g transform="translate(${AX} ${y})">${cell(400, LH - 4, '', { tone: on ? 'amber' : done ? 'slate' : '', cls: on ? 'hot' : '' })}</g>`;
    h += txt(AX + 10, y + 20, hx(ins.addr), 'ar-mono', 'start');
    h += txt(AX + 100, y + 20, ins.bytes ?? '', 'bt-idx', 'start');
    h += txt(AX + 170, y + 20, insText(ins), on ? 'ar-mono' : 'bt-cap', 'start');
  });
  // 跳转弧线
  if (t && t.taken != null) {
    const from = rowOf(cur.addr);
    const to = rowOf(cur.target);
    const xr = AX + 400 + 16 + Math.abs(to - from) * 4;
    const y1 = Y0 + from * LH + 15;
    const y2 = Y0 + to * LH + 15;
    const cls = t.taken ? 'ok' : 'dash';
    h += `<g class="barw ${cls}"><line x1="${AX + 402}" y1="${y1}" x2="${xr}" y2="${y1}"/><line x1="${xr}" y1="${y1}" x2="${xr}" y2="${y2}"/></g>` + arrow(xr, y2, AX + 404, y2, cls);
    h += txt(xr + 6, (y1 + y2) / 2, t.taken ? (z ? '跳' : 'taken') : z ? '不跳' : 'not taken', t.taken ? 'cw-lab acc l' : 'bt-idx', 'start');
  }
  items.push({ k: 'code', x: 0, y: 0, html: h });
  // 寄存器
  let r = txt(0, -18, z ? '寄存器' : 'Registers', 'bt-lab', 'start');
  const regs = t ? t.regs : { eax: 0, ebx: 0, ecx: 0, edx: 0 };
  const notes = Object.fromEntries(sim.code.filter((c) => c.op === 'mov' && c.note).map((c) => [c.a[0], c.note]));
  const rows = Object.entries(regs).map(([n, v]) => {
    const ch = t && t.before[n] !== v;
    return [{ t: n, tone: ch ? 'amber' : '' }, { t: String(v), tone: ch ? 'amber' : '' }, { t: notes[n] ?? '', tone: ch ? 'amber' : '' }];
  });
  r += gridTable([z ? '寄存器' : 'reg', z ? '值' : 'value', z ? '放的是' : 'holds'], rows, { cw: [70, 70, 60], rh: 32 });
  const f = t?.flags ?? { ZF: false, SF: false, OF: false, CF: false };
  r += txt(0, 200, z ? '标志位（上一次 cmp）' : 'Flags (last cmp)', 'bt-lab', 'start');
  Object.entries(f).forEach(([n, v], i) => (r += `<g transform="translate(${i * 50} 212)">${cell(46, 30, `${n}=${v ? 1 : 0}`, { size: 12, tone: cur?.op === 'cmp' ? 'amber' : '' })}</g>`));
  r += txt(0, 280, z ? `已执行 ${k + 1} 条指令` : `${k + 1} instructions executed`, 'bt-cap', 'start');
  items.push({ k: 'regs', x: RX, y: Y0, html: r });
  return items;
}

function build(p, kit, ERR) {
  const sim = runCtrl(p);
  const lesson = shell('ctrl-asm', kit, ERR, sim, {
    where: W,
    tag: 'if/loop',
    name: T('机器级表示：if 与循环', 'Machine code for if and loops'),
    full: T('cmp 与条件转移 · 反条件跳转 · if-else 的 jmp · while「跳到中间」· do-while · for · 相对转移的目标地址', 'cmp and conditional jumps · inverted conditions · if-else · while · do-while · for · relative targets'),
    title: SPEC.presets.find((x) => x.set.prog === p.prog && (p.prog === 'ifelse' ? x.set.a === p.a && x.set.b === p.b : x.set.n === p.n))?.label ?? T('if 与循环', 'if and loops'),
    legend: [['amber', T('正在执行 / 刚改变的', 'Executing / changed')], ['slate', T('执行过的指令', 'Executed')], ['green', T('跳转发生', 'Jump taken')]],
    principle: PRINCIPLE,
    desc: T('一段 C 代码和它的汇编并排。一步执行一条指令：cmp 设置标志位，条件转移看标志位决定跳不跳。看 if-else 怎样用「相反的条件」跳过 then 部分，while 和 do-while 又怎样把条件测试放在末尾。', 'Step through the assembly next to the C code: cmp sets the flags and the conditional jump decides where to go.'),
    rect: [0, 90, 1130, 130 + Math.max(sim.ok ? sim.code.length : 9, 8) * LH + 30],
  });
  if (!sim.ok) return lesson;
  const list = sim.trace.map((t, k) => {
    const ins = t.ins;
    let d;
    if (ins.op === 'mov') d = typeof ins.a[1] === 'number' ? T(`把 ${ins.a[1]} 装进 ${ins.a[0]}${ins.note ? `（变量 ${ins.note}）` : ''}。`, `Load ${ins.a[1]} into ${ins.a[0]}.`) : T(`${ins.a[0]} ← ${ins.a[1]} = ${t.regs[ins.a[0]]}。`, `${ins.a[0]} ← ${ins.a[1]}.`);
    else if (ins.op === 'add') d = T(`${ins.a[0]} = ${t.before[ins.a[0]]} + ${t.before[ins.a[1]] ?? ins.a[1]} = ${t.regs[ins.a[0]]}。`, `${ins.a[0]} = ${t.regs[ins.a[0]]}.`);
    else if (ins.op === 'inc') d = T(`${ins.a[0]} 加 1，变成 ${t.regs[ins.a[0]]}。`, `${ins.a[0]} becomes ${t.regs[ins.a[0]]}.`);
    else if (ins.op === 'cmp') {
      const x = t.regs[ins.a[0]];
      const y = t.regs[ins.a[1]];
      d = T(`计算 ${ins.a[0]} − ${ins.a[1]} = ${x} − ${y} = ${x - y}，只设置标志位：ZF=${+t.flags.ZF}，SF=${+t.flags.SF}，OF=${+t.flags.OF}。`, `${x} − ${y}: ZF=${+t.flags.ZF}, SF=${+t.flags.SF}, OF=${+t.flags.OF}.`);
    } else if (ins.op === 'ret') d = T(`返回，结果在 eax 里：${t.regs.eax}。`, `Return ${t.regs.eax}.`);
    else {
      const rule = { jle: 'ZF = 1 或 SF ≠ OF', jl: 'SF ≠ OF', jmp: '无条件' }[ins.op] ?? '';
      d = T(`${ins.op === 'jmp' ? '无条件转移' : `条件 ${rule}：${t.taken ? '成立，跳转' : '不成立，顺序执行下一条'}`}。目标地址 = ${hx(ins.addr + ins.size)} + (${ins.disp}) = ${hx(ins.target)}（机器码 ${ins.bytes}）。`, `${t.taken ? 'Taken' : 'Not taken'}: ${hx(ins.addr + ins.size)} + (${ins.disp}) = ${hx(ins.target)}.`);
    }
    const ref = ins.op === 'cmp' || ins.op === 'jle' || ins.op === 'jl' ? (sim.prog === 'ifelse' ? 'if' : 'loop') : ins.op === 'jmp' ? (sim.prog === 'ifelse' ? 'if' : 'loop') : 'jump';
    return { title: T(`${hx(ins.addr)}  ${insText(ins)}`, `${hx(ins.addr)}  ${insText(ins)}`), desc: T(`第 ${k + 1} 条`, `#${k + 1}`), detail: d, ref, st: { k }, row: { color: t.taken ? 'green' : 'blue', what: T(insText(ins), insText(ins)), result: T(t.taken == null ? '—' : t.taken ? '跳' : '不跳', t.taken == null ? '—' : t.taken ? 'taken' : 'not taken'), tone: 'info' } };
  });
  const title = T(`结果 ${sim.result}，共执行 ${sim.count} 条指令`, `Result ${sim.result}; ${sim.count} instructions`);
  const text = sim.prog === 'ifelse' ? T(`a ${sim.a > sim.b ? '>' : '≤'} b，${sim.a > sim.b ? 'jle 不跳，执行 then 部分后 jmp 跳过 else' : 'jle 跳到 else 部分'}。`, sim.a > sim.b ? 'then-part, then jmp over else.' : 'jle jumps to the else-part.') : T(`循环体执行了 ${sim.loops} 次${sim.prog === 'while' ? `，条件测试做了 ${sim.loops + 1} 次` : ''}。`, `The body ran ${sim.loops} times.`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeCtrlAsm = make('ctrl-asm', SPEC, ERR, build);
