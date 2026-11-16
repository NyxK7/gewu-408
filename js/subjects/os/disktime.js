// 磁盘的结构与访问时间：把盘块号拆成（柱面号, 磁头号, 扇区号），再算一次读操作的
// 寻道时间 + 旋转延迟 + 传输时间，并和「同样多的扇区随机分散存放」比较。
//
// 约定（界面上写明）：
//   · 盘块号 = 扇区号（一个盘块就是一个扇区），从 0 开始，按「柱面 → 磁头（盘面）→ 扇区」的顺序编号：
//     先把 0 号柱面的 0 号盘面的各扇区编完，再编 1 号盘面……一个柱面编完再编下一个柱面（柱面 0 在最外圈）；
//   · 寻道时间用题目给的平均寻道时间 Ts；
//   · 旋转延迟取平均值：转半圈的时间；
//   · 传输时间 = 要读的扇区数 ÷ 每道扇区数 × 转一圈的时间；一次读的扇区都在同一条磁道上；
//   · 随机存放：每个扇区都要单独寻道、等旋转、传输一个扇区。

const err = (errors) => ({ ok: false, errors });

export function diskTime({ rpm = 6000, spt = 100, heads = 4, cyls = 1000, bytes = 512, b = 21000, k = 20, seek = 5 }) {
  const errors = [];
  if (!(Number.isInteger(rpm) && rpm >= 1000 && rpm <= 20000)) errors.push('rpm');
  if (!(Number.isInteger(spt) && spt >= 4 && spt <= 1000)) errors.push('spt');
  if (!(Number.isInteger(heads) && heads >= 1 && heads <= 16)) errors.push('heads');
  if (!(Number.isInteger(cyls) && cyls >= 2 && cyls <= 100000)) errors.push('cyls');
  if (!(Number.isInteger(bytes) && [256, 512, 1024, 2048, 4096].includes(bytes))) errors.push('bytes');
  if (!(seek >= 0 && seek <= 100)) errors.push('seek');
  if (errors.length) return err(errors);
  const perCyl = heads * spt;
  const total = perCyl * cyls;
  if (!(Number.isInteger(b) && b >= 0 && b < total)) return err([['b', { max: total - 1 }]]);
  const c = Math.floor(b / perCyl);
  const h = Math.floor((b % perCyl) / spt);
  const s = b % spt;
  if (!(Number.isInteger(k) && k >= 1 && s + k <= spt)) return err([['k', { max: spt - s }]]);
  const rot = 60000 / rpm; // 转一圈，毫秒
  const tr = rot / 2;
  const tt = (k / spt) * rot;
  const ta = seek + tr + tt;
  const one = rot / spt; // 传输一个扇区
  const random = k * (seek + tr + one);
  const rate = (spt * bytes) / (rot / 1000); // 字节 / 秒
  const steps = [
    { kind: 'addr' },
    { kind: 'seek' },
    { kind: 'rot' },
    { kind: 'xfer' },
    { kind: 'total' },
    { kind: 'random' },
  ];
  return { ok: true, rpm, spt, heads, cyls, bytes, b, k, seek, perCyl, total, c, h, s, rot, tr, tt, ta, one, random, rate, capacity: total * bytes, steps };
}

/** 显示用：最多 3 位小数，去掉末尾的 0 */
export const ms = (x) => String(Math.round(x * 1000) / 1000);
