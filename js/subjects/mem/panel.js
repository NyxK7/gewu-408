// 访存课的两块界面：概览里的参数表单 / 预设 / 地址结构，以及底部「部件状态」标签页。
import { L, T, esc, getLang } from '../../core/i18n.js';
import { PRESETS, hex, sizeStr } from './sim.js';
import { cacheOrg, scenarioName, tlbOrg } from './lesson.js';

const both = (f) => ({ zh: f(true), en: f(false) });
const z = () => getLang() === 'zh';

const TX = {
  presets: T('预设场景', 'Presets'),
  hit: T('TLB 命中 · Cache 命中', 'TLB hit · cache hit'),
  walk: T('TLB 未命中 · 页表命中', 'TLB miss · page table hit'),
  fault: T('缺页', 'Page fault'),
  addr: T('地址与页', 'Addresses and pages'),
  vaBits: T('虚拟地址位数', 'VA bits'),
  paBits: T('物理地址位数', 'PA bits'),
  pageSize: T('页大小', 'Page size'),
  pteSize: T('页表项大小', 'PTE size'),
  va: T('要访问的虚拟地址', 'Virtual address to read'),
  vaHint: T('十六进制写 0x… 或 …H，纯数字按十进制', 'Hex as 0x… or …H; plain digits are decimal'),
  tlb: T('TLB', 'TLB'),
  entries: T('项数', 'Entries'),
  org: T('相联方式', 'Organization'),
  cache: T('Cache', 'Cache'),
  capacity: T('容量', 'Capacity'),
  block: T('块大小', 'Block size'),
  init: T('初始状态', 'Initial state'),
  inMem: T('该页在主存中', 'Page is in memory'),
  tlbHit: T('该页在 TLB 中', 'Page is in the TLB'),
  cacheHit: T('该块在 Cache 中', 'Block is in the cache'),
  fill: T('缺页处理时顺带填 TLB', 'Fault handler also fills the TLB'),
  initHint: T('开关只决定表里一开始放了什么，命中与否由模拟真正查表得出。', 'These only decide what the tables hold at the start; hits and misses come from actually searching them.'),
  more: T('更多：指定页框号、PTBR', 'More: frame number, PTBR'),
  frame: T('页框号', 'Frame number'),
  frameHint: T('该页所在（缺页时分配到）的页框', 'where the page is (or goes on a fault)'),
  ptbr: T('页表基址 PTBR', 'Page table base'),
  auto: T('自动', 'auto'),
  full: T('全相联', 'Fully associative'),
  direct: T('直接映射', 'Direct-mapped'),
  ways: T('{n} 路组相联', '{n}-way set associative'),
  split: T('地址结构', 'Address layout'),
  errors: T('参数有问题', 'Parameter problems'),
  conv: T('本课约定', 'Conventions'),
  convText: T(
    '单级页表；读页表项按访问一次主存计，不经过 Cache；Cache 用物理地址查找，只做读访问；TLB 和 Cache 满了按 LRU 替换；缺页时有空闲页框，不做页面置换。',
    'Single-level page table; reading a PTE counts as one memory access and bypasses the cache; the cache is physically addressed and only read; full TLB sets and cache sets use LRU; a free frame is always available on a fault.',
  ),
};

export const ERR = {
  vaBits: T('虚拟地址位数要在 8～48 之间', 'VA bits must be 8–48'),
  paBits: T('物理地址位数要在 8～48 之间', 'PA bits must be 8–48'),
  pageSize: T('页大小必须是 2 的幂', 'Page size must be a power of two'),
  pteSize: T('页表项大小只能是 2、4、8 字节', 'PTE size must be 2, 4 or 8 bytes'),
  tlbEntries: T('TLB 项数必须是 2 的幂', 'TLB entries must be a power of two'),
  tlbWays: T('TLB 路数必须是 2 的幂', 'TLB ways must be a power of two'),
  cacheSize: T('Cache 容量必须是 2 的幂', 'Cache size must be a power of two'),
  blockSize: T('块大小必须是 2 的幂', 'Block size must be a power of two'),
  cacheWays: T('Cache 路数必须是 2 的幂', 'Cache ways must be a power of two'),
  pageVsVa: T('页内偏移占了 {off} 位，虚拟地址里已经没有虚页号了', 'The {off}-bit page offset leaves no room for a page number in the VA'),
  pageVsPa: T('页内偏移占了 {off} 位，物理地址里已经没有页框号了', 'The {off}-bit page offset leaves no room for a frame number in the PA'),
  pteSmall: T('页表项至少要放下页框号和有效位，共 {need} 位', 'A PTE needs at least {need} bits for the frame number and valid bit'),
  ptBig: T('单级页表要 {pt}，物理内存只有 {mem}，放不下（这正是要用多级页表的原因）', 'A single-level table needs {pt} but memory is only {mem} (which is why multi-level tables exist)'),
  tlbSets: T('TLB 组数太多，组号比虚页号还长', 'Too many TLB sets for the page number'),
  blockVsCache: T('块比整个 Cache 还大', 'The block is larger than the cache'),
  cacheBig: T('Cache 和物理内存一样大或更大，标记位数为 0', 'The cache is as large as memory, leaving no tag bits'),
  cacheLines: T('Cache 行数太多（超过 65536 行）', 'Too many cache lines (over 65536)'),
  va: T('虚拟地址超出范围，最大 {max}', 'The address is out of range (max {max})'),
  ptbr: T('PTBR 必须是页表项大小（{n} B）的整数倍', 'PTBR must be a multiple of the PTE size ({n} B)'),
  ptbrFit: T('从这个 PTBR 开始，页表超出了物理内存', 'From this PTBR the page table runs past the end of memory'),
  frame: T('页框号超出范围，最大 {max}', 'Frame number out of range (max {max})'),
  frameInPt: T('这个页框被页表占用了', 'That frame holds the page table'),
  parse: T('{f} 不是合法的数', '{f} is not a valid number'),
};

const errText = ([k, v]) => {
  let s = L(ERR[k] ?? k);
  for (const [a, b] of Object.entries(v ?? {})) s = s.replaceAll(`{${a}}`, b);
  return s;
};

/** 解析用户输入的数：0x… 或 …H 是十六进制，纯数字是十进制，含 A–F 的也按十六进制 */
export function parseNum(s) {
  const t = String(s ?? '').trim().replace(/_/g, '');
  if (!t) return null;
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16);
  if (/^[0-9a-f]+h$/i.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^\d+$/.test(t)) return Number(t);
  if (/^[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  return NaN;
}

const opt = (vals, cur, label) => {
  const list = vals.includes(cur) ? vals : [...vals, cur].sort((a, b) => a - b);
  return list.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(label(v))}</option>`).join('');
};
const SIZES = (a, b) => {
  const out = [];
  for (let v = a; v <= b; v *= 2) out.push(v);
  return out;
};
const orgLabel = (v) => (v === 0 ? L(TX.full) : v === 1 ? L(TX.direct) : L(TX.ways).replace('{n}', v));

// ───────────────────────── 概览：参数表单 ─────────────────────────

export function overviewHtml(lesson) {
  const p = lesson.params;
  const sim = lesson.sim;
  const presetOn = PRESETS.find((x) => Object.entries(x.set).every(([k, v]) => p[k] === v))?.id;
  const presets = PRESETS.map((x) => `<button type="button" class="mp-btn ${presetOn === x.id ? 'is-on' : ''}" data-preset="${x.id}">${esc(L(TX[x.id]))}</button>`).join('');
  const num = (name, v, min, max) => `<input name="${name}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${v}">`;
  const sel = (name, html) => `<select name="${name}">${html}</select>`;
  const field = (label, ctl, cls = '') => `<label class="mf ${cls}"><span>${esc(L(label))}</span>${ctl}</label>`;
  const chk = (name, label, dis = false) => `<label class="mc ${dis ? 'is-dis' : ''}"><input type="checkbox" name="${name}" ${p[name] ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${esc(L(label))}</span></label>`;
  const errs = sim.ok ? [] : sim.errors;
  const bad = lesson.bad ?? {};
  return `
    <div class="mem-panel">
      <div class="mp-head">${esc(L(TX.presets))}</div>
      <div class="mp-list">${presets}</div>
      <form class="mem-form" autocomplete="off" onsubmit="return false">
        <fieldset><legend>${esc(L(TX.addr))}</legend>
          ${field(TX.vaBits, num('vaBits', p.vaBits, 8, 48))}
          ${field(TX.paBits, num('paBits', p.paBits, 8, 48))}
          ${field(TX.pageSize, sel('pageSize', opt(SIZES(64, 65536), p.pageSize, sizeStr)))}
          ${field(TX.pteSize, sel('pteSize', opt([2, 4, 8], p.pteSize, (v) => `${v} B`)))}
          ${field(TX.va, `<input name="va" type="text" spellcheck="false" class="${bad.va ? 'is-bad' : ''}" value="${esc(bad.va ?? hex(p.va, p.vaBits))}" title="${esc(L(TX.vaHint))}">`, 'wide')}
        </fieldset>
        <fieldset><legend>${esc(L(TX.tlb))}</legend>
          ${field(TX.entries, sel('tlbEntries', opt([4, 8, 16, 32, 64], p.tlbEntries, String)))}
          ${field(TX.org, sel('tlbWays', opt([0, 1, 2, 4, 8], p.tlbWays, orgLabel)))}
        </fieldset>
        <fieldset><legend>${esc(L(TX.cache))}</legend>
          ${field(TX.capacity, sel('cacheSize', opt(SIZES(256, 1 << 20), p.cacheSize, sizeStr)))}
          ${field(TX.block, sel('blockSize', opt(SIZES(4, 256), p.blockSize, (v) => `${v} B`)))}
          ${field(TX.org, sel('cacheWays', opt([1, 2, 4, 8, 16, 0], p.cacheWays, orgLabel)), 'wide')}
        </fieldset>
        <fieldset class="mf-init"><legend>${esc(L(TX.init))}</legend>
          ${chk('inMem', TX.inMem)}
          ${chk('tlbHit', TX.tlbHit, !p.inMem)}
          ${chk('cacheHit', TX.cacheHit, !p.inMem)}
          ${chk('fillTlbOnFault', TX.fill, p.inMem)}
          <p class="mf-hint">${esc(L(TX.initHint))}</p>
        </fieldset>
        <details class="mf-more" ${p.frame != null || p.ptbr != null || bad.frame || bad.ptbr ? 'open' : ''}><summary>${esc(L(TX.more))}</summary>
          <div class="mf-row">
            ${field(TX.frame, `<input name="frame" type="text" spellcheck="false" class="${bad.frame ? 'is-bad' : ''}" placeholder="${esc(L(TX.auto))}" value="${esc(bad.frame ?? (p.frame == null ? '' : hex(p.frame, sim.d?.pfnBits ?? 8)))}" title="${esc(L(TX.frameHint))}">`)}
            ${field(TX.ptbr, `<input name="ptbr" type="text" spellcheck="false" class="${bad.ptbr ? 'is-bad' : ''}" placeholder="${esc(L(TX.auto))}" value="${esc(bad.ptbr ?? (p.ptbr == null ? '' : hex(p.ptbr, p.paBits)))}">`)}
          </div>
        </details>
      </form>
      ${errs.length || Object.keys(bad).length ? `<div class="mem-errors"><b>${esc(L(TX.errors))}</b><ul>${[...Object.keys(bad).map((f) => errText(['parse', { f: L(TX[f]) }])), ...errs.map(errText)].map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${sim.ok ? splitHtml(sim) : ''}
      <p class="mem-conv"><b>${esc(L(TX.conv))}</b>${esc(L(TX.convText))}</p>
    </div>`;
}

/** 三条地址结构条：按同一比例尺右对齐，页内偏移一眼对得上 */
function splitHtml(sim) {
  const { p, d } = sim;
  const max = Math.max(p.vaBits, p.paBits);
  const zh = z();
  const seg = (tone, label, n) => (n > 0 ? `<i class="c-${tone}" style="flex:${n}"><b>${esc(label)}</b><span>${n}</span></i>` : '');
  const row = (name, total, segs) => `<div class="sp-row"><span class="sp-name">${esc(name)}</span><div class="sp-track"><div class="sp-bar" style="width:${(total / max) * 100}%">${segs}</div></div></div>`;
  return `<div class="mem-split">
    <div class="mp-head">${esc(L(TX.split))}</div>
    ${row('VA', p.vaBits, seg('blue', zh ? '虚页号' : 'VPN', d.vpnBits) + seg('slate', zh ? '页内偏移' : 'offset', d.offBits))}
    ${d.tlbFull ? '' : row(zh ? 'VA·TLB' : 'VA·TLB', p.vaBits, seg('amber', zh ? 'TLB 标记' : 'tag', d.tlbTagBits) + seg('teal', zh ? '组号' : 'set', d.tlbIdxBits) + seg('slate', zh ? '偏移' : 'offset', d.offBits))}
    ${row('PA', p.paBits, seg('violet', zh ? '页框号' : 'frame', d.pfnBits) + seg('slate', zh ? '页内偏移' : 'offset', d.offBits))}
    ${row(zh ? 'PA·Cache' : 'PA·cache', p.paBits, seg('amber', zh ? '标记' : 'tag', d.cTagBits) + seg('teal', d.direct ? (zh ? '行号' : 'line') : zh ? '组号' : 'set', d.cIdxBits) + seg('green', zh ? '块内偏移' : 'offset', d.cOffBits))}
  </div>`;
}

export function bindOverview(box, lesson, ctx) {
  const form = box.querySelector('.mem-form');
  if (!form) return;
  for (const b of box.querySelectorAll('[data-preset]')) {
    b.addEventListener('click', () => ctx.reload(lesson.update(PRESETS.find((x) => x.id === b.dataset.preset).set, {})));
  }
  const read = () => {
    const f = new FormData(form);
    const n = (k) => Number(f.get(k));
    const bad = {};
    const parsed = (k, allowEmpty) => {
      const raw = f.get(k);
      const v = parseNum(raw);
      if ((v == null && !allowEmpty) || Number.isNaN(v)) {
        bad[k] = raw;
        return lesson.params[k];
      }
      return v;
    };
    const params = {
      vaBits: n('vaBits'),
      paBits: n('paBits'),
      pageSize: n('pageSize'),
      pteSize: n('pteSize'),
      va: parsed('va', false),
      tlbEntries: n('tlbEntries'),
      tlbWays: n('tlbWays'),
      cacheSize: n('cacheSize'),
      blockSize: n('blockSize'),
      cacheWays: n('cacheWays'),
      inMem: form.inMem.checked,
      tlbHit: form.inMem.checked && form.tlbHit.checked,
      cacheHit: form.inMem.checked && form.cacheHit.checked,
      fillTlbOnFault: form.fillTlbOnFault.checked,
      frame: parsed('frame', true),
      ptbr: parsed('ptbr', true),
    };
    return { params, bad };
  };
  form.addEventListener('change', () => {
    const { params, bad } = read();
    ctx.reload(lesson.update(params, bad));
  });
  // 打字时只标红不合法的输入，回车或离开输入框才重新生成课程
  for (const k of ['va', 'frame', 'ptbr']) {
    const el = form.elements[k];
    el.addEventListener('input', () => el.classList.toggle('is-bad', Number.isNaN(parseNum(el.value)) || (k === 'va' && parseNum(el.value) == null)));
    el.addEventListener('keydown', (e) => e.key === 'Enter' && el.blur());
  }
}

// ───────────────────────── 底部「部件状态」 ─────────────────────────

const MARK = { hit: 'm-hit', new: 'm-new', read: 'm-read', ok: 'm-hit', fault: 'm-fault', miss: 'm-miss' };

export function renderState(snap, lesson) {
  const sim = lesson.sim;
  if (!sim.ok || !snap) return `<p class="empty">${esc(L(TX.errors))}</p>`;
  const { p, d } = sim;
  const zh = z();
  const H = hex;
  const m = snap.marks ?? {};
  const cls = (k) => (k ? MARK[k] ?? '' : '');
  const tr = (cells, c = '') => `<tr class="${c}">${cells.map((x) => `<td>${x}</td>`).join('')}</tr>`;
  const card = (key, title, sub, head, rows, foot = '') =>
    `<section class="ms-card ${snap.focus === key ? 'is-focus' : ''} ${m[key]?.all ? cls(m[key].all) : ''}">
      <h4>${esc(title)}<small>${esc(sub)}</small></h4>
      <div class="ms-scroll"><table class="ms-t"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${foot}
    </section>`;

  const tlbRows = snap.tlb
    .map((e) =>
      tr(
        [e.way, e.v, e.v ? H(e.tag, d.tlbTagBits) : '—', e.v ? H(e.pfn, d.pfnBits) : '—', e.age],
        `${cls(m.tlb?.[e.way])} ${e.v && e.tag === sim.tlbTag ? 'is-target' : ''} ${e.v ? '' : 'is-empty'}`,
      ),
    )
    .join('');
  const tlbTitle = d.tlbFull ? 'TLB' : zh ? `TLB · 第 ${sim.tlbIdx} 组` : `TLB · set ${sim.tlbIdx}`;

  const ptRows = snap.pt
    .map((e) =>
      tr(
        [H(e.vpn, d.vpnBits), e.v, e.v ? H(e.pfn, d.pfnBits) : `<span class="dim">${zh ? '外存' : 'swap'} ${H(e.disk, 20)}</span>`],
        `${cls(m.pt?.[e.vpn])} ${e.vpn === sim.vpn ? 'is-target' : ''} ${e.v ? '' : 'is-empty'}`,
      ),
    )
    .join('');

  const cRows = snap.cache
    .map((e) => tr([d.direct ? sim.cIdx : e.way, e.v, e.v ? H(e.tag, d.cTagBits) : '—', e.age], `${cls(m.cache?.[e.way])} ${e.v && e.tag === sim.cTag ? 'is-target' : ''} ${e.v ? '' : 'is-empty'}`))
    .join('');
  const cTitle = d.cacheFull ? 'Cache' : d.direct ? (zh ? `Cache · 第 ${sim.cIdx} 行` : `Cache · line ${sim.cIdx}`) : zh ? `Cache · 第 ${sim.cIdx} 组` : `Cache · set ${sim.cIdx}`;
  const cFoot = snap.cacheTotal > snap.cache.length ? `<p class="ms-foot">${zh ? `共 ${snap.cacheTotal} 行，只列出其中 ${snap.cache.length} 行` : `${snap.cacheTotal} lines; ${snap.cache.length} shown`}</p>` : '';

  const r = snap.regs;
  const reg = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v == null ? '<span class="dim">—</span>' : esc(v)}</dd></div>`;
  const regs = `<section class="ms-card ms-regs ${snap.focus === 'regs' ? 'is-focus' : ''}">
      <h4>${zh ? '地址与数据' : 'Addresses'}<small>${esc(scenarioName(sim, zh))}</small></h4>
      <dl>
        ${reg('VA', H(r.va, p.vaBits))}
        ${reg(zh ? '虚页号 · 偏移' : 'VPN · offset', `${H(sim.vpn, d.vpnBits)} · ${H(sim.off, d.offBits)}`)}
        ${reg('PTBR', H(d.ptbr, p.paBits))}
        ${reg('PA', r.pa == null ? null : H(r.pa, p.paBits))}
        ${reg(zh ? '数据' : 'Data', r.data == null ? null : H(r.data, 8))}
      </dl>
    </section>`;

  return `<div class="ms">
    ${regs}
    ${card('tlb', tlbTitle, tlbOrg(d, p, zh), [zh ? (d.tlbFull ? '项' : '路') : d.tlbFull ? 'Entry' : 'Way', 'V', zh ? '标记' : 'Tag', zh ? '页框号' : 'Frame', 'LRU'], tlbRows)}
    ${card('pt', zh ? '页表（片段）' : 'Page table (excerpt)', `PTBR ${H(d.ptbr, p.paBits)}`, [zh ? '虚页号' : 'VPN', 'V', zh ? '页框号' : 'Frame'], ptRows)}
    ${card('cache', cTitle, cacheOrg(d, p, zh), [zh ? (d.direct ? '行' : '路') : d.direct ? 'Line' : 'Way', 'V', zh ? '标记' : 'Tag', 'LRU'], cRows, cFoot)}
  </div>`;
}

export { both };
