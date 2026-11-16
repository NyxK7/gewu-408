// 计组第三批题：给之前还没有题的课补题（虚实地址转换、编码、乘除法、IEEE 754、浮点加减、大小端与对齐、
// 数据通路、微指令、流水线的数据冒险和控制冒险、中断屏蔽字）。答案都通过课程的 update 或纯计算模块算出。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { decode as fpDecode, encode as fpEncode, hexOf } from '../subjects/co/fp.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const base = (id) => ({ ...lessonById(id).params });
const H = (v, bits) =>
  v
    .toString(16)
    .toUpperCase()
    .padStart(Math.ceil(bits / 4), '0');
/** 十六进制答案：带不带 0x / H、大小写、前导 0 都算对 */
const hexAns = (v, bits) => {
  const h = H(v, bits);
  const s = v.toString(16).toUpperCase();
  return {
    accept: [...new Set([h, s, `0x${h}`, `0x${s}`, `${h}H`, `${s}H`])],
    show: `${h}H`,
  };
};
const seq = (a) => ({
  accept: [a.join(''), a.join(','), a.join('，'), a.join(' ')],
  show: a.join(' '),
});
const size = (b) => (b >= 1024 ? `${b / 1024}KB` : `${b}B`);

export const CO_QUESTIONS3 = [
  // ───── 存储系统：虚实地址转换 ─────
  {
    id: 'co-vm-01',
    subject: 'co',
    chapter: 'memory',
    topic: T('虚拟地址到物理地址', 'Virtual to physical address'),
    type: 'text',
    difficulty: 2,
    lessons: ['vm-access'],
    tags: ['计算'],
    make(r) {
      for (;;) {
        const pageSize = r.pick([1024, 2048, 4096, 8192]);
        const p0 = { ...base('vm-access'), pageSize, frame: null };
        const d0 = L('vm-access', p0).sim.d;
        const va = r.int(0, 2 ** 31 - 1);
        const frame = r.int(1, d0.ptFirst - 1);
        const params = { ...p0, va, frame };
        const l = L('vm-access', params);
        const s = l.sim;
        if (!s?.ok || s.d.errors.length || s.fault) continue;
        const d = s.d;
        return {
          question: T(`某机虚拟地址 ${params.vaBits} 位、物理地址 ${params.paBits} 位，页大小 ${size(pageSize)}。虚拟地址 ${H(va, params.vaBits)}H 所在的页在内存中，对应的页框号是 ${H(frame, d.pfnBits)}H。它的物理地址是多少（十六进制）？`, `VA ${params.vaBits} bits, PA ${params.paBits} bits, page ${size(pageSize)}. VA ${H(va, params.vaBits)}H is in frame ${H(frame, d.pfnBits)}H. What is the PA (hex)?`),
          answer: hexAns(s.pa, params.paBits),
          steps: [
            {
              text: T(`页大小 ${size(pageSize)} = 2^${d.offBits}，低 ${d.offBits} 位是页内偏移 ${H(s.off, d.offBits)}H，高 ${d.vpnBits} 位是虚页号 ${H(s.vpn, d.vpnBits)}H。`, `Offset: low ${d.offBits} bits = ${H(s.off, d.offBits)}H; VPN ${H(s.vpn, d.vpnBits)}H.`),
              go: { lesson: 'vm-access', doc: 'split' },
            },
            {
              text: T(`物理地址 = 页框号拼上页内偏移：${H(frame, d.pfnBits)}H × 2^${d.offBits} + ${H(s.off, d.offBits)}H = ${H(s.pa, params.paBits)}H。`, `PA = frame ‖ offset = ${H(s.pa, params.paBits)}H.`),
              go: { lesson: 'vm-access', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  {
    id: 'co-vm-02',
    subject: 'co',
    chapter: 'memory',
    topic: T('物理地址映射到 Cache', 'Mapping a PA into the cache'),
    type: 'number',
    difficulty: 2,
    lessons: ['vm-access'],
    tags: ['计算'],
    make(r) {
      for (;;) {
        const cacheSize = r.pick([8192, 16384, 32768, 65536]);
        const blockSize = r.pick([16, 32, 64]);
        const cacheWays = r.pick([1, 2, 4, 8]);
        const p0 = {
          ...base('vm-access'),
          cacheSize,
          blockSize,
          cacheWays,
          frame: null,
        };
        const d0 = L('vm-access', p0).sim.d;
        const params = {
          ...p0,
          va: r.int(0, 2 ** 31 - 1),
          frame: r.int(1, d0.ptFirst - 1),
        };
        const l = L('vm-access', params);
        const s = l.sim;
        if (!s?.ok || s.d.errors.length || s.fault) continue;
        const d = s.d;
        const way = cacheWays === 1 ? T('直接映射', 'direct-mapped') : T(`${cacheWays} 路组相联`, `${cacheWays}-way set-associative`);
        const unit = cacheWays === 1 ? T('行', 'line') : T('组', 'set');
        return {
          question: T(`某机物理地址 ${params.paBits} 位，Cache 容量 ${size(cacheSize)}、块大小 ${blockSize}B，采用${way.zh}。某数据的物理地址是 ${H(s.pa, params.paBits)}H，它映射到 Cache 的第几${unit.zh}（从 0 开始）？`, `PA ${params.paBits} bits, ${size(cacheSize)} ${way.en} cache with ${blockSize} B blocks. Which ${unit.en} (from 0) does PA ${H(s.pa, params.paBits)}H map to?`),
          answer: { value: s.cIdx },
          steps: [
            {
              text: T(`块内地址 log₂${blockSize} = ${d.cOffBits} 位；${unit.zh}数 = ${size(cacheSize)} ÷ ${blockSize}B${cacheWays > 1 ? ` ÷ ${cacheWays}` : ''} = ${d.cacheSets}，${unit.zh}号占 ${d.cIdxBits} 位；剩下的高 ${d.cTagBits} 位是标记。`, `Offset ${d.cOffBits} bits, index ${d.cIdxBits} bits (${d.cacheSets} ${unit.en}s), tag ${d.cTagBits} bits.`),
              go: { lesson: 'vm-access', doc: 'cache' },
            },
            {
              text: T(`去掉低 ${d.cOffBits} 位得到主存块号 ${s.blockNo}，再对 ${d.cacheSets} 取余：${s.blockNo} mod ${d.cacheSets} = ${s.cIdx}。`, `Block ${s.blockNo} mod ${d.cacheSets} = ${s.cIdx}.`),
              go: { lesson: 'vm-access', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  // ───── 数据的表示和运算 ─────
  {
    id: 'co-enc-01',
    subject: 'co',
    chapter: 'data',
    topic: T('原码、反码、补码、移码', 'Sign-magnitude, ones’, two’s, biased'),
    type: 'text',
    difficulty: 1,
    lessons: ['encodings'],
    tags: ['计算'],
    conv: T('机器数一共 n 位（含符号位）；移码的偏置是 2^(n−1)。', 'n bits including the sign; bias 2^(n−1).'),
    make(r) {
      const n = r.pick([6, 8]);
      const kind = r.pick(['sm', 'oc', 'two', 'ex']);
      const lim = 2 ** (n - 1) - 1;
      const x = r.int(1, lim) * (r.next() < 0.7 ? -1 : 1);
      const params = { x, n };
      const l = L('encodings', params);
      const s = l.sim;
      const name = {
        sm: T('原码', 'sign-magnitude'),
        oc: T('反码', 'ones’ complement'),
        two: T('补码', 'two’s complement'),
        ex: T('移码', 'biased'),
      }[kind];
      const how = {
        sm: T(`符号位 ${s.neg ? 1 : 0}，后面是绝对值 ${s.mag} 的二进制。`, 'Sign bit then the magnitude.'),
        oc: T(s.neg ? `负数：原码 ${s.sm} 符号位不变，其余各位取反。` : '正数的反码和原码相同。', s.neg ? 'Negative: invert all but the sign.' : 'Positive: same as sign-magnitude.'),
        two: T(s.neg ? `负数：反码 ${s.oc} 末位加 1（也可以看成 2^${n} − ${s.mag} = ${2 ** n - s.mag}）。` : '正数的补码和原码相同。', s.neg ? `Negative: ones’ complement + 1.` : 'Positive: same as sign-magnitude.'),
        ex: T(`移码 = 真值 + 2^${n - 1} = ${x} + ${s.bias} = ${x + s.bias}；也就是补码 ${s.two} 的符号位取反。`, `Biased = x + ${s.bias}; the two’s complement with the sign flipped.`),
      }[kind];
      return {
        question: T(`真值 x = ${x}，用 ${n} 位机器数表示，[x]${name.zh} 是多少？`, `x = ${x}, n = ${n}. What is its ${name.en} code?`),
        answer: { accept: [s[kind]], show: s[kind] },
        steps: [
          {
            text: T(`|x| = ${s.mag}，${n - 1} 位数值部分写成 ${s.mag.toString(2).padStart(n - 1, '0')}。`, `|x| = ${s.mag}.`),
            go: { lesson: 'encodings', doc: 'four' },
          },
          { text: how, go: { lesson: 'encodings', params, step: last(l) } },
          {
            text: T(`所以 [x]${name.zh} = ${s[kind]}。`, `Answer: ${s[kind]}.`),
          },
        ],
      };
    },
  },
  {
    id: 'co-mul-01',
    subject: 'co',
    chapter: 'data',
    topic: T('Booth 乘法', 'Booth multiplication'),
    type: 'number',
    difficulty: 2,
    lessons: ['multiply'],
    tags: ['过程推演'],
    conv: T('Booth 一位乘法：看乘数末位 y₀ 和附加位 y₋₁，10 减 [x]补、01 加 [x]补、00 和 11 只移位；n 位乘数做 n 步。', 'Booth: pair 10 subtract, 01 add, else shift only; n steps.'),
    make(r) {
      const n = r.pick([5, 6]);
      const lo = -(2 ** (n - 1));
      const hi = 2 ** (n - 1) - 1;
      const x = r.int(lo + 1, hi) || 3;
      const y = r.int(lo + 1, hi) || -5;
      const params = { x, y, n, method: 'booth' };
      const l = L('multiply', params);
      const s = l.sim;
      const ops = s.steps.filter((st) => st.op !== 'none');
      const yb = (y < 0 ? 2 ** n + y : y).toString(2).padStart(n, '0');
      return {
        question: T(`用 Booth 一位乘法计算 x × y，x = ${x}，y = ${y}，都是 ${n} 位补码。整个过程一共要做几次加法或减法（只移位的不算）？`, `Booth multiplication of x = ${x} and y = ${y} (${n}-bit two’s complement). How many additions or subtractions?`),
        answer: { value: ops.length },
        steps: [
          {
            text: T(`[y]补 = ${yb}，末尾补 y₋₁ = 0，从右往左看相邻两位：${s.steps.map((st) => st.pair).join('、')}。`, `Pairs from the right: ${s.steps.map((st) => st.pair).join(', ')}.`),
            go: { lesson: 'multiply', doc: 'booth' },
          },
          {
            text: T(`其中 10 和 01 一共 ${ops.length} 个，就是 ${ops.length} 次加减；乘积 ${s.product}。`, `${ops.length} pairs are 10 or 01; product ${s.product}.`),
            go: { lesson: 'multiply', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'co-div-01',
    subject: 'co',
    chapter: 'data',
    topic: T('恢复余数除法', 'Restoring division'),
    type: 'number',
    difficulty: 2,
    lessons: ['divide'],
    tags: ['过程推演'],
    conv: T('n 位无符号数相除：每步先左移一位，再减除数；减出负数就把除数加回去（恢复余数），商上 0。', 'n-bit unsigned: shift, subtract; if negative, add back (restore) and set 0.'),
    make(r) {
      const n = r.pick([4, 5]);
      const lim = 2 ** n - 1;
      const x = r.int(lim >> 1, lim);
      const y = r.int(2, Math.min(lim, 9));
      const params = { x, y, n, method: 'restore' };
      const l = L('divide', params);
      const s = l.sim;
      const k = s.steps.filter((st) => st.restored).length;
      return {
        question: T(`用恢复余数法计算 ${x} ÷ ${y}（${n} 位无符号数）。一共要恢复几次余数？`, `Restoring division ${x} ÷ ${y} (${n} bits). How many restorations?`),
        answer: { value: k },
        steps: [
          {
            text: T(`每一步的商依次是 ${s.steps.map((st) => st.q).join('、')}，商上 0 的那一步就要恢复一次。`, `Quotient bits ${s.steps.map((st) => st.q).join(', ')}; each 0 means a restore.`),
            go: { lesson: 'divide', params, step: last(l) },
          },
          {
            text: T(`所以恢复 ${k} 次；商 ${s.q}，余数 ${s.r}。不恢复余数法（加减交替）就是为了省掉这些恢复。`, `${k} restores; q ${s.q}, r ${s.r}. Non-restoring division avoids them.`),
            go: { lesson: 'divide', doc: 'nonrestore' },
          },
        ],
      };
    },
  },
  {
    id: 'co-fp-01',
    subject: 'co',
    chapter: 'data',
    topic: T('IEEE 754 编码', 'IEEE 754 encoding'),
    type: 'text',
    difficulty: 2,
    lessons: ['ieee754'],
    tags: ['计算'],
    make(r) {
      const f = r.pick([2, 4, 8, 16]);
      const num = r.int(1, 96 * f);
      const v = (r.next() < 0.5 ? -1 : 1) * (num / f);
      const value = String(v);
      const e = fpEncode(value, 32);
      const params = { ...base('ieee754'), mode: 'encode', width: 32, value };
      const l = L('ieee754', params);
      const hex = hexOf(e.bits, 32).slice(2);
      const bin = Math.abs(v).toString(2);
      const digits = bin.replace('.', '').replace(/^0+/, '');
      const normStr = `1.${digits.slice(1).replace(/0+$/, '') || '0'}`;
      return {
        question: T(`把 float 型数 ${value} 按 IEEE 754 单精度格式编码，结果用十六进制表示是多少？`, `Encode ${value} as an IEEE 754 single. What is it in hex?`),
        answer: { accept: [hex, `0x${hex}`, `${hex}H`], show: `${hex}H` },
        steps: [
          {
            text: T(`|${value}| = ${bin}B = ${normStr} × 2^${e.e}（规格化成 1.f 的形式）。`, `|${value}| = ${bin}B = 1.f × 2^${e.e}.`),
            go: { lesson: 'ieee754', doc: 'encode' },
          },
          {
            text: T(`符号 S = ${e.sign}；阶码 E = ${e.e} + 127 = ${e.E} = ${e.E.toString(2).padStart(8, '0')}；尾数取小数点后的 23 位。`, `S = ${e.sign}, E = ${e.E}, fraction: 23 bits after the point.`),
            go: { lesson: 'ieee754', params, step: last(l) },
          },
          {
            text: T(`拼起来 4 位一组写成十六进制：${hex}H。`, `Hex: ${hex}H.`),
          },
        ],
      };
    },
  },
  {
    id: 'co-fp-02',
    subject: 'co',
    chapter: 'data',
    topic: T('IEEE 754 解码', 'IEEE 754 decoding'),
    type: 'number',
    difficulty: 2,
    lessons: ['ieee754'],
    tags: ['计算'],
    make(r) {
      const sign = r.int(0, 1);
      const E = r.int(124, 133);
      const M = r.int(0, 15) << 19;
      const bits = (BigInt(sign) << 31n) | (BigInt(E) << 23n) | BigInt(M);
      const hex = hexOf(bits, 32).slice(2);
      const d = fpDecode(hex, 32);
      const value = Number(d.exactStr);
      const params = { ...base('ieee754'), mode: 'decode', width: 32, hex };
      const l = L('ieee754', params);
      const frac = (M >>> 19).toString(2).padStart(4, '0');
      return {
        question: T(`float 型变量的机器数是 ${hex}H（IEEE 754 单精度）。它的真值是多少（十进制）？`, `A float holds ${hex}H (IEEE 754 single). What is its value?`),
        answer: { value },
        steps: [
          {
            text: T(`展开成二进制：符号位 ${sign}，阶码 ${E.toString(2).padStart(8, '0')} = ${E}，尾数前 4 位 ${frac}，其余全 0。`, `S ${sign}, E ${E}, fraction ${frac}000…`),
            go: { lesson: 'ieee754', doc: 'decode' },
          },
          {
            text: T(`真值 = (−1)^${sign} × 1.${frac} × 2^(${E} − 127) = ${value}。`, `Value = (−1)^${sign} × 1.${frac} × 2^${E - 127} = ${value}.`),
            go: { lesson: 'ieee754', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'co-fadd-01',
    subject: 'co',
    chapter: 'data',
    topic: T('浮点加减运算', 'Floating-point add and subtract'),
    type: 'number',
    difficulty: 3,
    lessons: ['float-add'],
    tags: ['过程推演'],
    conv: T('尾数以带符号的二进制小数给出；阶码 4 位补码，尾数保留 4 位，运算时用双符号位补码；结果规格化后按「0 舍 1 入」舍入。', 'Signed binary fractions; 4-bit two’s-complement exponent, 4 fraction bits, double sign bits; normalise, then round 0-down 1-up.'),
    make(r) {
      for (;;) {
        const mant = () => `${r.next() < 0.3 ? '-' : ''}0.1${r.int(0, 7).toString(2).padStart(3, '0')}`;
        const params = {
          ex: r.int(-2, 4),
          mx: mant(),
          ey: r.int(-2, 4),
          my: mant(),
          op: r.pick(['add', 'sub']),
          e: 4,
          m: 4,
        };
        const l = L('float-add', params);
        const s = l.sim;
        if (!s?.ok || s.zero || s.over || params.ex === params.ey) continue;
        const sy = params.op === 'add' ? '+' : '−';
        const al = s.steps.find((x) => x.kind === 'align');
        const nm = s.steps.find((x) => x.kind === 'norm');
        return {
          question: T(`X = 2^${params.ex} × (${params.mx})，Y = 2^${params.ey} × (${params.my})（尾数是二进制小数）。按浮点运算步骤求 X ${sy} Y，结果的真值是多少（十进制）？`, `X = 2^${params.ex} × ${params.mx}, Y = 2^${params.ey} × ${params.my} (binary). Compute X ${sy} Y with floating-point steps; what is the value?`),
          answer: { value: s.value },
          steps: [
            {
              text: T(`对阶：小阶向大阶看齐，${al.big === 'x' ? 'Y' : 'X'} 的尾数右移 ${al.d} 位，阶码都变成 ${al.E}。`, `Align: shift the smaller one right by ${al.d}.`),
              go: { lesson: 'float-add', doc: 'five' },
            },
            {
              text: T(`尾数${params.op === 'add' ? '相加' : '相减'}后规格化（${nm.how === 'ok' ? '已经是规格化数' : nm.how === 'right' ? '右规一位' : `左规 ${nm.how.slice(4)} 位`}），再按 0 舍 1 入保留 4 位。`, `Add the fractions, normalise (${nm.how}), then round.`),
              go: { lesson: 'float-add', doc: 'norm' },
            },
            {
              text: T(`结果尾数的补码是 ${s.Mstr}、阶码 ${s.E}，真值 = ${s.value}${s.rounded ? `（精确值是 ${s.check}，舍入带来了误差）` : ''}。`, `Result ${s.Mstr} × 2^${s.E} = ${s.value}.`),
              go: { lesson: 'float-add', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  {
    id: 'co-end-01',
    subject: 'co',
    chapter: 'data',
    topic: T('结构体的对齐', 'Struct alignment'),
    type: 'number',
    difficulty: 2,
    lessons: ['endian'],
    tags: ['计算'],
    conv: T('char 1 字节、short 2、int 4、double 8；每个成员的起始地址是它大小的整数倍，结构体总大小是最大成员的整数倍。', 'char 1, short 2, int 4, double 8; natural alignment; size rounded to the largest member.'),
    make(r) {
      const types = ['char', 'short', 'int', 'double'];
      const k = r.int(3, 5);
      const struct = Array.from({ length: k }, (_, i) => `${r.pick(types)} ${'abcde'[i]}`).join('; ');
      const params = { ...base('endian'), struct };
      const l = L('endian', params);
      const lay = l.sim.lay;
      return {
        question: T(`struct { ${struct}; } 在按自然边界对齐时，sizeof 是多少字节？`, `struct { ${struct}; } with natural alignment: what is sizeof?`),
        answer: { value: lay.total },
        steps: [
          {
            text: T(`依次放置：${lay.rows.map((x) => `${x.name} 偏移 ${x.offset}${x.pad ? `（前面补 ${x.pad}）` : ''}`).join('，')}，共用到 ${lay.used} 字节。`, lay.rows.map((x) => `${x.name}@${x.offset}`).join(', ')),
            go: { lesson: 'endian', params, step: last(l) },
          },
          {
            text: T(`最大成员 ${lay.maxA} 字节，总大小补到它的整数倍：${lay.used}${lay.tail ? ` + ${lay.tail}` : ''} = ${lay.total}。按从大到小排列成员可以缩到 ${l.sim.best.total}。`, `Round up to ${lay.maxA}: ${lay.total}.`),
            go: { lesson: 'endian', doc: 'align' },
          },
        ],
      };
    },
  },
  {
    id: 'co-end-02',
    subject: 'co',
    chapter: 'data',
    topic: T('大端与小端', 'Big and little endian'),
    type: 'text',
    difficulty: 1,
    lessons: ['endian'],
    tags: ['计算'],
    make(r) {
      const value = Array.from({ length: 4 }, () => H(r.int(16, 255), 8)).join('');
      const addr = H(r.int(64, 4000) * 4, 16);
      const little = r.next() < 0.6;
      const k = r.int(0, 3);
      const params = { ...base('endian'), value, addr, width: 4 };
      const l = L('endian', params);
      const cell = (little ? l.sim.little : l.sim.big)[k];
      const at = H(parseInt(cell.addr, 16), 16);
      return {
        question: T(`int 型变量的值是 ${value}H，存放在 ${addr}H 开始的 4 个字节里，机器采用${little ? '小端' : '大端'}方式。地址 ${at}H 中的字节是多少（十六进制）？`, `An int ${value}H is stored at ${addr}H on a ${little ? 'little' : 'big'}-endian machine. Which byte is at ${at}H?`),
        answer: {
          accept: [cell.b, `0x${cell.b}`, `${cell.b}H`],
          show: `${cell.b}H`,
        },
        steps: [
          {
            text: T(little ? '小端：低位字节放在低地址。' : '大端：高位字节放在低地址。', little ? 'Little endian: low byte at low address.' : 'Big endian: high byte at low address.'),
            go: { lesson: 'endian', doc: 'endian' },
          },
          {
            text: T(`从 ${addr}H 起依次是 ${(little ? l.sim.little : l.sim.big).map((c) => c.b).join(' ')}，${at}H 是第 ${k + 1} 个：${cell.b}H。`, `Bytes ${(little ? l.sim.little : l.sim.big).map((c) => c.b).join(' ')}; answer ${cell.b}H.`),
            go: { lesson: 'endian', params, step: 0 },
          },
        ],
      };
    },
  },
  // ───── 中央处理器 ─────
  {
    id: 'co-dp-01',
    subject: 'co',
    chapter: 'cpu',
    topic: T('单总线数据通路', 'Single-bus datapath'),
    type: 'single',
    difficulty: 2,
    lessons: ['datapath'],
    tags: ['过程推演'],
    conv: T('单总线 CPU：一个节拍里总线上只能有一个部件输出；ALU 一个输入来自暂存器 Y，结果进暂存器 Z；取指 3 个节拍。', 'Single bus: one output per cycle; ALU input Y, result Z; fetch takes 3 cycles.'),
    make(r) {
      const instr = r.pick(['addrr', 'addmem', 'load', 'store']);
      const params = { ...base('datapath'), instr };
      const l = L('datapath', params);
      const st = l.sim.steps;
      const k = r.int(3, st.length - 1);
      const right = T(st[k].zh, st[k].en);
      const others = r
        .shuffle(st.filter((_, i) => i !== k))
        .slice(0, 3)
        .map((x) => T(x.zh, x.en));
      const { options, answer } = shuffled(r, right, others);
      return {
        question: T(`单总线 CPU 执行指令 ${l.sim.name}。取指的 3 个节拍之后，执行阶段的第 ${k - 2} 个节拍做的是什么？`, `A single-bus CPU runs ${l.sim.name}. After the 3 fetch cycles, what happens in execute cycle ${k - 2}?`),
        options,
        answer,
        steps: [
          {
            text: T(
              `执行阶段依次是：${st
                .slice(3)
                .map((x, i) => `${i + 1}. ${x.zh}`)
                .join('；')}。`,
              st
                .slice(3)
                .map((x, i) => `${i + 1}. ${x.en}`)
                .join('; '),
            ),
            go: { lesson: 'datapath', params, step: k },
          },
          {
            text: T('单总线一拍只能传一个数，所以 ALU 的两个操作数要分两拍：先送一个进 Y，再让另一个上总线。', 'One bus transfer per cycle: one operand goes to Y first.'),
            go: { lesson: 'datapath', doc: 'bus' },
          },
        ],
      };
    },
  },
  {
    id: 'co-mw-01',
    subject: 'co',
    chapter: 'cpu',
    topic: T('水平型微指令的格式', 'Horizontal microinstruction format'),
    type: 'number',
    difficulty: 2,
    lessons: ['microword'],
    tags: ['计算'],
    conv: T('操作控制字段采用字段直接编码：每个互斥组留一个编码表示「不发命令」；条件测试字段同样要留一个「无条件」；下地址字段按控存字数算。', 'Each field needs one code for “none”; same for the condition field; next address from the store size.'),
    make(r) {
      const groups = Array.from({ length: r.int(3, 5) }, () => r.int(2, 15));
      const words = r.pick([128, 256, 512, 1024]);
      const conds = r.int(2, 7);
      const params = { groups, words, conds };
      const l = L('microword', params);
      const s = l.sim;
      return {
        question: T(`某计算机采用水平型微指令，微命令分成 ${groups.length} 个互斥组，各组分别有 ${groups.join('、')} 个微命令，用字段直接编码；有 ${conds} 个判断条件；控制存储器 ${words} 个字，用断定方式给出下地址。微指令一共多少位？`, `${groups.length} mutually exclusive groups of ${groups.join(', ')} micro-commands, ${conds} conditions, ${words}-word control store. How many bits per microinstruction?`),
        answer: { value: s.total },
        steps: [
          {
            text: T(`操作控制字段：${s.fields.map((f) => `⌈log₂(${f.g}+1)⌉=${f.bits}`).join('，')}，共 ${s.ctrl} 位。`, `Control: ${s.fields.map((f) => f.bits).join(' + ')} = ${s.ctrl}.`),
            go: { lesson: 'microword', doc: 'encode' },
          },
          {
            text: T(`判断测试字段 ⌈log₂(${conds}+1)⌉ = ${s.condBits} 位；下地址字段 log₂${words} = ${s.addrBits} 位。合计 ${s.ctrl} + ${s.condBits} + ${s.addrBits} = ${s.total}。`, `Condition ${s.condBits}, address ${s.addrBits}: total ${s.total}.`),
            go: { lesson: 'microword', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'co-hz-01',
    subject: 'co',
    chapter: 'cpu',
    topic: T('流水线的数据冒险', 'Data hazards in a pipeline'),
    type: 'number',
    difficulty: 3,
    lessons: ['pipeline'],
    tags: ['过程推演'],
    conv: T('五段流水线 IF ID EX MEM WB；ID 段读寄存器，WB 段写寄存器，寄存器堆前半周期写、后半周期读；只考虑数据冒险。', 'Five stages; read in ID, write in WB (write first half, read second half); data hazards only.'),
    make(r) {
      const forward = r.next() < 0.5;
      const ins = [];
      let lastDst = 1;
      for (let i = 0; i < 4; i++) {
        const dst = i + 4;
        const a = r.next() < 0.6 ? lastDst : r.int(1, 3);
        const b = r.int(1, 3);
        if (r.next() < 0.3 && i < 3) ins.push(`lw r${dst}, ${r.int(0, 3) * 4}(r${a})`);
        else ins.push(`${r.pick(['add', 'sub', 'and', 'or'])} r${dst}, r${a}, r${b}`);
        lastDst = dst;
      }
      const prog = ins.join('; ');
      const params = { prog, forward, splitRF: true };
      const l = L('pipeline', params);
      const s = l.sim;
      return {
        question: T(`下面 4 条指令在五段流水线上执行，${forward ? '有' : '没有'}转发（旁路）：\n${ins.join('\n')}\n从第一条指令取指到最后一条写回，一共要多少个时钟周期？`, `On a five-stage pipeline ${forward ? 'with' : 'without'} forwarding:\n${ins.join('\n')}\nHow many cycles in total?`),
        answer: { value: s.total },
        steps: [
          {
            text: T(forward ? '有转发：ALU 结果 EX 之后就能转给下一条的 EX；只有 load 的结果要到 MEM 之后才有，紧跟着用它的指令要停 1 拍。' : '没有转发：用到前面结果的指令，ID 段不能早于那条指令的 WB 段（同一周期先写后读）。', forward ? 'With forwarding only load-use stalls.' : 'Without forwarding ID waits for the producer’s WB.'),
            go: { lesson: 'pipeline', doc: forward ? 'forward' : 'data' },
          },
          {
            text: T(`没有冒险时要 5 + 4 − 1 = ${s.ideal} 个周期；这里一共阻塞 ${s.stalls} 拍，所以是 ${s.total} 个周期。`, `Ideal ${s.ideal}, stalls ${s.stalls}: ${s.total}.`),
            go: { lesson: 'pipeline', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'co-br-01',
    subject: 'co',
    chapter: 'cpu',
    topic: T('控制冒险', 'Control hazards'),
    type: 'number',
    difficulty: 2,
    lessons: ['branch-hazard'],
    tags: ['计算'],
    conv: T('五段流水线 IF ID EX MEM WB，每段 1 个周期；不考虑数据冒险。', 'Five one-cycle stages; no data hazards.'),
    make(r) {
      const n = r.int(5, 9);
      const b = r.int(1, n - 2);
      const rr = r.pick([2, 3, 4]);
      const strategy = r.pick(['stall', 'predict']);
      const taken = r.next() < 0.6;
      const params = { n, b, taken, r: rr, strategy };
      const l = L('branch-hazard', params);
      const s = l.sim;
      const stage = ['', '', 'ID', 'EX', 'MEM'][rr];
      const how = strategy === 'stall' ? T('遇到转移指令就暂停取指，直到转移方向确定', 'stall until the branch resolves') : T('一律预测不转移，继续取后面的指令；预测错了就冲掉', 'predict not taken; flush on a mispredict');
      return {
        question: T(`一段程序共执行 ${n} 条指令，其中第 ${b} 条是条件转移指令，在 ${stage} 段末尾确定是否转移。采用「${how.zh}」的办法，这次${taken ? '发生了转移（转到目标处继续执行剩下的指令）' : '没有转移'}。执行完这 ${n} 条指令一共要多少个时钟周期？`, `${n} instructions; #${b} is a branch resolved at the end of ${stage}. Strategy: ${how.en}. The branch is ${taken ? '' : 'not '}taken. Total cycles?`),
        answer: { value: s.total },
        steps: [
          {
            text: T(`没有冒险时 5 + ${n} − 1 = ${s.ideal} 个周期。转移在第 ${rr} 段末尾确定，之前已经取进来的 ${rr - 1} 条指令可能白取。`, `Ideal ${s.ideal}; ${rr - 1} slots are at risk.`),
            go: { lesson: 'branch-hazard', doc: 'fix' },
          },
          {
            text: T(strategy === 'stall' ? `暂停法不管转不转都损失 ${rr - 1} 个周期。` : taken ? `预测不转移却转移了，冲掉 ${rr - 1} 条，损失 ${rr - 1} 个周期。` : '预测对了，没有损失。', `Penalty ${s.pen}.`),
            go: { lesson: 'branch-hazard', params, step: last(l) },
          },
          {
            text: T(`合计 ${s.ideal} + ${s.pen} = ${s.total} 个周期。`, `Total ${s.total}.`),
          },
        ],
      };
    },
  },
  // ───── 输入输出：中断 ─────
  {
    id: 'co-int-01',
    subject: 'co',
    chapter: 'bus',
    topic: T('中断屏蔽字', 'Interrupt mask words'),
    type: 'text',
    difficulty: 2,
    lessons: ['int-mask'],
    tags: ['计算'],
    conv: T('屏蔽字里 1 表示屏蔽、0 表示开放；屏蔽字各位按设备 A、B、C、D 的顺序排列；每个设备都屏蔽自己。', '1 = masked; bits ordered A B C D; each masks itself.'),
    make(r) {
      for (;;) {
        const handle = r.shuffle(['A', 'B', 'C', 'D']);
        if (handle.join('') === 'ABCD') continue;
        const x = r.pick(handle.slice(1));
        const params = { ...base('int-mask'), handle: handle.join(' ') };
        const l = L('int-mask', params);
        const m = l.sim.mask[x];
        return {
          question: T(`设备 A、B、C、D 的中断响应优先级从高到低为 A、B、C、D，用改屏蔽字的办法把中断处理优先级改成 ${handle.join(' > ')}。设备 ${x} 的中断服务程序里的屏蔽字是什么？`, `Response order A > B > C > D; handling order set to ${handle.join(' > ')}. What is ${x}’s mask word?`),
          answer: seq(m),
          steps: [
            {
              text: T(`处理优先级比 ${x} 高的设备（${handle.slice(0, handle.indexOf(x)).join('、')}）要能打断它，对应位为 0；${x} 自己和比它低的设备都屏蔽，对应位为 1。`, `Higher-priority devices open (0); itself and lower masked (1).`),
              go: { lesson: 'int-mask', doc: 'mask' },
            },
            {
              text: T(`按 A B C D 排列：${m.join('')}。`, `In order A B C D: ${m.join('')}.`),
              go: { lesson: 'int-mask', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  {
    id: 'co-int-02',
    subject: 'co',
    chapter: 'bus',
    topic: T('多重中断的执行顺序', 'Order under nested interrupts'),
    type: 'text',
    difficulty: 3,
    lessons: ['int-mask'],
    tags: ['过程推演'],
    conv: T('响应优先级 A > B > C > D；按屏蔽字决定能否打断（处理优先级）；每个中断服务程序要执行 3 个单位时间；中断请求在某时刻到达。', 'Response A > B > C > D; nesting by mask; each ISR takes 3 time units.'),
    make(r) {
      for (;;) {
        const handle = r.shuffle(['A', 'B', 'C', 'D']);
        const devs = r.shuffle(['A', 'B', 'C', 'D']).slice(0, 3);
        const ts = [0, r.int(1, 2), r.int(2, 4)];
        const arrivals = devs.map((d, i) => `${d}${ts[i]}`).join(' ');
        const params = {
          devs: 'A B C D',
          handle: handle.join(' '),
          arrivals,
          dur: 3,
        };
        const l = L('int-mask', params);
        const s = l.sim;
        if (!s.events.some((e) => e.kind === 'nest')) continue;
        const done = s.events.filter((e) => e.kind === 'done').map((e) => e.d);
        return {
          question: T(`处理优先级为 ${handle.join(' > ')}。${devs.join('、')} 分别在时刻 ${ts.join('、')} 提出中断请求（CPU 原来在运行用户程序）。各中断服务程序完成的先后顺序是？`, `Handling order ${handle.join(' > ')}. Requests: ${devs.map((d, i) => `${d} at ${ts[i]}`).join(', ')}. In what order do the ISRs finish?`),
          answer: seq(done),
          steps: [
            {
              text: T('同时有几个请求时按响应优先级挑；正在执行的服务程序只能被它没屏蔽的设备（处理优先级更高的）打断。', 'Pick by response order; nest only if not masked.'),
              go: { lesson: 'int-mask', doc: 'mask' },
            },
            {
              text: T(`按时间推下去：${s.events.map((e) => `${e.t} ${e.kind === 'req' ? e.d + ' 请求' : e.kind === 'resp' ? '响应 ' + e.d : e.kind === 'nest' ? e.d + ' 打断 ' + e.over : e.d + ' 完成'}`).join('，')}。`, s.events.map((e) => `${e.t} ${e.kind} ${e.d}`).join(', ')),
              go: { lesson: 'int-mask', params, step: last(l) },
            },
            {
              text: T(`完成顺序 ${done.join(' → ')}。`, `Finish order ${done.join(' → ')}.`),
            },
          ],
        };
      }
    },
  },
];
