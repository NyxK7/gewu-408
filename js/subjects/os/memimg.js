// 进程的内存映像：一个 C 程序装入、运行时，各个变量、函数、字符串常量放在虚拟地址空间的哪一段，
// 栈怎样随函数调用往下长、堆怎样随 malloc 往上长。
//
// 约定（界面上写明，按 32 位 Linux 的典型布局）：
//   · 从低地址到高地址：保留区（0 附近，访问会出错）、只读代码段（.text 机器指令、.rodata 只读数据）、
//     读写数据段（.data 有非 0 初值的全局 / 静态变量，.bss 没有初值或初值为 0 的）、堆（向高地址长）、
//     共享库映射区、用户栈（向低地址长）、内核区（0xC0000000 以上，用户态不能访问）；
//   · 局部变量（包括 const 局部变量和局部数组）、函数参数、返回地址都在栈上；static 局部变量和全局变量一样放数据段；
//   · 字符串常量放 .rodata；malloc 得到的空间在堆上，指向它的指针变量本身按自己的声明放；
//   · 栈单元 4 字节；调用函数时参数从右往左压栈，再压返回地址，被调函数压旧 ebp，再给局部变量留位置；
//     main 被调用前 esp = 0xBFFFF000。

const err = (e) => ({ ok: false, errors: [e] });
export const ESP0 = 0xbffff000;
export const REGIONS = ['kernel', 'stack', 'mmap', 'heap', 'data', 'text', 'reserved'];

/** 一个声明放在哪一段：decl = { kind: func | str | global | static | local | param | heap, cnst?, init? } */
export function placeOf(d) {
  if (d.kind === 'func') return '.text';
  if (d.kind === 'str') return '.rodata';
  if (d.kind === 'heap') return 'heap';
  if (d.kind === 'local' || d.kind === 'param') return 'stack';
  // 全局变量、static 局部变量
  if (d.cnst) return '.rodata';
  return d.init ? '.data' : '.bss';
}
export const regionOf = (seg) => (seg === '.text' || seg === '.rodata' ? 'text' : seg === '.data' || seg === '.bss' ? 'data' : seg);

// ───── 两个程序 ─────
const VARS = {
  code: [
    'int g = 10;',
    'int h;',
    'const int MAX = 100;',
    'char *msg = "hello";',
    '',
    'int add(int a, int b) {',
    '    static int calls = 0;',
    '    calls++;',
    '    int s = a + b;',
    '    return s;',
    '}',
    '',
    'int main() {',
    '    int x = 1;',
    '    char buf[] = "hi";',
    '    int *p = malloc(16);',
    '    x = add(x, g);',
    '    free(p);',
    '    return 0;',
    '}',
  ],
  decls: [
    { name: 'g', kind: 'global', init: true, val: '10', line: 0, why: 'globalInit' },
    { name: 'h', kind: 'global', init: false, val: '0', line: 1, why: 'globalZero' },
    { name: 'MAX', kind: 'global', cnst: true, init: true, val: '100', line: 2, why: 'const' },
    { name: 'msg', kind: 'global', init: true, val: '→"hello"', line: 3, why: 'globalInit' },
    { name: '"hello"', kind: 'str', line: 3, why: 'str' },
    { name: 'add()', kind: 'func', line: 5, why: 'func' },
    { name: 'calls', kind: 'static', init: false, val: '0', line: 6, why: 'staticZero' },
    { name: 'main()', kind: 'func', line: 12, why: 'func' },
  ],
};
const RECUR = {
  code: (n) => ['int calls = 0;', '', 'int fact(int n) {', '    int r;', '    calls++;', '    if (n <= 1) return 1;', '    r = n * fact(n - 1);', '    return r;', '}', '', 'int main() {', `    int v = fact(${n});`, '    return 0;', '}'],
  decls: [
    { name: 'calls', kind: 'global', init: false, val: '0', line: 0, why: 'globalZero' },
    { name: 'fact()', kind: 'func', line: 2, why: 'func' },
    { name: 'main()', kind: 'func', line: 10, why: 'func' },
  ],
};
export const PROGS = ['vars', 'recur'];

export function memimg({ prog = 'vars', n = 3 }) {
  if (!PROGS.includes(prog)) return err('prog');
  if (prog === 'recur' && !(Number.isInteger(n) && n >= 1 && n <= 6)) return err('n');
  const P = prog === 'vars' ? VARS : { code: RECUR.code(n), decls: RECUR.decls };
  const seg = { '.text': [], '.rodata': [], '.data': [], '.bss': [] };
  const heap = [];
  const frames = [];
  let esp = ESP0;
  const steps = [];
  const snap = () => ({
    seg: Object.fromEntries(Object.entries(seg).map(([k, v]) => [k, v.map((x) => ({ ...x }))])),
    heap: heap.map((x) => ({ ...x })),
    frames: frames.map((f) => ({ ...f, items: f.items.map((x) => ({ ...x })) })),
    esp,
  });
  const push = (kind, lines, extra = {}) => steps.push({ kind, lines, ...snap(), ...extra });
  const put = (d) => seg[placeOf(d)].push({ name: d.name, val: d.val ?? '', why: d.why });
  const setSeg = (name, val) => {
    for (const list of Object.values(seg)) for (const x of list) if (x.name === name) x.val = val;
  };
  /** 新建一个栈帧：args 由调用者压（从右往左），再压返回地址；被调函数压旧 ebp、留局部变量 */
  const call = (fn, args, locals) => {
    const items = [];
    for (const a of [...args].reverse()) items.push({ name: a.name, val: a.val, role: 'arg', addr: (esp -= 4) });
    items.push({ name: 'ret', val: '', role: 'ret', addr: (esp -= 4) });
    items.push({ name: 'ebp', val: '', role: 'ebp', addr: (esp -= 4) });
    for (const l of locals) {
      esp -= 4 * (l.words ?? 1);
      items.push({ name: l.name, val: l.val, role: 'local', addr: esp });
    }
    frames.push({ fn, items, top: items[0].addr + 3, bottom: esp });
  };
  const setLocal = (name, val, fi = frames.length - 1) => {
    const it = frames[fi].items.find((x) => x.name === name);
    if (it) it.val = val;
  };
  const ret = () => {
    const f = frames.pop();
    esp = f.top + 1;
    return f;
  };
  const places = P.decls.map((d) => ({ ...d, seg: placeOf(d) }));

  // 1. 装入：代码段和只读数据
  for (const d of P.decls) if (['.text', '.rodata'].includes(placeOf(d))) put(d);
  push('loadText', P.decls.filter((d) => ['.text', '.rodata'].includes(placeOf(d))).map((d) => d.line));
  // 2. 装入：读写数据段
  for (const d of P.decls) if (['.data', '.bss'].includes(placeOf(d))) put(d);
  push('loadData', P.decls.filter((d) => ['.data', '.bss'].includes(placeOf(d))).map((d) => d.line));

  if (prog === 'vars') {
    call('main', [], [
      { name: 'x', val: '1' },
      { name: 'buf', val: '"hi"' },
      { name: 'p', val: '?' },
    ]);
    places.push({ name: 'x', kind: 'local', seg: 'stack', why: 'local' }, { name: 'buf', kind: 'local', seg: 'stack', why: 'localArr' }, { name: 'p', kind: 'local', seg: 'stack', why: 'localPtr' });
    push('callMain', [12, 13, 14]);
    heap.push({ size: 16, by: 'p', live: true });
    setLocal('p', '@heap');
    places.push({ name: '*p', kind: 'heap', seg: 'heap', why: 'heap' });
    push('malloc', [15], { size: 16 });
    call('add', [{ name: 'a', val: '1' }, { name: 'b', val: '10' }], [{ name: 's', val: '11' }]);
    setSeg('calls', '1');
    places.push({ name: 'a', kind: 'param', seg: 'stack', why: 'param' }, { name: 'b', kind: 'param', seg: 'stack', why: 'param' }, { name: 's', kind: 'local', seg: 'stack', why: 'local' });
    push('callAdd', [16, 5, 6, 7, 8]);
    ret();
    setLocal('x', '11');
    push('retAdd', [9, 16]);
    heap[0].live = false;
    setLocal('p', '@dangle');
    push('free', [17]);
    ret();
    push('retMain', [18]);
  } else {
    call('main', [], [{ name: 'v', val: '?' }]);
    places.push({ name: 'v', kind: 'local', seg: 'stack', why: 'local' });
    push('callMain', [10, 11]);
    let calls = 0;
    for (let k = n; k >= 1; k--) {
      call(`fact(${k})`, [{ name: 'n', val: String(k) }], [{ name: 'r', val: '?' }]);
      calls++;
      setSeg('calls', String(calls));
      push('callFact', k === 1 ? [2, 4, 5] : [k === n ? 11 : 6, 2, 3, 4], { k, depth: frames.length - 1 });
    }
    places.push({ name: 'n', kind: 'param', seg: 'stack', why: 'param' }, { name: 'r', kind: 'local', seg: 'stack', why: 'local' });
    const maxDepth = n;
    const deepest = esp;
    let val = 1;
    ret();
    push('retFact', [5], { k: 1, val });
    for (let k = 2; k <= n; k++) {
      val *= k;
      setLocal('r', String(val));
      push('mulFact', [6], { k, val });
      ret();
      push('retFact', [7], { k, val });
    }
    setLocal('v', String(val));
    push('setV', [11], { val });
    ret();
    push('retMain', [12]);
    return { ok: true, prog, n, code: P.code, steps, places, maxDepth, deepest, result: val, frameBytes: 16, mainBytes: 12 };
  }
  return { ok: true, prog, n, code: P.code, steps, places };
}
