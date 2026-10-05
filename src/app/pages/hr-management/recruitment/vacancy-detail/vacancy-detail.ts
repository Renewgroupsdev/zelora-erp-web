import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { HrService } from '../../../../shared/common-services/hr.service';
import { CANDIDATE_STAGES, Candidate, JOB_PORTALS, JobPortal } from '../../../../shared/models/hr.model';
import { displayDate } from '../../../../shared/utils/format.util';
import { CandidateProcess } from '../candidate-process/candidate-process';
import { downloadResume, exportCandidates } from '../resume';

/** One vacancy's recruitment workspace: portals, applicants, pipeline, resumes and hiring. */
@Component({
  selector: 'app-vacancy-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './vacancy-detail.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './vacancy-detail.scss'],
})
export class VacancyDetail {
  private readonly dialogRef = inject(MatDialogRef<VacancyDetail>);
  private readonly data = inject<{ vacancyId: string }>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  readonly hr = inject(HrService);

  readonly portals = JOB_PORTALS;
  readonly stages = CANDIDATE_STAGES;
  readonly displayDate = displayDate;
  readonly syncing = signal<JobPortal | null>(null);
  readonly sourceFilter = signal<string>('All');
  readonly stageFilter = signal<string>('All');

  readonly vacancy = computed(() => this.hr.manpower().find(m => m.id === this.data.vacancyId)!);
  readonly allCandidates = computed(() => this.hr.candidates().filter(c => c.vacancyId === this.data.vacancyId));
  readonly candidates = computed(() => this.allCandidates()
    .filter(c => this.sourceFilter() === 'All' || c.source === this.sourceFilter())
    .filter(c => this.stageFilter() === 'All' || c.stage === this.stageFilter())
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)));
  readonly pipeline = computed(() => this.stages.map(s => ({ stage: s, count: this.allCandidates().filter(c => c.stage === s).length })));
  readonly bySource = computed(() => ['Indeed', 'LinkedIn', 'Naukri', 'Referral', 'Walk-in'].map(s => ({ source: s, count: this.allCandidates().filter(c => c.source === s).length })));

  isPosted(p: JobPortal): boolean {
    return this.vacancy().postedTo.includes(p);
  }

  post(p: JobPortal): void {
    this.hr.postToPortals(this.vacancy().id, [p]);
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `Job posted on ${p}`, showConfirmButton: false, timer: 2500 });
  }

  sync(p: JobPortal): void {
    this.syncing.set(p);
    // Simulated portal round-trip.
    setTimeout(() => {
      const fresh = this.hr.syncApplicants(this.vacancy().id, p);
      this.syncing.set(null);
      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `${fresh.length} new applicant${fresh.length === 1 ? '' : 's'} from ${p}`, showConfirmButton: false, timer: 3000 });
    }, 700);
  }

  overBudget(c: Candidate): boolean {
    return c.expectedCtc > this.vacancy().budgetMax;
  }

  openProcess(c: Candidate): void {
    this.dialog.open(CandidateProcess, { width: '980px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, restoreFocus: true, disableClose: true, data: { candidateId: c.id } });
  }

  resume(c: Candidate): void {
    downloadResume(c, this.vacancy());
  }

  exportExcel(): void {
    exportCandidates(this.candidates(), () => `${this.vacancy().designation} - ${this.vacancy().branch}`, `candidates-${this.vacancy().requestNo}`);
  }

  close(): void {
    this.dialogRef.close();
  }
}
