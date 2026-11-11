import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../common-services/api-route-constants';
import { ToastService } from '../../common-services/toast.service';
import { SittingTransfer } from '../../models/appointment-flow.model';

interface TransferDoctor { id: number; name: string; free: boolean }

/**
 * The receiving branch's manager decides a sitting transfer: the date / time asked for, the doctors of this branch
 * with who is free then (optional), accept (the sitting moves here at once) or reject with a required note.
 * Closes with `true` once decided.
 */
@Component({
  selector: 'app-sitting-transfer-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './sitting-transfer-dialog.html',
  styleUrls: ['../../styles/erp-dialog.scss', './sitting-transfer-dialog.scss'],
})
export class SittingTransferDialog implements OnInit {
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);
  private readonly dialogRef = inject(MatDialogRef<SittingTransferDialog, boolean>);
  readonly data = inject<{ transfer: SittingTransfer }>(MAT_DIALOG_DATA);

  readonly t = this.data.transfer;
  readonly doctors = signal<TransferDoctor[]>([]);
  readonly loading = signal(false);
  readonly busy = signal<'accept' | 'decline' | null>(null);
  readonly today = new Date().toISOString().slice(0, 10);

  date = this.t.scheduled_date ?? '';
  time = (this.t.scheduled_time ?? '').slice(0, 5);
  doctorId: number | null = null;
  note = '';

  ngOnInit(): void {
    this.loadDoctors();
  }

  /** Re-checks who is free whenever the date / time is changed. */
  loadDoctors(): void {
    this.loading.set(true);
    const q = `date=${this.date}${this.time ? `&time=${encodeURIComponent(this.time)}` : ''}`;
    this.api.GET(`${ApiRoutesConstants.APPOINTMENT_FLOW}/sitting-transfers/${this.t.id}/doctors?${q}`)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res: any) => {
          const list = (res?.data ?? []) as TransferDoctor[];
          this.doctors.set(list);
          if (this.doctorId && !list.find(d => d.id === this.doctorId && d.free)) this.doctorId = null;
        },
        error: (err: any) => this.toast.error(err?.error?.message || 'Could not load the doctors.'),
      });
  }

  get freeCount(): number {
    return this.doctors().filter(d => d.free).length;
  }

  accept(): void {
    if (!this.date || this.date < this.today) return void this.toast.error('Pick today or a later date.');
    this.send('accept', { doctor_id: this.doctorId, scheduled_date: this.date, scheduled_time: this.time || null });
  }

  /** Rejecting needs the reason - it is shown to the branch that asked. */
  readonly noteMissing = signal(false);

  decline(): void {
    const note = this.note.trim();
    if (note.length < 3) {
      this.noteMissing.set(true);
      return void this.toast.error('Write the reason for rejecting the transfer.');
    }
    this.send('decline', { note });
  }

  private send(kind: 'accept' | 'decline', body: object): void {
    this.busy.set(kind);
    this.api.POST(`${ApiRoutesConstants.APPOINTMENT_FLOW}/sitting-transfers/${this.t.id}/${kind}`, body)
      .pipe(finalize(() => this.busy.set(null)))
      .subscribe({
        next: (res: any) => {
          this.toast.success(res?.message || 'Saved.');
          this.dialogRef.close(true);
        },
        error: (err: any) => {
          const first = err?.error?.errors ? (Object.values(err.error.errors)[0] as string[])?.[0] : null;
          this.toast.error(first || err?.error?.message || 'Could not save.');
        },
      });
  }

  close(): void {
    this.dialogRef.close(false);
  }
}
