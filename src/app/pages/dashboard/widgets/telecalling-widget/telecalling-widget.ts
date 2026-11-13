import { DecimalPipe } from '@angular/common';
import { Component, computed, ViewEncapsulation } from '@angular/core';
import { TelecallingData, duration, statusTone } from '../../../../shared/models/dashboard.model';
import { initials } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Colour of each agent state in the live-team bar and its legend. */
const AGENT_COLORS: Record<string, string> = {
  available: '#1fae5b', 'on call': '#2f6fe5', ringing: '#7b35e6', break: '#f08a0a', 'wrap up': '#8393a9', offline: '#e0344f',
};
/** One colour per active day in the half donut (and its day chip). */
const DAY_COLORS = ['#7b35e6', '#2f6fe5', '#0ea5e9', '#14b8a6', '#1fae5b', '#f59e0b', '#f0643c', '#e0344f', '#d946ef', '#64748b'];

/** Order of the states in the bar: working first, then away. */
const AGENT_ORDER = ['on call', 'ringing', 'available', 'wrap up', 'break', 'offline'];

/** Call center for the period: volume, answer rate, agents online now and the telecaller leaderboard. */
@Component({
  selector: 'app-telecalling-widget',
  standalone: true,
  imports: [DashCard, DecimalPipe],
  templateUrl: './telecalling-widget.html',
  styleUrl: './telecalling-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class TelecallingWidget extends DashWidget<TelecallingData> {
  protected readonly key = 'telecalling' as const;
  readonly duration = duration;
  readonly tone = statusTone;
  readonly initials = initials;

  /** Agents right now, by state (working states first), each with its colour and share of the team. */
  readonly agents = computed(() => {
    const list = Object.entries(this.data()?.agents ?? {})
      .map(([status, count]) => ({ status: status.replace(/_/g, ' ').toLowerCase(), count: Number(count) || 0 }))
      .filter(a => a.count > 0);
    const total = list.reduce((s, a) => s + a.count, 0) || 1;
    const rank = (s: string) => { const i = AGENT_ORDER.indexOf(s); return i < 0 ? 99 : i; };
    return list
      .sort((a, b) => rank(a.status) - rank(b.status))
      .map(a => ({ ...a, color: AGENT_COLORS[a.status] ?? '#64748b', share: (a.count / total) * 100 }));
  });
  readonly agentTotal = computed(() => this.agents().reduce((s, a) => s + a.count, 0));
  readonly agentsWorking = computed(() => this.agents().filter(a => a.status !== 'offline').reduce((s, a) => s + a.count, 0));

  /** Telecallers, best first (answered, then calls), with their own answer rate. */
  readonly board = computed(() =>
    [...(this.data()?.leaderboard ?? [])]
      .sort((a, b) => b.answered - a.answered || b.calls - a.calls)
      .map((r, i) => ({ ...r, rank: i + 1, rate: r.calls ? Math.round((r.answered / r.calls) * 100) : 0 })));

  /**
   * Call volume per day: each day is one capsule - its height is the calls (against the busiest day), the green part
   * the answered calls, the rest the missed ones. Only every few labels are printed when the period is long.
   */
  readonly volume = computed(() => {
    const trend = this.data()?.trend ?? [];
    const max = Math.max(1, ...trend.map(d => d.a));
    const peak = trend.reduce((best, d, i) => (d.a > (trend[best]?.a ?? -1) ? i : best), -1);
    const step = Math.max(1, Math.ceil(trend.length / 8));
    const days = trend.map((d, i) => {
      const calls = Math.max(0, d.a);
      const answered = Math.min(calls, Math.max(0, d.b));
      return {
        label: d.label, calls, answered, missed: calls - answered,
        h: calls ? Math.max(8, Math.round((calls / max) * 100)) : 0,
        ans: calls ? Math.round((answered / calls) * 100) : 0,
        peak: i === peak && calls > 0,
        showLabel: i % step === 0 || i === trend.length - 1,
      };
    });
    const totals = days.reduce((s, d) => ({ calls: s.calls + d.calls, answered: s.answered + d.answered }), { calls: 0, answered: 0 });
    const active = days.filter(d => d.calls > 0).length;
    return { days, max, ...totals, missed: totals.calls - totals.answered, active, peakDay: peak >= 0 ? days[peak] : null };
  });

  /**
   * Half donut: the outer ring splits the period's calls by day (one coloured segment per day with calls, a small gap
   * between them), the inner ring is answered vs missed. Arcs are drawn on a path with pathLength 100.
   */
  readonly halfDonut = computed(() => {
    const v = this.volume();
    const active = v.days.filter(d => d.calls > 0);
    const total = active.reduce((s, d) => s + d.calls, 0);
    const gap = active.length > 1 ? 0.8 : 0;
    const usable = 100 - gap * (active.length - 1 || 0);
    let at = 0;
    const segments = active.map((d, i) => {
      const len = total ? (d.calls / total) * usable : 0;
      const seg = { ...d, color: DAY_COLORS[i % DAY_COLORS.length], start: at, len, share: total ? Math.round((d.calls / total) * 100) : 0 };
      at += len + gap;
      return seg;
    });
    const answeredPct = v.calls ? (v.answered / v.calls) * 100 : 0;
    return { segments, total, answeredPct, missedPct: 100 - answeredPct };
  });

  /** Answer-rate gauge colour: green at 70%+, amber at 40%+, red below. */
  rateTone(rate: number): string {
    return rate >= 70 ? 'green' : rate >= 40 ? 'orange' : 'red';
  }
}
