import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Observable, finalize } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { HrService } from '../../../../shared/common-services/hr.service';
import { Datetime12h } from '../../../../shared/components/datetime-12h/datetime-12h';
import { CanActionDirective } from '../../../../shared/directives/can-action.directive';
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
  imports: [CommonModule, FormsModule, MatDialogModule, CanActionDirective, Datetime12h],
  templateUrl: './candidate-process.html',
  styleUrls: ['../../../../shared/styles/erp-dialog.scss', './candidate-process.scss'],
})
export class CandidateProcess {
  private readonly dialogRef = inject(MatDialogRef<CandidateProcess>);
  private readonly data = inject<{ candidateId: string }>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  readonly hr = inject(HrService);
  readonly auth = inject(AuthService);

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
  readonly busy = signal(false);
  /** Document type whose file is uploading right now (its Upload button shows a spinner; the others are disabled). */
  readonly uploadingType = signal<string | null>(null);
  readonly linkCopied = signal(false);

  // Interview scheduling
  schedAt = `${addDays(isoDate(), 1)}T11:00`;
  interviewer = '';
  mode: InterviewMode = 'In-person';
  /** Optional note HR adds to the interview email (shown above the meeting link). */
  interviewMessage = '';
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
    // The list rows carry no history / documents / verification gaps: load the full candidate.
    this.hr.fetchCandidate(c.id).subscribe({ next: x => { this.bgStatus = x.verification?.backgroundCheck ?? this.bgStatus; this.bgRemarks = x.verification?.backgroundRemarks ?? this.bgRemarks; }, error: () => undefined });
  }

  doc(type: string): CandidateDocument | undefined {
    return this.candidate().verification?.documents.find(d => d.type === type);
  }

  /** Interview evaluation: each question is rated 1-5 stars; the overall performance rating is their average. */
  readonly evaluationQuestions = [
    { key: 'communication', label: 'Communication', question: 'How clearly and confidently did the candidate communicate?' },
    { key: 'knowledge', label: 'Role knowledge', question: 'How well does the candidate know the skills this role needs?' },
    { key: 'experience', label: 'Relevant experience', question: "How relevant is the candidate's past experience to this vacancy?" },
    { key: 'problem', label: 'Problem solving', question: 'How well did the candidate handle situational / scenario questions?' },
    { key: 'attitude', label: 'Attitude & teamwork', question: 'How positive, polite and team-oriented was the candidate?' },
    { key: 'commitment', label: 'Commitment', question: 'How committed is the candidate to joining and staying with the company?' },
  ];
  answers: Record<string, number> = {};
  /** Set after a failed submit so the unrated questions turn red. */
  evalAttempted = false;

  setAnswer(key: string, value: number): void {
    this.answers[key] = value;
    this.performance = this.averageScore() ? Math.min(5, Math.max(1, Math.round(this.averageScore()))) : 0;
  }

  /** Average of the answered questions (0 when none), e.g. 4.2. */
  averageScore(): number {
    const given = this.evaluationQuestions.map(q => this.answers[q.key] ?? 0).filter(v => v > 0);
    return given.length ? given.reduce((a, b) => a + b, 0) / given.length : 0;
  }

  answeredCount(): number {
    return this.evaluationQuestions.filter(q => (this.answers[q.key] ?? 0) > 0).length;
  }

  /**
   * Splits the saved interview notes into HR's own notes and the question-by-question evaluation that
   * markInterviewed() appends ("Evaluation (average 3.3/5): Communication 1/5 · Role knowledge 2/5 ...").
   */
  parseEvaluation(raw?: string | null): { notes: string; average: number; items: { label: string; question: string; score: number }[] } {
    const text = (raw ?? '').trim();
    const match = text.match(/Evaluation \(average ([\d.]+)\/5\):\s*([\s\S]+)$/);
    if (!match) return { notes: text, average: 0, items: [] };
    const items = match[2].split('·').map(part => part.trim().match(/^(.+?)\s+(\d)\/5$/)).filter((m): m is RegExpMatchArray => !!m)
      .map(m => ({ label: m[1], question: this.evaluationQuestions.find(q => q.label === m[1])?.question ?? '', score: Number(m[2]) }));
    return { notes: text.slice(0, match.index).trim(), average: Number(match[1]), items };
  }

  /** Icon + colour for a history entry, picked from its action text (most specific rules first). */
  historyMeta(action: string): { icon: string; tone: 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'grey' } {
    const a = (action ?? '').toLowerCase();
    const rules: [RegExp, string, 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'grey'][] = [
      [/email.*(could not|not sent)|(could not|not sent).*email/, 'bi-envelope-x-fill', 'red'],
      [/declin|withdr|cancel/, 'bi-x-circle-fill', 'red'],
      [/reject/, 'bi-x-octagon-fill', 'red'],
      [/email/, 'bi-envelope-check-fill', 'purple'],
      [/reschedul/, 'bi-arrow-repeat', 'orange'],
      [/schedul/, 'bi-calendar-event-fill', 'blue'],
      [/shortlist/, 'bi-bookmark-check-fill', 'green'],
      [/uploaded/, 'bi-cloud-arrow-up-fill', 'blue'],
      [/verification started/, 'bi-shield-exclamation', 'orange'],
      [/verification completed|verified/, 'bi-shield-fill-check', 'green'],
      [/background/, 'bi-person-lines-fill', 'blue'],
      [/document/, 'bi-file-earmark-check-fill', 'blue'],
      [/selected|select/, 'bi-patch-check-fill', 'green'],
      [/interview/, 'bi-chat-square-text-fill', 'green'],
      [/offer.*(accepted|hired)|hired/, 'bi-person-check-fill', 'green'],
      [/offer/, 'bi-send-fill', 'purple'],
      [/employee|onboard|joined/, 'bi-person-badge-fill', 'green'],
      [/received|applied|added/, 'bi-person-plus-fill', 'blue'],
    ];
    const hit = rules.find(([re]) => re.test(a));
    return hit ? { icon: hit[1], tone: hit[2] } : { icon: 'bi-clock-history', tone: 'grey' };
  }

  /** Short label under the stars: Poor ... Excellent. */
  scoreLabel(value: number): string {
    return ['', 'Poor', 'Below average', 'Average', 'Good', 'Excellent'][Math.round(value)] ?? '';
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

  /** Runs a server action; a failure shows the API's message in the dialog's error line. */
  private run<T = unknown>(source: Observable<T>, done?: (result: T) => void): void {
    this.busy.set(true);
    source.subscribe({
      next: result => { this.busy.set(false); done?.(result); },
      error: err => {
        this.busy.set(false);
        const errors = err?.error?.errors as Record<string, string[]> | undefined;
        this.error.set((errors && Object.values(errors).flat()[0]) || err?.error?.message || 'Something went wrong. Please try again.');
      },
    });
  }

  // ---- Stage actions ----
  shortlist(): void {
    this.begin();
    this.run(this.hr.shortlistCandidate(this.candidate().id));
  }

  schedule(): void {
    this.begin();
    if (!this.schedAt || new Date(this.schedAt).getTime() < Date.now() - 60000) return void this.fail('Pick a future interview date and time.');
    if (!this.interviewer.trim()) return void this.fail('Enter who will interview the candidate.');
    const videoCall = this.mode === 'Video call';
    this.run(this.hr.scheduleInterview(this.candidate().id, { scheduledAt: new Date(this.schedAt).toISOString(), interviewer: this.interviewer.trim(), mode: this.mode, message: this.interviewMessage.trim() }), updated => {
      this.interviewMessage = '';
      // The interview is saved either way; tell HR when Google could not create the Meet link so it is not missed silently.
      if (videoCall && !(updated as Candidate | undefined)?.interview?.meetLink) {
        this.error.set('Interview scheduled, but the Google Meet link could not be created. Check Settings → Google Meet, then reschedule.');
      }
    });
  }

  /** "awt-rysw-ghn" out of https://meet.google.com/awt-rysw-ghn (the meeting code shown on the card). */
  meetCode(link: string): string {
    return link.replace(/^https?:\/\/(www\.)?/i, '').replace(/^meet\.google\.com\//i, '').split('?')[0];
  }

  /** Copies the Google Meet link of the scheduled interview. */
  copyMeetLink(link: string): void {
    navigator.clipboard?.writeText(link).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1500);
    }, () => undefined);
  }

  markInterviewed(): void {
    this.begin();
    if (!this.doneAt) return void this.fail('Enter when the interview took place.');
    const unanswered = this.evaluationQuestions.filter(q => !(this.answers[q.key] > 0));
    this.evalAttempted = unanswered.length > 0;
    if (unanswered.length) {
      // Inline message (the unrated questions also turn red); scroll to the first one.
      setTimeout(() => document.querySelector('.eval-row.missing')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      return void this.fail(`Please rate all ${this.evaluationQuestions.length} interview questions with 1 to 5 stars. ${unanswered.length} still to rate: ${unanswered.map(q => q.label).join(', ')}.`);
    }
    // The star answers are kept with the notes so the evaluation stays on the candidate's record.
    const breakdown = `Evaluation (average ${this.averageScore().toFixed(1)}/5): ${this.evaluationQuestions.map(q => `${q.label} ${this.answers[q.key]}/5`).join(' · ')}`;
    const notes = [this.interviewNotes.trim(), breakdown].filter(Boolean).join('\n\n');
    this.run(this.hr.recordInterview(this.candidate().id, { interviewedAt: new Date(this.doneAt).toISOString(), performanceRating: this.performance, notes }), () => (this.reviewRating = this.performance));
  }

  decide(selected: boolean): void {
    this.begin();
    if (!this.reviewRating) return void this.fail('Give the final review rating (1-5).');
    if (!this.reviewComments.trim()) return void this.fail(selected ? 'Write a short review of the candidate.' : 'Write the reason for rejecting the candidate.');
    this.run(this.hr.reviewCandidate(this.candidate().id, { rating: this.reviewRating, comments: this.reviewComments.trim(), selected }));
  }

  confirmReject(): void {
    this.begin();
    if (!this.rejectReason.trim()) return void this.fail('Enter the reason for rejecting the candidate.');
    this.run(this.hr.rejectCandidate(this.candidate().id, this.rejectReason.trim()), () => {
      this.showReject.set(false);
      this.rejectReason = '';
    });
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
    this.run(this.hr.startVerification(this.candidate().id));
  }

  /** Opens the uploaded file of a verification document in a new tab. */
  viewDoc(d: CandidateDocument): void {
    this.hr.viewCandidateDocument(this.candidate().id, d);
  }

  upload(type: string, event: Event): void {
    this.begin();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return void this.fail(`${file.name} is larger than 5 MB.`);
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return void this.fail('Upload a PDF, JPG or PNG file.');
    this.uploadingType.set(type);
    this.run(this.hr.uploadCandidateDocument(this.candidate().id, type, file).pipe(finalize(() => this.uploadingType.set(null))));
  }

  verifyDoc(type: string, verified: boolean): void {
    this.begin();
    const remarks = (this.docRemarks[type] ?? '').trim();
    if (!verified && !remarks) return void this.fail(`Add a remark explaining why ${type} is rejected.`);
    this.run(this.hr.verifyCandidateDocument(this.candidate().id, type, verified, remarks), () => delete this.docRemarks[type]);
  }

  saveBackground(): void {
    this.begin();
    if (this.bgStatus === 'Issue Found' && !this.bgRemarks.trim()) return void this.fail('Describe the issue found in the background check.');
    this.run(this.hr.setBackgroundCheck(this.candidate().id, this.bgStatus, this.bgRemarks.trim()));
  }

  completeVerification(): void {
    this.begin();
    if (this.gaps().length) return void this.fail('Verify every required document and clear the background check first.');
    this.run(this.hr.completeVerification(this.candidate().id));
  }

  releaseOffer(): void {
    this.begin();
    const v = this.vacancy();
    if (!(this.offerGross > 0)) return void this.fail('Enter the offered monthly gross.');
    if (v && this.offerGross > v.budgetMax) return void this.fail(`Offer is above the approved budget of ₹${v.budgetMax.toLocaleString('en-IN')}.`);
    if (!this.joiningDate || this.joiningDate < this.today) return void this.fail('Pick a valid joining date.');
    if (!this.validUntil || this.validUntil < this.today) return void this.fail('Pick the date until which the offer is valid.');
    if (!this.candidate().verification?.completedAt) return void this.fail('Complete the background verification before releasing an offer.');
    this.run(this.hr.releaseOffer(this.candidate().id, { monthlyGross: Number(this.offerGross), joiningDate: this.joiningDate, validUntil: this.validUntil }));
  }

  respond(accepted: boolean): void {
    this.begin();
    if (!accepted && !this.responseRemarks.trim()) return void this.fail('Note why the candidate declined the offer.');
    this.run(this.hr.respondToOffer(this.candidate().id, accepted, this.responseRemarks.trim()), () => { if (accepted) this.addEmployee(); });
  }

  /** Opens the Add Employee form prefilled from the application and offer; saving it completes the hire. */
  addEmployee(): void {
    this.dialog.open(EmployeeForm, { width: '900px', maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh', autoFocus: false, restoreFocus: true, disableClose: true, data: { employee: null, candidateId: this.candidate().id } })
      // Employee saved: this hiring dialog closes too, so only the success message is left on screen.
      .afterClosed().subscribe(saved => { if (saved) this.dialogRef.close(true); });
  }

  offerLetter(c: Candidate): void {
    if (c.offer) downloadOfferLetter(c, c.offer, this.vacancy());
  }

  resume(c: Candidate): void {
    // The file uploaded with the application (manual vacancy entry) when there is one; otherwise a resume generated from the candidate's details.
    if (c.hasOriginalResume) this.hr.downloadOriginalResume(c);
    else downloadResume(c, this.vacancy());
  }

  close(): void {
    this.dialogRef.close();
  }
}
