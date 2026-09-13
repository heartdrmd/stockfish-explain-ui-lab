// Keep the existing live list and its handlers in an independent right dock.
export function installNotationDock(card, right) {
  const moves=document.querySelector('.move-list-wrap');
  const below=right.closest('.tools')?.querySelector('.clock-below-scroll');
  if(!moves || !below)return;
  const tools=right.closest('.tools');
  const home=document.createComment('Notation returns here');moves.before(home);
  const dock=document.createElement('div');dock.className='notation-right-dock';dock.id='notation-right-dock';dock.hidden=true;document.body.append(dock);
  let frame=0;
  const update=()=>{
    frame=0;
    const active=!document.body.classList.contains('watch-mode') && !document.body.classList.contains('mobile-mode') && !document.body.classList.contains('presentation-fullscreen');
    if(document.body.classList.contains('notation-follows-clock'))document.body.classList.remove('notation-follows-clock');
    const detached=active;
    dock.hidden=!detached || moves.classList.contains('notation-hidden');
    const visible=detached && !dock.hidden;
    if(document.body.classList.contains('notation-bottom-docked')!==visible)document.body.classList.toggle('notation-bottom-docked',visible);
    const paneVisible=!document.body.classList.contains('right-pane-hidden');
    const pane=tools.getBoundingClientRect();
    dock.style.width=paneVisible?`${pane.width}px`:'';
    dock.style.right=paneVisible?`${Math.max(16,window.innerWidth-pane.right)}px`:'';
    const clockSlot=document.body.classList.contains('clock-docked-right') && !document.body.classList.contains('clock-presentation-hidden') && !card.hidden ? Math.min(card.getBoundingClientRect().height,window.innerHeight*.45)+28 : 0;
    dock.style.setProperty('--notation-dock-top',`${Math.max(0,document.querySelector('.site-header')?.getBoundingClientRect().bottom||68)+12+clockSlot}px`);
    if(detached){if(moves.parentNode!==dock)dock.append(moves);}
    else if(moves.previousSibling!==home)home.after(moves);
  };
  const queue=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const observer=new MutationObserver(queue);
  observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  observer.observe(moves,{attributes:true,attributeFilter:['class']});
  const resize=new ResizeObserver(queue);resize.observe(card);resize.observe(tools);
  window.addEventListener('resize',queue);update();
}
