// 把 sim.js 的结果翻译成一节课：steps / events / 文案。文案里的每个数都来自 sim 的计算结果。
import { T } from '../../core/i18n.js';
import { hex, sizeStr } from './sim.js';

/** 同时生成中英文：f(true) 是中文，f(false) 是英文 */
const both = (f) => ({ zh: f(true), en: f(false) });
const pow = (n) => `2^${n}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const ALL = ['cpu', 'tlb', 'cache', 'pt', 'mem', 'disk'];

// ───────────────────────── 文案小工具 ─────────────────────────

export const tlbOrg = (d, p, z) =>
  d.tlbFull
    ? z ? `全相联 · ${p.tlbEntries} 项` : `fully assoc. · ${p.tlbEntries} entries`
    : d.tlbWays === 1
      ? z ? `直接映射 · ${p.tlbEntries} 项` : `direct-mapped · ${p.tlbEntries} entries`
      : z ? `${d.tlbWays} 路组相联 · ${p.tlbEntries} 项` : `${d.tlbWays}-way · ${p.tlbEntries} entries`;

export const cacheOrg = (d, p, z) => {
  const m = d.cacheFull ? (z ? '全相联' : 'fully assoc.') : d.direct ? (z ? '直接映射' : 'direct-mapped') : z ? `${d.cacheWays} 路` : `${d.cacheWays}-way`;
  return `${sizeStr(p.cacheSize)} · ${m} · ${p.blockSize} B${z ? ' 块' : ' blocks'}`;
};

export const tlbSlot = (d, set, way, z) => (d.tlbFull ? (z ? `第 ${way} 项` : `entry ${way}`) : z ? `第 ${set} 组第 ${way} 路` : `set ${set}, way ${way}`);

export const cacheSlot = (d, set, way, z) =>
  d.cacheFull ? (z ? `第 ${way} 行` : `line ${way}`) : d.direct ? (z ? `第 ${set} 行` : `line ${set}`) : z ? `第 ${set} 组第 ${way} 路` : `set ${set}, way ${way}`;

const nth = (n, z) => (z ? `第 ${n} 次` : ['', 'first', 'second', 'third', 'fourth'][n] ?? `#${n}`);

export function scenarioName(s, z) {
  if (!s?.ok) return z ? '参数有误' : 'Invalid parameters';
  const o = s.outcome;
  if (o.pageFault) return z ? '缺页' : 'Page fault';
  if (o.tlbHit) return o.cacheHit ? (z ? 'TLB 命中 · Cache 命中' : 'TLB hit · cache hit') : z ? 'TLB 命中 · Cache 未命中' : 'TLB hit · cache miss';
  return o.cacheHit ? (z ? 'TLB 未命中 · Cache 命中' : 'TLB miss · cache hit') : z ? 'TLB 未命中 · 页表命中' : 'TLB miss · page table hit';
}

// ───────────────────────── 事件 ─────────────────────────

const note = (node, text, opts = {}) => ({ type: 'note', node, text, ...opts });
const mark = (node, tone) => ({ type: 'mark', node, tone });
const snap = (op) => ({ type: 'snap', snap: op.snap });
const show = (nodes) => ({ type: 'show', nodes });

/** 一次硬件操作 → 一行访存轨迹（from === to 表示部件内部的操作） */
function pk(sim, op, color, label, what, value, result = null) {
  return { type: 'packet', from: op.from ?? op.at, to: op.to ?? op.at, color, label, what, value, result, op, sim, time: '' };
}

export function buildSteps(sim) {
  const { p, d } = sim;
  const H = (v, n) => hex(v, n);
  const VA = H(sim.va, p.vaBits);
  const PA = H(sim.pa, p.paBits);
  const VPN = H(sim.vpn, d.vpnBits);
  const OFF = H(sim.off, d.offBits);
  const PFN = H(sim.pfn, d.pfnBits);
  const ops = sim.ops;
  let i = 0;
  const take = (kind) => {
    const op = ops[i++];
    if (op?.kind !== kind) throw new Error(`期望 ${kind}，得到 ${op?.kind}`);
    return op;
  };
  const peek = () => ops[i]?.kind;
  const steps = [];
  const res = (tone, zh, en) => ({ tone, text: T(zh, en) });

  // ── 1. CPU 发出虚拟地址 ──
  {
    const op = take('va');
    const tlbPart = d.tlbFull
      ? both((z) => (z ? `TLB 是全相联的，虚页号整体就是 TLB 标记。` : `The TLB is fully associative, so the whole page number is the TLB tag.`))
      : both((z) =>
          z
            ? `TLB 分 ${d.tlbSets} 组，所以虚页号还要再拆：低 ${d.tlbIdxBits} 位是 TLB 组号 = ${sim.tlbIdx}，高 ${d.tlbTagBits} 位是 TLB 标记 = ${H(sim.tlbTag, d.tlbTagBits)}。`
            : `The TLB has ${d.tlbSets} sets, so the page number splits again: the low ${d.tlbIdxBits} bits are the TLB set = ${sim.tlbIdx}, the high ${d.tlbTagBits} bits the TLB tag = ${H(sim.tlbTag, d.tlbTagBits)}.`,
        );
    steps.push({
      title: T('CPU 发出虚拟地址', 'The CPU issues a virtual address'),
      desc: T(`VA = ${VA}`, `VA = ${VA}`),
      detail: both(
        (z) =>
          (z
            ? `CPU 执行一条读内存的指令，给出 ${p.vaBits} 位虚拟地址 ${VA}。页大小 ${sizeStr(p.pageSize)} = ${pow(d.offBits)} B，所以低 ${d.offBits} 位是页内偏移，高 ${d.vpnBits} 位是虚页号：虚页号 = ${VPN}，页内偏移 = ${OFF}。`
            : `The CPU runs a load and puts out the ${p.vaBits}-bit virtual address ${VA}. A page is ${sizeStr(p.pageSize)} = ${pow(d.offBits)} B, so the low ${d.offBits} bits are the page offset and the high ${d.vpnBits} bits the virtual page number: VPN = ${VPN}, offset = ${OFF}. `) + tlbPart[z ? 'zh' : 'en'],
      ),
      facts: [
        [T('虚拟地址', 'Virtual address'), VA],
        [T('虚页号', 'Page number'), both((z) => `${VPN}（${d.vpnBits} ${z ? '位' : 'bits'}）`)],
        [T('页内偏移', 'Page offset'), both((z) => `${OFF}（${d.offBits} ${z ? '位' : 'bits'}）`)],
        ...(d.tlbFull ? [] : [[T('TLB 组号 / 标记', 'TLB set / tag'), `${sim.tlbIdx} / ${H(sim.tlbTag, d.tlbTagBits)}`]]),
      ],
      events: [mark('cpu', 'info'), note('cpu', `VA = ${VA}`, { typewriter: true }), pk(sim, op, 'blue', `VA ${VA}`, T('发出虚拟地址', 'Issue VA'), `VA ${VA}`), snap(op)],
    });
  }

  // ── TLB 查找（缺页重做时也用它） ──
  function tlbStep(op, again) {
    const set = sim.tlbIdx;
    const how = both((z) =>
      d.tlbFull
        ? z
          ? `TLB 是全相联的，共 ${p.tlbEntries} 项：拿虚页号 ${VPN} 同时和每一项的标记比较。`
          : `The TLB is fully associative with ${p.tlbEntries} entries: the page number ${VPN} is compared against every tag at once.`
        : z
          ? `TLB ${p.tlbEntries} 项分成 ${d.tlbSets} 组，每组 ${d.tlbWays} 项。只需在第 ${set} 组里比较标记 ${H(sim.tlbTag, d.tlbTagBits)}。`
          : `The TLB's ${p.tlbEntries} entries form ${d.tlbSets} sets of ${d.tlbWays}. Only set ${set} is searched for tag ${H(sim.tlbTag, d.tlbTagBits)}.`,
    );
    const pfn = H(op.pfn ?? 0, d.pfnBits);
    const out = op.hit
      ? both((z) => (z ? `${tlbSlot(d, set, op.way, z)}有效且标记相同：TLB 命中，直接得到页框号 ${pfn}，不用访问主存里的页表。` : `${tlbSlot(d, set, op.way, z)} is valid and matches: a TLB hit, giving frame ${pfn} without touching the page table in memory.`))
      : both((z) => (z ? `没有一项有效且标记相同：TLB 未命中，只好去主存里查页表。` : `No valid entry matches: a TLB miss, so the page table in memory has to be read.`));
    out.en = cap(out.en);
    return {
      ev: [
        mark('tlb', op.hit ? 'ok' : 'warn'),
        pk(sim, op, 'blue', T('查 TLB', 'TLB lookup'), T('查 TLB', 'TLB lookup'), d.tlbFull ? `VPN ${VPN}` : both((z) => (z ? `组 ${set} · 标记 ${H(sim.tlbTag, d.tlbTagBits)}` : `set ${set} · tag ${H(sim.tlbTag, d.tlbTagBits)}`)), op.hit ? res('ok', '命中', 'Hit') : res('warn', '未命中', 'Miss')),
        note('tlb', op.hit ? T(`命中 → 页框 ${pfn}`, `Hit → frame ${pfn}`) : T('TLB 未命中', 'TLB miss'), { tone: op.hit ? 'ok' : 'warn' }),
        snap(op),
      ],
      text: { zh: how.zh + out.zh, en: how.en + out.en },
    };
  }

  function walkEvents(req, ret) {
    const v = ret.pte.v;
    return [
      mark('pt', v ? 'info' : 'warn'),
      pk(sim, req, 'violet', T('读页表项', 'Read PTE'), T('读页表项', 'Read PTE'), `@${H(req.pteAddr, p.paBits)}`),
      pk(
        sim,
        ret,
        v ? 'violet' : 'rose',
        v ? T(`PTE · 页框 ${H(ret.pte.pfn, d.pfnBits)}`, `PTE · frame ${H(ret.pte.pfn, d.pfnBits)}`) : T('PTE · 有效位 0', 'PTE · valid 0'),
        T('页表项送回 MMU', 'PTE back to MMU'),
        v ? both((z) => (z ? `有效位 1 · 页框 ${H(ret.pte.pfn, d.pfnBits)}` : `valid 1 · frame ${H(ret.pte.pfn, d.pfnBits)}`)) : both((z) => (z ? '有效位 0' : 'valid 0')),
        v ? res('ok', '在主存', 'Present') : res('warn', '不在主存', 'Not present'),
      ),
      note('pt', v ? T('有效位 = 1', 'Valid = 1') : T('有效位 = 0', 'Valid = 0'), { tone: v ? 'ok' : 'warn' }),
    ];
  }

  function fillEvents(op) {
    const slot = both((z) => tlbSlot(d, sim.tlbIdx, op.way, z));
    return [
      pk(
        sim,
        op,
        'violet',
        T('装入 TLB', 'Fill TLB'),
        op.byOs ? T('OS 把页表项装入 TLB', 'OS fills the TLB') : T('页表项装入 TLB', 'Fill the TLB'),
        `${VPN} → ${H(op.pfn, d.pfnBits)}`,
        op.old.v ? { tone: 'info', text: both((z) => (z ? `替换${slot.zh}` : `replace ${slot.en}`)) } : { tone: 'info', text: both((z) => (z ? `空项：${slot.zh}` : `free ${slot.en}`)) },
      ),
      note('tlb', T(`装入${slot.zh}`, `Into ${slot.en}`), { tone: 'info' }),
    ];
  }

  const fillText = (op, z) => {
    const slot = tlbSlot(d, sim.tlbIdx, op.way, z);
    const pair = `${VPN} → ${H(op.pfn, d.pfnBits)}`;
    const where = d.tlbFull ? (z ? 'TLB' : 'the TLB') : z ? `TLB 第 ${sim.tlbIdx} 组` : `TLB set ${sim.tlbIdx}`;
    if (!op.old.v) return z ? `把「${pair}」写进 ${where} 的空项（${slot}）。` : `The pair "${pair}" goes into a free entry of ${where} (${slot}).`;
    const old = H(op.old.vpn, d.vpnBits);
    return z
      ? `把「${pair}」写进 ${where}。${d.tlbWays === 1 ? '直接映射没有选择余地，' : `这里 ${d.tlbWays} 项都满了，按 LRU `}替换${slot}（原来缓存的是虚页 ${old}）。`
      : `The pair "${pair}" goes into ${where}. ${d.tlbWays === 1 ? `Direct mapping leaves no choice, so ${slot} is replaced` : `All ${d.tlbWays} entries are in use, so LRU evicts ${slot}`} (it held page ${old}).`;
  };

  // ── 2. 查 TLB ──
  const first = tlbStep(take('tlb'), false);
  steps.push({
    title: ops[i - 1].hit ? T('查 TLB：命中', 'TLB lookup: hit') : T('查 TLB：未命中', 'TLB lookup: miss'),
    desc: d.tlbFull ? T(`全相联，比较 ${p.tlbEntries} 项`, `Fully associative, ${p.tlbEntries} compares`) : T(`第 ${sim.tlbIdx} 组，比较 ${d.tlbWays} 项`, `Set ${sim.tlbIdx}, ${d.tlbWays} compares`),
    detail: first.text,
    facts: [
      [T('TLB', 'TLB'), both((z) => tlbOrg(d, p, z))],
      [T('查找键', 'Key'), d.tlbFull ? `VPN ${VPN}` : both((z) => (z ? `组 ${sim.tlbIdx} · 标记 ${H(sim.tlbTag, d.tlbTagBits)}` : `set ${sim.tlbIdx} · tag ${H(sim.tlbTag, d.tlbTagBits)}`))],
      [T('结果', 'Result'), ops[i - 1].hit ? T(`命中，页框号 ${PFN}`, `Hit, frame ${PFN}`) : T('未命中', 'Miss')],
    ],
    events: first.ev,
  });

  // ── 3. 未命中：查页表 ──
  if (peek() === 'pteReq') {
    const req = take('pteReq');
    const ret = take('pteRet');
    const v = ret.pte.v;
    const calc = `${H(d.ptbr, p.paBits)} + ${VPN} × ${p.pteSize} = ${H(req.pteAddr, p.paBits)}`;
    const ev = walkEvents(req, ret);
    let faultOp = null;
    if (!v) {
      faultOp = take('fault');
      ev.push(
        mark('cpu', 'warn'),
        pk(sim, faultOp, 'rose', T('缺页中断', 'Page fault'), T('缺页异常，转操作系统', 'Page-fault exception to the OS'), VPN, res('warn', '缺页', 'Fault')),
        note('cpu', T('缺页中断 → 操作系统', 'Page fault → OS'), { tone: 'warn' }),
      );
    }
    ev.push(snap(faultOp ?? ret));
    steps.push({
      title: v ? T('查主存中的页表', 'Read the page table in memory') : T('查页表：缺页', 'Page table: page fault'),
      desc: T(`页表项地址 = ${H(req.pteAddr, p.paBits)}`, `PTE address = ${H(req.pteAddr, p.paBits)}`),
      detail: both((z) => {
        const a = z
          ? `页表放在主存里，起始地址在页表基址寄存器 PTBR = ${H(d.ptbr, p.paBits)}。每个页表项 ${p.pteSize} B，所以页表项地址 = PTBR + 虚页号 × ${p.pteSize} = ${calc}。这是本次访存${nth(req.memNo, z)}访问主存。`
          : `The page table lives in main memory, starting at the page-table base register PTBR = ${H(d.ptbr, p.paBits)}. Each entry is ${p.pteSize} B, so the PTE address = PTBR + VPN × ${p.pteSize} = ${calc}. This is the ${nth(req.memNo, z)} memory access of this load.`;
        const b = v
          ? z
            ? `读出的页表项：有效位 = 1，页框号 = ${H(ret.pte.pfn, d.pfnBits)}，说明这一页就在主存里。`
            : ` The entry says valid = 1, frame = ${H(ret.pte.pfn, d.pfnBits)}: the page is in memory.`
          : z
            ? `读出的页表项：有效位 = 0，这一页不在主存里，它在磁盘上（外存地址 ${H(ret.pte.disk, 20)}）。MMU 产生缺页异常，CPU 转去执行操作系统的缺页处理程序。`
            : ` The entry says valid = 0: the page is not in memory but on disk (swap address ${H(ret.pte.disk, 20)}). The MMU raises a page-fault exception and the CPU jumps to the OS handler.`;
        return a + b;
      }),
      facts: [
        ['PTBR', H(d.ptbr, p.paBits)],
        [T('页表项地址', 'PTE address'), calc],
        [T('有效位', 'Valid bit'), v ? '1' : '0'],
        v ? [T('页框号', 'Frame'), H(ret.pte.pfn, d.pfnBits)] : [T('外存地址', 'Swap address'), H(ret.pte.disk, 20)],
      ],
      events: ev,
    });

    if (v) {
      const op = take('tlbFill');
      steps.push({
        title: T('把页表项装入 TLB', 'Fill the TLB'),
        desc: T(`${VPN} → ${H(op.pfn, d.pfnBits)}`, `${VPN} → ${H(op.pfn, d.pfnBits)}`),
        detail: both((z) => fillText(op, z) + (z ? '下次再访问这一页，就能在 TLB 里直接命中。' : ' Next time this page is used, the TLB will hit.')),
        facts: [
          [T('写入位置', 'Slot'), both((z) => tlbSlot(d, sim.tlbIdx, op.way, z))],
          [T('被替换的项', 'Evicted'), op.old.v ? `VPN ${H(op.old.vpn, d.vpnBits)} → ${H(op.old.pfn, d.pfnBits)}` : T('无（空项）', 'none (free entry)')],
          [T('替换算法', 'Policy'), 'LRU'],
        ],
        events: [mark('tlb', 'info'), ...fillEvents(op), snap(op)],
      });
    } else {
      // ── 缺页处理 ──
      const pin = take('pageIn');
      const F = H(pin.frame, d.pfnBits);
      steps.push({
        title: T('操作系统从磁盘调入这一页', 'The OS pages it in from disk'),
        desc: T(`页 ${VPN} → 页框 ${F}`, `Page ${VPN} → frame ${F}`),
        detail: both((z) =>
          z
            ? `缺页处理程序找到一个空闲页框 ${F}（本课假设有空闲页框，不需要页面置换），启动磁盘 I/O，把外存地址 ${H(pin.disk, 20)} 处的整页（${sizeStr(p.pageSize)}）读进这个页框。读盘要几毫秒，比访问主存慢约十万倍，这段时间进程被阻塞，CPU 去运行别的进程。`
            : `The handler finds a free frame ${F} (this lesson assumes one is free, so nothing is evicted), starts disk I/O and reads the whole page (${sizeStr(p.pageSize)}) from swap address ${H(pin.disk, 20)} into it. A disk read takes milliseconds, about 100,000× slower than memory, so the process blocks and the CPU runs something else.`,
        ),
        facts: [
          [T('外存地址', 'Swap address'), H(pin.disk, 20)],
          [T('分配的页框', 'Frame'), F],
          [T('调入大小', 'Size'), sizeStr(p.pageSize)],
        ],
        events: [
          mark('disk', 'warn'),
          pk(sim, pin, 'rose', T(`页 ${VPN}`, `Page ${VPN}`), T('从磁盘调入页', 'Page in from disk'), both((z) => (z ? `外存 ${H(pin.disk, 20)} → 页框 ${F}` : `swap ${H(pin.disk, 20)} → frame ${F}`)), res('info', '磁盘 I/O', 'Disk I/O')),
          note('mem', T(`页框 ${F} ← 页 ${VPN}`, `Frame ${F} ← page ${VPN}`), { tone: 'info' }),
          snap(pin),
        ],
      });

      const up = take('ptUpdate');
      const ev = [
        mark('pt', 'ok'),
        pk(sim, up, 'violet', T('更新页表项', 'Update PTE'), T('OS 更新页表项', 'OS updates the PTE'), both((z) => (z ? `有效位 1 · 页框 ${F}` : `valid 1 · frame ${F}`)), res('ok', '有效', 'Valid')),
        note('pt', T(`有效位 1 · 页框 ${F}`, `Valid 1 · frame ${F}`), { tone: 'ok' }),
      ];
      let fill = null;
      if (peek() === 'tlbFill') {
        fill = take('tlbFill');
        ev.push(...fillEvents(fill));
      }
      ev.push(snap(fill ?? up));
      steps.push({
        title: fill ? T('更新页表和 TLB', 'Update the page table and TLB') : T('更新页表项', 'Update the page table entry'),
        desc: T(`有效位 = 1，页框号 = ${F}`, `Valid = 1, frame = ${F}`),
        detail: both(
          (z) =>
            (z ? `调页完成后，操作系统把页表项改成：有效位 = 1，页框号 = ${F}。` : `With the page loaded, the OS sets the entry to valid = 1, frame = ${F}. `) +
            (fill
              ? (z ? '按本课约定，缺页处理程序同时把这一项装入 TLB：' : 'By this lesson’s convention the handler also fills the TLB: ') + fillText(fill, z)
              : z
                ? '按本课约定，缺页处理程序不填 TLB，所以重新执行时 TLB 还会未命中一次。'
                : 'By this lesson’s convention the handler does not touch the TLB, so the retry will miss in the TLB once more.'),
        ),
        facts: [
          [T('页表项', 'PTE'), both((z) => (z ? `有效位 1 · 页框 ${F}` : `valid 1 · frame ${F}`))],
          [T('TLB', 'TLB'), fill ? both((z) => tlbSlot(d, sim.tlbIdx, fill.way, z)) : T('不更新', 'unchanged')],
        ],
        events: ev,
      });

      // ── 重新执行 ──
      const re = take('reissue');
      const again = tlbStep(take('tlb'), true);
      const evs = [pk(sim, re, 'blue', `VA ${VA}`, T('重新执行，再发 VA', 'Re-issue VA'), `VA ${VA}`), ...again.ev];
      let extra = { zh: '', en: '' };
      if (peek() === 'pteReq') {
        // 同一步里 TLB 上还要冒「装入」的气泡，先去掉「未命中」那个，免得叠在一起
        evs.splice(evs.findIndex((e) => e.type === 'note' && e.node === 'tlb'), 1);
        const r2 = take('pteReq');
        const t2 = take('pteRet');
        const f2 = take('tlbFill');
        evs.splice(evs.length - 1, 0, ...walkEvents(r2, t2), ...fillEvents(f2));
        evs[evs.length - 1] = snap(f2);
        extra = both((z) =>
          z
            ? `再查一次页表（本次访存${nth(r2.memNo, z)}访问主存），这次有效位 = 1，页框号 = ${H(t2.pte.pfn, d.pfnBits)}。${fillText(f2, z)}`
            : ` The page table is read again (memory access #${r2.memNo}); now valid = 1, frame = ${H(t2.pte.pfn, d.pfnBits)}. ${fillText(f2, z)}`,
        );
      }
      steps.push({
        title: T('重新执行这条访存指令', 'Re-execute the load'),
        desc: T(`再次发出 VA ${VA}`, `VA ${VA} again`),
        detail: both((z) => (z ? `中断返回后，CPU 重新执行刚才那条指令，再次发出虚拟地址 ${VA}。` : `After the handler returns, the CPU re-executes the same instruction and issues ${VA} again. `) + again.text[z ? 'zh' : 'en'] + extra[z ? 'zh' : 'en']),
        facts: [
          [T('TLB', 'TLB'), ops.filter((o) => o.kind === 'tlb').at(-1).hit ? T('命中', 'Hit') : T('未命中 → 查页表', 'Miss → page table')],
          [T('页框号', 'Frame'), PFN],
        ],
        events: evs,
      });
    }
  }

  // ── 拼出物理地址 ──
  {
    const op = take('pa');
    steps.push({
      title: T('拼出物理地址', 'Form the physical address'),
      desc: T(`PA = ${PA}`, `PA = ${PA}`),
      detail: both((z) =>
        z
          ? `物理地址 = 页框号 ∥ 页内偏移：页框号 ${PFN}（${d.pfnBits} 位）后面接上原样拷贝过来的页内偏移 ${OFF}（${d.offBits} 位），得到 ${p.paBits} 位物理地址 ${PA}。换个算法也一样：${PFN} × ${p.pageSize} + ${OFF} = ${PA}。地址转换到这里结束，下面用物理地址去查 Cache。`
          : `Physical address = frame ∥ offset: frame ${PFN} (${d.pfnBits} bits) followed by the untouched page offset ${OFF} (${d.offBits} bits) gives the ${p.paBits}-bit address ${PA}. Equivalently ${PFN} × ${p.pageSize} + ${OFF} = ${PA}. Translation is done; the cache is searched with the physical address.`,
      ),
      facts: [
        [T('页框号', 'Frame'), both((z) => `${PFN}（${d.pfnBits} ${z ? '位' : 'bits'}）`)],
        [T('页内偏移', 'Offset'), both((z) => `${OFF}（${d.offBits} ${z ? '位' : 'bits'}）`)],
        [T('物理地址', 'Physical address'), PA],
      ],
      events: [mark('tlb', 'info'), pk(sim, op, 'teal', `PA ${PA}`, T('拼出物理地址', 'Form PA'), `PA ${PA}`), note('cache', `PA = ${PA}`, { tone: 'info' }), snap(op)],
    });
  }

  // ── 查 Cache ──
  const TAG = H(sim.cTag, d.cTagBits);
  {
    const op = take('cache');
    const split = both((z) =>
      d.cacheFull
        ? z
          ? `Cache ${sizeStr(p.cacheSize)}、块大小 ${p.blockSize} B、全相联：共 ${d.lines} 行，主存块可以放进任何一行，所以物理地址只分两段：低 ${d.cOffBits} 位是块内偏移 = ${sim.cOff}，其余 ${d.cTagBits} 位是标记 = ${TAG}，要和所有 ${d.lines} 行的标记比较。`
          : `A ${sizeStr(p.cacheSize)} fully associative cache with ${p.blockSize} B blocks has ${d.lines} lines and any block may go anywhere, so the address has only two fields: the low ${d.cOffBits} bits are the block offset = ${sim.cOff}, the other ${d.cTagBits} bits the tag = ${TAG}, compared against all ${d.lines} lines: `
        : d.direct
          ? z
            ? `Cache ${sizeStr(p.cacheSize)}、块大小 ${p.blockSize} B、直接映射：共 ${d.lines} 行，每个主存块只能放进固定的一行。物理地址拆成三段：低 ${d.cOffBits} 位是块内偏移 = ${sim.cOff}，中间 ${d.cIdxBits} 位是行号 = ${sim.cIdx}，高 ${d.cTagBits} 位是标记 = ${TAG}。只看第 ${sim.cIdx} 行：`
            : `A ${sizeStr(p.cacheSize)} direct-mapped cache with ${p.blockSize} B blocks has ${d.lines} lines and each block has exactly one home. The address splits into the block offset (low ${d.cOffBits} bits) = ${sim.cOff}, the line index (${d.cIdxBits} bits) = ${sim.cIdx} and the tag (high ${d.cTagBits} bits) = ${TAG}. Only line ${sim.cIdx} is checked: `
          : z
            ? `Cache ${sizeStr(p.cacheSize)}、块大小 ${p.blockSize} B、${d.cacheWays} 路组相联：共 ${d.lines} 行，分成 ${d.cacheSets} 组。物理地址拆成三段：低 ${d.cOffBits} 位是块内偏移 = ${sim.cOff}，中间 ${d.cIdxBits} 位是组号 = ${sim.cIdx}，高 ${d.cTagBits} 位是标记 = ${TAG}。到第 ${sim.cIdx} 组的 ${d.cacheWays} 行里比较标记：`
            : `A ${sizeStr(p.cacheSize)} ${d.cacheWays}-way cache with ${p.blockSize} B blocks has ${d.lines} lines in ${d.cacheSets} sets. The address splits into the block offset (low ${d.cOffBits} bits) = ${sim.cOff}, the set index (${d.cIdxBits} bits) = ${sim.cIdx} and the tag (high ${d.cTagBits} bits) = ${TAG}. The ${d.cacheWays} lines of set ${sim.cIdx} are compared: `,
    );
    const out = op.hit
      ? both((z) => (z ? `${cacheSlot(d, sim.cIdx, op.way, z)}有效且标记相同，Cache 命中。` : `${cacheSlot(d, sim.cIdx, op.way, z)} is valid with a matching tag, a cache hit.`))
      : both((z) => (z ? `没有一行有效且标记相同，Cache 未命中，要去主存取这一块。` : `nothing valid matches, a cache miss; the block must come from memory.`));
    steps.push({
      title: op.hit ? T('查 Cache：命中', 'Cache lookup: hit') : T('查 Cache：未命中', 'Cache lookup: miss'),
      desc: d.cacheFull ? T(`标记 ${TAG}`, `Tag ${TAG}`) : T(`${d.direct ? '行' : '组'} ${sim.cIdx} · 标记 ${TAG}`, `${d.direct ? 'Line' : 'Set'} ${sim.cIdx} · tag ${TAG}`),
      detail: { zh: split.zh + out.zh, en: split.en + out.en },
      facts: [
        ['Cache', both((z) => cacheOrg(d, p, z))],
        [T('标记', 'Tag'), both((z) => `${TAG}（${d.cTagBits} ${z ? '位' : 'bits'}）`)],
        ...(d.cacheFull ? [] : [[d.direct ? T('行号', 'Line') : T('组号', 'Set'), both((z) => `${sim.cIdx}（${d.cIdxBits} ${z ? '位' : 'bits'}）`)]]),
        [T('块内偏移', 'Block offset'), both((z) => `${sim.cOff}（${d.cOffBits} ${z ? '位' : 'bits'}）`)],
      ],
      events: [
        mark('cache', op.hit ? 'ok' : 'warn'),
        pk(sim, op, 'teal', T('查 Cache', 'Cache lookup'), T('查 Cache', 'Cache lookup'), d.cacheFull ? both((z) => (z ? `标记 ${TAG}` : `tag ${TAG}`)) : both((z) => (z ? `${d.direct ? '行' : '组'} ${sim.cIdx} · 标记 ${TAG}` : `${d.direct ? 'line' : 'set'} ${sim.cIdx} · tag ${TAG}`)), op.hit ? res('ok', '命中', 'Hit') : res('warn', '未命中', 'Miss')),
        note('cache', op.hit ? T('Cache 命中', 'Cache hit') : T('Cache 未命中', 'Cache miss'), { tone: op.hit ? 'ok' : 'warn' }),
        snap(op),
      ],
    });
  }

  // ── 未命中：访问主存调块 ──
  if (peek() === 'memReq') {
    const req = take('memReq');
    const blk = take('block');
    const BN = H(blk.blockNo, p.paBits - d.cOffBits);
    const b0 = blk.blockNo * p.blockSize;
    const range = `${H(b0, p.paBits)} ~ ${H(b0 + p.blockSize - 1, p.paBits)}`;
    const slot = both((z) => cacheSlot(d, sim.cIdx, blk.way, z));
    const evict = both((z) => {
      if (!blk.old.v) return z ? `放进空着的${slot.zh}` : `into the free ${slot.en}`;
      if (d.direct) return z ? `只能放进${slot.zh}（直接映射没有选择余地），原来那一块被换掉` : `into ${slot.en}, the only possible line, replacing what was there`;
      return z ? `这一组满了，按 LRU 替换最久没用的${slot.zh}` : `the set is full, so LRU evicts ${slot.en}`;
    });
    steps.push({
      title: T('访问主存，调块进 Cache', 'Fetch the block from memory'),
      desc: T(`主存块号 ${BN}`, `Block ${BN}`),
      detail: both((z) =>
        z
          ? `Cache 以块为单位和主存交换数据：主存块号 = PA ÷ 块大小 = ${PA} ÷ ${p.blockSize} = ${BN}，这一块占地址 ${range}，共 ${p.blockSize} B。整块读进 Cache，${evict.zh}，同时写入标记 ${TAG}、有效位置 1。这是本次访存${nth(req.memNo, z)}访问主存。`
          : `Caches move whole blocks: block number = PA ÷ block size = ${PA} ÷ ${p.blockSize} = ${BN}, covering ${range} (${p.blockSize} B). The block is copied in ${evict.en}, with tag ${TAG} and the valid bit set. This is the ${nth(req.memNo, z)} memory access of this load.`,
      ),
      facts: [
        [T('主存块号', 'Block number'), BN],
        [T('块地址范围', 'Byte range'), range],
        [T('放到', 'Placed in'), slot],
        [T('被替换的块', 'Evicted'), blk.old.v ? both((z) => (z ? `标记 ${H(blk.old.tag, d.cTagBits)}` : `tag ${H(blk.old.tag, d.cTagBits)}`)) : T('无（空行）', 'none (free line)')],
      ],
      events: [
        mark('mem', 'info'),
        pk(sim, req, 'green', T(`读块 ${BN}`, `Read block ${BN}`), T('访问主存读块', 'Read block from memory'), both((z) => (z ? `块号 ${BN}` : `block ${BN}`))),
        pk(sim, blk, 'green', T(`块 ${BN} · ${p.blockSize} B`, `Block ${BN} · ${p.blockSize} B`), T('块装入 Cache', 'Block into cache'), slot, blk.old.v ? res('info', '替换', 'Evict') : res('info', '空行', 'Free')),
        note('cache', T(`装入${slot.zh}`, `Into ${slot.en}`), { tone: 'info' }),
        snap(blk),
      ],
    });
  }

  // ── 数据送回 CPU ──
  {
    const op = take('data');
    const D = H(sim.data, 8);
    const c = sim.count;
    steps.push({
      title: T('数据送回 CPU', 'Data back to the CPU'),
      desc: T(`读到 ${D}`, `Got ${D}`),
      detail: both((z) =>
        z
          ? `从 Cache 行里按块内偏移 ${sim.cOff} 取出 1 字节数据 ${D}（本课只读 1 个字节），送回 CPU，这条访存指令完成。整个过程访问主存 ${c.mem} 次${c.disk ? `、访问磁盘 ${c.disk} 次` : ''}。`
          : `Byte ${sim.cOff} of the cache line, ${D}, goes back to the CPU (this lesson reads a single byte) and the load completes. In total: ${c.mem} memory access${c.mem === 1 ? '' : 'es'}${c.disk ? ` and ${c.disk} disk read` : ''}.`,
      ),
      facts: [
        [T('数据', 'Data'), D],
        [T('访问主存', 'Memory accesses'), String(c.mem)],
        [T('访问磁盘', 'Disk reads'), String(c.disk)],
      ],
      events: [mark('cpu', 'ok'), pk(sim, op, 'amber', T(`数据 ${D}`, `Data ${D}`), T('数据送回 CPU', 'Data to CPU'), D, res('ok', '完成', 'Done')), note('cpu', T(`拿到数据 ${D}`, `Got ${D}`), { tone: 'ok' }), snap(op)],
    });
  }
  return steps;
}

/** 课程结束时的小结 */
export function buildOutro(sim) {
  const { d, p } = sim;
  const c = sim.count;
  const o = sim.outcome;
  const pte = sim.ops.filter((x) => x.kind === 'pteReq').length;
  const blocks = sim.ops.filter((x) => x.kind === 'memReq').length;
  const tlbs = sim.ops.filter((x) => x.kind === 'tlb');
  return {
    title: T('一次访存走完了', 'One access, start to finish'),
    text: both((z) =>
      z
        ? `虚拟地址 ${hex(sim.va, p.vaBits)} 最终落到物理地址 ${hex(sim.pa, p.paBits)}。改一下参数（比如把 Cache 换成直接映射、TLB 换成组相联），或者换一个预设场景，整节课会重新生成，看看哪一步变了。`
        : `Virtual address ${hex(sim.va, p.vaBits)} ended up at physical address ${hex(sim.pa, p.paBits)}. Change a parameter (a direct-mapped cache, a set-associative TLB) or pick another preset: the whole lesson is regenerated, so you can see which steps change.`,
    ),
    facts: [
      [T('TLB', 'TLB'), both((z) => tlbs.map((x) => (x.hit ? (z ? '命中' : 'hit') : z ? '未命中' : 'miss')).join(' → '))],
      [T('缺页', 'Page fault'), o.pageFault ? both((z) => (z ? `是，从磁盘调页 ${c.disk} 次` : `yes, ${c.disk} page-in`)) : T('否', 'no')],
      ['Cache', o.cacheHit ? T('命中', 'hit') : T('未命中，调块 1 次', 'miss, 1 block fill')],
      [T('访问主存', 'Memory accesses'), both((z) => (z ? `${c.mem} 次（页表项 ${pte} 次 + 调块 ${blocks} 次）` : `${c.mem} (${pte} PTE + ${blocks} block)`))],
      [T('物理地址', 'Physical address'), hex(sim.pa, p.paBits)],
      [T('地址拆分', 'Split'), both((z) => (z ? `标记 ${d.cTagBits} · ${d.cacheFull ? '' : `组号 ${d.cIdxBits} · `}块内偏移 ${d.cOffBits} 位` : `tag ${d.cTagBits} · ${d.cacheFull ? '' : `index ${d.cIdxBits} · `}offset ${d.cOffBits} bits`))],
    ],
  };
}
