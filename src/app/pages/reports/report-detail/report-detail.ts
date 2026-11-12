import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { REPORTS } from '../reports.data';
import { ReportTab } from '../reports.model';
import { LeadReport } from '../lead-report/lead-report';
import { LeadConversionReport } from '../lead-conversion-report/lead-conversion-report';
import { LeadStatusReport } from '../lead-status-report/lead-status-report';
import { FollowUpReport } from '../follow-up-report/follow-up-report';
import { ReportViewer } from '../report-viewer/report-viewer';
import { ReportCenterService } from '../report-center.service';
import { AutoModuleTabs } from '../../../shared/components/module-tabs/auto-module-tabs';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [AutoModuleTabs, CommonModule, LeadReport, LeadConversionReport, LeadStatusReport, FollowUpReport, ReportViewer],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.scss',
})
export class ReportDetail {
  report?: ReportTab;
  /** True when the id is one of the four lead reports with their own page; any other id is a report from the server catalog. */
  readonly legacy: boolean;
  readonly id: string;

  /** The catalog (what Roles & Permissions lets this role open) has answered. */
  ready = false;
  /** The catalog does not list this report for this role. */
  denied = false;

  constructor(private route: ActivatedRoute, private router: Router, center: ReportCenterService) {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.report = REPORTS.find(report => report.id === this.id);
    this.legacy = !!this.report;
    // Every report - the four Lead pages included - is only opened when the server lists it for this role.
    center.catalog().subscribe({
      next: (list) => {
        const r = list.find((x) => x.slug === this.id);
        this.denied = !r;
        if (r) center.markRecent(this.id);
        if (r && !this.legacy) this.report = { id: r.slug, label: r.tile_name ?? r.title.replace(/ Report$/, ''), category: r.category, icon: r.icon, variant: r.variant ?? 'gray', description: r.description };
        this.ready = true;
      },
      error: () => { this.ready = true; this.denied = !this.legacy; },
    });
  }

  goBack(): void {
    this.router.navigate(['/app/reports']);
  }
}
