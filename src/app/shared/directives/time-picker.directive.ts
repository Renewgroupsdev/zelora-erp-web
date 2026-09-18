import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DateTime, Namespace, TempusDominus } from '@eonasdan/tempus-dominus';
import { TEMPUS_DOMINUS_ICONS } from './tempus-dominus-icons';

/** Drop-in replacement for `<input type="time">`, backed by Tempus Dominus - the
 *  Bootstrap-flavored date/time picker (https://getdatepicker.com), shown in 12-hour
 *  (AM/PM) format. Reads/writes the same 24-hour "HH:mm" string a native time input
 *  would, so existing formControlName bindings and downstream code (formatTime, saved
 *  payloads) need no changes - only the on-screen display is 12-hour. */
@Directive({
  selector: 'input[appTimePicker]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimePickerDirective),
      multi: true,
    },
  ],
})
export class TimePickerDirective implements AfterViewInit, ControlValueAccessor, OnDestroy {
  /** Minutes between each selectable value on the clock (e.g. 5 -> :00, :05, :10, ...). */
  @Input() minuteStepping = 5;

  private picker?: TempusDominus;
  private pendingValue: string | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private elementRef: ElementRef<HTMLInputElement>) {}

  ngAfterViewInit(): void {
    this.picker = new TempusDominus(this.elementRef.nativeElement, {
      display: {
        components: {
          calendar: false, date: false, month: false, year: false, decades: false,
          clock: true, hours: true, minutes: true, seconds: false,
        },
        buttons: { clear: true },
        theme: 'light',
        icons: TEMPUS_DOMINUS_ICONS,
      },
      localization: {
        hourCycle: 'h12',
        format: 'hh:mm T',
      },
      stepping: this.minuteStepping,
    });

    this.picker.subscribe(Namespace.events.change, (event: { date?: DateTime }) => {
      this.onChange(this.to24Hour(event.date));
    });

    this.elementRef.nativeElement.addEventListener('blur', this.handleBlur);

    if (this.pendingValue !== null) {
      this.applyValue(this.pendingValue);
      this.pendingValue = null;
    }
  }

  private handleBlur = (): void => this.onTouched();

  writeValue(value: string | null): void {
    if (!this.picker) {
      this.pendingValue = value;
      return;
    }
    this.applyValue(value);
  }

  private applyValue(value: string | null): void {
    if (!value) {
      this.picker!.clear();
      return;
    }

    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    this.picker!.dates.setValue(DateTime.convert(date));
  }

  private to24Hour(date: DateTime | undefined): string {
    if (!date) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) this.picker?.disable();
    else this.picker?.enable();
  }

  ngOnDestroy(): void {
    this.elementRef.nativeElement.removeEventListener('blur', this.handleBlur);
    this.picker?.dispose();
  }
}
