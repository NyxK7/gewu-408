// 计组三节课（IEEE 754、Cache 映射、流水线）和「一次访存的全过程」的原理页，以及步骤到小节的对应规则。
import { T } from '../../core/i18n.js';

const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
const zh = (s) => (typeof s.title === 'string' ? s.title : s.title?.zh ?? '');

export const FP_PRINCIPLE = {
  sections: [
    {
      id: 'format',
      title: T('格式', 'Formats'),
      blocks: [
        { formula: T('数值 = (−1)^S × 1.M × 2^(E − 偏置值)', 'value = (−1)^S × 1.M × 2^(E − bias)') },
        {
          table: {
            head: ['', T('符号 S', 'Sign'), T('阶码 E', 'Exponent'), T('尾数 M', 'Fraction'), T('偏置值', 'Bias')],
            rows: [
              [T('单精度 float（32 位）', 'Single (32 bits)'), '1', '8', '23', '127'],
              [T('双精度 double（64 位）', 'Double (64 bits)'), '1', '11', '52', '1023'],
            ],
          },
        },
        { p: T('阶码用**移码**存（真实指数 + 偏置值），这样阶码可以直接按无符号数比较大小。规格化数的尾数最高位一定是 1，所以不存这一位（**隐含位**），23 位尾数实际表示 24 位有效数字。', 'The exponent is stored **biased**, so it compares as unsigned. Normal numbers always start with 1, which is not stored (the **hidden bit**): 23 stored bits give 24 significant bits.') },
        { warn: T('IEEE 754 的偏置值是 127，不是一般移码的 128：所以阶码全 0 和全 1 可以留作特殊用途。', 'The bias is 127, not 128, leaving all-zeros and all-ones exponents for special values.') },
      ],
    },
    {
      id: 'encode',
      title: T('十进制 → 机器码', 'Decimal to bits'),
      blocks: [
        {
          steps: [
            T('确定符号位：正数 0，负数 1；', 'sign: 0 positive, 1 negative;'),
            T('把绝对值化成二进制：整数部分除 2 取余，小数部分乘 2 取整；', 'convert to binary: integer part by division, fraction by doubling;'),
            T('规格化成 1.xxx × 2^e 的形式；', 'normalise to 1.xxx × 2^e;'),
            T('阶码 E = e + 127（单精度），写成 8 位二进制；', 'E = e + 127 as 8 bits;'),
            T('尾数取小数点后面的部分，不足 23 位补 0，超出的就近舍入；', 'the fraction is the part after the point, padded or rounded to 23 bits;'),
            T('按 S | E | M 拼起来，常写成 8 位十六进制。', 'concatenate S | E | M, usually written as 8 hex digits.'),
          ],
        },
        { tip: T('例：−0.75 = −0.11₂ = −1.1₂ × 2⁻¹，S = 1，E = −1 + 127 = 126 = 0111 1110，M = 100…0，机器码 BF40 0000H。', 'Example: −0.75 = −1.1₂ × 2⁻¹: S = 1, E = 126, M = 100…0, BF400000H.') },
      ],
    },
    {
      id: 'decode',
      title: T('机器码 → 十进制', 'Bits to decimal'),
      blocks: [
        { p: T('把十六进制展开成二进制，按 1 | 8 | 23 切开：先看阶码判断是哪一类数；规格化数补上隐含的 1，指数 = E − 127，再算出数值。', 'Split the bits 1 | 8 | 23, classify by the exponent, restore the hidden 1 and use e = E − 127.') },
      ],
    },
    {
      id: 'special',
      title: T('特殊值与范围', 'Special values and range'),
      blocks: [
        {
          table: {
            head: [T('阶码 E', 'Exponent'), T('尾数 M', 'Fraction'), T('表示', 'Meaning')],
            rows: [
              [T('全 0', 'all 0'), T('全 0', 'all 0'), '±0'],
              [T('全 0', 'all 0'), T('不为 0', 'non-zero'), T('非规格化数：(−1)^S × 0.M × 2^(−126)', 'subnormal: 0.M × 2^(−126)')],
              ['1 ～ 254', T('任意', 'any'), T('规格化数', 'normal')],
              [T('全 1', 'all 1'), T('全 0', 'all 0'), '±∞'],
              [T('全 1', 'all 1'), T('不为 0', 'non-zero'), 'NaN'],
            ],
          },
        },
        { p: T('单精度规格化数的范围：最小正数 1.0 × 2^(−126)，最大 (2 − 2^(−23)) × 2^127 ≈ 3.4 × 10^38。阶码 8 位决定范围，尾数位数决定精度。', 'Single precision normals span 2^(−126) to (2 − 2^(−23)) × 2^127 ≈ 3.4 × 10^38: the exponent sets range, the fraction precision.') },
        { p: T('**舍入**：默认就近舍入，正好在中间时取偶数。所以像 0.1 这样的十进制小数没法精确表示——只有分母是 2 的幂的分数才能精确表示。', '**Rounding** is to nearest, ties to even; decimals like 0.1 are inexact.') },
      ],
    },
    pit([
      T('阶码 = 真实指数 + 127，不是 + 128。', 'Exponent = e + 127.'),
      T('尾数不含隐含的 1；解码时别忘了补上。', 'The stored fraction excludes the hidden 1.'),
      T('int 转 float 可能丢精度（超过 24 位有效数字时）；float 转 double 不会。', 'int → float may lose precision; float → double never does.'),
    ]),
  ],
};
export const fpRef = (mode) => (s) => (/特殊|上溢|非规格化|NaN|无穷/.test(zh(s)) ? 'special' : mode === 'decode' ? 'decode' : 'encode');

export const CACHE_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('为什么 Cache 有效', 'Why caches work'),
      blocks: [
        { p: T('CPU 比主存快得多。Cache 用少量高速 SRAM 存放主存中**最近常用**的内容。它有效靠的是程序的**局部性**：**时间局部性**——刚访问过的很可能马上再访问（循环）；**空间局部性**——访问了某个地址，附近的地址很可能马上被访问（顺序执行、数组）。', 'A small fast SRAM keeps recently used memory. It works because of **locality**: **temporal** (reuse soon) and **spatial** (neighbours soon).') },
        { p: T('主存和 Cache 都按**块**划分（块大小相同，也叫行）。CPU 访问时先查 Cache：在就是**命中**，不在就从主存把整块调进来。', 'Both are split into equal **blocks** (lines); a miss brings in a whole block.') },
        { formula: T('平均访问时间 = 命中率 × Cache 时间 + (1 − 命中率) × 缺失时的时间', 'average time = h × t_c + (1 − h) × miss time') },
      ],
    },
    {
      id: 'map',
      title: T('三种映射方式', 'Three mappings'),
      blocks: [
        {
          table: {
            head: [T('映射', 'Mapping'), T('主存块放在哪', 'Where a block may go'), T('地址划分', 'Address split'), T('特点', 'Trade-off')],
            rows: [
              [T('直接映射', 'Direct'), T('只能放在 块号 mod 行数 这一行', 'only line block mod lines'), T('标记 | 行号 | 块内地址', 'tag | line | offset'), T('简单、快；冲突多', 'simple, fast; many conflicts')],
              [T('全相联', 'Fully associative'), T('任何一行', 'any line'), T('标记 | 块内地址', 'tag | offset'), T('冲突最少；每次要比较所有标记', 'fewest conflicts; compare every tag')],
              [T('组相联', 'Set associative'), T('块号 mod 组数 这一组里的任何一行', 'any line of set block mod sets'), T('标记 | 组号 | 块内地址', 'tag | set | offset'), T('折中，最常用', 'the usual compromise')],
            ],
          },
        },
        { p: T('直接映射可以看成 1 路组相联，全相联可以看成只有 1 组的组相联。每一行还有**有效位**，如果是写回法还有**脏位**，替换算法要用的话还有 LRU 计数位。', 'Direct is 1-way set associative; fully associative is one set. Each line has a **valid bit**, a **dirty bit** for write-back, and replacement bits.') },
        { tip: T('Cache 总容量（含标记等）= 行数 × (数据位 + 标记位 + 有效位 + 脏位 + 替换控制位)。题目问「Cache 的总容量」时要把这些都算上。', 'Total cache bits = lines × (data + tag + valid + dirty + replacement bits).') },
      ],
    },
    {
      id: 'replace',
      title: T('替换算法', 'Replacement'),
      blocks: [
        {
          list: [
            T('**随机**：随便选一行，实现简单。', '**Random**.'),
            T('**FIFO**：换出最早调入的那一行，不考虑最近有没有用过。', '**FIFO**: the oldest load goes.'),
            T('**LRU**：换出最久没有被访问的那一行，符合局部性，命中率较高。每行用计数器记录。', '**LRU**: the least recently used goes; best fits locality.'),
            T('**LFU**：换出访问次数最少的。', '**LFU**: the least frequently used goes.'),
          ],
        },
        { warn: T('直接映射每块只有一个位置可放，不需要替换算法。', 'Direct mapping needs no replacement policy.') },
      ],
    },
    {
      id: 'write',
      title: T('写策略', 'Write policies'),
      blocks: [
        {
          table: {
            head: ['', T('写命中', 'On a write hit'), T('写不命中', 'On a write miss')],
            rows: [
              [T('全写法（写直达）', 'Write-through'), T('同时写 Cache 和主存（常配写缓冲）', 'write both (with a write buffer)'), T('非写分配：只写主存', 'no-allocate: write memory only')],
              [T('写回法', 'Write-back'), T('只写 Cache，标记脏位，换出时才写回主存', 'write the cache, set dirty, write back on eviction'), T('写分配：先调块进 Cache 再写', 'allocate: load the block, then write')],
            ],
          },
        },
      ],
    },
    pit([
      T('组号 = 块号 mod 组数（不是 mod 行数，除非是直接映射）。', 'Set = block mod sets.'),
      T('题目给的是字节地址时，先除以块大小得到块号。', 'Convert byte addresses to block numbers first.'),
      T('相联度越高冲突越少，但比较器越多、速度越慢。', 'Higher associativity: fewer conflicts, more comparators.'),
    ]),
  ],
};
export const cacheRef = (s, i, all) => (/换出/.test(zh(s)) ? 'replace' : 'map');

export const PIPE_PRINCIPLE = {
  sections: [
    {
      id: 'stages',
      title: T('五段流水线', 'The five-stage pipeline'),
      blocks: [
        {
          table: {
            head: [T('段', 'Stage'), T('做什么', 'Work')],
            rows: [
              ['IF', T('取指令，PC 加 4', 'fetch the instruction, PC += 4')],
              ['ID', T('译码，读寄存器', 'decode, read registers')],
              ['EX', T('执行运算（或算地址）', 'execute or compute the address')],
              ['MEM', T('访问存储器（load / store）', 'memory access (load / store)')],
              ['WB', T('把结果写回寄存器', 'write the result back')],
            ],
          },
        },
        { p: T('理想情况下每个时钟周期都有一条指令进入流水线、一条指令完成。n 条指令在 k 段流水线上需要 k + (n − 1) 个时钟周期。', 'Ideally one instruction enters and one finishes each cycle: n instructions take k + (n − 1) cycles.') },
        { formula: T('吞吐率 = n ÷ ((k + n − 1)·Δt)；加速比 = n·k·Δt ÷ ((k + n − 1)·Δt)', 'throughput = n ÷ ((k + n − 1)Δt); speedup = nk ÷ (k + n − 1)') },
        { tip: T('流水段的时钟周期取最慢那一段的时间（还要加上流水段寄存器的延迟）。', 'The clock period is set by the slowest stage plus latch delay.') },
      ],
    },
    {
      id: 'hazard',
      title: T('三种冒险', 'Three hazards'),
      blocks: [
        {
          table: {
            head: [T('冒险', 'Hazard'), T('原因', 'Cause'), T('解决', 'Fix')],
            rows: [
              [T('结构冒险', 'Structural'), T('两条指令同时要用同一个部件（如同一个存储器）', 'two instructions need the same unit'), T('指令和数据存储器分开；重复设置部件；阻塞', 'separate memories, duplicate units, stall')],
              [T('数据冒险', 'Data'), T('后面的指令要用前面指令的结果，但结果还没写回', 'a later instruction needs a result not yet written'), T('阻塞（插气泡）、转发（旁路）、编译器调整指令顺序', 'stall, forward, reorder')],
              [T('控制冒险', 'Control'), T('转移指令要等到判断出结果才知道下一条取哪', 'branches resolve late'), T('分支预测、延迟转移、尽早判断', 'prediction, delayed branches, early resolution')],
            ],
          },
        },
        { p: T('数据冒险里最常考的是**写后读（RAW）**：前一条指令写某个寄存器，后一条指令读它。', 'The usual data hazard is **read after write (RAW)**.') },
      ],
    },
    {
      id: 'data',
      title: T('阻塞', 'Stalling'),
      blocks: [
        { p: T('没有转发时，后一条指令必须等到前一条指令把结果**写回寄存器**之后才能读。若寄存器堆「前半周期写、后半周期读」，读可以和写在同一个周期（WB 段）；否则要等到下一个周期。等待的这些周期在流水线里就是**气泡**。', 'Without forwarding the reader waits until the writer’s WB; with “write first half, read second half” they may share that cycle. The waiting cycles are **bubbles**.') },
      ],
    },
    {
      id: 'forward',
      title: T('转发（旁路）', 'Forwarding'),
      blocks: [
        { p: T('运算结果在 EX 段结束时就已经算出来了，不必等写回：可以直接从 EX/MEM 或 MEM/WB 流水段寄存器**转发**给下一条指令的 EX 段，大部分数据冒险就不用阻塞了。', 'Results exist at the end of EX; **forwarding** feeds them from the pipeline registers straight into the next EX, removing most stalls.') },
        { warn: T('**load-use** 冒险转发也解决不了：load 的数据要到 MEM 段结束才有，紧跟着使用它的指令仍然要阻塞一个周期。编译器可以把一条无关指令调度到中间来填补。', 'A **load-use** hazard still stalls one cycle because the data arrives only after MEM; the compiler can fill the slot.') },
      ],
    },
    pit([
      T('n 条指令 k 段流水线是 k + n − 1 个周期，不是 n × k。', 'k + n − 1 cycles, not n × k.'),
      T('判断数据相关先看寄存器：后一条的源寄存器是不是前面某条的目的寄存器。', 'Compare the later sources with earlier destinations.'),
      T('有转发时，只有紧跟在 load 后面使用其结果的指令要阻塞。', 'With forwarding only load-use stalls.'),
    ]),
  ],
};
export const pipeRef = (s) => (/阻塞/.test(zh(s)) ? 'data' : /转发/.test(zh(s)) ? 'forward' : 'stages');

export const VM_ACCESS_PRINCIPLE = {
  sections: [
    {
      id: 'split',
      title: T('地址怎么拆', 'Splitting the addresses'),
      blocks: [
        { p: T('一次访存要用到两套地址划分：', 'Two splits are involved:') },
        {
          list: [
            T('**虚拟地址** = 虚页号 | 页内偏移。页内偏移位数 = log₂(页大小)。虚页号再按 TLB 的组织拆成 TLB 标记 | TLB 组号（全相联时整个虚页号都是标记）。', '**Virtual address** = page number | offset, offset bits = log₂(page size). The page number splits again into TLB tag | TLB set.'),
            T('**物理地址** = 页框号 | 页内偏移（偏移和虚拟地址的完全相同）。用来查 Cache 时，同一个物理地址又看成 Cache 标记 | 组号 | 块内偏移。', '**Physical address** = frame | the same offset; for the cache it reads as tag | set | block offset.'),
          ],
        },
        { tip: T('页内偏移在地址变换中不变，所以「虚拟地址 → 物理地址」只是把虚页号换成页框号。', 'The offset never changes; translation just swaps page number for frame.') },
      ],
    },
    {
      id: 'tlb',
      title: T('查 TLB 和页表', 'TLB and page table'),
      blocks: [
        {
          steps: [
            T('先查 **TLB（快表）**：命中就直接得到页框号，不用访问主存；', 'check the **TLB**; a hit gives the frame without touching memory;'),
            T('TLB 未命中：用页表基址寄存器 + 虚页号 × 页表项大小，在主存里读出页表项（访存一次）；', 'on a miss read the page-table entry from memory at PTBR + page × entry size;'),
            T('页表项有效：取出页框号，把这个页表项装入 TLB；', 'valid entry: take the frame and fill the TLB;'),
            T('页表项无效：**缺页**，由操作系统从磁盘调入这一页、更新页表，然后重新执行这条访存指令。', 'invalid: a **page fault**; the OS pages in, updates the table and re-executes the access.'),
          ],
        },
      ],
    },
    {
      id: 'cache',
      title: T('查 Cache 和主存', 'Cache and memory'),
      blocks: [
        { p: T('拿到物理地址后查 **Cache**：用组号找到那一组，比较组里各行的标记（还要看有效位）。命中就直接取出数据；未命中就访问主存，把整块调入 Cache（可能要按替换算法换出一行），再把数据送回 CPU。', 'With the physical address, index the **cache** set and compare tags. A hit returns the data; a miss reads the block from memory (evicting a line if needed) and returns it.') },
        { warn: T('TLB 是页表的 Cache，Cache 是主存的 Cache；两者各查各的，「TLB 命中」和「Cache 命中」是两回事。最快的情况：TLB 命中且 Cache 命中，一次都不用访问主存。', 'The TLB caches page-table entries and the cache caches memory; they hit or miss independently. Best case: both hit, no memory access at all.') },
      ],
    },
    {
      id: 'combo',
      title: T('几种组合', 'The combinations'),
      blocks: [
        {
          table: {
            head: ['TLB', T('页表', 'Page table'), 'Cache', T('可能吗', 'Possible?')],
            rows: [
              [T('命中', 'hit'), T('命中', 'hit'), T('命中 / 未命中', 'hit / miss'), T('可能（TLB 命中就不用查页表）', 'yes (no page-table lookup needed)')],
              [T('未命中', 'miss'), T('命中', 'hit'), T('命中 / 未命中', 'hit / miss'), T('可能', 'yes')],
              [T('未命中', 'miss'), T('未命中（缺页）', 'miss (fault)'), T('未命中', 'miss'), T('可能：页刚调入，数据不可能已在 Cache', 'yes; the block cannot be cached yet')],
              [T('命中', 'hit'), T('未命中', 'miss'), T('—', '—'), T('不可能：页不在主存，TLB 里不会有它', 'no: an absent page cannot be in the TLB')],
              [T('未命中', 'miss'), T('未命中', 'miss'), T('命中', 'hit'), T('不可能：页不在主存，Cache 里也不会有它的块', 'no: an absent page has no cached blocks')],
            ],
          },
        },
      ],
    },
    pit([
      T('页内偏移位数由页大小决定，和主存、Cache 大小无关。', 'Offset bits depend only on the page size.'),
      T('查页表本身就要访问一次主存。', 'Reading the page table is a memory access.'),
      T('缺页处理完要重新执行访存指令，而不是继续下一条。', 'After a fault the access is re-executed.'),
    ]),
  ],
};
export const memRef = (s) => {
  const t = zh(s);
  if (/TLB/.test(t) && !/页表/.test(t)) return 'tlb';
  if (/页表|缺页|磁盘|重新执行/.test(t)) return 'tlb';
  if (/Cache|主存|送回/.test(t)) return 'cache';
  if (/走完/.test(t)) return 'combo';
  return 'split';
};
