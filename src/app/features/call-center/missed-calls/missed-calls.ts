import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ApiDataService } from '../../../core/http/api.service';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CallAlert } from '../call-alert.model';

/** Branch-head escalations for missed / rejected / unassigned calls, with call-back. */
@Component({
  selector: 'app-missed-calls',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './missed-calls.html',
  styleUrl: './missed-calls.scss',
})
export class MissedCalls implements OnInit {
  private readonly api = inject(ApiDataService);
  readonly telephony = inject(TelephonyService);
  private readonly toast = inject(ToastService);

  alerts: CallAlert[] = [];
  loading = false;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.GET(`${ApiRoutesConstants.CALL_ALERT_LIST}?status=unread,read`).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response?.success) this.alerts = response.data?.data ?? [];
      },
      error: (error: any) => {
        this.loading = false;
        this.toast.error(error?.error?.message || 'Unable to load alerts.');
      },
    });
  }

  callBack(alert: CallAlert): void {
    const number = alert.call?.caller_number;
    if (!number) return;

    this.telephony.dial({ phone_number: number }).subscribe({
      error: (error: any) => this.toast.error(error?.error?.message || 'Outbound call failed.'),
    });
  }

  markAlertRead(alert: CallAlert): void {
    this.api.POST(`${ApiRoutesConstants.CALL_ALERT_LIST}/${alert.id}/read`, {}).subscribe({
      next: (response: any) => {
        if (response?.success) alert.status = 'read';
      },
      error: () => undefined,
    });
  }

  resolveAlert(alert: CallAlert): void {
    this.api.POST(`${ApiRoutesConstants.CALL_ALERT_LIST}/${alert.id}/resolve`, {}).subscribe({
      next: (response: any) => {
        if (response?.success) this.alerts = this.alerts.filter(x => x.id !== alert.id);
      },
      error: (error: any) => this.toast.error(error?.error?.message || 'Unable to resolve alert.'),
    });
  }
}
