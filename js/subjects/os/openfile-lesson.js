// 「打开文件的全过程」：上面是路径，一级一级换成 inode 号；左边是磁盘（inode 和当前查看的块），右边是内存里的两张打开文件表；
// 最下面一条是访盘记录，数得出 open 和 read 各访问了几次磁盘。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { gridTable } from '../ds/graph.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { BLOCK, FS, ROOT, openFile } from './openfile.js';

const W = [['os', 'file']];
const DX = 40; // 磁盘一侧
const MX = 600; // 内存一侧
const TOP = 200;

// 「目录项 + inode」比「整个 FCB 放目录里」查目录少读几块：由代码算
const FCB = 64;
const ENT = 16;
const FILES = 128;
const blocksOf = (sz) => Math.ceil((FILES * sz) / BLOCK);
const avg = (b) => (b + 1) / 2;

const PRINCIPLE = {
  sections: [
    {
      id: 'layout',
      title: T('文件系统在磁盘上和内存里的样子', 'On disk and in memory'),
      blocks: [
        { p: T('一个分区格式化成文件系统以后，磁盘上大致是这样几部分：', 'A formatted partition holds:') },
        {
          table: {
            head: [T('区域', 'Area'), T('放什么', 'Contents')],
            rows: [
              [T('引导块', 'Boot block'), T('启动操作系统用的引导程序（不是每个分区都有用）', 'the boot loader')],
              [T('超级块', 'Superblock'), T('整个文件系统的信息：块大小、块数、inode 数、空闲块和空闲 inode 的情况、根目录 inode', 'sizes, counts, free-space info, the root inode')],
              [T('空闲空间管理', 'Free-space map'), T('位示图或空闲链表，记哪些块、哪些 inode 没用', 'bitmaps or free lists')],
              [T('inode 区', 'Inode area'), T('每个文件一个 inode：类型、文件主、权限、大小、时间、数据块地址', 'one inode per file')],
              [T('数据区', 'Data area'), T('文件的内容，以及目录的内容（目录项）', 'file data and directory entries')],
            ],
          },
        },
        { p: T('内存里还有：挂载表（哪个文件系统挂在哪个目录上）、最近用过的目录缓存、**系统打开文件表**和每个进程的**打开文件表**。', 'In memory: the mount table, a directory cache, the **system open-file table** and each process’s **open-file table**.') },
      ],
    },
    {
      id: 'open',
      title: T('open 做了什么', 'What open() does'),
      blocks: [
        { steps: [
          T('从根目录（绝对路径）或当前目录（相对路径）开始，一级一级查目录：读目录的 inode 找到目录内容所在的块，读块，在目录项里找下一级的名字，得到它的 inode 号；', 'Starting from the root (or the current directory), look up each component: read the directory inode, read its block, find the next name and its inode number;'),
          T('读出文件本身的 inode（如果别的进程已经打开、inode 已在内存，就不用读）；', 'read the file’s inode, unless it is already in memory;'),
          T('按 inode 里的权限检查这次打开是否允许；', 'check permissions against the inode;'),
          T('在系统打开文件表里建一项（或把已有表项的打开计数加 1）；', 'create a system open-file table entry or increment its count;'),
          T('在进程的打开文件表里找最小的空闲位置，填上「指向系统表的指针、读写指针、打开方式」，它的下标就是文件描述符 fd，返回给进程。', 'fill the lowest free slot in the process table; its index is the file descriptor.'),
        ] },
        { tip: T('open 的目的就是「查一次目录，以后不再查」：之后 read、write 只拿 fd，直接找到内存里的 inode 和块地址。', 'open() looks up the path once; later calls use only the descriptor.') },
      ],
    },
    {
      id: 'tables',
      title: T('两张打开文件表', 'The two open-file tables'),
      blocks: [
        {
          table: {
            head: ['', T('系统打开文件表（整个系统一张）', 'System table (one)'), T('进程打开文件表（每个进程一张）', 'Process table (one per process)')],
            rows: [
              [T('放什么', 'Holds'), T('文件的 inode / FCB 副本、打开计数', 'the inode copy and an open count'), T('指向系统表项的指针、读写指针、打开方式', 'a pointer to the system entry, the offset, the mode')],
              [T('同一文件被两个进程打开', 'Two processes open one file'), T('只有一项，计数 = 2', 'one entry, count 2'), T('各有一项，各自的读写指针', 'one entry each, separate offsets')],
              [T('什么时候删', 'Removed'), T('计数减到 0', 'when the count reaches 0'), T('进程 close 这个 fd', 'on close(fd)')],
            ],
          },
        },
        { warn: T('文件描述符只在本进程里有意义：两个进程各自的 fd 3 可以指向完全不同的文件。', 'A descriptor is meaningful only inside its process.') },
      ],
    },
    {
      id: 'inode',
      title: T('为什么目录项里只放 inode 号', 'Why directory entries hold only an inode number'),
      blocks: [
        { p: T('如果目录项里放完整的 FCB，目录会很大；查目录时只需要比较文件名，大部分属性都白白读进来了。把 FCB 拆成「文件名 + inode 号」的目录项和单独存放的 inode，目录就小得多。', 'Splitting the FCB into a small entry plus a separate inode makes directories much smaller to search.') },
        { formula: T(`例：块 ${BLOCK} B，目录里有 ${FILES} 个文件。FCB ${FCB} B 时目录占 ${blocksOf(FCB)} 块，平均查找要读 ${avg(blocksOf(FCB))} 块；目录项 ${ENT} B 时只占 ${blocksOf(ENT)} 块，平均读 ${avg(blocksOf(ENT))} 块。`, `Example: ${BLOCK} B blocks, ${FILES} files. ${FCB} B FCBs need ${blocksOf(FCB)} blocks (avg ${avg(blocksOf(FCB))} reads); ${ENT} B entries need ${blocksOf(ENT)} (avg ${avg(blocksOf(ENT))}).`) },
        { tip: T('平均查找块数按「找到所在块就停」算：目录占 n 块时平均读 (n + 1) / 2 块。', 'Average reads for n blocks: (n + 1) / 2.') },
      ],
    },
    {
      id: 'protect',
      title: T('文件保护', 'File protection'),
      blocks: [
        { list: [
          T('**访问控制表**：每个文件记下「谁能做什么」。完整的表太长，常见的简化是把用户分成文件主、同组用户、其他用户三类，各给 r / w / x 三位，如 rw-r-----。', '**Access-control lists**, usually simplified to owner / group / others × r / w / x.'),
          T('**口令**：打开文件要给出口令。简单，但口令存在系统里，不够安全。', '**Passwords**: simple but weak.'),
          T('**加密**：文件内容加密存放，没有密钥读到的也是乱码。保密性好，但加解密要花时间。', '**Encryption**: strong, but costs time.'),
        ] },
        { warn: T('权限在 open 时检查一次，之后的 read / write 只看打开方式；所以打开以后再改文件权限，已打开的进程照样能读。', 'Permissions are checked at open(); later reads check only the open mode.') },
      ],
    },
    {
      id: 'mount',
      title: T('挂载与虚拟文件系统', 'Mounting and the VFS'),
      blocks: [
        { p: T('**挂载**：把另一个分区（或 U 盘）上的文件系统接到当前目录树的某个目录（挂载点）上。查路径走到挂载点时，内核查挂载表，转到那个文件系统的根目录继续查。', '**Mounting** attaches another file system at a directory; lookups crossing the mount point continue at that file system’s root.') },
        { p: T('**虚拟文件系统（VFS）**：内核在各种具体文件系统（ext4、FAT、NTFS、网络文件系统……）上面加一层统一接口。open、read 这些系统调用先到 VFS，VFS 再调具体文件系统的实现。所以用户程序不用关心文件在哪种文件系统上。', 'The **VFS** gives all concrete file systems one interface; system calls go through it to the right implementation.') },
        { tip: T('VFS 里也有「超级块、inode、目录项、文件」这几种对象，对应的就是这节课里的几样东西。', 'The VFS objects mirror these: superblock, inode, dentry, file.') },
      ],
    },
    pit([
      T('open 不读文件内容，只读目录和 inode；内容在 read 时才读。', 'open() reads directories and inodes, not file data.'),
      T('根目录 inode 一般常驻内存，查 /a/b/c 时不用为根目录的 inode 访盘。', 'The root inode is normally in memory.'),
      T('关闭文件是把打开计数减 1，减到 0 才删系统表项；文件本身并不删除。', 'close() decrements the count; the file is not deleted.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('ming 打开自己的文件，读 1500 字节', 'ming reads 1500 bytes of a file'), set: { path: '/home/ming/notes.txt', who: 'ming', opened: 'no', n: 1500 } },
    { label: T('文件已被进程 Q 打开', 'Q already has it open'), set: { path: '/home/ming/notes.txt', who: 'ming', opened: 'yes', n: 1500 } },
    { label: T('hua 想读 ming 的文件：没有权限', 'hua lacks permission'), set: { path: '/home/ming/notes.txt', who: 'hua', opened: 'no', n: 1500 } },
    { label: T('路径写错：找不到', 'A path that does not exist'), set: { path: '/home/ming/note.txt', who: 'ming', opened: 'no', n: 1500 } },
    { label: T('浅一级的文件 /etc/hosts', 'A shallower file: /etc/hosts'), set: { path: '/etc/hosts', who: 'hua', opened: 'no', n: 1500 } },
  ],
  groups: [{ legend: T('open(path, 只读) 然后 read(fd, buf, n)', 'open(path, read-only) then read(fd, buf, n)'), fields: [
    { name: 'path', label: T('路径', 'Path'), type: 'text', parse: (s) => String(s).trim(), wide: true },
    { name: 'who', label: T('进程 P 的用户', 'P runs as'), type: 'select', options: [['ming', 'ming'], ['hua', 'hua']] },
    { name: 'opened', label: T('进程 Q 是否已打开同一文件', 'Q already opened it'), type: 'select', options: [['no', T('没有', 'no')], ['yes', T('已打开', 'yes')]] },
    { name: 'n', label: T('read 读多少字节', 'Bytes to read'), type: 'int', min: 1, max: 8192 },
  ] }],
  note: T('目录树：/home/ming/{notes.txt, todo.md}、/home/hua/plan.txt、/etc/hosts、/readme、/tmp。根目录 inode 常驻内存；每个目录正好一块；块 1KB；没有缓冲区高速缓存。', 'Tree: /home/ming/{notes.txt, todo.md}, /home/hua/plan.txt, /etc/hosts, /readme, /tmp. Root inode in memory; one block per directory; 1 KB blocks; no buffer cache.'),
};
const ERR = { path: T('路径要以 / 开头，只能有字母、数字和 . _ -，不能用 . 或 ..', 'Path must start with / and use letters, digits, . _ -'), who: T('用户不对', 'Unknown user'), opened: T('选项不对', 'Bad option'), n: T('字节数 1～8192', 'Bytes: 1–8192') };

const accLab = (d, z) => (d.kind === 'inode' ? `inode ${d.id}` : d.kind === 'dir' ? (z ? `目录块 ${d.id}` : `dir blk ${d.id}`) : z ? `数据块 ${d.id}` : `data ${d.id}`);
const nameOf = (sim, ino) => {
  const i = sim.steps.at(-1).resolved.indexOf(ino);
  return i === 0 ? '/' : i > 0 ? sim.parts[i - 1] : String(ino);
};

function board(sim, st, z) {
  const items = [];
  const s = st ? sim.steps[st.k] : sim.steps[0];
  const kind = st ? s.kind : 'pre';
  const fresh = new Set(st ? s.reads ?? [] : []);
  if (kind === 'read') s.disk.forEach((d, i) => d.kind === 'data' && fresh.add(i));
  // 路径：每个分量一格，下面写 inode 号
  const names = ['/', ...sim.parts];
  let ph = txt(-14, 22, z ? '路径' : 'Path', 'bt-lab', 'end');
  names.forEach((nm, i) => {
    const known = i < s.resolved.length;
    const cur = (kind === 'dir' || kind === 'miss') && i === s.level + 1 ? (kind === 'miss' ? 'rose' : 'amber') : kind === 'notdir' && i === s.level + 1 ? 'rose' : '';
    const done = known && i === names.length - 1 && ['inode', 'cached', 'perm', 'sys', 'fd', 'read', 'close'].includes(kind);
    ph += `<g transform="translate(${i * 150} 0)">${cell(124, 36, nm, { size: 15, tone: cur || (done ? 'blue' : known ? 'slate' : ''), cls: cur ? 'hot' : '' })}${txt(62, 58, known ? `inode ${s.resolved[i]}` : '?', known ? 'ar-mono' : 'bt-idx')}</g>`;
    if (i) ph += arrow(i * 150 - 24, 18, i * 150 - 4, 18, 'dim');
  });
  items.push({ k: 'path', x: DX + 60, y: 80, html: ph });

  // 磁盘：已经知道内容的 inode
  const seen = [ROOT, ...s.disk.filter((d) => d.kind === 'inode').map((d) => d.id)];
  if (kind === 'cached' || (st && ['perm', 'sys', 'fd', 'read', 'close'].includes(kind) && sim.already)) seen.push(sim.target);
  const uniq = [...new Set(seen)];
  const hotIno = (ino) => s.disk.some((d, i) => fresh.has(i) && d.kind === 'inode' && d.id === ino) || (kind === 'cached' && ino === s.ino);
  const rows = uniq.map((ino) => {
    const n = FS[ino];
    const tone = hotIno(ino) ? 'amber' : '';
    const permTone = kind === 'perm' && ino === s.ino ? (s.allow ? 'green' : 'rose') : tone;
    return [
      { t: String(ino), tone },
      { t: n.type === 'dir' ? (z ? '目录' : 'dir') : z ? '文件' : 'file', tone },
      { t: n.owner, tone },
      { t: n.mode, tone: permTone },
      { t: n.blocks.join(', '), tone },
      { t: ino === ROOT ? (z ? '常驻内存' : 'in memory') : kind === 'cached' && ino === s.ino ? (z ? '已在内存' : 'in memory') : z ? '读过' : 'read', tone },
    ];
  });
  items.push({ k: 'inodes', x: DX, y: TOP, html: txt(0, -12, z ? '磁盘 · 读到的 inode' : 'Disk · inodes read', 'bt-lab', 'start') + gridTable([z ? 'inode' : 'inode', z ? '类型' : 'type', z ? '文件主' : 'owner', z ? '权限' : 'mode', z ? '块地址' : 'blocks', ''], rows, { cw: [60, 52, 60, 104, 112, 78], rh: 30 }) });

  // 磁盘：现在看的块
  let bh = '';
  const lastDir = [...sim.steps.slice(0, (st?.k ?? -1) + 1)].reverse().find((x) => x.kind === 'dir' || x.kind === 'miss');
  if (kind === 'read' || kind === 'close') {
    const f = FS[sim.target];
    const rd = sim.steps.find((x) => x.kind === 'read');
    bh += txt(0, -12, z ? `文件 ${sim.parts.at(-1)} 的数据块（${f.size} 字节）` : `Data blocks of ${sim.parts.at(-1)} (${f.size} B)`, 'bt-lab', 'start');
    bh += gridTable([z ? '逻辑块' : 'logical', z ? '字节范围' : 'bytes', z ? '物理块' : 'physical'], f.blocks.map((pb, lb) => {
      const tone = kind === 'read' && rd.blocks.some((b) => b.lb === lb) ? 'amber' : '';
      return [{ t: String(lb), tone }, { t: `${lb * BLOCK}–${Math.min(f.size, (lb + 1) * BLOCK) - 1}`, tone }, { t: String(pb), tone }];
    }), { cw: [64, 120, 80], rh: 30 });
  } else if (lastDir) {
    const d = FS[lastDir.dir];
    const now = lastDir === s;
    bh += txt(0, -12, z ? `目录块 ${d.blocks[0]}（目录 ${nameOf(sim, lastDir.dir)} 的内容）` : `Dir block ${d.blocks[0]} (${nameOf(sim, lastDir.dir)})`, 'bt-lab', 'start');
    const ents = Object.entries(d.entries);
    bh += gridTable([z ? '文件名' : 'name', 'inode'], ents.length ? ents.map(([nm, ino]) => {
      const tone = now && nm === lastDir.name ? 'amber' : '';
      return [{ t: nm, tone }, { t: String(ino), tone }];
    }) : [[{ t: z ? '（空目录）' : '(empty)' }, '']], { cw: [140, 70], rh: 30 });
    if (now && kind === 'miss') bh += txt(220, 46, z ? `没有「${s.name}」` : `no “${s.name}”`, 'cw-lab bad l', 'start');
  }
  items.push({ k: 'blk', x: DX, y: TOP + 230, html: bh });

  // 内存：进程 P 的打开文件表
  const myFd = s.fdt.find((f) => f.fd >= 3);
  const fdRows = s.fdt.map((f) => {
    const tone = f.fd >= 3 && (kind === 'fd' || kind === 'read') ? 'amber' : '';
    return [{ t: String(f.fd), tone }, { t: f.to === 'tty' ? (z ? '终端' : 'tty') : `${z ? '系统表' : 'sys'} #${f.to}`, tone }, { t: f.off == null ? '—' : String(f.off), tone: kind === 'read' && f.fd >= 3 ? 'amber' : tone }, { t: f.to === 'tty' ? '' : z ? '只读' : 'r', tone }];
  });
  let mh = txt(0, -12, z ? '内存 · 进程 P 的打开文件表' : 'Memory · P’s open-file table', 'bt-lab', 'start') + gridTable(['fd', z ? '指向' : 'points to', z ? '读写指针' : 'offset', z ? '方式' : 'mode'], fdRows, { cw: [44, 104, 84, 64], rh: 30 });
  if (kind === 'close') mh += txt(0, (s.fdt.length + 1) * 30 + 22, z ? `fd ${s.fd} 已释放` : `fd ${s.fd} freed`, 'bt-cap', 'start');
  items.push({ k: 'fdt', x: MX, y: TOP, html: mh });

  // 内存：系统打开文件表
  const sysRows = s.sys.length
    ? s.sys.map((e) => {
        const tone = (kind === 'sys' && e.idx === s.idx) || (kind === 'cached' && e.ino === s.ino) ? 'amber' : kind === 'close' && e.idx === s.idx ? 'amber' : '';
        return [{ t: `#${e.idx}`, tone }, { t: String(e.ino), tone }, { t: e.name, tone }, { t: String(e.count), tone }, { t: e.by.join(z ? '、' : ', '), tone }];
      })
    : [[{ t: '' }, { t: z ? '（空）' : '(empty)' }, '', '', '']];
  let sh = txt(0, -12, z ? '内存 · 系统打开文件表' : 'Memory · system open-file table', 'bt-lab', 'start') + gridTable(['#', 'inode', z ? '文件' : 'file', z ? '计数' : 'count', z ? '谁打开' : 'by'], sysRows, { cw: [44, 60, 104, 56, 72], rh: 30 });
  if (kind === 'close' && s.freed) sh += txt(0, (s.sys.length + 1) * 30 + 22, z ? `计数到 0，表项 #${s.idx} 已删除` : `count 0: entry #${s.idx} removed`, 'bt-cap', 'start');
  if (myFd && myFd.to !== 'tty') sh += arrow(96, (s.fdt.length + 1) * 30 - 226, 96, -26, 'acc');
  items.push({ k: 'sys', x: MX, y: TOP + 230, html: sh });

  // 访盘记录
  let ah = txt(-14, 22, z ? `访盘 ${s.disk.length} 次` : `${s.disk.length} disk reads`, 'bt-lab', 'end');
  s.disk.forEach((d, i) => {
    const col = i % 7;
    const row = Math.floor(i / 7);
    ah += `<g transform="translate(${col * 128} ${row * 42})">${cell(120, 34, accLab(d, z), { size: 13, tone: fresh.has(i) ? 'amber' : d.kind === 'data' ? 'violet' : 'slate', cls: fresh.has(i) ? 'hot' : '' })}</g>`;
  });
  if (!s.disk.length) ah += txt(0, 22, z ? '（还没有访问磁盘）' : '(none yet)', 'bt-idx', 'start');
  items.push({ k: 'acc', x: DX + 110, y: TOP + 420, html: ah });
  return items;
}

function build(p, kit, ERR) {
  const sim = openFile(p);
  const lesson = shell('open-file', kit, ERR, sim, {
    where: W,
    tag: T('打开', 'Open'),
    name: T('打开文件的全过程', 'Opening a file'),
    full: T('文件系统布局 · 逐级查目录 · inode · 权限检查 · 系统 / 进程打开文件表 · 文件描述符 · read 与 close · 文件保护 · 挂载与 VFS', 'Layout · path lookup · inodes · permissions · open-file tables · descriptors · read and close · protection · mounting and VFS'),
    title: SPEC.presets.find((x) => Object.entries(x.set).every(([k, v]) => p[k] === v))?.label ?? T('打开文件', 'Opening a file'),
    legend: [['amber', T('这一步读到 / 改到的', 'This step')], ['violet', T('读文件内容的访盘', 'Data reads')]],
    principle: PRINCIPLE,
    desc: T('fd = open("/home/ming/notes.txt") 这一行背后，内核做了什么？一级一级查目录、读 inode、检查权限、填两张打开文件表，最后 read 读数据块、close 关闭。下面一条数着访问了几次磁盘。可以改路径、换用户，或者让别的进程先打开同一个文件。', 'What does open() do? Walk the directories, read the inode, check permissions, fill both open-file tables; then read() and close(). The bottom row counts disk accesses.'),
    rect: [0, 50, 1000, 660],
  });
  if (!sim.ok) return lesson;
  const z2 = (zh, en) => T(zh, en);
  let nth = 0;
  const list = sim.steps.map((s, k) => {
    const acc = (i) => (s.disk[i] ? s.disk[i] : null);
    let d;
    if (s.kind === 'call') d = [z2(`P 调用 open("${sim.path}")`, `P calls open("${sim.path}")`), z2('内核要把路径名换成文件的 inode。根目录的 inode 挂载时就在内存里，所以从根目录开始一级一级往下查。P 已经占着 fd 0、1、2（标准输入、标准输出、标准错误）。', 'The kernel must turn the path into an inode, starting from the in-memory root inode. P already uses fds 0, 1, 2.'), 'open'];
    else if (s.kind === 'dir' || s.kind === 'miss') {
      const dn = nameOf(sim, s.dir);
      const parts = s.reads.map((i) => {
        nth++;
        const a = acc(i);
        return a.kind === 'inode' ? [`读目录 ${dn} 的 inode ${a.id}（第 ${nth} 次访盘），知道它的内容在块 ${FS[s.dir].blocks[0]}`, `read inode ${a.id} (access ${nth})`] : [`读目录块 ${a.id}（第 ${nth} 次访盘）`, `read block ${a.id} (access ${nth})`];
      });
      const head = parts.map((x) => x[0]).join('；');
      d = s.kind === 'dir'
        ? [z2(`查目录 ${dn}：${s.name} → inode ${s.found}`, `Look up ${s.name} in ${dn}`), z2(`${s.dir === ROOT ? '根目录的 inode 已在内存，直接' : ''}${head}，在目录项里找到「${s.name}」，inode 号是 ${s.found}。`, `${parts.map((x) => x[1]).join('; ')}: “${s.name}” is inode ${s.found}.`), 'open']
        : [z2(`目录 ${dn} 里没有 ${s.name}`, `${s.name} is not in ${dn}`), z2(`${head}，把目录项一个个比过去，没有「${s.name}」。open 失败，返回 -1（错误码 ENOENT：没有这个文件）。`, `No entry “${s.name}”: open() returns -1 (ENOENT).`), 'open'];
    } else if (s.kind === 'notdir') d = [z2('路径中间有一级不是目录', 'A path component is not a directory'), z2(`「${sim.parts[s.level - 1]}」是普通文件，不能在它下面找「${s.name}」。open 返回 -1（ENOTDIR）。`, 'open() returns -1 (ENOTDIR).'), 'open'];
    else if (s.kind === 'isdir') d = [z2('这是目录，不是普通文件', 'This is a directory'), z2('目录也能打开，但要用读目录的调用（readdir）去读目录项。这节课演示打开普通文件，换一个文件路径试试。', 'Directories are read with readdir(); try a regular file.'), 'open'];
    else if (s.kind === 'inode') {
      nth++;
      const f = FS[s.ino];
      d = [z2(`读文件的 inode ${s.ino}`, `Read inode ${s.ino}`), z2(`第 ${nth} 次访盘：把 inode 读进内存。里面有文件主 ${f.owner}、权限 ${f.mode}、大小 ${f.size} 字节，以及数据块的地址 ${f.blocks.join('、')}。文件内容一个字节也还没读。`, `Access ${nth}: owner ${f.owner}, mode ${f.mode}, ${f.size} B, blocks ${f.blocks.join(', ')}.`), 'inode'];
    } else if (s.kind === 'cached') d = [z2(`inode ${s.ino} 已经在内存`, `Inode ${s.ino} is already in memory`), z2('进程 Q 已经打开了这个文件，系统打开文件表里有它的 inode 副本，所以不用再读盘。', 'Q has it open; no disk read needed.'), 'tables'];
    else if (s.kind === 'perm') d = [s.allow ? z2('权限检查通过', 'Permission granted') : z2('没有读权限，打开失败', 'Permission denied'), z2(`P 以 ${sim.who} 的身份运行，${s.asOwner ? '是文件主，看前三位' : '不是文件主，看「其他人」那三位'}「${s.bits}」：${s.allow ? '有 r，可以只读打开。权限只在 open 时检查这一次，以后 read 不再检查。' : '没有 r，open 返回 -1（EACCES）。前面查目录、读 inode 的访盘都已经发生了。'}`, `${sim.who} ${s.asOwner ? 'owns the file' : 'is not the owner'}: bits “${s.bits}” → ${s.allow ? 'allowed' : 'EACCES'}.`), 'protect'];
    else if (s.kind === 'sys') d = s.fresh ? [z2(`系统打开文件表：新建表项 #${s.idx}`, `System table: new entry #${s.idx}`), z2('表项里放 inode 的内存副本，打开计数记为 1。', 'It holds the in-memory inode; count = 1.'), 'tables'] : [z2(`系统打开文件表：表项 #${s.idx} 计数 1 → 2`, `System table: entry #${s.idx} count 1 → 2`), z2('同一个文件在系统表里只有一项，几个进程打开，计数就是几。', 'One entry per file; the count is how many opens.'), 'tables'];
    else if (s.kind === 'fd') {
      const e = s.fdt.find((f) => f.fd === s.fd);
      d = [z2(`P 的打开文件表：fd = ${s.fd}`, `P’s table: fd = ${s.fd}`), z2(`取最小的空闲下标 ${s.fd}，填上：指向系统表 #${e.to}、读写指针 0、只读。open 返回 ${s.fd}，以后 P 只拿这个数字操作文件，不再用路径名。`, `Lowest free slot ${s.fd}: points to #${e.to}, offset 0, read-only. open() returns ${s.fd}.`), 'tables'];
    } else if (s.kind === 'read') {
      const f = FS[sim.target];
      const from = nth + 1;
      nth += s.blocks.length;
      const lbs = s.blocks.map((b) => b.lb);
      d = [z2(`read(${s.fd}, buf, ${sim.n})`, `read(${s.fd}, buf, ${sim.n})`), z2(`读写指针是 0，要读 ${sim.n} 字节${sim.n > f.size ? `，文件只有 ${f.size} 字节，实际读 ${s.got} 字节` : ''}：落在逻辑块 ${lbs.join('、')}（每块 ${BLOCK} 字节）。查内存里的 inode 得到物理块 ${s.blocks.map((b) => b.pb).join('、')}，读盘 ${s.blocks.length} 次（第 ${from}${s.blocks.length > 1 ? `～${nth}` : ''} 次）。读完指针移到 ${s.got}。`, `Offset 0, ${s.got} bytes → logical blocks ${lbs.join(', ')} → physical ${s.blocks.map((b) => b.pb).join(', ')}: ${s.blocks.length} reads. Offset becomes ${s.got}.`), 'open'];
    } else if (s.kind === 'close') d = [z2(`close(${s.fd})`, `close(${s.fd})`), s.freed ? z2(`释放 P 的 fd ${s.fd}；系统表项 #${s.idx} 的计数减到 0，表项删除（inode 改过的话先写回磁盘）。文件本身还在磁盘上。`, `fd ${s.fd} freed; count 0, entry #${s.idx} removed. The file itself stays.`) : z2(`释放 P 的 fd ${s.fd}；系统表项 #${s.idx} 的计数减到 ${s.left}，Q 还开着，表项保留。`, `fd ${s.fd} freed; count ${s.left}: Q still has it open.`), 'tables'];
    const tone = ['miss', 'notdir', 'isdir'].includes(s.kind) || (s.kind === 'perm' && !s.allow) ? 'bad' : 'info';
    return { title: d[0], desc: T(`访盘 ${s.disk.length} 次`, `${s.disk.length} disk reads`), detail: d[1], ref: d[2], st: { k }, row: { color: s.kind === 'read' ? 'violet' : 'blue', what: d[0], result: T(`访盘 ${s.disk.length}`, `${s.disk.length} reads`), tone } };
  });
  const title = sim.fd >= 0 ? T(`open 访盘 ${sim.openDisk} 次，read 访盘 ${sim.readDisk} 次`, `open: ${sim.openDisk} reads, read: ${sim.readDisk}`) : T(`open 失败（${sim.error}）`, `open() failed (${sim.error})`);
  const text = sim.fd >= 0
    ? T(`路径 ${sim.path} 要查 ${sim.parts.length} 个目录：根目录的 inode 在内存，只读它的目录块（1 次）；其余 ${sim.parts.length - 1} 个目录各读 inode 和目录块（${2 * (sim.parts.length - 1)} 次）${sim.already ? '；文件的 inode 已在内存' : '；再读文件的 inode（1 次）'}，open 一共 ${sim.openDisk} 次。之后 read 只读数据块，不再查目录。`, `${sim.openDisk} reads to open, ${sim.readDisk} to read; read() never touches directories.`)
    : T(`失败之前已经访盘 ${sim.disk.length} 次。`, `${sim.disk.length} reads before failing.`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeOpenFile = make('open-file', SPEC, ERR, build);
