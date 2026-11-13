import { Component, DestroyRef, HostListener, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BranchContextService } from '../../shared/common-services/branch-context.service';
import { BranchOptionsService } from '../../shared/common-services/branch-options.service';
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
/* Each link has its own colour (icon tile, glow, arrow) and a one-line hint of what it opens. */
const QUICK_LINKS: { label: string; hint: string; icon: string; link: string; module: string; tone: string; color: string }[] = [
  { label: 'Leads', hint: 'New enquiries', icon: 'bi-person-lines-fill', link: '/app/lead-management', module: 'lead-management', tone: 'green', color: '#1fae5b' },
  { label: 'Follow-ups', hint: 'Calls due today', icon: 'bi-telephone-forward-fill', link: '/app/follow-ups', module: 'follow-up', tone: 'blue', color: '#2f6fe5' },
  { label: 'Appointments', hint: 'Visits & bookings', icon: 'bi-calendar2-check-fill', link: '/app/appointments', module: 'appoinment', tone: 'orange', color: '#ee6a17' },
  { label: 'Call center', hint: 'Live calls & team', icon: 'bi-headset', link: '/app/call-center', module: 'tele-caller', tone: 'purple', color: '#7b35e6' },
  { label: 'Day book', hint: 'Today\'s money in / out', icon: 'bi-journal-text', link: '/app/accounts/day-book', module: 'accounts-management', tone: 'teal', color: '#0ea5a4' },
  { label: 'Stock', hint: 'Levels & transfers', icon: 'bi-box-seam-fill', link: '/app/inventory/stock', module: 'purchase-management', tone: 'red', color: '#e0344f' },
  { label: 'Attendance', hint: 'Who is in today', icon: 'bi-person-check-fill', link: '/app/hr/attendance', module: 'hr-management', tone: 'indigo', color: '#4a3fdc' },
  { label: 'Branches', hint: 'Units & franchises', icon: 'bi-diagram-3-fill', link: '/app/branches', module: 'branch-management', tone: 'pink', color: '#d6336c' },
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
  private readonly branchOptions = inject(BranchOptionsService);

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
    const s = this.scope.selection();
    if (s.type === 'all') return this.scope.allAccess() ? 'All branches & franchises' : 'All my branches';
    if (s.id === null) return s.type === 'branch' ? 'All branches' : 'All franchises';
    return this.branchOptions.nameOf(s.type, s.id) || (s.type === 'branch' ? 'Selected branch' : 'Selected franchise');
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

  /** Period dropdown: each option carries the dates it covers (this month = 1st of the month up to today). */
  readonly rangeOpen = signal(false);
  readonly rangeOptions = computed(() => {
    this.tick(); // re-evaluate "today" on refresh
    return DASH_RANGES.map(r => ({ ...r, span: rangeSpan(r.key) }));
  });
  readonly rangeSpanLabel = computed(() => this.rangeOptions().find(o => o.key === this.range())?.span ?? '');

  toggleRange(): void { this.rangeOpen.update(v => !v); }

  pickRange(range: DashRange): void {
    this.rangeOpen.set(false);
    this.setRange(range);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (this.rangeOpen() && !(e.target as HTMLElement).closest('.dash-range-wrap')) this.rangeOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.rangeOpen.set(false); }

  setRange(range: DashRange): void {
    if (range === this.range()) return;
    this.range.set(range);
    this.updatedAt.set(new Date());
    try { sessionStorage.setItem(RANGE_KEY, range); } catch { /* private mode: not remembered */ }
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

/** Every visit opens on the current month (1st up to today); a pick is kept only for the browser session. */
function readRange(): DashRange {
  try {
    const saved = sessionStorage.getItem(RANGE_KEY) as DashRange | null;
    if (saved && DASH_RANGES.some(r => r.key === saved)) return saved;
  } catch { /* storage blocked */ }
  return 'month';
}

/** "1 Nov until 13 Nov 2026" style label for the dates a range covers. */
function rangeSpan(key: DashRange): string {
  const end = new Date();
  const start = new Date(end);
  switch (key) {
    case '7d': start.setDate(end.getDate() - 6); break;
    case '30d': start.setDate(end.getDate() - 29); break;
    case 'month': start.setDate(1); break;
    case 'quarter': start.setMonth(Math.floor(end.getMonth() / 3) * 3, 1); break;
    case 'year': start.setMonth(0, 1); break;
  }
  const f = (d: Date, y: boolean) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) });
  return key === 'today' ? f(end, true) : `${f(start, false)} until ${f(end, true)}`;
}
