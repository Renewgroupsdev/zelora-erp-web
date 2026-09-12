import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CallerLogEntry } from '../../../shared/models/common-components.model';

/** Data passed into app-call-log-history-dialog via MAT_DIALOG_DATA. */
export interface CallLogHistoryDialogData {
  leadName: string;
  subtitle?: string;
  entries: CallerLogEntry[];
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

  close(): void {
    this.dialogRef.close();
  }
}
