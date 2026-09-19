/** Tempus Dominus defaults to Font Awesome icon classes, which this app doesn't ship -
 *  those glyphs render blank, which is why the prev/next month buttons looked missing.
 *  Swap in the Bootstrap Icons classes that are already loaded app-wide instead. */
export const TEMPUS_DOMINUS_ICONS = {
  type: 'icons' as const,
  time: 'bi bi-clock',
  date: 'bi bi-calendar3',
  up: 'bi bi-chevron-up',
  down: 'bi bi-chevron-down',
  previous: 'bi bi-chevron-left',
  next: 'bi bi-chevron-right',
  today: 'bi bi-calendar-check',
  clear: 'bi bi-trash',
  close: 'bi bi-x-lg',
};
