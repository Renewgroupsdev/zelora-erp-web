import { Component, computed, ViewEncapsulation } from '@angular/core';
import { FrontDeskData, statusTone } from '../../../../shared/models/dashboard.model';
import { initials, to12Hour } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Donut geometry (viewBox 120): ring radius, its length, and the hairline gap between wedges. */
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;
const RING_GAP = 3;
const TONE_COLORS: Record<string, string> = { green: '#1fae5b', red: '#e0344f', orange: '#f08a0a', blue: '#2f6fe5', gray: '#8393a9' };

interface Tile {
  label: string; value: string; hint: string; icon: string; tone: 'blue' | 'purple' | 'orange' | 'red';
  /** Share of the figure that is done (0 - 100), drawn as a ring around the icon; null when there is no such share. */
  ring: number | null;
}

/**
 * Walk-in desk (the front office): four figure tiles with progress rings, today's queue as a timeline under a donut of
 * its statuses, and the balances to collect at the counter as a column chart above the list.
 */
@Component({
  selector: 'app-front-desk-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './front-desk-widget.html',
  styleUrl: './front-desk-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class FrontDeskWidget extends DashWidget<FrontDeskData> {
  protected readonly key = 'front-desk' as const;

  readonly tone = statusTone;
  readonly initials = initials;
  readonly to12Hour = to12Hour;

  readonly tiles = computed<Tile[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: 'Visits today', value: String(d.appointments_today), hint: `${d.checked_in} checked in · ${d.walk_ins_today} walk-ins`, icon: 'bi-calendar2-day', tone: 'blue', ring: this.share(d.checked_in, d.appointments_today) },
      { label: 'Sittings today', value: `${d.sittings_done_today} / ${d.sittings_today}`, hint: 'Completed / scheduled', icon: 'bi-heart-pulse', tone: 'purple', ring: this.share(d.sittings_done_today, d.sittings_today) },
      { label: 'Awaiting terms', value: String(d.awaiting_terms), hint: `${d.invoiced_not_converted} invoiced, not converted`, icon: 'bi-file-earmark-check', tone: 'orange', ring: null },
      { label: 'Balances to collect', value: this.inrShort(d.pending_payments.amount), hint: `${d.pending_payments.count} treatment plans`, icon: 'bi-cash-coin', tone: 'red', ring: null },
    ];
  });

  readonly radius = RING_R;
  readonly circumference = RING_C;

  /** The queue's statuses, biggest first, each with its share of the queue and its wedge on the donut. */
  readonly mix = computed(() => {
    const rows = this.data()?.today ?? [];
    const counts = new Map<string, { label: string; count: number }>();
    for (const v of rows) {
      const key = (v.status ?? 'Unknown').toLowerCase();
      const entry = counts.get(key) ?? { label: v.status ?? 'Unknown', count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
    const sorted = [...counts.values()].sort((a, b) => b.count - a.count);
    let from = 0;
    return sorted.map(s => {
      const share = s.count / rows.length;
      const length = share * RING_C;
      const tone = statusTone(s.label);
      const slice = {
        ...s, tone, color: TONE_COLORS[tone] ?? TONE_COLORS['gray'], pct: Math.round(share * 100),
        arc: sorted.length > 1 ? Math.max(length - RING_GAP, 0.5) : length, start: from,
      };
      from += length;
      return slice;
    });
  });

  /** The balances as columns: each customer's due, scaled to the largest. */
  readonly dueCols = computed(() => {
    const items = this.data()?.pending_payments.items ?? [];
    const max = Math.max(1, ...items.map(p => p.due));
    return items.map(p => ({ id: p.id, name: p.customer.split(' ')[0], full: p.customer, due: p.due, h: Math.max(6, Math.round((p.due / max) * 100)) }));
  });

  private share(done: number, of: number): number | null {
    return of > 0 ? Math.min(100, Math.round((done / of) * 100)) : null;
  }
}
