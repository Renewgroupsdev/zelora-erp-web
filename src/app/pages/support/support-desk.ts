import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/common-services/toast.service';
import { BfBars } from '../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfBarDatum, BfColumnDatum, BfDatum } from '../../shared/components/bf-charts/bf-charts.model';
import { BfColumns } from '../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../shared/components/bf-charts/bf-donut/bf-donut';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { saveBlob } from '../../shared/utils/export.util';
import { AdminCategory, DashboardData, Pagination, SupportConfig, SupportSettings, TicketSummary, priorityTone, statusTone } from './support.model';
import { ExportFormat, SupportService } from './support.service';

type Tab = 'dashboard' | 'tickets' | 'settings';

interface Filters {
  search: string; date_from: string; date_to: string; user_type: string; category_id: string; affected_module: string;
  priority: string; status: string; assigned_to: string; overdue: boolean;
}

const BLANK: Filters = { search: '', date_from: '', date_to: '', user_type: '', category_id: '', affected_module: '', priority: '', status: '', assigned_to: '', overdue: false };

/** Customer Support / Help Desk for the support team: dashboard, every ticket (filter, sort, export), settings. */
@Component({
  selector: 'app-support-desk',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AutoModuleTabs, BfDonut, BfColumns, BfBars],
  templateUrl: './support-desk.html',
  styleUrl: './support.scss',
})
export class SupportDesk implements OnInit {
  private readonly api = inject(SupportService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly statusTone = statusTone;
  readonly priorityTone = priorityTone;
  tab: Tab = 'dashboard';

  config: SupportConfig | null = null;
  agents: { id: number; name: string }[] = [];

  // dashboard
  dash: DashboardData | null = null;
  dashLoading = false;
  dashError = '';
  dashFrom = '';
  dashTo = '';
  trend: 'daily' | 'weekly' | 'monthly' = 'daily';
  statusData: BfDatum[] = [];
  typeData: BfDatum[] = [];
  categoryData: BfBarDatum[] = [];
  priorityData: BfBarDatum[] = [];
  trendData: BfColumnDatum[] = [];

  // tickets
  f: Filters = { ...BLANK };
  sortBy = 'created_at';
  sortDir: 'asc' | 'desc' = 'desc';
  page = 1;
  perPage = 15;
  items: TicketSummary[] = [];
  pagination: Pagination | null = null;
  loading = false;
  error = '';
  showExport = false;
  exporting: ExportFormat | null = null;
  private seq = 0;

  // settings
  settings: SupportSettings | null = null;
  categories: AdminCategory[] = [];
  newCategory = '';
  newAudience: 'both' | 'customer' | 'employee' = 'both';
  saving = false;

  can = (action: string) => this.auth.hasActionAccess(action);

  ngOnInit(): void {
    this.api.config().subscribe({ next: (c) => (this.config = c) });
    if (this.can('view-support-tickets')) this.api.agents().subscribe({ next: (a) => (this.agents = a), error: () => (this.agents = []) });
    this.tab = this.can('view-support-dashboard') ? 'dashboard' : this.can('view-support-tickets') ? 'tickets' : 'settings';
    this.openTab(this.tab);
  }

  @HostListener('document:click', ['$event'])
  closeMenus(e: Event): void {
    if (!(e.target as HTMLElement).closest('.sp-menu-wrap')) this.showExport = false;
  }

  openTab(tab: Tab): void {
    this.tab = tab;
    if (tab === 'dashboard') this.loadDashboard();
    if (tab === 'tickets') this.loadTickets();
    if (tab === 'settings') this.loadSettings();
  }

  /* ---------------------------------------------------------------- dashboard */

  loadDashboard(): void {
    this.dashLoading = true;
    this.dashError = '';
    this.api.dashboard({ date_from: this.dashFrom, date_to: this.dashTo, trend: this.trend }).subscribe({
      next: (d) => {
        this.dash = d;
        this.statusData = d.by_status.map((s) => ({ label: s.label, value: s.value }));
        this.typeData = d.by_user_type.map((s) => ({ label: s.label, value: s.value }));
        this.categoryData = d.by_category.map((s) => ({ label: s.label, value: s.value }));
        this.priorityData = d.by_priority.map((s) => ({ label: s.label, value: s.value }));
        this.trendData = d.trend.points.map((p) => ({ label: this.shortDate(p.period), a: p.created, b: p.resolved }));
        this.dashLoading = false;
      },
      error: async (e) => { this.dashLoading = false; this.dashError = await this.api.errorMessage(e, 'The dashboard could not be loaded.'); },
    });
  }

  private shortDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return this.trend === 'monthly' ? d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  get cards(): { key: keyof DashboardData['cards']; label: string; icon: string; tone: string }[] {
    return [
      { key: 'total', label: 'Total tickets', icon: 'bi-ticket-detailed-fill', tone: 'blue' },
      { key: 'new', label: 'New tickets', icon: 'bi-bell-fill', tone: 'purple' },
      { key: 'open', label: 'Open', icon: 'bi-folder2-open', tone: 'blue' },
      { key: 'in_progress', label: 'In progress', icon: 'bi-gear-fill', tone: 'orange' },
      { key: 'waiting_for_user', label: 'Waiting for response', icon: 'bi-hourglass-split', tone: 'gray' },
      { key: 'resolved', label: 'Resolved', icon: 'bi-check-circle-fill', tone: 'green' },
      { key: 'closed', label: 'Closed', icon: 'bi-lock-fill', tone: 'gray' },
      { key: 'overdue', label: 'Overdue', icon: 'bi-exclamation-triangle-fill', tone: 'red' },
    ];
  }

  hours(h: number | null): string {
    if (h === null) return '-';
    return h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} days`;
  }

  /* ---------------------------------------------------------------- tickets */

  private query(): Record<string, unknown> {
    return { ...this.f, sort_by: this.sortBy, sort_direction: this.sortDir };
  }

  applyFilters(): void {
    this.page = 1;
    this.loadTickets();
  }

  resetFilters(): void {
    this.f = { ...BLANK };
    this.applyFilters();
  }

  sort(col: string): void {
    this.sortDir = this.sortBy === col && this.sortDir === 'desc' ? 'asc' : 'desc';
    this.sortBy = col;
    this.page = 1;
    this.loadTickets();
  }

  goTo(p: number): void {
    if (p < 1 || (this.pagination && p > this.pagination.last_page)) return;
    this.page = p;
    this.loadTickets();
  }

  loadTickets(): void {
    const id = ++this.seq;
    this.loading = true;
    this.error = '';
    this.api.allTickets({ ...this.query(), page: this.page, per_page: this.perPage }).subscribe({
      next: (r) => { if (id !== this.seq) return; this.items = r.items; this.pagination = r.pagination; this.loading = false; },
      error: async (e) => { if (id !== this.seq) return; this.loading = false; this.error = await this.api.errorMessage(e, 'The tickets could not be loaded.'); },
    });
  }

  open(no: string): void {
    this.router.navigate(['/app/support/admin/tickets', no]);
  }

  /** Every ticket that matches the filters, not just this page. */
  download(format: ExportFormat): void {
    if (this.exporting) return;
    this.showExport = false;
    this.exporting = format;
    this.api.exportTickets(format, this.query()).subscribe({
      next: ({ blob, fileName }) => { this.exporting = null; saveBlob(blob, fileName); this.toast.success(`${format.toUpperCase()} downloaded`); },
      error: async (e) => { this.exporting = null; this.toast.error('Download failed', await this.api.errorMessage(e, 'The file could not be created.')); },
    });
  }

  /* ---------------------------------------------------------------- settings */

  loadSettings(): void {
    this.api.settings().subscribe({ next: (s) => (this.settings = s), error: () => (this.settings = null) });
    this.api.categories().subscribe({ next: (c) => (this.categories = c), error: () => (this.categories = []) });
  }

  saveSettings(): void {
    if (!this.settings || this.saving) return;
    const s = this.settings;
    this.saving = true;
    this.api.saveSettings({
      support_phone: s.support_phone, support_whatsapp: s.support_whatsapp ?? '', support_email: s.support_email ?? '', support_hours: s.support_hours ?? '',
      support_availability: s.support_availability ?? '', email_notifications: s.email_notifications === '1' ? ('1' as any) : ('0' as any),
      sla_hours_low: +s.sla_hours_low, sla_hours_medium: +s.sla_hours_medium, sla_hours_high: +s.sla_hours_high, sla_hours_critical: +s.sla_hours_critical,
    }).subscribe({
      next: (r) => { this.saving = false; this.settings = r; this.toast.success('Support settings saved.'); },
      error: async (e) => { this.saving = false; this.toast.error('Not saved', await this.api.errorMessage(e, 'The settings could not be saved.')); },
    });
  }

  addCategory(): void {
    const name = this.newCategory.trim();
    if (name.length < 2) return;
    this.api.saveCategory({ category_name: name, audience: this.newAudience, is_active: true, sort_order: this.categories.length + 1 }).subscribe({
      next: () => { this.newCategory = ''; this.loadSettings(); },
      error: async (e) => this.toast.error('Not added', await this.api.errorMessage(e, 'The category could not be added.')),
    });
  }

  toggleCategory(c: AdminCategory): void {
    this.api.saveCategory({ ...c, is_active: !c.is_active }).subscribe({ next: () => this.loadSettings(), error: async (e) => this.toast.error('Not saved', await this.api.errorMessage(e, 'Try again.')) });
  }
}
