import { Component, computed, ViewEncapsulation } from '@angular/core';
import { BfColumns } from '../../../../shared/components/bf-charts/bf-columns/bf-columns';
import { FinanceData } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/**
 * Income vs expense: the 6-month trend beside the period's headline figures. Manager roles only.
 */
@Component({
  selector: 'app-finance-widget',
  standalone: true,
  imports: [DashCard, BfColumns],
  templateUrl: './finance-widget.html',
  styleUrl: './finance-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class FinanceWidget extends DashWidget<FinanceData> {
  protected readonly key = 'finance' as const;
  readonly trend = computed(() => (this.data()?.trend ?? []).map(t => ({ label: t.label, a: t.income, b: t.expense })));

  abs(change: number): string {
    return Math.abs(change).toFixed(1).replace(/\.0$/, '');
  }
}
