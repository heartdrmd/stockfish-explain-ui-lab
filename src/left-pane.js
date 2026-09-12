function installPaneToggle(side) {
  const button = document.getElementById(`btn-toggle-${side}-pane`);
  if (!button) return;
  const key = `stockfish-explain.${side}-pane-hidden`;
  let hidden = false;
  try { hidden = localStorage.getItem(key) === '1'; } catch {}
  function apply() {
    document.body.classList.toggle(`${side}-pane-hidden`, hidden);
    button.setAttribute('aria-pressed', String(!hidden));
    button.setAttribute('aria-label', `${hidden ? 'Show' : 'Hide'} ${side} pane`);
    button.title = `${hidden ? 'Show' : 'Hide'} ${side} pane`;
  }
  apply();
  button.addEventListener('click', () => {
    hidden = !hidden;
    apply();
    try { localStorage.setItem(key, hidden ? '1' : '0'); } catch {}
    window.dispatchEvent(new Event('resize'));
  });
}

export const installLeftPaneToggle = () => installPaneToggle('left');
export const installRightPaneToggle = () => installPaneToggle('right');
