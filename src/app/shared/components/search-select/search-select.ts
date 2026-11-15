import { Component, ElementRef, HostListener, OnDestroy, computed, effect, forwardRef, inject, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: unknown;
  label: string;
  /** Small text on the right of the option (e.g. "stock 12"). Also searchable. */
  hint?: string;
  /** Heading shown above the first option of each group (options of one group must be next to each other). */
  group?: string;
}

/**
 * A dropdown with a search box. Works with formControlName / ngModel like a native <select>:
 *
 *   <app-search-select formControlName="branchKey" icon="bi-geo-alt" placeholder="Select branch"
 *                      [options]="branchOptions()" [invalid]="invalid('branchKey')" />
 *
 * `disabledValues` greys out options that cannot be picked (e.g. a product already added in another row).
 * The list opens in a fixed layer, so it is never clipped by a table / dialog scroll area.
 */
@Component({
  selector: 'app-search-select',
  standalone: true,
  templateUrl: './search-select.html',
  styleUrl: './search-select.scss',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SearchSelect), multi: true }],
})
export class SearchSelect implements ControlValueAccessor, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input<SelectOption[]>([]);
  readonly disabledValues = input<unknown[]>([]);
  readonly disabledLabel = input('already added');
  readonly placeholder = input('Select');
  readonly searchPlaceholder = input('Search...');
  readonly emptyText = input('No options available');
  /** Bootstrap icon class shown at the left, e.g. "bi-geo-alt". */
  readonly icon = input<string | null>(null);
  readonly invalid = input(false);
  readonly compact = input(false);
  readonly inputId = input<string | null>(null);

  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  readonly value = signal<unknown>(null);
  readonly open = signal(false);
  readonly query = signal('');
  readonly active = signal(0);
  readonly disabled = signal(false);
  readonly pos = signal<{ left: number; width: number; top: number | null; bottom: number | null; maxHeight: number }>({ left: 0, width: 0, top: 0, bottom: null, maxHeight: 280 });

  readonly selected = computed(() => this.options().find(o => o.value === this.value()) ?? null);
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.options();
    return q ? list.filter(o => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q)) : list;
  });

  private onChange: (v: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  private readonly closeOnScroll = (e: Event) => {
    if (!(e.target as HTMLElement | null)?.closest?.('.ss-panel')) this.close();
  };

  constructor() {
    // Focus the search box as soon as the list opens.
    effect(() => {
      const box = this.searchBox();
      if (box) setTimeout(() => box.nativeElement.focus());
    });
  }

  // ---- ControlValueAccessor
  writeValue(v: unknown): void { this.value.set(v ?? null); }
  registerOnChange(fn: (v: unknown) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); if (d) this.close(); }

  // ---- open / close
  toggle(): void {
    if (this.disabled()) return;
    this.open() ? this.close() : this.openList();
  }

  private openList(): void {
    const el = this.trigger()?.nativeElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below; // not enough room underneath: open upwards
    const room = Math.max(160, Math.min(320, up ? above : below));
    this.pos.set({
      left: r.left, width: r.width,
      top: up ? null : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : null,
      maxHeight: room,
    });
    this.query.set('');
    const at = this.filtered().findIndex(o => o.value === this.value());
    this.active.set(Math.max(0, at));
    this.open.set(true);
    document.addEventListener('scroll', this.closeOnScroll, true);
    setTimeout(() => this.scrollActive());
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    document.removeEventListener('scroll', this.closeOnScroll, true);
    this.onTouched();
  }

  ngOnDestroy(): void {
    document.removeEventListener('scroll', this.closeOnScroll, true);
  }

  isDisabled(o: SelectOption): boolean {
    return this.disabledValues().includes(o.value);
  }

  pick(o: SelectOption): void {
    if (this.isDisabled(o)) return;
    this.value.set(o.value);
    this.onChange(o.value);
    this.close();
    this.trigger()?.nativeElement.focus();
  }

  onSearch(text: string): void {
    this.query.set(text);
    this.active.set(0);
  }

  // ---- keyboard
  onTriggerKey(e: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      if (!this.open()) this.openList();
    }
  }

  onSearchKey(e: KeyboardEvent): void {
    const n = this.filtered().length;
    if (e.key === 'ArrowDown') { e.preventDefault(); this.active.set(n ? (this.active() + 1) % n : 0); this.scrollActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.active.set(n ? (this.active() - 1 + n) % n : 0); this.scrollActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = this.filtered()[this.active()]; if (o) this.pick(o); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); this.trigger()?.nativeElement.focus(); }
    else if (e.key === 'Tab') this.close();
  }

  private scrollActive(): void {
    setTimeout(() => this.host.nativeElement.querySelector('.ss-opt.is-active')?.scrollIntoView({ block: 'nearest' }));
  }

  @HostListener('document:mousedown', ['$event'])
  onOutside(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }

  @HostListener('window:resize')
  onResize(): void { this.close(); }
}
