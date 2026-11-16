// 考纲目录：四门课 → 章节 → 课程。首页和侧栏都由它生成。
// 章节按近几年（2022 年调整之后）的 408 考纲结构整理；新一年的考纲发布后需要核对。
// plan 是这一章「规划中」的考点（来自 README 的路线），只做展示，还没有对应的课。
import { T } from './core/i18n.js';

export const SUBJECTS = [
  {
    id: 'ds',
    name: T('数据结构', 'Data Structures'),
    short: T('数据结构', 'DS'),
    score: 45,
    tone: 'teal',
    chapters: [
      { id: 'basic', name: T('基本概念', 'Basic concepts') },
      { id: 'list', name: T('线性表', 'Linear lists') },
      { id: 'stack', name: T('栈、队列和数组', 'Stacks, queues and arrays') },
      { id: 'string', name: T('串', 'Strings') },
      { id: 'tree', name: T('树与二叉树', 'Trees and binary trees') },
      { id: 'graph', name: T('图', 'Graphs') },
      { id: 'search', name: T('查找', 'Searching') },
      { id: 'sort', name: T('排序', 'Sorting') },
    ],
  },
  {
    id: 'co',
    name: T('计算机组成原理', 'Computer Organization'),
    short: T('计算机组成原理', 'CO'),
    score: 45,
    tone: 'amber',
    chapters: [
      { id: 'overview', name: T('计算机系统概述', 'System overview') },
      { id: 'data', name: T('数据的表示和运算', 'Data representation') },
      { id: 'memory', name: T('存储器层次结构', 'Memory hierarchy') },
      { id: 'isa', name: T('指令系统', 'Instruction set') },
      { id: 'cpu', name: T('中央处理器（CPU）', 'Central processing unit') },
      { id: 'bus', name: T('总线和输入/输出系统', 'Buses and I/O') },
    ],
  },
  {
    id: 'os',
    name: T('操作系统', 'Operating Systems'),
    short: T('操作系统', 'OS'),
    score: 35,
    tone: 'violet',
    chapters: [
      { id: 'basics', name: T('操作系统基础', 'OS fundamentals') },
      { id: 'process', name: T('进程管理', 'Process management') },
      { id: 'memory', name: T('内存管理', 'Memory management') },
      { id: 'file', name: T('文件管理', 'File management') },
      { id: 'io', name: T('输入/输出（I/O）管理', 'I/O management') },
    ],
  },
  {
    id: 'net',
    name: T('计算机网络', 'Computer Networks'),
    short: T('计算机网络', 'Net'),
    score: 25,
    tone: 'blue',
    chapters: [
      { id: 'arch', name: T('计算机网络体系结构', 'Network architecture') },
      { id: 'phy', name: T('物理层', 'Physical layer') },
      { id: 'link', name: T('数据链路层', 'Data link layer') },
      { id: 'network', name: T('网络层', 'Network layer') },
      { id: 'transport', name: T('传输层', 'Transport layer') },
      { id: 'app', name: T('应用层', 'Application layer') },
    ],
  },
];

export const subjectById = (id) => SUBJECTS.find((s) => s.id === id);

export function chapterOf(subjectId, chapterId) {
  const s = subjectById(subjectId);
  const i = s?.chapters.findIndex((c) => c.id === chapterId) ?? -1;
  return i < 0 ? null : { subject: s, chapter: s.chapters[i], no: i + 1 };
}

/** 中文章节序号：一、二、三…… */
export const cnNo = (n) => '一二三四五六七八九十'[n - 1] ?? String(n);
