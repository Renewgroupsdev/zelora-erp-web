import { Component, computed } from '@angular/core';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { BfDonut } from '../../../shared/components/bf-charts/bf-donut/bf-donut';
import { FinanceData } from '../../../shared/models/dashboard.model';
import { DashCard } from './dash-card';
import { DashWidget } from './dash-widget';

/** Income vs expense for the period, the 6-month trend and where the money comes from / goes. Manager roles only. */
@Component({
  selector: 'app-finance-widget',
  standalone: true,
  imports: [DashCard, BfColumns, BfDonut],
  template: `
    <app-dash-card title="Income & Expense" subtitle="Collections against purchases and payroll" icon="bi-cash-stack" tone="green"
                   [link]="canOpen('accounts-management') ? '/app/accounts/day-book' : null" linkLabel="Accounts"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()">
      @if (data(); as f) {
        <div class="dash-figures">
          <div><span>Income</span><strong class="txt-green">{{ inrShort(f.income.value) }}</strong>@if (f.income.change !== null) {<small [class]="f.income.change >= 0 ? 'txt-green' : 'txt-red'">{{ f.income.change > 0 ? '+' : '' }}{{ f.income.change }}%</small>}</div>
          <div><span>Expense</span><strong class="txt-red">{{ inrShort(f.expense.value) }}</strong>@if (f.expense.change !== null) {<small [class]="f.expense.change <= 0 ? 'txt-green' : 'txt-red'">{{ f.expense.change > 0 ? '+' : '' }}{{ f.expense.change }}%</small>}</div>
          <div><span>Net</span><strong [class]="f.net.value >= 0 ? 'txt-green' : 'txt-red'">{{ inrShort(f.net.value) }}</strong><small>{{ f.margin }}% margin</small></div>
          <div><span>To collect</span><strong>{{ inrShort(f.outstanding) }}</strong><small>Open plan balances</small></div>
        </div>
        <div class="dash-split">
          <div class="dash-chart">
            <h3>Last 6 months</h3>
            <app-bf-columns [data]="trend()" aName="Income" bName="Expense" [money]="true" emptyText="No income or expense recorded yet" />
          </div>
          <div class="dash-donuts">
            <div><h3>Income</h3><app-bf-donut [data]="f.income_split" [money]="true" centerLabel="Income" emptyText="No income yet" /></div>
            <div><h3>Expense</h3><app-bf-donut [data]="f.expense_split" [money]="true" centerLabel="Expense" emptyText="No expense yet" /></div>
          </div>
        </div>
      }
    </app-dash-card>
  `,
})
export class FinanceWidget extends DashWidget<FinanceData> {
  protected readonly key = 'finance' as const;
  readonly trend = computed(() => (this.data()?.trend ?? []).map(t => ({ label: t.label, a: t.income, b: t.expense })));
}
