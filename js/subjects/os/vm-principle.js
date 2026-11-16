// 「页面置换算法」这节课的原理：虚拟存储器、请求分页、置换算法、抖动与工作集。
import { T } from '../../core/i18n.js';

export const VM_PRINCIPLE = {
  sections: [
    {
      id: 'local',
      title: T('局部性原理', 'Locality'),
      blocks: [
        { p: T('程序运行时，访存并不是均匀地散在整个地址空间里，而是集中在一小部分：', 'Programs do not touch their address space uniformly; accesses cluster:') },
        {
          list: [
            T('**时间局部性**：刚访问过的地址，很快会被再次访问（循环、反复调用的函数）。', '**Temporal locality**: an address just used will soon be used again (loops, hot functions).'),
            T('**空间局部性**：访问了某个地址，接下来很可能访问它附近的地址（顺序执行的指令、数组）。', '**Spatial locality**: nearby addresses tend to follow (sequential code, arrays).'),
          ],
        },
        { tip: T('局部性是快表、Cache、虚拟存储器能起作用的共同基础：只要把「最近常用的那一小部分」放在快的地方就够了。', 'Locality is why TLBs, caches and virtual memory work: keep the small, recently used part somewhere fast.') },
      ],
    },
    {
      id: 'vm',
      title: T('虚拟存储器', 'Virtual memory'),
      blocks: [
        { p: T('既然一段时间里只用到程序的一小部分，就**没必要把整个程序都装进内存**：先装一部分就开始运行，用到不在内存的部分时再从外存调进来（请求调页）；内存不够时把暂时不用的换出去（置换）。这样，用户看到的「内存」比实际物理内存大得多，这就是**虚拟存储器**。', 'Since only a small part runs at any time, **the whole program need not be in memory**: load a part and start; bring in missing parts on demand; swap out idle parts when memory is short. Users see far more memory than physically exists: **virtual memory**.') },
        {
          table: {
            head: [T('特征', 'Property'), T('含义', 'Meaning')],
            rows: [
              [T('多次性', 'Multiplicity'), T('一个作业分多次调入内存（最重要的特征）', 'a job is loaded in several pieces over time (the key property)')],
              [T('对换性', 'Swapping'), T('运行过程中允许换进换出', 'pieces can move in and out while running')],
              [T('虚拟性', 'Virtuality'), T('逻辑上扩充了内存容量，用户看到的容量远大于实际', 'memory appears larger than it is')],
            ],
          },
        },
        { formula: T('虚存的实际容量 ≤ 内存容量 + 外存容量　　虚存的最大容量 ≤ 2^地址位数', 'actual size ≤ memory + disk    maximum size ≤ 2^address bits') },
        { p: T('实现方式有请求分页、请求分段、请求段页式三种，最常用、最常考的是**请求分页**。', 'It is implemented by demand paging, demand segmentation or both; **demand paging** is the usual one.') },
      ],
    },
    {
      id: 'demand',
      title: T('请求分页：页表项与缺页中断', 'Demand paging: entries and faults'),
      blocks: [
        { p: T('请求分页的页表项比基本分页多了几个字段，用来支持调入和换出：', 'Demand-paging entries carry extra fields for loading and evicting:') },
        {
          table: {
            head: [T('字段', 'Field'), T('作用', 'Purpose')],
            rows: [
              [T('物理块号', 'Frame'), T('页在内存里的位置', 'where the page is')],
              [T('状态位（存在位）P', 'Present bit P'), T('这一页在不在内存；为 0 时访问它会产生缺页中断', 'in memory or not; 0 triggers a fault')],
              [T('访问字段 A', 'Access field A'), T('最近是否被访问过（或访问次数），给置换算法用', 'recent use, for replacement')],
              [T('修改位 M', 'Modified bit M'), T('调入后是否被改过；改过的页换出时必须写回外存，没改过的直接丢掉', 'dirty or not; dirty pages must be written back')],
              [T('外存地址', 'Disk address'), T('这一页在外存上的位置，调入时用', 'where to read it from')],
            ],
          },
        },
        {
          list: [
            T('访问的页不在内存（P = 0）时，MMU 产生**缺页中断**。它属于**内中断（异常）**，由当前指令引起，在**指令执行期间**就能产生和处理，而不是等指令执行完。', 'An absent page (P = 0) makes the MMU raise a **page fault**, an **internal interrupt (exception)** raised and handled **during** the instruction, not after it.'),
            T('处理过程：若有空闲块就直接调入；否则按置换算法选一页换出（被改过的要先写回）；从外存读入所需的页，修改页表，然后**返回并重新执行**引起缺页的那条指令。', 'Handling: use a free frame or evict one by the replacement algorithm (writing it back if dirty), read the page in, update the table, then **return and re-execute** the faulting instruction.'),
            T('一条指令可能访问多个页（比如指令本身跨页、操作数又在别的页），所以**一条指令执行期间可能产生多次缺页**。', 'One instruction may touch several pages, so **it can fault more than once**.'),
          ],
        },
      ],
    },
    {
      id: 'policy',
      title: T('页面分配和调入策略', 'Allocation and fetch policies'),
      blocks: [
        { p: T('给一个进程分配的物理块集合叫**驻留集**。分配和置换的组合有三种：', 'The set of frames a process holds is its **resident set**. Three combinations are used:') },
        {
          table: {
            head: [T('策略', 'Policy'), T('含义', 'Meaning')],
            rows: [
              [T('固定分配局部置换', 'Fixed, local'), T('块数固定不变；缺页时只在自己的块里换', 'fixed number of frames; evict only own pages')],
              [T('可变分配全局置换', 'Variable, global'), T('缺页时可以拿系统的空闲块，或换出**任何进程**的页，块数随之变化', 'take a free frame or any process’s page; sizes change')],
              [T('可变分配局部置换', 'Variable, local'), T('缺页时只换自己的页；系统根据缺页率的高低给进程增减块数', 'evict own pages; the OS grows or shrinks the set by fault rate')],
            ],
          },
        },
        { warn: T('没有「固定分配全局置换」：块数固定就不能去占别的进程的块。', 'There is no “fixed, global”: a fixed allocation cannot take another process’s frames.') },
        { p: T('**何时调入**：预调页（运行前把可能用到的页一次调进来，靠预测，主要用于首次调入）；请求调页（运行中缺页时才调，每次一页）。', '**When to fetch**: prepaging (guess and load pages ahead, mainly at start) or demand paging (load on a fault, one page at a time).') },
      ],
    },
    {
      id: 'algo',
      title: T('页面置换算法', 'Replacement algorithms'),
      blocks: [
        { p: T('缺页而内存已满时，选哪一页换出，直接决定了以后还会缺多少次页。目标是**缺页率尽可能低**。', 'When a fault finds memory full, the choice of victim decides future faults. The goal is the **lowest fault rate**.') },
        {
          table: {
            head: [T('算法', 'Algorithm'), T('换出哪一页', 'Evicts'), T('评价', 'Notes')],
            rows: [
              [T('OPT 最佳', 'OPT'), T('以后最长时间不会被访问的页', 'the page used furthest in the future'), T('缺页率最低，但要预知未来，**无法实现**，只作为衡量标准', 'lowest possible, but needs the future: **a yardstick only**')],
              [T('FIFO 先进先出', 'FIFO'), T('最早调入的页', 'the oldest loaded page'), T('实现简单，但和程序的访问规律不符，性能差；会出现 **Belady 异常**', 'simple but ignores usage; suffers **Belady’s anomaly**')],
              [T('LRU 最近最久未使用', 'LRU'), T('最近最长时间没被访问的页', 'the page unused longest'), T('性能接近 OPT，但需要硬件支持（寄存器或栈），开销大', 'close to OPT but needs hardware support (registers or a stack)')],
              [T('CLOCK（简单）', 'CLOCK'), T('指针循环扫描，访问位为 1 的清 0 跳过，遇到 0 就换出', 'sweep; clear 1s, evict the first 0'), T('近似 LRU，开销小；也叫最近未用（NRU）算法', 'approximates LRU cheaply (NRU)')],
              [T('改进型 CLOCK', 'Enhanced CLOCK'), T('同时看访问位 A 和修改位 M，优先换出 (A, M) = (0, 0) 的页', 'considers (A, M), preferring (0, 0)'), T('优先换没改过的页，减少写回磁盘的次数', 'prefers clean pages, avoiding write-backs')],
            ],
          },
        },
        {
          p: T(
            '**改进型 CLOCK 的扫描**：第 1 轮找 (0, 0)，不改任何位；找不到就第 2 轮找 (0, 1)，并把扫描过的页访问位都清 0；还找不到就回到第 1 轮再找 (0, 0)，必要时再做第 2 轮。最多扫描 4 轮。',
            '**Enhanced CLOCK scan**: round 1 looks for (0, 0) without changing bits; round 2 looks for (0, 1), clearing access bits as it passes; then repeat. At most four rounds.',
          ),
        },
        { tip: T('**Belady 异常**：分配的物理块变多，缺页次数反而增加。只有 FIFO 会出现，LRU 和 OPT 不会（它们属于「栈式算法」）。本课的两个 Belady 预设可以亲眼看到。', '**Belady’s anomaly**: more frames, more faults. Only FIFO suffers it; LRU and OPT (stack algorithms) do not. Try the two Belady presets.') },
      ],
    },
    {
      id: 'thrash',
      title: T('抖动与工作集', 'Thrashing and the working set'),
      blocks: [
        { p: T('如果给进程的块太少，刚换出去的页马上又要用，又得调回来 —— 进程把大部分时间花在换页上，几乎不干活，这叫**抖动（颠簸）**。根本原因是同时运行的进程太多，每个进程分到的块不够用。', 'With too few frames a page just evicted is needed again at once; the process spends its time paging instead of working: **thrashing**. The root cause is too many processes for the memory.') },
        { p: T('**工作集** W(t, Δ)：在时刻 t 之前的 Δ 次访问（窗口）里，进程访问过的不同页面的集合。它反映进程最近真正需要的页。', 'The **working set** W(t, Δ) is the set of distinct pages referenced in the last Δ accesses before t: what the process really needs now.') },
        { formula: T('驻留集 ≥ 工作集，才不容易抖动', 'resident set ≥ working set avoids thrashing') },
        { p: T('例：访问串 …… 2 4 5 3 2 3，窗口 Δ = 5，最后 5 次访问的是 4 5 3 2 3，工作集 = {2, 3, 4, 5}，大小 4（重复的页只算一次）。', 'Example: references … 2 4 5 3 2 3, window Δ = 5: the last five are 4 5 3 2 3, so the working set is {2, 3, 4, 5}, size 4 (repeats count once).') },
      ],
    },
    {
      id: 'mmap',
      title: T('内存映射文件', 'Memory-mapped files'),
      blocks: [
        { p: T('**内存映射文件**：用一个系统调用把磁盘文件的一部分映射到进程的虚拟地址空间。之后进程读写这段内存，就相当于读写文件，不用再调 read / write。', 'A **memory-mapped file** puts part of a file into the virtual address space; reading and writing that memory reads and writes the file.') },
        { list: [
          T('映射时并不读文件；访问到某一页时才缺页，由操作系统把对应的文件块读进来（请求调页）。', 'Nothing is read at map time; pages come in on demand through page faults.'),
          T('改过的页由操作系统在适当时候写回文件（关闭映射或换出时）。', 'Dirty pages are written back by the OS (on unmap or eviction).'),
          T('几个进程映射同一个文件，它们的页表项指向同一批物理页框，这就实现了共享内存。', 'Processes mapping one file share the same frames: shared memory.'),
        ] },
        { tip: T('好处：程序员用访问内存的方式处理文件，少了在内核缓冲区和用户缓冲区之间的复制。', 'Files are handled like memory, saving copies between kernel and user buffers.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('最开始几页装入空闲块**也算缺页**，只是不算「置换」。题目问的是缺页次数还是置换次数要看清楚。', 'Loading into empty frames **counts as a fault** but not as a replacement; read which one is asked.'),
            T('缺页中断是**内中断**，在指令执行中途处理，处理完**重新执行**这条指令（不是执行下一条）。', 'A page fault is an **internal interrupt**, handled mid-instruction, and the **same** instruction is re-executed.'),
            T('Belady 异常只出现在 FIFO。', 'Only FIFO shows Belady’s anomaly.'),
            T('LRU 看的是**过去**最久没用，OPT 看的是**将来**最久不用，别弄反。', 'LRU looks at the **past**, OPT at the **future**.'),
            T('简单 CLOCK 换出页后，指针指向**下一块**；命中时只把访问位置 1，指针不动。', 'After a simple-CLOCK eviction the hand moves to the **next** frame; a hit only sets the bit.'),
            T('工作集里重复的页只算一次。', 'Repeated pages count once in the working set.'),
          ],
        },
      ],
    },
  ],
};
