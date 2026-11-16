// 计组各章课程共用的小工具：建课、收尾、输入解析。
import { T } from '../../core/i18n.js';
import { parametric } from '../../core/params.js';
import { errOf, stepKit, toSteps } from '../../core/steps.js';

export const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });
export const intIn = (lo, hi) => (s) => (/^-?\d+$/.test(s) && +s >= lo && +s <= hi ? +s : NaN);
export const numIn = (s) => (/^\d+(\.\d+)?$/.test(String(s).trim()) ? +s : NaN);
export const hexIn = (s) => (/^(0x)?[0-9a-fA-F]+$/.test(String(s).trim()) ? s : NaN);

export function make(id, spec, ERR, build) {
  const kit = stepKit({ spec, rowsName: T('过程', 'Steps') });
  return () => parametric(id, spec.presets[0].set, (p) => build(p, kit, ERR));
}
export function shell(id, kit, ERR, sim, o) {
  return {
    id,
    kit,
    where: o.where,
    tag: o.tag,
    name: o.name,
    full: o.full,
    title: sim.ok ? o.title : T('参数有误', 'Invalid parameters'),
    nodes: [],
    legend: o.legend ?? [],
    principle: o.principle,
    sim,
    errors: sim.ok ? [] : errOf(ERR, sim.errors),
    overview: { desc: o.desc, facts: o.facts ?? [] },
    start: { nodes: [], frame: { rect: o.rect ?? [0, 40, 900, 520] }, events: [] },
    steps: [],
    outro: { title: '', text: '', facts: [] },
  };
}
/** list 的每一项带 st；board(st, z) 画出那一步（开始前 st = null） */
export function finish(lesson, list, board, title, text, facts = []) {
  const b = toSteps(list, (k, z) => board(k < 0 ? null : list[k].st, z));
  lesson.steps = b.steps;
  lesson.start.events = b.start;
  lesson.outro = { title, text, facts };
  return lesson;
}
export const pow2 = (x) => Number.isInteger(x) && x > 0 && (x & (x - 1)) === 0;
export const log2 = (x) => Math.round(Math.log2(x));
export const hex = (v, w = 0) => '0x' + v.toString(16).toUpperCase().padStart(w, '0');
