// 计算机网络第三批：逐层封装、交换机与 VLAN、组帧、信道复用、UDP、TCP 序号与流量控制、链路状态路由、FTP、电子邮件。
import assert from 'node:assert/strict';
import test from 'node:test';
import { lessonById } from '../js/catalog.js';
import { encap } from '../js/subjects/net/encap.js';

test('逐层封装：300B HTTP 走以太网，线路上 8+14+20+20+300+4 = 366B；路由器只到网络层', () => {
  const r = encap({ app: 'http', n: 300, link2: 'eth' });
  assert.equal(r.wire1, 366);
  assert.equal(r.pad, 0);
  assert.equal(r.steps.length, 15);
  assert.ok(r.steps.filter((s) => s.at === 'R').every((s) => s.li >= 2));
  const frame = r.steps.find((s) => s.at === 'A' && s.layer === 'link');
  assert.deepEqual(frame.pdu.map((p) => p.k), ['eth', 'ip', 'tcp', 'data', 'fcs']);
  assert.equal(frame.total, 358);
  assert.equal(r.steps.at(-1).total, 300);
});

test('逐层封装：短 UDP 数据要填充到 46B；PPP 帧开销 8B、没有前导码', () => {
  const d = encap({ app: 'dns', n: 10, link2: 'eth' });
  assert.equal(d.ipLen, 38);
  assert.equal(d.pad, 8);
  assert.equal(d.ethFrame, 64); // 最短帧
  assert.equal(d.wire1, 72);
  const p = encap({ app: 'http', n: 300, link2: 'ppp' });
  assert.equal(p.pppFrame, 340 + 8);
  assert.equal(p.wire2, 348);
  assert.equal(encap({ app: 'http', n: 1461 }).ok, false);
  assert.equal(encap({ app: 'dns', n: 1472 }).ok, true);
  assert.deepEqual(lessonById('encap').errors ?? [], []);
});

import { learnSwitch } from '../js/subjects/net/switch.js';

test('交换机：学源地址、查不到泛洪、查到转发、同一端口丢弃', () => {
  const r = learnSwitch({ frames: 'A>B, B>A, C>A, A>FF, D>C, E>D, B>E', vlan: false, age: 0 });
  const act = r.steps.map((s) => `${s.action}:${s.out.join('')}`);
  assert.deepEqual(act, ['flood:234', 'forward:1', 'forward:1', 'broadcast:234', 'forward:3', 'filter:', 'forward:4']);
  assert.deepEqual(r.steps[3].delivered, ['B', 'C', 'D', 'E']);
  assert.deepEqual(r.final.map((e) => `${e.mac}${e.port}`), ['A1', 'B2', 'C3', 'D4', 'E4']);
  assert.equal(r.steps[0].table.length, 1); // 第一个帧只学到 A
});

test('交换机：VLAN 把泛洪关在本 VLAN；老化后又泛洪', () => {
  const v = learnSwitch({ frames: 'A>B, B>A, A>FF, C>A, D>C, A>D', vlan: true, age: 0 });
  assert.deepEqual(v.steps[2].out, [2]); // 广播只到 VLAN 10 的 2 口
  assert.deepEqual(v.steps[3].out, [4]); // C 在 VLAN 20 查不到 A
  assert.equal(v.steps[3].otherVlan, true);
  assert.deepEqual(v.steps[5].delivered, []);
  const a = learnSwitch({ frames: 'A>B, B>A, C>D, D>C, C>A, B>A', vlan: false, age: 3 });
  assert.deepEqual(a.steps[3].aged, ['A']); // A 在时刻 1 记录，时刻 4 过期
  assert.equal(a.steps[4].action, 'flood');
  assert.equal(learnSwitch({ frames: 'A>A' }).ok, false);
  assert.equal(learnSwitch({ frames: 'A>Z' }).ok, false);
  assert.deepEqual(lessonById('switch').errors ?? [], []);
});

import { bitStuff, bitUnstuff, framing } from '../js/subjects/net/framing.js';

test('组帧：字节填充 7E→7D 5E、7D→7D 5D、控制字符异或 20；比特填充连续 5 个 1 插 0', () => {
  const b = framing({ mode: 'byte', data: '41 7E 42 7D 03', ctl: true });
  assert.deepEqual(b.out, [0x41, 0x7d, 0x5e, 0x42, 0x7d, 0x5d, 0x7d, 0x23]);
  assert.ok(b.same);
  assert.equal(framing({ mode: 'byte', data: '03', ctl: false }).out[0], 0x03);
  // 手算：0111111 → 011111 0 1；11111 后面本来就是 0 也要插
  assert.equal(bitStuff('0111111').out, '01111101');
  assert.equal(bitStuff('111110').out, '1111100');
  assert.equal(bitStuff('01111110').out, '011111010');
  // 随机比特串：填充后不出现 6 个 1，去填充能还原
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let t = 0; t < 2000; t++) {
    let s = '';
    const n = 1 + Math.floor(rnd() * 48);
    for (let i = 0; i < n; i++) s += rnd() < 0.75 ? '1' : '0';
    const o = bitStuff(s).out;
    assert.ok(!o.includes('111111'));
    assert.equal(bitUnstuff(o), s);
  }
  assert.equal(framing({ mode: 'bit', data: '0102' }).ok, false);
  assert.equal(framing({ mode: 'byte', data: 'G1' }).ok, false);
  assert.deepEqual(lessonById('framing').errors ?? [], []);
});

import { CODES, cdma, dot, tdm } from '../js/subjects/net/mux.js';

test('码分复用：码片两两正交；叠加后用内积还原每个站（含不发的站）', () => {
  for (const [i, a] of CODES.entries()) for (const [j, b] of CODES.entries()) assert.equal(dot(a, b), i === j ? 8 : 0);
  const r = cdma({ bits: ['101', '110', '0-1'], target: 1 });
  assert.deepEqual(r.times[0].sum, [1, 1, 1, -3, 1, 1, 1, -3]); // 手算：S1 + S2 − S3
  for (let s = 1; s <= 3; s++) assert.equal(cdma({ bits: ['101', '110', '0-1'], target: s }).got, ['101', '110', '0-1'][s - 1]);
  assert.equal(cdma({ bits: ['10', '1-', '01', '--'], target: 4 }).got, '--');
  assert.equal(cdma({ bits: ['10', '1'] }).ok, false);
});

test('时分复用：同步时分空时隙浪费，统计时分按需装、装不下排队', () => {
  const r = tdm({ users: ['ab.c', '..d.', 'e..f', '.g..'], k: 2 });
  assert.equal(r.units, 7);
  assert.equal(r.syncUse, 7 / 16);
  assert.deepEqual(r.stat.map((f) => f.slots.map((s) => s.u + s.d).join('')), ['AaCe', 'AbDg', 'Bd', 'AcCf']);
  const q = tdm({ users: ['abc.', 'de..', 'fg.h'], k: 1 });
  assert.equal(q.stat.length, 8);
  assert.equal(q.statUse, 1);
  assert.deepEqual(lessonById('mux').errors ?? [], []);
});

import { onesSum, udp } from '../js/subjects/net/udp.js';

test('UDP 校验和：逐字回卷相加，和 32 位累加后折叠的结果一致；接收方全 1', () => {
  const r = udp({});
  assert.equal(r.len, 13);
  assert.equal(r.words.length, 13); // 6 + 4 + 3（5 字节补成 6）
  const tot = r.words.reduce((a, w) => a + w.v, 0);
  let f = tot;
  while (f > 0xffff) f = (f & 0xffff) + (f >>> 16);
  assert.equal(r.sum, f);
  assert.equal(r.cks, ~f & 0xffff);
  assert.equal(r.rsum, 0xffff);
  assert.ok(r.good);
  // 手算小例子：FFFF + 0001 = 1 0000 → 回卷得 0001
  assert.equal(onesSum([{ v: 0xffff }, { v: 1 }]).at(-1).sum, 1);
  for (let b = 0; b < 40; b++) assert.equal(udp({ flip: b }).good, false); // 翻转任一个比特都能发现
  assert.equal(udp({ srcIp: '300.1.1.1' }).ok, false);
  assert.equal(udp({ data: '' }).ok, false);
  assert.deepEqual(lessonById('udp').errors ?? [], []);
});

import { tcpFlow } from '../js/subjects/net/tcpflow.js';

test('TCP 流量控制：序号 = 首字节编号，确认号 = 期望的下一个字节；窗口 0 时只发探测', () => {
  const r = tcpFlow({ seq0: 1, mss: 200, total: 1200, buf: 600, reads: [0, 200, 0, 0, 400] });
  assert.deepEqual(r.rounds[0].segs, [{ seq: 1, len: 200 }, { seq: 201, len: 200 }, { seq: 401, len: 200 }]);
  assert.deepEqual(r.rounds[0].ack, { ack: 601, rwnd: 0 });
  assert.ok(r.rounds[1].probe && r.rounds[1].segs.length === 0);
  assert.deepEqual(r.rounds[1].ack, { ack: 601, rwnd: 200 });
  assert.deepEqual(r.rounds[2].segs, [{ seq: 601, len: 200 }]);
  assert.equal(r.probes, 3);
  assert.equal(r.rounds.at(-1).ack.ack, 1201);
  // 任何时候发出的未确认数据都不超过上次通告的窗口
  for (const [i, rd] of r.rounds.entries()) {
    const win = i ? r.rounds[i - 1].ack.rwnd : 600;
    assert.ok(rd.segs.reduce((s, x) => s + x.len, 0) <= win);
  }
  const fast = tcpFlow({ seq0: 1001, mss: 300, total: 1800, buf: 900, reads: [] });
  assert.equal(fast.rounds.length, 2);
  assert.equal(fast.rounds.at(-1).ack.ack, 2801);
  assert.equal(tcpFlow({ mss: 500, buf: 400 }).ok, false);
  assert.deepEqual(lessonById('tcp-flow').errors ?? [], []);
});

import { ospf } from '../js/subjects/net/ospf.js';

test('链路状态路由：手算 R1 的最短路径和下一跳；R2—R4 断开后重算', () => {
  const r = ospf({});
  const t = Object.fromEntries(r.table.map((x) => [x.dest, `${x.next}/${x.cost}`]));
  // R3=1 直连；R2=2 直连；R4=R2+2=4；R5=min(R3+4, R4+1)=5，先确定 R3 所以走 R3；R6=R4+3=7
  assert.deepEqual(t, { R2: 'R2/2', R3: 'R3/1', R4: 'R2/4', R5: 'R3/5', R6: 'R2/7' });
  assert.equal(Object.keys(r.lsdb).length, 6);
  const f = ospf({ fail: 'R4-R2' });
  const t2 = Object.fromEntries(f.after.table.map((x) => [x.dest, `${x.next}/${x.cost}`]));
  assert.deepEqual(t2, { R2: 'R2/2', R3: 'R3/1', R4: 'R3/6', R5: 'R3/5', R6: 'R3/7' });
  assert.deepEqual(f.after.changed, ['R4', 'R6']);
  assert.equal(ospf({ fail: 'R1-R6' }).ok, false);
  assert.equal(ospf({ src: 'R9' }).ok, false);
  assert.deepEqual(lessonById('ospf').errors ?? [], []);
});

import { ftp } from '../js/subjects/net/ftp.js';

test('FTP：控制连接一直在，每个文件一条数据连接；PORT / PASV 的端口编码', () => {
  const a = ftp({ mode: 'active', files: ['a.txt', 'b.pdf'], ctlPort: 50100 });
  const port = a.steps.find((s) => s.kind === 'port');
  assert.equal(port.p, 50101);
  assert.equal(port.p1 * 256 + port.p2, 50101);
  assert.match(port.lines[0][1], /PORT 192,168,1,5,195,181/); // 195×256+181 = 50101
  const data = a.steps.filter((s) => s.kind === 'data');
  assert.equal(data.length, 2);
  assert.ok(data.every((s) => s.data.sPort === 20 && s.data.by === 'S'));
  // 数据传输时控制连接一直开着；结束后都关了
  assert.ok(data.every((s) => s.conns.find((c) => c.kind === 'ctl').open));
  assert.ok(a.steps.at(-1).conns.every((c) => !c.open));
  const p = ftp({ mode: 'passive', files: ['a.txt'], ctlPort: 50100 });
  const pv = p.steps.find((s) => s.kind === 'pasv');
  assert.equal(pv.p1 * 256 + pv.p2, pv.p);
  assert.equal(p.steps.find((s) => s.kind === 'data').data.by, 'C');
  assert.equal(ftp({ files: [] }).ok, false);
  assert.deepEqual(lessonById('ftp').errors ?? [], []);
});

import { base64, email, unbase64 } from '../js/subjects/net/email.js';

test('电子邮件：base64 和 Buffer 对照；补 =；POP3 下载后删除', () => {
  for (const s of ['Man', 'Ma', 'M', 'Hi!Bob', 'Notes', '9 chars!!']) {
    const bytes = [...s].map((c) => c.charCodeAt(0));
    assert.equal(base64(bytes).text, Buffer.from(s).toString('base64'));
    assert.deepEqual(unbase64(base64(bytes).text), bytes);
  }
  // 手算：Man = 4D 61 6E → 010011 010110 000101 101110 → 19 22 5 46 → TWFu
  assert.deepEqual(base64([0x4d, 0x61, 0x6e]).groups[0].idx, [19, 22, 5, 46]);
  const r = email({ attach: 'Notes' });
  assert.equal(r.b64.text, 'Tm90ZXM=');
  assert.ok(r.same);
  assert.ok(r.fetch.some(([, t]) => t === 'DELE 1'));
  assert.ok(!email({ recv: 'imap' }).fetch.some(([, t]) => /DELE/.test(t)));
  assert.equal(email({ attach: '' }).ok, false);
  assert.deepEqual(lessonById('email').errors ?? [], []);
});
