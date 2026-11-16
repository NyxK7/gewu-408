// 上下文切换的纯计算：从「A 在运行」开始，按触发原因和切换对象，一步步列出 CPU 寄存器、两个 PCB、
// 就绪队列和阻塞队列的变化。
//
// 约定（界面上写明）：
//   · 单 CPU；进入内核时硬件把断点（PC、PSW）压到当前进程的内核栈，其余寄存器由内核保存到 PCB；
//   · 触发原因：时钟中断（时间片用完）、阻塞的系统调用（read 等磁盘）、不阻塞的系统调用（getpid）；
//   · 切换对象：另一个进程（要换页表基址寄存器、TLB 失效），或同一进程里的另一个线程（地址空间不变）；
//   · 就绪队列里排在最前面的是 B。

const err = (e) => ({ ok: false, errors: [e] });

const REGS = ['mode', 'PC', 'SP', 'R0', 'R1', 'PTBR'];

export function contextSwitch({ trigger = 'timer', target = 'process' }) {
  if (!['timer', 'block', 'syscall'].includes(trigger)) return err('trigger');
  if (!['process', 'thread'].includes(target)) return err('target');
  const thread = target === 'thread';
  const A = { name: 'A', state: 'running', PC: 0x1040, SP: 0x7ff0, R0: 5, R1: 9, PTBR: 0x2000, saved: false };
  const B = { name: thread ? 'A₂' : 'B', state: 'ready', PC: 0x3200, SP: thread ? 0x6fe0 : 0x7ff0, R0: 1, R1: 7, PTBR: thread ? 0x2000 : 0x5000, saved: true };
  const cpu = { mode: 'user', PC: 0x1040, SP: 0x7ff0, R0: 5, R1: 9, PTBR: 0x2000 };
  const ready = [B.name, 'C'];
  const blocked = [];
  const run = [{ who: 'A', mode: 'user' }];
  const steps = [];
  let tlbValid = true;
  const push = (kind, extra = {}) =>
    steps.push({ kind, cpu: { ...cpu }, A: { ...A }, B: { ...B }, ready: [...ready], blocked: [...blocked], run: run.map((r) => ({ ...r })), tlbValid, ...extra });

  push('run', { changed: [] });
  // 进入内核
  cpu.mode = 'kernel';
  const brk = cpu.PC + 4; // 断点：下一条指令
  cpu.PC = trigger === 'timer' ? 0x8000 : 0x8100; // 中断处理程序 / 系统调用入口
  run.push({ who: 'A', mode: 'kernel' });
  push('enter', { brk, changed: ['mode', 'PC'] });
  if (trigger === 'syscall') {
    // 不阻塞：内核办完事直接返回 A
    cpu.R0 = 4242; // getpid 的返回值
    push('serve', { changed: ['R0'] });
    cpu.mode = 'user';
    cpu.PC = brk;
    run.push({ who: 'A', mode: 'user' });
    push('back', { changed: ['mode', 'PC'] });
    return { ok: true, trigger, target, thread, steps, switched: false, cost: [] };
  }
  // A 不能继续运行：改状态、进队列
  if (trigger === 'timer') {
    A.state = 'ready';
    ready.push('A');
  } else {
    A.state = 'blocked';
    blocked.push('A');
  }
  push('state', { changed: [] });
  // 保存 A 的上下文到 PCB
  Object.assign(A, { PC: brk, SP: cpu.SP, R0: cpu.R0, R1: cpu.R1, PTBR: cpu.PTBR, saved: true });
  push('save', { changed: ['PC', 'SP', 'R0', 'R1'] });
  // 调度
  ready.shift();
  B.state = 'running';
  push('pick', { changed: [] });
  // 换地址空间
  if (!thread) {
    cpu.PTBR = B.PTBR;
    tlbValid = false;
    push('space', { changed: ['PTBR'] });
  }
  // 恢复 B
  Object.assign(cpu, { SP: B.SP, R0: B.R0, R1: B.R1 });
  push('restore', { changed: ['SP', 'R0', 'R1'] });
  cpu.mode = 'user';
  cpu.PC = B.PC;
  run.push({ who: B.name, mode: 'user' });
  push('resume', { changed: ['mode', 'PC'] });
  const cost = ['mode', 'save', 'sched', ...(thread ? [] : ['space', 'tlb']), 'restore', 'cache'];
  return { ok: true, trigger, target, thread, steps, switched: true, cost };
}

export { REGS };
