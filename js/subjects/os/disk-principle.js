// 「磁盘调度」这节课的原理：磁盘结构、一次读写的时间、调度算法、减少旋转延迟。
import { T } from '../../core/i18n.js';

export const DISK_PRINCIPLE = {
  sections: [
    {
      id: 'struct',
      title: T('磁盘的结构', 'Disk structure'),
      blocks: [
        {
          list: [
            T('磁盘由若干**盘片**组成，每个盘面上有一圈圈同心圆叫**磁道**，每个磁道又分成若干**扇区**，扇区是读写的最小单位。', 'A disk has **platters**; each surface has concentric **tracks** divided into **sectors**, the smallest unit read or written.'),
            T('所有盘面上相同半径的磁道组成一个**柱面**。磁头装在同一个磁臂上一起移动，所以一次寻道就定位到一个柱面。', 'Tracks at the same radius on all surfaces form a **cylinder**; the heads move together, so one seek reaches a cylinder.'),
            T('一个扇区的地址是（柱面号, 盘面号, 扇区号）。', 'A sector is addressed as (cylinder, surface, sector).'),
          ],
        },
      ],
    },
    {
      id: 'time',
      title: T('一次读写要花多少时间', 'Time of one access'),
      blocks: [
        {
          table: {
            head: [T('时间', 'Part'), T('含义', 'Meaning'), T('计算', 'Formula')],
            rows: [
              [T('寻道时间 Ts', 'Seek Ts'), T('磁头移到目标磁道', 'move the head to the track'), T('启动磁臂 s + 跨越 n 条磁道 m × n', 'start-up s + n tracks × m')],
              [T('旋转延迟 Tr', 'Rotational Tr'), T('等目标扇区转到磁头下面', 'wait for the sector to come round'), T('平均转半圈：1 / (2r)，r 是转速', 'half a turn on average: 1/(2r)')],
              [T('传输时间 Tt', 'Transfer Tt'), T('读写数据', 'move the data'), T('b / (r N)：b 字节，每道 N 字节', 'b/(rN): b bytes, N per track')],
            ],
          },
        },
        { p: T('旋转延迟和传输时间由转速决定，操作系统改变不了；**寻道时间**取决于磁头要走多远，而这正是磁盘调度算法能优化的部分。', 'Rotation and transfer depend on the spindle speed, which the OS cannot change; **seek time** depends on how far the head moves, which scheduling can reduce.') },
      ],
    },
    {
      id: 'algo',
      title: T('磁盘调度算法', 'Disk-scheduling algorithms'),
      blocks: [
        {
          table: {
            head: [T('算法', 'Algorithm'), T('怎么走', 'How'), T('评价', 'Notes')],
            rows: [
              ['FCFS', T('按请求到达的顺序', 'arrival order'), T('公平，但请求分散时磁头来回跑，寻道很长', 'fair but zig-zags when requests are spread')],
              ['SSTF', T('每次去离磁头最近的请求', 'nearest request next'), T('平均寻道短，但远处的请求可能一直等 —— **饥饿**', 'short seeks but distant requests may **starve**')],
              [T('SCAN（电梯）', 'SCAN (elevator)'), T('沿一个方向扫到磁盘端点，途中服务请求，再掉头', 'sweep to the end, serving on the way, then reverse'), T('不会饥饿；但两端的请求刚被扫过就得等一个来回，等待时间不均匀', 'no starvation; edge requests may wait a full round')],
              ['LOOK', T('像 SCAN，但只走到这个方向最远的请求就掉头', 'like SCAN but turns at the last request'), T('比 SCAN 少走空路', 'avoids the empty run to the end')],
              ['C-SCAN', T('只沿一个方向服务，到端点后直接回到另一端', 'serve one way only; jump back to the start'), T('各位置的等待时间更均匀', 'more uniform waiting')],
              ['C-LOOK', T('只走到最远的请求，再跳到另一侧最远的请求', 'turn at the last request, jump to the first on the other side'), T('C-SCAN 的改进', 'refines C-SCAN')],
            ],
          },
        },
        { warn: T('不同教材对 SCAN、C-SCAN 是否一定要走到磁盘端点、C-SCAN 返回的那段距离要不要计入，说法不一。做题时以题目说明为准；本课的约定写在概览的「本课约定」里，回程是否计入可以切换。', 'Texts differ on whether SCAN / C-SCAN must reach the end and whether the C-SCAN return counts. Follow the question; this lesson’s conventions are listed in the overview and the return can be toggled.') },
      ],
    },
    {
      id: 'rot',
      title: T('减少旋转延迟', 'Cutting rotational delay'),
      blocks: [
        {
          list: [
            T('**交替编号**：读完一个扇区后要花时间处理数据，处理完下一个扇区已经转过去了。把逻辑上相邻的扇区在物理上隔开放，处理完正好转到下一个。', '**Interleaving**: after reading a sector the controller needs time; placing logically consecutive sectors apart means the next one arrives just in time.'),
            T('**错位命名**：相邻盘面的扇区编号错开一点，磁头切换盘面后不用再等一整圈。', '**Skewing**: offset sector numbering on adjacent surfaces so switching heads does not cost a full turn.'),
          ],
        },
      ],
    },
    {
      id: 'ssd',
      title: T('固态硬盘', 'Solid-state drives'),
      blocks: [
        { p: T('固态硬盘（SSD）用闪存存数据，由一块块**闪存块**组成，每块又分成若干**页**。它没有磁头和盘片，所以没有寻道时间和旋转延迟，随机读写比磁盘快得多。', 'An SSD stores data in flash **blocks** of **pages**. With no heads or platters it has no seek or rotation, so random access is fast.') },
        { list: [
          T('**以页为单位读写，以块为单位擦除**；写之前必须先擦除，不能直接覆盖原来的页。', '**Read and write by page, erase by block**; pages must be erased before rewriting.'),
          T('改写一页时，通常把新内容写到别处一个空页，原页标记为无效；块里无效页多了再整体搬走有效页、擦除这一块（垃圾回收）。', 'Updates go to a fresh page; the old one is marked invalid and reclaimed later by garbage collection.'),
          T('**闪存翻译层（FTL）**把逻辑块号映射到物理页，上面的文件系统看到的仍像一块普通磁盘。', 'The **flash translation layer** maps logical blocks to physical pages.'),
          T('每块能擦写的次数有限，所以要做**磨损均衡**：动态磨损均衡把写入引向擦得少的块；静态磨损均衡还会把很少改动的老数据搬走，让那些块也参与擦写。', 'Blocks wear out, so **wear levelling** spreads writes (dynamic) and also moves cold data (static).'),
        ] },
        { tip: T('对 SSD 来说，按磁道距离排序的磁盘调度算法基本没有意义；随机写比顺序写慢，主要是因为要擦除和搬运。', 'Seek-based disk scheduling hardly matters for SSDs; random writes are slower because of erasing and copying.') },
      ],
    },
    {
      id: 'pitfall',
      title: T('易错点', 'Common mistakes'),
      blocks: [
        {
          list: [
            T('**平均寻道长度** = 磁头移动的总磁道数 ÷ 请求个数。', '**Average seek length** = total tracks moved ÷ number of requests.'),
            T('SCAN / LOOK 要先看清磁头当前的移动方向。', 'Check the head’s current direction for SCAN / LOOK.'),
            T('只有 SSTF 会饥饿；FCFS 和各种扫描算法都不会。', 'Only SSTF can starve requests.'),
            T('磁盘调度只能减少寻道时间，减不了旋转延迟和传输时间。', 'Scheduling reduces seek time only.'),
          ],
        },
      ],
    },
  ],
};
