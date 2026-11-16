// 进程五状态转换的纯计算：按事件序列推进，每一步记录各进程状态、就绪队列、阻塞队列。
// 事件写法（空格或逗号分隔）：
//   P1+    创建 P1（创建态 → 就绪态，进入就绪队列队尾）
//   run    进程调度：就绪队列队首 → 运行态（CPU 必须空闲）
//   tick   时间片到：运行态 → 就绪态（排到就绪队列队尾）
//   wait   运行的进程请求 I/O 或等待事件：运行态 → 阻塞态
//   P1!    P1 等待的事件发生：阻塞态 → 就绪态（排到就绪队列队尾）
//   exit   运行的进程结束：运行态 → 终止态
// 不合法的操作（比如唤醒一个不在阻塞态的进程）不会让整条序列作废，而是记成一步「不合法」并说明原因。

export function parseEvents(text) {
  const items = String(text ?? '').split(/[\s,，;；]+/).filter(Boolean);
  const out = [];
  for (const it of items) {
    let m;
    if ((m = it.match(/^([A-Za-z]\w{0,3})\+$/))) out.push({ op: 'create', p: m[1] });
    else if ((m = it.match(/^([A-Za-z]\w{0,3})!$/))) out.push({ op: 'wakeup', p: m[1] });
    else if (/^(run|tick|wait|exit)$/i.test(it)) out.push({ op: { run: 'dispatch', tick: 'timeout', wait: 'block', exit: 'exit' }[it.toLowerCase()] });
    else return { ok: false, bad: it };
  }
  return { ok: true, events: out };
}

export function simulate({ events: text }) {
  const parsed = parseEvents(text);
  if (!parsed.ok) return { ok: false, errors: [['event', { e: parsed.bad }]] };
  if (!parsed.events.length || parsed.events.length > 24) return { ok: false, errors: [['count']] };
  const state = {};
  const order = [];
  const ready = [];
  const blocked = [];
  let running = null;
  const steps = [];
  const snap = () => ({ state: { ...state }, ready: [...ready], blocked: [...blocked], running, order: [...order] });
  for (const e of parsed.events) {
    let s;
    if (e.op === 'create') {
      if (state[e.p] && state[e.p] !== 'done') s = { kind: 'illegal', why: 'exists', p: e.p };
      else {
        if (!order.includes(e.p)) order.push(e.p);
        state[e.p] = 'ready';
        ready.push(e.p);
        s = { kind: 'create', p: e.p, from: 'new', to: 'ready' };
      }
    } else if (e.op === 'dispatch') {
      if (running) s = { kind: 'illegal', why: 'busy', p: running };
      else if (!ready.length) s = { kind: 'illegal', why: 'noReady' };
      else {
        const p = ready.shift();
        running = p;
        state[p] = 'running';
        s = { kind: 'dispatch', p, from: 'ready', to: 'running' };
      }
    } else if (e.op === 'timeout' || e.op === 'block' || e.op === 'exit') {
      if (!running) s = { kind: 'illegal', why: 'idle', op: e.op };
      else {
        const p = running;
        running = null;
        const to = { timeout: 'ready', block: 'blocked', exit: 'done' }[e.op];
        state[p] = to;
        if (to === 'ready') ready.push(p);
        if (to === 'blocked') blocked.push(p);
        s = { kind: e.op, p, from: 'running', to };
      }
    } else {
      const st = state[e.p];
      if (st !== 'blocked') s = { kind: 'illegal', why: st ? `notBlocked` : 'noProc', p: e.p, st };
      else {
        blocked.splice(blocked.indexOf(e.p), 1);
        state[e.p] = 'ready';
        ready.push(e.p);
        s = { kind: 'wakeup', p: e.p, from: 'blocked', to: 'ready' };
      }
    }
    steps.push({ ...s, ...snap() });
  }
  return { ok: true, steps, procs: order };
}
