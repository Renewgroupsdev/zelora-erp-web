import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReportCategory, ReportFormat, ReportMeta } from './report-center.model';
import { ReportCenterService } from './report-center.service';
import { ReportTab } from './reports.model';
import { ToastService } from '../../shared/common-services/toast.service';
import { AutoModuleTabs } from '../../shared/components/module-tabs/auto-module-tabs';
import { saveBlob } from '../../shared/utils/export.util';

interface ReportGroup extends ReportCategory {
  items: ReportTab[];
}

/** Tiles shown in a section before "View all". */
const COLLAPSED_TILES = 4;

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, RouterLink],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit {
  /** One section per module. Names, icons, hints and colours come from the server, and only the reports this role may open are listed. */
  groups: ReportGroup[] = [];
  readonly collapsedTiles = COLLAPSED_TILES;
  expanded = new Set<string>();
  error = false;
  loading = true;

  private metas = new Map<string, ReportMeta>();
  /** Reports this browser opened last (newest first), only those this role still may open. */
  recent: ReportTab[] = [];
  exporting: ReportFormat | null = null;

  constructor(private center: ReportCenterService, private router: Router, private toast: ToastService) {}

  ngOnInit(): void {
    this.center.catalogWithSections().subscribe({
      next: ({ reports, categories }) => {
        this.metas = new Map(reports.map((r) => [r.slug, r]));
        const tabs = reports.map((r): ReportTab => this.tab(r));
        this.groups = categories
          .map((c) => ({ ...c, items: tabs.filter((t) => t.category === c.name) }))
          .filter((g) => g.items.length > 0);
        this.recent = this.center.recent().map((s) => tabs.find((t) => t.id === s)).filter((t): t is ReportTab => !!t).slice(0, 4);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.error = true;
      },
    });
  }

  private tab(r: ReportMeta): ReportTab {
    return { id: r.slug, label: r.tile_name ?? r.title.replace(/ Report$/, ''), category: r.category, icon: r.icon, variant: r.variant ?? 'gray', description: r.description };
  }

  get total(): number {
    return this.groups.reduce((n, g) => n + g.items.length, 0);
  }

  visible(g: ReportGroup): ReportTab[] {
    return this.expanded.has(g.name) ? g.items : g.items.slice(0, COLLAPSED_TILES);
  }

  toggle(g: ReportGroup): void {
    this.expanded.has(g.name) ? this.expanded.delete(g.name) : this.expanded.add(g.name);
    this.expanded = new Set(this.expanded);
  }

  /** The report Quick Actions work on: the one opened last that this role may download (the four Lead pages download from inside the report). */
  get quickTarget(): ReportTab | null {
    return this.recent.find((r) => { const m = this.metas.get(r.id); return !!m && !m.legacy && m.can_export; }) ?? null;
  }

  /** "View Analytics": the Analytics tab of the report opened last, else of the first report this role may see charts for. */
  openAnalytics(): void {
    const withCharts = (s: string) => { const m = this.metas.get(s); return !!m && m.can_analytics !== false && !m.legacy; };
    const slug = this.recent.map((r) => r.id).find(withCharts) ?? [...this.metas.keys()].find(withCharts);
    if (slug) this.router.navigate(['/app/reports', slug], { queryParams: { v: 'analytics' } });
  }

  get canOpenAnalytics(): boolean {
    return [...this.metas.values()].some((m) => m.can_analytics !== false && !m.legacy);
  }

  download(format: ReportFormat): void {
    const target = this.quickTarget;
    if (!target || this.exporting) return;
    this.exporting = format;
    this.center.exportLast(target.id, format).subscribe({
      next: ({ blob, fileName }) => {
        this.exporting = null;
        saveBlob(blob, fileName);
        this.toast.success(`${format.toUpperCase()} downloaded`, `${target.label} - with the filters you last used.`);
      },
      error: async (err) => {
        this.exporting = null;
        this.toast.error('Download failed', await this.center.errorMessage(err, 'The file could not be created. Please try again.'));
      },
    });
  }
}
