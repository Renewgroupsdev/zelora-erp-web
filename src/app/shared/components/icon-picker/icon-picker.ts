import { CommonModule } from '@angular/common';
import { ConnectedPosition, Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, ElementRef, forwardRef, Input, OnDestroy, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { BOOTSTRAP_ICON_NAMES } from '../../constants/bootstrap-icon-names';

const PANEL_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
];

type IconFilter = 'all' | 'fill' | 'outline';

/** Columns of the icon grid - keyboard Up / Down moves by one row. */
const COLUMNS = 6;
const RECENT_KEY = 'icon-picker-recent';
const RECENT_MAX = 12;

/** A searchable icon picker for every bootstrap-icons class name - implements ControlValueAccessor
 *  so it drops into a reactive form via [formControlName] exactly like a native input, and
 *  stores/emits the full class (e.g. "bi-eye-fill"), not just the bare icon name.
 *
 *  The panel shows an icon grid with All / Filled / Outline filters, a live preview of the icon
 *  under the cursor, a "recently used" row and full keyboard control (arrows, Enter, Esc).
 *
 *  The results panel is rendered through CDK's Overlay (the same primitive MatDialog uses
 *  elsewhere in this app) instead of being absolutely positioned inside the trigger's own DOM
 *  subtree - this component gets used inside cards with `overflow: hidden`/scrollable
 *  containers, which would otherwise clip the panel. The overlay is portaled to the document
 *  body and auto-flips via `PANEL_POSITIONS` when it would run off-screen. */
@Component({
  selector: 'app-icon-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, OverlayModule],
  templateUrl: './icon-picker.html',
  styleUrl: './icon-picker.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => IconPicker),
      multi: true,
    },
  ],
})
export class IconPicker implements ControlValueAccessor, OnDestroy {
  @Input() placeholder = 'Search icon...';

  @ViewChild('trigger', { static: true }) triggerRef!: ElementRef<HTMLElement>;
  @ViewChild('panelTemplate') panelTemplate!: TemplateRef<unknown>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('listEl') listEl?: ElementRef<HTMLElement>;

  readonly pageSize = 120;
  readonly totalCount = BOOTSTRAP_ICON_NAMES.length;
  readonly filters: { key: IconFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'fill', label: 'Filled' },
    { key: 'outline', label: 'Outline' },
  ];

  value: string | null = null;
  searchTerm = '';
  filter: IconFilter = 'all';
  isOpen = false;
  disabled = false;
  visibleCount = this.pageSize;
  /** Icon under the mouse (drives the footer preview). */
  hovered: string | null = null;
  /** Keyboard / hover cursor inside the visible grid; -1 = none. */
  activeIndex = -1;
  recent: string[] = this.loadRecent();

  private overlayRef: OverlayRef | null = null;

  private onChange: (value: string | null) => void = () => { };
  private onTouched: () => void = () => { };

  constructor(
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
  ) { }

  writeValue(value: string | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) {
      this.closePanel();
    }
  }

  private matches(name: string, filter: IconFilter): boolean {
    if (filter === 'fill') return name.endsWith('-fill');
    if (filter === 'outline') return !name.endsWith('-fill');
    return true;
  }

  private get matchedIcons(): readonly string[] {
    const term = this.searchTerm.trim().toLowerCase();
    return BOOTSTRAP_ICON_NAMES.filter((name) => this.matches(name, this.filter) && (!term || name.includes(term)));
  }

  /** How many icons the filter tab would show for the current search. */
  countFor(filter: IconFilter): number {
    const term = this.searchTerm.trim().toLowerCase();
    return BOOTSTRAP_ICON_NAMES.filter((name) => this.matches(name, filter) && (!term || name.includes(term))).length;
  }

  get filteredIcons(): readonly string[] {
    return this.matchedIcons.slice(0, this.visibleCount);
  }

  get resultCount(): number {
    return this.matchedIcons.length;
  }

  get showRecent(): boolean {
    return !this.searchTerm.trim() && this.filter === 'all' && this.recent.length > 0;
  }

  get activeName(): string | null {
    return this.activeIndex >= 0 ? (this.filteredIcons[this.activeIndex] ?? null) : null;
  }

  /** Footer preview: the hovered / keyboard-focused icon, else the current value. */
  get previewName(): string | null {
    return this.hovered ?? this.activeName ?? (this.value ? this.value.replace(/^bi-/, '') : null);
  }

  onSearchChange(): void {
    this.resetGrid();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.resetGrid();
    this.searchInput?.nativeElement.focus();
  }

  setFilter(filter: IconFilter): void {
    this.filter = filter;
    this.resetGrid();
  }

  private resetGrid(): void {
    this.visibleCount = this.pageSize;
    this.activeIndex = this.searchTerm.trim() && this.filteredIcons.length ? 0 : -1;
    this.hovered = null;
    this.listEl?.nativeElement.scrollTo({ top: 0 });
  }

  /** Loads the next page when the list is scrolled near its end (replaces the old "Show more" button). */
  onScroll(): void {
    const el = this.listEl?.nativeElement;
    if (!el || this.visibleCount >= this.resultCount) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
      this.visibleCount += this.pageSize;
    }
  }

  onKeydown(event: KeyboardEvent): void {
    const count = this.filteredIcons.length;
    const move = (delta: number) => {
      event.preventDefault();
      if (!count) return;
      const next = this.activeIndex < 0 ? 0 : this.activeIndex + delta;
      this.activeIndex = Math.min(Math.max(next, 0), this.resultCount - 1);
      if (this.activeIndex >= this.visibleCount) this.visibleCount = this.activeIndex + this.pageSize;
      this.hovered = null;
      setTimeout(() => this.scrollActiveIntoView());
    };

    switch (event.key) {
      case 'ArrowRight': return move(1);
      case 'ArrowLeft': return move(-1);
      case 'ArrowDown': return move(COLUMNS);
      case 'ArrowUp': return move(-COLUMNS);
      case 'Enter': {
        const name = this.activeName;
        if (name) {
          event.preventDefault();
          this.select(name);
        }
        return;
      }
      case 'Escape':
        event.preventDefault();
        this.closePanel();
        this.triggerRef.nativeElement.focus();
        return;
    }
  }

  private scrollActiveIntoView(): void {
    this.listEl?.nativeElement
      .querySelector<HTMLElement>(`.ip-tile[data-index="${this.activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  toggleOpen(): void {
    if (this.disabled) return;
    if (this.isOpen) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  }

  private openPanel(): void {
    this.searchTerm = '';
    this.filter = 'all';
    this.visibleCount = this.pageSize;
    this.hovered = null;
    this.activeIndex = -1;
    this.recent = this.loadRecent();
    this.isOpen = true;

    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(this.triggerRef)
      .withPositions(PANEL_POSITIONS)
      .withPush(true)
      .withViewportMargin(8);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      width: 'min(360px, calc(100vw - 16px))',
    });

    this.overlayRef.backdropClick().subscribe(() => this.closePanel());
    this.overlayRef.attach(new TemplatePortal(this.panelTemplate, this.viewContainerRef));

    // Type-to-search straight away; bring the selected icon into view if it is in the first page.
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
      const selected = this.value?.replace(/^bi-/, '');
      const index = selected ? this.filteredIcons.indexOf(selected) : -1;
      if (index >= 0) {
        this.listEl?.nativeElement.querySelector<HTMLElement>(`.ip-tile[data-index="${index}"]`)?.scrollIntoView({ block: 'center' });
      }
    });
  }

  private closePanel(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.onTouched();
  }

  select(name: string): void {
    this.value = `bi-${name}`;
    this.rememberRecent(name);
    this.onChange(this.value);
    this.closePanel();
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.value = null;
    this.onChange(null);
    this.onTouched();
  }

  private loadRecent(): string[] {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      return Array.isArray(raw) ? raw.filter((n): n is string => typeof n === 'string').slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  }

  private rememberRecent(name: string): void {
    this.recent = [name, ...this.recent.filter((n) => n !== name)].slice(0, RECENT_MAX);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(this.recent));
    } catch {
      // storage unavailable (private window / blocked) - recents just don't persist
    }
  }

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
  }
}
