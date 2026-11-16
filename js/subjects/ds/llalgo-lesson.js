// 「链表算法：双指针」：四个常见套路。链表画成一排结点，几个指针用不同颜色的箭头指着，一步步往前走。
// 公共结点那题把两条链表画成 Y 字形：两条前缀汇合到同一段后缀上。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { twoPointer } from './llalgo.js';

const W = [['ds', 'list']];
const NW = 78;
const X0 = 110;

const MODE = {
  mid: T('找中间结点', 'Middle node'),
  kth: T('找倒数第 k 个结点', 'k-th from the end'),
  merge: T('合并两个有序链表', 'Merge two sorted lists'),
  intersect: T('找第一个公共结点', 'First common node'),
};

const CODE = {
  mid: ['slow = fast = L->next;', 'while (fast->next && fast->next->next) {', '    slow = slow->next;  fast = fast->next->next;', '}', 'return slow;'],
  kth: ['fast = slow = L->next;', 'for (i = 0; i < k; i++) { if (!fast) return 失败; fast = fast->next; }', 'while (fast) {', '    fast = fast->next;  slow = slow->next;', '}', 'return slow;'],
  merge: ['pa = A->next; pb = B->next; r = C;', 'while (pa && pb) {', '    if (pa->data <= pb->data) { r->next = pa; pa = pa->next; }', '    else { r->next = pb; pb = pb->next; }', '    r = r->next;', '}', 'r->next = pa ? pa : pb;'],
  intersect: ['la = 长度(A); lb = 长度(B);', '较长的链表先走 |la − lb| 步;', 'while (pa != pb) {', '    pa = pa->next;  pb = pb->next;', '}', 'return pa;'],
};
const LINES = {
  mid: { start: [0], move: [1, 2], stop: [1, 4] },
  kth: { start: [0], ahead: [1], move: [2, 3], stop: [2, 5], tooFar: [1] },
  merge: { start: [0], take: [1, 2, 3, 4], rest: [6] },
  intersect: { len: [0], ahead: [1], move: [2, 3], stop: [2, 5] },
};

const PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么用双指针', 'Why two pointers'),
      blocks: [
        { p: T('单链表只能从头往后走，不能随机访问，也不能往回走。很多题如果先求出长度、再走一遍，要扫两趟；用两个指针按不同的速度或不同的起点一起走，常常一趟就能完成，时间 O(n)，额外空间 O(1)。', 'A singly linked list only moves forward. Two pointers at different speeds or offsets usually solve in one pass: O(n) time, O(1) space.') },
        { tip: T('算法题评分看三点：思路说清楚、代码写对、复杂度写对。只用常数个指针的解法通常能拿满分，借一个数组存下所有结点的解法常常要扣分。', 'Explain the idea, write correct code, give the complexity; O(1)-space pointer solutions score best.') },
      ],
    },
    {
      id: 'mid',
      title: T('快慢指针：找中间结点', 'Fast and slow: the middle'),
      blocks: [
        { p: T('慢指针每次走 1 步、快指针每次走 2 步，同时从第一个结点出发。快指针走到最后（再走一步就是 NULL）时，慢指针正好在中间。结点个数是偶数时，按上面的循环条件得到的是前一个中间结点。', 'slow moves 1, fast moves 2; when fast reaches the end, slow is in the middle (the first middle for even lengths).') },
        { tip: T('快慢指针还能判断链表有没有环：有环时快指针一定会追上慢指针。', 'They also detect cycles: fast eventually meets slow.') },
      ],
    },
    {
      id: 'kth',
      title: T('前后指针：倒数第 k 个', 'A head start: k-th from the end'),
      blocks: [
        { p: T('快指针先走 k 步，然后两个指针一起走。快指针走到 NULL 时，两者之间正好隔着 k 个结点，慢指针就停在倒数第 k 个上。如果快指针还没走够 k 步就到了 NULL，说明链表不足 k 个结点。', 'Give fast a k-step lead, then move both; when fast is NULL, slow is k-th from the end.') },
      ],
    },
    {
      id: 'merge',
      title: T('两条链表各一个指针：合并', 'One pointer per list: merging'),
      blocks: [
        { p: T('pa、pb 分别指向两个递增链表当前最小的结点，每次比较，把小的那个接到结果链表的尾部 r 后面，指针后移。一条链表走完后，把另一条剩下的部分整个接上。不需要新建结点，只改指针，空间 O(1)，时间 O(m + n)。', 'Compare pa and pb, link the smaller to the tail r, advance it; attach the rest at the end. O(m + n) time, O(1) space.') },
        { tip: T('要合并成递减链表时，把每次取下的结点用头插法插到结果链表前面。', 'For a decreasing result, insert at the head instead.') },
      ],
    },
    {
      id: 'intersect',
      title: T('对齐长度：第一个公共结点', 'Align the lengths: the first common node'),
      blocks: [
        { p: T('两个链表从第一个公共结点起，后面的结点完全是同一批（单链表每个结点只有一个 next），所以形状像字母 Y。先求两个链表的长度，让长的那条先走「长度差」步，两个指针离末尾就一样远了；再一起走，第一次指向同一个结点时就是答案。', 'From the first shared node on, the lists coincide (a Y shape). Advance the longer list by the length difference, then move together until the pointers meet.') },
        { formula: T('时间 O(m + n)，空间 O(1)', 'O(m + n) time, O(1) space') },
        { warn: T('比较的是结点（地址）是否相同，不是数据值是否相等。', 'Compare node addresses, not values.') },
      ],
    },
    pit([
      T('循环条件里先判断 fast 不为 NULL，再访问 fast->next，否则会访问空指针。', 'Check fast before fast->next.'),
      T('倒数第 k 个要考虑 k 大于链表长度的情况。', 'Handle k larger than the length.'),
      T('公共结点比的是地址，不是值。', 'Common nodes are compared by address.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('找中间结点', 'Middle node'), set: { mode: 'mid', a: '3 8 1 6 9 2 7', b: '', c: '', k: 2 } },
    { label: T('倒数第 3 个', '3rd from the end'), set: { mode: 'kth', a: 'a b c d e f', b: '', c: '', k: 3 } },
    { label: T('合并两个递增链表', 'Merge two sorted lists'), set: { mode: 'merge', a: '1 4 7 8', b: '2 4 5 9', c: '', k: 2 } },
    { label: T('第一个公共结点', 'First common node'), set: { mode: 'intersect', a: 'l o a', b: 'b e', c: 'd i n g', k: 2 } },
  ],
  groups: [{ legend: T('题目', 'Problem'), fields: [
    { name: 'mode', label: T('套路', 'Pattern'), type: 'select', options: Object.entries(MODE).map(([k, v]) => [k, v]), wide: true },
    { name: 'a', label: T('链表 A（空格隔开）', 'List A (space-separated)'), type: 'text', wide: true, allowEmpty: true },
    { name: 'b', label: T('链表 B', 'List B'), type: 'text', wide: true, allowEmpty: true, show: (p) => p.mode === 'merge' || p.mode === 'intersect' },
    { name: 'c', label: T('公共后缀', 'Shared suffix'), type: 'text', wide: true, allowEmpty: true, show: (p) => p.mode === 'intersect' },
    { name: 'k', label: 'k', type: 'int', min: 1, max: 12, show: (p) => p.mode === 'kth' },
  ] }],
  note: T('链表带头结点。中间结点在偶数个时取前一个；倒数第 k 个从 1 开始数；合并时相等的关键字先取 A 的；公共结点是同一个结点，不是值相同。', 'Lists have head nodes. Even length gives the first middle; k counts from 1; ties take A first; common means the same node.'),
};
const ERR = { empty: T('链表 A 不能是空的', 'List A cannot be empty'), long: T('每条链表最多 10 个结点', 'At most 10 nodes per list'), k: T('k 要是正整数', 'k must be a positive integer'), unsorted: T('合并的两个链表都要是递增的数字', 'Both lists must be ascending numbers'), common: T('公共后缀不能是空的', 'The shared suffix cannot be empty'), mode: T('不认识的套路', 'Unknown pattern') };

const KIND = { start: T('出发', 'start'), move: T('一起走', 'move'), stop: T('停下', 'stop'), ahead: T('先走', 'lead'), tooFar: T('不够长', 'too short'), take: T('取一个', 'take'), rest: T('接上剩余', 'rest'), len: T('求长度', 'lengths') };
const PT = { slow: 'ok', fast: 'acc', pa: 'acc', pb: 'ok' };
const PC = { slow: 'll-p', fast: 'll-p f', pa: 'll-p f', pb: 'll-p' };

function nodeRow(vals, x, y, toneOf, keyOf, head = true) {
  const items = [];
  if (head) items.push({ k: `${keyOf('h')}`, x: x - NW, y, html: cell(44, 34, 'L', { tone: 'slate', size: 12 }) });
  vals.forEach((v, i) => items.push({ k: keyOf(i), x: x + i * NW, y, html: `${cell(36, 34, v, { tone: toneOf(i), size: 14 })}<g transform="translate(36 0)">${cell(18, 34, '', { cls: 'dim' })}</g>` }));
  let a = '';
  const start = head ? -1 : 0;
  for (let i = start; i < vals.length - 1; i++) a += arrow(x + i * NW + (i < 0 ? 44 : 50), y + 17, x + (i + 1) * NW - 2, y + 17, '');
  return { items, arrows: a, end: x + (vals.length - 1) * NW + 54 };
}

function ptr(name, x, y, below) {
  const y1 = below ? y + 86 : y - 52;
  const y2 = below ? y + 38 : y - 4;
  return arrow(x + 18, y1, x + 18, y2, PT[name]) + txt(x + 18, below ? y1 + 16 : y1 - 6, name, PC[name]);
}

function codeBlock(mode, kind, x, y, z) {
  const on = new Set(LINES[mode][kind] ?? []);
  let c = txt(0, -14, z ? '代码' : 'Code', 'bt-cap', 'start');
  CODE[mode].forEach((ln, i) => (c += `<g transform="translate(0 ${i * 26})"><rect class="lq-line ${on.has(i) ? 'on' : ''}" x="-8" y="-2" width="560" height="23" rx="4"/>${txt(0, 14, z ? ln : ln.replace('失败', 'fail').replace('长度', 'length').replace('较长的链表先走 |la − lb| 步;', 'advance the longer list |la − lb| steps;'), `lq-code ${on.has(i) ? 'on' : ''}`, 'start')}</g>`));
  return { k: 'code', x, y, html: c };
}

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : null;
  const mode = sim.mode;
  let arrows = '';
  let pts = '';
  let codeY = 360;
  if (mode === 'mid' || mode === 'kth') {
    const y = 200;
    const r = nodeRow(sim.A, X0 + NW, y, (i) => (s?.ans === i + 1 ? 'green' : 'teal'), (i) => `n${i}`);
    items.push(...r.items);
    arrows += r.arrows + txt(r.end + 8, y + 23, '∧', 'll-nil', 'start');
    const at = (i) => X0 + NW + (i - 1) * NW;
    if (s) {
      for (const [name, v] of Object.entries(s.p)) {
        const below = name === 'fast';
        if (v == null) pts += txt(r.end + 30, below ? y + 76 : y - 30, `${name} = NULL`, PC[name], 'start');
        else pts += ptr(name, at(v), y, below);
      }
      if (mode === 'kth' && s.kind !== 'tooFar' && s.p.fast != null) pts += txt((at(s.p.slow) + at(s.p.fast)) / 2 + 18, y + 120, z ? `相隔 ${s.p.fast - s.p.slow} 个结点` : `${s.p.fast - s.p.slow} apart`, 'bt-cap');
    }
  } else if (mode === 'merge') {
    const ya = 150;
    const yb = 240;
    const used = new Set((s?.C ?? []).map((x) => `${x.l}${x.i}`));
    const ra = nodeRow(sim.A, X0 + NW, ya, (i) => (used.has(`A${i}`) ? 'slate' : 'blue'), (i) => `A${i}`);
    const rb = nodeRow(sim.B, X0 + NW, yb, (i) => (used.has(`B${i}`) ? 'slate' : 'violet'), (i) => `B${i}`);
    items.push(...ra.items, ...rb.items);
    arrows += ra.arrows + rb.arrows;
    items.push({ k: 'lab', x: X0 - NW + 4, y: 0, html: txt(-10, ya + 22, 'A', 'bt-lab', 'end') + txt(-10, yb + 22, 'B', 'bt-lab', 'end') + txt(-10, 412, 'C', 'bt-lab', 'end') });
    if (s) {
      if (s.p.pa != null) pts += ptr('pa', X0 + NW + (s.p.pa - 1) * NW, ya, false);
      if (s.p.pb != null) pts += ptr('pb', X0 + NW + (s.p.pb - 1) * NW, yb, true);
      // 结果链表 C
      const vals = s.C.map((x) => (x.l === 'A' ? sim.A[x.i] : sim.B[x.i]));
      const rc = nodeRow(vals, X0 + NW, 390, (i) => (s.C[i].l === 'A' ? 'blue' : 'violet'), (i) => `C${i}`);
      items.push(...rc.items);
      arrows += rc.arrows;
      if (vals.length) pts += txt(X0 + NW + (vals.length - 1) * NW + 18, 446, 'r', 'll-p');
    }
    codeY = 500;
  } else {
    // 公共结点：Y 字形
    const commonX = X0 + NW + Math.max(sim.A.length, sim.B.length) * NW;
    const ya = 160;
    const yb = 300;
    const yc = 230;
    const ax = (i) => commonX - (sim.A.length - i + 1) * NW; // A 的第 i 个（从 1 开始）
    const bx = (i) => commonX - (sim.B.length - i + 1) * NW;
    sim.A.forEach((v, i) => items.push({ k: `A${i}`, x: ax(i + 1), y: ya, html: `${cell(36, 34, v, { tone: 'blue', size: 14 })}<g transform="translate(36 0)">${cell(18, 34, '', { cls: 'dim' })}</g>` }));
    sim.B.forEach((v, i) => items.push({ k: `B${i}`, x: bx(i + 1), y: yb, html: `${cell(36, 34, v, { tone: 'violet', size: 14 })}<g transform="translate(36 0)">${cell(18, 34, '', { cls: 'dim' })}</g>` }));
    sim.Cm.forEach((v, i) => items.push({ k: `C${i}`, x: commonX + i * NW, y: yc, html: `${cell(36, 34, v, { tone: s?.ans != null && i === 0 ? 'green' : 'teal', size: 14, cls: s?.ans != null && i === 0 ? 'hot' : '' })}<g transform="translate(36 0)">${cell(18, 34, '', { cls: 'dim' })}</g>` }));
    for (let i = 1; i < sim.A.length; i++) arrows += arrow(ax(i) + 50, ya + 17, ax(i + 1) - 2, ya + 17, '');
    for (let i = 1; i < sim.B.length; i++) arrows += arrow(bx(i) + 50, yb + 17, bx(i + 1) - 2, yb + 17, '');
    if (sim.A.length) arrows += arrow(ax(sim.A.length) + 50, ya + 30, commonX - 2, yc + 6, '');
    if (sim.B.length) arrows += arrow(bx(sim.B.length) + 50, yb + 4, commonX - 2, yc + 28, '');
    for (let i = 0; i < sim.Cm.length - 1; i++) arrows += arrow(commonX + i * NW + 50, yc + 17, commonX + (i + 1) * NW - 2, yc + 17, '');
    arrows += txt(commonX + (sim.Cm.length - 1) * NW + 62, yc + 23, '∧', 'll-nil', 'start');
    items.push({ k: 'lab', x: 0, y: 0, html: txt(Math.min(ax(1), commonX) - 20, ya + 22, `A（${sim.la}）`, 'bt-lab', 'end') + txt(Math.min(bx(1), commonX) - 20, yb + 22, `B（${sim.lb}）`, 'bt-lab', 'end') });
    if (s) {
      const pos = (p, len, xf, yRow) => (p <= len ? [xf(p), yRow] : [commonX + (p - len - 1) * NW, yc]);
      const [pax, pay] = pos(s.p.pa, sim.A.length, ax, ya);
      const [pbx, pby] = pos(s.p.pb, sim.B.length, bx, yb);
      pts += ptr('pa', pax, pay, false) + ptr('pb', pbx, pby, true);
    }
    codeY = 440;
  }
  items.push({ k: 'arrows', x: 0, y: 0, html: arrows });
  items.push({ k: 'pts', x: 0, y: 0, html: pts });
  if (s) items.push(codeBlock(mode, s.kind, X0, codeY, z));
  return items;
}

function build(p, kit, ERR) {
  const sim = twoPointer(p);
  const lesson = shell('ll-algo', kit, ERR, sim, {
    where: W,
    tag: T('双指针', '2-ptr'),
    name: T('链表算法：双指针', 'Linked-list algorithms: two pointers'),
    full: T('快慢指针找中间结点 · 先走 k 步找倒数第 k 个 · 合并有序链表 · 对齐长度找公共结点', 'Fast/slow · k-step lead · merging · aligning lengths'),
    title: MODE[p.mode] ?? T('', ''),
    legend: [['green', T('答案', 'Answer')]],
    principle: PRINCIPLE,
    desc: T('链表算法大题最常用的就是「双指针」：两个指针以不同的速度、或者从不同的位置一起往后走，一趟就能找到想要的结点，空间 O(1)。这节课把四个常见套路一步步演示，右下角是对应的代码，执行到的行会亮起来。', 'Two pointers moving at different speeds or offsets solve many list problems in one pass with O(1) space. Four patterns, step by step, with the code alongside.'),
    rect: (() => {
      if (!sim.ok) return [20, 90, X0 + 10 * NW, 600];
      const n = sim.mode === 'intersect' ? Math.max(sim.A.length, sim.B.length) + sim.Cm.length + 1 : Math.max(sim.A.length, sim.B?.length ?? 0, sim.mode === 'merge' ? sim.C.length : 0) + 2;
      const codeY = { mid: 360, kth: 360, merge: 500, intersect: 440 }[sim.mode];
      return [20, 90, Math.max(X0 + n * NW + 60, X0 + 600), codeY + CODE[sim.mode].length * 26 + 20];
    })(),
  });
  if (!sim.ok) return lesson;
  const name = (v) => (sim.mode === 'intersect' ? '' : sim.A[v - 1]);
  const list = sim.steps.map((s, k) => {
    let title;
    let detail;
    if (sim.mode === 'mid') {
      title = s.kind === 'start' ? T('两个指针都从第一个结点出发', 'Both start at the first node') : s.kind === 'move' ? T(`slow 走 1 步、fast 走 2 步`, 'slow +1, fast +2') : T(`fast 走到头，slow 在第 ${s.ans} 个`, `fast at the end; slow at #${s.ans}`);
      detail = s.kind === 'stop' ? T(`fast 的后面已经${s.p.fast === sim.A.length ? '没有结点了' : '只剩一个结点，不够走两步'}，循环结束。慢指针停在第 ${s.ans} 个结点「${name(s.ans)}」，就是中间结点（共 ${sim.A.length} 个）。`, `slow stops at #${s.ans} (${name(s.ans)}), the middle of ${sim.A.length}.`) : T(`slow 在第 ${s.p.slow} 个，fast 在第 ${s.p.fast} 个：fast 走过的结点数一直是 slow 的两倍左右。`, `slow at #${s.p.slow}, fast at #${s.p.fast}.`);
    } else if (sim.mode === 'kth') {
      title = { start: T('两个指针从第一个结点出发', 'Both start at the first node'), ahead: T(`fast 先走 ${sim.k} 步`, `fast takes ${sim.k} steps`), move: T('两个一起走一步', 'Both move one step'), stop: T(`fast 到 NULL，slow 就是倒数第 ${sim.k} 个`, `fast is NULL: slow is k-th from the end`), tooFar: T(`链表不足 ${sim.k} 个结点`, `Fewer than ${sim.k} nodes`) }[s.kind];
      detail = s.kind === 'tooFar' ? T(`fast 还没走够 ${sim.k} 步就到了 NULL，链表只有 ${sim.A.length} 个结点，查找失败。`, 'fast hits NULL early: no such node.') : s.kind === 'stop' ? T(`fast 已经是 NULL，它和 slow 之间隔着 ${sim.k} 个结点，所以 slow 指的「${name(s.ans)}」是倒数第 ${sim.k} 个（正数第 ${s.ans} 个）。`, `slow at ${name(s.ans)}: #${s.ans}.`) : s.kind === 'ahead' ? T(`fast 往后走 ${sim.k} 步，现在${s.p.fast == null ? '已经是 NULL' : `在第 ${s.p.fast} 个`}，slow 还在第 1 个：两者相隔 ${sim.k} 个结点。`, `fast is ${sim.k} ahead.`) : T(`slow 在第 ${s.p.slow} 个，fast 在第 ${s.p.fast ?? 'NULL'} 个，间隔保持不变。`, 'The gap stays the same.');
    } else if (sim.mode === 'merge') {
      title = s.kind === 'start' ? T('pa、pb 指向两个链表的第一个结点', 'pa and pb at the heads') : s.kind === 'take' ? T(`${s.cmp[0]} 和 ${s.cmp[1]} 比，取 ${s.from === 'A' ? s.cmp[0] : s.cmp[1]}`, `${s.cmp[0]} vs ${s.cmp[1]}: take ${s.from === 'A' ? s.cmp[0] : s.cmp[1]}`) : T(`把 ${s.rest} 剩下的整段接上`, `Attach the rest of ${s.rest}`);
      detail = s.kind === 'take' ? T(`比较 pa、pb 指的值：${s.cmp[0]} ${s.from === 'A' ? '≤' : '>'} ${s.cmp[1]}，把 ${s.from === 'A' ? 'pa' : 'pb'} 指的结点接到 C 的尾部 r 后面，${s.from === 'A' ? 'pa' : 'pb'} 后移。${s.cmp[0] === s.cmp[1] ? '相等时先取 A 的，保持稳定。' : ''}`, `Link the smaller node and advance its pointer.`) : s.kind === 'rest' ? T(`另一条已经走完，${s.rest} 剩下的结点本来就有序，整段接到 r 后面，一次指针修改就够了。`, `Attach the rest of ${s.rest} with one pointer change.`) : T('结果链表 C 先只有头结点，r 指向它的尾部。', 'C starts empty; r is its tail.');
    } else {
      title = { len: T(`先求长度：A 有 ${sim.la} 个，B 有 ${sim.lb} 个`, `Lengths: A ${sim.la}, B ${sim.lb}`), ahead: s.longer ? T(`${s.longer} 先走 ${s.d} 步`, `${s.longer} goes ${s.d} ahead`) : T('一样长，不用先走', 'Equal lengths'), move: T('两个一起走一步', 'Both move one step'), stop: T(`pa == pb：第一个公共结点是 ${s.ans}`, `pa == pb: ${s.ans}`) }[s.kind];
      detail = s.kind === 'len' ? T(`各扫一遍求长度。公共部分两条链表都有，长度差 ${Math.abs(sim.la - sim.lb)} 全部来自前缀。`, `The difference ${Math.abs(sim.la - sim.lb)} comes from the prefixes.`) : s.kind === 'ahead' ? T(`长的链表先走 ${s.d} 步，现在 pa、pb 离链表末尾一样远了。`, 'Now both are equally far from the end.') : s.kind === 'stop' ? T(`pa 和 pb 指向同一个结点「${s.ans}」（地址相同，不只是值相同），它就是第一个公共结点。时间 O(m + n)，空间 O(1)。`, `Same node ${s.ans}: the answer.`) : T('pa != pb，两个一起往后走。', 'Different nodes: move both.');
    }
    return { title, desc: MODE[sim.mode], detail, ref: sim.mode, st: { k }, row: { color: s.kind === 'stop' || s.kind === 'rest' ? 'green' : 'blue', what: KIND[s.kind], result: Object.entries(s.p).map(([n, v]) => `${n}=${v ?? '∧'}`).join(' '), tone: 'info' } };
  });
  const ans = sim.mode === 'merge' ? sim.C.map((x) => (x.l === 'A' ? sim.A[x.i] : sim.B[x.i])).join(' ') : sim.mode === 'intersect' ? sim.ans : sim.ans == null ? T('不存在', 'none') : `${name(sim.ans)}`;
  return finish(lesson, list, (st, z) => board(sim, st, z), T(`结果：${typeof ans === 'object' ? ans.zh : ans}`, `Result: ${typeof ans === 'object' ? ans.en : ans}`), T('换一个套路，或者改改链表的长度再看一遍。', 'Try another pattern or another length.'));
}

export const makeLlAlgo = make('ll-algo', SPEC, ERR, build);
