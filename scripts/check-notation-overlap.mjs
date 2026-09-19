import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
const fixture=`<!doctype html><head>
<link rel="stylesheet" href="/styles/theme.css"><link rel="stylesheet" href="/styles/layout.css"><link rel="stylesheet" href="/styles/panels.css"><link rel="stylesheet" href="/styles/ui-lab.css"><link rel="stylesheet" href="/zagreb/clock.css">
<style>body{margin:0}.site-header{height:60px;padding:0}#board{position:absolute;left:30px;top:80px;width:700px;height:650px}.uniboard{display:block!important}.tools{position:absolute!important;top:80px!important;right:20px;width:600px!important;padding:0!important}.game-clock{width:900px;height:540px;transform-origin:top left}.game-clock-fit{position:relative;width:100%}.game-clock-fit canvas{height:400px;width:900px}.move-list-wrap{height:100%}#clock-atelier{height:auto}.engine-power-row{height:36px}.ceval{height:200px}.site-header button{height:30px}</style></head>
<body class="ui-lab clock-docked-right left-pane-hidden nav-collapsed"><header class="site-header"><button id="btn-move-clock">Move</button></header><div id="board"></div><div class="uniboard"><section class="tools" id="study-tools"><div id="clock-right-host" class="clock-right-host"></div><div id="practice-clock" data-clock-view="atelier"><button id="clock-float-drag">Move</button><div id="clock-atelier"><div class="game-clock-fit"><div class="game-clock" style="width:900px"><canvas></canvas></div></div></div></div><div class="watch-pane board-analysis-host"><aside class="fullscreen-analysis"><h3>Stockfish</h3><p>Post-game analysis</p><p>e4 e5 Nf3 Nc6 Bb5</p></aside></div><div class="engine-power-row">ENGINE ON</div><div class="ceval">Three engine lines</div><div class="move-list-wrap"><div class="move-list-header">Moves</div><div id="move-list">1. e4 e5<br>2. Nf3 Nc6</div></div></section></div>
<script type="module">
import {installClockDock} from '/src/clock-dock.js';
const board={};installClockDock(board);board.setClockDock('right');
const fit=document.querySelector('.game-clock-fit'),face=document.querySelector('.game-clock');let frame;
new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const scale=Math.min(fit.clientWidth/900,(parseFloat(getComputedStyle(fit).maxHeight)||Infinity)/540);face.style.transform='scale('+scale+')';fit.style.height=540*scale+'px';});}).observe(fit);
window.ready=true;
</script>`;
const server=createServer(async(req,res)=>{
 try{const path=req.url.split('?')[0];if(path==='/'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
 if(!/^\/(styles\/[^/]+\.css|zagreb\/clock\.css|src\/clock-[a-z-]+\.js|src\/notation-dock\.js)$/.test(path)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL(path.slice(1),root)));}catch(e){res.writeHead(500).end(e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready);
 for(const height of [821,650,1000]){
  await page.setViewportSize({width:1600,height});await page.waitForTimeout(450);
  const box=async s=>page.locator(s).boundingBox();
  const n=await box('#notation-right-dock'),a=await box('.clock-below-scroll'),clock=await box('#practice-clock');
  assert.ok(a.height>=120,JSON.stringify({height,a,n,clock}));
  assert.ok(a.y+a.height<=n.y-8,'Analysis scroller ends above notation');
  assert.ok(clock.y+clock.height<=a.y-20,'Clock leaves a gap above analysis');
  const host=await box('.board-analysis-host');assert.ok(host.height<height*.5,'Compact analysis host does not inherit a full-height watch pane');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: large docked clock leaves a usable analysis scroller above notation at three viewport heights.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
