import { AfterViewInit, Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';

/**
 * Indian mobile number box: digits only, at most 10 of them, with a fixed "+91" shown in front.
 *
 *   <input type="tel" formControlName="phone" appPhone />
 *
 *  - typing letters / spaces / dashes is dropped, and the box never holds more than 10 digits;
 *  - a pasted "+91 98400 11111", "919840011111" or "09840011111" becomes "9840011111";
 *  - the form value stays the plain 10 digits (the +91 is only a label), so existing validators and the API are unchanged.
 */
@Directive({
  selector: 'input[appPhone]',
  standalone: true,
})
export class PhoneInput implements AfterViewInit, OnDestroy {
  private readonly input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private prefix: HTMLSpanElement | null = null;
  private observer: ResizeObserver | null = null;
  /** The box's own left padding (icon room), read once before the "+91" room is added. */
  private basePadding = -1;

  constructor() {
    this.input.setAttribute('maxlength', '10');
    this.input.setAttribute('inputmode', 'numeric');
    if (!this.input.getAttribute('autocomplete')) this.input.setAttribute('autocomplete', 'tel-national');
  }

  ngAfterViewInit(): void {
    const parent = this.input.parentElement;
    if (!parent) return;

    const span = document.createElement('span');
    span.className = 'phone-cc';
    span.textContent = '+91';
    span.setAttribute('aria-hidden', 'true');
    Object.assign(span.style, {
      position: 'absolute', zIndex: '3', pointerEvents: 'none', transform: 'translateY(-50%)',
      padding: '0 8px 0 0', borderRight: '1px solid var(--border-soft-strong, #cfe0da)', lineHeight: '1.1',
      font: '700 12.5px/1.1 inherit', fontFamily: 'inherit', color: 'var(--text-muted, #6a837d)', whiteSpace: 'nowrap',
    });
    parent.insertBefore(span, this.input);
    this.prefix = span;

    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    this.layout();
    // The box may be hidden when the form opens (a tab, a collapsed section): lay the prefix out again when it gets a size.
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.layout());
      this.observer.observe(this.input);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.prefix?.remove();
  }

  @HostListener('input')
  onInput(): void {
    const clean = PhoneInput.normalize(this.input.value);
    if (clean === this.input.value) return;

    this.input.value = clean;
    // let the form (ngModel / formControl) see the cleaned value too
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Digits only; a leading country code (91 / +91) or trunk 0 on a longer number is dropped; never more than 10 digits. */
  static normalize(raw: string): string {
    let digits = (raw ?? '').replace(/\D/g, '');
    if (digits.length > 10) {
      if (digits.startsWith('91') && digits.length >= 12) digits = digits.slice(2);
      else if (digits.startsWith('0')) digits = digits.slice(1);
    }
    return digits.slice(0, 10);
  }

  /** Puts the "+91" inside the box, in front of the number, and makes room for it. */
  private layout(): void {
    const span = this.prefix;
    if (!span || this.input.offsetParent === null) return; // not visible yet

    if (this.basePadding < 0) this.basePadding = parseFloat(getComputedStyle(this.input).paddingLeft) || 12;
    const room = Math.ceil(span.getBoundingClientRect().width) + 10;
    const wanted = `${this.basePadding + room}px`;
    if (this.input.style.getPropertyValue('padding-left') !== wanted) this.input.style.setProperty('padding-left', wanted, 'important');

    span.style.left = `${this.input.offsetLeft + this.basePadding}px`;
    span.style.top = `${this.input.offsetTop + this.input.offsetHeight / 2}px`;
  }
}
