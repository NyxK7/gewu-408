// 操作系统第三批题：位示图（之前没有题的课）。答案由课程的 update 算出。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;

/** 随机位示图：rows 行 × 16 位，前面几行比较满 */
function randUsed(r, rows, n, base) {
  const used = [];
  for (let x = 0; x < rows * n; x++) if (r.next() < (x < n * 2 ? 0.75 : 0.25)) used.push(x + base);
  return used;
}

export const OS_QUESTIONS3 = [
  {
    id: 'os-bm-01',
    subject: 'os',
    chapter: 'file',
    topic: T('位示图分配盘块', 'Allocating with a bitmap'),
    type: 'text',
    difficulty: 2,
    lessons: ['bitmap'],
    tags: ['过程推演'],
    conv: T('位示图每行 16 位，按行优先排列；0 表示空闲、1 表示已分配；分配时按行优先找最前面的空闲位。', '16 bits per row, row-major; 0 free, 1 used; allocate the first free bits.'),
    make(r) {
      const rows = 4;
      const n = 16;
      const b0 = r.int(0, 1);
      const used = randUsed(r, rows, n, b0);
      const k = r.int(2, 3);
      const params = { rows, n, base: b0, used, ops: `+${k}` };
      const l = L('bitmap', params);
      const st = l.sim.steps[0];
      const rowsTxt = Array.from({ length: rows }, (_, i) => l.sim.init.slice(i * n, i * n + n).join('')).join(' / ');
      const blocks = st.blocks.map((x) => x.b);
      return {
        question: T(`某磁盘用位示图管理空闲块，盘块号、行号、列号都从 ${b0} 开始。前 ${rows} 行依次是：${rowsTxt}。现在要分配 ${k} 个盘块，分到的盘块号是？`, `Bitmap rows (numbering from ${b0}): ${rowsTxt}. Allocate ${k} blocks: which block numbers?`),
        answer: {
          accept: [blocks.join(','), blocks.join('，'), blocks.join(' '), blocks.join('、')],
          show: blocks.join(', '),
        },
        steps: [
          {
            text: T(`按行优先找最前面的 ${k} 个 0：${st.blocks.map((x) => `第 ${x.i} 行第 ${x.j} 列`).join('、')}。`, st.blocks.map((x) => `row ${x.i} col ${x.j}`).join(', ')),
            go: { lesson: 'bitmap', params, step: last(l) },
          },
          {
            text: T(`盘块号 b = 16 × (i − ${b0}) + (j − ${b0}) + ${b0}，得到 ${blocks.join('、')}。`, `b = 16(i − ${b0}) + (j − ${b0}) + ${b0}: ${blocks.join(', ')}.`),
            go: { lesson: 'bitmap', doc: 'bitmap' },
          },
        ],
      };
    },
  },
  {
    id: 'os-bm-02',
    subject: 'os',
    chapter: 'file',
    topic: T('位示图回收盘块', 'Freeing with a bitmap'),
    type: 'text',
    difficulty: 1,
    lessons: ['bitmap'],
    tags: ['计算'],
    make(r) {
      const n = r.pick([16, 32]);
      const rows = 8;
      const b0 = r.int(0, 1);
      const b = r.int(n + b0, rows * n - 1 + b0);
      const params = { rows, n, base: b0, used: [b], ops: `-${b}` };
      const l = L('bitmap', params);
      const { i, j } = l.sim.steps[0].rc;
      return {
        question: T(`位示图每行 ${n} 位，盘块号、行号、列号都从 ${b0} 开始。回收 ${b} 号盘块时，要把第几行第几列的位清 0？（按「行,列」作答）`, `${n} bits per row, numbering from ${b0}. Freeing block ${b}: which row and column? (answer “row,col”)`),
        answer: {
          accept: [`${i},${j}`, `${i}，${j}`, `(${i},${j})`, `（${i}，${j}）`, `${i} ${j}`, `${i}行${j}列`],
          show: `${i}, ${j}`,
        },
        steps: [
          {
            text: T(`行号 i = ⌊(${b} − ${b0}) / ${n}⌋ + ${b0} = ${i}；列号 j = (${b} − ${b0}) mod ${n} + ${b0} = ${j}。`, `i = ${i}, j = ${j}.`),
            go: { lesson: 'bitmap', doc: 'ops' },
          },
          {
            text: T(`把第 ${i} 行第 ${j} 列置 0，这个盘块就空闲了。`, `Clear row ${i} col ${j}.`),
            go: { lesson: 'bitmap', params, step: last(l) },
          },
        ],
      };
    },
  },
];
