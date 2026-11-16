// 存储器层次结构的纯计算：主存容量扩展、Cache 地址划分与总容量、Cache 写策略、多体交叉存储器。
//
// 约定（界面上写明）：
//   · 主存扩展：容量以 K 字（1K = 1024）为单位；芯片按组编号，组号由高位地址经译码器选出；
//   · Cache 写策略：直接映射，访问序列写主存块号；全写法配非写分配，写回法配写分配；
//     全写法每次写都写一个字到主存，写回法换出脏块时写回整块；
//   · 多体交叉：m 个体，每个体存取周期 T，总线每隔 r = T / m 可以启动一次新的访问；同一个体要等上一次访问结束。

import { log2, pow2 } from './kit.js';

const err = (e) => ({ ok: false, errors: [e] });

export function memExt({ chipK, chipBits, memK, memBits, base = 0 }) {
  if (![chipK, memK].every(pow2) || ![chipBits, memBits].every((b) => [1, 2, 4, 8, 16, 32].includes(b))) return err('size');
  if (memBits % chipBits || memK % chipK || memK < chipK || memBits < chipBits) return err('fit');
  const words = chipK * 1024;
  if (base % words) return err('base');
  const bitN = memBits / chipBits;
  const wordN = memK / chipK;
  const chipAddr = log2(words);
  const totalAddr = log2(memK * 1024);
  const sel = totalAddr - chipAddr;
  const groups = Array.from({ length: wordN }, (_, g) => ({
    g,
    start: base + g * words,
    end: base + (g + 1) * words - 1,
    chips: Array.from({ length: bitN }, (_, j) => ({ hi: memBits - 1 - j * chipBits, lo: memBits - (j + 1) * chipBits })),
  }));
  return { ok: true, chipK, chipBits, memK, memBits, base, bitN, wordN, chips: bitN * wordN, chipAddr, totalAddr, sel, groups };
}

export function cacheAddr({ addrBits, cacheKB, blockB, ways, wb, lru, addr }) {
  if (!(Number.isInteger(addrBits) && addrBits >= 12 && addrBits <= 40)) return err('addrBits');
  if (![cacheKB, blockB].every(pow2)) return err('pow2');
  const lines = (cacheKB * 1024) / blockB;
  if (!(lines >= 1)) return err('pow2');
  const W = ways === 0 ? lines : ways;
  if (!pow2(W) || W > lines) return err('ways');
  const sets = lines / W;
  const offset = log2(blockB);
  const index = log2(sets);
  const tag = addrBits - index - offset;
  if (tag < 0) return err('small');
  const repl = lru && W > 1 ? log2(W) : 0;
  const perLine = 1 + (wb ? 1 : 0) + repl + tag;
  const data = blockB * 8;
  const a = parseInt(String(addr).replace(/^0x/i, ''), 16);
  if (!(a >= 0 && a < 2 ** addrBits)) return err('addr');
  const blockNo = Math.floor(a / blockB);
  return {
    ok: true,
    addrBits,
    cacheKB,
    blockB,
    ways: W,
    full: ways === 0,
    lines,
    sets,
    offset,
    index,
    tag,
    wb,
    repl,
    perLine,
    data,
    total: lines * (perLine + data),
    a,
    bin: a.toString(2).padStart(addrBits, '0'),
    blockNo,
    set: blockNo % sets,
    tagVal: Math.floor(blockNo / sets),
    off: a % blockB,
  };
}

export function parseRW(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[\s,，]+/).filter(Boolean)) {
    const m = it.match(/^([RrWw])(\d+)$/);
    if (!m) return null;
    out.push({ op: m[1].toUpperCase(), b: +m[2] });
  }
  return out;
}
export function cacheWrite({ lines, ops, policy }) {
  if (!(Number.isInteger(lines) && lines >= 1 && lines <= 8)) return err('lines');
  const list = parseRW(ops);
  if (!list || !list.length || list.length > 16) return err('ops');
  const L = Array.from({ length: lines }, () => null);
  let reads = 0;
  let writes = 0;
  const steps = list.map(({ op, b }) => {
    const i = b % lines;
    const cur = L[i];
    const hit = cur?.b === b;
    const acts = [];
    if (policy === 'wt') {
      if (op === 'R') {
        if (!hit) {
          L[i] = { b, dirty: false };
          reads++;
          acts.push('load');
        }
      } else {
        writes++;
        acts.push(hit ? 'writeBoth' : 'writeMemOnly');
      }
    } else {
      if (!hit) {
        if (cur?.dirty) {
          writes++;
          acts.push('writeback');
        }
        L[i] = { b, dirty: false };
        reads++;
        acts.push('load');
      }
      if (op === 'W') {
        L[i].dirty = true;
        acts.push('dirty');
      }
    }
    return { op, b, line: i, hit, victim: !hit && cur ? cur.b : null, acts, L: L.map((x) => (x ? { ...x } : null)), reads, writes };
  });
  return { ok: true, lines, policy, steps, reads, writes, dirtyLeft: L.filter((x) => x?.dirty).length };
}

export function interleave({ m, T, addrs, mode, bankWords }) {
  if (![2, 4, 8].includes(m)) return err('m');
  if (!(Number.isInteger(T) && T > 0 && T % m === 0)) return err('T');
  if (!Array.isArray(addrs) || !addrs.length || addrs.length > 12) return err('addrs');
  if (mode === 'high' && !(Number.isInteger(bankWords) && bankWords >= 1)) return err('bankWords');
  if (mode === 'high' && addrs.some((a) => a >= m * bankWords)) return err('range');
  const r = T / m;
  const free = Array(m).fill(0);
  let prev = -Infinity;
  const acc = addrs.map((a, i) => {
    const bank = mode === 'low' ? a % m : Math.floor(a / bankWords);
    const bus = i === 0 ? 0 : prev + r;
    const start = Math.max(bus, free[bank]);
    const conflict = free[bank] > bus;
    free[bank] = start + T;
    prev = start;
    return { a, bank, inBank: mode === 'low' ? Math.floor(a / m) : a % bankWords, start, end: start + T, conflict };
  });
  const total = Math.max(...acc.map((x) => x.end));
  return { ok: true, m, T, r, mode, bankWords, acc, total, serial: addrs.length * T, ideal: T + (addrs.length - 1) * r };
}
