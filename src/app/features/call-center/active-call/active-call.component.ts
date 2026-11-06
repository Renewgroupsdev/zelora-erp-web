import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CallLog, CallerProfile, TelecallerRow, customerNumber, formatCallDuration } from '../../../core/telephony/telephony.models';

/** The live call bar: timer, hold, transfer, note and hang up for the call in progress. */
@Component({
  selector: 'app-active-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './active-call.component.html',
  styleUrl: './active-call.component.scss',
})
export class ActiveCallComponent {
  @Input({ required: true }) call!: CallLog;
  @Input() caller: CallerProfile | null = null;
  @Input() seconds = 0;
  @Input() busy = false;
  @Input() transferTargets: TelecallerRow[] = [];

  @Output() hangup = new EventEmitter<CallLog>();
  @Output() toggleHold = new EventEmitter<CallLog>();
  @Output() transferOpened = new EventEmitter<void>();
  @Output() transfer = new EventEmitter<TelecallerRow>();
  /** The Note button: open the call-outcome popup for this call. */
  @Output() openOutcome = new EventEmitter<CallLog>();

  readonly customerNumber = customerNumber;
  readonly formatDuration = formatCallDuration;

  readonly minimized = signal(false);
  readonly transferOpen = signal(false);

  get controllable(): boolean {
    return ['connected', 'hold'].includes(this.call.status);
  }

  /** A talking call cannot be hung up from the card: the outcome popup's "End call & save" ends it, so no call closes without its outcome.
   *  While it is still dialling / ringing, hang-up just cancels the attempt. */
  get endLocked(): boolean {
    return this.controllable;
  }

  /** Initials of the lead name for the avatar (a hash sign stands in for an unknown number). */
  initials(): string {
    const name = this.call.lead?.name?.trim();
    if (!name) return '#';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  /** Dialing / ringing: the label gets travelling dots. */
  dialing(): boolean {
    return this.call.status === 'initiated' || (this.call.status === 'ringing' && this.call.direction === 'outbound');
  }

  statusBase(): string {
    return this.call.status === 'initiated' ? 'Dialing' : 'Ringing';
  }

  statusLabel(): string {
    switch (this.call.status) {
      case 'initiated': return 'Dialing…';
      case 'ringing': return this.call.direction === 'outbound' ? 'Ringing…' : 'Incoming';
      case 'connected': return 'Connected';
      case 'hold': return 'On hold';
      default: return this.call.status;
    }
  }

  openTransfer(): void {
    this.transferOpen.update(open => !open);
    if (this.transferOpen()) this.transferOpened.emit();
  }

  pickTransfer(target: TelecallerRow): void {
    this.transferOpen.set(false);
    this.transfer.emit(target);
  }
}
