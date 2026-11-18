import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import Swal from 'sweetalert2';
import { HrService } from '../../../../shared/common-services/hr.service';
import { AmountInput } from '../../../../shared/directives/amount-input.directive';
import { PhoneInput } from '../../../../shared/directives/phone-input.directive';

const MAX_BYTES = 5 * 1024 * 1024; // photo and resume: 5 MB each
const RESUME_EXT = /\.(pdf|docx?)$/i;
const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

type ApplySource = 'Indeed' | 'LinkedIn' | 'Naukri' | 'Referral' | 'Walk-in';

/** HR enters an applicant by hand against an open vacancy: details + profile photo + resume (max 5 MB each); the candidate then follows the normal hiring process. */
@Component({
  selector: 'app-vacancy-apply-form',
  standalone: true,
  imports: [AmountInput, PhoneInput,CommonModule, FormsModule, MatDialogModule],
  templateUrl: './vacancy-apply-form.html',
  styleUrl: '../../../../shared/styles/erp-dialog.scss',
})
export class VacancyApplyForm {
  private readonly dialogRef = inject(MatDialogRef<VacancyApplyForm>);
  readonly hr = inject(HrService);

  readonly sources: ApplySource[] = ['Walk-in', 'Referral', 'Indeed', 'LinkedIn', 'Naukri'];
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly photoPreview = signal('');
  readonly photoError = signal<string | null>(null);
  readonly resumeError = signal<string | null>(null);
  readonly resumeName = signal('');

  private photoFile: File | null = null;
  private resumeFile: File | null = null;

  model = {
    vacancyId: '', firstName: '', lastName: '', phone: '', email: '', source: 'Walk-in' as ApplySource, location: '', experienceYears: 0, currentCompany: '',
    currentCtc: 0, expectedCtc: 0, noticeDays: 0, education: '', skills: '', profileUrl: '', notes: '',
  };

  /** Only approved, still-open vacancies accept applicants. */
  get vacancies() {
    return this.hr.vacancies().filter(v => v.vacancyStatus === 'Open');
  }

  constructor() {
    if (this.vacancies.length === 1) this.model.vacancyId = this.vacancies[0].id;
  }

  initials(): string {
    return [this.model.firstName, this.model.lastName].map(p => p.trim()[0]?.toUpperCase() ?? '').join('') || '?';
  }

  onPhotoSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!PHOTO_EXT.test(file.name)) return void this.photoError.set('Choose a JPG, PNG or WebP image.');
    if (file.size > MAX_BYTES) return void this.photoError.set('Photo must be 5 MB or smaller.');
    this.photoError.set(null);
    this.photoFile = file;
    const reader = new FileReader();
    reader.onerror = () => this.photoError.set('Could not read the image.');
    reader.onload = () => this.photoPreview.set(String(reader.result));
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.photoFile = null;
    this.photoPreview.set('');
  }

  onResumeSelected(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!RESUME_EXT.test(file.name)) return void this.resumeError.set('Resume must be a PDF, DOC or DOCX file.');
    if (file.size > MAX_BYTES) return void this.resumeError.set('Resume must be 5 MB or smaller.');
    this.resumeError.set(null);
    this.resumeFile = file;
    this.resumeName.set(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  removeResume(): void {
    this.resumeFile = null;
    this.resumeName.set('');
  }

  save(form: NgForm): void {
    this.submitted.set(true);
    if (form.invalid || !this.model.vacancyId) return;
    this.saving.set(true);
    const m = this.model;
    this.hr.addCandidate({
      vacancyId: m.vacancyId, name: `${m.firstName.trim()} ${m.lastName.trim()}`.trim(), email: m.email.trim(), phone: m.phone.trim(), source: m.source, profileUrl: m.profileUrl.trim(), location: m.location.trim(),
      experienceYears: Number(m.experienceYears) || 0, currentCompany: m.currentCompany.trim(), currentCtc: Number(m.currentCtc) || 0, expectedCtc: Number(m.expectedCtc) || 0,
      noticeDays: Number(m.noticeDays) || 0, skills: m.skills.trim(), education: m.education.trim(), notes: m.notes.trim(), rating: 0, interviewAt: null,
    }, { photo: this.photoFile, resume: this.resumeFile }).subscribe({
      next: () => this.dialogRef.close(true),
      error: err => {
        this.saving.set(false);
        const first = err?.error?.errors ? Object.values(err.error.errors as Record<string, string[]>)[0]?.[0] : null;
        Swal.fire({ icon: 'error', title: 'Could not submit the application', text: first ?? err?.error?.message ?? 'Please try again.', confirmButtonColor: '#6C63FF' });
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
