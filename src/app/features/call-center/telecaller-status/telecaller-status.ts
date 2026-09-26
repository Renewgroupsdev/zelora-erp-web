import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import {
  AGENT_STATUS_LABELS,
  TelecallerRow,
  callStatusClass,
  customerNumber,
} from '../../../core/telephony/telephony.models';
import { TelephonyService } from '../../../core/telephony/telephony.service';

/** Live presence board: who is available, who is on a call, how many leads each one holds. */
@Component({
  selector: 'app-telecaller-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './telecaller-status.html',
  styleUrl: './telecaller-status.scss',
})
export class TelecallerStatus implements OnInit, OnDestroy {
  private readonly telephony = inject(TelephonyService);

  readonly statusLabels = AGENT_STATUS_LABELS;
  readonly statusClass = callStatusClass;
  readonly customerNumber = customerNumber;

  agents: TelecallerRow[] = [];
  loading = true;

  private poll?: Subscription;

  ngOnInit(): void {
    this.poll = interval(10000).pipe(
      startWith(0),
      switchMap(() => this.telephony.telecallers())
    ).subscribe({
      next: rows => {
        this.loading = false;
        this.agents = rows;
      },
      error: () => (this.loading = false),
    });
  }

  ngOnDestroy(): void {
    this.poll?.unsubscribe();
  }
}
