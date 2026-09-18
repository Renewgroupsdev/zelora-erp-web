import { AfterViewInit, Directive, ElementRef, OnDestroy, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DateTime, Namespace, TempusDominus } from '@eonasdan/tempus-dominus';
import { TEMPUS_DOMINUS_ICONS } from './tempus-dominus-icons';

/** Drop-in replacement for `<input type="date">`, backed by Tempus Dominus - the
 *  Bootstrap-flavored date/time picker (https://getdatepicker.com). Reads/writes the same
 *  ISO "yyyy-MM-dd" string a native date input would, so existing formControlName bindings
 *  and downstream code (date comparisons, formatDateDisplay, etc.) need no changes. */
@Directive({
  selector: 'input[appDatePicker]',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerDirective),
      multi: true,
    },
  ],
})
export class DatePickerDirective implements AfterViewInit, ControlValueAccessor, OnDestroy {
  private picker?: TempusDominus;
  private pendingValue: string | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private elementRef: ElementRef<HTMLInputElement>) {}

  ngAfterViewInit(): void {
    this.picker = new TempusDominus(this.elementRef.nativeElement, {
      display: {
        components: { clock: false, hours: false, minutes: false, seconds: false },
        buttons: { today: true, clear: true },
        theme: 'light',
        icons: TEMPUS_DOMINUS_ICONS,
      },
      localization: {
        format: 'MM/dd/yyyy',
      },
    });

    this.picker.subscribe(Namespace.events.change, (event: { date?: DateTime }) => {
      this.onChange(this.toIso(event.date));
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

    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return;

    this.picker!.dates.setValue(DateTime.convert(new Date(year, month - 1, day)));
  }

  private toIso(date: DateTime | undefined): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
