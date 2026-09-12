function installPaneToggle(side) {
  const dividers = side === 'dividers';
  const button = document.getElementById(dividers ? 'btn-toggle-dividers' : `btn-toggle-${side}-pane`);
  if (!button) return;
  const className = dividers ? 'dividers-hidden' : `${side}-pane-hidden`;
  const label = dividers ? 'dividers' : `${side} pane`;
  const key = `stockfish-explain.${className}`;
  let hidden = false;
  try { hidden = localStorage.getItem(key) === '1'; } catch {}
  function apply() {
    document.body.classList.toggle(className, hidden);
    button.setAttribute('aria-pressed', String(!hidden));
    button.setAttribute('aria-label', `${hidden ? 'Show' : 'Hide'} ${label}`);
    button.title = `${hidden ? 'Show' : 'Hide'} ${label}`;
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
export const installDividerToggle = () => installPaneToggle('dividers');
