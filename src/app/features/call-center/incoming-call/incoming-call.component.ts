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

  /** Initials of the lead name for the avatar (a hash sign stands in for an unknown caller). */
  initials(): string {
    const name = this.call.lead?.name?.trim();
    if (!name) return '#';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  /** "10:45:00" -> "10:45 AM". */
  time12(value: string | null | undefined): string {
    const m = /^(\d{1,2}):(\d{2})/.exec(value ?? '');
    if (!m) return value ?? '';
    const h = Number(m[1]);
    return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
  }
}
