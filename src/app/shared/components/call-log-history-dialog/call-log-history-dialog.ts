import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CallerLogEntry } from '../../models/common-components.model';
import { FollowUpEntry } from '../../common-services/crm-flow.service';

/** Data passed into app-call-log-history-dialog via MAT_DIALOG_DATA. */
export interface CallLogHistoryDialogData {
  leadName: string;
  subtitle?: string;
  entries: CallerLogEntry[];
  /** Follow-up notes logged from the lead profile dialog (with next-follow-up date/time), shown above the legacy call log. */
  followUps?: FollowUpEntry[];
}

/**
 * Popup opened from the "Action" column of the Follow-Ups table (instead of separate
 * Follow Up 1 / Follow Up 2 / Follow Up 3 columns). Lists every logged call attempt for a
 * lead: telecaller name, employee number, follow-up date & time, and notes.
 */
@Component({
  selector: 'app-call-log-history-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule],
  templateUrl: './call-log-history-dialog.html',
  styleUrl: './call-log-history-dialog.scss',
})
export class CallLogHistoryDialog {
  constructor(
    public dialogRef: MatDialogRef<CallLogHistoryDialog>,
    @Inject(MAT_DIALOG_DATA) public data: CallLogHistoryDialogData,
  ) {}

  formatNextFollowUp(entry: FollowUpEntry): string {
    if (!entry.nextFollowUpDate) return '';
    const date = new Date(`${entry.nextFollowUpDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return entry.nextFollowUpDate;

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const display = `${day}-${month}-${date.getFullYear()}`;
    return entry.nextFollowUpTime ? `${display}, ${entry.nextFollowUpTime}` : display;
  }

  close(): void {
    this.dialogRef.close();
  }
}
