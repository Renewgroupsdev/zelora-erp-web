import { Component, computed, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApprovalGroup, ApprovalsData } from '../../../../shared/models/dashboard.model';
import { displayDate } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

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
  templateUrl: './approvals-widget.html',
  styleUrl: './approvals-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
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
