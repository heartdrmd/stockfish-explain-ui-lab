import { installFloatingClock } from './clock-float.js';
import { installNotationDock } from './notation-dock.js';

export function installClockDock(board) {
  const card=document.getElementById('practice-clock'), right=document.getElementById('clock-right-host');
  if (!card || !right) return;
  // The clock owns a fixed slot; only the material below it scrolls.
  const tools=right.closest('.tools');
  if (tools && !tools.querySelector('.clock-below-scroll')) {
    const below=document.createElement('div');
    below.className='clock-below-scroll';
    for(const child of [...tools.children])if(child!==right)below.append(child);
    tools.append(below);
  }
  const home=document.createComment('Clock returns here');
  card.before(home);
  installFloatingClock(card, right);
  installNotationDock(card, right);
  let previous='left';
  board.setClockDock=dock=>{
    if (!['left','right'].includes(dock) || dock===previous) return;
    previous=dock;
    if (dock==='right') right.append(card); else home.after(card);
    document.body.classList.toggle('clock-docked-right',dock==='right');
    // The upper-right clock has its own visible slot when analysis is hidden.
    // Restoring its saved placement must not reopen the user's right pane.
    const pane=document.getElementById('btn-toggle-left-pane');
    if (dock==='left' && pane?.getAttribute('aria-pressed')==='false') pane.click();
    window.dispatchEvent(new Event('resize'));
  };
}
