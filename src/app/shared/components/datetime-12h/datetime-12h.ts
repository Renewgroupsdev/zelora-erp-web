import { Component, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Date + 12-hour time picker (hour 1-12, minute, AM/PM). Works with ngModel; the value is "YYYY-MM-DDTHH:mm" (24-hour,
 * the same string a datetime-local input gives), so callers need no changes.
 */
@Component({
  selector: 'app-datetime-12h',
  standalone: true,
  imports: [FormsModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => Datetime12h), multi: true }],
  template: `
    <div class="dt12">
      <input class="dt12-date" type="date" [ngModel]="date()" (ngModelChange)="date.set($event); emit()" [disabled]="disabled()" />
      <div class="dt12-time">
        <select class="dt12-sel" [ngModel]="hour()" (ngModelChange)="hour.set(+$event); emit()" [disabled]="disabled()" aria-label="Hour">
          @for (h of hours; track h) { <option [value]="h">{{ h }}</option> }
        </select>
        <select class="dt12-sel" [ngModel]="minute()" (ngModelChange)="minute.set(+$event); emit()" [disabled]="disabled()" aria-label="Minute">
          @for (m of minutes; track m) { <option [value]="m">{{ pad(m) }}</option> }
        </select>
        <select class="dt12-sel" [ngModel]="period()" (ngModelChange)="period.set($event); emit()" [disabled]="disabled()" aria-label="AM or PM">
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .dt12 { display: grid; grid-template-columns: 190px auto; justify-content: start; gap: 8px; width: 100%; }
    @media (max-width: 480px) { .dt12 { grid-template-columns: minmax(0, 1fr); justify-content: stretch; } .dt12-time { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .dt12 .dt12-date, .dt12 .dt12-sel {
      display: block; width: 100% !important; height: 35px !important; margin: 0 !important; box-sizing: border-box;
      border: 1px solid var(--border-soft-strong, #cfd8d3); border-radius: 8px; background-color: var(--app-surface-solid, #fff);
      color: inherit; font: inherit; font-size: 13px !important; line-height: 1; padding: 0 12px !important; outline: 0; min-width: 0;
    }
    .dt12 .dt12-date:focus, .dt12 .dt12-sel:focus { border-color: var(--primary, #0a6c55); }
    .dt12-time { display: grid; grid-template-columns: 74px 74px 84px; gap: 8px; }
    .dt12 .dt12-sel {
      cursor: pointer; appearance: none; -webkit-appearance: none; padding-right: 28px !important; text-align: left;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23444' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 10px center;
    }
  `],
})
export class Datetime12h implements ControlValueAccessor {
  readonly hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  readonly minutes = Array.from({ length: 60 }, (_, i) => i);

  readonly date = signal('');
  readonly hour = signal(12);
  readonly minute = signal(0);
  readonly period = signal<'AM' | 'PM'>('AM');
  readonly disabled = signal(false);

  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  pad(n: number): string { return String(n).padStart(2, '0'); }

  /** Model "YYYY-MM-DDTHH:mm" in, pieces out. */
  writeValue(value: string | null): void {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value ?? '');
    if (!m) { this.date.set(''); return; }
    const h24 = +m[2];
    this.date.set(m[1]);
    this.period.set(h24 >= 12 ? 'PM' : 'AM');
    this.hour.set(h24 % 12 === 0 ? 12 : h24 % 12);
    this.minute.set(+m[3]);
  }

  /** Pieces in, model "YYYY-MM-DDTHH:mm" out (empty when no date is chosen). */
  emit(): void {
    this.onTouched();
    if (!this.date()) { this.onChange(''); return; }
    const h24 = (this.hour() % 12) + (this.period() === 'PM' ? 12 : 0);
    this.onChange(`${this.date()}T${this.pad(h24)}:${this.pad(this.minute())}`);
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }
}
