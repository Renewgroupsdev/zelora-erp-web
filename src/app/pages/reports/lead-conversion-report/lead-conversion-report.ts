import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { CommonChartCard } from '../../../shared/components/common-chart-card/common-chart-card';
import { CommonTrendChart, TrendGranularity, TrendPoint } from '../../../shared/components/common-trend-chart/common-trend-chart';
import { ApiDataService } from '../../../shared/common-services/api-data.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { ChartDatum, DetailTrendDirection } from '../../../shared/models/common-components.model';

type DatePresetKey = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';
type ExportFormat = 'csv' | 'xlsx' | 'pdf';

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

interface FunnelStage {
  status_id: number;
  name: string;
  position: number;
  count: number;
  pct_of_total: number | null;
  drop_off_count: number | null;
  drop_off_rate: number | null;
}

interface FunnelData {
  total_leads: number;
  stages: FunnelStage[];
  overall_conversion_rate: number | null;
}

interface SourceSummary {
  source_id: number;
  source_name: string;
  total: number;
}

interface SummaryData {
  total_leads: number;
  converted_count: number;
  lost_count: number;
  conversion_rate: number | null;
  avg_days_to_convert: number | null;
  top_converting_source: (SourceSummary & { converted: number | null; conversion_rate: number | null }) | null;
}

interface TrendRow {
  period: string;
  leads_created: number;
  leads_converted: number;
  conversion_rate: number | null;
}

interface PeriodSummary {
  from: string;
  to: string;
  total_leads: number;
  converted_count: number;
  lost_count: number;
  conversion_rate: number | null;
}

interface StageGrowth {
  status_id: number;
  name: string;
  current_count: number;
  previous_count: number;
  growth_percent: number | null;
}

interface ComparisonData {
  current_period: PeriodSummary;
  previous_period: PeriodSummary;
  total_leads_growth_percent: number | null;
  conversion_rate_change_percent: number | null;
  converted_leads_growth_percent: number | null;
  lost_leads_growth_percent: number | null;
  stage_wise_growth: StageGrowth[];
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
  selector: 'app-lead-conversion-report',
  standalone: true,
  imports: [CommonModule, FormsModule, CommonChartCard, CommonTrendChart],
  templateUrl: './lead-conversion-report.html',
  styleUrl: './lead-conversion-report.scss',
})
export class LeadConversionReport implements OnInit {

  constructor(private apiDataService: ApiDataService, private toast: ToastService) { }

  readonly datePresets = DATE_PRESETS;
  readonly barOnly: ('bar')[] = ['bar'];

  // Pipeline funnel
  isFunnelLoading = false;
  funnel: FunnelData | null = null;

  // KPI summary
  isSummaryLoading = false;
  summary: SummaryData | null = null;

  // Conversion-rate-over-time trend
  isTrendLoading = false;
  trendRows: TrendRow[] = [];
  trendGranularity: TrendGranularity = 'month';

  // Comparison vs previous period
  isComparisonLoading = false;
  comparison: ComparisonData | null = null;

  // Filters - no lead-status filter here: filtering by current stage would make every
  // other funnel stage read as zero, which misrepresents the funnel rather than scoping it.
  sourceOptions: LookupOption[] = [];
  statusOptions: LookupOption[] = [];
  sourceId: number | null = null;
  /** Which status(es) represent a "won" lead - inferred from the "Customer" stage, the
   *  same convention used by the Lead Source report since there's no dedicated column. */
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
  exportType: 'funnel' | 'leads' = 'funnel';

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

  /** Every filter-driven panel reloads together so the funnel, KPI strip and trend chart
   *  always agree on the same filtered slice. */
  refreshAll(): void {
    this.loadFunnel();
    this.loadSummary();
    this.loadTrend();
    this.loadComparison();
  }

  loadFunnel(): void {
    this.isFunnelLoading = true;
    const params = this.buildSharedFilterParams();
    const query = params.length ? `?${params.join('&')}` : '';

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_LEAD_CONVERSION_FUNNEL}${query}`).subscribe({
      next: (response: any) => {
        this.isFunnelLoading = false;
        this.funnel = response?.success ? (response.data ?? null) : null;
      },
      error: (err: any) => {
        this.isFunnelLoading = false;
        this.toast.error('Failed to load the conversion funnel. Please try again.');
        console.error('Failed to load lead conversion funnel:', err);
      },
    });
  }

  loadSummary(): void {
    this.isSummaryLoading = true;
    const params = this.buildSharedFilterParams();
    const query = params.length ? `?${params.join('&')}` : '';

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_LEAD_CONVERSION_SUMMARY}${query}`).subscribe({
      next: (response: any) => {
        this.isSummaryLoading = false;
        this.summary = response?.success ? (response.data ?? null) : null;
      },
      error: (err: any) => {
        this.isSummaryLoading = false;
        console.error('Failed to load lead conversion summary:', err);
      },
    });
  }

  loadTrend(): void {
    this.isTrendLoading = true;
    const params = [...this.buildSharedFilterParams(), `granularity=${this.trendGranularity}`];

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_LEAD_CONVERSION_TREND}?${params.join('&')}`).subscribe({
      next: (response: any) => {
        this.isTrendLoading = false;
        this.trendRows = Array.isArray(response?.data) ? response.data : [];
      },
      error: (err: any) => {
        this.isTrendLoading = false;
        console.error('Failed to load lead conversion trend:', err);
      },
    });
  }

  loadComparison(): void {
    this.isComparisonLoading = true;
    const params = this.buildSharedFilterParams();
    const query = params.length ? `?${params.join('&')}` : '';

    this.apiDataService.GET(`${ApiRoutesConstants.REPORT_LEAD_CONVERSION_COMPARISON}${query}`).subscribe({
      next: (response: any) => {
        this.isComparisonLoading = false;
        this.comparison = response?.success ? (response.data ?? null) : null;
      },
      error: (err: any) => {
        this.isComparisonLoading = false;
        console.error('Failed to load lead conversion comparison:', err);
      },
    });
  }

  /** The filter set shared by every conversion-report endpoint: date range/preset,
   *  source, and which statuses count as converted. */
  private buildSharedFilterParams(): string[] {
    const params: string[] = [];

    if (this.sourceId) params.push(`source_id=${this.sourceId}`);

    if (this.activePreset === 'custom') {
      if (this.dateFrom) params.push(`date_from=${this.dateFrom}`);
      if (this.dateTo) params.push(`date_to=${this.dateTo}`);
    } else if (this.activePreset !== 'all') {
      params.push(`date_preset=${this.activePreset}`);
    }

    this.convertedStatusIds.forEach((id) => params.push(`converted_status_ids[]=${id}`));

    return params;
  }

  /** Bar-chart view of the funnel - stages arrive in pipeline order with monotonically
   *  non-increasing counts, so the chart's own "sort by value desc" naturally preserves
   *  that order instead of scrambling it. */
  get funnelChartData(): ChartDatum[] {
    return (this.funnel?.stages ?? []).map((stage) => ({ label: stage.name, value: stage.count }));
  }

  /** Conversion rate per period is the one number this report adds beyond what the Lead
   *  Source report's generation trend already shows - so that's what gets plotted here,
   *  not raw created/converted counts. */
  get trendPoints(): TrendPoint[] {
    return this.trendRows.map((row) => ({ period: row.period, total: row.conversion_rate ?? 0 }));
  }

  get trendTotals(): { created: number; converted: number } {
    return this.trendRows.reduce(
      (acc, row) => ({ created: acc.created + row.leads_created, converted: acc.converted + row.leads_converted }),
      { created: 0, converted: 0 },
    );
  }

  get metricsStrip(): MetricChip[] {
    if (!this.summary) return [];
    const s = this.summary;
    const c = this.comparison;

    return [
      { icon: 'bi-person-lines-fill', label: 'Total Leads', value: s.total_leads ?? 0, deltaText: this.deltaText(c?.total_leads_growth_percent), deltaDirection: this.trendDirectionFor(c?.total_leads_growth_percent ?? null) },
      { icon: 'bi-check-circle-fill', label: 'Converted', value: s.converted_count ?? 0, deltaText: this.deltaText(c?.converted_leads_growth_percent), deltaDirection: this.trendDirectionFor(c?.converted_leads_growth_percent ?? null) },
      { icon: 'bi-x-circle-fill', label: 'Lost', value: s.lost_count ?? 0, deltaText: this.deltaText(c?.lost_leads_growth_percent), deltaDirection: this.trendDirectionFor(c?.lost_leads_growth_percent ?? null) },
      { icon: 'bi-graph-up-arrow', label: 'Conversion Rate', value: this.formatRate(s.conversion_rate), deltaText: this.deltaText(c?.conversion_rate_change_percent, 'pp'), deltaDirection: this.trendDirectionFor(c?.conversion_rate_change_percent ?? null) },
      { icon: 'bi-stopwatch-fill', label: 'Avg. Days to Convert', value: s.avg_days_to_convert === null ? '—' : s.avg_days_to_convert },
      { icon: 'bi-trophy-fill', label: 'Top Converting Source', value: s.top_converting_source?.source_name ?? '—' },
    ];
  }

  get comparisonPeriodLabel(): string | null {
    if (!this.comparison?.previous_period) return null;
    return `vs ${this.comparison.previous_period.from} to ${this.comparison.previous_period.to}`;
  }

  get stageGrowthRows(): StageGrowth[] {
    return this.comparison?.stage_wise_growth ?? [];
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

  formatSignedPercent(value: number | null): string {
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

  get dateRangeLabel(): string {
    if (this.activePreset !== 'custom') {
      return this.datePresets.find((preset) => preset.key === this.activePreset)?.label ?? 'All Time';
    }

    if (!this.dateFrom && !this.dateTo) return 'Custom Range';
    const from = this.dateFrom ? this.formatShortDate(this.dateFrom) : 'Start';
    const to = this.dateTo ? this.formatShortDate(this.dateTo) : 'End';
    return `${from} - ${to}`;
  }

  private formatShortDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    return `${day} ${month}`;
  }

  onSourceFilterChange(): void {
    this.refreshAll();
  }

  clearAllFilters(): void {
    this.sourceId = null;
    this.activePreset = 'all';
    this.dateFrom = null;
    this.dateTo = null;
    this.isDatePanelOpen = false;
    this.refreshAll();
  }

  get hasActiveFilters(): boolean {
    return !!this.sourceId || this.activePreset !== 'all';
  }

  onTrendGranularityChange(granularity: TrendGranularity): void {
    this.trendGranularity = granularity;
    this.loadTrend();
  }

  toggleExportMenu(event: MouseEvent): void {
    if (!this.isExportMenuOpen) {
      this.exportMenuPosition = this.positionBelow(event.currentTarget as HTMLElement, 200);
    }
    this.isExportMenuOpen = !this.isExportMenuOpen;
  }

  setExportType(type: 'funnel' | 'leads'): void {
    this.exportType = type;
  }

  exportReport(format: ExportFormat): void {
    this.isExportMenuOpen = false;
    this.isExporting = true;

    const type = this.exportType;
    const params = [...this.buildSharedFilterParams(), `format=${format}`, `export_type=${type}`];

    this.apiDataService.GET_BLOB(`${ApiRoutesConstants.REPORT_LEAD_CONVERSION_EXPORT}?${params.join('&')}`).subscribe({
      next: (blob: Blob) => {
        this.isExporting = false;
        this.downloadBlob(blob, `lead-conversion-${type}-${this.timestampForFilename()}.${format}`);
      },
      error: (err: any) => {
        this.isExporting = false;
        this.toast.error('Failed to export the report. Please try again.');
        console.error('Failed to export lead conversion report:', err);
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
}
