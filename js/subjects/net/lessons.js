// 课程脚本：每个协议是一份纯数据。
// steps[].events 按顺序执行：show（显示节点并移动镜头）/ camera / note（气泡）/ screen / ip / packet。
import { T } from '../../core/i18n.js';
import { IP } from './topology.js';
import { MAC, appLength, byteLen, flagNames } from './wire.js';

const s3 = (t) => `${t.toFixed(3)}s`;

const pk = (from, to, color, label, proto, time, info, wire, extra = {}) => ({
  type: 'packet', from, to, color, label, proto, time: s3(time), info, wire, ...extra,
});
const show = (nodes, frame) => ({ type: 'show', nodes, frame });
const camera = (frame) => ({ type: 'camera', frame });
const note = (node, text, opts = {}) => ({ type: 'note', node, text, ...opts });

/** TCP 连接：自动维护双方的序列号 / 确认号，生成 Wireshark 风格的 Info（相对序号） */
function tcpConn(a, b, ports, isn) {
  const st = {
    [a]: { ip: IP[a], port: ports[0], isn: isn[0], next: isn[0] },
    [b]: { ip: IP[b], port: ports[1], isn: isn[1], next: isn[1] },
  };
  return (from, flags, opts = {}) => {
    const to = from === a ? b : a;
    const me = st[from];
    const peer = st[to];
    const app = opts.app ?? null;
    const len = app ? appLength(app) : 0;
    const seq = me.next;
    const hasAck = flags.includes('A');
    const ack = hasAck ? peer.next : 0;
    me.next += len + (flags.includes('S') ? 1 : 0) + (flags.includes('F') ? 1 : 0);
    const rel = `Seq=${seq - me.isn}${hasAck ? ` Ack=${ack - peer.isn}` : ''}`;
    const info = opts.info ?? `${me.port} → ${peer.port} [${flagNames(flags)}] ${rel} Win=64240 Len=${len}`;
    const wire = { ip: { src: me.ip, dst: peer.ip }, l4: 'tcp', tcp: { sport: me.port, dport: peer.port, seq, ack, flags }, app };
    return pk(from, to, opts.color ?? 'green', opts.label ?? flagNames(flags).replace(', ', '-'), opts.proto ?? 'TCP', opts.time, info, wire, opts.extra);
  };
}

// ───────────────────────── HTTP ─────────────────────────

const HTML_BODY = `<!doctype html>
<html>
<head><title>Example Domain</title></head>
<body>
<h1>Example Domain</h1>
<p>This domain is for use in documentation examples.</p>
</body>
</html>
`;

const GET_LINES = [
  'GET / HTTP/1.1',
  'Host: www.example.com',
  'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142.0',
  'Accept: text/html,application/xhtml+xml,*/*;q=0.8',
  'Accept-Encoding: gzip, deflate',
  'Accept-Language: zh-CN,zh;q=0.9,en;q=0.8',
  'Connection: keep-alive',
  '',
];

const OK_LINES = [
  'HTTP/1.1 200 OK',
  'Date: Wed, 04 Nov 2026 08:30:00 GMT',
  'Content-Type: text/html; charset=utf-8',
  `Content-Length: ${byteLen(HTML_BODY)}`,
  'Connection: keep-alive',
  '',
];

const dnsWire = (from, to, sport, dport, app) => ({ ip: { src: IP[from], dst: IP[to] }, l4: 'udp', udp: { sport, dport }, app });

function httpLesson() {
  const tcp = tcpConn('client', 'web', [52611, 80], [0x3a1f2c07, 0x9e4b7d21]);
  const q = { kind: 'dns', id: 0x3c1a, rd: true, q: ['www.example.com', 'A'] };
  const r = { ...q, qr: true, ra: true, an: [['www.example.com', 'A', 1712, IP.web]] };
  return {
    id: 'http',
    name: 'HTTP',
    full: T('超文本传输协议', 'Hypertext Transfer Protocol'),
    title: T('打开一个网页', 'Loading a web page'),
    layer: 7,
    cat: 'app',
    nodes: ['client', 'router', 'internet', 'dns', 'web'],
    legend: [
      ['blue', 'DNS'],
      ['green', 'TCP'],
      ['amber', T('请求', 'Request')],
      ['violet', T('响应', 'Response')],
    ],
    overview: {
      desc: T(
        'HTTP 是网页的语言：浏览器向服务器要一个资源（比如一个 HTML 页面），服务器回一个状态码、一组首部，通常还有正文。HTTP/1.1 的报文是纯文本，路上任何一台设备都能读懂。',
        'HTTP is the language of the web: the browser asks a server for a resource such as an HTML page, and the server answers with a status code, headers and usually a body. HTTP/1.1 messages are plain text that any device on the path can read.',
      ),
      facts: [
        [T('所在层', 'Layer'), T('应用层（第 7 层）', 'Application (7)')],
        [T('默认端口', 'Default port'), '80'],
        [T('传输层', 'Transport'), 'TCP'],
        [T('报文格式', 'Format'), T('文本：起始行 + 首部 + 正文', 'Text: start line + headers + body')],
        [T('常见方法', 'Methods'), 'GET · POST · PUT · DELETE'],
        [T('规范', 'Spec'), 'RFC 9110 · RFC 9112'],
      ],
    },
    start: { nodes: ['client'], frame: ['client'] },
    steps: [
      {
        title: T('输入网址', 'Enter the URL'),
        desc: T('浏览器准备发出请求', 'The browser prepares a request'),
        detail: T(
          '你在地址栏输入 www.example.com 并回车。浏览器要发一个 GET 请求，但数据包只认 IP 地址、不认域名，所以第一件事是查出服务器的地址。',
          'You type www.example.com and press Enter. The browser wants to send a GET request, but packets travel to IP addresses, not names, so it must first look up the server’s address.',
        ),
        facts: [
          ['URL', 'http://www.example.com/'],
          [T('方法', 'Method'), 'GET'],
          [T('下一跳', 'Next hop'), T('路由器 192.168.1.1', 'Router 192.168.1.1')],
        ],
        events: [{ type: 'screen', node: 'client', state: 'browser' }, show(['router'], ['client', 'router']), note('client', 'http://www.example.com', { typewriter: true })],
      },
      {
        title: T('DNS 查询', 'DNS lookup'),
        desc: T('把域名换成 IP 地址', 'Turn the name into an address'),
        detail: T(
          '笔记本向 DHCP 分配给它的 DNS 解析器 1.1.1.1 发问：www.example.com 的 IPv4 地址是什么？查询走 UDP 53 端口。解析器缓存里正好有答案，直接回了一条 A 记录。',
          'The laptop asks its resolver, 1.1.1.1, for the IPv4 address of www.example.com over UDP port 53. The answer is already cached, so the resolver replies at once with an A record.',
        ),
        facts: [
          [T('解析器', 'Resolver'), T('1.1.1.1（命中缓存）', '1.1.1.1 (cache hit)')],
          [T('传输', 'Transport'), 'UDP 53'],
          [T('答案', 'Answer'), `A ${IP.web}`],
        ],
        events: [
          show(['internet', 'dns'], ['client', 'router', 'internet', 'dns']),
          pk('client', 'dns', 'blue', T('DNS 查询', 'DNS QUERY'), 'DNS', 0, 'Standard query 0x3c1a A www.example.com', dnsWire('client', 'dns', 59321, 53, q)),
          pk('dns', 'client', 'blue', T('DNS 应答', 'DNS REPLY'), 'DNS', 0.014, `Standard query response 0x3c1a A www.example.com A ${IP.web}`, dnsWire('dns', 'client', 53, 59321, r)),
        ],
      },
      {
        title: T('TCP 三次握手', 'TCP handshake'),
        desc: T('先建立一条可靠连接', 'Open a reliable connection'),
        detail: T(
          'HTTP 跑在 TCP 之上。在传任何网页数据之前，笔记本和服务器的 80 端口先完成三次握手：SYN、SYN-ACK、ACK，顺便交换双方的初始序列号。',
          'HTTP runs on TCP. Before any page data moves, the laptop and port 80 on the server complete a three-way handshake — SYN, SYN-ACK, ACK — exchanging their initial sequence numbers.',
        ),
        facts: [
          [T('服务器端口', 'Server port'), '80'],
          [T('客户端端口', 'Client port'), T('52611（临时端口）', '52611 (ephemeral)')],
          [T('顺序', 'Order'), 'SYN → SYN-ACK → ACK'],
        ],
        events: [
          show(['web'], ['client', 'router', 'internet', 'dns', 'web']),
          tcp('client', 'S', { time: 0.016, label: 'SYN' }),
          tcp('web', 'SA', { time: 0.033, label: 'SYN-ACK' }),
          tcp('client', 'A', { time: 0.050, label: 'ACK' }),
        ],
      },
      {
        title: T('请求与响应', 'Request and response'),
        desc: T('GET 出去，200 OK 回来', 'GET goes out, 200 OK comes back'),
        detail: T(
          `浏览器发出 GET 请求，Host 首部告诉服务器要哪个网站。服务器回 200 OK，正文就是 HTML。这个示例页面只有 ${byteLen(HTML_BODY)} 字节，一个 TCP 分段就装得下；大页面会被拆成很多段（每段最多 1460 字节）。点表格里的这一行，可以看到逐字节的明文。`,
          `The browser sends a GET with a Host header naming the site. The server answers 200 OK with the HTML as the body. This sample page is only ${byteLen(HTML_BODY)} bytes, so one TCP segment holds it; bigger pages are split into segments of up to 1460 bytes. Click the row in the table to read every byte in plain text.`,
        ),
        facts: [
          [T('状态码', 'Status'), '200 OK'],
          [T('正文类型', 'Body'), 'text/html'],
          [T('正文大小', 'Body size'), T(`${byteLen(HTML_BODY)} 字节`, `${byteLen(HTML_BODY)} bytes`)],
        ],
        events: [
          tcp('client', 'PA', { time: 0.050, color: 'amber', label: 'GET /', proto: 'HTTP', info: 'GET / HTTP/1.1', app: { kind: 'http', lines: GET_LINES } }),
          tcp('web', 'PA', { time: 0.071, color: 'violet', label: '200 OK', proto: 'HTTP', info: 'HTTP/1.1 200 OK (text/html)', app: { kind: 'http', lines: OK_LINES, body: HTML_BODY } }),
        ],
      },
      {
        title: T('渲染页面', 'Render the page'),
        desc: T('浏览器把 HTML 画出来', 'The browser paints the HTML'),
        detail: T(
          '浏览器解析 HTML 并把页面画出来。页面里引用的 CSS、图片、脚本还会触发更多同样的请求，它们会尽量复用这条已经打开的连接（keep-alive）。',
          'The browser parses the HTML and paints the page. Any CSS, images or scripts it links to start more requests just like this one, reusing the open connection where they can (keep-alive).',
        ),
        facts: [
          [T('文档', 'Document'), 'text/html'],
          [T('连接', 'Connection'), T('保持打开', 'Kept open')],
          [T('总耗时', 'Total time'), '0.071 s'],
        ],
        events: [camera(['client', 'router']), { type: 'screen', node: 'client', state: 'page' }, note('client', T('页面已显示：Example Domain', 'Rendered: Example Domain'), { tone: 'ok' })],
      },
    ],
    outro: {
      title: T('页面送达', 'Page delivered'),
      text: T(
        '不到十分之一秒，笔记本查了地址、建了 TCP 连接、完成一次 HTTP 请求和响应——而且全程明文，路径上谁都看得见。这正是 HTTPS 要解决的问题。',
        'In under a tenth of a second the laptop looked up an address, opened a TCP connection and exchanged one HTTP request and response — all in plain text that anyone on the path can read. That is the problem HTTPS solves.',
      ),
      facts: [
        [T('往返次数', 'Round trips'), T('3（DNS、TCP、HTTP）', '3 (DNS, TCP, HTTP)')],
        [T('数据包', 'Packets'), '7'],
        [T('总耗时', 'Total time'), '0.071 s'],
      ],
    },
  };
}

// ───────────────────────── DNS ─────────────────────────

function dnsLesson() {
  const name = 'www.example.com';
  const q = (id, rd) => ({ kind: 'dns', id, rd, q: [name, 'A'] });
  return {
    id: 'dns',
    name: 'DNS',
    full: T('域名系统', 'Domain Name System'),
    title: T('一次完整的递归解析', 'A full recursive lookup'),
    layer: 7,
    cat: 'core',
    nodes: ['client', 'router', 'internet', 'dns', 'root', 'tld', 'auth'],
    legend: [
      ['blue', T('查询', 'Query')],
      ['violet', T('转介 / 应答', 'Referral / answer')],
    ],
    overview: {
      desc: T(
        'DNS 是互联网的电话簿：把 www.example.com 这样的名字翻译成 IP 地址。递归解析器从根服务器开始，一级一级往下问，直到问到负责这个域名的权威服务器。',
        'DNS is the internet’s phone book: it turns names like www.example.com into IP addresses. A recursive resolver starts at the root and walks down the hierarchy until it reaches the server that is authoritative for the name.',
      ),
      facts: [
        [T('所在层', 'Layer'), T('应用层（第 7 层）', 'Application (7)')],
        [T('端口', 'Port'), '53'],
        [T('传输层', 'Transport'), T('UDP（大响应改用 TCP）', 'UDP (TCP for large replies)')],
        [T('常见记录', 'Records'), 'A · AAAA · NS · MX · CNAME'],
        [T('根服务器', 'Root servers'), T('13 组（a 到 m）', '13 (a to m)')],
        [T('规范', 'Spec'), 'RFC 1034 · RFC 1035'],
      ],
    },
    start: { nodes: ['client'], frame: ['client'] },
    steps: [
      {
        title: T('问自己的解析器', 'Ask the resolver'),
        desc: T('笔记本只发出一个问题', 'The laptop asks just once'),
        detail: T(
          '笔记本只认识一个 DNS：它的递归解析器 1.1.1.1。查询里置了 RD（期望递归）标志，意思是「请你帮我问到底」。不巧，这次解析器的缓存里没有答案。',
          'The laptop only knows one DNS server: its recursive resolver, 1.1.1.1. The query sets the RD (recursion desired) flag — “please find the answer for me”. This time the resolver has nothing cached.',
        ),
        facts: [
          [T('问题', 'Question'), `${name} A?`],
          [T('标志', 'Flags'), T('RD = 1（期望递归）', 'RD = 1 (recursion desired)')],
          [T('缓存', 'Cache'), T('未命中', 'Miss')],
        ],
        events: [
          show(['router', 'internet', 'dns'], ['client', 'router', 'internet', 'dns']),
          pk('client', 'dns', 'blue', T('查询', 'QUERY'), 'DNS', 0, `Standard query 0x7d21 A ${name}`, dnsWire('client', 'dns', 61042, 53, q(0x7d21, true))),
          note('dns', T('缓存未命中', 'Cache miss'), { tone: 'warn' }),
        ],
      },
      {
        title: T('问根服务器', 'Ask a root server'),
        desc: T('根说：去问 .com', 'The root says: ask .com'),
        detail: T(
          '解析器从根开始。根服务器不知道 www.example.com 的地址，但它知道谁管 .com：它回一个「转介」，在权威部分列出 .com 的名字服务器，并在附加部分附上它的 IP（胶水记录），免得解析器还得再查一次。',
          'The resolver starts at the root. The root does not know www.example.com, but it knows who runs .com: it sends back a referral listing a .com name server in the authority section, with its IP as glue in the additional section.',
        ),
        facts: [
          [T('根服务器', 'Root'), `a.root-servers.net ${IP.root}`],
          [T('回答', 'Answers'), '0'],
          [T('转介到', 'Referral'), `a.gtld-servers.net ${IP.tld}`],
        ],
        events: [
          show(['root'], ['client', 'router', 'internet', 'dns', 'root']),
          pk('dns', 'root', 'blue', T('查询', 'QUERY'), 'DNS', 0.002, `Standard query 0x51e3 A ${name}`, dnsWire('dns', 'root', 41873, 53, q(0x51e3, false))),
          pk('root', 'dns', 'violet', T('转介 .com', 'REFERRAL .com'), 'DNS', 0.014, `Standard query response 0x51e3 A ${name} NS a.gtld-servers.net A ${IP.tld}`,
            dnsWire('root', 'dns', 53, 41873, { ...q(0x51e3, false), qr: true, ns: [['com', 'NS', 172800, 'a.gtld-servers.net']], ar: [['a.gtld-servers.net', 'A', 172800, IP.tld]] })),
        ],
      },
      {
        title: T('问 .com 顶级域', 'Ask the .com TLD'),
        desc: T('.com 说：去问 example.com 的服务器', '.com says: ask example.com’s server'),
        detail: T(
          '.com 的服务器管着上亿个域名，但同样不存每台主机的地址。它再给一个转介：example.com 由 ns1.example.com（198.51.100.53）负责。',
          'The .com servers hold delegations for over a hundred million domains but not their hosts. Another referral: example.com is served by ns1.example.com (198.51.100.53).',
        ),
        facts: [
          [T('顶级域', 'TLD'), `a.gtld-servers.net ${IP.tld}`],
          [T('转介到', 'Referral'), `ns1.example.com ${IP.auth}`],
          [T('记录 TTL', 'TTL'), T('2 天', '2 days')],
        ],
        events: [
          show(['tld'], ['client', 'router', 'internet', 'dns', 'root', 'tld']),
          pk('dns', 'tld', 'blue', T('查询', 'QUERY'), 'DNS', 0.015, `Standard query 0x0b9c A ${name}`, dnsWire('dns', 'tld', 22719, 53, q(0x0b9c, false))),
          pk('tld', 'dns', 'violet', T('转介 example.com', 'REFERRAL'), 'DNS', 0.031, `Standard query response 0x0b9c A ${name} NS ns1.example.com A ${IP.auth}`,
            dnsWire('tld', 'dns', 53, 22719, { ...q(0x0b9c, false), qr: true, ns: [['example.com', 'NS', 172800, 'ns1.example.com']], ar: [['ns1.example.com', 'A', 172800, IP.auth]] })),
        ],
      },
      {
        title: T('问权威服务器', 'Ask the authoritative server'),
        desc: T('终于拿到 A 记录', 'Finally, the A record'),
        detail: T(
          'ns1.example.com 是这个域名的「户口本」所在地。它直接给出答案，并置上 AA（权威应答）标志：www.example.com 的地址是 203.0.113.80，可以缓存 3600 秒。',
          'ns1.example.com holds the zone itself. It answers directly with the AA (authoritative answer) flag set: www.example.com is 203.0.113.80, cacheable for 3600 seconds.',
        ),
        facts: [
          [T('权威服务器', 'Authoritative'), `ns1.example.com ${IP.auth}`],
          [T('答案', 'Answer'), `A ${IP.web}`],
          ['TTL', '3600 s'],
        ],
        events: [
          show(['auth'], ['client', 'router', 'internet', 'dns', 'root', 'tld', 'auth']),
          pk('dns', 'auth', 'blue', T('查询', 'QUERY'), 'DNS', 0.032, `Standard query 0xa4f0 A ${name}`, dnsWire('dns', 'auth', 61204, 53, q(0xa4f0, false))),
          pk('auth', 'dns', 'violet', T('答案 A', 'ANSWER A'), 'DNS', 0.051, `Standard query response 0xa4f0 A ${name} A ${IP.web}`,
            dnsWire('auth', 'dns', 53, 61204, { ...q(0xa4f0, false), qr: true, aa: true, an: [[name, 'A', 3600, IP.web]] })),
        ],
      },
      {
        title: T('返回并缓存', 'Reply and cache'),
        desc: T('答案交给笔记本', 'The laptop gets its answer'),
        detail: T(
          '解析器把答案交还给笔记本，同时按 TTL 缓存起来。接下来一小时里，任何人再问这个名字，都不用再跑一遍「根 → 顶级域 → 权威」。',
          'The resolver hands the answer to the laptop and caches it for the TTL. For the next hour, anyone asking for this name skips the root → TLD → authoritative walk entirely.',
        ),
        facts: [
          [T('答案', 'Answer'), `A ${IP.web}`],
          [T('缓存时长', 'Cached for'), T('1 小时', '1 hour')],
          [T('总耗时', 'Total time'), '0.053 s'],
        ],
        events: [
          camera(['client', 'router', 'internet', 'dns']),
          pk('dns', 'client', 'violet', T('应答', 'REPLY'), 'DNS', 0.053, `Standard query response 0x7d21 A ${name} A ${IP.web}`,
            dnsWire('dns', 'client', 53, 61042, { ...q(0x7d21, true), qr: true, ra: true, an: [[name, 'A', 3600, IP.web]] })),
          note('dns', T('已缓存 · TTL 3600 s', 'Cached · TTL 3600 s'), { tone: 'ok' }),
        ],
      },
    ],
    outro: {
      title: T('名字解析完成', 'Name resolved'),
      text: T(
        '一次完整的递归解析问了 3 台服务器，可笔记本只发了 1 个问题。正因为层层缓存，现实中绝大多数查询在第 1 步就结束了。',
        'A full recursive lookup asked three servers, yet the laptop asked only one question. Thanks to caching, most real lookups end at step one.',
      ),
      facts: [
        [T('询问的服务器', 'Servers asked'), '3'],
        [T('数据包', 'Packets'), '8'],
        [T('总耗时', 'Total time'), '0.053 s'],
      ],
    },
  };
}

// ───────────────────────── TCP ─────────────────────────

function tcpLesson() {
  const tcp = tcpConn('client', 'web', [49731, 7], [0x1c9e04aa, 0x6f22b310]);
  const hello = { kind: 'text', text: 'hello, server!\n' };
  return {
    id: 'tcp',
    name: 'TCP',
    full: T('传输控制协议', 'Transmission Control Protocol'),
    title: T('握手、传数据、挥手', 'Handshake, data, teardown'),
    layer: 4,
    cat: 'core',
    nodes: ['client', 'router', 'internet', 'web'],
    legend: [
      ['green', T('控制', 'Control')],
      ['amber', T('数据', 'Data')],
      ['slate', 'ACK'],
    ],
    overview: {
      desc: T(
        'TCP 在「尽力而为」的 IP 之上提供可靠、有序的字节流：先握手建立连接，每个字节都有序号，收到就确认，丢了就重传，最后挥手关闭。',
        'TCP builds a reliable, ordered byte stream on top of best-effort IP: a handshake opens the connection, every byte is numbered and acknowledged, losses are retransmitted, and a teardown closes it.',
      ),
      facts: [
        [T('所在层', 'Layer'), T('传输层（第 4 层）', 'Transport (4)')],
        [T('连接', 'Connection'), T('面向连接', 'Connection-oriented')],
        [T('可靠性', 'Reliability'), T('序号 + 确认 + 重传', 'Seq numbers, ACKs, retransmits')],
        [T('首部', 'Header'), T('20–60 字节', '20–60 bytes')],
        [T('典型应用', 'Used by'), 'HTTP · SSH · SMTP'],
        [T('规范', 'Spec'), 'RFC 9293'],
      ],
    },
    start: { nodes: ['client', 'router', 'internet', 'web'], frame: ['client', 'router', 'internet', 'web'] },
    steps: [
      {
        title: T('三次握手', 'Three-way handshake'),
        desc: T('SYN → SYN-ACK → ACK', 'SYN → SYN-ACK → ACK'),
        detail: T(
          '客户端发 SYN 提出连接，带上自己的初始序列号（ISN）；服务器回 SYN-ACK，确认客户端的序号并给出自己的 ISN；客户端再回 ACK。三次之后，双方都确认了对方能收也能发。表格里显示的是相对序号，解析面板里能看到真实的 32 位原始值。',
          'The client sends SYN with its initial sequence number (ISN); the server replies SYN-ACK, acknowledging it and offering its own ISN; the client answers ACK. After three packets both sides know the other can send and receive. The table shows relative numbers; the decoder shows the raw 32-bit values.',
        ),
        facts: [
          [T('服务', 'Service'), T('Echo（端口 7）', 'Echo (port 7)')],
          [T('客户端 ISN', 'Client ISN'), String(0x1c9e04aa)],
          [T('服务器 ISN', 'Server ISN'), String(0x6f22b310)],
        ],
        events: [tcp('client', 'S', { time: 0, label: 'SYN' }), tcp('web', 'SA', { time: 0.018, label: 'SYN-ACK' }), tcp('client', 'A', { time: 0.036, label: 'ACK' })],
      },
      {
        title: T('发送数据', 'Send data'),
        desc: T('15 个字节，Ack 变成 16', '15 bytes, so Ack becomes 16'),
        detail: T(
          '客户端发出 15 字节的 "hello, server!\\n"，Seq=1。服务器回的 ACK 号是 16，意思是「前 15 个字节都收到了，下一个请从第 16 个开始」。确认号永远指向「下一个想要的字节」。',
          'The client sends 15 bytes, "hello, server!\\n", at Seq=1. The server’s ACK number is 16: “I have bytes 1–15, send byte 16 next.” An acknowledgment number always names the next byte expected.',
        ),
        facts: [
          ['Seq', '1'],
          [T('数据长度', 'Length'), T('15 字节', '15 bytes')],
          [T('服务器确认', 'Server ACK'), 'Ack=16'],
        ],
        events: [
          tcp('client', 'PA', { time: 0.040, color: 'amber', label: T('数据 15B', 'DATA 15B'), app: hello }),
          tcp('web', 'A', { time: 0.058, color: 'slate', label: 'ACK 16' }),
        ],
      },
      {
        title: T('服务器回显', 'Server echoes back'),
        desc: T('同样的规则，反方向', 'Same rules, other direction'),
        detail: T(
          'Echo 服务把收到的内容原样发回。这次轮到服务器用自己的序号（Seq=1），客户端确认 Ack=16。TCP 的两个方向各有一套独立的序号。',
          'The echo service sends the same bytes back. Now the server uses its own numbering (Seq=1) and the client acknowledges Ack=16. Each direction of a TCP connection has its own sequence space.',
        ),
        facts: [
          [T('服务器 Seq', 'Server Seq'), '1'],
          [T('数据长度', 'Length'), T('15 字节', '15 bytes')],
          [T('客户端确认', 'Client ACK'), 'Ack=16'],
        ],
        events: [
          tcp('web', 'PA', { time: 0.059, color: 'amber', label: T('回显 15B', 'ECHO 15B'), app: hello }),
          tcp('client', 'A', { time: 0.077, color: 'slate', label: 'ACK 16' }),
        ],
      },
      {
        title: T('四次挥手', 'Four-way teardown'),
        desc: T('两个方向分别关闭', 'Each direction closes separately'),
        detail: T(
          '客户端发 FIN 表示「我不再发了」，服务器先 ACK；等服务器也发完，再发自己的 FIN，客户端最后 ACK。因为两个方向是独立关闭的，所以需要四个包（有时中间两个会合并成一个）。',
          'The client sends FIN (“I’m done sending”) and the server ACKs it; when the server is done it sends its own FIN and the client ACKs. Each direction closes independently, hence four packets (the middle two are sometimes combined).',
        ),
        facts: [
          [T('发起方', 'Initiator'), T('客户端（主动关闭）', 'Client (active close)')],
          [T('FIN 占用', 'FIN uses'), T('1 个序号', '1 sequence number')],
          [T('包数', 'Packets'), '4'],
        ],
        events: [
          tcp('client', 'FA', { time: 0.080, label: 'FIN' }),
          tcp('web', 'A', { time: 0.098, color: 'slate', label: 'ACK' }),
          tcp('web', 'FA', { time: 0.099, label: 'FIN' }),
          tcp('client', 'A', { time: 0.117, color: 'slate', label: 'ACK' }),
        ],
      },
      {
        title: T('TIME_WAIT', 'TIME_WAIT'),
        desc: T('主动关闭方再等一会儿', 'The active closer waits a little'),
        detail: T(
          '主动关闭的一方要在 TIME_WAIT 状态停留 2×MSL（最大报文寿命），以防最后那个 ACK 丢了需要重发，也让网络里迟到的旧分段彻底消失，不会混进下一条同端口的连接。',
          'The side that closed first stays in TIME_WAIT for 2×MSL (maximum segment lifetime) in case the last ACK was lost and must be resent, and so stray old segments die out before a new connection reuses the ports.',
        ),
        facts: [
          [T('状态', 'State'), 'TIME_WAIT'],
          [T('时长', 'Duration'), T('2×MSL（常见 60 秒）', '2×MSL (often 60 s)')],
          [T('服务器', 'Server'), 'CLOSED'],
        ],
        events: [camera(['client', 'router']), note('client', T('TIME_WAIT · 等待 2×MSL', 'TIME_WAIT · 2×MSL'), { tone: 'warn' })],
      },
    ],
    outro: {
      title: T('连接已关闭', 'Connection closed'),
      text: T(
        '11 个包里只有 2 个携带应用数据（共 30 字节），其余都在建立、确认和关闭连接。这就是「可靠」的代价——也是 QUIC 等新协议想要削减的开销。',
        'Only 2 of the 11 packets carried application data (30 bytes in total); the rest opened, acknowledged and closed the connection. That is the price of reliability — and what newer protocols like QUIC try to trim.',
      ),
      facts: [
        [T('数据包', 'Packets'), '11'],
        [T('应用数据', 'App data'), T('30 字节', '30 bytes')],
        [T('总耗时', 'Total time'), '0.117 s'],
      ],
    },
  };
}

// ───────────────────────── DHCP ─────────────────────────

function dhcpLesson() {
  const xid = 0x6b2e91d4;
  const base = { kind: 'dhcp', xid, chaddr: MAC.client };
  const offerOpts = { server: IP.router, lease: 86400, mask: '255.255.255.0', gateway: IP.router, dnsServer: IP.dns };
  const fromClient = (app) => ({ ip: { src: IP.zero, dst: IP.bcast }, l4: 'udp', udp: { sport: 68, dport: 67 }, app });
  const fromRouter = (app) => ({ ip: { src: IP.router, dst: IP.bcast }, l4: 'udp', udp: { sport: 67, dport: 68 }, app });
  return {
    id: 'dhcp',
    name: 'DHCP',
    full: T('动态主机配置协议', 'Dynamic Host Configuration Protocol'),
    title: T('连上 Wi‑Fi 之后', 'Right after joining Wi‑Fi'),
    layer: 7,
    cat: 'core',
    nodes: ['client', 'router'],
    legend: [
      ['orange', T('客户端广播', 'Client broadcast')],
      ['teal', T('服务器回复', 'Server reply')],
    ],
    overview: {
      desc: T(
        '刚连上 Wi‑Fi 的设备什么地址都没有。DHCP 用四条消息——Discover、Offer、Request、ACK（合称 DORA）——向网络借来 IP 地址、子网掩码、网关和 DNS 服务器。',
        'A device that just joined Wi‑Fi has no address at all. DHCP uses four messages — Discover, Offer, Request, ACK (DORA) — to lease an IP address, subnet mask, gateway and DNS server from the network.',
      ),
      facts: [
        [T('所在层', 'Layer'), T('应用层（第 7 层）', 'Application (7)')],
        [T('端口', 'Ports'), T('客户端 68 · 服务器 67', 'Client 68 · Server 67')],
        [T('传输层', 'Transport'), T('UDP 广播', 'UDP broadcast')],
        [T('分配内容', 'Hands out'), T('IP、掩码、网关、DNS、租期', 'IP, mask, gateway, DNS, lease')],
        [T('规范', 'Spec'), 'RFC 2131'],
      ],
    },
    start: { nodes: ['client'], frame: ['client'], ips: { client: IP.zero } },
    steps: [
      {
        title: 'Discover',
        desc: T('有 DHCP 服务器吗？', 'Is there a DHCP server?'),
        detail: T(
          '笔记本还没有 IP，只能用 0.0.0.0 当源地址，向 255.255.255.255 广播：「网上有 DHCP 服务器吗？」以太网目的地址也是全 F 广播，同一网段的设备都会收到。家用路由器通常兼任 DHCP 服务器。',
          'With no IP yet, the laptop uses 0.0.0.0 as its source and broadcasts to 255.255.255.255: “Is there a DHCP server out there?” The Ethernet destination is the all-ones broadcast too, so everything on the segment hears it. Home routers usually act as the DHCP server.',
        ),
        facts: [
          [T('源地址', 'Source'), '0.0.0.0:68'],
          [T('目的地址', 'Destination'), '255.255.255.255:67'],
          [T('事务 ID', 'Transaction ID'), '0x6b2e91d4'],
        ],
        events: [
          show(['router'], ['client', 'router']),
          pk('client', 'router', 'orange', 'DISCOVER', 'DHCP', 0, 'DHCP Discover - Transaction ID 0x6b2e91d4', fromClient({ ...base, msg: 'discover', hostname: 'my-laptop' })),
        ],
      },
      {
        title: 'Offer',
        desc: T('给你 192.168.1.23 怎么样', 'How about 192.168.1.23?'),
        detail: T(
          '路由器从地址池里挑出一个空闲地址 192.168.1.23，连同子网掩码、网关、DNS 和租期一起「报价」。因为客户端还没有地址，这个回复同样用广播发出。',
          'The router picks a free address, 192.168.1.23, from its pool and offers it together with the subnet mask, gateway, DNS server and lease time. The client has no address yet, so the reply is broadcast as well.',
        ),
        facts: [
          [T('报价地址', 'Offered IP'), '192.168.1.23'],
          [T('网关 / DNS', 'Gateway / DNS'), `${IP.router} / ${IP.dns}`],
          [T('租期', 'Lease'), T('24 小时', '24 hours')],
        ],
        events: [pk('router', 'client', 'teal', 'OFFER', 'DHCP', 0.004, 'DHCP Offer - Transaction ID 0x6b2e91d4', fromRouter({ ...base, msg: 'offer', yiaddr: IP.client, ...offerOpts }))],
      },
      {
        title: 'Request',
        desc: T('我要这个地址', 'I’ll take it'),
        detail: T(
          '为什么还要再问一次？因为网上可能有多台 DHCP 服务器都给了报价。客户端广播 Request，点名接受其中一个（选项 54：服务器标识 192.168.1.1），其他服务器就知道自己的报价被拒绝了。',
          'Why ask again? Several DHCP servers may have made offers. The client broadcasts a Request naming the one it accepts (option 54, server identifier 192.168.1.1), so every other server knows its offer was declined.',
        ),
        facts: [
          [T('请求地址', 'Requested'), T('192.168.1.23（选项 50）', '192.168.1.23 (option 50)')],
          [T('选中服务器', 'Chosen server'), T('192.168.1.1（选项 54）', '192.168.1.1 (option 54)')],
          [T('仍是广播', 'Still broadcast'), T('是', 'Yes')],
        ],
        events: [
          pk('client', 'router', 'orange', 'REQUEST', 'DHCP', 0.006, 'DHCP Request - Transaction ID 0x6b2e91d4', fromClient({ ...base, msg: 'request', requested: IP.client, server: IP.router, hostname: 'my-laptop' })),
        ],
      },
      {
        title: 'ACK',
        desc: T('成交，地址归你 24 小时', 'Done: the address is yours for 24 h'),
        detail: T(
          '路由器确认租约。笔记本现在正式拥有 192.168.1.23，并知道该把外网流量交给网关 192.168.1.1、该向 1.1.1.1 查 DNS。租期过半时，它会悄悄单播续约。',
          'The router confirms the lease. The laptop now owns 192.168.1.23, knows to send outside traffic to gateway 192.168.1.1 and to ask 1.1.1.1 for DNS. Halfway through the lease it will quietly renew by unicast.',
        ),
        facts: [
          [T('IP 地址', 'IP address'), '192.168.1.23/24'],
          [T('续约时间', 'Renewal'), T('12 小时后（T1）', 'after 12 h (T1)')],
          [T('总耗时', 'Total time'), '0.010 s'],
        ],
        events: [
          pk('router', 'client', 'teal', 'ACK', 'DHCP', 0.010, 'DHCP ACK - Transaction ID 0x6b2e91d4', fromRouter({ ...base, msg: 'ack', yiaddr: IP.client, ...offerOpts })),
          { type: 'ip', node: 'client', ip: IP.client },
          note('client', T('已获得 192.168.1.23 · 租期 24 小时', 'Got 192.168.1.23 · 24 h lease'), { tone: 'ok' }),
        ],
      },
    ],
    outro: {
      title: T('上网准备就绪', 'Ready to go online'),
      text: T(
        '四个广播包、十毫秒，笔记本就从「无名氏」变成了网络里有地址、有网关、有 DNS 的正式成员。之后的每一课，都建立在这一步之上。',
        'Four broadcasts and ten milliseconds turned an anonymous laptop into a proper member of the network with an address, a gateway and a DNS server. Every other lesson builds on this step.',
      ),
      facts: [
        [T('数据包', 'Packets'), '4'],
        [T('获得地址', 'Address'), '192.168.1.23'],
        [T('租期', 'Lease'), T('24 小时', '24 hours')],
      ],
    },
  };
}

// ───────────────────────── HTTPS / TLS 1.3 ─────────────────────────

function httpsLesson() {
  const tcp = tcpConn('client', 'web', [52740, 443], [0x51d0a3e9, 0x0c7fe2b4]);
  const tls = (records) => ({ kind: 'tls', records });
  const reqLen = appLength({ kind: 'http', lines: GET_LINES });
  const resLen = appLength({ kind: 'http', lines: OK_LINES, body: HTML_BODY });
  const lock = { locked: true };
  return {
    id: 'https',
    name: 'HTTPS',
    full: T('HTTP over TLS 1.3', 'HTTP over TLS 1.3'),
    title: T('给网页加一把锁', 'Putting a lock on the web'),
    layer: 7,
    cat: 'sec',
    nodes: ['client', 'router', 'internet', 'web'],
    legend: [
      ['green', 'TCP'],
      ['teal', T('TLS 握手', 'TLS handshake')],
      ['rose', T('加密数据', 'Encrypted data')],
    ],
    overview: {
      desc: T(
        'HTTPS = HTTP + TLS。在发送任何 HTTP 内容之前，浏览器和服务器先做一次 TLS 握手：协商算法、交换密钥、验证证书。之后的请求和响应全部加密，路上的人只看得见「谁在和谁通信、传了多少字节」。',
        'HTTPS is HTTP inside TLS. Before any HTTP is sent, browser and server run a TLS handshake to agree on algorithms, exchange keys and check the certificate. Everything after that is encrypted: observers see who talks to whom and how many bytes, nothing more.',
      ),
      facts: [
        [T('所在层', 'Layer'), T('应用层（TLS 在 TCP 之上）', 'Application (TLS over TCP)')],
        [T('默认端口', 'Default port'), '443'],
        [T('协议版本', 'Version'), 'TLS 1.3'],
        [T('密钥交换', 'Key exchange'), 'X25519 (ECDHE)'],
        [T('对称加密', 'Cipher'), 'AES-128-GCM'],
        [T('规范', 'Spec'), 'RFC 8446 · RFC 9110'],
      ],
    },
    start: { nodes: ['client'], frame: ['client'] },
    steps: [
      {
        title: T('TCP 握手', 'TCP handshake'),
        desc: T('这次连 443 端口', 'This time to port 443'),
        detail: T(
          '和 HTTP 一样先建 TCP 连接，只是目的端口换成 443。（DNS 查询在 HTTP 那一课讲过，这里假设地址已经在缓存里。）',
          'Just like HTTP, a TCP connection comes first — to port 443 this time. (DNS was covered in the HTTP lesson; here the address is already cached.)',
        ),
        facts: [
          [T('服务器端口', 'Server port'), '443'],
          [T('客户端端口', 'Client port'), '52740'],
          [T('服务器地址', 'Server'), IP.web],
        ],
        events: [
          { type: 'screen', node: 'client', state: 'browser' },
          show(['router', 'internet', 'web'], ['client', 'router', 'internet', 'web']),
          tcp('client', 'S', { time: 0, label: 'SYN' }),
          tcp('web', 'SA', { time: 0.017, label: 'SYN-ACK' }),
          tcp('client', 'A', { time: 0.034, label: 'ACK' }),
        ],
      },
      {
        title: 'Client Hello',
        desc: T('我支持这些，这是我的公钥', 'Here is what I support, and my key'),
        detail: T(
          '浏览器报上自己支持的 TLS 版本和加密套件，并直接附上一份 X25519 公钥（key_share），省掉一个来回。注意 SNI 扩展里的域名是明文的——路上的设备能看到你在访问哪个网站，只是看不到具体页面。',
          'The browser lists the TLS versions and cipher suites it supports and includes an X25519 public key (key_share) up front, saving a round trip. Note the SNI extension carries the site name in plain text: observers can see which site you visit, just not which page.',
        ),
        facts: [
          ['SNI', 'www.example.com'],
          [T('支持版本', 'Versions'), 'TLS 1.3, 1.2'],
          ['ALPN', 'h2, http/1.1'],
        ],
        events: [
          tcp('client', 'PA', { time: 0.035, color: 'teal', label: 'CLIENT HELLO', proto: 'TLSv1.3', info: 'Client Hello (SNI=www.example.com)', app: tls([{ type: 'client_hello', sni: 'www.example.com' }]) }),
        ],
      },
      {
        title: 'Server Hello',
        desc: T('就用 TLS 1.3，这是我的公钥', 'TLS 1.3 it is — here is my key'),
        detail: T(
          '服务器选定 TLS 1.3 和 TLS_AES_128_GCM_SHA256，回送自己的 key_share。双方用各自的私钥和对方的公钥，算出同一把共享密钥（ECDHE）。紧接着的证书、签名和 Finished 已经是加密传输的了。（真实的证书链常常要拆成好几个 TCP 分段，这里画成一个。）',
          'The server picks TLS 1.3 with TLS_AES_128_GCM_SHA256 and returns its own key_share. Each side combines its private key with the other’s public key to derive the same shared secret (ECDHE). The certificate, signature and Finished that follow are already encrypted. (Real certificate chains often span several TCP segments; drawn here as one.)',
        ),
        facts: [
          [T('选定版本', 'Version'), 'TLS 1.3'],
          [T('加密套件', 'Cipher suite'), 'TLS_AES_128_GCM_SHA256'],
          [T('证书', 'Certificate'), T('加密传输', 'Sent encrypted')],
        ],
        events: [
          tcp('web', 'PA', {
            time: 0.053, color: 'teal', label: 'SERVER HELLO', proto: 'TLSv1.3', info: 'Server Hello, Change Cipher Spec, Application Data',
            app: tls([{ type: 'server_hello' }, { type: 'ccs' }, { type: 'appdata', length: 1186, what: T('Encrypted Extensions、证书链、证书签名（Certificate Verify）、Finished', 'Encrypted Extensions, certificate chain, Certificate Verify, Finished') }]),
          }),
        ],
      },
      {
        title: T('握手完成', 'Handshake done'),
        desc: T('浏览器验证证书后发出 Finished', 'The browser checks the certificate and finishes'),
        detail: T(
          '浏览器验证证书确实属于 www.example.com、由可信机构签发、签名无误，然后发出自己的 Finished。整个握手只用了 1 个往返（1-RTT）。从这一刻起，双方之间只有加密数据。',
          'The browser checks that the certificate belongs to www.example.com, chains to a trusted authority and that the signature verifies, then sends its own Finished. The whole handshake took one round trip (1-RTT). From now on only encrypted data flows.',
        ),
        facts: [
          [T('往返次数', 'Round trips'), '1-RTT'],
          [T('证书校验', 'Certificate'), T('通过', 'Valid')],
          [T('共享密钥', 'Shared secret'), T('已建立', 'Established')],
        ],
        events: [
          tcp('client', 'PA', {
            time: 0.055, color: 'teal', label: 'FINISHED', proto: 'TLSv1.3', info: 'Change Cipher Spec, Application Data',
            app: tls([{ type: 'ccs' }, { type: 'appdata', length: 53, what: T('Finished：对整个握手过程的校验值', 'Finished: a MAC over the whole handshake') }]),
          }),
          { type: 'screen', node: 'client', state: 'lock' },
          note('client', T('已加密 · TLS 1.3', 'Encrypted · TLS 1.3'), { tone: 'ok' }),
        ],
      },
      {
        title: T('加密的请求与响应', 'Encrypted request and response'),
        desc: T('同样的 GET，只是外人看不懂', 'The same GET, unreadable to others'),
        detail: T(
          '还是那个 GET 和 200 OK，只是被装进了 TLS 的 Application Data 记录。抓包只能看到长度，看不到网址路径、首部和网页内容。点开表格里的这两行对比 HTTP 那一课，差别一目了然。',
          'The same GET and 200 OK, now wrapped in TLS Application Data records. A capture shows only their length — no path, headers or page content. Open these rows and compare them with the HTTP lesson.',
        ),
        facts: [
          [T('请求', 'Request'), T('加密后的 GET /', 'Encrypted GET /')],
          [T('响应', 'Response'), T('加密后的 200 OK', 'Encrypted 200 OK')],
          [T('外人可见', 'Visible to others'), T('IP、端口、SNI、长度', 'IPs, ports, SNI, sizes')],
        ],
        events: [
          tcp('client', 'PA', {
            time: 0.056, color: 'rose', label: 'GET /', proto: 'TLSv1.3', info: 'Application Data', extra: lock,
            app: tls([{ type: 'appdata', length: reqLen + 17, what: T('GET / HTTP/1.1（整段 HTTP 请求）', 'GET / HTTP/1.1 (the whole HTTP request)') }]),
          }),
          tcp('web', 'PA', {
            time: 0.074, color: 'rose', label: '200 OK', proto: 'TLSv1.3', info: 'Application Data', extra: lock,
            app: tls([{ type: 'appdata', length: resLen + 17, what: T('HTTP/1.1 200 OK + HTML 正文', 'HTTP/1.1 200 OK + the HTML body') }]),
          }),
          { type: 'screen', node: 'client', state: 'page' },
        ],
      },
    ],
    outro: {
      title: T('安全送达', 'Delivered securely'),
      text: T(
        '比明文 HTTP 只多了 1 个往返，换来的是：内容保密、无法篡改、确认对方身份。这就是为什么今天几乎所有网站都默认使用 HTTPS。',
        'One extra round trip over plain HTTP buys confidentiality, integrity and a verified server identity. That is why almost every site now uses HTTPS by default.',
      ),
      facts: [
        [T('数据包', 'Packets'), '8'],
        [T('额外开销', 'Extra cost'), '1 RTT'],
        [T('总耗时', 'Total time'), '0.074 s'],
      ],
    },
  };
}

// ───────────────────────── ICMP ─────────────────────────

function icmpLesson() {
  const echo = (from, to, type, seq, time, ttl) => {
    const wire = { ip: { src: IP[from], dst: IP[to], ...(ttl ? { ttl } : {}) }, l4: 'icmp', icmp: { type, code: 0, id: 1, seq } };
    const name = type === 8 ? 'request' : 'reply';
    return pk(from, to, type === 8 ? 'rose' : 'violet', type === 8 ? T(`请求 #${seq}`, `REQUEST #${seq}`) : T(`应答 #${seq}`, `REPLY #${seq}`), 'ICMP', time,
      `Echo (ping) ${name}  id=0x0001, seq=${seq}/${seq << 8}, ttl=${ttl ?? (from === 'client' ? 128 : 52)}`, wire);
  };
  const probe = { ip: { src: IP.client, dst: IP.web, ttl: 1 }, l4: 'icmp', icmp: { type: 8, code: 0, id: 1, seq: 3 } };
  return {
    id: 'icmp',
    name: 'ICMP',
    full: T('互联网控制报文协议', 'Internet Control Message Protocol'),
    title: T('ping 与 traceroute', 'ping and traceroute'),
    layer: 3,
    cat: 'core',
    nodes: ['client', 'router', 'internet', 'web'],
    legend: [
      ['rose', T('回显请求', 'Echo request')],
      ['violet', T('回显应答', 'Echo reply')],
      ['orange', T('超时', 'Time exceeded')],
    ],
    overview: {
      desc: T(
        'ICMP 是 IP 的「报错与诊断」通道。ping 用它的回显请求/应答测试连通性和往返时间；traceroute 则故意把 TTL 设小，利用沿途路由器回的「超时」消息画出路径。',
        'ICMP is IP’s error and diagnostics channel. ping uses echo request/reply to test reachability and round-trip time; traceroute deliberately sends small TTLs and maps the path from the “time exceeded” messages routers send back.',
      ),
      facts: [
        [T('所在层', 'Layer'), T('网络层（第 3 层）', 'Network (3)')],
        [T('端口', 'Ports'), T('没有（IP 协议号 1）', 'None (IP protocol 1)')],
        [T('常见类型', 'Common types'), T('0 应答 · 8 请求 · 11 超时 · 3 不可达', '0 reply · 8 request · 11 time exceeded · 3 unreachable')],
        [T('工具', 'Tools'), 'ping · traceroute / tracert'],
        [T('规范', 'Spec'), 'RFC 792'],
      ],
    },
    start: { nodes: ['client', 'router', 'internet', 'web'], frame: ['client', 'router', 'internet', 'web'] },
    steps: [
      {
        title: T('第一次 ping', 'First ping'),
        desc: T('回显请求 → 回显应答', 'Echo request → echo reply'),
        detail: T(
          'ping www.example.com 会发出 ICMP 类型 8（回显请求），里面带 32 字节填充数据。服务器把它原样装进类型 0（回显应答）送回来。一来一回花的时间就是往返时间（RTT）。',
          'ping www.example.com sends ICMP type 8 (echo request) with 32 bytes of padding. The server copies it into a type 0 (echo reply) and sends it back. The time between them is the round-trip time (RTT).',
        ),
        facts: [
          [T('类型', 'Type'), T('8 请求 → 0 应答', '8 request → 0 reply')],
          [T('数据', 'Data'), T('32 字节', '32 bytes')],
          ['RTT', '18 ms'],
        ],
        events: [echo('client', 'web', 8, 1, 0), echo('web', 'client', 0, 1, 0.018)],
      },
      {
        title: T('再 ping 一次', 'Ping again'),
        desc: T('序号加一，统计结果', 'Next sequence number, then stats'),
        detail: T(
          'ping 每秒发一个，序号逐个递增，靠序号把应答和请求配对。最后汇总：发送 2、接收 2、丢包 0%、平均 18 ms。返回包的 TTL 是 52，说明它大约经过了 12 跳（Linux 服务器初始 TTL 是 64）。',
          'ping sends one request per second with an increasing sequence number to match replies. Summary: 2 sent, 2 received, 0% loss, 18 ms average. The reply arrives with TTL 52, so it crossed about 12 hops (Linux starts at 64).',
        ),
        facts: [
          [T('发送 / 接收', 'Sent / received'), '2 / 2'],
          [T('丢包', 'Loss'), '0%'],
          [T('应答 TTL', 'Reply TTL'), T('52（约 12 跳）', '52 (about 12 hops)')],
        ],
        events: [echo('client', 'web', 8, 2, 1.002), echo('web', 'client', 0, 2, 1.020), note('client', T('2 发 2 收 · 丢包 0% · 平均 18 ms', '2 sent · 2 received · 0% loss · 18 ms'), { tone: 'ok' })],
      },
      {
        title: T('TTL 用尽', 'TTL runs out'),
        desc: T('traceroute 的原理', 'How traceroute works'),
        detail: T(
          '每经过一个路由器，TTL 减 1；减到 0 时路由器丢掉这个包，并回一条 ICMP 类型 11（超时），里面附着原包的头部。traceroute 依次发 TTL=1、2、3… 的包，就能逐跳找出路径上的每台路由器。这里 TTL=1，所以第一跳——家用路由器——就回话了。',
          'Each router decrements the TTL; when it hits 0 the router drops the packet and returns ICMP type 11 (time exceeded) quoting the original header. traceroute sends TTL=1, 2, 3… and learns every router along the path. With TTL=1, the first hop — the home router — answers.',
        ),
        facts: [
          [T('探测包 TTL', 'Probe TTL'), '1'],
          [T('回复者', 'Answered by'), `${IP.router}`],
          [T('ICMP 类型', 'ICMP type'), T('11 超时', '11 time exceeded')],
        ],
        events: [
          camera(['client', 'router']),
          pk('client', 'router', 'rose', 'TTL=1', 'ICMP', 3.1, 'Echo (ping) request  id=0x0001, seq=3/768, ttl=1', probe),
          pk('router', 'client', 'orange', T('超时', 'TIME EXCEEDED'), 'ICMP', 3.102, 'Time-to-live exceeded (Time to live exceeded in transit)', {
            ip: { src: IP.router, dst: IP.client }, l4: 'icmp', icmp: { type: 11, code: 0, quote: probe },
          }),
          note('router', T('第 1 跳：192.168.1.1', 'Hop 1: 192.168.1.1')),
        ],
      },
    ],
    outro: {
      title: T('诊断完成', 'Diagnosis done'),
      text: T(
        'ICMP 没有端口，直接跑在 IP 上，所以防火墙往往整体放行或拦截它。ping 不通不一定是网络断了——也可能只是对方不回 ICMP。',
        'ICMP has no ports and rides directly on IP, so firewalls tend to allow or block it wholesale. A failed ping doesn’t always mean the network is down — the host may simply not answer ICMP.',
      ),
      facts: [
        [T('数据包', 'Packets'), '6'],
        [T('平均 RTT', 'Average RTT'), '18 ms'],
        [T('第一跳', 'First hop'), IP.router],
      ],
    },
  };
}

export const LESSONS = [httpLesson(), dnsLesson(), tcpLesson(), dhcpLesson(), httpsLesson(), icmpLesson()];
export const lessonById = (id) => LESSONS.find((l) => l.id === id) ?? LESSONS[0];
