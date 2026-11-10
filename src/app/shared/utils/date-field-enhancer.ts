/**
 * Project-wide date fields. Every `<input type="date">` is shown as a text box that takes `dd-mm-yyyy` (digits only, the dashes are added
 * as you type) and opens one shared calendar popup (the PO Date design) from the box. The original input stays in the page, hidden, and
 * keeps holding the ISO `yyyy-mm-dd` value - so ngModel / formControl / [value] / (change) bindings, `min` / `max`, and code that reads
 * the input all keep working unchanged. Unless a field sets its own `min` / `max`, the calendar is limited to the current financial year
 * (1 Apr - 31 Mar); date-of-birth and PO date fields keep the full calendar. Add `data-native-date` to an input to leave it as the browser's own date field.
 */

interface Ui {
  el: HTMLInputElement;
  display: HTMLInputElement;
  /** True while this code writes the hidden input's value (so the value hook does not echo it back). */
  internal: boolean;
  attrs: MutationObserver;
}

const uis = new Map<HTMLInputElement, Ui>();
let started = false;
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;

const pad = (n: number): string => String(n).padStart(2, '0');
const toIso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** yyyy-mm-dd -> dd-mm-yyyy ('' when not a date). */
const toText = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

/** dd-mm-yyyy -> yyyy-mm-dd when it is a real date (4-digit year), else ''. */
function parseText(text: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  if (!m) return '';
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return y >= 1000 && date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? `${m[3]}-${m[2]}-${m[1]}` : '';
}


// ------------------------------------------------------------------ financial year

/** First month of the financial year (1 = January ... 4 = April: the Indian financial year, 1 Apr - 31 Mar). */
const FY_START_MONTH = 4;

/** Fields that keep the full calendar: dates of birth and the PO date. Anything else is limited to the current financial year. */
const FULL_CALENDAR = /dob|birth|pr-required|requiredby|po[-_ ]?date/i;

/** `data-any-date` on an input also opts it out of the financial-year range. */
function financialYearOnly(el: HTMLInputElement): boolean {
  if (el.hasAttribute('data-any-date')) return false;
  const hints = [el.id, el.name, el.getAttribute('formcontrolname'), el.getAttribute('aria-label')].filter(Boolean).join(' ');
  return !FULL_CALENDAR.test(hints);
}

/** [first day, last day] of the financial year that today falls in, as yyyy-mm-dd. */
function financialYear(): [string, string] {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= FY_START_MONTH ? now.getFullYear() : now.getFullYear() - 1;
  const start = new Date(startYear, FY_START_MONTH - 1, 1);
  const end = new Date(startYear + 1, FY_START_MONTH - 1, 0);
  return [toIso(start), toIso(end)];
}

/** The field's own min / max when it has one, else the financial year's first / last day (DOB and PO date: none). */
function minOf(ui: Ui): string {
  return ui.el.min || (financialYearOnly(ui.el) ? financialYear()[0] : '');
}
function maxOf(ui: Ui): string {
  return ui.el.max || (financialYearOnly(ui.el) ? financialYear()[1] : '');
}

const rawValue = (ui: Ui): string => nativeValue.get!.call(ui.el) as string;

/** Writes the hidden input and tells Angular (and any listener) the way a user edit would. */
function commit(ui: Ui, iso: string): void {
  if (rawValue(ui) === iso) return;
  ui.internal = true;
  nativeValue.set!.call(ui.el, iso);
  ui.internal = false;
  ui.el.dispatchEvent(new Event('input', { bubbles: true }));
  ui.el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Box text <- hidden value. */
function sync(ui: Ui): void {
  ui.display.value = toText(rawValue(ui));
  ui.display.classList.remove('ndp-bad');
}

function inRange(ui: Ui, iso: string): boolean {
  return (!minOf(ui) || iso >= minOf(ui)) && (!maxOf(ui) || iso <= maxOf(ui));
}

function mirrorAttributes(ui: Ui): void {
  const solo = !ui.display.closest('.input-wrap');
  ui.display.className = `${ui.el.className.replace(/\bndp-native\b/g, '')} ndp-input${solo ? ' ndp-solo' : ''}${ui.display.classList.contains('ndp-bad') ? ' ndp-bad' : ''}`.replace(/\s+/g, ' ').trim();
  ui.display.disabled = ui.el.disabled;
  ui.display.readOnly = ui.el.readOnly;
}

// ------------------------------------------------------------------ the popup

let pop: HTMLDivElement | null = null;
let active: Ui | null = null;
let month = new Date();

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ensurePopup(): HTMLDivElement {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'ndp-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Choose a date');
  pop.hidden = true;
  // keep the focus in the text box while the calendar is clicked
  pop.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('select')) e.preventDefault(); });
  // month / year dropdowns: jump straight to any month or year (the day grid follows; min / max keep it in range)
  pop.addEventListener('change', e => {
    const sel = e.target as HTMLSelectElement;
    if (!active || !sel.dataset['pick']) return;
    const y = sel.dataset['pick'] === 'y' ? Number(sel.value) : month.getFullYear();
    const m = sel.dataset['pick'] === 'm' ? Number(sel.value) : month.getMonth();
    month = clampMonth(active, new Date(y, m, 1));
    render();
  });
  pop.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!target || !active) return;
    if (target.dataset['nav']) {
      month = clampMonth(active, new Date(month.getFullYear(), month.getMonth() + Number(target.dataset['nav']), 1));
      render();
    } else if (target.dataset['iso'] && !target.disabled) {
      commit(active, target.dataset['iso']);
      sync(active);
      close();
    }
  });
  document.body.appendChild(pop);
  return pop;
}

/** Keeps a shown month inside the field's min / max. */
function clampMonth(ui: Ui, d: Date): Date {
  const key = (x: Date): string => `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
  if (minOf(ui) && key(d) < minOf(ui).slice(0, 7)) return new Date(`${minOf(ui).slice(0, 7)}-01T00:00:00`);
  if (maxOf(ui) && key(d) > maxOf(ui).slice(0, 7)) return new Date(`${maxOf(ui).slice(0, 7)}-01T00:00:00`);
  return d;
}

function render(): void {
  if (!pop || !active) return;
  const ui = active;
  const selected = rawValue(ui);
  const today = toIso(new Date());
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - new Date(month.getFullYear(), month.getMonth(), 1).getDay());
  let days = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toIso(d);
    const cls = ['ndp-day', d.getMonth() !== month.getMonth() ? 'other' : '', iso === today ? 'today' : '', iso === selected ? 'sel' : ''].filter(Boolean).join(' ');
    days += `<button type="button" class="${cls}" data-iso="${iso}"${inRange(ui, iso) ? '' : ' disabled'}>${d.getDate()}</button>`;
  }
  const year = month.getFullYear();
  const thisYear = new Date().getFullYear();
  const minYear = minOf(ui) ? Number(minOf(ui).slice(0, 4)) : Math.min(thisYear - 100, year);
  const maxYear = maxOf(ui) ? Number(maxOf(ui).slice(0, 4)) : Math.max(thisYear + 20, year);
  let years = '';
  for (let y = Math.max(1, minYear); y <= Math.max(maxYear, minYear); y++) years += `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`;
  const monthKey = (m: number): string => `${year}-${pad(m + 1)}`;
  const months = MONTHS.map((n, m) => {
    const off = (minOf(ui) && monthKey(m) < minOf(ui).slice(0, 7)) || (maxOf(ui) && monthKey(m) > maxOf(ui).slice(0, 7));
    return `<option value="${m}"${m === month.getMonth() ? ' selected' : ''}${off ? ' disabled' : ''}>${n}</option>`;
  }).join('');
  pop.innerHTML = `
    <div class="ndp-head">
      <button type="button" data-nav="-1" aria-label="Previous month">&laquo;</button>
      <span class="ndp-pickers">
        <select class="ndp-sel ndp-sel-m" data-pick="m" aria-label="Month">${months}</select>
        <select class="ndp-sel ndp-sel-y" data-pick="y" aria-label="Year">${years}</select>
      </span>
      <button type="button" data-nav="1" aria-label="Next month">&raquo;</button>
    </div>
    <div class="ndp-grid">${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(w => `<span class="ndp-wd">${w}</span>`).join('')}${days}</div>`;
}

function position(): void {
  if (!pop || !active || pop.hidden) return;
  const r = active.display.getBoundingClientRect();
  const h = pop.offsetHeight || 320;
  const w = pop.offsetWidth || 290;
  const below = r.bottom + 6 + h <= window.innerHeight || r.top - 6 - h < 0;
  pop.style.top = `${Math.max(4, below ? r.bottom + 6 : r.top - 6 - h)}px`;
  pop.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - w - 8))}px`;
}

function open(ui: Ui): void {
  if (ui.display.disabled || ui.display.readOnly) return;
  active = ui;
  // open on the month of the chosen date, else this month (kept inside min / max)
  const value = rawValue(ui);
  let basis = value ? new Date(`${value}T00:00:00`) : new Date();
  if (!value && minOf(ui) && toIso(basis) < minOf(ui)) basis = new Date(`${minOf(ui)}T00:00:00`);
  if (!value && maxOf(ui) && toIso(basis) > maxOf(ui)) basis = new Date(`${maxOf(ui)}T00:00:00`);
  month = new Date(basis.getFullYear(), basis.getMonth(), 1);
  const el = ensurePopup();
  el.hidden = false;
  render();
  position();
}

function close(): void {
  if (pop) pop.hidden = true;
  active = null;
}

// ------------------------------------------------------------------ one field

function enhance(el: HTMLInputElement): void {
  if (uis.has(el) || el.hasAttribute('data-native-date')) return;

  const display = document.createElement('input');
  display.type = 'text';
  display.inputMode = 'numeric';
  display.maxLength = 10;
  display.autocomplete = 'off';
  display.placeholder = 'dd-mm-yyyy';
  if (el.style.cssText) display.style.cssText = el.style.cssText;
  const label = el.getAttribute('aria-label');
  if (label) display.setAttribute('aria-label', label);
  // the hidden input keeps its id (code may look it up); its labels point at the visible box instead
  if (el.id) {
    display.id = `${el.id}-ndp`;
    document.querySelectorAll(`label[for="${el.id}"]`).forEach(l => l.setAttribute('for', display.id));
  }

  const ui: Ui = { el, display, internal: false, attrs: new MutationObserver(() => mirrorAttributes(ui)) };
  uis.set(el, ui);
  el.classList.add('ndp-native');
  el.tabIndex = -1;
  el.after(display);
  mirrorAttributes(ui);

  // Angular (and any script) sets the value as a property: show it in the box
  Object.defineProperty(el, 'value', {
    configurable: true,
    get: () => nativeValue.get!.call(el),
    set: (v: string) => {
      nativeValue.set!.call(el, v);
      if (!ui.internal) sync(ui);
    },
  });
  sync(ui);
  ui.attrs.observe(el, { attributes: true, attributeFilter: ['class', 'disabled', 'readonly'] });

  display.addEventListener('input', () => {
    const digits = display.value.replace(/\D/g, '').slice(0, 8);
    display.value = digits.length > 4 ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
    const iso = display.value.length === 10 ? parseText(display.value) : '';
    const ok = iso !== '' && inRange(ui, iso);
    display.classList.toggle('ndp-bad', display.value.length === 10 && !ok);
    commit(ui, ok ? iso : '');
    if (active === ui && ok) {
      month = new Date(`${iso}T00:00:00`);
      month = new Date(month.getFullYear(), month.getMonth(), 1);
    }
    if (active === ui) render();
  });
  display.addEventListener('focus', () => open(ui));
  display.addEventListener('click', () => { if (active !== ui) open(ui); });
  display.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter') close();
    else if (e.key === 'ArrowDown' && active !== ui) open(ui);
  });
  display.addEventListener('blur', () => {
    sync(ui); // an unfinished or invalid text goes back to the saved date
    el.dispatchEvent(new Event('blur'));
  });
}

function release(el: HTMLInputElement): void {
  const ui = uis.get(el);
  if (!ui) return;
  ui.attrs.disconnect();
  if (active === ui) close();
  ui.display.remove();
  delete (el as unknown as { value?: string }).value;
  el.classList.remove('ndp-native');
  uis.delete(el);
}

/** Starts watching the page: every date input present now or added later (dialogs, @if blocks, popups) gets the date field. */
export function startDateFieldEnhancer(): void {
  if (started) return;
  started = true;

  const scan = (root: ParentNode): void => root.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach(enhance);
  scan(document);

  new MutationObserver(records => {
    for (const rec of records) {
      rec.removedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        for (const el of [...uis.keys()]) if (node === el || (node as Element).contains(el)) release(el);
      });
      rec.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.matches('input[type="date"]')) enhance(el as HTMLInputElement);
        scan(el);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.addEventListener('mousedown', e => {
    if (active && !pop?.contains(e.target as Node) && e.target !== active.display) close();
  });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
}
