import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CallLog, CallerProfile, TelecallerRow, customerNumber, formatCallDuration } from '../../../core/telephony/telephony.models';

/** The live call bar: timer, hold, transfer, note and hang up for the call in progress. */
@Component({
  selector: 'app-active-call',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  @Output() note = new EventEmitter<string>();

  readonly customerNumber = customerNumber;
  readonly formatDuration = formatCallDuration;

  readonly minimized = signal(false);
  readonly transferOpen = signal(false);
  readonly notesOpen = signal(false);
  noteText = '';

  get controllable(): boolean {
    return ['connected', 'hold'].includes(this.call.status);
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
    this.notesOpen.set(false);
    this.transferOpen.update(open => !open);
    if (this.transferOpen()) this.transferOpened.emit();
  }

  pickTransfer(target: TelecallerRow): void {
    this.transferOpen.set(false);
    this.transfer.emit(target);
  }

  toggleNotes(): void {
    this.transferOpen.set(false);
    this.notesOpen.update(open => !open);
  }

  saveNote(): void {
    const text = this.noteText.trim();
    if (!text) return;
    this.note.emit(text);
    this.noteText = '';
    this.notesOpen.set(false);
  }
}
