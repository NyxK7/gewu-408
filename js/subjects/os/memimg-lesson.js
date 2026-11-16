// 「进程的内存映像」：左边是一段 C 程序，中间是进程的虚拟地址空间（高地址在上），右边是「变量放在哪」的清单。
// 一步一步：装入时代码、常量、全局变量各就各位；调用函数时栈往下长出一个栈帧，返回时弹掉；malloc 在堆上往上长。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { ESP0, memimg, regionOf } from './memimg.js';

const W = [['os', 'basics']];
const CX = 20;
const CY = 150;
const LH = 25;
const AX = 330;
const AW = 340;
const RX = 690;
const R = {
  kernel: [124, 34],
  stack: [158, 236],
  mmap: [394, 30],
  heap: [424, 60],
  data: [484, 78],
  text: [562, 78],
  reserved: [640, 22],
};
const FR = 31; // 栈帧的行高
const hx = (v) => '0x' + v.toString(16).toUpperCase().padStart(8, '0');

const WHY = {
  func: T('函数的机器指令', 'machine code of a function'),
  str: T('字符串常量，只读', 'string literal, read-only'),
  const: T('const 全局变量，只读', 'const global, read-only'),
  globalInit: T('全局变量，有非 0 初值', 'global, non-zero initial value'),
  globalZero: T('全局变量，无初值（默认 0）', 'global, no initial value (0)'),
  staticZero: T('static 局部变量：同全局变量', 'static local: like a global'),
  local: T('局部变量', 'local variable'),
  localArr: T('局部数组：内容就在栈上', 'local array: contents on the stack'),
  localPtr: T('指针变量本身是局部变量', 'the pointer itself is a local'),
  param: T('函数参数', 'function parameter'),
  heap: T('malloc 申请的空间', 'space from malloc'),
};
const SEG = { '.text': '.text', '.rodata': '.rodata', '.data': '.data', '.bss': '.bss', stack: T('栈', 'stack'), heap: T('堆', 'heap') };
const segName = (s, z) => (typeof SEG[s] === 'string' ? SEG[s] : z ? SEG[s].zh : SEG[s].en);
const valText = (v, z) => (v === '@heap' ? (z ? '→ 堆' : '→ heap') : v === '@dangle' ? (z ? '悬空' : 'dangling') : v);

const PRINCIPLE = {
  sections: [
    {
      id: 'layout',
      title: T('进程的虚拟地址空间', 'A process’s virtual address space'),
      blocks: [
        { p: T('程序装入后，操作系统给进程一个独立的虚拟地址空间。32 位 Linux 的典型布局，从低地址到高地址依次是：', 'After loading, each process gets its own virtual address space. The typical 32-bit Linux layout, from low to high addresses:') },
        {
          table: {
            head: [T('区域', 'Region'), T('放什么', 'Contents'), T('权限', 'Access')],
            rows: [
              [T('保留区（0 附近）', 'Reserved (near 0)'), T('什么都不放，访问 NULL 指针会出错', 'nothing: dereferencing NULL faults'), T('不可访问', 'none')],
              [T('只读代码段（从 0x08048000 起）', 'Read-only segment (from 0x08048000)'), T('.text 机器指令、.rodata 字符串常量和 const 全局变量', '.text code, .rodata literals and const globals'), T('只读、可执行', 'read, execute')],
              [T('读写数据段', 'Read/write data'), T('.data 有非 0 初值的全局 / 静态变量；.bss 没有初值或初值为 0 的', '.data initialised globals/statics; .bss zero ones'), T('可读写', 'read, write')],
              [T('堆', 'Heap'), T('malloc / new 动态申请的空间，**向高地址长**', 'malloc/new space; **grows up**'), T('可读写', 'read, write')],
              [T('共享库映射区', 'Shared libraries'), T('动态链接库、mmap 映射的文件', 'shared libraries, mmap’d files'), T('看映射', 'varies')],
              [T('用户栈', 'User stack'), T('局部变量、参数、返回地址，**向低地址长**', 'locals, arguments, return addresses; **grows down**'), T('可读写', 'read, write')],
              [T('内核区（0xC0000000 以上）', 'Kernel (above 0xC0000000)'), T('操作系统的代码和数据，各进程共用', 'kernel code and data, shared by all processes'), T('用户态不能访问', 'kernel mode only')],
            ],
          },
        },
        { tip: T('堆和栈相向生长，中间留着很大的空洞；两者都不够时才会出错（栈溢出、malloc 返回 NULL）。', 'Heap and stack grow towards each other across a large gap.') },
      ],
    },
    {
      id: 'where',
      title: T('变量放在哪一段', 'Where each variable goes'),
      blocks: [
        { p: T('判断的关键是看**生存期**：整个程序运行期间都在的（全局变量、static 变量）放数据段，地址在装入时就定了；只在函数执行期间存在的（局部变量、参数）放栈上，调用时分配、返回时释放；运行中临时申请的放堆上。', 'The key is **lifetime**: things that live for the whole run go in the data segment; things that live during one call go on the stack; things allocated at run time go on the heap.') },
        {
          table: {
            head: [T('声明', 'Declaration'), T('放在', 'Location')],
            rows: [
              [T('函数本身（机器指令）', 'Function code'), '.text'],
              [T('字符串常量 "hello"、const 全局变量', 'String literals, const globals'), '.rodata'],
              [T('有非 0 初值的全局变量 / static 变量', 'Initialised globals/statics'), '.data'],
              [T('没有初值或初值为 0 的全局变量 / static 变量', 'Uninitialised or zero globals/statics'), '.bss'],
              [T('局部变量、const 局部变量、局部数组、函数参数', 'Locals (incl. const and arrays), parameters'), T('栈', 'Stack')],
              [T('malloc 得到的那块空间', 'The block from malloc'), T('堆', 'Heap')],
            ],
          },
        },
        { warn: T('int *p = malloc(16); 里，**p 本身**是局部变量，在栈上；p **指向的** 16 字节才在堆上。char *s = "hi"; 里 s 在栈上（局部时），"hi" 在 .rodata；而 char a[] = "hi"; 的 a 是局部数组，三个字节就在栈上。', 'In int *p = malloc(16) the pointer p is on the stack; only what it points to is on the heap.') },
      ],
    },
    {
      id: 'stack',
      title: T('栈：函数调用', 'The stack and function calls'),
      blocks: [
        { list: [
          T('每调用一次函数，就在栈上压一个**栈帧**：调用者从右往左压参数，call 压返回地址；被调函数压旧的 ebp，再把 esp 往下挪，给局部变量留位置。', 'Each call pushes a **frame**: arguments (right to left), the return address, the old ebp, then space for locals.'),
          T('函数返回时栈帧整体弹出，esp 回到调用前的位置——所以**局部变量在函数返回后就失效**，不能把它的地址返回出去。', 'Returning pops the whole frame, so locals die when the function returns.'),
          T('递归每深一层就多一个栈帧：递归深度为 d 时栈上同时有 d 个帧。深度太大会把栈用完，发生**栈溢出**。', 'Recursion depth d means d frames at once; too deep overflows the stack.'),
        ] },
      ],
    },
    {
      id: 'heap',
      title: T('堆：动态分配', 'The heap'),
      blocks: [
        { list: [
          T('malloc 在堆上找一块空闲空间返回它的地址；堆不够时通过系统调用（brk / mmap）向操作系统要。', 'malloc returns free heap space, asking the OS (brk / mmap) for more when needed.'),
          T('free 只是把这块空间还给堆，指针变量里的地址并不会清零，这时它成了**悬空指针**；忘了 free 就是**内存泄漏**。', 'free returns the block but leaves the pointer **dangling**; forgetting free is a **leak**.'),
        ] },
        {
          table: {
            head: ['', T('栈', 'Stack'), T('堆', 'Heap')],
            rows: [
              [T('谁来管', 'Managed by'), T('编译器生成的代码，自动分配和释放', 'compiler-generated code, automatic'), T('程序员 malloc / free', 'the programmer: malloc/free')],
              [T('生长方向', 'Grows'), T('向低地址', 'downwards'), T('向高地址', 'upwards')],
              [T('速度', 'Speed'), T('快：挪一下 esp', 'fast: move esp'), T('慢：要找合适的空闲块', 'slower: search for a block')],
              [T('碎片', 'Fragmentation'), T('没有', 'none'), T('会有', 'yes')],
            ],
          },
        },
      ],
    },
    {
      id: 'load',
      title: T('装入：可执行文件和地址空间', 'Loading: the executable and the address space'),
      blocks: [
        { list: [
          T('可执行文件里有 .text、.rodata、.data 等节；装入时按段映射到地址空间，地址在链接时就定了（虚拟地址）。', 'The executable’s sections are mapped into the address space at link-time addresses.'),
          T('.bss 在文件里**不占空间**，只记下要多大，装入时直接分配并清零——这就是没有初值的变量默认是 0 的原因。', '.bss takes **no space in the file**; it is allocated and zeroed at load time.'),
          T('每个进程都有自己的一份虚拟地址空间，同一个虚拟地址在不同进程里对应不同的物理内存；只读代码段可以被几个进程共享。', 'Every process has its own address space; read-only code can be shared.'),
        ] },
      ],
    },
    pit([
      T('static 局部变量不在栈上，它和全局变量一样在数据段，函数返回后值还在，下次调用接着用。', 'A static local is not on the stack; it keeps its value between calls.'),
      T('const 局部变量仍然在栈上（只是编译器不让改）；const 全局变量才在 .rodata。', 'A const local is still on the stack; only const globals go to .rodata.'),
      T('指针变量和它指向的空间往往不在同一个区域。', 'A pointer and what it points to are often in different regions.'),
      T('栈向低地址长、堆向高地址长，不要画反。', 'The stack grows down and the heap grows up.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('全局、局部、静态和堆', 'Globals, locals, statics and the heap'), set: { prog: 'vars', n: 3 } },
    { label: T('递归 fact(4)：栈一层层长', 'Recursive fact(4)'), set: { prog: 'recur', n: 4 } },
    { label: T('递归 fact(6)', 'Recursive fact(6)'), set: { prog: 'recur', n: 6 } },
  ],
  groups: [
    {
      legend: T('程序', 'Program'),
      fields: [
        { name: 'prog', label: T('看哪段程序', 'Program'), type: 'select', options: [['vars', T('全局、局部、静态和堆', 'Globals, locals, statics, heap')], ['recur', T('递归求阶乘', 'Recursive factorial')]], wide: true },
        { name: 'n', label: T('fact(n) 的 n（1～6）', 'n in fact(n) (1–6)'), type: 'int', min: 1, max: 6, show: (p) => p.prog === 'recur' },
      ],
    },
  ],
  note: T('按 32 位 Linux 的典型布局；栈单元 4 字节，main 被调用前 esp = 0xBFFFF000。', 'Typical 32-bit Linux layout; 4-byte stack slots; esp = 0xBFFFF000 before main is called.'),
};
const ERR = { prog: T('没有这段程序', 'Unknown program'), n: T('n 取 1～6', 'n must be 1–6') };

/** 当前看得到的变量（数据段、栈帧、堆）在右边清单里的条目 */
function knownPlaces(sim, s) {
  const names = new Set();
  for (const list of Object.values(s.seg)) for (const x of list) names.add(x.name);
  for (const f of s.frames) for (const it of f.items) if (it.role === 'arg' || it.role === 'local') names.add(it.name);
  if (s.heap.length) names.add('*p');
  return sim.places.filter((p) => names.has(p.name));
}

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : null;
  const kind = s?.kind ?? 'pre';
  const lines = new Set(s?.lines ?? []);
  const pos = {}; // 变量方块的位置，画指针箭头用

  // ── 代码 ──
  let h = txt(CX, CY - 18, z ? 'C 程序' : 'C program', 'bt-lab', 'start');
  sim.code.forEach((line, i) => {
    const on = lines.has(i);
    if (line === '') return;
    h += `<g transform="translate(${CX} ${CY + i * LH})">${cell(290, LH - 4, line.replace(/^ +/, (m) => ' '.repeat(m.length * 2)), { size: 12.5, tone: on ? 'amber' : '', cls: on ? 'hot' : '', anchor: 'start' })}</g>`;
  });
  items.push({ k: 'code', x: 0, y: 0, html: h });

  // ── 地址空间 ──
  const hot = new Set();
  if (kind === 'loadText') ['.text', '.rodata'].forEach((k) => s.seg[k].forEach((x) => hot.add(k + x.name)));
  if (kind === 'loadData') ['.data', '.bss'].forEach((k) => s.seg[k].forEach((x) => hot.add(k + x.name)));
  if (['callAdd', 'callFact'].includes(kind)) hot.add('.bss' + 'calls'), hot.add('.data' + 'calls');
  let a = txt(AX + AW / 2, R.kernel[0] - 12, z ? '进程的虚拟地址空间（高地址在上）' : 'Virtual address space (high addresses on top)', 'bt-lab');
  const box = (key, label, tone) => {
    const [y, hh] = R[key];
    a += `<g transform="translate(${AX} ${y})">${cell(AW, hh, '', { tone, cls: 'dim-fill' })}</g>`;
    a += txt(AX + 8, y + 15, label, 'bt-cap', 'start');
  };
  box('kernel', z ? '内核区（用户态不能访问）' : 'Kernel (no user access)', 'slate');
  box('stack', z ? '用户栈' : 'User stack', 'blue');
  box('mmap', z ? '共享库映射区' : 'Shared libraries', '');
  box('heap', z ? '堆' : 'Heap', 'green');
  box('data', z ? '读写数据段' : 'Read/write data', 'violet');
  box('text', z ? '只读代码段' : 'Read-only code', 'amber');
  box('reserved', z ? '保留区' : 'Reserved', '');
  // 地址刻度
  a += txt(AX + AW - 8, R.kernel[0] + 15, '0xC0000000 ↓', 'bt-idx', 'end');
  a += txt(AX + AW - 8, R.text[0] + R.text[1] - 6, '0x08048000 ↑', 'bt-idx', 'end');
  a += txt(AX + AW - 8, R.reserved[0] + 15, '0', 'bt-idx', 'end');
  a += txt(AX + AW - 8, R.stack[0] + R.stack[1] - 8, z ? '↓ 栈向低地址长' : '↓ grows down', 'bt-idx', 'end');
  a += txt(AX + AW - 8, R.heap[0] + 15, z ? '↑ 堆向高地址长' : '↑ grows up', 'bt-idx', 'end');

  // 两个小格：.text/.rodata、.data/.bss
  const sub = (key, k1, k2) => {
    const [y] = R[key];
    const sw = (AW - 24) / 2;
    [k1, k2].forEach((k, col) => {
      const x0 = AX + 8 + col * (sw + 8);
      a += txt(x0, y + 32, k, 'bt-idx', 'start');
      (s?.seg[k] ?? []).forEach((v, i) => {
        const cx = x0 + (i % 2) * (sw / 2 + 2);
        const cy = y + 38 + Math.floor(i / 2) * 18;
        const label = v.val && !v.val.startsWith('→') ? `${v.name}=${v.val}` : v.name;
        a += `<g transform="translate(${cx} ${cy})">${cell(sw / 2 - 2, 16, label, { size: 10.5, tone: hot.has(k + v.name) ? 'amber' : '', cls: hot.has(k + v.name) ? 'hot' : '' })}</g>`;
        pos[v.name] = [cx + (sw / 2 - 2) / 2, cy + 8];
      });
    });
  };
  sub('text', '.text', '.rodata');
  sub('data', '.data', '.bss');

  // 栈帧：一帧一行，往下长
  const frames = s?.frames ?? [];
  frames.forEach((f, i) => {
    const y = R.stack[0] + 22 + i * FR;
    const last = i === frames.length - 1;
    const isNew = last && ['callMain', 'callAdd', 'callFact'].includes(kind);
    const n = f.items.length;
    const fw = 62;
    const iw = (AW - 16 - fw - 4) / n;
    a += `<g transform="translate(${AX + 8} ${y})">${cell(fw, FR - 5, f.fn, { size: 11, tone: 'blue', cls: isNew ? 'hot' : '' })}</g>`;
    f.items.forEach((it, j) => {
      const x = AX + 8 + fw + 4 + j * iw;
      const label = it.role === 'ret' ? (z ? '返回地址' : 'ret') : it.role === 'ebp' ? (z ? '旧 ebp' : 'old ebp') : `${it.name}=${valText(it.val, z)}`;
      const changed = (kind === 'malloc' && it.name === 'p') || (kind === 'free' && it.name === 'p') || (kind === 'retAdd' && it.name === 'x') || (kind === 'mulFact' && last && it.name === 'r') || (kind === 'setV' && it.name === 'v');
      a += `<g transform="translate(${x} ${y})">${cell(iw - 3, FR - 5, label, { size: 10.5, tone: it.role === 'arg' ? 'violet' : it.role === 'local' ? (changed || isNew ? 'amber' : 'blue') : 'slate', cls: changed || isNew ? 'hot' : 'dim' })}</g>`;
      if (it.name === 'p') pos.p = [x + (iw - 3) / 2, y + FR - 5];
    });
  });
  const espY = R.stack[0] + 22 + frames.length * FR + 6;
  if (s) a += txt(AX + 10, espY + 8, `esp = ${hx(s.esp)}${frames.length ? '' : z ? '（还没有栈帧）' : ' (no frames yet)'}`, 'ar-mono', 'start');

  // 堆块
  (s?.heap ?? []).forEach((b, i) => {
    const x = AX + 120 + i * 110;
    const y = R.heap[0] + 26;
    a += `<g transform="translate(${x} ${y})">${cell(150, 26, b.live ? (z ? `${b.size} 字节（p 指向）` : `${b.size} bytes (p)`) : z ? `${b.size} 字节（已释放）` : `${b.size} bytes (freed)`, { size: 11.5, tone: b.live ? 'green' : '', cls: (kind === 'malloc' || kind === 'free') ? 'hot' : 'dim' })}</g>`;
    pos.heap = [x, y + 13];
  });

  // 指针箭头
  let ar = '';
  if (pos.msg && pos['"hello"']) ar += arrow(pos.msg[0], pos.msg[1] + 8, pos['"hello"'][0], pos['"hello"'][1] - 8, 'cs-b dash');
  if (pos.p && pos.heap && s.heap[0]?.live) ar += arrow(pos.p[0], pos.p[1], pos.heap[0] - 2, pos.heap[1], 'acc');
  items.push({ k: 'as', x: 0, y: 0, html: a });
  items.push({ k: 'ptr', x: 0, y: 0, html: ar });

  // ── 右边：变量放在哪 ──
  let r = txt(RX, CY - 18, z ? '变量放在哪' : 'Where things live', 'bt-lab', 'start');
  if (s) {
    knownPlaces(sim, s).forEach((p, i) => {
      const y = CY + i * 27;
      const tone = { text: 'amber', data: 'violet', stack: 'blue', heap: 'green' }[regionOf(p.seg)];
      r += `<g transform="translate(${RX} ${y})">${cell(68, 22, p.name, { size: 11.5, tone })}</g>`;
      r += txt(RX + 76, y + 15, `${segName(p.seg, z)}：${z ? WHY[p.why].zh : WHY[p.why].en}`, 'bt-cap', 'start');
    });
  }
  items.push({ k: 'list', x: 0, y: 0, html: r });
  return items;
}

function build(p, kit, ERR) {
  const sim = memimg(p);
  const recur = p.prog === 'recur';
  const lesson = shell('mem-image', kit, ERR, sim, {
    where: W,
    tag: T('映像', 'Image'),
    name: T('进程的内存映像', 'A process’s memory image'),
    full: T('虚拟地址空间的布局 · 代码段 .text 与 .rodata · 数据段 .data 与 .bss · 堆 · 用户栈 · 内核区 · 栈帧与递归 · 变量放在哪一段', 'Address-space layout · .text and .rodata · .data and .bss · heap · user stack · kernel · frames and recursion · where variables live'),
    title: SPEC.presets.find((x) => x.set.prog === p.prog && (!recur || x.set.n === p.n))?.label ?? (recur ? T(`递归 fact(${p.n})`, `Recursive fact(${p.n})`) : T('进程的内存映像', 'Memory image')),
    legend: [['amber', T('只读代码段', 'Read-only code')], ['violet', T('读写数据段', 'Data')], ['green', T('堆', 'Heap')], ['blue', T('栈', 'Stack')]],
    principle: PRINCIPLE,
    desc: T('一个 C 程序跑起来以后，函数、常量、全局变量、局部变量、malloc 出来的空间分别在哪里？左边一行行执行，中间的地址空间跟着变：装入时各段就位，调用函数时栈往下长一帧，malloc 时堆往上长。', 'Where do functions, constants, globals, locals and malloc’d blocks live? Run the program line by line and watch the address space.'),
    rect: [0, 100, 1010, 680],
  });
  if (!sim.ok) return lesson;
  const D = {
    loadText: [T('装入：只读代码段', 'Load: read-only segment'), T('函数的机器指令放进 .text；字符串常量和 const 全局变量放进 .rodata。这一段只读：程序里要是去改字符串常量，会出错。', 'Code goes to .text; literals and const globals to .rodata, which is read-only.'), 'layout'],
    loadData: [T('装入：读写数据段', 'Load: data segment'), T('全局变量和 static 变量在整个运行期间都存在，地址装入时就定了：有非 0 初值的放 .data，没有初值（或初值为 0）的放 .bss，装入时清零。', 'Globals and statics: initialised ones to .data, zero ones to .bss (zeroed at load).'), 'where'],
    callMain: [T('调用 main：栈上第一个帧', 'Call main: the first frame'), T(recur ? 'main 的栈帧里有返回地址、旧 ebp 和局部变量 v。局部变量只在函数执行期间存在，所以放栈上。' : 'main 的栈帧里有返回地址、旧 ebp 和局部变量 x、buf、p。注意 buf 是局部数组，"hi" 这三个字节就拷贝在栈上；p 此时还没指向任何地方。', 'main’s frame holds the return address, old ebp and its locals.'), 'stack'],
    malloc: [T('malloc(16)：堆往上长', 'malloc(16): the heap grows'), T('在堆上分出 16 字节，把地址交给 p。p 本身还在栈上，它指向的那块空间才在堆上。', '16 bytes on the heap; p (on the stack) now points there.'), 'heap'],
    callAdd: [T('调用 add：栈往下长一帧', 'Call add: a new frame'), T('main 从右往左压参数 b = 10、a = 1，call 压返回地址；add 压旧 ebp，再给局部变量 s 留位置。static 变量 calls 不在栈上，它在 .bss 里从 0 变成 1。', 'Arguments b, a, the return address, old ebp, then s. The static calls (in .bss) becomes 1.'), 'stack'],
    retAdd: [T('add 返回：整个栈帧弹掉', 'add returns: its frame is popped'), T('esp 回到调用前的位置，a、b、s 都没了；返回值 11 交给 main，存进 x。calls 还在 .bss 里，值是 1——下次再调用 add 会接着加。', 'esp is restored; a, b, s are gone. x becomes 11; calls keeps its value.'), 'stack'],
    free: [T('free(p)：还给堆', 'free(p)'), T('那 16 字节还给了堆，但 p 里的地址没变，成了悬空指针；再通过 p 读写就是错误。', 'The block is returned, but p still holds the address: a dangling pointer.'), 'heap'],
    retMain: [T('main 返回，进程结束', 'main returns'), T('栈恢复到最初；进程退出时，整个地址空间都由操作系统回收。', 'The stack is empty again; the OS reclaims the whole address space.'), 'load'],
  };
  const list = sim.steps.map((s, k) => {
    let d = D[s.kind];
    if (s.kind === 'callFact')
      d = [T(`调用 fact(${s.k})：第 ${s.depth} 层`, `Call fact(${s.k}): depth ${s.depth}`), T(`又压一个栈帧：参数 n = ${s.k}、返回地址、旧 ebp、局部变量 r，一共 16 字节，esp 降到 ${hx(s.esp)}。全局变量 calls 在 .bss 里，被加到 ${s.depth}。${s.k === 1 ? 'n ≤ 1，不再递归，这是栈最深的时候。' : ''}`, `Another 16-byte frame; esp = ${hx(s.esp)}; calls = ${s.depth}.`), 'stack'];
    if (s.kind === 'retFact') d = [T(`fact(${s.k}) 返回 ${s.val}`, `fact(${s.k}) returns ${s.val}`), T(`fact(${s.k}) 的栈帧弹掉，esp 回到 ${hx(s.esp)}。`, `Its frame is popped; esp = ${hx(s.esp)}.`), 'stack'];
    if (s.kind === 'mulFact') d = [T(`r = ${s.k} × fact(${s.k - 1}) = ${s.val}`, `r = ${s.val}`), T(`fact(${s.k}) 拿到下一层的返回值，算出 r = ${s.val}，存在自己栈帧里的 r 中。每一层的 n、r 互不干扰，因为各在各的栈帧里。`, `Each level has its own n and r in its own frame.`), 'stack'];
    if (s.kind === 'setV') d = [T(`v = ${s.val}`, `v = ${s.val}`), T(`递归全部返回，栈上只剩 main 的帧，v = ${sim.n}! = ${s.val}。`, `Back in main: v = ${s.val}.`), 'stack'];
    return { title: d[0], desc: T(`栈帧 ${s.frames.length} 个`, `${s.frames.length} frame(s)`), detail: d[1], ref: d[2], st: { k }, row: { color: s.kind.startsWith('load') ? 'violet' : s.kind === 'malloc' || s.kind === 'free' ? 'green' : 'blue', what: d[0], result: `esp ${hx(s.esp)}`, tone: 'info' } };
  });
  const title = recur ? T(`最深 ${sim.maxDepth} 层，栈用了 ${ESP0 - sim.deepest} 字节`, `Max depth ${sim.maxDepth}: ${ESP0 - sim.deepest} bytes of stack`) : T('各就各位', 'Everything in its place');
  const text = recur
    ? T(`fact(${sim.n}) 最深时栈上有 main 的帧（12 字节）和 ${sim.maxDepth} 个 fact 帧（每个 16 字节），共 ${ESP0 - sim.deepest} 字节，esp 最低到 ${hx(sim.deepest)}。递归越深栈用得越多，太深就会栈溢出。`, `At the deepest point: main (12 B) plus ${sim.maxDepth} frames of 16 B = ${ESP0 - sim.deepest} bytes.`)
    : T('函数代码和常量在只读段，全局 / 静态变量在数据段（有初值 .data，没初值 .bss），局部变量和参数在栈上，malloc 的空间在堆上。判断的关键是生存期。', 'Code and constants read-only, globals and statics in the data segment, locals on the stack, malloc’d space on the heap: decided by lifetime.');
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeMemImage = make('mem-image', SPEC, ERR, build);
