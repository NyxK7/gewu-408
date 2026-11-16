// 计算机系统概述和校验码的纯计算：CPU 性能（CPI、MIPS、执行时间）、海明码。
//
// 约定（界面上写明）：
//   · 主频以 MHz 给出，指令条数以「百万条」给出；执行时间 = 指令条数 × CPI ÷ 主频；
//   · 海明码：校验位放在 2 的幂次位置（1、2、4、8……），数据位按顺序放在其余位置（从低位置往高位置）；偶校验。

const err = (e) => ({ ok: false, errors: [e] });

export function perf({ mix, cpiA, cpiB, fA, fB, n }) {
  if (!Array.isArray(mix) || !mix.length || mix.length > 6) return err('mix');
  if (mix.reduce((a, b) => a + b, 0) !== 100) return err('sum');
  if (cpiA?.length !== mix.length || cpiB?.length !== mix.length || [...cpiA, ...cpiB].some((c) => !(c > 0))) return err('cpi');
  if (!(fA > 0 && fB > 0 && n > 0)) return err('f');
  const mk = (cpi, f) => {
    const terms = mix.map((p, i) => (p / 100) * cpi[i]);
    const CPI = terms.reduce((a, b) => a + b, 0);
    return { cpi, f, terms, CPI, mips: f / CPI, time: (n * CPI) / f, cycles: n * CPI };
  };
  const A = mk(cpiA, fA);
  const B = mk(cpiB, fB);
  return { ok: true, mix, n, A, B, faster: A.time <= B.time ? 'A' : 'B', ratio: Math.max(A.time, B.time) / Math.min(A.time, B.time) };
}

export function hamming({ data, flip = 0 }) {
  if (!/^[01]{1,16}$/.test(data ?? '')) return err('data');
  const d = [...data].map(Number);
  const n = d.length;
  let k = 0;
  while (2 ** k < n + k + 1) k++;
  const m = n + k;
  if (!(Number.isInteger(flip) && flip >= 0 && flip <= m)) return err('flip');
  const isP = (p) => (p & (p - 1)) === 0;
  const code = Array(m + 1).fill(0);
  const dataPos = [];
  let j = 0;
  for (let p = 1; p <= m; p++) if (!isP(p)) {
    code[p] = d[j++];
    dataPos.push(p);
  }
  const checks = [];
  for (let i = 0; i < k; i++) {
    const p = 2 ** i;
    const cover = dataPos.filter((q) => q & p);
    code[p] = cover.reduce((a, q) => a ^ code[q], 0);
    checks.push({ p, cover, v: code[p] });
  }
  const recv = [...code];
  if (flip) recv[flip] ^= 1;
  const syn = [];
  for (let i = 0; i < k; i++) {
    const p = 2 ** i;
    const cover = Array.from({ length: m }, (_, q) => q + 1).filter((q) => q & p);
    syn.push({ p, cover, v: cover.reduce((a, q) => a ^ recv[q], 0) });
  }
  const pos = syn.reduce((a, s) => a + s.v * s.p, 0);
  return { ok: true, data, n, k, m, code: code.slice(1), dataPos, checks, flip, recv: recv.slice(1), syn, pos };
}
