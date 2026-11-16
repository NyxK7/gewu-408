// 「文件的物理结构」配的题：读第 k 块的访盘次数、FAT 的大小、分配方式的比较。答案由 filealloc.js 算出。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { fatSize } from '../subjects/os/filealloc.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const NAME = {
  contig: T('连续分配', 'contiguous allocation'),
  linked: T('隐式链接分配', 'implicit linked allocation'),
  fat: T('显式链接分配（FAT 在内存）', 'FAT allocation (FAT in memory)'),
  index: T('索引分配（索引块不在内存）', 'indexed allocation (index block on disk)'),
};
const size = (b) => (b >= 2 ** 30 ? `${b / 2 ** 30}GB` : b >= 2 ** 20 ? `${b / 2 ** 20}MB` : `${b / 1024}KB`);

export const FALLOC_QUESTIONS = [
  {
    id: 'os-fa-01',
    subject: 'os',
    chapter: 'file',
    topic: T('读文件某一块要访盘几次', 'Disk reads for one block'),
    type: 'number',
    difficulty: 2,
    lessons: ['file-alloc'],
    tags: ['计算'],
    conv: T('文件已经打开，目录项（FCB）在内存；逻辑块从 0 编号。', 'The file is open (FCB in memory); logical blocks start at 0.'),
    make(r) {
      const kind = r.pick(['contig', 'linked', 'linked', 'fat', 'index']);
      const n = r.int(4, 8);
      const all = r.next() < 0.25;
      const k = r.int(1, n - 1);
      const params = { n, k: all ? 0 : k, start: r.int(0, 24 - n), seed: r.int(1, 99), pattern: all ? 'all' : 'one' };
      const l = L('file-alloc', params);
      const ln = l.sim.lanes.find((x) => x.kind === kind);
      const step = l.sim.steps.findIndex((s) => s.kind === kind);
      const why = {
        contig: all ? T(`连续 ${n} 块，读 ${n} 次。`, `${n} reads.`) : T(`起始块号 + ${k} 直接算出盘块号，读 1 次。`, 'Compute the block directly: one read.'),
        linked: all ? T(`顺着指针读完 ${n} 块，${n} 次。`, `${n} reads.`) : T(`下一块的位置写在上一块里，要从第 0 块读起，读到第 ${k} 块共 ${k} + 1 = ${k + 1} 次。`, `Blocks 0…${k}: ${k + 1} reads.`),
        fat: all ? T(`查 FAT 在内存里，只读 ${n} 个数据块。`, `${n} data reads.`) : T(`在内存的 FAT 里顺着查 ${k} 次找到盘块号，再读这一块，访盘 1 次。`, `${k} FAT lookups in memory, one read.`),
        index: all ? T(`先读索引块，再读 ${n} 个数据块，共 ${n + 1} 次。`, `${n + 1} reads.`) : T('先读索引块查到盘块号，再读数据块，共 2 次。', 'Index block, then the data block: two reads.'),
      }[kind];
      return {
        question: T(`一个文件有 ${n} 个盘块，采用${NAME[kind].zh}。${all ? '从头到尾顺序读完整个文件' : `读它的逻辑块 ${k}`}，一共要访问几次磁盘？`, `A ${n}-block file uses ${NAME[kind].en}. How many disk reads to ${all ? 'read the whole file' : `read logical block ${k}`}?`),
        answer: { value: ln.reads.length },
        steps: [
          { text: why, go: { lesson: 'file-alloc', params, step } },
          { text: T('数访盘次数前，先看清哪些东西已经在内存里：目录项、FAT、索引块。', 'First check what is already in memory.'), go: { lesson: 'file-alloc', doc: 'compare' } },
        ],
      };
    },
  },
  {
    id: 'os-fa-02',
    subject: 'os',
    chapter: 'file',
    topic: T('FAT 的大小', 'Size of the FAT'),
    type: 'number',
    difficulty: 2,
    lessons: ['file-alloc'],
    tags: ['计算'],
    conv: T('FAT 每个表项存一个盘块号，长度取能表示所有盘块号的最少位数，再向上取整到整字节；1KB = 1024B。', 'Each FAT entry holds a block number: the fewest bits needed, rounded up to whole bytes.'),
    make(r) {
      const disk = 2 ** r.int(30, 36); // 1GB～64GB
      const block = 2 ** r.int(10, 13); // 1KB～8KB
      const blocks = disk / block;
      const f = fatSize({ blocks, byte: true });
      const kb = f.bytes / 1024;
      return {
        question: T(`某磁盘容量 ${size(disk)}，盘块大小 ${size(block)}，采用 FAT 显式链接分配。FAT 一共占多少 KB？`, `A ${size(disk)} disk with ${size(block)} blocks uses a FAT. How many KB does the FAT take?`),
        answer: { value: kb },
        steps: [
          { text: T(`盘块数 = ${size(disk)} ÷ ${size(block)} = 2^${Math.log2(blocks)} 个；FAT 每个盘块一个表项。`, `2^${Math.log2(blocks)} blocks, one entry each.`), go: { lesson: 'file-alloc', doc: 'link' } },
          { text: T(`表项至少 ${f.bits} 位，取整到 ${f.entryBits / 8} 字节；FAT 大小 = 2^${Math.log2(blocks)} × ${f.entryBits / 8} B = ${kb} KB。`, `${f.bits} bits → ${f.entryBits / 8} B; ${kb} KB.`) },
        ],
      };
    },
  },
  {
    id: 'os-fa-03',
    subject: 'os',
    chapter: 'file',
    topic: T('文件分配方式的比较', 'Comparing allocation methods'),
    type: 'single',
    difficulty: 1,
    lessons: ['file-alloc'],
    tags: ['概念'],
    make(r) {
      const asks = [
        { q: T('下列文件分配方式中，会产生外部碎片、而且文件难以变长的是：', 'Which method suffers external fragmentation and makes growth hard?'), right: 'contig', why: T('连续分配要求盘块相邻：分配回收多了，零散的空闲块凑不成一段（外部碎片）；文件后面的块被占了就没法接着长。', 'Contiguous blocks fragment the free space and block growth.') },
        { q: T('下列文件分配方式中，只适合顺序访问、随机读第 k 块要从头读起的是：', 'Which method only suits sequential access?'), right: 'linked', why: T('隐式链接的指针放在每块里，不读前一块就不知道下一块在哪，读第 k 块要读 k + 1 次。', 'Implicit pointers live in the blocks: block k needs k + 1 reads.') },
        { q: T('把所有盘块的「下一块」指针集中放在一张表里、开机读进内存的是：', 'Which method keeps all next-block pointers in one in-memory table?'), right: 'fat', why: T('这张表就是文件分配表 FAT，表项个数等于盘块数。', 'That table is the FAT, one entry per block.') },
        { q: T('每个文件用一个专门的盘块记下自己各逻辑块所在盘块号的是：', 'Which method gives each file a block listing its disk blocks?'), right: 'index', why: T('那个盘块就是索引块；读第 k 块先读索引块再读数据块。', 'That is the index block.') },
      ];
      const a = r.pick(asks);
      const nm = { contig: T('连续分配', 'Contiguous'), linked: T('隐式链接分配', 'Implicit linked'), fat: T('显式链接分配（FAT）', 'Explicit linked (FAT)'), index: T('索引分配', 'Indexed') };
      const { options, answer } = shuffled(r, nm[a.right], Object.keys(nm).filter((k) => k !== a.right).map((k) => nm[k]));
      return {
        question: a.q,
        options,
        answer,
        steps: [
          { text: a.why, go: { lesson: 'file-alloc', doc: { contig: 'contig', linked: 'link', fat: 'link', index: 'index' }[a.right] } },
          { text: T('四种方式放在一起对比：连续分配随机访问快但有外部碎片；隐式链接只能顺序访问；FAT 和索引都支持随机访问、没有外部碎片。', 'Compare all four side by side.'), go: { lesson: 'file-alloc', step: 5 } },
        ],
      };
    },
  },
];
