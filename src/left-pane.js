export function installLeftPaneToggle() {
  const button = document.getElementById('btn-toggle-left-pane');
  if (!button) return;
  const key = 'stockfish-explain.left-pane-hidden';
  let hidden = false;
  try { hidden = localStorage.getItem(key) === '1'; } catch {}
  function apply() {
    document.body.classList.toggle('left-pane-hidden', hidden);
    button.setAttribute('aria-pressed', String(!hidden));
    button.setAttribute('aria-label', hidden ? 'Show left pane' : 'Hide left pane');
    button.title = hidden ? 'Show left pane' : 'Hide left pane';
  }
  apply();
  button.addEventListener('click', () => {
    hidden = !hidden;
    apply();
    try { localStorage.setItem(key, hidden ? '1' : '0'); } catch {}
    window.dispatchEvent(new Event('resize'));
  });
}
