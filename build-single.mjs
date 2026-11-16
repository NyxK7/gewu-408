// 打包成一个独立的 HTML 文件：双击就能打开，不需要服务器，方便发给老师和同学。
// 用法：node build-single.mjs
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const OUT = '格物408.html';

const js = execSync('npx -y esbuild@0.24.0 js/app.js --bundle --format=iife --minify --charset=utf8 --log-level=warning', {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const css = fs.readFileSync('css/style.css', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

const link = '<link rel="stylesheet" href="css/style.css" />';
const mod = '<script type="module" src="js/app.js"></script>';
if (!html.includes(link) || !html.includes(mod)) throw new Error('index.html 里找不到样式表或脚本标签，打包脚本需要同步修改');

const safeJs = js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
html = html.replace(link, () => `<style>\n${css}\n</style>`);
html = html.replace(mod, '');
html = html.replace('</body>', () => `<script>\n${safeJs}\n</script>\n</body>`);

fs.writeFileSync(OUT, html);
console.log(`${OUT}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
