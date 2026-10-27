import { Component } from '@angular/core';
import { CustomerDashData } from '../../../shared/models/dashboard.model';
import { displayDate, to12Hour } from '../../../shared/utils/format.util';
import { DashCard } from './dash-card';
import { DashKpi } from './dash-kpi';
import { DashWidget } from './dash-widget';

/** Customer portal: my treatment plans and progress, the next sittings, what I have paid and still owe, my documents. */
@Component({
  selector: 'app-customer-widget',
  standalone: true,
  imports: [DashCard, DashKpi],
  template: `
    <app-dash-card title="My Treatments" [subtitle]="data()?.customer_code ? 'Customer ID ' + data()!.customer_code : ''" icon="bi-heart" tone="red"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()"
                   [empty]="data()?.plans?.length === 0" emptyText="You have no treatment plans yet." emptyIcon="bi-heart">
      @if (data(); as c) {
        <div class="dash-kpis is-inner">
          <app-dash-kpi label="Sittings completed" icon="bi-check2-circle" tone="green" [value]="c.totals.completed + ' / ' + c.totals.sittings" />
          <app-dash-kpi label="Paid" icon="bi-cash-coin" tone="blue" [value]="inr(c.totals.paid)" [hint]="'of ' + inr(c.totals.net)" />
          <app-dash-kpi label="Balance" icon="bi-wallet2" [tone]="c.totals.balance > 0 ? 'orange' : 'green'" [value]="inr(c.totals.balance)" />
        </div>
        <div class="dash-split">
          <div>
            <h3 class="dash-sub">My plans</h3>
            <ul class="dash-bars">
              @for (p of c.plans; track p.id) {
                <li>
                  <div class="dash-bar-head"><span>{{ p.treatment }} <span class="dash-pill" [class]="p.status === 'Active' ? 'tone-blue' : 'tone-green'">{{ p.status }}</span></span><small>{{ p.completed }} of {{ p.sittings }} sittings</small></div>
                  <div class="dash-meter-bar"><span [style.width.%]="p.sittings ? (p.completed / p.sittings) * 100 : 0"></span></div>
                  @if (p.balance > 0) { <small class="dash-muted">{{ inr(p.balance) }} still to pay</small> }
                </li>
              }
            </ul>
          </div>
          <div>
            <h3 class="dash-sub">Upcoming sittings</h3>
            @if (c.upcoming.length) {
              <ul class="dash-list is-compact">
                @for (s of c.upcoming; track s.id) {
                  <li><span class="dash-time">{{ displayDate(s.date) }}</span><div class="dash-list-main"><strong>{{ s.treatment }} &middot; sitting {{ s.sitting_no }}</strong><small>{{ to12Hour(s.time) ?? '' }}@if (s.doctor) { &middot; {{ s.doctor }} }</small></div></li>
                }
              </ul>
            } @else { <p class="dash-muted">No sittings scheduled.</p> }
            @if (c.payments.length) {
              <h3 class="dash-sub">Recent payments</h3>
              <ul class="dash-list is-compact">
                @for (p of c.payments; track p.id) {
                  <li><div class="dash-list-main"><strong>{{ inr(p.amount) }}</strong><small>{{ p.mode }} &middot; {{ displayDate(p.date) }}</small></div></li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </app-dash-card>
  `,
})
export class CustomerWidget extends DashWidget<CustomerDashData> {
  protected readonly key = 'customer' as const;
  readonly displayDate = displayDate;
  readonly to12Hour = to12Hour;
}
