// 固态硬盘的纯计算：4 个闪存块，每块 4 页；主机能用的逻辑页只有 0～9（其余是预留空间）。
//   · 写一个逻辑页：写到当前活动块的下一个空闲页，FTL 映射表改指新位置，旧位置标成「无效」（不能原地改写）；
//   · 活动块写满要换一个全空的块；如果这时只剩 1 个全空块，先做垃圾回收：选无效页最多的块，
//     把里面的有效页搬到那个空块，再整块擦除——搬运的写也算闪存写入，这就是写放大；
//   · 回收时选无效页最多的块（一样多时选擦除次数少的）。各块的擦除次数会不均匀——一直存着冷数据的块几乎不被擦，
//     这就是为什么需要磨损均衡（原理页里讲）。

const err = (errors) => ({ ok: false, errors });
export const NB = 4;
export const NP = 4;
export const LOGICAL = 10;

export function parseWrites(text) {
  const parts = String(text ?? '').split(/[\s,，]+/).filter(Boolean);
  if (!parts.length || parts.length > 40 || parts.some((x) => !/^\d+$/.test(x) || +x >= LOGICAL)) return null;
  return parts.map(Number);
}

export function ssd({ writes = '0 1 2 3 4 5 6 7 8 9 0 5 2 7 3 9 0 5 2 7' }) {
  const list = parseWrites(writes);
  const errors = [];
  if (!list) errors.push('writes');
  if (errors.length) return err(errors);
  const blocks = Array.from({ length: NB }, () => ({ pages: Array.from({ length: NP }, () => ({ s: 'free', lpn: null })), erases: 0 }));
  const map = {};
  let active = 0;
  let host = 0;
  let nand = 0;
  const steps = [];
  const snap = () => ({ blocks: blocks.map((b) => ({ erases: b.erases, pages: b.pages.map((p) => ({ ...p })) })), map: { ...map }, active, host, nand });
  const isFree = (b) => b.pages.every((p) => p.s === 'free');
  const freeBlocks = () => blocks.map((b, i) => i).filter((i) => i !== active && isFree(blocks[i]));
  const pickFree = () => {
    const f = freeBlocks();
    f.sort((x, y) => blocks[x].erases - blocks[y].erases || x - y);
    return f[0];
  };
  const nextPage = (bi) => blocks[bi].pages.findIndex((p) => p.s === 'free');
  const place = (lpn, bi) => {
    const pi = nextPage(bi);
    if (map[lpn]) blocks[map[lpn].b].pages[map[lpn].p] = { s: 'invalid', lpn };
    blocks[bi].pages[pi] = { s: 'valid', lpn };
    map[lpn] = { b: bi, p: pi };
    nand++;
    return pi;
  };
  for (const lpn of list) {
    let gc = null;
    if (nextPage(active) < 0) {
      if (freeBlocks().length <= 1) {
        // 垃圾回收
        const cand = blocks.map((b, i) => i).filter((i) => !isFree(blocks[i])); // 写满的活动块也可以被回收
        cand.sort((x, y) => blocks[y].pages.filter((p) => p.s === 'invalid').length - blocks[x].pages.filter((p) => p.s === 'invalid').length || blocks[x].erases - blocks[y].erases || x - y);
        const victim = cand[0];
        const dest = pickFree();
        const moved = blocks[victim].pages.filter((p) => p.s === 'valid').map((p) => p.lpn);
        const invalid = blocks[victim].pages.filter((p) => p.s === 'invalid').length;
        for (const m of moved) {
          // 搬运：直接写到 dest，原位置随后被整块擦除
          const pi = nextPage(dest);
          blocks[dest].pages[pi] = { s: 'valid', lpn: m };
          map[m] = { b: dest, p: pi };
          nand++;
        }
        blocks[victim].pages = blocks[victim].pages.map(() => ({ s: 'free', lpn: null }));
        blocks[victim].erases++;
        active = dest;
        gc = { victim, dest, moved, invalid };
        steps.push({ kind: 'gc', ...gc, ...snap() });
      }
      if (nextPage(active) < 0) active = pickFree();
    }
    const old = map[lpn] ? { ...map[lpn] } : null;
    host++;
    const pi = place(lpn, active);
    steps.push({ kind: 'write', lpn, b: active, p: pi, old, ...snap() });
  }
  const erases = blocks.map((b) => b.erases);
  return { ok: true, list, steps, host, nand, wa: nand / host, erases, gcCount: steps.filter((s) => s.kind === 'gc').length, spread: Math.max(...erases) - Math.min(...erases) };
}
