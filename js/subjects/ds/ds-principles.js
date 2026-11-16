// 较早做好的三节数据结构课（Dijkstra、散列表、堆）的「原理」页，以及把动画步骤链到原理小节的规则。
import { T } from '../../core/i18n.js';

const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });

export const DIJKSTRA_PRINCIPLE = {
  sections: [
    {
      id: 'graph',
      title: T('图的存储', 'Storing a graph'),
      blocks: [
        {
          table: {
            head: ['', T('邻接矩阵', 'Adjacency matrix'), T('邻接表', 'Adjacency list')],
            rows: [
              [T('空间', 'Space'), 'O(n²)', T('无向图 O(n + 2e)，有向图 O(n + e)', 'O(n + e)')],
              [T('适合', 'Suits'), T('稠密图', 'dense graphs'), T('稀疏图', 'sparse graphs')],
              [T('判断两点间有没有边', 'Edge test'), 'O(1)', T('要扫描一条链表', 'scan a list')],
              [T('求某顶点的度', 'Degree'), T('扫一行（有向图出度扫行、入度扫列）', 'scan a row (or column)'), T('出度数链表长；入度要扫全部链表', 'list length; in-degree scans all lists')],
              [T('唯一性', 'Unique?'), T('唯一', 'yes'), T('不唯一（链表里结点顺序可以不同）', 'no (order within lists varies)')],
            ],
          },
        },
        { p: T('有向图还常用**十字链表**（同时方便求出度和入度），无向图常用**邻接多重表**（每条边只存一次）。', 'Directed graphs also use **orthogonal lists**; undirected graphs **adjacency multilists**.') },
      ],
    },
    {
      id: 'algo',
      title: T('Dijkstra 算法', 'Dijkstra’s algorithm'),
      blocks: [
        { p: T('求**单源**最短路径：从源点到其余各顶点的最短路径。做法是把顶点分成两组：集合 S 里是已经求出最短路径的顶点，其余是还没确定的。', 'Single-source shortest paths. Vertices split into S (settled) and the rest.') },
        {
          steps: [
            T('初始化：S = {源点}；dist[v] 取源点到 v 的边权，没有边就是 ∞；', 'start: S = {source}; dist[v] = edge weight or ∞;'),
            T('从不在 S 里的顶点中，选 dist 最小的顶点 u 加入 S——它的最短路径就确定了；', 'pick the unsettled u with the smallest dist and settle it;'),
            T('用 u 去「松弛」其余顶点：若 dist[u] + w(u, v) < dist[v]，就更新 dist[v]，并记下 v 的前驱是 u；', 'relax: if dist[u] + w(u, v) < dist[v], update dist[v] and set prev[v] = u;'),
            T('重复 2、3，直到所有顶点都进入 S（或剩下的都不可达）。', 'repeat until everything is settled or unreachable.'),
          ],
        },
        { p: T('用邻接矩阵实现时，每一轮找最小值、松弛都是 O(n)，共 n 轮，时间复杂度 O(n²)。', 'With a matrix each round is O(n): O(n²) overall.') },
        { warn: T('Dijkstra **不能用于有负权边**的图：已经放进 S 的顶点，后面可能被一条负权边「抄近路」，但算法不会再回头修改它。', 'Dijkstra fails with **negative edges**: a settled vertex could later be undercut.') },
      ],
    },
    {
      id: 'tree',
      title: T('最短路径树与求路径', 'The shortest-path tree'),
      blocks: [
        { p: T('每个顶点记下「最后一次更新它的顶点」（前驱 prev）。从目标顶点顺着 prev 一路倒推回源点，再反过来，就是最短路径。所有 (prev[v], v) 边合起来是一棵以源点为根的**最短路径树**。', 'Each vertex keeps the vertex that last improved it. Following prev back to the source gives the path; all (prev[v], v) edges form the **shortest-path tree**.') },
      ],
    },
    {
      id: 'others',
      title: T('和其他图算法对比', 'Related algorithms'),
      blocks: [
        {
          table: {
            head: [T('算法', 'Algorithm'), T('解决', 'Solves'), T('时间', 'Time'), T('负权边', 'Negative edges')],
            rows: [
              ['BFS', T('无权图单源最短路径', 'unweighted single source'), 'O(n + e)', '—'],
              ['Dijkstra', T('带权图单源最短路径', 'weighted single source'), 'O(n²)', T('不行', 'no')],
              ['Floyd', T('每一对顶点之间的最短路径', 'all pairs'), 'O(n³)', T('允许负权边，不允许负权回路', 'edges yes, cycles no')],
              ['Prim', T('最小生成树', 'minimum spanning tree'), 'O(n²)', '—'],
            ],
          },
        },
        { tip: T('Dijkstra 和 Prim 写法很像，区别在「选最小的什么」：Dijkstra 比的是到**源点**的距离 dist，Prim 比的是到**当前生成树**的最短边。', 'Dijkstra and Prim look alike: Dijkstra compares distance to the **source**, Prim the cheapest edge to the **tree so far**.') },
      ],
    },
    pit([
      T('每轮选的是「不在 S 中且 dist 最小」的顶点，不是和刚加入的顶点相邻的最短边。', 'Pick the smallest dist overall, not the shortest edge from the last vertex.'),
      T('更新 dist 时要加上 dist[u]，不是只看边权。', 'Relaxation adds dist[u].'),
      T('题目问「第几轮加入哪个顶点」时，按 dist 从小到大的次序就是加入次序。', 'Vertices join S in increasing order of distance.'),
    ]),
  ],
};
export const dijkstraRef = (s, i, all) => (i === all.length - 1 ? 'tree' : 'algo');

export const HASH_PRINCIPLE = {
  sections: [
    {
      id: 'idea',
      title: T('散列表的思想', 'The idea'),
      blocks: [
        { p: T('散列表根据关键字直接**算出**存放地址：地址 = H(key)。理想情况下查找只需要一次比较，与表中元素个数无关。但不同的关键字可能算出同一个地址，这叫**冲突**，冲突的关键字叫**同义词**。', 'A hash table **computes** the address H(key), ideally one probe regardless of size. Different keys may collide; they are **synonyms**.') },
        {
          table: {
            head: [T('散列函数', 'Hash function'), T('做法', 'How')],
            rows: [
              [T('除留余数法', 'Division'), T('H(key) = key mod p，p 取不大于表长、最接近表长的质数（最常用）', 'key mod p with p a prime near the table size (most common)')],
              [T('直接定址法', 'Direct'), T('H(key) = a·key + b，不会冲突，但空间可能浪费', 'a·key + b; no collisions but wasteful')],
              [T('数字分析法、平方取中法', 'Digit analysis, mid-square'), T('取关键字中分布均匀的几位', 'use well-distributed digits')],
            ],
          },
        },
      ],
    },
    {
      id: 'open',
      title: T('开放定址法', 'Open addressing'),
      blocks: [
        { formula: T('Hᵢ = (H(key) + dᵢ) mod m', 'Hᵢ = (H(key) + dᵢ) mod m') },
        {
          list: [
            T('**线性探测**：dᵢ = 1, 2, 3, …，依次看下一个位置。容易造成**堆积**（聚集）：同义词和非同义词挤在一起，越堆越长。', '**Linear probing**: 1, 2, 3, …; causes **clustering**.'),
            T('**平方探测**：dᵢ = 1², −1², 2², −2², …，能减少堆积，但不一定能探测到所有位置（表长要是 4k + 3 的质数）。', '**Quadratic probing**: ±1², ±2², …; less clustering but may miss slots.'),
            T('**双散列**：dᵢ = i × H₂(key)。', '**Double hashing**: dᵢ = i × H₂(key).'),
          ],
        },
        { warn: T('开放定址法不能直接删除元素（会切断后面同义词的探测路线），只能做删除标记。', 'Open addressing cannot simply delete; use tombstones.') },
      ],
    },
    {
      id: 'chain',
      title: T('拉链法', 'Separate chaining'),
      blocks: [
        { p: T('把所有同义词存在同一条链表里，散列表的每个单元存一个链表头指针。不会堆积，删除方便，适合经常插入删除的情况。', 'All synonyms go on one linked list per address: no clustering, easy deletion.') },
      ],
    },
    {
      id: 'asl',
      title: T('平均查找长度 ASL', 'Average search length'),
      blocks: [
        { p: T('**ASL 成功**：查找表中每个关键字时比较的次数取平均——等于插入它时探测的次数。分母是**关键字个数**。', '**Hit ASL**: average comparisons over the stored keys, equal to their insertion probes; divide by the **number of keys**.') },
        { p: T('**ASL 失败**：散列函数可能算出的每个地址（0 ～ p − 1）出发，直到能确定「不存在」时比较的次数取平均。开放定址法要一直探测到**空位置**，和空位置的比较也算一次；拉链法只数和链上关键字的比较。分母是**散列函数能算出的地址个数 p**。', '**Miss ASL**: from each address 0…p − 1, count comparisons until absence is certain (open addressing counts the empty slot; chaining counts only keys). Divide by **p**, the number of hash values.') },
        { formula: T('装填因子 α = 表中记录数 n ÷ 散列表长度 m', 'load factor α = n ÷ m') },
        { tip: T('散列表的 ASL 只和装填因子 α 有关，和 n、m 本身无关：α 越大，冲突越多，ASL 越大。', 'ASL depends only on α, not on n or m.') },
      ],
    },
    pit([
      T('ASL 失败的分母是 p（能算出的地址数），不是表长 m，也不是关键字个数。', 'The miss-ASL denominator is p, not m or n.'),
      T('线性探测到表尾要绕回表头（mod m）。', 'Linear probing wraps around (mod m).'),
      T('冲突只能减少，不能完全避免。', 'Collisions can be reduced, never eliminated.'),
    ]),
  ],
};
export const hashRef = (method) => (s, i, all) => (i >= all.length - 2 ? 'asl' : method === 'chain' ? 'chain' : 'open');

export const HEAP_PRINCIPLE = {
  sections: [
    {
      id: 'def',
      title: T('堆是什么', 'What a heap is'),
      blocks: [
        { p: T('n 个关键字的序列 L[1..n]，满足 L[i] ≥ L[2i] 且 L[i] ≥ L[2i + 1] 的是**大根堆**（≤ 就是小根堆）。把它看成一棵完全二叉树（按层序编号存在数组里），就是：每个结点都不小于它的孩子，堆顶（根）是最大值。', 'A sequence with L[i] ≥ L[2i] and L[i] ≥ L[2i + 1] is a **max-heap** (≤ for a min-heap): as a complete binary tree in level order, every node is at least its children and the root is the maximum.') },
        { warn: T('堆只保证「父不小于子」，兄弟之间、不同子树之间没有大小关系，所以堆不是有序序列。', 'A heap orders parents over children only; it is not sorted.') },
      ],
    },
    {
      id: 'build',
      title: T('筛选法建堆', 'Building by sifting down'),
      blocks: [
        {
          steps: [
            T('从最后一个非叶结点 ⌊n/2⌋ 开始，依次往前处理到根；', 'from the last internal node ⌊n/2⌋ back to the root;'),
            T('对每个结点做「向下调整」：如果它比孩子中较大的那个小，就和它交换，再继续往下调整，直到不小于孩子或到达叶子。', 'sift down: swap with the larger child while smaller, continuing downward.'),
          ],
        },
        { p: T('比较次数：结点有两个孩子时，先比较两个孩子（1 次），再和较大的孩子比（1 次），共 2 次；只有一个孩子时 1 次。建堆总时间是 **O(n)**。', 'Two children cost 2 comparisons per level, one child 1. Building takes **O(n)**.') },
      ],
    },
    {
      id: 'insert',
      title: T('插入与删除', 'Insertion and deletion'),
      blocks: [
        { p: T('**插入**：新元素放在堆的末尾，然后「向上调整」：比双亲大就交换，一直往上，直到不大于双亲或到达根。每层比较 1 次，O(log n)。逐个插入建堆总共 O(n log n)，结果可能和筛选法建的堆不同。', '**Insert** at the end and sift up, one comparison per level: O(log n). Building this way is O(n log n) and may give a different heap.') },
        { p: T('**删除堆顶**：用最后一个元素替换堆顶，再从根「向下调整」。', '**Delete the root**: move the last element to the root and sift down.') },
      ],
    },
    {
      id: 'sort',
      title: T('堆排序', 'Heapsort'),
      blocks: [
        {
          steps: [
            T('先把序列建成大根堆；', 'build a max-heap;'),
            T('把堆顶（当前最大）和堆的最后一个元素交换，堆的大小减 1；', 'swap the root with the last element and shrink the heap;'),
            T('对新的堆顶做向下调整，恢复成堆；', 'sift the new root down;'),
            T('重复 n − 1 次，得到递增序列。', 'repeat n − 1 times for ascending order.'),
          ],
        },
        { p: T('时间复杂度 O(n log n)（最好、最坏、平均都是），空间 O(1)，**不稳定**。适合在大量数据里选出前 k 个最大（或最小）的元素。', 'O(n log n) in every case, O(1) space, **unstable**; good for picking the top k.') },
        { tip: T('升序排序用大根堆，降序用小根堆。', 'Ascending order uses a max-heap.') },
      ],
    },
    pit([
      T('建堆从 ⌊n/2⌋ 开始往前，不是从根开始往后。', 'Start at ⌊n/2⌋ and go backward.'),
      T('向下调整时要和较大的孩子交换（大根堆）。', 'Swap with the larger child.'),
      T('数组下标从 1 开始时，孩子是 2i 和 2i + 1；从 0 开始时是 2i + 1 和 2i + 2。', 'Children are 2i, 2i + 1 with 1-based indices.'),
    ]),
  ],
};
export const heapRef = (op) => () => (op === 'sort' ? 'sort' : op === 'insert' ? 'insert' : 'build');
