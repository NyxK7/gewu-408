// 网络课的拓扑：节点坐标（等距画布上的「落地点」）和连线。路由由 core/route.js 在连线上 BFS 求出。
import { T } from '../../core/i18n.js';

export const IP = {
  client: '192.168.1.23',
  router: '192.168.1.1',
  dns: '1.1.1.1',
  web: '203.0.113.80',
  root: '198.41.0.4',
  tld: '192.5.6.30',
  auth: '198.51.100.53',
  bcast: '255.255.255.255',
  zero: '0.0.0.0',
};

// extent: 设备相对落地点的包围盒 [左, 上, 右, 下]，用于自动计算镜头
// label: 名称/IP 标签的位置；note: 气泡提示的位置；r: 数据包进出设备的半径
export const NODES = {
  client: {
    kind: 'laptop', x: 190, y: 505, name: T('笔记本', 'Laptop'), ip: IP.client,
    extent: [-60, -82, 66, 78], label: { dx: 0, dy: 54, anchor: 'middle' }, note: { dx: 0, dy: -96 }, r: 30,
  },
  router: {
    kind: 'router', x: 390, y: 390, name: T('家用路由器', 'Home router'), ip: IP.router,
    extent: [-160, -88, 58, 34], label: { dx: -54, dy: -44, anchor: 'end' }, note: { dx: 0, dy: -100 }, r: 26,
  },
  internet: {
    kind: 'cloud', x: 590, y: 505, name: T('互联网', 'Internet'), ip: '',
    extent: [-92, -142, 92, 76], label: { dx: 0, dy: 70, anchor: 'middle' }, note: { dx: 0, dy: -156 }, r: 60,
  },
  dns: {
    kind: 'dns', x: 585, y: 265, name: T('DNS 解析器', 'DNS resolver'), ip: IP.dns,
    extent: [-160, -100, 62, 32], label: { dx: -54, dy: -34, anchor: 'end' }, note: { dx: 0, dy: -112 }, r: 30,
  },
  web: {
    kind: 'server', x: 800, y: 360, name: T('Web 服务器', 'Web server'), ip: IP.web,
    extent: [-48, -118, 180, 32], label: { dx: 54, dy: -62, anchor: 'start' }, note: { dx: 0, dy: -130 }, r: 30,
  },
  root: {
    kind: 'mini', tone: 'root', x: 800, y: 235, name: T('根服务器', 'Root server'), ip: IP.root,
    extent: [-40, -72, 170, 28], label: { dx: 46, dy: -28, anchor: 'start' }, note: { dx: 0, dy: -84 }, r: 24,
  },
  tld: {
    kind: 'mini', tone: 'tld', x: 875, y: 410, name: T('.com 顶级域服务器', '.com TLD server'), ip: IP.tld,
    extent: [-40, -72, 200, 28], label: { dx: 46, dy: -28, anchor: 'start' }, note: { dx: 0, dy: -84 }, r: 24,
  },
  auth: {
    kind: 'mini', tone: 'auth', x: 790, y: 600, name: T('权威服务器', 'Authoritative server'), ip: IP.auth,
    extent: [-40, -72, 210, 28], label: { dx: 46, dy: -28, anchor: 'start' }, note: { dx: 0, dy: -84 }, r: 24,
  },
};

export const EDGES = [
  ['client', 'router'],
  ['router', 'internet'],
  ['internet', 'dns'],
  ['internet', 'web'],
  ['internet', 'root'],
  ['internet', 'tld'],
  ['internet', 'auth'],
];
