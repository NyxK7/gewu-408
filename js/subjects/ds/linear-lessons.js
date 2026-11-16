// 线性表、栈和队列、数组的五节课：出栈序列、中缀转后缀、循环队列、特殊矩阵压缩、单链表。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { arrow, cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { cqueue, infix, linked, matrix, parseL, parseQ, stackSeq, stored, tokenize } from './linear.js';

const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
function make(id, spec, ERR, build) {
  const kit = stepKit({ spec, rowsName: T('过程', 'Steps') });
  return () => parametric(id, spec.presets[0].set, (p) => build(p, kit, ERR));
}
function shell(id, kit, ERR, sim, o) {
  return { id, kit, where: o.where, tag: o.tag, name: o.name, full: o.full, title: o.title, nodes: [], legend: o.legend, principle: o.principle, sim, errors: sim.ok ? [] : errOf(ERR, sim.errors), overview: { desc: o.desc, facts: [] }, start: { nodes: [], frame: { rect: o.rect ?? [0, 40, 900, 520] }, events: [] }, steps: [], outro: { title: '', text: '', facts: [] } };
}
function finish(lesson, list, board, title, text, facts = []) {
  const b = toSteps(list, board);
  lesson.steps = b.steps;
  lesson.start.events = b.start;
  lesson.outro = { title, text, facts };
  return lesson;
}
const rowOf = (vals, x0, y, cls = () => ({}), w = 40) => vals.map((v, i) => `<g transform="translate(${x0 + i * w} ${y})">${cell(w - 6, 30, String(v), { size: 13, ...cls(i, v) })}</g>`).join('');
const stackHtml = (vals, { w = 52, h = 30, tone = 'violet', label } = {}) => {
  let s = `<path class="sk-wall" d="M-4,${-h * 6 - 6} L-4,4 L${w + 4},4 L${w + 4},${-h * 6 - 6}"/>`;
  vals.forEach((v, i) => (s += `<g transform="translate(0 ${-(i + 1) * h})">${cell(w, h - 4, String(v), { tone, size: 13, cls: i === vals.length - 1 ? 'hot' : '' })}</g>`));
  if (label) s += txt(w / 2, 24, label, 'bt-cap');
  return s;
};

// ═════════════════════════ 出栈序列 ═════════════════════════

const STACK_PRINCIPLE = {
  sections: [
    {
      id: 'stack',
      title: T('栈', 'Stacks'),
      blocks: [
        { p: T('**栈**只允许在一端（栈顶）插入和删除，后进先出（LIFO）。顺序栈用数组和栈顶指针 top 实现；链栈用单链表，表头作栈顶。共享栈：两个栈共用一个数组，栈底分别在两端，top1 + 1 = top2 时栈满。', 'A **stack** is LIFO at its top. Array stacks use a top index; linked stacks push at the head; two stacks can share one array from both ends.') },
      ],
    },
    {
      id: 'seq',
      title: T('判断出栈序列', 'Valid pop sequences'),
      blocks: [
        { p: T('入栈次序固定，出栈可以穿插在入栈之间。判断一个出栈序列是否可能：按序列依次要出的元素，若它不在栈顶，就继续把后面的元素入栈，直到它出现在栈顶；如果全都入栈了它还不在栈顶（被压在下面），这个序列就不可能。', 'Simulate: push until the wanted element is on top; if everything is pushed and it is still buried, the sequence is impossible.') },
        { tip: T('快速判断：出栈序列中，任一元素后面比它先入栈的元素，必须按入栈的逆序出现。例：入栈 1 2 3，出栈 3 1 2 不可能——3 后面的 1、2 都比 3 先入栈，却没有按 2、1 的顺序出现。', 'Shortcut: after any element, the earlier-pushed elements must come out in reverse push order; 3 1 2 fails.') },
        { formula: T('n 个不同元素的不同出栈序列数 = 卡特兰数 C(2n, n) / (n + 1)', 'number of pop orders = Catalan number C(2n, n)/(n + 1)') },
      ],
    },
    {
      id: 'use',
      title: T('栈的应用', 'Applications'),
      blocks: [
        { list: [T('括号匹配：左括号入栈，遇到右括号就弹出看是否配对。', 'Bracket matching.'), T('表达式求值（中缀转后缀、后缀求值）。', 'Expression evaluation.'), T('递归：每层调用的信息存在递归工作栈里，递归深度就是栈的大小。', 'Recursion uses a call stack.')] },
      ],
    },
    pit([
      T('入栈顺序不变，出栈可以随时进行。', 'Push order is fixed; pops may interleave.'),
      T('卡特兰数 n = 3 是 5，n = 4 是 14，n = 5 是 42。', 'Catalan: 5, 14, 42 for n = 3, 4, 5.'),
    ]),
  ],
};
const SS_SPEC = {
  presets: [
    { label: T('可能的序列', 'A valid sequence'), set: { push: '1 2 3 4 5', pop: '3 2 5 4 1' } },
    { label: T('不可能的序列', 'An impossible one'), set: { push: '1 2 3 4 5', pop: '4 3 5 1 2' } },
    { label: T('a b c d', 'a b c d'), set: { push: 'a b c d', pop: 'b d c a' } },
  ],
  groups: [{ legend: T('序列', 'Sequences'), fields: [
    { name: 'push', label: T('入栈次序', 'Push order'), type: 'text', wide: true },
    { name: 'pop', label: T('要判断的出栈序列', 'Pop sequence to check'), type: 'text', wide: true },
  ] }],
  note: T('元素互不相同，空格隔开，最多 10 个。', 'Distinct elements, up to 10.'),
};
const SS_ERR = { len: T('元素要有 1～10 个', 'Give 1–10 elements'), dup: T('元素不能重复', 'Elements must be distinct'), mismatch: T('两个序列的元素要一样', 'Both sequences need the same elements') };
function ssBoard(sim, k, z) {
  const s = k >= 0 ? sim.steps[k] : null;
  const stack = s ? s.stack : [];
  const pushed = s ? sim.steps.slice(0, k + 1).filter((x) => x.op === 'push').length : 0;
  const popped = s ? sim.steps.slice(0, k + 1).filter((x) => x.op === 'pop').map((x) => x.v) : [];
  const items = [];
  items.push({ k: 'in', x: 120, y: 110, html: txt(-14, 20, z ? '待入栈' : 'To push', 'bt-cap', 'end') + rowOf(sim.push, 0, 0, (i) => ({ cls: i < pushed ? 'dim' : '', tone: i < pushed ? '' : 'blue' })) });
  items.push({ k: 'st', x: 200, y: 420, html: stackHtml(stack, { label: z ? '栈' : 'stack' }) });
  items.push({ k: 'out', x: 400, y: 250, html: txt(0, -10, z ? '要求的出栈序列' : 'Required pops', 'bt-cap', 'start') + rowOf(sim.pop, 0, 0, (i) => ({ tone: i < popped.length ? 'green' : '', cls: s && s.want === sim.pop[i] && s.op !== 'pop' ? (s.op === 'fail' ? 'bad' : 'hot') : '' })) });
  if (s?.op === 'fail') items.push({ k: 'msg', x: 400, y: 330, html: txt(0, 0, z ? `要出 ${s.want}，可栈顶是 ${s.top}，${s.want} 被压在下面——不可能` : `Need ${s.want} but ${s.top} is on top: impossible`, 'sk-bad', 'start') });
  return items;
}
function buildSs(p, kit, ERR) {
  const sim = stackSeq(p);
  const lesson = shell('stack-seq', kit, ERR, sim, {
    where: [['ds', 'stack']],
    tag: T('栈', 'Stk'),
    name: T('栈：出栈序列是否可能', 'Stacks: possible pop orders'),
    full: T('后进先出 · 模拟判断 · 卡特兰数 · 栈的应用', 'LIFO · simulation · Catalan numbers · applications'),
    title: sim.ok ? T(`${sim.push.length} 个元素`, `${sim.push.length} elements`) : T('参数有误', 'Invalid parameters'),
    legend: [['blue', T('还没入栈', 'Not pushed')], ['green', T('已经出栈', 'Popped')]],
    principle: STACK_PRINCIPLE,
    desc: T('入栈次序固定，问某个出栈序列可不可能。做法是照着要求的序列模拟：要出的元素不在栈顶，就继续入栈；全入栈了它还被压在下面，就不可能。', 'Simulate the required pops: push until the wanted element is on top; if it stays buried, the order is impossible.'),
    rect: [40, 70, 400 + (sim.ok ? sim.push.length : 5) * 40 + 40, 440],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => ({
    title: s.op === 'push' ? T(`${s.v} 入栈`, `Push ${s.v}`) : s.op === 'pop' ? T(`${s.v} 出栈`, `Pop ${s.v}`) : T(`要出 ${s.want}：不可能`, `Need ${s.want}: impossible`),
    desc: T(`栈：${s.stack.join(' ') || '空'}`, `Stack: ${s.stack.join(' ') || 'empty'}`),
    detail: s.op === 'push' ? T(`下一个要出的是 ${s.want}，还不在栈顶，把 ${s.v} 入栈。`, `${s.want} is not on top yet; push ${s.v}.`) : s.op === 'pop' ? T(`${s.v} 正好在栈顶，出栈。`, `${s.v} is on top: pop.`) : T(`所有元素都入过栈了，栈顶是 ${s.top}，而 ${s.want} 在它下面，不能先出来。这个出栈序列不可能。`, `${s.want} is buried under ${s.top}: impossible.`),
    ref: s.op === 'fail' ? 'seq' : 'seq',
    row: { color: s.op === 'push' ? 'blue' : s.op === 'pop' ? 'green' : 'rose', what: s.op === 'push' ? `push ${s.v}` : s.op === 'pop' ? `pop ${s.v}` : T('不可能', 'impossible'), result: s.stack.join(' ') || '∅', tone: s.op === 'fail' ? 'warn' : 'info' },
  }));
  return finish(lesson, list, (k, z) => ssBoard(sim, k, z), sim.valid ? T('这个出栈序列可能', 'Possible') : T('这个出栈序列不可能', 'Impossible'), T(`${sim.push.length} 个元素一共有 ${sim.total} 种可能的出栈序列（卡特兰数）。`, `${sim.push.length} elements allow ${sim.total} pop orders (Catalan).`));
}
export const makeStackSeq = make('stack-seq', SS_SPEC, SS_ERR, buildSs);

// ═════════════════════════ 中缀转后缀 ═════════════════════════

const INFIX_PRINCIPLE = {
  sections: [
    {
      id: 'forms',
      title: T('三种表达式', 'Three notations'),
      blocks: [
        { p: T('中缀 a + b × c；后缀（逆波兰）a b c × +；前缀（波兰）+ a × b c。后缀和前缀表达式不需要括号，运算次序完全由位置决定，计算机求值时只用一个栈。', 'Infix a + b × c; postfix a b c × +; prefix + a × b c. Postfix and prefix need no parentheses and evaluate with one stack.') },
        { tip: T('手算后缀表达式：按运算次序给每个运算加上括号，再把运算符移到对应括号的后面，去掉括号。', 'By hand: fully parenthesise, move each operator after its parentheses, drop them.') },
      ],
    },
    {
      id: 'conv',
      title: T('中缀转后缀（用运算符栈）', 'Infix to postfix'),
      blocks: [
        {
          steps: [
            T('遇到操作数：直接输出；', 'operand: output it;'),
            T('遇到 (：入栈；', '(: push;'),
            T('遇到 )：依次弹出栈中的运算符并输出，直到弹出 (（括号不输出）；', '): pop and output until (;'),
            T('遇到运算符：依次弹出栈中优先级**大于或等于**它的运算符并输出（遇到 ( 或栈空停止），再把它入栈；', 'operator: pop and output operators of **greater or equal** precedence (stop at ( or empty), then push;'),
            T('扫描完后，把栈中剩下的运算符依次弹出输出。', 'finally pop the rest.'),
          ],
        },
      ],
    },
    {
      id: 'eval',
      title: T('后缀表达式求值（用操作数栈）', 'Evaluating postfix'),
      blocks: [
        { p: T('从左往右扫描：操作数入栈；遇到运算符就弹出两个操作数——**先弹出的是右操作数**，后弹出的是左操作数——计算后把结果入栈。最后栈里剩下的就是结果。', 'Push operands; on an operator pop two — **the first popped is the right operand** — and push the result.') },
      ],
    },
    pit([
      T('同级运算符（如两个减号）要先弹出栈里的，保证从左往右计算。', 'Equal precedence pops first, keeping left-to-right order.'),
      T('求值时弹出的第一个数是右操作数，减法、除法别弄反。', 'The first pop is the right operand.'),
      T('题目常问「转换过程中栈里最多有几个运算符」。', 'Exams ask for the maximum stack depth.'),
    ]),
  ],
};
const IN_SPEC = {
  presets: [
    { label: T('带数字，能求值', 'Numeric'), set: { expr: '3+4*(5-2)-8/2' } },
    { label: T('字母表达式', 'Symbolic'), set: { expr: 'a+b*(c-d)-e/f' } },
    { label: T('括号嵌套', 'Nested parentheses'), set: { expr: '((a+b)*c-d)/(e-f)' } },
  ],
  groups: [{ legend: T('中缀表达式', 'Infix expression'), fields: [{ name: 'expr', label: T('运算符只用 + - * / 和括号；操作数是整数或一个字母', 'Use + - * / and parentheses; operands are integers or single letters'), type: 'text', wide: true, parse: (s) => (tokenize(s) ? s : NaN) }] }],
  note: T('* 和 / 优先级高于 + 和 -；同级从左往右。表达式全是数字时会接着演示后缀求值。', '* and / bind tighter; equal precedence goes left to right. Numeric expressions are also evaluated.'),
};
const IN_ERR = { expr: T('表达式写得不对', 'Malformed expression'), paren: T('括号不配对', 'Unbalanced parentheses') };
function inBoard(sim, st, z) {
  const items = [];
  if (st.phase === 'eval') {
    const e = sim.evals[st.k];
    items.push({ k: 'pf', x: 120, y: 110, html: txt(-14, 20, z ? '后缀' : 'Postfix', 'bt-cap', 'end') + rowOf(sim.postfix, 0, 0, (i) => ({ cls: i === st.k ? 'hot' : i < st.k ? 'dim' : '' }), 38) });
    items.push({ k: 'st', x: 200, y: 440, html: stackHtml(e.stack.map((v) => +v.toFixed(4)), { tone: 'blue', label: z ? '操作数栈' : 'operand stack' }) });
    if (e.r != null) items.push({ k: 'calc', x: 330, y: 300, html: txt(0, 0, `${+e.a.toFixed(4)} ${e.t} ${+e.b.toFixed(4)} = ${+e.r.toFixed(4)}`, 'bt-formula cur', 'start') + txt(0, 26, z ? `先弹出 ${+e.b.toFixed(4)}（右），再弹出 ${+e.a.toFixed(4)}（左）` : `pop ${+e.b.toFixed(4)} (right), then ${+e.a.toFixed(4)} (left)`, 'bt-cap', 'start') });
    return items;
  }
  const s = st.k >= 0 ? sim.steps[st.k] : null;
  const idx = s ? sim.toks.slice(0, st.k + 1).length - 1 : -1;
  items.push({ k: 'in', x: 120, y: 110, html: txt(-14, 20, z ? '中缀' : 'Infix', 'bt-cap', 'end') + rowOf(sim.toks, 0, 0, (i) => ({ cls: s && s.t != null && i === idx ? 'hot' : i < idx || (s && s.t == null) ? 'dim' : '' }), 36) });
  items.push({ k: 'st', x: 200, y: 440, html: stackHtml(s ? s.stack : [], { label: z ? '运算符栈' : 'operator stack' }) });
  items.push({ k: 'out', x: 330, y: 240, html: txt(0, -10, z ? '输出（后缀）' : 'Output (postfix)', 'bt-cap', 'start') + rowOf(s ? s.out : [], 0, 0, (i, v) => ({ tone: 'green', cls: s && i >= s.out.length - s.popped.length - (s.kind === 'num' ? 1 : 0) ? 'hot' : '' }), 36) });
  return items;
}
function buildIn(p, kit, ERR) {
  const sim = infix(p);
  const lesson = shell('infix', kit, ERR, sim, {
    where: [['ds', 'stack']],
    tag: T('表达', 'Expr'),
    name: T('栈的应用：中缀转后缀与求值', 'Infix to postfix and evaluation'),
    full: T('前缀 / 中缀 / 后缀 · 运算符栈 · 优先级 · 操作数栈求值', 'Prefix / infix / postfix · operator stack · precedence · evaluation'),
    title: sim.ok ? T(p.expr, p.expr) : T('参数有误', 'Invalid parameters'),
    legend: [['violet', T('运算符栈', 'Operator stack')], ['green', T('输出', 'Output')]],
    principle: INFIX_PRINCIPLE,
    desc: T('一个个扫描中缀表达式：操作数直接输出，运算符要先和栈顶比优先级，括号控制出栈的时机。得到后缀表达式后，再用一个操作数栈算出结果。', 'Scan the infix tokens: operands go out, operators wait on a stack by precedence, parentheses control popping; then evaluate the postfix with an operand stack.'),
    rect: [40, 70, 330 + Math.max(sim.ok ? sim.toks.length : 10, 10) * 36 + 40, 460],
  });
  if (!sim.ok) return lesson;
  const PR = (o) => (o === '*' || o === '/' ? T('高', 'high') : T('低', 'low'));
  const list = sim.steps.map((s, k) => {
    const pop = s.popped.join(' ');
    const D = {
      num: T(`${s.t} 是操作数，直接输出。`, `${s.t} is an operand: output.`),
      lp: T('左括号直接入栈，它会挡住前面的运算符。', '( is pushed; it shields earlier operators.'),
      rp: T(`右括号：弹出 ${pop || '（没有运算符）'} 直到左括号，括号丢掉。`, `): pop ${pop || 'nothing'} up to (.`),
      op: T(`${s.t} 的优先级${PR(s.t).zh}。${pop ? `栈顶的 ${pop} 优先级不低于它，先弹出输出，` : '栈顶没有优先级不低于它的运算符，'}然后 ${s.t} 入栈。`, `${pop ? `Pop ${pop} (≥ precedence), then ` : ''}push ${s.t}.`),
      end: T(`扫描完了，把栈里剩下的 ${pop} 依次弹出输出。`, `Done scanning: pop ${pop}.`),
    }[s.kind];
    return { title: s.t == null ? T('弹出剩下的运算符', 'Pop the rest') : T(`读到 ${s.t}`, `Read ${s.t}`), desc: T(`输出 ${s.out.join(' ')}`, `Output ${s.out.join(' ')}`), detail: D, ref: 'conv', st: { k }, row: { color: s.kind === 'num' ? 'green' : 'violet', what: s.t ?? T('结束', 'end'), result: s.stack.join(' ') || '∅', tone: 'info', info: T(`输出 ${s.out.join(' ')}`, `out ${s.out.join(' ')}`) } };
  });
  if (sim.numeric) sim.evals.forEach((e, k) => list.push({ title: e.r == null ? T(`后缀求值：${e.t} 入栈`, `Evaluate: push ${e.t}`) : T(`后缀求值：${+e.a.toFixed(4)} ${e.t} ${+e.b.toFixed(4)} = ${+e.r.toFixed(4)}`, `Evaluate: ${+e.r.toFixed(4)}`), desc: T(`栈 ${e.stack.map((v) => +v.toFixed(4)).join(' ')}`, `Stack ${e.stack.map((v) => +v.toFixed(4)).join(' ')}`), detail: e.r == null ? T('操作数入栈。', 'Push the operand.') : T(`遇到 ${e.t}：弹出 ${+e.b.toFixed(4)} 作右操作数、${+e.a.toFixed(4)} 作左操作数，结果 ${+e.r.toFixed(4)} 入栈。`, `Pop ${+e.b.toFixed(4)} (right) and ${+e.a.toFixed(4)} (left); push ${+e.r.toFixed(4)}.`), ref: 'eval', st: { phase: 'eval', k }, row: { color: 'blue', what: String(e.t), result: e.stack.map((v) => +v.toFixed(4)).join(' '), tone: 'info' } }));
  return finish(lesson, list, (k, z) => inBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), T(`后缀：${sim.postfix.join(' ')}`, `Postfix: ${sim.postfix.join(' ')}`), sim.numeric ? T(`结果 ${+sim.value.toFixed(4)}。转换时运算符栈里最多同时有 ${sim.maxStack} 个元素。`, `Value ${+sim.value.toFixed(4)}; the operator stack peaked at ${sim.maxStack}.`) : T(`转换时运算符栈里最多同时有 ${sim.maxStack} 个元素。`, `The operator stack peaked at ${sim.maxStack}.`));
}
export const makeInfix = make('infix', IN_SPEC, IN_ERR, buildIn);

// ═════════════════════════ 循环队列 ═════════════════════════

const Q_PRINCIPLE = {
  sections: [
    {
      id: 'queue',
      title: T('队列', 'Queues'),
      blocks: [
        { p: T('**队列**只允许在一端（队尾）插入、另一端（队头）删除，先进先出（FIFO）。顺序队列出队后前面的空间用不上（假溢出），所以把数组看成一个环：**循环队列**。', 'A **queue** is FIFO. A plain array queue wastes space after dequeues (false overflow), so the array is treated as a ring: the **circular queue**.') },
        {
          list: [
            T('入队：Q[rear] = x，rear = (rear + 1) % m；', 'enqueue: Q[rear] = x, rear = (rear + 1) % m;'),
            T('出队：x = Q[front]，front = (front + 1) % m。', 'dequeue: x = Q[front], front = (front + 1) % m.'),
          ],
        },
      ],
    },
    {
      id: 'full',
      title: T('队空和队满怎么区分', 'Telling empty from full'),
      blocks: [
        { p: T('如果 m 个单元全用上，队空和队满时都是 front == rear，分不清。常用办法：', 'Using all m slots makes empty and full both front == rear. Common fixes:') },
        {
          table: {
            head: [T('办法', 'Method'), T('队空', 'Empty'), T('队满', 'Full')],
            rows: [
              [T('牺牲一个单元（最常用）', 'waste one slot (usual)'), 'front == rear', '(rear + 1) % m == front'],
              [T('增设 size 记元素个数', 'keep a size'), 'size == 0', 'size == m'],
              [T('增设 tag 记最近一次是入队还是出队', 'keep a tag of the last op'), T('front == rear 且最近是出队', 'equal after a dequeue'), T('front == rear 且最近是入队', 'equal after an enqueue')],
            ],
          },
        },
        { formula: T('元素个数 = (rear − front + m) % m', 'length = (rear − front + m) % m') },
      ],
    },
    {
      id: 'kinds',
      title: T('其他队列', 'Other queues'),
      blocks: [
        { p: T('**链队列**：带队头、队尾指针的单链表，不会满。**双端队列**：两端都能入队出队；输入受限（只有一端能入）、输出受限（只有一端能出）的双端队列常考「哪些输出序列能得到」。', '**Linked queues** never fill. **Deques** allow both ends; input- or output-restricted deques are classic exam material.') },
      ],
    },
    pit([
      T('题目里 rear 可能指队尾元素本身，公式要相应改，先看清定义。', 'Some books point rear at the last element; read the definition.'),
      T('牺牲一个单元时，最多只能放 m − 1 个元素。', 'With a wasted slot, capacity is m − 1.'),
    ]),
  ],
};
const Q_SPEC = {
  presets: [
    { label: T('队满和绕回', 'Full and wrap-around'), set: { m: 5, ops: '+a +b +c +d +e - - +e +f' } },
    { label: T('队空时出队', 'Dequeue when empty'), set: { m: 4, ops: '+a - - +b +c' } },
  ],
  groups: [{ legend: T('循环队列', 'Circular queue'), fields: [
    { name: 'm', label: T('数组大小 m', 'Array size m'), type: 'int', min: 3, max: 10 },
    { name: 'ops', label: T('+x 入队，- 出队，空格隔开', '+x enqueue, - dequeue'), type: 'text', wide: true, parse: (s) => (parseQ(s) ? s : NaN) },
  ] }],
  note: T('front 指队头元素，rear 指队尾元素的下一个位置；牺牲一个单元，最多放 m − 1 个。', 'front at the head, rear one past the tail; one slot is wasted.'),
};
const Q_ERR = { m: T('m 在 3～10', 'm must be 3–10'), ops: T('操作写错了', 'Invalid operations') };
// 画法：循环队列画成真正的一个环。front 从里面指、rear 从外面指，绕回 0 就是环上自然地走过去；
// 队满时留空的那一格用虚线标出来。下面再画一条「数组里实际是这样」的直条，对照下标。
function qBoard(sim, k, z) {
  const s = k >= 0 ? sim.steps[k] : null;
  const Q = s ? s.Q : Array(sim.m).fill(null);
  const f = s ? s.front : 0;
  const r = s ? s.rear : 0;
  const m = sim.m;
  const CX = 330;
  const CY = 250;
  const R1 = 62;
  const R2 = 132;
  const ang = (i) => ((-90 + (i * 360) / m) * Math.PI) / 180;
  const pt = (R, a) => [CX + R * Math.cos(a), CY + R * Math.sin(a)];
  const full = (r + 1) % m === f;
  let h = '';
  for (let i = 0; i < m; i++) {
    const a0 = ang(i) + 0.03;
    const a1 = ang(i + 1) - 0.03;
    const [x0, y0] = pt(R2, a0);
    const [x1, y1] = pt(R2, a1);
    const [x2, y2] = pt(R1, a1);
    const [x3, y3] = pt(R1, a0);
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const cls = Q[i] != null ? 'on' : full && i === r ? 'gap' : '';
    h += `<path class="cq-seg ${cls}" d="M${x0} ${y0} A${R2} ${R2} 0 ${big} 1 ${x1} ${y1} L${x2} ${y2} A${R1} ${R1} 0 ${big} 0 ${x3} ${y3} Z"/>`;
    const am = (ang(i) + ang(i + 1)) / 2;
    const [vx, vy] = pt((R1 + R2) / 2, am);
    if (Q[i] != null) h += txt(vx, vy + 6, String(Q[i]), 'cq-v');
    else if (full && i === r) h += txt(vx, vy + 4, z ? '留空' : 'spare', 'cq-gap');
    const [ix, iy] = pt(R2 + 16, am);
    h += txt(ix, iy + 4, String(i), 'bt-idx');
  }
  // front 从圆心往外指，rear 从外面往里指
  const af = (ang(f) + ang(f + 1)) / 2;
  const ar = (ang(r) + ang(r + 1)) / 2;
  const [fx0, fy0] = pt(26, af);
  const [fx1, fy1] = pt(R1 - 4, af);
  h += arrow(fx0, fy0, fx1, fy1, 'acc');
  h += txt(CX, CY + 4, 'front', 'cq-p f');
  const [rx0, ry0] = pt(R2 + 52, ar);
  const [rx1, ry1] = pt(R2 + 4, ar);
  h += arrow(rx0, ry0, rx1, ry1, 'ok');
  const [rlx, rly] = pt(R2 + 66, ar);
  h += txt(rlx, rly + 4, 'rear', 'cq-p r');
  const items = [{ k: 'ring', x: 0, y: 0, html: h }];
  // 状态
  const len = (r - f + m) % m;
  const st = f === r ? (z ? 'front == rear：队空' : 'front == rear: empty') : full ? (z ? '(rear + 1) % m == front：队满' : '(rear + 1) % m == front: full') : '';
  items.push({ k: 'info', x: 560, y: 190, html: txt(0, 0, z ? `长度 = (rear − front + m) % m` : 'length = (rear − front + m) % m', 'bt-lab', 'start') + txt(0, 26, `= (${r} − ${f} + ${m}) % ${m} = ${len}`, 'ar-mono', 'start') + txt(0, 60, st, 'cq-st', 'start') + txt(0, 92, z ? `${m} 个单元最多放 ${m - 1} 个` : `${m} slots hold at most ${m - 1}`, 'bt-cap', 'start') });
  // 数组里实际的样子
  const W = 40;
  let a = txt(-12, 22, z ? '数组' : 'array', 'bt-cap', 'end');
  Q.forEach((v, i) => (a += `<g transform="translate(${i * W} 0)">${cell(W - 4, 32, v ?? '', { tone: v != null ? 'teal' : '', size: 13, cls: v == null ? 'dim' : '' })}${txt((W - 4) / 2, 48, String(i), 'bt-idx')}</g>`));
  a += txt(f * W + (W - 4) / 2, -8, 'f', 'cq-p f') + txt(r * W + (W - 4) / 2, 64, 'r', 'cq-p r');
  items.push({ k: 'arr', x: CX - (m * W) / 2, y: CY + R2 + 70, html: a });
  return items;
}
function buildQ(p, kit, ERR) {
  const sim = cqueue(p);
  const lesson = shell('cqueue', kit, ERR, sim, {
    where: [['ds', 'stack']],
    tag: T('队列', 'Que'),
    name: T('循环队列', 'Circular queues'),
    full: T('先进先出 · 取模绕回 · 队空和队满 · 元素个数 · 双端队列', 'FIFO · wrap-around · empty vs full · length · deques'),
    title: sim.ok ? T(`m = ${sim.m}`, `m = ${sim.m}`) : T('参数有误', 'Invalid parameters'),
    legend: [['teal', T('队中元素', 'In the queue')]],
    principle: Q_PRINCIPLE,
    desc: T('循环队列把数组首尾相接，front、rear 走到末尾就绕回 0。为了区分队空和队满，牺牲一个单元：front == rear 是空，rear 再走一步就碰到 front 是满。', 'The array wraps around; one slot is wasted so that front == rear means empty and (rear + 1) % m == front means full.'),
    rect: [100, 70, 820, 520],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s) => ({
    title: s.op === 'enq' ? (s.fail ? T(`${s.x} 入队：队满`, `Enqueue ${s.x}: full`) : T(`${s.x} 入队`, `Enqueue ${s.x}`)) : s.fail ? T('出队：队空', 'Dequeue: empty') : T(`${s.x} 出队`, `Dequeue ${s.x}`),
    desc: T(`front = ${s.front}，rear = ${s.rear}`, `front = ${s.front}, rear = ${s.rear}`),
    detail: s.fail === 'full' ? T(`(rear + 1) % ${sim.m} = ${(s.rear + 1) % sim.m} = front，队满，${s.x} 进不去（数组还空着一个单元，这是故意留的）。`, `(rear + 1) % m == front: full.`) : s.fail === 'empty' ? T('front == rear，队里没有元素，不能出队。', 'front == rear: empty.') : s.op === 'enq' ? T(`把 ${s.x} 放在 Q[${s.before.rear}]，rear = (${s.before.rear} + 1) % ${sim.m} = ${s.rear}。`, `Q[${s.before.rear}] = ${s.x}; rear = ${s.rear}.`) : T(`取出 Q[${s.before.front}] = ${s.x}，front = (${s.before.front} + 1) % ${sim.m} = ${s.front}。`, `Take Q[${s.before.front}]; front = ${s.front}.`),
    ref: s.fail ? 'full' : 'queue',
    row: { color: s.fail ? 'rose' : s.op === 'enq' ? 'teal' : 'blue', what: s.op === 'enq' ? `+${s.x}` : '-', result: s.fail ? (s.fail === 'full' ? T('队满', 'full') : T('队空', 'empty')) : T(`长度 ${s.len}`, `len ${s.len}`), tone: s.fail ? 'warn' : 'info' },
  }));
  return finish(lesson, list, (k, z) => qBoard(sim, k, z), T('操作完成', 'Done'), T('数一下：m 个单元最多只放了 m − 1 个元素。', 'Capacity is m − 1.'));
}
export const makeCqueue = make('cqueue', Q_SPEC, Q_ERR, buildQ);

// ═════════════════════════ 特殊矩阵 ═════════════════════════

const MAT_PRINCIPLE = {
  sections: [
    {
      id: 'array',
      title: T('数组的存储', 'Storing arrays'),
      blocks: [
        { p: T('二维数组 a[m][n] 按行优先存：a[i][j] 的地址 = 起始地址 + (i × n + j) × 元素大小（下标从 0 开始）；按列优先：(j × m + i) × 元素大小。', 'Row-major: base + (i·n + j)·size (0-based); column-major: (j·m + i)·size.') },
      ],
    },
    {
      id: 'special',
      title: T('特殊矩阵的压缩存储', 'Compressing special matrices'),
      blocks: [
        { p: T('值相同的元素只存一份、零元素不存，就是压缩存储。按行优先，把要存的元素依次放进一维数组 B[0…]：a[i][j] 前面有几个要存的元素，它就放在 B 的几号位置（i、j 从 1 开始）。', 'Store only what is needed, row by row, into B[0…]: a[i][j] goes to B[count of stored elements before it].') },
        {
          table: {
            head: [T('矩阵', 'Matrix'), T('存哪些', 'Stored'), T('B 中下标 k', 'Index k'), T('一共', 'Size')],
            rows: [
              [T('对称矩阵', 'Symmetric'), T('下三角（含对角线）', 'lower triangle'), T('i ≥ j：i(i − 1)/2 + j − 1；i < j：交换 i、j', 'i ≥ j: i(i−1)/2 + j − 1; else swap'), 'n(n + 1)/2'],
              [T('下三角矩阵', 'Lower triangular'), T('下三角，上三角的常数存在最后', 'lower part plus the constant'), 'i(i − 1)/2 + j − 1', 'n(n + 1)/2 + 1'],
              [T('上三角矩阵', 'Upper triangular'), T('上三角', 'upper part'), '(i − 1)(2n − i + 2)/2 + (j − i)', 'n(n + 1)/2 + 1'],
              [T('三对角矩阵', 'Tridiagonal'), T('|i − j| ≤ 1 的元素', '|i − j| ≤ 1'), '2i + j − 3', '3n − 2'],
            ],
          },
        },
        { tip: T('公式记不住也没关系：数一数 a[i][j] 前面有几行、每行存了几个，再加上本行前面的几个。', 'Just count the stored elements in earlier rows plus those before it in its row.') },
      ],
    },
    {
      id: 'sparse',
      title: T('稀疏矩阵', 'Sparse matrices'),
      blocks: [
        { p: T('非零元素很少且分布没有规律时，用**三元组表**（行、列、值）或**十字链表**存。三元组表丢失了随机存取的能力。', 'Few, scattered non-zeros: **triples** (row, column, value) or **orthogonal lists**; triples lose random access.') },
      ],
    },
    pit([
      T('先看清 i、j 和数组下标是从 0 还是从 1 开始，公式会差 1。', 'Check whether indices start at 0 or 1.'),
      T('按列优先存时，对称矩阵下三角的公式和按行优先不一样。', 'Column-major changes the formulas.'),
    ]),
  ],
};
const MAT_SPEC = {
  presets: [
    { label: T('对称矩阵 a[2][5]', 'Symmetric a[2][5]'), set: { kind: 'sym', n: 6, i: 2, j: 5 } },
    { label: T('上三角 a[3][5]', 'Upper a[3][5]'), set: { kind: 'upper', n: 6, i: 3, j: 5 } },
    { label: T('三对角 a[3][4]', 'Tridiagonal a[3][4]'), set: { kind: 'tri', n: 5, i: 3, j: 4 } },
  ],
  groups: [{ legend: T('矩阵', 'Matrix'), fields: [
    { name: 'kind', label: T('类型', 'Type'), type: 'select', options: [['sym', T('对称矩阵', 'symmetric')], ['lower', T('下三角矩阵', 'lower triangular')], ['upper', T('上三角矩阵', 'upper triangular')], ['tri', T('三对角矩阵', 'tridiagonal')]], wide: true },
    { name: 'n', label: T('阶数 n', 'Order n'), type: 'int', min: 2, max: 9 },
    { name: 'i', label: 'i', type: 'int', min: 1, max: 9 },
    { name: 'j', label: 'j', type: 'int', min: 1, max: 9 },
  ] }],
  note: T('i、j 从 1 开始，一维数组 B 的下标从 0 开始，按行优先存储。', 'i and j start at 1, B starts at 0, row-major.'),
};
const MAT_ERR = { kind: T('类型不对', 'Invalid type'), n: T('n 在 2～9', 'n must be 2–9'), ij: T('i、j 要在 1～n', 'i and j must be in 1..n') };
// 画法：矩阵每一行一个颜色，一维数组 B 画在下面，同样的颜色——一眼看出「按行优先，把各行要存的部分首尾相接」。
// 数到 a[i][j] 时，前面的元素在矩阵和 B 里同时描绿；最后从 a[i][j] 拉一条线落到 B[k]。
const ROWT = ['blue', 'violet', 'teal', 'amber', 'rose', 'green', 'orange', 'slate', 'blue'];
function matGeo(sim) {
  const C = 40;
  const per = Math.min(sim.order.length, 15);
  const BW = 40;
  const by = 120 + sim.n * C + 70;
  const rows = Math.ceil(sim.order.length / per);
  return { C, per, BW, by, rows, bx: (q) => 100 + (q % per) * BW, byq: (q) => by + Math.floor(q / per) * 66, bottom: by + rows * 66 + 30 };
}
function matBoard(sim, st, z) {
  const g = matGeo(sim);
  const C = g.C;
  const idx = new Map(sim.order.map(([r, c], k) => [`${r},${c}`, k]));
  let h = '';
  for (let r = 1; r <= sim.n; r++) {
    h += txt(-12, (r - 1) * C + 24, String(r), 'bt-idx', 'end');
    for (let c = 1; c <= sim.n; c++) {
      const k = idx.get(`${r},${c}`);
      const tgt = r === sim.i && c === sim.j;
      const mirror = sim.kind === 'sym' && r === sim.ti && c === sim.tj && (sim.ti !== sim.i || sim.tj !== sim.j);
      const before = st.phase >= 1 && k != null && k < sim.k;
      h += `<g transform="translate(${(c - 1) * C} ${(r - 1) * C})">${cell(C - 4, C - 4, k != null ? `${r},${c}` : '', { tone: k != null ? (before ? 'green' : ROWT[r - 1]) : '', size: 10, cls: tgt ? 'hot' : mirror && st.phase >= 1 ? 'hot' : k == null ? 'dim' : '' })}</g>`;
    }
  }
  for (let c = 1; c <= sim.n; c++) h += txt((c - 1) * C + (C - 4) / 2, -8, String(c), 'bt-idx');
  const items = [{ k: 'grid', x: 100, y: 120, html: txt(-30, -8, 'i \\ j', 'bt-idx') + h }];
  // 一维数组 B：全部画出来，颜色跟着矩阵的行
  let b = txt(88, g.by - 18, z ? `一维数组 B（按行优先，共 ${sim.order.length} 个${sim.size > sim.order.length ? ' + 1 个常数' : ''}）` : `B, row-major (${sim.order.length}${sim.size > sim.order.length ? ' + 1 constant' : ''})`, 'bt-cap', 'start');
  sim.order.forEach(([r, c], q) => {
    const before = st.phase >= 1 && q < sim.k;
    const hot = st.phase >= 2 && q === sim.k;
    b += `<g transform="translate(${g.bx(q)} ${g.byq(q)})">${cell(g.BW - 3, 30, `${r},${c}`, { tone: before ? 'green' : ROWT[r - 1], size: 9.5, cls: hot ? 'hot' : '' })}${txt((g.BW - 3) / 2, 44, String(q), hot ? 'bt-now' : 'bt-idx')}</g>`;
  });
  if (sim.size > sim.order.length) {
    const q = sim.order.length;
    b += `<g transform="translate(${g.bx(q)} ${g.byq(q)})">${cell(g.BW - 3, 30, 'c', { size: 11, cls: 'dim' })}${txt((g.BW - 3) / 2, 44, String(q), 'bt-idx')}</g>`;
  }
  items.push({ k: 'B', x: 0, y: 0, html: b });
  // a[i][j] 落到 B[k]
  if (st.phase >= 2 && sim.k >= 0) {
    const mx = 100 + (sim.tj - 1) * C + (C - 4) / 2;
    const my = 120 + (sim.ti - 1) * C + (C - 4);
    const tx = g.bx(sim.k) + (g.BW - 3) / 2;
    const ty = g.byq(sim.k);
    items.push({ k: 'drop', x: 0, y: 0, html: `<path class="mt-drop" d="M${mx} ${my} C${mx} ${(my + ty) / 2}, ${tx} ${(my + ty) / 2}, ${tx} ${ty - 6}"/>` + arrow(tx, ty - 16, tx, ty - 2, 'acc') });
  }
  return items;
}

function buildMat(p, kit, ERR) {
  const sim = matrix(p);
  const name = { sym: T('对称矩阵', 'symmetric'), lower: T('下三角矩阵', 'lower triangular'), upper: T('上三角矩阵', 'upper triangular'), tri: T('三对角矩阵', 'tridiagonal') }[p.kind] ?? T('', '');
  const lesson = shell('matrix', kit, ERR, sim, {
    where: [['ds', 'stack']],
    tag: T('矩阵', 'Mat'),
    name: T('特殊矩阵的压缩存储', 'Compressing special matrices'),
    full: T('行优先 / 列优先 · 对称 / 三角 / 三对角矩阵 · 下标换算 · 稀疏矩阵', 'Row / column major · symmetric, triangular, tridiagonal · index formulas · sparse'),
    title: sim.ok ? T(`${name.zh} a[${p.i}][${p.j}]`, `${name.en} a[${p.i}][${p.j}]`) : T('参数有误', 'Invalid parameters'),
    legend: [['blue', T('同一行的元素同一个颜色', 'One colour per row')], ['green', T('排在它前面的', 'Before it')]],
    principle: MAT_PRINCIPLE,
    desc: T('特殊矩阵只存一部分元素。矩阵的每一行一个颜色，下面的一维数组 B 用同样的颜色——按行优先，就是把各行要存的部分首尾相接排起来。找 a[i][j] 的位置，就是数它前面有几个要存的元素，再和课本公式对一对。', 'Only part of the matrix is stored; each cell shows its index in B, counted row by row. Finding a[i][j] means counting the stored elements before it, then checking the textbook formula.'),
    rect: sim.ok ? [40, 80, Math.max(100 + sim.n * 40, 100 + matGeo(sim).per * 40) + 60, matGeo(sim).bottom] : [40, 80, 700, 500],
  });
  if (!sim.ok) return lesson;
  const before = sim.k;
  const rowsBefore = sim.order.filter(([r]) => r < sim.ti).length;
  const inRow = sim.order.filter(([r, c]) => r === sim.ti && c < sim.tj).length;
  const F = { sym: `${sim.ti}×${sim.ti - 1}/2 + ${sim.tj} − 1`, lower: `${sim.ti}×${sim.ti - 1}/2 + ${sim.tj} − 1`, upper: `(${sim.ti} − 1)(2×${sim.n} − ${sim.ti} + 2)/2 + (${sim.tj} − ${sim.ti})`, tri: `2×${sim.ti} + ${sim.tj} − 3` }[sim.kind];
  const list = [
    { title: T(`要存 ${sim.order.length} 个元素`, `${sim.order.length} elements stored`), desc: T('按行优先编号', 'Numbered row by row'), detail: T(`${name.zh}只需要存 ${sim.order.length} 个元素${sim.kind === 'lower' || sim.kind === 'upper' ? '（另外再用一个单元存三角部分的常数）' : ''}。按行优先，它们在一维数组 B 里的下标就是格子里的数字。`, `Only ${sim.order.length} elements are stored; the numbers are their B indices.`), ref: 'special', st: { phase: 0 }, row: { color: 'teal', what: T('存储量', 'Size'), result: String(sim.order.length), tone: 'info' } },
    sim.k < 0
      ? { title: T(`a[${sim.i}][${sim.j}] 不在存储范围内`, `a[${sim.i}][${sim.j}] is not stored`), desc: T('是常数或 0', 'a constant or zero'), detail: T(`${name.zh}里 a[${sim.i}][${sim.j}] 不单独存储：${sim.kind === 'tri' ? '它是 0。' : '它是三角部分以外的常数，存在 B 的最后一个单元。'}`, 'It is a zero or the shared constant.'), ref: 'special', st: { phase: 1 }, row: { color: 'rose', what: `a[${sim.i}][${sim.j}]`, result: T('不存', 'not stored'), tone: 'warn' } }
      : { title: T(`前面有 ${before} 个元素`, `${before} elements before it`), desc: sim.ti !== sim.i ? T(`对称：按 a[${sim.ti}][${sim.tj}] 找`, `Symmetric: use a[${sim.ti}][${sim.tj}]`) : T(`前 ${sim.ti - 1} 行 ${rowsBefore} 个 + 本行 ${inRow} 个`, `${rowsBefore} + ${inRow}`), detail: T(`${sim.ti !== sim.i ? `a[${sim.i}][${sim.j}] 在上三角，对称矩阵只存下三角，所以按它的对称元素 a[${sim.ti}][${sim.tj}] 找。` : ''}前 ${sim.ti - 1} 行一共存了 ${rowsBefore} 个，第 ${sim.ti} 行里在它前面还有 ${inRow} 个，所以它前面一共 ${before} 个元素（绿色）。`, `${rowsBefore} in earlier rows plus ${inRow} in its row: ${before} before it.`), ref: 'special', st: { phase: 1 }, row: { color: 'green', what: T('数一数', 'Count'), result: String(before), tone: 'info' } },
  ];
  if (sim.k >= 0) list.push({ title: T(`a[${sim.i}][${sim.j}] 存在 B[${sim.k}]`, `a[${sim.i}][${sim.j}] is B[${sim.k}]`), desc: T(`公式 ${F} = ${sim.formula}`, `Formula ${F} = ${sim.formula}`), detail: T(`B 的下标从 0 开始，前面有 ${before} 个元素，所以是 B[${sim.k}]。用课本公式算：${F} = ${sim.formula}，一致。`, `B[${sim.k}]; the formula ${F} = ${sim.formula} agrees.`), ref: 'special', st: { phase: 2 }, row: { color: 'orange', what: 'k', result: String(sim.k), tone: 'ok' } });
  return finish(lesson, list, (k, z) => matBoard(sim, k < 0 ? { phase: -1 } : list[k].st, z), sim.k >= 0 ? T(`B[${sim.k}]`, `B[${sim.k}]`) : T('不存储', 'Not stored'), T('换成按列优先想一想：下标会怎么变？', 'Think about column-major order: how would the index change?'));
}
export const makeMatrix = make('matrix', MAT_SPEC, MAT_ERR, buildMat);

// ═════════════════════════ 单链表 ═════════════════════════

const LIST_PRINCIPLE = {
  sections: [
    {
      id: 'seq',
      title: T('顺序表', 'Sequential lists'),
      blocks: [
        { p: T('用一段连续的存储单元依次存放，支持**随机存取**（O(1) 按位序取元素），但插入、删除要移动元素。', 'Contiguous storage: **random access** in O(1), but insertions and deletions shift elements.') },
        {
          table: {
            head: [T('操作（位序 i，表长 n）', 'Operation (position i, length n)'), T('移动次数', 'Moves'), T('平均（等概率）', 'Average')],
            rows: [
              [T('在第 i 个位置插入', 'insert at i'), 'n − i + 1', 'n / 2'],
              [T('删除第 i 个元素', 'delete at i'), 'n − i', '(n − 1) / 2'],
            ],
          },
        },
      ],
    },
    {
      id: 'link',
      title: T('单链表', 'Singly linked lists'),
      blocks: [
        { p: T('每个结点存数据和指向下一个结点的指针 next。不能随机存取，找第 i 个要从头走 O(n)；但已经找到位置后，插入、删除只改指针，不移动元素。通常带一个**头结点**，让第一个结点的操作和其他结点一样。', 'Each node holds data and next. No random access, but once found, insertion and deletion just relink. A **head node** makes the first position uniform.') },
        {
          list: [
            T('**插入**（在第 i 个位置）：找到第 i − 1 个结点 p，s->next = p->next；p->next = s。两句顺序不能反——反了会丢掉后面的链。', '**Insert** at i: find node i − 1 as p; s.next = p.next; p.next = s. Order matters.'),
            T('**删除**第 i 个：找到第 i − 1 个结点 p，q = p->next；p->next = q->next；释放 q。', '**Delete** i: p is node i − 1; q = p.next; p.next = q.next; free q.'),
            T('**头插法**建表或逆置：每次把结点插到头结点后面，得到的顺序和读入的顺序相反。**尾插法**要多一个尾指针，顺序不变。', '**Head insertion** reverses order (used to reverse a list); **tail insertion** keeps it.'),
          ],
        },
      ],
    },
    {
      id: 'others',
      title: T('双链表、循环链表、静态链表', 'Other lists'),
      blocks: [
        { p: T('**双链表**多一个 prior 指针，可以找前驱；在 p 后插入 s 要改 4 个指针：s->next = p->next；p->next->prior = s；s->prior = p；p->next = s。**循环链表**最后一个结点指回头结点，判空看 L->next == L。**静态链表**用数组下标当指针。', '**Doubly linked**: four pointer updates to insert. **Circular**: the last node points back to the head. **Static**: array indices as pointers.') },
      ],
    },
    pit([
      T('顺序表插入可以在第 n + 1 个位置（表尾），删除只能在 1～n。', 'Insert at 1..n + 1, delete at 1..n.'),
      T('链表插入时先连后面、再连前面。', 'Link the successor before the predecessor.'),
      T('「在第 i 个位置插入」要找的是第 i − 1 个结点。', 'Insertion at i needs node i − 1.'),
    ]),
  ],
};
const L_SPEC = {
  presets: [
    { label: T('插入、删除、逆置', 'Insert, delete, reverse'), set: { init: '1 2 3 4', ops: 'ins 2 9, del 4, rev' } },
    { label: T('在表头插入', 'Insert at the front'), set: { init: 'a b c', ops: 'ins 1 x, del 1' } },
  ],
  groups: [{ legend: T('单链表', 'Linked list'), fields: [
    { name: 'init', label: T('初始结点（空格隔开）', 'Initial nodes'), type: 'text', wide: true },
    { name: 'ops', label: T('操作：ins i x 在第 i 个位置插入 x，del i 删除第 i 个，rev 逆置，逗号隔开', 'Ops: ins i x, del i, rev'), type: 'text', wide: true, parse: (s) => (parseL(s) ? s : NaN) },
  ] }],
  note: T('带头结点，位序从 1 开始；逆置用头插法。', 'With a head node, positions from 1; reverse by head insertion.'),
};
const L_ERR = { len: T('最多 10 个结点', 'At most 10 nodes'), ops: T('操作写错了', 'Invalid operations') };
function lBoard(sim, st, z) {
  const L = st.L;
  const W = 80;
  const items = [{ k: 'ln-head', x: 80, y: 220, html: cell(56, 34, z ? '头' : 'H', { tone: 'slate', size: 13 }) + txt(28, -10, 'L', 'bt-cap') }];
  let arrows = '';
  const xOf = (i) => 80 + (i + 1) * W;
  L.forEach((nd, i) => {
    items.push({ k: `ln-${nd.id}`, x: xOf(i), y: 220, from: [xOf(i), 300], html: `<g class="ll ${nd.id === st.hot ? 'hot' : ''}">${cell(36, 34, nd.v, { tone: nd.id === st.hot ? 'orange' : 'teal', size: 14 })}<g transform="translate(36 0)">${cell(20, 34, '', { cls: 'dim' })}</g></g>` });
  });
  for (let i = -1; i < L.length - 1; i++) arrows += arrow(xOf(i) + 50, 237, xOf(i + 1) - 2, 237, st.link?.includes(i + 1) ? 'acc' : '');
  if (L.length) arrows += txt(xOf(L.length - 1) + 64, 242, '∧', 'll-nil', 'start');
  items.push({ k: 'arrows', x: 0, y: 0, html: arrows });
  if (st.gone) items.push({ k: `ln-${st.gone.id}`, x: st.goneX, y: 320, o: 0.5, html: `<g class="ll gone">${cell(36, 34, st.gone.v, { cls: 'bad', size: 14 })}</g>` + txt(18, 52, z ? '释放' : 'freed', 'bt-cap') });
  if (st.p != null) items.push({ k: 'pptr', x: xOf(st.p) + 18, y: 300, html: arrow(0, 0, 0, -36, 'ok') + txt(0, 18, 'p', 'll-p') });
  return items;
}
function buildL(p, kit, ERR) {
  const sim = linked(p);
  const lesson = shell('linked-list', kit, ERR, sim, {
    where: [['ds', 'list']],
    tag: T('链表', 'List'),
    name: T('线性表：顺序表与单链表', 'Sequential and linked lists'),
    full: T('顺序表移动次数 · 单链表插入删除 · 头插法逆置 · 双链表 / 循环链表', 'Moves in arrays · insert and delete · reversal by head insertion · other lists'),
    title: sim.ok ? T(`${sim.init.length} 个结点`, `${sim.init.length} nodes`) : T('参数有误', 'Invalid parameters'),
    legend: [['teal', T('结点', 'Node')], ['orange', T('这一步动到的', 'Changed')]],
    principle: LIST_PRINCIPLE,
    desc: T('单链表的插入、删除只改指针：先用 p 走到第 i − 1 个结点，再改 next。逆置用头插法——把结点一个个摘下来插到头结点后面。', 'Linked-list updates only relink pointers: walk p to node i − 1, then change next. Reversal moves each node to the front.'),
    rect: [40, 160, 80 + (Math.max(sim.ok ? Math.max(sim.init.length, ...sim.steps.map((x) => x.L.length)) : 4, 4) + 1) * 80 + 60, 370],
  });
  if (!sim.ok) return lesson;
  const list = [];
  let prev = sim.init;
  for (const s of sim.steps) {
    if (s.fail) {
      list.push({ title: T(`${s.op === 'ins' ? '插入' : '删除'}位置 ${s.i} 不合法`, `Position ${s.i} is invalid`), desc: T(`表长 ${prev.length}`, `Length ${prev.length}`), detail: T(`表长是 ${prev.length}，${s.op === 'ins' ? `插入位置只能是 1～${prev.length + 1}` : `删除位置只能是 1～${prev.length}`}。`, 'Out of range.'), ref: 'link', st: { L: prev }, row: { color: 'rose', what: s.op, result: T('失败', 'fail'), tone: 'warn' } });
      continue;
    }
    if (s.op === 'ins') {
      const node = s.L[s.i - 1];
      list.push({ title: T(`在第 ${s.i} 个位置插入 ${s.x}`, `Insert ${s.x} at ${s.i}`), desc: T('s->next = p->next；p->next = s', 's.next = p.next; p.next = s'), detail: T(`p 从头结点出发走 ${s.i - 1} 步，停在第 ${s.i - 1} 个结点${s.i === 1 ? '（就是头结点）' : ''}。先让新结点 ${s.x} 指向 p 原来的后继，再让 p 指向 ${s.x}。不用移动任何元素。顺序表在这里插入要移动 ${prev.length - s.i + 1} 个元素。`, `Walk p ${s.i - 1} steps; link ${s.x} after it. An array would shift ${prev.length - s.i + 1} elements.`), ref: 'link', st: { L: s.L, hot: node.id, link: [s.i - 1, s.i], p: s.i - 2 }, row: { color: 'orange', what: `ins ${s.i} ${s.x}`, result: s.L.map((x) => x.v).join(' '), tone: 'info' } });
    } else if (s.op === 'del') {
      list.push({ title: T(`删除第 ${s.i} 个（${s.q.v}）`, `Delete #${s.i} (${s.q.v})`), desc: T('p->next = q->next；free(q)', 'p.next = q.next; free q'), detail: T(`p 走到第 ${s.i - 1} 个结点，q = p->next 就是 ${s.q.v}。让 p 直接指向 q 的后继，再释放 q。顺序表删除这里要移动 ${prev.length - s.i} 个元素。`, `p.next skips ${s.q.v}, which is freed. An array would shift ${prev.length - s.i}.`), ref: 'link', st: { L: s.L, gone: s.q, goneX: 80 + s.i * 80, link: [s.i - 1], p: s.i - 2 }, row: { color: 'rose', what: `del ${s.i}`, result: s.L.map((x) => x.v).join(' '), tone: 'info' } });
    } else {
      s.sub.forEach((u, j) => list.push({ title: T(`逆置：把 ${u.node.v} 插到头结点后面`, `Reverse: move ${u.node.v} to the front`), desc: T(`第 ${j + 1} / ${s.sub.length} 个`, `${j + 1} / ${s.sub.length}`), detail: T(`头插法：依次把原来的结点摘下来，插到头结点后面。${u.node.v} 现在排在最前面${u.rest.length ? `，还剩 ${u.rest.map((x) => x.v).join(' ')}` : '，全部处理完，链表逆置了'}。`, `Head insertion moves ${u.node.v} to the front.`), ref: 'link', st: { L: [...u.L, ...u.rest], hot: u.node.id, link: [0] }, row: { color: 'violet', what: 'rev', result: u.L.map((x) => x.v).join(' '), tone: 'info' } }));
    }
    prev = s.L;
  }
  return finish(lesson, list, (k, z) => lBoard(sim, k < 0 ? { L: sim.init } : list[k].st, z), T(`结果 ${sim.L.map((x) => x.v).join(' ')}`, `Result ${sim.L.map((x) => x.v).join(' ')}`), T('链表操作只改指针，但找到位置本身要从头走，所以按位序插入删除仍是 O(n)。', 'Relinking is O(1), but finding position i is O(n).'));
}
export const makeLinked = make('linked-list', L_SPEC, L_ERR, buildL);

