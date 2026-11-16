// 动态分区分配（可变分区）的纯计算：首次适应 FF / 最佳适应 BF / 最坏适应 WF / 邻近适应 NF，
// 回收时的四种合并情况，以及分配失败时的紧凑。Node 里也能跑（见 tests/partition.test.mjs）。
//
// 本课约定（界面上写明）：
//   · 内存低端 [0, os) 是操作系统，不参与分配，也不会被紧凑移动；
//   · 从选中的空闲分区的低地址端切出所需大小，剩下的部分仍是空闲分区；
//     若剩下的部分小于 minFrag（默认 0，即不设下限），就把整个分区都分配出去，多出的部分成为内部碎片；
//   · FF / NF 按地址递增查找；BF 按大小递增、WF 按大小递减（大小相同按地址）；
//   · NF 从上次分配结束的位置开始，按地址向后找，到末尾再绕回开头；初始位置是用户区的起点；
//   · 回收时只和地址相邻的空闲分区合并；操作系统区不算空闲分区；
//   · 紧凑（compactOnFail 打开时）：总空闲够但没有一块够大时，把所有进程按原来的顺序移到用户区低端，空闲区集中到高端，再重新分配。

export const ALGOS = ['FF', 'BF', 'WF', 'NF'];

/** 解析操作序列：「A+130」申请，「A-」释放，逗号 / 空格 / 分号分隔 */
export function parseOps(text) {
  const items = String(text ?? '').split(/[\s,，;；]+/).filter(Boolean);
  const ops = [];
  for (const it of items) {
    const m = it.match(/^([A-Za-z][A-Za-z0-9]{0,3})([+-])(\d*)$/);
    if (!m) return { ok: false, bad: it };
    const [, name, sign, num] = m;
    if (sign === '+') {
      if (!num || Number(num) <= 0) return { ok: false, bad: it };
      ops.push({ type: 'alloc', name, size: Number(num) });
    } else {
      if (num) return { ok: false, bad: it };
      ops.push({ type: 'free', name });
    }
  }
  return { ok: true, ops };
}

const copy = (blocks) => blocks.map((b) => ({ ...b }));
const frees = (blocks) => blocks.filter((b) => b.owner === null);

/** 按算法给出空闲分区的查找顺序 */
export function searchOrder(blocks, algo, ptr) {
  const f = frees(blocks);
  if (algo === 'BF') return [...f].sort((a, b) => a.size - b.size || a.start - b.start);
  if (algo === 'WF') return [...f].sort((a, b) => b.size - a.size || a.start - b.start);
  const byAddr = [...f].sort((a, b) => a.start - b.start);
  if (algo === 'NF') return [...byAddr.filter((b) => b.start >= ptr), ...byAddr.filter((b) => b.start < ptr)];
  return byAddr;
}

export function simulate({ mem = 640, os = 40, algo = 'FF', ops: text = '', minFrag = 0, compactOnFail = false }) {
  const errors = [];
  if (!Number.isInteger(mem) || mem < 16 || mem > 8192) errors.push(['mem']);
  if (!Number.isInteger(os) || os < 0 || os >= mem) errors.push(['os']);
  if (!ALGOS.includes(algo)) errors.push(['algo']);
  if (!Number.isInteger(minFrag) || minFrag < 0) errors.push(['minFrag']);
  const parsed = parseOps(text);
  if (!parsed.ok) errors.push(['op', { op: parsed.bad }]);
  else if (!parsed.ops.length || parsed.ops.length > 16) errors.push(['count']);
  if (errors.length) return { ok: false, errors };

  let blocks = [];
  if (os > 0) blocks.push({ start: 0, size: os, owner: 'OS' });
  blocks.push({ start: os, size: mem - os, owner: null });
  let ptr = os;
  const steps = [];
  const live = new Map(); // 进程名 → 分区

  function allocate(op, retry = false) {
    const before = copy(blocks);
    const order = searchOrder(blocks, algo, ptr);
    const checks = [];
    let pick = null;
    for (const b of order) {
      const fit = b.size >= op.size;
      checks.push({ start: b.start, size: b.size, fit });
      if (fit) {
        pick = b;
        break;
      }
    }
    const totalFree = frees(blocks).reduce((a, b) => a + b.size, 0);
    const maxFree = Math.max(0, ...frees(blocks).map((b) => b.size));
    if (!pick) return { kind: 'fail', op, before, after: copy(blocks), order: order.map((b) => ({ ...b })), checks, totalFree, maxFree, external: totalFree >= op.size, ptr, retry };
    const i = blocks.indexOf(pick);
    const rest = pick.size - op.size;
    const whole = rest > 0 && rest < minFrag;
    const given = whole ? pick.size : op.size;
    const part = { start: pick.start, size: given, owner: op.name, need: op.size };
    const repl = [part];
    if (pick.size - given > 0) repl.push({ start: pick.start + given, size: pick.size - given, owner: null });
    blocks.splice(i, 1, ...repl);
    live.set(op.name, part);
    const ptrBefore = ptr;
    ptr = pick.start + given;
    return { kind: 'alloc', op, before, after: copy(blocks), order: order.map((b) => ({ ...b })), checks, chosen: { start: pick.start, size: pick.size }, part: { ...part }, rest: pick.size - given, internal: whole ? rest : 0, ptrBefore, ptr, retry };
  }

  for (const op of parsed.ops) {
    if (op.type === 'alloc') {
      if (live.has(op.name)) return { ok: false, errors: [['dupName', { name: op.name }]] };
      const r = allocate(op);
      steps.push(r);
      if (r.kind === 'fail' && r.external && compactOnFail) {
        // 紧凑：进程按地址顺序挪到用户区低端
        const before = copy(blocks);
        const moves = [];
        let at = os;
        const procs = blocks.filter((b) => b.owner !== null && b.owner !== 'OS').sort((a, b) => a.start - b.start);
        const next = os > 0 ? [{ start: 0, size: os, owner: 'OS' }] : [];
        for (const p of procs) {
          moves.push({ owner: p.owner, from: p.start, to: at, size: p.size });
          const np = { ...p, start: at };
          next.push(np);
          live.set(p.owner, np);
          at += p.size;
        }
        if (at < mem) next.push({ start: at, size: mem - at, owner: null });
        blocks = next;
        ptr = at;
        steps.push({ kind: 'compact', before, after: copy(blocks), moves, free: mem - at, ptr });
        steps.push(allocate(op, true));
      }
    } else {
      const p = live.get(op.name);
      if (!p) return { ok: false, errors: [['noProc', { name: op.name }]] };
      const before = copy(blocks);
      const i = blocks.findIndex((b) => b.owner === op.name);
      const prev = blocks[i - 1];
      const next = blocks[i + 1];
      const pf = prev && prev.owner === null;
      const nf = next && next.owner === null;
      const freed = { start: blocks[i].start, size: blocks[i].size };
      let merged = { start: freed.start, size: freed.size, owner: null };
      let from = i;
      let count = 1;
      if (pf) {
        merged = { start: prev.start, size: prev.size + merged.size, owner: null };
        from = i - 1;
        count++;
      }
      if (nf) {
        merged = { ...merged, size: merged.size + next.size };
        count++;
      }
      blocks.splice(from, count, merged);
      live.delete(op.name);
      const kase = pf && nf ? 'both' : pf ? 'prev' : nf ? 'next' : 'none';
      steps.push({ kind: 'free', op, before, after: copy(blocks), freed, merged: { ...merged }, case: kase, prev: pf ? { start: prev.start, size: prev.size } : null, next: nf ? { start: next.start, size: next.size } : null, freeCountDelta: { none: 1, prev: 0, next: 0, both: -1 }[kase], ptr });
    }
  }
  const final = copy(blocks);
  return {
    ok: true,
    mem,
    os,
    algo,
    minFrag,
    compactOnFail,
    ops: parsed.ops,
    steps,
    final,
    fails: steps.filter((s) => s.kind === 'fail').length,
    totalFree: frees(final).reduce((a, b) => a + b.size, 0),
  };
}

export const freeList = (blocks) => frees(blocks).sort((a, b) => a.start - b.start);
