// 语言：中文 / English。课程文案用 T(中文, English) 写成双语对象，渲染时用 L() 取当前语言。
const KEY = '408viz:lang';

let lang = 'zh';
try {
  const saved = localStorage.getItem(KEY);
  lang = saved === 'en' || saved === 'zh' ? saved : navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
} catch {
  lang = 'zh';
}

export const getLang = () => lang;

export function setLang(next) {
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {}
  if (typeof document !== 'undefined') document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
}

export const T = (zh, en) => ({ zh, en });

export const L = (v) => (v && typeof v === 'object' && 'zh' in v ? (v[lang] ?? v.zh) : v);

/** 协议字段名：['Source Port', '源端口'] → 当前语言 */
export const F = (en, zh) => ({ en, zh });

const UI = {
  brandEm: T('格物', 'Gewu'),
  tagline: T('把 408 的考点一步步演出来', 'Watch the 408 syllabus in motion'),
  nowLearning: T('正在学习', 'Now learning'),
  where: T('考纲位置', 'Syllabus'),
  progress: T('学习进度', 'Progress'),
  syllabus: T('考纲目录', 'Syllabus'),
  home: T('首页', 'Home'),
  overview: T('概览', 'Overview'),
  play: T('播放', 'Play'),
  pause: T('暂停', 'Pause'),
  resume: T('继续', 'Resume'),
  step: T('单步', 'Step'),
  prev: T('上一步', 'Back'),
  reset: T('重置', 'Reset'),
  replay: T('再看一遍', 'Replay'),
  next: T('下一课', 'Next lesson'),
  start: T('开始演示', 'Start'),
  speed: T('播放速度', 'Speed'),
  complete: T('课程完成', 'Lesson complete'),
  stepOf: T('第 {i} 步 · 共 {n} 步', 'Step {i} of {n}'),
  steps: T('{n} 步', '{n} steps'),
  inspector: T('解析', 'Decoder'),
  close: T('关闭', 'Close'),
  bytes: T('{n} 字节', '{n} bytes'),
  nBits: T('{n} 位', '{n} bits'),
  theme: T('切换深浅色', 'Toggle theme'),
  language: T('切换语言', 'Switch language'),
  menu: T('考纲目录', 'Syllabus'),
  keyPlay: T('播放 / 暂停（空格）', 'Play / pause (Space)'),
  search: T('搜索', 'Search'),
  practice: T('练习', 'Practice'),
  itabTalk: T('讲解', 'Explain'),
  itabParams: T('参数', 'Parameters'),
  stepsHead: T('步骤', 'Steps'),
  editParams: T('调整参数和预设', 'Change parameters and presets'),
  backToQuiz: T('回到题目', 'Back to the question'),
  doQuiz: T('做题 · {n} 道', 'Practice · {n}'),
  searchTitle: T('搜索课程、原理和步骤（Ctrl K）', 'Search lessons, principles and steps (Ctrl K)'),
  searchPh: T('搜索课程、原理、步骤……', 'Search lessons, principles, steps…'),
  foldSide: T('收起目录', 'Collapse syllabus'),
  expandSide: T('展开目录', 'Expand syllabus'),
  fullscreen: T('全屏（F）', 'Full screen (F)'),
  exitFull: T('退出全屏（F）', 'Exit full screen (F)'),
  zoomIn: T('放大（+）', 'Zoom in (+)'),
  zoomOut: T('缩小（−）', 'Zoom out (−)'),
  zoomReset: T('恢复原始大小（0）', 'Reset zoom (0)'),
  resizeInfo: T('拖动调整说明栏宽度，双击恢复', 'Drag to resize the side panel; double-click to reset'),
  resizeFlow: T('拖动调整下方面板高度，双击恢复', 'Drag to resize the bottom panel; double-click to reset'),
  keyStep: T('单步（→）', 'Step (→)'),
  keyPrev: T('上一步（←）', 'Back (←)'),
  keyReset: T('重置（R）', 'Reset (R)'),
  lessonsDone: T('{d} / {n} 课完成', '{d} / {n} done'),
  seqDiagram: T('时序图', 'Sequence diagram'),
  sequence: T('时序图', 'Sequence'),
  planned: T('规划中', 'Planned'),
  points: T('{n} 分', '{n} pts'),
  lessonsN: T('{n} 节课', '{n} lessons'),
  lessonsOne: T('1 节课', '1 lesson'),
  soon: T('即将推出', 'Coming soon'),
  cross: T('综合', 'Cross-topic'),
  openLesson: T('打开', 'Open'),
  params: T('参数', 'Parameters'),
  principle: T('原理', 'Principle'),
  docLink: T('对应原理', 'Principle'),
  readDoc: T('先读原理', 'Read the principle'),
  backToAnim: T('回到动画', 'Back to the animation'),
};

/** 各学科模块可以补充自己的界面文案 */
export const addUI = (dict) => Object.assign(UI, dict);

export const t = (key, vars) => {
  let s = L(UI[key]) ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
};

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
