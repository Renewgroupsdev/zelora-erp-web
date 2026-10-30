import { Component, computed, ViewEncapsulation } from '@angular/core';
import { Kpi, KpisData } from '../../../../shared/models/dashboard.model';
import { DashWidget } from '../dash-widget';

interface KpiCard {
  label: string; icon: string; tone: 'green' | 'blue' | 'purple' | 'orange' | 'teal' | 'indigo';
  value: string; kpi: Kpi; previous: string | null; hint: string;
}

/**
 * Headline numbers of the business (or the unit, for a branch / franchise login) for the chosen period: one card per
 * figure with its change and, as the card's chart, this period drawn against the previous one.
 */
@Component({
  selector: 'app-kpi-strip',
  standalone: true,
  templateUrl: './kpi-strip.html',
  styleUrl: './kpi-strip.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class KpiStrip extends DashWidget<KpisData> {
  protected readonly key = 'kpis' as const;

  readonly cards = computed<KpiCard[]>(() => {
    const k = this.data();
    if (!k) return [];
    const money = (v: number) => this.inrShort(v);
    const count = (v: number) => v.toLocaleString('en-IN');
    const prev = (kpi: Kpi, fmt: (v: number) => string) => (kpi.previous === null ? null : fmt(kpi.previous));
    return [
      { label: 'Total collections', icon: 'bi-cash-stack', tone: 'green', value: money(k.collections.value), kpi: k.collections, previous: prev(k.collections, money), hint: 'Payments and consultation fees' },
      { label: 'Sales billed', icon: 'bi-receipt', tone: 'blue', value: money(k.sales.value), kpi: k.sales, previous: prev(k.sales, money), hint: 'Treatment plans started' },
      { label: 'New leads', icon: 'bi-person-plus-fill', tone: 'purple', value: count(k.new_leads.value), kpi: k.new_leads, previous: prev(k.new_leads, count), hint: k.conversion_rate.value + '% converted' },
      { label: 'Appointments', icon: 'bi-calendar2-check-fill', tone: 'orange', value: count(k.appointments.value), kpi: k.appointments, previous: prev(k.appointments, count), hint: k.appointments_today.value + ' scheduled today' },
      { label: 'New customers', icon: 'bi-person-heart', tone: 'teal', value: count(k.new_customers.value), kpi: k.new_customers, previous: prev(k.new_customers, count), hint: k.active_customers.value + ' with an active treatment' },
      { label: 'Stock value', icon: 'bi-box-seam-fill', tone: 'indigo', value: money(k.stock_value.value), kpi: k.stock_value, previous: prev(k.stock_value, money), hint: 'At purchase price, on hand' },
    ];
  });

  share(v: number, kpi: Kpi): number {
    const max = Math.max(kpi.value, kpi.previous ?? 0, 1);
    return Math.max(2, (v / max) * 100);
  }

  abs(change: number): string {
    return Math.abs(change).toFixed(1).replace(/\.0$/, '');
  }
}
