// 补考纲缺口时新增的两节课（进程的内存映像、磁盘的结构与访问时间）配的题。答案由课程的计算代码算出。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { ms } from '../subjects/os/disktime.js';
import { ESP0, placeOf } from '../subjects/os/memimg.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const base = (id) => ({ ...lessonById(id).params });

// 「变量放在哪」的题目素材：代码、问的是谁、它的声明属性
const POOL = [
  { code: 'int a = 5;            // 在所有函数外面', ask: 'a', d: { kind: 'global', init: true }, why: T('有非 0 初值的全局变量', 'an initialised global') },
  { code: 'int a;                // 在所有函数外面', ask: 'a', d: { kind: 'global', init: false }, why: T('没有初值的全局变量，装入时清零', 'an uninitialised global, zeroed at load') },
  { code: 'int a = 0;            // 在所有函数外面', ask: 'a', d: { kind: 'global', init: false }, why: T('初值为 0 的全局变量和没有初值的一样，放 .bss', 'a zero-initialised global goes to .bss') },
  { code: 'void f() { static int a = 3; }', ask: 'a', d: { kind: 'static', init: true }, why: T('static 局部变量和全局变量一样整个运行期间都在，有非 0 初值', 'a static local lives for the whole run') },
  { code: 'void f() { static int a; }', ask: 'a', d: { kind: 'static', init: false }, why: T('没有初值的 static 局部变量', 'an uninitialised static local') },
  { code: 'const int a = 7;      // 在所有函数外面', ask: 'a', d: { kind: 'global', cnst: true, init: true }, why: T('const 全局变量是只读数据', 'a const global is read-only data') },
  { code: 'void f() { const int a = 7; }', ask: 'a', d: { kind: 'local', cnst: true }, why: T('const 局部变量仍然是局部变量，只是不让改', 'a const local is still a local') },
  { code: 'void f() { int a[10]; }', ask: 'a', d: { kind: 'local' }, why: T('局部数组整个在栈上', 'a local array is on the stack') },
  { code: 'void f() { char *s = "abc"; }', ask: '"abc"', d: { kind: 'str' }, why: T('字符串常量放只读数据区', 'string literals are read-only data') },
  { code: 'void f() { char *s = "abc"; }', ask: 's', d: { kind: 'local' }, why: T('指针变量 s 本身是局部变量', 'the pointer s itself is a local') },
  { code: 'void f() { int *p = malloc(40); }', ask: T('p 指向的 40 字节', 'the 40 bytes p points to'), d: { kind: 'heap' }, why: T('malloc 得到的空间在堆上', 'malloc’d space is on the heap') },
  { code: 'int g(int a) { return a + 1; }', ask: 'a', d: { kind: 'param' }, why: T('函数参数由调用者压栈', 'parameters are pushed by the caller') },
  { code: 'int g(int a) { return a + 1; }', ask: T('函数 g 的机器指令', 'the machine code of g'), d: { kind: 'func' }, why: T('函数的机器指令在代码段', 'code goes in .text') },
];
const SEGT = {
  '.text': T('代码段 .text', 'Code (.text)'),
  '.rodata': T('只读数据 .rodata', 'Read-only data (.rodata)'),
  '.data': T('已初始化数据 .data', 'Initialised data (.data)'),
  '.bss': T('未初始化数据 .bss', 'Uninitialised data (.bss)'),
  stack: T('栈', 'Stack'),
  heap: T('堆', 'Heap'),
};
const askOf = (x) => (typeof x === 'string' ? T(x, x) : x);

export const GAP_QUESTIONS = [
  {
    id: 'os-img-01',
    subject: 'os',
    chapter: 'basics',
    topic: T('进程的内存映像', 'A process’s memory image'),
    type: 'single',
    difficulty: 1,
    lessons: ['mem-image'],
    tags: ['易错点'],
    conv: T('按 32 位 Linux 的典型布局：.text、.rodata、.data、.bss、堆、栈。', 'Typical 32-bit Linux layout.'),
    make(r) {
      const it = r.pick(POOL);
      const seg = placeOf(it.d);
      const others = r.shuffle(Object.keys(SEGT).filter((k) => k !== seg)).slice(0, 3);
      const { options, answer } = shuffled(r, SEGT[seg], others.map((k) => SEGT[k]));
      const ask = askOf(it.ask);
      return {
        question: T(`C 程序里有这样一行：\n${it.code}\n程序运行时，${ask.zh} 存放在进程地址空间的哪个区域？`, `A C program contains:\n${it.code}\nAt run time, where is ${ask.en}?`),
        options,
        answer,
        steps: [
          { text: T(`${ask.zh}：${it.why.zh}，所以在${SEGT[seg].zh}。`, `${ask.en}: ${it.why.en}, so ${SEGT[seg].en}.`), go: { lesson: 'mem-image', doc: 'where' } },
          { text: T('判断的关键是生存期：整个运行期间都在的放数据段，函数调用期间才在的放栈上，运行中申请的放堆上。', 'Decide by lifetime: whole run → data; one call → stack; allocated at run time → heap.'), go: { lesson: 'mem-image', step: 4 } },
        ],
      };
    },
  },
  {
    id: 'os-img-02',
    subject: 'os',
    chapter: 'basics',
    topic: T('递归与栈', 'Recursion and the stack'),
    type: 'number',
    difficulty: 2,
    lessons: ['mem-image'],
    tags: ['计算'],
    conv: T('栈单元 4 字节；main 的栈帧有返回地址、旧 ebp 和局部变量 v，共 12 字节；fact 的每个栈帧有参数 n、返回地址、旧 ebp 和局部变量 r，共 16 字节。', '4-byte slots; main’s frame is 12 B; each fact frame (n, return address, old ebp, r) is 16 B.'),
    make(r) {
      const n = r.int(2, 6);
      const params = { prog: 'recur', n };
      const l = L('mem-image', params);
      const s = l.sim;
      const bytes = ESP0 - s.deepest;
      return {
        question: T(`main 中执行 v = fact(${n})，fact 用递归求阶乘（n ≤ 1 时返回 1）。递归最深的时候，main 和各层 fact 的栈帧一共占了多少字节？`, `main calls fact(${n}) recursively. At the deepest point, how many bytes do all the frames take?`),
        answer: { value: bytes },
        steps: [
          { text: T(`fact(${n}) 一直调到 fact(1) 才不再递归，最深时栈上同时有 ${n} 个 fact 栈帧。`, `${n} fact frames at the deepest point.`), go: { lesson: 'mem-image', params, step: s.steps.findIndex((x) => x.kind === 'callFact' && x.k === 1) } },
          { text: T(`共 12 + ${n} × 16 = ${bytes} 字节，esp 从 0xBFFFF000 降到 0x${s.deepest.toString(16).toUpperCase()}。`, `12 + ${n} × 16 = ${bytes} bytes.`), go: { lesson: 'mem-image', doc: 'stack' } },
        ],
      };
    },
  },
  {
    id: 'os-dt-01',
    subject: 'os',
    chapter: 'io',
    topic: T('磁盘的访问时间', 'Disk access time'),
    type: 'number',
    difficulty: 2,
    lessons: ['disk-time'],
    tags: ['计算'],
    conv: T('旋转延迟取平均值（半圈）；要读的扇区在同一条磁道上连续存放。答案保留到小数点后 2 位即可。', 'Average latency is half a turn; the sectors are consecutive on one track. Two decimals are enough.'),
    make(r) {
      for (;;) {
        const rpm = r.pick([3000, 5400, 6000, 7200, 10000, 12000, 15000]);
        const spt = r.pick([50, 100, 120, 200, 250, 500]);
        const seek = r.int(2, 12);
        const k = r.pick([1, 4, 8, 10, 20, 25, 50]);
        const params = { ...base('disk-time'), rpm, spt, seek, k, b: 0 };
        const l = L('disk-time', params);
        if (!l.sim.ok) continue;
        const s = l.sim;
        return {
          question: T(`某磁盘转速 ${rpm} 转 / 分，每条磁道 ${spt} 个扇区，平均寻道时间 ${seek} ms。读一条磁道上连续的 ${k} 个扇区，平均要多少毫秒？`, `${rpm} rpm, ${spt} sectors per track, ${seek} ms average seek. Average time to read ${k} consecutive sectors?`),
          answer: { value: s.ta, tol: 0.01, show: ms(s.ta) },
          steps: [
            { text: T(`转一圈 60000 / ${rpm} = ${ms(s.rot)} ms，平均旋转延迟半圈 ${ms(s.tr)} ms。`, `One turn ${ms(s.rot)} ms; latency ${ms(s.tr)} ms.`), go: { lesson: 'disk-time', params, step: 2 } },
            { text: T(`传输 ${k} 个扇区：${k} / ${spt} × ${ms(s.rot)} = ${ms(s.tt)} ms。合计 ${seek} + ${ms(s.tr)} + ${ms(s.tt)} = ${ms(s.ta)} ms。`, `Transfer ${ms(s.tt)} ms; total ${ms(s.ta)} ms.`), go: { lesson: 'disk-time', params, step: 4 } },
          ],
        };
      }
    },
  },
  {
    id: 'os-dt-02',
    subject: 'os',
    chapter: 'io',
    topic: T('盘块号与（柱面, 盘面, 扇区）', 'Block number and CHS'),
    type: 'text',
    difficulty: 2,
    lessons: ['disk-time'],
    tags: ['计算'],
    conv: T('盘块号、柱面号、盘面号、扇区号都从 0 开始；按「柱面 → 盘面 → 扇区」的顺序编号，一个盘块就是一个扇区。', 'All numbers start at 0; numbered cylinder → surface → sector; one block = one sector.'),
    make(r) {
      const heads = r.pick([2, 4, 6, 8, 16]);
      const spt = r.pick([16, 32, 50, 63, 100]);
      const cyls = r.pick([200, 500, 1000]);
      const b = r.int(heads * spt, heads * spt * cyls - 1);
      const params = { ...base('disk-time'), heads, spt, cyls, b, k: 1 };
      const l = L('disk-time', params);
      const s = l.sim;
      const a = [s.c, s.h, s.s];
      return {
        question: T(`某磁盘有 ${cyls} 个柱面、${heads} 个盘面，每条磁道 ${spt} 个扇区。${b} 号盘块对应的（柱面号, 盘面号, 扇区号）是多少？（按「柱面, 盘面, 扇区」作答）`, `${cyls} cylinders, ${heads} heads, ${spt} sectors per track. What is block ${b} as (cylinder, head, sector)?`),
        answer: { accept: [a.join(','), a.join('，'), a.join(' '), `(${a.join(',')})`, `（${a.join('，')}）`, a.join('、')], show: `(${a.join(', ')})` },
        steps: [
          { text: T(`每个柱面有 ${heads} × ${spt} = ${s.perCyl} 个扇区。柱面号 = ⌊${b} / ${s.perCyl}⌋ = ${s.c}。`, `${s.perCyl} per cylinder; c = ${s.c}.`), go: { lesson: 'disk-time', doc: 'addr' } },
          { text: T(`柱面内的序号 ${b % s.perCyl}：盘面号 = ⌊${b % s.perCyl} / ${spt}⌋ = ${s.h}，扇区号 = ${b} mod ${spt} = ${s.s}。`, `h = ${s.h}, s = ${s.s}.`), go: { lesson: 'disk-time', params, step: 0 } },
        ],
      };
    },
  },
  {
    id: 'co-dt-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('磁盘的容量与数据传输率', 'Disk capacity and transfer rate'),
    type: 'number',
    difficulty: 1,
    lessons: ['disk-time'],
    tags: ['计算'],
    conv: T('1 KB = 1024 B；数据传输率指磁头连续读一整条磁道时每秒读出的字节数。', '1 KB = 1024 B; the rate is bytes per second while reading a whole track.'),
    make(r) {
      const rpm = r.pick([3000, 6000, 7500, 12000, 15000]);
      const spt = r.pick([32, 64, 100, 128, 200]);
      const bytes = r.pick([512, 1024, 4096]);
      const params = { ...base('disk-time'), rpm, spt, bytes, b: 0, k: 1 };
      const l = L('disk-time', params);
      const s = l.sim;
      const kbs = s.rate / 1024;
      return {
        question: T(`某磁盘转速 ${rpm} 转 / 分，每条磁道 ${spt} 个扇区，每个扇区 ${bytes} 字节。它的数据传输率是多少 KB/s？`, `${rpm} rpm, ${spt} sectors of ${bytes} B per track. What is the transfer rate in KB/s?`),
        answer: { value: kbs, tol: 0.01, show: ms(kbs) },
        steps: [
          { text: T(`每秒转 ${rpm} / 60 = ${ms(rpm / 60)} 圈，每圈读一条磁道 ${spt} × ${bytes} = ${spt * bytes} 字节。`, `${ms(rpm / 60)} turns per second, ${spt * bytes} bytes per turn.`), go: { lesson: 'disk-time', doc: 'time' } },
          { text: T(`传输率 = ${ms(rpm / 60)} × ${spt * bytes} = ${ms(s.rate)} B/s = ${ms(kbs)} KB/s。`, `${ms(s.rate)} B/s = ${ms(kbs)} KB/s.`), go: { lesson: 'disk-time', params, step: last(l) } },
        ],
      };
    },
  },
];
