import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CallLog, CallerProfile, customerNumber } from '../../../core/telephony/telephony.models';

/** The ringing-call popup: who is calling, what the CRM knows about them, Answer / Reject. */
@Component({
  selector: 'app-incoming-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './incoming-call.component.html',
  styleUrl: './incoming-call.component.scss',
})
export class IncomingCallComponent {
  @Input({ required: true }) call!: CallLog;
  @Input() caller: CallerProfile | null = null;
  @Input() secondsLeft = 0;
  @Input() busy = false;

  @Output() answer = new EventEmitter<CallLog>();
  @Output() reject = new EventEmitter<CallLog>();

  readonly customerNumber = customerNumber;
}
