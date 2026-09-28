import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Sort, SortDirection } from '@angular/material/sort';
import { forkJoin } from 'rxjs';
import { CommonChartCard } from '../../../shared/components/common-chart-card/common-chart-card';
import { CommonTableCard } from '../../../shared/components/common-table-card/common-table-card';
import { CommonTrendChart, TrendGranularity, TrendPoint } from '../../../shared/components/common-trend-chart/common-trend-chart';
import { ApiDataService } from '../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ChartDatum, DetailTrendDirection, TableColumn, TablePageChangeEvent, TableRow } from '../../../shared/models/common-components.model';

type ReportViewMode = 'analytics' | 'records';
type DatePresetKey = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';
type ExportFormat = 'csv' | 'xlsx' | 'pdf';
type PerformanceSortBy = 'total' | 'completion_rate' | 'on_time_rate';
type FollowUpStatus = 'on_time' | 'late' | 'overdue' | 'upcoming';

interface DatePreset {
  key: DatePresetKey;
  label: string;
}

interface LookupOption {
  id: number;
  name: string;
}

interface MetricChip {
  icon: string;
  label: string;
  value: string | number;
  deltaText?: string;
  deltaDirection?: DetailTrendDirection;
}

interface SummaryData {
  total_follow_ups: number;
  on_time_count: number;
  late_count: number;
  overdue_count: number;
  upcoming_count: number;
  completion_rate: number | null;
  on_time_rate: number | null;
  avg_late_days: number | null;
}

interface PerformanceRow {
  assigned_to: number | null;
  assignee_name: string;
  total: number;
  on_time: number;
  late: number;
  overdue: number;
  upcoming: number;
  completion_rate: number | null;
  on_time_rate: number | null;
}

interface TrendRow {
  period: string;
  due: number;
  completed_on_time: number;
}

interface PeriodSummary {
  from: string;
  to: string;
  total_follow_ups: number;
  on_time_count: number;
  late_count: number;
  overdue_count: number;
  upcoming_count: number;
  completion_rate: number | null;
  on_time_rate: number | null;
}

interface ComparisonData {
  current_period: PeriodSummary;
  previous_period: PeriodSummary;
  total_growth_percent: number | null;
  completion_rate_change_percent: number | null;
  on_time_rate_change_percent: number | null;
  overdue_growth_percent: number | null;
}

const DATE_PRESETS: DatePreset[] = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'this_year', label: 'This Year' },
];

const STATUS_OPTIONS: { key: FollowUpStatus; label: string }[] = [
  { key: 'on_time', label: 'On Time' },
  { key: 'late', label: 'Late' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
];

const STATUS_LABELS: Record<FollowUpStatus, string> = {
  on_time: 'On Time',
  late: 'Late',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
};

@Component({
  selector: 'app-follow-up-report',
  standalone: true,
  imports: [CommonModule, FormsModule, CommonTableCard, CommonChartCard, CommonTrendChart],
  templateUrl: './follow-up-report.html',
  styleUrl: './follow-up-report.scss',
})
export class FollowUpReport implements OnInit {

  constructor(private apiDataService: ApiDataService, private toast: ToastService) { }

  columns: TableColumn[] = [
    { key: 'lead', header: 'Lead', type: 'lead', width: '20%', sortable: false },
    { key: 'contact', header: 'Contact', type: 'text', width: '12%', sortable: false },
    { key: 'assignee', header: 'Assigned Caller', type: 'text', width: '16%', sortable: false },
    { key: 'follow_up_date', header: 'Follow-up Date', type: 'text', width: '13%', sortable: false },
    { key: 'follow_up_time', header: 'Time', type: 'text', width: '9%', sortable: false },
    { key: 'status', header: 'Status', type: 'badge', width: '10%', sortable: false },
    { key: 'notes', header: 'Notes', type: 'text', width: '20%', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  readonly datePresets = DATE_PRESETS;
  readonly statusOptions = STATUS_OPTIONS;

  viewMode: ReportViewMode = 'analytics';

  // Follow-ups list (Records tab)
  isLoading = false;
  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = '';
  sortDirection: SortDirection = '';

  // Follow-ups-by-status chart (derived from /summary counts)
  statusChartData: ChartDatum[] = [];

  // KPI summary dashboard
  isSummaryLoading = false;
  summary: SummaryData | null = null;

  // Per-caller performance table
  isPerformanceLoading = false;
  performanceRows: PerformanceRow[] = [];
  performanceSortBy: PerformanceSortBy = 'total';
  performanceSortDir: SortDirection = 'desc';

  // On-time completion rate trend
  isTrendLoading = false;
  trendRows: TrendRow[] = [];
  trendGranularity: TrendGranularity = 'day';

  // Comparison vs previous period
  isComparisonLoading = false;
  comparison: ComparisonData | null = null;

  // Filters
  sourceOptions: LookupOption[] = [];
  callerOptions: LookupOption[] = [];
  sourceId: number | null = null;
  assignedTo: number | null = null;
  followUpStatus: FollowUpStatus | null = null;
  search = '';

  isDatePanelOpen = false;
  datePanelPosition = { top: 0, left: 0 };
  activePreset: DatePresetKey = 'all';
  dateFrom: string | null = null;
  dateTo: string | null = null;
  draftDateFrom: string | null = null;
  draftDateTo: string | null = null;

  isExportMenuOpen = false;
  exportMenuPosition = { top: 0, left: 0 };
  isExporting = false;

  ngOnInit(): void {
    forkJoin({
      sources: this.apiDataService.GET(ApiRoutesConstants.Source_List_Options),
      users: this.apiDataService.GET(`${ApiRoutesConstants.USER_LIST}?status=1&per_page=100`),
    }).subscribe({
      next: ({ sources, users }: any) => {
        this.sourceOptions = (sources?.data?.data ?? []).map((s: any) => ({ id: s.id, name: s.source_name }));
        this.callerOptions = (users?.data?.data ?? []).map((u: any) => ({ id: u.id, name: u.name }));
        this.refreshAll();
      },
      error: () => this.refreshAll(),
    });
  }

  /** Every filter-driven panel reloads together so the KPI strip, both charts, the
   *  performance table and the records list always agree on the same filtered slice. */
  refreshAll(): void {
    this.loadReport(1);
    this.loadSummary();
    this.loadPerformance();
    this.loadTrend();
    this.loadComparison();
  }

  loadReport(page: number = this.currentPage): void {
    this.isLoading = true;

    const params = [`page=${page}`, `per_page=${this.pageSize}`, ...this.buildSharedFilterParams()];

    this.apiDataService
      .GET(`${ApiRoutesConstants.REPORT_FOLLOW_UP}?${params.join('&')}`)
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;

          if (!response?.success) {
            this.toast.error(response?.message || 'Failed to load follow-up report.');
            return;
          }

          const data = response.data ?? {};
          const followUpsPage = data.follow_ups ?? {};
          const followUps = Array.isArray(followUpsPage.data) ? followUpsPage.data : [];

          this.rows = followUps.map((row: any) => this.mapFollowUpToRow(row));
          this.currentPage = Number(followUpsPage.current_page ?? page);
          this.pageSize = Number(followUpsPage.per_page ?? this.pageSize);
          this.totalRecords = Number(followUpsPage.total ?? followUps.length);
        },
        error: (err: any) => {
          this.isLoading = false;
          this.toast.error('Failed to load follow-up report. Please try again.');
          console.error('Failed to load follow-up report:', err);
        },
      });
  }

  loadSummary(): void {
    this.isSummaryLoading = true;
    const params = this.buildSharedFilterParams();
    const query = params.length ? `?${params.join('&')}` : '';

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_FOLLOW_UP_SUMMARY}${query}`).subscribe({
      next: (response: any) => {
        this.isSummaryLoading = false;
        this.summary = response?.success ? (response.data ?? null) : null;

        this.statusChartData = this.summary ? [
          { label: 'On Time', value: this.summary.on_time_count },
          { label: 'Late', value: this.summary.late_count },
          { label: 'Overdue', value: this.summary.overdue_count },
          { label: 'Upcoming', value: this.summary.upcoming_count },
        ].filter((d) => d.value > 0) : [];
      },
      error: (err: any) => {
        this.isSummaryLoading = false;
        console.error('Failed to load follow-up summary:', err);
      },
    });
  }

  loadPerformance(): void {
    this.isPerformanceLoading = true;
    const params = [
      ...this.buildSharedFilterParams(),
      `sort_by=${this.performanceSortBy}`,
      `sort_dir=${this.performanceSortDir === 'asc' ? 'asc' : 'desc'}`,
    ];

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_FOLLOW_UP_PERFORMANCE}?${params.join('&')}`).subscribe({
      next: (response: any) => {
        this.isPerformanceLoading = false;
        this.performanceRows = Array.isArray(response?.data) ? response.data : [];
      },
      error: (err: any) => {
        this.isPerformanceLoading = false;
        console.error('Failed to load follow-up performance:', err);
      },
    });
  }

  loadTrend(): void {
    this.isTrendLoading = true;
    const params = [...this.buildSharedFilterParams(), `granularity=${this.trendGranularity}`];

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_FOLLOW_UP_TREND}?${params.join('&')}`).subscribe({
      next: (response: any) => {
        this.isTrendLoading = false;
        this.trendRows = Array.isArray(response?.data) ? response.data : [];
      },
      error: (err: any) => {
        this.isTrendLoading = false;
        console.error('Failed to load follow-up trend:', err);
      },
    });
  }

  loadComparison(): void {
    this.isComparisonLoading = true;
    const params = this.buildSharedFilterParams();
    const query = params.length ? `?${params.join('&')}` : '';

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_FOLLOW_UP_COMPARISON}${query}`).subscribe({
      next: (response: any) => {
        this.isComparisonLoading = false;
        this.comparison = response?.success ? (response.data ?? null) : null;
      },
      error: (err: any) => {
        this.isComparisonLoading = false;
        console.error('Failed to load follow-up comparison:', err);
      },
    });
  }

  /** The filter set shared by every follow-up report endpoint: date range/preset (on
   *  follow_up_date), source, assigned caller, follow-up status, and search text. */
  private buildSharedFilterParams(): string[] {
    const params: string[] = [];

    if (this.sourceId) params.push(`source_id=${this.sourceId}`);
    if (this.assignedTo) params.push(`assigned_to=${this.assignedTo}`);
    if (this.followUpStatus) params.push(`follow_up_status=${this.followUpStatus}`);
    if (this.search.trim()) params.push(`search=${encodeURIComponent(this.search.trim())}`);

    if (this.activePreset === 'custom') {
      if (this.dateFrom) params.push(`date_from=${this.dateFrom}`);
      if (this.dateTo) params.push(`date_to=${this.dateTo}`);
    } else if (this.activePreset !== 'all') {
      params.push(`date_preset=${this.activePreset}`);
    }

    return params;
  }

  private mapFollowUpToRow(row: any): TableRow {
    const status: FollowUpStatus = row.follow_up_status ?? 'upcoming';

    return {
      lead: {
        name: row.lead?.name ?? '',
        subtitle: `FU-${String(row.id ?? '').padStart(5, '0')}`,
      },
      contact: row.lead?.mobile_no ?? '',
      assignee: row.lead?.assignee?.name ?? 'Unassigned',
      follow_up_date: this.formatDate(row.follow_up_date),
      follow_up_time: row.follow_up_time ?? '—',
      status: STATUS_LABELS[status] ?? status,
      notes: row.notes ?? '',
      id: row.id,
    };
  }

  private formatDate(value: unknown): string {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day}-${month}-${date.getFullYear()}`;
  }

  get recordCountText(): string {
    return `${this.totalRecords.toLocaleString()} records`;
  }

  get pageInfoText(): string {
    if (!this.totalRecords) {
      return 'Showing 0 follow-ups';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} follow-ups`;
  }

  get dateRangeLabel(): string {
    if (this.activePreset !== 'custom') {
      return this.datePresets.find((preset) => preset.key === this.activePreset)?.label ?? 'All Time';
    }

    if (!this.dateFrom && !this.dateTo) return 'Custom Range';
    const from = this.dateFrom ? this.formatShortDate(this.dateFrom) : 'Start';
    const to = this.dateTo ? this.formatShortDate(this.dateTo) : 'End';
    return `${from} - ${to}`;
  }

  /** A single slim metrics bar merges the /summary KPIs with their /comparison deltas,
   *  instead of two stacked rows of full-size cards - keeps the charts and list above
   *  the fold. */
  get metricsStrip(): MetricChip[] {
    if (!this.summary) return [];
    const s = this.summary;
    const c = this.comparison;

    return [
      { icon: 'bi-calendar2-week-fill', label: 'Total Follow-ups', value: s.total_follow_ups ?? 0, deltaText: this.deltaText(c?.total_growth_percent), deltaDirection: this.trendDirectionFor(c?.total_growth_percent ?? null) },
      { icon: 'bi-exclamation-triangle-fill', label: 'Overdue', value: s.overdue_count ?? 0, deltaText: this.deltaText(c?.overdue_growth_percent), deltaDirection: this.trendDirectionFor(c?.overdue_growth_percent ?? null, true) },
      { icon: 'bi-hourglass-split', label: 'Late', value: s.late_count ?? 0 },
      { icon: 'bi-check-circle-fill', label: 'On Time', value: s.on_time_count ?? 0 },
      { icon: 'bi-graph-up-arrow', label: 'Completion Rate', value: this.formatRate(s.completion_rate), deltaText: this.deltaText(c?.completion_rate_change_percent, 'pp'), deltaDirection: this.trendDirectionFor(c?.completion_rate_change_percent ?? null) },
      { icon: 'bi-clock-history', label: 'On-Time Rate', value: this.formatRate(s.on_time_rate), deltaText: this.deltaText(c?.on_time_rate_change_percent, 'pp'), deltaDirection: this.trendDirectionFor(c?.on_time_rate_change_percent ?? null) },
      { icon: 'bi-calendar-x-fill', label: 'Avg. Days Late', value: s.avg_late_days === null ? '—' : s.avg_late_days },
    ];
  }

  get comparisonPeriodLabel(): string | null {
    if (!this.comparison?.previous_period) return null;
    return `vs ${this.comparison.previous_period.from} to ${this.comparison.previous_period.to}`;
  }

  /** Conversion-rate-style deltas: up is good. `invert` flips that for metrics where a
   *  rise is bad (e.g. more overdue follow-ups is a regression, not an improvement). */
  private trendDirectionFor(percent: number | null, invert = false): DetailTrendDirection {
    if (percent === null || percent === undefined || percent === 0) return 'neutral';
    const isUp = percent > 0;
    return (isUp && !invert) || (!isUp && invert) ? 'up' : 'down';
  }

  private deltaText(percent: number | null | undefined, unit: string = '%'): string | undefined {
    if (percent === null || percent === undefined) return undefined;
    const sign = percent > 0 ? '+' : '';
    return `${sign}${percent}${unit}`;
  }

  private formatRate(rate: number | null | undefined): string {
    return rate === null || rate === undefined ? '—' : `${rate}%`;
  }

  formatTrendValue(value: number | null): string {
    if (value === null || value === undefined) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value}%`;
  }

  /** The trend endpoint returns due/completed-on-time counts per period; the on-time
   *  completion rate (the one number this report adds beyond a plain volume chart) is
   *  derived here rather than duplicating this ratio server-side for a single chart. */
  get trendPoints(): TrendPoint[] {
    return this.trendRows.map((row) => ({
      period: row.period,
      total: row.due > 0 ? Math.round((row.completed_on_time / row.due) * 1000) / 10 : 0,
    }));
  }

  get trendTotals(): { due: number; completedOnTime: number } {
    return this.trendRows.reduce(
      (acc, row) => ({ due: acc.due + row.due, completedOnTime: acc.completedOnTime + row.completed_on_time }),
      { due: 0, completedOnTime: 0 },
    );
  }

  /** Positioned via fixed viewport coordinates (not CSS absolute/right:0) so the panel
   *  floats above the report's scrollable container instead of being clipped by its
   *  scrollbar, and stays clamped on-screen on narrow viewports. */
  toggleDatePanel(event: MouseEvent): void {
    if (!this.isDatePanelOpen) {
      this.draftDateFrom = this.dateFrom;
      this.draftDateTo = this.dateTo;
      this.datePanelPosition = this.positionBelow(event.currentTarget as HTMLElement, 360);
    }
    this.isDatePanelOpen = !this.isDatePanelOpen;
  }

  private positionBelow(trigger: HTMLElement, panelWidth: number): { top: number; left: number } {
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(panelWidth, window.innerWidth * 0.9);
    const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
    return { top: rect.bottom + 7, left };
  }

  selectPreset(preset: DatePresetKey): void {
    this.activePreset = preset;
    this.dateFrom = null;
    this.dateTo = null;
    this.isDatePanelOpen = false;
    this.refreshAll();
  }

  applyCustomRange(): void {
    this.activePreset = 'custom';
    this.dateFrom = this.draftDateFrom;
    this.dateTo = this.draftDateTo;
    this.isDatePanelOpen = false;
    this.refreshAll();
  }

  resetDateRange(): void {
    this.activePreset = 'all';
    this.dateFrom = null;
    this.dateTo = null;
    this.isDatePanelOpen = false;
    this.refreshAll();
  }

  onSourceFilterChange(): void {
    this.refreshAll();
  }

  onCallerFilterChange(): void {
    this.refreshAll();
  }

  onStatusFilterChange(): void {
    this.refreshAll();
  }

  onSearchSubmit(): void {
    this.refreshAll();
  }

  clearAllFilters(): void {
    this.sourceId = null;
    this.assignedTo = null;
    this.followUpStatus = null;
    this.search = '';
    this.activePreset = 'all';
    this.dateFrom = null;
    this.dateTo = null;
    this.isDatePanelOpen = false;
    this.refreshAll();
  }

  get hasActiveFilters(): boolean {
    return !!this.sourceId || !!this.assignedTo || !!this.followUpStatus || !!this.search.trim() || this.activePreset !== 'all';
  }

  setPerformanceSort(sortBy: PerformanceSortBy): void {
    if (this.performanceSortBy === sortBy) {
      this.performanceSortDir = this.performanceSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.performanceSortBy = sortBy;
      this.performanceSortDir = 'desc';
    }
    this.loadPerformance();
  }

  onTrendGranularityChange(granularity: TrendGranularity): void {
    this.trendGranularity = granularity;
    this.loadTrend();
  }

  get exportType(): 'follow_ups' | 'performance' {
    return this.viewMode === 'records' ? 'follow_ups' : 'performance';
  }

  toggleExportMenu(event: MouseEvent): void {
    if (!this.isExportMenuOpen) {
      this.exportMenuPosition = this.positionBelow(event.currentTarget as HTMLElement, 170);
    }
    this.isExportMenuOpen = !this.isExportMenuOpen;
  }

  exportReport(format: ExportFormat): void {
    this.isExportMenuOpen = false;
    this.isExporting = true;

    const type = this.exportType;
    const params = [...this.buildSharedFilterParams(), `format=${format}`, `export_type=${type}`];

    this.apiDataService.GET_BLOB(`${ApiRoutesConstants.REPORT_FOLLOW_UP_EXPORT}?${params.join('&')}`).subscribe({
      next: (blob: Blob) => {
        this.isExporting = false;
        this.downloadBlob(blob, `follow-up-${type}-${this.timestampForFilename()}.${format}`);
      },
      error: (err: any) => {
        this.isExporting = false;
        this.toast.error('Failed to export the report. Please try again.');
        console.error('Failed to export follow-up report:', err);
      },
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }

  private timestampForFilename(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.date-range')) {
      this.isDatePanelOpen = false;
    }
    if (!target.closest('.export-menu')) {
      this.isExportMenuOpen = false;
    }
  }

  private formatShortDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day} ${month}`;
  }

  onPageChange(event: TablePageChangeEvent): void {
    this.pageSize = event.pageSize;
    this.loadReport(event.page);
  }

  onSortChange(sort: Sort): void {
    // Columns are marked non-sortable since rows reflect a single server-paginated page only.
    this.sortActive = sort.active;
    this.sortDirection = sort.direction || '';
  }
}
