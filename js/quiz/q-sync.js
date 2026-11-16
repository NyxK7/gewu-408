// 「经典同步问题」配的题：哲学家进餐哪种拿法会死锁、读者—写者谁先进去。答案由 syncclassic.js 真跑出来。
import { T } from '../core/i18n.js';
import { syncClassic } from '../subjects/os/syncclassic.js';
import { shuffled } from './kit.js';

const WAYS = {
  'dine-left': T('每人都先拿左边的筷子，再拿右边的', 'Everyone takes the left chopstick first'),
  'dine-odd': T('奇数号先拿左边、偶数号先拿右边', 'Odd ones left first, even ones right first'),
  'dine-room': T('用信号量 room = 4，拿筷子前先 P(room)', 'A semaphore room = 4, P(room) first'),
};

export const SYNC_QUESTIONS = [
  {
    id: 'os-sc-01',
    subject: 'os',
    chapter: 'process',
    topic: T('哲学家进餐与死锁', 'Dining philosophers and deadlock'),
    type: 'single',
    difficulty: 2,
    lessons: ['sync-classic'],
    tags: ['易错点'],
    conv: T('5 个哲学家、5 根筷子，每人要拿到左右两根才能吃。', 'Five philosophers, five chopsticks; two are needed to eat.'),
    make(r) {
      const dead = Object.keys(WAYS).filter((k) => syncClassic({ problem: k }).deadlock);
      const safe = Object.keys(WAYS).filter((k) => !dead.includes(k));
      const askDead = r.next() < 0.5;
      // 问「会死锁的是」时只有一个对的；问「不会死锁的是」时从安全的里挑一个，另一个安全的不放进选项
      const right = askDead ? r.pick(dead) : r.pick(safe);
      const wrongs = askDead ? safe.map((k) => WAYS[k]) : dead.map((k) => WAYS[k]);
      const extra = askDead ? [T('用一个 mutex 把「拿左边、拿右边」包起来，两根一起拿', 'Take both chopsticks inside one mutex')] : [T('每人都先拿右边的筷子，再拿左边的', 'Everyone takes the right chopstick first'), T('拿到左边的筷子后，忙等右边的筷子', 'Busy-wait for the right chopstick after taking the left')];
      const { options, answer } = shuffled(r, WAYS[right], [...wrongs, ...extra].slice(0, 3));
      return {
        question: askDead ? T('哲学家进餐问题中，下面哪种做法可能发生死锁？', 'Which approach can deadlock?') : T('哲学家进餐问题中，下面哪种做法一定不会发生死锁？', 'Which approach cannot deadlock?'),
        options,
        answer,
        steps: [
          { text: T('如果 5 个人都先拿同一侧的筷子，可能每人各拿到一根、都在等下一根：循环等待，死锁。', 'If all take the same side first, each may hold one and wait for the next: a circular wait.'), go: { lesson: 'sync-classic', params: { problem: 'dine-left' }, step: 2 } },
          { text: T('奇偶分开拿让相邻两人先争同一根筷子；限制最多 4 人上桌让 5 根筷子分给 4 个人。两种都破坏了循环等待，总有人能吃完放下筷子。', 'Odd/even ordering and the four-seat limit both break the cycle.'), go: { lesson: 'sync-classic', doc: 'dine' } },
        ],
      };
    },
  },
  {
    id: 'os-sc-02',
    subject: 'os',
    chapter: 'process',
    topic: T('读者—写者：谁先进去', 'Readers–writers: who goes first'),
    type: 'single',
    difficulty: 2,
    lessons: ['sync-classic'],
    tags: ['过程推演'],
    make(r) {
      const problem = r.pick(['rw-reader', 'rw-fair']);
      const s = syncClassic({ problem });
      const first = s.order.indexOf('W1') < s.order.indexOf('R3') ? 'W1' : 'R3';
      const name = problem === 'rw-reader' ? T('读者优先', 'readers-first') : T('读写公平（多一个信号量 w）', 'fair (extra semaphore w)');
      const { options, answer } = shuffled(r, first === 'R3' ? T('R3 先读，W1 等所有读者走完才写', 'R3 reads first; W1 waits for all readers') : T('W1 先写，R3 等 W1 写完再读', 'W1 writes first; R3 waits'), [first === 'R3' ? T('W1 先写，R3 等 W1 写完再读', 'W1 writes first; R3 waits') : T('R3 先读，W1 等所有读者走完才写', 'R3 reads first; W1 waits for all readers'), T('R3 和 W1 同时进去', 'R3 and W1 enter together'), T('R3 和 W1 都永远进不去', 'Neither ever enters')]);
      const k = s.steps.findIndex((x) => x.kind === 'arrive' && x.p === 'R3');
      return {
        question: T(`用${name.zh}的读者—写者算法。读者 R1、R2 正在读文件，写者 W1 到达，接着读者 R3 到达；之后读者依次读完离开。R3 和 W1 谁先进入文件？`, `Using the ${name.en} algorithm: R1 and R2 are reading, W1 arrives, then R3. Who gets in first, R3 or W1?`),
        options,
        answer,
        steps: [
          { text: problem === 'rw-reader' ? T('读者优先：R1、R2 在读时 count ≠ 0，R3 不用 P(rw)，直接进去读；W1 在 P(rw) 上等，要等 count 降到 0、最后一个读者 V(rw) 才能写。', 'Readers-first: R3 skips P(rw) and reads; W1 waits until the last reader leaves.') : T('读写公平：W1 到达时先执行了 P(w)，R3 到达时在 P(w) 上被挡住，排在 W1 后面；W1 写完 V(w)，R3 才进去。', 'Fair: W1 holds w, so R3 blocks on P(w) behind it.'), go: { lesson: 'sync-classic', params: { problem }, step: k } },
          { text: T(`实际进入文件的顺序：${s.order.join(' → ')}。`, `Order: ${s.order.join(' → ')}.`), go: { lesson: 'sync-classic', doc: 'rw' } },
        ],
      };
    },
  },
];
