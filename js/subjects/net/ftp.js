// FTP 一次会话的纯计算：控制连接（服务器 21 端口）从头到尾一直在；每传一个文件开一条数据连接，传完就关。
//   · 主动模式（PORT）：客户端先在自己的一个端口上等，用 PORT h1,h2,h3,h4,p1,p2 把 IP 和端口告诉服务器（端口 = p1×256 + p2），
//     服务器从 20 端口主动连过来；
//   · 被动模式（PASV）：服务器开一个端口等，用 227 回复告诉客户端，客户端主动连过去。
// 记下每一步的命令 / 应答、当时存在的 TCP 连接（谁发起、两端端口）。

const err = (errors) => ({ ok: false, errors });
export const C_IP = [192, 168, 1, 5];
export const S_IP = [203, 0, 113, 21];
const enc = (ip, port) => [...ip, Math.floor(port / 256), port % 256].join(',');

export function ftp({ mode = 'active', files = ['a.txt', 'b.pdf'], ctlPort = 50100, size = [12000, 300000] }) {
  const errors = [];
  if (!['active', 'passive'].includes(mode)) errors.push('mode');
  if (!Array.isArray(files) || !files.length || files.length > 3 || files.some((f) => !/^[\w.-]{1,16}$/.test(f))) errors.push('files');
  if (!Number.isInteger(ctlPort) || ctlPort < 1024 || ctlPort > 65000) errors.push('ctlPort');
  if (errors.length) return err(errors);
  const steps = [];
  const conns = []; // { id, kind: 'ctl' | 'data', cPort, sPort, by: 'C' | 'S', open: bool, file }
  const push = (kind, lines, extra = {}) => steps.push({ kind, lines, conns: conns.map((c) => ({ ...c })), ...extra });
  const ctl = { id: 'ctl', kind: 'ctl', cPort: ctlPort, sPort: 21, by: 'C', open: true };
  conns.push(ctl);
  push('connect', [['S', '220 Service ready']]);
  push('login', [['C', 'USER ming'], ['S', '331 Password required'], ['C', 'PASS ******'], ['S', '230 Logged in']]);
  files.forEach((f, i) => {
    let data;
    if (mode === 'active') {
      const p = ctlPort + 1 + i; // 客户端为这次传输开的端口
      push('port', [['C', `PORT ${enc(C_IP, p)}`], ['S', '200 PORT command successful']], { file: f, i, p, p1: Math.floor(p / 256), p2: p % 256 });
      push('retr', [['C', `RETR ${f}`], ['S', `150 Opening data connection for ${f}`]], { file: f, i });
      data = { id: `d${i}`, kind: 'data', cPort: p, sPort: 20, by: 'S', open: true, file: f };
    } else {
      const p = 40000 + 37 * (i + 1); // 服务器为这次传输开的端口
      push('pasv', [['C', 'PASV'], ['S', `227 Entering Passive Mode (${enc(S_IP, p)})`]], { file: f, i, p, p1: Math.floor(p / 256), p2: p % 256 });
      data = { id: `d${i}`, kind: 'data', cPort: ctlPort + 1 + i, sPort: p, by: 'C', open: true, file: f };
      push('retr', [['C', `RETR ${f}`], ['S', `150 Opening data connection for ${f}`]], { file: f, i });
    }
    conns.push(data);
    push('data', [['S', `(${size[i % size.length]} bytes of ${f} on the data connection)`]], { file: f, i, data: { ...data }, bytes: size[i % size.length] });
    data.open = false;
    push('done', [['S', '226 Transfer complete']], { file: f, i });
  });
  push('quit', [['C', 'QUIT'], ['S', '221 Goodbye']]);
  ctl.open = false;
  push('close', []);
  return { ok: true, mode, files, ctlPort, steps, dataConns: files.length, cIp: C_IP.join('.'), sIp: S_IP.join('.') };
}
