// 参数可调的课程：通用的参数表单、预设、保存，以及「改参数 → 重新生成整节课」的工厂。
// 访存课有自己的定制表单（subjects/mem/panel.js），其余课程都用这里的通用版本。
//
// spec = {
//   presets: [{ label, set }],
//   groups: [{ legend, fields: [field] }],
//   note: 本课约定（T 对象）
// }
// field = { name, label, type: 'int' | 'select' | 'list' | 'text' | 'check', multiline（text 用多行输入框）, min, max, maxLen,
//           options: [[value, label]], wide, hint, parse(raw) → 值或 NaN, format(v) → 字符串, show(p) → 是否显示 }
import { L, T, esc } from './i18n.js';

const KEY = (id) => `408viz:p:${id}`;

export function loadParams(id, defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY(id)));
    if (saved && typeof saved === 'object') return { ...defaults, ...saved };
  } catch {}
  return { ...defaults };
}

function saveParams(id, p) {
  try {
    localStorage.setItem(KEY(id), JSON.stringify(p));
  } catch {}
}

/**
 * 参数化课程的工厂。build(params) 返回一节课（可以带 errors: [T 对象]，有错误时 steps 为空）。
 * 返回的课程上挂着 params / bad / update(patch, bad)，表单改动后用 update 生成新课。
 */
export function parametric(id, defaults, build) {
  const make = (params, bad = {}) => {
    const lesson = build(params);
    lesson.params = params;
    lesson.bad = bad;
    // 只是临时看一组参数（题目解析里「看动画」用），不保存
    lesson.preview = (patch) => make({ ...params, ...patch });
    lesson.update = (patch, bad2 = {}) => {
      const next = { ...params, ...patch };
      if (!Object.keys(bad2).length) saveParams(id, next);
      return make(next, bad2);
    };
    return lesson;
  };
  return make(loadParams(id, defaults));
}

const TX = {
  presets: T('预设', 'Presets'),
  errors: T('参数有问题', 'Parameter problems'),
  bad: T('「{f}」不是合法的输入', '"{f}" is not valid input'),
  conv: T('本课约定', 'Conventions'),
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const visible = (f, p) => !f.show || f.show(p);

function fmt(f, v) {
  if (f.format) return f.format(v);
  if (f.type === 'list') return (v ?? []).join(', ');
  return v == null ? '' : String(v);
}

/** 解析一个字段的原始输入；不合法返回 NaN */
export function parseField(f, raw) {
  const t = String(raw ?? '').trim();
  if (f.parse) return f.parse(t);
  if (f.type === 'int') {
    if (!/^-?\d+$/.test(t)) return NaN;
    const v = Number(t);
    return (f.min != null && v < f.min) || (f.max != null && v > f.max) ? NaN : v;
  }
  if (f.type === 'list') {
    if (!t) return f.allowEmpty ? [] : NaN;
    const parts = t.split(/[\s,，、;；]+/).filter(Boolean);
    if (f.maxLen && parts.length > f.maxLen) return NaN;
    const out = [];
    for (const x of parts) {
      if (!/^-?\d+$/.test(x)) return NaN;
      const v = Number(x);
      if ((f.min != null && v < f.min) || (f.max != null && v > f.max)) return NaN;
      out.push(v);
    }
    return out;
  }
  return t;
}

export function formHtml(spec, lesson) {
  const p = lesson.params;
  const bad = lesson.bad ?? {};
  const presets = spec.presets?.length
    ? `<div class="mp-head">${esc(L(TX.presets))}</div><div class="mp-list">${spec.presets
        .map((x, i) => `<button type="button" class="mp-btn ${Object.entries(x.set).every(([k, v]) => same(p[k], v)) ? 'is-on' : ''}" data-preset="${i}">${esc(L(x.label))}</button>`)
        .join('')}</div>`
    : '';
  const field = (f) => {
    if (!visible(f, p)) return '';
    const id = `f-${f.name}`;
    const title = f.hint ? ` title="${esc(L(f.hint))}"` : '';
    if (f.type === 'check') return `<label class="mc ${f.wide ? 'wide' : ''}"${title}><input type="checkbox" name="${f.name}" ${p[f.name] ? 'checked' : ''}><span>${esc(L(f.label))}</span></label>`;
    let ctl;
    if (f.type === 'select') {
      ctl = `<select name="${f.name}" id="${id}">${f.options.map(([v, lab]) => `<option value="${esc(v)}" ${same(v, p[f.name]) ? 'selected' : ''}>${esc(L(lab))}</option>`).join('')}</select>`;
    } else {
      const raw = bad[f.name] ?? fmt(f, p[f.name]);
      const type = f.type === 'int' ? 'number' : 'text';
      const lim = f.type === 'int' ? ` min="${f.min ?? ''}" max="${f.max ?? ''}" step="1" inputmode="numeric"` : ' spellcheck="false"';
      ctl = f.multiline
        ? `<textarea name="${f.name}" id="${id}" rows="${f.rows ?? 5}" spellcheck="false" class="${bad[f.name] != null ? 'is-bad' : ''}">${esc(raw)}</textarea>`
        : `<input name="${f.name}" id="${id}" type="${type}"${lim} class="${bad[f.name] != null ? 'is-bad' : ''}" value="${esc(raw)}">`;
    }
    return `<label class="mf ${f.wide ? 'wide' : ''}" for="${id}"${title}><span>${esc(L(f.label))}</span>${ctl}</label>`;
  };
  const groups = spec.groups
    .map((g) => {
      const inner = g.fields.map(field).join('');
      return inner ? `<fieldset class="${g.single ? 'mf-init' : ''}"><legend>${esc(L(g.legend))}</legend>${inner}${g.hint ? `<p class="mf-hint">${esc(L(g.hint))}</p>` : ''}</fieldset>` : '';
    })
    .join('');
  const labelOf = (name) => L(spec.groups.flatMap((g) => g.fields).find((f) => f.name === name)?.label ?? name);
  const errs = [...Object.keys(bad).map((n) => L(TX.bad).replace('{f}', labelOf(n))), ...(lesson.errors ?? []).map(L)];
  return `<div class="mem-panel">
    ${presets}
    <form class="mem-form gen-form" autocomplete="off" onsubmit="return false">${groups}</form>
    ${errs.length ? `<div class="mem-errors"><b>${esc(L(TX.errors))}</b><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    ${typeof lesson.extraHtml === 'function' ? lesson.extraHtml() : lesson.extraHtml ?? ''}
    ${spec.note ? `<p class="mem-conv"><b>${esc(L(TX.conv))}</b>${esc(L(spec.note))}</p>` : ''}
  </div>`;
}

export function bindForm(box, spec, lesson, ctx) {
  const form = box.querySelector('.gen-form');
  if (!form) return;
  const fields = spec.groups.flatMap((g) => g.fields);
  for (const b of box.querySelectorAll('[data-preset]')) {
    b.addEventListener('click', () => ctx.reload(lesson.update(structuredClone(spec.presets[+b.dataset.preset].set), {})));
  }
  form.addEventListener('change', () => {
    const next = {};
    const bad = {};
    for (const f of fields) {
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'check') next[f.name] = el.checked;
      else if (f.type === 'select') {
        const opt = f.options.find(([v]) => String(v) === el.value);
        next[f.name] = opt ? opt[0] : lesson.params[f.name];
      } else {
        const v = parseField(f, el.value);
        if (typeof v === 'number' && Number.isNaN(v)) bad[f.name] = el.value;
        else next[f.name] = v;
      }
    }
    ctx.reload(lesson.update(next, bad));
  });
  for (const f of fields) {
    const el = form.elements[f.name];
    if (!el || f.type === 'select' || f.type === 'check') continue;
    el.addEventListener('input', () => {
      const v = parseField(f, el.value);
      el.classList.toggle('is-bad', typeof v === 'number' && Number.isNaN(v));
    });
    el.addEventListener('keydown', (e) => e.key === 'Enter' && el.blur());
  }
}

/** 部件状态里常用的卡片和表格 */
export const card = (title, sub, inner, cls = '') =>
  `<section class="ms-card ${cls}"><h4>${esc(L(title))}<small>${esc(L(sub ?? ''))}</small></h4>${inner}</section>`;

export const table = (head, rows) =>
  `<div class="ms-scroll"><table class="ms-t"><thead><tr>${head.map((h) => `<th>${esc(L(h))}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr class="${r.cls ?? ''}">${(r.cells ?? r).map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
