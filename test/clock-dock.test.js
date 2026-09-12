import test from 'node:test';
import assert from 'node:assert/strict';
import { installClockDock } from '../src/clock-dock.js';
test('clock docking moves the same live card above tools and returns it home',t=>{
  const card={timer:{white:123}}, right={append:value=>{right.child=value;}};
  const home={after:value=>{home.child=value;right.child=null;}};
  card.before=value=>assert.equal(value,home);
  let opened=0,resizes=0;
  const pane={getAttribute:()=> 'false',click:()=>opened++};
  const globals={document:{createComment:()=>home,body:{classList:{toggle(){}}},getElementById:id=>({'practice-clock':card,'clock-right-host':right,'btn-toggle-right-pane':pane})[id]},window:{dispatchEvent:()=>resizes++}};
  for (const [name,value] of Object.entries(globals)) {
    const original=Object.getOwnPropertyDescriptor(globalThis,name);
    Object.defineProperty(globalThis,name,{value,configurable:true});
    t.after(()=>original?Object.defineProperty(globalThis,name,original):delete globalThis[name]);
  }
  const board={};installClockDock(board);
  board.setClockDock('right');assert.equal(right.child,card);assert.equal(opened,1);
  board.setClockDock('right');assert.equal(resizes,1,'Repeated saved preference does not resize again');
  board.setClockDock('left');assert.equal(home.child,card);assert.equal(right.child,null);
  assert.equal(card.timer.white,123,'Moving the card preserves its live timer');
  board.setClockDock('outside');assert.equal(resizes,2);
});
