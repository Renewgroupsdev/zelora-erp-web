import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { ToastService } from '../../../shared/common-services/toast.service';

/** Manual click-to-call box for a number that isn't on a lead row yet. */
@Component({
  selector: 'app-dialer',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './dialer.html',
  styleUrl: './dialer.scss',
})
export class Dialer {
  private readonly telephony = inject(TelephonyService);
  private readonly toast = inject(ToastService);

  @Output() called = new EventEmitter<void>();

  readonly onCall = this.telephony.onCall;
  phoneNumber = '';

  dial(number = this.phoneNumber.trim()): void {
    if (!number) {
      this.toast.error('Enter a phone number.');
      return;
    }

    this.telephony.dial({ phone_number: number }).subscribe({
      next: () => {
        this.phoneNumber = '';
        this.called.emit();
      },
      error: (error: any) => this.toast.error(error?.error?.message || 'Outbound call failed.'),
    });
  }
}
