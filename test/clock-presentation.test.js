import test from 'node:test';
import assert from 'node:assert/strict';
import { installClockPresentation, LEGACY_CLOCK_STYLES } from '../src/clock-presentation.js';
import { CLOCK_STYLES } from '../src/generated/clock-styles.js';

test('one selector keeps every design, lists 3D first and preserves the running clock', t => {
  const select=new EventTarget(), saved=new Map();
  select.replaceChildren=(...options)=>{select.options=options;};
  const globals={document:{getElementById:()=>select,createElement:()=>({})},
    localStorage:{setItem:(key,value)=>saved.set(key,value)}};
  for (const [key,value] of Object.entries(globals)) {
    const original=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true});
    t.after(()=>original ? Object.defineProperty(globalThis,key,original) : delete globalThis[key]);
  }
  const board=new EventTarget(), clock={style:'atelier',active:true,msWhite:135000,msBlack:120000,tickingFor:'w',paused:false};
  board.clockAppearance='dgt-classic';
  const requests=[];
  board.addEventListener('clock-appearance-request',e=>requests.push(e.detail));
  installClockPresentation(board,clock,()=>{});
  assert.deepEqual(select.options.slice(0,2).map(option=>option.value),['dgt-3000-3d','zmf-pro-3d']);
  assert.equal(select.options.length,CLOCK_STYLES.length+LEGACY_CLOCK_STYLES.length);
  assert.equal(select.options[4].value,'garde-3d','Garde is the fifth clock choice');
  assert.equal(select.value,'dgt-classic','Saved viewer appearance selects the matching name');
  const time=()=>JSON.stringify({...clock,style:undefined});
  const before=time();
  select.value='zmf-pro-3d'; select.dispatchEvent(new Event('change'));
  assert.deepEqual(requests,['zmf-pro-3d']);
  assert.equal(clock.style,'atelier');
  assert.equal(time(),before);
  select.value='analog-garde'; select.dispatchEvent(new Event('change'));
  assert.equal(clock.style,'analog-garde');
  assert.equal(requests.length,1);
  board.clockAppearance='dgt-3000-3d'; board.dispatchEvent(new Event('clock-appearance-state'));
  assert.equal(select.value,'analog-garde','Passive preference restore leaves the current analog clock selected');
  board.dispatchEvent(new CustomEvent('clock-design-request',{detail:'dgt-3000-3d'}));
  assert.equal(select.value,'dgt-3000-3d','An explicit fullscreen choice updates the same dropdown');
  assert.equal(saved.get('stockfish-explain.clock-presentation-v2'),'atelier');
  assert.equal(time(),before,'Style changes never reset time or pause the game');
  for(const style of ['dgt-3000-3d-blue','zmf-pro-3d-blue','garde-3d']) {
    assert.ok(select.options.some(option=>option.value===style));
    select.value=style;select.dispatchEvent(new Event('change'));
    assert.equal(requests.at(-1),style);
    assert.equal(time(),before,'The extra blue display styles also preserve the running clock');
  }
});
