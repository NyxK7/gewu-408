// 课程页的工作区：
//   · 考纲目录可以收起成一条窄栏，把位置让给动画；
//   · 说明栏（右）和底部面板（下）可以拖动分隔条改大小，双击分隔条恢复默认；
//   · 示意图可以缩放（滚轮 / 双指 / 按钮，双击放大或复原）、拖动查看，也可以全屏，全屏时底部有播放控制条。
import { t } from './core/i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const desktop = () => matchMedia('(min-width: 1081px)').matches;
const roomy = () => matchMedia('(min-width: 761px)').matches;

export function setupWorkspace({ store, scene, player }) {
  const layout = $('.layout');
  const stage = $('.stage');
  const svg = $('.net');

  // ───── 目录收起 ─────
  const fold = (on) => {
    layout.classList.toggle('is-folded', on);
    store.set('sideFolded', on);
    $('.side-fold').setAttribute('aria-expanded', String(!on));
    $('.side-fold').title = on ? t('expandSide') : t('foldSide');
  };
  fold(!!store.get('sideFolded', false));
  $('.side-fold').addEventListener('click', () => fold(!layout.classList.contains('is-folded')));

  // ───── 分隔条 ─────
  const sizes = { x: ['--info-w', 'infoW'], y: ['--flow-h', 'flowH'] };
  const put = (axis, v) => {
    const [prop, key] = sizes[axis];
    if (v == null) layout.style.removeProperty(prop);
    else layout.style.setProperty(prop, `${Math.round(v)}px`);
    store.set(key, v == null ? null : Math.round(v));
  };
  for (const axis of ['x', 'y']) {
    const v = store.get(sizes[axis][1], null);
    if (v) layout.style.setProperty(sizes[axis][0], `${v}px`);
  }
  const limit = (axis, v) => {
    const r = layout.getBoundingClientRect();
    return axis === 'x' ? clamp(v, 260, Math.max(260, Math.min(720, r.width * 0.55))) : clamp(v, 120, Math.max(120, r.height - 260));
  };
  const current = (axis) => (axis === 'x' ? $('.info').getBoundingClientRect().width : 0);
  for (const g of document.querySelectorAll('.gutter')) {
    const axis = g.dataset.axis;
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try {
        g.setPointerCapture(e.pointerId);
      } catch {}
      document.body.classList.add('is-resizing', `resize-${axis}`);
      const r = layout.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(layout).paddingRight) || 14;
      const move = (ev) => {
        const v = axis === 'x' ? r.right - pad - ev.clientX - 6 : r.bottom - (parseFloat(getComputedStyle(layout).paddingBottom) || 14) - ev.clientY - 6;
        put(axis, limit(axis, v));
      };
      const up = () => {
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        g.removeEventListener('pointercancel', up);
        document.body.classList.remove('is-resizing', `resize-${axis}`);
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
      g.addEventListener('pointercancel', up);
    });
    g.addEventListener('dblclick', () => put(axis, null));
    g.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: 24, ArrowRight: -24, ArrowUp: 24, ArrowDown: -24 }[e.key];
      if (d == null || (axis === 'x') !== (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
      e.preventDefault();
      put(axis, limit(axis, current(axis) + d));
    });
  }

  // ───── 缩放 ─────
  const zoomLabel = $('.zoom-val');
  scene.onZoom = (z) => {
    zoomLabel.textContent = `${Math.round(z * 100)}%`;
    stage.classList.toggle('is-zoomed', z > 1.001);
    $('.zoom-out').disabled = z <= 1.001;
    $('.zoom-in').disabled = z >= 4.999;
  };
  scene.onZoom(scene.uz);
  const step = (k) => scene.zoomTo(scene.uz * k);
  $('.zoom-in').addEventListener('click', () => step(1.4));
  $('.zoom-out').addEventListener('click', () => step(1 / 1.4));
  zoomLabel.addEventListener('click', () => scene.zoomTo(1));

  // 滚轮：宽屏时直接滚轮缩放（课程页本身不滚动）；窄屏页面要滚动，按住 Ctrl 才缩放
  svg.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey && !(roomy() || document.fullscreenElement)) return;
      e.preventDefault();
      scene.zoomTo(scene.uz * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY);
    },
    { passive: false },
  );
  // 双击：没放大时放大两倍，放大了就复原
  svg.addEventListener('dblclick', (e) => scene.zoomTo(scene.uz > 1.001 ? 1 : 2, e.clientX, e.clientY));

  // 拖动画面（放大以后才有意义）和双指缩放
  const pts = new Map();
  let drag = null;
  let pinch = null;
  let moved = false;
  svg.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    moved = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: scene.uz };
      drag = null;
    } else if (scene.uz > 1.001 && e.button === 0) {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      scene.zoomTo(pinch.z * (d / pinch.d), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      moved = true;
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) {
      moved = true;
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {}
      stage.classList.add('is-panning');
    }
    scene.panBy(dx, dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  const release = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (drag?.id === e.pointerId) drag = null;
    stage.classList.remove('is-panning');
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  // 拖动结束时不要顺便触发点击（比如做题模式里点选内存块）
  svg.addEventListener('click', (e) => {
    if (moved) {
      e.stopImmediatePropagation();
      moved = false;
    }
  }, true);

  // ───── 全屏 ─────
  const isFull = () => document.fullscreenElement === stage || stage.classList.contains('is-max');
  const setFull = (on) => {
    stage.classList.toggle('is-full', on);
    $('.fs-btn').title = on ? t('exitFull') : t('fullscreen');
    $('.fs-btn').setAttribute('aria-pressed', String(on));
    sync();
    poke();
  };
  const toggleFull = async () => {
    if (isFull()) {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        stage.classList.remove('is-max');
        setFull(false);
      }
      return;
    }
    try {
      await stage.requestFullscreen();
    } catch {
      // 浏览器不允许全屏（比如在某些内嵌页里）时，退而求其次铺满窗口
      stage.classList.add('is-max');
      setFull(true);
    }
  };
  document.addEventListener('fullscreenchange', () => setFull(document.fullscreenElement === stage));
  $('.fs-btn').addEventListener('click', toggleFull);
  $('.fs-exit').addEventListener('click', toggleFull);
  for (const b of document.querySelectorAll('.fs-bar [data-proxy]')) b.addEventListener('click', () => $(`.${b.dataset.proxy}-btn`).click());

  // 全屏时鼠标停一会儿，控制条自动淡出（像视频播放器）
  let idle = 0;
  const poke = () => {
    stage.classList.remove('is-idle');
    clearTimeout(idle);
    if (isFull()) idle = setTimeout(() => stage.classList.add('is-idle'), 2600);
  };
  stage.addEventListener('pointermove', poke);

  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.page !== 'lesson' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFull();
    } else if (e.key === 'Escape' && stage.classList.contains('is-max')) {
      toggleFull();
    } else if ((e.key === '+' || e.key === '=') && !$('.net').hidden) {
      step(1.4);
    } else if (e.key === '-' && !$('.net').hidden) {
      step(1 / 1.4);
    } else if (e.key === '0' && !$('.net').hidden) {
      scene.zoomTo(1);
    }
    if (isFull()) poke();
  });

  /** 全屏控制条和下方控制按钮保持一致 */
  function sync() {
    const play = $('.play-btn');
    const fp = $('.fs-play');
    fp.innerHTML = play.innerHTML;
    fp.disabled = play.disabled;
    $('.fs-prev').disabled = $('.prev-btn').disabled;
    $('.fs-step').disabled = $('.step-btn').disabled;
    const n = player.lesson?.steps.length ?? 0;
    $('.fs-pos').textContent = player.step < 0 ? t('steps', { n }) : `${player.step + 1} / ${n}`;
  }

  return { sync, relabel: () => fold(layout.classList.contains('is-folded')), exitFull: () => isFull() && toggleFull() };
}
