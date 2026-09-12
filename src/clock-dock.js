export function installClockDock(board) {
  const card=document.getElementById('practice-clock'), right=document.getElementById('clock-right-host');
  if (!card || !right) return;
  const home=document.createComment('Clock returns here');
  card.before(home);
  let previous='left';
  board.setClockDock=dock=>{
    if (!['left','right'].includes(dock) || dock===previous) return;
    previous=dock;
    if (dock==='right') right.append(card); else home.after(card);
    document.body.classList.toggle('clock-docked-right',dock==='right');
    const pane=document.getElementById(`btn-toggle-${dock}-pane`);
    if (pane?.getAttribute('aria-pressed')==='false') pane.click();
    window.dispatchEvent(new Event('resize'));
  };
}
