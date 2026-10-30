import { Component, DestroyRef, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BranchContextService } from '../../shared/common-services/branch-context.service';
import { DASH_RANGES, DASH_WIDGETS, DashRange, DashWidgetKey } from '../../shared/models/dashboard.model';
import { AppointmentsWidget } from './widgets/appointments-widget/appointments-widget';
import { ApprovalsWidget } from './widgets/approvals-widget/approvals-widget';
import { CustomerWidget } from './widgets/customer-widget/customer-widget';
import { DoctorDayWidget } from './widgets/doctor-day-widget/doctor-day-widget';
import { FinanceWidget } from './widgets/finance-widget/finance-widget';
import { FrontDeskWidget } from './widgets/front-desk-widget/front-desk-widget';
import { KpiStrip } from './widgets/kpi-strip/kpi-strip';
import { LeadSourceWidget } from './widgets/lead-source-widget/lead-source-widget';
import { LeadsWidget } from './widgets/leads-widget/leads-widget';
import { TodayWidget } from './widgets/today-widget/today-widget';
import { MyDayWidget } from './widgets/my-day-widget/my-day-widget';
import { MyWorkWidget } from './widgets/my-work-widget/my-work-widget';
import { StockWidget } from './widgets/stock-widget/stock-widget';
import { TeamWidget } from './widgets/team-widget/team-widget';
import { TelecallingWidget } from './widgets/telecalling-widget/telecalling-widget';
import { UnitsWidget } from './widgets/units-widget/units-widget';

const RANGE_KEY = 'zelora_dashboard_range';
const AUTO_REFRESH_MS = 60_000; // the API caches each widget for a minute

/** Quick links: a link shows only when the role can open its module (the slugs the widgets' drill-downs use). */
const QUICK_LINKS: { label: string; icon: string; link: string; module: string; tone: string }[] = [
  { label: 'Leads', icon: 'bi-person-lines-fill', link: '/app/lead-management', module: 'lead-management', tone: 'green' },
  { label: 'Follow-ups', icon: 'bi-telephone-forward', link: '/app/follow-ups', module: 'follow-up', tone: 'blue' },
  { label: 'Appointments', icon: 'bi-calendar2-check', link: '/app/appointments', module: 'appoinment', tone: 'orange' },
  { label: 'Call center', icon: 'bi-headset', link: '/app/call-center', module: 'tele-caller', tone: 'purple' },
  { label: 'Day book', icon: 'bi-journal-text', link: '/app/accounts/day-book', module: 'accounts-management', tone: 'green' },
  { label: 'Stock', icon: 'bi-box-seam', link: '/app/inventory/stock', module: 'purchase-management', tone: 'red' },
  { label: 'Attendance', icon: 'bi-person-check', link: '/app/hr/attendance', module: 'hr-management', tone: 'blue' },
  { label: 'Branches', icon: 'bi-diagram-3', link: '/app/branches', module: 'branch-management', tone: 'purple' },
];

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
    NgTemplateOutlet, RouterLink, KpiStrip, TodayWidget, LeadSourceWidget, FinanceWidget, LeadsWidget, AppointmentsWidget, UnitsWidget, TeamWidget, StockWidget, ApprovalsWidget,
    TelecallingWidget, MyDayWidget, DoctorDayWidget, FrontDeskWidget, MyWorkWidget, CustomerWidget,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  // Shared dashboard styles (every rule under .dash-page); each widget adds its own sheet, scoped the same way.
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
  readonly rangeLabel = computed(() => DASH_RANGES.find(r => r.key === this.range())?.label ?? '');
  readonly subtitle = computed(() => {
    if (this.isCustomer()) return 'Your treatments and coming visits.';
    if (!this.isManager()) return 'Your day, starting with what needs you first.';
    const r = this.range();
    const when = r === 'today' ? 'today' : r === 'month' ? 'this month' : r === 'year' ? 'this year' : r === 'quarter' ? 'this quarter' : 'over the last ' + this.rangeLabel().toLowerCase();
    return `Here's what's happening across the clinics ${when}.`;
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
  readonly quickLinks = computed(() => {
    this.auth.permissions();
    return this.isCustomer() ? [] : QUICK_LINKS.filter(q => this.auth.hasModuleAccess(q.module));
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

  /** The print stylesheet turns the page into a light report (dark panels go white, the ECG trace is hidden). */
  exportReport(): void {
    window.print();
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
