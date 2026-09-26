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
type PerformanceSortBy = 'total' | 'conversion_rate';

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
  total_leads: number;
  total_sources: number;
  top_source: { source_id: number; source_name: string; total: number } | null;
  status_breakdown: { status_id: number; status_name: string; total: number }[];
  converted_count: number;
  lost_count: number;
  pending: number;
  conversion_rate: number | null;
}

interface PerformanceRow {
  source_id: number;
  source_name: string;
  total: number;
  converted: number | null;
  lost: number | null;
  pending: number;
  conversion_rate: number | null;
  trend_vs_previous_period: number | null;
}

interface PeriodSummary {
  from: string;
  to: string;
  total_leads: number;
  converted_count: number;
  lost_count: number;
  conversion_rate: number | null;
}

interface ComparisonData {
  current_period: PeriodSummary;
  previous_period: PeriodSummary;
  total_leads_growth_percent: number | null;
  conversion_rate_change_percent: number | null;
  converted_leads_growth_percent: number | null;
  lost_leads_growth_percent: number | null;
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

@Component({
  selector: 'app-lead-report',
  standalone: true,
  imports: [CommonModule, FormsModule, CommonTableCard, CommonChartCard, CommonTrendChart],
  templateUrl: './lead-report.html',
  styleUrl: './lead-report.scss',
})
export class LeadReport implements OnInit {

  constructor(private apiDataService: ApiDataService, private toast: ToastService) { }

  columns: TableColumn[] = [
    { key: 'lead', header: 'Name', type: 'lead', width: '16%', sortable: false },
    { key: 'contact', header: 'Contact', type: 'text', width: '10%', sortable: false },
    { key: 'gender', header: 'Gender', type: 'text', width: '8%', sortable: false },
    { key: 'source', header: 'Source', type: 'text', width: '11%', sortable: false },
    { key: 'service_category', header: 'Service Category', type: 'text', width: '14%', sortable: false },
    { key: 'service_request', header: 'Service Request', type: 'text', width: '14%', sortable: false },
    { key: 'status', header: 'Status', type: 'badge', width: '10%', sortable: false },
    { key: 'created_at', header: 'Lead Date', type: 'text', width: '10%', sortable: false },
  ];

  readonly pageSizeOptions = [10, 30, 50, 100];
  readonly datePresets = DATE_PRESETS;

  viewMode: ReportViewMode = 'analytics';

  // Leads list (Records tab)
  isLoading = false;
  rows: TableRow[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortActive = '';
  sortDirection: SortDirection = '';

  // Leads-by-source chart (existing customer-source endpoint)
  sourceChartData: ChartDatum[] = [];
  topSourceInsight = '';

  // KPI summary dashboard
  isSummaryLoading = false;
  summary: SummaryData | null = null;

  // Source performance table
  isPerformanceLoading = false;
  performanceRows: PerformanceRow[] = [];
  performanceSortBy: PerformanceSortBy = 'total';
  performanceSortDir: SortDirection = 'desc';

  // Monthly generation trend chart
  isTrendLoading = false;
  trendPoints: TrendPoint[] = [];
  trendGranularity: TrendGranularity = 'day';

  // Comparison vs previous period
  isComparisonLoading = false;
  comparison: ComparisonData | null = null;

  // Filters
  sourceOptions: LookupOption[] = [];
  statusOptions: LookupOption[] = [];
  sourceId: number | null = null;
  statusId: number | null = null;
  search = '';
  /** Which status(es) represent a "won" lead - inferred from the configured lead
   *  statuses (the "Customer" stage) since the backend has no fixed converted/lost
   *  column and expects the caller to say which ids count. */
  private convertedStatusIds: number[] = [];

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
      statuses: this.apiDataService.GET(ApiRoutesConstants.Status_List_Options),
    }).subscribe({
      next: ({ sources, statuses }: any) => {
        this.sourceOptions = (sources?.data?.data ?? []).map((s: any) => ({ id: s.id, name: s.source_name }));
        this.statusOptions = (statuses?.data?.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
        this.convertedStatusIds = this.statusOptions
          .filter((s) => s.name.trim().toLowerCase() === 'customer')
          .map((s) => s.id);
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

  /** The customer-source report paginates leads server-side (Laravel paginate()), so a page
   *  change re-fetches rather than slicing a locally held array. */
  loadReport(page: number = this.currentPage): void {
    this.isLoading = true;

    const params = [`page=${page}`, `per_page=${this.pageSize}`, ...this.buildSharedFilterParams()];

    this.apiDataService
      .GET(`${ApiRoutesConstants.REPORT_CUSTOMER_SOURCE}?${params.join('&')}`)
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;

          if (!response?.success) {
            this.toast.error(response?.message || 'Failed to load lead source report.');
            return;
          }

          const data = response.data ?? {};
          const leadsPage = data.leads ?? {};
          const leads = Array.isArray(leadsPage.data) ? leadsPage.data : [];

          this.rows = leads.map((lead: any) => this.mapLeadToRow(lead));
          this.currentPage = Number(leadsPage.current_page ?? page);
          this.pageSize = Number(leadsPage.per_page ?? this.pageSize);
          this.totalRecords = Number(leadsPage.total ?? leads.length);

          // Laravel serializes an empty grouped collection as `{}` rather than `[]`,
          // so a date range with no matching leads returns a non-array here.
          const sourceSummary = Array.isArray(data.source_summary) ? data.source_summary : [];
          const totalLeads = Number(data.total_leads ?? this.totalRecords);

          this.sourceChartData = sourceSummary.map((source: any) => ({
            label: source.source_name ?? 'Unknown',
            value: Number(source.total ?? 0),
          }));
          this.topSourceInsight = this.buildTopSourceInsight(this.sourceChartData, totalLeads);
        },
        error: (err: any) => {
          this.isLoading = false;
          this.toast.error('Failed to load lead source report. Please try again.');
          console.error('Failed to load lead source report:', err);
        },
      });
  }

  loadSummary(): void {
    this.isSummaryLoading = true;
    const params = this.buildSharedFilterParams();
    const query = params.length ? `?${params.join('&')}` : '';

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_CUSTOMER_SOURCE_SUMMARY}${query}`).subscribe({
      next: (response: any) => {
        this.isSummaryLoading = false;
        this.summary = response?.success ? (response.data ?? null) : null;
      },
      error: (err: any) => {
        this.isSummaryLoading = false;
        console.error('Failed to load lead source summary:', err);
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

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_CUSTOMER_SOURCE_PERFORMANCE}?${params.join('&')}`).subscribe({
      next: (response: any) => {
        this.isPerformanceLoading = false;
        this.performanceRows = Array.isArray(response?.data) ? response.data : [];
      },
      error: (err: any) => {
        this.isPerformanceLoading = false;
        console.error('Failed to load lead source performance:', err);
      },
    });
  }

  loadTrend(): void {
    this.isTrendLoading = true;
    const params = [...this.buildSharedFilterParams(), `granularity=${this.trendGranularity}`];

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_CUSTOMER_SOURCE_TREND}?${params.join('&')}`).subscribe({
      next: (response: any) => {
        this.isTrendLoading = false;
        const rows = Array.isArray(response?.data) ? response.data : [];
        this.trendPoints = rows.map((row: any) => ({ period: row.period, total: Number(row.total ?? 0) }));
      },
      error: (err: any) => {
        this.isTrendLoading = false;
        console.error('Failed to load lead generation trend:', err);
      },
    });
  }

  loadComparison(): void {
    this.isComparisonLoading = true;
    const params = this.buildSharedFilterParams();
    const query = params.length ? `?${params.join('&')}` : '';

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_CUSTOMER_SOURCE_COMPARISON}${query}`).subscribe({
      next: (response: any) => {
        this.isComparisonLoading = false;
        this.comparison = response?.success ? (response.data ?? null) : null;
      },
      error: (err: any) => {
        this.isComparisonLoading = false;
        console.error('Failed to load lead source comparison:', err);
      },
    });
  }

  /** The filter set shared by every report endpoint: date range/preset, source,
   *  lead status, search text, and which statuses count as converted. */
  private buildSharedFilterParams(): string[] {
    const params: string[] = [];

    if (this.sourceId) params.push(`source_id=${this.sourceId}`);
    if (this.statusId) params.push(`lead_status_id=${this.statusId}`);
    if (this.search.trim()) params.push(`search=${encodeURIComponent(this.search.trim())}`);

    if (this.activePreset === 'custom') {
      if (this.dateFrom) params.push(`date_from=${this.dateFrom}`);
      if (this.dateTo) params.push(`date_to=${this.dateTo}`);
    } else if (this.activePreset !== 'all') {
      params.push(`date_preset=${this.activePreset}`);
    }

    this.convertedStatusIds.forEach((id) => params.push(`converted_status_ids[]=${id}`));

    return params;
  }

  private buildTopSourceInsight(chartData: ChartDatum[], totalLeads: number): string {
    if (!chartData.length || !totalLeads) return '';

    const top = [...chartData].sort((a, b) => b.value - a.value)[0];
    if (!top.value) return '';

    const percent = Math.round((top.value / totalLeads) * 100);
    return `${top.label} is your leading channel, driving ${percent}% of all leads in this period.`;
  }

  /** API returns both raw ids (source_id, service_category_id, ...) and their resolved lookup
   *  labels (source_name, service_category_name, ...) - the labels are what the report shows. */
  private mapLeadToRow(lead: any): TableRow {
    return {
      lead: {
        name: lead.name ?? '',
        subtitle: `LD-${String(lead.id ?? '').padStart(5, '0')}`,
      },
      contact: lead.mobile_no ?? '',
      gender: lead.gender ?? '',
      source: lead.source_name ?? '',
      service_category: lead.service_category_name ?? '',
      service_request: lead.reason ?? '',
      status: lead.status_name ?? '',
      created_at: this.formatDate(lead.created_at),
      id: lead.id,
    };
  }

  /** ISO timestamp from the API -> "DD-Mon-YYYY" to match the rest of the UI. */
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
      return 'Showing 0 leads';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `Showing ${start}-${end} of ${this.totalRecords.toLocaleString()} leads`;
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
      { icon: 'bi-person-lines-fill', label: 'Total Leads', value: s.total_leads ?? 0, deltaText: this.deltaText(c?.total_leads_growth_percent), deltaDirection: this.trendDirectionFor(c?.total_leads_growth_percent ?? null) },
      { icon: 'bi-check-circle-fill', label: 'Converted', value: s.converted_count ?? 0, deltaText: this.deltaText(c?.converted_leads_growth_percent), deltaDirection: this.trendDirectionFor(c?.converted_leads_growth_percent ?? null) },
      { icon: 'bi-x-circle-fill', label: 'Lost', value: s.lost_count ?? 0, deltaText: this.deltaText(c?.lost_leads_growth_percent), deltaDirection: this.trendDirectionFor(c?.lost_leads_growth_percent ?? null) },
      { icon: 'bi-hourglass-split', label: 'Pending', value: s.pending ?? 0 },
      { icon: 'bi-graph-up-arrow', label: 'Conversion Rate', value: this.formatRate(s.conversion_rate), deltaText: this.deltaText(c?.conversion_rate_change_percent, 'pp'), deltaDirection: this.trendDirectionFor(c?.conversion_rate_change_percent ?? null) },
      { icon: 'bi-signpost-2-fill', label: 'Total Sources', value: s.total_sources ?? 0 },
      { icon: 'bi-trophy-fill', label: 'Top Source', value: s.top_source?.source_name ?? '—' },
    ];
  }

  get comparisonPeriodLabel(): string | null {
    if (!this.comparison?.previous_period) return null;
    return `vs ${this.comparison.previous_period.from} to ${this.comparison.previous_period.to}`;
  }

  private deltaText(percent: number | null | undefined, unit: string = '%'): string | undefined {
    if (percent === null || percent === undefined) return undefined;
    const sign = percent > 0 ? '+' : '';
    return `${sign}${percent}${unit}`;
  }

  private trendDirectionFor(percent: number | null): DetailTrendDirection {
    if (percent === null || percent === undefined || percent === 0) return 'neutral';
    return percent > 0 ? 'up' : 'down';
  }

  private formatRate(rate: number | null | undefined): string {
    return rate === null || rate === undefined ? '—' : `${rate}%`;
  }

  formatTrendValue(value: number | null): string {
    if (value === null || value === undefined) return '—';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value}%`;
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

  /** panelWidth must match the panel's own CSS width (min(<panelWidth>px, 90vw) for the
   *  date-range panel) so the clamp math agrees with what actually renders. */
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

  onStatusFilterChange(): void {
    this.refreshAll();
  }

  onSearchSubmit(): void {
    this.refreshAll();
  }

  clearAllFilters(): void {
    this.sourceId = null;
    this.statusId = null;
    this.search = '';
    this.activePreset = 'all';
    this.dateFrom = null;
    this.dateTo = null;
    this.isDatePanelOpen = false;
    this.refreshAll();
  }

  get hasActiveFilters(): boolean {
    return !!this.sourceId || !!this.statusId || !!this.search.trim() || this.activePreset !== 'all';
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

  get exportType(): 'leads' | 'performance' {
    return this.viewMode === 'records' ? 'leads' : 'performance';
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

    this.apiDataService.GET_BLOB(`${ApiRoutesConstants.REPORT_CUSTOMER_SOURCE_EXPORT}?${params.join('&')}`).subscribe({
      next: (blob: Blob) => {
        this.isExporting = false;
        this.downloadBlob(blob, `lead-source-${type}-${this.timestampForFilename()}.${format}`);
      },
      error: (err: any) => {
        this.isExporting = false;
        this.toast.error('Failed to export the report. Please try again.');
        console.error('Failed to export lead source report:', err);
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
