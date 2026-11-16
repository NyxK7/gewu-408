// 「电子邮件」：上面一排是信走过的四站（Alice 的用户代理 → 发信服务器 → 收信服务器的邮箱 → Bob 的用户代理），
// 当前这一跳和用的协议点亮；下面换着显示这一步的细节：MIME 报文、附件的 base64 编码表、SMTP / POP3 / IMAP 的对话。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { email } from './email.js';

const W = [['net', 'app']];
const NX = [40, 300, 560, 820];
const NY = 140;
const NW = 180;
const DY = 330;

const PRINCIPLE = {
  sections: [
    {
      id: 'parts',
      title: T('电子邮件系统的组成', 'Parts of the e-mail system'),
      blocks: [
        { list: [
          T('**用户代理**（UA）：用户写信、读信的程序（邮件客户端，或者浏览器里的网页邮箱）。', '**User agents**: the programs people use to write and read mail.'),
          T('**邮件服务器**：替用户收发邮件，每个用户在上面有一个邮箱；它既当 SMTP 客户（往外发）又当 SMTP 服务器（收别人发来的）。', '**Mail servers** hold mailboxes and act as both SMTP client and server.'),
          T('**协议**：发送用 SMTP（推），读取用 POP3 或 IMAP（拉）。', '**Protocols**: SMTP to send (push), POP3 or IMAP to read (pull).'),
        ] },
        { tip: T('发信方的邮件服务器要先用 DNS 查收信方域名的 MX 记录，找到对方的邮件服务器，再和它建立 TCP 连接。', 'The sending server looks up the recipient domain’s MX record in DNS.') },
      ],
    },
    {
      id: 'smtp',
      title: 'SMTP',
      blocks: [
        { list: [
          T('用 TCP，服务器端口 25；客户端主动连接，把邮件**推**给服务器。', 'TCP port 25; the client **pushes** mail.'),
          T('三个阶段：建立连接（HELO）→ 传送邮件（MAIL FROM、RCPT TO、DATA，以单独一行「.」结束）→ 释放连接（QUIT）。', 'Three phases: HELO; MAIL FROM, RCPT TO, DATA ending with “.”; QUIT.'),
          T('应答是三位数字码：220 就绪、250 成功、354 开始输入数据、221 关闭。', 'Replies: 220 ready, 250 OK, 354 send data, 221 bye.'),
          T('邮件一般不经过中间服务器，发信服务器直接交给收信服务器；对方暂时连不上就在队列里等着重试。', 'Servers deliver directly and retry later if needed.'),
        ] },
        { warn: T('SMTP 只能传 7 位 ASCII 文本，所以中文、图片、附件都要先用 MIME 编码成 ASCII。', 'SMTP carries 7-bit ASCII only, hence MIME.') },
      ],
    },
    {
      id: 'mime',
      title: T('MIME 和 base64', 'MIME and base64'),
      blocks: [
        { p: T('**MIME**（通用因特网邮件扩充）不改 SMTP，只是在邮件首部加几行：MIME-Version、Content-Type（内容类型，如 text/plain、image/jpeg、multipart/mixed）、Content-Transfer-Encoding（传送编码）。一封信可以分成几个部分，用分界线隔开。', '**MIME** adds header lines — MIME-Version, Content-Type, Content-Transfer-Encoding — and splits a message into parts.') },
        { steps: [
          T('把二进制数据每 3 个字节（24 位）分成一组；', 'Take 3 bytes (24 bits) at a time;'),
          T('24 位再分成 4 段 6 位，每段是 0～63 的数；', 'split into four 6-bit values (0–63);'),
          T('按表 A～Z、a～z、0～9、+、/ 换成字符；', 'map each to A–Z, a–z, 0–9, +, /;'),
          T('最后不足 3 字节时补 0 位，缺的字符位置用 = 填满。', 'pad the last group with zero bits and “=”.'),
        ] },
        { formula: T('编码后长度 = ⌈原字节数 / 3⌉ × 4，约增大 1/3', 'encoded length = ⌈n / 3⌉ × 4, about +33%') },
        { tip: T('只含少量非 ASCII 字符的正文常用 quoted-printable 编码：可见的 ASCII 字符不变，其他字节写成「=」加两位十六进制。', 'Quoted-printable keeps ASCII as is and writes other bytes as =XX.') },
      ],
    },
    {
      id: 'read',
      title: T('POP3、IMAP 和网页邮件', 'POP3, IMAP and webmail'),
      blocks: [
        {
          table: {
            head: ['', 'POP3', 'IMAP', T('网页邮件', 'Webmail')],
            rows: [
              [T('端口 / 协议', 'Port'), T('TCP 110', 'TCP 110'), T('TCP 143', 'TCP 143'), 'HTTP / HTTPS'],
              [T('邮件放在哪', 'Mail stays'), T('下载到本机，默认从服务器删除（也可设置保留）', 'downloaded, usually deleted'), T('留在服务器，本机看的是服务器上的', 'on the server'), T('留在服务器', 'on the server')],
              [T('文件夹', 'Folders'), T('不支持服务器上的文件夹', 'no server folders'), T('支持，在哪台设备上看都一样', 'yes, synced everywhere'), T('支持', 'yes')],
              [T('能不能只取一部分', 'Partial fetch'), T('不能', 'no'), T('能（先看首部）', 'yes'), '—'],
            ],
          },
        },
        { warn: T('用网页邮箱时，用户和自己的邮件服务器之间用 HTTP；但两台邮件服务器之间还是用 SMTP。', 'Webmail uses HTTP to the user’s server, but servers still talk SMTP.') },
      ],
    },
    pit([
      T('SMTP 是「推」，POP3 / IMAP 是「拉」；SMTP 不能用来从服务器读信。', 'SMTP pushes; POP3 and IMAP pull.'),
      T('base64 每 3 字节变 4 个字符，不是每 6 位变 8 位那么简单地「加 2 位」。', 'base64 turns 3 bytes into 4 characters.'),
      T('邮件服务器之间直接传送，一般不经过中继。', 'Servers deliver directly.'),
    ]),
  ],
};

const SPEC = {
  presets: [
    { label: T('客户端发，POP3 收', 'Client send, POP3 read'), set: { send: 'ua', recv: 'pop3', attach: 'Hi!Bob' } },
    { label: T('客户端发，IMAP 收（附件要补 =）', 'IMAP read (padding =)'), set: { send: 'ua', recv: 'imap', attach: 'Notes' } },
    { label: T('网页邮箱发和收', 'Webmail both ends'), set: { send: 'web', recv: 'web', attach: 'A1' } },
  ],
  groups: [{ legend: T('收发方式', 'How'), fields: [
    { name: 'send', label: T('Alice 怎样发', 'Alice sends with'), type: 'select', options: [['ua', T('邮件客户端（SMTP）', 'a mail client (SMTP)')], ['web', T('网页邮箱（HTTP）', 'webmail (HTTP)')]] },
    { name: 'recv', label: T('Bob 怎样读', 'Bob reads with'), type: 'select', options: [['pop3', 'POP3'], ['imap', 'IMAP'], ['web', T('网页邮箱（HTTP）', 'webmail (HTTP)')]] },
    { name: 'attach', label: T('附件内容（1～9 个 ASCII 字符，演示 base64）', 'Attachment (1–9 ASCII chars)'), type: 'text', parse: (s) => String(s), wide: true },
  ] }],
  note: T('alice@a.com 发给 bob@b.org。附件按 base64 编码；POP3 演示「下载后删除」。', 'alice@a.com to bob@b.org; base64 attachment; POP3 downloads and deletes.'),
};
const ERR = { send: T('发送方式不对', 'Unknown'), recv: T('读取方式不对', 'Unknown'), attach: T('附件写 1～9 个可见 ASCII 字符', '1–9 printable ASCII characters'), addr: T('邮件地址不对', 'Bad address') };

function b64grid(sim, z, rev) {
  let h = txt(0, -14, rev ? (z ? 'Bob 的用户代理把 base64 还原' : 'Decoding base64') : z ? '附件按 base64 编码（每 3 字节 → 4 个字符）' : 'base64: 3 bytes → 4 characters', 'bt-lab', 'start');
  sim.b64.groups.forEach((g, gi) => {
    const x0 = gi * 300;
    g.bytes.forEach((b, i) => (h += `<g transform="translate(${x0 + i * 96} 0)">${cell(92, 34, `'${String.fromCharCode(b)}' ${b.toString(16).toUpperCase()}`, { size: 12, tone: 'blue' })}</g>`));
    for (let i = g.bytes.length; i < 3; i++) h += `<g transform="translate(${x0 + i * 96} 0)">${cell(92, 34, z ? '（无）' : '(none)', { size: 11, cls: 'dim' })}</g>`;
    g.six.forEach((s, i) => (h += `<g transform="translate(${x0 + i * 72} 46)">${cell(68, 34, s, { size: 12, tone: 'slate' })}</g>`));
    g.chars.forEach((c, i) => {
      const pad = c === '=';
      h += `<g transform="translate(${x0 + i * 72} 92)">${cell(68, 34, pad ? '=' : `${g.idx[i]} → ${c}`, { size: 13, tone: pad ? 'rose' : 'amber', cls: 'hot' })}</g>`;
    });
  });
  h += txt(0, 156, z ? `「${sim.attach}」${sim.bytes.length} 字节 → ${sim.b64.text}（${sim.b64.text.length} 个字符）${rev ? `，还原得「${sim.back}」` : ''}` : `${sim.bytes.length} B → ${sim.b64.text}${rev ? ` → ${sim.back}` : ''}`, 'ar-mono', 'start');
  return h;
}

function dialog(lines, z, title, cols = 1) {
  let h = txt(0, -14, title, 'bt-lab', 'start');
  const per = Math.ceil(lines.length / cols);
  lines.forEach(([who, t], i) => {
    const c = Math.floor(i / per);
    const r = i % per;
    h += txt(c * 470, 8 + r * 22, `${who === 'C' ? 'C →' : '← S'}  ${t}`, who === 'C' ? 'ar-mono' : 'bt-cap', 'start');
  });
  return h;
}

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const kind = k >= 0 ? sim.kinds[k] : 'pre';
  const names = [T('Alice 的用户代理', 'Alice’s agent'), T(`${sim.fromDom} 邮件服务器`, `${sim.fromDom} server`), T(`${sim.toDom} 邮件服务器`, `${sim.toDom} server`), T('Bob 的用户代理', 'Bob’s agent')];
  const at = { compose: [0], mime: [0], submit: [0, 1], smtp: [1, 2], store: [2], fetch: [2, 3], decode: [3] }[kind] ?? [];
  let h = '';
  names.forEach((n, i) => (h += `<g transform="translate(${NX[i]} ${NY})">${cell(NW, 56, z ? n.zh : n.en, { size: 13, tone: at.includes(i) ? 'amber' : i === 0 || i === 3 ? 'blue' : 'violet', cls: at.includes(i) ? 'hot' : '' })}</g>`));
  const hop = (i, label, on, back) => {
    const y = NY + 28;
    const x1 = NX[i] + NW + 4;
    const x2 = NX[i + 1] - 4;
    return (back ? arrow(x2, y, x1, y, on ? 'acc' : '') : arrow(x1, y, x2, y, on ? 'acc' : '')) + txt((x1 + x2) / 2, y - 12, label, on ? 'ar-mono' : 'bt-idx');
  };
  h += hop(0, sim.send === 'web' ? 'HTTP' : 'SMTP', kind === 'submit', false);
  h += hop(1, 'SMTP', kind === 'smtp', false);
  h += hop(2, sim.recv === 'pop3' ? 'POP3' : sim.recv === 'imap' ? 'IMAP' : 'HTTP', kind === 'fetch', true);
  h += txt((NX[0] + NX[2] + NW) / 2, NY + 82, z ? '推（push）' : 'push', 'bt-idx');
  h += txt((NX[2] + NX[3] + NW) / 2 + 6, NY + 82, z ? '拉（pull）' : 'pull', 'bt-idx');
  // 邮箱
  const inBox = ['store', 'fetch', 'decode'].includes(kind) ? (kind !== 'store' && sim.recv === 'pop3' ? 0 : 1) : 0;
  h += `<g transform="translate(${NX[2] + 30} ${NY + 96})">${cell(120, 30, z ? `Bob 的邮箱：${inBox} 封` : `mailbox: ${inBox}`, { size: 12, tone: inBox ? 'green' : '' })}</g>`;
  items.push({ k: 'path', x: 0, y: 0, html: h });
  // 细节
  let d = '';
  if (kind === 'compose') {
    d += txt(0, -14, z ? 'MIME 格式的邮件' : 'The MIME message', 'bt-lab', 'start');
    sim.headers.forEach((l, i) => (d += txt(i < 5 ? 0 : 20, 8 + i * 21, l, i >= 3 && i <= 4 ? 'ar-mono' : 'bt-cap', 'start')));
  } else if (kind === 'mime') d += b64grid(sim, z, false);
  else if (kind === 'submit') d += sim.send === 'web' ? dialog([['C', 'POST /send HTTP/1.1  (the whole message in the form)'], ['S', 'HTTP/1.1 200 OK']], z, z ? 'Alice 在网页上点「发送」：浏览器用 HTTP 把信交给 a.com 的服务器' : 'Webmail: HTTP POST to the server') : dialog([['C', `(TCP to mail.${sim.fromDom}:25 / 587, then HELO, MAIL FROM, RCPT TO, DATA …)`], ['S', '250 Message queued']], z, z ? 'Alice 的客户端用 SMTP 把信交给自己的邮件服务器' : 'The client submits with SMTP');
  else if (kind === 'smtp') d += dialog(sim.smtp, z, z ? `a.com 服务器查 ${sim.toDom} 的 MX 记录，连到对方 25 端口，用 SMTP 推送` : 'Server-to-server SMTP', 2);
  else if (kind === 'store') d += txt(0, 0, z ? `${sim.toDom} 的服务器收下邮件，放进 Bob 的邮箱。Bob 不在线也没关系，信就在服务器上等着。` : 'The mail waits in Bob’s mailbox.', 'bt-lab', 'start');
  else if (kind === 'fetch') d += dialog(sim.fetch, z, sim.recv === 'pop3' ? (z ? 'Bob 用 POP3（110 端口）取信：下载后删除' : 'POP3 on port 110: download and delete') : sim.recv === 'imap' ? (z ? 'Bob 用 IMAP（143 端口）读信：信仍留在服务器上' : 'IMAP on port 143: mail stays on the server') : z ? 'Bob 在网页上读信：HTTP' : 'Webmail: HTTP', 2);
  else if (kind === 'decode') d += b64grid(sim, z, true);
  else d += txt(0, 0, z ? '（点播放）' : '(press play)', 'bt-idx', 'start');
  items.push({ k: 'detail', x: 40, y: DY, html: d });
  return items;
}

function build(p, kit, ERR) {
  const sim = email(p);
  const lesson = shell('email', kit, ERR, sim, {
    where: W,
    tag: T('邮件', 'Mail'),
    name: T('电子邮件：SMTP、POP3 / IMAP 与 MIME', 'E-mail: SMTP, POP3 / IMAP and MIME'),
    full: T('用户代理与邮件服务器 · SMTP 推送 · POP3 与 IMAP 拉取 · 网页邮件 · MIME 首部 · base64 编码 · quoted-printable', 'User agents and servers · SMTP push · POP3 / IMAP pull · webmail · MIME · base64'),
    title: SPEC.presets.find((x) => x.set.send === p.send && x.set.recv === p.recv && x.set.attach === p.attach)?.label ?? T('一封邮件', 'One e-mail'),
    legend: [['amber', T('这一步', 'This step')], ['violet', T('邮件服务器', 'Mail server')], ['rose', T('base64 填充的 =', 'Padding =')]],
    principle: PRINCIPLE,
    desc: T('一封带附件的信怎样从 Alice 到 Bob：附件先用 MIME 的 base64 编码成 ASCII，再用 SMTP 一路「推」到 Bob 的邮件服务器，放进邮箱；Bob 用 POP3 或 IMAP 把信「拉」回来，再把附件还原。', 'An attachment is base64-encoded, pushed by SMTP to Bob’s server, pulled with POP3 or IMAP, and decoded.'),
    rect: [20, 100, 1000, 560],
  });
  if (!sim.ok) return lesson;
  const pad = sim.b64.groups.at(-1).pad;
  const list = sim.kinds.map((kind, k) => {
    let d;
    if (kind === 'compose') d = [T('Alice 写信', 'Alice writes'), T(`用户代理按 MIME 格式组织邮件：首部有 From、To、Subject，还有 MIME-Version 和 Content-Type: multipart/mixed，表示信分成几部分（正文一部分、附件一部分），用分界线隔开。`, 'The agent builds a multipart MIME message.'), 'mime'];
    else if (kind === 'mime') d = [T('附件用 base64 编码', 'base64 the attachment'), T(`附件「${sim.attach}」是 ${sim.bytes.length} 个字节。每 3 字节 24 位分成 4 段 6 位，查表变成字符${pad ? `；最后一组只有 ${3 - pad} 字节，补 0 位后用 ${pad} 个 = 填满` : ''}。得到 ${sim.b64.text}，长度变成 ${sim.b64.text.length}。`, `${sim.bytes.length} bytes → ${sim.b64.text}.`), 'mime'];
    else if (kind === 'submit') d = sim.send === 'web' ? [T('网页上点发送（HTTP）', 'Send from webmail (HTTP)'), T('Alice 用的是网页邮箱，浏览器和 a.com 的服务器之间走 HTTP，不是 SMTP。', 'Browser to server is HTTP.'), 'read'] : [T('交给自己的邮件服务器（SMTP）', 'Submit via SMTP'), T('Alice 的邮件客户端和 a.com 的邮件服务器建立 TCP 连接，用 SMTP 把信交过去，服务器把它放进发送队列。', 'The client hands the message to its own server with SMTP.'), 'smtp'];
    else if (kind === 'smtp') d = [T('服务器之间用 SMTP 推送', 'Server to server by SMTP'), T(`a.com 的服务器查 DNS 得到 ${sim.toDom} 的邮件服务器，连到它的 25 端口：HELO → MAIL FROM → RCPT TO → DATA（以单独一行「.」结束）→ QUIT。这里 a.com 的服务器是 SMTP 客户。`, 'HELO, MAIL FROM, RCPT TO, DATA, QUIT.'), 'smtp'];
    else if (kind === 'store') d = [T('放进 Bob 的邮箱', 'Into Bob’s mailbox'), T('收信服务器把邮件存进 Bob 的邮箱，等 Bob 来取。SMTP 的工作到这里结束。', 'SMTP’s job ends here.'), 'parts'];
    else if (kind === 'fetch') d = sim.recv === 'pop3' ? [T('Bob 用 POP3 取信', 'Bob fetches with POP3'), T('Bob 的用户代理连到服务器 110 端口，登录、RETR 下载、DELE 删除。信到了本机，服务器邮箱空了（默认的「下载后删除」）。', 'Download then delete: the mailbox is empty.'), 'read'] : sim.recv === 'imap' ? [T('Bob 用 IMAP 读信', 'Bob reads with IMAP'), T('连到 143 端口，登录、选收件箱、取信。信仍留在服务器上，换一台设备看到的也一样。', 'The mail stays on the server.'), 'read'] : [T('Bob 在网页上读信（HTTP）', 'Bob reads in the browser'), T('网页邮箱：浏览器用 HTTP 从服务器取页面，信留在服务器上。', 'HTTP; mail stays on the server.'), 'read'];
    else d = [T('还原附件', 'Decode the attachment'), T(`Bob 的用户代理看到 Content-Transfer-Encoding: base64，把 ${sim.b64.text} 每个字符换回 6 位，拼起来每 8 位一个字节，去掉填充，得到「${sim.back}」，和原附件${sim.same ? '一样' : '不一样'}。`, `${sim.b64.text} → ${sim.back}.`), 'mime'];
    return { title: d[0], desc: T(['写信', '编码', '提交', '传送', '存储', '读取', '解码'][k], kind), detail: d[1], ref: d[2], st: { k }, row: { color: ['smtp', 'submit'].includes(kind) ? 'violet' : 'blue', what: d[0], result: T(kind === 'mime' ? sim.b64.text : '—', kind === 'mime' ? sim.b64.text : '—'), tone: 'info' } };
  });
  const title = T(`附件 ${sim.bytes.length} 字节编码成 ${sim.b64.text.length} 个字符，Bob ${sim.same ? '正确还原' : '还原出错'}`, `${sim.bytes.length} bytes → ${sim.b64.text.length} characters; decoded ${sim.same ? 'correctly' : 'wrongly'}`);
  const text = T(`发送一路用 ${sim.send === 'web' ? 'HTTP + SMTP' : 'SMTP'}（推），读取用 ${sim.recv === 'web' ? 'HTTP' : sim.recv.toUpperCase()}（拉）。`, `Push with ${sim.send === 'web' ? 'HTTP + SMTP' : 'SMTP'}, pull with ${sim.recv.toUpperCase()}.`);
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeEmail = make('email', SPEC, ERR, build);
