// Reuse the live move list so navigation, annotations and the graph retain
// their existing handlers. In 2D it follows the clock, including its float.
export function installNotationDock(card, right) {
  const moves = document.querySelector('.move-list-wrap');
  const area = document.querySelector('.board-area');
  const below = right.closest('.tools')?.querySelector('.clock-below-scroll');
  if (!moves || !area || !below) return;
  const home = document.createComment('Notation returns here');
  moves.before(home);
  let frame = 0;
  const update = () => {
    frame = 0;
    const flat = !area.classList.contains('using-3d') || document.body.classList.contains('inline-flat-board');
    const dock = flat && !document.body.classList.contains('watch-mode') && !document.body.classList.contains('mobile-mode');
    if (document.body.classList.contains('notation-follows-clock') !== dock)
      document.body.classList.toggle('notation-follows-clock', dock);
    if (!dock) { if (moves.previousSibling !== home) home.after(moves); return; }
    if (document.body.classList.contains('clock-docked-right')) {
      if (below.firstChild !== moves) below.prepend(moves);
    } else if (moves.previousSibling !== card) card.after(moves);
  };
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  const observer = new MutationObserver(queue);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observer.observe(area, { attributes: true, attributeFilter: ['class'] });
  update();
}
