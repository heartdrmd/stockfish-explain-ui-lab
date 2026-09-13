import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cleanBoardChanges, applyBoardChanges } from '../src/server/board-settings.js';
const view=JSON.parse(await readFile(new URL('./fixtures/board-view.json',import.meta.url),'utf8'));
test('every 3D control survives the server validator unchanged',()=> {
  assert.deepEqual(cleanBoardChanges({latest:view,save:view}),{latest:view,save:view});
  for (const collection of ['piatigorsky','leuchars-cook','b-and-co']) {
    const selected={...view,appearance:{...view.appearance,collection}};
    assert.deepEqual(cleanBoardChanges({latest:selected,save:selected}),{latest:selected,save:selected});
  }
  for (const pieceMotionMs of [0,60,100,150]) {
    const animated={...view,viewing:{...view.viewing,pieceMotionMs}};
    assert.deepEqual(cleanBoardChanges({latest:animated,save:animated}),{latest:animated,save:animated});
  }
  assert.throws(()=>cleanBoardChanges({latest:{...view,viewing:{...view.viewing,pieceMotionMs:2000}}}));
  for (const pieceVisibility of [false, true]) for (const pieceVisibilityMm of [3, 5]) for (const pieceVisibilityScope of ['royals','all']) {
    const visible={...view,viewing:{...view.viewing,pieceVisibility,pieceVisibilityMm,pieceVisibilityScope}};
    assert.deepEqual(cleanBoardChanges({latest:visible,save:visible}),{latest:visible,save:visible});
  }
  for (const invalid of [{pieceVisibility:'yes'},{pieceVisibilityMm:4},{pieceVisibilityMm:'3'},{pieceVisibilityScope:'pawns'},{pieceVisibilityScope:5}])
    assert.throws(()=>cleanBoardChanges({latest:{...view,viewing:{...view.viewing,...invalid}}}));
  assert.throws(()=>cleanBoardChanges({latest:{...view,camera:{position:[NaN,0,0],target:[0,0,0]}}}));
  assert.throws(()=>cleanBoardChanges({latest:{...view,appearance:{...view.appearance,blackPieceLight:{preset:'bad',intensity:132}}}}));
  assert.throws(()=>cleanBoardChanges({remove:'bad-id'}));
});
test('independent view operations retain other saves and tombstones prevent resurrection',()=> {
  const second={...view,id:'00000000-0000-4000-8000-000000000002'};
  let doc=applyBoardChanges({views:[]},{save:view});
  doc=applyBoardChanges(doc,{save:second});
  doc=applyBoardChanges(doc,{remove:view.id});
  doc=applyBoardChanges(doc,{save:view});
  assert.deepEqual(doc.views,[second]);
});
test('real PostgreSQL API isolates accounts, rejects stale revisions, and persists exact settings', {skip:!process.env.BOARD_SYNC_TEST_URL}, async()=> {
  const base=process.env.BOARD_SYNC_TEST_URL;
  async function signup(suffix) {
    const r=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'boardqa_'+Date.now()+suffix,password:'local-qa-only-2026'})});
    assert.equal(r.status,200);
    const data=await r.json();
    return {id:data.user.id,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
  }
  const a=await signup('a'),b=await signup('b');
  const req=async(user,method='GET',body,extra={})=>fetch(base+'/api/board-settings',{method,headers:{Cookie:user.cookie,'X-Board-User':String(user.id),'Content-Type':'application/json',...extra},body:body?JSON.stringify(body):undefined});
  assert.equal((await fetch(base+'/api/board-settings')).status,401);
  assert.equal((await req(a,'PATCH',{revision:0,changes:{latest:view,save:view}})).status,200);
  const stored=await (await req(a)).json();
  assert.deepEqual(stored.document.latest,view);
  assert.deepEqual(stored.document.views,[view]);
  assert.equal((await (await req(b)).json()).document.latest,null);
  assert.equal((await req(a,'PATCH',{revision:0,changes:{remove:view.id}})).status,409);
  assert.equal((await req(a,'PATCH',{revision:1,changes:{remove:view.id}},{Origin:'https://foreign.invalid'})).status,403);
  assert.equal((await req(b,'PATCH',{revision:0,changes:{latest:view}},{'X-Board-User':String(a.id)})).status,409);
  assert.equal((await req(a,'PATCH',{revision:1,changes:{remove:view.id}})).status,200);
  assert.equal((await req(a,'PATCH',{revision:2,changes:{save:view}})).status,200);
  assert.deepEqual((await (await req(a)).json()).document.views,[]);
});
