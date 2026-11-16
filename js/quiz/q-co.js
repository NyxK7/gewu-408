// 计算机组成原理的试点题：Cache 地址划分与容量、补码加减与标志位。
import { T } from '../core/i18n.js';
import { addsub } from '../subjects/co/arith.js';
import { cacheAddr } from '../subjects/co/memory.js';
import { shuffled } from './kit.js';

const CACHE_CONV = T('主存按字节编址；「n 路组相联」中 n = 1 即直接映射；LRU 替换时每行用 log₂(路数) 位计数。', 'Byte-addressed memory; 1-way means direct mapped; LRU uses log₂(ways) counter bits per line.');
const wayName = (w) => (w === 1 ? T('直接映射', 'direct-mapped') : T(`${w} 路组相联`, `${w}-way set-associative`));

function cacheCase(r) {
  const addrBits = r.pick([24, 28, 32]);
  const cacheKB = r.pick([4, 8, 16, 32, 64]);
  const blockB = r.pick([16, 32, 64, 128]);
  const ways = r.pick([1, 2, 4, 8]);
  return { addrBits, cacheKB, blockB, ways };
}

export const CO_QUESTIONS = [
  {
    id: 'co-cache-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('Cache 地址划分', 'Cache address fields'),
    type: 'number',
    difficulty: 2,
    lessons: ['cache-addr'],
    tags: ['计算'],
    conv: CACHE_CONV,
    make(r) {
      const c = cacheCase(r);
      const params = { ...c, wb: false, lru: false, addr: '0' };
      const s = cacheAddr(params);
      const w = wayName(c.ways);
      return {
        question: T(`主存地址 ${c.addrBits} 位，Cache 数据区 ${c.cacheKB} KB，块大小 ${c.blockB} B，采用${w.zh}。主存地址中「标记」字段有几位？`, `${c.addrBits}-bit addresses, ${c.cacheKB} KB of cache data, ${c.blockB}-byte blocks, ${w.en}. How many tag bits?`),
        answer: { value: s.tag },
        steps: [
          { text: T(`块大小 ${c.blockB} B = 2^${s.offset}，块内地址 ${s.offset} 位。`, `${c.blockB} B blocks: ${s.offset} offset bits.`), go: { lesson: 'cache-addr', params, step: 0 } },
          { text: T(`行数 = ${c.cacheKB} KB ÷ ${c.blockB} B = ${s.lines}；每组 ${s.ways} 行，共 ${s.sets} 组，组号 ${s.index} 位。`, `${s.lines} lines, ${s.ways} per set, ${s.sets} sets: ${s.index} index bits.`), go: { lesson: 'cache-addr', params, step: 1 } },
          { text: T(`标记 = ${c.addrBits} − ${s.index} − ${s.offset} = ${s.tag} 位。`, `Tag = ${c.addrBits} − ${s.index} − ${s.offset} = ${s.tag}.`), go: { lesson: 'cache-addr', params, step: 2 } },
        ],
      };
    },
  },
  {
    id: 'co-cache-02',
    subject: 'co',
    chapter: 'memory',
    topic: T('Cache 的总容量', 'Total cache size'),
    type: 'number',
    difficulty: 3,
    lessons: ['cache-addr'],
    tags: ['计算', '易错点'],
    conv: CACHE_CONV,
    make(r) {
      const c = cacheCase(r);
      const wb = r.next() < 0.6;
      const lru = c.ways > 1;
      const params = { ...c, wb, lru, addr: '0' };
      const s = cacheAddr(params);
      const w = wayName(c.ways);
      const extra = T(`${wb ? '采用写回法' : '采用全写法'}${lru ? '、LRU 替换' : ''}`, `${wb ? 'write-back' : 'write-through'}${lru ? ', LRU' : ''}`);
      return {
        question: T(`主存地址 ${c.addrBits} 位，Cache 数据区 ${c.cacheKB} KB，块大小 ${c.blockB} B，${w.zh}，${extra.zh}。每行有 1 位有效位。Cache 的总容量是多少位（包括标记、有效位等所有位）？`, `${c.addrBits}-bit addresses, ${c.cacheKB} KB data, ${c.blockB}-byte blocks, ${w.en}, ${extra.en}, one valid bit per line. Total cache size in bits, including every overhead bit?`),
        answer: { value: s.total },
        steps: [
          { text: T(`先算标记：块内 ${s.offset} 位，组号 ${s.index} 位，标记 ${s.tag} 位。`, `Offset ${s.offset}, index ${s.index}, tag ${s.tag}.`), go: { lesson: 'cache-addr', params, step: 2 } },
          { text: T(`每行的附加位：有效位 1${wb ? ' + 脏位 1（写回法才有）' : '（全写法没有脏位）'}${s.repl ? ` + LRU ${s.repl}` : ''} + 标记 ${s.tag} = ${s.perLine} 位；数据 ${c.blockB} × 8 = ${s.data} 位。`, `Per line: valid 1${wb ? ' + dirty 1' : ''}${s.repl ? ` + LRU ${s.repl}` : ''} + tag ${s.tag} = ${s.perLine}; data ${s.data}.`) },
          { text: T(`总容量 = ${s.lines} 行 × (${s.perLine} + ${s.data}) = ${s.total} 位。`, `Total = ${s.lines} × (${s.perLine} + ${s.data}) = ${s.total} bits.`), go: { lesson: 'cache-addr', params, step: 4 } },
        ],
      };
    },
  },
  {
    id: 'co-cache-03',
    subject: 'co',
    chapter: 'memory',
    topic: T('Cache 的总容量', 'Total cache size'),
    type: 'multi',
    difficulty: 2,
    lessons: ['cache-addr', 'cache-write'],
    tags: ['概念'],
    question: T('一个 4 路组相联、写回法、LRU 替换的 Cache，每一行除了数据以外，还需要存放哪些信息？', 'A 4-way set-associative, write-back, LRU cache: besides the data, what does each line store?'),
    options: [T('有效位', 'Valid bit'), T('脏位（修改位）', 'Dirty bit'), T('LRU 计数位', 'LRU counter bits'), T('标记', 'Tag'), T('组号', 'Set index'), T('块内地址', 'Block offset')],
    answer: [0, 1, 2, 3],
    steps: [
      { text: T('有效位、标记每种 Cache 都有；写回法要知道这一行改没改过，所以有脏位；LRU 要记录先后，所以有计数位。', 'Valid and tag always; write-back needs a dirty bit; LRU needs counter bits.'), go: { lesson: 'cache-addr', doc: 'total' } },
      { text: T('组号由行所在的位置隐含，块内地址用来在块里选字节，它们都不用存在行里。', 'The set index is implied by the line’s position and the offset only selects a byte, so neither is stored.'), go: { lesson: 'cache-addr', doc: 'split' } },
    ],
  },
  {
    id: 'co-add-01',
    subject: 'co',
    chapter: 'data',
    topic: T('补码加减与溢出', "Two's complement add/sub"),
    type: 'single',
    difficulty: 2,
    lessons: ['addsub'],
    tags: ['计算'],
    conv: T('8 位补码；CF = 最高位进位 ⊕ 低位进位输入 Cin（减法时 Cin = 1）。', "8-bit two's complement; CF = carry-out ⊕ Cin (Cin = 1 for subtraction)."),
    make(r) {
      const op = r.pick(['add', 'sub']);
      for (;;) {
        const a = r.int(-128, 127);
        const b = r.int(-128, 127);
        const s = addsub({ a, b, op, n: 8 });
        if (!s.ok) continue;
        const fl = s.flags;
        const pair = (o, c) => `OF = ${o}，CF = ${c}`;
        const all = [[0, 0], [0, 1], [1, 0], [1, 1]];
        const right = [fl.OF, fl.CF];
        const { options, answer } = shuffled(r, right, all.filter(([o, c]) => o !== fl.OF || c !== fl.CF));
        const params = { a, b, op, n: 8 };
        const sym = op === 'add' ? '+' : '−';
        const expr = `${a} ${sym} ${b < 0 ? `(${b})` : b}`;
        return {
          question: T(`用 8 位补码计算 ${expr}，运算后溢出标志 OF 和进位 / 借位标志 CF 分别是？`, `Compute ${expr} in 8-bit two's complement. What are OF and CF?`),
          options: options.map(([o, c]) => pair(o, c)),
          answer,
          steps: [
            { text: T(`写成补码：${a} → ${s.A}，${b} → ${s.Bin}。`, `Encode: ${s.A}, ${s.Bin}.`), go: { lesson: 'addsub', params, step: 0 } },
            { text: op === 'add' ? T('加法：B 不变，Cin = 0。', 'Addition: B unchanged, Cin = 0.') : T(`减法变加法：B 按位取反得 ${s.B}，再令 Cin = 1。`, `Subtract by adding ~B = ${s.B} with Cin = 1.`), go: { lesson: 'addsub', params, step: 1 } },
            { text: T(`逐位相加得 ${s.R}；最高位进位 Cn = ${s.Cn}，次高位进位 Cn−1 = ${s.Cn1}。`, `Sum ${s.R}; Cn = ${s.Cn}, Cn−1 = ${s.Cn1}.`), go: { lesson: 'addsub', params, step: 2 } },
            { text: T(`OF = Cn ⊕ Cn−1 = ${s.Cn} ⊕ ${s.Cn1} = ${fl.OF}${fl.OF ? '：溢出，真正结果 ' + s.exact + ' 超出了 −128～127' : '：没有溢出'}。`, `OF = ${fl.OF}${fl.OF ? `: overflow, the true result ${s.exact} is out of range` : ''}.`), go: { lesson: 'addsub', params, step: 3 } },
            { text: T(`CF = Cn ⊕ Cin = ${s.Cn} ⊕ ${s.cin} = ${fl.CF}。`, `CF = ${s.Cn} ⊕ ${s.cin} = ${fl.CF}.`), go: { lesson: 'addsub', params, step: 4 } },
          ],
        };
      }
    },
  },
  {
    id: 'co-add-02',
    subject: 'co',
    chapter: 'data',
    topic: T('补码加减与溢出', "Two's complement add/sub"),
    type: 'text',
    difficulty: 1,
    lessons: ['addsub'],
    tags: ['计算'],
    conv: T('8 位补码，结果写成 8 位二进制。', "8-bit two's complement; answer with 8 binary digits."),
    make(r) {
      const a = r.int(-60, 60);
      const b = r.int(-60, 60);
      const params = { a, b, op: 'sub', n: 8 };
      const s = addsub(params);
      return {
        question: T(`计算 [${a}]补 − [${b}]补，结果的 8 位二进制是什么？`, `What 8-bit pattern is [${a}] − [${b}] in two's complement?`),
        answer: { accept: [s.R], show: s.R },
        steps: [
          { text: T(`[${a}]补 = ${s.A}，[${b}]补 = ${s.Bin}。`, `${s.A} and ${s.Bin}.`), go: { lesson: 'addsub', params, step: 0 } },
          { text: T(`减法变成加上「B 取反再加 1」：${s.A} + ${s.B} + 1。`, `Add ~B + 1: ${s.A} + ${s.B} + 1.`), go: { lesson: 'addsub', params, step: 1 } },
          { text: T(`结果 ${s.R}，表示 ${s.signed}（= ${a} − ${b}${s.flags.OF ? '，溢出' : ''}）。`, `Result ${s.R} = ${s.signed}.`), go: { lesson: 'addsub', params, step: 2 } },
        ],
      };
    },
  },
  {
    id: 'co-add-03',
    subject: 'co',
    chapter: 'data',
    topic: T('补码加减与溢出', "Two's complement add/sub"),
    type: 'judge',
    difficulty: 1,
    lessons: ['addsub'],
    tags: ['易错点'],
    conv: T('n 位补码整数加法。', "n-bit two's complement addition."),
    question: T('两个正数相加，如果结果的最高位（符号位）是 1，就一定发生了溢出。', 'Adding two positive numbers and getting a 1 in the sign bit always means overflow.'),
    answer: true,
    steps: [
      { text: T('两个正数之和一定是正数；结果符号位却是 1，说明真实结果超出了最大正数，跑到了负数那一边。', 'The true sum is positive, so a negative-looking result means it exceeded the largest positive value.'), go: { lesson: 'addsub', params: { a: 100, b: 50, op: 'add', n: 8 }, step: 3 } },
      { text: T('这正是「两个同号数相加，结果符号与它们不同」这条溢出判断规则。', 'That is the rule: same-sign operands, different-sign result.'), go: { lesson: 'addsub', doc: 'overflow' } },
    ],
  },
];
