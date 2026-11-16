// 以太网交换机自学习的纯计算：一台 4 口交换机，A、B、C 接 1～3 口，D、E 经一个集线器共同接在 4 口。按顺序处理一串帧：
// 先学源地址（记下 MAC → 端口），再看目的地址：广播或查不到就泛洪，查到了在别的端口就转发，就在进来的端口就丢弃。
//
// 约定（界面上写明）：
//   · 每个帧占一个时刻，第 1 个帧在时刻 1；老化时间 age > 0 时，记录时刻 + age ≤ 当前时刻的表项先删掉；
//   · 打开 VLAN 时，1、2 口属于 VLAN 10，3、4 口属于 VLAN 20；转发表按 (VLAN, MAC) 记，泛洪只在本 VLAN 里；
//   · 主机名就当 MAC 地址用；FF 表示广播地址。

const err = (errors) => ({ ok: false, errors });
export const HOSTS = { A: 1, B: 2, C: 3, D: 4, E: 4 }; // D、E 经集线器接在 4 口
export const PORTS = [1, 2, 3, 4];
export const vlanOf = (port, on) => (on ? (port <= 2 ? 10 : 20) : 1);

export function parseFrames(text) {
  const items = String(text ?? '')
    .split(/[,，\s]+/)
    .filter(Boolean);
  const out = [];
  for (const it of items) {
    const m = /^([A-Ea-e])\s*(?:>|→|->)\s*([A-Ea-e]|FF|ff)$/.exec(it);
    if (!m) return null;
    out.push({ src: m[1].toUpperCase(), dst: m[2].toUpperCase() });
  }
  return out;
}

export function learnSwitch({ frames: text = 'A>B, B>A, C>A, A>FF, D>C', vlan = false, age = 0 }) {
  const frames = parseFrames(text);
  const errors = [];
  if (!frames || !frames.length || frames.length > 12) errors.push('frames');
  else if (frames.some((f) => f.src === f.dst)) errors.push('self');
  if (!Number.isInteger(age) || age < 0 || age > 20) errors.push('age');
  if (errors.length) return err(errors);
  const table = []; // { mac, port, vlan, t }
  const steps = [];
  frames.forEach((f, i) => {
    const t = i + 1;
    // 老化
    const aged = [];
    if (age > 0) {
      for (let j = table.length - 1; j >= 0; j--) {
        if (table[j].t + age <= t) aged.unshift(table.splice(j, 1)[0].mac);
      }
    }
    const inPort = HOSTS[f.src];
    const v = vlanOf(inPort, vlan);
    // 学习
    let learn;
    const old = table.find((e) => e.mac === f.src && e.vlan === v);
    if (old) {
      learn = { mac: f.src, port: inPort, kind: 'refresh', from: old.t };
      old.t = t;
      old.port = inPort;
    } else {
      table.push({ mac: f.src, port: inPort, vlan: v, t });
      learn = { mac: f.src, port: inPort, kind: 'new' };
    }
    // 转发
    const same = PORTS.filter((p) => p !== inPort && vlanOf(p, vlan) === v);
    let action;
    let out;
    let hit = null;
    if (f.dst === 'FF') {
      action = 'broadcast';
      out = same;
    } else {
      hit = table.find((e) => e.mac === f.dst && e.vlan === v) ?? null;
      if (!hit) {
        action = 'flood';
        out = same;
      } else if (hit.port === inPort) {
        action = 'filter';
        out = [];
      } else {
        action = 'forward';
        out = [hit.port];
      }
    }
    // 谁真正收下：目的主机在 out 里才收到；广播时 out 里的都收
    const dstPort = f.dst === 'FF' ? null : HOSTS[f.dst];
    const delivered = f.dst === 'FF' ? out.flatMap(hostsAt) : out.includes(dstPort) || action === 'filter' ? [f.dst] : []; // 丢弃时目的主机已经从集线器上收到了
    const otherVlan = vlan && f.dst !== 'FF' && vlanOf(dstPort, vlan) !== v;
    steps.push({ t, ...f, inPort, vlan: v, aged, learn, action, out, hit: hit ? { ...hit } : null, delivered, otherVlan, table: table.map((e) => ({ ...e })) });
  });
  const floods = steps.filter((s) => s.action === 'flood' || s.action === 'broadcast').length;
  return { ok: true, vlan, age, frames, steps, floods, final: table.map((e) => ({ ...e })) };
}

export const hostsAt = (p) => Object.keys(HOSTS).filter((h) => HOSTS[h] === p);
