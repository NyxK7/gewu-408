// 计算机网络里最早做好的 6 节课（HTTP、DNS、TCP、DHCP、HTTPS、ICMP）。这里把它们包装成引擎认识的 kit：
// 拓扑、设备造型、表格列、解析弹窗的内容（逐字节编码 + 十六进制）。
import { L, T, esc, t } from '../../core/i18n.js';
import { drawDevice } from './devices.js';
import { LESSONS } from './lessons.js';
import { NET_PRINCIPLES } from './net-principles.js';
import { EDGES, NODES } from './topology.js';
import { CAPTURE_AT, buildFrame } from './wire.js';

const LAYERS = {
  1: T('物理层', 'Physical'),
  2: T('数据链路层', 'Data link'),
  3: T('网络层', 'Network'),
  4: T('传输层', 'Transport'),
  5: T('会话层', 'Session'),
  6: T('表示层', 'Presentation'),
  7: T('应用层', 'Application'),
};

const LOCK = '<svg class="lock" viewBox="0 0 12 14" width="10" height="12" aria-hidden="true"><path d="M3 6.5V4.5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="1.5" y="6.5" width="9" height="6.5" rx="1.3" fill="currentColor"/></svg>';

export const netKit = {
  topo: { nodes: NODES, edges: EDGES },
  drawDevice,
  viewName: T('网络图', 'Network'),
  diagramName: T('网络拓扑图', 'Network diagram'),
  rowsName: T('数据包', 'Packets'),
  emptyRows: T('按「播放」或「单步」，数据包会出现在这里。点任意一行查看逐字节解析。', 'Press Play or Step and packets will appear here. Click a row to decode it byte by byte.'),
  cols: [
    { label: T('序号', 'No.'), cls: 'col-no' },
    { label: T('时间', 'Time'), cls: 'col-time' },
    { label: T('源地址', 'Source'), cls: 'col-ip' },
    { label: T('目的地址', 'Destination'), cls: 'col-ip' },
    { label: T('协议', 'Protocol') },
    { label: T('摘要', 'Info'), cls: 'col-info' },
    { label: T('长度', 'Length'), cls: 'col-len' },
  ],
  cells(p, idx) {
    const f = buildFrame(p);
    return [
      `<i class="dot"></i>${idx + 1}`,
      esc(p.time),
      esc(p.wire.ip.src),
      esc(p.wire.ip.dst),
      `<span class="proto">${esc(p.proto)}</span>`,
      `${p.locked ? LOCK : ''}${esc(L(p.info))}`,
      String(f.bytes.length),
    ];
  },
  decode(p) {
    const f = buildFrame(p);
    return {
      label: T('数据包解析', 'Packet decoder'),
      tag: { color: p.color, text: p.proto },
      title: L(p.info),
      meta: [
        [T('时间', 'Time'), p.time],
        [T('源地址', 'Source'), p.wire.ip.src],
        [T('目的地址', 'Destination'), p.wire.ip.dst],
        [T('长度', 'Length'), t('bytes', { n: f.bytes.length })],
        [T('抓包位置', 'Captured at'), L(CAPTURE_AT[f.capturedAt])],
      ],
      hint: T('把鼠标移到左侧字段上，右侧会高亮对应的字节。', 'Hover a field to highlight its bytes.'),
      unit: 'byte',
      layers: f.layers,
      view: { kind: 'hex', bytes: f.bytes },
    };
  },
};

// 考纲位置：DHCP 和 ICMP 在考纲里归「网络层 · IPv4」，HTTPS（TLS）属于拓展内容，放在应用层
const CHAPTER = { http: 'app', dns: 'app', https: 'app', tcp: 'transport', dhcp: 'network', icmp: 'network' };

export const NET_LESSONS = LESSONS.map((l) => ({
  ...l,
  kit: netKit,
  where: [['net', CHAPTER[l.id]]],
  principle: NET_PRINCIPLES[l.id],
  tag: `L${l.layer}`,
  badge: T(`第 ${l.layer} 层 · ${LAYERS[l.layer].zh}`, `Layer ${l.layer} · ${LAYERS[l.layer].en}`),
  extra: l.id === 'https',
}));
