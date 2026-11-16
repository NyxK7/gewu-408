// 磁盘调度的纯计算：FCFS / SSTF / SCAN / C-SCAN / LOOK / C-LOOK，算磁头移动的总距离和平均寻道长度。
// 约定（界面上写明，各教材说法不一）：
//   · SCAN 沿当前方向一直走到磁盘端点（0 或最大磁道号）才掉头；LOOK 走到这个方向上最远的请求就掉头；
//   · C-SCAN 走到端点后直接跳回另一端点，再按同一方向服务；C-LOOK 从最远请求跳到另一侧最远的请求；
//     跳回去的那段距离是否计入总移动距离由 countReturn 决定（默认计入）；
//   · SSTF 距离相同时，沿磁头当前的移动方向优先；
//   · 端点或跳转只在另一侧还有请求时才发生。

export const ALGOS = ['FCFS', 'SSTF', 'SCAN', 'CSCAN', 'LOOK', 'CLOOK'];

export function simulate({ algo, head, reqs, dir = 'up', max = 199, countReturn = true }) {
  const errors = [];
  if (!ALGOS.includes(algo)) errors.push('algo');
  if (!Number.isInteger(max) || max < 1 || max > 9999) errors.push('max');
  if (!Number.isInteger(head) || head < 0 || head > max) errors.push('head');
  if (!Array.isArray(reqs) || reqs.length < 1 || reqs.length > 16) errors.push('reqs');
  if (reqs?.some((r) => r < 0 || r > max)) errors.push('reqRange');
  if (errors.length) return { ok: false, errors };

  const path = []; // { track, dist, kind: 'req' | 'end' | 'jump', counted }
  let pos = head;
  const go = (track, kind = 'req', counted = true) => {
    path.push({ track, dist: Math.abs(track - pos), kind, counted, from: pos });
    pos = track;
  };
  const up = dir === 'up';
  if (algo === 'FCFS') reqs.forEach((r) => go(r));
  else if (algo === 'SSTF') {
    const left = [...reqs];
    let lastDir = up ? 1 : -1;
    while (left.length) {
      let best = 0;
      for (let i = 1; i < left.length; i++) {
        const di = Math.abs(left[i] - pos);
        const db = Math.abs(left[best] - pos);
        // 距离相同：沿当前移动方向优先
        if (di < db || (di === db && Math.sign(left[i] - pos) === lastDir)) best = i;
      }
      const r = left.splice(best, 1)[0];
      if (r !== pos) lastDir = Math.sign(r - pos);
      go(r);
    }
  } else {
    const sorted = [...reqs].sort((a, b) => a - b);
    const ahead = up ? sorted.filter((r) => r >= head) : sorted.filter((r) => r <= head).reverse();
    const behind = up ? sorted.filter((r) => r < head) : sorted.filter((r) => r > head).reverse();
    ahead.forEach((r) => go(r));
    if (behind.length) {
      const endA = up ? max : 0;
      const endB = up ? 0 : max;
      if (algo === 'SCAN') {
        if (pos !== endA) go(endA, 'end');
        [...behind].reverse().forEach((r) => go(r));
      } else if (algo === 'LOOK') {
        [...behind].reverse().forEach((r) => go(r));
      } else if (algo === 'CSCAN') {
        if (pos !== endA) go(endA, 'end');
        go(endB, 'jump', countReturn);
        behind.forEach((r) => go(r));
      } else {
        go(behind[0], 'jump', countReturn);
        behind.slice(1).forEach((r) => go(r));
      }
    }
  }
  const total = path.reduce((a, p) => a + (p.counted ? p.dist : 0), 0);
  return { ok: true, algo, head, reqs, dir, max, countReturn, path, order: path.filter((p) => p.kind === 'req').map((p) => p.track), total, avg: [total, reqs.length] };
}
