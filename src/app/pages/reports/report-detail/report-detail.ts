import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { REPORTS } from '../reports.data';
import { ReportTab } from '../reports.model';
import { LeadReport } from '../lead-report/lead-report';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [CommonModule, LeadReport],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.scss',
})
export class ReportDetail {
  report?: ReportTab;

  constructor(private route: ActivatedRoute, private router: Router) {
    const id = this.route.snapshot.paramMap.get('id');
    this.report = REPORTS.find(report => report.id === id);
  }

  goBack(): void {
    this.router.navigate(['/app/reports']);
  }
}
