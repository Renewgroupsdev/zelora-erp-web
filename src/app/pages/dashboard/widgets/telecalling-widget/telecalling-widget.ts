import { Component, computed, ViewEncapsulation } from '@angular/core';
import { BfColumns } from '../../../../shared/components/bf-charts/bf-columns/bf-columns';
import { TelecallingData, duration, statusTone } from '../../../../shared/models/dashboard.model';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** Call center for the period: volume, answer rate, agents online now and the telecaller leaderboard. */
@Component({
  selector: 'app-telecalling-widget',
  standalone: true,
  imports: [DashCard, BfColumns],
  templateUrl: './telecalling-widget.html',
  styleUrl: './telecalling-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class TelecallingWidget extends DashWidget<TelecallingData> {
  protected readonly key = 'telecalling' as const;
  readonly duration = duration;
  readonly tone = statusTone;
  readonly agents = computed(() => Object.entries(this.data()?.agents ?? {}).map(([status, count]) => ({ status: status.replace(/_/g, ' '), count })));
}
