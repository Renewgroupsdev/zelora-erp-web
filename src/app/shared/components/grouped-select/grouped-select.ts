import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, forwardRef, inject, input, signal, computed } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectGroup {
  label: string;
  items: string[];
}

/**
 * Searchable dropdown with bold group headings and plain, indented options underneath (works with ngModel / formControl).
 * A group with no items is itself selectable, so a parent without children is not lost.
 */
@Component({
  selector: 'app-grouped-select',
  standalone: true,
  imports: [CommonModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => GroupedSelect), multi: true }],
  template: `
    <div class="gs" [class.open]="open()" [class.disabled]="disabled()">
      <button type="button" class="gs-trigger" [disabled]="disabled()" (click)="toggle()" aria-haspopup="listbox" [attr.aria-expanded]="open()">
        <i class="bi" [ngClass]="icon()"></i>
        <span class="gs-value" [class.placeholder]="!value()">{{ value() || placeholder() }}</span>
        <i class="bi bi-chevron-down gs-arrow"></i>
      </button>
      @if (open()) {
        <div class="gs-panel" role="listbox">
          <div class="gs-search"><i class="bi bi-search"></i>
            <input #q type="text" placeholder="Search" [value]="term()" (input)="term.set(q.value)" (keydown.enter)="pickFirst($event)" autofocus />
          </div>
          <div class="gs-list">
            @for (g of visible(); track g.label) {
              @if (g.items.length) {
                <div class="gs-group">{{ g.label }}</div>
                @for (item of g.items; track item) {
                  <button type="button" class="gs-item" role="option" [class.selected]="item === value()" [attr.aria-selected]="item === value()" (click)="pick(item)">{{ item }}</button>
                }
              } @else {
                <button type="button" class="gs-group gs-group-pick" role="option" [class.selected]="g.label === value()" (click)="pick(g.label)">{{ g.label }}</button>
              }
            } @empty {
              <div class="gs-empty">No match</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .gs { position: relative; width: 100%; }
    .gs-trigger { width: 100%; height: 35px; display: flex; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid var(--border-soft-strong); border-radius: 8px; background: var(--app-surface-solid); color: var(--text-dark); font: inherit; font-size: 12px; cursor: pointer; text-align: left; }
    .gs-trigger:focus-visible, .gs.open .gs-trigger { outline: 0; border-color: var(--primary-border-strong); box-shadow: 0 0 0 3px var(--primary-soft); }
    .gs-trigger > i:first-child { color: var(--text-muted); font-size: 12px; }
    .gs-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .gs-value.placeholder { color: var(--text-muted); }
    .gs-arrow { color: var(--text-muted); font-size: 9px; }
    .gs.disabled .gs-trigger { opacity: 0.6; cursor: not-allowed; }
    .gs-panel { position: absolute; z-index: 1100; left: 0; right: 0; top: calc(100% + 4px); border: 1px solid var(--border-soft-strong); border-radius: 10px; background: var(--app-surface-solid); box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16); overflow: hidden; }
    .gs-search { position: relative; padding: 8px; border-bottom: 1px solid var(--border-soft-strong); }
    .gs-search i { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 11px; }
    .gs-search input { width: 100%; height: 30px; padding: 0 10px 0 28px; border: 1px solid var(--border-soft-strong); border-radius: 7px; outline: 0; font: inherit; font-size: 12px; background: var(--app-surface-solid); color: var(--text-dark); }
    .gs-search input:focus { border-color: var(--primary-border-strong); }
    .gs-list { max-height: 260px; overflow-y: auto; padding: 4px 0; }
    .gs-group { display: block; width: 100%; padding: 8px 12px 4px; border: 0; background: transparent; color: var(--text-dark); font: inherit; font-size: 12px; font-weight: 700; text-align: left; }
    .gs-group-pick { cursor: pointer; }
    .gs-group-pick:hover, .gs-group-pick.selected { background: var(--primary-soft); }
    .gs-item { display: block; width: 100%; padding: 6px 12px 6px 28px; border: 0; background: transparent; color: var(--text-dark); font: inherit; font-size: 12px; font-weight: 400; text-align: left; cursor: pointer; }
    .gs-item:hover { background: var(--primary-soft); }
    .gs-item.selected { background: var(--primary-soft); color: var(--primary); font-weight: 600; }
    .gs-empty { padding: 12px; color: var(--text-muted); font-size: 12px; text-align: center; }
  `],
})
export class GroupedSelect implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly groups = input<SelectGroup[]>([]);
  readonly placeholder = input('Select');
  readonly icon = input('bi-tag');

  readonly value = signal('');
  readonly open = signal(false);
  readonly term = signal('');
  readonly disabled = signal(false);

  /** Groups filtered by the search term (a group name that matches keeps all its items). */
  readonly visible = computed(() => {
    const t = this.term().trim().toLowerCase();
    if (!t) return this.groups();
    return this.groups()
      .map(g => g.label.toLowerCase().includes(t) ? g : { label: g.label, items: g.items.filter(i => i.toLowerCase().includes(t)) })
      .filter(g => g.items.length || g.label.toLowerCase().includes(t));
  });

  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(v: string | null): void { this.value.set(v ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); if (d) this.open.set(false); }

  toggle(): void {
    if (this.disabled()) return;
    this.term.set('');
    this.open.update(o => !o);
  }

  pick(v: string): void {
    this.value.set(v);
    this.onChange(v);
    this.onTouched();
    this.open.set(false);
  }

  pickFirst(event: Event): void {
    event.preventDefault();
    const g = this.visible()[0];
    if (g) this.pick(g.items[0] ?? g.label);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target)) { this.open.set(false); this.onTouched(); }
  }

  @HostListener('keydown.escape', ['$event'])
  onEscape(e: Event): void {
    if (this.open()) { e.stopPropagation(); this.open.set(false); }
  }
}
