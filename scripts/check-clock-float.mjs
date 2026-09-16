// Real pointer/DOM regression check. Run with PLAYWRIGHT_MODULE if external.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const modulePath=process.env.PLAYWRIGHT_MODULE || 'playwright';
const {chromium}=await import(modulePath.startsWith('/')?pathToFileURL(modulePath).href:modulePath);
const root=new URL('../',import.meta.url);
const fixture=`<!doctype html><html><head><link rel="stylesheet" href="/styles/ui-lab.css"><style>
body{margin:0}.site-header{height:60px}button{height:32px}#board{position:absolute;left:390px;top:100px;width:700px;height:700px}
#fixture>#study-side,#fixture>#study-tools{position:absolute!important;top:100px!important;width:360px;height:780px!important}#study-side{left:12px}#study-tools{right:12px}
.watch-pane{display:flex;flex-direction:column;gap:12px;width:100%;height:100%;pointer-events:auto}.watch-pane-clock{flex:0 0 auto;max-height:48%;overflow:hidden}
.watch-pane-moves{height:300px;margin-top:auto}.game-clock{height:140px}.game-clock canvas{width:100%;height:140px;display:block;touch-action:none}
#practice-clock{width:300px;height:180px}#clock-right-host{position:relative}
</style></head><body class="clock-docked-right">
<header class="site-header"><button id="btn-move-clock" disabled aria-pressed="false">Move clock</button></header><div id="board"></div>
<div class="uniboard" id="fixture"><section id="study-side"><div class="watch-pane" data-side="left"></div></section>
<section id="study-tools" class="tools"><div class="watch-pane" data-side="right"><div class="watch-pane-moves">Live game notation</div></div><div id="clock-right-host">
<div id="practice-clock" hidden><button id="clock-float-drag">Move</button></div></div></section></div>
<script type="module">
import {installFloatingClock} from '/src/clock-float.js';
const card=document.getElementById('practice-clock'),host=document.getElementById('clock-right-host');
window.clockDrag=installFloatingClock(card,host);
window.showWatch=(side='right',model='garde')=>{
 document.body.classList.add('watch-mode');card.hidden=true;
 let clock=document.querySelector('.watch-pane-clock');
 if(!clock){clock=document.createElement('div');clock.className='watch-pane-clock';
 clock.innerHTML='<div class="game-clock-fit"><div class="game-clock" style="width:300px"><canvas tabindex="0" aria-label="Clock"></canvas></div></div>';
 clock.querySelector('canvas').addEventListener('pointerdown',()=>window.hardwarePresses++);}
 document.querySelector('.watch-pane[data-side='+side+']').prepend(clock);
 clockDrag.setLayout({layout:'window:3d:'+side+':open:open',model});
};
window.hardwarePresses=0;window.ready=true;
</script></body></html>`;
const server=createServer(async(req,res)=>{
 try {
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(fixture);return;}
  const path=req.url.split('?')[0];
  if(!['/src/clock-float.js','/src/clock-safe-area.js','/styles/ui-lab.css'].includes(path)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL(path.slice(1),root)));
 } catch(e){res.writeHead(500).end(e.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.ready);
 const button=page.locator('#btn-move-clock');
 assert.equal(await button.isDisabled(),true,'No clock means no move target');
 for(const model of ['dgt-3000','zmf-pro','garde']) {
  await page.evaluate(model=>showWatch('right',model),model);
  await page.waitForFunction(()=>!document.getElementById('btn-move-clock').disabled);
  await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.equal(await button.getAttribute('aria-pressed'),'true','A focus change does not cancel move mode');
  const canvas=page.locator('.watch-pane-clock canvas'),before=await canvas.boundingBox();
  await page.mouse.move(before.x+40,before.y+50);await page.mouse.down();
  await page.mouse.move(before.x+40,before.y+150,{steps:10});await page.mouse.up();
  const after=await canvas.boundingBox();
  assert.ok(after.y-before.y>80,model+' broadcast clock moves down');
  assert.equal(await page.evaluate(()=>hardwarePresses),0,'Moving does not press clock hardware');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('stockfish-explain.floating-clock-layouts-v1')));
  assert.ok(saved['window:3d:right:open:open:'+model].y>80,'Position is saved for this layout and model');
  await button.press('Home');await page.waitForTimeout(80);
  assert.ok(Math.abs((await canvas.boundingBox()).y-before.y)<2,'Home restores its slot');
  await button.click();
 }
 // The clock stops before the notation rather than covering its move list.
 await button.click();await button.press('ArrowDown');
 const rightCanvas=await page.locator('.watch-pane-clock canvas').boundingBox();
 await page.mouse.move(rightCanvas.x+40,rightCanvas.y+50);await page.mouse.down();
 await page.mouse.move(rightCanvas.x+40,990,{steps:10});await page.mouse.up();
 const bottom=await page.locator('.watch-pane-clock').boundingBox(),notation=await page.locator('.watch-pane-moves').boundingBox();
 assert.ok(bottom.y+bottom.height<=notation.y-27,'Clock leaves breathing room before notation');
 await button.press('Home');await button.click();
 // Leaving move mode must restore the clock's own controls.
 const face=await page.locator('.watch-pane-clock canvas').boundingBox();
 await page.mouse.click(face.x+50,face.y+50);
 assert.equal(await page.evaluate(()=>hardwarePresses),1,'Normal clock interaction still reaches its handler');
 await page.evaluate(()=>showWatch('left','garde'));await page.waitForTimeout(80);
 assert.equal(await button.isDisabled(),false,'Clock remains movable when Watch puts it in the left pane');
 await button.click();
 const left=await page.locator('.watch-pane-clock canvas').boundingBox();
 await page.mouse.move(left.x+30,left.y+50);await page.mouse.down();await page.mouse.move(750,left.y+120,{steps:10});await page.mouse.up();
 const moved=await page.locator('.watch-pane-clock').boundingBox();
 assert.ok(moved.x+moved.width<=374,'Left clock cannot encroach on the board');
 const savedTop=moved.y;
 await page.evaluate(()=>clockDrag.setLayout({layout:'fullscreen:3d',model:'garde'}));await page.waitForTimeout(80);
 assert.equal(await button.isDisabled(),true,'Fullscreen owns its separate drag control');
 await page.evaluate(()=>clockDrag.setLayout({layout:'window:3d:left:open:open',model:'garde'}));await page.waitForTimeout(80);
 assert.equal(await button.isDisabled(),false,'Returning from fullscreen re-enables window control');
 assert.ok(Math.abs((await page.locator('.watch-pane-clock').boundingBox()).y-savedTop)<2,'Returning restores the saved window position');
 await page.evaluate(()=>document.querySelector('.watch-pane-clock').remove());await page.waitForTimeout(80);
 assert.equal(await button.isDisabled(),true,'Removed clock cannot leave an enabled stale control');
 // Stopping Watch must hand the same control back to the practice clock.
 await page.evaluate(()=>{
  document.body.classList.remove('watch-mode');
  document.querySelectorAll('.watch-pane').forEach(p=>p.remove());
  const card=document.getElementById('practice-clock');
  card.insertAdjacentHTML('beforeend','<div class="game-clock-fit"><div class="game-clock" style="width:300px"><canvas tabindex="0"></canvas></div></div>');
  card.hidden=false;
  clockDrag.setLayout({layout:'window:3d:right:open:open',model:'garde'});
 });
 await page.waitForFunction(()=>!document.getElementById('btn-move-clock').disabled);
 await button.click();
 const practice=page.locator('#practice-clock canvas'),before=await practice.boundingBox();
 await page.mouse.move(before.x+40,before.y+50);await page.mouse.down();
 await page.mouse.move(before.x+40,before.y+130,{steps:8});await page.mouse.up();
 assert.ok((await practice.boundingBox()).y-before.y>60,'Practice clock is still movable after leaving Watch');
 assert.deepEqual(errors,[]);
 console.log('PASS: Watch clock mounting, all three 3D models, left/right panes, dragging, hardware isolation, saved placement, Home, fullscreen return, removal, and return to practice.');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
