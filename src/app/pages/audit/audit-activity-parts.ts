import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { AuditActivityReport, AuditSignIn } from '../../shared/models/audit.model';
import { OUTCOME_LABEL, OUTCOME_TONE } from './audit-meta';
import { AuditChart } from './audit-chart';

const PALETTE = ['#4aab90', '#5b8def', '#e0735f', '#8c6fd8', '#f0a23b', '#2aa7ad', '#9aa7a4', '#c46aa0', '#6fa83f', '#d9c13a'];

/**
 * The three charts of one person's trail (events per day, busiest hours, modules worked in). The page hands it the rows the
 * API aggregated; it only draws them, so a role never sees a figure the API did not return.
 */
@Component({
  selector: 'app-audit-activity-charts',
  standalone: true,
  imports: [CommonModule, AuditChart],
  styleUrls: ['./audit.scss'],
  template: `
    @if (!hasData()) {
      <div class="au-panel"><div class="au-state"><i class="bi bi-inbox" aria-hidden="true"></i><strong>No activity in this period</strong>Try a wider date range.</div></div>
    } @else {
      <div class="au-grid">
        <section class="au-panel au-col-8" aria-label="Events per day">
          <h2>Events per day</h2><div class="sub">Successful vs failed or denied</div>
          <app-audit-chart type="bar" [stacked]="true" [labels]="dayLabels()" [datasets]="dayDatasets()" label="Events per day, successful versus failed or denied" />
        </section>
        <section class="au-panel au-col-4" aria-label="Modules worked in">
          <h2>Modules worked in</h2><div class="sub">Share of events by module</div>
          <app-audit-chart type="doughnut" [labels]="moduleLabels()" [datasets]="moduleDatasets()" label="Events by module" />
        </section>
        <section class="au-panel au-col-12" aria-label="Busiest hours">
          <h2>Busiest hours of the day</h2><div class="sub">Events by hour, India time ({{ peak() }})</div>
          <app-audit-chart type="bar" [labels]="hourLabels()" [datasets]="hourDatasets()" label="Events by hour of day" />
        </section>
      </div>
    }
  `,
})
export class AuditActivityCharts {
  readonly report = input.required<Partial<AuditActivityReport>>();

  protected readonly hasData = computed(() => (this.report().by_day ?? []).some(d => d.total > 0));
  protected readonly dayLabels = computed(() => (this.report().by_day ?? []).map(d => d.day.slice(5).replace('-', '/')));
  protected readonly dayDatasets = computed(() => {
    const d = this.report().by_day ?? [];
    return [
      { label: 'Successful', data: d.map(x => x.success), backgroundColor: '#4aab90', borderColor: '#4aab90', borderRadius: 3 },
      { label: 'Failed / denied', data: d.map(x => x.failed), backgroundColor: '#e0735f', borderColor: '#e0735f', borderRadius: 3 },
    ];
  });
  protected readonly moduleLabels = computed(() => (this.report().by_module ?? []).map(m => m.name));
  protected readonly moduleDatasets = computed(() => [{ label: 'Events', data: (this.report().by_module ?? []).map(m => m.total), backgroundColor: PALETTE }]);
  protected readonly hourLabels = computed(() => (this.report().by_hour ?? []).map(h => String(h.hour).padStart(2, '0')));
  protected readonly hourDatasets = computed(() => [{ label: 'Events', data: (this.report().by_hour ?? []).map(h => h.total), backgroundColor: '#5b8def', borderRadius: 3 }]);
  /** "busiest 14:00-15:00", or "no activity" when every hour is empty. */
  protected readonly peak = computed(() => {
    const hours = this.report().by_hour ?? [];
    const top = hours.reduce((a, h) => (h.total > (a?.total ?? 0) ? h : a), null as { hour: number; total: number } | null);
    return top ? `busiest ${String(top.hour).padStart(2, '0')}:00-${String((top.hour + 1) % 24).padStart(2, '0')}:00` : 'no activity';
  });
}

/** Latest sign-ins. Device / IP columns appear only when the API returned them. */
@Component({
  selector: 'app-audit-sign-ins',
  standalone: true,
  imports: [CommonModule],
  styleUrls: ['./audit.scss'],
  template: `
    @if (!rows().length) {
      <div class="au-state"><i class="bi bi-box-arrow-in-right" aria-hidden="true"></i><strong>No sign-ins recorded</strong>No sign-in events fall in the recorded history.</div>
    } @else {
      <div class="au-scroll">
        <table class="au-table">
          <caption class="sr-only">Recent sign-ins</caption>
          <thead><tr><th scope="col">When</th><th scope="col">Outcome</th>@if (network()) { <th scope="col">Device</th><th scope="col">IP address</th> }</tr></thead>
          <tbody>
            @for (s of rows(); track s.id) {
              <tr>
                <td class="when">{{ s.occurred_at_display }}<span class="rel">{{ s.relative }}</span></td>
                <td><span class="au-badge" [ngClass]="outcomeTone[s.outcome]">{{ outcomeLabel[s.outcome] }}</span></td>
                @if (network()) { <td>{{ s.device || '-' }}</td><td>{{ s.ip || '-' }}</td> }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AuditSignIns {
  readonly rows = input.required<AuditSignIn[]>();
  protected readonly network = computed(() => this.rows().some(r => 'ip' in r || 'device' in r));
  protected readonly outcomeLabel = OUTCOME_LABEL;
  protected readonly outcomeTone = OUTCOME_TONE;
}
