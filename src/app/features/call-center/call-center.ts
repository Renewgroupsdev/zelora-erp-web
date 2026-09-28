import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import { TelephonyService } from '../../core/telephony/telephony.service';
import { ApiDataService } from '../../core/http/api.service';
import { ApiRoutesConstants } from '../../shared/common-services/api-route-constants';
import { AuthService } from '../../core/auth/auth.service';
import { isTelecallerRole } from '../../core/auth/auth.model';
import { Dialer } from './dialer/dialer';

@Component({
  selector: 'app-call-center',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive ],
  templateUrl: './call-center.html',
  styleUrl: './call-center.scss',
})
export class CallCenter implements OnInit, OnDestroy {
  private readonly api = inject(ApiDataService);
  private readonly telephony = inject(TelephonyService);
  private readonly auth = inject(AuthService);

  readonly unreadAlerts = signal(0);
  readonly isBranchHeadView = computed(() => !isTelecallerRole(this.auth.currentUser()));
  private subs = new Subscription();

  ngOnInit(): void {
    if (!this.isBranchHeadView()) return;

    this.subs.add(
      interval(30000).pipe(
        startWith(0),
        switchMap(() => this.api.GET(`${ApiRoutesConstants.CALL_ALERT_LIST}?status=unread`))
      ).subscribe({
        next: (response: any) => this.unreadAlerts.set(Number(response?.unread ?? response?.data?.data?.length ?? 0)),
        error: () => undefined,
      })
    );

    this.subs.add(this.telephony.outcomeSaved$.subscribe(() => this.refreshAlertCount()));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  refreshAlertCount(): void {
    this.api.GET(`${ApiRoutesConstants.CALL_ALERT_LIST}?status=unread`).subscribe({
      next: (response: any) => this.unreadAlerts.set(Number(response?.unread ?? response?.data?.data?.length ?? 0)),
      error: () => undefined,
    });
  }
}
