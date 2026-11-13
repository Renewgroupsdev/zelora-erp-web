import { Component, computed, signal, ViewEncapsulation } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FrontDeskData, statusTone } from '../../../../shared/models/dashboard.model';
import { initials, to12Hour } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Donut geometry (viewBox 120): ring radius, its length, and the hairline gap between wedges. */
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;
const RING_GAP = 3;
const TONE_COLORS: Record<string, string> = { green: '#1fae5b', red: '#e0344f', orange: '#f08a0a', blue: '#2f6fe5', gray: '#8393a9' };

/** One colour per balance (largest first): the share bar's segment and that customer's row use the same one. */
const DUE_COLORS = ['#e0344f', '#f0643c', '#f59e0b', '#d946ef', '#8b5cf6', '#0ea5e9', '#14b8a6', '#64748b'];

type WalkFilter ='all' | 'new' | 'regular' | 'converted' | 'pending';

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
  imports: [DashCard, RouterLink],
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

  /** The balances as a ranked list: each customer's due with its share of the total (drawn as a bar behind the row). */
  readonly dueRows = computed(() => {
    const items = [...(this.data()?.pending_payments.items ?? [])].sort((a, b) => b.due - a.due);
    const total = items.reduce((s, p) => s + p.due, 0) || 1;
    const max = Math.max(1, ...items.map(p => p.due));
    return items.map((p, i) => ({
      ...p, rank: i + 1,
      share: (p.due / total) * 100,
      pct: Math.round((p.due / total) * 100),
      bar: Math.max(4, Math.round((p.due / max) * 100)),
      color: DUE_COLORS[i % DUE_COLORS.length],
    }));
  });

  /** Headline of the balances: total, how many plans, the average and the largest one's share. */
  readonly dueSummary = computed(() => {
    const rows = this.dueRows();
    const total = rows.reduce((s, r) => s + r.due, 0);
    return { total, count: rows.length, average: rows.length ? total / rows.length : 0, topPct: rows[0]?.pct ?? 0, top: rows[0] ?? null };
  });

  /** Walk-in list filter chips (counts follow today's walk-ins). */
  readonly walkFilter = signal<WalkFilter>('all');
  readonly walkChips = computed(() => {
    const w = this.data()?.walk_in;
    if (!w) return [];
    const items = w.items;
    return [
      { key: 'all' as const, label: 'All', count: items.length },
      { key: 'new' as const, label: 'New', count: items.filter(i => !i.is_regular).length },
      { key: 'regular' as const, label: 'Regular', count: items.filter(i => i.is_regular).length },
      { key: 'converted' as const, label: 'Converted', count: items.filter(i => i.converted).length },
      { key: 'pending' as const, label: 'Not converted', count: items.filter(i => !i.converted).length },
    ];
  });
  readonly walkRows = computed(() => {
    const items = this.data()?.walk_in?.items ?? [];
    switch (this.walkFilter()) {
      case 'new': return items.filter(i => !i.is_regular);
      case 'regular': return items.filter(i => i.is_regular);
      case 'converted': return items.filter(i => i.converted);
      case 'pending': return items.filter(i => !i.converted);
      default: return items;
    }
  });
  /** New vs regular as shares of today's walk-ins, for the split bar. */
  readonly walkSplit = computed(() => {
    const w = this.data()?.walk_in;
    const total = (w?.new ?? 0) + (w?.regular ?? 0);
    return { newPct: total ? Math.round(((w?.new ?? 0) / total) * 100) : 0, regularPct: total ? 100 - Math.round(((w?.new ?? 0) / total) * 100) : 0 };
  });

  setWalkFilter(f: WalkFilter): void { this.walkFilter.set(f); }

  private share(done: number, of: number): number | null {
    return of > 0 ? Math.min(100, Math.round((done / of) * 100)) : null;
  }
}
