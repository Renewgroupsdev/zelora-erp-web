import { Component, computed, ViewEncapsulation } from '@angular/core';
import { HrData } from '../../../../shared/models/dashboard.model';
import { initials, monthLabel } from '../../../../shared/utils/format.util';
import { DashCard } from '../dash-card/dash-card';
import { DashWidget } from '../dash-widget';

/** One colour per department (largest first), used by its bar, dot and share tag. */
const DEPT_COLORS = ['#2f6fe5', '#1fae5b', '#d97706', '#7b35e6', '#e0344f', '#0ea5e9', '#14b8a6', '#d946ef', '#64748b'];

/** The team today (attendance, who is on leave), headcount by department and last month's payroll. */
@Component({
  selector: 'app-team-widget',
  standalone: true,
  imports: [DashCard],
  templateUrl: './team-widget.html',
  styleUrl: './team-widget.scss',
  // Rules are scoped under .dash-page like the page sheet, so they are not encapsulated either.
  encapsulation: ViewEncapsulation.None,
})
export class TeamWidget extends DashWidget<HrData> {
  protected readonly key = 'hr' as const;
  readonly initials = initials;

  readonly payrollMonth = computed(() => {
    const m = this.data()?.payroll_last_month.month;
    return m ? monthLabel(m) : '';
  });

  /** Today's attendance as parts of the whole team, for the split bar and its legend. */
  readonly attendance = computed(() => {
    const a = this.data()?.attendance_today;
    if (!a) return [];
    const parts = [
      { key: 'present', label: 'Present', value: a.present, color: '#1fae5b', icon: 'bi-person-check-fill' },
      { key: 'late', label: 'Late', value: a.late, color: '#f08a0a', icon: 'bi-alarm-fill' },
      { key: 'half', label: 'Half day', value: a.half_day, color: '#0ea5e9', icon: 'bi-circle-half' },
      { key: 'leave', label: 'Leave / permission', value: a.on_leave + a.permission, color: '#7b35e6', icon: 'bi-airplane-fill' },
      { key: 'unmarked', label: 'Not marked', value: a.not_marked, color: '#94a3b8', icon: 'bi-question-circle-fill' },
    ];
    const total = parts.reduce((s, p) => s + p.value, 0) || 1;
    return parts.map(p => ({ ...p, share: (p.value / total) * 100 }));
  });

  /** Departments, largest first: the bar is scaled to the largest, the tag is the share of all staff. */
  readonly departments = computed(() => {
    const list = [...(this.data()?.by_department ?? [])].map(d => ({ label: d.label, value: Number(d.value) || 0 })).sort((a, b) => b.value - a.value);
    const total = list.reduce((s, d) => s + d.value, 0) || 1;
    const max = Math.max(1, ...list.map(d => d.value));
    return list.map((d, i) => ({
      ...d,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
      pct: Math.round((d.value / total) * 100),
      bar: Math.max(4, Math.round((d.value / max) * 100)),
    }));
  });

  /** Attendance meter tone: green from 80%, amber from 50%, red below. */
  rateTone(rate: number): string {
    return rate >= 80 ? 'green' : rate >= 50 ? 'orange' : 'red';
  }
}
