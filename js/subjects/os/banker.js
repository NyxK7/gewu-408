// 银行家算法：Need = Max − Allocation；资源请求检查；安全性算法找安全序列。
// 约定（界面上写明）：安全性算法按 P0、P1、P2…… 的顺序一轮一轮扫描，同一轮里遇到能满足的就分配给它
// （它运行完把资源全部归还），接着检查后面的进程；一轮下来一个都没满足、而还有进程没完成，就是不安全。
// 安全序列可能不止一个，按别的顺序找到的序列只要每一步都满足，同样正确。

const le = (a, b) => a.every((x, i) => x <= b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);

export function parseMatrix(text) {
  const rows = String(text ?? '').split(/[;；\n|]+/).map((r) => r.trim()).filter(Boolean);
  const out = [];
  for (const r of rows) {
    const nums = r.split(/[\s,，]+/).filter(Boolean);
    if (!nums.length || nums.some((x) => !/^\d+$/.test(x))) return null;
    out.push(nums.map(Number));
  }
  return out.length ? out : null;
}

/** 从 work 出发跑一遍安全性算法 */
export function safety(work0, need, alloc) {
  const n = need.length;
  const finish = Array(n).fill(false);
  let work = [...work0];
  const seq = [];
  const checks = [];
  let pass = 0;
  for (;;) {
    pass++;
    let progress = false;
    for (let i = 0; i < n; i++) {
      if (finish[i]) continue;
      const ok = le(need[i], work);
      checks.push({ pass, i, need: need[i], work: [...work], ok });
      if (ok) {
        const before = [...work];
        work = add(work, alloc[i]);
        finish[i] = true;
        seq.push({ i, before, after: [...work], pass, failed: checks.filter((c) => c.pass === pass && !c.ok && c.i < i).map((c) => c.i) });
        progress = true;
      }
    }
    if (finish.every(Boolean)) return { safe: true, seq, checks, work };
    if (!progress) return { safe: false, seq, checks, work, stuck: finish.map((f, i) => (f ? null : i)).filter((x) => x !== null) };
  }
}

export function simulate({ avail: availText, max: maxText, alloc: allocText, req: reqText = '', reqP = 0 }) {
  const avail = parseMatrix(availText)?.[0];
  const max = parseMatrix(maxText);
  const alloc = parseMatrix(allocText);
  if (!avail) return { ok: false, errors: ['avail'] };
  if (!max || !alloc) return { ok: false, errors: ['matrix'] };
  const m = avail.length;
  const n = max.length;
  if (m > 5 || n > 8) return { ok: false, errors: ['size'] };
  if (alloc.length !== n || [...max, ...alloc].some((r) => r.length !== m)) return { ok: false, errors: ['shape'] };
  if (alloc.some((r, i) => !le(r, max[i]))) return { ok: false, errors: ['allocMax'] };
  const need = max.map((r, i) => sub(r, alloc[i]));
  const out = { ok: true, m, n, avail, max, alloc, need };
  const reqRow = String(reqText).trim() ? parseMatrix(reqText)?.[0] : null;
  if (String(reqText).trim() && (!reqRow || reqRow.length !== m)) return { ok: false, errors: ['req'] };
  if (reqRow && !(reqP >= 0 && reqP < n)) return { ok: false, errors: ['reqP'] };
  if (!reqRow) return { ...out, check: safety(avail, need, alloc) };
  const r = { p: reqP, req: reqRow };
  if (!le(reqRow, need[reqP])) return { ...out, request: { ...r, result: 'overNeed' } };
  if (!le(reqRow, avail)) return { ...out, request: { ...r, result: 'wait' } };
  const avail2 = sub(avail, reqRow);
  const alloc2 = alloc.map((row, i) => (i === reqP ? add(row, reqRow) : row));
  const need2 = need.map((row, i) => (i === reqP ? sub(row, reqRow) : row));
  const check = safety(avail2, need2, alloc2);
  return { ...out, request: { ...r, result: check.safe ? 'grant' : 'unsafe', avail2, alloc2, need2 }, check };
}
