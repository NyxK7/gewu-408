// 过程调用与栈帧的纯计算（IA-32，cdecl 约定，Intel 格式）：caller 里调用 add(x, y)，逐条执行，记下寄存器和栈里每个字。
//   int add(int x, int y) { int t = x + y; return t; }
//   int caller() { int x = A, y = B; int s = add(x, y); return s; }
// 约定：栈从高地址往低地址长，每个字 4 字节；参数从右往左压栈，调用者负责清理参数；返回值放在 eax；
// ebx 是被调用者保存的寄存器——add 想用它，就要先压栈保存、返回前恢复（选项 saveEbx）。

const err = (errors) => ({ ok: false, errors });
const SZ = { 'push ebp': 1, 'mov ebp, esp': 2, sub: 3, movLocalImm: 7, pushMem: 3, call: 5, 'add esp': 3, movMemReg: 3, movRegMem: 3, addRegMem: 3, leave: 1, ret: 1, 'push ebx': 1, 'pop ebx': 1 };

function program(a, b, saveEbx) {
  const caller = [
    { t: 'push ebp', k: 'push ebp' },
    { t: 'mov ebp, esp', k: 'mov ebp, esp' },
    { t: 'sub esp, 12', k: 'sub', n: 12 },
    { t: `mov dword [ebp-4], ${a}`, k: 'movLocalImm', off: -4, v: a, name: 'x' },
    { t: `mov dword [ebp-8], ${b}`, k: 'movLocalImm', off: -8, v: b, name: 'y' },
    { t: 'push dword [ebp-8]', k: 'pushMem', off: -8, name: 'argY' },
    { t: 'push dword [ebp-4]', k: 'pushMem', off: -4, name: 'argX' },
    { t: 'call add', k: 'call' },
    { t: 'add esp, 8', k: 'add esp', n: 8 },
    { t: 'mov [ebp-12], eax', k: 'movMemReg', off: -12, reg: 'eax', name: 's' },
    { t: 'mov eax, [ebp-12]', k: 'movRegMem', off: -12, reg: 'eax' },
    { t: 'leave', k: 'leave' },
    { t: 'ret', k: 'ret' },
  ];
  const r = saveEbx ? 'ebx' : 'eax';
  const add = [
    { t: 'push ebp', k: 'push ebp' },
    { t: 'mov ebp, esp', k: 'mov ebp, esp' },
    { t: 'sub esp, 4', k: 'sub', n: 4 },
    ...(saveEbx ? [{ t: 'push ebx', k: 'push ebx' }] : []),
    { t: `mov ${r}, [ebp+8]`, k: 'movRegMem', off: 8, reg: r },
    { t: `add ${r}, [ebp+12]`, k: 'addRegMem', off: 12, reg: r },
    { t: `mov [ebp-4], ${r}`, k: 'movMemReg', off: -4, reg: r, name: 't' },
    { t: 'mov eax, [ebp-4]', k: 'movRegMem', off: -4, reg: 'eax' },
    ...(saveEbx ? [{ t: 'pop ebx', k: 'pop ebx' }] : []),
    { t: 'leave', k: 'leave' },
    { t: 'ret', k: 'ret' },
  ];
  let addr = 0x401000;
  for (const ins of caller) {
    ins.fn = 'caller';
    ins.addr = addr;
    addr += SZ[ins.k];
  }
  addr = 0x401040;
  for (const ins of add) {
    ins.fn = 'add';
    ins.addr = addr;
    addr += SZ[ins.k];
  }
  return { caller, add };
}

export function frame({ a = 3, b = 5, saveEbx = false }) {
  const errors = [];
  if (!Number.isInteger(a) || Math.abs(a) > 9999) errors.push('a');
  if (!Number.isInteger(b) || Math.abs(b) > 9999) errors.push('b');
  if (errors.length) return err(errors);
  const P = program(a, b, saveEbx);
  const R = { eip: P.caller[0].addr, esp: 0x1000, ebp: 0x1018, eax: 0, ebx: 0x77 };
  const mem = { 0x1000: { v: 0x4010a5, what: 'retMain', live: true } }; // 调用 caller 时压的返回地址（回到 main）
  const word = (addr) => mem[addr]?.v ?? 0;
  const write = (addr, v, what) => (mem[addr] = { v, what, live: true });
  const steps = [];
  let fn = 'caller';
  let i = 0;
  for (let guard = 0; guard < 60; guard++) {
    const code = P[fn];
    const ins = code[i];
    const before = { ...R };
    let jumpTo = null;
    const ea = (off) => R.ebp + off;
    const kill = (lo, hi) => {
      for (const a2 of Object.keys(mem).map(Number)) if (a2 >= lo && a2 < hi) mem[a2].live = false;
    };
    switch (ins.k) {
      case 'push ebp':
        R.esp -= 4;
        write(R.esp, R.ebp, fn === 'caller' ? 'oldEbpMain' : 'oldEbpCaller');
        break;
      case 'push ebx':
        R.esp -= 4;
        write(R.esp, R.ebx, 'savedEbx');
        break;
      case 'pop ebx':
        R.ebx = word(R.esp);
        mem[R.esp].live = false;
        R.esp += 4;
        break;
      case 'mov ebp, esp':
        R.ebp = R.esp;
        break;
      case 'sub':
        R.esp -= ins.n;
        for (let x = R.esp; x < R.esp + ins.n; x += 4) if (!mem[x]?.live) mem[x] = { v: null, what: 'local', live: true };
        break;
      case 'movLocalImm':
        write(ea(ins.off), ins.v, ins.name);
        break;
      case 'pushMem': {
        const v = word(ea(ins.off));
        R.esp -= 4;
        write(R.esp, v, ins.name);
        break;
      }
      case 'call': {
        const ret = ins.addr + SZ.call;
        R.esp -= 4;
        write(R.esp, ret, 'retCaller');
        jumpTo = ['add', 0];
        break;
      }
      case 'add esp':
        kill(R.esp, R.esp + ins.n);
        R.esp += ins.n;
        break;
      case 'movMemReg':
        write(ea(ins.off), R[ins.reg], ins.name);
        break;
      case 'movRegMem':
        R[ins.reg] = word(ea(ins.off));
        break;
      case 'addRegMem':
        R[ins.reg] = (R[ins.reg] + word(ea(ins.off))) | 0;
        break;
      case 'leave':
        kill(R.esp, R.ebp);
        R.esp = R.ebp;
        R.ebp = word(R.esp);
        mem[R.esp].live = false;
        R.esp += 4;
        break;
      case 'ret': {
        const ret = word(R.esp);
        mem[R.esp].live = false;
        R.esp += 4;
        if (fn === 'add') jumpTo = ['caller', P.caller.findIndex((c) => c.addr === ret)];
        else jumpTo = ['main', -1];
        break;
      }
    }
    if (jumpTo) {
      [fn, i] = jumpTo;
    } else i++;
    R.eip = fn === 'main' ? word(0x1000) : P[fn][i].addr;
    steps.push({ ins, regs: { ...R }, before, mem: Object.fromEntries(Object.entries(mem).map(([k, v]) => [k, { ...v }])) });
    if (fn === 'main') break;
  }
  return { ok: true, a, b, saveEbx, P, steps, result: R.eax, ebxKept: R.ebx === 0x77, retAddr: P.caller.find((c) => c.k === 'call').addr + SZ.call };
}
