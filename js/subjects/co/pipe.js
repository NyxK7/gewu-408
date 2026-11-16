// 五段指令流水线（IF ID EX MEM WB）的数据冒险：逐条算出每条指令各段所在的时钟周期、阻塞了几拍、哪里用了转发。
// 约定（界面上写明）：
//   · 指令在 ID 段读寄存器，在 WB 段写寄存器；分离的指令 / 数据存储器，没有结构冒险；只讨论数据冒险（RAW），不含分支；
//   · 寄存器堆「前半周期写、后半周期读」（splitRF）：同一周期 WB 写入的值，ID 能读到；关掉则必须晚一个周期；
//   · 无转发：后续指令的 ID 不能早于产生结果的指令的 WB（splitRF）；
//   · 有转发：ALU 结果在 EX 之后即可转发给下一条的 EX；load 的结果在 MEM 之后才有，紧跟其后用到它的指令要阻塞 1 拍（load-use）；
//   · 源操作数一律按「EX 段要用」处理（sw 要存的数据也一样），阻塞时指令停在 ID，后面的指令停在 IF。

const OPS = {
  add: 'R', sub: 'R', and: 'R', or: 'R', xor: 'R', slt: 'R',
  addi: 'I', andi: 'I', ori: 'I',
  lw: 'L', sw: 'S', nop: 'N',
};

const REG = /^\$?r?(\d{1,2})$/i;
const reg = (s) => {
  const m = String(s).trim().match(REG);
  return m && Number(m[1]) < 32 ? Number(m[1]) : null;
};

/** 解析一条指令，返回 { op, dst, src: [], text } 或 null */
export function parseInstr(line) {
  const t = line.trim().replace(/\s+/g, ' ');
  const m = t.match(/^([a-z]+)\s*(.*)$/i);
  if (!m) return null;
  const op = m[1].toLowerCase();
  const kind = OPS[op];
  if (!kind) return null;
  const args = m[2] ? m[2].split(',').map((x) => x.trim()) : [];
  const mem = (a) => {
    const mm = a?.match(/^(-?\d+)?\s*\(\s*([^)]+)\s*\)$/);
    return mm ? reg(mm[2]) : null;
  };
  let dst = null;
  let src = [];
  if (kind === 'R') {
    if (args.length !== 3) return null;
    [dst, ...src] = args.map(reg);
  } else if (kind === 'I') {
    if (args.length !== 3 || !/^-?\d+$/.test(args[2])) return null;
    dst = reg(args[0]);
    src = [reg(args[1])];
  } else if (kind === 'L') {
    if (args.length !== 2) return null;
    dst = reg(args[0]);
    src = [mem(args[1])];
  } else if (kind === 'S') {
    if (args.length !== 2) return null;
    src = [reg(args[0]), mem(args[1])];
  } else if (args.length) return null;
  if (dst === null && kind !== 'S' && kind !== 'N') return null;
  if (src.some((r) => r === null)) return null;
  return { op, kind, dst: dst === 0 ? null : dst, src: src.filter((r) => r !== 0), text: `${op}${args.length ? ' ' + args.join(', ') : ''}` };
}

export function parseProgram(text) {
  const lines = String(text).split(/[;\n]+/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const [i, l] of lines.entries()) {
    const ins = parseInstr(l);
    if (!ins) return { ok: false, bad: i + 1, line: l };
    out.push(ins);
  }
  return { ok: true, prog: out };
}

export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];

export function simulate({ prog: text, forward = false, splitRF = true }) {
  const parsed = parseProgram(text);
  if (!parsed.ok) return { ok: false, errors: [['line', { n: parsed.bad, line: parsed.line }]] };
  const prog = parsed.prog;
  if (!prog.length || prog.length > 8) return { ok: false, errors: [['count']] };

  const rows = [];
  for (const [i, ins] of prog.entries()) {
    // 前一条离开 IF（进入 ID）之后，取指部件才空出来
    const fetch = i === 0 ? 1 : Math.max(rows[i - 1].fetch + 1, rows[i - 1].earliest);
    // 进入 ID 的最早周期：取指之后，并且前一条已经离开 ID
    const earliest = Math.max(fetch + 1, i === 0 ? 0 : rows[i - 1].id + 1);
    let need = earliest;
    const deps = [];
    for (const r of ins.src) {
      // 最近一条写 r 的指令
      let j = i - 1;
      while (j >= 0 && prog[j].dst !== r) j--;
      if (j < 0) continue;
      const pj = rows[j];
      let req;
      let how;
      if (forward) {
        if (prog[j].kind === 'L') {
          req = pj.mem; // 下一周期 EX 才能拿到 MEM 读出的数据
          how = 'mem';
        } else {
          req = pj.ex;
          how = 'ex';
        }
        // 结果已经写回寄存器堆时，直接在 ID 读到，不需要转发
        if (earliest >= (splitRF ? pj.wb : pj.wb + 1)) how = 'rf';
      } else {
        req = splitRF ? pj.wb : pj.wb + 1;
        how = 'rf';
      }
      deps.push({ reg: r, from: j, req, how });
      need = Math.max(need, req);
    }
    const id = need;
    const row = { i, ins, fetch, earliest, id, ex: id + 1, mem: id + 2, wb: id + 3, stall: id - earliest, held: earliest - (fetch + 1), deps };
    // 转发：真正用到旁路的依赖（结果还没写回寄存器堆）
    row.fwd = forward ? deps.filter((d) => d.how !== 'rf' && id < (splitRF ? rows[d.from].wb : rows[d.from].wb + 1)).map((d) => ({ ...d, at: d.how === 'mem' ? rows[d.from].mem : rows[d.from].ex })) : [];
    // 造成阻塞的那个依赖
    row.cause = row.stall > 0 ? deps.filter((d) => d.req === id && d.req > earliest)[0] ?? null : null;
    rows.push(row);
  }
  const total = rows.at(-1).wb;
  // 每个周期每条指令在干什么：'IF' 'ID' 'EX' 'MEM' 'WB'，或 'stall'（停在 ID）/ 'hold'（停在 IF）
  const cells = rows.map((r) => {
    const c = {};
    c[r.fetch] = 'IF';
    for (let t = r.fetch + 1; t < r.fetch + 1 + r.held; t++) c[t] = 'hold';
    for (let t = r.fetch + 1 + r.held; t < r.id; t++) c[t] = 'stall';
    c[r.id] = 'ID';
    c[r.ex] = 'EX';
    c[r.mem] = 'MEM';
    c[r.wb] = 'WB';
    return c;
  });
  const stalls = rows.reduce((a, r) => a + r.stall, 0);
  return { ok: true, prog, rows, cells, total, stalls, forward, splitRF, ideal: prog.length + 4 };
}
