import { Component, computed } from '@angular/core';
import { MyWorkData, statusTone } from '../../../shared/models/dashboard.model';
import { displayDate, displayTime, monthLabel } from '../../../shared/utils/format.util';
import { DashCard } from './dash-card';
import { DashKpi } from './dash-kpi';
import { DashWidget } from './dash-widget';

/**
 * The signed-in employee's own work: tasks and progress, attendance this month, leave balance, latest payslip and
 * appraisal. Only this employee's records - never anyone else's salary or the company's figures.
 */
@Component({
  selector: 'app-my-work-widget',
  standalone: true,
  imports: [DashCard, DashKpi],
  template: `
    <app-dash-card title="My Work" [subtitle]="subtitle()" icon="bi-person-badge" tone="green"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()"
                   [empty]="data()?.has_employee === false" emptyIcon="bi-person-x"
                   emptyText="Your login is not linked to an employee record yet, so there is no attendance, leave or payslip to show. Ask HR to link it.">
      @if (data(); as w) {
        @if (w.has_employee) {
          <div class="dash-kpis is-inner">
            <app-dash-kpi label="Task completion" icon="bi-list-check" tone="green" [value]="(w.tasks?.completion ?? 0) + '%'"
                          [hint]="(w.tasks?.total ?? 0) + ' tasks · ' + (w.tasks?.overdue ?? 0) + ' overdue'" />
            <app-dash-kpi label="Days present" icon="bi-fingerprint" tone="blue" [value]="'' + (w.attendance?.present_days ?? 0)"
                          [hint]="(w.attendance?.late_days ?? 0) + ' late · ' + (w.attendance?.hours ?? 0) + ' h this month'" />
            <app-dash-kpi label="Leave left" icon="bi-calendar2-heart" tone="purple" [value]="'' + leaveLeft()" [hint]="(w.leave?.pending ?? 0) + ' request(s) pending'" />
            <app-dash-kpi label="Last payslip" icon="bi-wallet2" tone="primary" [value]="w.payslip ? inr(w.payslip.net) : '--'"
                          [hint]="w.payslip ? monthLabel(w.payslip.month) + ' · ' + w.payslip.status : 'No payslip yet'" />
          </div>

          <div class="dash-split is-three">
            <div>
              <h3 class="dash-sub">Today</h3>
              @if (w.attendance?.today; as t) {
                <ul class="dash-facts">
                  <li><span>Status</span><span class="dash-pill" [class]="'tone-' + tone(t.status)">{{ t.status }}</span></li>
                  <li><span>Check in</span><strong>{{ t.check_in ? displayTime(t.check_in) : '--' }}</strong></li>
                  <li><span>Check out</span><strong>{{ t.check_out ? displayTime(t.check_out) : 'Not yet' }}</strong></li>
                  <li><span>Breaks</span><strong>{{ t.break_minutes }} min</strong></li>
                </ul>
              } @else {
                <p class="dash-muted">You have not checked in today.</p>
              }
              @if (w.appraisal; as a) {
                <h3 class="dash-sub">Appraisal</h3>
                <ul class="dash-facts">
                  <li><span>{{ a.cycle }}</span><span class="dash-pill" [class]="'tone-' + tone(a.status)">{{ a.status }}</span></li>
                  <li><span>Rating</span><strong class="dash-stars" [attr.aria-label]="a.rating + ' of 5'">{{ stars(a.rating) }}</strong></li>
                  <li><span>KPI score</span><strong>{{ a.kpi_score }}</strong></li>
                  @if (a.increment_percent) { <li><span>Increment</span><strong class="txt-green">{{ a.increment_percent }}%</strong></li> }
                </ul>
              }
            </div>
            <div>
              <h3 class="dash-sub">My open tasks</h3>
              @if (w.tasks?.open?.length) {
                <ul class="dash-list is-compact">
                  @for (t of w.tasks!.open; track t.id) {
                    <li>
                      <div class="dash-list-main"><strong>{{ t.title }}</strong><small>{{ t.type }}@if (t.due) { &middot; due {{ displayDate(t.due) }} }</small></div>
                      <span class="dash-pill" [class]="'tone-' + (t.overdue ? 'red' : tone(t.status))">{{ t.overdue ? 'Overdue' : t.status }}</span>
                    </li>
                  }
                </ul>
              } @else { <div class="dash-ok"><i class="bi bi-check2-all" aria-hidden="true"></i> No open tasks.</div> }
            </div>
            <div>
              <h3 class="dash-sub">Leave balance {{ year }}</h3>
              <ul class="dash-bars">
                @for (b of w.leave?.balance ?? []; track b.type) {
                  <li>
                    <div class="dash-bar-head"><span>{{ b.type }}</span><small>{{ b.left }} of {{ b.quota }} left</small></div>
                    <div class="dash-meter-bar"><span [style.width.%]="b.quota ? (b.used / b.quota) * 100 : 0"></span></div>
                  </li>
                }
              </ul>
              @if (w.leave?.recent?.length) {
                <h3 class="dash-sub">Recent requests</h3>
                <ul class="dash-list is-compact">
                  @for (r of w.leave!.recent; track r.request_no) {
                    <li>
                      <div class="dash-list-main"><strong>{{ r.kind === 'Leave' ? r.leave_type : 'Permission' }}</strong><small>{{ displayDate(r.from_date) }}@if (r.to_date !== r.from_date) { - {{ displayDate(r.to_date) }} }</small></div>
                      <span class="dash-pill" [class]="'tone-' + tone(r.status)">{{ r.status }}</span>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        }
      }
    </app-dash-card>
  `,
})
export class MyWorkWidget extends DashWidget<MyWorkData> {
  protected readonly key = 'my-work' as const;
  readonly tone = statusTone;
  readonly displayDate = displayDate;
  readonly displayTime = displayTime;
  readonly monthLabel = monthLabel;
  readonly year = new Date().getFullYear();

  readonly subtitle = computed(() => {
    const e = this.data()?.employee;
    return e ? `${e.designation} · ${e.department} · ${e.emp_code}` : 'Your tasks, attendance, leave and payslip';
  });
  readonly leaveLeft = computed(() => (this.data()?.leave?.balance ?? []).reduce((s, b) => s + b.left, 0));

  stars(rating: number): string {
    const r = Math.max(0, Math.min(5, Math.round(rating)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }
}
