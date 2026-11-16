// 综合题第二批：按真题大题的高频组合出题——操作系统「页式虚拟存储」、计网「一个公司网络」、
// 计组「指令系统」、数据结构「顺序表算法设计」。能算的小问由各节课的计算代码算出。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { intToIp } from '../subjects/net/lpm.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const nums = (a) => ({ accept: [a.join(','), a.join('，'), a.join('、'), a.join(' '), a.join(', ')], show: a.join(', ') });
const size = (b) => (b >= 1024 ? `${b / 1024}KB` : `${b}B`);
const H = (v, w = 0) => v.toString(16).toUpperCase().padStart(w, '0');

/** 顺序表：负数移到前面（和参考代码完全一样的做法），返回结果和交换记录 */
function negFirst(a0) {
  const a = [...a0];
  let i = 0;
  let j = a.length - 1;
  const swaps = [];
  while (i < j) {
    while (i < j && a[i] < 0) i++;
    while (i < j && a[j] >= 0) j--;
    if (i < j) {
      swaps.push([i, j, a[i], a[j]]);
      [a[i], a[j]] = [a[j], a[i]];
      i++;
      j--;
    }
  }
  return { a, swaps };
}

export const BIG_QUESTIONS2 = [
  // ───── 操作系统：页式虚拟存储 ─────
  {
    id: 'os-big-02',
    subject: 'os',
    chapter: 'memory',
    topic: T('页式虚拟存储管理', 'Paged virtual memory'),
    type: 'big',
    difficulty: 3,
    lessons: ['addr-trans', 'tlb-eat', 'page-replace'],
    tags: ['计算'],
    make(r) {
      const P = r.pick([1024, 2048, 4096]);
      const E = r.pick([4, 8]);
      const off = Math.log2(P);
      const inner = Math.log2(P / E);
      const outer = 32 - off - inner;
      // 地址变换（一级页表的视角）
      const np = r.int(4, 6);
      const frames = r.distinct(np, 1, 40);
      const page = r.int(0, np - 1);
      const addr = page * P + r.int(0, P - 1);
      const p2 = { mode: 'page', pageSize: P, frames, addr: String(addr), tableBase: r.int(1, 9) * 1000, entrySize: E };
      const l2 = L('addr-trans', p2);
      const s2 = l2.sim;
      // 有效访问时间：两级页表
      const t = r.pick([5, 10, 20]);
      const m = r.pick([50, 100, 200]);
      const alpha = r.pick([80, 90, 95, 98]);
      const p3 = { t, m, alpha, f: 0, T: 0, parallel: false, levels: 2, reHit: true };
      const s3 = L('tlb-eat', p3).sim;
      // 页面置换
      const algo = r.pick(['LRU', 'FIFO', 'CLOCK']);
      const refs = [];
      for (let i = 0; i < 12; i++) refs.push(i > 0 && r.next() < 0.35 ? refs[r.int(Math.max(0, i - 3), i - 1)] : r.int(0, 5));
      const p4 = { algo, frames: 3, refs };
      const l4 = L('page-replace', p4);
      const s4 = l4.sim;
      return {
        question: T(
          `某计算机采用请求分页虚拟存储管理，虚拟地址 32 位，页大小 ${size(P)}，页表项 ${E} 字节；页表采用二级结构，每个页目录和页表都恰好放在一页里。CPU 访问内存时先查快表（TLB），快表和内存串行查找。`,
          `Demand paging with 32-bit virtual addresses, ${size(P)} pages and ${E}-byte PTEs; a two-level page table where each directory and table fits one page. The TLB is checked first, serially.`,
        ),
        parts: [
          {
            ask: T('虚拟地址中页目录号、页表索引、页内偏移各占几位？（按「页目录号, 页表索引, 页内偏移」作答）', 'How many bits for the directory index, table index and offset?'),
            pts: 3,
            type: 'text',
            answer: nums([outer, inner, off]),
            steps: [
              { text: T(`页大小 ${size(P)} = 2^${off} B，页内偏移 ${off} 位。`, `Offset ${off} bits.`), go: { lesson: 'addr-trans', doc: 'paging' } },
              { text: T(`一页能放 ${P} ÷ ${E} = ${P / E} = 2^${inner} 个页表项，所以页表索引 ${inner} 位；剩下 32 − ${off} − ${inner} = ${outer} 位是页目录号。`, `${P / E} entries per page: ${inner} bits; directory ${outer} bits.`), go: { lesson: 'addr-trans', doc: 'multi' } },
            ],
          },
          {
            ask: T(`地址变换的道理和一级页表相同。设该进程页号 0～${np - 1} 依次装在页框 ${frames.join('、')} 中，逻辑地址 ${addr}（十进制）对应的物理地址是多少（十进制）？`, `Pages 0–${np - 1} are in frames ${frames.join(', ')}. What is the physical address of logical address ${addr}?`),
            pts: 2,
            type: 'number',
            answer: { value: s2.E },
            steps: [
              { text: T(`页号 = ⌊${addr} / ${P}⌋ = ${s2.P}，页内偏移 = ${addr} mod ${P} = ${s2.W}。`, `Page ${s2.P}, offset ${s2.W}.`), go: { lesson: 'addr-trans', params: p2, step: 0 } },
              { text: T(`查页表得页框号 ${s2.b}，物理地址 = ${s2.b} × ${P} + ${s2.W} = ${s2.E}。`, `Frame ${s2.b}: ${s2.b} × ${P} + ${s2.W} = ${s2.E}.`), go: { lesson: 'addr-trans', params: p2, step: last(l2) } },
            ],
          },
          {
            ask: T(`访问快表要 ${t} ns，访问一次内存要 ${m} ns，快表命中率 ${alpha}%，不考虑缺页。访问一个数据的有效访问时间是多少 ns？`, `TLB ${t} ns, memory ${m} ns, hit rate ${alpha}%, no faults. Effective access time?`),
            pts: 2,
            type: 'number',
            answer: { value: s3.eat, tol: 0.01 },
            steps: [
              { text: T(`命中：查快表 ${t} + 访问数据 ${m} = ${s3.paths.hit.time} ns。未命中：查快表 ${t} + 两级页表各访存一次 2 × ${m} + 访问数据 ${m} = ${s3.paths.miss.time} ns。`, `Hit ${s3.paths.hit.time} ns; miss ${s3.paths.miss.time} ns.`), go: { lesson: 'tlb-eat', params: p3, step: 1 } },
              { text: T(`EAT = ${alpha / 100} × ${s3.paths.hit.time} + ${(100 - alpha) / 100} × ${s3.paths.miss.time} = ${s3.eat} ns。`, `EAT = ${s3.eat} ns.`), go: { lesson: 'tlb-eat', doc: 'eat' } },
            ],
          },
          {
            ask: T(`该进程分到 3 个页框（开始时都空），依次访问页面 ${refs.join(' ')}，采用 ${algo} 置换算法，一共发生多少次缺页？`, `3 frames, references ${refs.join(' ')}, ${algo}. How many page faults?`),
            pts: 3,
            type: 'number',
            answer: { value: s4.faults },
            steps: [
              { text: T(`前 3 个不同页面装入空页框，各缺页一次；之后每次缺页按 ${algo} 选一页换出。`, `The first three distinct pages fault into empty frames; later faults evict by ${algo}.`), go: { lesson: 'page-replace', doc: 'algo' } },
              { text: T(`逐个走一遍：缺页发生在第 ${s4.steps.map((x, i) => (x.hit ? 0 : i + 1)).filter(Boolean).join('、')} 次访问，共 ${s4.faults} 次，缺页率 ${s4.faults}/${refs.length}。`, `${s4.faults} faults.`), go: { lesson: 'page-replace', params: p4, step: last(l4) } },
            ],
          },
        ],
      };
    },
  },
  // ───── 计网：一个公司网络 ─────
  {
    id: 'net-big-02',
    subject: 'net',
    chapter: 'network',
    topic: T('一个公司网络：子网、路由、ARP 与 NAT', 'A company network'),
    type: 'big',
    difficulty: 3,
    lessons: ['subnet', 'lpm', 'arp', 'nat'],
    tags: ['计算'],
    conv: T('子网按需要的主机数从大到小、从地址块开头依次划分，每个子网用掩码最长（刚好够用）的那一种；路由器在每个子网里用第一个可用地址。', 'Subnets are carved largest first from the start of the block, each with the longest mask that fits; the router takes the first usable address in each.'),
    make(r) {
      const c = r.int(1, 250);
      const block = `192.168.${c}.0`;
      const needs = [r.int(33, 60), r.int(13, 30), r.int(5, 12)];
      const s1 = L('subnet', { ip: block, prefix: 24, needs }).sim;
      const subs = s1.subnets;
      const names = ['A', 'B', 'C'];
      const ip = (v) => intToIp(v >>> 0);
      // 路由表和要转发的目的地址
      const table = [...subs.map((s, i) => `${ip(s.net)}/${s.prefix} E${i + 1}`), '0.0.0.0/0 E0'].join('\n');
      const toIn = r.next() < 0.6;
      const tgt = r.int(0, 2);
      const dest = toIn ? ip(subs[tgt].first + r.int(1, subs[tgt].hosts - 2)) : `${r.int(11, 220)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`;
      const lp = { table, dests: dest };
      const s3 = L('lpm', lp).sim.dests[0];
      const o3 = shuffled(r, s3.hop, ['E0', 'E1', 'E2', 'E3'].filter((x) => x !== s3.hop));
      // ARP：部门 k 的主机访问外网服务器
      const k = r.int(0, 2);
      const gw = ip(subs[k].first);
      const host = ip(subs[k].first + r.int(2, subs[k].hosts - 1));
      const server = `${r.int(58, 223)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`;
      const pa = { ...lessonById('arp').params, myIp: host, prefix: subs[k].prefix, gateway: gw, hosts: `R ${gw} 00-1B-22-33-44-FE`, sends: server };
      const s4 = L('arp', pa).sim.steps[0];
      const o4 = shuffled(r, s4.target, [server, host, '255.255.255.255']);
      // NAT：前面已经有两个连接占用了外部端口
      const pub = `${r.int(58, 223)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`;
      const base = r.int(20, 60) * 100 + 1;
      const port = r.int(1025, 60000);
      const others = [ip(subs[(k + 1) % 3].first + 3), ip(subs[(k + 2) % 3].first + 4)].map((h) => `${h}:${r.int(1025, 60000)}`);
      const events = [...others.map((o) => `out ${o} → ${server}:80`), `out ${host}:${port} → ${server}:80`].join('\n');
      const pn = { pub, base, events };
      const ln = L('nat', pn);
      const after = ln.sim.steps.at(-1).after;
      const natAns = `${after.sip}:${after.sport}`;
      const sub = (i) => `${ip(subs[i].net)}/${subs[i].prefix}`;
      const di = r.int(0, 2);
      const bi = (di + 1 + r.int(0, 1)) % 3;
      return {
        question: T(
          `某公司内部使用地址块 ${block}/24，要分给三个部门：部门 A 需要 ${needs[0]} 台主机，部门 B 需要 ${needs[1]} 台，部门 C 需要 ${needs[2]} 台。路由器 R 的接口 E1、E2、E3 分别连部门 A、B、C，接口 E0 连 ISP；R 上启用了 NAPT，公网地址 ${pub}，外部端口从 ${base} 开始依次分配。`,
          `A company uses ${block}/24 for departments A (${needs[0]} hosts), B (${needs[1]}) and C (${needs[2]}). Router R connects them on E1–E3 and the ISP on E0, doing NAPT with public address ${pub} and ports from ${base}.`,
        ),
        parts: [
          {
            ask: T(`部门 ${names[di]} 分到的子网是什么？（写成「网络地址/前缀长度」）`, `What subnet does department ${names[di]} get (address/prefix)?`),
            pts: 2,
            type: 'text',
            answer: { accept: [sub(di)], show: sub(di) },
            steps: [
              { text: T(`按主机数从大到小分：${subs.map((s, i) => `${names[i]} 需要 ${s.need} 台，主机号要 ${32 - s.prefix} 位（${s.size} 个地址，可用 ${s.hosts} 个），得到 ${sub(i)}`).join('；')}。`, subs.map((s, i) => `${names[i]}: ${sub(i)}`).join('; ')), go: { lesson: 'subnet', params: { ip: block, prefix: 24, needs }, step: 5 + di } },
            ],
          },
          {
            ask: T(`部门 ${names[bi]} 子网的广播地址是什么？`, `What is department ${names[bi]}’s broadcast address?`),
            pts: 2,
            type: 'text',
            answer: { accept: [ip(subs[bi].bcast)], show: ip(subs[bi].bcast) },
            steps: [{ text: T(`${sub(bi)} 的主机号全 1：${ip(subs[bi].net)} + ${subs[bi].size} − 1 = ${ip(subs[bi].bcast)}。`, `All host bits 1: ${ip(subs[bi].bcast)}.`), go: { lesson: 'subnet', params: { ip: block, prefix: 24, needs }, step: 5 + bi } }],
          },
          {
            ask: T(`R 的路由表是：\n${table}\n目的地址为 ${dest} 的 IP 分组从哪个接口转发？`, `R’s table:\n${table}\nWhich interface forwards a packet to ${dest}?`),
            pts: 2,
            type: 'single',
            options: o3.options,
            answer: o3.answer,
            steps: [{ text: T(toIn ? `${dest} 落在 ${sub(tgt)} 里，和这一行匹配的前缀最长，从 ${s3.hop} 转发。` : `${dest} 不属于任何一个部门的子网，只和默认路由 0.0.0.0/0 匹配，从 E0 交给 ISP。`, `Longest match: ${s3.hop}.`), go: { lesson: 'lpm', params: lp, step: 0 } }],
          },
          {
            ask: T(`部门 ${names[k]} 的主机 H（${host}）第一次访问外网服务器 ${server}，ARP 缓存为空。H 发出的 ARP 请求要查询哪个 IP 地址的 MAC 地址？`, `Host H (${host}) in ${names[k]} contacts ${server} with an empty ARP cache. Which IP does its ARP request ask about?`),
            pts: 2,
            type: 'single',
            options: o4.options,
            answer: o4.answer,
            steps: [{ text: T(`${server} 不在 H 所在的子网 ${sub(k)} 里，分组要先交给默认网关——R 在这个子网的接口 ${gw}，所以 ARP 查的是 ${gw}。`, `Not on ${sub(k)}: resolve the gateway ${gw}.`), go: { lesson: 'arp', params: pa, step: last(L('arp', pa)) } }],
          },
          {
            ask: T(`在 H 之前，另外两台主机已经各有一个连接经 R 出去。H 用端口 ${port} 访问 ${server}:80 的分组经过 R 后，源 IP 地址和源端口变成什么？（写成「IP:端口」）`, `Two other connections already went out. After R, what are the source IP and port of H’s packet from port ${port}?`),
            pts: 2,
            type: 'text',
            answer: { accept: [natAns], show: natAns },
            steps: [{ text: T(`NAPT 给每个新的（内网地址, 端口）依次分配外部端口：前两个连接用了 ${base}、${base + 1}，H 这个是 ${after.sport}；源地址换成公网地址 ${pub}。`, `New mappings take ports in order: ${after.sport}; source becomes ${pub}.`), go: { lesson: 'nat', params: pn, step: last(ln) } }],
          },
        ],
      };
    },
  },
  // ───── 计组：指令系统 ─────
  {
    id: 'co-big-03',
    subject: 'co',
    chapter: 'isa',
    topic: T('指令格式、寻址方式与条件转移', 'Instruction formats, addressing and branches'),
    type: 'big',
    difficulty: 3,
    lessons: ['opcode', 'addressing', 'cmp-jump'],
    tags: ['计算'],
    conv: T('扩展操作码：每一级没用完的操作码作为扩展标志；相对寻址 EA = (PC) + A，PC 已经指向下一条指令；内存地址和内容都是十进制。', 'Expanding opcodes: unused codes extend to the next level; relative EA = (PC) + A with PC already advanced; memory in decimal.'),
    make(r) {
      // 1. 扩展操作码：零地址指令最多几条
      const c3 = r.int(8, 15);
      const a2 = (16 - c3) * 16;
      const c2 = r.int(Math.ceil(a2 / 2), a2 - 1);
      const a1 = (a2 - c2) * 16;
      const c1 = r.int(1, a1 - 1);
      const po = { L: 16, A: 4, c3, c2, c1, c0: 0 };
      const so = L('opcode', po).sim;
      const lv1 = so.levels.find((x) => x.k === 1);
      const zero = lv1.left * 16;
      // 2. 寻址方式：操作数是多少
      const mode = r.pick(['dir', 'ind', 'regind', 'rel', 'base', 'index']);
      const A = r.int(10, 60) * 10;
      const R = r.int(61, 99) * 10;
      const PC = r.int(1, 9) * 100 + 4;
      const BR = r.int(10, 20) * 100;
      const IX = r.int(1, 9) * 10;
      const ptr = r.int(150, 199) * 10;
      const val = () => r.int(1, 999);
      const mem = { [A]: ptr, [ptr]: val(), [R]: val(), [PC + A]: val(), [BR + A]: val(), [IX + A]: val() };
      const pa = { A, R, PC, BR, IX, mem: Object.entries(mem).map(([a, v]) => `${a}:${v}`).join(' ') };
      const sa = L('addressing', pa).sim;
      const md = sa.modes.find((x) => x.id === mode);
      const MN = { dir: T('直接寻址', 'direct'), ind: T('间接寻址', 'indirect'), regind: T('寄存器间接寻址', 'register indirect'), rel: T('相对寻址', 'relative'), base: T('基址寻址', 'base'), index: T('变址寻址', 'indexed') }[mode];
      const EAF = { dir: `EA = A = ${A}`, ind: `EA = (A) = (${A}) = ${ptr}`, regind: `EA = (R) = ${R}`, rel: `EA = (PC) + A = ${PC} + ${A} = ${PC + A}`, base: `EA = (BR) + A = ${BR} + ${A} = ${BR + A}`, index: `EA = (IX) + A = ${IX} + ${A} = ${IX + A}` }[mode];
      // 3. 相对转移的目标地址
      const ip = r.int(0x401000, 0x40ffff) & ~1;
      const disp = r.int(0, 255);
      const pj = { a: 1, b: 1, n: 8, ip: H(ip), len: 2, disp: H(disp, 2) };
      const sj = L('cmp-jump', pj).sim;
      const tgt = H(sj.target);
      // 4. cmp 后条件转移
      const a = r.int(-128, 127);
      const b = r.int(-128, 127);
      const pc = { a, b, n: 8, ip: '401000', len: 2, disp: '10' };
      const lc = L('cmp-jump', pc);
      const cond = r.pick(lc.sim.conds.filter((x) => ['jg', 'jl', 'ja', 'jb'].includes(x.op)));
      const signedOp = cond.kind === 's';
      return {
        question: T('某计算机字长 16 位，指令字长 16 位，地址码 4 位，采用扩展操作码；CPU 有通用寄存器 R、基址寄存器 BR、变址寄存器 IX，按字节编址。另有一台 x86 机器用来回答第 (3)(4) 问。', 'A 16-bit machine with 16-bit instructions, 4-bit address fields and expanding opcodes; registers R, BR, IX. Parts (3) and (4) use an x86 machine.'),
        parts: [
          {
            ask: T(`已有三地址指令 ${c3} 条、二地址指令 ${c2} 条、一地址指令 ${c1} 条，零地址指令最多还能有多少条？`, `${c3} three-address, ${c2} two-address and ${c1} one-address instructions. At most how many zero-address instructions?`),
            pts: 3,
            type: 'number',
            answer: { value: zero },
            steps: [
              { text: T(`三地址指令操作码 4 位，共 16 种，用掉 ${c3} 种，剩 ${16 - c3} 种做扩展标志，每种再扩展 4 位：二地址可用 ${a2} 种。`, `${16 - c3} spare codes → ${a2} two-address codes.`), go: { lesson: 'opcode', doc: 'expand' } },
              { text: T(`二地址用 ${c2} 种，剩 ${a2 - c2} 种 × 16 = ${a1} 种一地址；一地址用 ${c1} 种，剩 ${lv1.left} 种 × 16 = ${zero} 种零地址。`, `${a1} one-address codes; ${lv1.left} spare × 16 = ${zero}.`), go: { lesson: 'opcode', params: po, step: last(L('opcode', po)) } },
            ],
          },
          {
            ask: T(`某条指令的形式地址 A = ${A}，(R) = ${R}，(PC) = ${PC}，(BR) = ${BR}，(IX) = ${IX}；内存中 ${Object.entries(mem).map(([x, v]) => `(${x}) = ${v}`).join('，')}。采用${MN.zh}时，操作数是多少？`, `A = ${A}, (R) = ${R}, (PC) = ${PC}, (BR) = ${BR}, (IX) = ${IX}; memory ${Object.entries(mem).map(([x, v]) => `(${x}) = ${v}`).join(', ')}. What is the operand under ${MN.en} addressing?`),
            pts: 3,
            type: 'number',
            answer: { value: md.val },
            steps: [
              { text: T(`${MN.zh}：${EAF}。`, `${MN.en}: ${EAF}.`), go: { lesson: 'addressing', doc: 'modes' } },
              { text: T(`操作数 = (${md.ea}) = ${md.val}，取操作数要访存 ${md.acc} 次。`, `Operand (${md.ea}) = ${md.val}; ${md.acc} memory access(es).`), go: { lesson: 'addressing', params: pa, step: sa.modes.indexOf(md) } },
            ],
          },
          {
            ask: T(`x86 机器上，地址 ${H(ip)}H 处有一条 2 字节的相对转移指令，偏移量是 ${H(disp, 2)}H（8 位补码）。转移的目标地址是多少？（十六进制）`, `A 2-byte relative jump at ${H(ip)}H with displacement ${H(disp, 2)}H (8-bit two’s complement). Target address (hex)?`),
            pts: 2,
            type: 'text',
            answer: { accept: [tgt, `0x${tgt}`, `${tgt}H`, tgt.toLowerCase()], show: `${tgt}H` },
            steps: [
              { text: T(`偏移量 ${H(disp, 2)}H 按 8 位补码是 ${sj.d}；PC 已经指向下一条指令：${H(ip)}H + 2 = ${H(sj.next)}H。`, `Displacement ${sj.d}; next ${H(sj.next)}H.`), go: { lesson: 'cmp-jump', doc: 'target' } },
              { text: T(`目标 = ${H(sj.next)}H ${sj.d < 0 ? '−' : '+'} ${Math.abs(sj.d)} = ${tgt}H。`, `Target ${tgt}H.`), go: { lesson: 'cmp-jump', params: pj, step: last(L('cmp-jump', pj)) } },
            ],
          },
          {
            ask: T(`x86 机器上，8 位寄存器 AL = ${a}、BL = ${b}（都按补码存放）。执行 cmp al, bl 之后，${cond.op} 指令会发生转移吗？`, `AL = ${a}, BL = ${b} (8-bit). After cmp al, bl, does ${cond.op} jump?`),
            pts: 2,
            type: 'judge',
            answer: cond.take,
            steps: [
              { text: T(`cmp 做 AL − BL，只设置标志位：ZF = ${lc.sim.s.flags.ZF}，SF = ${lc.sim.s.flags.SF}，OF = ${lc.sim.s.flags.OF}，CF = ${lc.sim.s.flags.CF}。`, `cmp sets ZF ${lc.sim.s.flags.ZF}, SF ${lc.sim.s.flags.SF}, OF ${lc.sim.s.flags.OF}, CF ${lc.sim.s.flags.CF}.`), go: { lesson: 'cmp-jump', params: pc, step: 1 } },
              { text: T(`${cond.op} 是${signedOp ? '有符号' : '无符号'}比较，条件是 ${cond.rule}，所以${cond.take ? '转移' : '不转移'}。${signedOp ? '' : `按无符号看，AL = ${(a + 256) % 256}、BL = ${(b + 256) % 256}。`}`, `${cond.op} (${signedOp ? 'signed' : 'unsigned'}): ${cond.rule} → ${cond.take ? 'jumps' : 'falls through'}.`), go: { lesson: 'cmp-jump', doc: 'cond' } },
            ],
          },
        ],
      };
    },
  },
  // ───── 数据结构：顺序表算法设计 ─────
  {
    id: 'ds-big-02',
    subject: 'ds',
    chapter: 'list',
    topic: T('顺序表：负数移到前面', 'Array: negatives first'),
    type: 'big',
    difficulty: 3,
    lessons: ['quicksort', 'linked-list'],
    tags: ['过程推演'],
    make(r) {
      for (;;) {
        const n = r.int(7, 9);
        const a = Array.from({ length: n }, () => (r.next() < 0.5 ? -r.int(1, 30) : r.int(0, 30)));
        const res = negFirst(a);
        if (res.swaps.length < 2) continue;
        const code = {
          zh: `void negFirst(int A[], int n) {
    int i = 0, j = n - 1, t;
    while (i < j) {
        while (i < j && A[i] < 0) i++;    // 从左往右找第一个非负数
        while (i < j && A[j] >= 0) j--;   // 从右往左找第一个负数
        if (i < j) {                      // 交换，把负数换到前面
            t = A[i]; A[i] = A[j]; A[j] = t;
            i++; j--;
        }
    }
}`,
          en: `void negFirst(int A[], int n) {
    int i = 0, j = n - 1, t;
    while (i < j) {
        while (i < j && A[i] < 0) i++;    // first non-negative from the left
        while (i < j && A[j] >= 0) j--;   // first negative from the right
        if (i < j) {                      // swap the negative forward
            t = A[i]; A[i] = A[j]; A[j] = t;
            i++; j--;
        }
    }
}`,
        };
        const { options, answer } = shuffled(r, T('时间 O(n)，空间 O(1)', 'Time O(n), space O(1)'), [T('时间 O(n)，空间 O(n)', 'Time O(n), space O(n)'), T('时间 O(n²)，空间 O(1)', 'Time O(n²), space O(1)'), T('时间 O(n log n)，空间 O(log n)', 'Time O(n log n), space O(log n)')]);
        return {
          question: T('长度为 n 的整数顺序表 A[0..n−1] 中有正数、负数和 0。设计一个算法，把所有负数移到所有非负数的前面（负数之间、非负数之间的相对次序不作要求），要求时间和空间都尽可能高效。', 'An integer array A[0..n−1] holds positives, negatives and zeros. Move every negative before every non-negative (order within each group does not matter), as efficiently as possible.'),
          parts: [
            {
              ask: T(`先看一个例子：A = (${a.join(', ')})。用两个下标 i、j 分别从两端向中间扫描：i 从左找非负数，j 从右找负数，找到就交换，然后 i、j 各往中间走一步，直到 i ≥ j。最后 A 是什么？`, `Example A = (${a.join(', ')}). i scans from the left for a non-negative, j from the right for a negative; swap, step both inward, until i ≥ j. What is A at the end?`),
              pts: 2,
              type: 'text',
              answer: nums(res.a),
              steps: [
                { text: T(`一共交换 ${res.swaps.length} 次：${res.swaps.map(([i, j, x, y]) => `A[${i}] = ${x} 和 A[${j}] = ${y}`).join('；')}。`, res.swaps.map(([i, j, x, y]) => `swap A[${i}]=${x}, A[${j}]=${y}`).join('; ')) },
                { text: T(`得到 (${res.a.join(', ')})：负数都到了前面。这和快速排序的一次划分是同一个思路，只是「枢轴」换成了 0 这条分界线。`, `Result (${res.a.join(', ')}); the same idea as one quicksort partition around 0.`), go: { lesson: 'quicksort', doc: 'partition' } },
              ],
            },
            {
              ask: T('给出算法的基本设计思想。', 'Describe the basic idea.'),
              pts: 3,
              type: 'essay',
              ref: { text: T('借鉴快速排序的划分：设两个下标 i、j 分别指向表头和表尾。i 向右找第一个非负数，j 向左找第一个负数，两者都找到且 i < j 时交换 A[i]、A[j]，然后继续，直到 i ≥ j。整个表只扫描一遍，只用了常数个辅助变量。', 'Like a quicksort partition: i from the left finds a non-negative, j from the right a negative; swap while i < j. One scan, constant extra space.') },
              rubric: [
                { text: T('用两个下标从两端向中间扫描（或一个下标记录负数区的末尾，一遍扫描）', 'Two pointers from both ends (or one pass with a boundary index)'), pts: 1 },
                { text: T('左边找到非负数、右边找到负数时交换', 'Swap a left non-negative with a right negative'), pts: 1 },
                { text: T('说明只扫描一遍、不用辅助数组', 'One pass, no extra array'), pts: 1 },
              ],
              steps: [{ text: T('不要先复制到辅助数组再分两次拷回：那样空间是 O(n)，达不到最优。', 'Copying to a second array costs O(n) space.'), go: { lesson: 'quicksort', doc: 'partition' } }],
            },
            {
              ask: T('根据设计思想，用 C 或 C++ 语言描述算法，关键之处给出注释。', 'Write the algorithm in C/C++ with comments.'),
              pts: 6,
              type: 'essay',
              ref: { code: T(code.zh, code.en) },
              rubric: [
                { text: T('函数接口正确，下标 i、j 初值正确', 'Signature and initial i, j are right'), pts: 1 },
                { text: T('两个内层循环都带 i < j 的条件，不会越界', 'Both inner loops guard i < j'), pts: 2 },
                { text: T('交换正确，交换后两个下标都向中间移动', 'Swap and move both indexes'), pts: 2 },
                { text: T('外层循环的结束条件正确（i ≥ j 时停）', 'The outer loop stops when i ≥ j'), pts: 1 },
              ],
              steps: [{ text: T('写完用第 (1) 问的例子手动走一遍，看交换的位置是否和那里一致。', 'Trace it on the example from part (1).') }],
            },
            {
              ask: T('说明算法的时间复杂度和空间复杂度。', 'State the time and space complexity.'),
              pts: 2,
              type: 'single',
              options,
              answer,
              steps: [{ text: T('i 只往右走、j 只往左走，两者合起来最多走 n 步：时间 O(n)；只用了 i、j、t 三个变量：空间 O(1)。', 'i and j together move at most n steps: O(n) time, O(1) space.'), go: { lesson: 'quicksort', doc: 'perf' } }],
            },
          ],
        };
      }
    },
  },
];

export { negFirst };
