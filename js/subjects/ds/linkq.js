// 链栈与链队的纯计算：每个操作改了哪几个指针、执行了哪几行代码。
//
// 约定（界面上写明）：
//   · 链栈不带头结点，top 指向栈顶结点（就是链表的第一个结点），top == NULL 表示栈空；
//   · 链队可以选带头结点或不带头结点：
//       带头结点：front 指向头结点，rear 指向队尾结点；front == rear 表示队空；
//       不带头结点：front 指向队头结点，rear 指向队尾结点；front == NULL 表示队空；
//   · 操作写法：+x 表示 x 入栈 / 入队，- 表示出栈 / 出队。

import { parseQ } from './linear.js';

const err = (e) => ({ ok: false, errors: [e] });

// 每种操作的代码（行号从 0 开始）；branch 是只有特殊情况才执行的行
export const CODE = {
  push: ['s = new Node(x);', 's->next = top;', 'top = s;'],
  pop: ['if (top == NULL) return 下溢;', 'x = top->data;', 'p = top;', 'top = top->next;', 'free(p);'],
  enqH: ['s = new Node(x); s->next = NULL;', 'rear->next = s;', 'rear = s;'],
  deqH: ['if (front == rear) return 队空;', 'p = front->next; x = p->data;', 'front->next = p->next;', 'if (rear == p) rear = front;', 'free(p);'],
  enqN: ['s = new Node(x); s->next = NULL;', 'if (front == NULL) front = rear = s;', 'else { rear->next = s; rear = s; }'],
  deqN: ['if (front == NULL) return 队空;', 'p = front; x = p->data;', 'front = p->next;', 'if (rear == p) rear = NULL;', 'free(p);'],
};

export function linkSQ({ kind = 'stack', head = true, ops }) {
  const list = parseQ(ops);
  if (!list || !list.length || list.length > 16) return err('ops');
  let id = 0;
  let nodes = []; // 栈：从栈顶到栈底；队列：从队头到队尾
  const steps = [];
  for (const o of list) {
    const before = nodes.map((n) => ({ ...n }));
    const s = { op: o.op, x: o.x ?? null, before };
    if (kind === 'stack') {
      if (o.op === 'enq') {
        const n = { id: `n${id++}`, v: o.x };
        nodes = [n, ...nodes];
        Object.assign(s, { code: 'push', lines: [0, 1, 2], changed: ['next', 'top'], hot: n.id });
      } else if (!nodes.length) Object.assign(s, { code: 'pop', lines: [0], fail: true });
      else {
        const [g, ...rest] = nodes;
        nodes = rest;
        Object.assign(s, { code: 'pop', lines: [0, 1, 2, 3, 4], changed: ['top'], gone: g, x: g.v });
      }
    } else if (o.op === 'enq') {
      const n = { id: `n${id++}`, v: o.x };
      const first = !nodes.length;
      nodes = [...nodes, n];
      if (head) Object.assign(s, { code: 'enqH', lines: [0, 1, 2], changed: ['next', 'rear'], hot: n.id, special: first ? 'firstInH' : null });
      else Object.assign(s, { code: 'enqN', lines: first ? [0, 1] : [0, 2], changed: first ? ['front', 'rear'] : ['next', 'rear'], hot: n.id, special: first ? 'firstIn' : null });
    } else if (!nodes.length) Object.assign(s, { code: head ? 'deqH' : 'deqN', lines: [0], fail: true });
    else {
      const [g, ...rest] = nodes;
      const last = rest.length === 0;
      nodes = rest;
      Object.assign(s, { code: head ? 'deqH' : 'deqN', lines: last ? [0, 1, 2, 3, 4] : [0, 1, 2, 4], changed: last ? (head ? ['next', 'rear'] : ['front', 'rear']) : head ? ['next'] : ['front'], gone: g, x: g.v, special: last ? 'lastOut' : null });
    }
    s.after = nodes.map((n) => ({ ...n }));
    steps.push(s);
  }
  return { ok: true, kind, head: kind === 'queue' ? head : false, steps };
}
