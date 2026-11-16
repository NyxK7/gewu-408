// RIP 距离向量算法的纯计算：路由器收到相邻路由器 X 的路由信息后，怎样更新自己的路由表。
//
// 约定（界面上写明，按教材的写法）：
//   · 路由表每行「目的网络 距离 下一跳」，直接相连的网络距离为 1、下一跳写「直接」；
//   · X 发来的每行「目的网络 距离」，先把距离都加 1、下一跳都改成 X；
//   · 然后逐行处理：
//       原来没有这个目的网络 → 添加；
//       原来有，下一跳就是 X → 用新的替换（不管变大还是变小，以最新消息为准）；
//       原来有，下一跳不是 X → 新距离更小才替换，否则不变；
//   · 距离最大 15，16 表示不可达（加 1 后超过 16 也记作 16）；
//   · 没出现在 X 消息里的目的网络保持不变。

const INF = 16;

function parse(text, withHop) {
  const rows = [];
  for (const line of String(text ?? '').split(/[\n;；]+/).map((x) => x.trim()).filter(Boolean)) {
    const p = line.split(/[\s,，]+/);
    if (p.length !== (withHop ? 3 : 2)) return { error: line };
    const d = Number(p[1]);
    if (!Number.isInteger(d) || d < 1 || d > INF) return { error: line };
    rows.push(withHop ? { net: p[0], d, hop: p[2] } : { net: p[0], d });
  }
  return { rows };
}

export function rip({ table, from, msg }) {
  const t = parse(table, true);
  if (t.error) return { ok: false, errors: [['row', { r: t.error }]] };
  const m = parse(msg, false);
  if (m.error) return { ok: false, errors: [['msg', { r: m.error }]] };
  const X = String(from ?? '').trim();
  if (!X) return { ok: false, errors: ['from'] };
  if (!t.rows.length || !m.rows.length || t.rows.length > 10 || m.rows.length > 10) return { ok: false, errors: ['count'] };
  const nets = [...new Set([...t.rows.map((r) => r.net), ...m.rows.map((r) => r.net)])];
  const rows = nets.map((net) => {
    const old = t.rows.find((r) => r.net === net) ?? null;
    const got = m.rows.find((r) => r.net === net) ?? null;
    const mod = got ? { d: Math.min(INF, got.d + 1), hop: X } : null;
    let neu = old;
    let rule = 'none';
    if (mod) {
      if (!old) {
        neu = mod;
        rule = 'add';
      } else if (old.hop === X) {
        neu = mod;
        rule = 'same';
      } else if (mod.d < old.d) {
        neu = mod;
        rule = 'better';
      } else rule = 'keep';
    }
    return { net, old, msg: got, mod, neu: { d: neu.d, hop: neu.hop }, rule, changed: !old || old.d !== neu.d || old.hop !== neu.hop };
  });
  return { ok: true, from: X, rows, INF };
}
