// 线性表、栈、队列、数组几章的纯计算。
//
// 约定（界面上写明）：
//   · 循环队列：front 指队头元素，rear 指队尾元素的下一个位置，牺牲一个单元区分队空和队满；
//   · 特殊矩阵：i、j 从 1 开始，一维数组下标从 0 开始；按行优先存储；对称矩阵存下三角；
//   · 单链表带头结点，位序从 1 开始；逆置用头插法。

const err = (e) => ({ ok: false, errors: [e] });
export const seq = (s) => String(s ?? '').split(/[\s,，]+/).filter(Boolean);

// ───── 出栈序列 ─────
export const catalan = (n) => {
  let c = 1;
  for (let i = 0; i < n; i++) c = (c * 2 * (2 * i + 1)) / (i + 2);
  return Math.round(c);
};
export function stackSeq({ push, pop }) {
  const P = seq(push);
  const Q = seq(pop);
  if (!P.length || P.length > 10) return err('len');
  if (new Set(P).size !== P.length) return err('dup');
  if (Q.length !== P.length || [...Q].sort().join() !== [...P].sort().join()) return err('mismatch');
  const st = [];
  const steps = [];
  let i = 0;
  let fail = null;
  for (const want of Q) {
    while ((!st.length || st.at(-1) !== want) && i < P.length) {
      st.push(P[i++]);
      steps.push({ op: 'push', v: st.at(-1), stack: [...st], want });
    }
    if (st.at(-1) !== want) {
      fail = { want, top: st.at(-1) };
      steps.push({ op: 'fail', want, top: st.at(-1), stack: [...st] });
      break;
    }
    st.pop();
    steps.push({ op: 'pop', v: want, stack: [...st], want });
  }
  return { ok: true, push: P, pop: Q, steps, valid: !fail, fail, total: catalan(P.length) };
}

// ───── 中缀转后缀、后缀求值 ─────
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };
export function tokenize(s) {
  const out = [];
  const re = /\s*(\d+|[A-Za-z]|[-+*/()])/y;
  let m;
  let pos = 0;
  const str = String(s ?? '');
  re.lastIndex = 0;
  while (pos < str.length) {
    re.lastIndex = pos;
    m = re.exec(str);
    if (!m) {
      if (!str.slice(pos).trim()) break;
      return null;
    }
    out.push(m[1]);
    pos = re.lastIndex;
  }
  return out;
}
export function infix({ expr }) {
  const toks = tokenize(expr);
  if (!toks || !toks.length || toks.length > 30) return err('expr');
  // 括号配对、操作数和运算符交替
  let depth = 0;
  let wantOperand = true;
  for (const t of toks) {
    if (t === '(') {
      if (!wantOperand) return err('expr');
      depth++;
    } else if (t === ')') {
      if (wantOperand || --depth < 0) return err('paren');
    } else if (PREC[t]) {
      if (wantOperand) return err('expr');
      wantOperand = true;
    } else {
      if (!wantOperand) return err('expr');
      wantOperand = false;
    }
  }
  if (depth || wantOperand) return err(depth ? 'paren' : 'expr');
  const st = [];
  const out = [];
  const steps = [];
  for (const t of toks) {
    const popped = [];
    if (t === '(') st.push(t);
    else if (t === ')') {
      while (st.at(-1) !== '(') popped.push(st.pop());
      st.pop();
      out.push(...popped);
    } else if (PREC[t]) {
      while (st.length && st.at(-1) !== '(' && PREC[st.at(-1)] >= PREC[t]) popped.push(st.pop());
      out.push(...popped);
      st.push(t);
    } else out.push(t);
    steps.push({ t, popped, stack: [...st], out: [...out], kind: t === '(' ? 'lp' : t === ')' ? 'rp' : PREC[t] ? 'op' : 'num' });
  }
  const rest = [...st].reverse();
  out.push(...rest);
  if (rest.length) steps.push({ t: null, popped: rest, stack: [], out: [...out], kind: 'end' });
  // 后缀求值（全是数字时）
  const numeric = toks.every((t) => !/[A-Za-z]/.test(t));
  const evals = [];
  let value = null;
  if (numeric) {
    const s2 = [];
    for (const t of out) {
      if (PREC[t]) {
        const b = s2.pop();
        const a = s2.pop();
        const r = t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : a / b;
        s2.push(r);
        evals.push({ t, a, b, r, stack: [...s2] });
      } else {
        s2.push(Number(t));
        evals.push({ t, stack: [...s2] });
      }
    }
    value = s2[0];
  }
  const maxStack = Math.max(0, ...steps.map((s) => s.stack.length));
  return { ok: true, toks, steps, postfix: out, numeric, evals, value, maxStack };
}

// ───── 循环队列 ─────
export function parseQ(text) {
  const out = [];
  for (const it of seq(text)) {
    if (it === '-') out.push({ op: 'deq' });
    else {
      const m = it.match(/^\+(\S+)$/);
      if (!m) return null;
      out.push({ op: 'enq', x: m[1] });
    }
  }
  return out;
}
export function cqueue({ m, ops }) {
  if (!(Number.isInteger(m) && m >= 3 && m <= 10)) return err('m');
  const list = parseQ(ops);
  if (!list || !list.length || list.length > 20) return err('ops');
  const Q = Array(m).fill(null);
  let front = 0;
  let rear = 0;
  const steps = [];
  for (const o of list) {
    const before = { front, rear };
    let fail = null;
    let x = null;
    if (o.op === 'enq') {
      if ((rear + 1) % m === front) fail = 'full';
      else {
        Q[rear] = o.x;
        rear = (rear + 1) % m;
      }
    } else if (front === rear) fail = 'empty';
    else {
      x = Q[front];
      Q[front] = null;
      front = (front + 1) % m;
    }
    steps.push({ ...o, x: o.x ?? x, fail, before, front, rear, Q: [...Q], len: (rear - front + m) % m });
  }
  return { ok: true, m, steps };
}

// ───── 特殊矩阵压缩 ─────
export function stored(kind, n, i, j) {
  if (kind === 'sym' || kind === 'lower') return i >= j;
  if (kind === 'upper') return i <= j;
  if (kind === 'tri') return Math.abs(i - j) <= 1;
  return false;
}
export function matrix({ kind, n, i, j }) {
  if (!['sym', 'lower', 'upper', 'tri'].includes(kind)) return err('kind');
  if (!(Number.isInteger(n) && n >= 2 && n <= 9)) return err('n');
  if (!(Number.isInteger(i) && Number.isInteger(j) && i >= 1 && j >= 1 && i <= n && j <= n)) return err('ij');
  // 按行优先把要存的元素依次编号
  const order = [];
  for (let r = 1; r <= n; r++) for (let c = 1; c <= n; c++) if (stored(kind, n, r, c)) order.push([r, c]);
  // 对称矩阵的上三角元素去找它的对称元素
  const [ti, tj] = kind === 'sym' && i < j ? [j, i] : [i, j];
  const k = order.findIndex(([r, c]) => r === ti && c === tj);
  // 课本公式（用来对照）
  let formula = null;
  if (kind === 'sym' || kind === 'lower') formula = k >= 0 ? (ti * (ti - 1)) / 2 + tj - 1 : null;
  if (kind === 'upper') formula = k >= 0 ? ((ti - 1) * (2 * n - ti + 2)) / 2 + (tj - ti) : null;
  if (kind === 'tri') formula = k >= 0 ? 2 * ti + tj - 3 : null;
  return { ok: true, kind, n, i, j, ti, tj, order, k, formula, size: order.length + (kind === 'lower' || kind === 'upper' ? 1 : 0) };
}

// ───── 单链表 ─────
export function parseL(text) {
  const out = [];
  for (const it of String(text ?? '').split(/[,，;；\n]+/).map((s) => s.trim()).filter(Boolean)) {
    let m;
    if ((m = it.match(/^ins\s+(\d+)\s+(\S+)$/i))) out.push({ op: 'ins', i: +m[1], x: m[2] });
    else if ((m = it.match(/^del\s+(\d+)$/i))) out.push({ op: 'del', i: +m[1] });
    else if (/^rev$/i.test(it)) out.push({ op: 'rev' });
    else return null;
  }
  return out;
}
export function linked({ init, ops }) {
  const L0 = seq(init);
  if (L0.length > 10) return err('len');
  const list = parseL(ops);
  if (!list || !list.length || list.length > 8) return err('ops');
  let seqId = 0;
  let L = L0.map((v) => ({ id: `l${seqId++}`, v }));
  const steps = [];
  for (const o of list) {
    if (o.op === 'ins') {
      if (o.i < 1 || o.i > L.length + 1 || L.length >= 12) {
        steps.push({ ...o, fail: true, L: [...L] });
        continue;
      }
      const s = { id: `l${seqId++}`, v: o.x };
      const prev = L[o.i - 2]?.id ?? 'head';
      L = [...L.slice(0, o.i - 1), s, ...L.slice(o.i - 1)];
      steps.push({ ...o, sid: s.id, prev, walk: o.i - 1, L: [...L] });
    } else if (o.op === 'del') {
      if (o.i < 1 || o.i > L.length) {
        steps.push({ ...o, fail: true, L: [...L] });
        continue;
      }
      const q = L[o.i - 1];
      const prev = L[o.i - 2]?.id ?? 'head';
      L = L.filter((x) => x !== q);
      steps.push({ ...o, q, prev, walk: o.i - 1, L: [...L] });
    } else {
      // 头插法逆置：依次把原链表的结点摘下来插到头结点后面
      const sub = [];
      let out = [];
      for (const x of L) {
        out = [x, ...out];
        sub.push({ node: x, L: [...out], rest: L.slice(L.indexOf(x) + 1) });
      }
      L = out;
      steps.push({ ...o, sub, L: [...L] });
    }
  }
  return { ok: true, init: L0.map((v, i) => ({ id: `l${i}`, v })), steps, L };
}
