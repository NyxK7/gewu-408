// 「串的模式匹配：BF 与 KMP」：先一格格算出 next（和 nextval），再一轮轮地比较。
// 画法：主串一排格子，模式串一排格子对齐在它下面，i、j 两个指针；失配后模式串整体往右滑。
// BF 的 i 会退回去，KMP 的 i 从不后退——这是这节课要让人看见的事。
import { line, txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { borderOf, match } from './string.js';

const W = [['ds', 'string']];
const CW = 34;
const X0 = 150;
const TY = 150; // 主串
const PY = 228; // 模式串
const NY = 330; // next 表

const PRINCIPLE = {
  sections: [
    {
      id: 'concept',
      title: T('串是什么', 'What a string is'),
      blocks: [
        { p: T('串是由零个或多个字符组成的有限序列。串中任意多个连续字符组成的子序列叫**子串**，包含子串的串叫**主串**；子串第一个字符在主串中的序号就是子串的**位置**。长度为 0 的串叫空串，它和由空格组成的「空格串」不是一回事。', 'A string is a finite sequence of characters. A run of consecutive characters is a **substring**; its first character’s index is its **position**. The empty string differs from a string of spaces.') },
        { p: T('串和线性表的区别：串的数据对象限定为字符，而且操作通常以「子串」为单位（查找、插入、删除一段），而不是单个元素。', 'Unlike general lists, strings hold characters and are usually processed a substring at a time.') },
      ],
    },
    {
      id: 'store',
      title: T('串的存储结构', 'Storage'),
      blocks: [
        {
          table: {
            head: [T('方式', 'Kind'), T('做法', 'How'), T('特点', 'Trait')],
            rows: [
              [T('定长顺序存储', 'Fixed array'), T('预先分配固定长度的字符数组，超出的部分截断', 'a fixed-size array; extra characters are cut off'), T('简单，长度受限', 'simple, bounded')],
              [T('堆分配存储', 'Heap'), T('按实际长度动态申请空间（malloc），仍是一段连续空间', 'allocate exactly what is needed, still contiguous'), T('长度灵活', 'flexible')],
              [T('块链存储', 'Block chain'), T('用链表，每个结点存若干个字符', 'a linked list, several characters per node'), T('结点大小影响存储密度', 'node size sets density')],
            ],
          },
        },
      ],
    },
    {
      id: 'bf',
      title: T('朴素模式匹配（BF）', 'Brute force'),
      blocks: [
        { p: T('把模式串 P 依次对准主串 T 的每一个位置，从头逐个字符比较。一旦失配，主串指针 i 退回到这一轮起点的下一个位置，模式串指针 j 回到 0，重新比较。', 'Align P with every position of T and compare from the start; on a mismatch, i backs up to the next start and j resets to 0.') },
        { formula: T('最坏比较次数约 (n − m + 1) × m，时间复杂度 O(nm)', 'worst case about (n − m + 1) × m comparisons: O(nm)') },
        { tip: T('最坏情况出现在主串和模式串前面大部分字符都相同、只在最后不同的时候，比如在 aaaaaaab 里找 aaab。', 'Worst case: long common prefixes that fail at the end, e.g. aaab in aaaaaaab.') },
      ],
    },
    {
      id: 'kmp',
      title: T('KMP 的思路：主串指针不回退', 'KMP: never move i back'),
      blocks: [
        { p: T('失配时，前面已经比较过的 j 个字符其实就是模式串自己的前 j 个字符 P[0..j−1]。如果这段字符的某个**前缀**和某个**后缀**相同，模式串就可以直接右滑，让这个前缀对准刚才那个后缀的位置，主串指针 i 不用动。', 'At a mismatch the matched j characters are P[0..j−1] itself. If a prefix of that piece equals a suffix, slide P so the prefix sits where the suffix was; i stays put.') },
        { p: T('为了滑得尽量少（不漏掉可能的匹配），取**最长**的相等前后缀，长度记作 k，失配后令 j = k 继续比较。k 只和模式串有关，所以可以提前算好，存在 next 数组里。', 'Take the **longest** equal prefix/suffix, length k, and continue with j = k. It depends only on P, so it is precomputed into next.') },
        { formula: T('时间复杂度 O(n + m)：求 next 是 O(m)，匹配时 i 只增不减是 O(n)', 'O(n + m): O(m) for next, O(n) for matching since i never decreases') },
      ],
    },
    {
      id: 'next',
      title: T('next 数组怎么求，两种写法', 'Computing next: two conventions'),
      blocks: [
        { p: T('手算时先求每个前缀的**部分匹配值** PM[j]（P[0..j] 的最长相等前后缀长度），再把它右移一位就得到 next。', 'By hand, find the partial-match value PM[j] for each prefix, then shift it right by one.') },
        {
          table: {
            head: [T('教材写法', 'Convention'), T('首项', 'First'), T('第 j 项', 'Entry j'), T('失配后', 'On a mismatch')],
            rows: [
              [T('下标从 0 开始', '0-based'), 'next[0] = −1', T('P[0..j−1] 的最长相等前后缀长度', 'longest border of P[0..j−1]'), T('j = next[j]；j = −1 时 i 和 j 都加 1', 'j = next[j]; at −1 advance both')],
              [T('下标从 1 开始', '1-based'), 'next[1] = 0', T('P[1..j−1] 的最长相等前后缀长度 + 1', 'longest border + 1'), T('j = next[j]；j = 0 时 i 和 j 都加 1', 'j = next[j]; at 0 advance both')],
            ],
          },
        },
        { warn: T('两种写法的数值整体相差 1，算出来的「模式串右滑多少」是一样的。做题时先看清题目用哪种下标、next[1] 是 0 还是 −1。', 'The two differ by exactly 1 everywhere; the sliding is identical. Check which indexing the question uses.') },
      ],
    },
    {
      id: 'nextval',
      title: T('nextval：去掉白跳的回退', 'nextval: skipping useless back-offs'),
      blocks: [
        { p: T('如果失配的字符 P[j] 和要跳过去比较的 P[next[j]] 一样，那一次比较注定还会失配。nextval 把这种情况提前合并：P[j] = P[next[j]] 时 nextval[j] = nextval[next[j]]，否则 nextval[j] = next[j]。', 'If P[j] equals P[next[j]], comparing it is pointless; nextval jumps further: nextval[j] = nextval[next[j]] when they match, else next[j].') },
        { tip: T('像 aaaab 这样前面全是同一个字符的模式串，next 是 −1 0 1 2 3，nextval 是 −1 −1 −1 −1 3，能省下很多次比较。', 'For aaaab, next is −1 0 1 2 3 and nextval −1 −1 −1 −1 3, saving many comparisons.') },
      ],
    },
    pit([
      T('KMP 中主串指针 i 永远不会后退；会后退的是 BF。', 'In KMP, i never moves back; in BF it does.'),
      T('next 只和模式串有关，和主串无关。', 'next depends only on the pattern.'),
      T('比较次数要数清楚：失配的那一次比较也算。', 'Count the failed comparison too.'),
      T('KMP 只在主串和模式串有很多部分匹配时才明显比 BF 快；一般情况下 BF 也接近 O(n + m)。', 'KMP only shines with many partial matches; BF is usually near O(n + m) too.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('KMP · 教材经典例子', 'KMP · classic example'), set: { text: 'acabaabaabcacaabc', pattern: 'abaabcac', algo: 'kmp', base: 1 } },
    { label: T('同一组用 BF 比一比', 'Same strings with BF'), set: { text: 'acabaabaabcacaabc', pattern: 'abaabcac', algo: 'bf', base: 1 } },
    { label: T('nextval 省掉白跳', 'nextval saves jumps'), set: { text: 'aaabaaaab', pattern: 'aaaab', algo: 'kmpval', base: 1 } },
    { label: T('下标从 0 开始的写法', '0-based next'), set: { text: 'ababcabcacbab', pattern: 'abcac', algo: 'kmp', base: 0 } },
  ],
  groups: [
    { legend: T('串', 'Strings'), fields: [
      { name: 'text', label: T('主串 T', 'Text T'), type: 'text', wide: true, parse: (s) => (/^\S{1,40}$/.test(s) ? s : NaN) },
      { name: 'pattern', label: T('模式串 P', 'Pattern P'), type: 'text', wide: true, parse: (s) => (/^\S{1,14}$/.test(s) ? s : NaN) },
    ] },
    { legend: T('算法', 'Algorithm'), fields: [
      { name: 'algo', label: T('匹配算法', 'Algorithm'), type: 'select', options: [['bf', T('朴素匹配 BF', 'Brute force')], ['kmp', 'KMP（next）'], ['kmpval', 'KMP（nextval）']], wide: true },
      { name: 'base', label: T('next 的写法', 'next convention'), type: 'select', options: [[1, T('下标从 1 开始（next[1] = 0）', '1-based (next[1] = 0)')], [0, T('下标从 0 开始（next[0] = −1）', '0-based (next[0] = −1)')]], wide: true },
    ] },
  ],
  note: T('比较次数按字符比较算，失配的那一次也算。两种 next 写法只是数值整体差 1，滑动方式完全一样。', 'Every character comparison counts, including the failing one. The two next conventions differ only by 1.'),
};
const ERR = { empty: T('主串和模式串都不能为空', 'Both strings are required'), long: T('主串最多 40 个字符，模式串最多 14 个', 'Text ≤ 40, pattern ≤ 14 characters'), order: T('模式串不能比主串长', 'The pattern cannot be longer than the text') };

const ix = (sim, k) => k + sim.base; // 显示用的下标
const nv = (sim, v) => (v === -1 && sim.base === 1 ? 0 : v + sim.base); // next 值按写法显示

/** 一排字符格子；tone(k) 给每一格配色 */
function row(s, x, y, tone = () => '', label = '', idx = null) {
  let h = label ? txt(-14, 22, label, 'bt-lab', 'end') : '';
  [...s].forEach((ch, k) => {
    const [tn, cls] = [].concat(tone(k));
    h += `<g transform="translate(${k * CW} 0)">${cell(CW - 4, 32, ch, { tone: tn, size: 15, cls: cls ?? '' })}${idx ? txt((CW - 4) / 2, -7, String(idx(k)), 'bt-idx') : ''}</g>`;
  });
  return { k: label || `row${y}`, x, y, html: h };
}

/** next 表：j、P[j]、next[j]（nextval[j]）；upto 之前的格子已经填好 */
function nextTable(sim, upto, cur, withVal) {
  const p = sim.pattern;
  let h = '';
  const rows = [['j', (k) => String(ix(sim, k))], ['P[j]', (k) => p[k]], ['next[j]', (k) => (k <= upto ? String(nv(sim, sim.next[k])) : '')]];
  if (withVal) rows.push(['nextval[j]', (k) => (k <= upto ? String(nv(sim, sim.nextval[k])) : '')]);
  rows.forEach(([lab, f], r) => {
    h += txt(-14, r * 30 + 20, lab, 'bt-lab', 'end');
    for (let k = 0; k < p.length; k++) {
      const v = f(k);
      const isVal = r >= 2;
      h += `<g transform="translate(${k * CW} ${r * 30})">${cell(CW - 4, 26, v, { size: 12, tone: isVal && v !== '' ? (r === 3 && sim.nextval[k] !== sim.next[k] ? 'amber' : 'violet') : r === 0 ? '' : 'slate', cls: k === cur && isVal ? 'hot' : r === 0 ? 'dim' : '' })}</g>`;
    }
  });
  return { k: 'nt', x: X0, y: NY, html: h };
}

function board(sim, st, z) {
  const items = [];
  const p = sim.pattern;
  const t = sim.text;
  const kmp = sim.algo !== 'bf';
  const withVal = sim.algo === 'kmpval';
  if (!st) {
    items.push(row(t, X0, TY, () => '', z ? '主串 T' : 'T', (k) => ix(sim, k)));
    items.push(row(p, X0, PY, () => 'blue', z ? '模式串 P' : 'P', (k) => ix(sim, k)));
    if (kmp) items.push(nextTable(sim, -1, -1, withVal));
    return items;
  }
  if (st.phase === 'next') {
    // 求 next：只看模式串，前 j 个字符里最长的相等前后缀
    const j = st.j;
    const b = j > 0 ? borderOf(p, j) : 0;
    items.push(row(p, X0, TY, (k) => (k >= j ? ['', 'dim'] : k < b ? 'green' : k >= j - b ? 'teal' : 'blue'), z ? '模式串 P' : 'P', (k) => ix(sim, k)));
    let h = '';
    if (j > 0) {
      h += line(0, -24, j * CW - 4, -24, 'kmp-span') + line(0, -28, 0, -20, 'kmp-span') + line(j * CW - 4, -28, j * CW - 4, -20, 'kmp-span');
      h += txt((j * CW - 4) / 2, -32, z ? `前 ${j} 个字符` : `first ${j}`, 'bt-idx');
      if (b) {
        h += `<rect class="kmp-box pre" x="-3" y="44" width="${b * CW + 2}" height="10" rx="3"/>` + txt((b * CW) / 2, 70, z ? `前缀 ${p.slice(0, b)}` : `prefix ${p.slice(0, b)}`, 'kmp-lab pre');
        h += `<rect class="kmp-box suf" x="${(j - b) * CW - 3}" y="44" width="${b * CW + 2}" height="10" rx="3"/>` + txt((j - b) * CW + (b * CW) / 2, 70, z ? `后缀 ${p.slice(j - b, j)}` : `suffix ${p.slice(j - b, j)}`, 'kmp-lab suf');
      }
    }
    h += arrow(j * CW + (CW - 4) / 2, 92, j * CW + (CW - 4) / 2, 40, 'acc');
    items.push({ k: 'brk', x: X0, y: TY, html: h });
    items.push(nextTable(sim, j, j, false));
    return items;
  }
  if (st.phase === 'nextval') {
    items.push(row(p, X0, TY, () => 'blue', z ? '模式串 P' : 'P', (k) => ix(sim, k)));
    items.push(nextTable(sim, p.length - 1, -1, true));
    return items;
  }
  // 匹配：一轮
  const r = sim.rounds[st.r];
  const done = new Map(r.cmps.map((c) => [c.i, c.eq]));
  const last = r.cmps.at(-1);
  items.push(row(t, X0, TY, (k) => (done.has(k) ? (done.get(k) ? 'green' : 'rose') : k < r.start ? ['', 'dim'] : ''), z ? '主串 T' : 'T', (k) => ix(sim, k)));
  const pj = new Map(r.cmps.map((c) => [c.j, c.eq]));
  items.push({ ...row(p, X0 + r.start * CW, PY, (k) => (pj.has(k) ? (pj.get(k) ? 'green' : 'rose') : k < r.j0 ? ['teal', ''] : ['blue', 'dim']), '', (k) => ix(sim, k)), k: 'pat', from: st.r > 0 ? [X0 + sim.rounds[st.r - 1].start * CW, PY] : undefined });
  // 指针
  const ip = last ? last.i : r.i0;
  const jp = last ? last.j : r.j0;
  let h = arrow(X0 + ip * CW + (CW - 4) / 2, TY - 46, X0 + ip * CW + (CW - 4) / 2, TY - 22, 'acc') + txt(X0 + ip * CW + (CW - 4) / 2, TY - 52, `i = ${ix(sim, ip)}`, 'kmp-ptr i');
  h += arrow(X0 + (r.start + jp) * CW + (CW - 4) / 2, PY + 80, X0 + (r.start + jp) * CW + (CW - 4) / 2, PY + 38, 'ok') + txt(X0 + (r.start + jp) * CW + (CW - 4) / 2, PY + 96, `j = ${ix(sim, jp)}`, 'kmp-ptr j');
  // 这一轮之前已经知道相等、直接跳过的那段（KMP 才有）
  if (r.j0 > 0) h += `<rect class="kmp-box pre" x="${X0 + r.start * CW - 3}" y="${PY + 38}" width="${r.j0 * CW + 2}" height="8" rx="3"/>` + txt(X0 + r.start * CW + (r.j0 * CW) / 2, PY + 62, z ? '不用再比' : 'known equal', 'kmp-lab pre');
  items.push({ k: 'ptr', x: 0, y: 0, html: h });
  if (kmp) items.push({ ...nextTable(sim, p.length - 1, r.end === 'shift' ? r.badJ : -1, withVal), y: NY + 50 });
  const sum = sim.rounds.slice(0, st.r + 1).reduce((a, x) => a + x.cmps.length, 0);
  items.push({ k: 'cnt', x: X0, y: (kmp ? NY + 50 + (withVal ? 4 : 3) * 30 + 34 : NY + 20), html: txt(0, 0, z ? `到目前为止比较了 ${sum} 次` : `${sum} comparisons so far`, 'bt-formula cur', 'start') });
  return items;
}

function build(p, kit, ERR) {
  const sim0 = match({ text: p.text, pattern: p.pattern, algo: p.algo });
  const sim = sim0.ok ? { ...sim0, base: +p.base } : sim0;
  const algoName = { bf: T('朴素匹配 BF', 'brute force'), kmp: 'KMP', kmpval: T('KMP（nextval）', 'KMP (nextval)') }[p.algo] ?? T('', '');
  const lesson = shell('kmp', kit, ERR, sim, {
    where: W,
    tag: 'KMP',
    name: T('串的模式匹配：BF 与 KMP', 'Pattern matching: BF and KMP'),
    full: T('串的存储 · 朴素匹配 · 最长相等前后缀 · next 与 nextval · 两种下标写法', 'String storage · brute force · borders · next and nextval · two conventions'),
    title: algoName,
    legend: [['green', T('比较相等', 'Equal')], ['rose', T('失配', 'Mismatch')], ['teal', T('相等前后缀 / 不用再比', 'Border / known equal')]],
    principle: PRINCIPLE,
    desc: T('在主串里找模式串。朴素做法一旦失配，主串指针 i 就要退回去重来；KMP 利用模式串自己的「最长相等前后缀」，让模式串直接往右滑，i 一步也不后退。这节课先一格格算出 next 数组，再一轮轮比较，看清楚两种算法的指针怎么走、各比较了多少次。', 'Find the pattern in the text. Brute force moves i back after each mismatch; KMP uses the pattern’s own longest borders to slide forward with i never moving back. First build next, then compare round by round.'),
    rect: [20, 70, X0 + Math.max(sim.ok ? sim.text.length : 17, 12) * CW + 60, NY + 50 + 4 * 30 + 60],
  });
  if (!sim.ok) return lesson;
  const P = sim.pattern;
  const list = [];
  const kmp = p.algo !== 'bf';
  if (kmp) {
    for (let j = 0; j < P.length; j++) {
      const b = j > 0 ? borderOf(P, j) : 0;
      const val = nv(sim, sim.next[j]);
      list.push({
        title: T(`next[${ix(sim, j)}] = ${val}`, `next[${ix(sim, j)}] = ${val}`),
        desc: j === 0 ? T('第一个字符', 'First character') : T(`「${P.slice(0, j)}」的最长相等前后缀长 ${b}`, `Longest border of "${P.slice(0, j)}": ${b}`),
        detail: j === 0
          ? T(`第一个字符就失配，模式串没有可以利用的部分，只能把主串指针往后移一位。按${sim.base ? '从 1 开始' : '从 0 开始'}的写法记作 ${val}。`, `A mismatch at the first character leaves nothing to reuse; the text pointer moves on. Recorded as ${val}.`)
          : T(`看 P${sim.base ? '[1..' + j + ']' : '[0..' + (j - 1) + ']'} = 「${P.slice(0, j)}」：${b ? `前缀「${P.slice(0, b)}」和后缀「${P.slice(j - b, j)}」相同，长度 ${b}，没有更长的` : '没有相等的前缀和后缀'}。所以在这里失配时，模式串右滑到让前缀对准后缀，j 变成 ${b}${sim.base ? ' + 1' : ''} = ${val}。`, `Border of "${P.slice(0, j)}" has length ${b}; on a mismatch here, j becomes ${val}.`),
        ref: 'next',
        st: { phase: 'next', j },
        row: { color: 'violet', what: `next[${ix(sim, j)}]`, result: String(val), tone: 'info' },
      });
    }
    if (p.algo === 'kmpval') {
      const changed = P.split('').map((ch, j) => (j > 0 && sim.nextval[j] !== sim.next[j] ? j : -1)).filter((j) => j >= 0);
      list.push({
        title: T('由 next 得到 nextval', 'From next to nextval'),
        desc: T(`${changed.length} 处被改小`, `${changed.length} entries shortened`),
        detail: T(`逐个检查：P[j] 和 P[next[j]] 相同时，跳过去比也必然失配，nextval[j] 直接取 nextval[next[j]]。${changed.length ? `被改的是 j = ${changed.map((j) => ix(sim, j)).join('、')}（琥珀色）。` : '这个模式串没有需要改的位置。'}`, `Where P[j] = P[next[j]], take nextval[next[j]] instead. Changed: ${changed.map((j) => ix(sim, j)).join(', ') || 'none'}.`),
        ref: 'nextval',
        st: { phase: 'nextval' },
        row: { color: 'amber', what: 'nextval', result: sim.nextval.map((v) => nv(sim, v)).join(' '), tone: 'info' },
      });
    }
  }
  const tbl = p.algo === 'kmpval' ? 'nextval' : 'next';
  sim.rounds.forEach((r, k) => {
    const n = r.cmps.length;
    const last = r.cmps.at(-1);
    let detail;
    if (r.end === 'match') detail = T(`从 i = ${ix(sim, r.i0)}、j = ${ix(sim, r.j0)} 起逐个比较，${n} 次全部相等，模式串完整匹配，位置是 ${ix(sim, r.start)}。`, `${n} comparisons, all equal: a match at ${ix(sim, r.start)}.`);
    else if (r.end === 'fail' && r.badJ == null) detail = T('主串比完了，没有找到。', 'Text exhausted: no match.');
    else {
      const head = T(`从 i = ${ix(sim, r.i0)}、j = ${ix(sim, r.j0)} 起比较 ${n} 次，在 T[${ix(sim, last.i)}] = ${sim.text[last.i]} 和 P[${ix(sim, last.j)}] = ${sim.pattern[last.j]} 处失配。`, `${n} comparisons, mismatch at T[${ix(sim, last.i)}] vs P[${ix(sim, last.j)}].`);
      let move;
      if (p.algo === 'bf') move = T(`BF：i 退回到 ${ix(sim, r.nextI)}（这一轮起点的下一个），j 回到 ${ix(sim, 0)}，模式串右移一位重来。`, `BF: i backs up to ${ix(sim, r.nextI)}, j resets.`);
      else {
        const v = p.algo === 'kmpval' ? sim.nextval[last.j] : sim.next[last.j];
        move = v === -1
          ? T(`${tbl}[${ix(sim, last.j)}] = ${nv(sim, v)}：模式串第一个字符都对不上，i 后移一位到 ${ix(sim, r.nextI)}，j 回到 ${ix(sim, 0)}。`, `${tbl} says start over: i moves to ${ix(sim, r.nextI)}.`)
          : T(`i 不动，j = ${tbl}[${ix(sim, last.j)}] = ${nv(sim, v)}：模式串右滑 ${last.j - v} 位，前 ${v} 个字符已经知道相等，不用再比。`, `i stays; j = ${nv(sim, v)}: slide ${last.j - v}, the first ${v} characters are known equal.`);
      }
      detail = T(head.zh + (r.end === 'fail' ? '剩下的主串已经比模式串短，不可能再匹配，结束。' : move.zh), head.en + ' ' + (r.end === 'fail' ? 'Not enough text left: stop.' : move.en));
    }
    list.push({
      title: r.end === 'match' ? T(`第 ${k + 1} 轮：匹配成功`, `Round ${k + 1}: match`) : r.end === 'fail' ? T(`第 ${k + 1} 轮：匹配失败`, `Round ${k + 1}: no match`) : T(`第 ${k + 1} 轮：在 j = ${ix(sim, last.j)} 失配`, `Round ${k + 1}: mismatch at j = ${ix(sim, last.j)}`),
      desc: T(`比较 ${n} 次`, `${n} comparisons`),
      detail,
      ref: p.algo === 'bf' ? 'bf' : 'kmp',
      st: { phase: 'match', r: k },
      row: { color: r.end === 'match' ? 'green' : r.end === 'fail' ? 'slate' : 'rose', what: T(`第 ${k + 1} 轮`, `R${k + 1}`), result: T(`${n} 次`, `${n}`), tone: r.end === 'match' ? 'ok' : 'info' },
    });
  });
  const other = match({ text: p.text, pattern: p.pattern, algo: p.algo === 'bf' ? 'kmp' : 'bf' });
  return finish(
    lesson,
    list,
    (st, z) => board(sim, st, z),
    sim.found >= 0 ? T(`找到了，位置 ${ix(sim, sim.found)}，共比较 ${sim.total} 次`, `Found at ${ix(sim, sim.found)} in ${sim.total} comparisons`) : T(`没有找到，共比较 ${sim.total} 次`, `Not found after ${sim.total} comparisons`),
    T(`同样的两个串换成${p.algo === 'bf' ? ' KMP' : '朴素匹配 BF'}要比较 ${other.total} 次。`, `With ${p.algo === 'bf' ? 'KMP' : 'brute force'} it takes ${other.total}.`),
  );
}

export const makeKmp = make('kmp', SPEC, ERR, build);
