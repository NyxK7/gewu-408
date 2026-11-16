// 「链栈与链队」：结点一个个挂上、摘下，top / front / rear 指针跟着动；右边是这一步执行的代码，
// 执行到的行亮起来。链队里最后一个结点出队时 rear 要回到头结点，这一步特别标出来。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { CODE, linkSQ } from './linkq.js';

const W = [['ds', 'stack']];
const NW = 84; // 每个结点占的宽度
const LX = 120;
const LY = 220;

const PRINCIPLE = {
  sections: [
    {
      id: 'stack',
      title: T('链栈', 'Linked stacks'),
      blocks: [
        { p: T('用单链表实现栈，**栈顶就是链表的第一个结点**：入栈、出栈都在表头进行，不用找表尾，都是 O(1)。通常不带头结点，用 top 指针指向栈顶，top == NULL 表示栈空。', 'A stack as a singly linked list with **the top at the head**: push and pop both work at the head in O(1). Usually no head node; top == NULL means empty.') },
        { p: T('入栈：新结点 s 的 next 指向原来的栈顶，再让 top 指向 s。出栈：先判空，取出 top 的数据，top 往后移一个结点，释放原来的栈顶。', 'Push: s->next = top; top = s. Pop: check empty, take top->data, move top on, free the old top.') },
        { tip: T('链栈只要内存够就不会上溢，也不用预先分配空间；代价是每个结点多一个指针域。', 'A linked stack never overflows while memory lasts and needs no preallocation, at the cost of a pointer per node.') },
      ],
    },
    {
      id: 'queue',
      title: T('链队', 'Linked queues'),
      blocks: [
        { p: T('用单链表实现队列，需要两个指针：**front 指向队头**（出队的一端），**rear 指向队尾**（入队的一端）。入队在表尾插入，出队在表头删除，都是 O(1)。', 'A queue as a linked list with **front** at the head (dequeue end) and **rear** at the tail (enqueue end); both operations are O(1).') },
        {
          table: {
            head: ['', T('带头结点', 'With a head node'), T('不带头结点', 'Without')],
            rows: [
              [T('front 指向', 'front points to'), T('头结点', 'the head node'), T('第一个数据结点', 'the first data node')],
              [T('队空条件', 'Empty when'), 'front == rear', 'front == NULL'],
              [T('第一个结点入队', 'First enqueue'), T('和平常一样：rear->next = s; rear = s', 'as usual'), T('要特殊处理：front = rear = s', 'special: front = rear = s')],
              [T('最后一个结点出队', 'Last dequeue'), T('要特殊处理：rear 改回 front（头结点）', 'special: rear = front'), T('要特殊处理：front、rear 都变成 NULL', 'special: both become NULL')],
            ],
          },
        },
        { warn: T('最后一个结点出队时，rear 原本指向的结点被释放了。如果不把 rear 改回头结点，rear 就成了指向已释放内存的「悬空指针」。', 'When the last node leaves, rear pointed at the freed node; without resetting it, rear dangles.') },
        { tip: T('带头结点的好处：入队、出队对空表和非空表的处理基本一样，代码更统一。', 'A head node makes empty and non-empty cases look alike.') },
      ],
    },
    {
      id: 'compare',
      title: T('四种实现比一比', 'Four implementations'),
      blocks: [
        {
          table: {
            head: ['', T('空间', 'Space'), T('满不满', 'Full?'), T('入 / 出的时间', 'Push / pop'), T('特点', 'Notes')],
            rows: [
              [T('顺序栈', 'Array stack'), T('预先分配一段连续空间', 'preallocated array'), T('会上溢', 'can overflow'), 'O(1)', T('可以共享栈空间（两个栈相向增长）', 'two stacks can share one array')],
              [T('链栈', 'Linked stack'), T('用多少分配多少', 'on demand'), T('一般不满', 'rarely full'), 'O(1)', T('每个结点多一个指针', 'one pointer per node')],
              [T('循环队列', 'Circular queue'), T('预先分配，牺牲一个单元', 'preallocated, one slot spare'), T('会满', 'can be full'), 'O(1)', T('判满判空要靠约定', 'needs a full/empty convention')],
              [T('链队', 'Linked queue'), T('用多少分配多少', 'on demand'), T('一般不满', 'rarely full'), 'O(1)', T('要两个指针，注意最后一个结点出队', 'two pointers; mind the last dequeue')],
            ],
          },
        },
      ],
    },
    pit([
      T('链栈的栈顶在链表头部，不在尾部——放在尾部的话出栈要找前驱，变成 O(n)。', 'The stack top is the list head; at the tail, popping would need the predecessor, O(n).'),
      T('带头结点的链队判空是 front == rear，不是 front == NULL（front 永远指向头结点）。', 'With a head node, empty means front == rear; front is never NULL.'),
      T('出队前一定先判空。', 'Always check for empty before removing.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('链队（带头结点），最后一个结点出队', 'Queue with head node, last dequeue'), set: { kind: 'queue', head: true, ops: '+a +b - +c - - -' } },
    { label: T('链队（不带头结点）', 'Queue without head node'), set: { kind: 'queue', head: false, ops: '+a +b - - +c' } },
    { label: T('链栈', 'Linked stack'), set: { kind: 'stack', head: true, ops: '+a +b +c - +d - - - -' } },
  ],
  groups: [{ legend: T('结构和操作', 'Structure and operations'), fields: [
    { name: 'kind', label: T('结构', 'Structure'), type: 'select', options: [['queue', T('链队', 'Linked queue')], ['stack', T('链栈', 'Linked stack')]] },
    { name: 'head', label: T('链队带头结点', 'Queue has a head node'), type: 'check', show: (p) => p.kind === 'queue' },
    { name: 'ops', label: T('操作：+x 入，- 出', 'Operations: +x in, - out'), type: 'text', wide: true },
  ] }],
  note: T('链栈不带头结点，top 指向栈顶结点；链队的 front 指向队头（带头结点时指向头结点），rear 指向队尾结点。', 'The stack has no head node; front/rear point to the head (or head node) and tail.'),
};
const ERR = { ops: T('操作写成 +x 或 -，最多 16 个', 'Use +x or -, at most 16') };

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : null;
  const nodes = s ? s.after : [];
  const stack = sim.kind === 'stack';
  const hasHead = sim.head;
  const ch = new Set(s?.changed ?? []);
  const off = hasHead ? 1 : 0;
  const xOf = (i) => LX + (i + off) * NW;
  let arr = '';
  if (hasHead) items.push({ k: 'hd', x: LX, y: LY, html: cell(56, 36, z ? '头' : 'H', { tone: 'slate', size: 13 }) + `<g transform="translate(36 0)">${cell(20, 36, '', { cls: 'dim' })}</g>` });
  nodes.forEach((n, i) => items.push({ k: `n-${n.id}`, x: xOf(i), y: LY, from: [xOf(i), LY + (stack ? -70 : 70)], html: `${cell(36, 36, n.v, { tone: n.id === s?.hot ? 'orange' : 'teal', size: 15, cls: n.id === s?.hot ? 'hot' : '' })}<g transform="translate(36 0)">${cell(20, 36, '', { cls: 'dim' })}</g>` }));
  // next 指针
  const count = nodes.length + off;
  for (let i = 0; i < count - 1; i++) {
    const hot = ch.has('next') && ((s.op === 'enq' && (stack ? i === 0 : i === count - 2)) || (s.op === 'deq' && hasHead && i === 0));
    arr += arrow(LX + i * NW + 50, LY + 18, LX + (i + 1) * NW - 2, LY + 18, hot ? 'acc' : '');
  }
  arr += count ? txt(LX + (count - 1) * NW + 64, LY + 24, '∧', 'll-nil', 'start') : '';
  items.push({ k: 'arrows', x: 0, y: 0, html: arr });
  // top / front / rear
  const ptr = (name, i, below) => {
    const x = LX + i * NW + 18;
    const hot = ch.has(name);
    const y1 = below ? LY + 92 : LY - 56;
    const y2 = below ? LY + 40 : LY - 4;
    return arrow(x, y1, x, y2, hot ? 'acc' : 'ok') + txt(x, below ? y1 + 16 : y1 - 6, name, `lq-ptr ${hot ? 'hot' : ''}`);
  };
  let p = '';
  if (stack) p += nodes.length ? ptr('top', 0, false) : txt(LX, LY - 30, 'top = NULL', 'lq-ptr', 'start');
  else if (hasHead) {
    p += ptr('front', 0, false);
    p += ptr('rear', nodes.length, true);
  } else if (nodes.length) {
    p += ptr('front', 0, false);
    p += ptr('rear', nodes.length - 1, true);
  } else p += txt(LX, LY - 30, 'front = rear = NULL', 'lq-ptr', 'start');
  items.push({ k: 'ptrs', x: 0, y: 0, html: p });
  // 被摘下的结点放到链表右边，淡出
  if (s?.gone) items.push({ k: `n-${s.gone.id}`, x: LX + (count + 1) * NW + 30, y: LY, o: 0.55, html: cell(36, 36, s.gone.v, { cls: 'bad', size: 15 }) + txt(18, 56, z ? '释放' : 'freed', 'bt-cap') });
  // 代码
  if (s) {
    const code = CODE[s.code];
    const on = new Set(s.lines);
    let c = txt(0, -14, z ? '这一步执行的代码' : 'Code run this step', 'bt-cap', 'start');
    code.forEach((ln, i) => {
      const special = (s.special === 'lastOut' && i === 3) || (s.special === 'firstIn' && i === 1);
      c += `<g transform="translate(0 ${i * 28})"><rect class="lq-line ${on.has(i) ? (special ? 'sp' : 'on') : ''}" x="-8" y="-2" width="330" height="24" rx="4"/>${txt(0, 15, z ? ln : ln.replace('下溢', 'underflow').replace('队空', 'empty'), `lq-code ${on.has(i) ? 'on' : ''}`, 'start')}</g>`;
    });
    items.push({ k: `code`, x: LX, y: LY + 210, html: c });
  }
  return items;
}

function build(p, kit, ERR) {
  const sim = linkSQ({ kind: p.kind, head: !!p.head, ops: p.ops });
  const stack = p.kind === 'stack';
  const lesson = shell('linked-sq', kit, ERR, sim, {
    where: W,
    tag: T('链式', 'Link'),
    name: T('链栈与链队', 'Linked stacks and queues'),
    full: T('链栈的入栈出栈 · 链队的 front 与 rear · 带不带头结点 · 最后一个结点出队 · 四种实现对比', 'Push and pop · front and rear · head node or not · the last dequeue · four implementations'),
    title: stack ? T('链栈', 'Linked stack') : T(`链队（${p.head ? '带' : '不带'}头结点）`, `Linked queue (${p.head ? 'with' : 'without'} head node)`),
    legend: [['orange', T('刚挂上的结点', 'New node')], ['rose', T('被摘下释放的结点', 'Freed node')]],
    principle: PRINCIPLE,
    desc: T('栈和队列也可以用链表实现。这节课一步步挂上、摘下结点，看 top、front、rear 这几个指针怎么跟着改，右边列出这一步执行的代码。特别留意链队里最后一个结点出队的那一步：rear 必须改回来。', 'Stacks and queues on linked lists: watch top, front and rear move with each node added or removed, alongside the code that runs. Note the last dequeue, where rear must be reset.'),
    rect: [20, 110, LX + Math.max(6, (sim.ok ? Math.max(...sim.steps.map((x) => x.after.length + 1)) : 4) + (sim.head ? 1 : 0) + 2) * NW, LY + 210 + 5 * 28 + 30],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => {
    let title;
    let detail;
    let ref = stack ? 'stack' : 'queue';
    if (s.fail) {
      title = stack ? T('出栈：栈空', 'Pop: empty') : T('出队：队空', 'Dequeue: empty');
      detail = stack ? T('top == NULL，栈里没有元素，出栈失败（下溢）。', 'top == NULL: underflow.') : sim.head ? T('front == rear，只剩头结点，队列是空的，出队失败。', 'front == rear: empty.') : T('front == NULL，队列是空的，出队失败。', 'front == NULL: empty.');
    } else if (stack && s.op === 'enq') {
      title = T(`${s.x} 入栈`, `Push ${s.x}`);
      detail = T(`新结点 ${s.x} 的 next 指向原来的栈顶${s.before.length ? ` ${s.before[0].v}` : '（NULL）'}，再让 top 指向它。新结点就在链表的最前面。`, `s->next = old top; top = s.`);
    } else if (stack) {
      title = T(`${s.x} 出栈`, `Pop ${s.x}`);
      detail = T(`取出栈顶 ${s.x}，top 后移到 ${s.after[0]?.v ?? 'NULL'}，释放原来的栈顶结点。`, `Take ${s.x}; top moves to ${s.after[0]?.v ?? 'NULL'}; free the old top.`);
    } else if (s.op === 'enq') {
      title = T(`${s.x} 入队`, `Enqueue ${s.x}`);
      detail = s.special === 'firstIn'
        ? T(`队列原来是空的（front == NULL），新结点 ${s.x} 既是队头也是队尾：front = rear = s。这是不带头结点时要特殊处理的情况。`, `Empty queue without a head node: front = rear = s.`)
        : T(`新结点 ${s.x} 的 next 置 NULL，挂在 rear 所指结点${sim.head && s.before.length === 0 ? '（头结点）' : ''}的后面，rear 再指向它。`, `rear->next = s; rear = s.`);
    } else {
      title = s.special === 'lastOut' ? T(`${s.x} 出队：最后一个结点`, `Dequeue ${s.x}: the last node`) : T(`${s.x} 出队`, `Dequeue ${s.x}`);
      detail = s.special === 'lastOut'
        ? sim.head
          ? T(`p 指向队头结点 ${s.x}，头结点的 next 改成 p->next（NULL）。p 正好也是 rear 指的结点：如果直接释放，rear 就悬空了，所以要先把 rear 改回 front（头结点），队列变空。`, `p is also rear: reset rear = front before freeing.`)
          : T(`p 指向 ${s.x}，front 改成 p->next（NULL）。p 也是 rear 指的结点，rear 也要改成 NULL，队列变空。`, `p is also rear: set rear = NULL too.`)
        : sim.head
          ? T(`p = front->next 指向队头结点 ${s.x}，取出数据，头结点的 next 改指 ${s.after[0].v}，释放 p。rear 不用动。`, `Unlink ${s.x} after the head node; rear unchanged.`)
          : T(`p = front 指向 ${s.x}，取出数据，front 后移到 ${s.after[0].v}，释放 p。`, `front moves on to ${s.after[0].v}; free p.`);
      if (s.special === 'lastOut') ref = 'queue';
    }
    const opName = stack ? (s.op === 'enq' ? T(`把 ${s.x} 入栈`, `push ${s.x}`) : T('出栈', 'pop')) : s.op === 'enq' ? T(`把 ${s.x} 入队`, `enqueue ${s.x}`) : T('出队', 'dequeue');
    return { title, desc: opName, detail, ref, st: { k }, row: { color: s.fail ? 'slate' : s.special ? 'amber' : s.op === 'enq' ? 'teal' : 'rose', what: s.op === 'enq' ? `+${s.x}` : '−', result: s.fail ? T('失败', 'fail') : T(`${s.after.length} 个`, `${s.after.length}`), tone: s.special ? 'warn' : 'info' } };
  });
  const last = sim.steps.at(-1).after;
  return finish(lesson, list, (st, z) => board(sim, st, z), T(`最后剩 ${last.length} 个结点`, `${last.length} node(s) left`), stack ? T('换成链队，看 front 和 rear 怎么配合。', 'Switch to a queue to see front and rear.') : T(`切换「带头结点」再走一遍，比较两种写法在第一个结点入队、最后一个结点出队时的不同。`, 'Toggle the head node and compare the first enqueue and last dequeue.'));
}

export const makeLinkedSQ = make('linked-sq', SPEC, ERR, build);
