// 打开文件全过程的纯计算：open(path) 逐级查目录 → 读文件的 inode → 检查权限 → 系统打开文件表 → 进程打开文件表（fd），
// 然后 read(fd, n) 按读写指针算逻辑块、查 inode 里的地址读盘，最后 close(fd)。
//
// 约定（界面上写明）：
//   · 用 inode 组织：目录项只有「文件名 + inode 号」，文件的其他属性和块地址都在 inode 里；
//   · 根目录的 inode 在挂载时已经读进内存；每个目录的内容正好放在一个磁盘块里；
//   · 读一个 inode 算一次访盘，读一个目录块或数据块也算一次；没有缓冲区高速缓存；
//   · 块大小 1KB；权限只分「文件主」和「其他人」（ming 和 hua 不在同一组）；open 只以只读方式打开。

const err = (e) => ({ ok: false, errors: [e] });
export const BLOCK = 1024;
export const USERS = ['ming', 'hua'];

// 一个小文件系统：inode 号 → inode
export const FS = {
  2: { type: 'dir', owner: 'root', mode: 'rwxr-xr-x', blocks: [100], entries: { home: 11, etc: 12, tmp: 13, readme: 15 } },
  11: { type: 'dir', owner: 'root', mode: 'rwxr-xr-x', blocks: [140], entries: { ming: 23, hua: 24 } },
  12: { type: 'dir', owner: 'root', mode: 'rwxr-xr-x', blocks: [150], entries: { hosts: 30 } },
  13: { type: 'dir', owner: 'root', mode: 'rwxrwxrwx', blocks: [160], entries: {} },
  23: { type: 'dir', owner: 'ming', mode: 'rwxr-xr-x', blocks: [205], entries: { 'notes.txt': 37, 'todo.md': 38 } },
  24: { type: 'dir', owner: 'hua', mode: 'rwxr-xr-x', blocks: [206], entries: { 'plan.txt': 41 } },
  15: { type: 'file', owner: 'root', mode: 'rw-r--r--', size: 600, blocks: [400] },
  30: { type: 'file', owner: 'root', mode: 'rw-r--r--', size: 420, blocks: [410] },
  37: { type: 'file', owner: 'ming', mode: 'rw-r-----', size: 3000, blocks: [310, 311, 517] },
  38: { type: 'file', owner: 'ming', mode: 'rw-r--r--', size: 800, blocks: [318] },
  41: { type: 'file', owner: 'hua', mode: 'rw-------', size: 1500, blocks: [520, 521] },
};
export const ROOT = 2;

export function parsePath(path) {
  const s = String(path ?? '').trim();
  if (!/^\/[\w./-]*$/.test(s) || s.length > 60) return null;
  const parts = s.split('/').filter(Boolean);
  if (parts.some((p) => p === '.' || p === '..')) return null;
  return parts;
}

/** 不画步骤，只查出路径对应的 inode（找不到返回 null） */
export function lookup(path) {
  const parts = parsePath(path);
  if (!parts) return null;
  let ino = ROOT;
  for (const p of parts) {
    const n = FS[ino];
    if (n.type !== 'dir' || !(p in n.entries)) return null;
    ino = n.entries[p];
  }
  return ino;
}

export const canRead = (inode, who) => (who === inode.owner ? inode.mode[0] : inode.mode[6]) === 'r';

export function openFile({ path = '/home/ming/notes.txt', who = 'ming', opened = 'no', n = 1500 }) {
  const parts = parsePath(path);
  if (!parts || !parts.length) return err('path');
  if (!USERS.includes(who)) return err('who');
  if (!['no', 'yes'].includes(opened)) return err('opened');
  if (!Number.isInteger(n) || n < 1 || n > 8192) return err('n');
  const target = lookup(path);
  const already = opened === 'yes' && target != null && FS[target].type === 'file';

  const names = ['/', ...parts];
  const resolved = [ROOT]; // 已经知道 inode 号的路径分量
  const disk = []; // 访盘记录 {kind: 'inode' | 'dir' | 'data', id, ino}
  const sys = already ? [{ idx: 0, ino: target, name: parts.at(-1), count: 1, by: ['Q'] }] : [];
  const fdt = [
    { fd: 0, to: 'tty', off: null },
    { fd: 1, to: 'tty', off: null },
    { fd: 2, to: 'tty', off: null },
  ];
  const steps = [];
  const push = (kind, extra = {}) =>
    steps.push({ kind, resolved: [...resolved], disk: disk.map((d) => ({ ...d })), sys: sys.map((s) => ({ ...s, by: [...s.by] })), fdt: fdt.map((f) => ({ ...f })), ...extra });

  push('call');
  let ino = ROOT;
  for (let i = 0; i < parts.length; i++) {
    const dir = FS[ino];
    const reads = [];
    if (ino !== ROOT) {
      disk.push({ kind: 'inode', id: ino, ino });
      reads.push(disk.length - 1);
    }
    disk.push({ kind: 'dir', id: dir.blocks[0], ino });
    reads.push(disk.length - 1);
    const name = parts[i];
    const next = dir.entries[name];
    if (next == null) {
      push('miss', { level: i, dir: ino, name, reads });
      return { ok: true, path, parts, who, opened, n, steps, disk, fd: -1, error: 'ENOENT', failAt: i, target: null };
    }
    resolved.push(next);
    push('dir', { level: i, dir: ino, name, found: next, reads });
    if (i < parts.length - 1 && FS[next].type !== 'dir') {
      push('notdir', { level: i + 1, name: parts[i + 1] });
      return { ok: true, path, parts, who, opened, n, steps, disk, fd: -1, error: 'ENOTDIR', failAt: i + 1, target: null };
    }
    ino = next;
  }
  const node = FS[ino];
  if (node.type !== 'file') {
    push('isdir', { ino });
    return { ok: true, path, parts, who, opened, n, steps, disk, fd: -1, error: 'EISDIR', target: ino };
  }
  // 文件的 inode：已经在内存（有人打开过）就不用再读盘
  if (already) push('cached', { ino });
  else {
    disk.push({ kind: 'inode', id: ino, ino });
    push('inode', { ino, reads: [disk.length - 1] });
  }
  // 权限检查只在 open 时做一次
  const ok = canRead(node, who);
  push('perm', { ino, allow: ok, bits: who === node.owner ? node.mode.slice(0, 3) : node.mode.slice(6, 9), asOwner: who === node.owner });
  if (!ok) return { ok: true, path, parts, who, opened, n, steps, disk, fd: -1, error: 'EACCES', target: ino };
  // 系统打开文件表
  let entry = sys.find((s) => s.ino === ino);
  if (entry) {
    entry.count++;
    entry.by.push('P');
  } else {
    entry = { idx: sys.length, ino, name: parts.at(-1), count: 1, by: ['P'] };
    sys.push(entry);
  }
  push('sys', { idx: entry.idx, fresh: !already });
  // 进程打开文件表：取最小的空闲描述符
  const used = new Set(fdt.map((f) => f.fd));
  let fd = 0;
  while (used.has(fd)) fd++;
  fdt.push({ fd, to: entry.idx, off: 0 });
  push('fd', { fd });
  // read(fd, buf, n)
  const got = Math.min(n, node.size);
  const first = 0;
  const last = Math.floor((got - 1) / BLOCK);
  const blocks = [];
  for (let b = first; b <= last; b++) {
    disk.push({ kind: 'data', id: node.blocks[b], ino, lb: b });
    blocks.push({ lb: b, pb: node.blocks[b] });
  }
  fdt.find((f) => f.fd === fd).off = got;
  push('read', { fd, got, blocks });
  // close(fd)
  fdt.splice(fdt.findIndex((f) => f.fd === fd), 1);
  entry.count--;
  entry.by.splice(entry.by.indexOf('P'), 1);
  const freed = entry.count === 0;
  if (freed) sys.splice(sys.indexOf(entry), 1);
  push('close', { fd, freed, idx: entry.idx, left: entry.count });
  const openDisk = disk.filter((d) => d.kind !== 'data').length;
  return { ok: true, path, parts, names, who, opened, n, steps, disk, fd, got, target: ino, openDisk, readDisk: disk.length - openDisk, already };
}
