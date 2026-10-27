import { Component, DestroyRef, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { BranchContextService } from '../../shared/common-services/branch-context.service';
import { DASH_RANGES, DASH_WIDGETS, DashRange, DashWidgetKey } from '../../shared/models/dashboard.model';
import { AppointmentsWidget } from './widgets/appointments-widget';
import { ApprovalsWidget } from './widgets/approvals-widget';
import { CustomerWidget } from './widgets/customer-widget';
import { DoctorDayWidget } from './widgets/doctor-day-widget';
import { FinanceWidget } from './widgets/finance-widget';
import { FrontDeskWidget } from './widgets/front-desk-widget';
import { KpiStrip } from './widgets/kpi-strip';
import { LeadsWidget } from './widgets/leads-widget';
import { MyDayWidget } from './widgets/my-day-widget';
import { MyWorkWidget } from './widgets/my-work-widget';
import { StockWidget } from './widgets/stock-widget';
import { TeamWidget } from './widgets/team-widget';
import { TelecallingWidget } from './widgets/telecalling-widget';
import { UnitsWidget } from './widgets/units-widget';

const RANGE_KEY = 'zelora_dashboard_range';
const AUTO_REFRESH_MS = 60_000; // the API caches each widget for a minute

/**
 * Role based dashboard - the landing page after sign-in. Which sections show is decided by the Dashboard module's
 * actions on Roles & Permissions (one per widget, see DASH_WIDGETS); the API checks the same actions and holds a
 * branch / franchise login to its own unit, so this page only arranges what the role may see:
 *
 *  - Managers (KPIs permission): key figures, income & expense, leads, appointments, call center, team, stock,
 *    approvals, branch comparison, then their own "My Work".
 *  - Operational roles (telecaller, front office, doctor): their own day first, then "My Work".
 *  - Customers: their treatments.
 *
 * Every widget loads on its own (skeleton, error + retry per section), follows the range picked here and the header
 * branch / franchise filter, and refreshes every minute while the tab is visible.
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    KpiStrip, FinanceWidget, LeadsWidget, AppointmentsWidget, UnitsWidget, TeamWidget, StockWidget, ApprovalsWidget,
    TelecallingWidget, MyDayWidget, DoctorDayWidget, FrontDeskWidget, MyWorkWidget, CustomerWidget,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  // The widget components carry no styles of their own; this sheet styles them all (every rule under .dash-page).
  encapsulation: ViewEncapsulation.None,
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly scope = inject(BranchContextService);

  readonly ranges = DASH_RANGES;
  readonly range = signal<DashRange>(readRange());
  readonly tick = signal(0);
  readonly updatedAt = signal(new Date());

  readonly user = this.auth.currentUser;
  readonly firstName = computed(() => (this.user()?.name ?? '').replace(/^Dr\.?\s*/i, 'Dr. ').split(' ').slice(0, 2).join(' ').trim());
  readonly roleName = computed(() => this.user()?.role_name ?? this.user()?.role?.name ?? '');
  readonly greeting = computed(() => {
    const h = this.updatedAt().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  });
  readonly today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /** What the figures cover: the header pick for a login that may switch, else its own unit. */
  readonly scopeLabel = computed(() => {
    if (!this.scope.enabled()) return '';
    if (!this.scope.canSwitch()) return this.scope.ownLabel();
    return this.scope.selection().type === 'all' ? 'All branches & franchises' : 'Header branch / franchise filter';
  });

  /** Permission per widget (re-evaluated when the permissions refresh). */
  readonly allowed = computed(() => {
    this.auth.permissions();
    const out = {} as Record<DashWidgetKey, boolean>;
    (Object.keys(DASH_WIDGETS) as DashWidgetKey[]).forEach(k => (out[k] = this.auth.hasActionAccess(DASH_WIDGETS[k])));
    return out;
  });
  readonly isManager = computed(() => this.allowed().kpis);
  readonly isCustomer = computed(() => this.user()?.login_type === 'customer');

  /**
   * What this login actually shows. A role can hold more widgets than fit it (Super Admin holds all of them): the
   * customer widget is only for customer logins, staff widgets never for them, and a manager's page shows the front
   * desk in its grid instead of the telecaller / doctor day views.
   */
  readonly show = computed(() => {
    const a = this.allowed();
    const staff = !this.isCustomer();
    const manager = this.isManager();
    return {
      customer: a.customer && !staff,
      myDay: a['my-day'] && staff && !manager,
      doctorDay: a['doctor-day'] && staff && !manager,
      frontDesk: a['front-desk'] && staff,
      myWork: a['my-work'] && staff,
    };
  });
  readonly hasPersonal = computed(() => {
    const s = this.show();
    return s.customer || s.myDay || s.doctorDay || (s.frontDesk && !this.isManager());
  });
  readonly nothing = computed(() => !this.isManager() && !this.hasPersonal() && !this.show().myWork);

  constructor() {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.refresh();
    }, AUTO_REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  can(key: DashWidgetKey): boolean {
    return this.allowed()[key];
  }

  setRange(range: DashRange): void {
    if (range === this.range()) return;
    this.range.set(range);
    this.updatedAt.set(new Date());
    try { localStorage.setItem(RANGE_KEY, range); } catch { /* private mode: not remembered */ }
  }

  refresh(): void {
    this.tick.update(t => t + 1);
    this.updatedAt.set(new Date());
  }
}

function readRange(): DashRange {
  try {
    const saved = localStorage.getItem(RANGE_KEY) as DashRange | null;
    if (saved && DASH_RANGES.some(r => r.key === saved)) return saved;
  } catch { /* storage blocked */ }
  return 'month';
}
