// 「经典同步问题」：读者—写者画成「进程泳道 + 共享文件 + 信号量表」，哲学家进餐画成一张圆桌。
// 每一步都是 syncclassic.js 里进程真的执行 P、V 的结果。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { N, syncClassic } from './syncclassic.js';

const W = [['os', 'process']];
const code = (lines) => ({ list: lines.map((l) => ({ zh: `\`${l}\``, en: `\`${l}\`` })) });
const NAME = {
  'rw-reader': T('读者—写者：读者优先', 'Readers–writers: readers first'),
  'rw-fair': T('读者—写者：读写公平', 'Readers–writers: fair'),
  'dine-left': T('哲学家进餐：都先拿左边', 'Dining philosophers: all left first'),
  'dine-odd': T('哲学家进餐：奇偶分开拿', 'Dining philosophers: odd/even order'),
  'dine-room': T('哲学家进餐：最多 4 人上桌', 'Dining philosophers: at most four'),
};

const PRINCIPLE = {
  sections: [
    {
      id: 'how',
      title: T('分析同步问题的套路', 'How to attack a synchronisation problem'),
      blocks: [
        { steps: [
          T('找出所有进程，写出每个进程要做的事（先不管同步）；', 'List the processes and what each does;'),
          T('找**互斥**：哪些资源同一时刻只能一个进程用 → 每个配一个初值为 1 的信号量；', 'find **mutual exclusion**: one semaphore with value 1 per exclusive resource;'),
          T('找**同步**（先后关系）：谁必须等谁 → 配初值为 0 或资源数的信号量，「前 V 后 P」；', 'find **ordering**: semaphores starting at 0 or a count, V before P;'),
          T('排 P 的顺序：**先 P 同步信号量，再 P 互斥信号量**，否则可能拿着锁等资源而死锁；', 'order the P operations: **synchronisation before mutual exclusion**;'),
          T('检查：会不会死锁、会不会有进程一直等（饥饿）。', 'check for deadlock and starvation.'),
        ] },
      ],
    },
    {
      id: 'rw',
      title: T('读者—写者', 'Readers and writers'),
      blocks: [
        { p: T('要求：多个读者可以同时读；写者写的时候，别的写者、读者都不能进来。关键是用一个普通变量 **count** 记录正在读的读者数：第一个读者负责把写者挡在外面（P(rw)），最后一个读者负责放写者进来（V(rw)）；count 本身被几个读者共享，要用 mutex 保护。', 'Many readers may read together; a writer excludes everyone. A counter **count** tracks readers: the first one locks out writers with P(rw), the last one lets them in with V(rw); count itself needs a mutex.') },
        {
          cols: [
            [{ p: T('读者（读者优先）', 'Reader (readers first)') }, code(['P(mutex);', 'if (count == 0) P(rw);', 'count++;', 'V(mutex);', '读文件;', 'P(mutex);', 'count--;', 'if (count == 0) V(rw);', 'V(mutex);'])],
            [{ p: T('写者', 'Writer') }, code(['P(rw);', '写文件;', 'V(rw);'])],
          ],
        },
        { warn: T('**读者优先会让写者饿死**：只要一直有读者进来，count 就不会降到 0，写者就一直等。', '**Readers-first can starve writers**: as long as readers keep coming, count never reaches 0.') },
        { p: T('**读写公平**：再加一个信号量 w = 1。写者到达时先 P(w)，之后来的读者在 P(w) 处就被挡住，排在写者后面；写者写完 V(w) 再放他们进来。', '**Fair version**: an extra semaphore w = 1 makes later readers queue behind a waiting writer.') },
        {
          cols: [
            [{ p: T('读者（读写公平）', 'Reader (fair)') }, code(['P(w);', 'P(mutex);', 'if (count == 0) P(rw);', 'count++;', 'V(mutex);', 'V(w);', '读文件;', 'P(mutex);', 'count--;', 'if (count == 0) V(rw);', 'V(mutex);'])],
            [{ p: T('写者（读写公平）', 'Writer (fair)') }, code(['P(w);', 'P(rw);', '写文件;', 'V(rw);', 'V(w);'])],
          ],
        },
      ],
    },
    {
      id: 'dine',
      title: T('哲学家进餐', 'Dining philosophers'),
      blocks: [
        { p: T('5 个哲学家围坐一张圆桌，每两人之间放一根筷子（信号量 c0～c4，初值都是 1）。哲学家 i 左边是筷子 i，右边是筷子 (i + 1) mod 5，要拿到两根才能吃。', 'Five philosophers, five chopsticks c0–c4 (all 1). Philosopher i needs chopsticks i and (i + 1) mod 5.') },
        code(['P(c[i]);            // 拿左边', 'P(c[(i + 1) % 5]);  // 拿右边', '吃饭;', 'V(c[i]);', 'V(c[(i + 1) % 5]);']),
        { warn: T('**会死锁**：如果 5 个人同时拿起左边的筷子，每人都拿着一根、等着右边那根，形成循环等待，谁也吃不上。', '**Deadlock**: if all five pick up their left chopstick, each holds one and waits for the next: a cycle.') },
        { list: [
          T('**最多允许 4 个人同时拿筷子**：加一个信号量 room = 4，拿筷子前先 P(room)。5 根筷子分给 4 个人，至少有一个人能拿到两根。', '**At most four at the table**: room = 4, P(room) first; someone always gets two chopsticks.'),
          T('**奇偶分开拿**：奇数号先拿左边、偶数号先拿右边（或者反过来）。相邻两人先去抢同一根，打破了循环等待。', '**Odd/even order**: odd ones take the left first, even ones the right first; neighbours contend for the same chopstick first.'),
          T('**两根一起拿**：用一个 mutex 把「拿左边、拿右边」包起来，只有两根都能拿到时才拿。', '**Take both at once** inside a mutex.'),
        ] },
      ],
    },
    {
      id: 'smoker',
      title: T('吸烟者问题', 'Smokers'),
      blocks: [
        { p: T('一个供应者轮流把三种材料中的两种放到桌上，三个吸烟者各缺一种材料，拿到另外两种就能卷烟。它本质上是「一个生产者生产三种产品，每种对应一个消费者」：每种组合一个同步信号量（初值 0），再加一个 finish 让供应者等吸烟者抽完再放下一份。', 'One supplier, three smokers: a producer of three products, one semaphore per combination plus a finish semaphore.') },
      ],
    },
    pit([
      T('count 是普通变量，不是信号量；它被多个读者共享，读写它要在 mutex 保护下进行。', 'count is an ordinary variable guarded by mutex.'),
      T('读者优先时写者可能饿死；读写公平靠多一个信号量 w。', 'Readers-first starves writers; the fair version adds w.'),
      T('哲学家进餐的死锁来自循环等待；三种解法分别破坏了「占有并等待」或「循环等待」。', 'The philosophers’ deadlock is a circular wait; the fixes break it.'),
    ]),
  ],
};

const SPEC = {
  presets: Object.entries(NAME).map(([k, v]) => ({ label: v, set: { problem: k } })),
  groups: [{ legend: T('问题', 'Problem'), fields: [{ name: 'problem', label: T('看哪一种', 'Which'), type: 'select', options: Object.entries(NAME).map(([k, v]) => [k, v]), wide: true }] }],
  note: T('读者—写者按「到达 / 离开」的顺序推进；哲学家每人轮流做一步：拿一根筷子，或者吃完放下。', 'Readers–writers advance by arrivals and departures; philosophers take turns, one action each.'),
};
const ERR = { problem: T('没有这个问题', 'Unknown problem') };

// ───── 每一步发生了什么（文字） ─────
function sentence(x, z) {
  const W = { read: z ? '读文件' : 'reading', write: z ? '写文件' : 'writing', eat: z ? '吃饭' : 'eating' };
  if (x.kind === 'P') return x.block ? (z ? `${x.p} 执行 P(${x.s})，${x.s} = ${x.val} < 0，阻塞` : `${x.p}: P(${x.s}) → ${x.val}, blocks`) : z ? `${x.p} 执行 P(${x.s})，${x.s} = ${x.val}${x.why === 'first' ? '（第一个读者，把写者挡在外面）' : ''}` : `${x.p}: P(${x.s}) → ${x.val}`;
  if (x.kind === 'V') return z ? `${x.p} 执行 V(${x.s})，${x.s} = ${x.val}${x.why === 'last' ? '（最后一个读者，放写者进来）' : ''}${x.woke ? `，唤醒 ${x.woke}` : ''}` : `${x.p}: V(${x.s}) → ${x.val}${x.woke ? `, wakes ${x.woke}` : ''}`;
  if (x.kind === 'skip') return z ? `${x.p}：count = ${x.count} ≠ 0，跳过 ${x.ins}` : `${x.p}: count = ${x.count}, skips ${x.ins}`;
  if (x.kind === 'set') return z ? `${x.p}：${x.text}，count = ${x.count}` : `${x.p}: ${x.text} → ${x.count}`;
  if (x.kind === 'work') return z ? `${x.p} 开始${W[x.what]}` : `${x.p} starts ${W[x.what]}`;
  return z ? `${x.p} ${W[x.what].slice(0, 1)}完了` : `${x.p} finishes ${W[x.what]}`;
}
const stateText = (s, fam, z) => {
  if (s.state === 'idle') return z ? (fam === 'rw' ? '还没到' : '思考') : fam === 'rw' ? 'not yet' : 'thinking';
  if (s.state === 'done') return z ? (fam === 'rw' ? '已离开' : '吃完了') : fam === 'rw' ? 'left' : 'done';
  if (s.state === 'blocked') return z ? `${s.held.length ? `拿着 ${s.held.join('、')}，` : ''}等 ${s.on}` : `${s.held.length ? `holds ${s.held.join(', ')}, ` : ''}waits ${s.on}`;
  if (s.state === 'working') return z ? (fam === 'rw' ? '在里面' : '吃饭') : fam === 'rw' ? 'inside' : 'eating';
  return z ? (s.held.length ? `拿着 ${s.held.join('、')}` : '准备') : s.held.length ? `holds ${s.held.join(', ')}` : 'ready';
};
const toneOf = (s) => (s.state === 'blocked' ? 'rose' : s.state === 'working' ? 'green' : s.state === 'done' ? 'slate' : s.held.length ? 'amber' : '');

/** 右边的信号量表 */
function semTable(snap, x0, y0, z, extra = []) {
  let h = txt(x0, y0 - 14, z ? '信号量（值 / 等待队列）' : 'Semaphores (value / queue)', 'bt-lab', 'start');
  Object.entries(snap.val).forEach(([k, v], i) => {
    const y = y0 + i * 34;
    h += `<g transform="translate(${x0} ${y})">${cell(64, 26, k, { size: 12, tone: 'violet' })}</g>`;
    h += `<g transform="translate(${x0 + 70} ${y})">${cell(44, 26, String(v), { size: 13, tone: v < 0 ? 'rose' : '', cls: v < 0 ? 'hot' : '' })}</g>`;
    snap.queue[k].forEach((p, j) => (h += `<g transform="translate(${x0 + 122 + j * 52} ${y})">${cell(48, 26, p, { size: 11.5, tone: 'rose' })}</g>`));
  });
  extra.forEach(([k, v], i) => {
    const y = y0 + (Object.keys(snap.val).length + i) * 34 + 10;
    h += `<g transform="translate(${x0} ${y})">${cell(64, 26, k, { size: 12, tone: 'blue' })}</g><g transform="translate(${x0 + 70} ${y})">${cell(44, 26, String(v), { size: 13 })}</g>`;
    h += txt(x0 + 122, y + 17, z ? '（普通变量）' : '(plain variable)', 'bt-idx', 'start');
  });
  return h;
}
function logBox(lines, x0, y0, z) {
  let h = txt(x0, y0, z ? '这一步执行了' : 'This step', 'bt-lab', 'start');
  lines.slice(0, 9).forEach((l, i) => (h += txt(x0, y0 + 22 + i * 20, `· ${l}`, 'bt-cap', 'start')));
  if (lines.length > 9) h += txt(x0, y0 + 22 + 9 * 20, z ? `……还有 ${lines.length - 9} 条` : `… ${lines.length - 9} more`, 'bt-idx', 'start');
  return h;
}

function rwBoard(sim, snap, z) {
  const items = [];
  let h = txt(20, 150, z ? '进程' : 'Processes', 'bt-lab', 'start');
  sim.procs.forEach((p, i) => {
    const s = snap.st[p];
    const y = 164 + i * 58;
    h += `<g transform="translate(20 ${y})">${cell(60, 40, p, { size: 15, tone: p.startsWith('W') ? 'rose' : 'blue' })}</g>`;
    h += `<g transform="translate(88 ${y})">${cell(120, 40, stateText(s, 'rw', z), { size: 13, tone: toneOf(s), cls: s.state === 'blocked' ? 'hot' : '' })}</g>`;
  });
  items.push({ k: 'procs', x: 0, y: 0, html: h });
  // 共享文件
  const inside = sim.procs.filter((p) => snap.st[p].state === 'working');
  const writing = inside.some((p) => p.startsWith('W'));
  let f = txt(370, 150, z ? '共享文件' : 'Shared file', 'bt-lab', 'start');
  f += `<g transform="translate(370 164)">${cell(210, 210, '', { tone: writing ? 'rose' : inside.length ? 'green' : '', cls: inside.length ? 'hot' : 'dim' })}</g>`;
  f += txt(475, 196, inside.length ? (writing ? (z ? '正在写' : 'being written') : z ? `${inside.length} 个读者在读` : `${inside.length} reader(s)`) : z ? '没人' : 'empty', 'cw-lab');
  inside.forEach((p, j) => (f += `<g transform="translate(${395 + (j % 3) * 58} ${220 + Math.floor(j / 3) * 50})">${cell(50, 36, p, { size: 14, tone: p.startsWith('W') ? 'rose' : 'blue' })}</g>`));
  f += txt(475, 360, z ? '读可以一起，写必须独占' : 'Read together, write alone', 'bt-idx');
  items.push({ k: 'file', x: 0, y: 0, html: f });
  items.push({ k: 'sems', x: 0, y: 0, html: semTable(snap, 640, 180, z, [['count', snap.count]]) });
  items.push({ k: 'log', x: 0, y: 0, html: logBox(snap.log.map((x) => sentence(x, z)), 20, 420, z) });
  return items;
}

function dineBoard(sim, snap, z) {
  const items = [];
  const CX = 250;
  const CY = 330;
  const ang = (i) => ((-90 + i * 72) * Math.PI) / 180;
  const at = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  let h = `<circle cx="${CX}" cy="${CY}" r="100" style="fill:var(--panel-2);stroke:var(--line)"/>` + txt(CX, CY + 5, z ? '圆桌' : 'table', 'bt-idx');
  // 筷子 i 在哲学家 i 的左手边（角度减 36°）
  const holder = {};
  for (const p of sim.procs) for (const c of snap.st[p].held) holder[c] = p;
  for (let i = 0; i < N; i++) {
    const c = `c${i}`;
    const who = holder[c];
    let a = ang(i) - (36 * Math.PI) / 180;
    if (who) a += ((Number(who.slice(2)) === i ? 1 : -1) * 14 * Math.PI) / 180; // 被谁拿着就偏向谁
    const [x1, y1] = at(62, a);
    const [x2, y2] = at(118, a);
    h += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" style="stroke:${who ? 'var(--c-amber)' : 'var(--ink-3)'};stroke-width:${who ? 7 : 5};stroke-linecap:round"/>`;
    const [lx, ly] = at(140, ang(i) - (36 * Math.PI) / 180);
    h += txt(lx, ly + 4, c, 'bt-idx');
  }
  sim.procs.forEach((p, i) => {
    const s = snap.st[p];
    const [x, y] = at(178, ang(i));
    h += `<g transform="translate(${(x - 44).toFixed(1)} ${(y - 26).toFixed(1)})">${cell(88, 30, p, { size: 14, tone: toneOf(s) || 'blue', cls: s.state === 'blocked' || s.state === 'working' ? 'hot' : '' })}</g>`;
    h += txt(x, y + 22, stateText(s, 'dine', z), 'bt-cap');
  });
  if (snap.kind === 'deadlock') h += txt(CX, CY + 238, z ? '死锁：每人拿着一根，等着下一根' : 'Deadlock: everyone holds one and waits', 'cw-lab bad');
  items.push({ k: 'table', x: 0, y: 0, html: h });
  items.push({ k: 'sems', x: 0, y: 0, html: semTable(snap, 520, 150, z) });
  items.push({ k: 'log', x: 0, y: 0, html: logBox(snap.log.map((x) => sentence(x, z)), 520, 150 + (Object.keys(snap.val).length + 0.6) * 34, z) });
  return items;
}

function build(p, kit, ERR) {
  const sim = syncClassic(p);
  const rw = sim.ok && sim.family === 'rw';
  const lesson = shell('sync-classic', kit, ERR, sim, {
    where: W,
    tag: T('经典', 'Classic'),
    name: T('经典同步问题', 'Classic synchronisation problems'),
    full: T('读者—写者（读者优先、读写公平、count 与 mutex）· 哲学家进餐（死锁与三种解法）· 吸烟者', 'Readers–writers (readers first, fair) · dining philosophers (deadlock and fixes) · smokers'),
    title: NAME[p.problem] ?? T('经典同步问题', 'Classic problems'),
    legend: [['green', T('在临界区 / 吃饭', 'Inside / eating')], ['rose', T('阻塞', 'Blocked')], ['amber', T('拿着筷子', 'Holding')]],
    principle: PRINCIPLE,
    desc: T('读者—写者和哲学家进餐，每个进程真的按自己的程序执行 P、V：看读者怎样用 count 把写者挡在外面、写者为什么会饿死；看五个哲学家怎样一步步走进死锁，换一种拿法又怎样避开。', 'Each process really runs its P and V operations: watch readers lock out a writer with count, and five philosophers walk into deadlock — or avoid it.'),
    rect: rw ? [0, 120, 1000, 640] : [0, 100, 1000, 620],
  });
  if (!sim.ok) return lesson;
  const titleOf = (s) => {
    if (s.kind === 'init') return rw ? T('开始：谁都还没来', 'Start') : T('开始：都在思考', 'Start: all thinking');
    if (s.kind === 'arrive') return T(`${s.p} 到达`, `${s.p} arrives`);
    if (s.kind === 'leave') return T(`${s.p} ${s.p.startsWith('W') ? '写完' : '读完'}离开`, `${s.p} leaves`);
    if (s.kind === 'deadlock') return T(`第 ${s.round} 轮：死锁`, `Round ${s.round}: deadlock`);
    return T(`第 ${s.round} 轮`, `Round ${s.round}`);
  };
  const NOTE = {
    'rw-reader': T('注意第 4 步：写者 W1 先到、一直在等，后到的读者 R3 却直接进去读了——只要读者源源不断，写者就会饿死。', 'Step 4: R3 arrives after the waiting writer yet reads at once — writers can starve.'),
    'rw-fair': T('第 4 步 R3 到达时，W1 已经执行了 P(w)，R3 在 P(w) 上被挡住，排在写者后面：写者不会饿死。', 'R3 queues on w behind W1: the writer cannot starve.'),
    'dine-left': T('第 1 轮每人都拿起了左边的筷子；第 2 轮每人去拿右边的，全都阻塞——循环等待，死锁。', 'Round 1: every left chopstick taken; round 2: all block — a circular wait.'),
    'dine-odd': T('偶数号先拿右边，相邻两人先争同一根筷子，总有人能凑齐两根，没有死锁。', 'Neighbours contend for the same chopstick first, so someone always gets two.'),
    'dine-room': T('room = 4 只让 4 个人去拿筷子，5 根筷子分给 4 个人，至少有一个人能拿到两根，吃完放下后别人接着吃。', 'Only four reach for chopsticks, so someone always eats.'),
  };
  const list = sim.steps.map((s, k) => {
    const lines = s.log.map((x) => sentence(x, true));
    const linesEn = s.log.map((x) => sentence(x, false));
    return {
      title: titleOf(s),
      desc: rw ? T(`count = ${s.count}`, `count = ${s.count}`) : T(`${sim.procs.filter((q) => s.st[q].state === 'done').length} 人吃完`, `${sim.procs.filter((q) => s.st[q].state === 'done').length} done`),
      detail: s.kind === 'init' ? T(rw ? `信号量初值：${Object.entries(sim.sems).map(([a, b]) => `${a} = ${b}`).join('，')}；count = 0。` : `筷子 c0～c4 初值都是 1${sim.sems.room ? '，room = 4' : ''}。`, 'Initial values set.') : T(lines.join('；') + '。', linesEn.join('; ') + '.'),
      ref: rw ? 'rw' : 'dine',
      st: { k },
      row: { color: s.kind === 'deadlock' ? 'rose' : rw ? 'blue' : 'amber', what: titleOf(s), result: rw ? T(`count ${s.count}`, `count ${s.count}`) : '', tone: s.kind === 'deadlock' ? 'bad' : 'info' },
    };
  });
  const endTitle = sim.deadlock ? T('死锁了', 'Deadlock') : T(`先后顺序：${sim.order.join(' → ')}`, `Order: ${sim.order.join(' → ')}`);
  return finish(lesson, list, (st, z) => {
    const snap = sim.steps[st ? st.k : 0];
    return rw ? rwBoard(sim, snap, z) : dineBoard(sim, snap, z);
  }, endTitle, NOTE[sim.problem]);
}

export const makeSyncClassic = make('sync-classic', SPEC, ERR, build);
