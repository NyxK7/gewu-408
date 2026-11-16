// 记录型信号量的 P、V 操作模拟。
// 信号量写法：「mutex=1, empty=3, full=0」；操作写法：「P1:P(mutex)」「P2:V(full)」，空格或逗号分隔。
// 语义（与教材一致）：
//   P(S)：S.value−−；若 S.value < 0，调用者阻塞，插入 S 的等待队列队尾；
//   V(S)：S.value++；若 S.value ≤ 0，唤醒等待队列队首的进程（它从 P 操作之后继续，变成就绪）；
//   S.value < 0 时，|S.value| 就是等待队列里的进程数。
// 已经阻塞的进程不能再发出操作；这种情况记成一步「不合法」，并给出原因。

export function parseSems(text) {
  const out = {};
  const items = String(text ?? '').split(/[\s,，;；]+/).filter(Boolean);
  for (const it of items) {
    const m = it.match(/^([A-Za-z]\w{0,9})=(-?\d+)$/);
    if (!m) return null;
    out[m[1]] = Number(m[2]);
  }
  return Object.keys(out).length ? out : null;
}

export function parseOps(text) {
  const items = String(text ?? '').split(/[\s,，;；]+/).filter(Boolean);
  const out = [];
  for (const it of items) {
    const m = it.match(/^([A-Za-z]\w{0,3}):([PV])\(([A-Za-z]\w{0,9})\)$/i);
    if (!m) return { ok: false, bad: it };
    out.push({ p: m[1], op: m[2].toUpperCase(), s: m[3] });
  }
  return { ok: true, ops: out };
}

export function simulate({ sems: semText, ops: opText }) {
  const init = parseSems(semText);
  if (!init) return { ok: false, errors: [['sems']] };
  if (Object.keys(init).length > 5) return { ok: false, errors: [['semCount']] };
  const parsed = parseOps(opText);
  if (!parsed.ok) return { ok: false, errors: [['op', { e: parsed.bad }]] };
  if (!parsed.ops.length || parsed.ops.length > 24) return { ok: false, errors: [['count']] };
  for (const o of parsed.ops) if (!(o.s in init)) return { ok: false, errors: [['noSem', { s: o.s }]] };

  const val = { ...init };
  const queue = Object.fromEntries(Object.keys(init).map((k) => [k, []]));
  const blockedOn = {};
  const procs = [];
  const steps = [];
  for (const o of parsed.ops) {
    if (!procs.includes(o.p)) procs.push(o.p);
    const before = val[o.s];
    let s;
    if (blockedOn[o.p]) s = { kind: 'illegal', why: 'blocked', on: blockedOn[o.p] };
    else if (o.op === 'P') {
      val[o.s]--;
      if (val[o.s] < 0) {
        queue[o.s].push(o.p);
        blockedOn[o.p] = o.s;
        s = { kind: 'P', block: true };
      } else s = { kind: 'P', block: false };
    } else {
      val[o.s]++;
      let woke = null;
      if (val[o.s] <= 0 && queue[o.s].length) {
        woke = queue[o.s].shift();
        delete blockedOn[woke];
      }
      s = { kind: 'V', woke };
    }
    steps.push({ ...o, ...s, before, after: val[o.s], val: { ...val }, queue: Object.fromEntries(Object.entries(queue).map(([k, q]) => [k, [...q]])), blockedOn: { ...blockedOn } });
  }
  return { ok: true, init, steps, procs, sems: Object.keys(init), final: { ...val }, stuck: Object.keys(blockedOn) };
}
