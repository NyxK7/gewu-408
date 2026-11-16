// 网络第三批题：给之前还没有题的课补题（ARP、NAT、编码与调制、HTTP、DNS、TCP 连接管理、DHCP、HTTPS、ICMP）。
// 有参数的课答案由课程的 update 算出；没有参数的流程课出概念题，解析跳到对应的步骤或原理小节。
import { lessonById } from '../catalog.js';
import { T } from '../core/i18n.js';
import { shuffled } from './kit.js';

const L = (id, params) => lessonById(id).update(params);
const last = (l) => l.steps.length - 1;
const base = (id) => ({ ...lessonById(id).params });
const seq = (a) => ({
  accept: [a.join(''), a.join(','), a.join('，'), a.join(' ')],
  show: a.join(' '),
});

export const NET_QUESTIONS3 = [
  // ───── 网络层 ─────
  {
    id: 'net-arp-01',
    subject: 'net',
    chapter: 'network',
    topic: T('ARP 解析谁的地址', 'Whose address ARP resolves'),
    type: 'single',
    difficulty: 2,
    lessons: ['arp'],
    tags: ['易错点'],
    make(r) {
      const prefix = r.pick([24, 25, 26, 27, 28]);
      const block = 2 ** (32 - prefix);
      const c = r.int(1, 254);
      const start = prefix === 24 ? 0 : r.int(1, 256 / block - 2) * block;
      const ip = (x) => `192.168.${c}.${x}`;
      const gw = ip(start + 1);
      const me = ip(start + r.int(2, block - 3));
      const local = r.next() < 0.5;
      let dst;
      do {
        if (local) dst = ip(start + r.int(2, block - 2));
        else if (prefix > 24 && r.next() < 0.6)
          dst = ip((start + block + r.int(1, block - 2)) % 256 || 5); // 同一个 /24，但不在本子网
        else dst = `${r.int(11, 220)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`;
      } while (dst === me || dst === gw);
      const hosts = [`R ${gw} 00-1B-22-33-44-FE`];
      if (local) hosts.push(`B ${dst} 00-1B-22-33-44-02`);
      const params = {
        ...base('arp'),
        myIp: me,
        prefix,
        gateway: gw,
        hosts: hosts.join('\n'),
        sends: dst,
      };
      const l = L('arp', params);
      const st = l.sim.steps[0];
      const { options, answer } = shuffled(r, st.target, [st.local ? gw : dst, me, '255.255.255.255']);
      return {
        question: T(`主机 A 的 IP 地址是 ${me}/${prefix}，默认网关是 ${gw}，ARP 缓存是空的。A 要给 ${dst} 发一个 IP 数据报，它发出的 ARP 请求查询的是哪个 IP 地址对应的 MAC 地址？`, `Host A is ${me}/${prefix}, gateway ${gw}, empty ARP cache. Sending to ${dst}, which IP does A’s ARP request ask about?`),
        options,
        answer,
        steps: [
          {
            text: T(`子网掩码 ${l.sim.mask}，A 所在网络是 ${l.sim.net}。${dst} 和掩码按位与${st.local ? '结果相同，在本网络里' : '结果不同，不在本网络'}。`, `Mask ${l.sim.mask}; ${dst} is ${st.local ? '' : 'not '}on A’s network ${l.sim.net}.`),
            go: { lesson: 'arp', doc: 'how' },
          },
          {
            text: T(st.local ? `在本网络就直接解析目的主机 ${dst} 的 MAC。` : `不在本网络，数据报要先交给默认网关，所以解析的是网关 ${gw} 的 MAC；IP 首部里的目的地址仍然是 ${dst}。`, st.local ? 'Local: resolve the destination itself.' : `Remote: resolve the gateway ${gw}; the IP destination stays ${dst}.`),
            go: { lesson: 'arp', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'net-nat-01',
    subject: 'net',
    chapter: 'network',
    topic: T('NAPT 的转换表', 'The NAPT table'),
    type: 'single',
    difficulty: 2,
    lessons: ['nat'],
    tags: ['过程推演'],
    conv: T('路由器只有一个公网地址；每个新的（内网 IP, 端口）分配一个新的外部端口，从给定值开始依次加 1；同一个（内网 IP, 端口）沿用原来的外部端口。', 'One public address; each new (IP, port) gets the next external port; repeats reuse it.'),
    make(r) {
      for (;;) {
        const pub = `${r.int(60, 220)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`;
        const baseP = r.int(20, 60) * 100 + 1;
        const inner = r
          .shuffle([2, 3, 4, 5, 6, 7, 8, 9])
          .slice(0, 3)
          .map((h) => [`192.168.0.${h}`, r.int(1025, 60000)]);
        const servers = ['202.10.1.1:80', '61.135.9.7:443', '118.24.3.2:21'];
        const out = Array.from({ length: 4 }, (_, i) => (i < 3 ? inner[i] : r.pick(inner)));
        const sv = out.map(() => r.pick(servers));
        const events = out.map(([h, p], i) => `out ${h}:${p} → ${sv[i]}`);
        const drop = r.next() < 0.25;
        const k = r.int(0, 2);
        const dport = drop ? baseP + r.int(5, 40) : baseP + k;
        events.push(`in ${drop ? r.pick(servers) : sv[out.findIndex((o) => o === inner[k])]} → :${dport}`);
        const params = { pub, base: baseP, events: events.join('\n') };
        const l = L('nat', params);
        if (!l.sim?.ok) continue;
        const st = l.sim.steps.at(-1);
        const rows = st.table.map((x) => `${x.ip}:${x.port}`);
        const dropT = T('查不到对应表项，丢弃', 'no entry: dropped');
        const right = st.dropped ? dropT : `${st.after.dip}:${st.after.dport}`;
        const wrongs = st.dropped ? rows : [...rows.filter((x) => x !== right), dropT];
        const { options, answer } = shuffled(r, right, r.shuffle(wrongs).slice(0, 3));
        return {
          question: T(`NAPT 路由器的公网地址是 ${pub}，外部端口从 ${baseP} 开始分配。依次经过下面的分组：\n${events.join('\n')}\n最后这个从外网进来的分组，路由器把它的目的地址和端口改成了什么？`, `NAPT router ${pub}, ports from ${baseP}:\n${events.join('\n')}\nWhat does the last incoming packet’s destination become?`),
          options,
          answer,
          steps: [
            {
              text: T(`出去的分组建立转换表：${st.table.map((x) => `${x.ip}:${x.port} ↔ ${pub}:${x.ext}`).join('，')}（第 4 个分组和前面的某一个是同一个内网端口，沿用原来的外部端口）。`, st.table.map((x) => `${x.ip}:${x.port} ↔ ${x.ext}`).join(', ')),
              go: { lesson: 'nat', doc: 'napt' },
            },
            {
              text: T(st.dropped ? `进来的分组目的端口 ${dport} 不在表里，路由器不知道该交给谁，丢弃。` : `进来的分组目的端口 ${dport}，查表改回 ${right}。`, st.dropped ? 'No entry: dropped.' : `Back to ${right}.`),
              go: { lesson: 'nat', params, step: last(l) },
            },
          ],
        };
      }
    },
  },
  // ───── 物理层 ─────
  {
    id: 'net-enc-01',
    subject: 'net',
    chapter: 'phy',
    topic: T('曼彻斯特与差分曼彻斯特编码', 'Manchester and differential Manchester'),
    type: 'text',
    difficulty: 2,
    lessons: ['encoding'],
    tags: ['计算'],
    make(r) {
      const bits = Array.from({ length: 6 }, () => r.int(0, 1)).join('');
      const kind = r.pick(['man', 'diff']);
      const manchester = r.pick(['up0', 'up1']);
      const init = r.int(0, 1);
      const params = { bits, init, manchester };
      const l = L('encoding', params);
      const w = l.sim.codes[kind];
      const lv = (x) => (x ? '高' : '低');
      const lvE = (x) => (x ? 'H' : 'L');
      const wave = Array.from({ length: 6 }, (_, i) => lv(w[2 * i]) + lv(w[2 * i + 1])).join(' ');
      const waveE = Array.from({ length: 6 }, (_, i) => lvE(w[2 * i]) + lvE(w[2 * i + 1])).join(' ');
      const rule = kind === 'man' ? (manchester === 'up0' ? T('曼彻斯特编码，码元中间由低跳到高表示 0、由高跳到低表示 1', 'Manchester: low→high = 0, high→low = 1') : T('曼彻斯特编码，码元中间由低跳到高表示 1、由高跳到低表示 0', 'Manchester: low→high = 1, high→low = 0')) : T(`差分曼彻斯特编码，码元开始处有跳变表示 0、没有跳变表示 1；第一个码元之前的电平是${lv(init)}`, `Differential Manchester: a transition at the start = 0, none = 1; level before is ${lvE(init)}`);
      return {
        question: T(`一段信号采用${rule.zh}。每个码元分前后两半，电平依次是：${wave}。传送的比特串是什么？`, `${rule.en}. Half-bit levels: ${waveE}. What bits were sent?`),
        answer: seq([...bits]),
        steps: [
          {
            text: T(kind === 'man' ? '曼彻斯特编码只看每个码元中间的跳变方向。' : '差分曼彻斯特编码中间的跳变只用来同步，看的是码元开始处（和前一个码元的后半段比）有没有跳变。', kind === 'man' ? 'Look at the mid-bit direction.' : 'Look for a transition at the start of each bit.'),
            go: { lesson: 'encoding', doc: 'codes' },
          },
          {
            text: T(`逐个码元读出 ${bits}。`, `Bits: ${bits}.`),
            go: { lesson: 'encoding', params, step: last(l) },
          },
        ],
      };
    },
  },
  {
    id: 'net-dhcp-01',
    subject: 'net',
    chapter: 'network',
    topic: T('DHCP 的报文', 'DHCP messages'),
    type: 'single',
    difficulty: 1,
    lessons: ['dhcp'],
    tags: ['概念'],
    question: T('刚接入网络、还没有 IP 地址的主机发出 DHCP Discover 报文。这个 IP 数据报的源地址和目的地址分别是？', 'A host without an address sends DHCP Discover. What are the IP source and destination?'),
    options: [T('客户端上次用过的地址 → DHCP 服务器的地址', 'its old address → the server'), T('0.0.0.0 → DHCP 服务器的地址', '0.0.0.0 → the server'), T('0.0.0.0 → 255.255.255.255', '0.0.0.0 → 255.255.255.255'), T('255.255.255.255 → 0.0.0.0', '255.255.255.255 → 0.0.0.0')],
    answer: 2,
    steps: [
      {
        text: T('主机还没有地址，源地址只能填 0.0.0.0；它也不知道 DHCP 服务器在哪，只能广播，目的地址是 255.255.255.255。', 'No address yet, so 0.0.0.0; the server is unknown, so broadcast.'),
        go: { lesson: 'dhcp', step: 0 },
      },
      {
        text: T('DHCP 报文用 UDP 封装，客户端端口 68，服务器端口 67。', 'DHCP rides on UDP, ports 68 and 67.'),
        go: { lesson: 'dhcp', doc: 'four' },
      },
    ],
  },
  {
    id: 'net-icmp-01',
    subject: 'net',
    chapter: 'network',
    topic: T('ICMP 的应用', 'Uses of ICMP'),
    type: 'single',
    difficulty: 1,
    lessons: ['icmp'],
    tags: ['概念'],
    question: T('traceroute（Windows 下叫 tracert）是怎样得到沿途每个路由器的地址的？', 'How does traceroute learn the address of each router on the path?'),
    options: [T('发一个 ICMP 回送请求，沿途的路由器把自己的地址写进应答', 'One echo request; routers append their addresses'), T('依次发 TTL 为 1、2、3…的分组，每个让 TTL 减到 0 的路由器回一个「时间超过」报文', 'TTL 1, 2, 3, …; each router where TTL hits 0 returns Time Exceeded'), T('向每一跳广播 ARP 请求，询问它的地址', 'ARP requests to every hop'), T('路由器收到分组后回一个 ICMP 重定向报文，里面带着下一跳的地址', 'Routers return redirects naming the next hop')],
    answer: 1,
    steps: [
      {
        text: T('路由器转发时把 TTL 减 1，减到 0 就丢弃分组，并向源主机发一个 ICMP「时间超过」报文，报文的源地址就是这个路由器。', 'TTL 0 → Time Exceeded from that router.'),
        go: { lesson: 'icmp', step: 2 },
      },
      {
        text: T('traceroute 让 TTL 从 1 开始逐次加 1，就一跳一跳地把路径摸出来；到达终点时收到的是端口不可达或回送应答。', 'Increase TTL one by one to map each hop.'),
        go: { lesson: 'icmp', doc: 'apps' },
      },
    ],
  },
  // ───── 传输层 ─────
  {
    id: 'net-tcp-03',
    subject: 'net',
    chapter: 'transport',
    topic: T('TCP 三次握手', 'TCP three-way handshake'),
    type: 'number',
    difficulty: 1,
    lessons: ['tcp'],
    tags: ['计算'],
    make(r) {
      const x = r.int(100, 9000);
      const y = r.int(100, 9000);
      const which = r.pick(['ack2', 'seq3', 'ack3']);
      const ans = { ack2: x + 1, seq3: x + 1, ack3: y + 1 }[which];
      const ask = {
        ack2: T('第二次握手报文段的确认号 ack', 'the ack number of the second segment'),
        seq3: T('第三次握手报文段的序号 seq', 'the seq number of the third segment'),
        ack3: T('第三次握手报文段的确认号 ack', 'the ack number of the third segment'),
      }[which];
      return {
        question: T(`客户端发起 TCP 连接，选的初始序号是 ${x}；服务器选的初始序号是 ${y}。${ask.zh} 是多少？`, `Client ISN ${x}, server ISN ${y}. What is ${ask.en}?`),
        answer: { value: ans },
        steps: [
          {
            text: T(`第一次：SYN=1，seq=${x}。第二次：SYN=1、ACK=1，seq=${y}，ack=${x + 1}（SYN 要消耗一个序号）。第三次：ACK=1，seq=${x + 1}，ack=${y + 1}。`, `SYN seq ${x}; SYN-ACK seq ${y} ack ${x + 1}; ACK seq ${x + 1} ack ${y + 1}.`),
            go: { lesson: 'tcp', doc: 'open' },
          },
          {
            text: T(`所以答案是 ${ans}。`, `Answer: ${ans}.`),
            go: { lesson: 'tcp', step: 0 },
          },
        ],
      };
    },
  },
  {
    id: 'net-tcp-04',
    subject: 'net',
    chapter: 'transport',
    topic: T('TCP 四次挥手', 'TCP connection release'),
    type: 'single',
    difficulty: 1,
    lessons: ['tcp'],
    tags: ['易错点'],
    question: T('TCP 释放连接时，主动关闭的一方收到对方的 FIN 并发出最后一个 ACK 之后，进入什么状态？', 'After the active closer sends the last ACK, which state does it enter?'),
    options: [T('CLOSE_WAIT', 'CLOSE_WAIT'), T('LAST_ACK', 'LAST_ACK'), T('FIN_WAIT_2', 'FIN_WAIT_2'), T('TIME_WAIT，等 2MSL 后才关闭', 'TIME_WAIT for 2MSL')],
    answer: 3,
    steps: [
      {
        text: T('CLOSE_WAIT 和 LAST_ACK 是被动关闭一方的状态；FIN_WAIT_2 是主动方收到第一个 ACK 后、等对方 FIN 时的状态。', 'CLOSE_WAIT and LAST_ACK belong to the passive side; FIN_WAIT_2 comes earlier.'),
        go: { lesson: 'tcp', doc: 'close' },
      },
      {
        text: T('发出最后一个 ACK 后进入 TIME_WAIT，等 2MSL：万一这个 ACK 丢了，还能重发；也让本连接的旧报文段在网络里消失。', 'TIME_WAIT for 2MSL: resend a lost ACK and let old segments die.'),
        go: { lesson: 'tcp', step: 4 },
      },
    ],
  },
  // ───── 应用层 ─────
  {
    id: 'net-http-01',
    subject: 'net',
    chapter: 'app',
    topic: T('HTTP 的连接方式', 'HTTP connections'),
    type: 'number',
    difficulty: 2,
    lessons: ['http'],
    tags: ['计算'],
    conv: T('忽略 DNS 查询和传输时间；建立 TCP 连接要 1 个 RTT（第三次握手和请求一起发）；每次请求—响应 1 个 RTT。', 'Ignore DNS and transmission time; TCP setup 1 RTT (request rides with the third segment); each request/response 1 RTT.'),
    make(r) {
      const k = r.int(2, 12);
      const mode = r.pick(['non', 'keep', 'pipe']);
      const ans = { non: 2 * (k + 1), keep: 2 + k, pipe: 3 }[mode];
      const name = {
        non: T('非持续连接（串行，一个对象一个 TCP 连接）', 'non-persistent, serial'),
        keep: T('持续连接、非流水线（收到一个响应才发下一个请求）', 'persistent without pipelining'),
        pipe: T('持续连接、流水线（引用的对象一次全发出请求）', 'persistent with pipelining'),
      }[mode];
      const how = {
        non: T(`每个对象都要 1 个 RTT 建连接 + 1 个 RTT 请求响应：(1 + ${k}) × 2 = ${ans}。`, `(1 + ${k}) × 2 = ${ans}.`),
        keep: T(`建一次连接 1 个 RTT，取 HTML 1 个，再逐个取 ${k} 个对象 ${k} 个：1 + 1 + ${k} = ${ans}。`, `1 + 1 + ${k} = ${ans}.`),
        pipe: T(`建连接 1 个、取 HTML 1 个，${k} 个对象的请求连着发出去，再用 1 个：共 3 个。`, '1 + 1 + 1 = 3.'),
      }[mode];
      return {
        question: T(`一个网页的 HTML 文件引用了 ${k} 个小图片，都在同一台服务器上。浏览器采用${name.zh}，从开始建立连接到收完全部对象至少要多少个 RTT？`, `A page references ${k} images on the same server. With ${name.en}, how many RTTs at least?`),
        answer: { value: ans },
        steps: [
          { text: how, go: { lesson: 'http', doc: 'conn' } },
          {
            text: T('HTTP/1.1 默认使用持续连接，可以省掉反复建连接的开销。', 'HTTP/1.1 keeps connections open by default.'),
            go: { lesson: 'http', step: 3 },
          },
        ],
      };
    },
  },
  {
    id: 'net-dns-01',
    subject: 'net',
    chapter: 'app',
    topic: T('DNS 的查询过程', 'How DNS resolves a name'),
    type: 'number',
    difficulty: 2,
    lessons: ['dns'],
    tags: ['计算'],
    conv: T('主机向本地域名服务器发递归查询；只数查询报文，不数回答报文。', 'The host queries its local server recursively; count query messages only.'),
    make(r) {
      const cases = [
        {
          key: 'iter',
          ans: 4,
          zh: '本地域名服务器没有任何缓存，向根、顶级域、权威域名服务器做迭代查询',
          en: 'no cache; the local server iterates through root, TLD and authoritative',
          why: T('主机 → 本地 1 次；本地 → 根、→ 顶级域、→ 权威各 1 次：共 4 次。', '1 + 3 = 4.'),
        },
        {
          key: 'rec',
          ans: 4,
          zh: '本地域名服务器没有任何缓存，并且各级服务器之间都用递归查询',
          en: 'no cache; every server queries recursively',
          why: T('主机 → 本地 → 根 → 顶级域 → 权威，一路传下去，还是 4 次；只是回答沿原路返回。', 'Still 4 queries; answers return along the chain.'),
        },
        {
          key: 'tld',
          ans: 3,
          zh: '本地域名服务器缓存了该顶级域名服务器的地址，用迭代查询',
          en: 'the local server has the TLD server cached and iterates',
          why: T('不用再问根：主机 → 本地 1 次，本地 → 顶级域、→ 权威各 1 次：共 3 次。', 'Skip the root: 1 + 2 = 3.'),
        },
        {
          key: 'hit',
          ans: 1,
          zh: '本地域名服务器的缓存里已经有这个域名的记录',
          en: 'the local server has the answer cached',
          why: T('本地直接回答：只有主机 → 本地这 1 次。', 'Answered locally: 1 query.'),
        },
      ];
      const c = r.pick(cases);
      const name = r.pick(['www.abc.com', 'mail.xyz.edu.cn', 'ftp.qwe.org', 'news.site.net']);
      return {
        question: T(`主机要解析 ${name}。${c.zh}。整个过程一共发出几个 DNS 查询报文？`, `Resolving ${name}: ${c.en}. How many DNS query messages in all?`),
        answer: { value: c.ans },
        steps: [
          { text: c.why, go: { lesson: 'dns', doc: 'query' } },
          {
            text: T('本地域名服务器拿到结果后会缓存起来，下次再查同一个名字就快了。', 'The local server caches the result.'),
            go: { lesson: 'dns', step: 4 },
          },
        ],
      };
    },
  },
  {
    id: 'net-https-01',
    subject: 'net',
    chapter: 'app',
    topic: T('数字签名与证书', 'Signatures and certificates'),
    type: 'single',
    difficulty: 2,
    lessons: ['https'],
    tags: ['易错点'],
    question: T('浏览器用 HTTPS 访问网站时会验证服务器发来的证书。证书上的数字签名是用谁的什么密钥生成的，浏览器又用什么验证？', 'Who signs the server’s certificate with which key, and how does the browser check it?'),
    options: [T('服务器的私钥签名，浏览器用服务器的公钥验证', 'server’s private key; checked with the server’s public key'), T('CA 的公钥签名，浏览器用 CA 的私钥验证', 'CA’s public key; checked with the CA’s private key'), T('CA 的私钥签名，浏览器用内置的 CA 公钥验证', 'CA’s private key; checked with the built-in CA public key'), T('浏览器和服务器协商出的会话密钥签名', 'the negotiated session key')],
    answer: 2,
    steps: [
      {
        text: T('证书要证明「这个公钥属于这个网站」，所以由可信的第三方 CA 签：CA 用自己的私钥对证书内容的摘要签名。', 'The CA signs the certificate digest with its private key.'),
        go: { lesson: 'https', doc: 'sign' },
      },
      {
        text: T('浏览器（操作系统）里预装了 CA 的公钥，用它验证签名，确认证书没被篡改；之后才相信证书里的服务器公钥。', 'The browser checks it with the CA’s pre-installed public key.'),
        go: { lesson: 'https', step: 2 },
      },
    ],
  },
];
