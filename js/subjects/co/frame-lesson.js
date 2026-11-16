// 「机器级表示：过程调用与栈帧」：左边是 caller 和 add 的汇编，右边是栈（上面是高地址），每一格一个字，
// 旁边用箭头标出 esp、ebp 指在哪；调用者的栈帧、参数和返回地址、被调用者的栈帧用不同颜色。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from './kit.js';
import { frame } from './frame.js';

const W = [['co', 'isa']];
const CX = 20;
const SX = 600;
const RX = 990;
const Y0 = 120;
const LH = 26;
const SH = 38;
const hx = (v) => v.toString(16).toUpperCase();
const WHAT = {
  retMain: [T('返回地址（回到 main）', 'return address (to main)'), 'slate'],
  oldEbpMain: [T('main 的 ebp', 'main’s ebp'), 'slate'],
  x: [T('局部变量 x', 'local x'), 'blue'],
  y: [T('局部变量 y', 'local y'), 'blue'],
  s: [T('局部变量 s', 'local s'), 'blue'],
  local: [T('局部变量（还没赋值）', 'local (unset)'), 'blue'],
  argY: [T('实参 y（先压）', 'argument y (pushed first)'), 'violet'],
  argX: [T('实参 x', 'argument x'), 'violet'],
  retCaller: [T('返回地址（回到 caller）', 'return address (to caller)'), 'amber'],
  oldEbpCaller: [T('caller 的 ebp', 'caller’s ebp'), 'green'],
  t: [T('局部变量 t', 'local t'), 'green'],
  savedEbx: [T('保存的 ebx', 'saved ebx'), 'green'],
};
const isAddr = (w) => ['retMain', 'oldEbpMain', 'retCaller', 'oldEbpCaller', 'savedEbx'].includes(w); // 这些按十六进制显示

const PRINCIPLE = {
  sections: [
    {
      id: 'frame',
      title: T('栈帧', 'Stack frames'),
      blocks: [
        { p: T('每个正在执行的过程在栈上有一块自己的区域，叫**栈帧**。IA-32 用两个寄存器管理：**esp** 指向栈顶（最后压进去的字），**ebp** 指向当前栈帧的底部（固定不动，用来按偏移访问参数和局部变量）。栈从高地址往低地址长。', 'Each active procedure owns a **stack frame**. **esp** points to the top; **ebp** marks the frame base. The stack grows downward.') },
        {
          table: {
            head: [T('位置', 'Where'), T('放的是', 'Contents')],
            rows: [
              ['[ebp + 12]、[ebp + 8]', T('调用者压进来的实参（第 2 个、第 1 个）', 'arguments 2 and 1')],
              ['[ebp + 4]', T('返回地址（call 压的）', 'return address')],
              ['[ebp]', T('调用者的 ebp（被调用者压的）', 'caller’s ebp')],
              ['[ebp − 4]、[ebp − 8] …', T('被调用者的局部变量、要保存的寄存器', 'locals and saved registers')],
            ],
          },
        },
      ],
    },
    {
      id: 'call',
      title: T('一次调用的全过程', 'One call, step by step'),
      blocks: [
        { steps: [
          T('**调用者**把实参**从右往左**压栈；', '**Caller** pushes arguments right to left;'),
          T('**call**：把返回地址（call 下一条指令的地址）压栈，跳到被调用过程；', '**call** pushes the return address and jumps;'),
          T('**被调用者**：push ebp 保存调用者的 ebp，mov ebp, esp 建立新栈帧，sub esp, n 给局部变量留空间；', '**Callee** prologue: push ebp; mov ebp, esp; sub esp, n;'),
          T('用 [ebp + 8]、[ebp + 12] 取参数，计算，返回值放进 eax；', 'read arguments at [ebp+8], [ebp+12]; result in eax;'),
          T('**leave**（= mov esp, ebp；pop ebp）撤掉自己的栈帧，**ret** 弹出返回地址回到调用者；', '**leave** (mov esp, ebp; pop ebp) and **ret**;'),
          T('调用者 add esp, 8 清掉自己压的参数（cdecl 约定）。', 'the caller clears the arguments (cdecl).'),
        ] },
      ],
    },
    {
      id: 'save',
      title: T('调用者保存和被调用者保存', 'Caller- and callee-saved registers'),
      blocks: [
        { list: [
          T('**调用者保存**：eax、ecx、edx。被调用者可以随便用；调用者调用之后还要用这些寄存器的值，就得自己先保存。', '**Caller-saved**: eax, ecx, edx.'),
          T('**被调用者保存**：ebx、esi、edi（以及 ebp）。被调用者要用它们，必须先压栈保存、返回前恢复，保证调用者看到的值不变。', '**Callee-saved**: ebx, esi, edi (and ebp): save and restore if used.'),
        ] },
        { tip: T('打开「add 用 ebx 算」就能看到：add 先 push ebx，最后 pop ebx，返回后 caller 的 ebx 仍然是原来的 0x77。', 'With “add uses ebx”, the callee pushes and pops ebx; the caller still sees 0x77.') },
      ],
    },
    pit([
      T('call 压进去的是 call **下一条**指令的地址。', 'call pushes the address of the **next** instruction.'),
      T('第一个参数在 [ebp + 8]，不是 [ebp + 4]（那里是返回地址）。', 'The first argument is at [ebp+8].'),
      T('局部变量在 ebp 下方（负偏移），参数在 ebp 上方（正偏移）。', 'Locals at negative offsets, arguments at positive ones.'),
      T('ret 之后栈里那些字并没有被清零，只是 esp 移走了，以后会被覆盖。', 'Popped words stay in memory until overwritten.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('add(3, 5)', 'add(3, 5)'), set: { a: 3, b: 5, saveEbx: false } },
    { label: T('add 用 ebx 计算（被调用者保存）', 'add uses ebx (callee-saved)'), set: { a: 3, b: 5, saveEbx: true } },
    { label: T('add(−20, 7)', 'add(−20, 7)'), set: { a: -20, b: 7, saveEbx: false } },
  ],
  groups: [{ legend: T('调用', 'Call'), fields: [
    { name: 'a', label: 'x', type: 'int', min: -9999, max: 9999 },
    { name: 'b', label: 'y', type: 'int', min: -9999, max: 9999 },
    { name: 'saveEbx', label: T('add 用 ebx 计算（要保存、恢复 ebx）', 'add computes in ebx (save and restore it)'), type: 'check' },
  ] }],
  note: T('IA-32、cdecl：参数从右往左压栈，调用者清理参数，返回值在 eax。进入 caller 时 esp = 0x1000（那里是回到 main 的返回地址），ebp = 0x1018，ebx = 0x77。', 'IA-32 cdecl. On entry to caller esp = 0x1000, ebp = 0x1018, ebx = 0x77.'),
};
const ERR = { a: T('x 取 −9999～9999', 'x: −9999 to 9999'), b: T('y 取 −9999～9999', 'y: −9999 to 9999') };

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const s = k >= 0 ? sim.steps[k] : null;
  const regs = s ? s.regs : { eip: sim.P.caller[0].addr, esp: 0x1000, ebp: 0x1018, eax: 0, ebx: 0x77 };
  const mem = s ? s.mem : { 0x1000: { v: 0x4010a5, what: 'retMain', live: true } };
  let h = '';
  // 代码
  let row = 0;
  for (const fn of ['caller', 'add']) {
    h += txt(CX, Y0 + row * LH + 18, `${fn}:`, 'bt-lab', 'start');
    row++;
    for (const ins of sim.P[fn]) {
      const on = s && s.ins === ins;
      const next = !s ? ins === sim.P.caller[0] : ins.addr === regs.eip;
      h += `<g transform="translate(${CX + 10} ${Y0 + row * LH})">${cell(390, LH - 3, '', { tone: on ? 'amber' : next ? 'slate' : '', cls: on ? 'hot' : '' })}</g>`;
      h += txt(CX + 20, Y0 + row * LH + 17, hx(ins.addr), 'bt-idx', 'start');
      h += txt(CX + 100, Y0 + row * LH + 17, ins.t, on ? 'ar-mono' : 'bt-cap', 'start');
      row++;
    }
  }
  // 栈
  const lo = sim.saveEbx ? 0xfd8 : 0xfdc;
  const addrs = [];
  for (let a = 0x1000; a >= lo; a -= 4) addrs.push(a);
  h += txt(SX, Y0 - 16, z ? '栈（上面是高地址，每格 4 字节）' : 'Stack (high addresses on top)', 'bt-lab', 'start');
  addrs.forEach((a, i) => {
    const y = Y0 + i * SH;
    const m = mem[a];
    const live = m?.live;
    const [lab, tone] = m ? WHAT[m.what] : [null, ''];
    const changed = s && m && (!s.before || JSON.stringify(sim.steps[k - 1]?.mem?.[a] ?? null) !== JSON.stringify(m));
    h += txt(SX + 40, y + 23, hx(a), 'bt-idx', 'end');
    const val = !m ? '' : m.v == null ? '?' : isAddr(m.what) ? hx(m.v) : String(m.v);
    h += `<g transform="translate(${SX + 50} ${y})">${cell(100, SH - 4, val, { size: 13, tone: live ? tone : '', cls: !live ? 'dim' : changed ? 'hot' : '' })}</g>`;
    if (m) h += txt(SX + 160, y + 23, live ? (z ? lab.zh : lab.en) : z ? `（已弹出）${lab.zh}` : `(popped) ${lab.en}`, live ? 'bt-cap' : 'bt-idx', 'start');
    if (a === regs.esp) h += arrow(SX - 70, y + 17, SX - 6, y + 17, 'acc') + txt(SX - 74, y + 21, 'esp', 'cw-lab acc', 'end');
    if (a === regs.ebp) h += arrow(SX - 70, y + 9, SX - 6, y + 9, 'ok') + txt(SX - 74, y + 6, 'ebp', 'bt-lab', 'end');
  });
  if (regs.ebp > 0x1000) h += txt(SX - 74, Y0 - 30, `ebp = ${hx(regs.ebp)} ↑`, 'bt-cap', 'end');
  items.push({ k: 'main', x: 0, y: 0, html: h });
  // 寄存器
  const before = s?.before ?? regs;
  const rows = ['eip', 'esp', 'ebp', 'eax', 'ebx'].map((n) => {
    const ch = s && before[n] !== regs[n];
    return [{ t: n, tone: ch ? 'amber' : '' }, { t: n === 'eax' ? String(regs[n]) : hx(regs[n]), tone: ch ? 'amber' : '' }];
  });
  items.push({ k: 'regs', x: RX, y: Y0, html: txt(0, -16, z ? '寄存器' : 'Registers', 'bt-lab', 'start') + gridTable([z ? '寄存器' : 'reg', z ? '值' : 'value'], rows, { cw: [60, 90], rh: 32 }) });
  return items;
}

function build(p, kit, ERR) {
  const sim = frame(p);
  const lesson = shell('call-frame', kit, ERR, sim, {
    where: W,
    tag: T('栈帧', 'Frame'),
    name: T('机器级表示：过程调用与栈帧', 'Procedure calls and stack frames'),
    full: T('esp 与 ebp · 实参从右往左压栈 · call 压返回地址 · push ebp / mov ebp, esp · 局部变量 · 返回值在 eax · leave 与 ret · 调用者保存与被调用者保存', 'esp and ebp · arguments · call and the return address · prologue · locals · eax · leave and ret · saved registers'),
    title: SPEC.presets.find((x) => x.set.a === p.a && x.set.b === p.b && !!x.set.saveEbx === !!p.saveEbx)?.label ?? T('过程调用', 'A call'),
    legend: [['blue', T('caller 的栈帧', 'caller’s frame')], ['violet', T('实参', 'Arguments')], ['amber', T('返回地址', 'Return address')], ['green', T('add 的栈帧', 'add’s frame')]],
    principle: PRINCIPLE,
    desc: T('caller 调用 add(x, y)：参数从右往左压栈，call 把返回地址压进去，add 用 push ebp、mov ebp, esp 建自己的栈帧，用 [ebp+8]、[ebp+12] 取参数，结果放 eax，最后 leave、ret 原路返回。右边的栈一格格跟着变。', 'Watch the stack as caller calls add: arguments, the return address, the new frame, the result in eax, then leave and ret.'),
    rect: [0, 90, 1170, Y0 + (sim.ok ? sim.P.caller.length + sim.P.add.length + 2 : 26) * LH + 20],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => {
    const ins = s.ins;
    const R = s.regs;
    const B = s.before;
    let d;
    switch (ins.k) {
      case 'push ebp': d = T(`esp 减 4 变成 ${hx(R.esp)}，把${ins.fn === 'caller' ? ' main ' : ' caller '}的 ebp（${hx(B.ebp)}）存进去，返回时要恢复它。`, `Save the old ebp ${hx(B.ebp)} at ${hx(R.esp)}.`); break;
      case 'mov ebp, esp': d = T(`ebp = esp = ${hx(R.ebp)}：${ins.fn} 的栈帧从这里开始，以后用 ebp 加减偏移找参数和局部变量。`, `ebp = ${hx(R.ebp)}: the new frame base.`); break;
      case 'sub': d = T(`esp 减 ${ins.n}，给局部变量留出 ${ins.n / 4} 个字的空间。`, `Reserve ${ins.n} bytes for locals.`); break;
      case 'movLocalImm': d = T(`把 ${ins.v} 写进 [ebp${ins.off}] = ${hx(R.ebp + ins.off)}，这就是局部变量 ${ins.name}。`, `Store ${ins.v} in local ${ins.name}.`); break;
      case 'pushMem': d = T(`把 ${ins.name === 'argY' ? 'y' : 'x'} 的值压栈作为实参${ins.name === 'argY' ? '：参数从右往左压，第 2 个参数 y 先压' : '：第 1 个参数 x 后压，在栈顶'}。`, `Push argument ${ins.name === 'argY' ? 'y' : 'x'}.`); break;
      case 'call': d = T(`把返回地址 ${hx(sim.retAddr)}（call 的下一条指令）压栈，然后跳到 add 的第一条指令 ${hx(R.eip)}。`, `Push ${hx(sim.retAddr)} and jump to add.`); break;
      case 'add esp': d = T('caller 把自己压的两个实参从栈上撤掉（esp 加 8）：cdecl 约定由调用者清理参数。', 'The caller removes its two arguments.'); break;
      case 'movMemReg': d = T(`把 ${ins.reg} 的值 ${R[ins.reg]} 写进 [ebp${ins.off}]，即局部变量 ${ins.name}。`, `Store ${ins.reg} into local ${ins.name}.`); break;
      case 'movRegMem': d = ins.off > 0 ? T(`从 [ebp+${ins.off}]（${hx(R.ebp + ins.off)}）取第 ${ins.off === 8 ? 1 : 2} 个参数：${ins.reg} = ${R[ins.reg]}。`, `Load argument ${ins.off === 8 ? 1 : 2}: ${R[ins.reg]}.`) : T(`把 [ebp${ins.off}] 的值 ${R[ins.reg]} 放进 ${ins.reg}${ins.reg === 'eax' ? '：返回值都放在 eax 里' : ''}。`, `${ins.reg} = ${R[ins.reg]}.`); break;
      case 'addRegMem': d = T(`加上 [ebp+${ins.off}] 的第 2 个参数：${ins.reg} = ${B[ins.reg]} + ${R[ins.reg] - B[ins.reg]} = ${R[ins.reg]}。`, `${ins.reg} = ${R[ins.reg]}.`); break;
      case 'push ebx': d = T(`add 要用 ebx，而 ebx 是被调用者保存的寄存器，所以先把它原来的值 ${hx(B.ebx)} 压栈保存。`, `Save callee-saved ebx (${hx(B.ebx)}).`); break;
      case 'pop ebx': d = T(`返回前把保存的值弹回 ebx，恢复成 ${hx(R.ebx)}，caller 看到的 ebx 没变。`, `Restore ebx = ${hx(R.ebx)}.`); break;
      case 'leave': d = T(`leave = mov esp, ebp + pop ebp：撤掉 ${ins.fn} 的栈帧，ebp 恢复成 ${hx(R.ebp)}，esp 指向返回地址。`, `Tear down the frame: ebp = ${hx(R.ebp)}.`); break;
      default: d = ins.fn === 'add' ? T(`弹出返回地址 ${hx(R.eip)}，回到 caller 里 call 的下一条。此时 eax = ${R.eax} 就是 add 的返回值。`, `Return to ${hx(R.eip)} with eax = ${R.eax}.`) : T(`caller 也返回，回到 main（${hx(R.eip)}），返回值 eax = ${R.eax}。`, `caller returns ${R.eax} to main.`);
    }
    const ref = ['push ebx', 'pop ebx'].includes(ins.k) ? 'save' : ['pushMem', 'call', 'ret', 'leave', 'add esp'].includes(ins.k) ? 'call' : 'frame';
    return { title: T(`${ins.fn}: ${ins.t}`, `${ins.fn}: ${ins.t}`), desc: T(`esp = ${hx(R.esp)}`, `esp = ${hx(R.esp)}`), detail: d, ref, st: { k }, row: { color: ins.fn === 'add' ? 'green' : 'blue', what: T(ins.t, ins.t), result: T(`esp ${hx(R.esp)}`, `esp ${hx(R.esp)}`), tone: 'info' } };
  });
  const title = T(`add(${sim.a}, ${sim.b}) = ${sim.result}，栈恢复原样`, `add(${sim.a}, ${sim.b}) = ${sim.result}`);
  const text = T(`最后 esp = 0x1004、ebp = 0x1018，和进入 caller 之前（再弹出返回地址）一致${sim.saveEbx ? '；ebx 仍是 0x77' : ''}。`, 'esp and ebp are back where they started.');
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeCallFrame = make('call-frame', SPEC, ERR, build);
