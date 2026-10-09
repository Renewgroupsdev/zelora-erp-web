import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { FileUploadService, uploadError } from '../../../../shared/common-services/file-upload.service';
import { HrService } from '../../../../shared/common-services/hr.service';
import {
  BackgroundCheckStatus,
  Candidate,
  CandidateDocument,
  CandidateStage,
  INTERVIEW_MODES,
  InterviewMode,
  VERIFICATION_DOCUMENTS,
} from '../../../../shared/models/hr.model';
import { addDays, displayDate, isoDate } from '../../../../shared/utils/format.util';
import { EmployeeForm } from '../../employees/employee-form/employee-form';
import { downloadOfferLetter } from '../offer-letter';
import { downloadResume } from '../resume';

/** Steps shown on the progress bar (Rejected / Offer Declined end the process outside this list). */
const STEPS: { stage: CandidateStage; label: string; icon: string }[] = [
  { stage: 'Applied', label: 'Applied', icon: 'bi-person-plus' },
  { stage: 'Shortlisted', label: 'Shortlisted', icon: 'bi-bookmark-check' },
  { stage: 'Interview', label: 'Interview', icon: 'bi-calendar-event' },
  { stage: 'Interviewed', label: 'Interviewed', icon: 'bi-chat-square-text' },
  { stage: 'Selected', label: 'Selected', icon: 'bi-patch-check' },
  { stage: 'Verification', label: 'Verification', icon: 'bi-shield-check' },
  { stage: 'Offered', label: 'Offer', icon: 'bi-envelope-paper' },
  { stage: 'Hired', label: 'Joined', icon: 'bi-person-check' },
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * One candidate's hiring workflow: shortlist -> interview (who, when, how it went) -> review and
 * select / reject -> documents + background verification by HR -> offer letter -> accepted / declined.
 */
@Component({
  selector: 'app-candidate-process',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './candidate-process.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './candidate-process.scss'],
})
export class CandidateProcess {
  private readonly dialogRef = inject(MatDialogRef<CandidateProcess>);
  private readonly data = inject<{ candidateId: string }>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  readonly hr = inject(HrService);
  private readonly uploads = inject(FileUploadService);
  /** Document type whose file is uploading right now. */
  readonly uploadingDoc = signal<string | null>(null);

  readonly steps = STEPS;
  readonly modes = INTERVIEW_MODES;
  readonly docTypes = VERIFICATION_DOCUMENTS;
  readonly stars = [1, 2, 3, 4, 5];
  readonly displayDate = displayDate;
  readonly today = isoDate();

  readonly candidate = computed(() => this.hr.candidates().find(c => c.id === this.data.candidateId)!);
  readonly vacancy = computed(() => this.hr.manpower().find(m => m.id === this.candidate().vacancyId));
  readonly stepIndex = computed(() => {
    const stage = this.candidate().stage;
    if (stage === 'Offer Declined') return STEPS.findIndex(s => s.stage === 'Offered');
    if (stage === 'Rejected') return STEPS.findIndex(s => s.stage === (this.candidate().rejectedAtStage ?? 'Applied'));
    return STEPS.findIndex(s => s.stage === stage);
  });
  readonly closed = computed(() => ['Rejected', 'Offer Declined', 'Hired'].includes(this.candidate().stage) && !this.hr.awaitingJoining(this.candidate()));
  readonly gaps = computed(() => this.hr.verificationGaps(this.candidate()));
  readonly history = computed(() => [...(this.candidate().history ?? [])].reverse());

  readonly error = signal<string | null>(null);
  readonly showReject = signal(false);

  // Interview scheduling
  schedAt = `${addDays(isoDate(), 1)}T11:00`;
  interviewer = '';
  mode: InterviewMode = 'In-person';
  // Interview feedback
  doneAt = `${isoDate()}T${new Date().toTimeString().slice(0, 5)}`;
  performance = 0;
  interviewNotes = '';
  // Review
  reviewRating = 0;
  reviewComments = '';
  // Reject
  rejectReason = '';
  // Verification
  docRemarks: Record<string, string> = {};
  bgStatus: BackgroundCheckStatus = 'Pending';
  bgRemarks = '';
  // Offer
  offerGross = 0;
  joiningDate = '';
  validUntil = addDays(isoDate(), 7);
  responseRemarks = '';

  constructor() {
    const c = this.candidate();
    const v = this.vacancy();
    this.interviewer = c.interview?.interviewer ?? this.hr.userName;
    this.bgStatus = c.verification?.backgroundCheck ?? 'Pending';
    this.bgRemarks = c.verification?.backgroundRemarks ?? '';
    this.offerGross = v ? Math.min(v.budgetMax, Math.max(v.budgetMin, c.expectedCtc)) : c.expectedCtc;
    this.joiningDate = addDays(isoDate(), Math.max(7, c.noticeDays));
  }

  doc(type: string): CandidateDocument | undefined {
    return this.candidate().verification?.documents.find(d => d.type === type);
  }

  setRating(field: 'performance' | 'reviewRating', value: number): void {
    this[field] = value;
  }

  private fail(message: string): false {
    this.error.set(message);
    return false;
  }

  private begin(): void {
    this.error.set(null);
  }

  // ---- Stage actions ----
  shortlist(): void {
    this.begin();
    this.hr.shortlistCandidate(this.candidate().id);
  }

  schedule(): void {
    this.begin();
    if (!this.schedAt || new Date(this.schedAt).getTime() < Date.now() - 60000) return void this.fail('Pick a future interview date and time.');
    if (!this.interviewer.trim()) return void this.fail('Enter who will interview the candidate.');
    this.hr.scheduleInterview(this.candidate().id, { scheduledAt: new Date(this.schedAt).toISOString(), interviewer: this.interviewer.trim(), mode: this.mode });
  }

  markInterviewed(): void {
    this.begin();
    if (!this.doneAt) return void this.fail('Enter when the interview took place.');
    if (!this.performance) return void this.fail('Give the candidate a performance rating (1-5).');
    this.hr.recordInterview(this.candidate().id, { interviewedAt: new Date(this.doneAt).toISOString(), performanceRating: this.performance, notes: this.interviewNotes.trim() });
    this.reviewRating = this.performance;
  }

  decide(selected: boolean): void {
    this.begin();
    if (!this.reviewRating) return void this.fail('Give the final review rating (1-5).');
    if (!this.reviewComments.trim()) return void this.fail(selected ? 'Write a short review of the candidate.' : 'Write the reason for rejecting the candidate.');
    this.hr.reviewCandidate(this.candidate().id, { rating: this.reviewRating, comments: this.reviewComments.trim(), selected });
  }

  confirmReject(): void {
    this.begin();
    if (!this.rejectReason.trim()) return void this.fail('Enter the reason for rejecting the candidate.');
    this.hr.rejectCandidate(this.candidate().id, this.rejectReason.trim());
    this.showReject.set(false);
    this.rejectReason = '';
  }

  /** Back to the scheduling form; the interview history is kept. */
  reschedule(): void {
    this.begin();
    const c = this.candidate();
    const previous = c.interview?.scheduledAt || c.interviewAt;
    if (previous) this.schedAt = new Date(new Date(previous).getTime() - new Date(previous).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    this.hr.moveCandidate(c.id, 'Shortlisted');
  }

  startVerification(): void {
    this.begin();
    this.hr.startVerification(this.candidate().id);
  }

  upload(type: string, event: Event): void {
    this.begin();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return void this.fail(`${file.name} is larger than 5 MB.`);
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return void this.fail('Upload a PDF, JPG or PNG file.');

    const candidateId = this.candidate().id;
    this.uploadingDoc.set(type);
    this.uploads.upload('candidate_document', file).pipe(finalize(() => this.uploadingDoc.set(null))).subscribe({
      next: up => this.hr.uploadCandidateDocument(candidateId, type, file.name, up.url),
      error: err => this.fail(uploadError(err, `Could not upload ${file.name}. Please try again.`)),
    });
  }

  verifyDoc(type: string, verified: boolean): void {
    this.begin();
    const remarks = (this.docRemarks[type] ?? '').trim();
    if (!verified && !remarks) return void this.fail(`Add a remark explaining why ${type} is rejected.`);
    this.hr.verifyCandidateDocument(this.candidate().id, type, verified, remarks);
  }

  saveBackground(): void {
    this.begin();
    if (this.bgStatus === 'Issue Found' && !this.bgRemarks.trim()) return void this.fail('Describe the issue found in the background check.');
    this.hr.setBackgroundCheck(this.candidate().id, this.bgStatus, this.bgRemarks.trim());
  }

  completeVerification(): void {
    this.begin();
    if (!this.hr.completeVerification(this.candidate().id)) this.error.set('Verify every required document and clear the background check first.');
  }

  releaseOffer(): void {
    this.begin();
    const v = this.vacancy();
    if (!(this.offerGross > 0)) return void this.fail('Enter the offered monthly gross.');
    if (v && this.offerGross > v.budgetMax) return void this.fail(`Offer is above the approved budget of ₹${v.budgetMax.toLocaleString('en-IN')}.`);
    if (!this.joiningDate || this.joiningDate < this.today) return void this.fail('Pick a valid joining date.');
    if (!this.validUntil || this.validUntil < this.today) return void this.fail('Pick the date until which the offer is valid.');
    const offer = this.hr.releaseOffer(this.candidate().id, { monthlyGross: Number(this.offerGross), joiningDate: this.joiningDate, validUntil: this.validUntil });
    if (!offer) this.error.set('Complete the background verification before releasing an offer.');
  }

  respond(accepted: boolean): void {
    this.begin();
    if (!accepted && !this.responseRemarks.trim()) return void this.fail('Note why the candidate declined the offer.');
    this.hr.respondToOffer(this.candidate().id, accepted, this.responseRemarks.trim());
    if (accepted) this.addEmployee();
  }

  /** Opens the Add Employee form prefilled from the application and offer; saving it completes the hire. */
  addEmployee(): void {
    this.dialog.open(EmployeeForm, { width: '900px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, restoreFocus: true, disableClose: true, data: { employee: null, candidateId: this.candidate().id } });
  }

  offerLetter(c: Candidate): void {
    if (c.offer) downloadOfferLetter(c, c.offer, this.vacancy());
  }

  resume(c: Candidate): void {
    downloadResume(c, this.vacancy());
  }

  close(): void {
    this.dialogRef.close();
  }
}
