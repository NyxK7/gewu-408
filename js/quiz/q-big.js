// 综合题（大题）：一道题串起几个知识点，分成几个小问，每问单独给分。
// 能算的小问照样由课程的计算代码（或这里按协议格式拼出来的报文）算出答案；
// 写思路、写代码的小问（essay）给参考答案和评分要点，做完自己对照打勾。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const base = (id) => ({ ...lessonById(id).params });
const H = (v, bits) => v.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0');
const size = (b) => (b >= 1024 ? `${b / 1024}KB` : `${b}B`);
const hexAns = (v, bits) => {
  const h = H(v, bits);
  const s = v.toString(16).toUpperCase();
  return { accept: [...new Set([h, s, `0x${h}`, `0x${s}`, `${h}H`, `${s}H`])], show: `${h}H` };
};
/** 几个数一起作答：逗号、顿号、空格隔开都算对 */
const nums = (a) => ({ accept: [a.join(','), a.join('，'), a.join('、'), a.join(' '), a.join(', ')], show: a.join(', ') });

// ───── 计网：按协议格式拼一个以太网帧（IPv4 + TCP，不含选项） ─────
const u16 = (v) => [(v >>> 8) & 255, v & 255];
const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
/** 16 位反码求和再取反（IP / TCP 校验和） */
function csum(bytes) {
  let s = 0;
  for (let i = 0; i < bytes.length; i += 2) s += (bytes[i] << 8) + (bytes[i + 1] ?? 0);
  while (s > 0xffff) s = (s & 0xffff) + (s >>> 16);
  return ~s & 0xffff;
}
function frame({ dmac, smac, src, dst, id, ttl, sport, dport, seq, ack, flags, win, len }) {
  const tot = 20 + 20 + len;
  const ip = [0x45, 0x00, ...u16(tot), ...u16(id), 0x40, 0x00, ttl, 6, 0, 0, ...src, ...dst];
  [ip[10], ip[11]] = u16(csum(ip));
  const tcp = [...u16(sport), ...u16(dport), ...u32(seq), ...u32(ack), 0x50, flags, ...u16(win), 0, 0, 0, 0];
  // 数据部分没有给出，按全 0 计算校验和
  const pseudo = [...src, ...dst, 0, 6, ...u16(20 + len)];
  [tcp[16], tcp[17]] = u16(csum([...pseudo, ...tcp, ...Array(len).fill(0)]));
  return [...dmac, ...smac, 0x08, 0x00, ...ip, ...tcp];
}
const dump = (bytes) =>
  Array.from({ length: Math.ceil(bytes.length / 16) }, (_, i) =>
    `${H(i * 16, 16)}  ${bytes
      .slice(i * 16, i * 16 + 16)
      .map((b) => H(b, 8))
      .join(' ')}`,
  ).join('\n');
const ipStr = (a) => a.join('.');

export const BIG_QUESTIONS = [
  // ───── 计组：一次访存的全过程 ─────
  {
    id: 'co-big-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('一次访存的全过程', 'One memory access, end to end'),
    type: 'big',
    difficulty: 3,
    lessons: ['vm-access', 'cache-addr'],
    tags: ['计算'],
    make(r) {
      for (;;) {
        const pageSize = r.pick([2048, 4096, 8192]);
        const cacheSize = r.pick([16384, 32768, 65536]);
        const blockSize = r.pick([32, 64]);
        const cacheWays = r.pick([2, 4, 8]);
        const tlbHit = r.next() < 0.5;
        const cacheHit = r.next() < 0.5;
        const p0 = { ...base('vm-access'), pageSize, cacheSize, blockSize, cacheWays, tlbHit, cacheHit, inMem: true, frame: null };
        const d0 = L('vm-access', p0).sim.d;
        const params = { ...p0, va: r.int(0, 2 ** 31 - 1), frame: r.int(1, d0.ptFirst - 1) };
        const l = L('vm-access', params);
        const s = l.sim;
        if (!s?.ok || s.d.errors.length || s.fault) continue;
        const d = s.d;
        const { vaBits, paBits, tlbEntries } = params;
        const memWhy = [tlbHit ? T('TLB 命中，不用读页表', 'TLB hit: no page-table read') : T('TLB 未命中，要到主存读一次页表项', 'TLB miss: one page-table read'), cacheHit ? T('Cache 命中，数据直接从 Cache 取', 'cache hit: no memory read') : T('Cache 未命中，要从主存读入整块', 'cache miss: one block read')];
        return {
          question: T(
            `某计算机按字节编址，虚拟地址 ${vaBits} 位，物理地址 ${paBits} 位，页大小 ${size(pageSize)}。TLB 有 ${tlbEntries} 个表项，采用全相联映射；数据 Cache 容量 ${size(cacheSize)}，主存块大小 ${blockSize}B，采用 ${cacheWays} 路组相联映射。页表只有一级，存放在主存中，读页表项不经过 Cache。\n某条指令要读取虚拟地址 ${H(params.va, vaBits)}H 处的一个字节。已知该页在主存中，页框号为 ${H(params.frame, d.pfnBits)}H；这次访问 TLB ${tlbHit ? '命中' : '未命中'}，Cache ${cacheHit ? '命中' : '未命中'}。`,
            `Byte-addressed; ${vaBits}-bit virtual and ${paBits}-bit physical addresses; ${size(pageSize)} pages. A fully associative TLB with ${tlbEntries} entries; a ${size(cacheSize)} ${cacheWays}-way data cache with ${blockSize} B blocks. One-level page table in memory; PTE reads bypass the cache.\nAn instruction reads the byte at VA ${H(params.va, vaBits)}H. The page is in frame ${H(params.frame, d.pfnBits)}H; the TLB ${tlbHit ? 'hits' : 'misses'} and the cache ${cacheHit ? 'hits' : 'misses'}.`,
          ),
          parts: [
            {
              ask: T('虚拟地址中虚页号和页内偏移各占几位？（按「虚页号, 页内偏移」作答）', 'How many bits are the VPN and the page offset? (answer “VPN, offset”)'),
              pts: 2,
              type: 'text',
              answer: nums([d.vpnBits, d.offBits]),
              steps: [{ text: T(`页大小 ${size(pageSize)} = 2^${d.offBits} B，页内偏移 ${d.offBits} 位；剩下的 ${vaBits} − ${d.offBits} = ${d.vpnBits} 位是虚页号。`, `Offset ${d.offBits} bits; VPN ${vaBits} − ${d.offBits} = ${d.vpnBits} bits.`), go: { lesson: 'vm-access', doc: 'split' } }],
            },
            {
              ask: T('这个字节的物理地址是多少？（十六进制）', 'What is the physical address (hex)?'),
              pts: 2,
              type: 'text',
              answer: hexAns(s.pa, paBits),
              steps: [
                { text: T(`虚拟地址的低 ${d.offBits} 位是页内偏移 ${H(s.off, d.offBits)}H，物理地址里原样保留。`, `Offset ${H(s.off, d.offBits)}H is kept as is.`), go: { lesson: 'vm-access', params, step: 1 } },
                { text: T(`页框号 ${H(params.frame, d.pfnBits)}H 拼在前面：物理地址 = ${H(params.frame, d.pfnBits)}H × 2^${d.offBits} + ${H(s.off, d.offBits)}H = ${H(s.pa, paBits)}H。`, `PA = frame ‖ offset = ${H(s.pa, paBits)}H.`), go: { lesson: 'vm-access', params, step: last(l) } },
              ],
            },
            {
              ask: T('物理地址中，Cache 的标记、组号、块内地址各占几位？（按「标记, 组号, 块内地址」作答）', 'How many bits are the cache tag, set index and block offset? (answer “tag, index, offset”)'),
              pts: 3,
              type: 'text',
              answer: nums([d.cTagBits, d.cIdxBits, d.cOffBits]),
              steps: [
                { text: T(`块大小 ${blockSize}B，块内地址 ${d.cOffBits} 位；Cache 共 ${size(cacheSize)} ÷ ${blockSize}B = ${d.lines} 行，${cacheWays} 路一组，有 ${d.cacheSets} 组，组号 ${d.cIdxBits} 位。`, `Offset ${d.cOffBits}; ${d.lines} lines / ${cacheWays} = ${d.cacheSets} sets: index ${d.cIdxBits}.`), go: { lesson: 'cache-addr', doc: 'split' } },
                { text: T(`标记 = ${paBits} − ${d.cIdxBits} − ${d.cOffBits} = ${d.cTagBits} 位。注意 Cache 用的是物理地址，按物理地址的 ${paBits} 位来分。`, `Tag = ${paBits} − ${d.cIdxBits} − ${d.cOffBits} = ${d.cTagBits}; the cache splits the physical address.`), go: { lesson: 'vm-access', doc: 'cache' } },
              ],
            },
            {
              ask: T('这个字节所在的主存块映射到 Cache 的第几组？（从 0 开始）', 'Which cache set (from 0) does its block map to?'),
              pts: 1,
              type: 'number',
              answer: { value: s.cIdx },
              steps: [{ text: T(`物理地址 ${H(s.pa, paBits)}H 去掉低 ${d.cOffBits} 位得到主存块号 ${s.blockNo}，${s.blockNo} mod ${d.cacheSets} = ${s.cIdx}；也就是物理地址中间那 ${d.cIdxBits} 位的值。`, `Block ${s.blockNo} mod ${d.cacheSets} = ${s.cIdx}.`), go: { lesson: 'vm-access', params, step: last(l) } }],
            },
            {
              ask: T('完成这次读操作，一共要访问几次主存？', 'How many main-memory accesses does this read take?'),
              pts: 2,
              type: 'number',
              answer: { value: s.count.mem },
              steps: [
                { text: T(`${memWhy[0].zh}；${memWhy[1].zh}。`, `${memWhy[0].en}; ${memWhy[1].en}.`), go: { lesson: 'vm-access', doc: 'combo' } },
                { text: T(`合计访问主存 ${s.count.mem} 次。`, `${s.count.mem} memory access(es) in total.`), go: { lesson: 'vm-access', params, step: last(l) } },
              ],
            },
          ],
        };
      }
    },
  },
  // ───── 计网：读懂一个抓到的帧 ─────
  {
    id: 'net-big-01',
    subject: 'net',
    chapter: 'transport',
    topic: T('读懂一个以太网帧', 'Reading a captured frame'),
    type: 'big',
    difficulty: 3,
    lessons: ['encap', 'tcp', 'tcp-flow'],
    tags: ['计算'],
    conv: T(
      '帧从目的 MAC 地址开始（不含前导码和 FCS），只给出前 54 字节。以太网帧：目的地址 6B、源地址 6B、类型 2B。IPv4 首部：第 1 字节低 4 位是首部长度（单位 4B），第 3～4 字节总长度，第 13～16 字节源地址，第 17～20 字节目的地址。TCP 首部：第 5～8 字节序号，第 9～12 字节确认号，第 13 字节高 4 位是首部长度（单位 4B），第 14 字节低 6 位依次是 URG、ACK、PSH、RST、SYN、FIN。',
      'The frame starts at the destination MAC (no preamble or FCS); only the first 54 bytes are shown. Ethernet: dst 6 B, src 6 B, type 2 B. IPv4: low nibble of byte 1 is the header length (×4 B); bytes 3–4 total length; 13–16 source; 17–20 destination. TCP: bytes 5–8 seq; 9–12 ack; high nibble of byte 13 is the header length (×4 B); low 6 bits of byte 14 are URG ACK PSH RST SYN FIN.',
    ),
    make(r) {
      const kind = r.pick(['syn', 'synack', 'data', 'fin']);
      const host = [192, 168, r.int(0, 20), r.int(2, 250)];
      const server = [r.int(58, 223), r.int(0, 255), r.int(0, 255), r.int(1, 254)];
      const cport = r.int(1025, 65000);
      const sport0 = r.pick([80, 443, 21, 25]);
      const fromServer = kind === 'synack';
      const len = kind === 'data' ? r.int(100, 1460) : 0;
      const flags = { syn: 0x02, synack: 0x12, data: 0x18, fin: 0x11 }[kind];
      const seq = r.int(1, 2 ** 31 - 1);
      const ack = kind === 'syn' ? 0 : r.int(1, 2 ** 31 - 1);
      const mac = () => [r.int(0, 127) * 2, ...Array.from({ length: 5 }, () => r.int(0, 255))];
      const src = fromServer ? server : host;
      const dst = fromServer ? host : server;
      const bytes = frame({ dmac: mac(), smac: mac(), src, dst, id: r.int(1, 65535), ttl: r.pick([64, 128, 52, 117]), sport: fromServer ? sport0 : cport, dport: fromServer ? cport : sport0, seq, ack, flags, win: r.int(2000, 65535), len });
      const tot = 40 + len;
      const ackNo = (seq + len + (kind === 'syn' || kind === 'synack' || kind === 'fin' ? 1 : 0)) % 2 ** 32;
      const kinds = {
        syn: T('建立连接的第一次握手（SYN）', 'First handshake segment (SYN)'),
        synack: T('建立连接的第二次握手（SYN + ACK）', 'Second handshake segment (SYN + ACK)'),
        data: T('连接建立后携带数据的报文段', 'A data-carrying segment'),
        fin: T('请求释放连接的报文段（FIN）', 'A connection-release segment (FIN)'),
      };
      const { options, answer } = shuffled(r, kinds[kind], Object.entries(kinds).filter(([k]) => k !== kind).map(([, v]) => v));
      const fb = H(flags, 8);
      const fbits = flags.toString(2).padStart(6, '0');
      return {
        question: T('在主机上用抓包软件截获了一个以太网帧，前 54 字节如下（十六进制）。回答下面的问题。', 'A frame captured on a host; its first 54 bytes (hex) are below.'),
        material: { title: T('截获的以太网帧（每行 16 字节，左边是字节偏移）', 'Captured frame (16 bytes per row; offset on the left)'), text: dump(bytes) },
        parts: [
          {
            ask: T('发出这个 IP 分组的主机的 IP 地址是什么？（点分十进制）', 'What is the sender’s IP address (dotted decimal)?'),
            pts: 2,
            type: 'text',
            answer: { accept: [ipStr(src)], show: ipStr(src) },
            steps: [{ text: T(`以太网首部 14 字节之后（偏移 0x0E）是 IP 首部；源地址是 IP 首部的第 13～16 字节，即帧的偏移 0x1A～0x1D：${src.map((b) => H(b, 8)).join(' ')}，写成十进制 ${ipStr(src)}。`, `Source IP at frame offset 0x1A–0x1D: ${ipStr(src)}.`), go: { lesson: 'encap', doc: 'pdu' } }],
          },
          {
            ask: T('这个 IP 分组的总长度是多少字节？', 'What is the IP datagram’s total length in bytes?'),
            pts: 2,
            type: 'number',
            answer: { value: tot },
            steps: [{ text: T(`总长度在 IP 首部的第 3～4 字节（帧偏移 0x10～0x11）：${H(tot, 16).match(/../g).join(' ')}H = ${tot}。`, `Total length at 0x10–0x11: ${H(tot, 16)}H = ${tot}.`), go: { lesson: 'encap', doc: 'pdu' } }],
          },
          {
            ask: T('这个 TCP 报文段的数据部分有多少字节？', 'How many bytes of data does the TCP segment carry?'),
            pts: 2,
            type: 'number',
            answer: { value: len },
            steps: [
              { text: T('IP 首部第 1 字节是 45H：低 4 位 5 表示首部长 5 × 4 = 20 字节。TCP 首部第 13 字节（帧偏移 0x2E）是 50H：高 4 位 5 表示首部长 20 字节。', 'IP header 5 × 4 = 20 B; TCP header (byte 0x2E = 50H) 20 B.'), go: { lesson: 'tcp', doc: 'header' } },
              { text: T(`数据部分 = 总长度 − IP 首部 − TCP 首部 = ${tot} − 20 − 20 = ${len} 字节。`, `Data = ${tot} − 20 − 20 = ${len}.`) },
            ],
          },
          {
            ask: T('这个 TCP 报文段是哪一种？', 'What kind of TCP segment is this?'),
            pts: 2,
            type: 'single',
            options,
            answer,
            steps: [
              { text: T(`标志位在 TCP 首部第 14 字节（帧偏移 0x2F）：${fb}H，低 6 位是 ${fbits}，依次对应 URG ACK PSH RST SYN FIN，所以置 1 的是 ${['URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'].filter((_, i) => fbits[i] === '1').join('、')}。`, `Flags ${fb}H = ${fbits}: ${['URG', 'ACK', 'PSH', 'RST', 'SYN', 'FIN'].filter((_, i) => fbits[i] === '1').join(', ')}.`), go: { lesson: 'tcp', doc: 'header' } },
              { text: T(`因此它是：${kinds[kind].zh}。`, `So it is: ${kinds[kind].en}.`), go: { lesson: 'tcp', step: kind === 'fin' ? 3 : kind === 'data' ? 1 : 0 } },
            ],
          },
          {
            ask: T('对方正确收到这个报文段后，发回的确认号是多少？（十进制）', 'What acknowledgement number does the receiver send back (decimal)?'),
            pts: 2,
            type: 'number',
            answer: { value: ackNo },
            steps: [
              { text: T(`序号在 TCP 首部第 5～8 字节（帧偏移 0x26～0x29）：${H(seq, 32)}H = ${seq}。`, `Seq ${H(seq, 32)}H = ${seq}.`), go: { lesson: 'tcp-flow', doc: 'seq' } },
              { text: T(kind === 'data' ? `确认号 = 序号 + 数据长度 = ${seq} + ${len} = ${ackNo}，表示期望收到的下一个字节。` : `${kind === 'fin' ? 'FIN' : 'SYN'} 不带数据，但要消耗一个序号：确认号 = ${seq} + 1 = ${ackNo}。`, kind === 'data' ? `Ack = ${seq} + ${len} = ${ackNo}.` : `${kind === 'fin' ? 'FIN' : 'SYN'} uses one sequence number: ${ackNo}.`), go: { lesson: 'tcp', doc: kind === 'fin' ? 'close' : kind === 'data' ? 'reliable' : 'open' } },
            ],
          },
        ],
      };
    },
  },
  // ───── 操作系统：PV 同步 ─────
  {
    id: 'os-big-01',
    subject: 'os',
    chapter: 'process',
    topic: T('用 P、V 操作实现同步', 'Synchronisation with P and V'),
    type: 'big',
    difficulty: 3,
    lessons: ['semaphore'],
    tags: ['过程推演'],
    make(r) {
      const N = r.int(3, 8);
      const k = r.int(0, 2);
      const m = k + r.int(1, 3);
      // 第 2 问：货架上有 k 个包裹时接连来了 m 个取件人
      const ops = [];
      for (let i = 1; i <= m; i++) ops.push(...(i <= k ? [`C${i}:P(full)`, `C${i}:P(mutex)`, `C${i}:V(mutex)`, `C${i}:V(empty)`] : [`C${i}:P(full)`]));
      const p2 = { sems: `empty=${N - k} full=${k} mutex=1`, ops: ops.join(' ') };
      const l2 = L('semaphore', p2);
      const fullV = l2.sim.final.full;
      const waiting = l2.sim.stuck.length;
      // 第 3 问：快递员把两个 P 写反、货架已满
      const p3 = { sems: `empty=0 full=${N} mutex=1`, ops: 'A:P(mutex) A:P(empty) C:P(full) C:P(mutex)' }; // 取件人先 P(full)（货架满，能通过），再 P(mutex) 被挡住
      const l3 = L('semaphore', p3);
      const pc = { sems: `empty=${N} full=0 mutex=1`, ops: 'C:P(full) A:P(empty) A:P(mutex) A:V(mutex) A:V(full) C:P(mutex) C:V(mutex) C:V(empty) A:P(empty) A:P(mutex) A:V(mutex) A:V(full)' };
      const lpc = L('semaphore', pc);
      const opts3 = {
        dead: T('快递员拿着货架的使用权等空位，取件人等货架的使用权，互相等待，发生死锁', 'The courier holds the shelf waiting for space; the customer waits for the shelf: deadlock'),
        ok: T('快递员等待，取件人照常取走包裹后把他唤醒', 'The courier waits; a customer takes a parcel and wakes him'),
        over: T('快递员把包裹放到了第 N + 1 个位置上', 'The courier puts a parcel in slot N + 1'),
        slow: T('不影响正确性，只是效率低一些', 'Still correct, just slower'),
      };
      const { options, answer } = shuffled(r, opts3.dead, [opts3.ok, opts3.over, opts3.slow]);
      const code = {
        zh: `semaphore mutex = 1;   // 货架同一时刻只让一个人操作
semaphore empty = ${N};   // 货架上的空位数
semaphore full  = 0;   // 货架上的包裹数

快递员() {                  取件人() {
    while (1) {                 while (1) {
        P(empty);   // 等空位       P(full);    // 等包裹
        P(mutex);                  P(mutex);
        放一个包裹;                 取一个包裹;
        V(mutex);                  V(mutex);
        V(full);    // 包裹 +1      V(empty);   // 空位 +1
    }                           }
}                           }`,
        en: `semaphore mutex = 1;   // one person at the shelf at a time
semaphore empty = ${N};   // free slots
semaphore full  = 0;   // parcels on the shelf

courier() {                 customer() {
    while (1) {                 while (1) {
        P(empty);                  P(full);
        P(mutex);                  P(mutex);
        put a parcel;              take a parcel;
        V(mutex);                  V(mutex);
        V(full);                   V(empty);
    }                           }
}                           }`,
      };
      return {
        question: T(
          `快递驿站有一个能放 ${N} 个包裹的货架，开始时货架是空的。快递员每次往货架上放一个包裹，货架满了就要等；取件人每次从货架上取走一个包裹，货架空了就要等。货架同一时刻只允许一个人操作。快递员和取件人都有很多个。`,
          `A parcel shelf holds ${N} parcels and starts empty. Couriers each put one parcel (waiting if full); customers each take one (waiting if empty). Only one person may use the shelf at a time. There are many couriers and customers.`,
        ),
        parts: [
          {
            ask: T('用 P、V 操作写出快递员和取件人的同步过程，并说明所用信号量的含义和初值。', 'Write the courier and customer processes with P and V, giving each semaphore’s meaning and initial value.'),
            pts: 6,
            type: 'essay',
            ref: {
              text: T('这是「生产者—消费者」问题：mutex 管货架的互斥，empty 记空位、full 记包裹。放件前先等空位、取件前先等包裹，等到了再去申请货架的使用权；用完货架先释放 mutex，再通知对方。', 'A producer–consumer problem: mutex guards the shelf, empty counts slots, full counts parcels. Wait for a slot (or parcel) first, then for the shelf.'),
              code: T(code.zh, code.en),
            },
            rubric: [
              { text: T('mutex 初值为 1，实现对货架的互斥访问', 'mutex = 1 for exclusive use of the shelf'), pts: 1 },
              { text: T(`empty 初值 ${N}（空位数）、full 初值 0（包裹数），含义说清楚`, `empty = ${N} (slots), full = 0 (parcels), meanings stated`), pts: 1 },
              { text: T('快递员：先 P(empty) 再 P(mutex)，放好后 V(mutex)、V(full)', 'Courier: P(empty) before P(mutex); then V(mutex), V(full)'), pts: 2 },
              { text: T('取件人：先 P(full) 再 P(mutex)，取走后 V(mutex)、V(empty)', 'Customer: P(full) before P(mutex); then V(mutex), V(empty)'), pts: 2 },
            ],
            steps: [
              { text: T('先找同步关系：放件要等「有空位」，取件要等「有包裹」，各用一个计数信号量；再找互斥：货架一次一个人，用 mutex。', 'Two counting semaphores for the two waits, one mutex for the shelf.'), go: { lesson: 'semaphore', doc: 'classic' } },
              { text: T('动画里按这个写法走一遍：取件人先来会在 P(full) 上等，快递员放好后 V(full) 把他唤醒。', 'Walk through it: the customer waits on full until a courier signals.'), go: { lesson: 'semaphore', params: pc, step: last(lpc) } },
            ],
          },
          {
            ask: T(`按你写的代码：某时刻货架上有 ${k} 个包裹，没有人在操作货架；随后接连来了 ${m} 个取件人，这期间没有快递员来。这时信号量 full 的值是多少？`, `With your code: the shelf holds ${k} parcel(s) and is idle; then ${m} customers arrive and no courier comes. What is full now?`),
            pts: 2,
            type: 'number',
            answer: { value: fullV },
            steps: [
              { text: k ? T(`前 ${k} 个取件人各取走一个包裹，full 从 ${k} 减到 0；后面 ${m - k} 个执行 P(full) 时 full 变成负数并阻塞。`, `The first ${k} succeed; the other ${m - k} block on P(full).`) : T(`货架上一个包裹也没有，${m} 个取件人执行 P(full) 时 full 依次减到 ${Array.from({ length: m }, (_, i) => -(i + 1)).join('、')}，每个人都阻塞在 full 上。`, `The shelf is empty: all ${m} customers block on P(full).`), go: { lesson: 'semaphore', params: p2, step: last(l2) } },
              { text: T(`所以 full = ${k} − ${m} = ${fullV}；负数的绝对值 ${waiting} 就是在 full 上等待的取件人数。`, `full = ${fullV}; |full| = ${waiting} customers waiting.`), go: { lesson: 'semaphore', doc: 'sem' } },
            ],
          },
          {
            ask: T('如果快递员的代码把 P(empty) 和 P(mutex) 的顺序写反了（先 P(mutex)），货架放满后又来了一个快递员，接着来了一个取件人，会发生什么？', 'If the courier does P(mutex) before P(empty), and a courier arrives when the shelf is full, followed by a customer, what happens?'),
            pts: 2,
            type: 'single',
            options,
            answer,
            steps: [
              { text: T('快递员先拿到 mutex，再执行 P(empty)：货架满，empty 为 0，他拿着 mutex 阻塞了。', 'The courier takes mutex, then blocks on empty while holding it.'), go: { lesson: 'semaphore', params: p3, step: 1 } },
              { text: T(`取件人执行 P(full) 能通过，但接着 P(mutex) 被挡住；没人能 V(empty)，两人互相等待：死锁（动画最后 ${l3.sim.stuck.join('、')} 都阻塞）。所以「先 P 资源，再 P 互斥」。`, `The customer passes full but blocks on mutex: deadlock. Always P the resource before the mutex.`), go: { lesson: 'semaphore', params: p3, step: last(l3) } },
            ],
          },
        ],
      };
    },
  },
  // ───── 数据结构：算法设计 ─────
  {
    id: 'ds-big-01',
    subject: 'ds',
    chapter: 'list',
    topic: T('判断单链表是否中心对称', 'Is a linked list a palindrome?'),
    type: 'big',
    difficulty: 3,
    lessons: ['ll-algo', 'linked-list'],
    tags: ['过程推演'],
    make(r) {
      const n = r.int(5, 9);
      const half = Array.from({ length: Math.ceil(n / 2) }, () => r.int(1, 9));
      let list = [...half, ...half.slice(0, Math.floor(n / 2)).reverse()];
      if (r.next() < 0.5) {
        const i = r.int(0, Math.floor(n / 2) - 1);
        list[i] = list[i] === 9 ? 1 : list[i] + 1;
      }
      const a = list.join(' ');
      const pm = { ...base('ll-algo'), mode: 'mid', a };
      const lm = L('ll-algo', pm);
      const mid = lm.sim.ans;
      const back = list.slice(mid);
      const pr = { init: back.join(' '), ops: 'rev' };
      const lr = L('linked-list', pr);
      const sym = list.join() === [...list].reverse().join();
      const code = {
        zh: `typedef struct LNode {
    int data;
    struct LNode *next;
} LNode, *LinkList;

bool isSymmetric(LinkList L) {
    if (L->next == NULL) return true;          // 空表算对称
    // ① 快慢指针找中间：slow 停在前半段的最后一个结点
    LNode *slow = L->next, *fast = L->next;
    while (fast->next != NULL && fast->next->next != NULL) {
        slow = slow->next;
        fast = fast->next->next;
    }
    // ② 后半段原地逆置：逐个头插到 slow 的后面
    LNode *p = slow->next, *q;
    slow->next = NULL;
    while (p != NULL) {
        q = p->next;
        p->next = slow->next;
        slow->next = p;
        p = q;
    }
    // ③ 前半段和逆置后的后半段逐个比较
    LNode *a = L->next, *b = slow->next;
    while (b != NULL) {
        if (a->data != b->data) return false;
        a = a->next;
        b = b->next;
    }
    return true;   // 如果还要保留原表，可以再把后半段逆置回去
}`,
        en: `typedef struct LNode {
    int data;
    struct LNode *next;
} LNode, *LinkList;

bool isSymmetric(LinkList L) {
    if (L->next == NULL) return true;          // empty: symmetric
    // 1. slow/fast pointers: slow stops at the end of the first half
    LNode *slow = L->next, *fast = L->next;
    while (fast->next != NULL && fast->next->next != NULL) {
        slow = slow->next;
        fast = fast->next->next;
    }
    // 2. reverse the second half in place (head-insert after slow)
    LNode *p = slow->next, *q;
    slow->next = NULL;
    while (p != NULL) {
        q = p->next;
        p->next = slow->next;
        slow->next = p;
        p = q;
    }
    // 3. compare the two halves
    LNode *a = L->next, *b = slow->next;
    while (b != NULL) {
        if (a->data != b->data) return false;
        a = a->next;
        b = b->next;
    }
    return true;   // reverse the second half back to restore L if needed
}`,
      };
      const cx = {
        right: T('时间 O(n)，空间 O(1)', 'Time O(n), space O(1)'),
        w: [T('时间 O(n)，空间 O(n)', 'Time O(n), space O(n)'), T('时间 O(n²)，空间 O(1)', 'Time O(n²), space O(1)'), T('时间 O(n log n)，空间 O(1)', 'Time O(n log n), space O(1)')],
      };
      const { options, answer } = shuffled(r, cx.right, cx.w);
      return {
        question: T(
          '带头结点的单链表 L 中存放着 n 个整数，结点结构为 (data, next)。设计一个算法，判断 L 是否中心对称（从前往后读和从后往前读完全一样，例如 1→2→3→2→1），要求只用 O(1) 的额外空间。',
          'A headed singly linked list L holds n integers in nodes (data, next). Decide whether L is a palindrome (reads the same both ways, e.g. 1→2→3→2→1) using O(1) extra space.',
        ),
        parts: [
          {
            ask: T(`先看一个例子：L = (${list.join(', ')})。慢指针 slow 和快指针 fast 都从第一个数据结点出发，slow 每次走一步、fast 每次走两步，fast 后面不足两个结点时停下。slow 停在第几个结点？`, `Example: L = (${list.join(', ')}). slow and fast start at the first node; slow moves 1, fast moves 2, and they stop when fast has fewer than two nodes after it. At which node (1-based) does slow stop?`),
            pts: 2,
            type: 'number',
            answer: { value: mid },
            steps: [
              { text: T(`${n} 个结点，fast 每走两步 slow 走一步，最后 slow 停在第 ⌈${n}/2⌉ = ${mid} 个结点，也就是前半段的最后一个。${n % 2 ? '结点数是奇数，正中间那个归前半段，比较时用不着它。' : '结点数是偶数，停在两个中间结点的前一个。'}`, `slow stops at node ⌈${n}/2⌉ = ${mid}, the end of the first half.`), go: { lesson: 'll-algo', params: pm, step: last(lm) } },
              { text: T(`后半段是 (${back.join(', ')})，把它逆置后和前半段逐个比较，这个例子${sym ? '各位都相同，是对称的' : '有不相同的地方，不对称'}。`, `Second half (${back.join(', ')}); reversed and compared: ${sym ? 'symmetric' : 'not symmetric'}.`), go: { lesson: 'linked-list', params: pr, step: last(lr) } },
            ],
          },
          {
            ask: T('给出算法的基本设计思想。', 'Describe the basic idea of your algorithm.'),
            pts: 3,
            type: 'essay',
            ref: { text: T('用快慢指针一趟找到中间结点（慢指针走一步、快指针走两步，快指针到表尾时慢指针在中间）；把后半段链表原地逆置；然后用两个指针从前半段的开头和逆置后后半段的开头同时往后走，逐个比较 data，全部相同就是中心对称。只用了几个指针变量。', 'Find the middle with slow/fast pointers; reverse the second half in place; walk both halves comparing data. Only a few pointers are used.') },
            rubric: [
              { text: T('用快慢指针（或先数出长度）找到中间结点', 'Find the middle (slow/fast pointers or by counting)'), pts: 1 },
              { text: T('把后半段原地逆置（不借助栈或数组）', 'Reverse the second half in place (no stack or array)'), pts: 1 },
              { text: T('前后两半逐个比较，全部相同才对称', 'Compare the halves node by node'), pts: 1 },
            ],
            steps: [
              { text: T('快慢指针找中间：快指针每次多走一步，走完全程时慢指针正好走了一半。', 'Fast covers the list while slow covers half.'), go: { lesson: 'll-algo', doc: 'mid' } },
              { text: T('要求 O(1) 空间，就不能把元素压栈或复制到数组里，只能把后半段原地逆置（头插法）。', 'O(1) space rules out a stack: reverse in place by head insertion.'), go: { lesson: 'linked-list', params: pr, step: last(lr) } },
            ],
          },
          {
            ask: T('根据设计思想，用 C 语言描述算法，关键之处给出注释。', 'Write the algorithm in C with comments at the key points.'),
            pts: 5,
            type: 'essay',
            ref: { code: T(code.zh, code.en) },
            rubric: [
              { text: T('结点类型定义和函数接口正确，处理了空表', 'Node type, signature and the empty list handled'), pts: 1 },
              { text: T('找中间结点的循环条件对奇数、偶数个结点都正确', 'The middle-finding loop is right for odd and even n'), pts: 1 },
              { text: T('后半段逆置正确，没有断链或丢结点', 'The reversal is correct and loses no nodes'), pts: 2 },
              { text: T('比较循环正确并返回结果', 'The comparison loop and return value are right'), pts: 1 },
            ],
            steps: [{ text: T('三段循环各走一遍链表的一部分：找中间约 n/2 次、逆置约 n/2 次、比较约 n/2 次。写完可以用第 (1) 问的例子手动走一遍检查。', 'Three loops of about n/2 each; trace the example from part (1) to check.'), go: { lesson: 'll-algo', params: pm, step: last(lm) } }],
          },
          {
            ask: T('说明你的算法的时间复杂度和空间复杂度。', 'State the time and space complexity.'),
            pts: 2,
            type: 'single',
            options,
            answer,
            steps: [{ text: T('找中间、逆置、比较各扫描约 n/2 个结点，合起来 O(n)；只用了 slow、fast、p、q 等几个指针，额外空间 O(1)。', 'Each pass is about n/2: O(n) time; a few pointers: O(1) space.'), go: { lesson: 'll-algo', doc: 'why' } }],
          },
        ],
      };
    },
  },
];
