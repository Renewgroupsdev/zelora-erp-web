import { Component, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** 12-hour time field: hour / minute / AM-PM dropdowns. Reads and writes the 24-hour "HH:mm" string a native time input
 *  would ('' while no hour is picked), so it drops into existing form controls. */
@Component({
  selector: 'app-time-select',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeSelect), multi: true }],
  template: `
    <div class="time-select">
      <select aria-label="Hour" [disabled]="disabled" (change)="onPart('h', $any($event.target).value)">
        <option value="" [selected]="hour === null">--</option>
        @for (n of hours; track n) { <option [value]="n" [selected]="hour === n">{{ n }}</option> }
      </select>
      <select aria-label="Minute" [disabled]="disabled" (change)="onPart('m', $any($event.target).value)">
        @for (m of minutes; track m) { <option [value]="m" [selected]="minute === m">{{ m }}</option> }
      </select>
      <select aria-label="AM or PM" [disabled]="disabled" (change)="onPart('p', $any($event.target).value)">
        <option value="AM" [selected]="meridiem === 'AM'">AM</option>
        <option value="PM" [selected]="meridiem === 'PM'">PM</option>
      </select>
    </div>
  `,
  styles: [`
    .time-select { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    select {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--border-soft-strong);
      border-radius: 9px;
      padding: 9px;
      background: var(--app-surface-solid);
      color: var(--text-dark);
      font: 14px var(--font-family-base);
      outline: 0;
    }
    select:focus { border-color: var(--primary, #0f5245); }
  `],
})
export class TimeSelect implements ControlValueAccessor {
  readonly hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  readonly minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

  hour: number | null = null;
  minute = '00';
  meridiem: 'AM' | 'PM' = 'AM';
  disabled = false;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ''));
    if (!match) {
      this.hour = null;
      this.minute = '00';
      this.meridiem = 'AM';
      return;
    }
    const h24 = Number(match[1]);
    this.hour = h24 % 12 || 12;
    this.meridiem = h24 >= 12 ? 'PM' : 'AM';
    // A minute that is not on the 5-minute list is rounded down to it for display.
    this.minute = String(Math.floor(Number(match[2]) / 5) * 5).padStart(2, '0');
  }

  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; }

  onPart(part: 'h' | 'm' | 'p', value: string): void {
    if (part === 'h') this.hour = value === '' ? null : Number(value);
    else if (part === 'm') this.minute = value;
    else this.meridiem = value === 'PM' ? 'PM' : 'AM';
    this.onTouched();
    if (this.hour === null) {
      this.onChange('');
      return;
    }
    const h24 = (this.hour % 12) + (this.meridiem === 'PM' ? 12 : 0);
    this.onChange(`${String(h24).padStart(2, '0')}:${this.minute}`);
  }
}
