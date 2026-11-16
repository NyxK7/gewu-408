// I/O 管理的纯计算：
//   ctrl：I/O 控制方式下 CPU 花在 I/O 上的时间占比（程序查询 / 中断 / DMA）；
//   buffer：单缓冲、双缓冲处理 n 块数据的总时间。
//
// I/O 控制方式（约定写在界面上）：
//   · 外设以速率 R（B/s）连续传输；程序查询方式下 CPU 全程在查询，占比 100%；
//   · 中断方式：每传输 w 字节（一个字）产生一次中断，每次中断的 CPU 开销是 tInt；
//     每秒中断 R ÷ w 次，CPU 占比 = (R ÷ w) × tInt；
//   · DMA 方式：每传输一个数据块（b 字节）才中断一次，每次的 CPU 开销是 tDma（预处理 + 后处理）；
//     每秒 R ÷ b 次，CPU 占比 = (R ÷ b) × tDma。
// 缓冲（教材常见模型，一块数据要经历：设备输入到缓冲区 T，缓冲区传送到用户区 M，CPU 处理 C）：
//   · 单缓冲：稳定后每块平均用时 max(C, T) + M；
//   · 双缓冲：稳定后每块平均用时 max(T, C + M)；
//   · 总时间不用公式，而是按下面的时间线逐块精确推算（前几块有启动过程，和「平均用时 × n」不一定相等）。
// 时间线推算规则：
//   单缓冲：第 i 块输入要等缓冲区空（上一块已传到用户区）；传送要等用户区空（上一块已处理完）和本块输入完；
//   双缓冲：两个缓冲区交替使用，第 i 块输入用缓冲区 i mod 2，要等这个缓冲区里第 i−2 块已传送走；
//           传送要等本块输入完、用户区空（上一块处理完）。

const r6 = (x) => Math.round(x * 1e6) / 1e6;

export function ctrl({ rate, word, block, tInt, tDma }) {
  const errors = [];
  if (!(rate > 0)) errors.push('rate');
  if (!(word > 0)) errors.push('word');
  if (!(block >= word)) errors.push('block');
  if (!(tInt > 0)) errors.push('tInt');
  if (!(tDma > 0)) errors.push('tDma');
  if (errors.length) return { ok: false, errors };
  const intPerSec = rate / word;
  const dmaPerSec = rate / block;
  return {
    ok: true,
    rate,
    word,
    block,
    tInt,
    tDma,
    poll: 1,
    intPerSec: r6(intPerSec),
    dmaPerSec: r6(dmaPerSec),
    intShare: r6(intPerSec * tInt),
    dmaShare: r6(dmaPerSec * tDma),
  };
}

export function buffer({ mode = 'single', n, T, M, C }) {
  const errors = [];
  if (!['single', 'double'].includes(mode)) errors.push('mode');
  if (!(Number.isInteger(n) && n >= 1 && n <= 10)) errors.push('n');
  if (!(T > 0)) errors.push('T');
  if (!(M >= 0)) errors.push('M');
  if (!(C > 0)) errors.push('C');
  if (errors.length) return { ok: false, errors };
  const blocks = [];
  for (let i = 0; i < n; i++) {
    const prev = blocks[i - 1];
    let inStart;
    if (mode === 'single') inStart = prev ? prev.mvEnd : 0;
    else inStart = i >= 2 ? Math.max(blocks[i - 2].mvEnd, prev.inEnd) : prev ? prev.inEnd : 0;
    // 单缓冲：设备只能一块接一块输入；双缓冲：输入不能早于上一块输入结束（设备一次只输入一块）
    if (mode === 'single' && prev) inStart = Math.max(inStart, prev.inEnd);
    const inEnd = inStart + T;
    const mvStart = Math.max(inEnd, prev ? prev.cEnd : 0);
    const mvEnd = mvStart + M;
    const cStart = mvEnd;
    const cEnd = cStart + C;
    blocks.push({ i, inStart: r6(inStart), inEnd: r6(inEnd), mvStart: r6(mvStart), mvEnd: r6(mvEnd), cStart: r6(cStart), cEnd: r6(cEnd), buf: mode === 'double' ? i % 2 : 0 });
  }
  const total = blocks.at(-1).cEnd;
  const per = mode === 'single' ? Math.max(C, T) + M : Math.max(T, C + M);
  return { ok: true, mode, n, T, M, C, blocks, total: r6(total), per: r6(per) };
}
