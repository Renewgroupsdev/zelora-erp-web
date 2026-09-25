import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { ApiDataService } from '../../../core/http/api.service';
import { CallLog, callStatusClass, customerNumber, formatCallDuration } from '../../../core/telephony/telephony.models';
import { TelephonyService } from '../../../core/telephony/telephony.service';
import { ApiRoutesConstants } from '../../../shared/common-services/api-route-constants';
import { ToastService } from '../../../shared/common-services/toast.service';
import { CallDetails } from '../call-details/call-details';
import { openCallOutcome } from '../call-disposition/open-call-outcome';

/** Full persisted call log - every inbound and outbound leg with its outcome. */
@Component({
  selector: 'app-call-history',
  standalone: true,
  imports: [CommonModule, CallDetails],
  templateUrl: './call-history.html',
  styleUrl: './call-history.scss',
})
export class CallHistory implements OnInit, OnDestroy {
  private readonly api = inject(ApiDataService);
  private readonly telephony = inject(TelephonyService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);

  readonly statusClass = callStatusClass;
  readonly customerNumber = customerNumber;
  readonly formatDuration = formatCallDuration;

  calls: CallLog[] = [];
  loading = false;
  selectedCall: CallLog | null = null;

  private subs = new Subscription();

  ngOnInit(): void {
    this.load();
    this.subs.add(this.telephony.outcomeSaved$.subscribe(() => this.load()));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.api.GET(`${ApiRoutesConstants.CALL_LIST}?per_page=50`).subscribe({
      next: (response: any) => {
        this.loading = false;
        if (response?.success) this.calls = response.data?.data ?? [];
      },
      error: (error: any) => {
        this.loading = false;
        this.toast.error(error?.error?.message || 'Unable to load call history.');
      },
    });
  }

  openCall(call: CallLog): void {
    this.selectedCall = call;
  }

  logOutcome(call: CallLog): void {
    this.selectedCall = null;
    openCallOutcome(this.dialog, call);
  }
}
