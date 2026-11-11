import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import Swal from 'sweetalert2';
import { ToastService } from '../../../shared/common-services/toast.service';
import { BfBarDatum, BfColumnDatum, BfDatum } from '../../../shared/components/bf-charts/bf-charts.model';
import { BfBars } from '../../../shared/components/bf-charts/bf-bars/bf-bars';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { PageLoader } from '../../../shared/components/page-loader/page-loader';
import { displayDate, displayTime } from '../../../shared/utils/format.util';
import { saveBlob } from '../../../shared/utils/export.util';
import {
  PAGE_SIZES, ReportCard, ReportChart, ReportColumn, ReportFilterDef, ReportFormat, ReportMeta, ReportOption, ReportPagination, ReportPreset, ReportQuery,
} from '../report-center.model';
import { ReportCenterService } from '../report-center.service';

type Draft = ReportQuery;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * One screen for every report of the Reports & Analytics module. It draws itself from the catalog (columns, filters, summary) the
 * server sends, so a new report needs no new component. The applied query is kept in the URL (refresh / back / share restores the
 * same view) and the table, the summary cards and the downloads all send exactly that query - downloads without page / per_page.
 */
@Component({
  selector: 'app-report-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, PageLoader, BfDonut, BfColumns, BfBars],
  templateUrl: './report-viewer.html',
  styleUrl: './report-viewer.scss',
})
export class ReportViewer implements OnChanges, OnDestroy {
  @Input({ required: true }) slug = '';

  readonly pageSizes = PAGE_SIZES;
  /** The period buttons shown: the server supports more presets, the screen offers only these. */
  readonly shownPresets = ['today', 'yesterday', 'this_month', 'custom'];
  meta: ReportMeta | null = null;
  options: Record<string, ReportOption[]> = {};
  presets: ReportPreset[] = [];

  /** What the form shows; copied to `applied` by Apply (date chips, search, sort and paging apply at once). */
  draft: Draft = this.blank();
  applied: Draft = this.blank();

  rows: Record<string, any>[] = [];
  pagination: ReportPagination | null = null;
  cards: ReportCard[] = [];
  chart: ReportChart | null = null;
  donutData: BfDatum[] = [];
  columnData: BfColumnDatum[] = [];
  barData: BfBarDatum[] = [];

  loadingMeta = true;
  loading = false;
  loadingSummary = false;
  error = '';
  summaryError = '';
  metaError = '';
  formError = '';

  /** Records (the table) opens first; Analytics shows the summary cards and the chart. */
  view: 'records' | 'analytics' = 'records';
  showFilters = false;
  showColumns = false;
  showExport = false;
  showSaved = false;
  hiddenCols = new Set<string>();
  exporting: ReportFormat | null = null;
  customPageSize = '';
  presetName = '';
  openMulti: string | null = null;

  private search$ = new Subject<void>();
  private subs = new Subscription();
  private seq = 0;

  constructor(
    private api: ReportCenterService,
    private route: ActivatedRoute,
    private router: Router,
    private toast: ToastService,
  ) {
    this.subs.add(this.search$.pipe(debounceTime(400)).subscribe(() => this.applySearch()));
  }

  ngOnChanges(c: SimpleChanges): void {
    if (c['slug']) this.init();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  closeMenus(e: Event): void {
    if (!(e.target as HTMLElement).closest('.menu-wrap')) {
      this.showColumns = this.showExport = this.showSaved = false;
      this.openMulti = null;
    }
  }

  /* ------------------------------------------------------------------ loading */

  private init(): void {
    this.loadingMeta = true;
    this.metaError = '';
    this.api.catalog().subscribe({
      next: (list) => {
        const meta = list.find((r) => r.slug === this.slug) ?? null;
        this.loadingMeta = false;
        if (!meta) {
          this.metaError = 'This report is not available for your role.';
          return;
        }
        this.meta = meta;
        this.hiddenCols = this.loadHidden(meta);
        this.view = this.route.snapshot.queryParamMap.get('v') === 'analytics' ? 'analytics' : 'records';
        if (this.view === 'analytics' && !this.canAnalytics && this.canRecords) this.view = 'records';
        if (this.view === 'records' && !this.canRecords && this.canAnalytics) this.view = 'analytics';
        const fromUrl = this.parseUrl(this.route.snapshot.queryParamMap, meta);
        const q = fromUrl ?? this.parseUrl(this.remembered(), meta) ?? this.blank();
        this.draft = this.clone(q);
        this.applied = this.clone(q);
        this.showFilters = Object.keys(q.filters).length > 0;
        this.api.options(this.slug).subscribe({ next: (o) => (this.options = o), error: () => (this.options = {}) });
        this.loadPresets();
        this.refresh();
      },
      error: async (err) => {
        this.loadingMeta = false;
        this.metaError = await this.api.errorMessage(err, 'Could not load the report. Please try again.');
      },
    });
  }

  /** Loads the table and the summary for `applied`. A late answer to an older request is dropped. */
  refresh(): void {
    const id = ++this.seq;
    // only the tab on screen is loaded, and only when this role may open it
    const wantRecords = this.view === 'records' && this.canRecords;
    const wantAnalytics = this.view === 'analytics' && this.canAnalytics;
    this.loading = wantRecords;
    this.loadingSummary = wantAnalytics;
    this.error = this.summaryError = '';
    this.syncUrl();

    if (wantRecords) this.api.page(this.slug, this.applied).subscribe({
      next: (p) => {
        if (id !== this.seq) return;
        this.rows = p.rows;
        this.pagination = p.pagination;
        this.loading = false;
        if (p.pagination && p.rows.length === 0 && p.pagination.total > 0 && this.applied.page > 1) {
          this.applied.page = p.pagination.last_page; // the result got smaller than the page we were on
          this.refresh();
        }
      },
      error: async (err) => {
        if (id !== this.seq) return;
        this.loading = false;
        this.rows = [];
        this.pagination = null;
        this.error = await this.api.errorMessage(err, 'Could not load the report. Please try again.');
      },
    });

    if (wantAnalytics) this.api.summary(this.slug, this.applied).subscribe({
      next: (s) => {
        if (id !== this.seq) return;
        this.cards = s.cards;
        this.setChart(s.chart);
        this.loadingSummary = false;
      },
      error: async (err) => {
        if (id !== this.seq) return;
        this.loadingSummary = false;
        this.cards = [];
        this.chart = null;
        this.summaryError = await this.api.errorMessage(err, 'Could not load the summary.');
      },
    });
  }

  private setChart(c: ReportChart | null): void {
    this.chart = c && c.points.length ? c : null;
    if (!this.chart) return;
    const pts = this.chart.points;
    const monthly = pts.every((p) => /^\d{4}-\d{2}$/.test(p.label));
    this.donutData = pts.map((p) => ({ label: p.label, value: p.value }));
    this.columnData = pts.map((p) => ({ label: monthly ? `${MONTHS[+p.label.slice(5, 7) - 1]} ${p.label.slice(2, 4)}` : p.label, a: p.value }));
    this.barData = pts.map((p) => ({ label: p.label, value: p.value }));
  }

  get chartKind(): 'donut' | 'columns' | 'bars' | null {
    if (!this.chart) return null;
    if (this.chart.type === 'donut') return 'donut';
    return this.chart.points.every((p) => /^\d{4}-\d{2}$/.test(p.label)) ? 'columns' : 'bars';
  }

  /* ------------------------------------------------------------------ applying filters */

  setPreset(key: string): void {
    this.draft.preset = key;
    if (key !== 'custom') {
      this.draft.from = this.draft.to = '';
      this.apply();
    }
  }

  apply(): void {
    this.formError = this.validate(this.draft);
    if (this.formError) return;
    this.applied = { ...this.clone(this.draft), sort: this.applied.sort, perPage: this.applied.perPage, page: 1 };
    this.refresh();
  }

  /** Back to the report's own defaults. */
  reset(): void {
    const keep = this.applied.perPage;
    this.draft = { ...this.blank(), perPage: keep };
    this.applied = this.clone(this.draft);
    this.formError = '';
    this.refresh();
  }

  clearCustomDates(): void {
    this.draft.from = this.draft.to = '';
    this.draft.preset = '';
    this.apply();
  }

  onSearchInput(): void {
    this.search$.next();
  }

  private applySearch(): void {
    if (this.draft.search.trim() === this.applied.search.trim()) return;
    this.applied = { ...this.applied, search: this.draft.search, page: 1 };
    this.refresh();
  }

  private validate(q: Draft): string {
    if (q.preset === 'custom') {
      if (!q.from || !q.to) return 'Choose both the From and the To date.';
      if (q.from > q.to) return 'The To date cannot be before the From date.';
    }
    for (const f of this.meta?.filters ?? []) {
      const v = q.filters[f.key];
      if ((f.type === 'number' || f.type === 'date') && v && typeof v === 'object' && !Array.isArray(v)) {
        const { min = '', max = '' } = v;
        if (f.type === 'number' && ((min !== '' && isNaN(+min)) || (max !== '' && isNaN(+max)))) return `${f.label}: enter numbers only.`;
        if (min !== '' && max !== '' && (f.type === 'number' ? +min > +max : min > max)) return `${f.label}: the first value cannot be greater than the second.`;
      }
    }
    return '';
  }

  /* ------------------------------------------------------------------ filter chips */

  get chips(): { label: string; remove: () => void }[] {
    const m = this.meta;
    const q = this.applied;
    if (!m) return [];
    const out: { label: string; remove: () => void }[] = [];
    if (q.preset) {
      const label = q.preset === 'custom' ? `${displayDate(q.from)} to ${displayDate(q.to)}` : m.presets.find((p) => p.key === q.preset)?.label ?? q.preset;
      out.push({ label: `${m.date_column?.label ?? 'Date'}: ${label}`, remove: () => this.mutate((x) => { x.preset = ''; x.from = x.to = ''; }) });
    }
    if (q.search.trim()) out.push({ label: `Search: "${q.search.trim()}"`, remove: () => this.mutate((x) => (x.search = '')) });
    for (const f of m.filters) {
      const v = q.filters[f.key];
      if (v === undefined) continue;
      out.push({ label: `${f.label}: ${this.filterText(f, v)}`, remove: () => this.mutate((x) => delete x.filters[f.key]) });
    }
    return out;
  }

  private mutate(fn: (q: Draft) => void): void {
    fn(this.draft);
    this.applied = { ...this.clone(this.draft), sort: this.applied.sort, perPage: this.applied.perPage, page: 1 };
    this.refresh();
  }

  private filterText(f: ReportFilterDef, v: ReportQuery['filters'][string]): string {
    if (Array.isArray(v)) return v.map((x) => this.optionLabel(f, x)).join(', ');
    if (typeof v === 'object') {
      const [a, b] = [v.min, v.max];
      return a && b ? `${a} to ${b}` : a ? `from ${a}` : `up to ${b}`;
    }
    if (f.type === 'boolean') return v === '1' ? 'Yes' : 'No';
    return f.type === 'select' ? this.optionLabel(f, v) : v;
  }

  optionLabel(f: ReportFilterDef, value: string): string {
    return this.optionsOf(f).find((o) => o.value === value)?.label ?? value;
  }

  optionsOf(f: ReportFilterDef): ReportOption[] {
    return f.options ?? this.options[f.key] ?? [];
  }

  /* ------------------------------------------------------------------ filter form helpers */

  textVal(key: string): string {
    const v = this.draft.filters[key];
    return typeof v === 'string' ? v : '';
  }

  setText(key: string, value: string): void {
    value.trim() === '' ? delete this.draft.filters[key] : (this.draft.filters[key] = value);
  }

  listVal(key: string): string[] {
    const v = this.draft.filters[key];
    return Array.isArray(v) ? v : typeof v === 'string' && v !== '' ? [v] : [];
  }

  isChecked(key: string, value: string): boolean {
    return this.listVal(key).includes(value);
  }

  toggle(key: string, value: string): void {
    const cur = this.listVal(key);
    const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
    next.length ? (this.draft.filters[key] = next) : delete this.draft.filters[key];
  }

  rangeVal(key: string, part: 'min' | 'max'): string {
    const v = this.draft.filters[key];
    return v && typeof v === 'object' && !Array.isArray(v) ? v[part] ?? '' : '';
  }

  setRange(key: string, part: 'min' | 'max', value: string): void {
    const cur = { ...((typeof this.draft.filters[key] === 'object' && !Array.isArray(this.draft.filters[key]) ? this.draft.filters[key] : {}) as { min?: string; max?: string }) };
    cur[part] = value;
    cur.min || cur.max ? (this.draft.filters[key] = cur) : delete this.draft.filters[key];
  }

  multiSummary(f: ReportFilterDef): string {
    const v = this.listVal(f.key);
    return v.length === 0 ? 'All' : v.length === 1 ? this.optionLabel(f, v[0]) : `${v.length} selected`;
  }

  /* ------------------------------------------------------------------ table */

  get columns(): ReportColumn[] {
    return (this.meta?.columns ?? []).filter((c) => !this.hiddenCols.has(c.key));
  }

  toggleColumn(key: string): void {
    const shown = (this.meta?.columns ?? []).length - this.hiddenCols.size;
    if (!this.hiddenCols.has(key) && shown <= 1) return; // keep at least one column
    this.hiddenCols.has(key) ? this.hiddenCols.delete(key) : this.hiddenCols.add(key);
    this.hiddenCols = new Set(this.hiddenCols);
    try {
      localStorage.setItem(`zelora.report.cols.${this.slug}`, JSON.stringify([...this.hiddenCols]));
    } catch { /* storage may be blocked: the choice just is not remembered */ }
  }

  private loadHidden(meta: ReportMeta): Set<string> {
    try {
      const saved = localStorage.getItem(`zelora.report.cols.${this.slug}`);
      if (saved) return new Set((JSON.parse(saved) as string[]).filter((k) => meta.columns.some((c) => c.key === k)));
    } catch { /* ignore */ }
    return new Set(meta.columns.filter((c) => c.default_hidden).map((c) => c.key));
  }

  sortIndex(key: string): number {
    return this.applied.sort.findIndex((s) => s.key === key);
  }

  sortDir(key: string): 'asc' | 'desc' | null {
    return this.applied.sort.find((s) => s.key === key)?.dir ?? null;
  }

  /** Click: asc -> desc -> back to the default order. Shift-click adds the column as a further sort key. */
  sortBy(col: ReportColumn, e: MouseEvent): void {
    if (!col.sortable) return;
    const cur = this.sortDir(col.key);
    const keep = e.shiftKey ? this.applied.sort.filter((s) => s.key !== col.key) : [];
    const sort = cur === null ? [...keep, { key: col.key, dir: 'asc' as const }] : cur === 'asc' ? [...keep, { key: col.key, dir: 'desc' as const }] : keep;
    this.applied = { ...this.applied, sort: sort.slice(0, 3), page: 1 };
    this.refresh();
  }

  rowNumber(i: number): number {
    return ((this.pagination?.current_page ?? 1) - 1) * (this.pagination?.per_page ?? this.applied.perPage) + i + 1;
  }

  cell(col: ReportColumn, row: Record<string, any>): string {
    const v = row[col.key];
    if (v === null || v === undefined || v === '') return '–';
    switch (col.type) {
      case 'money': return '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      case 'number': return Number(v).toLocaleString('en-IN');
      case 'percent': return `${Number(v).toLocaleString('en-IN')}%`;
      case 'date': return displayDate(String(v).slice(0, 10));
      case 'datetime': { const s = String(v).replace(' ', 'T'); return `${displayDate(s)}, ${displayTime(s)}`; }
      case 'boolean': return v ? 'Yes' : 'No';
      default: return String(v);
    }
  }

  isNumeric(col: ReportColumn): boolean {
    return col.type === 'money' || col.type === 'number' || col.type === 'percent';
  }

  /** Colour of a status badge, from the words in it. */
  tone(value: string): string {
    const v = String(value).toLowerCase();
    if (/(cancel|expired|overdue|inactive|failed|reject|declin)/.test(v)) return 'red';
    if (/(pending|partial|unpaid|expiring|awaiting|hold|waiting)/.test(v)) return 'orange';
    if (/(converted|paid|complete|active|received|^ok$|approved|success|cash)/.test(v)) return 'green';
    if (/(schedul|consult|invoice|new|online|upi|card)/.test(v)) return 'blue';
    return 'gray';
  }

  cardValue(c: ReportCard): string {
    if (c.value === null) return '–';
    if (c.format === 'money') return '₹' + Math.round(c.value).toLocaleString('en-IN');
    return c.format === 'percent' ? `${c.value}%` : Number(c.value).toLocaleString('en-IN');
  }

  /* ------------------------------------------------------------------ paging */

  get pageList(): (number | '…')[] {
    const p = this.pagination;
    if (!p || p.last_page <= 1) return [];
    const cur = p.current_page;
    const last = p.last_page;
    const set = new Set([1, last, cur - 1, cur, cur + 1].filter((n) => n >= 1 && n <= last));
    const sorted = [...set].sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    sorted.forEach((n, i) => {
      if (i && n - sorted[i - 1] > 1) out.push('…');
      out.push(n);
    });
    return out;
  }

  goTo(page: number): void {
    const last = this.pagination?.last_page ?? 1;
    if (page < 1 || page > last || page === this.applied.page) return;
    this.applied = { ...this.applied, page };
    this.refresh();
  }

  setPageSize(value: string): void {
    if (value === 'custom') {
      this.customPageSize = String(this.applied.perPage);
      return;
    }
    this.applied = { ...this.applied, perPage: +value, page: 1 };
    this.customPageSize = '';
    this.refresh();
  }

  applyCustomPageSize(): void {
    const n = Math.floor(+this.customPageSize);
    if (!n || n < 1 || n > 200) {
      this.formError = 'Page size must be between 1 and 200.';
      return;
    }
    this.formError = '';
    this.applied = { ...this.applied, perPage: n, page: 1 };
    this.refresh();
  }

  get isCustomSize(): boolean {
    return this.customPageSize !== '' || !PAGE_SIZES.includes(this.applied.perPage);
  }

  /* ------------------------------------------------------------------ export */

  download(format: ReportFormat): void {
    if (this.exporting || !this.meta) return; // one download at a time
    this.showExport = false;
    this.exporting = format;
    const name = this.meta.title;
    this.api.export(this.slug, this.applied, format).subscribe({
      next: ({ blob, fileName }) => {
        this.exporting = null;
        saveBlob(blob, fileName);
        const total = this.pagination?.total;
        this.toast.success(`${format.toUpperCase()} downloaded`, `${name}${total !== undefined ? ` - ${total.toLocaleString('en-IN')} record${total === 1 ? '' : 's'}` : ''}.`);
      },
      error: async (err) => {
        this.exporting = null;
        this.toast.error('Download failed', await this.api.errorMessage(err, 'The file could not be created. Please try again.'));
      },
    });
  }

  /* ------------------------------------------------------------------ saved filters */

  private loadPresets(): void {
    this.api.presets(this.slug).subscribe({ next: (p) => (this.presets = p), error: () => (this.presets = []) });
  }

  savePreset(): void {
    const name = this.presetName.trim();
    if (name.length < 2) {
      this.formError = 'Give the saved filter a name (at least 2 letters).';
      return;
    }
    this.formError = this.validate(this.draft);
    if (this.formError) return;
    this.api.savePreset(this.slug, name, this.clone(this.draft)).subscribe({
      next: () => {
        this.presetName = '';
        this.loadPresets();
        this.toast.success('Filter saved', `"${name}" is in your Saved filters.`);
      },
      error: async (err) => this.toast.error('Could not save', await this.api.errorMessage(err, 'The filter could not be saved.')),
    });
  }

  usePreset(p: ReportPreset): void {
    if (!this.meta) return;
    const q = this.fromStored(p.filters, this.meta);
    this.draft = q;
    this.applied = { ...this.clone(q), perPage: this.applied.perPage };
    this.showSaved = false;
    this.showFilters = Object.keys(q.filters).length > 0;
    this.refresh();
  }

  async deletePreset(p: ReportPreset, e: Event): Promise<void> {
    e.stopPropagation();
    const ok = await Swal.fire({ title: `Delete "${p.name}"?`, text: 'This saved filter will be removed.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#d0392c' });
    if (!ok.isConfirmed) return;
    this.api.deletePreset(this.slug, p.id).subscribe({
      next: () => this.loadPresets(),
      error: async (err: unknown) => this.toast.error('Could not delete', await this.api.errorMessage(err, 'Please try again.')),
    });
  }

  private fromStored(s: Record<string, any>, meta: ReportMeta): Draft {
    const q = this.blank();
    q.preset = s['date_preset'] ?? '';
    q.from = s['date_from'] ?? '';
    q.to = s['date_to'] ?? '';
    q.search = s['search'] ?? '';
    for (const [k, v] of Object.entries<any>(s['f'] ?? {})) {
      if (meta.filters.some((f) => f.key === k)) q.filters[k] = v;
    }
    q.sort = this.parseSort(s['sort'] ?? '', meta);

    return q;
  }

  /* ------------------------------------------------------------------ URL + remembered view */

  get canRecords(): boolean {
    return this.meta?.can_records ?? true;
  }

  get canAnalytics(): boolean {
    return this.meta?.can_analytics ?? true;
  }

  setView(view: 'records' | 'analytics'): void {
    if (this.view === view) return;
    this.view = view;
    this.refresh();
  }

  private syncUrl(): void {
    const params = this.toParams(this.applied);
    if (this.view === 'analytics') params['v'] = 'analytics';
    this.router.navigate([], { relativeTo: this.route, queryParams: params, replaceUrl: true });
    try {
      localStorage.setItem(`zelora.report.last.${this.slug}`, JSON.stringify(params));
    } catch { /* not remembered */ }
  }

  private remembered(): { get(k: string): string | null; keys: string[] } | null {
    try {
      const raw = localStorage.getItem(`zelora.report.last.${this.slug}`);
      if (!raw) return null;
      const o = JSON.parse(raw) as Record<string, string>;
      return { get: (k: string) => o[k] ?? null, keys: Object.keys(o) };
    } catch {
      return null;
    }
  }

  private toParams(q: Draft): Record<string, string> {
    const p: Record<string, string> = {};
    if (q.preset) p['p'] = q.preset;
    if (q.preset === 'custom') { p['from'] = q.from; p['to'] = q.to; }
    if (q.search.trim()) p['q'] = q.search.trim();
    if (q.sort.length) p['sort'] = q.sort.map((s) => `${s.key}:${s.dir}`).join(',');
    if (q.page > 1) p['page'] = String(q.page);
    if (q.perPage !== 25) p['size'] = String(q.perPage);
    for (const [k, v] of Object.entries(q.filters)) {
      if (Array.isArray(v)) p[`f.${k}`] = v.join('|');
      else if (typeof v === 'object') { if (v.min) p[`f.${k}.min`] = v.min; if (v.max) p[`f.${k}.max`] = v.max; }
      else p[`f.${k}`] = v;
    }
    return p;
  }

  private parseUrl(map: { get(k: string): string | null; keys: string[] } | null, meta: ReportMeta): Draft | null {
    if (!map || !map.keys.length) return null;
    const q = this.blank();
    const preset = map.get('p') ?? '';
    q.preset = meta.presets.some((x) => x.key === preset) ? preset : '';
    if (q.preset === 'custom') { q.from = map.get('from') ?? ''; q.to = map.get('to') ?? ''; if (!q.from || !q.to) q.preset = ''; }
    q.search = map.get('q') ?? '';
    q.sort = this.parseSort(map.get('sort') ?? '', meta);
    q.page = Math.max(1, Math.floor(+(map.get('page') ?? 1)) || 1);
    const size = Math.floor(+(map.get('size') ?? 25));
    q.perPage = size >= 1 && size <= 200 ? size : 25;
    for (const f of meta.filters) {
      if (f.type === 'number' || f.type === 'date') {
        const min = map.get(`f.${f.key}.min`) ?? '';
        const max = map.get(`f.${f.key}.max`) ?? '';
        if (min || max) q.filters[f.key] = { min, max };
      } else {
        const v = map.get(`f.${f.key}`);
        if (v) q.filters[f.key] = f.type === 'multiselect' ? v.split('|').filter(Boolean) : v;
      }
    }
    return q;
  }

  private parseSort(raw: string, meta: ReportMeta): ReportQuery['sort'] {
    const sortable = new Set(meta.columns.filter((c) => c.sortable).map((c) => c.key));
    return raw.split(',').map((s) => s.split(':')).filter(([k, d]) => sortable.has(k) && (d === 'asc' || d === 'desc')).slice(0, 3).map(([key, dir]) => ({ key, dir: dir as 'asc' | 'desc' }));
  }

  private blank(): Draft {
    return { preset: '', from: '', to: '', search: '', filters: {}, sort: [], page: 1, perPage: 25 };
  }

  private clone(q: Draft): Draft {
    return JSON.parse(JSON.stringify(q));
  }

  trackRow = (i: number) => i;
}
