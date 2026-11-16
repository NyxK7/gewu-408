// 红黑树插入的纯计算：按二叉排序树插入一个红结点，再自下而上修正。每一次「变色」「旋转」都记成一步。
//
// 约定（界面上写明）：
//   · 新结点总是红色；叶子（NIL）是黑色，图上不画；
//   · 修正时只看三个情况：叔叔红 → 父、叔变黑，祖父变红，问题上移到祖父；
//     叔叔黑且新结点在内侧 → 先绕父结点旋转一次，变成外侧；叔叔黑且在外侧 → 父变黑、祖父变红，绕祖父旋转一次；
//   · 最后根结点涂黑。重复的关键字不插入。

const err = (e) => ({ ok: false, errors: [e] });

/** 拷贝成不带父指针的纯结构，给画图用 */
const snap = (n) => (n ? { id: n.id, val: n.val, red: n.red, l: snap(n.l), r: snap(n.r) } : null);

export function rbInsert(keys) {
  if (!Array.isArray(keys) || !keys.length || keys.length > 15 || keys.some((k) => !Number.isFinite(k))) return err('keys');
  let root = null;
  const steps = [];
  const rotate = (x, dir) => {
    // dir = 'l'：左旋（x 的右孩子上来）；'r'：右旋
    const o = dir === 'l' ? 'r' : 'l';
    const y = x[o];
    x[o] = y[dir];
    if (y[dir]) y[dir].p = x;
    y.p = x.p;
    if (!x.p) root = y;
    else if (x === x.p.l) x.p.l = y;
    else x.p.r = y;
    y[dir] = x;
    x.p = y;
  };
  for (const key of keys) {
    // 1. 按二叉排序树找位置
    let p = root;
    let parent = null;
    let dup = false;
    while (p) {
      if (key === p.val) {
        dup = true;
        break;
      }
      parent = p;
      p = key < p.val ? p.l : p.r;
    }
    if (dup) {
      steps.push({ key, kind: 'dup', tree: snap(root) });
      continue;
    }
    let z = { id: `k${key}`, val: key, red: true, l: null, r: null, p: parent };
    if (!parent) root = z;
    else if (key < parent.val) parent.l = z;
    else parent.r = z;
    const fine = !parent ? 'root' : !parent.red ? 'blackParent' : null;
    steps.push({ key, kind: 'insert', z: key, parent: parent?.val ?? null, fine, tree: snap(root) });
    // 2. 自下而上修正
    while (z.p && z.p.red) {
      const pa = z.p;
      const g = pa.p; // 父结点是红的，一定不是根，所以有祖父
      const side = pa === g.l ? 'l' : 'r';
      const u = side === 'l' ? g.r : g.l;
      if (u && u.red) {
        pa.red = false;
        u.red = false;
        g.red = true;
        steps.push({ key, kind: 'recolor', z: z.val, p: pa.val, u: u.val, g: g.val, tree: snap(root) });
        z = g;
        continue;
      }
      const inner = side === 'l' ? z === pa.r : z === pa.l;
      if (inner) {
        rotate(pa, side); // 父在左、z 在右：绕父左旋；镜像同理
        // 画图按旋转之后的位置标：原来的父结点成了新的 z，原来的 z 成了父结点
        steps.push({ key, kind: 'inner', z: pa.val, p: z.val, zOld: z.val, pOld: pa.val, g: g.val, u: u?.val ?? null, dir: side, tree: snap(root) });
        z = pa;
      }
      const p2 = z.p;
      p2.red = false;
      g.red = true;
      rotate(g, side === 'l' ? 'r' : 'l');
      steps.push({ key, kind: 'outer', z: z.val, p: p2.val, g: g.val, u: u?.val ?? null, dir: side === 'l' ? 'r' : 'l', tree: snap(root) });
    }
    if (root.red) {
      root.red = false;
      steps.push({ key, kind: 'root', z: root.val, tree: snap(root) });
    }
  }
  return { ok: true, keys, steps, tree: snap(root) };
}

/** 检查红黑性质，返回黑高（不含 NIL）；不满足时抛错。测试和课程小结里用 */
export function blackHeight(n) {
  if (!n) return 0;
  if (n.red && ((n.l && n.l.red) || (n.r && n.r.red))) throw new Error(`红结点 ${n.val} 有红孩子`);
  const a = blackHeight(n.l);
  const b = blackHeight(n.r);
  if (a !== b) throw new Error(`结点 ${n.val} 左右黑高不同`);
  return a + (n.red ? 0 : 1);
}
