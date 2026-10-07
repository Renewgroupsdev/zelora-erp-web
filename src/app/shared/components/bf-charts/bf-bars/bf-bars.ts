import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { BF_PALETTE, BfBarDatum, fmt } from '../bf-charts.model';

/** Ranked horizontal bars: label, track with fill, value. Optional secondary value shown as an inner bar. */
@Component({
  selector: 'app-bf-bars',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bf-bars.html',
  styleUrl: './bf-bars.scss',
})
export class BfBars {
  @Input() set data(value: BfBarDatum[]) { this._data = value ?? []; this.build(); }
  @Input() money = false;
  @Input() secondaryLabel = '';
  @Input() emptyText = 'No data yet';
  rows: { label: string; value: number; secondary?: number; pct: number; innerPct: number; color: string }[] = [];
  private _data: BfBarDatum[] = [];

  fmt = (v: number) => fmt(v, this.money);

  private build(): void {
    const max = Math.max(...this._data.map(d => d.value), 0);
    this.rows = max <= 0 ? [] : this._data.map((d, i) => ({
      ...d, pct: (d.value / max) * 100, innerPct: d.secondary !== undefined && d.value ? Math.min(100, (d.secondary / d.value) * 100) : 0, color: BF_PALETTE[i % BF_PALETTE.length],
    }));
  }
}
