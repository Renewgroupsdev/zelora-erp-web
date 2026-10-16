import { moduleTabGuard } from '../../shared/utils/module-tabs.util';

/** Roles & Permissions module whose tabs make up the HR page strip. */
export const HR_MODULE_SLUG = 'hr-management';

/** An HR tab the role may not see redirects to its first allowed HR tab (or the dashboard). */
export const hrTabGuard = moduleTabGuard(HR_MODULE_SLUG);
