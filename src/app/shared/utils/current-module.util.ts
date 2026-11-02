import { SidebarModule } from '../models/permission.model';

/** Modules with no data trail of their own to show (the Audit Trail pages are the trail). */
const SKIP = new Set(['dashboard', 'audit-trail']);

const clean = (url: string | null | undefined) => (url ?? '').split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '');

/**
 * The sidebar module (slug + name) that owns the current URL, or null on pages without one. A sub-module page
 * ("Follow Up") resolves to that sub-module; other pages of a parent resolve to the parent. Matching is by URL
 * prefix, falling back to the first path segment ("hr/payroll" belongs to the module whose URL starts "app/hr").
 */
export function currentModule(menus: SidebarModule[] | null | undefined, url: string): { slug: string; name: string } | null {
  const path = clean(url);
  if (!path.startsWith('app/')) return null;
  const segment = path.split('/')[1] ?? '';

  let best: { slug: string; name: string; score: number } | null = null;
  const consider = (node: SidebarModule, parent: SidebarModule | null) => {
    const u = clean(node.url);
    if (!u || SKIP.has(node.slug_name) || (parent && SKIP.has(parent.slug_name))) return;
    const exact = path === u || path.startsWith(u + '/');
    const sameArea = !exact && u.split('/')[1] === segment && !parent;
    const score = exact ? 1000 + u.length : sameArea ? 100 : 0;
    if (score > (best?.score ?? 0)) best = { slug: node.slug_name, name: node.module_name, score };
  };
  for (const m of menus ?? []) {
    consider(m, null);
    for (const c of m.sub_modules ?? []) consider(c, m);
  }
  const hit = best as { slug: string; name: string } | null;

  return hit ? { slug: hit.slug, name: hit.name } : null;
}
