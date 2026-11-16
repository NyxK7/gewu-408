// 计网里较早做好的几节课的「原理」页（滑动窗口、子网划分、拥塞控制，以及 HTTP、DNS、TCP、DHCP、HTTPS、ICMP 这 6 节课）。
import { T } from '../../core/i18n.js';

const pit = (items) => ({ id: 'pitfall', title: T('易错点', 'Common mistakes'), blocks: [{ list: items }] });

export const SW_PRINCIPLE = {
  sections: [
    {
      id: 'stopwait',
      title: T('从停止—等待说起', 'Starting from stop-and-wait'),
      blocks: [
        { p: T('**停止—等待协议**：发送方每发完一帧就停下来，等收到确认再发下一帧；超时没收到确认就重传。帧要编号（1 位就够：0、1 交替），否则接收方分不清重传的帧是不是重复的。', '**Stop-and-wait**: send one frame, wait for its ACK, retransmit on timeout. Frames need a 1-bit sequence number so duplicates can be recognized.') },
        { formula: T('信道利用率 U = T_D ÷ (T_D + RTT + T_A)', 'utilization U = T_D ÷ (T_D + RTT + T_A)') },
        { p: T('T_D 是发送一帧的时间，T_A 是发送确认的时间（常忽略）。RTT 比 T_D 大得多时，信道大部分时间都空着。解决办法是**流水线**：不等确认就连续发多帧，这就要用到滑动窗口。', 'With RTT much larger than the frame time, the channel sits idle. **Pipelining** sends several frames before the ACK returns, which needs sliding windows.') },
      ],
    },
    {
      id: 'window',
      title: T('发送窗口与接收窗口', 'Send and receive windows'),
      blocks: [
        { p: T('**发送窗口**：发送方可以连续发送、还没得到确认的帧的序号范围；收到确认后窗口向前滑动。**接收窗口**：接收方允许接收的帧的序号范围；收到窗口内的帧并交付后向前滑动。', 'The **send window** is the range of sequence numbers that may be outstanding; it slides on ACKs. The **receive window** is the range the receiver accepts.') },
        {
          table: {
            head: ['', T('停止—等待', 'Stop-and-wait'), T('后退 N 帧 GBN', 'Go-Back-N'), T('选择重传 SR', 'Selective Repeat')],
            rows: [
              [T('发送窗口', 'Send window'), '1', T('1 < W_T ≤ 2^n − 1', '1 < W_T ≤ 2^n − 1'), T('W_T ≤ 2^(n−1)', 'W_T ≤ 2^(n−1)')],
              [T('接收窗口', 'Receive window'), '1', '1', T('W_R = W_T（一般）', 'W_R = W_T usually')],
              [T('乱序到达的帧', 'Out-of-order frames'), T('—', '—'), T('丢弃', 'discarded'), T('缓存', 'buffered')],
              [T('确认方式', 'ACKs'), T('逐帧', 'per frame'), T('累积确认', 'cumulative'), T('逐帧确认', 'per frame')],
              [T('超时重传', 'On timeout'), T('这一帧', 'that frame'), T('这一帧及之后所有已发帧', 'it and every later frame'), T('只重传超时的那一帧', 'only that frame')],
            ],
          },
        },
      ],
    },
    {
      id: 'gbn',
      title: T('后退 N 帧（GBN）', 'Go-Back-N'),
      blocks: [
        { p: T('接收窗口为 1：接收方只按序接收，收到失序的帧一律丢弃，并对最后一个按序收到的帧再发一次确认。确认是**累积**的：确认 n 表示 n 号及以前的帧都已正确收到。', 'The receive window is 1: out-of-order frames are dropped and the last in-order frame is re-ACKed. ACKs are **cumulative**.') },
        { p: T('某一帧超时，发送方就把它和它之后所有已发出的帧全部重传——「后退 N 帧」。出错率高时会浪费很多带宽。', 'On a timeout the sender resends that frame and everything after it — going back N — which wastes bandwidth when errors are common.') },
        { warn: T('n 位序号时 GBN 的发送窗口最大 2^n − 1。若取 2^n，确认全部丢失时接收方分不清收到的是新一轮的帧还是重传的旧帧。', 'With n-bit numbers the GBN window is at most 2^n − 1; with 2^n, lost ACKs make old and new frames indistinguishable.') },
      ],
    },
    {
      id: 'sr',
      title: T('选择重传（SR）', 'Selective Repeat'),
      blocks: [
        { p: T('接收窗口大于 1：失序但落在接收窗口内的帧先**缓存**起来，并逐帧确认；等缺的帧到了，再把连续的一段一起交付上层。发送方只重传超时（或被否认）的那一帧。', 'Out-of-order frames within the window are **buffered** and individually ACKed; only the frame that timed out is resent.') },
        { formula: T('W_T + W_R ≤ 2^n，且 W_R ≤ W_T', 'W_T + W_R ≤ 2^n and W_R ≤ W_T') },
        { p: T('一般取 W_T = W_R = 2^(n−1)。窗口过大时，新旧两轮的序号会在接收窗口里重叠，接收方会把重传的旧帧误当成新帧收下。', 'Usually W_T = W_R = 2^(n−1). Larger windows let old and new sequence numbers overlap in the receive window.') },
      ],
    },
    {
      id: 'util',
      title: T('信道利用率与窗口大小', 'Utilization and window size'),
      blocks: [
        { formula: T('U = min(1, W × T_D ÷ (T_D + RTT))', 'U = min(1, W × T_D ÷ (T_D + RTT))') },
        { p: T('一个 RTT 里能发 W 帧。若 W × T_D ≥ T_D + RTT，发送方在第一个确认回来之前一直有帧可发，利用率达到 100%。考题常问「至少要多少位序号才能让信道一直忙」：先算出需要的 W，再按 GBN（W ≤ 2^n − 1）或 SR（W ≤ 2^(n−1)）求 n。', 'W frames fit in one cycle; once W × T_D ≥ T_D + RTT the link stays busy. To find the minimum sequence bits, compute the needed W, then apply the GBN or SR bound.') },
      ],
    },
    pit([
      T('GBN 的接收窗口是 1，发送窗口上限 2^n − 1；SR 的发送窗口上限 2^(n−1)。', 'GBN: receive window 1, send window ≤ 2^n − 1; SR: send window ≤ 2^(n−1).'),
      T('GBN 的确认是累积的：收到 ACK n 就说明 n 及以前都收到了，前面丢失的确认不影响。', 'GBN ACKs are cumulative, so an earlier lost ACK does no harm.'),
      T('算利用率时 RTT 要包含往返两次传播时延，发送确认的时间题目没说就忽略。', 'RTT covers both directions; ignore the ACK time unless given.'),
    ]),
  ],
};

export const SUBNET_PRINCIPLE = {
  sections: [
    {
      id: 'addr',
      title: T('IP 地址的结构', 'Structure of an IP address'),
      blocks: [
        { p: T('IPv4 地址 32 位，分成**网络号**（网络前缀）和**主机号**两部分，写成点分十进制。最早按类划分：A 类前 8 位是网络号，B 类 16 位，C 类 24 位；现在普遍用 **CIDR**，网络前缀的位数 n 写在斜线后面：a.b.c.d/n。', 'An IPv4 address has a **network prefix** and a **host part**. Classes A, B and C fixed the split at 8, 16 and 24 bits; **CIDR** writes it explicitly as a.b.c.d/n.') },
        {
          table: {
            head: [T('特殊地址', 'Special address'), T('样子', 'Form'), T('用途', 'Use')],
            rows: [
              [T('网络地址', 'Network address'), T('主机号全 0', 'host bits all 0'), T('表示这个网络本身，不能分给主机', 'names the network; not assignable')],
              [T('直接广播地址', 'Directed broadcast'), T('主机号全 1', 'host bits all 1'), T('发给这个网络上的所有主机', 'every host on that network')],
              [T('受限广播', 'Limited broadcast'), '255.255.255.255', T('本网络内广播，路由器不转发', 'local broadcast, never forwarded')],
              [T('本机地址', 'This host'), '0.0.0.0', T('还不知道自己地址时用作源地址（如 DHCP）', 'source before an address is known')],
              [T('环回地址', 'Loopback'), '127.x.x.x', T('本机测试，不会发到网络上', 'local testing only')],
              [T('私有地址', 'Private'), '10/8, 172.16/12, 192.168/16', T('只能在内部使用，出去要经 NAT', 'internal use; needs NAT outside')],
            ],
          },
        },
      ],
    },
    {
      id: 'mask',
      title: T('子网掩码', 'Subnet masks'),
      blocks: [
        { p: T('子网掩码也是 32 位，网络前缀部分全 1、主机号部分全 0。/26 就是 255.255.255.192。IP 地址和掩码**按位与**，得到所在网络的网络地址。', 'A mask has ones over the prefix and zeros over the host part (/26 = 255.255.255.192). Address AND mask gives the network address.') },
        { formula: T('可分配主机数 = 2^主机位数 − 2', 'usable hosts = 2^host bits − 2') },
        { p: T('减 2 是因为主机号全 0（网络地址）和全 1（广播地址）不能分配给主机。', 'Subtract two for the network and broadcast addresses.') },
      ],
    },
    {
      id: 'split',
      title: T('划分子网', 'Subnetting'),
      blocks: [
        {
          steps: [
            T('按主机数确定主机位：最小的 h 使 2^h − 2 ≥ 需要的主机数（别忘了路由器接口也要占地址）；', 'pick the smallest h with 2^h − 2 ≥ hosts needed (router interfaces count);'),
            T('前缀长度 = 32 − h，地址块大小 = 2^h；', 'prefix = 32 − h, block size = 2^h;'),
            T('**VLSM（变长子网掩码）**：先给需要主机最多的子网分配，从地址块开头依次往后排，每个子网的起始地址必须是它块大小的整数倍；', '**VLSM**: allocate the largest subnet first, packing from the start; each subnet starts on a multiple of its block size;'),
            T('写出每个子网的网络地址、广播地址、可用地址范围、掩码。', 'list network, broadcast, usable range and mask for each.'),
          ],
        },
        { tip: T('从大到小分配可以保证每个子网都对齐，不会出现「中间空出一小块却放不下」的碎片。', 'Largest-first keeps every subnet aligned and avoids unusable gaps.') },
      ],
    },
    {
      id: 'super',
      title: T('构造超网（路由聚合）', 'Supernetting'),
      blocks: [
        { p: T('和划分子网相反，把多个连续的小地址块合成一个大块，用更短的前缀表示，可以减少路由表项。求法：把这些网络地址写成二进制，取从高位起**共同的部分**作为新的网络前缀。', 'The reverse of subnetting: merge contiguous blocks under a shorter prefix by keeping their **common leading bits**.') },
      ],
    },
    pit([
      T('可用主机数要减 2；点对点链路如果题目说用 /31，那是特例。', 'Usable hosts subtract 2 (a /31 point-to-point link is a special case).'),
      T('路由器的每个接口都要占一个地址。', 'Every router interface needs an address.'),
      T('VLSM 要从主机数最多的子网开始分配。', 'VLSM allocates the largest subnet first.'),
      T('同一网络里两台主机能直接通信，要求它们的网络号（地址与掩码按位与）相同。', 'Two hosts talk directly only if address AND mask agree.'),
    ]),
  ],
};

export const CC_PRINCIPLE = {
  sections: [
    {
      id: 'why',
      title: T('拥塞控制和流量控制', 'Congestion control vs flow control'),
      blocks: [
        { p: T('**流量控制**是点对点的：让发送方别发得比接收方处理得快，靠接收方通告的接收窗口 rwnd。**拥塞控制**是全局的：防止太多数据注入网络把路由器、链路压垮，发送方根据丢包等迹象自己估计一个拥塞窗口 cwnd。', '**Flow control** is end to end: don’t outrun the receiver, using its advertised rwnd. **Congestion control** is global: don’t overload the network, using the sender’s own estimate cwnd.') },
        { formula: T('发送窗口 = min(rwnd, cwnd)', 'send window = min(rwnd, cwnd)') },
      ],
    },
    {
      id: 'algo',
      title: T('四个算法', 'The four algorithms'),
      blocks: [
        {
          table: {
            head: [T('算法', 'Algorithm'), T('什么时候', 'When'), T('cwnd 怎么变', 'cwnd change')],
            rows: [
              [T('慢开始', 'Slow start'), T('cwnd < ssthresh', 'cwnd < ssthresh'), T('每经过一个 RTT 翻倍（每收到一个确认加 1 个 MSS）', 'doubles every RTT (+1 MSS per ACK)')],
              [T('拥塞避免', 'Congestion avoidance'), T('cwnd ≥ ssthresh', 'cwnd ≥ ssthresh'), T('每经过一个 RTT 加 1（加法增大）', '+1 per RTT (additive increase)')],
              [T('超时', 'Timeout'), T('重传计时器超时', 'retransmission timer fires'), T('ssthresh = cwnd ÷ 2，cwnd = 1，重新慢开始', 'ssthresh = cwnd/2, cwnd = 1, slow start')],
              [T('快重传 + 快恢复', 'Fast retransmit + recovery'), T('连续收到 3 个重复确认', 'three duplicate ACKs'), T('立即重传丢失的报文段；ssthresh = cwnd ÷ 2，cwnd = ssthresh，进入拥塞避免', 'resend at once; ssthresh = cwnd/2, cwnd = ssthresh, congestion avoidance')],
            ],
          },
        },
        { p: T('「乘法减小」指出现拥塞时把 ssthresh 减为当前 cwnd 的一半；「加法增大」指拥塞避免阶段 cwnd 线性增长。两者合起来叫 AIMD。', 'Halving on congestion and growing linearly afterwards is **AIMD**.') },
      ],
    },
    {
      id: 'dup',
      title: T('为什么 3 个重复确认不用从 1 开始', 'Why three duplicate ACKs skip slow start'),
      blocks: [
        { p: T('能收到重复确认，说明后面的报文段还在陆续到达接收方，网络并没有严重拥塞，只是丢了个别报文段。所以不必像超时那样把 cwnd 降到 1，而是降到一半直接进入拥塞避免——这就是快恢复。超时则说明网络可能真的堵了，要从头慢开始。', 'Duplicate ACKs prove later segments still arrive, so the network is not badly congested: halve and continue (fast recovery). A timeout suggests real congestion, so restart from 1.') },
        { warn: T('快恢复后 cwnd 的取值有两种写法：教材常写 cwnd = 新的 ssthresh；RFC 中先设为 ssthresh + 3。本课按教材写法。', 'Textbooks set cwnd = ssthresh after fast recovery; the RFC uses ssthresh + 3. This lesson follows the textbook.') },
      ],
    },
    {
      id: 'read',
      title: T('怎么读题', 'Reading the question'),
      blocks: [
        {
          list: [
            T('「一轮」= 一个 RTT。题目问「第 n 轮发送时 cwnd 是多少」，从第 1 轮 cwnd = 1 开始数。', 'A round is one RTT; count from cwnd = 1 in round 1.'),
            T('慢开始翻倍时如果会超过 ssthresh，本课约定只增到 ssthresh，下一轮开始拥塞避免。', 'If doubling would overshoot ssthresh, stop at ssthresh here.'),
            T('发送窗口受 rwnd 限制：cwnd 再大，实际也只能发 min(rwnd, cwnd)。', 'The actual window is min(rwnd, cwnd).'),
          ],
        },
      ],
    },
    pit([
      T('超时：cwnd 变 1；3 个重复确认：cwnd 变为新的 ssthresh。两种情况 ssthresh 都是当时 cwnd 的一半。', 'Timeout → cwnd = 1; three dup ACKs → cwnd = new ssthresh; both halve ssthresh.'),
      T('慢开始并不慢，是指数增长；「慢」是指从 1 开始。', 'Slow start grows exponentially; it is “slow” only because it starts at 1.'),
      T('拥塞窗口的单位通常是 MSS（最大报文段），不是字节。', 'cwnd is counted in MSS here, not bytes.'),
    ]),
  ],
};

export const TCP_PRINCIPLE = {
  sections: [
    {
      id: 'header',
      title: T('TCP 首部的关键字段', 'Key TCP header fields'),
      blocks: [
        {
          table: {
            head: [T('字段', 'Field'), T('作用', 'Purpose')],
            rows: [
              [T('源端口、目的端口', 'Ports'), T('标识发送和接收的进程', 'identify the two processes')],
              [T('序号 seq', 'Sequence number'), T('本报文段数据第一个字节的编号（按字节编号）', 'number of the first data byte (byte-numbered)')],
              [T('确认号 ack', 'Acknowledgment'), T('期望收到对方下一个报文段第一个字节的序号；ack = N 表示 N − 1 及以前都收到了', 'next byte expected; everything before it is received')],
              [T('数据偏移', 'Data offset'), T('首部长度，以 4 B 为单位，首部 20～60 B', 'header length in 4-byte units, 20–60 B')],
              ['SYN / ACK / FIN / RST', T('建立连接 / 确认号有效 / 释放连接 / 重置连接', 'open / ACK valid / close / reset')],
              [T('窗口', 'Window'), T('接收窗口 rwnd，告诉对方自己还能收多少字节（流量控制）', 'receive window for flow control')],
              [T('检验和', 'Checksum'), T('检验首部和数据，计算时要加伪首部', 'covers header, data and a pseudo-header')],
            ],
          },
        },
      ],
    },
    {
      id: 'open',
      title: T('三次握手', 'Three-way handshake'),
      blocks: [
        {
          steps: [
            T('客户端发 SYN = 1，seq = x，进入 SYN-SENT。SYN 报文段不能带数据，但要消耗一个序号；', 'Client: SYN = 1, seq = x (no data, but consumes one number);'),
            T('服务器发 SYN = 1、ACK = 1，seq = y，ack = x + 1，进入 SYN-RCVD；', 'Server: SYN = 1, ACK = 1, seq = y, ack = x + 1;'),
            T('客户端发 ACK = 1，seq = x + 1，ack = y + 1，双方进入 ESTABLISHED。这个 ACK 报文段可以携带数据，不带数据则不消耗序号。', 'Client: ACK = 1, seq = x + 1, ack = y + 1; may carry data.'),
          ],
        },
        { tip: T('为什么要三次：防止已经失效的旧连接请求突然到达服务器，服务器误以为是新请求而建立连接、白白等待。', 'Three messages stop a stale connection request from opening a phantom connection.') },
        { warn: T('SYN 洪泛攻击：攻击者发大量 SYN 却不完成第三次握手，耗尽服务器的半连接资源。', 'SYN flooding leaves many half-open connections.') },
      ],
    },
    {
      id: 'close',
      title: T('四次挥手', 'Four-way close'),
      blocks: [
        {
          steps: [
            T('客户端发 FIN = 1，seq = u，进入 FIN-WAIT-1（FIN 也消耗一个序号）；', 'Client FIN, seq = u (consumes a number);'),
            T('服务器回 ACK，ack = u + 1，进入 CLOSE-WAIT；客户端收到后进入 FIN-WAIT-2。这时是**半关闭**：服务器还可以继续发数据；', 'Server ACKs u + 1: a **half-close**; the server may still send;'),
            T('服务器发完了，发 FIN = 1、ACK = 1，seq = w，ack = u + 1，进入 LAST-ACK；', 'Server FIN, seq = w, ack = u + 1;'),
            T('客户端回 ACK，ack = w + 1，进入 **TIME-WAIT**，等 2MSL 后才关闭。', 'Client ACKs w + 1 and waits **2MSL** in TIME-WAIT.'),
          ],
        },
        { tip: T('等 2MSL 的原因：保证最后一个 ACK 丢了时，能收到服务器重传的 FIN 并再次确认；并让本连接的旧报文段都从网络中消失，不影响下一个新连接。', '2MSL lets the final ACK be resent if lost and lets stale segments die out.') },
      ],
    },
    {
      id: 'reliable',
      title: T('可靠传输', 'Reliable delivery'),
      blocks: [
        { p: T('TCP 按字节编号，用**累积确认**、**超时重传**和**快重传**（收到 3 个重复确认就立即重传）保证可靠。超时重传时间 RTO 根据测得的往返时间动态计算：平滑往返时间 RTTs = (1 − α)·旧 RTTs + α·新样本，RTO = RTTs + 4·RTTd。', 'TCP numbers bytes and uses **cumulative ACKs**, **timeouts** and **fast retransmit**. RTO adapts: RTTs = (1 − α)·RTTs + α·sample, RTO = RTTs + 4·RTTd.') },
      ],
    },
    pit([
      T('SYN 和 FIN 都消耗一个序号，纯 ACK 不消耗。', 'SYN and FIN consume a sequence number; a bare ACK does not.'),
      T('确认号是「期望收到的下一个字节」，不是「收到的最后一个字节」。', 'The ack number is the next byte expected.'),
      T('TIME-WAIT 在主动关闭的一方。', 'TIME-WAIT happens on the side that closes first.'),
    ]),
  ],
};

export const HTTP_PRINCIPLE = {
  sections: [
    {
      id: 'flow',
      title: T('访问一个网页发生了什么', 'What happens when you open a page'),
      blocks: [
        {
          steps: [
            T('浏览器分析 URL，用 **DNS** 把域名解析成 IP 地址；', 'resolve the host name with **DNS**;'),
            T('和服务器 80 端口（HTTPS 是 443）建立 **TCP 连接**（三次握手）；', 'open a **TCP connection** to port 80 (443 for HTTPS);'),
            T('发送 **HTTP 请求报文**，服务器返回**响应报文**；', 'send an **HTTP request**, get a **response**;'),
            T('浏览器解析 HTML，对其中引用的图片、脚本等再发请求；', 'parse the HTML and fetch embedded objects;'),
            T('释放 TCP 连接（或保持，供后续请求复用）。', 'close the connection, or keep it for reuse.'),
          ],
        },
      ],
    },
    {
      id: 'msg',
      title: T('报文格式', 'Message format'),
      blocks: [
        { p: T('请求报文：**请求行**（方法 URL 版本，如 GET /index.html HTTP/1.1）+ 首部行 + 空行 + 实体主体。响应报文：**状态行**（版本 状态码 短语，如 HTTP/1.1 200 OK）+ 首部行 + 空行 + 实体主体。都是 ASCII 文本。', 'Request: **request line** (method URL version) + headers + blank line + body. Response: **status line** (version code phrase) + headers + blank line + body. Both are ASCII text.') },
        {
          table: {
            head: [T('状态码', 'Code'), T('含义', 'Meaning')],
            rows: [
              ['1xx', T('通知信息', 'informational')],
              ['2xx', T('成功，如 200 OK', 'success, e.g. 200 OK')],
              ['3xx', T('重定向，如 301 永久转移、304 未修改', 'redirect, e.g. 301, 304 Not Modified')],
              ['4xx', T('客户端错误，如 404 找不到', 'client error, e.g. 404')],
              ['5xx', T('服务器错误，如 500', 'server error, e.g. 500')],
            ],
          },
        },
      ],
    },
    {
      id: 'conn',
      title: T('非持续连接与持续连接', 'Non-persistent and persistent connections'),
      blocks: [
        { p: T('HTTP 本身是**无状态**的。**非持续连接**（HTTP/1.0）：每请求一个对象都要新建一个 TCP 连接，每个对象至少要 2 RTT（建连 1 个 + 请求响应 1 个）加传输时间。**持续连接**（HTTP/1.1 默认）：一个 TCP 连接上可以连续传多个对象。', 'HTTP is **stateless**. **Non-persistent** (HTTP/1.0): a new TCP connection per object, at least 2 RTT each. **Persistent** (HTTP/1.1 default): many objects over one connection.') },
        { p: T('持续连接又分**非流水线**（收到前一个响应才发下一个请求，每个对象 1 RTT）和**流水线**（连续发出请求，所有对象合计约 1 RTT）。', 'Persistent connections may be **non-pipelined** (1 RTT per object) or **pipelined** (about 1 RTT for all).') },
        { tip: T('Cookie 让服务器在无状态的 HTTP 上「记住」用户；代理服务器（Web 缓存）可以就近返回缓存的对象，减少时延和出口流量。', 'Cookies add state on top of HTTP; proxy caches shorten delay and save bandwidth.') },
      ],
    },
    pit([
      T('HTTP 用 TCP（端口 80），不是 UDP。', 'HTTP runs over TCP port 80.'),
      T('算时间时别漏掉 DNS 查询和 TCP 建立连接的 RTT。', 'Count the DNS lookup and the TCP handshake RTT.'),
      T('GET 把参数放在 URL 里，POST 放在实体主体里。', 'GET carries parameters in the URL, POST in the body.'),
    ]),
  ],
};

export const DNS_PRINCIPLE = {
  sections: [
    {
      id: 'name',
      title: T('域名的层次结构', 'The name hierarchy'),
      blocks: [
        { p: T('域名从右往左级别降低：www.example.edu.cn 中 cn 是顶级域，edu 是二级域……每一级由上一级授权管理。DNS 是一个**分布式数据库**，没有哪一台服务器保存全部映射。', 'Names get more specific right to left; each level is delegated by its parent. DNS is a **distributed database**.') },
        {
          table: {
            head: [T('服务器', 'Server'), T('作用', 'Role')],
            rows: [
              [T('根域名服务器', 'Root'), T('知道所有顶级域名服务器的地址（全球 13 个根地址，每个有很多镜像）', 'knows every TLD server')],
              [T('顶级域名服务器', 'TLD'), T('管理在它下面注册的二级域名', 'manages second-level names under it')],
              [T('权限域名服务器', 'Authoritative'), T('负责一个区，能给出最终的 IP 地址', 'gives the final answer for its zone')],
              [T('本地域名服务器', 'Local'), T('主机的查询先发给它，由它代为查询；不属于层次结构', 'receives the host’s queries; not part of the tree')],
            ],
          },
        },
      ],
    },
    {
      id: 'query',
      title: T('递归查询和迭代查询', 'Recursive and iterative queries'),
      blocks: [
        { p: T('主机向本地域名服务器的查询一般是**递归查询**：本地域名服务器必须给出最终答案（或报告查不到）。本地域名服务器向根、顶级、权限服务器的查询一般是**迭代查询**：对方只告诉「下一步该去问谁」，由本地域名服务器自己接着问。', 'Host → local server is usually **recursive**: the local server must return the answer. Local server → root/TLD/authoritative is usually **iterative**: each replies with whom to ask next.') },
        { tip: T('数次数时：主机发 1 次请求，本地域名服务器迭代依次问根、顶级、权限，共 3 次（各 1 个往返）。如果本地服务器有缓存，可能一次都不用问。', 'Counting: one request from the host, then root, TLD and authoritative in turn — unless a cache answers first.') },
        { p: T('**高速缓存**：域名服务器把查过的结果缓存一段时间（TTL），后来的相同查询直接返回，大大减少查询量。', '**Caching** for the record’s TTL saves most queries.') },
      ],
    },
    pit([
      T('DNS 主要用 UDP 53 端口（报文太长或区域传送时用 TCP）。', 'DNS mainly uses UDP port 53 (TCP for large replies or zone transfers).'),
      T('本地域名服务器不属于域名服务器的层次结构。', 'The local server is outside the hierarchy.'),
      T('递归与迭代说的是「谁负责继续问」，题目常问某一次是哪种。', 'Recursive vs iterative is about who keeps asking.'),
    ]),
  ],
};

export const DHCP_PRINCIPLE = {
  sections: [
    {
      id: 'four',
      title: T('DHCP 的四个报文', 'The four DHCP messages'),
      blocks: [
        {
          steps: [
            T('**DHCP DISCOVER**：新主机还没有地址，用源地址 0.0.0.0、目的地址 255.255.255.255 **广播**，寻找 DHCP 服务器；', '**DISCOVER**: broadcast from 0.0.0.0 to 255.255.255.255;'),
            T('**DHCP OFFER**：服务器提供一个可用的 IP 地址（以及掩码、默认网关、DNS 服务器、租期）；', '**OFFER**: a server proposes an address, mask, gateway, DNS and lease;'),
            T('**DHCP REQUEST**：主机选中一个 OFFER，仍用**广播**发出请求（让其他服务器也知道没选它们）；', '**REQUEST**: the host accepts one, still by **broadcast** so the others know;'),
            T('**DHCP ACK**：服务器确认，主机开始使用这个地址，直到租期到期（快到期时要续约）。', '**ACK**: confirmed; the address is leased.'),
          ],
        },
        { tip: T('DHCP 报文封装在 UDP 里：客户端 68 端口，服务器 67 端口。它属于应用层协议，但考纲放在网络层讲，因为它解决的是「怎样获得 IP 地址」。', 'DHCP rides in UDP (client 68, server 67); an application protocol taught with the network layer.') },
      ],
    },
    {
      id: 'relay',
      title: T('中继代理', 'Relay agents'),
      blocks: [
        { p: T('广播不能穿过路由器。为了不在每个网络都放一台 DHCP 服务器，可以在路由器上配置 **DHCP 中继代理**：它收到本网络的 DISCOVER 后，以单播转发给别处的 DHCP 服务器。', 'Broadcasts stop at routers, so a **relay agent** on the router unicasts requests to a remote server.') },
      ],
    },
    pit([
      T('DISCOVER 和 REQUEST 都是广播；OFFER、ACK 视实现可能广播也可能单播。', 'DISCOVER and REQUEST are broadcast.'),
      T('DHCP 用 UDP，不是 TCP。', 'DHCP uses UDP.'),
      T('DHCP 分配的是租用的地址，到期不续就要归还。', 'Addresses are leased, not owned.'),
    ]),
  ],
};

export const ICMP_PRINCIPLE = {
  sections: [
    {
      id: 'what',
      title: T('ICMP 做什么', 'What ICMP does'),
      blocks: [
        { p: T('IP 是尽最大努力交付的，出错了不会自己通知谁。**ICMP**（网际控制报文协议）让主机和路由器报告差错和异常情况。ICMP 报文装在 IP 数据报里发送（协议字段 = 1），但仍算网络层协议。', 'IP is best effort and silent on failure. **ICMP** lets hosts and routers report errors. It rides inside IP (protocol 1) yet belongs to the network layer.') },
        {
          table: {
            head: [T('类别', 'Kind'), T('报文', 'Messages')],
            rows: [
              [T('差错报告', 'Error reports'), T('终点不可达、时间超过（TTL 减到 0，或分片重组超时）、参数问题、改变路由（重定向）', 'destination unreachable, time exceeded, parameter problem, redirect')],
              [T('询问', 'Queries'), T('回送请求和回答（ping）、时间戳请求和回答', 'echo request/reply (ping), timestamp')],
            ],
          },
        },
        { warn: T('以下情况**不发** ICMP 差错报文：对 ICMP 差错报文本身；对第一个分片以外的后续分片；对多播地址的数据报；对特殊地址（127.0.0.0、0.0.0.0）的数据报。', 'No ICMP error is sent about an ICMP error, non-first fragments, multicast datagrams, or special addresses.') },
      ],
    },
    {
      id: 'apps',
      title: T('ping 和 traceroute', 'ping and traceroute'),
      blocks: [
        { p: T('**ping** 发 ICMP 回送请求，对方回 ICMP 回送回答，用来测试连通性和往返时间。它直接用 ICMP，不经过传输层。', '**ping** uses echo request/reply directly, without a transport layer.') },
        { p: T('**traceroute**（Windows 是 tracert）依次发 TTL = 1、2、3……的数据报。TTL 在第 n 个路由器减到 0，那个路由器就发回 ICMP 时间超过报文，于是知道了路径上第 n 个路由器的地址；到达终点时收到的是终点不可达（端口不可达）或回送回答。', '**traceroute** sends TTL = 1, 2, 3, … ; each router where TTL hits zero replies with time exceeded, revealing the path.') },
      ],
    },
    pit([
      T('ICMP 封装在 IP 里，但属于网络层，不是传输层。', 'ICMP is carried in IP but is a network-layer protocol.'),
      T('ping 用回送请求 / 回答；traceroute 利用时间超过报文。', 'ping uses echo; traceroute uses time exceeded.'),
      T('TTL 减为 0 时丢弃并发「时间超过」，不是「终点不可达」。', 'TTL expiry triggers time exceeded, not unreachable.'),
    ]),
  ],
};

export const HTTPS_PRINCIPLE = {
  sections: [
    {
      id: 'need',
      title: T('网络安全要解决什么', 'What security must provide'),
      blocks: [
        {
          list: [
            T('**机密性**：别人截获了也看不懂——加密；', '**Confidentiality**: encryption;'),
            T('**完整性**：被篡改了能发现——报文摘要 / MAC；', '**Integrity**: digests and MACs;'),
            T('**鉴别**：确认对方是谁——数字签名、证书。', '**Authentication**: signatures and certificates.'),
          ],
        },
        {
          table: {
            head: ['', T('对称密钥', 'Symmetric'), T('公钥（非对称）', 'Public key')],
            rows: [
              [T('密钥', 'Keys'), T('加密、解密用同一个密钥', 'one shared key'), T('公钥公开，私钥自己保存；公钥加密只有私钥能解', 'public key encrypts, private key decrypts')],
              [T('例子', 'Examples'), 'DES、AES', 'RSA'],
              [T('特点', 'Trade-off'), T('快，但密钥怎么安全地交给对方是难题', 'fast, but key distribution is hard'), T('不用事先共享密钥，但计算慢', 'no shared secret, but slow')],
            ],
          },
        },
      ],
    },
    {
      id: 'sign',
      title: T('数字签名与证书', 'Signatures and certificates'),
      blocks: [
        { p: T('**数字签名**：发送方用**自己的私钥**对报文摘要加密，接收方用发送方的公钥解开核对。能证明报文确实是对方发的（不可否认），并且没被改过。', 'A **signature** encrypts a digest with the sender’s **private key**; anyone can check it with the public key.') },
        { p: T('**证书**：认证中心 CA 用它的私钥给「某个名字对应某个公钥」签名，浏览器内置了可信 CA 的公钥，用来验证网站证书，防止有人冒充网站给出假公钥。', 'A **certificate** is a CA’s signature binding a name to a public key; browsers trust built-in CA keys.') },
        { warn: T('加密用**接收方的公钥**（只有接收方能解）；签名用**发送方的私钥**（大家都能验）。两者别弄反。', 'Encrypt with the **receiver’s public key**; sign with the **sender’s private key**.') },
      ],
    },
    {
      id: 'tls',
      title: T('HTTPS 与 TLS', 'HTTPS and TLS'),
      blocks: [
        { p: T('HTTPS = HTTP over TLS（以前叫 SSL），默认端口 443。TLS 位于应用层和传输层（TCP）之间。握手时双方协商算法，客户端验证服务器的证书，然后用公钥技术协商出本次会话的**对称密钥**；之后的数据都用这个对称密钥加密，并附上 MAC 保证完整性。', 'HTTPS is HTTP over TLS on port 443. The handshake verifies the server certificate and agrees on a **session key** via public-key methods; bulk data then uses fast symmetric encryption plus a MAC.') },
        { tip: T('用公钥技术解决「怎么安全地交换密钥」，用对称密钥解决「加密大量数据要快」——两者结合，这是几乎所有安全协议的套路。', 'Public keys to exchange a secret, symmetric keys for speed: the pattern of nearly every secure protocol.') },
      ],
    },
    pit([
      T('TLS 运行在 TCP 之上，HTTPS 先建立 TCP 连接，再做 TLS 握手。', 'TLS runs over TCP: TCP handshake first, then TLS.'),
      T('数据传输阶段用的是对称密钥，不是公钥。', 'Bulk data uses the symmetric session key.'),
      T('这部分是拓展内容，近年考纲要求以概念为主。', 'This topic is mostly conceptual in the exam.'),
    ]),
  ],
};

export const NET_PRINCIPLES = { http: HTTP_PRINCIPLE, dns: DNS_PRINCIPLE, tcp: TCP_PRINCIPLE, dhcp: DHCP_PRINCIPLE, icmp: ICMP_PRINCIPLE, https: HTTPS_PRINCIPLE };
