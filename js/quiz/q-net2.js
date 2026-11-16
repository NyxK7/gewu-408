// 计算机网络第二批题：每一章都有。生成题的答案由课程同一份计算代码算出（通过课程的 update 拿到 sim，参数格式和课程一样）。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { CODES } from '../subjects/net/mux.js';
import { ospf } from '../subjects/net/ospf.js';
import { hx4 } from '../subjects/net/udp.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const base = (id) => ({ ...lessonById(id).params });
const fix = (v, d = 2) => (Number.isInteger(v) ? String(v) : v.toFixed(d));

export const NET_QUESTIONS2 = [
  // ───── 体系结构 ─────
  {
    id: 'net-delay-01',
    subject: 'net',
    chapter: 'arch',
    topic: T('分组交换的时延', 'Packet-switching delay'),
    type: 'number',
    difficulty: 2,
    lessons: ['delay'],
    tags: ['计算'],
    conv: T('只算发送时延，不计传播时延、处理和排队时延；分组不带首部；存储转发。', 'Transmission delay only; no headers; store-and-forward.'),
    make(r) {
      const x = r.pick([8000, 12000, 16000, 24000]);
      const p = r.pick([1000, 2000, 4000].filter((v) => x % v === 0 && x / v <= 16));
      const k = r.int(2, 5);
      const b = r.pick([1000000, 2000000]);
      const params = { ...base('delay'), x, p, h: 0, b, d: '0', k };
      const l = L('delay', params);
      const s = l.sim;
      const ms = s.pktTotal * 1000;
      return {
        question: T(`要发 ${x} 位的报文，分成每个 ${p} 位的分组，经过 ${k} 段链路（${k - 1} 个路由器）到达对方，每段链路速率 ${b / 1e6} Mb/s。从发出第一位到对方收到最后一位，至少要多少毫秒？`, `A ${x}-bit message in ${p}-bit packets crosses ${k} links of ${b / 1e6} Mb/s. Minimum total time (ms)?`),
        answer: { value: ms, tol: 0.001, show: fix(ms, 3) },
        steps: [
          { text: T(`源点把 ${x / p} 个分组发完要 ${x}/${b} = ${fix(x / b * 1000, 3)} ms。`, `The source needs ${fix(x / b * 1000, 3)} ms.`), go: { lesson: 'delay', params, step: 0 } },
          { text: T(`最后一个分组还要再经过 ${k - 1} 个路由器各转发一次，每次 ${p}/${b} = ${fix(p / b * 1000, 3)} ms。`, `The last packet needs ${k - 1} more hops of ${fix(p / b * 1000, 3)} ms.`), go: { lesson: 'delay', params, step: last(l) } },
          { text: T(`合计 ${fix(x / b * 1000, 3)} + ${k - 1} × ${fix(p / b * 1000, 3)} = ${fix(ms, 3)} ms。`, `Total ${fix(ms, 3)} ms.`), go: { lesson: 'delay', doc: 'calc' } },
        ],
      };
    },
  },
  {
    id: 'net-encap-01',
    subject: 'net',
    chapter: 'arch',
    topic: T('逐层封装与首部开销', 'Encapsulation overhead'),
    type: 'number',
    difficulty: 1,
    lessons: ['encap'],
    tags: ['计算'],
    conv: T('TCP、IP 首部各 20 字节，UDP 8 字节；以太网首部 14 + FCS 4，数据不足 46 字节要填充；算上 8 字节前导码。', 'TCP/IP 20 B, UDP 8 B; Ethernet 14 + 4 with 46 B minimum payload; plus an 8 B preamble.'),
    make(r) {
      const app = r.pick(['http', 'dns']);
      const n = r.pick([r.int(1, 20), r.int(100, 1400)]);
      const params = { app, n, link2: 'eth' };
      const l = L('encap', params);
      const s = l.sim;
      return {
        question: T(`主机用 ${app === 'http' ? 'TCP' : 'UDP'} 发送 ${n} 字节的应用数据，经以太网发出。线路上一共要传多少字节（含前导码）？`, `${n} bytes over ${app === 'http' ? 'TCP' : 'UDP'} on Ethernet: how many bytes on the wire, preamble included?`),
        answer: { value: s.wire1 },
        steps: [
          { text: T(`${n} + ${app === 'http' ? 'TCP 20' : 'UDP 8'} + IP 20 = ${s.ipLen} 字节的 IP 数据报。`, `IP datagram: ${s.ipLen} B.`), go: { lesson: 'encap', params, step: 2 } },
          { text: T(`${s.pad ? `不够 46 字节，填充 ${s.pad} 字节；` : ''}加以太网首部 14 和 FCS 4，帧长 ${s.ethFrame}；再加前导码 8，共 ${s.wire1} 字节。`, `${s.pad ? `Pad ${s.pad}; ` : ''}frame ${s.ethFrame}, wire ${s.wire1}.`), go: { lesson: 'encap', params, step: 4 } },
        ],
      };
    },
  },
  // ───── 物理层 ─────
  {
    id: 'net-nyq-01',
    subject: 'net',
    chapter: 'phy',
    topic: T('奈氏准则与香农公式', 'Nyquist and Shannon'),
    type: 'number',
    difficulty: 2,
    lessons: ['nyquist'],
    tags: ['计算'],
    make(r) {
      const W = r.pick([3000, 4000, 8000]);
      const V = r.pick([4, 8, 16, 32]);
      const snr = r.pick([20, 30, 40]);
      const params = { ...base('nyquist'), W: String(W), V, snr: String(snr), db: true };
      const l = L('nyquist', params);
      const s = l.sim;
      const kb = s.max / 1000;
      return {
        question: T(`信道带宽 ${W} Hz，信噪比 ${snr} dB，采用 ${V} 种状态的码元。这个信道的最大数据传输速率是多少 kb/s？`, `Bandwidth ${W} Hz, SNR ${snr} dB, ${V}-level symbols. Maximum data rate (kb/s)?`),
        answer: { value: kb, tol: 0.06, show: fix(kb, 1) },
        steps: [
          { text: T(`奈氏准则：2W log₂V = 2 × ${W} × ${Math.log2(V)} = ${s.nyq / 1000} kb/s。`, `Nyquist: ${s.nyq / 1000} kb/s.`), go: { lesson: 'nyquist', params, step: 0 } },
          { text: T(`香农公式：S/N = 10^(${snr}/10) = ${s.ratio}，W log₂(1 + S/N) ≈ ${fix(s.shannon / 1000, 1)} kb/s。`, `Shannon: ≈ ${fix(s.shannon / 1000, 1)} kb/s.`), go: { lesson: 'nyquist', params, step: 1 } },
          { text: T(`两个上限取小的：${fix(kb, 1)} kb/s（受${s.by === 'nyq' ? '码元状态数' : '信噪比'}限制）。`, `Take the smaller: ${fix(kb, 1)} kb/s.`), go: { lesson: 'nyquist', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'net-cdma-01',
    subject: 'net',
    chapter: 'phy',
    topic: T('码分复用', 'CDMA'),
    type: 'single',
    difficulty: 2,
    lessons: ['mux'],
    tags: ['计算'],
    make(r) {
      const bits = [0, 1, 2].map(() => r.pick(['1', '0', '-']));
      const k = r.int(1, 3);
      const params = { mode: 'cdma', bits, target: k, users: ['ab.c', '..d.', 'e..f', '.g..'], k: 2 };
      const l = L('mux', params);
      const s = l.sim;
      const tm = s.times[0];
      const d = tm.decode[k - 1];
      const opts = [T('发送了比特 1', 'sent 1'), T('发送了比特 0', 'sent 0'), T('没有发送', 'sent nothing')];
      return {
        question: T(`三个站的码片序列为 S1 = (${CODES[0].join(' ')})，S2 = (${CODES[1].join(' ')})，S3 = (${CODES[2].join(' ')})。某一比特时间接收方收到叠加信号 (${tm.sum.join(' ')})。S${k} 在这个比特时间：`, `Chips S1 = (${CODES[0].join(' ')}), S2 = (${CODES[1].join(' ')}), S3 = (${CODES[2].join(' ')}). Received (${tm.sum.join(' ')}). Station S${k}:`),
        options: opts,
        answer: d.bit === '1' ? 0 : d.bit === '0' ? 1 : 2,
        steps: [
          { text: T(`和 S${k} 逐位相乘：(${d.prod.join(' ')})，相加得 ${d.sum}。`, `Products sum to ${d.sum}.`), go: { lesson: 'mux', params, step: 2 } },
          { text: T(`除以码片数 8 得 ${d.v}：${d.v === 1 ? '是 1' : d.v === -1 ? '是 0' : '0 表示没发'}。`, `÷ 8 = ${d.v}.`), go: { lesson: 'mux', doc: 'cdma' } },
        ],
      };
    },
  },
  // ───── 数据链路层 ─────
  {
    id: 'net-crc-01',
    subject: 'net',
    chapter: 'link',
    topic: T('CRC 循环冗余校验', 'CRC'),
    type: 'text',
    difficulty: 2,
    lessons: ['crc'],
    tags: ['计算'],
    make(r) {
      const gen = r.pick(['1101', '1011', '10011', '11001']);
      const n = r.int(6, 9);
      const data = '1' + Array.from({ length: n - 1 }, () => r.pick(['0', '1'])).join('');
      const params = { ...base('crc'), data, gen, flips: [] };
      const l = L('crc', params);
      const s = l.sim;
      const rem = s.rem.join('');
      return {
        question: T(`要发送的数据是 ${data}，生成多项式对应的比特串是 ${gen}。用 CRC 算出的冗余码（余数）是什么？`, `Data ${data}, generator ${gen}. What is the CRC remainder?`),
        answer: { accept: [rem], show: rem },
        steps: [
          { text: T(`生成多项式 ${gen.length - 1} 阶，在数据后面补 ${gen.length - 1} 个 0：${s.dividend.join('')}。`, `Append ${gen.length - 1} zeros.`), go: { lesson: 'crc', params, step: 0 } },
          { text: T(`做模 2 除法（异或、不借位），余数 ${rem}。发送的帧是 ${s.frame.join('')}。`, `Mod-2 division gives ${rem}; frame ${s.frame.join('')}.`), go: { lesson: 'crc', params, step: Math.min(last(l), 3) } },
        ],
      };
    },
  },
  {
    id: 'net-csma-01',
    subject: 'net',
    chapter: 'link',
    topic: T('CSMA/CD 最短帧长', 'CSMA/CD minimum frame'),
    type: 'number',
    difficulty: 2,
    lessons: ['csma-cd'],
    tags: ['计算'],
    make(r) {
      const Lm = r.pick([1000, 2000, 2500, 4000, 5000]);
      const R = r.pick([10, 100]);
      const params = { ...base('csma-cd'), L: Lm, R };
      const l = L('csma-cd', params);
      const s = l.sim;
      return {
        question: T(`CSMA/CD 网络中两站最远相距 ${Lm} m，信号传播速度 2×10⁸ m/s，数据率 ${R} Mb/s。最短帧长是多少比特？`, `Stations up to ${Lm} m apart, 2×10⁸ m/s, ${R} Mb/s. Minimum frame length in bits?`),
        answer: { value: s.minBits },
        steps: [
          { text: T(`单程传播时延 τ = ${Lm} / (2×10⁸) = ${s.tau * 1e6} μs，争用期 2τ = ${s.slot * 1e6} μs。`, `τ = ${s.tau * 1e6} μs, 2τ = ${s.slot * 1e6} μs.`), go: { lesson: 'csma-cd', params, step: 0 } },
          { text: T(`帧的发送时间至少要等于争用期，才能在发完之前检测到冲突：${R} Mb/s × ${s.slot * 1e6} μs = ${s.minBits} 位。`, `${s.minBits} bits.`), go: { lesson: 'csma-cd', doc: 'slot' } },
        ],
      };
    },
  },
  {
    id: 'net-frame-01',
    subject: 'net',
    chapter: 'link',
    topic: T('零比特填充', 'Bit stuffing'),
    type: 'text',
    difficulty: 1,
    lessons: ['framing'],
    tags: ['计算'],
    make(r) {
      let bits = '';
      for (let i = 0; i < r.int(14, 20); i++) bits += r.next() < 0.75 ? '1' : '0';
      const params = { mode: 'bit', data: bits, ctl: false };
      const l = L('framing', params);
      const s = l.sim;
      return {
        question: T(`采用零比特填充法，数据部分 ${bits} 经填充后实际发送的比特串是什么？（不含首尾标志）`, `With bit stuffing, what is sent for ${bits}? (without flags)`),
        answer: { accept: [s.out], show: s.out },
        steps: [
          { text: T(`从左往右数连续的 1，每满 5 个就在后面插一个 0，然后重新计数。一共插了 ${s.added} 个 0。`, `Insert 0 after every five 1s: ${s.added} inserted.`), go: { lesson: 'framing', params, step: Math.min(1, last(l)) } },
          { text: T(`结果：${s.out}。`, `Result: ${s.out}.`), go: { lesson: 'framing', params, step: last(l) - 1 } },
        ],
      };
    },
  },
  {
    id: 'net-switch-01',
    subject: 'net',
    chapter: 'link',
    topic: T('交换机自学习', 'Switch learning'),
    type: 'single',
    difficulty: 2,
    lessons: ['switch'],
    tags: ['过程推演'],
    conv: T('A、B、C 接交换机 1～3 口，D、E 经集线器接 4 口；转发表开始为空，不老化。', 'A, B, C on ports 1–3; D, E on port 4 via a hub. Empty table, no aging.'),
    make(r) {
      const H = ['A', 'B', 'C', 'D', 'E'];
      const want = r.pick(['forward', 'flood', 'filter', 'broadcast']);
      let frames;
      let sim;
      let l;
      for (let t = 0; t < 400; t++) {
        const fs = [];
        for (let i = 0; i < 4; i++) {
          const s = r.pick(H);
          const d = r.next() < 0.12 ? 'FF' : r.pick(H.filter((h) => h !== s));
          fs.push(`${s}>${d}`);
        }
        frames = fs.join(', ');
        l = L('switch', { frames, vlan: false, age: 0 });
        sim = l.sim;
        if (sim.steps.at(-1).action === want) break;
      }
      const params = { frames, vlan: false, age: 0 };
      const s = sim.steps.at(-1);
      const opts = [T('只从一个端口转发', 'forward on one port'), T('泛洪（查不到目的地址）', 'flood (unknown)'), T('丢弃（目的在进来的端口）', 'filter (same port)'), T('广播到其他所有端口', 'broadcast')];
      return {
        question: T(`交换机依次收到帧 ${frames}（「源>目的」，FF 为广播）。它怎样处理最后一个帧？`, `The switch receives ${frames}. What does it do with the last frame?`),
        options: opts,
        answer: ['forward', 'flood', 'filter', 'broadcast'].indexOf(s.action),
        steps: [
          { text: T(`处理最后一帧之前，转发表里有：${sim.steps.at(-2)?.table.map((e) => `${e.mac}→${e.port}口`).join('、') || '（空）'}。`, `Table before: ${sim.steps.at(-2)?.table.map((e) => `${e.mac}:${e.port}`).join(', ') || 'empty'}.`), go: { lesson: 'switch', params, step: sim.steps.length - 2 } },
          { text: T(`最后一帧 ${s.src}→${s.dst === 'FF' ? '广播' : s.dst}：${s.action === 'broadcast' ? '目的是广播地址' : s.action === 'flood' ? `表里没有 ${s.dst}` : s.action === 'filter' ? `${s.dst} 也在 ${s.inPort} 口` : `${s.dst} 在 ${s.hit.port} 口`}，所以${opts[['forward', 'flood', 'filter', 'broadcast'].indexOf(s.action)].zh}。`, `${s.action}.`), go: { lesson: 'switch', params, step: sim.steps.length - 1 } },
        ],
      };
    },
  },
  // ───── 网络层 ─────
  {
    id: 'net-frag-01',
    subject: 'net',
    chapter: 'network',
    topic: T('IP 分片', 'IP fragmentation'),
    type: 'number',
    difficulty: 2,
    lessons: ['ip-frag'],
    tags: ['计算'],
    conv: T('IP 首部 20 字节，不带选项。', 'IP headers are 20 bytes.'),
    make(r) {
      const total = r.int(30, 80) * 100;
      const mtu = r.pick([576, 1000, 1500]);
      const params = { ...base('ip-frag'), total, hdr: 20, mtu, df: false, mtu2: 0 };
      const l = L('ip-frag', params);
      const s = l.sim;
      const lastF = s.frags.at(-1);
      return {
        question: T(`一个总长 ${total} 字节的 IP 数据报（首部 20 字节）要经过 MTU 为 ${mtu} 字节的链路。分片后最后一个分片的片偏移字段是多少？`, `A ${total}-byte datagram crosses an MTU of ${mtu}. What is the offset field of the last fragment?`),
        answer: { value: lastF.field },
        steps: [
          { text: T(`每片最多带 ⌊(${mtu} − 20) / 8⌋ × 8 = ${s.per} 字节数据；原数据 ${total - 20} 字节，分成 ${s.frags.length} 片。`, `${s.per} bytes per fragment; ${s.frags.length} fragments.`), go: { lesson: 'ip-frag', params, step: 1 } },
          { text: T(`最后一片从第 ${lastF.off} 字节开始，片偏移以 8 字节为单位：${lastF.off} / 8 = ${lastF.field}。`, `${lastF.off} / 8 = ${lastF.field}.`), go: { lesson: 'ip-frag', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'net-lpm-01',
    subject: 'net',
    chapter: 'network',
    topic: T('最长前缀匹配', 'Longest-prefix match'),
    type: 'single',
    difficulty: 2,
    lessons: ['lpm'],
    tags: ['计算'],
    make(r) {
      const table = base('lpm').table;
      const pref = [[172, 16, 0, 0, 16], [172, 16, 128, 0, 17], [172, 16, 160, 0, 19], [172, 16, 168, 0, 21]];
      const [a, b, c, d, len] = r.pick(pref);
      const baseInt = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
      const ip = (baseInt + r.int(1, 2 ** (32 - len) - 2)) >>> 0;
      const dest = [ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.');
      const params = { table, dests: dest };
      const l = L('lpm', params);
      const s = l.sim.dests[0];
      const hops = ['接口0', '接口1', 'R2', 'R3', 'R4'];
      const show = { 接口0: T('接口 0', 'port 0'), 接口1: T('接口 1', 'port 1'), R2: 'R2', R3: 'R3', R4: T('R4（默认路由）', 'R4 (default)') };
      return {
        question: T(`路由器的转发表：172.16.0.0/16 → 接口 0；172.16.128.0/17 → 接口 1；172.16.160.0/19 → R2；172.16.168.0/21 → R3；默认 → R4。目的地址 ${dest} 的分组从哪里转发？`, `Table: 172.16.0.0/16 → port 0; /17 → port 1; 172.16.160.0/19 → R2; 172.16.168.0/21 → R3; default → R4. Where does ${dest} go?`),
        options: hops.map((h) => show[h]),
        answer: hops.indexOf(s.hop),
        steps: [
          { text: T(`把 ${dest} 写成二进制，和每一行的前缀逐位比较：能匹配的有 ${s.hits.map((i) => l.sim.rows[i].text ?? `第 ${i + 1} 行`).join('、')}。`, `Matching rows: ${s.hits.length}.`), go: { lesson: 'lpm', params, step: 0 } },
          { text: T(`取前缀最长的那一行，下一跳是 ${s.hop}。`, `Longest match → ${s.hop}.`), go: { lesson: 'lpm', params, step: last(l) } },
        ],
      };
    },
  },
  {
    id: 'net-ospf-01',
    subject: 'net',
    chapter: 'network',
    topic: T('链路状态路由', 'Link-state routing'),
    type: 'single',
    difficulty: 2,
    lessons: ['ospf'],
    tags: ['计算'],
    make(r) {
      for (let t = 0; ; t++) {
        const V = ['R1', 'R2', 'R3', 'R4', 'R5'];
        const edges = new Map();
        for (let i = 0; i < 5; i++) edges.set(`${V[i]}-${V[(i + 1) % 5]}`, r.int(1, 6));
        const extra = r.pick([['R1', 'R3'], ['R1', 'R4']]); // R1 要有 3 个邻居，选项才够
        edges.set(extra.join('-'), r.int(1, 6));
        const graph = [...edges].map(([k, w]) => `${k} ${w}`).join(', ');
        const dest = r.pick(['R3', 'R4']);
        const sim = ospf({ graph, src: 'R1' });
        const row = sim.table.find((x) => x.dest === dest);
        // 下一跳要唯一：经过各个邻居的最短距离只有一个等于最优值
        const nbrs = r.shuffle(sim.adj.R1.map((a) => a.to)); // 打乱，免得答案总在最后一个
        const via = nbrs.map((n) => {
          const d2 = ospf({ graph, src: n }).d.dist;
          return sim.adj.R1.find((a) => a.to === n).w + (n === dest ? 0 : d2[dest]);
        });
        if (via.filter((v) => v === row.cost).length !== 1 && t < 200) continue;
        const params = { graph, src: 'R1', fail: '' };
        const l = L('ospf', params);
        return {
          question: T(`链路和代价：${graph}。R1 用链路状态路由算出最短路径后，到 ${dest} 的下一跳是：`, `Links: ${graph}. After link-state routing, R1’s next hop to ${dest} is:`),
          options: nbrs,
          answer: nbrs.indexOf(row.next),
          steps: [
            { text: T(`R1 以自己为根跑 Dijkstra：${sim.d.rounds.map((x) => `${x.pick}=${x.d}`).join('，')}。`, `Dijkstra: ${sim.d.rounds.map((x) => `${x.pick}=${x.d}`).join(', ')}.`), go: { lesson: 'ospf', params, step: last(l) - 1 } },
            { text: T(`到 ${dest} 的最短路径 ${row.path.join(' → ')}，代价 ${row.cost}，下一跳 ${row.next}。`, `${row.path.join(' → ')}, cost ${row.cost}: next hop ${row.next}.`), go: { lesson: 'ospf', params, step: last(l) } },
          ],
        };
      }
    },
  },
  {
    id: 'net-proto-02',
    subject: 'net',
    chapter: 'network',
    topic: T('路由协议', 'Routing protocols'),
    type: 'single',
    difficulty: 1,
    lessons: ['ospf', 'rip'],
    tags: ['概念'],
    question: T('OSPF 协议的报文直接封装在什么里面传送？', 'OSPF packets are carried directly in:'),
    options: [T('UDP 用户数据报', 'UDP datagrams'), T('TCP 报文段', 'TCP segments'), T('IP 数据报', 'IP datagrams'), T('以太网帧（不经过 IP）', 'Ethernet frames without IP')],
    answer: 2,
    steps: [{ text: T('OSPF 直接用 IP 传送（协议字段 89）；RIP 用 UDP 的 520 端口；BGP 用 TCP 的 179 端口。', 'OSPF uses IP protocol 89; RIP UDP 520; BGP TCP 179.'), go: { lesson: 'ospf', doc: 'hier' } }],
  },
  {
    id: 'net-dev-01',
    subject: 'net',
    chapter: 'link',
    topic: T('冲突域和广播域', 'Collision and broadcast domains'),
    type: 'single',
    difficulty: 1,
    lessons: ['switch'],
    tags: ['概念'],
    question: T('下列设备中，能隔离广播域的是：', 'Which device separates broadcast domains?'),
    options: [T('集线器', 'Hub'), T('中继器', 'Repeater'), T('交换机（不划分 VLAN）', 'Switch (no VLANs)'), T('路由器', 'Router')],
    answer: 3,
    steps: [
      { text: T('集线器、中继器在物理层，既不隔离冲突域也不隔离广播域；交换机每个端口一个冲突域，但所有端口仍在一个广播域；路由器两者都隔离。', 'Hubs split nothing; switches split collision domains; routers split both.'), go: { lesson: 'switch', doc: 'domain' } },
    ],
  },
  // ───── 传输层 ─────
  {
    id: 'net-tcp-01',
    subject: 'net',
    chapter: 'transport',
    topic: T('TCP 序号与确认号', 'TCP sequence and ack numbers'),
    type: 'number',
    difficulty: 2,
    lessons: ['tcp-flow'],
    tags: ['计算'],
    make(r) {
      const seq0 = r.int(1, 90) * 100 + 1;
      const lens = [0, 1, 2, 3].map(() => r.pick([100, 200, 300, 400]));
      const lost = r.int(-1, 3);
      const seqs = lens.map((_, i) => seq0 + lens.slice(0, i).reduce((a, b) => a + b, 0));
      const ack = lost < 0 ? seqs[3] + lens[3] : seqs[lost];
      return {
        question: T(`A 向 B 连续发 4 个报文段，数据长度依次为 ${lens.join('、')} 字节，第一个报文段的序号是 ${seq0}。${lost < 0 ? '4 个都正确到达' : `其中第 ${lost + 1} 个丢失，其余都到达`}。B 收完后发出的确认号是多少？`, `A sends 4 segments of ${lens.join(', ')} bytes, the first with seq ${seq0}. ${lost < 0 ? 'All arrive' : `Segment ${lost + 1} is lost`}. What ack does B send?`),
        answer: { value: ack },
        steps: [
          { text: T(`下一段的序号 = 上一段序号 + 长度：${seqs.join('、')}。`, `Sequence numbers: ${seqs.join(', ')}.`), go: { lesson: 'tcp-flow', doc: 'seq' } },
          { text: lost < 0 ? T(`全部收到，确认号是期望的下一个字节 ${seqs[3]} + ${lens[3]} = ${ack}。`, `All received: ${ack}.`) : T(`TCP 累积确认：第 ${lost + 1} 段（序号 ${seqs[lost]}）没到，后面的即使到了也只能缓存，确认号停在 ${ack}。`, `Cumulative: the ack stays at ${ack}.`), go: { lesson: 'tcp-flow', params: { seq0, mss: 400, total: lens.reduce((a, b) => a + b, 0), buf: 2000, reads: [] }, step: 1 } },
        ],
      };
    },
  },
  {
    id: 'net-tcp-02',
    subject: 'net',
    chapter: 'transport',
    topic: T('TCP 流量控制', 'TCP flow control'),
    type: 'number',
    difficulty: 2,
    lessons: ['tcp-flow'],
    tags: ['计算'],
    make(r) {
      const mss = r.pick([100, 200, 500]);
      const buf = mss * r.int(2, 6);
      const total = buf + mss * r.int(1, 4);
      const read = mss * r.int(0, buf / mss);
      const params = { seq0: 1, mss, total, buf, reads: [read] };
      const l = L('tcp-flow', params);
      const rd = l.sim.rounds[0];
      return {
        question: T(`B 的接收缓存 ${buf} 字节，开始时通告窗口 ${buf}。A 按窗口把数据一次发满（MSS = ${mss}），B 全部收到后应用进程只读走了 ${read} 字节。B 在确认里通告的窗口是多少？`, `B’s buffer is ${buf} B. A fills the window (MSS ${mss}); B’s application reads ${read} B. What window does B advertise?`),
        answer: { value: rd.ack.rwnd },
        steps: [
          { text: T(`A 发了 ${rd.segs.length} 个报文段共 ${rd.filled} 字节，B 的缓存装了 ${rd.filled} 字节。`, `${rd.filled} bytes arrive.`), go: { lesson: 'tcp-flow', params, step: 0 } },
          { text: T(`应用读走 ${read}，缓存里还剩 ${rd.buffered}，空闲 ${buf} − ${rd.buffered} = ${rd.ack.rwnd}，就是通告的窗口。`, `Free space ${rd.ack.rwnd}.`), go: { lesson: 'tcp-flow', params, step: 1 } },
        ],
      };
    },
  },
  {
    id: 'net-cc-01',
    subject: 'net',
    chapter: 'transport',
    topic: T('TCP 拥塞控制', 'TCP congestion control'),
    type: 'number',
    difficulty: 3,
    lessons: ['tcp-cc'],
    tags: ['过程推演'],
    conv: T('cwnd 以报文段为单位，每一轮一个 RTT；慢开始翻倍超过 ssthresh 时只增到 ssthresh；超时后 ssthresh = ⌊cwnd/2⌋，cwnd = 1。', 'cwnd in segments, one round per RTT; slow start stops at ssthresh; on timeout ssthresh = ⌊cwnd/2⌋, cwnd = 1.'),
    make(r) {
      const ss = r.pick([8, 12, 16, 32]);
      const to = r.int(6, 12);
      const k = to + r.int(2, 8);
      const params = { ...base('tcp-cc'), variant: 'reno', cwnd0: 1, ssthresh0: ss, rounds: Math.max(k, 20), timeouts: [to], dup3: [], rwnd: 0 };
      const l = L('tcp-cc', params);
      const rows = l.sim.rows;
      const row = rows[k - 1];
      return {
        question: T(`TCP 初始 cwnd = 1，ssthresh = ${ss}。第 ${to} 轮发送时发生超时。第 ${k} 轮的拥塞窗口是多少？`, `cwnd 1, ssthresh ${ss}; a timeout in round ${to}. What is cwnd in round ${k}?`),
        answer: { value: row.cwnd },
        steps: [
          { text: T(`第 ${to} 轮的 cwnd 是 ${rows[to - 1].cwnd}，超时后 ssthresh 变成 ${rows[to].ssthresh}，cwnd 回到 1。`, `At the timeout cwnd was ${rows[to - 1].cwnd}; ssthresh becomes ${rows[to].ssthresh}.`), go: { lesson: 'tcp-cc', params, step: to - 1 } },
          { text: T(`之后各轮：${rows.slice(to, k).map((x) => x.cwnd).join('、')}，所以第 ${k} 轮是 ${row.cwnd}。`, `Then ${rows.slice(to, k).map((x) => x.cwnd).join(', ')}.`), go: { lesson: 'tcp-cc', params, step: k - 1 } },
        ],
      };
    },
  },
  {
    id: 'net-udp-01',
    subject: 'net',
    chapter: 'transport',
    topic: T('UDP 校验和', 'UDP checksum'),
    type: 'text',
    difficulty: 3,
    lessons: ['udp'],
    tags: ['计算'],
    conv: T('按 16 位反码求和（进位回卷）再取反；伪首部包括源 IP、目的 IP、0、17、UDP 长度。', 'Ones’-complement 16-bit sum with wrap-around, then complement; pseudo-header included.'),
    make(r) {
      const data = String.fromCharCode(r.int(65, 90), r.int(65, 90));
      const srcPort = r.int(1024, 9999);
      const params = { srcIp: '10.0.0.1', dstIp: '10.0.0.2', srcPort, dstPort: 53, data, flip: -1 };
      const l = L('udp', params);
      const s = l.sim;
      const ck = hx4(s.cks);
      return {
        question: T(`源 IP 10.0.0.1、目的 IP 10.0.0.2，源端口 ${srcPort}、目的端口 53，数据是 2 个 ASCII 字符「${data}」。UDP 校验和是多少？（写 4 位十六进制）`, `10.0.0.1 → 10.0.0.2, ports ${srcPort} → 53, data “${data}”. What is the UDP checksum (4 hex digits)?`),
        answer: { accept: [ck, ck.toLowerCase(), `0x${ck}`], show: ck },
        steps: [
          { text: T(`要相加的字：${s.words.map((w) => hx4(w.v)).join(' ')}（校验和字段先填 0，UDP 长度 = 8 + 2 = 10）。`, `Words: ${s.words.map((w) => hx4(w.v)).join(' ')}.`), go: { lesson: 'udp', params, step: 0 } },
          { text: T(`逐个相加、进位回卷，和是 ${hx4(s.sum)}；取反得 ${ck}。`, `Sum ${hx4(s.sum)}, complement ${ck}.`), go: { lesson: 'udp', params, step: 4 } },
        ],
      };
    },
  },
  // ───── 应用层 ─────
  {
    id: 'net-ftp-01',
    subject: 'net',
    chapter: 'app',
    topic: T('FTP 的端口', 'FTP ports'),
    type: 'number',
    difficulty: 1,
    lessons: ['ftp'],
    tags: ['计算'],
    make(r) {
      const p1 = r.int(4, 250);
      const p2 = r.int(0, 255);
      const port = p1 * 256 + p2;
      return {
        question: T(`FTP 客户端在控制连接上发出 PORT 192,168,1,5,${p1},${p2}。服务器应该连客户端的哪个端口？`, `The client sends PORT 192,168,1,5,${p1},${p2}. Which port should the server connect to?`),
        answer: { value: port },
        steps: [
          { text: T(`前四个数是 IP 地址 192.168.1.5，后两个数是端口的高 8 位和低 8 位：${p1} × 256 + ${p2} = ${port}。`, `${p1} × 256 + ${p2} = ${port}.`), go: { lesson: 'ftp', doc: 'mode' } },
          { text: T('这是主动模式：服务器从自己的 20 端口连过去。', 'Active mode: the server connects from port 20.'), go: { lesson: 'ftp', params: { mode: 'active', files: ['a.txt', 'b.pdf'], ctlPort: 50100 }, step: 2 } },
        ],
      };
    },
  },
  {
    id: 'net-mail-01',
    subject: 'net',
    chapter: 'app',
    topic: T('MIME 与 base64', 'MIME and base64'),
    type: 'number',
    difficulty: 1,
    lessons: ['email'],
    tags: ['计算'],
    make(r) {
      const n = r.int(10, 3000);
      const m = Math.ceil(n / 3) * 4;
      return {
        question: T(`一个 ${n} 字节的附件用 base64 编码后有多少个字符（不计换行）？`, `How many characters does a ${n}-byte attachment take in base64 (no line breaks)?`),
        answer: { value: m },
        steps: [
          { text: T(`每 3 字节编成 4 个字符，最后不足 3 字节也要补成 4 个字符：⌈${n} / 3⌉ × 4 = ${Math.ceil(n / 3)} × 4 = ${m}。`, `⌈${n} / 3⌉ × 4 = ${m}.`), go: { lesson: 'email', doc: 'mime' } },
        ],
      };
    },
  },
  {
    id: 'net-proto-01',
    subject: 'net',
    chapter: 'app',
    topic: T('应用层协议用的传输层协议', 'Transport used by applications'),
    type: 'multi',
    difficulty: 1,
    lessons: ['ftp', 'email', 'udp'],
    tags: ['概念'],
    question: T('下列应用层协议中，使用 TCP 的有：', 'Which of these use TCP?'),
    options: ['FTP', 'SMTP', 'POP3', 'HTTP', 'DHCP', 'TFTP', 'RIP'],
    answer: [0, 1, 2, 3],
    steps: [
      { text: T('FTP（21）、SMTP（25）、POP3（110）、HTTP（80）都用 TCP；DHCP（67/68）、TFTP（69）、RIP（520）用 UDP。DNS 一般用 UDP，区域传送时用 TCP。', 'FTP, SMTP, POP3, HTTP use TCP; DHCP, TFTP, RIP use UDP.'), go: { lesson: 'udp', doc: 'udp' } },
    ],
  },
  {
    id: 'net-mail-02',
    subject: 'net',
    chapter: 'app',
    topic: T('电子邮件', 'E-mail'),
    type: 'single',
    difficulty: 1,
    lessons: ['email'],
    tags: ['概念'],
    question: T('Alice 用网页邮箱给 Bob 发信，Bob 用 POP3 客户端收信。整个过程中一定用不到的是：', 'Alice uses webmail; Bob reads with POP3. Which is never used?'),
    options: [T('HTTP', 'HTTP'), T('SMTP', 'SMTP'), T('POP3', 'POP3'), T('IMAP', 'IMAP')],
    answer: 3,
    steps: [
      { text: T('Alice 到自己的服务器用 HTTP；两台邮件服务器之间用 SMTP；Bob 取信用 POP3。没有用到 IMAP。', 'HTTP, then SMTP between servers, then POP3; no IMAP.'), go: { lesson: 'email', params: { send: 'web', recv: 'pop3', attach: 'Hi!Bob' }, step: 3 } },
    ],
  },
];
