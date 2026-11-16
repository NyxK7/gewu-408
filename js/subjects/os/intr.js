// 操作系统基础的纯计算：一段用户程序在 CPU 上执行时，遇到系统调用、外部中断、缺页、非法操作，
// CPU 什么时候从用户态进入内核态、断点保存的是哪条指令、处理完回到哪里。
//
// 程序写成一串记号（每个记号是一条指令，irq 除外）：
//   add      普通指令，用户态可以执行；
//   syscall  陷入指令（访管指令）：本身在用户态执行，执行后进入内核处理系统调用，返回到**下一条**指令；
//   pf       访问了不在内存的页：指令没执行完就产生缺页故障，内核调页后返回，**重新执行这条**指令；
//   priv     特权指令（例如关中断、设置时钟、I/O 指令）：在用户态执行属于非法操作，内核终止这个进程；
//   div0     整数除以 0：内核无法修复，终止这个进程；
//   irq      不是指令，表示前一条指令执行期间来了一个外部中断请求（I/O 完成、时钟到时）：
//            CPU 在这条指令执行完后的中断周期检测到它，进入内核处理，返回到**下一条**指令。
// 每次「用户态 → 内核态」都由中断或异常引起（连着来的两个中断 / 异常，内核处理完一个接着处理下一个，中间不回用户态）；内核用一条特权指令（中断返回）回到用户态。
//
// 输出 boxes：时间顺序的执行片段，lane 'u' 是用户态，'k' 是内核态。

export const KINDS = ['add', 'syscall', 'pf', 'priv', 'div0', 'irq'];

export function parseProg(text) {
  const out = String(text ?? '')
    .toLowerCase()
    .split(/[\s,，;；]+/)
    .filter(Boolean);
  if (!out.length || out.some((x) => !KINDS.includes(x))) return null;
  return out;
}

export function run({ prog }) {
  if (!Array.isArray(prog) || !prog.length || prog.some((x) => !KINDS.includes(x))) return { ok: false, errors: ['prog'] };
  if (prog.filter((x) => x !== 'irq').length > 8) return { ok: false, errors: ['len'] };
  // 给真正的指令编号（从 1 开始），irq 不占编号
  const ins = [];
  for (const t of prog) if (t !== 'irq') ins.push(t);
  const boxes = [];
  let entries = 0;
  let killed = null;
  let n = 0; // 已经看过的指令条数
  let done = 0; // 执行完成的指令条数
  const enter = (cause, ret, extra = {}) => {
    entries++;
    boxes.push({ lane: 'k', cause, ret, ...extra });
  };
  for (let p = 0; p < prog.length && !killed; p++) {
    const t = prog[p];
    if (t === 'irq') {
      // 前一条指令执行完后检测到；返回到下一条指令（如果后面已经没有指令，就是程序结束处）
      const after = n;
      const ret = n + 1 <= ins.length ? n + 1 : null;
      enter('irq', ret, { after });
      continue;
    }
    n++;
    if (t === 'add') {
      boxes.push({ lane: 'u', i: n, t, ok: true });
      done++;
    } else if (t === 'syscall') {
      boxes.push({ lane: 'u', i: n, t, ok: true });
      done++;
      enter('trap', n + 1 <= ins.length ? n + 1 : null, { i: n });
    } else if (t === 'pf') {
      boxes.push({ lane: 'u', i: n, t, ok: false });
      enter('fault', n, { i: n });
      boxes.push({ lane: 'u', i: n, t, ok: true, retry: true });
      done++;
    } else {
      boxes.push({ lane: 'u', i: n, t, ok: false });
      enter('abort', null, { i: n, why: t });
      killed = { i: n, why: t };
    }
  }
  // 每个内核片段之后是否回到用户态
  for (let b = 0; b < boxes.length; b++) {
    const x = boxes[b];
    if (x.lane === 'k') x.back = x.cause !== 'abort' && boxes[b + 1]?.lane === 'u';
  }
  // 真正的「用户态 → 内核态」切换：前一个片段在用户态（连着两段内核处理只算一次）
  const switches = boxes.filter((x, b) => x.lane === 'k' && boxes[b - 1]?.lane !== 'k').length;
  return { ok: true, prog, ins, boxes, entries, switches, killed, done, total: ins.length, skipped: killed ? ins.length - killed.i : 0 };
}
