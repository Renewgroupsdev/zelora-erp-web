import { Directive, ElementRef, HostListener, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Money box with thousands separators while you type: 25000 shows as "25,000" (Indian grouping: 2,50,000).
 *
 *   <input appAmount name="ctc" [(ngModel)]="model.ctc" />
 *
 *  - only digits and one decimal point (at most 2 decimals) are kept; letters and the commas themselves are dropped;
 *  - the form value stays a plain number (25000), or null when the box is empty, so validators and the API are unchanged;
 *  - the caret stays next to the digit being typed even though commas are inserted.
 */
@Directive({
  selector: 'input[appAmount]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AmountInput), multi: true }],
})
export class AmountInput implements ControlValueAccessor {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    this.input.setAttribute('inputmode', 'decimal');
    this.input.setAttribute('autocomplete', 'off');
  }

  writeValue(value: unknown): void {
    const n = value === null || value === undefined || value === '' ? null : Number(value);
    this.input.value = n === null || Number.isNaN(n) ? '' : AmountInput.format(String(n));
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.input.disabled = disabled;
  }

  @HostListener('input')
  onInput(): void {
    const raw = this.input.value;
    const caret = this.input.selectionStart ?? raw.length;
    const significant = (raw.slice(0, caret).match(/[0-9.]/g) ?? []).length; // digits / point before the caret

    const clean = AmountInput.clean(raw);
    const shown = AmountInput.format(clean);
    this.input.value = shown;

    // put the caret back after the same number of digits
    let seen = 0;
    let pos = 0;
    while (pos < shown.length && seen < significant) {
      if (/[0-9.]/.test(shown[pos])) seen++;
      pos++;
    }
    this.input.setSelectionRange(pos, pos);

    this.onChange(clean === '' || clean === '.' ? null : Number(clean));
  }

  @HostListener('blur')
  onBlur(): void {
    this.onTouched();
  }

  /** "1,2a3.456.7" -> "123.45": digits, one point, two decimals. */
  private static clean(raw: string): string {
    const text = (raw ?? '').replace(/[^0-9.]/g, '');
    const [whole, ...rest] = text.split('.');
    const digits = whole.replace(/^0+(?=\d)/, '');
    return rest.length ? `${digits}.${rest.join('').slice(0, 2)}` : digits;
  }

  /** "2500000.5" -> "25,00,000.5" (keeps a trailing point while typing). */
  private static format(clean: string): string {
    if (clean === '') return '';
    const [whole, decimals] = clean.split('.');
    const grouped = Number(whole || '0').toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return decimals !== undefined ? `${grouped}.${decimals}` : grouped;
  }
}
