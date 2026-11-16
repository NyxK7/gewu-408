// 访存轨迹每一行的「位解析」：把这一步用到的地址 / 表项画成位格子，字段树和位格子联动高亮。
import { L, T } from '../../core/i18n.js';
import { hex, sizeStr } from './sim.js';
import { NODES } from './devices.js';
import { cacheSlot, tlbSlot } from './lesson.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const nb = (n) => both((z) => `${n} ${z ? '位' : n === 1 ? 'bit' : 'bits'}`);

/** 位格子模型的拼装器：每个寄存器占一段连续的单元编号 */
class Bits {
  constructor() {
    this.regs = [];
    this.n = 0;
  }
  reg(name, value, width, segs, extra = {}) {
    const r = { name, value, width, segs: segs.filter((s) => s.hi >= s.lo), start: this.n, ...extra };
    this.n += width;
    this.regs.push(r);
    return r;
  }
}

/** 寄存器 r 的第 hi..lo 位对应的字段 */
const fld = (r, hi, lo, label, value, extra = {}) => ({ label, value, start: r.start + (r.width - 1 - hi), end: r.start + (r.width - lo), ...extra });
const layer = (r, name, summary, fields, open = true) => ({ name, summary, start: r ? r.start : 0, end: r ? r.start + r.width : 0, fields, open });
const note = (label, value) => ({ label, value, start: 0, end: 0, note: true });
const info = (label, value, extra = {}) => ({ label, value, start: 0, end: 0, ...extra });

export function decode(ev) {
  const { op, sim } = ev;
  const { p, d } = sim;
  const H = hex;
  const b = new Bits();
  const layers = [];

  const S = {
    vpn: { hi: p.vaBits - 1, lo: d.offBits, tone: 'blue', label: T('虚页号', 'VPN') },
    off: { hi: d.offBits - 1, lo: 0, tone: 'slate', label: T('页内偏移', 'Offset') },
    pfn: { hi: p.paBits - 1, lo: d.offBits, tone: 'violet', label: T('页框号', 'Frame') },
  };

  function vaReg(name = T('虚拟地址 VA', 'Virtual address')) {
    const r = b.reg(name, sim.va, p.vaBits, [S.vpn, S.off], { note: H(sim.va, p.vaBits) });
    layers.push(
      layer(r, name, H(sim.va, p.vaBits), [
        fld(r, S.vpn.hi, S.vpn.lo, T('虚页号 VPN', 'Virtual page number'), `${H(sim.vpn, d.vpnBits)} = ${sim.vpn}`, { tone: 'blue' }),
        fld(r, S.off.hi, 0, T('页内偏移', 'Page offset'), `${H(sim.off, d.offBits)} = ${sim.off}`, { tone: 'slate' }),
        note(T('为什么是这样分', 'Why this split'), both((z) => (z ? `页大小 ${sizeStr(p.pageSize)} = 2^${d.offBits} B → 低 ${d.offBits} 位是偏移，剩下 ${p.vaBits} − ${d.offBits} = ${d.vpnBits} 位是虚页号` : `page size ${sizeStr(p.pageSize)} = 2^${d.offBits} B → low ${d.offBits} bits are the offset, the other ${p.vaBits} − ${d.offBits} = ${d.vpnBits} bits the page number`))),
      ]),
    );
    if (!d.tlbFull) {
      const lo = d.offBits + d.tlbIdxBits;
      const r2 = b.reg(T('查 TLB 时的拆分', 'As the TLB sees it'), sim.va, p.vaBits, [
        { hi: p.vaBits - 1, lo, tone: 'amber', label: T('TLB 标记', 'TLB tag') },
        { hi: lo - 1, lo: d.offBits, tone: 'teal', label: T('组号', 'Set') },
        S.off,
      ]);
      layers.push(
        layer(r2, T('查 TLB 时的拆分', 'As the TLB sees it'), both((z) => (z ? `${d.tlbSets} 组` : `${d.tlbSets} sets`)), [
          fld(r2, p.vaBits - 1, lo, T('TLB 标记', 'TLB tag'), H(sim.tlbTag, d.tlbTagBits), { tone: 'amber' }),
          fld(r2, lo - 1, d.offBits, T('TLB 组号', 'TLB set index'), String(sim.tlbIdx), { tone: 'teal' }),
          note(T('组号位数', 'Index bits'), both((z) => (z ? `${p.tlbEntries} 项 ÷ ${d.tlbWays} 路 = ${d.tlbSets} 组 → log₂${d.tlbSets} = ${d.tlbIdxBits} 位` : `${p.tlbEntries} entries ÷ ${d.tlbWays} ways = ${d.tlbSets} sets → log₂${d.tlbSets} = ${d.tlbIdxBits} bits`))),
        ]),
      );
    }
  }

  function paReg() {
    const r = b.reg(T('物理地址 PA', 'Physical address'), sim.pa, p.paBits, [S.pfn, S.off], { note: H(sim.pa, p.paBits) });
    layers.push(
      layer(r, T('物理地址 PA', 'Physical address'), H(sim.pa, p.paBits), [
        fld(r, S.pfn.hi, S.pfn.lo, T('页框号', 'Frame number'), `${H(sim.pfn, d.pfnBits)} = ${sim.pfn}`, { tone: 'violet' }),
        fld(r, S.off.hi, 0, T('页内偏移（从 VA 原样拷贝）', 'Page offset (copied from VA)'), H(sim.off, d.offBits), { tone: 'slate' }),
      ]),
    );
  }

  function cacheReg(open = true) {
    const lo = d.cOffBits + d.cIdxBits;
    const r = b.reg(T('查 Cache 时的拆分', 'As the cache sees it'), sim.pa, p.paBits, [
      { hi: p.paBits - 1, lo, tone: 'amber', label: T('标记', 'Tag') },
      { hi: lo - 1, lo: d.cOffBits, tone: 'teal', label: d.direct ? T('行号', 'Line') : T('组号', 'Set') },
      { hi: d.cOffBits - 1, lo: 0, tone: 'green', label: T('块内偏移', 'Block off.') },
    ]);
    const fields = [fld(r, p.paBits - 1, lo, T('标记', 'Tag'), H(sim.cTag, d.cTagBits), { tone: 'amber' })];
    if (d.cIdxBits) fields.push(fld(r, lo - 1, d.cOffBits, d.direct ? T('行号', 'Line index') : T('组号', 'Set index'), String(sim.cIdx), { tone: 'teal' }));
    fields.push(fld(r, d.cOffBits - 1, 0, T('块内偏移', 'Block offset'), String(sim.cOff), { tone: 'green' }));
    fields.push(
      note(
        T('位数怎么来的', 'Where the widths come from'),
        both((z) =>
          z
            ? `块 ${p.blockSize} B → 偏移 ${d.cOffBits} 位；${d.lines} 行 ÷ ${d.cacheWays} 路 = ${d.cacheSets} 组 → 组号 ${d.cIdxBits} 位；标记 = ${p.paBits} − ${d.cIdxBits} − ${d.cOffBits} = ${d.cTagBits} 位`
            : `${p.blockSize} B blocks → ${d.cOffBits} offset bits; ${d.lines} lines ÷ ${d.cacheWays} ways = ${d.cacheSets} sets → ${d.cIdxBits} index bits; tag = ${p.paBits} − ${d.cIdxBits} − ${d.cOffBits} = ${d.cTagBits} bits`,
        ),
      ),
    );
    layers.push(layer(r, T('查 Cache 时的拆分', 'As the cache sees it'), both((z) => (z ? `标记 ${d.cTagBits} · 组号 ${d.cIdxBits} · 偏移 ${d.cOffBits}` : `tag ${d.cTagBits} · index ${d.cIdxBits} · offset ${d.cOffBits}`)), fields, open));
  }

  function pteReg(pte, title) {
    const w = d.pteBits;
    const v = pte.v ? 1 : 0;
    const pfn = pte.v ? pte.pfn : 0;
    const value = (BigInt(v) << BigInt(w - 1)) | BigInt(pfn);
    const bits = value.toString(2).padStart(w, '0');
    const r = b.reg(title, 0, w, [
      { hi: w - 1, lo: w - 1, tone: 'rose', label: 'V' },
      { hi: w - 2, lo: d.pfnBits, tone: 'slate', label: T('其余位', 'Other') },
      { hi: d.pfnBits - 1, lo: 0, tone: 'violet', label: T('页框号', 'Frame') },
    ], { bits, note: '0x' + value.toString(16).toUpperCase().padStart(w / 4, '0') });
    const fields = [fld(r, w - 1, w - 1, T('有效位 V', 'Valid bit'), v ? T('1：在主存', '1: present') : T('0：不在主存', '0: not present'), { tone: 'rose' })];
    if (w - 2 >= d.pfnBits) fields.push(fld(r, w - 2, d.pfnBits, T('其余位', 'Other bits'), T('访问位、修改位、保护位等，本课未用', 'referenced, dirty, protection…, unused here'), { dim: true }));
    fields.push(fld(r, d.pfnBits - 1, 0, T('页框号', 'Frame number'), pte.v ? H(pfn, d.pfnBits) : T('无效', 'invalid'), { tone: 'violet' }));
    if (!pte.v && pte.disk != null) fields.push(info(T('外存地址', 'Swap address'), both((z) => (z ? `${H(pte.disk, 20)}（由操作系统记录）` : `${H(pte.disk, 20)} (kept by the OS)`))));
    fields.push(note(T('页表项布局', 'Entry layout'), T(`本课约定：${w} 位页表项，最高位是有效位，低 ${d.pfnBits} 位是页框号。各教材和真实 CPU 的布局不同。`, `This lesson’s ${w}-bit entry: valid bit on top, frame number in the low ${d.pfnBits} bits. Real CPUs and textbooks differ.`)));
    layers.push(layer(r, title, pte.v ? H(pfn, d.pfnBits) : 'V = 0', fields, true));
  }

  const meta = [
    [T('部件', 'Where'), op.from === op.to || !op.from ? L(NODES[op.at ?? op.from].name) : `${L(NODES[op.from].name)} → ${L(NODES[op.to].name)}`],
    [T('操作', 'Action'), L(ev.what)],
  ];
  if (ev.result) meta.push([T('结果', 'Result'), L(ev.result.text)]);
  let tag = 'VA';

  switch (op.kind) {
    case 'va':
    case 'reissue':
      vaReg();
      break;
    case 'tlb': {
      tag = 'TLB';
      vaReg();
      const rows = op.snap.tlb.map((e) => {
        const hit = e.v && e.tag === sim.tlbTag;
        return info(
          both((z) => tlbSlot(d, sim.tlbIdx, e.way, z)),
          e.v
            ? both((z) => `V=1 · ${z ? '标记' : 'tag'} ${H(e.tag, d.tlbTagBits)} ${hit ? '=' : '≠'} ${H(sim.tlbTag, d.tlbTagBits)}${hit ? ` → ${z ? '页框' : 'frame'} ${H(e.pfn, d.pfnBits)}` : ''}`)
            : both((z) => (z ? 'V=0 · 空项' : 'V=0 · empty')),
          { dim: !e.v, tone: hit ? 'green' : null },
        );
      });
      layers.push(layer(null, d.tlbFull ? T('逐项比较', 'Compare every entry') : T(`第 ${sim.tlbIdx} 组逐项比较`, `Compare set ${sim.tlbIdx}`), op.hit ? T('命中', 'hit') : T('未命中', 'miss'), rows, true));
      break;
    }
    case 'pteReq': {
      tag = 'PTE';
      const r0 = b.reg('PTBR', d.ptbr, p.paBits, [{ hi: p.paBits - 1, lo: 0, tone: 'slate', label: T('页表基址', 'Table base') }], { note: H(d.ptbr, p.paBits) });
      const r1 = b.reg(T('页表项地址', 'PTE address'), op.pteAddr, p.paBits, [{ hi: p.paBits - 1, lo: 0, tone: 'violet', label: T('页表项地址', 'PTE address') }], { note: H(op.pteAddr, p.paBits) });
      layers.push(
        layer(r0, T('页表基址寄存器 PTBR', 'Page-table base register'), H(d.ptbr, p.paBits), [fld(r0, p.paBits - 1, 0, 'PTBR', H(d.ptbr, p.paBits))]),
        layer(r1, T('页表项地址', 'PTE address'), H(op.pteAddr, p.paBits), [
          fld(r1, p.paBits - 1, 0, T('PTBR + 虚页号 × 项大小', 'PTBR + VPN × entry size'), `${H(d.ptbr, p.paBits)} + ${H(sim.vpn, d.vpnBits)} × ${p.pteSize} = ${H(op.pteAddr, p.paBits)}`, { tone: 'violet' }),
          note(T('访问主存', 'Memory access'), both((z) => (z ? `本次访存第 ${op.memNo} 次访问主存（按 408 惯例：读页表项不经过 Cache）` : `memory access #${op.memNo} of this load (408 convention: PTE reads bypass the cache)`))),
          info(T('页表大小', 'Table size'), `2^${d.vpnBits} × ${p.pteSize} B = ${sizeStr(d.ptBytes)}`),
        ]),
      );
      break;
    }
    case 'pteRet':
    case 'fault':
      tag = 'PTE';
      pteReg(op.pte ?? sim.ops.find((o) => o.kind === 'pteRet').pte, T('页表项', 'Page table entry'));
      if (op.kind === 'fault') layers.push(layer(null, T('缺页异常', 'Page-fault exception'), T('转操作系统', 'to the OS'), [note(T('接下来', 'Next'), T('保存现场 → 找空闲页框 → 启动磁盘 I/O 读入该页 → 更新页表 → 返回，重新执行这条指令', 'save state → find a free frame → read the page from disk → update the page table → return and re-execute'))], true));
      break;
    case 'pageIn': {
      tag = T('页', 'Page');
      const r0 = b.reg(T('虚页号', 'Virtual page'), sim.vpn, d.vpnBits, [{ hi: d.vpnBits - 1, lo: 0, tone: 'blue', label: T('虚页号', 'VPN') }], { note: H(sim.vpn, d.vpnBits) });
      const r1 = b.reg(T('分配到的页框号', 'Frame assigned'), op.frame, d.pfnBits, [{ hi: d.pfnBits - 1, lo: 0, tone: 'violet', label: T('页框号', 'Frame') }], { note: H(op.frame, d.pfnBits) });
      layers.push(
        layer(r0, T('要调入的页', 'Page to load'), H(sim.vpn, d.vpnBits), [fld(r0, d.vpnBits - 1, 0, T('虚页号', 'VPN'), H(sim.vpn, d.vpnBits), { tone: 'blue' }), info(T('外存地址', 'Swap address'), H(op.disk, 20))]),
        layer(r1, T('放进的页框', 'Destination frame'), H(op.frame, d.pfnBits), [
          fld(r1, d.pfnBits - 1, 0, T('页框号', 'Frame'), H(op.frame, d.pfnBits), { tone: 'violet' }),
          info(T('页框物理地址范围', 'Frame address range'), `${H(op.frame * p.pageSize, p.paBits)} ~ ${H(op.frame * p.pageSize + p.pageSize - 1, p.paBits)}`),
          note(T('本课约定', 'Assumption'), T('有空闲页框，不需要页面置换', 'a free frame exists, so nothing is evicted')),
        ]),
      );
      break;
    }
    case 'ptUpdate':
      tag = 'PTE';
      pteReg({ v: 1, pfn: op.frame }, T('更新后的页表项', 'Updated entry'));
      break;
    case 'tlbFill': {
      tag = 'TLB';
      const w = 1 + d.tlbTagBits + d.pfnBits;
      const value = (BigInt(1) << BigInt(w - 1)) | (BigInt(sim.tlbTag) << BigInt(d.pfnBits)) | BigInt(op.pfn);
      const r = b.reg(T('TLB 项', 'TLB entry'), 0, w, [
        { hi: w - 1, lo: w - 1, tone: 'rose', label: 'V' },
        { hi: w - 2, lo: d.pfnBits, tone: 'amber', label: T('标记', 'Tag') },
        { hi: d.pfnBits - 1, lo: 0, tone: 'violet', label: T('页框号', 'Frame') },
      ], { bits: value.toString(2).padStart(w, '0') });
      layers.push(
        layer(r, T('写入的 TLB 项', 'Entry written'), both((z) => tlbSlot(d, sim.tlbIdx, op.way, z)), [
          fld(r, w - 1, w - 1, T('有效位', 'Valid'), '1', { tone: 'rose' }),
          fld(r, w - 2, d.pfnBits, d.tlbFull ? T('标记（= 整个虚页号）', 'Tag (= whole VPN)') : T('标记（虚页号高位）', 'Tag (high VPN bits)'), H(sim.tlbTag, d.tlbTagBits), { tone: 'amber' }),
          fld(r, d.pfnBits - 1, 0, T('页框号', 'Frame'), H(op.pfn, d.pfnBits), { tone: 'violet' }),
          info(T('被替换的项', 'Evicted'), op.old.v ? `VPN ${H(op.old.vpn, d.vpnBits)} → ${H(op.old.pfn, d.pfnBits)}` : T('无（空项）', 'none (free)')),
          note(T('替换算法', 'Policy'), T('有空项先用空项，否则替换 LRU 计数最大（最久没用）的项', 'use a free entry if any, otherwise evict the least recently used')),
        ], true),
      );
      break;
    }
    case 'pa':
      tag = 'PA';
      vaReg();
      paReg();
      cacheReg();
      break;
    case 'cache': {
      tag = 'Cache';
      cacheReg();
      const rows = op.snap.cache.map((e) => {
        const hit = e.v && e.tag === sim.cTag;
        return info(
          both((z) => cacheSlot(d, sim.cIdx, e.way, z)),
          e.v ? both((z) => `V=1 · ${z ? '标记' : 'tag'} ${H(e.tag, d.cTagBits)} ${hit ? '=' : '≠'} ${H(sim.cTag, d.cTagBits)}`) : both((z) => (z ? 'V=0 · 空行' : 'V=0 · empty')),
          { dim: !e.v, tone: hit ? 'green' : null },
        );
      });
      if (op.snap.cacheTotal > op.snap.cache.length) rows.push(note(T('省略', 'Omitted'), T(`共 ${op.snap.cacheTotal} 行，这里只列出其中几行`, `${op.snap.cacheTotal} lines in total; only a few are listed`)));
      layers.push(layer(null, d.cacheFull ? T('逐行比较', 'Compare every line') : d.direct ? T(`看第 ${sim.cIdx} 行`, `Check line ${sim.cIdx}`) : T(`第 ${sim.cIdx} 组逐路比较`, `Compare set ${sim.cIdx}`), op.hit ? T('命中', 'hit') : T('未命中', 'miss'), rows, true));
      break;
    }
    case 'memReq': {
      tag = T('块', 'Block');
      const r = b.reg(T('物理地址 → 主存块号', 'PA → block number'), sim.pa, p.paBits, [
        { hi: p.paBits - 1, lo: d.cOffBits, tone: 'green', label: T('主存块号', 'Block no.') },
        { hi: d.cOffBits - 1, lo: 0, tone: 'slate', label: T('块内偏移', 'Offset') },
      ], { note: H(sim.pa, p.paBits) });
      const b0 = sim.blockNo * p.blockSize;
      layers.push(
        layer(r, T('按块访问主存', 'Memory is read by block'), H(sim.blockNo, p.paBits - d.cOffBits), [
          fld(r, p.paBits - 1, d.cOffBits, T('主存块号 = PA ÷ 块大小', 'Block = PA ÷ block size'), `${H(sim.blockNo, p.paBits - d.cOffBits)} = ${sim.blockNo}`, { tone: 'green' }),
          fld(r, d.cOffBits - 1, 0, T('块内偏移', 'Block offset'), String(sim.cOff), { tone: 'slate' }),
          info(T('读入的地址范围', 'Bytes read'), `${H(b0, p.paBits)} ~ ${H(b0 + p.blockSize - 1, p.paBits)}（${p.blockSize} B）`),
          note(T('访问主存', 'Memory access'), both((z) => (z ? `本次访存第 ${op.memNo} 次访问主存` : `memory access #${op.memNo} of this load`))),
        ], true),
      );
      break;
    }
    case 'block': {
      tag = 'Cache';
      cacheReg(false);
      const w = 1 + d.cTagBits;
      const r = b.reg(T('写入的 Cache 行', 'Cache line written'), 0, w, [
        { hi: w - 1, lo: w - 1, tone: 'rose', label: 'V' },
        { hi: w - 2, lo: 0, tone: 'amber', label: T('标记', 'Tag') },
      ], { bits: '1' + sim.cTag.toString(2).padStart(d.cTagBits, '0') });
      layers.push(
        layer(r, T('写入的 Cache 行', 'Cache line written'), both((z) => cacheSlot(d, sim.cIdx, op.way, z)), [
          fld(r, w - 1, w - 1, T('有效位', 'Valid'), '1', { tone: 'rose' }),
          fld(r, w - 2, 0, T('标记', 'Tag'), H(sim.cTag, d.cTagBits), { tone: 'amber' }),
          info(T('数据', 'Data'), both((z) => (z ? `整块 ${p.blockSize} B` : `the whole ${p.blockSize} B block`))),
          info(T('被替换的行', 'Evicted'), op.old.v ? both((z) => (z ? `标记 ${H(op.old.tag, d.cTagBits)}` : `tag ${H(op.old.tag, d.cTagBits)}`)) : T('无（空行）', 'none (free)')),
          note(T('本课约定', 'Assumption'), T('只做读访问，被替换的行都是干净的，不需要写回', 'reads only, so evicted lines are clean and need no write-back')),
        ], true),
      );
      break;
    }
    case 'data': {
      tag = T('数据', 'Data');
      cacheReg(false);
      const r = b.reg(T('读到的数据', 'Data read'), sim.data, 8, [{ hi: 7, lo: 0, tone: 'amber', label: T('1 字节', '1 byte') }], { note: H(sim.data, 8) });
      layers.push(layer(r, T('读到的数据', 'Data read'), H(sim.data, 8), [fld(r, 7, 0, T('数据', 'Data'), `${H(sim.data, 8)} = ${sim.data}`, { tone: 'amber' }), info(T('取自', 'From'), both((z) => (z ? `Cache 行的第 ${sim.cOff} 字节` : `byte ${sim.cOff} of the cache line`)))], true));
      break;
    }
  }

  return {
    label: T('位解析', 'Bit decoder'),
    tag: { color: ev.color, text: tag },
    title: `${L(ev.what)} · ${L(ev.value)}`,
    meta,
    hint: T('把鼠标移到字段上，位格子里对应的位会高亮；反过来也行。', 'Hover a field to light up its bits, or hover the bits.'),
    unit: 'bit',
    layers,
    view: { kind: 'bits', regs: b.regs },
  };
}
