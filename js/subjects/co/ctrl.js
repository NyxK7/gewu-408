// if 与循环的机器级表示：几段 C 代码和对应的简化 x86 汇编（Intel 格式），逐条执行，记下寄存器、标志位和程序走向。
// 约定：参数事先放在寄存器里（用 mov 立即数装入）；32 位有符号比较；jmp / jcc 都是 2 字节的短跳转，
// 转移目标 = 下一条指令的地址 + 偏移量（偏移量是一个字节的补码）。

const err = (errors) => ({ ok: false, errors });
const OPC = { jmp: 'EB', jle: '7E', jl: '7C', jg: '7F', jge: '7D', je: '74', jne: '75' };
const COND = {
  jle: (f) => f.ZF || f.SF !== f.OF,
  jl: (f) => f.SF !== f.OF,
  jg: (f) => !f.ZF && f.SF === f.OF,
  jge: (f) => f.SF === f.OF,
  je: (f) => f.ZF,
  jne: (f) => !f.ZF,
  jmp: () => true,
};

export const PROGS = {
  ifelse: {
    c: ['int max(int a, int b) {', '  int m;', '  if (a > b)', '    m = a;', '  else', '    m = b;', '  return m;', '}'],
    asm: (p) => [
      { op: 'mov', a: ['eax', p.a], c: 0, note: 'a' },
      { op: 'mov', a: ['ebx', p.b], c: 0, note: 'b' },
      { op: 'cmp', a: ['eax', 'ebx'], c: 2 },
      { op: 'jle', a: ['ELSE'], c: 2 },
      { op: 'mov', a: ['ecx', 'eax'], c: 3 },
      { op: 'jmp', a: ['END'], c: 4 },
      { label: 'ELSE', op: 'mov', a: ['ecx', 'ebx'], c: 5 },
      { label: 'END', op: 'mov', a: ['eax', 'ecx'], c: 6 },
      { op: 'ret', a: [], c: 6 },
    ],
  },
  while: {
    c: ['int sum(int n) {', '  int s = 0, i = 1;', '  while (i <= n) {', '    s += i;', '    i++;', '  }', '  return s;', '}'],
    asm: (p) => [
      { op: 'mov', a: ['ecx', p.n], c: 0, note: 'n' },
      { op: 'mov', a: ['eax', 0], c: 1, note: 's' },
      { op: 'mov', a: ['edx', 1], c: 1, note: 'i' },
      { op: 'jmp', a: ['TEST'], c: 2 },
      { label: 'BODY', op: 'add', a: ['eax', 'edx'], c: 3 },
      { op: 'inc', a: ['edx'], c: 4 },
      { label: 'TEST', op: 'cmp', a: ['edx', 'ecx'], c: 2 },
      { op: 'jle', a: ['BODY'], c: 2 },
      { op: 'ret', a: [], c: 6 },
    ],
  },
  dowhile: {
    c: ['int sum2(int n) {', '  int s = 0, i = 1;', '  do {', '    s += i;', '    i++;', '  } while (i <= n);', '  return s;', '}'],
    asm: (p) => [
      { op: 'mov', a: ['ecx', p.n], c: 0, note: 'n' },
      { op: 'mov', a: ['eax', 0], c: 1, note: 's' },
      { op: 'mov', a: ['edx', 1], c: 1, note: 'i' },
      { label: 'BODY', op: 'add', a: ['eax', 'edx'], c: 3 },
      { op: 'inc', a: ['edx'], c: 4 },
      { op: 'cmp', a: ['edx', 'ecx'], c: 5 },
      { op: 'jle', a: ['BODY'], c: 5 },
      { op: 'ret', a: [], c: 6 },
    ],
  },
};

const sizeOf = (ins) => (ins.op === 'mov' && typeof ins.a[1] === 'number' ? 5 : ins.op in OPC ? 2 : ins.op === 'inc' || ins.op === 'ret' ? 1 : 2);
const to32 = (v) => v | 0;

export function runCtrl({ prog = 'ifelse', a = 7, b = 3, n = 3, base = 0x401000 }) {
  const errors = [];
  const P = PROGS[prog];
  if (!P) errors.push('prog');
  for (const [k, v, lo, hi] of [['a', a, -1000, 1000], ['b', b, -1000, 1000], ['n', n, -2, 8]]) if (!Number.isInteger(v) || v < lo || v > hi) errors.push(k);
  if (errors.length) return err(errors);
  const code = P.asm({ a, b, n });
  // 排地址
  let addr = base;
  for (const ins of code) {
    ins.addr = addr;
    ins.size = sizeOf(ins);
    addr += ins.size;
  }
  const at = Object.fromEntries(code.filter((x) => x.label).map((x) => [x.label, x.addr]));
  for (const ins of code) {
    if (ins.op in OPC) {
      ins.target = at[ins.a[0]];
      ins.disp = ins.target - (ins.addr + ins.size);
      ins.bytes = `${OPC[ins.op]} ${((ins.disp + 256) % 256).toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  const R = { eax: 0, ebx: 0, ecx: 0, edx: 0 };
  let F = { ZF: false, SF: false, OF: false, CF: false };
  const val = (x) => (typeof x === 'number' ? x : R[x]);
  const trace = [];
  let pc = 0;
  for (let guard = 0; guard < 200; guard++) {
    const ins = code[pc];
    const before = { ...R };
    let taken = null;
    let next = pc + 1;
    if (ins.op === 'mov') R[ins.a[0]] = val(ins.a[1]);
    else if (ins.op === 'add') R[ins.a[0]] = to32(R[ins.a[0]] + val(ins.a[1]));
    else if (ins.op === 'inc') R[ins.a[0]] = to32(R[ins.a[0]] + 1);
    else if (ins.op === 'cmp') {
      const x = R[ins.a[0]];
      const y = val(ins.a[1]);
      const d = to32(x - y);
      F = { ZF: d === 0, SF: d < 0, OF: (x < 0) !== (y < 0) && (d < 0) !== (x < 0), CF: x >>> 0 < y >>> 0 };
    } else if (ins.op in COND) {
      taken = COND[ins.op](F);
      if (taken) next = code.findIndex((c) => c.addr === ins.target);
    }
    trace.push({ i: pc, ins, before, regs: { ...R }, flags: { ...F }, taken, nextAddr: next < code.length ? code[next].addr : null });
    if (ins.op === 'ret') break;
    pc = next;
  }
  const loops = trace.filter((t) => t.ins.c === 3).length;
  return { ok: true, prog, a, b, n, code, c: P.c, trace, result: R.eax, loops, count: trace.length };
}
