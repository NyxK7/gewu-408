// 「原理」页：每节课可以带一份图文讲解，和动画放在同一个舞台里切换。
// lesson.principle = { sections: [{ id, title, blocks: [block] }] }
// block 的几种写法（文字都用 T('中文', 'English')）：
//   { p }              一段话
//   { list: [..] }     要点列表
//   { steps: [..] }    编号步骤
//   { table: { head: [..], rows: [[..], ..] } }
//   { formula }        一行公式，等宽字体居中
//   { tip } / { warn } 提示框（warn 是易错点）
//   { fig: (z) => svg, caption }  静态示意图，z 为 true 时是中文
//   { cols: [blocks, blocks] }    两栏并排（窄屏变成上下）
import { L, esc } from './i18n.js';

const text = (v) => esc(L(v) ?? '');
/** 允许在文字里用 **加粗** 和 `代码` */
const rich = (v) => text(v).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

function block(b, z) {
  if (b.p) return `<p>${rich(b.p)}</p>`;
  if (b.list) return `<ul>${b.list.map((x) => `<li>${rich(x)}</li>`).join('')}</ul>`;
  if (b.steps) return `<ol>${b.steps.map((x) => `<li>${rich(x)}</li>`).join('')}</ol>`;
  if (b.table) {
    const head = `<tr>${b.table.head.map((h) => `<th>${rich(h)}</th>`).join('')}</tr>`;
    const rows = b.table.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th>${rich(c)}</th>` : `<td>${rich(c)}</td>`)).join('')}</tr>`).join('');
    return `<div class="doc-tw"><table class="doc-t"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }
  if (b.formula) return `<div class="doc-formula">${rich(b.formula)}</div>`;
  if (b.tip) return `<p class="doc-tip">${rich(b.tip)}</p>`;
  if (b.warn) return `<p class="doc-warn">${rich(b.warn)}</p>`;
  if (b.fig) return `<figure class="doc-fig">${b.fig(z)}${b.caption ? `<figcaption>${rich(b.caption)}</figcaption>` : ''}</figure>`;
  if (b.cols) return `<div class="doc-cols">${b.cols.map((c) => `<div>${c.map((x) => block(x, z)).join('')}</div>`).join('')}</div>`;
  return '';
}

export function docHtml(principle, z) {
  if (!principle) return '';
  const toc = principle.sections.map((s, i) => `<a href="#" data-sec="${s.id}"><i>${i + 1}</i>${text(s.title)}</a>`).join('');
  const secs = principle.sections
    .map((s, i) => `<section class="doc-sec" data-sec="${s.id}"><h3><i>${i + 1}</i>${text(s.title)}</h3>${s.blocks.map((b) => block(b, z)).join('')}</section>`)
    .join('');
  return `<nav class="doc-toc">${toc}</nav><article class="doc-body">${secs}</article>`;
}

/** 某一节的标题和序号，给「对应原理」链接用 */
export function sectionOf(principle, id) {
  const i = principle?.sections.findIndex((s) => s.id === id) ?? -1;
  return i < 0 ? null : { no: i + 1, title: principle.sections[i].title };
}
