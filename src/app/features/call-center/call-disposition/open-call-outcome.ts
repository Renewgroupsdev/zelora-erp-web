import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { CallLog } from '../../../core/telephony/telephony.models';
import { CallOutcomeDialog, CallOutcomeDialogData } from './call-outcome-dialog';

/** Opens the call outcome form with the same size/behaviour everywhere it's used.
 *  `required` (an answered call) blocks closing until an outcome is chosen. */
export function openCallOutcome(
  dialog: MatDialog,
  call: CallLog,
  required = false
): MatDialogRef<CallOutcomeDialog, CallLog | undefined> {
  return dialog.open<CallOutcomeDialog, CallOutcomeDialogData, CallLog | undefined>(CallOutcomeDialog, {
    width: '640px',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '92vh',
    autoFocus: false,
    disableClose: required,
    panelClass: 'call-outcome-dialog-panel',
    data: { call, required },
  });
}
