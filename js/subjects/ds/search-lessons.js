// 查找这一章的三节课：折半查找与判定树、二叉排序树、B 树。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { cell, errOf, stepKit, toSteps } from '../../core/steps.js';
import { bsearch, bst, btree, flatB, keysInOrder, parseOps } from './searching.js';
import { layout, treeItems } from './tree.js';

const KIND = { dup: T('重复', 'dup'), missing: T('不存在', 'absent'), ins: T('插入', 'insert'), leaf: T('删叶子', 'leaf'), one: T('子树顶上', 'one child'), two: T('后继替代', 'successor'), split: T('分裂', 'split'), del: T('删除', 'delete'), pred: T('前驱替代', 'predecessor'), borrowL: T('借左兄弟', 'borrow left'), borrowR: T('借右兄弟', 'borrow right'), merge: T('合并', 'merge') };
const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
const frac = ([a, b]) => `${a}/${b}`;
function make(id, spec, ERR, build) {
  const kit = stepKit({ spec, rowsName: T('过程', 'Steps') });
  return () => parametric(id, spec.presets[0].set, (p) => build(p, kit, ERR));
}
function shell(id, kit, ERR, sim, o) {
  return { id, kit, where: o.where, tag: o.tag, name: o.name, full: o.full, title: o.title, nodes: [], legend: o.legend, principle: o.principle, sim, errors: sim.ok ? [] : errOf(ERR, sim.errors), overview: { desc: o.desc, facts: o.facts ?? [] }, start: { nodes: [], frame: { rect: o.rect ?? [0, 40, 900, 520] }, events: [] }, steps: [], outro: { title: '', text: '', facts: [] } };
}
function finish(lesson, list, board, title, text, facts = []) {
  const b = toSteps(list, board);
  lesson.steps = b.steps;
  lesson.start.events = b.start;
  lesson.outro = { title, text, facts };
  return lesson;
}

// ═════════════════════════ 折半查找 ═════════════════════════

const BS_PRINCIPLE = {
  sections: [
    {
      id: 'seq',
      title: T('顺序查找和分块查找', 'Sequential and block search'),
      blocks: [
        {
          table: {
            head: [T('方法', 'Method'), T('要求', 'Needs'), T('ASL 成功', 'ASL (hit)'), T('说明', 'Notes')],
            rows: [
              [T('顺序查找', 'Sequential'), T('无（顺序表、链表都行）', 'nothing'), '(n + 1) / 2', T('设「哨兵」可以省去每次判越界；失败要比较 n + 1 次', 'a sentinel saves bound checks; a miss costs n + 1')],
              [T('折半查找', 'Binary'), T('有序 + 顺序存储（要随机访问）', 'sorted array'), T('约 log₂(n + 1) − 1', '≈ log₂(n + 1) − 1'), T('时间 O(log n)', 'O(log n)')],
              [T('分块查找', 'Block'), T('块间有序、块内无序', 'blocks ordered, contents not'), T('索引表 + 块内两部分之和', 'index search + block search'), T('块大小取 √n 时最优', 'best with blocks of √n')],
            ],
          },
        },
      ],
    },
    {
      id: 'bin',
      title: T('折半查找的过程', 'Binary search'),
      blocks: [
        {
          steps: [
            T('low = 1，high = n；', 'low = 1, high = n;'),
            T('mid = ⌊(low + high) / 2⌋，拿 key 和 a[mid] 比；', 'mid = ⌊(low + high) / 2⌋, compare with a[mid];'),
            T('相等就找到；key 小就在左半边找（high = mid − 1），key 大就在右半边（low = mid + 1）；', 'equal: found; smaller: high = mid − 1; larger: low = mid + 1;'),
            T('low > high 时查找失败。', 'fail when low > high.'),
          ],
        },
      ],
    },
    {
      id: 'tree',
      title: T('判定树和 ASL', 'Decision trees and ASL'),
      blocks: [
        { p: T('把每次比较的 mid 画成结点：根是第一次的 mid，左子树是左半边、右子树是右半边，就得到**判定树**。它是一棵二叉排序树，而且是**平衡**的（任意结点左右子树结点数最多差 1，用向下取整时右子树不少于左子树）。', 'Drawing each mid as a node gives the **decision tree**: a balanced binary search tree (with ⌊⌋, right subtrees are never smaller).') },
        {
          list: [
            T('查找成功的比较次数 = 结点所在的层数；ASL 成功 = 各结点层数之和 ÷ n。', 'A hit costs the node’s depth; ASL = sum of depths ÷ n.'),
            T('判定树补上 n + 1 个**失败结点**（方框）；查找失败的比较次数 = 失败结点的父结点所在层数；ASL 失败 = 总和 ÷ (n + 1)。', 'Add n + 1 **failure nodes**; a miss costs its parent’s depth; divide by n + 1.'),
            T('判定树高 h = ⌈log₂(n + 1)⌉，比较次数最多 h 次。', 'Height ⌈log₂(n + 1)⌉: at most that many comparisons.'),
          ],
        },
      ],
    },
    pit([
      T('折半查找只能用于有序的顺序表，不能用于链表。', 'Binary search needs a sorted array, not a list.'),
      T('ASL 失败的分母是 n + 1（失败结点数），比较次数看失败结点的父结点。', 'Miss ASL divides by n + 1.'),
      T('向下取整和向上取整得到的判定树不同，看清题目。', 'Floor and ceiling give different trees.'),
    ]),
  ],
};

const BS_SPEC = {
  presets: [
    { label: T('11 个元素，找 21', '11 keys, find 21'), set: { keys: [7, 14, 18, 21, 23, 29, 31, 35, 38, 42, 46], target: 21 } },
    { label: T('找不到 40', 'Miss 40'), set: { keys: [7, 14, 18, 21, 23, 29, 31, 35, 38, 42, 46], target: 40 } },
    { label: T('8 个元素', '8 keys'), set: { keys: [5, 13, 19, 21, 37, 56, 64, 75], target: 64 } },
  ],
  groups: [{ legend: T('有序表', 'Sorted array'), fields: [
    { name: 'keys', label: T('关键字（从小到大，最多 20 个）', 'Keys (ascending, up to 20)'), type: 'list', min: -9999, max: 9999, maxLen: 20, wide: true },
    { name: 'target', label: T('要找的关键字', 'Target'), type: 'int', min: -9999, max: 9999 },
  ] }],
  note: T('位置从 1 开始编号，mid = ⌊(low + high) / 2⌋。', 'Positions start at 1; mid = ⌊(low + high) / 2⌋.'),
};
const BS_ERR = { keys: T('要有 1～20 个关键字', 'Give 1–20 keys'), sorted: T('关键字要从小到大排好', 'Keys must be ascending') };

const CW = 46;
function bsBoard(sim, st, z) {
  const items = [];
  const s = st.k >= 0 ? sim.steps[st.k] : null;
  let h = txt(-14, 18, z ? '有序表' : 'Array', 'bt-cap', 'end');
  sim.keys.forEach((v, i) => {
    const p = i + 1;
    const out = s && (p < s.low || p > s.high);
    h += `<g transform="translate(${i * CW} 0)">${cell(CW - 6, 30, String(v), { size: 13, cls: s && p === s.mid ? (s.cmp === 0 ? 'ok' : 'hot') : out ? 'dim' : '' })}${txt((CW - 6) / 2, 46, String(p), 'bt-idx')}</g>`;
  });
  if (s) {
    const X = (p) => (p - 1) * CW + (CW - 6) / 2;
    h += txt(X(s.low), -10, 'low', 'bs-ptr', 'middle') + txt(X(s.high), s.low === s.high ? -24 : -10, 'high', 'bs-ptr', 'middle') + txt(X(s.mid), 62, 'mid', 'bs-ptr mid', 'middle');
  }
  items.push({ k: 'arr', x: 120, y: 110, html: h });
  // 判定树：已经比较过的结点标出来
  const asked = new Set(sim.steps.slice(0, (st.k ?? -1) + 1).map((x) => x.mid));
  const { count } = layout(sim.root);
  const dx = Math.max(38, Math.min(56, (Math.max(sim.n, 8) * CW) / count));
  items.push(...treeItems(sim.root, {
    x0: 120 + 16,
    y0: 250,
    dx,
    dy: 62,
    r: 17,
    cls: (n) => (s && n.pos === s.mid ? (s.cmp === 0 ? 'ok' : 'hot') : asked.has(n.pos) ? 'warn' : ''),
    tag: (n) => (st.asl ? `${n.d}` : null),
  }));
  if (st.asl) items.push({ k: 'asl', x: 120, y: 250 + sim.height * 62 + 20, html: txt(0, 0, z ? `ASL 成功 = ${frac(sim.succ)}，ASL 失败 = ${frac(sim.fail)}（结点下面的数是层数）` : `ASL hit = ${frac(sim.succ)}, miss = ${frac(sim.fail)}`, 'bt-lab', 'start') });
  return items;
}

function buildBs(p, kit, ERR) {
  const sim = bsearch(p);
  const lesson = shell('binary-search', kit, ERR, sim, {
    where: [['ds', 'search']],
    tag: T('折半', 'Bin'),
    name: T('折半查找与判定树', 'Binary search and decision trees'),
    full: T('顺序 / 折半 / 分块查找 · low、mid、high · 判定树 · ASL 成功与失败', 'Sequential / binary / block · low, mid, high · decision tree · ASL'),
    title: sim.ok ? T(`${sim.n} 个元素，找 ${p.target}`, `${sim.n} keys, find ${p.target}`) : T('参数有误', 'Invalid parameters'),
    legend: [['orange', T('这一次的 mid', 'This mid')], ['amber', T('比较过的', 'Compared')]],
    principle: BS_PRINCIPLE,
    desc: T('折半查找每次和中间的元素比，排除一半。上面的有序表标着 low、mid、high，下面的判定树是所有可能的比较路径——这次查找走过的结点会一个个亮起来，最后算出 ASL 成功和 ASL 失败。', 'Each comparison halves the range. The array shows low, mid and high; the decision tree below lights up the path taken, and ASL is computed at the end.'),
    rect: [40, 60, 120 + Math.max(sim.ok ? sim.n : 8, 8) * CW + 30, 250 + (sim.ok ? sim.height : 4) * 62 + 40],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s, k) => ({
    title: s.cmp === 0 ? T(`mid = ${s.mid}：${s.v} = ${p.target}，找到`, `mid = ${s.mid}: found`) : T(`mid = ${s.mid}：${p.target} ${s.cmp < 0 ? '<' : '>'} ${s.v}，往${s.cmp < 0 ? '左' : '右'}`, `mid = ${s.mid}: go ${s.cmp < 0 ? 'left' : 'right'}`),
    desc: T(`low = ${s.low}，high = ${s.high}`, `low = ${s.low}, high = ${s.high}`),
    detail: T(`mid = ⌊(${s.low} + ${s.high}) / 2⌋ = ${s.mid}，a[${s.mid}] = ${s.v}。${s.cmp === 0 ? `相等，查找成功，比较了 ${k + 1} 次——正好是 ${s.v} 在判定树里的层数。` : s.cmp < 0 ? `${p.target} 比它小，只可能在左半边：high = ${s.mid - 1}。` : `${p.target} 比它大，只可能在右半边：low = ${s.mid + 1}。`}`, `mid = ⌊(${s.low} + ${s.high}) / 2⌋ = ${s.mid}, a[mid] = ${s.v}. ${s.cmp === 0 ? `Found after ${k + 1} comparisons.` : s.cmp < 0 ? `high = ${s.mid - 1}.` : `low = ${s.mid + 1}.`}`),
    ref: 'bin',
    st: { k },
    row: { color: s.cmp === 0 ? 'green' : 'orange', what: `mid = ${s.mid}`, result: String(s.v), tone: s.cmp === 0 ? 'ok' : 'info' },
  }));
  if (!sim.found) {
    const last = sim.steps.at(-1);
    list.push({ title: T('low > high：查找失败', 'low > high: not found'), desc: T(`比较了 ${sim.steps.length} 次`, `${sim.steps.length} comparisons`), detail: T(`区间已经空了，${p.target} 不在表中。比较了 ${sim.steps.length} 次，等于判定树中失败结点的父结点 ${last.v} 所在的层数。`, `The range is empty: ${p.target} is absent after ${sim.steps.length} comparisons.`), ref: 'tree', st: { k: sim.steps.length - 1 }, row: { color: 'rose', what: T('失败', 'Miss'), result: String(sim.steps.length), tone: 'warn' } });
  }
  list.push({ title: T(`ASL 成功 ${frac(sim.succ)}，失败 ${frac(sim.fail)}`, `ASL hit ${frac(sim.succ)}, miss ${frac(sim.fail)}`), desc: T(`判定树各层 ${sim.levels.join('、')} 个结点`, `Levels: ${sim.levels.join(', ')}`), detail: T(`成功：每层结点数 × 层数求和 = ${sim.levels.map((c, i) => `${c}×${i + 1}`).join(' + ')} = ${sim.succ[0]}，除以 ${sim.n}。失败：${sim.n + 1} 个失败结点各按父结点层数计，总和 ${sim.fail[0]}，除以 ${sim.n + 1}。`, `Hit: ${sim.levels.map((c, i) => `${c}×${i + 1}`).join(' + ')} = ${sim.succ[0]} over ${sim.n}. Miss: ${sim.fail[0]} over ${sim.n + 1}.`), ref: 'tree', st: { k: sim.steps.length - 1, asl: true }, row: { color: 'green', what: 'ASL', result: `${frac(sim.succ)} / ${frac(sim.fail)}`, tone: 'ok' } });
  return finish(lesson, list, (k, z) => bsBoard(sim, k < 0 ? { k: -1 } : list[k].st, z), T(sim.found ? `第 ${sim.steps.length} 次找到` : '查找失败', sim.found ? `Found in ${sim.steps.length}` : 'Not found'), T('换一个要找的数，看路径怎么沿着判定树往下走。', 'Try another target and follow its path down the tree.'));
}
export const makeBsearch = make('binary-search', BS_SPEC, BS_ERR, buildBs);

// ═════════════════════════ 二叉排序树 ═════════════════════════

const BST_PRINCIPLE = {
  sections: [
    {
      id: 'def',
      title: T('二叉排序树', 'Binary search trees'),
      blocks: [
        { p: T('左子树上所有关键字 < 根 < 右子树上所有关键字，左右子树也是二叉排序树。**中序遍历得到递增序列**。', 'Left < root < right recursively; **inorder is ascending**.') },
        { p: T('**查找**和**插入**都从根往下比：小往左、大往右。插入的新结点一定是叶子，插入时不需要移动其他结点。', '**Search** and **insert** walk down; new nodes become leaves.') },
      ],
    },
    {
      id: 'del',
      title: T('删除的三种情况', 'Three deletion cases'),
      blocks: [
        {
          table: {
            head: [T('被删结点 z', 'Node z'), T('做法', 'Action')],
            rows: [
              [T('叶子', 'a leaf'), T('直接删掉', 'remove it')],
              [T('只有左子树或只有右子树', 'one subtree'), T('让子树顶替 z 的位置', 'its subtree takes its place')],
              [T('左右子树都有', 'two subtrees'), T('用 z 的中序直接后继（右子树最小的结点，也可以用直接前驱）替代 z，再删掉那个后继——后继最多只有右子树，回到前两种情况', 'replace z by its inorder successor (or predecessor), then delete that node')],
            ],
          },
        },
        { warn: T('删除一个结点再插回去，得到的树不一定和原来一样（删的是非叶结点时通常不一样）。', 'Deleting and reinserting a node usually changes the tree.') },
      ],
    },
    {
      id: 'asl',
      title: T('查找效率', 'Efficiency'),
      blocks: [
        { p: T('ASL 取决于树的形状：和折半查找的判定树一样平衡时 O(log n)；按有序序列插入会退化成单支树，O(n)。为此有平衡二叉树（AVL）和红黑树。', 'ASL depends on shape: O(log n) when balanced, O(n) as a chain; hence AVL and red-black trees.') },
      ],
    },
    pit([
      T('同一组关键字，插入顺序不同，得到的二叉排序树不同。', 'Different insertion orders give different trees.'),
      T('后继是右子树里最左下的结点，不是右孩子。', 'The successor is the leftmost node of the right subtree.'),
    ]),
  ],
};
const BST_SPEC = {
  presets: [
    { label: T('三种删除', 'Three deletions'), set: { ops: '50 30 70 20 40 60 80 -20 -30 -50' } },
    { label: T('有序插入：退化成链', 'Sorted inserts: a chain'), set: { ops: '10 20 30 40 50' } },
  ],
  groups: [{ legend: T('操作', 'Operations'), fields: [{ name: 'ops', label: T('依次执行：数字是插入，-数字是删除', 'Numbers insert, -numbers delete'), type: 'text', wide: true, parse: (s) => (parseOps(s) ? s : NaN) }] }],
  note: T('删除有两个孩子的结点时用中序直接后继替代。', 'A node with two children is replaced by its inorder successor.'),
};
const BST_ERR = { ops: T('最多 20 个操作', 'At most 20 operations') };

function bstBoard(sim, k, z) {
  const s = k >= 0 ? sim.steps[k] : null;
  if (!s?.tree) return [{ k: 'empty', x: 300, y: 200, html: txt(0, 0, z ? '（空树）' : '(empty)', 'bt-dim') }];
  const path = new Set(s.path);
  const items = treeItems(s.tree, {
    x0: 80,
    y0: 140,
    cls: (n) => (n.val === s.k && s.kind === 'ins' ? 'hot' : s.kind === 'two' && n.val === s.succ ? 'ok' : path.has(n.val) ? 'warn' : ''),
  });
  items.push({ k: 'io', x: 80, y: 100, html: txt(0, 0, (z ? '中序：' : 'Inorder: ') + inorderVals(s.tree).join(' '), 'bt-cap', 'start') });
  return items;
}
const inorderVals = (t) => (t ? [...inorderVals(t.l), t.val, ...inorderVals(t.r)] : []);

function buildBst(p, kit, ERR) {
  const sim = bst(p);
  const maxN = sim.ok ? Math.max(...sim.steps.map((s) => (s.tree ? layout(s.tree).count : 1))) : 5;
  const maxD = sim.ok ? Math.max(...sim.steps.map((s) => (s.tree ? layout(s.tree).depth : 0))) : 3;
  const lesson = shell('bst', kit, ERR, sim, {
    where: [['ds', 'search']],
    tag: 'BST',
    name: T('二叉排序树', 'Binary search trees'),
    full: T('查找与插入 · 删除的三种情况 · 中序有序 · 形状和效率', 'Search and insert · three deletion cases · inorder · shape and cost'),
    title: sim.ok ? T(`${sim.steps.length} 个操作`, `${sim.steps.length} operations`) : T('参数有误', 'Invalid parameters'),
    legend: [['orange', T('新插入', 'New')], ['amber', T('比较路径', 'Path')], ['green', T('顶替的后继', 'Successor')]],
    principle: BST_PRINCIPLE,
    desc: T('二叉排序树插入时一路比较到叶子，删除时分三种情况：叶子直接删、只有一棵子树就让子树顶上来、两棵子树都有就找中序后继来替代。上方随时写着中序序列，它永远是递增的。', 'Insertion walks to a leaf; deletion has three cases. The inorder sequence above always stays ascending.'),
    rect: [20, 70, 80 + Math.max(maxN, 5) * 52 + 40, 140 + (maxD + 1) * 72 + 10],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s) => {
    const path = s.path.join(' → ');
    const K = { dup: T(`${s.k} 已存在`, `${s.k} exists`), missing: T(`${s.k} 不在树中`, `${s.k} is absent`), ins: T(`插入 ${s.k}`, `Insert ${s.k}`), leaf: T(`删除 ${s.k}：叶子`, `Delete ${s.k}: leaf`), one: T(`删除 ${s.k}：一棵子树顶上来`, `Delete ${s.k}: one subtree`), two: T(`删除 ${s.k}：后继 ${s.succ} 替代`, `Delete ${s.k}: successor ${s.succ}`) }[s.kind];
    const D = {
      dup: T(`比较路径 ${path}，已经有 ${s.k}，不再插入。`, `Path ${path}; already present.`),
      missing: T(`比较路径 ${path || '（空树）'}，走到空指针也没找到 ${s.k}，删除失败。`, `Not found.`),
      ins: T(`从根开始比较：${path}。小往左、大往右，走到空位置就把 ${s.k} 作为叶子挂上去。`, `Compare down: ${path}; attach ${s.k} as a leaf.`),
      leaf: T(`找到 ${s.k}（路径 ${path}），它是叶子，直接删掉。`, `${s.k} is a leaf: remove it.`),
      one: T(`找到 ${s.k}，它只有一棵子树，让这棵子树顶替 ${s.k} 的位置，仍然满足左小右大。`, `${s.k} has one subtree, which takes its place.`),
      two: T(`找到 ${s.k}，它左右子树都有。在右子树里一直往左走，找到中序直接后继 ${s.succ}，用 ${s.succ} 替代 ${s.k}，再删去原来的 ${s.succ}（它没有左孩子）。`, `${s.k} has two subtrees; its inorder successor ${s.succ} replaces it.`),
    }[s.kind];
    return { title: K, desc: T(`中序 ${s.tree ? inorderVals(s.tree).join(' ') : '空'}`, `Inorder ${s.tree ? inorderVals(s.tree).join(' ') : 'empty'}`), detail: D, ref: s.op === 'ins' ? 'def' : 'del', row: { color: s.op === 'ins' ? 'blue' : 'rose', what: s.op === 'ins' ? `+${s.k}` : `-${s.k}`, result: KIND[s.kind], tone: 'info', info: K } };
  });
  return finish(lesson, list, (k, z) => bstBoard(sim, k, z), T('操作完成', 'Done'), T('试试「有序插入」：树退化成一条链，查找变成 O(n)。', 'Try sorted inserts: the tree degenerates into a chain.'));
}
export const makeBst = make('bst', BST_SPEC, BST_ERR, buildBst);

// ═════════════════════════ B 树 ═════════════════════════

const BT_PRINCIPLE = {
  sections: [
    {
      id: 'def',
      title: T('B 树的定义', 'B-trees'),
      blocks: [
        { p: T('**m 阶 B 树**是一棵多路平衡查找树：', 'An **order-m B-tree** is a balanced multiway search tree:') },
        {
          list: [
            T('每个结点最多 m 棵子树、m − 1 个关键字；', 'at most m children and m − 1 keys per node;'),
            T('根结点不是叶子时至少 2 棵子树；其他非叶结点至少 ⌈m/2⌉ 棵子树，即至少 ⌈m/2⌉ − 1 个关键字；', 'the root has at least 2 children; other internal nodes at least ⌈m/2⌉ (⌈m/2⌉ − 1 keys);'),
            T('结点内关键字有序，n 个关键字把结点分成 n + 1 个区间，各对应一棵子树；', 'keys are sorted and split the range into n + 1 subtrees;'),
            T('所有叶结点都在同一层（叶结点下面是查找失败的空结点）。', 'all leaves are on the same level.'),
          ],
        },
        { tip: T('高度：含 n 个关键字的 m 阶 B 树，log_m(n + 1) ≤ h ≤ log_⌈m/2⌉((n + 1) / 2) + 1。', 'Height: log_m(n + 1) ≤ h ≤ log_⌈m/2⌉((n + 1)/2) + 1.') },
      ],
    },
    {
      id: 'insert',
      title: T('插入：上溢就分裂', 'Insertion: split on overflow'),
      blocks: [
        {
          steps: [
            T('先查找，定位到最底层的某个叶结点，把关键字插进去（保持有序）；', 'find the leaf and insert in order;'),
            T('若结点关键字数超过 m − 1（**上溢**），从中间位置 ⌈m/2⌉ 分开：左边 ⌈m/2⌉ − 1 个关键字留在原结点，右边放进新结点，第 ⌈m/2⌉ 个关键字提到父结点；', 'on **overflow** split at position ⌈m/2⌉: left part stays, right part moves to a new node, the middle key goes up;'),
            T('父结点也可能因此上溢，继续分裂；根结点分裂时树长高一层。', 'the parent may overflow too; splitting the root grows the tree.'),
          ],
        },
      ],
    },
    {
      id: 'delete',
      title: T('删除：下溢就借或合并', 'Deletion: borrow or merge'),
      blocks: [
        {
          steps: [
            T('要删的关键字在非叶结点：用它的直接前驱（或后继）替代，转化为删叶结点上的关键字；', 'in an internal node: replace by its predecessor (or successor), deleting from a leaf instead;'),
            T('删除后关键字数仍 ≥ ⌈m/2⌉ − 1：结束；', 'still at least ⌈m/2⌉ − 1 keys: done;'),
            T('**兄弟够借**：相邻兄弟的关键字多于 ⌈m/2⌉ − 1，就把父结点里夹在中间的关键字拿下来，兄弟的一个关键字补到父结点（像旋转）；', '**borrow**: if a sibling has spare keys, rotate one through the parent;'),
            T('**兄弟不够借**：把这个结点、兄弟和父结点里夹在中间的关键字合并成一个结点；父结点少了一个关键字，可能继续下溢；根被合并空时树变矮一层。', '**merge** with a sibling and the separating parent key; the parent may underflow; an emptied root shrinks the tree.'),
          ],
        },
      ],
    },
    {
      id: 'bplus',
      title: T('B+ 树', 'B+ trees'),
      blocks: [
        {
          table: {
            head: ['', T('B 树', 'B-tree'), T('B+ 树', 'B+ tree')],
            rows: [
              [T('n 个关键字的结点', 'Node with n keys'), T('n + 1 棵子树', 'n + 1 children'), T('n 棵子树', 'n children')],
              [T('关键字出现在', 'Keys appear'), T('各结点各出现一次', 'once'), T('叶结点包含全部关键字，非叶结点只是索引（关键字会重复出现）', 'all in the leaves; internal nodes are an index')],
              [T('叶结点', 'Leaves'), T('彼此独立', 'separate'), T('用指针按顺序链接，支持顺序查找', 'linked in order for sequential scans')],
              [T('查找', 'Search'), T('可能在非叶结点就结束', 'may stop early'), T('一定走到叶结点', 'always reaches a leaf')],
            ],
          },
        },
        { p: T('B+ 树常用作数据库和文件系统的索引：非叶结点不放数据，一个磁盘块能放更多索引项，树更矮，读盘次数更少。', 'Databases use B+ trees: index-only internal nodes are shorter and need fewer disk reads.') },
      ],
    },
    pit([
      T('m 阶指的是最多 m 棵子树，关键字最多 m − 1 个。', 'Order m means at most m children.'),
      T('非根结点至少 ⌈m/2⌉ − 1 个关键字，不是 ⌈m/2⌉ 个。', 'Non-root nodes need ⌈m/2⌉ − 1 keys.'),
      T('插入总是先插到叶结点，树只会从根向上长高。', 'Insertion always starts at a leaf; the tree grows at the root.'),
    ]),
  ],
};
const BT_SPEC = {
  presets: [
    { label: T('3 阶：逐个插入', 'Order 3: insertions'), set: { m: 3, ops: '53 75 139 49 145 36 101' } },
    { label: T('3 阶：删除时合并', 'Order 3: delete with merges'), set: { m: 3, ops: '53 75 139 49 145 36 101 -53' } },
    { label: T('3 阶：删除时借', 'Order 3: delete with a borrow'), set: { m: 3, ops: '53 75 139 49 145 36 101 37 -53' } },
    { label: T('4 阶', 'Order 4'), set: { m: 4, ops: '10 20 30 40 50 60 70 80 90' } },
  ],
  groups: [{ legend: T('B 树', 'B-tree'), fields: [
    { name: 'm', label: T('阶数 m', 'Order m'), type: 'int', min: 3, max: 6 },
    { name: 'ops', label: T('依次执行：数字插入，-数字删除', 'Numbers insert, -numbers delete'), type: 'text', wide: true, parse: (s) => (parseOps(s) ? s : NaN) },
  ] }],
  note: T('上溢时第 ⌈m/2⌉ 个关键字上移。删除非叶结点的关键字用直接前驱替代；下溢时先向左兄弟借，不够再向右兄弟借，都不够就和兄弟合并（优先左兄弟）。', 'On overflow the ⌈m/2⌉-th key moves up. Internal deletions use the predecessor; underflow borrows from the left sibling, then the right, otherwise merges (left first).'),
};
const BT_ERR = { m: T('阶数在 3～6', 'Order 3–6'), ops: T('最多 24 个操作', 'At most 24 operations') };

const KW = 34;
function placeB(tree) {
  // 叶子从左到右排，父结点放在孩子们的正中间
  const pos = new Map();
  let x = 0;
  const wOf = (n) => Math.max(1, n.keys.length) * KW + 8;
  (function go(n, d) {
    if (!n.kids.length) {
      pos.set(n.id, { x: x + wOf(n) / 2, d, n });
      x += wOf(n) + 22;
      return;
    }
    n.kids.forEach((c) => go(c, d + 1));
    const a = pos.get(n.kids[0].id).x;
    const b = pos.get(n.kids.at(-1).id).x;
    pos.set(n.id, { x: (a + b) / 2, d, n });
  })(tree, 0);
  return { pos, width: x };
}
function btBoard(sim, k, z) {
  const s = k >= 0 ? sim.steps[k] : null;
  const tree = s ? s.tree : { id: 'n0', keys: [], kids: [] };
  const { pos, width } = placeB(tree);
  const X0 = 80 + Math.max(0, (600 - width) / 2);
  const Y0 = 150;
  const DY = 90;
  const items = [];
  let edges = '';
  for (const { x, d, n } of pos.values()) {
    const w = Math.max(1, n.keys.length) * KW + 8;
    n.kids.forEach((c, i) => {
      const cp = pos.get(c.id);
      edges += line(X0 + x - w / 2 + 4 + i * KW, Y0 + d * DY + 30, X0 + cp.x, Y0 + cp.d * DY, 'te');
    });
  }
  items.push({ k: 'edges', x: 0, y: 0, html: edges });
  const hot = new Set([s?.hot, s?.at, s?.left, s?.right, s?.par, s?.sib].filter(Boolean));
  for (const { x, d, n } of pos.values()) {
    const w = Math.max(1, n.keys.length) * KW + 8;
    const over = n.keys.length > sim.maxK;
    const under = d > 0 && n.keys.length < sim.minK;
    let h = `<rect class="bt-node ${over ? 'over' : under ? 'under' : hot.has(n.id) ? 'hot' : ''}" x="${-w / 2}" y="0" width="${w}" height="30" rx="5"/>`;
    n.keys.forEach((key, i) => {
      h += txt(-w / 2 + 4 + i * KW + KW / 2, 20, String(key), `bt-key ${s && (key === s.up || key === s.down || key === s.pred || (s.kind === 'ins' && key === s.k)) ? 'on' : ''}`);
      if (i) h += `<line class="bt-sep" x1="${-w / 2 + 4 + i * KW}" y1="5" x2="${-w / 2 + 4 + i * KW}" y2="25"/>`;
    });
    if (!n.keys.length) h += txt(0, 20, z ? '空' : '∅', 'bt-key under');
    items.push({ k: `bn-${n.id}`, x: X0 + x, y: Y0 + d * DY, html: h });
  }
  items.push({ k: 'rule', x: 80, y: 100, html: txt(0, 0, z ? `${sim.m} 阶：每个结点 ${sim.minK}～${sim.maxK} 个关键字（根至少 1 个）` : `Order ${sim.m}: ${sim.minK}–${sim.maxK} keys per node (root ≥ 1)`, 'bt-cap', 'start') + (s ? txt(0, 20, (z ? '中序：' : 'In order: ') + keysInOrder(tree).join(' '), 'bt-cap', 'start') : '') });
  return items;
}

function buildBt(p, kit, ERR) {
  const sim = btree(p);
  const maxW = sim.ok ? Math.max(...sim.steps.map((s) => placeB(s.tree).width), 300) : 600;
  const maxD = sim.ok ? Math.max(...sim.steps.map((s) => Math.max(...flatB(s.tree).map((n) => n.d)))) : 2;
  const lesson = shell('btree', kit, ERR, sim, {
    where: [['ds', 'search']],
    tag: T('B树', 'B'),
    name: T('B 树：插入与删除', 'B-trees: insertion and deletion'),
    full: T('m 阶 B 树 · 上溢分裂 · 下溢借与合并 · 高度 · B+ 树', 'Order m · split · borrow and merge · height · B+ trees'),
    title: sim.ok ? T(`${sim.m} 阶`, `Order ${sim.m}`) : T('参数有误', 'Invalid parameters'),
    legend: [['rose', T('上溢 / 下溢', 'Over / underflow')], ['orange', T('这一步动到的', 'Changed')]],
    principle: BT_PRINCIPLE,
    desc: T('B 树每个结点能放好几个关键字。插入总是先放进叶子，放不下就从中间劈开、中间的关键字往上送；删除后关键字太少，就向兄弟借一个，借不到就和兄弟合并。每一步都画出来，上溢、下溢的结点会标红。', 'Each node holds several keys. Inserts go into a leaf and overfull nodes split, pushing the middle key up; underfull nodes borrow from a sibling or merge with it. Over- and underflowing nodes turn red.'),
    rect: [40, 70, 80 + Math.max(maxW, 600) + 40, 150 + (maxD + 1) * 90 + 10],
  });
  if (!sim.ok) return lesson;
  const list = sim.steps.map((s) => {
    const map = {
      dup: [T(`${s.k} 已存在`, `${s.k} exists`), T('B 树里关键字不重复，不插入。', 'Keys are unique.')],
      missing: [T(`${s.k} 不在树中`, `${s.k} not found`), T('找遍了也没有这个关键字。', 'Not present.')],
      ins: [T(`插入 ${s.k}${s.over ? '：上溢' : ''}`, `Insert ${s.k}${s.over ? ': overflow' : ''}`), s.over ? T(`${s.k} 插进对应的叶子后有 ${sim.m} 个关键字，超过 ${sim.maxK} 个，上溢，要分裂。`, `The leaf now has ${sim.m} keys: overflow.`) : T(`查找到对应的叶子，把 ${s.k} 按顺序插进去，没有超过 ${sim.maxK} 个关键字。`, `Insert ${s.k} into its leaf; no overflow.`)],
      split: [T(`分裂：${s.up} 上移${s.newRoot ? '，长出新根' : ''}`, `Split: ${s.up} goes up${s.newRoot ? ', new root' : ''}`), T(`从第 ⌈${sim.m}/2⌉ = ${Math.ceil(sim.m / 2)} 个关键字处分开：前面的留在原结点，后面的放进新结点，${s.up} 提到父结点。${s.newRoot ? '原来是根，所以新建一个根，树长高一层。' : s.over ? '父结点又上溢了，还要继续分裂。' : ''}`, `Split at key ${Math.ceil(sim.m / 2)}; ${s.up} moves up.${s.newRoot ? ' A new root is created.' : ''}`)],
      del: [T(`删除 ${s.k}${s.under ? '：下溢' : ''}`, `Delete ${s.k}${s.under ? ': underflow' : ''}`), s.under ? T(`${s.k} 在叶子上，删掉后只剩 ${sim.minK - 1} 个关键字，少于 ${sim.minK} 个，下溢。`, `Underflow after deleting ${s.k}.`) : T(`${s.k} 在叶子上，删掉后关键字数还够，结束。`, `Deleted; enough keys remain.`)],
      pred: [T(`删除 ${s.k}：用前驱 ${s.pred} 替代`, `Delete ${s.k}: predecessor ${s.pred}`), T(`${s.k} 在非叶结点上。找它左边子树里最大的关键字（直接前驱）${s.pred} 来替代，问题就变成删除叶子上的 ${s.pred}。${s.under ? '那个叶子因此下溢了。' : ''}`, `${s.k} is internal; its predecessor ${s.pred} replaces it.`)],
      borrowL: [T(`向左兄弟借：${s.up} 上去，${s.down} 下来`, `Borrow left: ${s.up} up, ${s.down} down`), T(`左兄弟的关键字多于 ${sim.minK} 个，够借。父结点里夹在中间的关键字 ${s.down} 下移到这个结点，左兄弟最大的关键字 ${s.up} 补到父结点。`, `The left sibling has spare keys: ${s.down} comes down and ${s.up} goes up.`)],
      borrowR: [T(`向右兄弟借：${s.up} 上去，${s.down} 下来`, `Borrow right: ${s.up} up, ${s.down} down`), T(`左兄弟不够借，右兄弟够。父结点的 ${s.down} 下移，右兄弟最小的 ${s.up} 补到父结点。`, `Borrow from the right sibling.`)],
      merge: [T(`合并：父结点的 ${s.down} 下移${s.rootGone ? '，根被合并掉' : ''}`, `Merge: ${s.down} comes down${s.rootGone ? ', root removed' : ''}`), T(`兄弟也只有 ${sim.minK} 个关键字，借不到。把这个结点、兄弟和父结点里夹在中间的 ${s.down} 合并成一个结点。${s.rootGone ? '根结点被拿空了，合并后的结点成为新根，树变矮一层。' : s.under ? '父结点因此也下溢了，继续处理。' : ''}`, `No sibling can lend: merge with it and the separating key ${s.down}.${s.rootGone ? ' The root empties and the tree shrinks.' : ''}`)],
    };
    const [title, detail] = map[s.kind];
    return { title, desc: T(`中序 ${keysInOrder(s.tree).join(' ')}`, `In order ${keysInOrder(s.tree).join(' ')}`), detail, ref: s.op === 'ins' ? (s.kind === 'split' ? 'insert' : 'insert') : 'delete', row: { color: /split|merge|borrow/.test(s.kind) ? 'orange' : s.op === 'ins' ? 'blue' : 'rose', what: `${s.op === 'ins' ? '+' : '-'}${s.k}`, result: KIND[s.kind], tone: 'info', info: title } };
  });
  return finish(lesson, list, (k, z) => btBoard(sim, k, z), T('操作完成', 'Done'), T('换成 4 阶、5 阶再插一遍同样的关键字，看树是不是更矮。', 'Try a higher order with the same keys: the tree gets shorter.'));
}
export const makeBtree = make('btree', BT_SPEC, BT_ERR, buildBt);
