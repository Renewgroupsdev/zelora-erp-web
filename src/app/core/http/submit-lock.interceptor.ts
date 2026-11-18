import { HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Observable, finalize, share } from 'rxjs';

/**
 * Double-submit guard for every save in the app (create / update / delete / approve ...).
 *
 *  1. The button that started a save is locked (shown, but not clickable) until the API answers - see lockButtonOnClick().
 *  2. Safety net: an identical save (same method, URL and body) fired while the first one is still running is not sent
 *     again; the second caller simply receives the first call's answer. So a double click, an Enter key repeat or two
 *     listeners can never store a record twice. The API repeats the same check (PreventDuplicateSubmit).
 */
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const inFlight = new Map<string, Observable<HttpEvent<unknown>>>();

/** The button clicked most recently, so the save it starts can lock it. */
let lastClick: { el: HTMLButtonElement; at: number } | null = null;
const CLICK_WINDOW_MS = 600;

export const submitLockInterceptor: HttpInterceptorFn = (req, next) => {
  if (!WRITE.has(req.method)) return next(req);

  const key = `${req.method} ${req.urlWithParams} ${bodyKey(req)}`;
  const running = inFlight.get(key);
  if (running) return running;

  const button = takeClickedButton();
  if (button) lock(button);

  const call = next(req).pipe(
    finalize(() => {
      inFlight.delete(key);
      if (button) unlock(button);
    }),
    share(),
  );
  inFlight.set(key, call);
  return call;
};

/** Call once at start-up: remembers the button a user just clicked (capture phase, before the component's own handler). */
export function lockButtonOnClick(): void {
  document.addEventListener('click', e => {
    const el = (e.target as HTMLElement | null)?.closest?.('button') as HTMLButtonElement | null;
    lastClick = el && !el.disabled ? { el, at: Date.now() } : null;
  }, true);
}

function takeClickedButton(): HTMLButtonElement | null {
  const c = lastClick;
  lastClick = null;
  return c && Date.now() - c.at <= CLICK_WINDOW_MS && c.el.isConnected ? c.el : null;
}

const locks = new WeakMap<HTMLButtonElement, number>();

function lock(el: HTMLButtonElement): void {
  const count = locks.get(el) ?? 0;
  locks.set(el, count + 1);
  if (count === 0) {
    el.dataset['submitLocked'] = '1';
    el.disabled = true;
    el.classList.add('submit-locked');
  }
}

function unlock(el: HTMLButtonElement): void {
  const count = (locks.get(el) ?? 1) - 1;
  locks.set(el, count);
  if (count <= 0) {
    delete el.dataset['submitLocked'];
    el.disabled = false;
    el.classList.remove('submit-locked');
  }
}

function bodyKey(req: HttpRequest<unknown>): string {
  const body = req.body;
  if (body == null) return '';
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const parts: string[] = [];
    body.forEach((v, k) => parts.push(`${k}=${typeof v === 'string' ? v : `${v.name}:${v.size}`}`));
    return parts.join('&');
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(Math.random()); // not serialisable: never treated as a duplicate
  }
}
