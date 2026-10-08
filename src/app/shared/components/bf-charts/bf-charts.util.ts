/** Canvas colour helpers and ring geometry shared by the Chart.js charts. */

/** Resolve a CSS colour (hex, rgb() or var(--token)) to RGB so it can be mixed on a canvas. */
export const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d', { willReadFrequently: true }) : null;

export function cssVar(name: string, fallback: string): string {
  return (typeof document !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || fallback;
}

export function toRgb(css: string): [number, number, number] {
  const token = /^var\((--[^,)]+)/.exec(css);
  const value = token ? cssVar(token[1], '#2563eb') : css;
  if (!probe) return [37, 99, 235];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

export type Rgb = [number, number, number];
/** The text itself when it fits in `maxWidth` on one line, otherwise empty (a cut-off name looks worse than none). */
export function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  return maxWidth >= 24 && ctx.measureText(text).width <= maxWidth ? text : '';
}

export const lighten = (c: Rgb, t: number): Rgb => [0, 1, 2].map(i => Math.round(c[i] + (255 - c[i]) * t)) as Rgb;
export const darken = (c: Rgb, t: number): Rgb => [0, 1, 2].map(i => Math.round(c[i] * (1 - t))) as Rgb;
export const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

/** Arc geometry Chart.js keeps on the dataset controller (not part of its public typings). */
export interface RingGeometry { outerRadius: number; innerRadius: number; }
