// 「硬链接与软链接」：左边是目录 /home/ming 的目录项，中间是 inode（带链接计数），右边是通过 b、c 访问时的解析链。
// 硬链接是又一个目录项指向同一个 inode；软链接是一个新 inode，里面存的是路径——虚线指回的是「名字」而不是 inode。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { DIR, links } from './links.js';

const W = [['os', 'file']];
const DX = 40;
const DY = 170;
const RS = 50; // 目录项行距
const IX = 340;
const IS = 120; // inode 卡片间距
const CW = 250;
const CH = 100;
const AX = 620;
const DATA = { v1: T('第一版内容', 'version 1'), v2: T('新文件的内容', 'the new file') };

const PRINCIPLE = {
  sections: [
    {
      id: 'share',
      title: T('文件共享的两种办法', 'Two ways to share a file'),
      blocks: [
        { p: T('几个用户（或几个目录）要用同一个文件，不必各存一份。办法有两种：', 'Several directories can share one file in two ways:') },
        { list: [
          T('**基于索引结点（硬链接）**：几个目录项直接指向同一个 inode，inode 里用**链接计数**记有几个目录项指向它。', '**Hard links**: several entries point at one inode, which keeps a **link count**.'),
          T('**利用符号链（软链接）**：新建一个类型为「链接」的小文件，里面只存被共享文件的路径名。访问时系统读出路径，再按路径去找。', '**Symbolic links**: a small file of type “link” holding a path name, resolved on access.'),
        ] },
        { tip: T('有了共享，目录结构就从树变成了**有向无环图**：一个文件可以有多个父目录。', 'Sharing turns the directory tree into a **directed acyclic graph**.') },
      ],
    },
    {
      id: 'hard',
      title: T('硬链接', 'Hard links'),
      blocks: [
        { list: [
          T('建立：在目录里加一个目录项，填上同一个 inode 号；链接计数加 1。不复制数据，也没有新 inode。', 'Creating one adds an entry with the same inode number and increments the count.'),
          T('删除：删掉这个目录项，计数减 1；**减到 0 才真正回收** inode 和数据块。所以几个名字没有主次之分，删哪一个都不影响其余的。', 'Deleting removes the entry and decrements the count; the file is freed only at 0.'),
          T('限制：不能跨文件系统（inode 号只在本文件系统里有意义）；一般不允许给目录建硬链接（会形成环）。', 'Limits: same file system only; normally not for directories.'),
        ] },
        { warn: T('文件主删除共享文件时，如果计数还大于 0，只能删掉自己的目录项，文件留给其他人用；但这时文件的主人仍记作原来的用户。', 'If the owner deletes a shared file while the count is above 0, only the owner’s entry goes.') },
      ],
    },
    {
      id: 'soft',
      title: T('软链接（符号链接）', 'Symbolic links'),
      blocks: [
        { list: [
          T('它是一个独立的文件，有自己的 inode，内容就是一个路径名。被链接文件的 inode 计数不变。', 'It is a separate file with its own inode; the target’s count is unchanged.'),
          T('访问时先读到链接本身，取出路径再查一遍目录，所以比硬链接**多访盘**。', 'Access reads the link and resolves the path again: **more disk reads**.'),
          T('它认的是**名字**：原文件删掉，链接就悬空（找不到）；之后再建一个同名文件，链接又能用了，但指到的是新文件。', 'It refers to a **name**: deleting the target leaves it dangling; recreating the name revives it with the new file.'),
          T('可以跨文件系统，也可以指向目录；甚至可以指向网络上的文件。', 'It can cross file systems and point to directories.'),
        ] },
      ],
    },
    {
      id: 'compare',
      title: T('对比', 'Comparison'),
      blocks: [
        {
          table: {
            head: ['', T('硬链接', 'Hard link'), T('软链接', 'Symbolic link')],
            rows: [
              [T('新建 inode', 'New inode'), T('不建', 'no'), T('建（类型是链接）', 'yes (type link)')],
              [T('目标的链接计数', 'Target count'), T('加 1', '+1'), T('不变', 'unchanged')],
              [T('指向', 'Refers to'), T('inode', 'the inode'), T('路径名', 'a path name')],
              [T('删除原文件后', 'After deleting the original'), T('照样能用', 'still works'), T('悬空', 'dangles')],
              [T('跨文件系统 / 指向目录', 'Across file systems / directories'), T('不行', 'no'), T('可以', 'yes')],
              [T('访问开销', 'Access cost'), T('和原文件一样', 'same as the original'), T('多一轮路径查找', 'one more lookup')],
            ],
          },
        },
      ],
    },
    pit([
      T('建硬链接不会产生新文件，计数是记在 inode（索引结点）里的，不在目录项里。', 'The link count lives in the inode, not in the entry.'),
      T('rm 删的是目录项；只有计数变成 0 时文件才被删除。', 'rm removes an entry; the file goes only when the count hits 0.'),
      T('软链接本身的 inode 计数和被链接文件无关。', 'A symlink’s own count is unrelated to its target.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('删掉原文件 a.txt', 'Delete the original a.txt'), set: { scene: 'orig' } },
    { label: T('a.txt 和硬链接 b 都删掉', 'Delete a.txt and b'), set: { scene: 'both' } },
    { label: T('删掉 a.txt 后再建一个同名文件', 'Delete a.txt, then create a new one'), set: { scene: 'recreate' } },
    { label: T('只删硬链接 b', 'Delete only b'), set: { scene: 'hard' } },
  ],
  groups: [{ legend: T('先 ln a.txt b，再 ln -s a.txt c，然后', 'After ln a.txt b and ln -s a.txt c'), fields: [
    { name: 'scene', label: T('做什么', 'Then'), type: 'select', options: [['orig', T('rm a.txt', 'rm a.txt')], ['both', T('rm a.txt，再 rm b', 'rm a.txt, rm b')], ['recreate', T('rm a.txt，再新建 a.txt', 'rm a.txt, new a.txt')], ['hard', T('rm b', 'rm b')]], wide: true },
  ] }],
  note: T(`都在目录 ${DIR} 里；软链接 c 存的是绝对路径 ${DIR}/a.txt。`, `All in ${DIR}; c stores ${DIR}/a.txt.`),
};
const ERR = { scene: T('场景不对', 'Unknown scenario') };

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : sim.steps[0];
  const kind = st ? s.kind : 'pre';
  const inos = Object.keys(s.inodes).map(Number).sort((a, b) => a - b);
  const cardY = (ino) => DY + inos.indexOf(ino) * IS;
  const rowY = (i) => DY + i * RS;
  const hotEntry = ['hard', 'soft', 'create'].includes(kind) ? s.entry : null;

  // 目录项
  let dh = txt(0, -14, z ? `目录 ${DIR}` : `Directory ${DIR}`, 'bt-lab', 'start');
  s.dir.forEach(([nm, ino], i) => {
    const tone = nm === hotEntry ? 'amber' : s.inodes[ino].type === 'link' ? 'violet' : 'blue';
    dh += `<g transform="translate(0 ${i * RS})">${cell(140, 40, nm, { size: 15, tone, cls: nm === hotEntry ? 'hot' : '' })}<g transform="translate(146 0)">${cell(70, 40, String(ino), { size: 14, cls: 'dim' })}</g></g>`;
  });
  if (kind === 'rm') dh += txt(0, s.dir.length * RS + (s.name === 'a.txt' && s.inodes[52] ? 66 : 22), z ? `目录项 ${s.name} 已删除` : `entry ${s.name} removed`, 'cw-lab bad l', 'start');
  items.push({ k: 'dir', x: DX, y: DY, html: dh });

  // 目录项 → inode 的箭头
  let ah = '';
  s.dir.forEach(([nm, ino], i) => {
    ah += arrow(DX + 220, rowY(i) + 20, IX - 4, cardY(ino) + CH / 2, nm === hotEntry ? 'acc' : s.inodes[ino].type === 'link' ? 'cs-b' : '');
  });
  // 软链接：从 inode 52 虚线指回目录项「a.txt」（认名字）
  if (s.inodes[52]) {
    const target = s.dir.findIndex(([nm]) => nm === 'a.txt');
    const y0 = cardY(52) + CH - 16;
    const xr = IX - 40;
    const ty = target >= 0 ? rowY(target) + 34 : rowY(s.dir.length) + 20;
    const cls = target >= 0 ? 'cs-b dash' : 'bad dash';
    ah += `<g class="barw ${cls}"><line x1="${IX}" y1="${y0}" x2="${xr}" y2="${y0}"/><line x1="${xr}" y1="${y0}" x2="${xr}" y2="${ty}"/></g>` + arrow(xr, ty, target >= 0 ? DX + 222 : DX + 144, ty, cls);
    if (target < 0) ah += `<g transform="translate(${DX} ${ty - 20})">${cell(140, 40, z ? 'a.txt ？' : 'a.txt ?', { size: 13, tone: 'rose' })}</g>`;
  }
  items.push({ k: 'arr', x: 0, y: 0, html: ah });

  // inode 卡片
  let ih = txt(0, -14, 'inode', 'bt-lab', 'start');
  for (const ino of inos) {
    const n = s.inodes[ino];
    const hot = (kind === 'hard' && ino === 37) || (['soft', 'create'].includes(kind) && ino === s.ino) || (kind === 'rm' && ino === s.ino);
    const y = cardY(ino) - DY;
    const isLink = n.type === 'link';
    ih += `<g transform="translate(0 ${y})">${cell(CW, CH, '', { tone: isLink ? 'violet' : 'blue', cls: hot ? 'hot' : '' })}`;
    ih += txt(14, 24, `inode ${ino} · ${isLink ? (z ? '符号链接' : 'symlink') : z ? '普通文件' : 'file'}`, 'bt-lab', 'start');
    if (isLink) ih += txt(14, 52, z ? `内容：${n.data}` : `holds: ${n.data}`, 'ar-mono', 'start');
    else ih += txt(14, 52, z ? `数据块 ${n.blocks.join('、')}：${DATA[n.data].zh}` : `blocks ${n.blocks.join(', ')}: ${DATA[n.data].en}`, 'ar-mono', 'start');
    if (!isLink) ih += `<g transform="translate(14 64)">${cell(150, 28, z ? `链接计数 ${n.nlink}` : `link count ${n.nlink}`, { size: 14, tone: hot && kind !== 'create' ? 'amber' : '', cls: hot ? 'hot' : '' })}</g>`;
    else ih += txt(14, 82, z ? `（c 的数据块 ${n.blocks[0]}）` : `(block ${n.blocks[0]})`, 'bt-idx', 'start');
    ih += '</g>';
  }
  if (s.freed.length) ih += txt(0, inos.length * IS + 10, s.freed.map((f) => (z ? `已回收 inode ${f.ino} 和块 ${f.blocks.join('、')}` : `freed inode ${f.ino}, blocks ${f.blocks.join(', ')}`)).join('；'), 'cw-lab bad l', 'start');
  items.push({ k: 'ino', x: IX, y: DY, html: ih });

  // 访问：b 和 c 的解析链
  let xh = '';
  if (kind === 'access') {
    xh += txt(0, -14, s.when === 'before' ? (z ? '现在读 b 和 c' : 'Reading b and c now') : z ? '最后再读 b 和 c' : 'Reading b and c at the end', 'bt-lab', 'start');
    s.access.forEach((a, col) => {
      const chips = [];
      for (const c of a.chain) {
        chips.push({ t: z ? `查目录：${c.look}` : `look up ${c.look}`, tone: c.found == null ? 'rose' : 'slate' });
        if (c.found == null) chips.push({ t: z ? '找不到 ✗' : 'not found ✗', tone: 'rose' });
        else if (c.follow) chips.push({ t: z ? `inode ${c.found}：是链接` : `inode ${c.found}: link`, tone: 'violet' });
        else chips.push({ t: `inode ${c.found}`, tone: 'blue' });
      }
      if (a.ok) chips.push({ t: z ? `读到：${DATA[a.data].zh} ✓` : `${DATA[a.data].en} ✓`, tone: 'green' });
      let g = txt(0, 0, z ? `读 ${a.via}` : `read ${a.via}`, 'bt-cap', 'start');
      chips.forEach((c, i) => {
        g += `<g transform="translate(0 ${12 + i * 46})">${cell(130, 34, c.t, { size: 12, tone: c.tone })}</g>`;
        if (i) g += arrow(65, 12 + i * 46 - 11, 65, 12 + i * 46 - 1, 'dim');
      });
      xh += `<g transform="translate(${col * 142} 16)">${g}</g>`;
    });
  }
  items.push({ k: 'acc', x: AX, y: DY, html: xh });
  return items;
}

function build(p, kit, ERR) {
  const sim = links(p);
  const lesson = shell('file-link', kit, ERR, sim, {
    where: W,
    tag: T('链接', 'Link'),
    name: T('硬链接与软链接', 'Hard and symbolic links'),
    full: T('文件共享 · 基于索引结点（硬链接）· 链接计数 · 符号链（软链接）· 删除与悬空 · 有向无环图目录', 'File sharing · hard links · link counts · symbolic links · deletion and dangling links · DAG directories'),
    title: SPEC.presets.find((x) => x.set.scene === p.scene)?.label ?? T('硬链接与软链接', 'Links'),
    legend: [['blue', T('普通文件', 'Regular file')], ['violet', T('符号链接', 'Symbolic link')], ['amber', T('这一步变了的', 'Changed this step')]],
    principle: PRINCIPLE,
    desc: T('同一个文件怎样有两个名字？硬链接是再加一个目录项、指向同一个 inode，链接计数加 1；软链接是新建一个小文件，里面存着路径。删掉原文件以后，两种链接的命运完全不同——这节课一步步看。', 'Two names for one file: a hard link adds an entry to the same inode; a symbolic link is a small file holding a path. Delete the original and see what happens to each.'),
    rect: [20, 120, 890, 470],
  });
  if (!sim.ok) return lesson;
  const AFTER = {
    orig: T('b 还能读到原来的内容：inode 37 的计数还是 1。c 悬空了：它按路径找 a.txt，目录里已经没有这个名字。', 'b still works (count 1); c dangles: there is no a.txt any more.'),
    both: T('两个都读不到了：b 的目录项已经删了，inode 37 也已回收；c 按路径找 a.txt 找不到。', 'Neither works: b is gone and inode 37 freed; c dangles.'),
    recreate: T('b 读到的还是旧文件（inode 37）；c 按名字找 a.txt，找到的却是新文件 inode 60——软链接认名字，不认 inode。', 'b still reads the old file; c now finds the new a.txt (inode 60): a symlink follows the name.'),
    hard: T('b 已经删了；c 不受影响：a.txt 还在，照样读到 inode 37。', 'b is gone; c is unaffected.'),
  };
  const list = sim.steps.map((s, k) => {
    let d;
    if (s.kind === 'init') d = [T('目录里有 a.txt', 'The directory holds a.txt'), T('目录项 a.txt → inode 37。inode 里的链接计数是 1：只有一个目录项指向它。', 'Entry a.txt → inode 37, link count 1.'), 'share'];
    else if (s.kind === 'hard') d = [T('ln a.txt b：建硬链接', 'ln a.txt b: a hard link'), T('只是在目录里加一个目录项 b，填上同一个 inode 号 37；链接计数 1 → 2。没有新 inode，也没有复制数据：a.txt 和 b 是同一个文件的两个名字，不分主次。', 'A new entry b with the same inode 37; count 1 → 2. No copy, no new inode.'), 'hard'];
    else if (s.kind === 'soft') d = [T(`ln -s ${DIR}/a.txt c：建软链接`, 'ln -s: a symbolic link'), T(`新建 inode 52，类型是符号链接，内容就是路径字符串「${DIR}/a.txt」；目录项 c → 52。inode 37 的链接计数不变，还是 2。`, `New inode 52 of type link holding “${DIR}/a.txt”; inode 37’s count stays 2.`), 'soft'];
    else if (s.kind === 'access') {
      const [b, c] = s.access;
      d = s.when === 'before'
        ? [T('现在通过 b、c 都能读到', 'Both b and c work'), T(`读 b：查目录 ${b.lookups} 次就到 inode 37。读 c：先查到 inode 52，发现是符号链接，取出路径再查一遍 a.txt，才到 inode 37——查目录 ${c.lookups} 次，还要多读一次链接的内容。`, `b: ${b.lookups} lookup; c: ${c.lookups} lookups plus reading the link.`), 'compare']
        : [T('再通过 b、c 读一次', 'Read b and c again'), AFTER[sim.scene], 'compare'];
    } else if (s.kind === 'rm') d = [T(`rm ${s.name}`, `rm ${s.name}`), s.gone
      ? T(`删掉目录项 ${s.name}，inode ${s.ino} 的计数 1 → 0：没有任何名字指向它了，回收 inode ${s.ino} 和它的数据块。`, `Entry removed; count 1 → 0: inode ${s.ino} and its blocks are freed.`)
      : T(`删掉目录项 ${s.name}，inode ${s.ino} 的计数 ${s.left + 1} → ${s.left}。不是 0，inode 和数据都还在。`, `Entry removed; count ${s.left + 1} → ${s.left}. Not 0, so the file stays.`), 'hard'];
    else if (s.kind === 'create') d = [T('重新建一个 a.txt', 'Create a new a.txt'), T('新文件分到 inode 60，计数 1。它和原来的 inode 37 没有任何关系，只是名字碰巧一样。', 'The new file gets inode 60, unrelated to inode 37.'), 'soft'];
    const bad = s.kind === 'access' && s.access.some((a) => !a.ok);
    return { title: d[0], desc: T(`inode 37 计数 ${s.inodes[37]?.nlink ?? '—（已回收）'}`, `inode 37 count ${s.inodes[37]?.nlink ?? '— (freed)'}`), detail: d[1], ref: d[2], st: { k }, row: { color: s.kind === 'soft' || s.kind === 'create' ? 'violet' : 'blue', what: d[0], result: T(`计数 ${s.inodes[37]?.nlink ?? 0}`, `count ${s.inodes[37]?.nlink ?? 0}`), tone: bad ? 'bad' : 'info' } };
  });
  const [b, c] = sim.after;
  const title = T(`最后：b ${b.ok ? '能读' : '读不到'}，c ${c.ok ? '能读' : '悬空'}`, `Finally: b ${b.ok ? 'works' : 'fails'}, c ${c.ok ? 'works' : 'dangles'}`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, AFTER[sim.scene]);
}

export const makeFileLink = make('file-link', SPEC, ERR, build);
