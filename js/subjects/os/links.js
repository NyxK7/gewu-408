// 硬链接与软链接的纯计算：在目录 /home/ming 里建硬链接 b、软链接 c 指向 a.txt，再按场景删除 / 重建，
// 每一步记下目录项、各个 inode（类型、链接计数、内容）以及通过 b、c 访问时的解析过程。
//
// 约定（界面上写明）：
//   · 只看一个目录 /home/ming；软链接里存的是绝对路径 /home/ming/a.txt；
//   · 链接计数记在 inode 里；删除（rm / unlink）= 删目录项 + 计数减 1，减到 0 才回收 inode 和数据块；
//   · 访问时按名字查目录；遇到软链接，就读出里面的路径从头再查一遍。

const err = (e) => ({ ok: false, errors: [e] });
export const DIR = '/home/ming';
export const SCENES = ['orig', 'both', 'recreate', 'hard'];

export function links({ scene = 'orig' }) {
  if (!SCENES.includes(scene)) return err('scene');
  const dir = [['a.txt', 37]];
  const inodes = {
    37: { ino: 37, type: 'file', nlink: 1, data: 'v1', blocks: [310, 311] },
  };
  const freed = [];
  const steps = [];
  const snap = () => ({ dir: dir.map((e) => [...e]), inodes: Object.fromEntries(Object.entries(inodes).map(([k, v]) => [k, { ...v, blocks: [...v.blocks] }])), freed: [...freed] });
  const push = (kind, extra = {}) => steps.push({ kind, ...snap(), ...extra });

  // 按名字解析，记下每一步；软链接最多跟 8 层
  const resolve = (name, depth = 0) => {
    const chain = [];
    let cur = name;
    for (let hop = 0; hop < 8; hop++) {
      const e = dir.find((x) => x[0] === cur);
      chain.push({ look: cur, found: e ? e[1] : null });
      if (!e) return { ok: false, chain, lookups: chain.length };
      const n = inodes[e[1]];
      if (n.type !== 'link') return { ok: true, chain, ino: n.ino, data: n.data, lookups: chain.length };
      cur = n.data.split('/').pop(); // 绝对路径的最后一级，都在 /home/ming 里
      chain.at(-1).follow = n.data;
    }
    return { ok: false, chain, loop: true, lookups: chain.length };
  };
  const access = () => ['b', 'c'].map((via) => ({ via, ...resolve(via) }));
  const add = (name, ino) => {
    dir.push([name, ino]);
    inodes[ino].nlink++;
  };
  const rm = (name) => {
    const i = dir.findIndex((e) => e[0] === name);
    const ino = dir[i][1];
    dir.splice(i, 1);
    const n = inodes[ino];
    n.nlink--;
    let gone = false;
    if (n.nlink === 0) {
      freed.push({ ino, blocks: [...n.blocks] });
      delete inodes[ino];
      gone = true;
    }
    return { name, ino, gone, left: gone ? 0 : n.nlink };
  };

  push('init', { access: null });
  add('b', 37);
  push('hard', { entry: 'b', ino: 37 });
  inodes[52] = { ino: 52, type: 'link', nlink: 0, data: `${DIR}/a.txt`, blocks: [530] };
  add('c', 52);
  push('soft', { entry: 'c', ino: 52 });
  push('access', { access: access(), when: 'before' });
  if (scene === 'hard') {
    push('rm', { ...rm('b') });
  } else {
    push('rm', { ...rm('a.txt') });
    if (scene === 'both') push('rm', { ...rm('b') });
    if (scene === 'recreate') {
      inodes[60] = { ino: 60, type: 'file', nlink: 0, data: 'v2', blocks: [540] };
      add('a.txt', 60);
      push('create', { entry: 'a.txt', ino: 60 });
    }
  }
  const after = access();
  push('access', { access: after, when: 'after' });
  return { ok: true, scene, steps, after, final: inodes, freed };
}
