import test from "node:test";
import assert from "node:assert/strict";
import { fitClockArea, visibleBoardBounds, visibleBoardRight } from "../src/clock-safe-area.js";
test("saved positions and oversized clocks stay outside board across available widths", () => {
  for (const left of [500, 900, 1250, 1390])
    for (const x of [-5000, 0, 900, 5000]) {
      const area = {
        left,
        right: 1400,
        top: 100,
        bottom: 850,
        width: 850,
        height: 540,
        x,
        y: -800,
      };
      const fit = fitClockArea(area);
      assert.ok(fit.left >= left);
      assert.ok(fit.left + fit.width <= 1400.001);
      assert.ok(fit.top >= 100);
      assert.ok(fit.top + fit.height <= 850.001);
      assert.ok(fit.scale <= 1);
      assert.ok(Math.abs(fit.width / fit.height - 850 / 540) < 1e-12);
    }
});
test("clock retains requested position when enough space exists and collapses at zero space", () => {
  const area = {
    left: 1000,
    right: 1600,
    top: 60,
    bottom: 1000,
    width: 300,
    height: 220,
    x: 1100,
    y: 120,
  };
  assert.deepEqual(fitClockArea(area), { left: 1100, top: 120, width: 300, height: 220, scale: 1 });
  assert.equal(fitClockArea({ ...area, left: 1600 }).width, 0);
});
test("clock boundary follows projected 3D board, translated native 2D board, and safe loading fallback", () => {
  const board = { getBoundingClientRect: () => ({ left: 220, right: 920 }) };
  const frame = {
    hidden: false,
    getBoundingClientRect: () => ({ left: 200, right: 1100, width: 900 }),
  };
  const doc = { getElementById: (id) => (id === "zagreb-board" ? frame : board) };
  assert.equal(
    visibleBoardRight(doc),
    1100,
    "Until model loading completes, protect entire iframe",
  );
  assert.deepEqual(visibleBoardBounds(doc), {left:200,right:1100});
  frame.boardFootprint = [
    { x: 10, y: 50 },
    { x: 600, y: 70 },
    { x: 800, y: 500 },
  ];
  assert.equal(visibleBoardRight(doc), 1000);
  assert.deepEqual(visibleBoardBounds(doc), {left:210,right:1000});
  frame.boardFootprint = [{ x: 1400, y: 0 }];
  assert.equal(visibleBoardRight(doc), 1100, "Offscreen projection clamps to visible frame");
  frame.boardFootprint = [{x:-30,y:0},{x:1400,y:0}];
  assert.deepEqual(visibleBoardBounds(doc), {left:200,right:1100});
  frame.hidden = true;
  assert.equal(visibleBoardRight(doc), 920);
  assert.deepEqual(visibleBoardBounds(doc), {left:220,right:920});
});

test("angled boards leave usable space at clock height on either side", () => {
  const frame={hidden:false,getBoundingClientRect:()=>({left:60,top:75,right:2013,width:1953}),
    boardFootprint:[{x:600,y:150},{x:1200,y:165},{x:1460,y:690},{x:280,y:725}]};
  const doc={getElementById:id=>id==='zagreb-board'?frame:null};
  assert.equal(visibleBoardBounds(doc).right,1520);
  const high=visibleBoardBounds(doc,{top:240,bottom:440});
  assert.ok(high.right<1360,'Far bottom corner must not block the upper clock');
  assert.ok(high.left>visibleBoardBounds(doc).left,'Left clocks also follow the sloping edge');
  assert.deepEqual(visibleBoardBounds(doc,{top:80,bottom:200}),{left:Infinity,right:-Infinity});
  for(const y of [150,250,450,650]) {
    const horizontalAt=(top,bottom)=>({left:Math.max(8,visibleBoardBounds(doc,{top:top-16,bottom:bottom+16}).right+16),right:2028});
    const fit=fitClockArea({top:140,bottom:890,width:1036,height:500,x:0,y,
      horizontalAt,heightAtWidth:w=>62+Math.max(0,w-30)*.46});
    assert.ok(fit.left>=horizontalAt(fit.top,fit.top+fit.height).left,'No visible board overlap');
    assert.ok(fit.left+fit.width<=2028);
    assert.ok(fit.top+fit.height<=890);
    if(y===150)assert.ok(fit.width>600,'Clock grows into available space instead of shrinking to 492px');
  }
});

test("native 2D remains protected where the clock and board share height",()=>{
  const board={getBoundingClientRect:()=>({left:100,right:900,top:200,bottom:1000})};
  const doc={getElementById:id=>id==='board'?board:null};
  assert.deepEqual(visibleBoardBounds(doc,{top:100,bottom:300}),{left:100,right:900});
  assert.deepEqual(visibleBoardBounds(doc,{top:80,bottom:150}),{left:Infinity,right:-Infinity});
});
