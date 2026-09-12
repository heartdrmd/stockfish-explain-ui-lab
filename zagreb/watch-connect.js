(() => {
  const params = new URLSearchParams(location.search);
  const state = params.get('state'), code = params.get('code');
  history.replaceState(null, '', location.pathname);
  const status = document.getElementById('status');
  if (!state || !/^[A-Za-z0-9_-]{32}$/.test(state)) { status.textContent = 'This sign-in link has expired. Start again from Watch on your board.'; return; }
  try {
    localStorage.setItem(`zagreb-lichess-return:${state}`, JSON.stringify({ state, code, error: params.get('error') }));
    status.textContent = code ? 'Returning approval to your board. Your board will show Connected once sign-in finishes.' : 'Connection cancelled. You can return to your board.';
    window.close();
  } catch { status.textContent = 'Allow browser storage to complete the connection, then try again.'; }
})();
