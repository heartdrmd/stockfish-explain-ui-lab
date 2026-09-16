// Integration check with the real embedded viewer and parent move bridge.
// The practice takeback handler is loaded from main.js; no engine/network needed.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const main=await readFile(root+'/src/main.js','utf8');
const undo=main.slice(main.indexOf('  board.undoCount = () => {'),main.indexOf('  // Copy FEN',main.indexOf('  board.undoCount = () => {')));
const html=`<!doctype html><html><head><style>body{margin:0;background:#151c1a}#area{position:relative;width:1200px;height:850px}#board{width:1200px;height:850px}iframe{border:0;position:absolute;inset:0}.board-nav{position:absolute;top:860px}.test-tools{position:absolute;top:910px}</style></head><body class="practice-mode"><main id="area"><div id="board"></div><div class="board-nav"></div></main><div class="test-tools"><button id="btn-undo">Parent undo</button><button id="btn-resign">Parent resign</button></div><script type="module">
import {BoardController} from '/src/board.js';
import {install3DBoard} from '/src/board-3d.js';
import {practiceTakebackCount} from '/src/practice-takeback.js';
const board=new BoardController(document.getElementById('board'));
board.cg={state:{orientation:'white',movable:{color:'white'}},set(c){for(const [k,v] of Object.entries(c))this.state[k]=v},cancelMove(){}};
const practiceColor='white';board.playerColor=practiceColor;document.body.dataset.practiceColor=practiceColor;
for(const san of ['e4','e5','Nf3','Nc6']){const m=board.chess.move(san);board.tree.currentPath=board.tree.addNode({uci:m.from+m.to,san,fen:board.fen()},board.tree.currentPath).path;board.livePath=board.tree.currentPath;}
let practiceSearchToken=0;const engine={stop(){if(!practiceSearchToken)throw Error('Search not invalidated')}};
const clock={active:false};const hardwareClock={followTurn(){}};const clockTick=()=>{};const renderClock=()=>{};const _clearPracticeHint=()=>{};const scheduleDraftSave=()=>{};
${undo}
document.getElementById('btn-resign').onclick=()=>{document.body.classList.add('practice-finished');delete document.body.dataset.practiceColor;board._archiveSnapshot=Object.freeze({fen:board.fen()});board.setInteractionLocked(true);board.enterFreeAnalysis()};
install3DBoard(board);window.boardQA=board;
</script></body></html>`;
const server=createServer(async(req,res)=>{try{let p=new URL(req.url,'http://localhost').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(p.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{}');return;}if(p==='/zagreb/')p+='/index.html';if(p.includes('..'))throw Error('bad path');const data=await readFile(root+p);res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml','.glb':'model/gltf-binary','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(data)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
try{
const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[],trace=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().includes('[3d-click]'))trace.push(m.text())});page.on('dialog',d=>d.accept());
await page.goto('http://127.0.0.1:'+server.address().port);const frame=page.frameLocator('#zagreb-board');
const take=frame.getByRole('button',{name:'Take back my last move (U)',exact:true});await take.waitFor();await take.click();
await page.waitForFunction(()=>window.boardQA.chess.history().length===2);assert.equal(await page.evaluate(()=>window.boardQA.turn()),'w');
await frame.getByRole('button',{name:'Fullscreen',exact:true}).click();
await frame.locator('.fullscreen-shell.is-expanded').waitFor();
assert.equal(await take.isEnabled(),true,'Takeback remains available in fullscreen');
await frame.getByRole('button',{name:'Resign practice game (R)',exact:true}).click();
await frame.getByRole('button',{name:'Undo move (U)',exact:true}).waitFor();
const f=page.frames().find(f=>f.url().includes('/zagreb/'));
await f.evaluate(()=>window.parent.postMessage({type:'zagreb:move',uci:'g1f3',fen:window.parent.boardQA.fen()},location.origin));
await page.waitForFunction(()=>window.boardQA.chess.history().length===3);
await f.evaluate(()=>window.parent.postMessage({type:'zagreb:move',uci:'b8c6',fen:window.parent.boardQA.fen()},location.origin));
await page.waitForFunction(()=>window.boardQA.chess.history().length===4);
assert.ok(trace.some(m=>m.includes('parent-result')&&m.includes('accepted')));
// A stale frame request is rejected and receives an explicit local trace reason.
await f.evaluate(()=>window.parent.postMessage({type:'zagreb:move',uci:'f1b5',fen:'stale'},location.origin));
await page.waitForTimeout(100);
assert.ok(trace.some(m=>m.includes('stale-position')));
await frame.getByRole('button',{name:'Undo move (U)',exact:true}).focus();await page.keyboard.press('u');
await page.waitForFunction(()=>window.boardQA.chess.history().length===3);
assert.equal(await page.evaluate(()=>window.boardQA._archiveSnapshot.fen.includes(' w ')),true);
assert.deepEqual(errors,[]);
console.log('PASS: real embedded toolbar takeback, resignation bridge, both-side analysis, U shortcut, accepted/rejected trace acknowledgements.');

}finally{await browser.close();await new Promise(r=>server.close(r));}
