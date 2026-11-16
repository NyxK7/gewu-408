// 统一的动画时钟：所有补间都按 dt × speed 累加，暂停时不累加。
// 这样「暂停 / 0.5× / 2×」对镜头、数据包、时序图箭头同时生效。
let speed = 1;
let paused = false;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f());

export const clock = {
  get speed() {
    return speed;
  },
  get paused() {
    return paused;
  },
  setSpeed(s) {
    speed = s;
    emit();
  },
  pause() {
    paused = true;
    emit();
  },
  resume() {
    paused = false;
    emit();
  },
  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** 取消令牌：切换步骤或课程时把旧令牌作废，所有挂在它上面的动画立即结束。 */
export const token = () => ({ cancelled: false });

/** 补间 ms 毫秒（按播放速度缩放），每帧回调 onFrame(0..1)。被取消时 resolve(false)。 */
export function tween(ms, tok, onFrame = () => {}) {
  return new Promise((resolve) => {
    let last = null;
    let elapsed = 0;
    const tick = (now) => {
      if (tok?.cancelled) return resolve(false);
      if (last !== null && !paused) elapsed += Math.min(now - last, 100) * speed;
      last = now;
      const k = ms > 0 ? Math.min(1, elapsed / ms) : 1;
      onFrame(k);
      if (k < 1) requestAnimationFrame(tick);
      else resolve(true);
    };
    requestAnimationFrame(tick);
  });
}

export const wait = (ms, tok) => tween(ms, tok);

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
