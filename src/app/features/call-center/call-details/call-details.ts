import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CallLog, LIVE_CALL_STATUSES, customerNumber, formatCallDuration } from '../../../core/telephony/telephony.models';

/** Read-only detail modal for one call record, with a shortcut to log its outcome. */
@Component({
  selector: 'app-call-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './call-details.html',
  styleUrl: './call-details.scss',
})
export class CallDetails {
  @Input({ required: true }) call!: CallLog;

  @Output() closed = new EventEmitter<void>();
  @Output() logOutcome = new EventEmitter<CallLog>();

  readonly customerNumber = customerNumber;
  readonly formatDuration = formatCallDuration;

  get canLogOutcome(): boolean {
    return !this.call.disposed_at && !LIVE_CALL_STATUSES.includes(this.call.status);
  }
}
