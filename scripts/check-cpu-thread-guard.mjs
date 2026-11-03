// Browser check of the real settings block and engine wrapper, with a fake
// UCI worker. Does not load Stockfish, NNUE, user profiles, or account data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const main = await readFile(new URL('src/main.js', root), 'utf8');
const index = await readFile(new URL('index.html', root), 'utf8');
const settings = main.slice(main.indexOf('  // Computer CPU headroom:'), main.indexOf("  ui.limitMode.addEventListener('change'"));
assert.ok(settings.includes('computerThreadPolicy()') && settings.includes('fireAnalysis()'));
const threadHtml = index.slice(index.lastIndexOf('<div class="setting">', index.indexOf('<label for="range-threads">')), index.indexOf('<label for="limit-mode">'));
const html = `<!doctype html><meta charset="utf-8"><title>CPU guard browser check</title>
${threadHtml}<input id="range-skill" value="20"><input id="range-multipv" value="3"><span id="skill-val"></span>
<script type="module">
import {Engine} from '/src/engine.js';
import {isComputerBrowser, computerThreadPolicy, readCpuGuardDiagnostics} from '/src/engine-resources.js';
const messages=[];
class FakeWorker extends EventTarget {
  postMessage(cmd) {
    messages.push(cmd);
    const reply = cmd==='uci' ? 'uciok' : cmd==='isready' ? 'readyok' : cmd.startsWith('go movetime 400') ? 'bestmove e2e4' : null;
    if(reply) queueMicrotask(() => {const event=new MessageEvent('message',{data:reply});this.onmessage?.(event);this.dispatchEvent(event);});
  }
  terminate() {}
}
window.Worker=FakeWorker;
const engine=new Engine();
await engine.boot({flavor:'lite'});
const IS_IOS=false, IS_MOBILE=false;
const ui=Object.fromEntries(Object.entries({rangeThreads:'range-threads',threadsVal:'threads-val',threadsHw:'threads-hw',rangeSkill:'range-skill',skillVal:'skill-val',rangeMultipv:'range-multipv'}).map(([key,id])=>[key,document.getElementById(id)]));
const fireAnalysis=()=>{};
const applyAnalysisLineCount=()=>{};
${settings}
window.qa={engine,messages,readCpuGuardDiagnostics};
</script>`;
const server=createServer(async (req,res)=>{
  try {
    const pathname=new URL(req.url,'http://localhost').pathname;
    res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
    if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
    if(!/^\/src\/[\w-]+\.js$/.test(pathname)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','application/javascript');res.end(await readFile(new URL('.'+pathname,root)));
  } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const context=await browser.newContext();
  await context.addInitScript(()=>Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>18}));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>!!window.qa);
  assert.equal(await page.locator('#range-threads').inputValue(),'9');
  assert.equal(await page.locator('#range-threads').getAttribute('max'),'13');
  assert.equal(await page.locator('#threads-val').textContent(),'9');
  assert.match(await page.locator('#threads-help').textContent(),/no scheduled pauses/);
  await page.locator('#range-threads').fill('13');
  assert.equal(await page.evaluate(()=>qa.engine.threads),13);
  await page.evaluate(()=>{
    qa.engine.setThreads(999);
    qa.engine.start('8/8/8/8/8/8/4P3/K6k w - - 0 1',{infinite:true});
  });
  assert.equal(await page.evaluate(()=>qa.engine.threads),13);
  assert.equal(await page.evaluate(()=>qa.messages.at(-1)),'go infinite');
  const records=await page.evaluate(()=>qa.readCpuGuardDiagnostics());
  assert.ok(records.length>0 && records.every(r=>r.applied<=13));
  assert.ok(await page.evaluate(()=>qa.messages.filter(m=>m.startsWith('setoption name Threads')).every(m=>Number(m.split(' ').at(-1))<=13)));
  // Reload exercises a new worker and settings initialization, not just a slider edit.
  await page.reload();await page.waitForFunction(()=>!!window.qa);
  assert.equal(await page.locator('#range-threads').inputValue(),'9');
  assert.equal(await page.evaluate(()=>qa.engine.threads),9);
  assert.deepEqual(errors,[]);
  console.log('PASS: Chrome fake-worker boot, 18-core default 9 / ceiling 13, slider, oversized restore, continuous infinite search, reload, durable logs; no real Stockfish loaded.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
