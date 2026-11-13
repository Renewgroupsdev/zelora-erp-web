import { Component, computed, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApprovalGroup, ApprovalsData } from '../../../../shared/models/dashboard.model';
import { displayDate, initials } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

interface Queue { key: keyof ApprovalsData; label: string; icon: string; module: string; color: string; group: ApprovalGroup; share: number; }

/** Each queue with its own colour (icon tile, count, share of the summary bar). */
const QUEUES: { key: keyof ApprovalsData; label: string; icon: string; module: string; color: string }[] = [
  { key: 'leave', label: 'Leave requests', icon: 'bi-calendar2-x-fill', module: 'hr-management', color: '#2f6fe5' },
  { key: 'permission', label: 'Permissions', icon: 'bi-clock-history', module: 'hr-management', color: '#0ea5a4' },
  { key: 'discount', label: 'Discount requests', icon: 'bi-percent', module: 'appoinment', color: '#7b35e6' },
  { key: 'purchase', label: 'Purchase requests', icon: 'bi-cart-plus-fill', module: 'purchase-management', color: '#ee6a17' },
  { key: 'manpower', label: 'Manpower requests', icon: 'bi-person-plus-fill', module: 'hr-management', color: '#d6336c' },
  { key: 'appraisal', label: 'Draft appraisals', icon: 'bi-award-fill', module: 'hr-management', color: '#c08a12' },
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
  readonly initials = initials;

  private readonly all = computed<Queue[]>(() => {
    const d = this.data();
    if (!d) return [];
    const total = QUEUES.reduce((s, q) => s + (d[q.key]?.count ?? 0), 0) || 1;
    return QUEUES.map(q => ({ ...q, group: d[q.key], share: ((d[q.key]?.count ?? 0) / total) * 100 }))
      .sort((a, b) => b.group.count - a.group.count);
  });
  /** Queues with work, busiest first. */
  readonly queues = computed(() => this.all().filter(q => q.group.count > 0));
  /** Queues that are clear (shown as small chips). */
  readonly clear = computed(() => this.all().filter(q => !q.group.count));
  readonly total = computed(() => this.all().reduce((s, q) => s + q.group.count, 0));

  /** Whole days since the request date (local), null when there is no date. */
  age(date: string | null | undefined): number | null {
    if (!date) return null;
    const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86_400_000));
  }

  ageLabel(date: string | null | undefined): string {
    const n = this.age(date);
    if (n === null) return '';
    return n === 0 ? 'today' : `${n}d`;
  }
}
