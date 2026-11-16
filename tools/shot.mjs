// 无头 Chrome 截图 + 收集控制台报错，直接走 Chrome DevTools Protocol（Node 24 自带 WebSocket，不需要 puppeteer）。
// 用法：node tools/shot.mjs plan.json
// plan.json：{ "base": "http://127.0.0.1:8408/", "out": "目录", "shots": [
//   { "name": "home-desktop", "url": "#/", "w": 1440, "h": 900, "mobile": false, "theme": "light", "lang": "zh",
//     "full": false, "wait": 800, "steps": [{ "eval": "js 表达式（可以 await）" }, { "wait": 500 }] } ] }
// 输出：每张截图的路径，以及这张截图期间出现的控制台错误 / 警告 / 未捕获异常。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && fs.existsSync(p));

const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const PORT = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-chrome-'));
fs.mkdirSync(plan.out, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--force-color-profile=srgb',
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browserWs() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome 没有启动');
}

const ws = new WebSocket(await browserWs());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const listeners = new Set();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  } else if (m.method) for (const f of listeners) f(m);
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
const once = (method, sessionId, timeout) =>
  new Promise((resolve) => {
    const t = setTimeout(() => {
      listeners.delete(f);
      resolve(false);
    }, timeout);
    const f = (m) => {
      if (m.method === method && m.sessionId === sessionId) {
        clearTimeout(t);
        listeners.delete(f);
        resolve(true);
      }
    };
    listeners.add(f);
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, S);
await send('Runtime.enable', {}, S);
await send('Log.enable', {}, S);

let logs = [];
listeners.add((m) => {
  if (m.sessionId !== S) return;
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) {
    logs.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    logs.push(`exception: ${d.exception?.description ?? d.text} @${d.url ?? ''}:${d.lineNumber}`);
  }
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) {
    const e = m.params.entry;
    logs.push(`log.${e.level}: ${e.text} ${e.url ?? ''}`);
  }
});

const report = [];
let initScript = null;
for (const shot of plan.shots) {
  logs = [];
  const w = shot.w ?? 1440;
  const h = shot.h ?? 900;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: shot.dpr ?? 1, mobile: !!shot.mobile }, S);
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!shot.mobile }, S);
  if (initScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScript }, S);
  const store = { '408viz:theme': JSON.stringify(shot.theme ?? 'light'), '408viz:lang': shot.lang ?? 'zh', ...(shot.storage ?? {}) };
  ({ identifier: initScript } = await send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `try{${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`).join('')}}catch(e){}` },
    S,
  ));
  const loaded = once('Page.loadEventFired', S, 10000);
  await send('Page.navigate', { url: 'about:blank' }, S);
  await sleep(50);
  const loaded2 = once('Page.loadEventFired', S, 10000);
  await send('Page.navigate', { url: new URL(shot.url ?? '', plan.base).href }, S);
  await loaded2;
  void loaded;
  await sleep(shot.wait ?? 700);
  for (const st of shot.steps ?? []) {
    if (st.wait) await sleep(st.wait);
    if (st.eval) {
      const r = await send('Runtime.evaluate', { expression: `(async()=>{${st.eval}})()`, awaitPromise: true, returnByValue: true }, S);
      if (r.exceptionDetails) logs.push(`step exception: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      else if (r.result?.value !== undefined) logs.push(`step → ${JSON.stringify(r.result.value)}`);
    }
  }
  let clip;
  if (shot.full) {
    const m = await send('Page.getLayoutMetrics', {}, S);
    const cs = m.cssContentSize ?? m.contentSize;
    clip = { x: 0, y: 0, width: w, height: Math.min(cs.height, 6000), scale: 1 };
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!shot.full, ...(clip ? { clip } : {}) }, S);
  const file = path.join(plan.out, `${shot.name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  report.push({ shot: shot.name, file, logs });
}

for (const r of report) {
  console.log(`${r.logs.some((l) => !l.startsWith('step →')) ? '!!' : 'ok'} ${r.shot} → ${r.file}`);
  for (const l of r.logs) console.log(`    ${l}`);
}
ws.close();
chrome.kill();
setTimeout(() => {
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
  process.exit(0);
}, 400);
