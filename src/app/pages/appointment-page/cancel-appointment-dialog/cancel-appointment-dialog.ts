import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';

export interface CancelAppointmentData {
  id: number;
  name: string;
  /** "Wed, Nov 11, 2026 · 11:15 AM" - shown so the right visit is cancelled. */
  slot: string;
}

/**
 * Cancels a booked visit: the reason (notes) is required, the slot is freed straight away and the reason is kept in the
 * appointment's audit trail. Closes with true once the appointment is cancelled.
 */
@Component({
  selector: 'app-cancel-appointment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  template: `
    <div class="ca-dialog">
      <header class="ca-head">
        <span class="ca-icon"><i class="bi bi-calendar-x"></i></span>
        <div>
          <h2>Cancel appointment</h2>
          <p>{{ data.name }} · {{ data.slot }}</p>
        </div>
        <button type="button" class="ca-close" (click)="close(false)" aria-label="Close"><i class="bi bi-x-lg"></i></button>
      </header>

      <label class="ca-field" for="ca-notes">Reason for cancelling <span>*</span></label>
      <textarea id="ca-notes" rows="4" maxlength="255" [(ngModel)]="notes" name="notes" placeholder="e.g. Customer is travelling and asked to cancel"></textarea>
      <small class="ca-count">{{ notes.length }}/255</small>

      @if (error()) { <p class="ca-error"><i class="bi bi-exclamation-circle"></i> {{ error() }}</p> }

      <footer class="ca-foot">
        <button type="button" class="ca-btn ghost" (click)="close(false)">Keep appointment</button>
        <button type="button" class="ca-btn danger" [disabled]="saving()" (click)="submit()">
          <i class="bi" [ngClass]="saving() ? 'bi-arrow-repeat' : 'bi-x-circle'"></i> {{ saving() ? 'Cancelling…' : 'Cancel appointment' }}
        </button>
      </footer>
    </div>
  `,
  styles: [`
    .ca-dialog { display: flex; flex-direction: column; gap: 8px; padding: 18px 20px 16px; min-width: min(440px, 88vw); }
    .ca-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .ca-head h2 { margin: 0; font-size: 17px; font-weight: 800; color: var(--text-dark, #1f2d2a); }
    .ca-head p { margin: 2px 0 0; font-size: 12px; color: var(--text-muted, #6b7280); }
    .ca-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; font-size: 18px;
      background: var(--status-red-bg, #fdecea); color: var(--status-red-text, #c62828); }
    .ca-close { margin-left: auto; width: 32px; height: 32px; border: 0; border-radius: 50%; background: transparent; cursor: pointer; color: var(--text-muted, #6b7280); }
    .ca-close:hover { background: var(--primary-soft, #eef7f2); }
    .ca-field { font-size: 12px; font-weight: 700; color: var(--text-dark, #1f2d2a); }
    .ca-field span { color: #dc3545; }
    textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color, #d9e2df); border-radius: 12px; font: inherit; font-size: 13px; resize: vertical; }
    textarea:focus { outline: 2px solid var(--primary-border, #cfe3da); border-color: var(--primary, #0b6e4f); }
    .ca-count { align-self: flex-end; color: var(--text-muted, #6b7280); font-size: 11px; }
    .ca-error { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--status-red-text, #c62828); }
    .ca-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .ca-btn { height: 36px; padding: 0 16px; border: 0; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .ca-btn.ghost { background: var(--app-surface-solid, #fff); border: 1px solid var(--border-color, #d9e2df); color: var(--text-dark, #1f2d2a); }
    .ca-btn.danger { background: var(--status-red-text, #c62828); color: #fff; }
    .ca-btn:disabled { opacity: .6; cursor: not-allowed; }
  `],
})
export class CancelAppointmentDialog {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<CancelAppointmentDialog, boolean>);
  readonly data = inject<CancelAppointmentData>(MAT_DIALOG_DATA);

  notes = '';
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  close(done: boolean): void {
    this.dialogRef.close(done);
  }

  submit(): void {
    const reason = this.notes.trim();
    if (!reason) return void this.error.set('Write why the appointment is being cancelled.');
    this.error.set(null);
    this.saving.set(true);
    this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/${this.data.id}/cancel`, { reason })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (res: any) => {
          this.toast.success(res?.message || 'Appointment cancelled.');
          this.dialogRef.close(true);
        },
        error: (err: any) => this.error.set(err?.error?.message || err?.error?.errors?.reason?.[0] || 'Could not cancel the appointment.'),
      });
  }
}
