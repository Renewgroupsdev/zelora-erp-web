import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AddLeadForm } from '../../../pages/lead-management/add-lead-form/add-lead-form';
import { ApiDataService } from '../../../core/http/api.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CallDisposition, CallLog, DispositionPayload, customerNumber, formatCallDuration } from '../../../core/telephony/telephony.models';
import { TelephonyService } from '../../../core/telephony/telephony.service';

export interface CallOutcomeDialogData {
  call: CallLog;
  /** Answered calls must get an outcome; unanswered outbound calls may be skipped. */
  required: boolean;
}

const ACTION_ICONS: Record<string, string> = {
  follow_up: 'bi-arrow-repeat',
  callback: 'bi-telephone-forward',
  appointment: 'bi-calendar2-check',
  converted: 'bi-person-check',
  none: 'bi-chat-left-text',
};

@Component({
  selector: 'app-call-outcome-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './call-outcome-dialog.html',
  styleUrl: './call-outcome-dialog.scss',
})
export class CallOutcomeDialog implements OnInit {
  readonly data = inject<CallOutcomeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CallOutcomeDialog, CallLog | undefined>);
  private readonly dialog = inject(MatDialog);
  private readonly telephony = inject(TelephonyService);
  private readonly api = inject(ApiDataService);
  private readonly toast = inject(ToastService);

  readonly call = this.data.call;
  readonly number = customerNumber(this.call);
  readonly duration = formatCallDuration(this.call.talk_duration);
  readonly today = new Date().toISOString().slice(0, 10);
  readonly followUpTypes = [
    { value: 0, label: 'General' },
    { value: 1, label: 'Cool' },
    { value: 2, label: 'Hot' },
  ];

  readonly dispositions = signal<CallDisposition[]>([]);
  readonly counselors = signal<{ id: number; name: string }[]>([]);
  readonly selectedCode = signal<string>('');
  readonly saving = signal(false);
  readonly errors = signal<Record<string, string>>({});

  readonly selected = computed(() => this.dispositions().find(d => d.code === this.selectedCode()) ?? null);
  readonly action = computed(() => this.selected()?.action ?? 'none');
  readonly needsLead = computed(() => ['follow_up', 'callback', 'appointment', 'converted'].includes(this.action()));

  leadId: number | null = this.call.lead?.id ?? this.call.lead_id ?? null;
  leadName: string | null = this.call.lead?.name ?? null;

  notes = '';
  followUpDate = this.addDays(1);
  followUpTime = '10:00';
  followUpType = 0;
  appointmentDate = this.addDays(1);
  appointmentTime = '11:00';
  counselorId: number | null = null;
  appointmentReason = '';

  ngOnInit(): void {
    this.telephony.dispositions().subscribe({
      next: list => {
        // An answered call cannot be "no answer".
        this.dispositions.set(this.call.answered_at ? list.filter(d => d.code !== 'no_answer') : list);
        if (!this.call.answered_at && list.some(d => d.code === 'no_answer')) this.selectedCode.set('no_answer');
      },
      error: () => this.toast.error('Could not load call outcomes.'),
    });

    this.api.GET(`${ApiRoutesConstants.USER_LIST}?status=1&per_page=100`).subscribe({
      next: (res: any) => {
        const users: any[] = res?.data?.data ?? [];
        this.counselors.set(users.filter(u => u.role?.slug !== 'telecaller').map(u => ({ id: u.id, name: u.name })));
      },
      error: () => this.counselors.set([]),
    });
  }

  icon(d: CallDisposition): string {
    return ACTION_ICONS[d.action] ?? ACTION_ICONS['none'];
  }

  select(code: string): void {
    this.selectedCode.set(code);
    this.errors.set({});
  }

  /** Unknown caller: create the lead now, then this call and its outcome are linked to it. */
  createLead(): void {
    this.dialog
      .open(AddLeadForm, {
        width: '920px',
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: '92vh',
        autoFocus: false,
        disableClose: true,
        panelClass: 'add-lead-dialog',
        data: { mobile_no: this.number },
      })
      .afterClosed()
      .subscribe((lead: any) => {
        if (lead?.id) {
          this.leadId = lead.id;
          this.leadName = lead.name;
        }
      });
  }

  skip(): void {
    this.dialogRef.close();
  }

  save(): void {
    const disposition = this.selected();
    if (!disposition) {
      this.errors.set({ disposition: 'Choose an outcome.' });
      return;
    }
    if (this.needsLead() && !this.leadId) {
      this.errors.set({ lead_id: 'Create the lead for this caller first.' });
      return;
    }

    const payload: DispositionPayload = { disposition: disposition.code, notes: this.notes.trim() || null };
    if (!this.call.lead && this.leadId) payload.lead_id = this.leadId;

    if (disposition.action === 'follow_up' || disposition.action === 'callback') {
      Object.assign(payload, {
        follow_up_date: this.followUpDate,
        follow_up_time: this.followUpTime || null,
        follow_up_type: disposition.action === 'follow_up' ? this.followUpType : 0,
      });
    } else if (disposition.action === 'appointment') {
      Object.assign(payload, {
        appointment_date: this.appointmentDate,
        appointment_time: this.appointmentTime,
        counselor_id: this.counselorId,
        appointment_reason: this.appointmentReason.trim() || null,
      });
    }

    this.saving.set(true);
    this.telephony.saveDisposition(this.call.id, payload).subscribe({
      next: call => {
        this.saving.set(false);
        this.toast.success('Call outcome saved', this.successText(disposition));
        this.dialogRef.close(call);
      },
      error: (err: any) => {
        this.saving.set(false);
        const fieldErrors = err?.error?.errors as Record<string, string[]> | undefined;
        if (fieldErrors) {
          this.errors.set(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])));
        } else {
          this.toast.error(err?.error?.message || 'Could not save the call outcome.');
        }
      },
    });
  }

  private successText(d: CallDisposition): string {
    switch (d.action) {
      case 'follow_up':
      case 'callback':
        return `Follow-up scheduled for ${this.followUpDate} ${this.followUpTime}.`;
      case 'appointment':
        return `Appointment booked for ${this.appointmentDate} ${this.appointmentTime}.`;
      case 'converted':
        return `${this.leadName ?? 'Lead'} is now a customer.`;
      default:
        return d.label;
    }
  }

  private addDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }
}
