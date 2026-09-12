// Position the complete native square without changing legal piece gestures.
export function installNativeBoardPan(board, workspace) {
  const root=board.rootEl, area=root.parentElement, layout=root.closest('.uniboard');
  if (!layout) return;
  const key='stockfish-explain.flat-board-layout';
  let chosen={flatPan:0,flatPanY:0}, offset={x:0,y:0}, drag=null, frame=0, suppressClick=false, pinned=0, gaugePin=0;
  try {const old=JSON.parse(localStorage.getItem(key));if(Number.isFinite(old?.flatPan)&&Number.isFinite(old?.flatPanY))chosen=old;}catch{}
  const active=()=>window.innerWidth>=800 && !document.body.classList.contains('mobile-mode') && !area.classList.contains('using-3d');
  function move(x,y) {
    const bounds=area.getBoundingClientRect(), square=root.getBoundingClientRect();
    const room=Math.max(0,(bounds.width-square.width)/2-4);
    const nav=area.querySelector('.board-nav')?.getBoundingClientRect().height||40;
    const down=Math.max(-24,window.innerHeight-bounds.top-square.height-nav-20);
    offset=active()?{x:Math.max(-room,Math.min(room,x)),y:Math.max(-24,Math.min(down,y))}:{x:0,y:0};
    layout.style.setProperty('--native-board-pan',`${offset.x}px`);
    layout.style.setProperty('--native-board-pan-y',`${offset.y}px`);
    document.dispatchEvent(new Event('chessgroundResize'));
  }
  function save() {
    chosen={flatPan:100*offset.x/Math.max(1,area.clientWidth),flatPanY:100*offset.y/Math.max(1,window.innerHeight)};
    try{localStorage.setItem(key,JSON.stringify(chosen));}catch{}
    board.dispatchEvent(new CustomEvent('flat-layout-patch',{detail:chosen}));
  }
  function finish() {
    if (!drag) return;
    const ended=drag;drag=null;
    if(root.hasPointerCapture(ended.id))root.releasePointerCapture(ended.id);
    document.body.classList.remove('native-board-panning');save();
    setTimeout(()=>{suppressClick=false;},0);
  }
  root.addEventListener('pointerdown',e=>{
    if(!active()||(!e.shiftKey&&!board.flatMoveMode)||e.button!==0)return;
    e.preventDefault();e.stopImmediatePropagation();
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,start:{...offset}};suppressClick=true;
    root.setPointerCapture(e.pointerId);document.body.classList.add('native-board-panning');
  },true);
  root.addEventListener('pointermove',e=>{
    if(e.pointerId!==drag?.id)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.buttons===0||!active()){finish();return;}
    move(drag.start.x+e.clientX-drag.x,drag.start.y+e.clientY-drag.y);pinBoard();
  },true);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])root.addEventListener(type,e=>{
    if(e.pointerId===drag?.id){e.stopImmediatePropagation();finish();}
  },true);
  root.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('keydown',e=>{
    if(!active()||!e.shiftKey||e.ctrlKey||e.metaKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||
      e.target.closest?.('input,textarea,select,[contenteditable=true],[role=dialog],.game-clock,.clock-view-panel,#practice-clock,#clock-top-controls'))return;
    e.preventDefault();e.stopImmediatePropagation();
    move(offset.x+(e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0),offset.y+(e.key==='ArrowUp'?-10:e.key==='ArrowDown'?10:0));pinBoard();save();
  },true);
  const gauge=layout.querySelector('.eval-gauge-control');
  function pinBoard() {
    const top=parseFloat(getComputedStyle(layout).getPropertyValue('--split-top'))||103;
    const next=window.innerWidth>=800&&!document.body.classList.contains('mobile-mode')?Math.max(0,top-(area.getBoundingClientRect().top-pinned)):0;
    if(Math.abs(next-pinned)>.1){pinned=next;layout.style.setProperty('--board-pin-y',`${pinned}px`);document.dispatchEvent(new Event('chessgroundResize'));}
    if(gauge){
      const nextGauge=active()?root.getBoundingClientRect().top-(gauge.getBoundingClientRect().top-gaugePin):0;
      if(Math.abs(nextGauge-gaugePin)>.1){gaugePin=nextGauge;layout.style.setProperty('--gauge-pin-y',`${gaugePin}px`);}
    }
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;pinBoard();if(!drag)move(chosen.flatPan*area.clientWidth/100,chosen.flatPanY*window.innerHeight/100);pinBoard();});};
  board.restoreFlatLayout=value=>{
    chosen={flatPan:value.flatPan||0,flatPanY:value.flatPanY||0};
    if(value.flatScale)workspace?.restoreScale(value.flatScale);
    try{localStorage.setItem(key,JSON.stringify(chosen));}catch{}schedule();
  };
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);window.addEventListener('blur',finish);
  new ResizeObserver(schedule).observe(root);
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(schedule).observe(area,{attributes:true,attributeFilter:['class']});
  schedule();
}
