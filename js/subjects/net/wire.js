// 按字节真实编码一帧：Ethernet II → IPv4 → TCP/UDP/ICMP → DNS/DHCP/TLS/HTTP。
// 每个字段记录 [start, end) 字节范围，供解析面板高亮十六进制。
// 长度、校验和都是算出来的，所以表格里的「长度」就是这一帧的真实字节数。
import { F, T } from '../../core/i18n.js';
import { IP } from './topology.js';

const enc = new TextEncoder();
export const byteLen = (s) => enc.encode(s).length;
const ip4 = (s) => s.split('.').map(Number);
const macBytes = (s) => s.split(':').map((h) => parseInt(h, 16));
const hex = (v, n) => '0x' + (v >>> 0).toString(16).padStart(n, '0');
const hexPreview = (arr, n = 8) =>
  arr.slice(0, n).map((b) => b.toString(16).padStart(2, '0')).join('') + (arr.length > n ? '…' : '');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randBytes = (r, n) => Array.from({ length: n }, () => (r() * 256) | 0);
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function checksum(bytes) {
  let s = 0;
  for (let i = 0; i < bytes.length; i += 2) s += (bytes[i] << 8) + (bytes[i + 1] ?? 0);
  while (s >> 16) s = (s & 0xffff) + (s >> 16);
  return ~s & 0xffff;
}

class Buf {
  constructor() {
    this.b = [];
    this.f = [];
  }
  get len() {
    return this.b.length;
  }
  u8(v) {
    this.b.push(v & 255);
  }
  u16(v) {
    this.b.push((v >> 8) & 255, v & 255);
  }
  u24(v) {
    this.b.push((v >> 16) & 255, (v >> 8) & 255, v & 255);
  }
  u32(v) {
    this.b.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  }
  raw(a) {
    for (const x of a) this.b.push(x & 255);
  }
  str(s) {
    this.raw(enc.encode(s));
  }
  zeros(n) {
    for (let i = 0; i < n; i++) this.b.push(0);
  }
  put(o, v, n) {
    for (let i = n - 1; i >= 0; i--) {
      this.b[o + i] = v & 255;
      v >>>= 8;
    }
  }
  field(label, value, fn, extra) {
    const start = this.len;
    fn?.();
    const f = { label, value, start, end: this.len, ...extra };
    this.f.push(f);
    return f;
  }
  group(label, value, fn) {
    const start = this.len;
    const parent = this.f;
    const kids = [];
    this.f = kids;
    fn();
    this.f = parent;
    const g = { label, value, start, end: this.len, children: kids };
    parent.push(g);
    return g;
  }
  /** 只做说明、不占字节的条目（比如加密内容「解密后」是什么） */
  note(label, value) {
    this.f.push({ label, value, start: this.len, end: this.len, note: true });
  }
  /** n 字节长度前缀：先写占位，fn 写完内容后回填真实长度 */
  lenPrefix(label, n, fn) {
    const o = this.len;
    const f = this.field(label, '', () => this.zeros(n));
    fn();
    const v = this.len - o - n;
    this.put(o, v, n);
    f.value = String(v);
    return v;
  }
}

// ───────────────────────── 应用层 ─────────────────────────

const DNS_TYPES = { A: 1, NS: 2, CNAME: 5, MX: 15, AAAA: 28 };

function dnsName(w, name, qname) {
  if (name === qname) {
    w.field(F('Name', '名称'), `${name} (→ 0x000c)`, () => w.u16(0xc00c));
    return;
  }
  w.field(F('Name', '名称'), name, () => {
    for (const label of name.split('.').filter(Boolean)) {
      w.u8(label.length);
      w.str(label);
    }
    w.u8(0);
  });
}

function dnsRR(w, rr, qname, kind) {
  const [name, type, ttl, data] = rr;
  const desc = type === 'A' ? `addr ${data}` : `ns ${data}`;
  w.group(F(`${name}: type ${type}, class IN, ${desc}`, `${name}：${type} 记录，${desc}`), '', () => {
    dnsName(w, name, qname);
    w.field(F('Type', '类型'), `${type} (${DNS_TYPES[type]})`, () => w.u16(DNS_TYPES[type]));
    w.field(F('Class', '类'), 'IN (0x0001)', () => w.u16(1));
    w.field(F('Time to live', '生存时间 TTL'), `${ttl} s`, () => w.u32(ttl));
    w.lenPrefix(F('Data length', '数据长度'), 2, () => {
      if (type === 'A') w.field(F('Address', '地址'), data, () => w.raw(ip4(data)));
      else
        w.field(F('Name Server', '名字服务器'), data, () => {
          for (const label of data.split('.').filter(Boolean)) {
            w.u8(label.length);
            w.str(label);
          }
          w.u8(0);
        });
    });
  });
  return kind;
}

function buildDns(a) {
  const w = new Buf();
  const qr = a.qr ? 1 : 0;
  const flags = (qr << 15) | ((a.aa ? 1 : 0) << 10) | ((a.rd ? 1 : 0) << 8) | ((a.ra ? 1 : 0) << 7);
  const [qname, qtype] = a.q;
  const an = a.an ?? [];
  const ns = a.ns ?? [];
  const ar = a.ar ?? [];
  w.field(F('Transaction ID', '事务 ID'), hex(a.id, 4), () => w.u16(a.id));
  const fo = w.len;
  const bits = [
    [F('Response', '响应'), qr ? 'Message is a response (1)' : 'Message is a query (0)'],
    [F('Authoritative', '权威应答 AA'), a.qr ? (a.aa ? 'Yes (1)' : 'No (0)') : '—'],
    [F('Recursion desired', '期望递归 RD'), a.rd ? 'Yes (1)' : 'No (0)'],
    [F('Recursion available', '可用递归 RA'), a.qr ? (a.ra ? 'Yes (1)' : 'No (0)') : '—'],
    [F('Reply code', '响应码'), a.qr ? 'No error (0)' : '—'],
  ];
  w.group(F('Flags', '标志'), hex(flags, 4), () => {
    w.u16(flags);
    for (const [label, value] of bits) w.f.push({ label, value, start: fo, end: fo + 2 });
  });
  w.field(F('Questions', '问题数'), String(1), () => w.u16(1));
  w.field(F('Answer RRs', '回答记录数'), String(an.length), () => w.u16(an.length));
  w.field(F('Authority RRs', '权威记录数'), String(ns.length), () => w.u16(ns.length));
  w.field(F('Additional RRs', '附加记录数'), String(ar.length), () => w.u16(ar.length));
  w.group(F('Queries', '问题'), '', () => {
    w.group(F(`${qname}: type ${qtype}, class IN`, `${qname}：${qtype} 记录`), '', () => {
      w.field(F('Name', '名称'), qname, () => {
        for (const label of qname.split('.')) {
          w.u8(label.length);
          w.str(label);
        }
        w.u8(0);
      });
      w.field(F('Type', '类型'), `${qtype} (${DNS_TYPES[qtype]})`, () => w.u16(DNS_TYPES[qtype]));
      w.field(F('Class', '类'), 'IN (0x0001)', () => w.u16(1));
    });
  });
  if (an.length) w.group(F('Answers', '回答'), '', () => an.forEach((rr) => dnsRR(w, rr, qname)));
  if (ns.length) w.group(F('Authoritative nameservers', '权威名字服务器'), '', () => ns.forEach((rr) => dnsRR(w, rr, qname)));
  if (ar.length) w.group(F('Additional records', '附加记录'), '', () => ar.forEach((rr) => dnsRR(w, rr, qname)));
  return {
    name: F(`Domain Name System (${a.qr ? 'response' : 'query'})`, `DNS 域名系统（${a.qr ? '响应' : '查询'}）`),
    summary: `${a.qr ? 'Standard query response' : 'Standard query'} ${hex(a.id, 4)} ${qtype} ${qname}`,
    buf: w,
  };
}

const DHCP_MSG = { discover: 1, offer: 2, request: 3, ack: 5 };
const DHCP_NAME = { 1: 'Discover', 2: 'Offer', 3: 'Request', 5: 'ACK' };

function buildDhcp(a) {
  const w = new Buf();
  const msg = DHCP_MSG[a.msg];
  const reply = msg === 2 || msg === 5;
  w.field(F('Message type', '报文类型'), reply ? 'Boot Reply (2)' : 'Boot Request (1)', () => w.u8(reply ? 2 : 1));
  w.field(F('Hardware type', '硬件类型'), 'Ethernet (0x01)', () => w.u8(1));
  w.field(F('Hardware address length', '硬件地址长度'), '6', () => w.u8(6));
  w.field(F('Hops', '跳数'), '0', () => w.u8(0));
  w.field(F('Transaction ID', '事务 ID'), hex(a.xid, 8), () => w.u32(a.xid));
  w.field(F('Seconds elapsed', '已用秒数'), '0', () => w.u16(0));
  w.field(F('Bootp flags', '标志'), '0x8000 (Broadcast)', () => w.u16(0x8000));
  w.field(F('Client IP address', '客户端 IP'), a.ciaddr ?? IP.zero, () => w.raw(ip4(a.ciaddr ?? IP.zero)));
  w.field(F('Your (client) IP address', '分配给你的 IP'), a.yiaddr ?? IP.zero, () => w.raw(ip4(a.yiaddr ?? IP.zero)));
  w.field(F('Next server IP address', '下一服务器 IP'), IP.zero, () => w.raw([0, 0, 0, 0]));
  w.field(F('Relay agent IP address', '中继代理 IP'), IP.zero, () => w.raw([0, 0, 0, 0]));
  w.field(F('Client MAC address', '客户端 MAC'), a.chaddr, () => w.raw(macBytes(a.chaddr)));
  w.field(F('Client hardware address padding', '硬件地址填充'), '00…00 (10 bytes)', () => w.zeros(10));
  w.field(F('Server host name', '服务器主机名'), F('not given (64 zero bytes)', '未提供（64 个 0 字节）'), () => w.zeros(64));
  w.field(F('Boot file name', '启动文件名'), F('not given (128 zero bytes)', '未提供（128 个 0 字节）'), () => w.zeros(128));
  w.field(F('Magic cookie', '魔数'), 'DHCP (0x63825363)', () => w.u32(0x63825363));

  const opt = (code, name, value, writer) =>
    w.group(F(`Option: (${code}) ${name}`, `选项 (${code}) ${name}`), value, () => {
      w.field(F('Option', '选项代码'), String(code), () => w.u8(code));
      w.lenPrefix(F('Length', '长度'), 1, writer);
    });
  opt(53, 'DHCP Message Type', DHCP_NAME[msg], () => w.field(F('DHCP', 'DHCP'), `${DHCP_NAME[msg]} (${msg})`, () => w.u8(msg)));
  if (!reply)
    opt(61, 'Client identifier', a.chaddr, () => {
      w.field(F('Hardware type', '硬件类型'), 'Ethernet (0x01)', () => w.u8(1));
      w.field(F('Client MAC address', '客户端 MAC'), a.chaddr, () => w.raw(macBytes(a.chaddr)));
    });
  if (a.requested) opt(50, 'Requested IP Address', a.requested, () => w.field(F('Requested IP', '请求的 IP'), a.requested, () => w.raw(ip4(a.requested))));
  if (a.server) opt(54, 'DHCP Server Identifier', a.server, () => w.field(F('Server', '服务器'), a.server, () => w.raw(ip4(a.server))));
  if (a.lease) opt(51, 'IP Address Lease Time', `${a.lease / 3600} h`, () => w.field(F('Lease time', '租期'), `${a.lease} s`, () => w.u32(a.lease)));
  if (a.mask) opt(1, 'Subnet Mask', a.mask, () => w.field(F('Subnet mask', '子网掩码'), a.mask, () => w.raw(ip4(a.mask))));
  if (a.gateway) opt(3, 'Router', a.gateway, () => w.field(F('Router', '网关'), a.gateway, () => w.raw(ip4(a.gateway))));
  if (a.dnsServer) opt(6, 'Domain Name Server', a.dnsServer, () => w.field(F('DNS server', 'DNS 服务器'), a.dnsServer, () => w.raw(ip4(a.dnsServer))));
  if (a.hostname) opt(12, 'Host Name', a.hostname, () => w.field(F('Host name', '主机名'), a.hostname, () => w.str(a.hostname)));
  if (!reply)
    opt(55, 'Parameter Request List', '1, 3, 6, 15, 119, 252', () =>
      w.field(F('Requested options', '想要的选项'), 'Subnet Mask, Router, DNS, Domain Name, Search List, WPAD', () => w.raw([1, 3, 6, 15, 119, 252])),
    );
  w.field(F('Option: (255) End', '选项 (255) 结束'), '', () => w.u8(255));
  return {
    name: F(`Dynamic Host Configuration Protocol (${DHCP_NAME[msg]})`, `DHCP 动态主机配置协议（${DHCP_NAME[msg]}）`),
    summary: `DHCP ${DHCP_NAME[msg]} - Transaction ID ${hex(a.xid, 8)}`,
    buf: w,
  };
}

function buildHttp(a) {
  const w = new Buf();
  a.lines.forEach((ln, i) => {
    if (ln === '') w.field(F('End of headers', '首部结束（空行）'), '\\r\\n', () => w.str('\r\n'));
    else {
      const label = i === 0 ? (ln.startsWith('HTTP/') ? F('Status line', '状态行') : F('Request line', '请求行')) : F('Header', '首部');
      w.field(label, ln, () => w.str(ln + '\r\n'));
    }
  });
  if (a.body) w.field(F('Body (text/html)', '正文（text/html）'), F(`${byteLen(a.body)} bytes`, `${byteLen(a.body)} 字节`), () => w.str(a.body));
  return { name: F('Hypertext Transfer Protocol', 'HTTP 超文本传输协议'), summary: a.lines[0], buf: w };
}

function buildText(a) {
  const w = new Buf();
  w.field(F('Data', '数据'), JSON.stringify(a.text), () => w.str(a.text));
  return { name: F('Data', '应用数据'), summary: `${byteLen(a.text)} bytes`, buf: w };
}

const CIPHERS = [
  [0x1301, 'TLS_AES_128_GCM_SHA256'],
  [0x1302, 'TLS_AES_256_GCM_SHA384'],
  [0x1303, 'TLS_CHACHA20_POLY1305_SHA256'],
  [0xc02b, 'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256'],
  [0xc02f, 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256'],
];

function tlsRecord(w, type, version, title, fn) {
  const names = { 22: 'Handshake (22)', 20: 'Change Cipher Spec (20)', 23: 'Application Data (23)' };
  w.group(title, '', () => {
    w.field(F('Content Type', '内容类型'), names[type], () => w.u8(type));
    w.field(F('Version', '版本'), version === 0x0301 ? 'TLS 1.0 (0x0301)' : 'TLS 1.2 (0x0303)', () => w.u16(version));
    w.lenPrefix(F('Length', '长度'), 2, fn);
  });
}

function ext(w, code, name, fn) {
  w.group(F(`Extension: ${name}`, `扩展：${name}`), '', () => {
    w.field(F('Type', '类型'), `${name} (${code})`, () => w.u16(code));
    w.lenPrefix(F('Length', '长度'), 2, fn);
  });
}

function buildTls(a, r) {
  const w = new Buf();
  for (const rec of a.records) {
    if (rec.type === 'client_hello') {
      tlsRecord(w, 22, 0x0301, F('TLS Record: Handshake — Client Hello', 'TLS 记录：握手 — Client Hello'), () => {
        w.field(F('Handshake Type', '握手类型'), 'Client Hello (1)', () => w.u8(1));
        w.lenPrefix(F('Handshake Length', '握手长度'), 3, () => {
          w.field(F('Legacy version', '兼容版本号'), 'TLS 1.2 (0x0303)', () => w.u16(0x0303));
          const rnd = randBytes(r, 32);
          w.field(F('Random', '随机数'), hexPreview(rnd), () => w.raw(rnd));
          const sid = randBytes(r, 32);
          w.field(F('Session ID Length', '会话 ID 长度'), '32', () => w.u8(32));
          w.field(F('Session ID', '会话 ID'), hexPreview(sid), () => w.raw(sid));
          w.lenPrefix(F('Cipher Suites Length', '加密套件长度'), 2, () => {
            for (const [code, name] of CIPHERS) w.field(F('Cipher Suite', '加密套件'), `${name} (${hex(code, 4)})`, () => w.u16(code));
          });
          w.field(F('Compression Methods', '压缩方法'), 'null (1 method)', () => w.raw([1, 0]));
          w.lenPrefix(F('Extensions Length', '扩展总长度'), 2, () => {
            ext(w, 0, 'server_name', () => {
              w.lenPrefix(F('Server Name list length', '名称列表长度'), 2, () => {
                w.field(F('Server Name Type', '名称类型'), 'host_name (0)', () => w.u8(0));
                w.lenPrefix(F('Server Name length', '名称长度'), 2, () => w.field(F('Server Name (SNI, plaintext)', '服务器名 SNI（明文！）'), rec.sni, () => w.str(rec.sni)));
              });
            });
            ext(w, 10, 'supported_groups', () => {
              w.lenPrefix(F('List length', '列表长度'), 2, () => {
                w.field(F('Group', '曲线'), 'x25519 (0x001d)', () => w.u16(0x001d));
                w.field(F('Group', '曲线'), 'secp256r1 (0x0017)', () => w.u16(0x0017));
              });
            });
            ext(w, 13, 'signature_algorithms', () => {
              w.lenPrefix(F('List length', '列表长度'), 2, () => {
                w.field(F('Algorithm', '签名算法'), 'ecdsa_secp256r1_sha256 (0x0403)', () => w.u16(0x0403));
                w.field(F('Algorithm', '签名算法'), 'rsa_pss_rsae_sha256 (0x0804)', () => w.u16(0x0804));
                w.field(F('Algorithm', '签名算法'), 'rsa_pkcs1_sha256 (0x0401)', () => w.u16(0x0401));
              });
            });
            ext(w, 43, 'supported_versions', () => {
              w.lenPrefix(F('List length', '列表长度'), 1, () => {
                w.field(F('Version', '版本'), 'TLS 1.3 (0x0304)', () => w.u16(0x0304));
                w.field(F('Version', '版本'), 'TLS 1.2 (0x0303)', () => w.u16(0x0303));
              });
            });
            ext(w, 51, 'key_share', () => {
              w.lenPrefix(F('Client Key Share Length', '密钥共享长度'), 2, () => {
                w.field(F('Group', '曲线'), 'x25519 (0x001d)', () => w.u16(0x001d));
                const key = randBytes(r, 32);
                w.lenPrefix(F('Key Exchange Length', '公钥长度'), 2, () => w.field(F('Key Exchange (public key)', '公钥'), hexPreview(key), () => w.raw(key)));
              });
            });
            ext(w, 16, 'application_layer_protocol_negotiation', () => {
              w.lenPrefix(F('ALPN Extension Length', 'ALPN 长度'), 2, () => {
                for (const p of ['h2', 'http/1.1'])
                  w.lenPrefix(F(`ALPN string length`, 'ALPN 字符串长度'), 1, () => w.field(F('ALPN Next Protocol', '应用层协议'), p, () => w.str(p)));
              });
            });
          });
        });
      });
    } else if (rec.type === 'server_hello') {
      tlsRecord(w, 22, 0x0303, F('TLS Record: Handshake — Server Hello', 'TLS 记录：握手 — Server Hello'), () => {
        w.field(F('Handshake Type', '握手类型'), 'Server Hello (2)', () => w.u8(2));
        w.lenPrefix(F('Handshake Length', '握手长度'), 3, () => {
          w.field(F('Legacy version', '兼容版本号'), 'TLS 1.2 (0x0303)', () => w.u16(0x0303));
          const rnd = randBytes(r, 32);
          w.field(F('Random', '随机数'), hexPreview(rnd), () => w.raw(rnd));
          const sid = randBytes(r, 32);
          w.field(F('Session ID Length', '会话 ID 长度'), '32', () => w.u8(32));
          w.field(F('Session ID (echoed)', '会话 ID（原样回显）'), hexPreview(sid), () => w.raw(sid));
          w.field(F('Cipher Suite (chosen)', '选定的加密套件'), 'TLS_AES_128_GCM_SHA256 (0x1301)', () => w.u16(0x1301));
          w.field(F('Compression Method', '压缩方法'), 'null (0)', () => w.u8(0));
          w.lenPrefix(F('Extensions Length', '扩展总长度'), 2, () => {
            ext(w, 43, 'supported_versions', () => w.field(F('Selected Version', '选定版本'), 'TLS 1.3 (0x0304)', () => w.u16(0x0304)));
            ext(w, 51, 'key_share', () => {
              w.field(F('Group', '曲线'), 'x25519 (0x001d)', () => w.u16(0x001d));
              const key = randBytes(r, 32);
              w.lenPrefix(F('Key Exchange Length', '公钥长度'), 2, () => w.field(F('Key Exchange (public key)', '公钥'), hexPreview(key), () => w.raw(key)));
            });
          });
        });
      });
    } else if (rec.type === 'ccs') {
      tlsRecord(w, 20, 0x0303, F('TLS Record: Change Cipher Spec', 'TLS 记录：Change Cipher Spec'), () =>
        w.field(F('Change Cipher Spec Message', '兼容用消息'), '1', () => w.u8(1)),
      );
    } else if (rec.type === 'appdata') {
      tlsRecord(w, 23, 0x0303, F('TLS Record: Application Data', 'TLS 记录：应用数据（已加密）'), () => {
        const data = randBytes(r, rec.length);
        w.field(F('Encrypted Application Data', '加密数据'), hexPreview(data, 10), () => w.raw(data));
        w.note(F('Decrypted (for learning)', '解密后是什么（教学用）'), rec.what);
      });
    }
  }
  return { name: F('Transport Layer Security', 'TLS 传输层安全'), summary: a.records.map((x) => x.type).join(', '), buf: w };
}

function buildApp(app, seed) {
  switch (app.kind) {
    case 'dns':
      return buildDns(app);
    case 'dhcp':
      return buildDhcp(app);
    case 'http':
      return buildHttp(app);
    case 'tls':
      return buildTls(app, rng(seed));
    case 'text':
      return buildText(app);
    default:
      return null;
  }
}

/** 应用层负载的字节数（课程里算 TCP 序号要用） */
export const appLength = (app, seed = 7) => buildApp(app, seed)?.buf.len ?? 0;

// ───────────────────────── 传输层 / 网络层 / 链路层 ─────────────────────────

const pseudo = (ip, proto, len) => [...ip4(ip.src), ...ip4(ip.dst), 0, proto, (len >> 8) & 255, len & 255];

function udpLayer(u, ip, payload) {
  const w = new Buf();
  const len = 8 + payload.length;
  w.field(F('Source Port', '源端口'), String(u.sport), () => w.u16(u.sport));
  w.field(F('Destination Port', '目的端口'), String(u.dport), () => w.u16(u.dport));
  w.field(F('Length', '长度'), String(len), () => w.u16(len));
  const ck = w.field(F('Checksum', '校验和'), '', () => w.u16(0));
  const sum = checksum([...pseudo(ip, 17, len), ...w.b, ...payload]) || 0xffff;
  w.put(6, sum, 2);
  ck.value = hex(sum, 4);
  return { name: F('User Datagram Protocol', 'UDP 用户数据报协议'), summary: `Src Port: ${u.sport}, Dst Port: ${u.dport}`, buf: w, proto: 17 };
}

const FLAG_BITS = [
  ['F', 0x01, 'FIN'],
  ['S', 0x02, 'SYN'],
  ['R', 0x04, 'RST'],
  ['P', 0x08, 'PSH'],
  ['A', 0x10, 'ACK'],
];
export const flagNames = (flags) => FLAG_BITS.filter(([c]) => flags.includes(c)).map(([, , n]) => n).join(', ');

function tcpLayer(tc, ip, payload) {
  const w = new Buf();
  const bits = FLAG_BITS.reduce((s, [c, b]) => (tc.flags.includes(c) ? s | b : s), 0);
  w.field(F('Source Port', '源端口'), String(tc.sport), () => w.u16(tc.sport));
  w.field(F('Destination Port', '目的端口'), String(tc.dport), () => w.u16(tc.dport));
  w.field(F('Sequence Number (raw)', '序列号（原始值）'), `${tc.seq >>> 0}`, () => w.u32(tc.seq));
  w.field(F('Acknowledgment Number (raw)', '确认号（原始值）'), tc.flags.includes('A') ? `${tc.ack >>> 0}` : '0', () => w.u32(tc.flags.includes('A') ? tc.ack : 0));
  const o = w.len;
  w.group(F('Header Length & Flags', '首部长度与标志'), hex((5 << 12) | bits, 4), () => {
    w.u16((5 << 12) | bits);
    w.f.push({ label: F('Header Length', '首部长度'), value: '20 bytes (5)', start: o, end: o + 1 });
    for (const [c, , n] of FLAG_BITS) w.f.push({ label: F(n, n), value: tc.flags.includes(c) ? 'Set (1)' : 'Not set (0)', start: o + 1, end: o + 2, dim: !tc.flags.includes(c) });
  });
  const win = tc.win ?? 64240;
  w.field(F('Window', '窗口大小'), String(win), () => w.u16(win));
  const ck = w.field(F('Checksum', '校验和'), '', () => w.u16(0));
  w.field(F('Urgent Pointer', '紧急指针'), '0', () => w.u16(0));
  const sum = checksum([...pseudo(ip, 6, 20 + payload.length), ...w.b, ...payload]);
  w.put(16, sum, 2);
  ck.value = hex(sum, 4);
  return {
    name: F('Transmission Control Protocol', 'TCP 传输控制协议'),
    summary: `Src Port: ${tc.sport}, Dst Port: ${tc.dport}, [${flagNames(tc.flags)}], Len: ${payload.length}`,
    buf: w,
    proto: 6,
  };
}

const ICMP_NAMES = { 0: 'Echo (ping) reply', 8: 'Echo (ping) request', 11: 'Time-to-live exceeded' };
const PING_DATA = 'abcdefghijklmnopqrstuvwabcdefghi';

function icmpLayer(ic) {
  const w = new Buf();
  w.field(F('Type', '类型'), `${ic.type} (${ICMP_NAMES[ic.type]})`, () => w.u8(ic.type));
  w.field(F('Code', '代码'), String(ic.code ?? 0), () => w.u8(ic.code ?? 0));
  const ck = w.field(F('Checksum', '校验和'), '', () => w.u16(0));
  if (ic.type === 0 || ic.type === 8) {
    w.field(F('Identifier', '标识符'), hex(ic.id, 4), () => w.u16(ic.id));
    w.field(F('Sequence Number', '序号'), String(ic.seq), () => w.u16(ic.seq));
    w.field(F('Data', '填充数据'), `${PING_DATA.length} bytes "${PING_DATA}"`, () => w.str(PING_DATA));
  } else if (ic.type === 11) {
    w.field(F('Unused', '未使用'), '0', () => w.u32(0));
    const inner = buildIpPacket(ic.quote);
    const quoted = inner.slice(0, 28);
    w.field(F('Original IP header + first 8 bytes', '原数据包的 IP 首部 + 前 8 字节'), `TTL=1 → ${ic.quote.ip.dst}`, () => w.raw(quoted));
  }
  const sum = checksum(w.b);
  w.put(2, sum, 2);
  ck.value = hex(sum, 4);
  return { name: F('Internet Control Message Protocol', 'ICMP 控制报文协议'), summary: `Type ${ic.type} (${ICMP_NAMES[ic.type]})`, buf: w, proto: 1 };
}

function ipLayer(ip, proto, payloadLen, seed) {
  const w = new Buf();
  const total = 20 + payloadLen;
  const id = ip.id ?? (rng(seed)() * 65535) | 0;
  const df = proto === 6;
  const names = { 1: 'ICMP (1)', 6: 'TCP (6)', 17: 'UDP (17)' };
  w.field(F('Version / Header Length', '版本 / 首部长度'), '4 / 20 bytes', () => w.u8(0x45));
  w.field(F('Differentiated Services', '区分服务'), '0x00', () => w.u8(0));
  w.field(F('Total Length', '总长度'), String(total), () => w.u16(total));
  w.field(F('Identification', '标识'), hex(id, 4), () => w.u16(id));
  w.field(F('Flags / Fragment Offset', '标志 / 分片偏移'), df ? "0x4000 (Don't fragment)" : '0x0000', () => w.u16(df ? 0x4000 : 0));
  w.field(F('Time to Live', '生存时间 TTL'), String(ip.ttl), () => w.u8(ip.ttl));
  w.field(F('Protocol', '上层协议'), names[proto], () => w.u8(proto));
  const ck = w.field(F('Header Checksum', '首部校验和'), '', () => w.u16(0));
  w.field(F('Source Address', '源地址'), ip.src, () => w.raw(ip4(ip.src)));
  w.field(F('Destination Address', '目的地址'), ip.dst, () => w.raw(ip4(ip.dst)));
  const sum = checksum(w.b);
  w.put(10, sum, 2);
  ck.value = hex(sum, 4);
  return { name: F('Internet Protocol Version 4', 'IPv4 网际协议'), summary: `Src: ${ip.src}, Dst: ${ip.dst}`, buf: w };
}

/** 只要 IP 包本身（ICMP 超时报文要引用原包时用） */
function buildIpPacket(wire) {
  const seed = hashStr(JSON.stringify(wire));
  const ip = { ttl: 64, ...wire.ip };
  const app = wire.app ? buildApp(wire.app, seed) : null;
  const payload = app ? app.buf.b : [];
  const l4 = wire.l4 === 'tcp' ? tcpLayer(wire.tcp, ip, payload) : wire.l4 === 'udp' ? udpLayer(wire.udp, ip, payload) : icmpLayer(wire.icmp, ip);
  const ipl = ipLayer(ip, l4.proto, l4.buf.len + payload.length, seed);
  return [...ipl.buf.b, ...l4.buf.b, ...payload];
}

export const MAC = {
  client: '3c:22:fb:1a:7e:01',
  router: 'f4:6b:8c:20:11:fe',
  dns: '0a:58:a9:fe:01:35',
  dnsgw: '0a:58:a9:fe:00:01',
  bcast: 'ff:ff:ff:ff:ff:ff',
};

function linkFor(pkt) {
  const bcast = pkt.wire.ip.dst === IP.bcast;
  if (pkt.from === 'client') return { src: MAC.client, dst: bcast ? MAC.bcast : MAC.router, at: 'client' };
  if (pkt.to === 'client') return { src: MAC.router, dst: bcast ? MAC.bcast : MAC.client, at: 'client' };
  if (pkt.from === 'dns') return { src: MAC.dns, dst: MAC.dnsgw, at: 'dns' };
  return { src: MAC.dnsgw, dst: MAC.dns, at: 'dns' };
}

const DEFAULT_TTL = { client: 128, router: 64, dns: 64 };
const ARRIVAL_TTL = { web: 52, dns: 57, root: 55, tld: 56, auth: 54 };

function ethLayer(link) {
  const w = new Buf();
  w.field(F('Destination', '目的 MAC'), link.dst === MAC.bcast ? `${link.dst} (Broadcast)` : link.dst, () => w.raw(macBytes(link.dst)));
  w.field(F('Source', '源 MAC'), link.src, () => w.raw(macBytes(link.src)));
  w.field(F('Type', '类型'), 'IPv4 (0x0800)', () => w.u16(0x0800));
  return { name: F('Ethernet II', '以太网 II'), summary: `Src: ${link.src}, Dst: ${link.dst}`, buf: w };
}

function shift(fields, by) {
  return fields.map((f) => ({ ...f, start: f.start + by, end: f.end + by, children: f.children ? shift(f.children, by) : undefined }));
}

/** 编码一个数据包，结果缓存在 pkt 上 */
export function buildFrame(pkt) {
  if (pkt._frame) return pkt._frame;
  const wire = pkt.wire;
  const seed = hashStr(`${pkt.from}>${pkt.to}|${pkt.time}|${JSON.stringify(pkt.label)}`);
  const ip = { ...wire.ip };
  ip.ttl ??= DEFAULT_TTL[pkt.from] ?? ARRIVAL_TTL[pkt.from] ?? 64;
  if (pkt.to === 'client' && ARRIVAL_TTL[pkt.from] && wire.ip.ttl == null) ip.ttl = ARRIVAL_TTL[pkt.from];
  const app = wire.app ? buildApp(wire.app, seed) : null;
  const payload = app ? app.buf.b : [];
  const l4 = wire.l4 === 'tcp' ? tcpLayer(wire.tcp, ip, payload) : wire.l4 === 'udp' ? udpLayer(wire.udp, ip, payload) : icmpLayer(wire.icmp, ip);
  const ipl = ipLayer(ip, l4.proto, l4.buf.len + payload.length, seed);
  const link = linkFor(pkt);
  const eth = ethLayer(link);
  const layers = [];
  const bytes = [];
  for (const L of [eth, ipl, l4, app].filter(Boolean)) {
    const start = bytes.length;
    bytes.push(...L.buf.b);
    layers.push({ name: L.name, summary: L.summary, start, end: bytes.length, fields: shift(L.buf.f, start) });
  }
  pkt._frame = { bytes: Uint8Array.from(bytes), layers, capturedAt: link.at };
  return pkt._frame;
}

export const CAPTURE_AT = {
  client: T('笔记本的 Wi‑Fi 网卡（就像在笔记本上开 Wireshark）', 'the laptop’s Wi‑Fi adapter (like running Wireshark on it)'),
  dns: T('DNS 解析器 1.1.1.1 的网卡', 'the network adapter of resolver 1.1.1.1'),
};
