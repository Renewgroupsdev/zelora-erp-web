import { Component, computed } from '@angular/core';
import { BfColumns } from '../../../shared/components/bf-charts/bf-columns/bf-columns';
import { TelecallingData, duration, statusTone } from '../../../shared/models/dashboard.model';
import { DashCard } from './dash-card';
import { DashWidget } from './dash-widget';

/** Call center for the period: volume, answer rate, agents online now and the telecaller leaderboard. */
@Component({
  selector: 'app-telecalling-widget',
  standalone: true,
  imports: [DashCard, BfColumns],
  template: `
    <app-dash-card title="Call Center" subtitle="Calls, answer rate and telecaller performance" icon="bi-headset" tone="purple"
                   [link]="canOpen('tele-caller') ? '/app/call-center' : null" linkLabel="Call center"
                   [loading]="loading()" [refreshing]="refreshing()" [error]="error()" (retry)="retry()">
      @if (data(); as t) {
        <div class="dash-figures">
          <div><span>Calls</span><strong>{{ t.total }}</strong><small>{{ t.answered }} answered</small></div>
          <div><span>Answer rate</span><strong [class]="t.answer_rate >= 70 ? 'txt-green' : 'txt-orange'">{{ t.answer_rate }}%</strong></div>
          <div><span>Missed</span><strong [class.txt-red]="t.missed > 0">{{ t.missed }}</strong></div>
          <div><span>Avg talk time</span><strong>{{ duration(t.avg_talk_seconds) }}</strong></div>
        </div>
        @if (agents().length) {
          <div class="dash-chips">
            @for (a of agents(); track a.status) { <span class="dash-chip" [class]="'tone-' + tone(a.status)"><b>{{ a.count }}</b> {{ a.status }}</span> }
          </div>
        }
        <div class="dash-split">
          <div class="dash-chart"><h3>Calls vs answered</h3><app-bf-columns [data]="t.trend" aName="Calls" bName="Answered" emptyText="No calls in this period" /></div>
          <div class="dash-table-wrap">
            @if (t.leaderboard.length) {
              <table class="dash-table">
                <thead><tr><th>Telecaller</th><th class="num">Calls</th><th class="num">Answered</th><th class="num">Talk</th><th class="num">Booked</th></tr></thead>
                <tbody>
                  @for (r of t.leaderboard; track $index) {
                    <tr><td>{{ r.name }}</td><td class="num">{{ r.calls }}</td><td class="num">{{ r.answered }}</td><td class="num">{{ duration(r.talk_seconds) }}</td><td class="num">{{ r.appointments }}</td></tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="dash-muted">No telecaller calls in this period.</p>
            }
          </div>
        </div>
      }
    </app-dash-card>
  `,
})
export class TelecallingWidget extends DashWidget<TelecallingData> {
  protected readonly key = 'telecalling' as const;
  readonly duration = duration;
  readonly tone = statusTone;
  readonly agents = computed(() => Object.entries(this.data()?.agents ?? {}).map(([status, count]) => ({ status: status.replace(/_/g, ' '), count })));
}
