// Browser regression: real Chessground pointer input + the production notation,
// typed-SAN and embedded-view message handlers. No engine, account or saved data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const main = await readFile(new URL('src/main.js', root), 'utf8');
const navigation = main.slice(main.indexOf('  function navigateToTreePath('), main.indexOf('  // The same wheel behavior'));
const keyboard = main.slice(main.indexOf('  // Keyboard move input'), main.indexOf('  // Gauge matches'));
const original = 'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 e6 dxe6 fxe6 Nc3 Bxa6 g3 Nc6 Nh3 Be7 Bg2 O-O Bxc6 dxc6 Ng5 Bc4 O-O h6 Qxd8 Rfxd8 b3 Bxb3 Nf3 Bd5 Nd2 e5 a4 Bf7 Nf3 Nd7 Bd2 Bg6'.split(' ');
const html = `<!doctype html><html><head>
<link rel="stylesheet" href="/vendor/chessground/chessground.base.css"><link rel="stylesheet" href="/styles/board.css">
<style>body{background:#17221d;color:#eee;font:18px system-ui;margin:24px}#area{width:640px;height:640px;position:relative}#board{width:640px;height:640px}.board-nav{position:absolute;left:700px;top:0}button,input{font:inherit;padding:8px;margin:4px}#zagreb-board{position:absolute;width:1px;height:1px;pointer-events:none}#status{white-space:pre-wrap}#overlay[hidden]{display:none}</style></head>
<body class="practice-finished"><h1>Review preserves the played game</h1><div id="area"><div id="board"></div><div id="overlay" hidden></div><div class="board-nav"></div></div>
<p><button id="review">12. Ng5</button><button id="actual">Original 12…Bc4</button><button id="end">End: actual game</button><input id="san" placeholder="Try Nd5"></p><pre id="status"></pre>
<script type="module">
import { BoardController } from '/src/board.js';
import { Chess } from '/vendor/chess.js/chess.js';
import { install3DBoard } from '/src/board-3d.js';
const original=${JSON.stringify(original)};
const board=new BoardController(document.getElementById('board'),document.getElementById('overlay'));board.init();
const replay=new Chess();board.playUciMoves(original.map(san=>{const m=replay.move(san);return m.from+m.to+(m.promotion||'')}),{animate:false});
const end=board.livePath,path=end.slice(0,46);
${navigation}
const ui={kbdMove:document.getElementById('san')};const flashInput=(el)=>el.dataset.invalid='true';
${keyboard}
document.getElementById('review').onclick=()=>navigateToTreePath(path);
document.getElementById('actual').onclick=()=>navigateToTreePath(end.slice(0,48));
document.getElementById('end').onclick=()=>board.toEnd();
const update=()=>document.getElementById('status').textContent='Original: '+board.tree.mainlineNodes().length+' plies / Shown: '+board.chess.history().slice(-4).join(' ')+' / 12… choices: '+board.tree.nodeAtPath(path).children.map(n=>n.san).join(' | ');
board.addEventListener('move',update);board.addEventListener('nav',update);navigateToTreePath(path);
window.qa={board,end,path,installBridge:()=>{install3DBoard(board);document.getElementById('board').hidden=false;}};
</script></body></html>`;
// A protocol peer isolates the production 2D/3D bridge without loading 3D assets.
const peer = '<!doctype html><script>window.replies=[];addEventListener("message",e=>{if(e.data?.type==="zagreb:move-result")replies.push(e.data)});</script>';
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/' || path === '/zagreb/' || path === '/zagreb/index.html') {
      res.setHeader('Content-Type', 'text/html');res.end(path === '/' ? html : peer);return;
    }
    if (!/^\/(src|styles|vendor|assets)\//.test(path) || path.includes('..')) { res.writeHead(404).end();return; }
    const data = await readFile(new URL('.' + path, root));
    res.setHeader('Content-Type', ({ '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' })[extname(path)] || 'application/octet-stream');res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.waitForFunction(() => !!window.qa).catch(error => { throw new Error(errors.join('\n') || error.message); });
  const assertOriginal = async () => assert.deepEqual(await page.evaluate(() => qa.board.tree.mainlineNodes().map(n => n.san)), original);
  const bounds = await page.locator('cg-board').boundingBox();
  const square = key => ({ x: bounds.x + (key.charCodeAt(0) - 97 + .5) * bounds.width / 8, y: bounds.y + (8 - Number(key[1]) + .5) * bounds.height / 8 });
  const from = square('f6'), to = square('d5');
  // Click-to-move Nd5, then return to the actual continuation and ending.
  await page.mouse.click(from.x, from.y);await page.mouse.click(to.x, to.y);
  await page.waitForFunction(() => qa.board.chess.history().at(-1) === 'Nd5');
  await assertOriginal();
  await page.locator('#actual').click();
  assert.equal(await page.evaluate(() => qa.board.chess.history().at(-1)), 'Bc4');
  await page.locator('#end').click();
  assert.deepEqual(await page.evaluate(() => qa.board.chess.history()), original);
  // Drag/drop must merge the same Nd5 variation, without duplicated branches.
  await page.locator('#review').click();
  await page.mouse.move(from.x, from.y);await page.mouse.down();await page.mouse.move(to.x, to.y, { steps: 12 });await page.mouse.up();
  await page.waitForFunction(() => qa.board.chess.history().at(-1) === 'Nd5');
  assert.equal(await page.evaluate(() => qa.board.tree.nodeAtPath(qa.path).children.length), 2);
  await assertOriginal();
  // Typed SAN uses the real listener extracted from main.js.
  await page.locator('#review').click();await page.locator('#san').fill('Nd5');await page.locator('#san').press('Enter');
  await page.waitForFunction(() => document.getElementById('san').value === '');
  await assertOriginal();
  await page.screenshot({ path: '/tmp/chess-review-Nd5.png' });
  // The embedded viewer's real parent handler must acknowledge actual success.
  await page.evaluate(() => qa.installBridge());
  await page.waitForFunction(() => document.getElementById('zagreb-board').contentWindow.replies);
  const frame = page.frames().find(frame => frame.url().includes('/zagreb/'));
  await page.locator('#review').click();
  await frame.evaluate(() => parent.postMessage({ type:'zagreb:move', uci:'f6d5', fen:parent.qa.board.fen() }, location.origin));
  await page.waitForFunction(() => document.getElementById('zagreb-board').contentWindow.replies.length === 1);
  assert.equal((await frame.evaluate(() => replies[0])).accepted, true);
  await assertOriginal();
  await frame.evaluate(() => parent.postMessage({ type:'zagreb:move', uci:'f6d5', fen:'stale' }, location.origin));
  await page.waitForFunction(() => document.getElementById('zagreb-board').contentWindow.replies.length === 2);
  assert.equal((await frame.evaluate(() => replies[1])).accepted, false);
  await assertOriginal();
  assert.deepEqual(errors, []);
  console.log('PASS: click, drag, typed and embedded Nd5; original 40 plies retained; original Bc4 and final position accessible; explicit stale rejection; zero page errors.');
} finally { await browser.close();await new Promise(resolve => server.close(resolve)); }
