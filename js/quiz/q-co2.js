// 计算机组成第二批题：每一章都有。生成题的答案由课程同一份计算代码算出（通过课程的 update 拿到 sim）。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { TYPES, hexOf, rangeOf } from '../subjects/co/cast.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const base = (id) => ({ ...lessonById(id).params });
const hx = (v) => v.toString(16).toUpperCase();

export const CO_QUESTIONS2 = [
  // ───── 概述 ─────
  {
    id: 'co-perf-01',
    subject: 'co',
    chapter: 'overview',
    topic: T('CPI 与 MIPS', 'CPI and MIPS'),
    type: 'number',
    difficulty: 2,
    lessons: ['cpu-perf'],
    tags: ['计算'],
    make(r) {
      const mix = r.pick([[50, 30, 20], [40, 40, 20], [60, 30, 10], [30, 50, 20]]);
      const cpiA = [1, r.int(2, 3), r.int(4, 6)];
      const fA = r.pick([500, 800, 1000, 2000]);
      const params = { ...base('cpu-perf'), mix, cpiA, fA };
      const l = L('cpu-perf', params);
      const A = l.sim.A;
      return {
        question: T(`某机器主频 ${fA} MHz，程序中三类指令的比例为 ${mix.join('%、')}%，CPI 分别为 ${cpiA.join('、')}。这台机器执行该程序的 MIPS 是多少？`, `${fA} MHz; instruction mix ${mix.join('%, ')}% with CPIs ${cpiA.join(', ')}. What is the MIPS rate?`),
        answer: { value: A.mips, tol: 0.06, show: A.mips.toFixed(1) },
        steps: [
          { text: T(`平均 CPI = ${mix.map((m, i) => `${m / 100}×${cpiA[i]}`).join(' + ')} = ${A.CPI.toFixed(2)}。`, `CPI = ${A.CPI.toFixed(2)}.`), go: { lesson: 'cpu-perf', params, step: 1 } },
          { text: T(`MIPS = 主频（MHz）÷ CPI = ${fA} ÷ ${A.CPI.toFixed(2)} ≈ ${A.mips.toFixed(1)}。`, `MIPS = ${fA} / ${A.CPI.toFixed(2)} ≈ ${A.mips.toFixed(1)}.`), go: { lesson: 'cpu-perf', params, step: last(l) } },
        ],
      };
    },
  },
  // ───── 数据的表示和运算 ─────
  {
    id: 'co-cast-01',
    subject: 'co',
    chapter: 'data',
    topic: T('整数类型转换', 'Integer conversions'),
    type: 'number',
    difficulty: 2,
    lessons: ['int-cast'],
    tags: ['计算'],
    conv: T('32 位机器：char 8 位、short 16 位、int 32 位，补码表示。', '32-bit machine: char 8, short 16, int 32 bits, two’s complement.'),
    make(r) {
      const pairs = [['short', 'uint'], ['short', 'ushort'], ['int', 'short'], ['int', 'char'], ['ushort', 'short'], ['char', 'uint'], ['uint', 'int'], ['char', 'uchar']];
      const [from, to] = r.pick(pairs);
      const [lo, hi] = rangeOf(TYPES[from]);
      // 挑一个转换后会变的值，题目才有意思
      let value;
      for (let t = 0; t < 50; t++) {
        value = TYPES[from].s && r.next() < 0.7 ? r.int(Math.max(lo, -40000), -1) : r.int(Math.max(0, lo), hi);
        if (value < lo || value > hi) continue;
        const l0 = L('int-cast', { from, to, value });
        if (l0.sim.changed) break;
      }
      const params = { from, to, value };
      const l = L('int-cast', params);
      const s = l.sim;
      return {
        question: T(`${TYPES[from].name} x = ${value}; 执行 ${TYPES[to].name} y = (${TYPES[to].name}) x; 之后 y 的值是多少？`, `${TYPES[from].name} x = ${value}; ${TYPES[to].name} y = (${TYPES[to].name}) x; What is y?`),
        answer: { value: s.result },
        steps: [
          { text: T(`x 的机器数是 ${hexOf(s.src)}。`, `x is ${hexOf(s.src)}.`), go: { lesson: 'int-cast', params, step: 0 } },
          { text: T(`${{ same: '宽度相同，位不变', sext: '变宽且原类型有符号：符号扩展', zext: '变宽且原类型无符号：零扩展', trunc: '变窄：截断，只留低位' }[s.op]}，得 ${hexOf(s.dst)}。`, `${s.op}: ${hexOf(s.dst)}.`), go: { lesson: 'int-cast', params, step: 1 } },
          { text: T(`按 ${TYPES[to].name} 解释：${s.result}。`, `As ${TYPES[to].name}: ${s.result}.`), go: { lesson: 'int-cast', params, step: 2 } },
        ],
      };
    },
  },
  {
    id: 'co-cast-02',
    subject: 'co',
    chapter: 'data',
    topic: T('有符号与无符号混合运算', 'Mixing signed and unsigned'),
    type: 'single',
    difficulty: 2,
    lessons: ['int-cast'],
    tags: ['概念'],
    question: T('在 32 位机器上，C 表达式 -1 < 0u 的值是：', 'On a 32-bit machine, the C expression -1 < 0u evaluates to:'),
    options: [T('1（真）', '1 (true)'), T('0（假）', '0 (false)'), T('编译出错', 'a compile error'), T('结果不确定', 'undefined')],
    answer: 1,
    steps: [
      { text: T('int 和 unsigned int 一起运算时，int 先转成 unsigned int（位不变）。-1 的位是 0xFFFFFFFF，当无符号数是 4294967295，不小于 0，所以值是 0。', 'The int converts to unsigned: 0xFFFFFFFF = 4294967295, not less than 0.'), go: { lesson: 'int-cast', doc: 'mix' } },
    ],
  },
  {
    id: 'co-ham-01',
    subject: 'co',
    chapter: 'data',
    topic: T('海明码', 'Hamming code'),
    type: 'number',
    difficulty: 2,
    lessons: ['hamming'],
    tags: ['计算'],
    conv: T('海明码按偶校验，校验位放在 1、2、4… 位置。', 'Even parity; check bits at positions 1, 2, 4, …'),
    make(r) {
      const data = Array.from({ length: 4 }, () => r.pick(['0', '1'])).join('');
      const flip = r.int(1, 7);
      const params = { ...base('hamming'), data, flip };
      const l = L('hamming', params);
      const s = l.sim;
      const recv = s.recv.join('');
      return {
        question: T(`4 位数据按海明码编码成 7 位发送，接收方收到 ${recv}（从第 1 位写到第 7 位），已知最多错 1 位。出错的是第几位？`, `A 7-bit Hamming codeword is received as ${recv} (bit 1 first), with at most one error. Which bit is wrong?`),
        answer: { value: s.pos },
        steps: [
          { text: T(`分别检验：${s.syn.map((c) => `P${c.p} 管第 ${c.cover.join('、')} 位，异或得 ${c.v}`).join('；')}。`, `${s.syn.map((c) => `S${c.p} = ${c.v}`).join(', ')}.`), go: { lesson: 'hamming', params, step: Math.max(0, last(l) - 1) } },
          { text: T(`把三个检验结果按 P4 P2 P1 拼成二进制 ${s.syn.slice().reverse().map((c) => c.v).join('')} = ${s.pos}，就是出错的位置，把它取反即可纠正。`, `Syndrome ${s.pos}.`), go: { lesson: 'hamming', params, step: last(l) } },
        ],
      };
    },
  },
  // ───── 存储器 ─────
  {
    id: 'co-mem-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('主存容量扩展', 'Memory expansion'),
    type: 'number',
    difficulty: 1,
    lessons: ['mem-ext'],
    tags: ['计算'],
    make(r) {
      const chipK = r.pick([1, 2, 4]);
      const chipBits = r.pick([1, 4, 8]);
      const memK = chipK * r.pick([2, 4, 8]);
      const memBits = r.pick([8, 16].filter((b) => b >= chipBits && b / chipBits <= 8)); // 每组最多 8 片，课程才画得下
      const params = { ...base('mem-ext'), chipK, chipBits, memK, memBits, base: '0' };
      const l = L('mem-ext', params);
      const s = l.sim;
      return {
        question: T(`用 ${chipK}K × ${chipBits} 位的存储芯片组成 ${memK}K × ${memBits} 位的存储器，一共需要多少片？`, `How many ${chipK}K × ${chipBits} chips make a ${memK}K × ${memBits} memory?`),
        answer: { value: s.chips },
        steps: [
          { text: T(`位扩展：每 ${memBits / chipBits} 片拼成一组 ${chipK}K × ${memBits} 位；字扩展：要 ${memK / chipK} 组。`, `${memBits / chipBits} per group, ${memK / chipK} groups.`), go: { lesson: 'mem-ext', params, step: 0 } },
          { text: T(`共 (${memK}K × ${memBits}) ÷ (${chipK}K × ${chipBits}) = ${s.chips} 片。`, `${s.chips} chips.`), go: { lesson: 'mem-ext', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'co-map-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('Cache 映射与命中率', 'Cache mapping and hit rate'),
    type: 'number',
    difficulty: 2,
    lessons: ['cache-map'],
    tags: ['过程推演'],
    conv: T('Cache 开始为空；组号 = 块号 mod 组数；组内满了用 LRU 替换。', 'Empty cache; set = block mod sets; LRU within a set.'),
    make(r) {
      const ways = r.pick([1, 2]);
      const seq = Array.from({ length: 10 }, () => r.int(0, 9));
      const params = { ...base('cache-map'), lines: 4, ways, policy: 'LRU', seq };
      const l = L('cache-map', params);
      const s = l.sim;
      return {
        question: T(`Cache 有 4 行，采用${ways === 1 ? '直接映射' : '2 路组相联（LRU）'}。依次访问主存块 ${seq.join(', ')}，命中几次？`, `A 4-line cache, ${ways === 1 ? 'direct-mapped' : '2-way set-associative (LRU)'}. Blocks ${seq.join(', ')}: how many hits?`),
        answer: { value: s.hits },
        steps: [
          { text: T(`${ways === 1 ? '行号 = 块号 mod 4' : '共 2 组，组号 = 块号 mod 2'}。逐个访问：${s.steps.map((x) => `${x.block}${x.hit ? '✓' : '✗'}`).join(' ')}。`, s.steps.map((x) => `${x.block}${x.hit ? '✓' : '✗'}`).join(' ')), go: { lesson: 'cache-map', params, step: last(l) } },
          { text: T(`命中 ${s.hits} 次，命中率 ${s.hits}/${seq.length}。`, `${s.hits} hits.`) },
        ],
      };
    },
  },
  {
    id: 'co-il-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('多体交叉存储器', 'Interleaved memory'),
    type: 'number',
    difficulty: 2,
    lessons: ['interleave'],
    tags: ['计算'],
    conv: T('低位交叉编址；每个体的存取周期为 T，总线传送周期 r = T / m；连续地址的访问依次启动。', 'Low-order interleaving; bus cycle r = T / m; consecutive accesses start in turn.'),
    make(r) {
      const m = r.pick([2, 4]);
      const T0 = r.pick([100, 200]);
      const n = r.pick([4, 8, 12].filter((x) => x >= m));
      const addrs = Array.from({ length: n }, (_, i) => i);
      const params = { ...base('interleave'), m, T: T0, addrs, mode: 'low' };
      const l = L('interleave', params);
      const s = l.sim;
      return {
        question: T(`${m} 体低位交叉存储器，每个体存取周期 ${T0} ns。连续读 ${n} 个字（地址 0～${n - 1}）一共要多少 ns？`, `${m}-way low-order interleaving, ${T0} ns per bank. Time to read ${n} consecutive words?`),
        answer: { value: s.total },
        steps: [
          { text: T(`相邻地址在不同的体，可以每隔 r = ${T0}/${m} = ${s.r} ns 启动一次。`, `A new access every ${s.r} ns.`), go: { lesson: 'interleave', params, step: 1 } },
          { text: T(`总时间 = T + (n − 1) × r = ${T0} + ${n - 1} × ${s.r} = ${s.total} ns（不交叉要 ${s.serial} ns）。`, `${s.total} ns.`), go: { lesson: 'interleave', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'co-ssd-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('固态硬盘与写放大', 'SSDs and write amplification'),
    type: 'number',
    difficulty: 3,
    lessons: ['ssd'],
    tags: ['过程推演'],
    conv: T('4 块 × 4 页，逻辑页 0～9；活动块写满且只剩 1 个空块时做垃圾回收，选无效页最多的块（一样多选擦除少的、编号小的），有效页搬到空块。', '4 blocks × 4 pages, logical pages 0–9; greedy GC when one free block remains.'),
    make(r) {
      const head = '0 1 2 3 4 5 6 7 8 9';
      const tail = Array.from({ length: r.int(6, 10) }, () => r.int(0, 9)).join(' ');
      const writes = `${head} ${tail}`;
      const params = { writes };
      const l = L('ssd', params);
      const s = l.sim;
      return {
        question: T(`按约定的 SSD 依次写逻辑页 ${writes}。闪存实际一共写了多少页（含垃圾回收的搬运）？`, `Writes: ${writes}. How many flash page writes in total, GC copies included?`),
        answer: { value: s.nand },
        steps: [
          { text: T(`主机写 ${s.host} 页。垃圾回收 ${s.gcCount} 次，搬运的有效页依次是 ${s.steps.filter((x) => x.kind === 'gc').map((x) => x.moved.length).join('、') || '（无）'} 页。`, `${s.gcCount} GCs.`), go: { lesson: 'ssd', params, step: last(l) } },
          { text: T(`闪存共写 ${s.nand} 页，写放大 ${s.wa.toFixed(2)}。`, `${s.nand} writes, WA ${s.wa.toFixed(2)}.`), go: { lesson: 'ssd', doc: 'gc' } },
        ],
      };
    },
  },
  // ───── 指令系统 ─────
  {
    id: 'co-addr-01',
    subject: 'co',
    chapter: 'isa',
    topic: T('寻址方式', 'Addressing modes'),
    type: 'number',
    difficulty: 2,
    lessons: ['addressing'],
    tags: ['计算'],
    make(r) {
      const A = r.int(1, 5) * 100;
      const PC = r.int(1, 5) * 100;
      const BR = r.int(1, 5) * 100;
      const IX = r.int(1, 3) * 100;
      const R0 = r.int(1, 5) * 100;
      const addrs = [...new Set([A, A + PC, A + BR, A + IX, R0])];
      const memMap = Object.fromEntries(addrs.map((a) => [a, r.int(1, 9) * 100 + r.int(1, 99)]));
      // 一次间接要读 mem[A] 再读 mem[mem[A]]：保证这个地址也有值
      const second = memMap[A];
      if (memMap[second] == null) memMap[second] = r.int(10, 99) * 10 + 7;
      const mem = Object.entries(memMap).map(([k, v]) => `${k}:${v}`).join(' ');
      const params = { A, R: R0, PC, BR, IX, mem };
      const l = L('addressing', params);
      const mode = r.pick(['ind', 'rel', 'base', 'index']);
      const md = l.sim.modes.find((x) => x.id === mode);
      const name = { ind: T('一次间接寻址', 'indirect'), rel: T('相对寻址（PC 已指向下一条）', 'PC-relative (PC already advanced)'), base: T('基址寻址', 'base'), index: T('变址寻址', 'indexed') }[mode];
      return {
        question: T(`形式地址 A = ${A}，PC = ${PC}，基址寄存器 = ${BR}，变址寄存器 = ${IX}；主存中 ${Object.entries(memMap).map(([k, v]) => `[${k}] = ${v}`).join('，')}。用${name.zh}，取到的操作数是多少？`, `A = ${A}, PC = ${PC}, BR = ${BR}, IX = ${IX}; memory ${Object.entries(memMap).map(([k, v]) => `[${k}]=${v}`).join(', ')}. Using ${name.en}, what operand is fetched?`),
        answer: { value: md.val },
        steps: [
          { text: T(`${{ ind: `EA = (A) = [${A}] = ${md.ea}`, rel: `EA = PC + A = ${PC} + ${A} = ${md.ea}`, base: `EA = BR + A = ${BR} + ${A} = ${md.ea}`, index: `EA = IX + A = ${IX} + ${A} = ${md.ea}` }[mode]}。`, `EA = ${md.ea}.`), go: { lesson: 'addressing', params, step: l.sim.modes.indexOf(md) } },
          { text: T(`操作数 = [${md.ea}] = ${md.val}，取操作数共访存 ${md.acc} 次。`, `Operand ${md.val}; ${md.acc} memory accesses.`), go: { lesson: 'addressing', doc: 'modes' } },
        ],
      };
    },
  },
  {
    id: 'co-ctrl-01',
    subject: 'co',
    chapter: 'isa',
    topic: T('相对转移的目标地址', 'Relative jump targets'),
    type: 'text',
    difficulty: 2,
    lessons: ['ctrl-asm', 'cmp-jump'],
    tags: ['计算'],
    make(r) {
      const addr = 0x401000 + r.int(0, 0xff) * 2;
      const back = r.next() < 0.5;
      const disp = back ? -r.int(2, 60) : r.int(2, 60);
      const byte = ((disp + 256) % 256).toString(16).toUpperCase().padStart(2, '0');
      const target = addr + 2 + disp;
      const ans = hx(target);
      return {
        question: T(`地址 ${hx(addr)}H 处有一条 2 字节的短转移指令 jle，偏移量字节是 ${byte}H。如果发生转移，目标地址是多少（十六进制）？`, `A 2-byte jle at ${hx(addr)}H has offset byte ${byte}H. Where does it jump to (hex)?`),
        answer: { accept: [ans, ans.toLowerCase(), `${ans}H`, `${ans}h`, `0x${ans}`], show: `${ans}H` },
        steps: [
          { text: T(`偏移量 ${byte}H 是 8 位补码：${disp}。`, `Offset ${byte}H = ${disp}.`), go: { lesson: 'ctrl-asm', doc: 'jump' } },
          { text: T(`目标 = 下一条指令的地址 + 偏移量 = ${hx(addr)}H + 2 + (${disp}) = ${ans}H。`, `${hx(addr + 2)} + (${disp}) = ${ans}.`), go: { lesson: 'ctrl-asm', params: { prog: 'while', a: 7, b: 3, n: 3 }, step: 6 } },
        ],
      };
    },
  },
  {
    id: 'co-ctrl-02',
    subject: 'co',
    chapter: 'isa',
    topic: T('循环的机器级表示', 'Loops in machine code'),
    type: 'number',
    difficulty: 2,
    lessons: ['ctrl-asm'],
    tags: ['过程推演'],
    make(r) {
      const prog = r.pick(['while', 'dowhile']);
      const n = r.int(0, 6);
      const params = { prog, a: 7, b: 3, n };
      const l = L('ctrl-asm', params);
      const s = l.sim;
      const loopName = prog === 'while' ? 'while' : 'do-while';
      return {
        question: T(`对课程里 ${loopName} 版本的 1+2+…+n 程序（先 3 条 mov 装入 n、s、i${prog === 'while' ? '，再 jmp 到末尾的条件测试' : ''}；循环体 add、inc；条件测试 cmp、jle；最后 ret），n = ${n} 时一共执行多少条指令？`, `For the ${loopName} sum program with n = ${n}, how many instructions run?`),
        answer: { value: s.count },
        steps: [
          { text: T(`循环体执行了 ${s.loops} 次${prog === 'while' ? `，条件测试做了 ${s.loops + 1} 次（最后一次不成立才退出）` : '（do-while 至少执行一次，测试次数等于循环次数）'}。`, `Body ${s.loops} times.`), go: { lesson: 'ctrl-asm', params, step: last(l) } },
          { text: T(prog === 'while' ? `3 + 1 + 4 × ${s.loops} + 2 + 1 = ${s.count}。` : `3 + 4 × ${s.loops} + 1 = ${s.count}。`, `${s.count} instructions.`), go: { lesson: 'ctrl-asm', doc: 'loop' } },
        ],
      };
    },
  },
  {
    id: 'co-frame-01',
    subject: 'co',
    chapter: 'isa',
    topic: T('过程调用与栈帧', 'Stack frames'),
    type: 'text',
    difficulty: 2,
    lessons: ['call-frame'],
    tags: ['计算'],
    conv: T('IA-32，cdecl：参数从右往左压栈；被调用过程开头是 push ebp; mov ebp, esp；每个字 4 字节。', 'IA-32 cdecl; prologue push ebp; mov ebp, esp; 4-byte words.'),
    make(r) {
      const esp = 0x0012ff00 + r.int(0, 60) * 4;
      const which = r.pick([1, 2, 3]);
      // 调用前 esp 是 esp；压 3 个参数，call 压返回地址，push ebp
      const ebp = esp - 3 * 4 - 4 - 4;
      const addr = ebp + 4 + 4 * which;
      const ans = hx(addr);
      return {
        question: T(`调用 f(a, b, c) 之前 esp = ${hx(esp)}H。进入 f 并执行完 push ebp; mov ebp, esp 之后，第 ${which} 个参数（${['a', 'b', 'c'][which - 1]}）在哪个地址？`, `Before calling f(a, b, c), esp = ${hx(esp)}H. After f’s prologue, where is argument ${which}?`),
        answer: { accept: [ans, ans.toLowerCase(), `${ans}H`, `0x${ans}`], show: `${ans}H` },
        steps: [
          { text: T(`压 3 个参数（c、b、a），esp 减 12；call 压返回地址再减 4；push ebp 再减 4：ebp = ${hx(esp)}H − 20 = ${hx(ebp)}H。`, `ebp = ${hx(ebp)}H.`), go: { lesson: 'call-frame', doc: 'frame' } },
          { text: T(`[ebp] 是旧 ebp，[ebp+4] 是返回地址，第 ${which} 个参数在 [ebp+${4 + 4 * which}] = ${ans}H。`, `Argument ${which} at ebp + ${4 + 4 * which} = ${ans}H.`), go: { lesson: 'call-frame', params: { a: 3, b: 5, saveEbx: false }, step: 9 } },
        ],
      };
    },
  },
  {
    id: 'co-risc-01',
    subject: 'co',
    chapter: 'isa',
    topic: T('CISC 与 RISC', 'CISC and RISC'),
    type: 'multi',
    difficulty: 1,
    lessons: ['opcode'],
    tags: ['概念'],
    question: T('下列属于 RISC 特点的有：', 'Which are RISC traits?'),
    options: [T('指令长度固定', 'Fixed instruction length'), T('只有取数 / 存数指令访问存储器', 'Only load/store access memory'), T('通用寄存器多', 'Many general registers'), T('多用硬布线控制器', 'Mostly hardwired control'), T('寻址方式多、指令功能复杂', 'Many addressing modes, complex instructions'), T('大多采用微程序控制', 'Mostly microprogrammed')],
    answer: [0, 1, 2, 3],
    steps: [{ text: T('RISC：指令少而简单、长度固定、寻址方式少、load/store 结构、寄存器多、硬布线控制、便于流水线。后两项是 CISC 的特点。', 'The last two describe CISC.'), go: { lesson: 'opcode', doc: 'risc' } }],
  },
  // ───── CPU ─────
  {
    id: 'co-pipe-01',
    subject: 'co',
    chapter: 'cpu',
    topic: T('流水线的性能', 'Pipeline performance'),
    type: 'number',
    difficulty: 2,
    lessons: ['pipe-perf'],
    tags: ['计算'],
    conv: T('时钟周期 = 最慢一段的时间 + 流水段寄存器延迟；不考虑冒险。', 'Clock = slowest stage + latch delay; no hazards.'),
    make(r) {
      const k = r.int(4, 5);
      const stages = Array.from({ length: k }, () => r.int(5, 12) * 10);
      const latch = r.pick([0, 10, 20]);
      const n = r.int(4, 20);
      const params = { ...base('pipe-perf'), stages, latch, n };
      const l = L('pipe-perf', params);
      const s = l.sim;
      return {
        question: T(`${k} 段指令流水线，各段时间 ${stages.join('、')} ps，流水段寄存器延迟 ${latch} ps。执行 ${n} 条指令共需多少 ps？`, `${k}-stage pipeline, stages ${stages.join(', ')} ps, latch ${latch} ps. Time for ${n} instructions?`),
        answer: { value: s.total },
        steps: [
          { text: T(`时钟周期 = ${Math.max(...stages)} + ${latch} = ${s.clock} ps。`, `Clock ${s.clock} ps.`), go: { lesson: 'pipe-perf', params, step: 0 } },
          { text: T(`总时间 = (${k} + ${n} − 1) × ${s.clock} = ${s.total} ps。`, `(${k} + ${n} − 1) × ${s.clock} = ${s.total} ps.`), go: { lesson: 'pipe-perf', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'co-multi-01',
    subject: 'co',
    chapter: 'cpu',
    topic: T('多处理器', 'Multiprocessors'),
    type: 'single',
    difficulty: 1,
    lessons: ['pipe-perf'],
    tags: ['概念'],
    question: T('按弗林分类，GPU 和 CPU 的向量指令（如 SSE）一条指令同时处理多个数据，属于：', 'In Flynn’s taxonomy, vector instructions and GPUs are:'),
    options: ['SISD', 'SIMD', 'MISD', 'MIMD'],
    answer: 1,
    steps: [{ text: T('单指令流多数据流 SIMD：一条指令作用在一组数据上。多核处理器整体是 MIMD。', 'SIMD; a multicore chip as a whole is MIMD.'), go: { lesson: 'pipe-perf', doc: 'multi' } }],
  },
  // ───── 总线和 I/O ─────
  {
    id: 'co-bus-01',
    subject: 'co',
    chapter: 'bus',
    topic: T('总线带宽', 'Bus bandwidth'),
    type: 'number',
    difficulty: 1,
    lessons: ['bus-arb'],
    tags: ['计算'],
    make(r) {
      const width = r.pick([16, 32, 64]);
      const freq = r.pick([33, 66, 100, 200]);
      const cycles = r.pick([1, 2, 4]);
      const params = { ...base('bus-arb'), width, freq, cycles };
      const l = L('bus-arb', params);
      const bw = l.sim.bw;
      return {
        question: T(`总线宽 ${width} 位，时钟频率 ${freq} MHz，每 ${cycles} 个时钟周期传送一次数据。总线带宽是多少 MB/s？`, `A ${width}-bit bus at ${freq} MHz transfers once every ${cycles} cycles. Bandwidth in MB/s?`),
        answer: { value: bw, tol: 0.01, show: String(bw) },
        steps: [{ text: T(`每秒传送 ${freq}M / ${cycles} 次，每次 ${width / 8} 字节：${freq} / ${cycles} × ${width / 8} = ${bw} MB/s。`, `${freq} / ${cycles} × ${width / 8} = ${bw} MB/s.`), go: { lesson: 'bus-arb', params, step: 0 } }],
      };
    },
  },
  {
    id: 'co-bus-02',
    subject: 'co',
    chapter: 'bus',
    topic: T('总线定时', 'Bus timing'),
    type: 'number',
    difficulty: 2,
    lessons: ['bus-timing'],
    tags: ['计算'],
    make(r) {
      const sync = r.next() < 0.5;
      const n = r.int(1, 4);
      const params = sync ? { mode: 'sync', n, T: r.pick([5, 10, 20]), w: r.int(0, 3), d: 5, a: 20, h: 15 } : { mode: 'full', n, T: 10, w: 1, d: r.pick([2, 5, 10]), a: r.pick([10, 20, 30]), h: 15 };
      const l = L('bus-timing', params);
      const s = l.sim;
      return {
        question: sync
          ? T(`同步总线时钟周期 ${params.T} ns：第 1 个周期送地址，从设备需要 ${params.w} 个等待周期，然后每个周期传一个字（突发）。读 ${n} 个字共需多少 ns？`, `Synchronous bus, ${params.T} ns cycles: 1 address cycle, ${params.w} waits, then one word per cycle. Time for ${n} words?`)
          : T(`异步总线采用全互锁方式，信号传播延迟 ${params.d} ns，从设备取数需要 ${params.a} ns。读 ${n} 个字共需多少 ns？`, `Fully interlocked asynchronous bus: delay ${params.d} ns, access ${params.a} ns. Time for ${n} words?`),
        answer: { value: s.total },
        steps: [
          { text: sync ? T(`(1 + ${params.w} + ${n}) × ${params.T} = ${s.total} ns。`, `${s.total} ns.`) : T(`每个字：请求传过去 d、取数 a、回答传回来 d、请求撤掉 d、回答撤掉 d，共 a + 4d = ${s.perWord} ns；${n} 个字 ${s.total} ns。`, `${s.perWord} ns per word.`), go: { lesson: 'bus-timing', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'co-dma-01',
    subject: 'co',
    chapter: 'bus',
    topic: T('DMA 方式', 'DMA'),
    type: 'single',
    difficulty: 1,
    lessons: ['dma'],
    tags: ['概念'],
    question: T('DMA 传送时采用「周期挪用」方式，指的是：', 'In DMA, “cycle stealing” means:'),
    options: [T('DMA 控制器每传一个数据就占用一个存储周期，CPU 在这个周期暂停访存', 'the DMA controller takes one memory cycle per word while the CPU waits for memory'), T('CPU 让出总线，直到整个数据块传完', 'the CPU gives up the bus until the whole block is done'), T('CPU 和 DMA 分时交替访存，互不影响', 'CPU and DMA alternate time slots without interference'), T('每传一个字都要中断 CPU 一次', 'the CPU is interrupted for every word')],
    answer: 0,
    steps: [{ text: T('停止 CPU 访存是整块传完才还总线；周期挪用是每个字挪用一个存储周期；交替访存是把存储周期分成两半各用各的。每个字都中断 CPU 是中断方式。', 'Halting the CPU, cycle stealing and alternating access are the three DMA modes; per-word interrupts are interrupt-driven I/O.'), go: { lesson: 'dma', params: { k: 4, interval: 3 }, step: 2 } }],
  },
];
