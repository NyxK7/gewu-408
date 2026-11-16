// 计算机网络的试点题：子网划分与 CIDR、滑动窗口。
import { T } from '../core/i18n.js';
import { simulate as subnetSim, toBin, toIp } from '../subjects/net/subnet.js';
import { r2 } from './kit.js';

function ipCase(r) {
  const prefix = r.int(19, 29);
  const ip = [r.pick([10, 172, 192, 202, 61]), r.int(0, 255), r.int(0, 255), r.int(1, 254)].join('.');
  const params = { ip, prefix, needs: [] };
  return { params, sim: subnetSim(params) };
}
const dotBin = (v) => toBin(v).match(/.{8}/g).join('.');

export const NET_QUESTIONS = [
  {
    id: 'net-sub-01',
    subject: 'net',
    chapter: 'network',
    topic: T('子网划分与 CIDR', 'Subnetting and CIDR'),
    type: 'text',
    difficulty: 2,
    lessons: ['subnet'],
    tags: ['计算'],
    make(r) {
      const { params, sim } = ipCase(r);
      return {
        question: T(`主机地址 ${params.ip}/${params.prefix}，它所在网络的网络地址是什么？（写成点分十进制）`, `For host ${params.ip}/${params.prefix}, what is the network address? (dotted decimal)`),
        answer: { accept: [toIp(sim.net)], show: toIp(sim.net) },
        steps: [
          { text: T(`写成二进制：${dotBin(sim.ip)}。`, `In binary: ${dotBin(sim.ip)}.`), go: { lesson: 'subnet', params, step: 0 } },
          { text: T(`/${params.prefix} 表示前 ${params.prefix} 位是网络号，掩码 ${toIp(sim.mask)}。`, `/${params.prefix}: mask ${toIp(sim.mask)}.`), go: { lesson: 'subnet', params, step: 1 } },
          { text: T(`地址和掩码按位与，后 ${sim.hostBits} 位清零：${dotBin(sim.net)} = ${toIp(sim.net)}。`, `AND with the mask: ${toIp(sim.net)}.`), go: { lesson: 'subnet', params, step: 2 } },
        ],
      };
    },
  },
  {
    id: 'net-sub-02',
    subject: 'net',
    chapter: 'network',
    topic: T('子网划分与 CIDR', 'Subnetting and CIDR'),
    type: 'text',
    difficulty: 2,
    lessons: ['subnet'],
    tags: ['计算'],
    make(r) {
      const { params, sim } = ipCase(r);
      return {
        question: T(`主机地址 ${params.ip}/${params.prefix}，它所在网络的广播地址是什么？`, `For host ${params.ip}/${params.prefix}, what is the broadcast address?`),
        answer: { accept: [toIp(sim.bcast)], show: toIp(sim.bcast) },
        steps: [
          { text: T(`网络号是前 ${params.prefix} 位，网络地址 ${toIp(sim.net)}。`, `Network ${toIp(sim.net)}.`), go: { lesson: 'subnet', params, step: 2 } },
          { text: T(`网络号不变，后面 ${sim.hostBits} 个主机位全部置 1：${dotBin(sim.bcast)} = ${toIp(sim.bcast)}。`, `Set the ${sim.hostBits} host bits to 1: ${toIp(sim.bcast)}.`), go: { lesson: 'subnet', params, step: 3 } },
        ],
      };
    },
  },
  {
    id: 'net-sub-03',
    subject: 'net',
    chapter: 'network',
    topic: T('子网划分与 CIDR', 'Subnetting and CIDR'),
    type: 'number',
    difficulty: 1,
    lessons: ['subnet'],
    tags: ['计算'],
    conv: T('主机号全 0 和全 1 的地址不能分配给主机。', 'All-zero and all-one host parts cannot be assigned.'),
    make(r) {
      const { params, sim } = ipCase(r);
      return {
        question: T(`一个网络的前缀是 /${params.prefix}，最多能给多少台主机分配地址？`, `A /${params.prefix} network can address at most how many hosts?`),
        answer: { value: sim.hosts },
        steps: [
          { text: T(`主机号有 32 − ${params.prefix} = ${sim.hostBits} 位，一共 2^${sim.hostBits} 个地址。`, `${sim.hostBits} host bits: 2^${sim.hostBits} addresses.`), go: { lesson: 'subnet', params, step: 4 } },
          { text: T(`去掉网络地址和广播地址：2^${sim.hostBits} − 2 = ${sim.hosts}。`, `Minus network and broadcast: ${sim.hosts}.`) },
        ],
      };
    },
  },
  {
    id: 'net-sw-01',
    subject: 'net',
    chapter: 'link',
    topic: T('滑动窗口：GBN 与 SR', 'Sliding windows'),
    type: 'number',
    difficulty: 2,
    lessons: ['sliding-window'],
    tags: ['计算'],
    make(r) {
      const n = r.int(3, 6);
      const proto = r.pick(['GBN', 'SR']);
      const ans = proto === 'GBN' ? 2 ** n - 1 : 2 ** (n - 1);
      return {
        question: T(`帧序号用 ${n} 位编号，采用 ${proto === 'GBN' ? '后退 N 帧协议 GBN' : '选择重传协议 SR'}（${proto === 'SR' ? '发送窗口和接收窗口一样大' : '接收窗口为 1'}）。发送窗口最大是多少？`, `${n}-bit sequence numbers with ${proto}${proto === 'SR' ? ' (equal windows)' : ''}. What is the largest send window?`),
        answer: { value: ans },
        steps: proto === 'GBN'
          ? [
              { text: T(`${n} 位序号共 2^${n} = ${2 ** n} 个。GBN 的发送窗口必须 ≤ 2^${n} − 1，否则接收方分不清新帧和重传的旧帧。`, `GBN needs W ≤ 2^${n} − 1 = ${ans}.`), go: { lesson: 'sliding-window', doc: 'gbn' } },
              { text: T(`最大 ${ans}。`, `Max ${ans}.`), go: { lesson: 'sliding-window', doc: 'window' } },
            ]
          : [
              { text: T(`SR 要求发送窗口 + 接收窗口 ≤ 2^${n} = ${2 ** n}；两个窗口一样大时，每个最多 2^${n - 1} = ${ans}。`, `SR needs Ws + Wr ≤ 2^${n}; equal windows give ${ans}.`), go: { lesson: 'sliding-window', doc: 'sr' } },
            ],
      };
    },
  },
  {
    id: 'net-sw-02',
    subject: 'net',
    chapter: 'link',
    topic: T('滑动窗口：GBN 与 SR', 'Sliding windows'),
    type: 'judge',
    difficulty: 1,
    lessons: ['sliding-window'],
    tags: ['概念'],
    question: T('GBN 协议中，接收方收到一个序号不是期望值的帧（比如前面的帧丢了），会把它丢弃，并重复确认最后一个按序收到的帧。', 'In GBN, a receiver that gets an out-of-order frame discards it and re-acknowledges the last in-order frame.'),
    answer: true,
    steps: [
      { text: T('GBN 的接收窗口只有 1，只收期望的那一帧；乱序到达的帧直接丢弃，回复对已按序收到的最后一帧的确认。', 'The GBN receive window is 1: out-of-order frames are dropped and the last in-order frame is acknowledged again.'), go: { lesson: 'sliding-window', params: { proto: 'GBN', bits: 3, W: 4, N: 6, D: 2, T: 6, lostF: [2], lostA: [] }, step: 5 } },
    ],
  },
  {
    id: 'net-sw-03',
    subject: 'net',
    chapter: 'link',
    topic: T('信道利用率', 'Channel utilization'),
    type: 'number',
    difficulty: 3,
    lessons: ['sliding-window'],
    tags: ['计算'],
    conv: T('忽略确认帧的发送时间和处理时间；利用率 = 一个周期里发送数据的时间 ÷ 周期长度，最大为 100%。答案写百分数里的数字，保留两位小数。', 'Ignore ACK transmission and processing; utilization = sending time ÷ cycle, capped at 100%. Give the percentage, two decimals.'),
    make(r) {
      const L = r.pick([1000, 1500, 2000, 4000]); // 字节
      const R = r.pick([1, 2, 10, 100]); // Mb/s
      const rtt = r.pick([10, 20, 40, 60]); // ms
      const W = r.pick([1, 4, 7, 15]);
      const tf = (L * 8) / (R * 1000); // ms
      const u = Math.min(1, (W * tf) / (tf + rtt));
      return {
        question: T(`链路带宽 ${R} Mb/s，往返时延 RTT = ${rtt} ms，数据帧长 ${L} B。发送窗口为 ${W} 帧时，信道利用率最大是多少（%）？`, `Link ${R} Mb/s, RTT ${rtt} ms, frames of ${L} bytes, send window ${W}. Maximum utilization in %?`),
        answer: { value: r2(u * 100), tol: 0.06, show: `${r2(u * 100)}` },
        steps: [
          { text: T(`发一帧要 ${L} × 8 ÷ ${R} Mb/s = ${r2(tf)} ms。`, `One frame takes ${r2(tf)} ms.`), go: { lesson: 'sliding-window', doc: 'util' } },
          { text: T(`从开始发第一帧到收到它的确认，一个周期是 ${r2(tf)} + ${rtt} = ${r2(tf + rtt)} ms，这期间最多能发 ${W} 帧，用时 ${r2(W * tf)} ms。`, `A cycle lasts ${r2(tf + rtt)} ms, in which ${W} frames take ${r2(W * tf)} ms.`) },
          { text: W * tf >= tf + rtt ? T(`${r2(W * tf)} ≥ ${r2(tf + rtt)}，窗口足够大，确认赶在窗口发完之前回来，利用率 100%。`, 'The window covers the cycle: 100%.') : T(`利用率 = ${r2(W * tf)} ÷ ${r2(tf + rtt)} ≈ ${r2(u * 100)}%。`, `Utilization ≈ ${r2(u * 100)}%.`) },
        ],
      };
    },
  },
];
