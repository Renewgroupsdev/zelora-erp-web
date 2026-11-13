import { Component, ViewEncapsulation } from '@angular/core';
import { StockData } from '../../../../shared/models/dashboard.model';
import { displayDate } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** How bad a low line is: nothing left, at most half the threshold, or just under it. */
export type LowLevel = 'out' | 'critical' | 'low';

/** Stock on hand, what is running low and what expires within 30 days. */
@Component({
  selector: 'app-stock-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './stock-widget.html',
  styleUrl: './stock-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class StockWidget extends DashWidget<StockData> {
  protected readonly key = 'stock' as const;
  readonly displayDate = displayDate;

  level(qty: number, threshold: number): LowLevel {
    if (qty <= 0) return 'out';
    return qty <= Math.max(1, threshold / 2) ? 'critical' : 'low';
  }

  levelLabel(level: LowLevel): string {
    return { out: 'Out of stock', critical: 'Critical', low: 'Low' }[level];
  }

  /** Fill of the gauge: the quantity against the low-stock threshold (at least a sliver so 1 unit still shows). */
  fill(qty: number, threshold: number): number {
    if (qty <= 0) return 0;
    return Math.max(6, Math.min(100, Math.round((qty / Math.max(1, threshold)) * 100)));
  }

  isCentral(store: string): boolean {
    return /central/i.test(store ?? '');
  }

  /** Whole days from today (local) to the expiry date; negative = already expired. */
  daysLeft(expiry: string | null | undefined): number | null {
    if (!expiry) return null;
    const d = new Date(`${String(expiry).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86_400_000);
  }

  countdown(expiry: string | null | undefined, expired: boolean): string {
    const n = this.daysLeft(expiry);
    if (n === null) return expired ? 'Expired' : '';
    if (n < 0 || expired) return n < 0 ? `Expired ${-n} day${n === -1 ? '' : 's'} ago` : 'Expired';
    if (n === 0) return 'Expires today';
    return `in ${n} day${n === 1 ? '' : 's'}`;
  }

  /** Date tile parts: day of month and short month. */
  dayOf(expiry: string | null | undefined): string {
    const d = expiry ? new Date(`${String(expiry).slice(0, 10)}T00:00:00`) : null;
    return d && !Number.isNaN(d.getTime()) ? String(d.getDate()) : '--';
  }

  monthOf(expiry: string | null | undefined): string {
    const d = expiry ? new Date(`${String(expiry).slice(0, 10)}T00:00:00`) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { month: 'short' }) : '';
  }
}
