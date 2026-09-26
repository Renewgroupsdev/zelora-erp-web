import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { CallLog, CallReportSummary, callStatusClass, customerNumber, formatCallDuration } from '../../../core/telephony/telephony.models';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { isTelecallerRole } from '../../../core/auth/auth.model';
import { CommonDetailCard } from '../../../shared/components/common-detail-card/common-detail-card';
import { DetailCardIconVariant } from '../../../shared/models/common-components.model';
import { CallAlert } from '../call-alert.model';
import { CallDetails } from '../call-details/call-details';
import { openCallOutcome } from '../call-disposition/open-call-outcome';

interface DashboardStat {
  label: string;
  value: string | number;
  trendText?: string;
  icon: string;
  iconVariant: DetailCardIconVariant;
}

/** Call-center landing page: 30-day totals, the latest calls and open branch alerts.
 *  Plain telecallers only see their own call activity - branch-wide alerts are a
 *  branch head / supervisor view, gated via isBranchHeadView(). */
@Component({
  selector: 'app-call-center-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, CallDetails, CommonDetailCard],
  templateUrl: './call-center-dashboard.html',
  styleUrl: './call-center-dashboard.scss',
})
export class CallCenterDashboard implements OnInit, OnDestroy {
  private readonly api = inject(ApiDataService);
  private readonly telephony = inject(TelephonyService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly statusClass = callStatusClass;
  readonly customerNumber = customerNumber;
  readonly formatDuration = formatCallDuration;
  readonly isBranchHeadView = computed(() => !isTelecallerRole(this.auth.currentUser()));

  calls: CallLog[] = [];
  alerts: CallAlert[] = [];
  report: CallReportSummary | null = null;
  selectedCall: CallLog | null = null;

  private subs = new Subscription();

  get stats(): DashboardStat[] {
    const r = this.report;
    const stats: DashboardStat[] = [
      { label: 'Total Calls', value: r?.total_calls ?? 0, trendText: 'Last 30 days', icon: 'bi bi-telephone', iconVariant: 'primary' },
      { label: 'Inbound', value: r?.inbound ?? 0, trendText: 'Customer calls', icon: 'bi bi-arrow-down-left', iconVariant: 'blue' },
      { label: 'Outbound', value: r?.outbound ?? 0, trendText: 'Telecaller calls', icon: 'bi bi-arrow-up-right', iconVariant: 'purple' },
      { label: 'Answered', value: r?.answered ?? 0, trendText: `${r?.answer_rate ?? 0}% answer rate`, icon: 'bi bi-check-circle', iconVariant: 'green' },
      { label: 'Missed', value: r?.missed ?? 0, trendText: 'Needs attention', icon: 'bi bi-telephone-x', iconVariant: 'orange' },
      { label: 'Appointments', value: r?.appointments ?? 0, trendText: `${r?.conversions ?? 0} converted · ${r?.follow_ups ?? 0} follow-ups`, icon: 'bi bi-calendar-check', iconVariant: 'green' },
      { label: 'Avg Talk Time', value: this.formatDuration(r?.avg_talk_seconds), trendText: 'Per answered call', icon: 'bi bi-clock-history', iconVariant: 'blue' },
    ];

    if (this.isBranchHeadView()) {
      stats.push({ label: 'Open Alerts', value: this.alerts.length, trendText: 'Branch head', icon: 'bi bi-exclamation-circle', iconVariant: 'orange' });
    }

    return stats;
  }


  ngOnInit(): void {
    this.load(true);
    // This is the monitoring screen, so it refreshes on its own until Reverb/WebSocket lands.
    this.subs.add(interval(10000).subscribe(() => this.load(false)));
    this.subs.add(this.telephony.outcomeSaved$.subscribe(() => this.load(false)));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(reportErrors: boolean): void {
    this.api.GET(`${ApiRoutesConstants.CALL_LIST}?per_page=10`).subscribe({
      next: (response: any) => {
        if (response?.success) this.calls = response.data?.data ?? [];
      },
      error: (error: any) => {
        if (reportErrors) this.toast.error(error?.error?.message || 'Unable to load call data.');
      },
    });

    this.api.GET(ApiRoutesConstants.CALL_REPORTS).subscribe({
      next: (response: any) => (this.report = response?.data ?? null),
      error: () => undefined,
    });

    if (!this.isBranchHeadView()) return;

    this.api.GET(`${ApiRoutesConstants.CALL_ALERT_LIST}?status=unread`).subscribe({
      next: (response: any) => {
        if (response?.success) this.alerts = response.data?.data ?? [];
      },
      error: () => undefined,
    });
  }

  openCall(call: CallLog): void {
    this.selectedCall = call;
  }

  logOutcome(call: CallLog): void {
    this.selectedCall = null;
    openCallOutcome(this.dialog, call);
  }

  markAlertRead(alert: CallAlert): void {
    this.api.POST(`${ApiRoutesConstants.CALL_ALERT_LIST}/${alert.id}/read`, {}).subscribe({
      next: (response: any) => {
        if (response?.success) this.alerts = this.alerts.filter(x => x.id !== alert.id);
      },
      error: () => undefined,
    });
  }
}
