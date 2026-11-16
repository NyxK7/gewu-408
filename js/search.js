// 搜索：按课程名、考点、原理页的小节和正文、动画步骤查找，回车直接跳过去（原理小节会打开原理页并滚到那一节）。
// 中英文的文字一起检索，结果按当前语言显示。快捷键 Ctrl / ⌘ + K 或 /。
import { L, T, esc, t } from './core/i18n.js';
import { rng, seedOf } from './quiz/kit.js';

const seedRng = (id) => rng(seedOf(id));

const KIND = {
  lesson: T('课程', 'Lesson'),
  doc: T('原理', 'Principle'),
  step: T('步骤', 'Step'),
  quiz: T('题目', 'Question'),
};
const TXT = {
  hint: T('试试：页表、银行家、DMA、拥塞', 'Try: page table, banker, DMA, congestion'),
  none: T('没有找到「{q}」。换个关键词，或者只输入其中两三个字。', 'Nothing matches "{q}". Try a shorter or different keyword.'),
};

const isT = (v) => v && typeof v === 'object' && typeof v.zh === 'string' && typeof v.en === 'string';

/** 把原理页的块（段落、列表、表格……）拍平成纯文本，中英文都要 */
function flatten(v, out = []) {
  if (v == null || typeof v === 'function') return out;
  if (typeof v === 'string') out.push(v);
  else if (isT(v)) out.push(v.zh, v.en);
  else if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (typeof v === 'object') Object.values(v).forEach((x) => flatten(x, out));
  return out;
}
const clean = (s) => s.replace(/\*\*|`/g, '');

function buildIndex(catalog, subjects, questions = []) {
  const items = [];
  for (const d of questions) {
    // 生成题用默认那组数的题干；搜索主要靠考点名和标签
    const q = d.make ? { ...d, ...d.make(seedRng(d.id)) } : d;
    items.push({ kind: 'quiz', qid: d.id, id: d.lessons[0], title: q.topic, ctx: q.question, hay: clean(flatten([q.topic, q.question, q.tags, q.options]).join(' ')) });
  }
  for (const l of catalog) {
    const where = l.where.flatMap(([s, c]) => {
      const subj = subjects.find((x) => x.id === s);
      const chap = subj?.chapters.find((x) => x.id === c);
      return [subj?.name, chap?.name].filter(Boolean);
    });
    items.push({ kind: 'lesson', id: l.id, title: l.name, sub: l.full, hay: clean(flatten([l.name, l.full, l.tag, where]).join(' ')) });
    for (const [i, sec] of (l.principle?.sections ?? []).entries()) {
      items.push({ kind: 'doc', id: l.id, sec: sec.id, no: i + 1, title: sec.title, ctx: l.name, body: clean(flatten(sec.blocks).join(' ')), hay: clean(flatten([sec.title, sec.blocks]).join(' ')) });
    }
    for (const [i, s] of (l.steps ?? []).entries()) {
      items.push({ kind: 'step', id: l.id, step: i, title: s.title, ctx: l.name, hay: clean(flatten([s.title, s.desc]).join(' ')) });
    }
  }
  for (const x of items) x.low = x.hay.toLowerCase();
  return items;
}

const W = { lesson: 30, doc: 12, quiz: 6, step: 0 };

function search(index, q) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const out = [];
  for (const x of index) {
    if (!tokens.every((k) => x.low.includes(k))) continue;
    const title = `${x.title.zh} ${x.title.en}`.toLowerCase();
    let score = W[x.kind];
    if (title.includes(q.toLowerCase())) score += 100;
    score += tokens.filter((k) => title.includes(k)).length * 40;
    out.push({ x, score });
  }
  out.sort((a, b) => b.score - a.score);
  // 同一节课的步骤最多列 3 条，免得一节课刷屏
  const per = new Map();
  return out
    .filter(({ x }) => {
      if (x.kind !== 'step') return true;
      const n = (per.get(x.id) ?? 0) + 1;
      per.set(x.id, n);
      return n <= 3;
    })
    .slice(0, 40)
    .map((r) => r.x);
}

function mark(text, tokens) {
  let html = esc(text);
  for (const k of tokens) {
    const re = new RegExp(esc(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    html = html.replace(re, (m) => `<mark>${m}</mark>`);
  }
  return html;
}

/** 原理正文里第一处命中附近的一小段 */
function snippet(body, tokens, zh) {
  const parts = body.split(/\s{2,}|(?<=[。；！？.;!?])\s*/).filter(Boolean);
  const want = parts.filter((p) => /[一-鿿]/.test(p) === zh);
  const hit = (want.length ? want : parts).find((p) => tokens.some((k) => p.toLowerCase().includes(k)));
  if (!hit) return '';
  const i = Math.max(0, hit.toLowerCase().indexOf(tokens.find((k) => hit.toLowerCase().includes(k))) - 18);
  const s = hit.slice(i, i + 70);
  return (i > 0 ? '…' : '') + s + (i + 70 < hit.length ? '…' : '');
}

export function setupSearch({ catalog, subjects, questions = [], open, getLang }) {
  const dlg = document.querySelector('.finder');
  const input = dlg.querySelector('input');
  const list = dlg.querySelector('.finder-list');
  let index = null;
  let results = [];
  let cur = 0;

  const render = () => {
    const q = input.value.trim();
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const zh = getLang() === 'zh';
    if (!q) {
      results = [];
      list.innerHTML = `<p class="finder-empty">${esc(L(TXT.hint))}</p>`;
      return;
    }
    results = search(index, q);
    cur = 0;
    if (!results.length) {
      list.innerHTML = `<p class="finder-empty">${esc(L(TXT.none).replace('{q}', q))}</p>`;
      return;
    }
    list.innerHTML = results
      .map((x, i) => {
        const sub = x.kind === 'lesson' ? L(x.sub) : x.kind === 'doc' ? snippet(x.body, tokens, zh) : '';
        const ctx = x.kind === 'lesson' ? '' : `<span class="fr-ctx">${esc(L(x.ctx).replace(/`/g, '').slice(0, x.kind === 'quiz' ? 26 : 200))}${x.kind === 'quiz' && L(x.ctx).length > 26 ? '…' : ''}</span>`;
        return `<li><button type="button" class="fr ${i === cur ? 'is-cur' : ''}" data-i="${i}">
          <span class="fr-kind k-${x.kind}">${esc(L(KIND[x.kind]))}</span>
          <span class="fr-main"><b>${x.kind === 'doc' ? `${x.no}. ` : ''}${mark(L(x.title), tokens)}</b>${sub ? `<small>${mark(sub, tokens)}</small>` : ''}</span>
          ${ctx}
        </button></li>`;
      })
      .join('');
  };
  const move = (d) => {
    if (!results.length) return;
    cur = (cur + d + results.length) % results.length;
    const items = list.querySelectorAll('.fr');
    items.forEach((b, i) => b.classList.toggle('is-cur', i === cur));
    items[cur].scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => {
    const x = results[i];
    if (!x) return;
    dlg.close();
    open(x);
  };

  const show = () => {
    if (dlg.open) return;
    index = buildIndex(catalog, subjects, questions); // 步骤会随参数变化，每次打开都重建（很快）
    input.placeholder = t('searchPh');
    input.value = '';
    render();
    dlg.showModal();
    input.focus();
  };

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(cur);
    }
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.fr');
    if (b) choose(Number(b.dataset.i));
  });
  list.addEventListener('pointermove', (e) => {
    const b = e.target.closest('.fr');
    if (!b || Number(b.dataset.i) === cur) return;
    cur = Number(b.dataset.i);
    list.querySelectorAll('.fr').forEach((x, i) => x.classList.toggle('is-cur', i === cur));
  });
  // 点对话框外面的遮罩关闭
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  for (const b of document.querySelectorAll('[data-act="search"]')) b.addEventListener('click', show);
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      show();
    } else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      show();
    }
  });
  return { show };
}
