import { CLOCK_STYLES, isClockStyle } from './generated/clock-styles.js';

export const LEGACY_CLOCK_STYLES = [
  { id: 'digital-mega', label: 'Mega digital' },
  { id: 'digital-jumbo', label: 'Jumbo digital · light' },
  { id: 'digital-stadium', label: 'Stadium · dot matrix' },
  { id: 'digital-chronos', label: 'Chronos GX · blue LED' },
  { id: 'analog-garde', label: 'Garde · analog' },
  { id: 'analog-chrome', label: 'Chrome · analog' },
];

export function installClockPresentation(board, clock, renderClock) {
  const select = document.getElementById('clock-style-switcher');
  if (!select) return;
  const choices = [...CLOCK_STYLES, ...LEGACY_CLOCK_STYLES];
  select.replaceChildren(...choices.map(({ id, label }) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    return option;
  }));
  const refresh = () => {
    select.value = clock.style === 'atelier' ? board.clockAppearance || 'dgt' : clock.style;
  };
  const apply = () => {
    try { localStorage.setItem('stockfish-explain.clock-presentation-v2', clock.style); } catch {}
    refresh();
    renderClock();
  };
  select.addEventListener('change', () => {
    const style = select.value;
    if (!choices.some(choice => choice.id === style)) return;
    if (isClockStyle(style)) {
      clock.style = 'atelier';
      board.clockAppearance = style;
      board.dispatchEvent(new CustomEvent('clock-appearance-request', { detail: style }));
    } else {
      clock.style = style;
      try { localStorage.setItem('stockfish-explain.clock-style', style); } catch {}
    }
    apply();
  });
  // Saved views and fullscreen choices update the same selector. A passive
  // restore must not switch away from a user's chosen digital/analog clock.
  board.addEventListener('clock-appearance-state', refresh);
  board.addEventListener('clock-design-request', event => {
    if (isClockStyle(event.detail)) board.clockAppearance = event.detail;
    clock.style = 'atelier';
    apply();
  });
  if (clock.style !== 'atelier' && !LEGACY_CLOCK_STYLES.some(choice => choice.id === clock.style))
    clock.style = 'atelier';
  refresh();
  renderClock();
}
