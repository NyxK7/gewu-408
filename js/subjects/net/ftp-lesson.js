// 「FTP：控制连接与数据连接」：左右两台主机，靠里的一侧是各自用到的端口；中间的线是 TCP 连接：
// 上面那条控制连接从登录到退出一直在，下面每传一个文件开一条数据连接，传完就断。底下滚动显示命令和应答。
import { txt } from '../../core/board.js';
import { T } from '../../core/i18n.js';
import { arrow, cell } from '../../core/steps.js';
import { finish, make, pit, shell } from '../co/kit.js';
import { ftp } from './ftp.js';

const W = [['net', 'app']];
const CX = 60;
const SX = 660;
const BW = 240;
const TOP = 140;
const ROW0 = 200;
const DROW = 270;
const DSTEP = 60;
const LOGY = 520;

const PRINCIPLE = {
  sections: [
    {
      id: 'two',
      title: T('两条连接', 'Two connections'),
      blocks: [
        { p: T('FTP 用 TCP，而且同时用两种连接，这叫**带外控制**：', 'FTP uses two kinds of TCP connection — **out-of-band control**:') },
        { list: [
          T('**控制连接**：客户端连服务器的 21 端口，传命令和应答（USER、PASS、RETR、STOR、QUIT……），整个会话期间一直保持。', 'The **control connection** to port 21 carries commands and replies for the whole session.'),
          T('**数据连接**：真正传文件内容（以及目录列表），每传一个文件建立一次，传完就关闭。', 'A **data connection** carries one file (or listing) and is closed afterwards.'),
        ] },
        { tip: T('因为控制和数据分开，传文件的同时还可以在控制连接上发命令（比如中止传输）。FTP 服务器要为每个会话记住状态（当前目录、用户），所以是**有状态**的。', 'Control stays usable during a transfer. FTP servers keep per-session state.') },
      ],
    },
    {
      id: 'mode',
      title: T('主动模式和被动模式', 'Active and passive mode'),
      blocks: [
        {
          table: {
            head: ['', T('主动模式（PORT）', 'Active (PORT)'), T('被动模式（PASV）', 'Passive (PASV)')],
            rows: [
              [T('谁在等连接', 'Who listens'), T('客户端开一个端口等', 'the client'), T('服务器开一个端口等', 'the server')],
              [T('怎么告诉对方', 'How it is announced'), T('PORT h1,h2,h3,h4,p1,p2', 'PORT h1,h2,h3,h4,p1,p2'), T('227 回复里带 (h1,…,p1,p2)', 'in the 227 reply')],
              [T('谁发起数据连接', 'Who connects'), T('服务器，从 **20** 端口连过来', 'the server, from port **20**'), T('客户端', 'the client')],
              [T('穿过防火墙 / NAT', 'Firewalls / NAT'), T('客户端在 NAT 后面时，外面的服务器连不进来', 'blocked when the client is behind NAT'), T('连接都由客户端发起，好通过', 'works: the client initiates')],
            ],
          },
        },
        { formula: T('端口号 = p1 × 256 + p2', 'port = p1 × 256 + p2') },
      ],
    },
    {
      id: 'cs',
      title: T('客户 / 服务器与 P2P', 'Client-server and P2P'),
      blocks: [
        { list: [
          T('**客户 / 服务器（C/S）**：服务器一直开着、有固定地址，被动等待请求；客户主动发起，客户之间不直接通信。FTP、HTTP、电子邮件都是这种方式。服务器负担重，可能成为瓶颈。', '**Client-server**: an always-on server with a fixed address waits; clients initiate and do not talk to each other.'),
          T('**P2P（对等）**：没有固定的服务器，每台主机既是客户又是服务器，直接和其他对等方交换（如 BitTorrent 文件分发）。主机越多，总的服务能力越大，可扩展性好；但管理难、安全性差。', '**P2P**: every peer is both client and server; capacity grows with peers, but management is harder.'),
        ] },
        { tip: T('用 C/S 分发一个文件给 N 个用户，服务器要发 N 份；用 P2P 时下载过的用户也能上传给别人。', 'C/S sends N copies from one server; in P2P peers re-upload.') },
      ],
    },
    pit([
      T('FTP 的控制连接用 21 端口，主动模式下数据连接服务器端用 20 端口。', 'Port 21 for control, 20 for active-mode data.'),
      T('数据连接每传一个文件就新建一次，控制连接不断。', 'A new data connection per file; the control connection persists.'),
      T('TFTP 是用 UDP 的简单文件传输，没有这两条连接，也不需要登录。', 'TFTP runs over UDP with no login and no separate control channel.'),
    ]),
  ],
};

const split = (s) => (Array.isArray(s) ? s : String(s ?? '').split(/[\s,，]+/).filter(Boolean));
const SPEC = {
  presets: [
    { label: T('主动模式，下载两个文件', 'Active mode, two files'), set: { mode: 'active', files: ['a.txt', 'b.pdf'], ctlPort: 50100 } },
    { label: T('被动模式，下载两个文件', 'Passive mode, two files'), set: { mode: 'passive', files: ['a.txt', 'b.pdf'], ctlPort: 50100 } },
    { label: T('主动模式，三个文件', 'Active mode, three files'), set: { mode: 'active', files: ['x.zip', 'y.jpg', 'z.doc'], ctlPort: 61000 } },
  ],
  groups: [{ legend: T('会话', 'Session'), fields: [
    { name: 'mode', label: T('模式', 'Mode'), type: 'select', options: [['active', T('主动（PORT）', 'Active (PORT)')], ['passive', T('被动（PASV）', 'Passive (PASV)')]] },
    { name: 'files', label: T('要下载的文件（1～3 个）', 'Files (1–3)'), type: 'text', parse: split, wide: true },
    { name: 'ctlPort', label: T('客户端控制连接的端口', 'Client control port'), type: 'int', min: 1024, max: 65000 },
  ] }],
  note: T('客户端为第 i 个文件用「控制端口 + i」号端口；被动模式下服务器开的端口由代码依次给出。', 'The client uses control port + i for file i; passive ports are assigned in turn.'),
};
const ERR = { mode: T('模式不对', 'Unknown mode'), files: T('1～3 个文件名，只能有字母、数字和 . _ -', '1–3 file names'), ctlPort: T('端口 1024～65000', 'Port 1024–65000') };

function board(sim, st, z) {
  const items = [];
  const k = st ? st.k : -1;
  const s = k >= 0 ? sim.steps[k] : null;
  const conns = s ? s.conns : [];
  let h = '';
  // 两台主机
  h += `<g transform="translate(${CX} ${TOP})">${cell(BW, 340, '', { tone: 'slate' })}</g>` + txt(CX + 12, TOP + 24, z ? `客户端 ${sim.cIp}` : `Client ${sim.cIp}`, 'bt-lab', 'start');
  h += `<g transform="translate(${SX} ${TOP})">${cell(BW, 340, '', { tone: 'slate' })}</g>` + txt(SX + 12, TOP + 24, z ? `服务器 ${sim.sIp}` : `Server ${sim.sIp}`, 'bt-lab', 'start');
  const port = (side, y, label, tone, hot) => `<g transform="translate(${side === 'C' ? CX + BW - 96 : SX + 10} ${y})">${cell(86, 32, label, { size: 13, tone, cls: hot ? 'hot' : '' })}</g>`;
  // 控制连接
  const ctl = conns.find((c) => c.kind === 'ctl');
  h += port('C', ROW0, String(sim.ctlPort), ctl?.open ? 'blue' : '', false) + port('S', ROW0, '21', ctl?.open ? 'blue' : 'violet', false);
  if (ctl) {
    h += ctl.open ? arrow(CX + BW - 6, ROW0 + 16, SX + 6, ROW0 + 16, 'acc') : `<g class="barw dash"><line x1="${CX + BW}" y1="${ROW0 + 16}" x2="${SX}" y2="${ROW0 + 16}"/></g>`;
    h += txt((CX + BW + SX) / 2, ROW0 + 6, ctl.open ? (z ? '控制连接（一直保持）' : 'control connection (persistent)') : z ? '控制连接已关闭' : 'control closed', ctl.open ? 'ar-mono' : 'bt-idx');
  }
  // 数据连接
  sim.files.forEach((f, i) => {
    const y = DROW + i * DSTEP;
    const c = conns.find((x) => x.id === `d${i}`);
    const listening = s && s.i === i && (s.kind === 'port' || s.kind === 'pasv' || (s.kind === 'retr' && !c));
    const cPort = sim.ctlPort + 1 + i;
    const sPort = sim.mode === 'active' ? 20 : 40000 + 37 * (i + 1);
    const shownC = c || (listening && sim.mode === 'active');
    const shownS = c || (listening && sim.mode === 'passive');
    if (shownC) h += port('C', y, String(cPort), c?.open ? 'green' : listening ? 'amber' : '', listening);
    if (shownS) h += port('S', y, String(sPort), c?.open ? 'green' : listening ? 'amber' : '', listening);
    if (listening) h += txt(sim.mode === 'active' ? CX + BW - 100 : SX + 100, y + 21, z ? '在这个端口等' : 'listening', 'bt-idx', sim.mode === 'active' ? 'end' : 'start');
    if (c) {
      const fromC = c.by === 'C';
      if (c.open) h += fromC ? arrow(CX + BW - 6, y + 16, SX + 6, y + 16, 'ok') : arrow(SX + 6, y + 16, CX + BW - 6, y + 16, 'ok');
      else h += `<g class="barw dash"><line x1="${CX + BW}" y1="${y + 16}" x2="${SX}" y2="${y + 16}"/></g>`;
      h += txt((CX + BW + SX) / 2, y + 6, c.open ? (z ? `数据连接：${f}（${fromC ? '客户端' : '服务器'}发起）` : `data: ${f} (opened by ${fromC ? 'client' : 'server'})`) : z ? `${f} 传完，数据连接已关闭` : `${f} done, closed`, c.open ? 'ar-mono' : 'bt-idx');
    }
  });
  // 命令记录
  const log = [];
  sim.steps.slice(0, k + 1).forEach((x, j) => x.lines.forEach((l) => log.push({ ...l, cur: j === k })));
  const tail = log.slice(-6);
  h += txt(CX, LOGY - 14, z ? '控制连接上的命令和应答' : 'Commands and replies', 'bt-lab', 'start');
  tail.forEach((l, j) => (h += txt(CX, LOGY + 10 + j * 22, `${l.who === 'C' ? 'C →' : '← S'}  ${l[1] ?? ''}`, l.cur ? 'ar-mono' : 'bt-idx', 'start')));
  items.push({ k: 'all', x: 0, y: 0, html: h });
  return items;
}

function build(p, kit, ERR) {
  const sim = ftp({ ...p, files: split(p.files) });
  const lesson = shell('ftp', kit, ERR, sim, {
    where: W,
    tag: 'FTP',
    name: T('FTP：控制连接与数据连接', 'FTP: control and data connections'),
    full: T('控制连接（21）· 数据连接 · 带外控制 · 主动模式 PORT 与 20 端口 · 被动模式 PASV · 端口编码 p1×256+p2 · C/S 与 P2P', 'Control (21) and data connections · out-of-band control · PORT and PASV · port encoding · C/S and P2P'),
    title: SPEC.presets.find((x) => x.set.mode === p.mode && split(x.set.files).join() === split(p.files).join() && x.set.ctlPort === p.ctlPort)?.label ?? T('FTP 会话', 'An FTP session'),
    legend: [['blue', T('控制连接', 'Control connection')], ['green', T('数据连接', 'Data connection')], ['amber', T('正在等连接的端口', 'Listening port')]],
    principle: PRINCIPLE,
    desc: T('FTP 同时用两条 TCP 连接：控制连接从登录到退出一直在，专门传命令；每下载一个文件，另开一条数据连接，传完就关。主动模式是服务器从 20 端口连客户端，被动模式是客户端去连服务器开的端口。', 'FTP keeps one control connection and opens a data connection per file. Active: the server connects from port 20; passive: the client connects.'),
    rect: [40, 110, 880, 580],
  });
  if (!sim.ok) return lesson;
  // 记录里第二个元素是文字
  for (const st of sim.steps) st.lines = st.lines.map(([who, t]) => ({ who, 1: t }));
  const list = sim.steps.map((s, k) => {
    let d;
    if (s.kind === 'connect') d = [T('建立控制连接', 'Open the control connection'), T(`客户端用 ${sim.ctlPort} 端口连服务器的 21 端口（TCP 三次握手），服务器回 220 表示就绪。`, `Client ${sim.ctlPort} → server 21; 220 ready.`), 'two'];
    else if (s.kind === 'login') d = [T('登录', 'Log in'), T('在控制连接上发 USER 和 PASS，服务器回 230 登录成功。口令是明文传的。', 'USER and PASS on the control connection; 230.'), 'two'];
    else if (s.kind === 'port') d = [T(`PORT：告诉服务器连我的 ${s.p} 端口`, `PORT: connect to my port ${s.p}`), T(`客户端先在 ${s.p} 端口等着，再发 PORT 命令：前四个数是自己的 IP，后两个数 ${s.p1},${s.p2} 表示端口 ${s.p1} × 256 + ${s.p2} = ${s.p}。`, `Port ${s.p1} × 256 + ${s.p2} = ${s.p}.`), 'mode'];
    else if (s.kind === 'pasv') d = [T(`PASV：服务器开 ${s.p} 端口等`, `PASV: the server listens on ${s.p}`), T(`客户端发 PASV，服务器开一个端口等着，在 227 回复里告诉客户端：最后两个数 ${s.p1},${s.p2} 就是端口 ${s.p1} × 256 + ${s.p2} = ${s.p}。`, `227 with port ${s.p1} × 256 + ${s.p2} = ${s.p}.`), 'mode'];
    else if (s.kind === 'retr') d = [T(`RETR ${s.file}`, `RETR ${s.file}`), T(sim.mode === 'active' ? `请求下载 ${s.file}。服务器回 150，然后从自己的 20 端口主动去连客户端的 ${sim.ctlPort + 1 + s.i} 端口。` : `客户端连上服务器的 ${40000 + 37 * (s.i + 1)} 端口，再请求下载 ${s.file}，服务器回 150 准备传。`, `Request ${s.file}; 150.`), 'mode'];
    else if (s.kind === 'data') d = [T(`数据连接上传 ${s.file}`, `${s.file} over the data connection`), T(`文件内容（${s.bytes} 字节）走数据连接，${sim.mode === 'active' ? '这条连接是服务器 20 端口发起的' : '这条连接是客户端发起的'}；控制连接上这时没有数据，但仍然开着。`, `${s.bytes} bytes on the data connection; control stays open.`), 'two'];
    else if (s.kind === 'done') d = [T(`${s.file} 传完，关闭数据连接`, `${s.file} done`), T('服务器发完就关闭这条数据连接，并在控制连接上回 226。下一个文件要重新开一条。', 'The data connection closes; 226 on control.'), 'two'];
    else if (s.kind === 'quit') d = [T('QUIT', 'QUIT'), T('在控制连接上发 QUIT，服务器回 221。', 'QUIT; 221.'), 'two'];
    else d = [T('关闭控制连接', 'Close the control connection'), T(`会话结束，控制连接关闭。整个过程用了 1 条控制连接、${sim.dataConns} 条数据连接。`, `1 control and ${sim.dataConns} data connections.`), 'two'];
    return { title: d[0], desc: T(`连接 ${s.conns.filter((c) => c.open).length} 条`, `${s.conns.filter((c) => c.open).length} open`), detail: d[1], ref: d[2], st: { k }, row: { color: s.kind === 'data' ? 'green' : 'blue', what: d[0], result: T(s.lines.at(-1)?.[1]?.slice(0, 3) ?? '—', s.lines.at(-1)?.[1]?.slice(0, 3) ?? '—'), tone: 'info' } };
  });
  const title = T(`1 条控制连接，${sim.dataConns} 条数据连接`, `1 control, ${sim.dataConns} data connections`);
  const text = sim.mode === 'active' ? T('主动模式下数据连接都由服务器的 20 端口发起。', 'In active mode the server opens every data connection from port 20.') : T('被动模式下所有连接都由客户端发起，客户端在 NAT 或防火墙后面也能用。', 'In passive mode the client opens every connection.');
  return finish(lesson, list, (st, z) => board(sim, st, z), title, text);
}

export const makeFtp = make('ftp', SPEC, ERR, build);
