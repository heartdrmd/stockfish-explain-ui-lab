// UI Lab shell. This file only reorganizes existing controls; it does not own
// chess state, Stockfish, saved games, authentication, or lesson grading.

function makeSection(step, title, description, nodes, className = '') {
  const section = document.createElement('section');
  section.className = `practice-flow-section ${className}`.trim();

  const heading = document.createElement('div');
  heading.className = 'practice-flow-heading';
  heading.innerHTML = `
    <span class="practice-step-number" aria-hidden="true">${step}</span>
    <span>
      <strong>${title}</strong>
      <small>${description}</small>
    </span>`;

  const grid = document.createElement('div');
  grid.className = 'practice-flow-grid';
  nodes.filter(Boolean).forEach(node => grid.appendChild(node));

  section.append(heading, grid);
  return section;
}

function settingFor(id) {
  return document.getElementById(id)?.closest('.setting') || null;
}

function organizePracticeDialog() {
  const setup = document.querySelector('#practice-modal .tournament-setup');
  if (!setup || setup.dataset.uiLabOrganized === 'true') return;

  const opening = makeSection(
    '1',
    'Choose an opening',
    'Search, preview, or use the position already on the board.',
    [settingFor('practice-use-current'), settingFor('practice-opening-search')],
    'practice-flow-opening',
  );

  const opponent = makeSection(
    '2',
    'Choose your side and opponent',
    'The preset sets both playing strength and a sensible thinking time.',
    [settingFor('practice-color'), settingFor('practice-preset'), settingFor('practice-style')],
    'practice-flow-opponent',
  );

  const timing = makeSection(
    '3',
    'Choose the pace',
    'Play without a clock, track your time, or use a real countdown.',
    [settingFor('practice-clock-mode'), settingFor('practice-limit-mode'), settingFor('practice-clock-preset')],
    'practice-flow-time',
  );

  const advanced = document.createElement('details');
  advanced.className = 'practice-flow-advanced';
  const summary = document.createElement('summary');
  summary.innerHTML = '<span>Advanced</span><small>Exact engine skill, lesson sensitivity, and opening variation</small>';
  const advancedGrid = document.createElement('div');
  advancedGrid.className = 'practice-flow-grid';
  [
    settingFor('practice-strength'),
    settingFor('practice-learn-sensitivity'),
    settingFor('practice-variation-quick-toggle'),
  ].filter(Boolean).forEach(node => advancedGrid.appendChild(node));
  advanced.append(summary, advancedGrid);

  setup.replaceChildren(opening, opponent, timing, advanced);
  setup.dataset.uiLabOrganized = 'true';
}

function simplifyHeader() {
  const toolbar = document.getElementById('btn-toggle-toolbar');
  const quickNew = document.getElementById('btn-quick-new');
  const quickPractice = document.getElementById('btn-quick-practice');
  const games = document.getElementById('btn-my-games');
  const title = document.querySelector('.site-title');

  if (toolbar) {
    toolbar.textContent = '⋯ More';
    toolbar.title = 'Show or hide advanced tools';
  }
  if (quickNew) quickNew.textContent = 'New';
  if (quickPractice) {
    quickPractice.textContent = 'Practice';
    // Keep the primary Practice path responsive while Stockfish is still
    // booting. main.js later adds its full handler to this same button.
    quickPractice.addEventListener('click', () => {
      const modal = document.getElementById('practice-modal');
      if (modal) modal.hidden = false;
    });
  }
  if (games) games.textContent = 'Games';

  if (title && !title.querySelector('.lab-badge')) {
    const badge = document.createElement('span');
    badge.className = 'lab-badge';
    badge.textContent = 'UI LAB';
    title.appendChild(badge);
  }
}

document.body.classList.add('ui-lab');
simplifyHeader();
organizePracticeDialog();
