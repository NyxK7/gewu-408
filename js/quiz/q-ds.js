// 数据结构的试点题：循环队列、散列表。生成题的答案都由课程用的同一份计算代码得出。
import { T } from '../core/i18n.js';
import { simulate as hashSim } from '../subjects/ds/hash.js';
import { cqueue } from '../subjects/ds/linear.js';
import { shuffled } from './kit.js';

const CQ_DEMO = { m: 5, ops: '+a +b +c +d +e - - +e +f' };
const CQ_CONV = T('front 指向队头元素，rear 指向队尾元素的下一个位置；牺牲一个单元区分队空和队满，下标从 0 开始。', 'front points at the head; rear points one past the tail; one slot is left empty to tell full from empty; indices start at 0.');

/** 随机一串入队 / 出队操作，保证中间至少绕回一次 */
function cqOps(r, m) {
  for (;;) {
    const ops = [];
    let len = 0;
    let c = 0;
    const n = r.int(8, 11);
    for (let i = 0; i < n; i++) {
      const enq = len === 0 || (len < m - 1 && r.next() < 0.62);
      if (enq) {
        ops.push('+' + String.fromCharCode(97 + c++));
        len++;
      } else {
        ops.push('-');
        len--;
      }
    }
    const sim = cqueue({ m, ops: ops.join(' ') });
    const wrapped = sim.steps.some((s, i) => i > 0 && (s.rear < s.before.rear || s.front < s.before.front));
    if (wrapped) return { ops: ops.join(' '), sim };
  }
}

export const DS_QUESTIONS = [
  {
    id: 'ds-cq-01',
    subject: 'ds',
    chapter: 'stack',
    topic: T('循环队列', 'Circular queues'),
    type: 'single',
    difficulty: 2,
    lessons: ['cqueue'],
    tags: ['过程推演'],
    conv: CQ_CONV,
    make(r) {
      const m = r.int(5, 7);
      const { ops, sim } = cqOps(r, m);
      const last = sim.steps.at(-1);
      const pair = (f, b) => `front = ${f}，rear = ${b}`;
      const pairEn = (f, b) => `front = ${f}, rear = ${b}`;
      const cand = [
        [last.rear, last.front],
        [last.front, (last.rear + 1) % m],
        [(last.front + 1) % m, last.rear],
        [last.front, (last.rear + m - 1) % m],
        [(last.front + m - 1) % m, last.rear],
      ];
      const seen = new Set([`${last.front},${last.rear}`]);
      const wrongs = [];
      for (const [f, b] of cand) {
        if (seen.has(`${f},${b}`)) continue;
        seen.add(`${f},${b}`);
        wrongs.push([f, b]);
        if (wrongs.length === 3) break;
      }
      const right = [last.front, last.rear];
      const { options, answer } = shuffled(r, right, wrongs);
      const params = { m, ops };
      return {
        question: T(`一个容量为 ${m} 的循环队列，开始时 front = rear = 0。依次执行下面的操作（+x 表示 x 入队，- 表示出队）：\`${ops}\`。全部执行完后，front 和 rear 分别是多少？`, `A circular queue with ${m} slots starts with front = rear = 0. Run these operations (+x enqueues x, - dequeues): \`${ops}\`. What are front and rear afterwards?`),
        options: options.map(([f, b]) => T(pair(f, b), pairEn(f, b))),
        answer,
        steps: [
          ...sim.steps.map((s, i) => ({
            text: s.op === 'enq'
              ? T(`${s.x} 入队：放在 Q[${s.before.rear}]，rear 变成 (${s.before.rear} + 1) % ${m} = ${s.rear}。`, `Enqueue ${s.x} into Q[${s.before.rear}]; rear becomes ${s.rear}.`)
              : T(`出队 ${s.x}：front 变成 (${s.before.front} + 1) % ${m} = ${s.front}。`, `Dequeue ${s.x}; front becomes ${s.front}.`),
            go: { lesson: 'cqueue', params, step: i },
          })),
          { text: T(`最后 front = ${last.front}，rear = ${last.rear}，队中有 (rear − front + m) % m = ${last.len} 个元素。`, `Finally front = ${last.front}, rear = ${last.rear}, holding ${last.len} element(s).`) },
        ],
      };
    },
  },
  {
    id: 'ds-cq-02',
    subject: 'ds',
    chapter: 'stack',
    topic: T('循环队列', 'Circular queues'),
    type: 'single',
    difficulty: 1,
    lessons: ['cqueue'],
    tags: ['概念'],
    conv: CQ_CONV,
    question: T('按题目给出的约定，判断循环队列「已满」的条件是：', 'Under the stated convention, the queue is full when:'),
    options: ['front == rear', '(rear + 1) % m == front', '(front + 1) % m == rear', 'rear == m − 1'],
    answer: 1,
    steps: [
      { text: T('front == rear 已经用来表示「队空」，不能再表示「队满」。', 'front == rear already means empty, so it cannot also mean full.'), go: { lesson: 'cqueue', doc: 'full' } },
      { text: T('所以故意空出一个单元：rear 再往前走一步就追上 front，即 (rear + 1) % m == front，就算满了。', 'So one slot stays empty: the queue is full when rear is one step behind front, (rear + 1) % m == front.'), go: { lesson: 'cqueue', params: CQ_DEMO, step: 4 } },
      { text: T('rear == m − 1 只说明 rear 到了数组末尾，循环队列还会绕回 0，并不代表满。', 'rear == m − 1 only means rear reached the end of the array; it wraps around.') },
    ],
  },
  {
    id: 'ds-cq-03',
    subject: 'ds',
    chapter: 'stack',
    topic: T('循环队列', 'Circular queues'),
    type: 'judge',
    difficulty: 1,
    lessons: ['cqueue'],
    tags: ['易错点'],
    conv: CQ_CONV,
    question: T('数组有 m 个单元的循环队列，按这种约定最多能存放 m 个元素。', 'With this convention, an m-slot circular queue holds at most m elements.'),
    answer: false,
    steps: [
      { text: T('为了区分队空和队满，总要空着一个单元，所以最多只能放 m − 1 个元素。', 'One slot always stays empty to tell full from empty, so it holds at most m − 1.'), go: { lesson: 'cqueue', params: CQ_DEMO, step: 4 } },
      { text: T('如果想放满 m 个，就要另设一个计数器 size 或者一个标志位 tag。', 'Using all m slots needs an extra size counter or a tag flag.'), go: { lesson: 'cqueue', doc: 'full' } },
    ],
  },
  {
    id: 'ds-hash-01',
    subject: 'ds',
    chapter: 'search',
    topic: T('散列表与 ASL', 'Hash tables and ASL'),
    type: 'number',
    difficulty: 2,
    lessons: ['hashing'],
    tags: ['计算'],
    conv: T('用线性探测法处理冲突；各关键字查找概率相等；查找成功的比较次数等于插入它时的探测次数。', 'Linear probing; equal probabilities; a successful search costs as many probes as the insertion did.'),
    make(r) {
      const p = r.pick([7, 11]);
      const m = p === 7 ? r.int(8, 10) : r.int(12, 13);
      for (;;) {
        const keys = r.distinct(r.int(6, 7), 1, 99);
        const params = { keys, m, p, a: 1, method: 'linear' };
        const sim = hashSim(params);
        if (!sim.ok || sim.steps.every((s) => s.probes === 1)) continue;
        const [sum, n] = sim.succ;
        return {
          question: T(`散列表长 ${m}，散列函数 H(key) = key mod ${p}，按顺序插入 ${keys.join('、')}。查找成功时的平均查找长度是多少？（可以写成分数，如 9/7）`, `Table size ${m}, H(key) = key mod ${p}; insert ${keys.join(', ')} in order. What is the average successful search length? (A fraction such as 9/7 is fine.)`),
          answer: { value: sum / n, tol: 0.006, show: `${sum}/${n}` },
          steps: [
            ...sim.steps.map((s, i) => ({
              text: s.probes === 1
                ? T(`${s.key} mod ${p} = ${s.h}，${s.h} 号空着，直接放入，比较 1 次。`, `${s.key} mod ${p} = ${s.h}: free, 1 probe.`)
                : T(`${s.key} mod ${p} = ${s.h}，被占了，依次探测 ${s.path.join(' → ')}，放入 ${s.slot} 号，比较 ${s.probes} 次。`, `${s.key} mod ${p} = ${s.h} is taken; probe ${s.path.join(' → ')}, placed at ${s.slot}: ${s.probes} probes.`),
              go: { lesson: 'hashing', params, step: i },
            })),
            { text: T(`ASL成功 = (${sim.steps.map((s) => s.probes).join(' + ')}) ÷ ${n} = ${sum}/${n}。`, `ASL = (${sim.steps.map((s) => s.probes).join(' + ')}) ÷ ${n} = ${sum}/${n}.`), go: { lesson: 'hashing', params, step: sim.steps.length } },
          ],
        };
      }
    },
  },
  {
    id: 'ds-hash-02',
    subject: 'ds',
    chapter: 'search',
    topic: T('散列表与 ASL', 'Hash tables and ASL'),
    type: 'number',
    difficulty: 3,
    lessons: ['hashing'],
    tags: ['计算', '易错点'],
    conv: T('用线性探测法处理冲突；查找失败时，和空位置的比较也算一次；H 的每个取值等概率。', 'Linear probing; reaching the empty slot counts as a comparison; every hash value is equally likely.'),
    make(r) {
      const p = 7;
      const m = r.int(9, 10);
      for (;;) {
        const keys = r.distinct(6, 1, 60);
        const params = { keys, m, p, a: 1, method: 'linear' };
        const sim = hashSim(params);
        if (!sim.ok || sim.steps.every((s) => s.probes === 1)) continue;
        const [sum] = sim.fail;
        return {
          question: T(`散列表长 ${m}（地址 0～${m - 1}），H(key) = key mod ${p}，依次插入 ${keys.join('、')}。查找失败时的平均查找长度是多少？`, `Table size ${m} (slots 0–${m - 1}), H(key) = key mod ${p}; insert ${keys.join(', ')}. What is the average unsuccessful search length?`),
          answer: { value: sum / p, tol: 0.006, show: `${sum}/${p}` },
          steps: [
            { text: T(`先建好表（和课程里一样一个个插入）。`, 'Build the table first.'), go: { lesson: 'hashing', params, step: keys.length - 1 } },
            ...sim.failRows.map((f) => ({ text: T(`H = ${f.h}：依次探测 ${f.path.join(' → ')}，到空位置为止，比较 ${f.count} 次。`, `H = ${f.h}: probe ${f.path.join(' → ')} until empty, ${f.count} comparisons.`) })),
            { text: T(`分母是 H 能取到的值的个数 p = ${p}，不是表长 ${m}：ASL失败 = ${sum}/${p}。`, `The denominator is p = ${p}, not the table size ${m}: ASL = ${sum}/${p}.`), go: { lesson: 'hashing', params, step: keys.length + 1 } },
          ],
        };
      }
    },
  },
  {
    id: 'ds-hash-03',
    subject: 'ds',
    chapter: 'search',
    topic: T('散列表与 ASL', 'Hash tables and ASL'),
    type: 'multi',
    difficulty: 2,
    lessons: ['hashing'],
    tags: ['概念'],
    question: T('关于处理冲突的方法，下列说法正确的有：', 'Which statements about collision handling are true?'),
    options: [
      T('线性探测法容易让散列地址不同的关键字也争夺同一个后继地址（聚集）', 'Linear probing lets keys with different home slots compete for the same next slots (clustering)'),
      T('拉链法中，散列到同一地址的关键字挂在同一条链上，不会占用别的地址', 'With chaining, keys hashing to one slot share a list and never take other slots'),
      T('装填因子越大，发生冲突的可能性一般越小', 'A larger load factor usually means fewer collisions'),
      T('开放定址法中，不能直接把被删关键字的位置置空，否则会截断其他关键字的探测路径', 'With open addressing, a deleted slot cannot simply be emptied, or later probe paths break'),
    ],
    answer: [0, 1, 3],
    steps: [
      { text: T('线性探测时，冲突的关键字会占用后面的空位，后面本该放在那里的关键字又被挤走，形成一片连续的「堆积」。', 'Linear probing fills the following slots, pushing later keys further on: a cluster forms.'), go: { lesson: 'hashing', doc: 'open' } },
      { text: T('拉链法把同义词放在一条链上，各条链互不干扰。', 'Chaining keeps synonyms on one list, independent of other lists.'), go: { lesson: 'hashing', doc: 'chain' } },
      { text: T('装填因子 = 关键字个数 ÷ 表长，越大表越满，冲突越多，第 3 项说反了。', 'Load factor = keys ÷ slots; the fuller the table, the more collisions, so statement 3 is backwards.') },
      { text: T('查找时遇到空位置就判定失败；如果把被删的位置直接置空，后面的关键字就再也找不到了，所以只能做删除标记。', 'A search stops at an empty slot, so emptying a deleted slot would hide keys behind it; mark it deleted instead.') },
    ],
  },
];
