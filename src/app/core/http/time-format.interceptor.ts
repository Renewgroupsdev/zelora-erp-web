import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { to12Hour } from '../../shared/utils/format.util';

/** Field names that hold a clock time: "time", "*_time", "time_from", "time_to". */
const TIME_KEY = /^(time|time_from|time_to|.+_time)$/i;
/** A pure 24-hour clock time such as "16:30" or "16:30:00" (dates / timestamps do not match). */
const TIME_24H = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function convert(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map(item => convert(item));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v, k)]));
  }
  if (key && typeof value === 'string' && TIME_KEY.test(key) && TIME_24H.test(value.trim())) {
    return to12Hour(value);
  }
  return value;
}

/**
 * Every clock time the app sends to the API is in 12-hour form ("04:30 PM"), whichever screen it comes from. The
 * time pickers themselves hold 24-hour values; this converts them on the way out, so no screen has to remember to.
 * The API converts them back before validating.
 */
export const timeFormatInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const sendsBody = ['POST', 'PUT', 'PATCH'].includes(req.method);

  if (!sendsBody || !auth.isApiUrl(req.url) || (!isPlainObject(req.body) && !Array.isArray(req.body))) {
    return next(req);
  }

  return next(req.clone({ body: convert(req.body) }));
};
