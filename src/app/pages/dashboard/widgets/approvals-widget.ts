import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApprovalGroup, ApprovalsData } from '../../../shared/models/dashboard.model';
import { displayDate } from '../../../shared/utils/format.util';
import { DashCard } from './dash-card';
import { DashWidget } from './dash-widget';

interface Queue { key: keyof ApprovalsData; label: string; icon: string; module: string; group: ApprovalGroup; }

const QUEUES: { key: keyof ApprovalsData; label: string; icon: string; module: string }[] = [
  { key: 'leave', label: 'Leave requests', icon: 'bi-calendar2-x', module: 'hr-management' },
  { key: 'permission', label: 'Permissions', icon: 'bi-clock-history', module: 'hr-management' },
  { key: 'discount', label: 'Discount requests', icon: 'bi-percent', module: 'appoinment' },
  { key: 'purchase', label: 'Purchase requests', icon: 'bi-cart-plus', module: 'purchase-management' },
  { key: 'manpower', label: 'Manpower requests', icon: 'bi-person-plus', module: 'hr-management' },
  { key: 'appraisal', label: 'Draft appraisals', icon: 'bi-award', module: 'hr-management' },
];

/** Everything waiting for a manager's decision, with the latest items of each queue. */
@Component({
  selector: 'app-approvals-widget',
  standalone: true,
  imports: [DashCard, RouterLink],
  template: `
    <app-dash-card title="Pending Approvals" [subtitle]="total() ? total() + ' waiting for a decision' : 'All caught up'" icon="bi-patch-check" tone="red"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()">
      @if (total() === 0) {
        <div class="dash-ok"><i class="bi bi-check2-all" aria-hidden="true"></i> Nothing is waiting for you right now.</div>
      }
      <ul class="dash-queues">
        @for (q of queues(); track q.key) {
          <li [class.is-empty]="!q.group.count">
            <div class="dash-queue-head">
              <span class="dash-queue-icon"><i class="bi" [class]="q.icon" aria-hidden="true"></i></span>
              <span class="dash-queue-label">{{ q.label }}</span>
              <span class="dash-count" [class.is-zero]="!q.group.count">{{ q.group.count }}</span>
              @if (q.group.count && canOpen(q.module)) {
                <a class="dash-link" [routerLink]="q.group.link" [attr.aria-label]="'Review ' + q.label">Review <i class="bi bi-arrow-right" aria-hidden="true"></i></a>
              }
            </div>
            @if (q.group.items.length) {
              <ul class="dash-queue-items">
                @for (i of q.group.items.slice(0, 3); track i.id) {
                  <li><strong>{{ i.title }}</strong><small>{{ i.subtitle }}</small><time>{{ displayDate(i.date) }}</time></li>
                }
              </ul>
            }
          </li>
        }
      </ul>
    </app-dash-card>
  `,
})
export class ApprovalsWidget extends DashWidget<ApprovalsData> {
  protected readonly key = 'approvals' as const;
  readonly displayDate = displayDate;

  readonly queues = computed<Queue[]>(() => {
    const d = this.data();
    if (!d) return [];
    // Queues with work first; empty ones stay listed so the manager sees they are clear.
    return QUEUES.map(q => ({ ...q, group: d[q.key] })).sort((a, b) => b.group.count - a.group.count);
  });
  readonly total = computed(() => this.queues().reduce((s, q) => s + q.group.count, 0));
}
