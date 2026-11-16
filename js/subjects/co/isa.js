// 指令系统的纯计算：扩展操作码、寻址方式、x86 的 cmp 与条件转移、相对转移的目标地址。
//
// 约定（界面上写明）：
//   · 扩展操作码：从三地址指令开始，每一级没用完的操作码作为扩展标志，后面跟着下一级的扩展操作码；
//   · 相对寻址：EA = (PC) + A，PC 已经指向下一条指令；
//   · 内存写成「地址:内容」，都是十进制。

import { addsub } from './arith.js';

const err = (e) => ({ ok: false, errors: [e] });

export function opcode({ L, A, counts }) {
  if (!(Number.isInteger(L) && L >= 8 && L <= 32)) return err('L');
  if (!(Number.isInteger(A) && A >= 2 && A <= 8 && 3 * A < L)) return err('A');
  if (!Array.isArray(counts) || counts.length !== 4) return err('counts');
  const levels = [];
  let avail = null;
  let base = 0;
  for (let i = 0; i < 4; i++) {
    const k = 3 - i;
    const w = L - k * A;
    const want = counts[i];
    if (avail == null) {
      if (!want) continue;
      avail = 2 ** w;
    } else {
      base *= 2 ** A;
      avail *= 2 ** A;
    }
    const later = counts.slice(i + 1).some((c) => c);
    const used = want === -1 ? avail : want;
    if (used > avail || (used === avail && later)) return { ok: false, errors: [['need', { k, avail, want: used }]] };
    levels.push({ k, w, avail, used, base, first: base, last: base + used - 1, left: avail - used });
    base += used;
    avail -= used;
    if (!later) break;
  }
  if (!levels.length) return err('counts');
  return { ok: true, L, A, levels, spare: avail };
}

export function parseMem(text) {
  const mem = {};
  for (const it of String(text ?? '').split(/[\s,，;；]+/).filter(Boolean)) {
    const m = it.match(/^(\d+):(-?\d+)$/);
    if (!m) return null;
    mem[+m[1]] = +m[2];
  }
  return mem;
}
export function addressing({ A, R, PC, BR, IX, mem }) {
  const M = parseMem(mem);
  if (!M) return err('mem');
  const rd = (a) => (a in M ? M[a] : null);
  const modes = [
    { id: 'imm', ea: null, val: A, acc: 0 },
    { id: 'dir', ea: A, val: rd(A), acc: 1 },
    { id: 'ind', ea: rd(A), val: rd(A) == null ? null : rd(rd(A)), acc: 2, mid: A },
    { id: 'reg', ea: null, val: R, acc: 0 },
    { id: 'regind', ea: R, val: rd(R), acc: 1 },
    { id: 'rel', ea: PC + A, val: rd(PC + A), acc: 1 },
    { id: 'base', ea: BR + A, val: rd(BR + A), acc: 1 },
    { id: 'index', ea: IX + A, val: rd(IX + A), acc: 1 },
  ];
  return { ok: true, A, R, PC, BR, IX, mem: M, modes };
}

const COND = [
  ['je', 'ZF = 1', (f) => f.ZF === 1, 'eq'],
  ['jne', 'ZF = 0', (f) => f.ZF === 0, 'eq'],
  ['jg', 'ZF = 0 且 SF = OF', (f) => f.ZF === 0 && f.SF === f.OF, 's'],
  ['jge', 'SF = OF', (f) => f.SF === f.OF, 's'],
  ['jl', 'SF ≠ OF', (f) => f.SF !== f.OF, 's'],
  ['jle', 'ZF = 1 或 SF ≠ OF', (f) => f.ZF === 1 || f.SF !== f.OF, 's'],
  ['ja', 'CF = 0 且 ZF = 0', (f) => f.CF === 0 && f.ZF === 0, 'u'],
  ['jae', 'CF = 0', (f) => f.CF === 0, 'u'],
  ['jb', 'CF = 1', (f) => f.CF === 1, 'u'],
  ['jbe', 'CF = 1 或 ZF = 1', (f) => f.CF === 1 || f.ZF === 1, 'u'],
];
export function cmpJump({ a, b, n, ip, len, disp }) {
  const s = addsub({ a, b, op: 'sub', n });
  if (!s.ok) return s;
  const ipv = parseInt(String(ip).replace(/^0x/i, ''), 16);
  const dv = parseInt(String(disp).replace(/^0x/i, ''), 16);
  if (!(ipv >= 0) || !(Number.isInteger(len) && len >= 2 && len <= 6) || !(dv >= 0 && dv <= 255)) return err('jump');
  const d = dv >= 128 ? dv - 256 : dv;
  const conds = COND.map(([op, rule, f, kind]) => ({ op, rule, kind, take: f(s.flags) }));
  return { ok: true, s, conds, ip: ipv, len, disp: dv, d, next: ipv + len, target: ipv + len + d };
}
