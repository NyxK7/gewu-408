// 旗舰课「一次访存的全过程」：kit（拓扑、设备、表格、解析）+ 由参数生成课程的工厂函数。
import { VM_ACCESS_PRINCIPLE, memRef } from '../co/co-principles.js';
import { L, T, esc } from '../../core/i18n.js';
import { decode } from './decode.js';
import { EDGES, NODES, artSvg, boardSvg, drawDevice } from './devices.js';
import { ALL, buildOutro, buildSteps, cacheOrg, scenarioName, tlbOrg } from './lesson.js';
import { bindOverview, overviewHtml, renderState } from './panel.js';
import { DEFAULTS, hex, simulate, sizeStr } from './sim.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const KEY = '408viz:mem-params';

export function loadParams() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved };
  } catch {}
  return { ...DEFAULTS };
}

function saveParams(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export const memKit = {
  topo: { nodes: NODES, edges: EDGES },
  drawDevice,
  decor: () => boardSvg(),
  wide: true,
  viewName: T('部件图', 'Components'),
  diagramName: T('存储层次部件图', 'Memory hierarchy diagram'),
  rowsName: T('访存轨迹', 'Access trace'),
  stateName: T('部件状态', 'Component state'),
  emptyRows: T('按「播放」或「单步」，每一次硬件操作都会记在这里。点任意一行看地址按位拆分。', 'Press Play or Step and every hardware operation is logged here. Click a row to see its address split bit by bit.'),
  cols: [
    { label: T('序号', 'No.'), cls: 'col-no' },
    { label: T('部件', 'Where'), cls: 'col-where' },
    { label: T('操作', 'Action'), cls: 'col-op' },
    { label: T('地址 / 内容', 'Address / content'), cls: 'col-info' },
    { label: T('结果', 'Result'), cls: 'col-res' },
  ],
  cells(ev, idx) {
    const name = (id) => L(NODES[id].name);
    const where = ev.from === ev.to ? name(ev.from) : `${name(ev.from)} → ${name(ev.to)}`;
    const r = ev.result ? `<span class="res res-${ev.result.tone}">${esc(L(ev.result.text))}</span>` : '';
    return [`<i class="dot"></i>${idx + 1}`, esc(where), esc(L(ev.what)), esc(L(ev.value)), r];
  },
  decode,
  overview: overviewHtml,
  bindOverview,
  renderState,
};

export function makeMemLesson(params, bad = {}) {
  const sim = simulate(params);
  const p = sim.p;
  const d = sim.d;
  const ok = sim.ok;
  const facts = ok
    ? [
        [T('页内偏移', 'Page offset'), both((z) => (z ? `${d.offBits} 位（页大小 ${sizeStr(p.pageSize)}）` : `${d.offBits} bits (${sizeStr(p.pageSize)} pages)`))],
        [T('虚页号', 'Page number'), both((z) => (z ? `${d.vpnBits} 位（共 2^${d.vpnBits} 页）` : `${d.vpnBits} bits (2^${d.vpnBits} pages)`))],
        [T('页框号', 'Frame number'), both((z) => (z ? `${d.pfnBits} 位（共 ${d.frames} 个页框）` : `${d.pfnBits} bits (${d.frames} frames)`))],
        [T('页表大小', 'Page table'), `2^${d.vpnBits} × ${p.pteSize} B = ${sizeStr(d.ptBytes)}`],
        [T('TLB', 'TLB'), d.tlbFull ? both((z) => (z ? `全相联：整个虚页号作标记（${d.tlbTagBits} 位）` : `fully associative: the whole VPN is the tag (${d.tlbTagBits} bits)`)) : both((z) => (z ? `${d.tlbSets} 组：组号 ${d.tlbIdxBits} 位 + 标记 ${d.tlbTagBits} 位` : `${d.tlbSets} sets: ${d.tlbIdxBits} index + ${d.tlbTagBits} tag bits`))],
        [T('Cache', 'Cache'), both((z) => (z ? `${d.lines} 行 / ${d.cacheSets} 组：标记 ${d.cTagBits} + 组号 ${d.cIdxBits} + 块内偏移 ${d.cOffBits} 位` : `${d.lines} lines / ${d.cacheSets} sets: ${d.cTagBits} tag + ${d.cIdxBits} index + ${d.cOffBits} offset bits`))],
      ]
    : [];
  const subs = ok
    ? {
        cpu: both((z) => (z ? `VA ${p.vaBits} 位 · PA ${p.paBits} 位` : `VA ${p.vaBits} b · PA ${p.paBits} b`)),
        tlb: both((z) => tlbOrg(d, p, z)),
        cache: both((z) => cacheOrg(d, p, z)),
        pt: `PTBR ${hex(d.ptbr, p.paBits)}`,
        mem: both((z) => (z ? `${sizeStr(d.memBytes)} · ${d.frames} 个页框` : `${sizeStr(d.memBytes)} · ${d.frames} frames`)),
      }
    : {};
  const lesson = {
    id: 'vm-access',
    kit: memKit,
    where: [
      ['co', 'memory'],
      ['os', 'memory'],
    ],
    tag: T('综合', 'Mix'),
    principle: VM_ACCESS_PRINCIPLE,
    name: T('一次访存的全过程', 'One memory access'),
    full: T('虚拟地址 → TLB → 页表 → Cache → 主存，缺页时从磁盘调页', 'VA → TLB → page table → cache → memory, paging in from disk on a fault'),
    title: T('计组 × 操作系统综合', 'Organization × OS'),
    badge: both((z) => scenarioName(sim, z)),
    nodes: ALL,
    legend: [
      ['blue', T('虚拟地址', 'Virtual address')],
      ['violet', T('页表项', 'Page table entry')],
      ['teal', T('物理地址', 'Physical address')],
      ['green', T('数据块', 'Block')],
      ['rose', T('缺页 / 调页', 'Page fault')],
      ['amber', T('数据', 'Data')],
    ],
    overview: {
      desc: T(
        '一条读内存的指令，从 CPU 发出虚拟地址到拿回数据，要经过 TLB、页表、Cache 和主存，页不在主存时还要从磁盘调页。下面的参数都可以改，整节课会按新参数重新生成，每个数都是算出来的。',
        'One load, from the virtual address leaving the CPU to the data coming back, passes the TLB, the page table, the cache and main memory, and the disk when the page is missing. Every parameter below can be changed; the lesson is regenerated and every number is computed.',
      ),
      facts,
    },
    start: { nodes: ALL, frame: ALL, subs, events: ok ? [{ type: 'snap', snap: sim.init }] : [] },
    steps: ok ? buildSteps(sim) : [],
    outro: ok ? buildOutro(sim) : { title: '', text: '', facts: [] },
    sim,
    params: p,
    bad,
    update(patch, bad2 = {}) {
      const next = { ...p, ...patch };
      if (!Object.keys(bad2).length) saveParams(next);
      return makeMemLesson(next, bad2);
    },
  };
  lesson.steps.forEach((s, i, all) => (s.ref ??= memRef(s, i, all)));
  return lesson;
}

export const MEM_LESSON = makeMemLesson(loadParams());

export const memArt = artSvg;
