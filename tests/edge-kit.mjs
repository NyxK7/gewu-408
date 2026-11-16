// 边界值测试的公共部分：给每节课的每个参数生成一串「极端但用户输得进去」的值，
// 逐个代进课程里重建一遍（连画板一起），收集崩溃、文字里的 undefined / NaN、画板坐标里的 NaN。
// 值都先过一遍表单用的 parseField，表单不收的值（会标红、不会传给课程）就不试。
import { CATALOG } from '../js/catalog.js';
import { parseField } from '../js/core/params.js';

const TEXTS = ['', '0', '1', '-1', '2', '1.5', '1e39', '-1e39', '1e-50', '99999999', 'abc', 'A', 'x y z', '#', '-', '0x', '  '];

/** 一个字段的候选原始输入（字符串，和用户在输入框里敲的一样） */
export function rawsOf(f) {
  if (f.type === 'check') return [true, false];
  if (f.type === 'select') return f.options.map(([v]) => v);
  if (f.type === 'int') {
    const lo = f.min ?? -5;
    const hi = f.max ?? 99;
    const mid = Math.round((lo + hi) / 2);
    return [...new Set([lo, lo + 1, 0, 1, 2, mid, hi - 1, hi])].map(String);
  }
  if (f.type === 'list') {
    const lo = f.min ?? 0;
    const hi = Math.min(f.max ?? 99, 9999);
    const n = f.maxLen ?? 8;
    return ['', String(lo), String(hi), '0', Array(n).fill(hi).join(' '), Array(n).fill(lo).join(' '), Array.from({ length: n }, (_, i) => lo + i).join(' '), Array.from({ length: n }, (_, i) => hi - i).join(' '), `${lo} ${hi}`, '5 5 5 5'];
  }
  return TEXTS;
}

// IEEE 754 那节课里的 NaN 是正经内容（非数），只在那里放过 NaN 这个词
const ALLOW_NAN = new Set(['ieee754']);
let allowNaN = false;
const bad = (s) => (allowNaN ? /undefined/ : /undefined|NaN/).test(s);
/** 中文和英文的文字都看；画板只看 html 和坐标 */
function problemsOf(lesson) {
  const out = [];
  const textOf = (v) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
  lesson.steps.forEach((s, k) => {
    for (const key of ['title', 'desc', 'detail']) if (bad(textOf(s[key]))) out.push(`第 ${k + 1} 步的 ${key}：${textOf(s[key]).slice(0, 80)}`);
    for (const ev of s.events ?? []) {
      for (const items of [ev.items, ev.itemsEn]) {
        for (const it of items ?? []) {
          if (!Number.isFinite(it.x ?? 0) || !Number.isFinite(it.y ?? 0)) out.push(`第 ${k + 1} 步画板 ${it.k} 的坐标不是数`);
          const h = String(it.html ?? '');
          const m = h.match(/.{0,40}(undefined|NaN).{0,40}/);
          if (m && allowNaN && !m[0].includes('undefined') && !/="NaN"/.test(m[0])) continue; // 文字里的 NaN 放过，属性值（坐标、宽度）里的 NaN 不放过
          if (m) out.push(`第 ${k + 1} 步画板 ${it.k}：…${m[0]}…`);
        }
      }
    }
  });
  const o = textOf(lesson.outro?.title) + textOf(lesson.outro?.text) + textOf(lesson.outro?.facts);
  if (bad(o)) out.push(`结尾：${o.slice(0, 100)}`);
  return out;
}

/** 跑一节课：默认参数和每个预设当底子，每个字段逐个换成候选值。返回 [{ field, raw, msg }] */
export function edgeLesson(base) {
  const spec = base.kit?.spec;
  if (!spec?.groups) return [];
  allowNaN = ALLOW_NAN.has(base.id);
  const fields = spec.groups.flatMap((g) => g.fields);
  const bases = [base.params, ...(spec.presets ?? []).map((p) => ({ ...base.params, ...p.set }))];
  const issues = [];
  const seen = new Set();
  for (const b of bases) {
    for (const f of fields) {
      for (const raw of rawsOf(f)) {
        const v = f.type === 'check' || f.type === 'select' ? raw : parseField(f, raw);
        if (typeof v === 'number' && Number.isNaN(v)) continue; // 表单不收
        const params = { ...b, [f.name]: v };
        let msgs;
        try {
          const l = base.update(params);
          msgs = l.errors?.length ? [] : problemsOf(l);
        } catch (e) {
          msgs = [`崩溃：${e.message}`];
        }
        for (const msg of msgs) {
          const key = `${f.name}|${msg.replace(/\d+/g, '#')}`;
          if (seen.has(key)) continue;
          seen.add(key);
          issues.push({ field: f.name, raw: String(raw), base: b === base.params ? '默认' : '预设', msg, params });
        }
      }
    }
  }
  return issues;
}

export const lessonsWithParams = () => CATALOG.filter((l) => l.kit?.spec?.groups);
