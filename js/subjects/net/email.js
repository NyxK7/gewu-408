// 电子邮件一次收发的纯计算：Alice 写信（带一个附件）→ 交给自己的邮件服务器 → 邮件服务器之间用 SMTP 推送 → 放进 Bob 的邮箱 →
// Bob 用 POP3 / IMAP（或网页的 HTTP）取信 → 还原附件。附件按 MIME 的 base64 编码：每 3 字节 = 24 位分成 4 组 6 位，
// 每组查表变成一个字符；最后不足 3 字节时补 0 位，并用 = 填满 4 个字符。

const err = (errors) => ({ ok: false, errors });
export const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes) {
  const groups = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk = bytes.slice(i, i + 3);
    const n = chunk.length;
    const bits = chunk.map((b) => b.toString(2).padStart(8, '0')).join('').padEnd(n === 3 ? 24 : n === 2 ? 18 : 12, '0');
    const six = bits.match(/.{6}/g);
    const chars = six.map((s) => B64[parseInt(s, 2)]);
    while (chars.length < 4) chars.push('=');
    groups.push({ bytes: chunk, bits, six, idx: six.map((s) => parseInt(s, 2)), chars, pad: 3 - n });
  }
  return { groups, text: groups.map((g) => g.chars.join('')).join('') };
}

export function unbase64(text) {
  const out = [];
  const clean = text.replace(/=+$/, '');
  let bits = '';
  for (const c of clean) bits += B64.indexOf(c).toString(2).padStart(6, '0');
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return out;
}

export function email({ send = 'ua', recv = 'pop3', attach = 'Hi!Bob', from = 'alice@a.com', to = 'bob@b.org' }) {
  const errors = [];
  if (!['ua', 'web'].includes(send)) errors.push('send');
  if (!['pop3', 'imap', 'web'].includes(recv)) errors.push('recv');
  const a = String(attach ?? '');
  if (!/^[\x20-\x7e]{1,9}$/.test(a)) errors.push('attach');
  if (!/^[\w.]+@[\w.]+$/.test(from) || !/^[\w.]+@[\w.]+$/.test(to)) errors.push('addr');
  if (errors.length) return err(errors);
  const bytes = [...a].map((c) => c.charCodeAt(0));
  const b = base64(bytes);
  const back = String.fromCharCode(...unbase64(b.text));
  const fromDom = from.split('@')[1];
  const toDom = to.split('@')[1];
  const smtp = [
    ['S', `220 mail.${toDom} ESMTP ready`],
    ['C', `HELO mail.${fromDom}`],
    ['S', '250 Hello'],
    ['C', `MAIL FROM:<${from}>`],
    ['S', '250 OK'],
    ['C', `RCPT TO:<${to}>`],
    ['S', '250 OK'],
    ['C', 'DATA'],
    ['S', '354 End data with <CR><LF>.<CR><LF>'],
    ['C', '(headers, body, base64 attachment) .'],
    ['S', '250 Message accepted'],
    ['C', 'QUIT'],
    ['S', '221 Bye'],
  ];
  const fetch = recv === 'pop3'
    ? [['S', '+OK POP3 ready'], ['C', 'USER bob'], ['S', '+OK'], ['C', 'PASS ******'], ['S', '+OK 1 message'], ['C', 'RETR 1'], ['S', '+OK (message follows)'], ['C', 'DELE 1'], ['S', '+OK deleted'], ['C', 'QUIT'], ['S', '+OK bye']]
    : recv === 'imap'
      ? [['S', '* OK IMAP ready'], ['C', 'a1 LOGIN bob ******'], ['S', 'a1 OK'], ['C', 'a2 SELECT INBOX'], ['S', '* 1 EXISTS'], ['C', 'a3 FETCH 1 BODY[]'], ['S', '* 1 FETCH (message)'], ['C', 'a4 LOGOUT'], ['S', '* BYE']]
      : [['C', 'GET /inbox HTTP/1.1'], ['S', 'HTTP/1.1 200 OK (page with the message)']];
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    'Subject: notes',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="xyz"',
    '--xyz',
    'Content-Type: text/plain; charset=UTF-8',
    '(body text)',
    '--xyz',
    'Content-Type: application/octet-stream; name="a.bin"',
    'Content-Transfer-Encoding: base64',
    b.text,
    '--xyz--',
  ];
  const kinds = ['compose', 'mime', 'submit', 'smtp', 'store', 'fetch', 'decode'];
  return { ok: true, send, recv, from, to, fromDom, toDom, attach: a, bytes, b64: b, back, same: back === a, smtp, fetch, headers, kinds, grow: b.text.length / bytes.length };
}
