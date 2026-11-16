// 组帧的纯计算：
//   · 字节填充（PPP 异步传输）：标志字节 0x7E，转义字节 0x7D；数据里的 7E → 7D 5E，7D → 7D 5D；
//     选上「控制字符也转义」时，小于 0x20 的字节 x → 7D (x ⊕ 0x20)；
//   · 比特填充（HDLC / PPP 同步传输）：标志 01111110；发送方在数据里每遇到连续 5 个 1 就插一个 0，接收方反过来删掉。
// 两种都算出发送的帧，并让接收方还原，核对和原数据一样。

const err = (e) => ({ ok: false, errors: [e] });
export const FLAG = 0x7e;
export const ESC = 0x7d;
export const BITFLAG = '01111110';
const hx = (b) => b.toString(16).toUpperCase().padStart(2, '0');

export function parseBytes(text) {
  const parts = String(text ?? '').trim().split(/[\s,，]+/).filter(Boolean);
  if (!parts.length || parts.length > 16 || parts.some((p) => !/^(0x)?[0-9a-fA-F]{1,2}$/.test(p))) return null;
  return parts.map((p) => parseInt(p.replace(/^0x/, ''), 16));
}

export function byteStuff(bytes, ctl = false) {
  const out = [];
  const steps = [];
  for (const [i, b] of bytes.entries()) {
    let add;
    let why = null;
    if (b === FLAG) {
      add = [ESC, 0x5e];
      why = 'flag';
    } else if (b === ESC) {
      add = [ESC, 0x5d];
      why = 'esc';
    } else if (ctl && b < 0x20) {
      add = [ESC, b ^ 0x20];
      why = 'ctl';
    } else add = [b];
    const at = out.length;
    out.push(...add);
    steps.push({ i, b, add, why, at });
  }
  return { out, steps };
}

export function byteUnstuff(out) {
  const back = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] === ESC) back.push(out[++i] ^ 0x20);
    else back.push(out[i]);
  }
  return back;
}

export function bitStuff(bits) {
  let out = '';
  let run = 0;
  const steps = []; // 每插一个 0 记一段
  let from = 0;
  for (let i = 0; i < bits.length; i++) {
    out += bits[i];
    run = bits[i] === '1' ? run + 1 : 0;
    if (run === 5) {
      out += '0';
      steps.push({ from, to: i, at: out.length - 1 });
      from = i + 1;
      run = 0;
    }
  }
  if (from < bits.length) steps.push({ from, to: bits.length - 1, at: null });
  return { out, steps };
}

export function bitUnstuff(out) {
  let back = '';
  let run = 0;
  for (let i = 0; i < out.length; i++) {
    back += out[i];
    run = out[i] === '1' ? run + 1 : 0;
    if (run === 5) {
      i++; // 跳过插进去的 0
      run = 0;
    }
  }
  return back;
}

export function framing({ mode = 'byte', data = '', ctl = false }) {
  if (mode === 'byte') {
    const bytes = parseBytes(data);
    if (!bytes) return err('bytes');
    const { out, steps } = byteStuff(bytes, ctl);
    const back = byteUnstuff(out);
    return { ok: true, mode, ctl, input: bytes, out, steps, frame: [FLAG, ...out, FLAG], back, same: back.join() === bytes.join(), added: out.length - bytes.length, show: hx };
  }
  if (mode === 'bit') {
    const bits = String(data ?? '').replace(/[\s,]/g, '');
    if (!/^[01]{1,48}$/.test(bits)) return err('bits');
    const { out, steps } = bitStuff(bits);
    const back = bitUnstuff(out);
    return { ok: true, mode, input: bits, out, steps, frame: BITFLAG + out + BITFLAG, back, same: back === bits, added: out.length - bits.length, flagInside: out.includes(BITFLAG) };
  }
  return err('mode');
}
export { hx };
